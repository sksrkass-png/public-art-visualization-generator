import * as THREE from "three";
import {enumerateSiteMeshes} from "./layers.js";

// v2.2: presentation-only site controls. All source meshes/materials return
// to their exact original identities before GLB/PNG/8-view export.
export const SITE_VIEW_MODES=Object.freeze(["solid","ghost","section"]);
export const SITE_CUTS=Object.freeze(["x-left","x-right","z-front","z-rear","y-above"]);
export const SITE_FOCUS_RADII=Object.freeze([0,15,30,60,120]);
export const MAX_VIEW_MESHES=10000;
export function normalizeSiteViewSettings(data){
  const v=data||{};
  return {
    mode:SITE_VIEW_MODES.includes(v.mode)?v.mode:"solid",
    cut:SITE_CUTS.includes(v.cut)?v.cut:"x-left",
    offset:Number.isFinite(v.offset)?Math.max(-100,Math.min(100,v.offset)):0,
    radius:SITE_FOCUS_RADII.includes(v.radius)?v.radius:0
  };
}
export function cutPlaneSpec(axis,artCenter,offset=0){
  if(!SITE_CUTS.includes(axis) || !Array.isArray(artCenter) ||
    artCenter.length!==3||!artCenter.every(Number.isFinite)||
    !Number.isFinite(offset)||Math.abs(offset)>100)
    throw Error("단면 축·기준점·높이 값을 확인하세요.");
  // Positive signed side is retained; negative side is clipped.
  const axes={
    "x-left":[[-1,0,0],[artCenter[0]+offset,0,0]],
    "x-right":[[1,0,0],[artCenter[0]+offset,0,0]],
    "z-front":[[0,0,1],[0,0,artCenter[2]+offset]],
    "z-rear":[[0,0,-1],[0,0,artCenter[2]+offset]],
    "y-above":[[0,1,0],[0,artCenter[1]+offset,0]]
  };
  return {normal:axes[axis][0],point:axes[axis][1]};
}
export function focusVisible(min,max,center,radius){
  if(radius===0)return true;
  if(!Number.isFinite(radius)||radius<0 || min.length!==3||max.length!==3||center.length!==3)
    throw Error("현장 집중 뷰 범위가 잘못됐습니다.");
  let sq=0;
  for(let i=0;i<3;i++){
    const d=Math.max(min[i]-center[i],0,center[i]-max[i]);
    sq+=d*d;
  }
  return sq<=radius*radius;
}

export function createSiteViewportController({renderer,siteRoot,artRoot}) {
  let settings=normalizeSiteViewSettings();
  let changed=new Map(),clones=new Set(),originalLocalClipping=null;
  let stats={meshCount:0,hiddenByFocus:0,temporaryMaterials:0,limited:false};
  function clear(){
    for(const [mesh,old] of changed){
      mesh.visible=old.visible;
      mesh.material=old.material;
    }
    changed.clear();
    for(const clone of clones)clone.dispose();
    clones.clear();
    if(originalLocalClipping!==null){
      renderer.localClippingEnabled=originalLocalClipping;
      originalLocalClipping=null;
    }
  }
  function apply(){
    clear();
    const all=enumerateSiteMeshes(siteRoot);
    stats={meshCount:all.length,hiddenByFocus:0,temporaryMaterials:0,
      limited:all.length>MAX_VIEW_MESHES};
    if(settings.mode==="solid"&&settings.radius===0)return stats;
    // Abort instead of applying the effect to only PART of a large site.
    if(all.length>MAX_VIEW_MESHES)return stats;
    siteRoot.updateMatrixWorld(true);artRoot.updateMatrixWorld(true);
    const bbox=new THREE.Box3().setFromObject(artRoot);
    const center=bbox.isEmpty()?new THREE.Vector3():bbox.getCenter(new THREE.Vector3());
    const {normal,point}=cutPlaneSpec(settings.cut,center.toArray(),settings.offset);
    const plane=new THREE.Plane().setFromNormalAndCoplanarPoint(
      new THREE.Vector3(...normal),new THREE.Vector3(...point));
    const materialCache=new Map();
    if(settings.mode==="section"){
      originalLocalClipping=renderer.localClippingEnabled;
      renderer.localClippingEnabled=true;
    }
    function tempMaterial(original){
      if(materialCache.has(original))return materialCache.get(original);
      const copy=original.clone();
      if(settings.mode==="ghost"){
        copy.transparent=true;copy.opacity=Math.min(copy.opacity,.22);
        copy.depthWrite=false;
      } else if(settings.mode==="section"){
        copy.clippingPlanes=[plane];copy.clipShadows=true;
      }
      copy.needsUpdate=true;
      materialCache.set(original,copy);clones.add(copy);
      return copy;
    }
    const bounds=new THREE.Box3();
    for(const {object:mesh} of all){
      if(!mesh.visible)continue; // respect source visibility & user layers
      let visible=true;
      if(settings.radius){
        bounds.setFromObject(mesh);
        if(!bounds.isEmpty())
          visible=focusVisible(bounds.min.toArray(),bounds.max.toArray(),center.toArray(),settings.radius);
      }
      if(!visible){
        changed.set(mesh,{visible:mesh.visible,material:mesh.material});
        mesh.visible=false;stats.hiddenByFocus++;
      }else if(settings.mode!=="solid"){
        changed.set(mesh,{visible:mesh.visible,material:mesh.material});
        mesh.material=Array.isArray(mesh.material)
          ?mesh.material.map(tempMaterial):tempMaterial(mesh.material);
      }
    }
    stats.temporaryMaterials=clones.size;
    return {...stats};
  }
  function set(next){settings=normalizeSiteViewSettings(next);return apply();}
  function suspend(){
    const had=changed.size>0 || originalLocalClipping!==null;
    clear();
    let resumed=false;
    return ()=>{
      if(!resumed){resumed=true;if(had)apply();}
    };
  }
  function refreshAfterLayers(){return apply();}
  function reset(){clear();settings=normalizeSiteViewSettings();stats={
    meshCount:enumerateSiteMeshes(siteRoot).length,hiddenByFocus:0,
    temporaryMaterials:0,limited:false
  };}
  return {set,suspend,reset,refreshAfterLayers,
    getSettings:()=>({...settings}),
    getStats:()=>({...stats}),isActive:()=>changed.size>0||originalLocalClipping!==null};
}
