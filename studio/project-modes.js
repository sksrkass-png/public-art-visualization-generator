// AXOO v3.5 - model-independent spatial project modes. No scene mutation.
// Changing a mode only changes UI emphasis. Starter layouts require an explicit click.
export const PROJECT_MODE_DEFAULT = "public-art";
export const PROJECT_MODES = Object.freeze({
  "public-art": Object.freeze({
    label:"PUBLIC ART", title:"공공미술 설치 제안", icon:"🗿",
    description:"작품 원형·현장·설치 위치·실측 치수와 MASTER LOCK을 우선하는 공공미술 심의·제안 모드",
    assetKinds:["black-nameplate","plinth","park-bench","round-planter","point-light","bollard","person-man","person-woman","tree-round","shrub","lawn-tile","walkway-tile"],
    checks:["작품의 실제 W×D×H 및 제작 재질 확인","현장 입면·조경·보행로의 원본 형상 유지","기단·설치 위치·방향·크기 검토","MASTER 승인 후 8컷 일치 확인"],
    templateLabel:"공공미술 안내·휴식 예시 배치",
    starter:[
      {kind:"black-nameplate",x:3,z:2,r:0},
      {kind:"park-bench",x:-3,z:3,r:0},
      {kind:"round-planter",x:4,z:-2,r:0},
      {kind:"person-man",x:-1.5,z:3,r:0}
    ]
  }),
  "popup-retail": Object.freeze({
    label:"POP-UP & RETAIL", title:"브랜드 팝업·리테일", icon:"🛍️",
    description:"브랜드 경험을 위한 가벽·상품 진열·운영 카운터·미디어 화면·동선을 조합하는 공간 시안 모드",
    assetKinds:["modular-wall","retail-shelf","display-podium","brand-counter","media-screen","signage-totem","experience-kiosk","person-man","person-woman","round-planter","point-light"],
    checks:["브랜드 조형물과 가벽·가구의 실제 치수 확인","진입·회유·체험·결제 동선 간섭 검토","미디어·전기·조명의 위치 및 안전 검토","사용자 제공 BI·IP·그래픽의 승인본만 사용"],
    templateLabel:"팝업 쇼룸 기본 배치",
    starter:[
      {kind:"modular-wall",x:-3,z:-3,r:0},
      {kind:"modular-wall",x:0,z:-3,r:0},
      {kind:"retail-shelf",x:-3,z:-2,r:0},
      {kind:"brand-counter",x:2.5,z:2,r:Math.PI},
      {kind:"display-podium",x:0,z:0,r:0},
      {kind:"signage-totem",x:-3,z:3,r:0},
      {kind:"experience-kiosk",x:3,z:-1.5,r:0}
    ]
  }),
  exhibition: Object.freeze({
    label:"EXHIBITION DESIGN", title:"아트·브랜드 전시", icon:"🏛️",
    description:"전시 가벽·작품 받침·미디어·조명을 계획하는 전시 설계용 개념 시안 모드",
    assetKinds:["modular-wall","display-podium","media-screen","signage-totem","point-light","black-nameplate","park-bench","person-man","person-woman","round-planter"],
    checks:["가벽·전시물의 실측 폭·높이·고정 방식 확인","관람 동선 및 출입구·피난 공간 확인","미디어와 작품 간 반사·조도·시야 확인","구조·전기·소방 도면은 별도 전문 검토"],
    templateLabel:"소형 전시 갤러리 예시 배치",
    starter:[
      {kind:"modular-wall",x:-3,z:-2.5,r:Math.PI/2},
      {kind:"modular-wall",x:3,z:-2.5,r:Math.PI/2},
      {kind:"media-screen",x:0,z:-3,r:0},
      {kind:"display-podium",x:-1.5,z:0,r:0},
      {kind:"display-podium",x:1.5,z:0,r:0},
      {kind:"signage-totem",x:-3,z:3,r:0},
      {kind:"park-bench",x:0,z:3,r:Math.PI}
    ]
  }),
  "spatial-branding": Object.freeze({
    label:"SPATIAL BRANDING", title:"공간 브랜딩·거리 연출", icon:"📍",
    description:"브랜드 사이니지·거리 시설물·조경·안내 사인을 함께 검토하는 장소 기반 공간 연출 모드",
    assetKinds:["signage-totem","media-screen","modular-wall","park-bench","round-planter","bollard","tree-round","tree-autumn","tree-maple-a","shrub","walkway-tile","point-light","person-man","person-woman"],
    checks:["옥외 설치 허용 위치·보행 유효폭·관리 주체 확인","사인 가독성 및 야간 경관·조명 검토","옥외 재질·내구성·기초·전기 등 전문 검토","현장 건물·조경·시설물은 승인 없이 변경 금지"],
    templateLabel:"거리형 사인·휴게 요소 예시 배치",
    starter:[
      {kind:"signage-totem",x:-5,z:0,r:0},
      {kind:"park-bench",x:0,z:2.5,r:0},
      {kind:"round-planter",x:2.5,z:2.5,r:0},
      {kind:"bollard",x:-2,z:0,r:0},
      {kind:"bollard",x:0,z:0,r:0},
      {kind:"bollard",x:2,z:0,r:0},
      {kind:"point-light",x:4,z:0,r:0}
    ]
  })
});
export const PROJECT_MODE_IDS=Object.freeze(Object.keys(PROJECT_MODES));
export function validProjectMode(mode){return PROJECT_MODE_IDS.includes(mode);}
export function normalizedProjectMode(mode){return validProjectMode(mode)?mode:PROJECT_MODE_DEFAULT;}
export function projectModeConfig(mode){return PROJECT_MODES[normalizedProjectMode(mode)];}
export function recommendedAssetKinds(mode){return [...projectModeConfig(mode).assetKinds];}
export function starterLayout(mode){return projectModeConfig(mode).starter.map(item=>({...item}));}
export function validateModeStarter(mode,available){
  if(!validProjectMode(mode))return false;
  return projectModeConfig(mode).starter.every(item=>
    available.includes(item.kind) &&
    ["x","z","r"].every(key=>Number.isFinite(item[key])&&Math.abs(item[key])<1000));
}
