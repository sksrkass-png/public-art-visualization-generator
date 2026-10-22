import * as THREE from "three";

// Conservative axis-aligned world bounding box checks; broad-phase only.
// AABB overlap can report false positives for curved or rotated geometry.
export const MAX_SCENE_AUDIT_OBJECTS=120;
export function rootBounds(root) {
  if(!root || !root.visible) return null;
  const box=new THREE.Box3().setFromObject(root);
  if(box.isEmpty() || ![...box.min.toArray(),...box.max.toArray()].every(Number.isFinite))return null;
  return box;
}
export function boxGap(a,b) {
  if(!a || !b)throw Error("두 개의 유효한 3D 경계가 필요합니다.");
  const components=["x","y","z"].map(axis=>Math.max(0,a.min[axis]-b.max[axis],b.min[axis]-a.max[axis]));
  return Math.hypot(...components);
}
export function boxOverlapVolume(a,b) {
  const extent=["x","y","z"].map(k=>Math.max(0,Math.min(a.max[k],b.max[k])-Math.max(a.min[k],b.min[k])));
  return extent.reduce((p,v)=>p*v,1);
}
export function pairMeasurement(a,b) {
  if(!a || !b || a===b)throw Error("서로 다른 두 객체를 선택하세요.");
  const ca=new THREE.Vector3(),cb=new THREE.Vector3();
  a.getWorldPosition(ca);b.getWorldPosition(cb);
  const ab=rootBounds(a),bb=rootBounds(b);
  if(!ab||!bb)throw Error("숨겨진 오브제나 비어 있는 메시를 측정할 수 없습니다.");
  return {
    centerDistance:ca.distanceTo(cb),
    minimumBoxGap:boxGap(ab,bb),
    overlap:boxOverlapVolume(ab,bb)>1e-8,
    verticalClearance:Math.max(0,ab.min.y-bb.max.y,bb.min.y-ab.max.y)
  };
}
export function sceneInterferences(roots,siteMeshes=[],limit=2500) {
  const actors=roots.slice(0,MAX_SCENE_AUDIT_OBJECTS)
    .filter(root=>root?.visible && !root.userData?.extraKind?.includes("light"))
    .map(root=>({name:root.name,root,box:rootBounds(root)})).filter(item=>item.box);
  const pairs=[];
  for(let i=0;i<actors.length;i++)for(let j=i+1;j<actors.length;j++)
    if(boxOverlapVolume(actors[i].box,actors[j].box)>1e-8)
      pairs.push({first:actors[i].name,second:actors[j].name,type:"object-object"});
  // Explicitly classified 'building' meshes only; no guesswork that the
  // user's imported ground is a wall. The precise triangle test is left to BIM.
  for(const obj of siteMeshes.slice(0,limit)){
    const bounds=rootBounds(obj);
    if(!bounds)continue;
    for(const actor of actors)
      if(boxOverlapVolume(bounds,actor.box)>1e-8)
        pairs.push({first:actor.name,second:obj.name||"Building mesh",type:"object-building"});
  }
  return {pairs,checkedActors:actors.length,checkedBuildings:Math.min(siteMeshes.length,limit),
    truncated:roots.length>MAX_SCENE_AUDIT_OBJECTS || siteMeshes.length>limit};
}
export function validExtraGrouping(data){
  if(!Array.isArray(data))return false;
  return data.every(x=>x.groupId===undefined || x.groupId===null ||
    (Number.isInteger(x.groupId)&&x.groupId>=1&&x.groupId<=120));
}
export function translateGroupPeers(container,selected,delta,allowed=()=>true) {
  const id=selected?.userData?.groupId;
  if(!id || !delta?.isVector3)return 0;
  let moved=0;
  for(const peer of container.children){
    if(peer===selected || peer.userData.groupId!==id)continue;
    if(peer.userData.layerLocked || peer.userData.layerHidden || !peer.visible || !allowed(peer))continue;
    peer.position.add(delta);
    moved++;
  }
  return moved;
}
export function boundsToMeters(box){
  return box?.getSize(new THREE.Vector3()).toArray().map(n=>Number(n.toFixed(3)))||null;
}
