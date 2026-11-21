// AXOO v3.7 - read-only browser/ZIP budget checks. No geometry mutation.
// Renderer counters are last-frame statistics; they are not a GPU-memory probe.
export const PROJECT_ZIP_LIMIT = 320 * 1024 * 1024;
export const PROJECT_METADATA_LIMIT = 8 * 1024 * 1024;
export const SCENE_WARN_TRIANGLES = 1_000_000;
export const SCENE_WARN_MESHES = 2_000;
export const SCENE_WARN_DRAWS = 1_000;
export const SCENE_WARN_EXTRAS = 250;

const finitePositive=(n)=>Number.isSafeInteger(n)&&n>=0;
export function archiveBudget(entries,metadataBytes=0,zipLimit=PROJECT_ZIP_LIMIT){
  if(!Array.isArray(entries)||entries.length>160||
    !finitePositive(metadataBytes)||!finitePositive(zipLimit)||zipLimit<=0)
    throw Error("프로젝트 용량 입력이 올바르지 않습니다.");
  let bytes=metadataBytes;
  const labels=new Set();
  const breakdown=[];
  for(const entry of entries){
    if(!entry||typeof entry.label!=="string"||!entry.label||entry.label.length>100||
      labels.has(entry.label)||!finitePositive(entry.bytes))
      throw Error("중복 또는 잘못된 프로젝트 원본 파일 정보입니다.");
    labels.add(entry.label);
    bytes+=entry.bytes;
    if(!Number.isSafeInteger(bytes))throw Error("프로젝트 크기를 계산할 수 없습니다.");
    breakdown.push({label:entry.label,bytes:entry.bytes});
  }
  const rawRatio=bytes/zipLimit;
  return {
    fileCount:breakdown.length,
    metadataBytes,rawBytes:bytes,zipLimit,rawRatio,
    aboveRawBudget:bytes>zipLimit,nearRawBudget:bytes>=zipLimit*.75,
    breakdown:breakdown.sort((a,b)=>b.bytes-a.bytes)
  };
}
export function sceneHealth({meshes=0,triangles=0,extras=0,drawCalls=0,textureCount=0,
  geometryCount=0,archive=null,gpuLost=false}={}){
  const values=[meshes,triangles,extras,drawCalls,textureCount,geometryCount];
  if(values.some(v=>!finitePositive(v))||
    (archive!==null&&(!archive||!finitePositive(archive.rawBytes)||!finitePositive(archive.zipLimit))))
    throw Error("장면 성능 통계가 올바르지 않습니다.");
  const notices=[];
  if(gpuLost)notices.push({level:"block",text:"WebGL 그래픽 연결이 끊겼습니다. 원본 ZIP 백업 후 브라우저/GPU 상태를 점검하세요."});
  if(triangles>SCENE_WARN_TRIANGLES)notices.push({level:"warn",text:"삼각형 100만 개 초과 · 대형 모델/텍스처 경량화를 권장합니다."});
  if(meshes>SCENE_WARN_MESHES)notices.push({level:"warn",text:"메시 2,000개 초과 · 객체 합치기/숨김 작업을 검토하세요."});
  if(drawCalls>SCENE_WARN_DRAWS)notices.push({level:"warn",text:"직전 프레임 Draw call 1,000개 초과 · 저사양 GPU에서 지연 가능성이 있습니다."});
  if(extras>SCENE_WARN_EXTRAS)notices.push({level:"warn",text:"독립 배치 객체 250개 초과 · 에셋과 레이어를 구분해 작업하세요."});
  if(archive?.aboveRawBudget)notices.push({level:"warn",text:"원본 합계가 ZIP 320MB보다 큽니다. 압축률에 따라 저장될 수 있지만 메모리 부족/내보내기 실패 가능성이 높습니다."});
  else if(archive?.nearRawBudget)notices.push({level:"warn",text:"프로젝트 원본 합계가 ZIP 예산의 75% 이상입니다. 내보내기 결과 파일 크기를 확인하세요."});
  return {
    status:notices.some(x=>x.level==="block")?"block":notices.length?"review":"ok",
    notices,
    counts:{meshes,triangles,extras,drawCalls,textureCount,geometryCount},
    archive
  };
}
export function readableBytes(bytes){
  if(!finitePositive(bytes))throw Error("잘못된 용량 값");
  return (bytes/1048576).toFixed(1)+"MB";
}
