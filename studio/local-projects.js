// Browser-origin local project cache. Deliberately not a cloud account backup.
// Persist a complete source-file ZIP only on explicit user interaction.
const DB_NAME="AXOO-Public-Art-Local-Projects";
const STORE="projects";
const LIMIT=6;
function openDb(){
 return new Promise((resolve,reject)=>{
  const req=indexedDB.open(DB_NAME,1);
  req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains(STORE))
    req.result.createObjectStore(STORE,{keyPath:"name"});};
  req.onerror=()=>reject(req.error||Error("브라우저 저장 공간에 접근할 수 없습니다."));
  req.onsuccess=()=>resolve(req.result);
 });
}
async function transaction(mode,handler){
 const db=await openDb();
 try{
  return await new Promise((resolve,reject)=>{
    const tx=db.transaction(STORE,mode),store=tx.objectStore(STORE);
    let result;
    try{result=handler(store);}catch(e){reject(e);return;}
    tx.oncomplete=()=>resolve(result);
    tx.onerror=()=>reject(tx.error||Error("브라우저 저장 처리에 실패했습니다."));
    tx.onabort=()=>reject(tx.error||Error("브라우저 저장을 중단했습니다."));
  });
 }finally{db.close();}
}
export async function listLocalProjects(){
 const db=await openDb();
 try{
   return await new Promise((resolve,reject)=>{
     const tx=db.transaction(STORE,"readonly"),request=tx.objectStore(STORE).openCursor();
     const entries=[];
     request.onsuccess=()=>{
       const cursor=request.result;
       if(!cursor){resolve(entries.sort((a,b)=>b.savedAt.localeCompare(a.savedAt)));return;}
       entries.push({name:cursor.value.name,savedAt:cursor.value.savedAt,bytes:cursor.value.zip.size});
       cursor.continue();
     };
     request.onerror=()=>reject(request.error);
   });
 }finally{db.close();}
}
export function validLocalProjectName(name){
 return typeof name==="string" && name.trim().length>0 && name.trim().length<=100;
}
export async function putLocalProject(name,zip){
 if(!validLocalProjectName(name))throw Error("프로젝트 이름을 1~100자로 입력하세요.");
 if(!(zip instanceof Blob)||zip.size<20||zip.size>200*1024*1024)
   throw Error("프로젝트 백업 ZIP 크기를 확인하세요.");
 const trimmed=name.trim(),list=await listLocalProjects();
 if(!list.some(x=>x.name===trimmed)&&list.length>=LIMIT)
   throw Error("브라우저 저장은 최대 6개입니다. 기존 저장본을 삭제하거나 프로젝트 ZIP으로 백업하세요.");
 await transaction("readwrite",store=>store.put({name:trimmed,zip,savedAt:new Date().toISOString()}));
 return trimmed;
}
export async function loadLocalProject(name){
 const db=await openDb();
 try{
  const record=await new Promise((resolve,reject)=>{
   const req=db.transaction(STORE,"readonly").objectStore(STORE).get(name);
   req.onsuccess=()=>resolve(req.result);
   req.onerror=()=>reject(req.error);
  });
  if(!record?.zip)throw Error("선택한 저장 프로젝트가 없습니다.");
  return new File([record.zip],record.name+".zip",{type:"application/zip"});
 }finally{db.close();}
}
export async function deleteLocalProject(name){await transaction("readwrite",store=>store.delete(name));}
