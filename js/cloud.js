(function(){
'use strict';
const C=window.CloudCore,CFG=window.TRAINER_CLOUD_CONFIG,guestKey='motionnote.study.v1';
const id=()=>crypto.randomUUID(),clone=C.clone,esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let editSerial=0,suspendPull=0;
let client,user=null,box=null,known=new Set(),bridge=null,projection={},timer,running=null,generation=0,ready=false,recovery=false,admin=false,active=[],status='기기에 저장',errorText='',authTab='login',notice='';
const cacheKey=u=>'trainer.cloud.v1.'+u;
const emptyBox=()=>({state:C.fresh(),items:{},queue:[],conflicts:{},receipts:{},seen:[],imported:false});
function persist(){if(user&&box)localStorage.setItem(cacheKey(user.id),JSON.stringify(box));}
function report(text,error=''){status=text;errorText=error;paintStatus();}
function paintStatus(){const e=document.querySelector('#cloud-status');if(e)e.textContent=(user?'☁ ':'● ')+status;const b=document.querySelector('#cloud-account');if(b)b.textContent=user?'내 계정':'로그인 · 동기화';}
function schedule(){clearTimeout(timer);if(user)timer=setTimeout(()=>sync(),900);}
function enqueue(entry){
 const last=box.queue.at(-1);
 if(entry.kind==='item'&&last?.kind==='item'&&last.key===entry.key&&!last.sent){last.body=clone(entry.body);}
 else box.queue.push({...entry,operation:id(),sent:false});
 persist();report('기기에 임시 저장 · 전송 대기');
}
function saveState(state){
 if(!user){localStorage.setItem(guestKey,JSON.stringify(state));return;}
 editSerial++;box.state=clone(state);const next=C.project(state,known);
 for(const d of C.diff(projection,next)){
  const previous=box.queue.filter(o=>o.kind==='item'&&o.key===d.key).at(-1);
  enqueue({kind:'item',key:d.key,body:d.body,expected:previous?null:(box.items[d.key]?.revision||0)});
 }
 projection=next;persist();schedule();
}
async function rpc(name,args){const {data,error}=await client.rpc(name,args);if(error)throw error;return data;}
function safeError(e){
 if(!navigator.onLine||/fetch|network|load failed/i.test(e?.message||''))return '인터넷 연결을 확인해 주세요. 이 기기의 임시 기록은 유지됩니다.';
 if(e?.status===401||/jwt|token.*expired/i.test(e?.message||''))return '로그인이 만료되었습니다. 다시 로그인하면 전송을 이어갑니다.';
 return /[가-힣]/.test(e?.message||'')?e.message:'연결 또는 저장에 실패했습니다. 잠시 후 다시 시도해 주세요.';
}
async function drain(){
 const g=generation,owner=user?.id;
 if(!owner||!navigator.onLine)return false;
 report('저장 중…');
 while(box.queue.length){
  const op=box.queue[0];if(op.kind==='item'&&box.conflicts[op.key]){report('두 기기의 변경을 확인해 주세요');return false;}
  op.sent=true;persist();let value;
  try{
   if(op.kind==='item'){
    if(op.expected===null)op.expected=box.items[op.key]?.revision||0;
    persist();value=await rpc('trainer_put_item',{p_operation:op.operation,p_key:op.key,p_expected:op.expected,p_body:op.body});
   }else if(op.kind==='attempt')value=await rpc('trainer_submit_attempts',{p_session:op.session,p_answers:op.answers,p_online:op.online,p_reveal:op.reveal});
   else if(op.kind==='seen')value=await rpc('trainer_mark_seen',{p_ids:op.ids});
   else if(op.kind==='legacy')value=await rpc('trainer_import_records',{p_records:op.records});
   if(g!==generation||user?.id!==owner)return false;
   if(op.kind==='item'){
    if(value.status==='conflict'){box.conflicts[op.key]={local:op.body,remote:value.item};persist();report('두 기기의 변경을 확인해 주세요');return false;}
    box.items[op.key]=value.item;
    const s=box.state.session;if(s?.id===op.key.slice(8)&&value.item.body.mode==='mock'){
     const b=value.item.body;if(s.phase===b.phase&&s.stage===b.stage){s.deadline=b.deadline;s.phaseStartedAt=b.phaseStartedAt;if(b.breakDeadline)s.breakDeadline=b.breakDeadline;bridge?.timer(s);}
    }
   }
   if(op.kind==='attempt')for(const a of value)box.receipts[a.id]=a;
   box.queue.shift();persist();
  }catch(e){
   if(g!==generation)return false;
   if(op.kind==='attempt')op.online=false;
   persist();report(navigator.onLine?'저장 오류 · 기기 기록 유지':'오프라인 · 기기에 임시 저장',safeError(e));return false;
  }
 }
 report('서버 저장 완료');return true;
}
async function pull(){
 const g=generation,owner=user?.id,serial=editSerial;if(!owner||box.queue.length||suspendPull)return;
 const items={};let offset=0;
 for(;;){const {data,error}=await client.from('trainer_items').select('item_key,revision,body,updated_at').eq('user_id',owner).order('item_key').range(offset,offset+999);if(error)throw error;for(const x of data)items[x.item_key]=x;if(data.length<1000)break;offset+=1000;}
 const records=await rpc('trainer_progress',{});
 if(g!==generation||box.queue.length||serial!==editSerial||suspendPull)return;
 box.items=items;const result=C.materialize(box.state,items,records,known);box.state=result.state;active=result.active;
 projection=C.project(box.state,known);persist();bridge?.apply(clone(box.state));
 report('서버 저장 완료');
}
async function sync(){
 if(!user)return true;
 if(running)return running;
 running=(async()=>{try{if(!navigator.onLine){report('오프라인 · 기기에 임시 저장');return false;}if(!await drain())return false;await pull();return true;}catch(e){report('연결 오류 · 기기 기록 유지',safeError(e));return false;}finally{running=null;paintStatus();}})();return running;
}
async function submitAnswers(s,ids,reveal){
 if(!user||s.ids.some(q=>!known.has(q)))return {local:true};
 saveState(bridge?.read()||box.state);
 const answers=ids.filter(q=>s.answers[q]&&!s.cloudSubmitted?.[q]).map(q=>({id:s.attemptIds?.[q]||id(),questionId:q,choice:s.answers[q],answeredAt:Date.now(),elapsedMs:Math.round(s.questionTimes?.[q]||0)}));
 if(!answers.length)return {};
 s.attemptIds??={};s.cloudSubmitted??={};for(const a of answers){s.attemptIds[a.questionId]=a.id;s.cloudSubmitted[a.questionId]=true;}
 enqueue({kind:'attempt',session:s.id,answers,online:navigator.onLine&&!s.legacyImported&&!box.queue.some(o=>o.kind==='attempt'||o.kind==='seen'||o.kind==='legacy'),reveal});
 // Persist the fixed attempt IDs before revealing an answer or awaiting a network response.
 box.state.session=clone(s);persist();
 suspendPull++;try{await sync();if(box.queue.some(o=>o.kind==='attempt'&&o.session===s.id)&&!errorText)await sync();}finally{suspendPull--;}
 for(const pending of box.queue)if(pending.kind==='attempt'&&pending.session===s.id)pending.online=false;persist();
 s.serverVerdicts??={};for(const a of answers){const receipt=box.receipts[a.id];if(receipt&&Object.prototype.hasOwnProperty.call(receipt,'correct'))s.serverVerdicts[a.questionId]=receipt.correct;}
 return Object.fromEntries(answers.map(a=>[a.questionId,box.receipts[a.id]||null]));
}
function markSeen(ids){
 if(!user)return;const fresh=ids.filter(q=>known.has(q)&&!box.seen.includes(q));if(!fresh.length)return;
 box.seen.push(...fresh);enqueue({kind:'seen',ids:fresh});schedule();
}
async function importGuest(){
 const raw=localStorage.getItem(guestKey);if(!raw){notice='옮길 브라우저 기록이 없습니다.';showAccount();return;}
 const legacy=JSON.parse(raw);await importState(legacy);box.imported=true;persist();notice+=(notice?' ':'')+'옮기기 요청을 저장했습니다. 원래 브라우저 기록은 삭제하지 않습니다.';showAccount();
}
async function importState(legacy){
 if(!user)return false;
 if(!await sync())throw Error('먼저 대기 중인 저장과 충돌을 해결해 주세요.');
 enqueue({kind:'legacy',records:legacy.records||{}});
 const proposed=C.project({...legacy,session:null},known);
 for(const [key,body] of Object.entries(proposed)){
  if(box.items[key])continue; // Existing account data wins; migration never overwrites it.
  enqueue({kind:'item',key,body,expected:0});
 }
 if(legacy.session?.ids.every(q=>known.has(q))&&!box.items['session:'+legacy.session.id]){
  const original=clone(legacy.session);
  original.legacyImported=true;original.cloudSubmitted={...original.cloudSubmitted};
  for(const q of Object.keys(original.graded||{}))original.cloudSubmitted[q]=true;
  if(original.mode!=='mock'||original.phase===0&&original.stage==='quiz'){
   enqueue({kind:'item',key:'session:'+original.id,body:{...original,completed:false},expected:0});
  }else{
   const h={...original,completed:true,finishedAt:Date.now(),label:original.label+' · 가져온 진행 기록',summary:Core.summarize(original.ids.map(q=>window.TrainerBank.get(q)).filter(Boolean),original.answers)};
   enqueue({kind:'item',key:'session:'+h.id,body:h,expected:0});
   notice='기존 모의고사의 2교시·휴식 기록은 남은 시간을 새로 부여하지 않고 개인 학습 내역으로 보관했습니다.';
  }
 }
 return await sync();
}
async function resolve(key,choice){
 const conflict=box.conflicts[key];if(!conflict)return;
 const localOps=box.queue.filter(o=>o.kind==='item'&&o.key===key),latest=localOps.at(-1)?.body||conflict.local;
 box.queue=box.queue.filter(o=>!(o.kind==='item'&&o.key===key));
 if(conflict.remote)box.items[key]=conflict.remote;else delete box.items[key];
 delete box.conflicts[key];
 if(choice==='local')box.queue.unshift({kind:'item',operation:id(),key,body:latest,expected:conflict.remote?.revision||0,sent:false});
 // A server choice also cancels unsent attempts for that conflicting session, preserving local backup below.
 if(choice==='server'&&key.startsWith('session:')){
  const sid=key.slice(8);box.queue=box.queue.filter(o=>!(o.kind==='attempt'&&o.session===sid));
 }
 box.conflictBackups??=[];box.conflictBackups.push({key,local:latest,remote:conflict.remote,at:Date.now()});persist();await sync();showAccount();
}
function detail(key,b){if(!b)return '저장된 기록 없음';if(b.deleted)return '삭제된 기록';if(key.startsWith('note:'))return b.text||'(빈 메모)';if(key.startsWith('bookmark:'))return b.saved?'북마크 저장':'북마크 해제';return `${b.label||'학습'} · ${Object.keys(b.answers||{}).length}/${b.ids?.length||0}문항 응답 · ${b.completed?'완료':(b.index||0)+1+'번에서 진행 중'}`;}
function messageHTML(){return notice?`<p class="note" role="status">${esc(notice)}</p>`:'';}
function showAccount(){
 let d=document.querySelector('#account-dialog');if(!d){d=document.createElement('dialog');d.id='account-dialog';d.className='account-dialog';document.body.append(d);d.addEventListener('click',accountClick);d.addEventListener('submit',authSubmit);d.addEventListener('invalid',event=>{event.preventDefault();const form=d.querySelector('#account-form');if(!form)return;const missing=[...form.querySelectorAll('input')].filter(input=>!input.validity.valid).map(input=>({email:'올바른 이메일 주소',password:'8자 이상의 비밀번호',consent:'학습 정보 저장 동의 체크'})[input.name]).filter(Boolean);const feedback=d.querySelector('#account-feedback');if(feedback){feedback.hidden=false;feedback.textContent=missing.join(', ')+'를 확인해 주세요. 아직 인증 메일은 발송되지 않았습니다.';}},true);}
 const close='<button class="btn secondary" data-cloud="close">닫기 ✕</button>';
 if(user&&!recovery){
  d.innerHTML=`<div class="card-head"><h2>내 계정과 동기화</h2>${close}</div><p class="account-email">${esc(user.email)}</p><p class="note ${errorText?'warning':''}">${esc(status)}${errorText?'<br>'+esc(errorText):''}</p>${messageHTML()}<div class="data-actions"><button class="btn" data-cloud="sync">지금 동기화</button><button class="btn secondary" data-cloud="logout">로그아웃</button>${admin?'<a class="btn secondary" href="./admin.html">운영자 문항 통계 ↗</a>':''}</div><h3>이 브라우저의 기존 기록</h3><p class="helper">로그인 전 기록은 자동으로 섞이지 않습니다. 가져온 풀이 횟수는 개인 이력에만 반영하며 첫 풀이 통계에서 제외합니다. 재전송은 누적되지 않고, 계정에 있는 북마크·메모·같은 학습 내역을 덮어쓰지 않습니다.</p><button class="btn secondary" data-cloud="import">${box.imported?'기존 기록 다시 확인하여 옮기기':'기존 브라우저 기록 옮기기'}</button><p class="helper">원본 기록은 서버 저장 후에도 이 브라우저에 보관합니다.</p>${Object.entries(box.conflicts).map(([key,c])=>`<section class="conflict"><h3>변경 충돌 · ${esc(key)}</h3><p><b>이 기기</b><br>${esc(detail(key,c.local))}</p><p><b>서버</b><br>${esc(detail(key,c.remote?.body))}</p><button class="btn secondary" data-resolve="server" data-key="${esc(key)}">서버 기록 사용</button> <button class="btn" data-resolve="local" data-key="${esc(key)}">내 변경 저장</button></section>`).join('')}${active.length>1?`<h3>진행 중인 다른 학습</h3>${active.map(s=>`<p>${esc(s.label)} · ${Object.keys(s.answers).length}/${s.ids.length} <button class="text-button" data-session="${esc(s.id)}">이어서 풀기</button></p>`).join('')}`:''}<details><summary>저장 정보와 충돌 처리</summary><p>이메일은 로그인에 사용합니다. 문제·시험·과목, 선택한 답, 서버 채점 결과, 응답 시각, 풀이 시간, 학습 모드, 정답·해설 확인 상태, 북마크와 메모, 진행 중인 답안과 완료 기록을 내 계정에 저장합니다. 관리자에게는 개인 이메일·메모 대신 문항별 집계를 제공합니다.</p><p>기록마다 변경 번호를 비교합니다. 같은 메모·북마크·풀이를 다른 기기에서 바꾸면 자동으로 덮어쓰지 않고 선택을 요청합니다. 선택 전 양쪽 내용은 유지하며, 선택 후에도 이 기기에 충돌 백업을 남깁니다. 공유 기기에서는 로그아웃 후 브라우저 데이터를 지우세요.</p><p>직접 불러온 문제는 이 기기에만 보관합니다. 오프라인 응답과 가져온 기존 기록은 첫 풀이 통계에서 제외됩니다. 원문 이미지·해설은 인터넷 연결이 필요할 수 있습니다.</p></details>`;
 }else{
  d.innerHTML=`<div class="card-head"><h2>${recovery?'새 비밀번호 설정':'학습 기록을 계정에 연결'}</h2>${close}</div><p class="subtext">같은 계정으로 PC와 휴대폰에서 학습을 이어가세요.</p>${!recovery?`<div class="account-tabs">${[['login','로그인'],['signup','회원가입'],['reset','비밀번호 찾기']].map(([v,t])=>`<button class="btn ${authTab===v?'':'secondary'}" data-auth-tab="${v}">${t}</button>`).join('')}</div>`:''}${messageHTML()}<p id="account-feedback" class="note warning" role="alert" hidden></p><form id="account-form">${!recovery?'<label>이메일<input name="email" type="email" autocomplete="email" required></label>':''}${recovery||authTab!=='reset'?`<label>${recovery?'새 비밀번호':'비밀번호'}<input name="password" type="password" autocomplete="${authTab==='login'&&!recovery?'current-password':'new-password'}" minlength="8" required></label>`:''}${authTab==='signup'&&!recovery?'<label class="account-consent"><input type="checkbox" name="consent" required> 이메일과 학습 기록을 계정에 저장하고, 이름 없는 문항 통계에 활용하는 것에 동의합니다.</label>':''}<button class="btn full" type="submit">${recovery?'새 비밀번호 저장':{login:'로그인',signup:'인증 메일 받기',reset:'재설정 메일 받기'}[authTab]}</button></form><p class="helper">${authTab==='signup'?'가입 후 이메일의 인증 링크를 눌러 주세요. ':''}8자 이상의 비밀번호를 사용하세요. 비밀번호는 운영자에게 공개되지 않습니다.</p>${!CFG.publicSignupReady?'<p class="note warning">메일 연결 확인 중입니다. 일반 회원가입 공개 전 운영자 계정으로 발송을 검증합니다.</p>':''}`;
 }
 if(!d.open)d.showModal();
}
async function authSubmit(event){
 event.preventDefault();const form=event.target,button=form.querySelector('button[type=submit]'),values=new FormData(form);button.disabled=true;button.textContent='요청 중…';notice='';
 try{
  let r;const email=String(values.get('email')||'').trim(),password=String(values.get('password')||'');
  if(recovery){r=await client.auth.updateUser({password});if(!r.error){recovery=false;notice='비밀번호를 변경했습니다.';}}
  else if(authTab==='login')r=await client.auth.signInWithPassword({email,password});
  else if(authTab==='signup'){
   if(!CFG.publicSignupReady&&email.toLowerCase()!==CFG.adminEmail)throw Error('메일 발송 검증 후 일반 회원가입을 공개합니다.');
   r=await client.auth.signUp({email,password,options:{emailRedirectTo:CFG.redirectUrl,data:{learning_consent:CFG.consentVersion}}});if(!r.error)notice='인증 메일을 확인해 주세요. 받은편지함과 스팸함을 확인한 뒤 링크를 눌러 로그인하세요.';
  }else{r=await client.auth.resetPasswordForEmail(email,{redirectTo:CFG.redirectUrl});if(!r.error)notice='해당 계정으로 재설정 메일을 요청했습니다. 메일의 링크를 눌러 새 비밀번호를 설정하세요.';}
  if(r.error)throw r.error;
  form.reset();showAccount();
 }catch(e){notice=({invalid_credentials:'이메일 또는 비밀번호가 일치하지 않습니다.',email_not_confirmed:'이메일 인증을 먼저 완료해 주세요.',over_email_send_rate_limit:'메일 발송 한도에 도달했습니다. 잠시 후 다시 시도해 주세요.',weak_password:'다른 사람이 추측하기 어려운 비밀번호를 사용해 주세요.',unexpected_failure:'메일 발송 또는 가입 처리에 실패했습니다. 운영자가 메일 발송 설정을 확인해야 합니다.'})[e.code]||safeError(e);showAccount();}
}
async function accountClick(e){
 const b=e.target.closest('button');if(!b)return;
 if(b.dataset.authTab){authTab=b.dataset.authTab;notice='';showAccount();return;}
 b.disabled=true;
 try{
  if(b.dataset.resolve)await resolve(b.dataset.key,b.dataset.resolve);
  else if(b.dataset.session){const s=active.find(s=>s.id===b.dataset.session);box.state.session=clone(s);projection=C.project(box.state,known);persist();bridge?.resume(clone(s));document.querySelector('#account-dialog').close();}
  else switch(b.dataset.cloud){case'close':document.querySelector('#account-dialog').close();break;case'sync':await sync();showAccount();break;case'import':await importGuest();break;case'logout':persist();await client.auth.signOut({scope:'local'});break;}
 }catch(e){notice=safeError(e);showAccount();}finally{b.disabled=false;}
}
async function changed(event,session){
 if(event==='PASSWORD_RECOVERY'){recovery=true;}
 const next=session?.user||null;if(next?.id===user?.id){if(recovery)showAccount();return;}
 generation++;user=next;admin=false;running=null;errorText='';notice='';
 if(user){try{box=JSON.parse(localStorage.getItem(cacheKey(user.id)))||emptyBox();}catch{box=emptyBox();}projection=C.project(box.state,known);bridge?.apply(clone(box.state),true);report('로그인 · 기록 불러오는 중');await sync();try{admin=(await rpc('trainer_account_info',{})).isAdmin;}catch{} }
 else {box=null;projection={};active=[];report('기기에 저장 · 로그인 안 됨');const guest=JSON.parse(localStorage.getItem(guestKey)||'null')||C.fresh();bridge?.apply(guest,true);}
 if(ready&&(document.querySelector('#account-dialog')?.open||recovery))showAccount();
}
async function init(questions){
 known=new Set(questions.map(q=>q.id));window.TrainerBank=new Map(questions.map(q=>[q.id,q]));
 if(!CFG?.enabled||!window.supabase)return;
 client=supabase.createClient(CFG.url,CFG.publishableKey,{global:{fetch:async(url,options={})=>{const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),15000);try{return await fetch(url,{...options,signal:controller.signal});}finally{clearTimeout(timeout);}}},auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,flowType:'implicit'}});
 // Keep callbacks synchronous; calling Auth methods inside a callback may deadlock the SDK.
 client.auth.onAuthStateChange((event,s)=>{setTimeout(()=>changed(event,s),0);});
 const {data}=await client.auth.getSession();await changed('INITIAL_SESSION',data.session);ready=true;
 document.querySelector('#cloud-account')?.addEventListener('click',showAccount);paintStatus();
 window.addEventListener('online',()=>sync());window.addEventListener('offline',()=>report(user?'오프라인 · 기기에 임시 저장':'기기에 저장'));
 window.addEventListener('focus',()=>{if(!document.querySelector('#account-dialog')?.open)sync();});
 window.addEventListener('storage',e=>{if(user&&e.key===cacheKey(user.id)){report('다른 탭에서 변경됨 · 새로고침 필요');bridge?.lock('같은 계정의 다른 탭에서 기록을 바꿨습니다. 새로고침하여 최신 기록을 불러와 주세요.');}});
}
window.TrainerCloud={init,saveState,submitAnswers,markSeen,sync,showAccount,importState,
 readState:()=>user?clone(box.state):JSON.parse(localStorage.getItem(guestKey)||'null'),
 attach:b=>{bridge=b;if(recovery)showAccount();},
 loggedIn:()=>!!user,client:()=>client,isAdmin:()=>admin,
 reset:async exam=>{if(!user)return true;if(!await sync())throw Error('동기화를 마친 뒤 초기화해 주세요.');await rpc('trainer_reset_exam',{p_exam:exam,p_operation:id()});box.queue=[];await pull();return true;}
};
})();
