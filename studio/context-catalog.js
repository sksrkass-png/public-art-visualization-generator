// v2.7 — discoverable local context assets, dimensions and source-safe scaling.
// Catalog is presentation-only. All objects remain separate, optional scene extras.
export const CONTEXT_CATEGORIES=Object.freeze([
  {id:"all",label:"전체"},
  {id:"planting",label:"수목·잔디"},
  {id:"people",label:"인물"},
  {id:"street",label:"거리 가구·차량"},
  {id:"lighting",label:"조명"},
  {id:"surface",label:"바닥·포장"},
  {id:"signage",label:"명판·사이니지"}
]);
export const CONTEXT_CATALOG=Object.freeze([
  {kind:"tree-round",label:"활엽수",category:"planting",keywords:"tree green deciduous"},
  {kind:"tree-cone",label:"침엽수",category:"planting",keywords:"conifer pine"},
  {kind:"tree-birch",label:"자작나무",category:"planting",keywords:"birch white tree"},
  {kind:"tree-autumn",label:"가을 수목",category:"planting",keywords:"autumn foliage"},
  {kind:"shrub",label:"덤불",category:"planting",keywords:"bush hedge"},
  {kind:"shrub-flower",label:"꽃 덤불",category:"planting",keywords:"flower garden"},
  {kind:"grass-patch",label:"잔디 패치",category:"planting",keywords:"grass lawn meadow"},
  {kind:"lawn-tile",label:"잔디밭 3×3m",category:"surface",keywords:"lawn 3x3m 잔디 녹지 바닥"},
  {kind:"walkway-tile",label:"콘크리트 보도 3×3m",category:"surface",keywords:"concrete sidewalk 3x3m 포장 도보"},
  {kind:"black-nameplate",label:"검정 명판",category:"signage",keywords:"nameplate plaque 이호준 접어 만든 별의 비행 안내판"},
  {kind:"person-man",label:"남성 175cm",category:"people",keywords:"human scale mannequin"},
  {kind:"person-woman",label:"여성 160cm",category:"people",keywords:"human scale mannequin"},
  {kind:"park-bench",label:"공원 벤치",category:"street",keywords:"seat bench furniture"},
  {kind:"round-planter",label:"화분",category:"street",keywords:"pot planter furniture"},
  {kind:"car-sedan",label:"승용차 4.5m",category:"street",keywords:"vehicle car sedan"},
  {kind:"bollard",label:"안전 볼라드",category:"street",keywords:"street bollard safety"},
  {kind:"point-light",label:"포인트 조명",category:"lighting",keywords:"spot uplight"}
]);
const cleanText=value=>String(value??"").normalize("NFKC").toLowerCase().trim();
export function filterContextCatalog(query="",category="all"){
  const q=cleanText(query);
  return CONTEXT_CATALOG.filter(item=>
    (category==="all" || item.category===category) &&
    (!q || cleanText(item.label+" "+item.kind+" "+item.keywords).includes(q)));
}
export function uniformHeightScale(currentHeight,targetHeight,currentScale=[1,1,1]){
  const h=Number(currentHeight),t=Number(targetHeight);
  if(!Number.isFinite(h)||h<=.00001||!Number.isFinite(t)||t<.1||t>40||
    !Array.isArray(currentScale)||currentScale.length!==3)
    throw Error("오브제 실측 높이는 0.1~40m 이내에서 지정하세요.");
  const factor=t/h;
  if(currentScale.some(v=>!Number.isFinite(v)||v<=.00001||
    v*factor<=.00001||v*factor>1000))
    throw Error("설정한 높이는 오브제 크기 제한을 벗어납니다.");
  return factor;
}
export function dimensionsLabel(size){
  if(!Array.isArray(size)||size.length!==3||
    size.some(n=>!Number.isFinite(n)||n<0))return "크기 측정 불가";
  return size.map(n=>n.toFixed(2)).join(" × ")+"m (W×H×D)";
}
