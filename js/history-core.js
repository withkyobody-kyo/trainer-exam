'use strict';
/* Read-only projections: completed sessions retain their recorded grading basis. */
const HistoryCore=(()=>{
 const number=x=>Number.isFinite(x)&&x>=0?x:0;
 function periodStart(period,now=Date.now()){
  if(![7,30].includes(Number(period)))return -Infinity;
  const date=new Date(now);date.setHours(0,0,0,0);date.setDate(date.getDate()-Number(period)+1);return date.getTime();
 }
 function rows(history,{exam,period='all',mode='all'}={},now=Date.now()){
  const start=periodStart(period,now),unique=new Map();
  for(const h of history||[]){if(!h||!h.id||h.exam!==exam||!Number.isFinite(h.finishedAt)||h.finishedAt<start||(mode!=='all'&&h.mode!==mode))continue;
   if(!unique.has(h.id)||unique.get(h.id).finishedAt<h.finishedAt)unique.set(h.id,h);
  }
  return [...unique.values()].sort((a,b)=>b.finishedAt-a.finishedAt||String(a.id).localeCompare(String(b.id)));
 }
 function totals(rows){
  const out={sessions:rows.length,total:0,correct:0,wrong:0,unanswered:0,ungraded:0,gradeable:0,elapsedMs:0,subjects:{}};
  for(const h of rows){const s=h.summary||{};out.elapsedMs+=number(h.elapsedMs);
   for(const k of ['total','correct','wrong','unanswered','ungraded','gradeable'])out[k]+=number(s[k]);
   for(const [name,value] of Object.entries(s.subjects||{})){const sub=out.subjects[name]??={total:0,correct:0,wrong:0,unanswered:0,ungraded:0,gradeable:0};for(const k of Object.keys(sub))sub[k]+=number(value[k]);}
  }
  out.rate=out.gradeable?Math.round(out.correct/out.gradeable*100):null;return out;
 }
 function wrongIds(h,byId){return (h?.ids||[]).filter(id=>{
  const q=byId.get(id),answer=h.answers?.[id];if(!q||!answer)return false;
  if(Object.prototype.hasOwnProperty.call(h.serverVerdicts||{},id))return h.serverVerdicts[id]===false;
  return Array.isArray(q.answer)&&q.answer.length>0&&!q.answer.includes(answer);
 });}
 return {periodStart,rows,totals,wrongIds};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=HistoryCore;
