// v2.2.1 — non-destructive camera framing for arbitrary-scale OBJ/GLB meshes.
// Camera-only outputs in world metres; source geometry and root transforms untouched.
import {fitDistance} from "./modeling-quality.js";
export const MAX_FOCUS_DISTANCE=500000;
export function cameraFocusSettings({radius,fov,aspect,padding=1.3}) {
  if(!Number.isFinite(radius)||radius<=0)throw Error("프레이밍할 3D 크기를 확인하세요.");
  const raw=fitDistance(radius,fov,aspect,padding);
  const distance=Math.min(MAX_FOCUS_DISTANCE,Math.max(.5,raw));
  // OrbitControls.maxDistance must grow with site scale; the former 800m
  // hard-limit made large imported OBJ sites impossible to inspect.
  const maxDistance=Math.max(800,Math.min(MAX_FOCUS_DISTANCE*2,distance*3));
  const near=Math.max(.01,Math.min(2,distance/150000));
  const far=Math.max(3000,Math.min(5000000,Math.max(distance*6,radius*5)));
  return {distance,maxDistance,near,far,limited:raw>MAX_FOCUS_DISTANCE};
}
export function shouldAutoFocusImportedSite(siteRadius,artCenterDistance){
  if(!Number.isFinite(siteRadius)||!Number.isFinite(artCenterDistance)||
      siteRadius<0||artCenterDistance<0) return false;
  return siteRadius>80||artCenterDistance>160;
}
