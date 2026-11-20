// AXOO v3.3: client-side bundles, no remote asset fetches.
import JSZip from "https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm";
import * as THREE from "three";
import {GLTFLoader} from "three/addons/loaders/GLTFLoader.js";

export const MODEL_FORMATS=Object.freeze(["glb","gltf","obj","fbx","stl","ply","dae","3ds","zip"]);
export const MODEL_MAX=120*1024*1024;
export const RESOURCE_MAX=80*1024*1024;
export const RESOURCE_COUNT=45;
const ASSETS=new Set(["mtl","bin","png","jpg","jpeg","webp","bmp"]);
const IGNORE_IN_FOLDERS=new Set(["txt","md","pdf","json","ini"]);
const ext=s=>String(s).split(".").pop().toLowerCase();
export const fileExtension=ext;

export function safePath(v){
  if(typeof v!=="string" || !v || v.includes("\0") ||
     v.startsWith("/") || /^[a-z]+:/i.test(v) || /[?#]/.test(v))
    throw Error("잘못된 파일 경로입니다.");
  const parts=v.replace(/\\/g,"/").split("/").filter(x=>x && x!==".");
  if(parts.some(x=>x===".." || x.includes(":")))throw Error("상위 폴더 경로를 사용할 수 없습니다.");
  return parts.join("/");
}
export const pathOf=f=>safePath(f.webkitRelativePath||f.name);
export function validateSelection(file,resources=[],paths=[]){
  if(!file || !MODEL_FORMATS.includes(ext(file.name)) ||
     file.size<=0 || file.size>MODEL_MAX)throw Error("3D 모델은 120MB 이하여야 합니다.");
  if(!Array.isArray(resources) || resources.length>RESOURCE_COUNT ||
      (paths.length && paths.length!==resources.length))
    throw Error("부속 파일은 45개 이하로 선택하세요.");
  const kind=ext(file.name);
  if(!["obj","gltf"].includes(kind) && resources.length)
    throw Error("부속 파일은 OBJ 또는 GLTF와 함께 선택하세요.");
  const seen=new Set();let total=0,mtls=0;
  for(let i=0;i<resources.length;i++){
    const f=resources[i],p=safePath(paths[i]||pathOf(f)),t=ext(p);
    if(!ASSETS.has(t) || (kind==="obj"&&t==="bin") || (kind==="gltf"&&t==="mtl") ||
       !Number.isFinite(f.size)||f.size<=0||f.size>RESOURCE_MAX)
      throw Error("지원되지 않거나 80MB를 넘는 부속 파일: "+p);
    const k=p.toLowerCase();
    if(seen.has(k))throw Error("중복된 부속 파일 경로: "+p);
    seen.add(k);total+=f.size;if(t==="mtl")mtls++;
  }
  if(total>RESOURCE_MAX)throw Error("부속 파일 합계 80MB 초과");
  if(kind==="obj" && resources.length && mtls!==1)
    throw Error("OBJ 부속 파일을 선택했다면 MTL 한 개가 필요합니다.");
  return true;
}
export function chooseModel(files){
  const all=[...files].filter(f=>!/(^|[/\\])(?:\.DS_Store|Thumbs\.db)$/i.test(f.webkitRelativePath||f.name) &&
    !IGNORE_IN_FOLDERS.has(ext(f.name)));
  const models=all.filter(f=>MODEL_FORMATS.includes(ext(f.name)));
  if(models.length!==1)throw Error("3D 모델 파일은 정확히 한 개만 선택하세요.");
  const file=models[0],resources=all.filter(f=>f!==file),paths=resources.map(pathOf);
  validateSelection(file,resources,paths);
  return {file,resources,paths,sourcePath:pathOf(file)};
}
export function validCompanions(data,modelName){
  if(data===undefined)return true;
  if(!Array.isArray(data)||data.length>RESOURCE_COUNT||
     (data.length && !/\.(?:obj|gltf)$/i.test(modelName)))return false;
  const names=new Set();let sum=0,mtls=0;
  for(const item of data){
    if(!item || typeof item.name!=="string" || !/^[^/\\]{1,180}$/.test(item.name)||
       !ASSETS.has(ext(item.name))||!Number.isInteger(item.byteSize)||
       item.byteSize<=0||item.byteSize>RESOURCE_MAX)return false;
    let p;try{p=safePath(item.path||item.name)}catch{return false}
    if(ext(modelName)==="obj"&&ext(p)==="bin")return false;
    if(ext(modelName)==="gltf"&&ext(p)==="mtl")return false;
    const k=p.toLowerCase();if(names.has(k))return false;
    names.add(k);sum+=item.byteSize;if(ext(p)==="mtl")mtls++;
  }
  return sum<=RESOURCE_MAX&&(ext(modelName)!=="obj"||!data.length||mtls===1);
}
export async function unzipModel(file){
  if(ext(file.name)!=="zip"||file.size>MODEL_MAX)throw Error("모델 ZIP 120MB 제한 초과");
  const zip=await JSZip.loadAsync(file);
  const entries=Object.entries(zip.files).filter(([,entry])=>!entry.dir &&
    !/(^|\/)(?:\.DS_Store|Thumbs\.db)$/i.test(entry.name) &&
    !IGNORE_IN_FOLDERS.has(ext(entry.name)));
  if(entries.length<1||entries.length>RESOURCE_COUNT+1)throw Error("ZIP 내부 파일은 최대 46개입니다.");
  const models=[],assets=[],seen=new Set();let sideSize=0;
  for(const [raw,entry] of entries){
    const p=safePath(raw),t=ext(p),main=MODEL_FORMATS.includes(t)&&t!=="zip";
    if(!main && !ASSETS.has(t))throw Error("ZIP에 미지원 파일: "+p);
    if(seen.has(p.toLowerCase()))throw Error("ZIP 내 파일명이 중복됩니다: "+p);
    seen.add(p.toLowerCase());
    const size=entry._data?.uncompressedSize;
    if(!Number.isFinite(size)||size<=0||size>(main?MODEL_MAX:RESOURCE_MAX))
      throw Error("ZIP 해제 크기 제한 초과: "+p);
    if(main)models.push({p,entry});else{sideSize+=size;assets.push({p,entry});}
  }
  if(models.length!==1)throw Error("ZIP 안에는 모델 파일이 하나만 있어야 합니다.");
  if(sideSize>RESOURCE_MAX)throw Error("ZIP 부속 파일 합계 80MB 초과");
  const convert=async o=>new File([await o.entry.async("uint8array")],o.p.split("/").pop());
  const main=await convert(models[0]),resources=await Promise.all(assets.map(convert));
  const paths=assets.map(x=>x.p);
  validateSelection(main,resources,paths);
  return {file:main,resources,paths,sourcePath:models[0].p};
}
function resolveResource(parent,uri){
  if(typeof uri!=="string" || !uri || uri.startsWith("/") || /^[a-z]+:/i.test(uri) ||
     /[?#\\]/.test(uri) || /%(?:2f|5c)/i.test(uri))throw Error("외부 경로/URL 차단: "+uri);
  let decoded;try{decoded=decodeURIComponent(uri)}catch{throw Error("잘못된 리소스 인코딩")}
  return safePath((parent?parent+"/":"")+decoded);
}
export async function decodeLinkedGLTF(file,resources=[],paths=[],sourcePath=file.name){
  validateSelection(file,resources,paths);
  const source=await file.text();let json;
  try{json=JSON.parse(source)}catch{throw Error("GLTF JSON 오류")}
  if(String(json.asset?.version||"").split(".")[0]!=="2")throw Error("GLTF 2.0 파일이 아닙니다.");
  const folder=safePath(sourcePath).split("/").slice(0,-1).join("/");
  const available=new Map(),byName=new Map();
  resources.forEach((f,i)=>{
    const p=safePath(paths[i]||pathOf(f)).toLowerCase();
    available.set(p,f);
    const k=p.split("/").pop();
    if(byName.has(k))byName.set(k,null);else byName.set(k,f);
  });
  const blobs=[],mapped=new Map();
  try{
    for(const r of [...(json.buffers||[]),...(json.images||[])]){
      if(!r.uri||/^(?:data:|blob:)/i.test(r.uri))continue;
      const p=resolveResource(folder,r.uri);
      const f=available.get(p.toLowerCase()) || byName.get(p.split("/").pop().toLowerCase());
      if(!f)throw Error("GLTF에 필요한 파일이 없습니다: "+p);
      if(!mapped.has(p.toLowerCase())){
        const mime={png:"image/png",jpg:"image/jpeg",jpeg:"image/jpeg",webp:"image/webp",bmp:"image/bmp"}[ext(p)]||"application/octet-stream";
        const url=URL.createObjectURL(new Blob([f],{type:mime}));
        blobs.push(url);mapped.set(p.toLowerCase(),url);
      }
    }
    const base="__AXOO_LOCAL_GLTF__/";
    const manager=new THREE.LoadingManager();
    manager.setURLModifier(uri=>{
      if(/^(?:data:|blob:)/i.test(uri))return uri;
      if(!uri.startsWith(base))throw Error("외부 GLTF 요청 차단");
      let decoded=uri.slice(base.length);
      try{decoded=decodeURIComponent(decoded)}catch{throw Error("잘못된 리소스 URL 인코딩")}
      const found=mapped.get(safePath(decoded).toLowerCase());
      if(!found)throw Error("연결되지 않은 GLTF 파일: "+uri);
      return found;
    });
    const gltf=await new GLTFLoader(manager).parseAsync(source,base+(folder?folder+"/":""));
    if(!gltf.scene)throw Error("GLTF 장면이 없습니다.");
    return gltf.scene;
  }finally{blobs.forEach(x=>URL.revokeObjectURL(x))}
}
export function importHints(type){
  if(["glb","gltf"].includes(type))return {unit:"m",up:"y",note:"glTF 규격의 미터·Y-up 기준입니다. 실제 치수를 확인하세요."};
  if(type==="fbx")return {unit:"m",up:"y",note:"FBX 로더가 단위·좌표축을 조정할 수 있으므로 중복 보정을 피하세요."};
  return {unit:"m",up:"y",note:"파일 단위·높이축을 확정할 수 없습니다. 실제 W×D×H를 확인하고 수동 조정하세요."};
}
export function inspectPerformance(root){
  const geos=new Set(),textures=new Set();
  let meshCount=0,triangles=0,geometryBytes=0,textureBytes=0;
  root.traverse(o=>{
    if(!o.isMesh||!o.geometry)return;
    meshCount++;
    const g=o.geometry,vert=g.getAttribute("position")?.count||0;
    triangles+=Math.floor((g.index?.count||vert)/3)*(o.isInstancedMesh?o.count:1);
    if(!geos.has(g.uuid)){
      geos.add(g.uuid);
      for(const attr of Object.values(g.attributes))geometryBytes+=attr?.array?.byteLength||0;
      geometryBytes+=g.index?.array?.byteLength||0;
    }
    for(const m of (Array.isArray(o.material)?o.material:[o.material])){
      if(!m)continue;
      for(const key of ["map","normalMap","metalnessMap","roughnessMap","aoMap","alphaMap","emissiveMap"]){
        const tex=m[key];
        if(!tex||textures.has(tex.uuid))continue;
        textures.add(tex.uuid);
        textureBytes+=(tex.image?.width||0)*(tex.image?.height||0)*4*1.333;
      }
    }
  });
  const warnings=[];
  if(triangles>1_000_000)warnings.push("삼각형 100만 개 초과: 조작 성능 저하 가능");
  if(meshCount>800)warnings.push("메시 800개 초과: 레이어·그림자 성능 저하 가능");
  if(textureBytes>256*1024*1024)warnings.push("예상 텍스처 GPU 메모리 256MB 초과");
  if(geometryBytes+textureBytes>500*1024*1024)warnings.push("추정 3D 메모리 500MB 초과");
  return {meshCount,triangles,geometryBytes,textureBytes,warnings};
}
