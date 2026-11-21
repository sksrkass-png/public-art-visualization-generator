// AXOO v3.9 — pure, local-only workspace presentation and batch alignment helpers.
// Group motions are explicit transforms of independent placed roots; no geometry edits.
export const WORKSPACE_MODES=Object.freeze(["quick","advanced"]);
export const BATCH_AXES=Object.freeze(["x","z"]);
export const BATCH_ANCHORS=Object.freeze(["min","center","max"]);
export const UX_FAVORITE_CAP=100;
export function validWorkspaceMode(mode){return WORKSPACE_MODES.includes(mode);}
export function cleanAssetFavorites(value,validKinds){
  if(!Array.isArray(value)||!Array.isArray(validKinds))return [];
  const allow=new Set(validKinds),seen=new Set(),out=[];
  for(const key of value){
    if(typeof key==="string"&&allow.has(key)&&!seen.has(key)){
      seen.add(key);out.push(key);
      if(out.length>=UX_FAVORITE_CAP)break;
    }
  }
  return out;
}
export function toggleAssetFavorite(favorites,kind,validKinds){
  const valid=new Set(validKinds);
  if(!valid.has(kind))throw Error("등록되지 않은 에셋입니다.");
  const current=cleanAssetFavorites(favorites,validKinds);
  return current.includes(kind)?current.filter(x=>x!==kind):
    cleanAssetFavorites([...current,kind],validKinds);
}
function safeVector(v){
  return Array.isArray(v)&&v.length===3&&v.every(n=>Number.isFinite(n)&&Math.abs(n)<=1e7);
}
export function validBatchItems(items){
  if(!Array.isArray(items)||items.length<2)return false;
  const seen=new Set();
  return items.every(o=>{
    if(!o||!Number.isSafeInteger(o.id)||o.id<1||seen.has(o.id)||!safeVector(o.position)||
      !safeVector(o.min)||!safeVector(o.max)||
      o.min.some((n,i)=>n>o.max[i]))return false;
    seen.add(o.id);return true;
  });
}
function geometry(items,axis){
  if(!validBatchItems(items)||!BATCH_AXES.includes(axis))
    throw Error("편집 가능한 객체 2개 이상과 X/Z 방향을 확인해 주세요.");
  const i=axis==="x"?0:2;
  return {i,all:items.map(item=>({
    id:item.id,min:item.min[i],max:item.max[i],
    position:item.position[i],center:(item.min[i]+item.max[i])/2,
    extent:item.max[i]-item.min[i]
  }))};
}
export function alignBatch(items,axis="x",anchor="center"){
  if(!BATCH_ANCHORS.includes(anchor))throw Error("정렬 기준이 올바르지 않습니다.");
  const {all}=geometry(items,axis);
  const left=Math.min(...all.map(x=>x.min)),right=Math.max(...all.map(x=>x.max));
  const target=anchor==="min"?left:anchor==="max"?right:(left+right)/2;
  return all.map(o=>({
    id:o.id,delta:target-(anchor==="min"?o.min:anchor==="max"?o.max:o.center)
  }));
}
export function distributeBatch(items,axis="x"){
  const {all}=geometry(items,axis);
  if(all.length<3)throw Error("등간격 배치는 객체 3개 이상을 선택하세요.");
  const ordered=all.slice().sort((a,b)=>a.min-b.min||a.id-b.id);
  const left=ordered[0].min,right=ordered[ordered.length-1].max;
  const width=ordered.reduce((sum,o)=>sum+o.extent,0);
  let gap=(right-left-width)/(ordered.length-1);
  if(gap<-.000001)throw Error("선택 객체 폭이 전체 배치 구간보다 커 등간격으로 배치할 수 없습니다.");
  gap=Math.max(0,gap);
  let cursor=left;
  const result=[];
  for(const o of ordered){
    result.push({id:o.id,delta:cursor-o.min});
    cursor+=o.extent+gap;
  }
  return {moves:result,gapM:gap};
}
export function findSelectableBatchRoots(roots,ids,canEdit){
  if(!Array.isArray(roots)||!(ids instanceof Set)||typeof canEdit!=="function")throw Error("선택 목록이 올바르지 않습니다.");
  const selected=roots.filter(root=>ids.has(root?.userData?.extraId));
  if(selected.length!==ids.size||selected.length<2||selected.some(root=>!canEdit(root)))
    throw Error("잠금·숨김 객체 또는 사라진 객체가 있습니다. 모두 편집 가능한 배치 객체를 다시 선택하세요.");
  return selected;
}
export function assetPreviewType(kind,category){
  const k=String(kind||"");
  if(/(?:tree|shrub|grass)/.test(k))return "plant";
  if(/(?:lawn|walkway)/.test(k))return "surface";
  if(/(?:person|woman|man)/.test(k))return "person";
  if(/(?:car|vehicle)/.test(k))return "vehicle";
  if(/(?:light)/.test(k))return "light";
  if(/(?:screen|kiosk)/.test(k))return "media";
  if(/(?:wall)/.test(k))return "wall";
  if(/(?:shelf|counter|podium)/.test(k))return "display";
  if(/(?:nameplate|totem|signage)/.test(k))return "signage";
  return ["planting","people","street","lighting","surface","signage","architecture","display","media"].includes(category)?category:"object";
}
export const ASSET_PREVIEW_EMOJIS=Object.freeze({
  plant:"🌿",surface:"▦",person:"🚶",vehicle:"🚙",light:"💡",
  media:"▣",wall:"▥",display:"▤",signage:"⚑",object:"◇",
  planting:"🌱",people:"◉",street:"▤",lighting:"✦",
  architecture:"▧"
});
