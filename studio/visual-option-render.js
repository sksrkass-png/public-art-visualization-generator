import * as THREE from "three";
import {restoreExtras,setEditorGizmosVisible} from "./extras.js";
import {applyLayerVisibility} from "./layers.js";
import {makeMaterial} from "./rendering.js";
import {cameraFocusSettings} from "./camera-focus.js";
import {renderShadowSettings,fillLightIntensity} from "./render-looks.js";

// v2.5: stage different visual options in a separate THREE.Scene. The user
// scene's object identities, original geometry, materials and MASTER are untouched.
export function createVisualOptionStage({
  option,artRoot,siteRoot,floor,sceneEnvironment,neutralEnvironment,hdrEnvironment,library,originalArtMaterials,
  sourceLightPreset="clear",sourceArtFile="",sourceSiteFile=""
}){
  if(option.sourceArt!==sourceArtFile||option.sourceSite!==sourceSiteFile)
    throw Error("저장 당시 작품·현장 원본과 다릅니다. 같은 원본 파일로 복원하세요.");
  const staged=new THREE.Scene();
  staged.environment=option.render?.environmentMode==="hdr"&&hdrEnvironment?hdrEnvironment:
    (neutralEnvironment||sceneEnvironment);
  staged.environmentIntensity=(option.render?.envIntensity??1)*
    (option.render?.environmentMode==="bright"?1.35:option.render?.environmentMode==="overcast"?.65:1);
  const sky={cool:0xdce0e2,warm:0xe7e0d4,white:0xf4f4f2};
  const kind=option.render?.visual?.sky||"cool";
  staged.background=new THREE.Color(option.lightPreset==="night"?0x171f33:(sky[kind]||sky.cool));
  const siteCopy=siteRoot.clone(true);
  const artCopy=artRoot.clone(true);
  artCopy.position.fromArray(option.scene.artwork.p);
  artCopy.rotation.set(...option.scene.artwork.r);
  artCopy.scale.fromArray(option.scene.artwork.s);
  const extraCopy=new THREE.Group();
  restoreExtras(extraCopy,option.scene.extras,library,artCopy);
  setEditorGizmosVisible(extraCopy,false);
  applyLayerVisibility(option.scene.layers,siteCopy,artCopy,extraCopy);
  staged.add(siteCopy,artCopy,extraCopy);
  if(!sourceSiteFile&&floor?.visible)staged.add(floor.clone());
  const temporaryMaterials=[];
  const originalMeshes=[],stagedMeshes=[];
  artRoot.traverse(x=>{if(x.isMesh)originalMeshes.push(x);});
  artCopy.traverse(x=>{if(x.isMesh)stagedMeshes.push(x);});
  if(originalMeshes.length!==stagedMeshes.length)throw Error("복제 작품 메시 개수 일치 실패");
  const materialConfig=option.scene.material;
  for(let i=0;i<originalMeshes.length;i++){
    const reference=originalMeshes[i],copy=stagedMeshes[i];
    const original=originalArtMaterials.get(reference)||reference.material;
    if(materialConfig.preset==="original"){copy.material=original;continue;}
    const referenceList=Array.isArray(original)?original:[original];
    const created=referenceList.map(()=>makeMaterial(materialConfig.preset,materialConfig.color));
    temporaryMaterials.push(...created);
    copy.material=Array.isArray(original)?created:created[0];
  }
  const ambient=new THREE.HemisphereLight(0xeaf4ff,0x96989a,option.lighting.ambient??.7);
  const az=THREE.MathUtils.degToRad(option.lighting["sun-azimuth"]??45),
    el=THREE.MathUtils.degToRad(option.lighting["sun-elevation"]??45);
  const sun=new THREE.DirectionalLight(
    option.lightPreset==="golden"?0xffc489:0xfff7e6,
    option.lighting["sun-strength"]??2.4);
  sun.castShadow=!!option.shadows;
  // Keep A/B/C options consistent with v2.8 live shadow profiles.
  // Bound temporary maps to avoid multiplying transient GPU memory use.
  const artBounds=new THREE.Box3().setFromObject(artCopy);
  const center=artBounds.getCenter(new THREE.Vector3());
  const dims=artBounds.getSize(new THREE.Vector3());
  const diameter=dims.length();
  const shadow=renderShadowSettings({width:dims.x,height:dims.y,depth:dims.z,
    profile:option.render?.visual?.shadowProfile||"balanced",maxTextureSize:3072});
  sun.shadow.mapSize.set(shadow.resolution,shadow.resolution);
  Object.assign(sun.shadow.camera,{
    left:-shadow.reach,right:shadow.reach,top:shadow.reach,bottom:-shadow.reach,
    near:shadow.near,far:shadow.far
  });
  sun.shadow.bias=shadow.bias;
  sun.shadow.normalBias=shadow.normalBias;
  sun.shadow.radius=shadow.radius;
  sun.shadow.camera.updateProjectionMatrix();
  const direction=new THREE.Vector3(
    Math.cos(el)*Math.sin(az),Math.sin(el),Math.cos(el)*Math.cos(az));
  sun.position.copy(center).addScaledVector(direction,65);
  sun.target.position.copy(center);
  const fillLight=new THREE.DirectionalLight(0xc0d5ee,fillLightIntensity(ambient.intensity));
  fillLight.position.copy(center).addScaledVector(direction,-45).add(new THREE.Vector3(0,25,0));
  fillLight.target.position.copy(center);
  fillLight.castShadow=false;
  staged.add(sun,sun.target,ambient,fillLight,fillLight.target);
  staged.traverse(obj=>{if(obj.isMesh){obj.castShadow=true;obj.receiveShadow=true;}});
  const shot=option.camera;
  const outputCamera=new THREE.PerspectiveCamera(shot.fov,16/9,.05,3000);
  outputCamera.position.fromArray(shot.position);
  outputCamera.lookAt(new THREE.Vector3(...shot.target));
  const targetDistance=outputCamera.position.distanceTo(new THREE.Vector3(...shot.target));
  const focus=cameraFocusSettings({radius:Math.max(1,diameter/2,targetDistance/3),
    fov:shot.fov,aspect:16/9});
  outputCamera.near=focus.near;
  outputCamera.far=Math.max(focus.far,targetDistance*3);
  outputCamera.updateProjectionMatrix();
  return {scene:staged,camera:outputCamera,
    release(){
      for(const mat of temporaryMaterials)mat.dispose();
      // Preserve shared source geometry/materials: only new helper geometry
      // created for stage extras may be released, but stage references become GC-eligible.
      staged.clear();
    }};
}
