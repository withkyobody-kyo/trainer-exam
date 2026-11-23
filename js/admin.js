'use strict';
(async()=>{
 const $=s=>document.querySelector(s),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let result=null,questions=[];
 const status=s=>{$('#stats-status').textContent=s;};
 function paint(){if(!result)return;let rows=result.rows;const mode=$('#stats-display').value;
 if(mode==='enough')rows=rows.filter(r=>r.respondents>=result.minimum);
 if(mode==='low')rows=rows.filter(r=>r.respondents>=result.minimum&&r.first_rate!==null&&r.first_rate<50);
 $('#stats-table').innerHTML=rows.length?`<table class="admin-table"><thead><tr><th>문항</th><th>내용 난이도</th><th>유효 응답자</th><th>첫 풀이 정답률</th><th>선택지별 응답 비율</th><th>시간 중앙값</th><th>반복·열람 후 응답</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(r.question_id)}<small>${esc(r.subject)} · ${r.year||'창작'} · ${esc(r.question_type)}</small></td><td>${esc(r.difficulty)}<small>내용 기준 예상</small></td><td>${r.respondents}명${r.respondents<result.minimum?'<small>통계 부족</small>':''}</td><td>${r.first_rate===null?'—':r.first_rate+'%'}${r.respondents<result.minimum?'<small>참고용</small>':''}</td><td>${r.choices.map((n,i)=>`${i+1}번 ${r.respondents?(100*n/r.respondents).toFixed(1)+'%':'—'} (${n}명)`).join('<br>')}</td><td>${r.median_ms===null?'—':(r.median_ms/1000).toFixed(1)+'초'}</td><td>${r.repeat_count}회<small>정답률 ${r.repeat_rate===null?'—':r.repeat_rate+'%'}</small></td></tr>`).join('')}</tbody></table>`:'<p class="admin-empty">선택한 조건에 해당하는 문항이 없습니다.</p>';
 status(`${rows.length.toLocaleString('ko-KR')}문항 · 최소 ${result.minimum}명 기준 · ${new Date(result.generatedAt).toLocaleString('ko-KR')} 조회`);
 }
 async function load(){
  if(!TrainerCloud.loggedIn()){status('관리자 계정으로 로그인해 주세요.');TrainerCloud.showAccount();return;}
  status('관리자 권한 확인 및 통계 조회 중…');$('#stats-table').replaceChildren();
  const f=new FormData($('#stats-form'));
  const {data,error}=await TrainerCloud.client().rpc('trainer_admin_stats',{p_exam:f.get('exam')||null,p_subject:f.get('subject')||null,p_year:f.get('year')?Number(f.get('year')):null,p_type:f.get('type')||null});
  if(error){status(error.code==='42501'?'관리자 권한이 있는 계정만 조회할 수 있습니다.':'통계를 불러오지 못했습니다. 연결과 로그인을 확인해 주세요.');return;}
  result=data;$('[name=minimum]').value=data.minimum;paint();
 }
 function subjects(){const ex=$('[name=exam]').value;$('[name=subject]').innerHTML='<option value="">전체 과목</option>'+[...new Set(questions.filter(q=>!ex||q.exam===ex).map(q=>q.subject))].map(s=>`<option>${esc(s)}</option>`).join('');}
 $('#stats-form').addEventListener('submit',e=>{e.preventDefault();load();});$('[name=exam]').addEventListener('change',subjects);$('#stats-display').addEventListener('change',paint);
 $('#minimum-form').addEventListener('submit',async e=>{e.preventDefault();const {error}=await TrainerCloud.client().rpc('trainer_admin_minimum',{p_minimum:Number($('[name=minimum]').value)});if(error){status('기준을 저장하지 못했습니다. 관리자 권한과 입력값을 확인해 주세요.');return;}await load();});
 try{questions=(await Promise.all(['health','sports'].map(async ex=>{const r=await fetch('./data/'+ex+'.json');if(!r.ok)throw Error();return r.json();}))).flat();subjects();$('[name=year]').innerHTML+=[...new Set(questions.map(q=>q.year).filter(Boolean))].sort((a,b)=>b-a).map(y=>`<option>${y}</option>`).join('');await TrainerCloud.init(questions);if(TrainerCloud.loggedIn())await load();else status('관리자 계정으로 로그인한 뒤 통계 조회를 눌러 주세요.');}catch{status('화면을 준비하지 못했습니다. 연결을 확인하고 새로고침해 주세요.');}
})();
