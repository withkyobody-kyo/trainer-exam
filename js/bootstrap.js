'use strict';
(async () => {
 const main=document.querySelector('#main');
 const showError=(title,message)=>{
  main.replaceChildren();
  const card=document.createElement('section');card.className='card loading-card';
  const heading=document.createElement('h1');heading.textContent=title;
  const paragraph=document.createElement('p');paragraph.textContent=message;
  const retry=document.createElement('button');retry.className='btn';retry.textContent='다시 불러오기';retry.onclick=()=>location.reload();
  card.append(heading,paragraph,retry);main.append(card);main.setAttribute('aria-busy','false');card.setAttribute('role','alert');
 };
 if(location.protocol==='file:'){
  showError('웹 게시용 파일입니다.','이 버전은 GitHub Pages 주소나 로컬 미리보기 서버에서 열어 주세요. 설치 없이 오프라인으로 학습하려면 별도로 보관한 기존 단일 index.html을 사용하세요. 자세한 게시 방법은 README.txt에 있습니다.');
  return;
 }
 try {
  const [config,health,sports,assets]=await Promise.all([
   WebFiles.json('./data/exam-config.json'),WebFiles.json('./data/health.json?v=20261123-cloud-2'),
   WebFiles.json('./data/sports.json?v=20261123-cloud-2'),WebFiles.json('./data/page-assets.json')
  ]);
  if(!config.health||!config.sports||!Array.isArray(health)||!Array.isArray(sports))throw Error('설정 형식을 확인해 주세요.');
  for(const [id,path] of Object.entries(assets)){
   if(!/^[A-Za-z0-9_-]+$/.test(id)||!/^\.\/images\/[A-Za-z0-9_-]+\.webp$/.test(path))throw Error('이미지 목록 형식을 확인해 주세요.');
  }
  const questions=[...health,...sports];
  // Catch broken edits before showing an incomplete bank or saving any records.
  Core.validateImport(questions,[],config,assets);
  let validationAssets=assets;
  try {
   const raw=localStorage.getItem('motionnote.questions.v1');
   if(raw)validationAssets=await WebFiles.validationAssets(JSON.parse(raw),assets);
  } catch(e) { /* The existing app shows its storage/import recovery notice. */ }
  window.MotionNoteData={config,questions,assets,validationAssets};
  await window.TrainerCloud?.init(questions);
  await new Promise((resolve,reject)=>{
   const app=document.createElement('script');app.src='./js/app.js?v=20261123-cloud-2';
   app.onload=resolve;app.onerror=()=>reject(Error('학습 화면을 불러오지 못했습니다.'));
   document.head.append(app);
  });
  document.querySelector('.sidebar').inert=false;
  main.setAttribute('aria-busy','false');
 } catch(e) {
  showError('문제은행을 불러오지 못했습니다.','인터넷 연결을 확인하고 다시 불러와 주세요. 계속되면 게시 폴더의 js, data, images 파일이 모두 올라갔는지 확인해 주세요. 저장된 학습 기록은 변경하지 않았습니다.');
 }
})();
