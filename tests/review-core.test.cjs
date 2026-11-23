const assert=require('node:assert/strict'),R=require('../js/review-core'),C=require('../js/core'),Cloud=require('../js/cloud-core');
const now=new Date(2026,10,23,12).getTime(),ago=n=>now-n*86400000;
const bank=['a','b','c','d','other','unknown'].map((id,i)=>({id,exam:id==='other'?'sports':'health',subject:i%2?'생리':'해부',answer:id==='unknown'?null:[2],stem:'문제 '+id,unit:'단원',difficulty:i%2?'하':'상',year:2025,number:i+1}));
const state={...Cloud.fresh(),notes:{a:'심박출량 기억하기'},records:{a:{wrong:3,resolved:false,lastAt:ago(1)},b:{wrong:1,resolved:false,lastAt:ago(4)},c:{wrong:1,resolved:true,lastAt:ago(4)},d:{wrong:2,resolved:true,lastAt:ago(1)},other:{wrong:9,resolved:false},unknown:{wrong:1,resolved:false}}};
assert.deepEqual(R.rows(bank,state,{},now).map(q=>q.id),['a','b','c']);
assert.deepEqual(R.summary(bank,state,now),{all:4,ready:3,active:2,repeat:1,due:1,done:2});
assert.deepEqual(R.rows(bank,state,{status:'repeat'},now).map(q=>q.id),['a']);
assert.deepEqual(R.rows(bank,state,{status:'all',subject:'생리',difficulty:'하',sort:'oldest'},now).map(q=>q.id),['b','d']);
assert.deepEqual(R.rows(bank,state,{search:'심박출량'},now).map(q=>q.id),['a']);
assert(!R.isDue({resolved:true,lastAt:0},now));assert.equal(new Date(R.dueAt(state.records.c)).getHours(),0);
const note='기존 메모\n<문자도 보존>';assert.equal(R.noteParts(R.withReason(note,'개념 혼동')).text,note);assert.equal(R.withReason(R.withReason(note,'개념 혼동'),''),note);assert.equal(R.noteParts('[오답 이유: 알 수 없음]\n메모').reason,'');
const q=bank[0],history={id:'old',ids:['a'],answers:{a:1},finishedAt:ago(2),serverVerdicts:{a:false}};
state.history=[history,{ids:['b'],answers:{b:1},finishedAt:ago(1),serverVerdicts:{b:null}}];state.session={ids:['a'],mode:'mock',answers:{a:3},checked:{a:true},startedAt:now};
assert.deepEqual(R.lastWrongAnswers(state,bank),{a:1});state.session.mode='review';assert.deepEqual(R.lastWrongAnswers(state,bank),{a:3});state.session.checked={};assert.deepEqual(R.lastWrongAnswers(state,bank),{a:1});
// A real new graded session resolves an error; duplicate grading never changes the schedule.
const st={records:{}},s={answers:{a:1},graded:{}};C.gradeRecord(st,s,q,ago(4));const re={answers:{a:2},graded:{}};C.gradeRecord(st,re,q,now);assert(st.records.a.resolved);assert(!R.isDue(st.records.a,now));assert(!C.gradeRecord(st,re,q,now+1));assert.equal(st.records.a.resolvedAt,now);assert(R.isDue(st.records.a,now+3*86400000));
const again={answers:{a:1},graded:{}};C.gradeRecord(st,again,q,now+4*86400000);assert(!st.records.a.resolved);assert.equal(st.records.a.wrong,2);
// Notes remain compatible with existing per-question cloud sync and backups.
state.notes.a=R.withReason(note,'개념 혼동');state.session=null;const projected=Cloud.project(state,new Set(bank.map(q=>q.id)));assert.equal(projected['note:a'].text,state.notes.a);
const restored=Cloud.materialize(Cloud.fresh(),{'note:a':{item_key:'note:a',body:projected['note:a']}},state.records,new Set(['a']));assert.equal(restored.state.notes.a,state.notes.a);
console.log('PASS: priorities, status/subject/difficulty/note filters, separate exams, three-day review, unknown answers excluded, hidden mock answers, server verdicts, deduped grading, existing note sync');
// Visible state tabs partition the same historical errors without deleting any record.
assert.deepEqual(R.rows(bank,state,{status:'complete'},now).map(q=>q.id),['d']);
const ready=R.rows(bank,state,{status:'ready'},now),complete=R.rows(bank,state,{status:'complete'},now),all=R.rows(bank,state,{status:'all'},now);
assert.equal(ready.length+complete.length,all.length);assert(!ready.some(q=>complete.includes(q)));
assert.deepEqual(R.rows(bank,state,{status:'complete',repeated:true},now).map(q=>q.id),['d']);
assert.deepEqual(R.rows(bank,state,{status:'ready',repeated:true},now).map(q=>q.id),['a']);
console.log('PASS: non-overlapping review/completed tabs and repeated-error filter combined with status');
