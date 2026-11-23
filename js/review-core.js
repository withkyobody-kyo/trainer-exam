/* Wrong-note planning uses existing learning records and plain-text notes. */
(function(root){
'use strict';
const reasons=['개념 부족','개념 혼동','계산 실수','조건을 놓침','기억이 안 남'];
function noteParts(text=''){
 const match=String(text).match(/^\[오답 이유: ([^\n]+)\]\n?/);
 return match&&reasons.includes(match[1])?{reason:match[1],text:String(text).slice(match[0].length)}:{reason:'',text:String(text)};
}
function withReason(text,reason){const body=noteParts(text).text;return (reason?'[오답 이유: '+reason+']\n':'')+body;}
function dueAt(r){
 const at=Number(r.resolvedAt||r.lastAt);if(!r.resolved||!Number.isFinite(at)||at<=0)return null;
 const d=new Date(at);d.setHours(0,0,0,0);d.setDate(d.getDate()+3);return d.getTime();
}
function isDue(r,now=Date.now()){const at=dueAt(r);return at!==null&&at<=now;}
function matches(r,status,now){switch(status){case 'ready':return !r.resolved||isDue(r,now);case 'active':return !r.resolved;case 'repeat':return !r.resolved&&r.wrong>=2;case 'due':return isDue(r,now);case 'complete':return !!r.resolved&&!isDue(r,now);case 'done':return !!r.resolved;default:return true;}}
function compare(a,b,state,sort='priority'){
 const x=state.records[a.id],y=state.records[b.id];
 const recent=r=>Number(r.lastAt)||0;
 let d=0;
 if(sort==='recent')d=recent(y)-recent(x);
 else if(sort==='wrong')d=y.wrong-x.wrong;
 else if(sort==='oldest')d=(Number(x.lastAt)||0)-(Number(y.lastAt)||0);
 else d=Number(!!x.resolved)-Number(!!y.resolved)||(!x.resolved?y.wrong-x.wrong:0)||(Number(x.lastAt)||0)-(Number(y.lastAt)||0);
 return d||a.id.localeCompare(b.id);
}
function rows(bank,state,options={},now=Date.now()){
 const {status='ready',subject='all',difficulty='all',search='',sort='priority',repeated=false}=options,query=search.trim().toLocaleLowerCase();
 return bank.filter(q=>{
  const r=state.records[q.id];if(q.exam!==state.exam||!r||!r.wrong||!q.answer?.length)return false;
  return matches(r,status,now)&&(!repeated||r.wrong>=2)&&(subject==='all'||q.subject===subject)&&(difficulty==='all'||q.difficulty===difficulty)&&(!query||[q.stem,q.subject,q.unit,q.year,q.number,state.notes?.[q.id]].join(' ').toLocaleLowerCase().includes(query));
 }).sort((a,b)=>compare(a,b,state,sort));
}
function summary(bank,state,now=Date.now()){
 const all=rows(bank,state,{status:'all'},now),result={all:all.length,ready:0,active:0,repeat:0,due:0,done:0};
 for(const q of all)for(const status of ['ready','active','repeat','due','done'])result[status]+=Number(matches(state.records[q.id],status,now));
 return result;
}
function lastWrongAnswers(state,questions){
 const byId=new Map(questions.map(q=>[q.id,q])),answers={},times={};
 const sessions=[...(state.history||[])];if(state.session&&state.session.mode!=='mock')sessions.push({...state.session,finishedAt:state.session.startedAt,onlyChecked:true});
 for(const s of sessions)for(const id of s.ids||[]){
  const q=byId.get(id),answer=s.answers?.[id],at=Number(s.finishedAt||s.startedAt)||0;
  if(!q||!answer||s.onlyChecked&&!s.checked?.[id])continue;
  const verified=Object.prototype.hasOwnProperty.call(s.serverVerdicts||{},id),wrong=verified?s.serverVerdicts[id]===false:q.answer?.length&&!q.answer.includes(answer);
  if(wrong&&at>=(times[id]??-1)){answers[id]=answer;times[id]=at;}
 }
 return answers;
}
const api={reasons,noteParts,withReason,dueAt,isDue,matches,rows,summary,lastWrongAnswers};
if(typeof module==='object'&&module.exports)module.exports=api;else root.ReviewCore=api;
})(typeof window==='object'?window:globalThis);
