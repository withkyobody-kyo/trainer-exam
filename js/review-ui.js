/* A compact view over existing records, history and plain-text notes. */
let wrongSubject='all',wrongSort='priority',wrongCount=5,wrongSelected=new Set(),wrongReturnId='',wrongScroll=0,reviewOrigin='result';
let wrongMoreOpen=false,wrongFrequent=false,wrongSelectMode=false;
const wrongSortLabels={priority:'추천 순',wrong:'많이 틀린 순',recent:'최근 풀이 순',oldest:'오래된 풀이 순'};
function resetWrongFilters(){
 wrongSubject='all';wrongSort='priority';wrongCount=5;wrongSelected.clear();
 wrongMoreOpen=false;wrongFrequent=false;wrongSelectMode=false;
 listFilter='ready';listSearch='';listDifficulty='all';listPage=1;
}
function wrongOptions(){return {status:listFilter,subject:wrongSubject,difficulty:listDifficulty,search:listSearch,sort:wrongSort,repeated:wrongFrequent};}
function wrongRows(){return ReviewCore.rows(BANK,state,wrongOptions());}
function wrongTitle(q){return q.year?`${q.year}년 기출 · ${q.number}번`:q.stem;}
function wrongDate(at){return Number(at)>0?day(at):'날짜 기록 없음';}
function wrongStatus(r){return !r.resolved?'<span class="wn-status pending">↺ 미해결</span>':ReviewCore.isDue(r)?'<span class="wn-status revisit">◷ 다시 점검</span>':'<span class="wn-status done">✓ 완료</span>';}
function wrongAdvancedLabels(){return [listDifficulty!=='all'?'난이도 '+listDifficulty:'',wrongFrequent?'2회 이상 오답':'',wrongSort!=='priority'?wrongSortLabels[wrongSort]:'',wrongCount!==5?(wrongCount==='all'?'전체 문항씩':wrongCount+'문항씩'):''].filter(Boolean);}
function wrongPracticeCount(rows=wrongRows()){return wrongSelectMode?wrongSelected.size:Math.min(rows.length,wrongCount==='all'?rows.length:wrongCount);}
function wrongNotebook(){
 const counts=ReviewCore.summary(BANK,state),rows=wrongRows(),valid=new Set(rows.map(q=>q.id));
 wrongSelected=new Set([...wrongSelected].filter(id=>valid.has(id)));
 listPage=Math.max(1,Math.min(listPage,Math.ceil(rows.length/12)||1));
 const shown=rows.slice((listPage-1)*12,listPage*12),labels=wrongAdvancedLabels(),count=wrongPracticeCount(rows);
 return `<section class="wrong-notebook" aria-label="오답노트">
  <header class="wn-heading"><div><h1>오답노트</h1><p>틀린 문제를 다시 풀고, 핵심만 남겨요.</p></div>
   ${counts.all?`<button id="wrong-primary" class="btn" data-wrong-start="current" ${count?'':'disabled'}>${count?count+'문항 복습':'문제를 선택하세요'}</button>`:''}
  </header>
  <div class="wn-exams" role="group" aria-label="시험 선택">${['health','sports'].map(ex=>`<button data-exam="${ex}" class="${state.exam===ex?'selected':''}" aria-pressed="${state.exam===ex}">${esc(CONFIG[ex].name)}</button>`).join('')}</div>
  <div class="wn-tabs" role="group" aria-label="복습 상태">${[['ready','다시 풀기',counts.ready],['complete','완료',counts.done-counts.due],['all','전체',counts.all]].map(([value,label,n])=>`<button data-wrong-status="${value}" class="${listFilter===value?'selected':''}" aria-pressed="${listFilter===value}">${label}<span>${n}</span></button>`).join('')}</div>
  ${counts.all?`<div class="wn-tools">
   <label class="wn-subject"><span class="wn-sr-only">과목</span><select id="wrong-subject"><option value="all">전체 과목</option>${cfg().subjects.map(sub=>`<option value="${esc(sub)}" ${wrongSubject===sub?'selected':''}>${esc(sub)}</option>`).join('')}</select></label>
   <label class="wn-search"><span class="wn-sr-only">문제·메모 검색</span><input id="wrong-search" type="search" value="${esc(listSearch)}" placeholder="문제·메모 검색"></label>
   <button class="wn-filter-toggle ${labels.length?'applied':''}" data-wrong-more aria-expanded="${wrongMoreOpen}" aria-controls="wrong-filter-panel">필터${labels.length?' · '+labels.length:''}<svg aria-hidden="true" viewBox="0 0 16 16"><path d="M2 4h12M4 8h8M6 12h4"/></svg></button>
  </div>
  <div id="wrong-filter-panel" class="wn-filter-panel" ${wrongMoreOpen?'':'hidden'}>
   <label>난이도<select id="wrong-difficulty">${['all',...Core.difficultyLevels].map(d=>`<option value="${d}" ${listDifficulty===d?'selected':''}>${d==='all'?'전체 난이도':'난이도 '+d}</option>`).join('')}</select></label>
   <label>정렬<select id="wrong-sort">${Object.entries(wrongSortLabels).map(([v,t])=>`<option value="${v}" ${wrongSort===v?'selected':''}>${t}</option>`).join('')}</select></label>
   <label>한 번에 풀 문제<select id="wrong-count-select">${[5,10,20,'all'].map(n=>`<option value="${n}" ${wrongCount===n?'selected':''}>${n==='all'?'전체':n+'문항'}</option>`).join('')}</select></label>
   <label class="wn-repeat"><input type="checkbox" id="wrong-repeated" ${wrongFrequent?'checked':''}>2회 이상 틀린 문제만</label>
  </div>
  ${labels.length?`<div class="wn-applied"><span>${labels.map(esc).join(' · ')}</span><button data-wrong-reset>초기화</button></div>`:''}
  <div class="wn-list-tools">
   ${wrongSelectMode?`<label class="wn-select-all"><input type="checkbox" id="wrong-select-all" ${rows.length?'':'disabled'}>전체 선택</label><span id="wrong-selected-count" role="status">${wrongSelected.size}문항 선택</span>`:`<span class="wn-result-count" role="status">${rows.length}문항${listFilter==='ready'&&wrongSort==='priority'?' · 자주 틀린 문제부터':''}</span>`}
   <button class="wn-select-toggle" data-wrong-select-mode aria-pressed="${wrongSelectMode}">${wrongSelectMode?'선택 취소':'문제 선택'}</button>
  </div>`:''}
  <div class="wn-list">${shown.length?shown.map(q=>wrongCard(q)).join(''):wrongEmpty(counts)}</div>
  ${rows.length>12?`<nav class="pagination" aria-label="오답 목록 페이지"><button class="btn secondary" data-page="${listPage-1}" ${listPage===1?'disabled':''}>이전</button><span>${listPage} / ${Math.ceil(rows.length/12)}</span><button class="btn secondary" data-page="${listPage+1}" ${listPage*12>=rows.length?'disabled':''}>다음</button></nav>`:''}
  ${counts.all?`<details class="wn-help"><summary>복습 기준</summary><p>틀린 문제는 자동으로 모입니다. 다시 맞히면 ‘완료’로 옮겨지고, 3일 뒤 ‘다시 풀기’에 표시됩니다. 이전 오답 횟수와 메모는 계속 남아요.</p><p>3일은 사이트의 권장 간격이며 기기의 날짜를 기준으로 합니다. 해설을 읽는 것만으로 완료 처리하지 않습니다.</p></details>`:''}
 </section>`;
}
function wrongCard(q){
 const r=state.records[q.id],note=ReviewCore.noteParts(state.notes[q.id]||'');
 return `<article class="wn-row ${wrongSelected.has(q.id)?'picked':''}" id="wrong-card-${esc(q.id)}">
  ${wrongSelectMode?`<label class="wn-pick"><input type="checkbox" data-wrong-select="${esc(q.id)}" ${wrongSelected.has(q.id)?'checked':''} aria-label="${esc(q.subject+' '+wrongTitle(q))} 선택"></label>`:''}
  <div class="wn-row-main"><div class="wn-meta"><span>${esc(q.subject)}</span><span>${q.year?'기출':'창작 예상'}</span><span>난이도 ${esc(Core.normalizeDifficulty(q.difficulty))}</span></div>
   <h2>${esc(wrongTitle(q))}</h2>
   <div class="wn-record"><span>오답 <b>${r.wrong}회</b></span><span>${wrongDate(r.lastAt)} 풀이</span>${wrongStatus(r)}</div>
   ${note.reason||note.text?`<p class="wn-note-preview"><span>메모</span>${esc([note.reason,note.text].filter(Boolean).join(' · '))}</p>`:''}
  </div><div class="wn-row-actions"><button class="wn-note-button" data-wrong-open="${esc(q.id)}">해설·메모</button><button class="btn secondary" data-wrong-practice="${esc(q.id)}">다시 풀기</button></div>
 </article>`;
}
function wrongEmpty(counts){
 if(!counts.all)return `<div class="wn-empty"><span class="wn-empty-icon" aria-hidden="true">✓</span><h2>아직 오답이 없어요</h2><p>문제를 풀면 틀린 문항을 여기에 모아드려요.</p><button class="btn" data-nav="home">문제 풀러 가기</button></div>`;
 if(listFilter==='ready'&&wrongSubject==='all'&&listDifficulty==='all'&&!listSearch&&!wrongFrequent&&!counts.ready)return `<div class="wn-empty"><span class="wn-empty-icon" aria-hidden="true">✓</span><h2>지금 복습할 문제를 모두 풀었어요</h2><p>맞힌 문제는 3일 뒤에 다시 점검해 보세요.</p><button class="btn secondary" data-wrong-status="all">전체 오답 보기</button></div>`;
 if(listFilter==='complete'&&wrongSubject==='all'&&listDifficulty==='all'&&!listSearch&&!wrongFrequent&&counts.done-counts.due===0)return `<div class="wn-empty"><h2>${counts.done?'다시 점검할 시간이 됐어요':'아직 완료한 문제가 없어요'}</h2><p>${counts.done?'완료했던 문제가 다시 풀기 목록으로 돌아왔어요.':'오답을 다시 맞히면 이곳에서 확인할 수 있어요.'}</p><button class="btn secondary" data-wrong-status="ready">다시 풀 문제 보기</button></div>`;
 return `<div class="wn-empty"><h2>조건에 맞는 문제가 없어요</h2><p>검색어나 필터를 바꿔보세요.</p><button class="btn secondary" data-wrong-reset>필터 초기화</button></div>`;
}
function updateWrongSelection(){
 const rows=wrongRows(),all=$('#wrong-select-all'),button=$('#wrong-primary'),count=wrongPracticeCount(rows);
 if(all){all.checked=rows.length>0&&rows.every(q=>wrongSelected.has(q.id));all.indeterminate=wrongSelected.size>0&&!all.checked;}
 if(button){button.disabled=!count;button.textContent=count?count+'문항 복습':wrongSelectMode?'문제를 선택하세요':'복습할 문제가 없어요';button.setAttribute('aria-label',count?(wrongSelectMode?'선택한 ':'')+count+'문항 복습 시작':'복습할 문제 없음');}
 if($('#wrong-selected-count'))$('#wrong-selected-count').textContent=wrongSelected.size+'문항 선택';
}
function wrongFilterChanged(focus){wrongSelected.clear();listPage=1;render();if(focus)$(focus)?.focus();}
function openWrongAnalysis(id){const rows=wrongRows();reviewSession={ids:rows.map(q=>q.id),answers:ReviewCore.lastWrongAnswers(state,rows)};reviewIndex=reviewSession.ids.indexOf(id);if(reviewIndex<0)return;wrongReturnId=id;wrongScroll=window.scrollY;reviewOrigin='wrong';view='review';render();window.scrollTo({top:0});$('#main').focus({preventScroll:true});}
function returnWrong(){view='wrong';render();window.scrollTo({top:wrongScroll});document.getElementById('wrong-card-'+wrongReturnId)?.querySelector('[data-wrong-open]')?.focus({preventScroll:true});}
function startWrong(kind,id){
 if(cloudAction)return;
 let rows=kind==='single'?[BYID.get(id)].filter(Boolean):wrongRows();
 if(kind!=='single'){if(wrongSelectMode)rows=rows.filter(q=>wrongSelected.has(q.id));else if(wrongCount!=='all')rows=rows.slice(0,wrongCount);}
 begin(rows.map(q=>q.id),'review','오답 복습');
}
function reflectionEditor(q){const parts=ReviewCore.noteParts(state.notes[q.id]||'');return `<section class="wn-reflection" aria-label="나의 오답 정리"><div class="wn-reflection-title"><h3>나의 오답 메모</h3><span id="note-save-status" class="saved-indicator" role="status"></span></div><fieldset><legend>틀린 이유 <span>선택 사항</span></legend><div class="wn-reasons">${ReviewCore.reasons.map(reason=>`<button type="button" data-wrong-reason="${reason}" data-note-id="${esc(q.id)}" aria-pressed="${parts.reason===reason}" title="선택한 이유를 다시 누르면 해제합니다" class="${parts.reason===reason?'selected':''}">${reason}</button>`).join('')}</div></fieldset><label for="question-note">기억할 핵심</label><textarea id="question-note" class="note-input" data-note-body="${esc(q.id)}" maxlength="10000" placeholder="헷갈린 개념이나 다음에 꼭 기억할 것을 적어보세요.">${esc(parts.text)}</textarea><p>입력하면 자동 저장됩니다.</p></section>`;}
function saveReflection(){clearTimeout(saveTimer);saveTimer=setTimeout(()=>{const ok=save();if($('#note-save-status'))$('#note-save-status').textContent=ok?(window.TrainerCloud?.loggedIn()?'기기에 저장 · 전송 상태는 상단 확인':'✓ 저장됨'):'저장하지 못했어요';},250);}
document.addEventListener('click',e=>{
 const b=e.target.closest('button');if(!b||b.disabled)return;
 if(b.dataset.wrongStatus){listFilter=b.dataset.wrongStatus;wrongFilterChanged();$$('[data-wrong-status]').find(x=>x.dataset.wrongStatus===listFilter)?.focus();}
 if(b.hasAttribute('data-wrong-more')){wrongMoreOpen=!wrongMoreOpen;render();$('[data-wrong-more]')?.focus();}
 if(b.hasAttribute('data-wrong-reset')){const status=listFilter;resetWrongFilters();listFilter=status;render();$('#wrong-search')?.focus();}
 if(b.hasAttribute('data-wrong-select-mode')){wrongSelectMode=!wrongSelectMode;wrongSelected.clear();render();$('[data-wrong-select-mode]')?.focus();}
 if(b.dataset.wrongStart)startWrong(b.dataset.wrongStart);
 if(b.dataset.wrongOpen)openWrongAnalysis(b.dataset.wrongOpen);
 if(b.dataset.wrongPractice)startWrong('single',b.dataset.wrongPractice);
 if(b.dataset.wrongReason){const id=b.dataset.noteId,parts=ReviewCore.noteParts(state.notes[id]||''),reason=parts.reason===b.dataset.wrongReason?'':b.dataset.wrongReason,next=ReviewCore.withReason(state.notes[id]||'',reason);if(next.length>10000){toast('메모가 길어 오답 이유를 추가할 수 없습니다. 메모를 조금 줄여 주세요.');return;}state.notes[id]=next;$$('[data-wrong-reason]').forEach(x=>{const selected=x.dataset.wrongReason===reason;x.classList.toggle('selected',selected);x.setAttribute('aria-pressed',String(selected));});saveReflection();}
});
document.addEventListener('change',e=>{const el=e.target;
 if(el.dataset.wrongSelect){if(el.checked)wrongSelected.add(el.dataset.wrongSelect);else wrongSelected.delete(el.dataset.wrongSelect);el.closest('.wn-row').classList.toggle('picked',el.checked);updateWrongSelection();}
 if(el.id==='wrong-select-all'){wrongSelected=el.checked?new Set(wrongRows().map(q=>q.id)):new Set();$$('[data-wrong-select]').forEach(x=>{x.checked=wrongSelected.has(x.dataset.wrongSelect);x.closest('.wn-row').classList.toggle('picked',x.checked);});updateWrongSelection();}
 if(el.id==='wrong-subject'){wrongSubject=el.value;wrongFilterChanged('#wrong-subject');}
 if(el.id==='wrong-difficulty'){listDifficulty=el.value;wrongFilterChanged('#wrong-difficulty');}
 if(el.id==='wrong-sort'){wrongSort=el.value;wrongFilterChanged('#wrong-sort');}
 if(el.id==='wrong-repeated'){wrongFrequent=el.checked;wrongFilterChanged('#wrong-repeated');}
 if(el.id==='wrong-count-select'){wrongCount=el.value==='all'?'all':Number(el.value);render();$('#wrong-count-select')?.focus();}
});
document.addEventListener('input',e=>{const el=e.target;
 if(el.id==='wrong-search'){listSearch=el.value;const pos=el.selectionStart;wrongFilterChanged('#wrong-search');try{$('#wrong-search').setSelectionRange(pos,pos);}catch(_){}}
 if(el.dataset.noteBody){const id=el.dataset.noteBody,reason=ReviewCore.noteParts(state.notes[id]||'').reason,prefix=reason?'[오답 이유: '+reason+']\n':'';state.notes[id]=prefix+el.value.slice(0,10000-prefix.length);saveReflection();}
});
function wrongAnalysisPage(){
 const s=reviewSession,q=s&&BYID.get(s.ids[reviewIndex]);if(!q)return empty('검토할 문제가 없습니다','오답노트에서 문제를 선택해 주세요.');
 const r=state.records[q.id];return `<div class="wn-analysis-head"><button class="wn-back" data-action="back-result">오답 목록</button><span>${reviewIndex+1} / ${s.ids.length}</span></div><div class="wn-analysis-context"><div><h1>해설·메모</h1><p>${wrongStatus(r)}<span>오답 ${r.wrong}회</span><span>${s.answers[q.id]?'마지막 오답: '+s.answers[q.id]+'번 선택':'이전 선택 답안 없음'}</span></p></div><button class="btn" data-wrong-practice="${esc(q.id)}">다시 풀기</button></div><section class="card question-card">${questionBody(q,s,true)}${explanation(q,s)}<div class="study-footer"><button class="btn secondary" data-review-jump="${reviewIndex-1}" ${reviewIndex===0?'disabled':''}>이전 문제</button><button class="btn" data-review-jump="${reviewIndex+1}" ${reviewIndex===s.ids.length-1?'disabled':''}>다음 문제</button></div></section>`;
}
function wrongResultSummary(h){if(h.mode!=='review'||!h.label.includes('오답'))return '';return `<section class="wn-result-summary"><div><h2>${h.summary.correct}문항을 다시 맞혔어요</h2><p>이전 오답 이력과 메모는 그대로 남습니다.</p></div><button class="btn" data-nav="wrong">오답노트로</button></section>`;}
