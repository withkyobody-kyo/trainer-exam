/* Pure state helpers. Network, auth and UI live in cloud.js. */
(function(root){
'use strict';
const clone=x=>JSON.parse(JSON.stringify(x));
const fresh=()=>({version:1,exam:'health',records:{},bookmarks:[],notes:{},history:[],session:null,settings:{},preferences:{}});
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const cleanSession=s=>{const x=clone(s);delete x.lastTick;return x;};
function project(state,known){
 const out={};
 for(const id of state.bookmarks||[])if(known.has(id))out['bookmark:'+id]={saved:true};
 for(const [id,text] of Object.entries(state.notes||{}))if(known.has(id)&&text)out['note:'+id]={text};
 for(const h of state.history||[])if(h.ids?.every(id=>known.has(id)))out['session:'+h.id]={...cleanSession(h),completed:true};
 if(state.session?.ids?.every(id=>known.has(id)))out['session:'+state.session.id]={...cleanSession(state.session),completed:false};
 return out;
}
function removed(key){return key.startsWith('bookmark:')?{saved:false}:key.startsWith('note:')?{text:''}:{deleted:true};}
function diff(before,after){return [...new Set([...Object.keys(before),...Object.keys(after)])].filter(k=>!same(before[k],after[k])).map(key=>({key,body:after[key]||removed(key)}));}
function materialize(base,items,records,known){
 const x={...fresh(),...clone(base),records:{...Object.fromEntries(Object.entries(base.records||{}).filter(([id])=>!known.has(id))),...records},bookmarks:(base.bookmarks||[]).filter(id=>!known.has(id)),notes:Object.fromEntries(Object.entries(base.notes||{}).filter(([id])=>!known.has(id))),history:(base.history||[]).filter(h=>h.ids.some(id=>!known.has(id))),session:base.session?.ids.some(id=>!known.has(id))?base.session:null};
 const active=[];
 for(const item of Object.values(items)){
  const {item_key:k,body:b}=item;if(!b||b.deleted)continue;
  const id=k.slice(k.indexOf(':')+1);
  if(k.startsWith('bookmark:')&&b.saved&&known.has(id))x.bookmarks.push(id);
  if(k.startsWith('note:')&&b.text&&known.has(id))x.notes[id]=b.text;
  if(k.startsWith('session:')&&b.ids?.every(id=>known.has(id))){if(b.completed)x.history.push(clone(b));else active.push({...clone(b),lastTick:Date.now()});}
 }
 x.history.sort((a,b)=>a.finishedAt-b.finishedAt);
 active.sort((a,b)=>b.startedAt-a.startedAt);
 x.session=active.find(s=>s.id===base.session?.id)||x.session||active[0]||null;
 return {state:x,active};
}
const api={fresh,same,project,diff,materialize,clone};
if(typeof module==='object'&&module.exports)module.exports=api;else root.CloudCore=api;
})(typeof window==='object'?window:globalThis);
