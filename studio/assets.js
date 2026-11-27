import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";
import { clone as cloneSkeleton } from "three/addons/utils/SkeletonUtils.js";

// Local source GLB library. No remote downloads, license assumptions or geometry
// normalization. Users are responsible for asset licensing and real dimensions.
export const MAX_LIBRARY_ASSETS=12;
export const MAX_LIBRARY_ITEM_BYTES=120*1024*1024;
export const MAX_LIBRARY_BYTES=300*1024*1024;
export const MAX_LIBRARY_TRIANGLES=250000;
export const MAX_ARTWORK_TRIANGLES=1200000;
export const ASSET_CATEGORIES=Object.freeze(["planting","person","furniture","vehicle","artwork",
  "architecture","display","media","signage"]);
export function validLibraryManifest(list){
  if(!Array.isArray(list) || list.length>MAX_LIBRARY_ASSETS)return false;
  const seen=new Set();
  for(const a of list){
    if(!a || !/^lib[1-9]\d{0,4}$/.test(a.id) || seen.has(a.id) ||
      typeof a.name!=="string" || a.name.length>150 ||
      !/\.(?:glb|obj)$/i.test(a.name) || !ASSET_CATEGORIES.includes(a.category) ||
      !Number.isInteger(a.byteSize)||a.byteSize<1||a.byteSize>MAX_LIBRARY_ITEM_BYTES)
      return false;
    seen.add(a.id);
  }
  return list.reduce((sum,a)=>sum+a.byteSize,0)<=MAX_LIBRARY_BYTES;
}
export function libraryManifest(library) {
  return [...library.values()].map(({id,file,category})=>({
    id,name:file.name,byteSize:file.size,category
  }));
}
export function libraryStats(root,category="planting") {
  let meshes=0,triangles=0,vertices=0;
  root.traverse(o=>{
    if(!o.isMesh||!o.geometry)return;
    meshes++;
    const p=o.geometry.getAttribute("position");
    if(!p)return;
    vertices+=p.count;
    triangles+=Math.floor((o.geometry.index?.count || p.count)/3);
  });
  const box=new THREE.Box3().setFromObject(root);
  const size=box.getSize(new THREE.Vector3());
  if(!meshes || box.isEmpty() || !size.toArray().every(Number.isFinite) ||
      size.lengthSq()<1e-8 || triangles>(category==="artwork"?MAX_ARTWORK_TRIANGLES:MAX_LIBRARY_TRIANGLES))
    throw Error("배치 가능한 3D 메시가 없거나 "+(category==="artwork"?"120만":"25만")+" 개의 삼각형을 초과했습니다.");
  return {meshes,triangles,vertices,size:size.toArray()};
}
export async function parseLibraryModel(file,id,category="planting") {
  if(!file || !/\.(?:glb|obj)$/i.test(file.name) || file.size<32 || file.size>MAX_LIBRARY_ITEM_BYTES)
    throw Error("GLB·OBJ 파일은 개별 120MB 이하만 허용합니다.");
  if(!/^lib[1-9]\d{0,4}$/.test(id) || !ASSET_CATEGORIES.includes(category))
    throw Error("에셋 ID 또는 유형이 올바르지 않습니다.");
  if(/\.obj$/i.test(file.name)){
    // OBJ is preserved as its original text file in the ZIP. No lossy GLB conversion.
    // An OBJ without a bundled MTL loads with safe default materials; tell users.
    const contents=await file.text();
    let model;
    try{model=new OBJLoader().parse(contents);}
    catch(error){throw Error("OBJ 모델 해석 실패: "+error.message);}
    const stats=libraryStats(model,category);
    model.updateMatrixWorld(true);
    return {id,file,category,model,stats};
  }
  const buffer=await file.arrayBuffer();
  const view=new DataView(buffer);
  if(view.getUint32(0,true)!==0x46546c67 || view.getUint32(4,true)!==2 ||
    view.getUint32(8,true)!==buffer.byteLength)
    throw Error("유효한 glTF 2.0 GLB 파일이 아닙니다.");
  // Reject linked external URLs: the whole asset must reside in its source GLB.
  // This protects against remote texture fetches and incomplete project ZIPs.
  const jsonLength=view.getUint32(12,true);
  const jsonType=view.getUint32(16,true);
  if(jsonType!==0x4e4f534a || jsonLength<2 || 20+jsonLength>buffer.byteLength)
    throw Error("GLB JSON 블록이 유효하지 않습니다.");
  let gltf;
  try{gltf=JSON.parse(new TextDecoder().decode(new Uint8Array(buffer,20,jsonLength)));}
  catch{throw Error("GLB JSON 구조를 읽을 수 없습니다.");}
  for(const part of [...(gltf.buffers||[]),...(gltf.images||[])]){
    if(part.uri && !part.uri.startsWith("data:"))
      throw Error("외부 텍스처·BIN 링크가 포함된 GLB는 지원하지 않습니다. 파일에 리소스를 내장해 주세요.");
  }
  let model;
  try {
    model=(await new GLTFLoader().parseAsync(buffer,"")).scene;
  }catch(error){throw Error("GLB를 읽을 수 없습니다: "+error.message);}
  const stats=libraryStats(model,category);
  model.updateMatrixWorld(true);
  return {id,file,category,model,stats};
}
export function instantiateLibraryAsset(entry){
  if(!entry?.model)throw Error("원본 GLB가 없는 에셋을 배치할 수 없습니다.");
  const root=cloneSkeleton(entry.model);
  root.name=entry.file.name.replace(/\.(?:glb|obj)$/i,"");
  root.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});
  return root;
}
export function libraryMemoryStats(library, placedRoots) {
  const sourceTriangles=[...library.values()].reduce((sum,a)=>sum+a.stats.triangles,0);
  const visibleTriangles=placedRoots.reduce((sum,o)=>{
    const a=library.get(o.userData.assetId);
    return sum+(a?.stats.triangles||0);
  },0);
  return {sourceTriangles,visibleTriangles};
}

// Backward-compatible GLB entrypoint for existing project/library call sites.
export function parseLibraryGLB(file,id,category="planting"){
  if(!/\.glb$/i.test(file?.name||""))return Promise.reject(Error("GLB 파일만 허용합니다."));
  return parseLibraryModel(file,id,category);
}
