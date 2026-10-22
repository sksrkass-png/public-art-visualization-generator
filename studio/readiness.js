/**
 * v1.0 internal proposal preflight.
 * Human attestation is not an engineer's structural certificate or an artist
 * copyright/approval document. Nothing in this module mutates the 3D scene.
 */
const FIELDS=[
  ["dimensions","실측 도면과 현장 모델, 작품 W×D×H 비교 확인"],
  ["artwork","작가 승인 작품의 구성·색상·재질과 원본 일치 확인"],
  ["placement","설치 위치·방향·동선·안전 검토 필요사항 확인"],
  ["render","MASTER 8개 시점 렌더와 실사화 후보의 차이 검수"]
];
const $ = id=>document.getElementById(id);
function safeNumber(n) { return typeof n==="number" && Number.isFinite(n) ? Number(n.toFixed(4)) : null; }
export function validateReadiness(conditions,checks){
  if(!conditions || !checks)return {ready:false,issues:["데이터를 불러올 수 없습니다."]};
  const issues=[];
  if(!conditions.realSite)issues.push("실제 현장 3D 모델 파일이 없습니다.");
  if(!conditions.realArtwork)issues.push("실제 작품 3D 모델 파일이 없습니다.");
  if(!conditions.masterApproved)issues.push("현재 MASTER VIEW가 승인되지 않았습니다.");
  if(!conditions.masterMatches)issues.push("현재 장면이 최종 승인 MASTER와 일치하지 않습니다.");
  if(!(conditions.artworkHeight>0))issues.push("작품의 유효한 3D 높이가 없습니다.");
  if(!conditions.sourceUnitsSelected)issues.push("현장 단위·높이축이 설정되지 않았습니다.");
  for(const [key,label] of FIELDS)if(checks[key]!==true)issues.push("수동 검수 미완료: "+label);
  return {ready:issues.length===0,issues};
}
export function initReadiness({getScene}) {
  const checks=Object.fromEntries(FIELDS.map(([key])=>[key,false]));
  let lastReport=null;
  function snapshot(){
    const scene=getScene();
    const assessment=validateReadiness(scene,checks);
    return {
      schema:"axoo-public-art-internal-readiness-v1",
      generatedAt:new Date().toISOString(),
      project:scene.project,
      files:{site:scene.siteFile,artwork:scene.artworkFile},
      source:{siteImported:scene.realSite,artworkImported:scene.realArtwork,
        siteUnit:scene.siteUnit,siteUp:scene.siteUp,
        artworkDimensions:scene.artworkDimensions.map(safeNumber)},
      master:{approved:scene.masterApproved,revision:scene.revision,
        approvedAt:scene.approvedAt,matchingStoredSnapshot:scene.masterMatches},
      humanChecks:{...checks},
      status:assessment.ready?"ready-for-internal-review":"needs-human-or-source-review",
      issues:assessment.issues,
      caveats:[
        "READY is an internal preparation status, NOT structural engineering approval, public permitting, artist consent or certified dimensional survey.",
        "An image comparison cannot automatically verify exact sculpture geometry.",
        "The project and source model files must separately be preserved using Full Project ZIP.",
        "Review with actual site photographs, drawings and construction professionals as required."
      ]
    };
  }
  function evaluate(){
    lastReport=snapshot();
    const state=lastReport.status;
    $("readiness-status").textContent=lastReport.issues.length
      ? "추가 확인 필요 · "+lastReport.issues.length+"개 항목\n"+lastReport.issues.join("\n")
      : "사내 제안서 검토 준비 완료 · 모든 자동 확인과 담당자 체크 완료";
    $("readiness-badge").textContent=state==="ready-for-internal-review"?"사내 검토 준비":"추가 검토 필요";
    $("readiness-badge").dataset.ready=String(state==="ready-for-internal-review");
    $("readiness-export").disabled=false;
    return lastReport;
  }
  for(const [key] of FIELDS)$("ready-"+key).addEventListener("change",e=>{
    checks[key]=e.target.checked;
    evaluate();
  });
  $("readiness-scan").addEventListener("click",evaluate);
  $("readiness-export").addEventListener("click",()=>{
    const report=evaluate();
    const blob=new Blob([JSON.stringify(report,null,2)],{type:"application/json"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");a.href=url;
    a.download=(report.project||"public-art").replace(/[^a-z0-9가-힣_-]/gi,"-").slice(0,45)+"-readiness.json";
    document.body.append(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),5000);
  });
  evaluate();
}
