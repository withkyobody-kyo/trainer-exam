const assert=require('node:assert/strict'),H=require('../js/history-core'),C=require('../js/core'),Cloud=require('../js/cloud-core');
const now=new Date(2026,10,23,12).getTime(),at=(day,hour=12)=>new Date(2026,10,day,hour).getTime();
const bank=[{id:'a',subject:'생리',exam:'health',answer:[2]},{id:'b',subject:'해부',exam:'health',answer:[1]},{id:'u',subject:'생리',exam:'health',answer:null}];
const byId=new Map(bank.map(q=>[q.id,q]));
const make=(id,finishedAt,answers,ids=['a'],mode='subject',exam='health',serverVerdicts={})=>({id,finishedAt,exam,mode,ids,answers,serverVerdicts,label:'과목 연습',elapsedMs:60000,summary:C.summarize(ids.map(id=>byId.get(id)),answers,serverVerdicts)});
const recent=make('new',at(23),{a:2,b:2,u:2},['a','b','u']); // Unknown answer is not an error.
const missed=make('missed',at(22),{},['a']); // Known unanswered belongs in score denominator.
const boundary=make('boundary',at(17,0),{a:2},['a'],'review');
const old=make('old',at(16,23),{a:2});
const other=make('sports',at(23),{a:2},['a'],'subject','sports');
const history=[old,other,boundary,recent,missed,recent];const before=JSON.stringify(history);
assert.deepEqual(H.rows(history,{exam:'health',period:'7'},now).map(h=>h.id),['new','missed','boundary']);
assert.deepEqual(H.rows(history,{exam:'health',period:'7',mode:'review'},now).map(h=>h.id),['boundary']);
assert.equal(H.rows(history,{exam:'sports'},now).length,1);
const total=H.totals(H.rows(history,{exam:'health',period:'7'},now));
assert.deepEqual([total.sessions,total.total,total.gradeable,total.correct,total.wrong,total.unanswered,total.ungraded,total.elapsedMs,total.rate],[3,5,4,2,1,1,1,180000,50]);
assert.equal(total.subjects['생리'].gradeable,3);assert.equal(total.subjects['생리'].correct,2);
assert.equal(H.totals([make('unknown',now,{u:1},['u'])]).rate,null);
assert.equal(H.totals([]).rate,null);
assert.deepEqual(H.wrongIds(recent,byId),['b']);assert.deepEqual(H.wrongIds(missed,byId),[]);
// Server verdict wins even when the local answer key disagrees; null remains ungraded.
const server=make('server',now,{a:2,b:2,u:2},['a','b','u'],'review','health',{a:false,b:true,u:null});
assert.deepEqual(H.wrongIds(server,byId),['a']);assert.equal(H.totals([server]).rate,50);
assert.deepEqual(H.wrongIds({...server,ids:['a','removed']},byId),['a']);
assert.equal(JSON.stringify(history),before);
// Finished history is still synchronized with the existing session schema.
const state={...Cloud.fresh(),history:[recent],notes:{a:'기존 메모'},bookmarks:['a']};
const projection=Cloud.project(state,new Set(byId.keys()));
assert.equal(projection['session:new'].summary.ungraded,1);assert.equal(projection['note:a'].text,'기존 메모');
console.log('PASS: date boundaries, exam/mode filters, unique sessions, weighted rates, unanswered/unknown handling, server verdicts, immutable records and cloud projection');
