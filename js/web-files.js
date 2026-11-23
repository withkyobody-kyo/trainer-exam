'use strict';
// Website images stay external. Portable JSON exports embed the original bytes.
const WebFiles = (() => {
 async function request(path,cache='default') {
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),30000);
  try {
   const response=await fetch(path,{signal:controller.signal,cache});
   if(!response.ok)throw Error(`자료를 불러오지 못했습니다 (${response.status}).`);
   const blob=await response.blob();
   return blob;
  } finally { clearTimeout(timer); }
 }
 async function json(path) { return JSON.parse(await (await request(path,'no-cache')).text()); }
 async function imageData(source) {
  if(typeof source!=='string')throw Error('원문 이미지가 없습니다.');
  if(/^data:image\/(webp|png|jpeg);base64,/.test(source))return source;
  if(!/^\.\/images\/[A-Za-z0-9_-]+\.(webp|png|jpg|jpeg)$/.test(source))throw Error('원문 이미지 경로가 올바르지 않습니다.');
  const blob=await request(source);
  if(!/^image\/(webp|png|jpeg)$/.test(blob.type))throw Error('이미지 파일 형식이 올바르지 않습니다.');
  return new Promise((resolve,reject)=>{
   const reader=new FileReader();
   reader.onload=()=>resolve(reader.result);
   reader.onerror=()=>reject(Error('원문 이미지를 읽지 못했습니다.'));
   reader.readAsDataURL(blob);
  });
 }
 async function exportPages(questions,assets,progress=()=>{}) {
  const ids=[...new Set(questions.map(q=>q.pageId).filter(Boolean))];
  const pages={};let cursor=0,done=0;
  async function worker(){
   while(cursor<ids.length){
    const id=ids[cursor++];
    pages[id]=await imageData(assets[id]);
    progress(++done,ids.length);
   }
  }
  // Wait for all workers even on failure so a retry cannot overlap an old export.
  const results=await Promise.allSettled(Array.from({length:Math.min(4,ids.length)},worker));
  const error=results.find(r=>r.status==='rejected');
  if(error)throw error.reason;
  return pages;
 }
 async function validationAssets(input,assets) {
  const normalized={...assets};
  const pages=input?.pages;
  if(!pages||typeof pages!=='object'||Array.isArray(pages))return normalized;
  // Old offline exports may include an existing image with a new question ID.
  // Compare actual bytes; never silently overwrite an existing image ID.
  const ids=Object.keys(pages).filter(id=>Object.hasOwn(assets,id)&&assets[id].startsWith('./images/'));
  for(const id of ids)normalized[id]=await imageData(assets[id]);
  return normalized;
 }
 return {json,imageData,exportPages,validationAssets};
})();
