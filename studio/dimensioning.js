// Public Art 3D Studio v2.1 — pure dimensional/anchor calculations.
// Inputs are VIEWER world metres, not source CAD surveying certification.
export const AXES=["x","y","z"];
export const DIM_MODES=["uniform-height","uniform-width","uniform-depth","independent"];
export const ANCHOR_MODES=["center","front-left","front-right","rear-left","rear-right"];
export const PLINTH_FINISHES=["concrete","stone","metal"];
const validNum=n=>typeof n==="number"&&Number.isFinite(n);
export function validDimensions(d) {
  return Array.isArray(d)&&d.length===3&&d.every(v=>validNum(v)&&v>.00001&&v<=20000);
}
export function fitDimensionScale(currentDimensions,currentScale,targetDimensions,mode,allowDistortion=false) {
  if(!validDimensions(currentDimensions)||!validDimensions(targetDimensions) ||
     !Array.isArray(currentScale)||currentScale.length!==3 ||
     !currentScale.every(v=>validNum(v)&&v>0&&v<=1000) ||
     !DIM_MODES.includes(mode)) throw Error("작품 치수·배율 값이 올바르지 않습니다.");
  if(mode==="independent"&&!allowDistortion)
    throw Error("축별 배율 변경은 작품 비율이 변형되므로 별도 확인이 필요합니다.");
  const factors=targetDimensions.map((v,i)=>v/currentDimensions[i]);
  const primary=mode==="uniform-width"?0:mode==="uniform-depth"?2:1;
  const applied=mode==="independent"?factors:[factors[primary],factors[primary],factors[primary]];
  const result=currentScale.map((v,i)=>Number((v*applied[i]).toFixed(8)));
  if(result.some(v=>v<=.00001||v>=1000))throw Error("조정된 배율이 안전 범위를 초과했습니다.");
  return result;
}
export function anchorOffset(bounds,mode){
  if(!bounds||!Array.isArray(bounds.min)||!Array.isArray(bounds.max)||
    bounds.min.length!==3||bounds.max.length!==3||
    !bounds.min.every(validNum)||!bounds.max.every(validNum)||
    bounds.min.some((v,i)=>v>bounds.max[i])||!ANCHOR_MODES.includes(mode))
    throw Error("정확한 객체 경계와 기준점을 지정하세요.");
  const x=(bounds.min[0]+bounds.max[0])/2,z=(bounds.min[2]+bounds.max[2])/2;
  const anchor={
    center:[x,bounds.min[1],z],
    "front-left":[bounds.min[0],bounds.min[1],bounds.max[2]],
    "front-right":[bounds.max[0],bounds.min[1],bounds.max[2]],
    "rear-left":[bounds.min[0],bounds.min[1],bounds.min[2]],
    "rear-right":[bounds.max[0],bounds.min[1],bounds.min[2]]
  };
  return anchor[mode];
}
export function targetAnchorTranslation(bounds,mode,target) {
  if(!Array.isArray(target)||target.length!==3||!target.every(validNum)||
    target.some(v=>Math.abs(v)>100000))throw Error("기준점 좌표 범위를 확인하세요.");
  const from=anchorOffset(bounds,mode);
  return target.map((v,i)=>Number((v-from[i]).toFixed(6)));
}
export function validPlacementReference(v){
  return !!v&&ANCHOR_MODES.includes(v.mode)&&Array.isArray(v.position)&&
    v.position.length===3&&v.position.every(x=>validNum(x)&&Math.abs(x)<=100000);
}
export function validatePlinthDimensions(width,depth,height) {
  return [width,depth,height].every(n=>validNum(n)&&n>=.05&&n<=30);
}
