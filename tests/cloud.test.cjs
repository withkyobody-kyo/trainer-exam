const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const C=require('../js/cloud-core.js');
const known=new Set(['q']),s=C.fresh();s.bookmarks=['q'];s.notes.q='메모';s.session={id:'s',ids:['q'],exam:'health',mode:'subject',startedAt:1,answers:{},index:0,lastTick:99};
assert.equal(C.project(s,known)['session:s'].lastTick,undefined);
assert.deepEqual(C.diff({'bookmark:q':{saved:true}},{}),[{key:'bookmark:q',body:{saved:false}}]);
const merged=C.materialize(C.fresh(),{'bookmark:q':{item_key:'bookmark:q',body:{saved:true}},'note:q':{item_key:'note:q',body:{text:'PC 메모'}},'session:s':{item_key:'session:s',body:{...s.session,answers:{q:2},deadline:123}}},{q:{attempts:1}},known);
assert.equal(merged.state.notes.q,'PC 메모');assert.equal(merged.state.session.answers.q,2);assert.equal(merged.state.session.deadline,123);
const storage=new Map(),events={},server=new Map(),attempts=new Map();let current={id:'user-a',email:'a@example.invalid'},authCB,failAfterAttempt=false;
const copy=x=>JSON.parse(JSON.stringify(x));
const client={auth:{onAuthStateChange:f=>{authCB=f;},getSession:async()=>({data:{session:{user:current}}}),signOut:async()=>{current=null;authCB('SIGNED_OUT',null);return{};}},from:()=>{const chain={select:()=>chain,eq:(k,u)=>{chain.owner=u;return chain;},order:()=>chain,range:async()=>({data:copy([...server.values()].filter(x=>x.user_id===chain.owner))})};return chain;},rpc:async(name,p)=>{
 const u=current.id;
 if(name==='trainer_account_info')return {data:{isAdmin:false}};
 if(name==='trainer_progress'){let records={};for(const a of attempts.values())if(a.user===u)records[a.questionId]={attempts:(records[a.questionId]?.attempts||0)+1,correct:0,wrong:1,exam:'health',subject:'test'};return{data:records};}
 if(name==='trainer_put_item'){const key=u+'/'+p.p_key,old=server.get(key);if((old?.revision||0)!==p.p_expected)return{data:{status:'conflict',item:old}};const item={user_id:u,item_key:p.p_key,revision:(old?.revision||0)+1,body:copy(p.p_body)};server.set(key,item);return{data:{status:'saved',item:copy(item)}};}
 if(name==='trainer_submit_attempts'){const out=p.p_answers.map(a=>{const key=u+'/'+p.p_session+'/'+a.questionId;if(!attempts.has(key))attempts.set(key,{...a,user:u,online:p.p_online});return {...a,correct:false};});if(failAfterAttempt){failAfterAttempt=false;return {error:{message:'Failed to fetch'}};}return{data:out};}
 return{data:null};
}};
const doc={querySelector:()=>null};
const context={console,crypto,structuredClone,Map,Set,Date,JSON,Promise,document:doc,navigator:{onLine:true},location:{},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},setTimeout:()=>1,clearTimeout:()=>{},supabase:{createClient:()=>client}};
context.window=context;context.addEventListener=(k,f)=>events[k]=f;context.CloudCore=C;context.TRAINER_CLOUD_CONFIG={enabled:true,url:'url',publishableKey:'public'};
vm.createContext(context);vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../js/cloud.js'),'utf8'),context);
(async()=>{
 const api=context.TrainerCloud;await api.init([{id:'q'}]);let state=api.readState();api.attach({read:()=>state,apply:x=>state=x,timer:()=>{},lock:()=>{}});
 state.notes.q='첫 메모';api.saveState(state);await api.sync();assert.equal(server.get('user-a/note:q').body.text,'첫 메모');
 context.navigator.onLine=false;state.bookmarks=['q'];api.saveState(state);assert.equal(JSON.parse(storage.get('trainer.cloud.v1.user-a')).queue.length,1);
 context.navigator.onLine=true;await api.sync();assert.equal(server.get('user-a/bookmark:q').body.saved,true);
 state.session={id:'session',exam:'health',mode:'subject',ids:['q'],startedAt:10,answers:{q:3},checked:{},graded:{},questionTimes:{q:2345}};api.saveState(state);await api.sync();
 failAfterAttempt=true;await api.submitAnswers(state.session,['q'],true);assert.equal(attempts.size,1);await api.sync();assert.equal(attempts.size,1);assert.equal(state.records.q.attempts,1);
 const remote=server.get('user-a/note:q');remote.revision++;remote.body.text='다른 기기';state.notes.q='내 기기';api.saveState(state);await api.sync();
 const box=JSON.parse(storage.get('trainer.cloud.v1.user-a'));assert.ok(box.conflicts['note:q']);assert.equal(box.conflicts['note:q'].local.text,'내 기기');assert.equal(server.get('user-a/note:q').body.text,'다른 기기');
 assert.equal(storage.has('motionnote.study.v1'),false);
 current={id:'user-b',email:'b@example.invalid'};
 const ctx2={...context};ctx2.window=ctx2;vm.createContext(ctx2);vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../js/cloud.js'),'utf8'),ctx2);await ctx2.TrainerCloud.init([{id:'q'}]);assert.equal(Object.keys(ctx2.TrainerCloud.readState().notes).length,0);assert.equal(ctx2.TrainerCloud.readState().bookmarks.length,0);
 assert.equal(JSON.parse(storage.get('trainer.cloud.v1.user-a')).conflicts['note:q'].local.text,'내 기기');

 console.log('PASS: projection, resume order/deadline, per-account storage, offline retry, response dedupe, compare-and-swap conflict preservation');
})().catch(e=>{console.error(e);process.exitCode=1;});
