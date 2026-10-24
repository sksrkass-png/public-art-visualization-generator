// v3.0 — independent production audit and render-output verification.
// Read-only diagnostics: never changes imported geometry, material or MASTER.
export const MODEL_TRIANGLE_WARNING=750000;
export const MODEL_MESH_WARNING=2000;
export function sceneFootprint(root){
  let meshes=0,triangles=0,drawMaterials=0,vertices=0;
  root?.traverse(node=>{
    if(!node.isMesh||!node.geometry)return;
    meshes++;
    const geo=node.geometry;
    const position=geo.getAttribute?.("position");
    if(!position)return;
    const copies=node.isInstancedMesh ? Math.max(1,node.count||1) : 1;
    const points=position.count||0;
    vertices+=points*copies;
    triangles+=Math.floor((geo.index?.count||points)/3)*copies;
    drawMaterials+=Array.isArray(node.material)?node.material.length:1;
  });
  return {meshes,triangles,drawMaterials,vertices};
}
export function productionReport({
  project="",siteModel=false,artworkModel=false,masterApproved=false,
  masterMatches=false,site={},artwork={},extras={},output={},
  gpuContextLost=false
}={}){
  const warnings=[],blockers=[];
  if(!siteModel)warnings.push("실제 현장 3D 원본이 없습니다. 예시 공간은 심의용 실측 자료가 아닙니다.");
  if(!artworkModel)warnings.push("작가 승인 작품의 실제 3D 원본이 없습니다.");
  if(!masterApproved)blockers.push("MASTER VIEW 미승인 — 최종 8컷 출력 불가");
  else if(!masterMatches)blockers.push("승인 MASTER와 현재 장면의 내용이 일치하지 않습니다.");
  if(gpuContextLost)blockers.push("WebGL 장치가 연결을 잃었습니다. GPU 복원 후 출력하세요.");
  const totalMeshes=(site.meshes||0)+(artwork.meshes||0)+(extras.meshes||0);
  const totalTriangles=(site.triangles||0)+(artwork.triangles||0)+(extras.triangles||0);
  if(totalTriangles>MODEL_TRIANGLE_WARNING)
    warnings.push("3D 삼각형 "+totalTriangles.toLocaleString("ko-KR")+
      "개 — 복잡한 현장에서는 GPU 부하가 클 수 있습니다.");
  if(totalMeshes>MODEL_MESH_WARNING)
    warnings.push("3D 메시 "+totalMeshes.toLocaleString("ko-KR")+
      "개 — 뷰포트 이동·렌더링이 느릴 수 있습니다.");
  if(output.limited)warnings.push("PNG 해상도가 GPU 또는 2천만 화소 한도에 맞춰 축소됩니다.");
  if(!(output.width>0&&output.height>0))warnings.push("PNG 출력 크기를 확인해야 합니다.");
  if(output.width*output.height>14000000)
    warnings.push("PNG 1장에 1,400만 화소 이상 — 기기 메모리 여유를 확인하세요.");
  if(!siteModel||!artworkModel)warnings.push(
    "실전 제출 전 실측 도면·설치 좌표·작품 원본·작가 승인·법정 안전 요건은 별도 확인해야 합니다.");
  const state=blockers.length?"blocked":warnings.length?"review":"candidate";
  return {schema:"axoo-production-audit-v3",project,state,blockers,warnings,
    metrics:{site,artwork,extras,totalMeshes,totalTriangles,
      output:{width:output.width||0,height:output.height||0,limited:!!output.limited}},
    notice:"사내 시각화·파일 상태 진단입니다. 현장 측량, 구조 안전, 법적 심의 승인 또는 사진 수준 렌더 품질 인증이 아닙니다."};
}
export function verifyPngCapture(dataURL,width,height){
  if(typeof dataURL!=="string"||!dataURL.startsWith("data:image/png;base64,"))
    throw Error("PNG 이미지 데이터가 없습니다.");
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1)
    throw Error("기대 PNG 해상도가 올바르지 않습니다.");
  // Decode only the first 33 bytes; avoid allocating another full-size PNG.
  let prefix;
  try{prefix=atob(dataURL.slice(22,70));}
  catch{throw Error("PNG 인코딩을 확인할 수 없습니다.");}
  const sig=[137,80,78,71,13,10,26,10];
  if(sig.some((n,i)=>prefix.charCodeAt(i)!==n)||prefix.slice(12,16)!=="IHDR")
    throw Error("PNG 헤더가 올바르지 않습니다.");
  const uint=i=>((prefix.charCodeAt(i)*16777216)+
    (prefix.charCodeAt(i+1)<<16)+(prefix.charCodeAt(i+2)<<8)+prefix.charCodeAt(i+3))>>>0;
  const actualWidth=uint(16),actualHeight=uint(20);
  if(actualWidth!==width||actualHeight!==height)
    throw Error("렌더링 PNG 해상도 불일치: "+actualWidth+"×"+actualHeight+
      " (예상 "+width+"×"+height+")");
  return {width:actualWidth,height:actualHeight};
}
export function assertRendererAvailable(renderer){
  if(renderer?.getContext?.()?.isContextLost?.())
    throw Error("WebGL 그래픽 장치 연결이 끊겼습니다. 브라우저의 GPU 상태를 확인한 뒤 다시 출력하세요.");
  if(!renderer?.domElement||renderer.domElement.width<1||renderer.domElement.height<1)
    throw Error("렌더 화면을 생성할 수 없습니다.");
}
