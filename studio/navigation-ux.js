// v2.6 - navigation tuning and pointer click tolerance.
// Pure calculations: do not touch artwork/site geometry, MASTER views or saved camera poses.
export const CLICK_TOLERANCE_PX = 5;
export function isCanvasClick(start,end,threshold=CLICK_TOLERANCE_PX){
  if(!start||!end||start.button!==0||end.button!==0||
      start.pointerId!==end.pointerId)return false;
  const dx=end.x-start.x,dy=end.y-start.y;
  return Number.isFinite(dx)&&Number.isFinite(dy)&&
    dx*dx+dy*dy<=threshold*threshold;
}
export function navigationSpeeds(value,{siteRadius=0,cameraDistance=1}={}){
  const raw=Number(value);
  const speed=Number.isFinite(raw)?Math.min(5,Math.max(.5,raw)):3.4;
  const radius=Number.isFinite(siteRadius)?Math.max(0,siteRadius):0;
  const distance=Number.isFinite(cameraDistance)?Math.max(1,cameraDistance):1;
  // OrbitControls already scales pan with perspective distance. This small,
  // capped assist makes close-up right-button panning usable on vast OBJ sites.
  const boost=radius>80?1+Math.min(.65,.22*Math.sqrt(radius/distance)):1;
  return {
    pan:Math.min(12,speed*1.65*boost),
    rotate:speed*.72,
    zoom:Math.max(.5,speed*.62),
    boost
  };
}
