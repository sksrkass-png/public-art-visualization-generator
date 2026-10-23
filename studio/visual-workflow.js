// AXOO Studio v2.3–v2.5. Pure planning calculations, not certified BIM / safety checks.
// All spatial values are viewer metres and world AABBs (may overreport gaps/overlaps).
export const VISUAL_SLOTS=Object.freeze(["A","B","C"]);
export const WALKING_EYE_HEIGHT=1.6;
export const MAX_CLEARANCE_ACTORS=120,MAX_CLEARANCE_SITE=2500;
const finite=n=>typeof n==="number"&&Number.isFinite(n);
const point=v=>Array.isArray(v)&&v.length===3&&v.every(n=>finite(n)&&Math.abs(n)<=1000000);
export function validBounds(v){
  return !!v&&point(v.min)&&point(v.max)&&v.min.every((n,i)=>n<=v.max[i]);
}
export function worldAabbDistance(a,b){
  if(!validBounds(a)||!validBounds(b))throw Error("올바른 현장 경계값이 필요합니다.");
  let sum=0;
  for(let i=0;i<3;i++){
    const d=Math.max(0,a.min[i]-b.max[i],b.min[i]-a.max[i]);
    sum+=d*d;
  }
  return Math.sqrt(sum);
}
export function preliminaryClearances(artworks,buildings,threshold=1.5){
  if(!Array.isArray(artworks)||!Array.isArray(buildings)||
    !finite(threshold)||threshold<0||threshold>25)
    throw Error("안전 거리 검사 입력을 확인하세요.");
  const actors=artworks.slice(0,MAX_CLEARANCE_ACTORS).filter(x=>validBounds(x.bounds));
  const sites=buildings.slice(0,MAX_CLEARANCE_SITE).filter(x=>validBounds(x.bounds));
  const warnings=[];
  for(const art of actors){
    for(const site of sites){
      const gap=worldAabbDistance(art.bounds,site.bounds);
      if(gap<=threshold)
        warnings.push({actor:art.name,site:site.name,gapM:Number(gap.toFixed(3)),
          status:gap===0?"overlap":"near"});
    }
  }
  warnings.sort((a,b)=>a.gapM-b.gapM);
  return {warnings,threshold,checkedActors:actors.length,checkedBuildings:sites.length,
    truncated:artworks.length>MAX_CLEARANCE_ACTORS||buildings.length>MAX_CLEARANCE_SITE};
}
export function validVariant(candidate){
  if(!candidate||!VISUAL_SLOTS.includes(candidate.slot) ||
    !point(candidate.camera?.position)||!point(candidate.camera?.target) ||
    !finite(candidate.camera?.fov)||candidate.camera.fov<=1||candidate.camera.fov>=170 ||
    typeof candidate.sourceArt!=="string"||typeof candidate.sourceSite!=="string"||
    !candidate.scene||typeof candidate.scene!=="object"||
    !candidate.lighting||typeof candidate.lighting!=="object" ||
    typeof candidate.render!=="object"||candidate.render===null)return false;
  if(!candidate.scene.artwork||!Array.isArray(candidate.scene.extras)||
    candidate.scene.extras.length>120)return false;
  if(Object.values(candidate.lighting).some(x=>!finite(x)))return false;
  if(candidate.name!==undefined&&(typeof candidate.name!=="string"||candidate.name.length>40))return false;
  return true;
}
export function validVariants(v){
  return !!v&&typeof v==="object"&&!Array.isArray(v)&&
    Object.keys(v).every(slot=>VISUAL_SLOTS.includes(slot)&&
      v[slot]?.slot===slot&&validVariant(v[slot]));
}
export function visualReadiness({realSite,realArtwork,masterApproved,masterConsistent,
  dimensionsM,clearance,hasLighting}){
  const warnings=[];
  if(!realSite)warnings.push("실제 건축·조경 현장 파일이 아닌 예시 배경입니다.");
  if(!realArtwork)warnings.push("실제 작품 원본 파일이 아닌 샘플 작품입니다.");
  if(!Array.isArray(dimensionsM)||dimensionsM.length!==3||
      dimensionsM.some(x=>!finite(x)||x<=0))
    warnings.push("작품의 실제 W/D/H가 유효하지 않습니다.");
  if(!hasLighting)warnings.push("장면 조명 설정을 확인하세요.");
  if(!masterApproved)warnings.push("최종 MASTER 승인이 필요합니다.");
  else if(!masterConsistent)warnings.push("현재 장면이 승인된 MASTER와 다릅니다.");
  if(clearance?.truncated)warnings.push("현장 이격거리 검사 범위를 초과해 일부 메시가 미검사 상태입니다.");
  if(clearance?.warnings?.some(x=>x.status==="overlap"))
    warnings.push("현장·조형물 외접 경계 중첩 후보가 있습니다. 실제 메시와 설치 상세를 확인하세요.");
  return {ready:warnings.length===0,warnings,
    warning:"본 검사 통과는 구조 안전, 실제 보행 허가, 측량 또는 법정 심의를 인증하지 않습니다."};
}
export function visualPackageManifest({project,slots,width,height,warnings}){
  if(typeof project!=="string"||!Array.isArray(slots)||slots.length===0||
      slots.some(s=>!VISUAL_SLOTS.includes(s))||new Set(slots).size!==slots.length||
      !Number.isInteger(width)||!Number.isInteger(height)||width<=0||height<=0)
    throw Error("시안 비교 출력 범위가 유효하지 않습니다.");
  return {
    schema:"axoo-visual-options-v1",project,
    renderer:"Three.js WebGL PBR, not AI photorealism",
    width,height,slots:[...slots],
    filenames:slots.map(slot=>slot+"-visual.png"),
    warnings:[...warnings,
      "설치 이격거리와 간섭은 경계박스(AABB) 기준 예비 검토이며 현장 실측·법정 기준 검증이 아닙니다."]
  };
}
