import * as THREE from "three";

// MASTER VIEW is an approved camera, not an inferred artist/site modification.
// Derive seven secondary viewpoints relative to the approved camera bearing.
export const STANDARD_VIEWS = Object.freeze([
  {key:"01-main", label:"Main Perspective"},
  {key:"02-eye", label:"Eye Level"},
  {key:"03-left", label:"Left 3/4"},
  {key:"04-right", label:"Right 3/4"},
  {key:"05-rear", label:"Rear"},
  {key:"06-aerial", label:"Aerial"},
  {key:"07-long", label:"Long Shot"},
  {key:"08-detail", label:"Close-up"}
]);
export function createStandardCameras(masterCamera, bounds) {
  if (!masterCamera || !Array.isArray(masterCamera.position) || !Array.isArray(masterCamera.target))
    throw Error("A saved MASTER camera is required.");
  const original = new THREE.Vector3().fromArray(masterCamera.position);
  const target = new THREE.Vector3().fromArray(masterCamera.target);
  const delta = original.clone().sub(target);
  const flat = new THREE.Vector3(delta.x, 0, delta.z);
  if(flat.lengthSq()<1e-8) flat.set(0,0,1);
  flat.normalize();
  const originalDistance = Math.max(2, delta.length());
  const size = bounds.getSize(new THREE.Vector3());
  const artCenter = bounds.getCenter(new THREE.Vector3());
  const radius = Math.max(1.2, size.length() / 2);
  const turn = radians => flat.clone().applyAxisAngle(new THREE.Vector3(0,1,0),radians);
  const make = (key,label,p,t=target) => ({
    key,label,
    position:p.toArray().map(x=>Number(x.toFixed(5))),
    target:t.toArray().map(x=>Number(x.toFixed(5))),
    fov:masterCamera.fov,
  });
  const dist=Math.max(originalDistance, radius*3.2);
  const eyeHeight=Math.max(1.65, bounds.min.y+1.65);
  const shotEye=new THREE.Vector3(target.x,eyeHeight,target.z)
    .addScaledVector(flat,dist);
  const shots = [
    make("01-main","Main Perspective", original,target),
    make("02-eye","Eye Level",shotEye,target),
    make("03-left","Left 3/4",target.clone().addScaledVector(turn(-Math.PI/4),dist).add(new THREE.Vector3(0,dist*.28,0))),
    make("04-right","Right 3/4",target.clone().addScaledVector(turn(Math.PI/4),dist).add(new THREE.Vector3(0,dist*.28,0))),
    make("05-rear","Rear",target.clone().addScaledVector(turn(Math.PI),dist).add(new THREE.Vector3(0,dist*.2,0))),
    make("06-aerial","Aerial",target.clone().addScaledVector(flat,dist*.36).add(new THREE.Vector3(0,dist*1.8,0))),
    make("07-long","Long Shot",target.clone().addScaledVector(flat,dist*2.25).add(new THREE.Vector3(0,dist*.6,0))),
    make("08-detail","Close-up",artCenter.clone().addScaledVector(flat,Math.max(2.4,radius*2.3)).add(new THREE.Vector3(0,radius*.24,0)),artCenter)
  ];
  return shots;
}
export function captureSceneIntegrity({artRoot,siteRoot,extrasRoot,artworkMaterialState,layerState}) {
  const digest = root => {
    const out=[];
    root.traverse(child=>{
      out.push({
        name:child.name,
        type:child.type,
        position:child.position.toArray(),
        quaternion:child.quaternion.toArray(),
        scale:child.scale.toArray(),
        geometry:child.geometry?.uuid ?? null,
        materials:child.material ? (Array.isArray(child.material)?child.material:[child.material]).map(x=>x.uuid) : null,
        visible:child.visible
      });
    });
    return out;
  };
  return JSON.stringify({
    artwork:digest(artRoot),
    site:digest(siteRoot),
    extras:digest(extrasRoot),
    material:artworkMaterialState,
    layers:layerState
  });
}
export function masterConsistency(master, state) {
  if(!master || !state) return {ok:false,issues:["승인된 MASTER VIEW가 없습니다."]};
  const issues=[];
  const compare=(a,b,label)=>{
    if(JSON.stringify(a)!==JSON.stringify(b))issues.push(label+" 변경이 감지됐습니다.");
  };
  compare(master.artworkTransform,state.artworkTransform,"작품 배치");
  if(master.siteSetup!==undefined)compare(master.siteSetup,state.siteSetup,"현장 원점·단위 설정");
  compare(master.extras??[],state.extras,"식재·조명");
  if(master.layers!==undefined)compare(master.layers,state.layers,"레이어");
  if(master.library!==undefined)compare(master.library,state.library,"참조 GLB 라이브러리");
  if(master.material!==undefined)compare(master.material,state.material,"작품 재질");
  if(master.siteFile!==state.siteFile)issues.push("현장 파일이 승인 당시와 다릅니다.");
  if(master.artworkFile!==state.artworkFile)issues.push("작품 파일이 승인 당시와 다릅니다.");
  return {ok:issues.length===0,issues};
}
export function validateBatchManifest(manifest){
  return !!manifest && manifest.schema==="axoo-master-render-pack-v1" &&
    Array.isArray(manifest.views) && manifest.views.length===8 &&
    manifest.views.every((view,i)=>view.key===STANDARD_VIEWS[i].key &&
      Array.isArray(view.position) && view.position.length===3 &&
      Array.isArray(view.target) && view.target.length===3 &&
      Number.isFinite(view.width) && Number.isFinite(view.height));
}
