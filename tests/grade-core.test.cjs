const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Core=require('../js/core.js');
const read=f=>JSON.parse(fs.readFileSync(path.join(__dirname,'../data',f),'utf8'));
const bank=[...read('health.json'),...read('sports.json')],config=read('exam-config.json'),assets=read('page-assets.json');
assert.equal(bank.length,3730);assert.equal(Core.validateImport(bank,[],config,assets).questions.length,3730);
const q=bank.find(q=>q.type==='창작 예상문제'),missing=bank.find(q=>q.answer===null),state={records:{}};
const s={answers:{[q.id]:q.answer[0]%4+1},graded:{}};
assert(Core.gradeRecord(state,s,q,1));assert(!Core.gradeRecord(state,s,q,2));assert.equal(state.records[q.id].wrong,1);
const s2={answers:{[q.id]:q.answer[0]},graded:{}};Core.gradeRecord(state,s2,q,3);assert.equal(state.records[q.id].wrong,1);assert(state.records[q.id].resolved);
const stale={...q,answer:[4]},trusted={answers:{[q.id]:1},graded:{},serverVerdicts:{[q.id]:true}};
Core.gradeRecord(state,trusted,stale,4);assert.equal(state.records[q.id].lastResult,true);
assert.equal(Core.summarize([stale],{[q.id]:1},{[q.id]:true}).correct,1);
assert.equal(Core.summarize([q],{[q.id]:q.answer[0]},{[q.id]:null}).ungraded,1);
assert.equal(Core.summarize([q,missing],{[missing.id]:1}).wrong,0);
assert.equal(Core.summarize([q,missing],{[missing.id]:1}).unanswered,1);
for(const exam of ['health','sports']){const subjects=config[exam].subjects.slice(0,config[exam].selectCount);const qs=Core.mockQuestions(bank.filter(q=>q.exam===exam&&q.year===2026),subjects,20);assert.equal(qs.length,exam==='health'?160:100);assert.equal(new Set(qs.map(q=>q.id)).size,qs.length);}
const custom={...q,id:'qa-new'};assert.throws(()=>Core.validateImport([{...custom,answer:[5]}],bank,config,assets),/정답 번호/);assert.throws(()=>Core.validateImport([q],bank,config,assets),/중복 ID/);assert.throws(()=>Core.validateImport([{...custom,subject:null}],bank,config,assets));
assert.equal(Core.filterDifficulty(bank,'하').every(q=>q.difficulty==='하'),true);
console.log('PASS: 3,730 existing questions, unknown answers, duplicate grading, review history, server verdicts, full mock composition, difficulty filter, JSON validation');
