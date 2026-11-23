/* A compact view over existing records, history and plain-text notes. */
let wrongSubject='all',wrongSort='priority',wrongCount=5,wrongSelected=new Set(),wrongReturnId='',wrongScroll=0,reviewOrigin='result';
let wrongMoreOpen=false,wrongFrequent=false,wrongSelectMode=false,wrongUnit='all',wrongReason='all',wrongOriginalOpen=false;
const wrongSortLabels={priority:'추천 순',wrong:'많이 틀린 순',recent:'최근 풀이 순',oldest:'오래된 풀이 순'};
function resetWrongFilters(){
 wrongSubject='all';wrongSort='priority';wrongCount=5;wrongSelected.clear();
 wrongMoreOpen=false;wrongFrequent=false;wrongSelectMode=false;wrongUnit='all';wrongReason='all';
 listFilter='ready';listSearch='';listDifficulty='all';listPage=1;
}
function wrongOptions(){return {status:listFilter,subject:wrongSubject,difficulty:listDifficulty,search:listSearch,sort:wrongSort,repeated:wrongFrequent,unit:wrongUnit,reason:wrongReason};}
function wrongRows(){return ReviewCore.rows(BANK,state,wrongOptions());}
function wrongTitle(q){return q.year?`${q.year}년 기출 · ${q.number}번`:q.stem;}
function wrongDate(at){return Number(at)>0?day(at):'날짜 기록 없음';}
function wrongStatus(r){return !r.resolved?'<span class="wn-status pending">↺ 미해결</span>':ReviewCore.isDue(r)?'<span class="wn-status revisit">◷ 다시 점검</span>':'<span class="wn-status done">✓ 완료</span>';}
function wrongAdvancedLabels(){return [wrongUnit!=='all'?'단원: '+wrongUnit:'',wrongReason!=='all'?'오답 사유: '+(wrongReason==='none'?'미선택':wrongReason):'',listDifficulty!=='all'?'난이도 '+listDifficulty:'',wrongFrequent?'2회 이상 오답':'',wrongSort!=='priority'?wrongSortLabels[wrongSort]:'',wrongCount!==5?(wrongCount==='all'?'전체 문항씩':wrongCount+'문항씩'):''].filter(Boolean);}
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
   <label>단원<select id="wrong-unit"><option value="all">전체 단원</option>${[...new Set(ReviewCore.rows(BANK,state,{status:'all',subject:wrongSubject}).map(q=>q.unit))].sort().map(unit=>`<option value="${esc(unit)}" ${wrongUnit===unit?'selected':''}>${esc(unit)}</option>`).join('')}</select></label>
   <label>오답 사유<select id="wrong-reason-filter">${[['all','전체 사유'],['none','아직 미선택'],...ReviewCore.reasons.map(x=>[x,x])].map(([value,label])=>`<option value="${value}" ${wrongReason===value?'selected':''}>${label}</option>`).join('')}</select></label>
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
 const r=state.records[q.id],note=ReviewCore.noteParts(state.notes[q.id]||''),t=ReviewCore.template(state.notes[q.id]||'');
 return `<article class="wn-row ${wrongSelected.has(q.id)?'picked':''}" id="wrong-card-${esc(q.id)}">
  ${wrongSelectMode?`<label class="wn-pick"><input type="checkbox" data-wrong-select="${esc(q.id)}" ${wrongSelected.has(q.id)?'checked':''} aria-label="${esc(q.subject+' '+wrongTitle(q))} 선택"></label>`:''}
  <div class="wn-row-main"><div class="wn-meta"><span>${esc(q.subject)}</span><span>${q.year?'기출':'창작 예상'}</span><span>난이도 ${esc(Core.normalizeDifficulty(q.difficulty))}</span></div>
   <h2>${esc(wrongTitle(q))}</h2>
   <div class="wn-record"><span>오답 <b>${r.wrong}회</b></span><span>${wrongDate(r.lastAt)} 풀이</span>${wrongStatus(r)}</div>
   ${note.reason||note.text?`<p class="wn-note-preview"><span>메모</span>${esc([note.reason,t.action||t.intent||t.memo||note.text].filter(Boolean).join(' · '))}</p>`:''}
  </div><div class="wn-row-actions"><button class="wn-note-button" data-wrong-open="${esc(q.id)}">오답 정리</button><button class="btn secondary" data-wrong-practice="${esc(q.id)}">다시 풀기</button></div>
 </article>`;
}
function wrongEmpty(counts){
 if(!counts.all)return `<div class="wn-empty"><span class="wn-empty-icon" aria-hidden="true">✓</span><h2>아직 오답이 없어요</h2><p>문제를 풀면 틀린 문항을 여기에 모아드려요.</p><button class="btn" data-nav="home">문제 풀러 가기</button></div>`;
 if(listFilter==='ready'&&wrongSubject==='all'&&listDifficulty==='all'&&!listSearch&&!wrongFrequent&&wrongUnit==='all'&&wrongReason==='all'&&!counts.ready)return `<div class="wn-empty"><span class="wn-empty-icon" aria-hidden="true">✓</span><h2>지금 복습할 문제를 모두 풀었어요</h2><p>맞힌 문제는 3일 뒤에 다시 점검해 보세요.</p><button class="btn secondary" data-wrong-status="all">전체 오답 보기</button></div>`;
 if(listFilter==='complete'&&wrongSubject==='all'&&listDifficulty==='all'&&!listSearch&&!wrongFrequent&&wrongUnit==='all'&&wrongReason==='all'&&counts.done-counts.due===0)return `<div class="wn-empty"><h2>${counts.done?'다시 점검할 시간이 됐어요':'아직 완료한 문제가 없어요'}</h2><p>${counts.done?'완료했던 문제가 다시 풀기 목록으로 돌아왔어요.':'오답을 다시 맞히면 이곳에서 확인할 수 있어요.'}</p><button class="btn secondary" data-wrong-status="ready">다시 풀 문제 보기</button></div>`;
 return `<div class="wn-empty"><h2>조건에 맞는 문제가 없어요</h2><p>검색어나 필터를 바꿔보세요.</p><button class="btn secondary" data-wrong-reset>필터 초기화</button></div>`;
}
function updateWrongSelection(){
 const rows=wrongRows(),all=$('#wrong-select-all'),button=$('#wrong-primary'),count=wrongPracticeCount(rows);
 if(all){all.checked=rows.length>0&&rows.every(q=>wrongSelected.has(q.id));all.indeterminate=wrongSelected.size>0&&!all.checked;}
 if(button){button.disabled=!count;button.textContent=count?count+'문항 복습':wrongSelectMode?'문제를 선택하세요':'복습할 문제가 없어요';button.setAttribute('aria-label',count?(wrongSelectMode?'선택한 ':'')+count+'문항 복습 시작':'복습할 문제 없음');}
 if($('#wrong-selected-count'))$('#wrong-selected-count').textContent=wrongSelected.size+'문항 선택';
}
function wrongFilterChanged(focus){wrongSelected.clear();listPage=1;render();if(focus)$(focus)?.focus();}
function openWrongAnalysis(id){wrongOriginalOpen=false;const rows=wrongRows();reviewSession={ids:rows.map(q=>q.id),answers:ReviewCore.lastWrongAnswers(state,rows)};reviewIndex=reviewSession.ids.indexOf(id);if(reviewIndex<0)return;wrongReturnId=id;wrongScroll=window.scrollY;reviewOrigin='wrong';view='review';render();window.scrollTo({top:0});$('#main').focus({preventScroll:true});}
function returnWrong(){view='wrong';render();window.scrollTo({top:wrongScroll});document.getElementById('wrong-card-'+wrongReturnId)?.querySelector('[data-wrong-open]')?.focus({preventScroll:true});}
function startWrong(kind,id){
 if(cloudAction)return;
 let rows=kind==='single'?[BYID.get(id)].filter(Boolean):wrongRows();
 if(kind!=='single'){if(wrongSelectMode)rows=rows.filter(q=>wrongSelected.has(q.id));else if(wrongCount!=='all')rows=rows.slice(0,wrongCount);}
 begin(rows.map(q=>q.id),'review','오답 복습');
}
function reflectionWrongChoice(q,s){const answer=s?.answers?.[q.id],verified=Object.prototype.hasOwnProperty.call(s?.serverVerdicts||{},q.id);if(answer&&(verified?s.serverVerdicts[q.id]===false:q.answer?.length&&!q.answer.includes(answer)))return answer;return ReviewCore.lastWrongAnswers(state,[q])[q.id]||null;}
function reflectionEditor(q,s,e=ExplanationLibrary.get(q)){
 const t=ReviewCore.template(state.notes[q.id]||''),suggested=ReviewCore.suggestions(q,e),wrong=reflectionWrongChoice(q,s),key=String(wrong||'unknown'),r=state.records[q.id]||{},oldChoices=Object.keys(t.wrongReasons).filter(k=>k!==key),intent=t.intent??suggested.intent,wrongText=t.wrongReasons[key]??(wrong?suggested.choices[wrong-1]||'':''),right=t.rightReason??suggested.rightReason;
 const field=(name,value,label,placeholder='',extra='')=>`<label class="wt-field">${label?`<span>${label}</span>`:''}<textarea data-template-field="${name}" data-note-id="${esc(q.id)}" ${extra} rows="2" maxlength="10000" placeholder="${esc(placeholder)}">${esc(value)}</textarea></label>`;
 const choice=n=>q.pageId?`${n}번 선택지`:q.choices[n-1];
 return `<section class="wt-paper" aria-label="4단계 오답 정리"><header class="wt-title"><div><h2>4단계 압축 노트</h2><p>핵심을 이해하고, 다음 풀이의 기준을 남겨요.</p></div><span id="note-save-status" class="saved-indicator" role="status">자동 저장</span></header>
 <div class="wt-step"><div class="wt-step-name"><span>1단계</span><h3>메타 태그</h3></div><div class="wt-content"><div class="wt-tags"><span>${esc(q.subject)}</span><span>${esc(q.unit||'단원 미분류')}</span><span>오답 ${r.wrong||0}회</span></div><fieldset class="wt-reasons"><legend>오답 사유 <small>선택한 태그를 다시 누르면 해제됩니다</small></legend><div class="wn-reasons">${ReviewCore.reasons.map(reason=>`<button type="button" data-wrong-reason="${reason}" data-note-id="${esc(q.id)}" aria-pressed="${t.reason===reason}" class="${t.reason===reason?'selected':''}">${reason}</button>`).join('')}</div></fieldset></div></div>
 <div class="wt-step"><div class="wt-step-name"><span>2단계</span><h3>1줄 출제 의도</h3></div><div class="wt-content">${field('intent',intent,'이 문제가 묻는 핵심 이론','핵심 이론을 한 문장으로 정리해 보세요.')}<p class="wt-hint">${t.intent!==null?'내가 정리한 핵심입니다.':e.loading?'해설을 불러오고 있습니다. 직접 먼저 적어도 저장됩니다.':suggested.available?'기존 해설을 바탕으로 표시한 학습용 정리입니다. 공식 출제 의도가 아닙니다.':suggested.intent?'기존 문항 검토 내용을 표시했습니다. 원문을 확인하고 다듬어 주세요.':'등록된 핵심 해설이 없습니다. 원문을 확인하고 직접 정리해 주세요.'}</p><fieldset class="wt-keywords"><legend>필수 키워드 3개 <small>직접 골라 적기</small></legend><div>${t.keywords.map((word,i)=>`<label><span class="wn-sr-only">핵심 키워드 ${i+1}</span><input type="text" data-template-field="keyword" data-key="${i}" data-note-id="${esc(q.id)}" value="${esc(word)}" maxlength="80" placeholder="키워드 ${i+1}"></label>`).join('')}</div></fieldset></div></div>
 <div class="wt-step"><div class="wt-step-name"><span>3단계</span><h3>결정적 차이</h3><p>두 답의 차이 대조하기</p></div><div class="wt-content">${q.source.status==='preliminary'?'<p class="wt-caution">정답 가안 기준입니다. 최종 정답과 대조해 주세요.</p>':''}${e.status==='needs_review'?'<p class="wt-caution">추가 검토가 필요한 해설입니다. 원문·참고 자료와 대조해 주세요.</p>':''}<div class="wt-contrast"><div class="wt-answer wt-wrong"><h4>✕ 내가 고른 답${wrong?' · '+wrong+'번':''}</h4><p class="wt-choice">${wrong?esc(choice(wrong)):'이전 선택 답안 기록 없음'}</p>${field('wrongReason',wrongText,'이 답이 틀린 이유',wrong?'어떤 조건이나 개념을 놓쳤는지 적어보세요.':'선택 답안을 추정하지 않습니다. 기억나는 실수만 적어보세요.',`data-key="${key}"`)}<span class="wt-origin">${Object.hasOwn(t.wrongReasons,key)?'내가 정리한 이유':wrong&&suggested.choices.length?'기존 선택지 해설 · 수정 가능':'직접 작성'}</span></div><div class="wt-answer wt-right"><h4>○ 정답${q.answer?.length?' · '+q.answer.join(', ')+'번':''}</h4><p class="wt-choice">${q.answer?.length?q.answer.map(n=>esc(choice(n))).join(' / '):'정답 미확인'}</p>${field('rightReason',right,'정답이 맞는 근거','정답을 결정하는 조건이나 원리를 적어보세요.')}<span class="wt-origin">${t.rightReason!==null?'내가 정리한 근거':suggested.available?'기존 선택지 해설 · 수정 가능':'등록된 선택지 해설 없음 · 직접 작성'}</span></div></div>${!suggested.available?`<p class="wt-hint">${e.loading?'선택지 해설을 불러오는 중입니다.':e.loadError?'해설 연결을 확인해 주세요. 아래 전체 해설에서 다시 불러올 수 있습니다.':'선택지 해설이 등록되지 않은 문항입니다. 원문과 정답표를 확인하며 직접 정리해 주세요.'}</p>`:''}${oldChoices.length?`<details class="wt-previous"><summary>다른 답을 골랐을 때의 정리 ${oldChoices.length}개</summary>${oldChoices.map(k=>field('wrongReason',t.wrongReasons[k],k==='unknown'?'선택 답안이 남아 있지 않았을 때':k+'번을 골랐을 때의 오답 이유','',`data-key="${esc(k)}"`)).join('')}</details>`:''}</div></div>
 <div class="wt-step"><div class="wt-step-name"><span>4단계</span><h3>행동 규칙</h3></div><div class="wt-content">${field('action',t.action,'다음에 안 틀리기 위한 나의 한 줄','예: 계산 전에 단위를 맞추고, 묻는 조건에 밑줄을 긋는다.')}<p class="wt-hint">‘더 열심히’보다 다음 문제에서 바로 할 수 있는 행동으로 적어보세요.</p></div></div>
 <details class="wt-legacy"><summary>${t.memo?'이전 메모·추가 메모':'추가 메모'}</summary>${field('memo',t.memo,'자유 메모','기존 메모는 여기에 그대로 보관됩니다.')}<p class="wt-hint">기존 메모는 자동으로 바꾸거나 삭제하지 않습니다.</p></details><p class="wt-foot">입력 내용은 자동 저장됩니다. 직접 쓴 내용은 개인 학습 메모이며 문제의 정답·해설 원본은 바뀌지 않습니다.</p>
 </section>`;
}
function updateReflectionField(el){
 const id=el.dataset.noteId;try{state.notes[id]=ReviewCore.updateTemplate(state.notes[id]||'',el.dataset.templateField,el.value,el.dataset.key);el.removeAttribute('aria-invalid');const origin=el.closest('.wt-answer')?.querySelector('.wt-origin');if(origin)origin.textContent=el.dataset.templateField==='wrongReason'?'내가 정리한 이유':'내가 정리한 근거';if(el.dataset.templateField==='intent')el.closest('.wt-content').querySelector('.wt-hint').textContent='내가 정리한 핵심입니다.';if($('#note-save-status'))$('#note-save-status').textContent='저장 중…';saveReflection();}
 catch(error){el.setAttribute('aria-invalid','true');if($('#note-save-status'))$('#note-save-status').textContent='저장되지 않음 · 내용을 줄여 주세요';toast(error.message);}
}
function saveReflection(){clearTimeout(saveTimer);saveTimer=setTimeout(()=>{const ok=save();if($('#note-save-status'))$('#note-save-status').textContent=ok?($('[data-template-field][aria-invalid="true"]')?'일부 내용 미저장 · 내용을 줄여 주세요':window.TrainerCloud?.loggedIn()?'기기에 저장 · 전송 상태는 상단 확인':'✓ 저장됨'):'저장하지 못했어요';},250);}
document.addEventListener('click',e=>{
 const b=e.target.closest('button');if(!b||b.disabled)return;
 if(b.dataset.wrongStatus){listFilter=b.dataset.wrongStatus;wrongFilterChanged();$$('[data-wrong-status]').find(x=>x.dataset.wrongStatus===listFilter)?.focus();}
 if(b.hasAttribute('data-wrong-more')){wrongMoreOpen=!wrongMoreOpen;render();$('[data-wrong-more]')?.focus();}
 if(b.hasAttribute('data-wrong-reset')){const status=listFilter;resetWrongFilters();listFilter=status;render();$('#wrong-search')?.focus();}
 if(b.hasAttribute('data-wrong-select-mode')){wrongSelectMode=!wrongSelectMode;wrongSelected.clear();render();$('[data-wrong-select-mode]')?.focus();}
 if(b.dataset.wrongStart)startWrong(b.dataset.wrongStart);
 if(b.dataset.wrongOpen)openWrongAnalysis(b.dataset.wrongOpen);
 if(b.dataset.wrongPractice)startWrong('single',b.dataset.wrongPractice);
 if(b.dataset.wrongReason){const id=b.dataset.noteId,t=ReviewCore.template(state.notes[id]||''),reason=t.reason===b.dataset.wrongReason?'':b.dataset.wrongReason;try{state.notes[id]=ReviewCore.updateTemplate(state.notes[id]||'','reason',reason);$$('[data-wrong-reason]').forEach(x=>{const selected=x.dataset.wrongReason===reason;x.classList.toggle('selected',selected);x.setAttribute('aria-pressed',String(selected));});if($('#note-save-status'))$('#note-save-status').textContent='저장 중…';saveReflection();}catch(error){toast(error.message);}}

});
document.addEventListener('change',e=>{const el=e.target;
 if(el.dataset.wrongSelect){if(el.checked)wrongSelected.add(el.dataset.wrongSelect);else wrongSelected.delete(el.dataset.wrongSelect);el.closest('.wn-row').classList.toggle('picked',el.checked);updateWrongSelection();}
 if(el.id==='wrong-select-all'){wrongSelected=el.checked?new Set(wrongRows().map(q=>q.id)):new Set();$$('[data-wrong-select]').forEach(x=>{x.checked=wrongSelected.has(x.dataset.wrongSelect);x.closest('.wn-row').classList.toggle('picked',x.checked);});updateWrongSelection();}
 if(el.id==='wrong-subject'){wrongSubject=el.value;wrongUnit='all';wrongFilterChanged('#wrong-subject');}
 if(el.id==='wrong-unit'){wrongUnit=el.value;wrongFilterChanged('#wrong-unit');}
 if(el.id==='wrong-reason-filter'){wrongReason=el.value;wrongFilterChanged('#wrong-reason-filter');}
 if(el.id==='wrong-difficulty'){listDifficulty=el.value;wrongFilterChanged('#wrong-difficulty');}
 if(el.id==='wrong-sort'){wrongSort=el.value;wrongFilterChanged('#wrong-sort');}
 if(el.id==='wrong-repeated'){wrongFrequent=el.checked;wrongFilterChanged('#wrong-repeated');}
 if(el.id==='wrong-count-select'){wrongCount=el.value==='all'?'all':Number(el.value);render();$('#wrong-count-select')?.focus();}
});
document.addEventListener('input',e=>{const el=e.target;
 if(el.id==='wrong-search'){listSearch=el.value;const pos=el.selectionStart;wrongFilterChanged('#wrong-search');try{$('#wrong-search').setSelectionRange(pos,pos);}catch(_){}}
 if(el.dataset.templateField)updateReflectionField(el);
});
document.addEventListener('toggle',e=>{if(e.target.id==='wrong-original')wrongOriginalOpen=e.target.open;},true);
function wrongAnalysisPage(){
 const s=reviewSession,q=s&&BYID.get(s.ids[reviewIndex]);if(!q)return empty('검토할 문제가 없습니다','오답노트에서 문제를 선택해 주세요.');
 const r=state.records[q.id],e=ExplanationLibrary.get(q);return `<div class="wn-analysis-head"><button class="wn-back" data-action="back-result">오답 목록</button><span>${reviewIndex+1} / ${s.ids.length}</span></div><div class="wn-analysis-context"><div><h1>오답 정리</h1><p>${wrongStatus(r)}<span>${esc(q.year?q.year+'년 기출 · '+q.number+'번':q.unit)}</span></p></div><button class="btn" data-wrong-practice="${esc(q.id)}">다시 풀기</button></div>${reflectionEditor(q,s,e)}<details class="wt-original" id="wrong-original" ${wrongOriginalOpen?'open':''}><summary>문제·전체 해설 보기</summary><section class="question-card">${questionBody(q,s,true)}${explanation(q,s,false)}</section></details><div class="study-footer"><button class="btn secondary" data-review-jump="${reviewIndex-1}" ${reviewIndex===0?'disabled':''}>이전 문제</button><button class="btn" data-review-jump="${reviewIndex+1}" ${reviewIndex===s.ids.length-1?'disabled':''}>다음 문제</button></div>`;
}
function wrongResultSummary(h){if(h.mode!=='review'||!h.label.includes('오답'))return '';return `<section class="wn-result-summary"><div><h2>${h.summary.correct}문항을 다시 맞혔어요</h2><p>이전 오답 이력과 메모는 그대로 남습니다.</p></div><button class="btn" data-nav="wrong">오답노트로</button></section>`;}
