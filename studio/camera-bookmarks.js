// v2.9 — Three persistent, camera-only bookmarks per project.
// Never saves or mutates scene geometry, materials, artwork, site or MASTER.
export const CAMERA_SLOTS=Object.freeze(["1","2","3"]);
export function validCameraPose(pose){
  const triple=a=>Array.isArray(a)&&a.length===3&&a.every(n=>
    typeof n==="number"&&Number.isFinite(n)&&Math.abs(n)<1000000);
  return !!pose&&typeof pose==="object"&&
    triple(pose.position)&&triple(pose.target)&&
    Number.isFinite(pose.fov)&&pose.fov>=10&&pose.fov<=120&&
    Math.hypot(...pose.position.map((v,i)=>v-pose.target[i]))>.0001;
}
export function validCameraBookmarks(value){
  return !!value&&typeof value==="object"&&!Array.isArray(value)&&
    Object.keys(value).length<=CAMERA_SLOTS.length&&
    Object.entries(value).every(([slot,pose])=>
      CAMERA_SLOTS.includes(slot)&&validCameraPose(pose));
}
export function bookmarkCamera(bookmarks,slot,pose){
  if(!CAMERA_SLOTS.includes(slot)||!validCameraPose(pose)||
     !validCameraBookmarks(bookmarks))throw Error("카메라 시점 저장값이 유효하지 않습니다.");
  return {...bookmarks,[slot]:{
    position:[...pose.position],target:[...pose.target],fov:pose.fov
  }};
}
export function savedCameraCount(value){
  return validCameraBookmarks(value)?Object.keys(value).length:0;
}
