'use strict';
const Core = (() => {
 const difficultyLevels=['하','중','상','미분류'];
 const questionTypes=['개념 암기','원리 이해','계산','자료 해석','사례 적용'];
 function normalizeDifficulty(value){const legacy={기초:'하',중급:'중',응용:'상'};return Object.hasOwn(legacy,value)?legacy[value]:(difficultyLevels.includes(value)?value:'미분류');}
 function filterDifficulty(rows,level='all'){return level==='all'?rows:rows.filter(q=>normalizeDifficulty(q.difficulty)===level);}
 function difficultyCounts(rows){const counts=Object.fromEntries(difficultyLevels.map(level=>[level,0]));for(const q of rows)counts[normalizeDifficulty(q.difficulty)]++;return counts;}
 function questionPool(rows,{exam,year='all',type='all',subjects=null,difficulty='all'}={}){
  return filterDifficulty(rows.filter(q=>(!exam||q.exam===exam)&&(year==='all'||q.year===Number(year))&&(type==='all'||q.type===(type==='official'?'공식 기출':'창작 예상문제'))&&(!subjects||subjects.includes(q.subject))),difficulty);
 }
 function validateDifficultyReview(review){
  if(review===undefined)return undefined;
  if(!review||review.basis!=='content'||typeof review.reason!=='string'||!review.reason.trim()||review.reason.length>500||typeof review.reviewedAt!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(review.reviewedAt)||review.rubricVersion!==1)throw Error('difficultyReview에는 basis(content), 500자 이내 reason, reviewedAt(YYYY-MM-DD), rubricVersion(1)이 필요합니다.');
  return {basis:'content',reason:review.reason,reviewedAt:review.reviewedAt,rubricVersion:1};
 }
 const correct=(q,choice)=>Array.isArray(q.answer)&&q.answer.includes(choice);
 const known=q=>Array.isArray(q.answer)&&q.answer.length>0;
 function shuffle(list,rng=Math.random){const a=list.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
 function summarize(questions,answers,verdicts={}){const s={total:questions.length,correct:0,wrong:0,unanswered:0,ungraded:0,gradeable:0,subjects:{}};for(const q of questions){const verified=Object.prototype.hasOwnProperty.call(verdicts,q.id),isKnown=verified?verdicts[q.id]!==null:known(q),isCorrect=verified?verdicts[q.id]===true:correct(q,answers[q.id]);const sub=s.subjects[q.subject]??={total:0,correct:0,wrong:0,unanswered:0,ungraded:0,gradeable:0};sub.total++;if(isKnown){s.gradeable++;sub.gradeable++;}if(!answers[q.id]){s.unanswered++;sub.unanswered++;}else if(!isKnown){s.ungraded++;sub.ungraded++;}else if(isCorrect){s.correct++;sub.correct++;}else{s.wrong++;sub.wrong++;}}s.rate=s.gradeable?Math.round(100*s.correct/s.gradeable):null;return s;}
 function gradeRecord(state,session,q,now){const verified=Object.prototype.hasOwnProperty.call(session.serverVerdicts||{},q.id),isKnown=verified?session.serverVerdicts[q.id]!==null:known(q);if(session.graded[q.id]||!session.answers[q.id]||!isKnown)return false;const ok=verified?session.serverVerdicts[q.id]===true:correct(q,session.answers[q.id]);const r=state.records[q.id]??={exam:q.exam,subject:q.subject,attempts:0,correct:0,wrong:0,resolved:false};r.attempts++;r.correct+=Number(ok);r.wrong+=Number(!ok);r.lastResult=ok;r.lastAt=now;if(!ok){r.firstWrongAt??=now;r.lastWrongAt=now;r.resolved=false;}else if(r.wrong>0){r.resolved=true;r.resolvedAt=now;}session.graded[q.id]=true;return true;}
 function mockQuestions(pool,subjects,count,rng=Math.random){return subjects.flatMap(sub=>shuffle(pool.filter(q=>q.subject===sub&&known(q)),rng).slice(0,count));}
 function validateExplanation(e){
  if(!e||typeof e.summary!=='string'||!e.summary.trim()||e.summary.length>20000||!Array.isArray(e.choices)||![0,4].includes(e.choices.length)||e.choices.some(x=>typeof x!=='string'||x.length>10000))throw Error('explanation에 summary와 choices(4개 또는 미제공 시 빈 배열)가 필요합니다.');
  if(e.keyPoint!==undefined&&(typeof e.keyPoint!=='string'||e.keyPoint.length>5000))throw Error('핵심 정리는 5,000자 이내의 글이어야 합니다.');
  if(e.kind!==undefined&&!['authored','provided','created'].includes(e.kind))throw Error('해설 종류는 authored, provided, created 중 하나여야 합니다.');
  if(e.status!==undefined&&!['draft','reviewed','needs_review'].includes(e.status))throw Error('해설 상태는 draft, reviewed, needs_review 중 하나여야 합니다.');
  if(e.references!==undefined){
   if(!Array.isArray(e.references)||e.references.length>20)throw Error('해설 참고 자료는 20개 이하의 배열이어야 합니다.');
   for(const ref of e.references){
    if(!ref||typeof ref.title!=='string'||!ref.title.trim()||ref.title.length>500||typeof ref.url!=='string'||ref.url.length>2000)throw Error('해설 참고 자료에 제목과 URL이 필요합니다.');
    let url;try{url=new URL(ref.url);}catch{throw Error('해설 참고 자료 URL이 올바르지 않습니다.');}
    if(!['https:','http:'].includes(url.protocol)||url.username||url.password)throw Error('해설 참고 자료는 HTTP 또는 HTTPS 웹 주소여야 합니다.');
   }
  }
  if(e.suggestedAnswer!==undefined&&(!Array.isArray(e.suggestedAnswer)||!e.suggestedAnswer.length||e.suggestedAnswer.length>4||e.suggestedAnswer.some(n=>!Number.isInteger(n)||n<1||n>4)||new Set(e.suggestedAnswer).size!==e.suggestedAnswer.length))throw Error('해설의 추정 정답은 1~4의 번호 배열이어야 합니다.');
  return {summary:e.summary,choices:e.choices.slice(),...(e.keyPoint?{keyPoint:e.keyPoint}:{}),...(e.kind?{kind:e.kind}:{}),...(e.status?{status:e.status}:{}),...(e.references?{references:e.references.map(r=>({title:r.title,url:r.url}))}:{}),...(e.suggestedAnswer?{suggestedAnswer:e.suggestedAnswer.slice()}:{})};
 }
 function validateImport(input,existing,config,existingAssets={}){
  const errors=[],rows=Array.isArray(input)?input:input?.questions,assets=Array.isArray(input)?{}:(input?.pages??{});
  if(!Array.isArray(rows)||!rows.length)throw new Error('questions 배열에 문제를 1개 이상 넣어 주세요.');
  if(rows.length>10000)throw new Error('한 번에 불러올 수 있는 문제는 10,000개입니다.');
  if(!assets||typeof assets!=='object'||Array.isArray(assets))throw new Error('pages는 이미지 ID와 data URL로 이루어진 객체여야 합니다.');
  for(const [id,value] of Object.entries(assets)){if(['__proto__','constructor','prototype'].includes(id)||!/^[A-Za-z0-9_-]{1,120}$/.test(id)||typeof value!=='string'||!/^data:image\/(webp|png|jpeg);base64,[A-Za-z0-9+/]+=*$/.test(value)){errors.push(`이미지 ${id}: PNG·JPEG·WebP의 base64 데이터만 허용됩니다.`);}if(existingAssets[id]&&existingAssets[id]!==value)errors.push(`이미지 ID 중복: ${id}`);}
  const seen=new Set(existing.map(q=>q.id));const clean=[];
  rows.forEach((q,i)=>{const prefix=`${i+1}번째 문제`;if(!q||typeof q!=='object'){errors.push(`${prefix}: 올바른 객체가 아닙니다.`);return;}
   const before=errors.length;
   for(const key of ['id','exam','subject','unit','difficulty','type','stem'])if(typeof q[key]!=='string'||!q[key].trim())errors.push(`${prefix}: ${key} 필드가 필요합니다.`);
   try{validateDifficultyReview(q.difficultyReview);}catch(e){errors.push(`${prefix}: ${e.message}`);}
   if(q.questionTypes!==undefined&&(!Array.isArray(q.questionTypes)||!q.questionTypes.length||q.questionTypes.length>5||q.questionTypes.some(t=>!questionTypes.includes(t))||new Set(q.questionTypes).size!==q.questionTypes.length))errors.push(`${prefix}: questionTypes는 개념 암기·원리 이해·계산·자료 해석·사례 적용 중 중복 없는 배열이어야 합니다.`);
   if(typeof q.id==='string'){if(['__proto__','constructor','prototype'].includes(q.id)||!/^[A-Za-z0-9_-]{1,120}$/.test(q.id))errors.push(`${prefix}: ID는 영문·숫자·밑줄·하이픈만 사용해 주세요.`);if(seen.has(q.id))errors.push(`${prefix}: 중복 ID "${q.id}"입니다.`);seen.add(q.id);}
   if(!['health','sports'].includes(q.exam))errors.push(`${prefix}: exam은 health 또는 sports여야 합니다.`);
   else if(!config[q.exam].subjects.includes(q.subject))errors.push(`${prefix}: 해당 시험의 과목명이 아닙니다 (${q.subject}).`);
   if(!['공식 기출','창작 예상문제'].includes(q.type))errors.push(`${prefix}: type은 공식 기출 또는 창작 예상문제여야 합니다.`);
   if(!Array.isArray(q.choices)||q.choices.length!==4||q.choices.some(x=>typeof x!=='string'||!x.trim()))errors.push(`${prefix}: 비어 있지 않은 선택지 4개가 필요합니다.`);
   const answer=typeof q.answer==='number'?[q.answer]:q.answer;
   if(answer!==null&&(!Array.isArray(answer)||!answer.length||answer.length>4||answer.some(n=>!Number.isInteger(n)||n<1||n>4)||new Set(answer).size!==answer.length))errors.push(`${prefix}: answer는 1~4의 정답 번호 배열이어야 합니다. 미확인은 null로 입력하세요.`);
   if(q.type==='창작 예상문제'&&answer===null)errors.push(`${prefix}: 창작 문제에는 정답이 필요합니다.`);
   try{validateExplanation(q.explanation);}catch(e){errors.push(`${prefix}: ${e.message}`);}
   if(!q.source||typeof q.source.file!=='string'||!q.source.file.trim()||!['final','preliminary','missing','created'].includes(q.source.status))errors.push(`${prefix}: source에 file과 status(final/preliminary/missing/created)가 필요합니다.`);
   if(q.year!==null&&q.year!==undefined&&(!Number.isInteger(q.year)||q.year<1900||q.year>2100))errors.push(`${prefix}: year는 연도 숫자 또는 null이어야 합니다.`);
   if(q.pageId){if(typeof q.pageId!=='string'||(!assets[q.pageId]&&!existingAssets[q.pageId]))errors.push(`${prefix}: 원문 이미지 ${q.pageId}가 없습니다.`);if(!Array.isArray(q.crop)||q.crop.length!==4||q.crop.some(x=>typeof x!=='number'||!Number.isFinite(x)||x<0||x>1)||q.crop[0]>=q.crop[2]||q.crop[1]>=q.crop[3])errors.push(`${prefix}: crop은 0~1 사이의 [왼쪽,위,오른쪽,아래] 좌표여야 합니다.`);}
   if(JSON.stringify(q).length>100000)errors.push(`${prefix}: 텍스트 크기가 너무 큽니다.`);
   if(errors.length===before)clean.push({id:q.id,exam:q.exam,subject:q.subject,unit:q.unit,difficulty:normalizeDifficulty(q.difficulty),...(q.difficultyReview?{difficultyReview:validateDifficultyReview(q.difficultyReview)}:{}),...(q.questionTypes?{questionTypes:q.questionTypes.slice()}:{}),type:q.type,year:q.year??null,number:Number.isInteger(q.number)?q.number:i+1,stem:q.stem,choices:q.choices.slice(),answer,explanation:validateExplanation(q.explanation),source:{file:q.source.file,status:q.source.status,note:typeof q.source.note==='string'?q.source.note:'',page:Number.isInteger(q.source.page)?q.source.page:null,answerFile:typeof q.source.answerFile==='string'?q.source.answerFile:''},...(q.pageId?{pageId:q.pageId,crop:q.crop.slice()}: {})});
  });
  if(errors.length)throw new Error(errors.slice(0,20).join('\n')+(errors.length>20?`\n외 ${errors.length-20}건의 오류` : ''));
  return {questions:clean,pages:assets};
 }
 return {correct,known,shuffle,summarize,gradeRecord,mockQuestions,validateImport,validateExplanation,difficultyLevels,questionTypes,normalizeDifficulty,filterDifficulty,difficultyCounts,questionPool};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=Core;

