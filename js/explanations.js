'use strict';
// Hosted explanations are grouped by exam/year and loaded only after reveal.
// Offline and exported questions contain the full explanation directly.
const ExplanationLibrary=(()=>{
 const files=new Map(),pending=new Map(),failed=new Map();
 function pathFor(q){
  const path=q.explanation?.asset;
  return typeof path==='string'&&/^\.\/data\/explanations\/(health|sports)-\d{4}\.json$/.test(path)?path:null;
 }
 async function load(path){
  if(files.has(path))return files.get(path);
  if(pending.has(path))return pending.get(path);
  const task=(async()=>{
   try{
    const response=await fetch(path);
    if(!response.ok)throw Error('해설 파일을 불러오지 못했습니다.');
    const data=await response.json();
    if(!data||typeof data!=='object'||Array.isArray(data))throw Error('해설 파일 형식이 올바르지 않습니다.');
    for(const value of Object.values(data))Core.validateExplanation(value);
    files.set(path,data);failed.delete(path);return data;
   }catch(error){failed.set(path,error);throw error;}
   finally{pending.delete(path);}
  })();
  pending.set(path,task);return task;
 }
 function get(q){
  const path=pathFor(q);
  if(!path)return q.explanation;
  if(files.has(path))return files.get(path)[q.id]||{...q.explanation,loadError:true};
  if(failed.has(path))return {...q.explanation,loadError:true};
  if(!pending.has(path))load(path).then(()=>document.dispatchEvent(new CustomEvent('explanations-loaded'))).catch(()=>document.dispatchEvent(new CustomEvent('explanations-loaded')));
  return {...q.explanation,loading:true};
 }
 function retry(q){const path=pathFor(q);if(path)failed.delete(path);}
 async function materialize(questions){
  const paths=[...new Set(questions.map(pathFor).filter(Boolean))];
  await Promise.all(paths.map(load));
  return questions.map(q=>{
   const path=pathFor(q);const explanation=path?files.get(path)?.[q.id]:q.explanation;
   if(!explanation)throw Error(`해설을 찾지 못했습니다: ${q.id}`);
   return {...q,explanation:structuredClone(explanation)};
  });
 }
 return {get,retry,materialize};
})();
