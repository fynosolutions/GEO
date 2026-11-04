import {load} from 'cheerio';
import {lookup} from 'node:dns/promises';
import {isIP} from 'node:net';
import {createHash} from 'node:crypto';
import {extractDate} from './dates.js';
export type Price={name:string;category?:string|null;variant:string|null;price:string;currency:string|null;evidence:string};
export type Document={url:string;format:'html'|'pdf'|'image';text:string;prices:Price[];links:string[];date:ReturnType<typeof extractDate>;fetched_at:string;sha256:string;extraction:string;menuEvidence?:boolean};
export function pricesFromText(text:string):Price[]{
 return text.split(/\r?\n/).flatMap(line=>{
  const m=line.trim().match(/^(.{2,120}?)\s+(\$\s*\d+(?:\.\d{1,2})?(?:\s*[-–]\s*\$?\d+(?:\.\d{1,2})?)?)\s*$/);
  return m&&!/[\$]/.test(m[1])?[{name:m[1],variant:null,price:m[2],currency:null,evidence:line}]:[];
 });
}
export function htmlDocument(html:string,url:string,includePrices=true){
 const $=load(html),links:string[]=[],prices:Price[]=[];
 $('a[href],img[src]').each((_,el)=>{
  const link=$(el).attr('href')||$(el).attr('src')||'';let path='';try{path=new URL(link,url).pathname;}catch{}
  const label=$(el).text()+' '+($(el).attr('alt')||'')+' '+path;
  if(/\bmenus?\b|dinner|lunch|brunch|breakfast/i.test(label)){try{const u=new URL(link,url);if(['http:','https:'].includes(u.protocol))links.push(u.href);}catch{}}
 });
 function visit(v:any,category:string|null=null){
  if(!v||typeof v!=='object')return;
  const types=Array.isArray(v['@type'])?v['@type']:[v['@type']];
  if(types.includes('MenuSection')&&typeof v.name==='string')category=v.name;
  if(types.includes('MenuItem')&&typeof v.name==='string'){
   for(const offer of Array.isArray(v.offers)?v.offers:[v.offers])if(offer&&['string','number'].includes(typeof offer.price))prices.push({name:v.name,category:typeof v.category==='string'?v.category:category,variant:typeof offer.name==='string'?offer.name:null,price:String(offer.price),currency:typeof offer.priceCurrency==='string'?offer.priceCurrency:null,evidence:JSON.stringify(v)});
  }
  for(const child of Object.values(v))if(Array.isArray(child))child.forEach(entry=>visit(entry,category));else if(child&&typeof child==='object')visit(child,category);
 }
 if(includePrices)$('script[type="application/ld+json"]').each((_,el)=>{try{visit(JSON.parse($(el).text()));}catch{}});
 if(includePrices&&!prices.length)$('article.menu-item, .menu-item').each((_,el)=>{
  const node=$(el),name=node.find('h3,h4,.menu-item-name').first().text().trim(),price=node.find('.price,.menu-item-price').first().text().trim();
  if(name&&price&&/\d/.test(price))prices.push({name,variant:null,price,currency:null,evidence:node.html()||''});
 });
 $('script,style,noscript,nav,footer').remove();$('br').replaceWith('\n');$('p,li,tr,div,h1,h2,h3').each((_,el)=>{$(el).append('\n');});
 const menuEvidence=$('article.menu-item,.menu-item,[itemtype="https://schema.org/MenuItem"]').length>0;
 const text=$('body').text().replace(/[ \t]+/g,' ').replace(/\n\s*\n/g,'\n').trim();
 return {text,menuEvidence,links:[...new Set(links)],prices:includePrices?(prices.length?prices:pricesFromText(text)):[]};
}
function publicAddress(address:string){
 if(isIP(address)===6)return !/^(::|fc|fd|fe[89ab]|ff)/i.test(address);
 const [a,b]=address.split('.').map(Number);
 return a!==0&&a!==10&&a!==127&&!(a===169&&b===254)&&!(a===192&&b===168)&&a<224&&!(a===172&&b>=16&&b<=31)&&!(a===100&&b>=64&&b<=127);
}
async function resource(url:string,signal?:AbortSignal){
 let current=url;
 for(let i=0;i<5;i++){
  const u=new URL(current);if(!['http:','https:'].includes(u.protocol)||u.username||u.password||u.port&&!['80','443'].includes(u.port))throw Error('Unsupported public resource URL.');
  const addresses=await lookup(u.hostname,{all:true});if(!addresses.length||addresses.some(v=>!publicAddress(v.address)))throw Error('Resource is not a public internet address.');
  const response=await fetch(u,{redirect:'manual',signal:signal?AbortSignal.any([signal,AbortSignal.timeout(30000)]):AbortSignal.timeout(30000),headers:{'User-Agent':'GEO-Public-Menu-Collector/1.0'}});
  if([301,302,303,307,308].includes(response.status)){const location=response.headers.get('location');await response.body?.cancel();if(!location)throw Error('Missing redirect destination.');current=new URL(location,current).href;continue;}
  if(!response.ok){await response.body?.cancel();throw Error(`Resource HTTP ${response.status}.`);}
  const reader=response.body?.getReader();if(!reader)throw Error('Empty resource.');const chunks:Uint8Array[]=[];let size=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>12*1024*1024)throw Error('Menu exceeds 12 MB limit.');chunks.push(value);}}finally{await reader.cancel();}
  return {url:current,buffer:Buffer.concat(chunks),type:response.headers.get('content-type')||'',modified:response.headers.get('last-modified')};
 }
 throw Error('Too many redirects.');
}
export async function readDocument(url:string,signal?:AbortSignal,includePrices=true):Promise<Document>{
 const r=await resource(url,signal),fetched_at=new Date().toISOString();let text='',prices:Price[]=[],links:string[]=[],format:Document['format']='html',metadata=r.modified,extraction='html',menuEvidence=false;
 if(r.type.includes('pdf')||r.buffer.subarray(0,5).toString()==='%PDF-'){
  format='pdf';extraction='pdf-text';const {getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task=getDocument({data:new Uint8Array(r.buffer),useSystemFonts:true});const pdf=await task.promise;
  try{
   if(pdf.numPages>20)throw Error('PDF exceeds 20-page limit.');
   for(let n=1;n<=pdf.numPages;n++){signal?.throwIfAborted();const page=await pdf.getPage(n);const content=await page.getTextContent();text+=content.items.map((v:any)=>v.str?(v.str+(v.hasEOL?'\n':' ')):'').join('')+'\n';}
   const info=(await pdf.getMetadata()).info as any;const date=info?.ModDate||info?.CreationDate;
   const m=typeof date==='string'&&date.match(/^D:(\d{4})(\d{2})(\d{2})/);if(m)metadata=`${m[1]}-${m[2]}-${m[3]}`;
   if(!text.trim()){
    if(process.env.MENU_OCR_ENABLED!=='true')throw Error('Scanned PDF OCR disabled; set MENU_OCR_ENABLED=true.');
    const {createCanvas}=await import('@napi-rs/canvas');const {createWorker}=await import('tesseract.js');const worker=await createWorker('eng');
    try{for(let n=1;n<=pdf.numPages;n++){
     signal?.throwIfAborted();const page=await pdf.getPage(n),viewport=page.getViewport({scale:1.5});
     if(viewport.width*viewport.height>16000000)throw Error('PDF page exceeds render limit.');
     const canvas=createCanvas(Math.ceil(viewport.width),Math.ceil(viewport.height));
     await page.render({canvas:canvas as any,viewport}).promise;text+=(await worker.recognize(canvas.toBuffer('image/png'))).data.text+'\n';
    }}finally{await worker.terminate();}extraction='pdf-ocr';
   }
  }finally{await task.destroy();}
  prices=includePrices?pricesFromText(text):[];
 }else if(r.type.startsWith('image/')){
  format='image';extraction='ocr';if(process.env.MENU_OCR_ENABLED!=='true')throw Error('Image OCR disabled; set MENU_OCR_ENABLED=true to extract text locally.');
  const {createWorker}=await import('tesseract.js');const worker=await createWorker('eng');
  try{text=(await worker.recognize(r.buffer)).data.text;}finally{await worker.terminate();}
  prices=includePrices?pricesFromText(text):[];
 }else if(r.type.includes('html')){
  const parsed=htmlDocument(r.buffer.toString('utf8'),r.url,includePrices);({text,prices,links,menuEvidence}=parsed);
  if(text.length<3000&&/verify you are human|access denied|enable javascript|captcha|just a moment/i.test(text))throw Error('Page access restricted or requires interactive rendering.');
 }else throw Error('Unsupported menu resource format.');
 return {url:r.url,format,text,prices,links,date:extractDate(text,metadata),fetched_at,menuEvidence,sha256:createHash('sha256').update(r.buffer).digest('hex'),extraction};
}
