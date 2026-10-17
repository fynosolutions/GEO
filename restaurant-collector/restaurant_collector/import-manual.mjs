import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {parseArgs} from 'node:util';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {addSnapshot,exportSession} from '../extensions/google-maps-collector/session.mjs';
import {hashInputs} from '../extensions/google-maps-collector/content.mjs';
const {values:v}=parseArgs({options:{input:{type:'string'},output:{type:'string'},help:{type:'boolean'}}});
if(v.help){console.log('node restaurant_collector/import-manual.mjs --input ~/Downloads/google-maps-xxx.json [--output output/manual]');}
else{
  try{
    if(!v.input)throw new Error('需要 --input 指定扩展导出的 JSON');
    const raw=await readFile(v.input,'utf8');if(raw.length>15000000)throw new Error('文件过大');
    const data=JSON.parse(raw);if(!['google-maps.manual.v1','google-maps.manual.v2'].includes(data.schemaVersion) || !Array.isArray(data.snapshots) || !data.snapshots.length)throw new Error('不是受支持的扩展采集文件');
    let session=null;
    for(const snapshot of data.snapshots){
      if(!hashInputs(snapshot).some(text=>createHash('sha256').update(text).digest('hex')===snapshot.sha256))throw new Error('采集记录指纹不符，请重新导出原文件');
      session=addSnapshot(session,snapshot);
    }
    const result=exportSession(session);
    const out=path.resolve(v.output || `output/manual-${Date.now()}`);await mkdir(out,{recursive:true});
    await writeFile(path.join(out,'result.json'),JSON.stringify(result,null,2));
    const f=result.platforms.google_maps.fields;
    const lines=['# Google Maps 半自动采集报告','',`名称：${f.name.value}`,`详细地址：${f.address.value}`,
      `电话：${f.contact.value?.phone || '未采集到'}`,`官网：${f.contact.value?.website || '未采集到'}`,
      `简介：${f.description.value || '未采集到'}`,`特色/热门菜：${f.specialties.value?.join('、') || '未采集到'}`,
      '',`页面快照：${result.snapshots.length} 份`,`基础字段差异：${result.conflicts.length} 项（详见 JSON）`];
    lines.push('','## 分类菜单','');
    for(const section of f.menu.value || []){
      lines.push(`### ${section.category}`,'');
      for(const item of section.items)lines.push(`- ${item.name} · ${item.price || '价格未知'}${item.description?' — '+item.description:''}${item.parseStatus==='needs_review'?'（待复核）':''}`);
      if(!section.items.length)lines.push('已保存原文，待结构化识别。');
      lines.push('');
    }
    lines.push('## About 设施与服务','');
    for(const section of f.attributes.value || [])lines.push(`- ${section.category}：${section.items.map(i=>`${i.text}${i.availability==='no'?'（不提供）':''}`).join('；')}`);
    lines.push('','## 来源','',...result.snapshots.map(s=>`- [${s.pane} · ${s.capturedAt}](${s.url})`));
    await writeFile(path.join(out,'report.md'),lines.join('\n'));console.log(out);
  }catch(e){console.error(e.message);process.exitCode=1;}
}
