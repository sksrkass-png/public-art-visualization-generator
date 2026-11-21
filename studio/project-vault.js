// v4.0 · local browser-only portable ZIP storage. No network, sync or autosave.
// A vault record contains a full validated export ZIP, not settings-only JSON.
export const VAULT_DB="axoo-studio-local-projects-v1";
export const VAULT_STORE="projects";
export const VAULT_MAX_BYTES=320*1024*1024;
export const VAULT_MAX_RECORDS=12;
export function openProjectVault(indexedDBImpl=globalThis.indexedDB){
  if(!indexedDBImpl) return Promise.reject(new Error("이 브라우저는 프로젝트 로컬 저장소를 지원하지 않습니다."));
  return new Promise((resolve,reject)=>{
    const request=indexedDBImpl.open(VAULT_DB,1);
    request.onupgradeneeded=()=>{
      const db=request.result;
      if(!db.objectStoreNames.contains(VAULT_STORE))
        db.createObjectStore(VAULT_STORE,{keyPath:"id"});
    };
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error||new Error("프로젝트 저장소를 열 수 없습니다."));
    request.onblocked=()=>reject(new Error("다른 탭에서 이전 저장소를 사용 중입니다. 해당 탭을 닫아 주세요."));
  });
}
async function storeOperation(mode,perform){
  const db=await openProjectVault();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(VAULT_STORE,mode);
    const store=tx.objectStore(VAULT_STORE);
    let output;
    try{perform(store, v=>{output=v;});}
    catch(error){db.close();reject(error);return;}
    tx.oncomplete=()=>{db.close();resolve(output);};
    tx.onerror=()=>{db.close();reject(tx.error||new Error("브라우저 저장 작업 실패"));};
    tx.onabort=()=>{db.close();reject(tx.error||new Error("저장 작업이 취소됐습니다."));};
  });
}
export async function listLocalProjects(){
  const entries=await storeOperation("readonly",(store,set)=>{
    const req=store.getAll();
    req.onsuccess=()=>set(req.result);
  });
  return (entries||[]).map(({id,name,updatedAt,size})=>({id,name,updatedAt,size}))
    .sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));
}
export function validVaultName(name){
  return typeof name==="string"&&name.trim().length>0&&name.trim().length<=100;
}
export async function saveLocalProject({id,name,blob}){
  if(!validVaultName(name))throw Error("프로젝트 이름을 1~100자로 입력하세요.");
  if(!(blob instanceof Blob)||!blob.size||blob.size>VAULT_MAX_BYTES)
    throw Error("저장 가능한 프로젝트 ZIP은 320MB 이하입니다.");
  const previous=await listLocalProjects();
  const key=id||globalThis.crypto?.randomUUID?.()||"project-"+Date.now()+"-"+Math.random().toString(36).slice(2);
  if(!previous.some(x=>x.id===key)&&previous.length>=VAULT_MAX_RECORDS)
    throw Error("브라우저 프로젝트는 최대 12개까지 저장할 수 있습니다. 백업 후 오래된 항목을 삭제하세요.");
  const entry={id:key,name:name.trim(),blob,size:blob.size,updatedAt:new Date().toISOString()};
  try{await storeOperation("readwrite",store=>{store.put(entry);});}
  catch(error){
    if(error?.name==="QuotaExceededError"||error?.message?.includes("Quota"))
      throw Error("브라우저 저장 공간이 부족합니다. ZIP으로 백업하거나 오래된 프로젝트를 삭제하세요.");
    throw error;
  }
  return {id:key,name:entry.name,updatedAt:entry.updatedAt,size:entry.size};
}
export async function getLocalProject(id){
  if(!id)throw Error("불러올 프로젝트를 선택하세요.");
  const entry=await storeOperation("readonly",(store,set)=>{
    const req=store.get(id);req.onsuccess=()=>set(req.result);
  });
  if(!entry?.blob)throw Error("저장된 프로젝트를 찾을 수 없습니다.");
  return new File([entry.blob],entry.name.replace(/[^a-z0-9가-힣_-]+/gi,"-")+".zip",{type:"application/zip"});
}
export async function deleteLocalProject(id){
  if(!id)throw Error("삭제할 프로젝트를 선택하세요.");
  await storeOperation("readwrite",store=>{store.delete(id);});
}
