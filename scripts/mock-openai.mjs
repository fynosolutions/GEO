// Test-only preload. No network calls or real credentials.
const originalFetch = globalThis.fetch;
{
  const { chromium } = await import('playwright');
  const launch = chromium.launchPersistentContext.bind(chromium);
  chromium.launchPersistentContext = async (profile,options) => {
    if(options.locale!=='en-US' || options.extraHTTPHeaders?.['Accept-Language']!=='en-US,en;q=0.9')throw new Error('Browser English locale regression');
    const context = await launch(profile,options), newPage = context.newPage.bind(context);
      context.newPage = async () => {
        const page = await newPage();
        const html=process.env.VISION_FIXTURE==='true'?'<canvas width="1000" height="500"></canvas><script>const c=document.querySelector("canvas").getContext("2d");c.fillStyle="white";c.fillRect(0,0,1000,500);c.fillStyle="black";c.font="28px Arial";c.fillText("Fixture Restaurant",30,60);c.fillText("1 Test St, New York, NY",30,110);c.fillText("1.2K reviews",30,160);</script>':'<h1>Fixture Restaurant</h1><p>1 Test St, New York, NY</p><p>Mon–Sun 11am–10pm</p><p>1.2K reviews</p>';
        await page.route('**/*', route => route.fulfill({contentType:'text/html',body:html}));
        return page;
      };
    return context;
  };
}

globalThis.fetch = async (url, init) => {
 if(url!=='https://api.openai.com/v1/responses')return originalFetch(url,init);
 const body=JSON.parse(init.body);let text;
 if(process.env.MOCK_SLOW==='true')await new Promise((resolve,reject)=>{const timer=setTimeout(resolve,10000);init.signal?.addEventListener('abort',()=>{clearTimeout(timer);reject(new Error('aborted'));},{once:true});});
 if(body.text?.format.name==='visual_reading'){
  const context=JSON.parse(body.input[0].content[0].text);
  const file=body.input[0].content.find(c=>c.type==='input_text'&&c.text.startsWith('Image file: ')).text.slice(12);
  const values=Object.fromEntries(Object.keys(body.text.format.schema.properties.result.properties.values.properties).map(k=>[k,null]));values.name='Fixture Restaurant';values.review_count='1.2K reviews';
  text=JSON.stringify({page_state:'listing',branch_verified:true,result:{status:'partial',source_url:context.source_url,status_note:null,values,evidence:[],review_metadata:{source_type:null,sample_size:null,sampling_method:null,newest_sort_verified:false}},visual_evidence:[{field:'name',image:file,excerpt:'Fixture Restaurant',x:10,y:10,width:500,height:100},{field:'review_count',image:file,excerpt:'1.2K reviews',x:10,y:100,width:500,height:100}]});
 }else if(body.text?.format.name==='visual_review')text=JSON.stringify({page_state:'listing',branch_verified:true,verified_fields:['name','review_count']});
 else if(body.tools)text=body.input.includes('Target address')?'Identity research: Fixture Restaurant, 1 Test St, New York, NY.':'Platform research: Fixture Restaurant.';
 else if(body.text.format.schema.properties.name)text=JSON.stringify({name:'Fixture Restaurant',address:'1 Test St, New York, NY',status:'confirmed',note:null});
 else {
  const values=Object.fromEntries(Object.keys(body.text.format.schema.properties.values.properties).map(k=>[k,null]));
  const browser=process.env.BROWSER_FIXTURE==='true'&&body.input.includes('"observation"');
  if(browser){values.name='Fixture Restaurant';values.review_count='1.2K reviews';}
  text=JSON.stringify({status:browser?'partial':'blocked',source_url:process.env.BROWSER_FIXTURE==='true'?'https://www.yelp.com/biz/fixture':null,status_note:'Fixture result.',values,evidence:browser?[{field:'name',excerpt:'Fixture Restaurant',url:'https://www.yelp.com/biz/fixture'},{field:'review_count',excerpt:'1.2K reviews',url:'https://www.yelp.com/biz/fixture'}]:[],review_metadata:{source_type:null,sample_size:null,sampling_method:null,newest_sort_verified:false}});
 }
 return new Response(JSON.stringify({status:'completed',output:[{type:'web_search_call',action:{sources:[{url:process.env.BROWSER_FIXTURE==='true'?'https://www.yelp.com/biz/fixture':'https://fixture.example'}]}},{type:'message',content:[{type:'output_text',text}]}]}),{status:200});
};
