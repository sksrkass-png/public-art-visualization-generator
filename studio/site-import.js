import JSZip from "https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const ALLOWED=new Set(["gltf","bin","png","jpg","jpeg","webp"]);
const MAX_FILES=45,MAX_UNPACKED=100*1024*1024,MAX_FILE=80*1024*1024;
function pathParts(name){
  if(typeof name!=="string" || !name || name.includes("\\") ||
    /^[a-zA-Z]+:/.test(name) || name.startsWith("/") ||
    name.includes("\0") || name.includes("?") || name.includes("#"))throw Error("ZIP 내부 파일 경로가 안전하지 않습니다.");
  const parts=name.split("/").filter(x=>x && x!==".");
  if(parts.some(x=>x===".."))throw Error("상위 폴더 참조는 사용할 수 없습니다.");
  return parts;
}
function validName(name){
  const parts=pathParts(name);
  const ext=(parts[parts.length-1]||"").split(".").pop().toLowerCase();
  if(!ALLOWED.has(ext))throw Error("ZIP에 허용되지 않는 파일이 있습니다: "+name);
  return parts.join("/");
}
function resourceName(parent,uri){
  if(typeof uri!=="string" || !uri || /^\/|^[a-z]+:/i.test(uri) ||
    /[?#\\]/.test(uri) || /%2f|%5c/i.test(uri))
    throw Error("GLTF 외부/절대 경로 리소스는 가져올 수 없습니다.");
  let decoded;
  try{decoded=decodeURIComponent(uri);}catch{throw Error("잘못 인코딩된 GLTF 리소스 경로입니다.");}
  return validName((parent ? parent+"/" : "")+decoded);
}
export async function decodeSiteBundle(file){
  if(!file || !/\.zip$/i.test(file.name) || file.size>80*1024*1024)
    throw Error("현장 번들 ZIP은 80MB 이하만 허용합니다.");
  const zip=await JSZip.loadAsync(file);
  const entries=Object.entries(zip.files).filter(([k,v])=>!v.dir);
  if(entries.length<1 || entries.length>MAX_FILES)throw Error("현장 ZIP 파일 수는 1~45개여야 합니다.");
  const names=new Map();
  let unpacked=0;
  for(const [name,entry] of entries){
    const path=validName(name);
    if(names.has(path))throw Error("ZIP 내부에 동일 파일명이 중복되었습니다.");
    const size=entry._data?.uncompressedSize;
    if(!Number.isFinite(size) || size<0 || size>MAX_FILE)throw Error(path+" 파일 크기가 허용 범위를 넘습니다.");
    unpacked+=size;
    if(unpacked>MAX_UNPACKED)throw Error("압축 해제 예상 용량 100MB 초과");
    names.set(path,entry);
  }
  const scenes=[...names.keys()].filter(name=>name.toLowerCase().endsWith(".gltf"));
  if(scenes.length!==1)throw Error("현장 ZIP에는 .gltf 장면 파일이 정확히 1개 있어야 합니다.");
  const root=scenes[0], folder=root.includes("/")?root.slice(0,root.lastIndexOf("/")):"";
  const gltfBytes=await names.get(root).async("uint8array");
  let config;
  try{config=JSON.parse(new TextDecoder().decode(gltfBytes));}
  catch{throw Error("GLTF 장면 JSON을 해석할 수 없습니다.");}
  if(config.asset?.version?.split(".")[0]!=="2")throw Error("glTF 2.0만 지원합니다.");
  const used=new Set();
  for(const entry of [...(config.buffers||[]),...(config.images||[])]){
    if(!entry.uri || entry.uri.startsWith("data:"))continue;
    const path=resourceName(folder,entry.uri);
    if(!names.has(path))throw Error("GLTF 참조 파일이 ZIP에 없습니다: "+path);
    used.add(path);
  }
  const urls=new Map(),created=[];
  try{
    for(const path of used){
      const bytes=await names.get(path).async("uint8array");
      if(bytes.byteLength>MAX_FILE)throw Error("파일이 너무 큽니다: "+path);
      const ext=path.split(".").pop().toLowerCase();
      const mime={png:"image/png",jpg:"image/jpeg",jpeg:"image/jpeg",webp:"image/webp",bin:"application/octet-stream"}[ext]||"application/octet-stream";
      const url=URL.createObjectURL(new Blob([bytes],{type:mime}));
      created.push(url);
      urls.set(path,url);
    }
    const manager=new THREE.LoadingManager();
    manager.setURLModifier(request=>{
      if(!request.startsWith("__AXOO_GLTF_BUNDLE__/"))return request;
      const path=request.slice("__AXOO_GLTF_BUNDLE__/".length);
      return urls.get(path) || request;
    });
    const loader=new GLTFLoader(manager);
    const result=await loader.parseAsync(new TextDecoder().decode(gltfBytes),
      "__AXOO_GLTF_BUNDLE__/"+(folder?folder+"/":""));
    if(!result.scene)throw Error("GLTF ZIP 내에서 렌더링할 현장 장면을 찾지 못했습니다.");
    return {model:result.scene,fileName:file.name,resourceCount:used.size,sceneName:root};
  }finally{created.forEach(URL.revokeObjectURL);}
}
export function inspectImportedSite(root) {
  root.updateWorldMatrix(true,true);
  const bounds=new THREE.Box3().setFromObject(root);
  const size=bounds.getSize(new THREE.Vector3());
  const center=bounds.getCenter(new THREE.Vector3());
  let meshCount=0,triangles=0,materialCount=0,pointCount=0,invalidVertices=0;
  const materials=new Set();
  root.traverse(object=>{
    if(!object.isMesh || !object.geometry)return;
    meshCount++;
    const pos=object.geometry.getAttribute("position");
    if(!pos)return;
    pointCount+=pos.count;
    const index=object.geometry.index;
    triangles+=Math.floor((index?index.count:pos.count)/3);
    const list=Array.isArray(object.material)?object.material:[object.material];
    list.filter(Boolean).forEach(m=>materials.add(m.uuid));
    // Scan every vertex under the 80MB upload cap. Reject corrupt coordinates.
    for(let i=0;i<pos.count;i++)
      if(!Number.isFinite(pos.getX(i)) || !Number.isFinite(pos.getY(i)) || !Number.isFinite(pos.getZ(i)))invalidVertices++;
  });
  materialCount=materials.size;
  const extent=size.toArray().every(Number.isFinite)&&Math.max(...size.toArray())>1e-8;
  if(!meshCount || !extent || invalidVertices)throw Error("표시 가능한 유효한 3D 메시가 없습니다.");
  const warnings=[];
  if(triangles>350000)warnings.push("삼각형 "+triangles.toLocaleString()+"개 — 모바일·저사양 GPU에서 느릴 수 있습니다.");
  if(meshCount>700)warnings.push("메시 "+meshCount+"개 — 레이어 탐색과 그림자 렌더가 무거울 수 있습니다.");
  if(Math.max(Math.abs(center.x),Math.abs(center.y),Math.abs(center.z))>10000)
    warnings.push("원본 중심 좌표가 원점에서 멀리 떨어져 있습니다. 뷰어 원점 보정을 고려하세요.");
  if(Math.max(...size.toArray())>10000)warnings.push("현장 폭이 매우 큽니다. 단위(m/cm/mm/ft)를 확인하세요.");
  if(Math.min(size.x,size.z)<1e-5)warnings.push("현장 바닥 면적이 거의 없습니다. 작품 지면 밀착은 불가능할 수 있습니다.");
  return {meshCount,triangles,pointCount,materialCount,
    size:size.toArray(),center:center.toArray(),bounds:[bounds.min.toArray(),bounds.max.toArray()],
    warnings};
}
export function siteAlignmentDefaults(){return {centerOrigin:false};}
export function validSiteAlignment(s){return !!s && typeof s.centerOrigin==="boolean";}
export function offsetForCenter(rawBounds,modelRoot,unit,up){
  // This function assumes modelRoot is imported as the sole child of siteRoot,
  // and computes world-aligned offset without modifying the source meshes.
  if(!rawBounds || !modelRoot)return new THREE.Vector3(0,0,0);
  const box=rawBounds.clone();
  const center=box.getCenter(new THREE.Vector3());
  if(up==="z")center.applyAxisAngle(new THREE.Vector3(1,0,0),-Math.PI/2);
  return center.multiplyScalar(-unit);
}
