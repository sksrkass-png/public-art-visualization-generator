import * as THREE from "three";
import {unzipModel, decodeLinkedGLTF} from "./import-bundle.js";

// Legacy site-bundle API retained for existing imports/tests; now uses v3.3 limits.
export async function decodeSiteBundle(file){
  const bundle=await unzipModel(file);
  if(!/\.gltf$/i.test(bundle.file.name))
    throw Error("기존 현장 glTF ZIP 로더에는 glTF 2.0 파일이 필요합니다.");
  return {model:await decodeLinkedGLTF(bundle.file,bundle.resources,bundle.paths,bundle.sourcePath),
    fileName:file.name,resourceCount:bundle.resources.length,sceneName:bundle.sourcePath};
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
    // Preserve source geometry. Scan common packed XYZ attributes without
    // allocating copies or invoking three getters millions of times.
    const packed=pos.isBufferAttribute===true && !pos.normalized &&
      pos.itemSize===3 && pos.array &&
      pos.array.length===pos.count*3;
    if(packed){
      const raw=pos.array;
      for(let i=0;i<raw.length;i+=3)
        if(!Number.isFinite(raw[i])||!Number.isFinite(raw[i+1])||
           !Number.isFinite(raw[i+2]))invalidVertices++;
    }else{
      // Interleaved and normalized attributes preserve the getter semantics.
      for(let i=0;i<pos.count;i++)
        if(!Number.isFinite(pos.getX(i)) || !Number.isFinite(pos.getY(i)) ||
           !Number.isFinite(pos.getZ(i)))invalidVertices++;
    }
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
