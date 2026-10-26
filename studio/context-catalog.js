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
  {kind:"tree-round",label:"활엽수 A · 둥근형",category:"planting",keywords:"활엽수 나무 green tree deciduous 둥근 수관 A"},
  {kind:"tree-cone",label:"침엽수 A · 기본 원추",category:"planting",keywords:"침엽수 소나무 conifer pine evergreen 원추형 A"},
  {kind:"tree-birch",label:"자작나무 A · 단일 줄기",category:"planting",keywords:"자작나무 하얀나무 birch white tree A"},
  {kind:"tree-autumn",label:"가을 수목",category:"planting",keywords:"autumn foliage"},
  {kind:"shrub",label:"덤불 A · 둥근 군락",category:"planting",keywords:"관목 덤불 bush hedge 둥근 A"},
  {kind:"shrub-flower",label:"꽃 덤불 A · 기본 꽃군락",category:"planting",keywords:"꽃덤불 꽃나무 관목 flowering shrub garden A"},
  {kind:"grass-patch",label:"잔디 패치",category:"planting",keywords:"grass lawn meadow"},
  // v3.2: A uses the exact old kind/geometry; B/C are separate saved extras.
  {kind:"tree-round-b",label:"활엽수 B · 넓게 갈라진 수형",category:"planting",keywords:"활엽수 나무 tree deciduous spreading broad forked B"},
  {kind:"tree-round-c",label:"활엽수 C · 세로형 수관",category:"planting",keywords:"활엽수 나무 tree deciduous columnar upright C"},
  {kind:"tree-cone-b",label:"침엽수 B · 가느다란 원추",category:"planting",keywords:"침엽수 전나무 conifer slender evergreen B"},
  {kind:"tree-cone-c",label:"침엽수 C · 가지 드러난 층형",category:"planting",keywords:"침엽수 pine conifer exposed branches layered C"},
  {kind:"tree-birch-b",label:"자작나무 B · 세 줄기 군락",category:"planting",keywords:"자작나무 birch three multi trunk cluster B"},
  {kind:"tree-birch-c",label:"자작나무 C · 기울어진 풍성형",category:"planting",keywords:"자작나무 birch leaning full asymmetric C"},
  {kind:"tree-maple-a",label:"단풍나무 A · 녹색 수관",category:"planting",keywords:"단풍나무 maple green spring leaves A"},
  {kind:"tree-maple-b",label:"단풍나무 B · 넓은 붉은 수관",category:"planting",keywords:"단풍나무 maple red crimson autumn wide B"},
  {kind:"tree-maple-c",label:"단풍나무 C · 비대칭 주황 수관",category:"planting",keywords:"단풍나무 maple orange autumn asymmetric Japanese C"},
  {kind:"tree-cherry-a",label:"벚꽃나무 A · 둥근 꽃 수관",category:"planting",keywords:"벚꽃나무 벛꽃나무 cherry blossom sakura pink round A"},
  {kind:"tree-cherry-b",label:"벚꽃나무 B · 수평 확장 수관",category:"planting",keywords:"벚꽃나무 벛꽃나무 cherry blossom broad spreading B"},
  {kind:"tree-cherry-c",label:"벚꽃나무 C · 늘어진 가지",category:"planting",keywords:"벚꽃나무 벛꽃나무 cherry blossom weeping branches C"},
  {kind:"shrub-b",label:"덤불 B · 낮게 퍼지는 형",category:"planting",keywords:"덤불 관목 hedge low wide spreading shrub B"},
  {kind:"shrub-c",label:"덤불 C · 자연 비대칭형",category:"planting",keywords:"덤불 관목 bush natural asymmetrical shrub C"},
  {kind:"shrub-flower-b",label:"꽃 덤불 B · 넓은 꽃군락",category:"planting",keywords:"꽃덤불 꽃관목 flower shrub bloom spreading B"},
  {kind:"shrub-flower-c",label:"꽃 덤불 C · 키 큰 자연형",category:"planting",keywords:"꽃덤불 꽃관목 flower shrub natural upright C"},
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
