import JSZip from "https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm";

const $ = id => document.getElementById(id);
const KEYS = ["01-main","02-eye","03-left","04-right","05-rear","06-aerial","07-long","08-detail"];
const CHECKS = ["artwork","site","scale","materials"];
const MAX_ZIP=180*1024*1024;
const MAX_IMAGE=28*1024*1024;
const MAX_UNPACKED=260*1024*1024;
const OUTPUT_SCHEMA="axoo-visual-review-v1";
function fileName(s) { return (s || "review").replace(/[^a-z0-9가-힣_-]/gi,"-").slice(0,50); }
function validManifest(data){
  return !!data && data.schema==="axoo-master-render-pack-v1" &&
    data.master && Number.isInteger(data.master.revision) &&
    Array.isArray(data.views) && data.views.length===8 &&
    data.views.every((v,i)=>v.key===KEYS[i] && v.filename===KEYS[i]+".png" &&
      Number.isInteger(v.width) && v.width>0 && Number.isInteger(v.height) && v.height>0);
}
function setStatus(message){$("review-status").textContent=message;}
async function imageInfo(blob){
  const url=URL.createObjectURL(blob);
  try{
    const img=new Image();
    img.src=url;
    await img.decode();
    return {width:img.naturalWidth,height:img.naturalHeight};
  }finally{URL.revokeObjectURL(url);}
}
export function initVisualReview({isMasterApproved,getMaster}) {
  let baseline=null; // original zip images and manifest
  let reviews={};
  let sourceURLs=[];
  let busy=false;
  const view=$("review-view");
  const original=$("review-original");
  const candidate=$("review-candidate");
  const candidateInput=$("review-candidate-file");
  function clearURLs(){sourceURLs.forEach(URL.revokeObjectURL);sourceURLs=[];}
  function showBlob(img,blob) {
    if(!blob){img.removeAttribute("src");return;}
    const url=URL.createObjectURL(blob);sourceURLs.push(url);img.src=url;
  }
  function markUI(){
    const key=view.value;
    const record=reviews[key]||{};
    for(const k of CHECKS)$("review-"+k).checked=!!record.checks?.[k];
    $("review-note").value=record.note||"";
    $("review-candidate-name").textContent=record.file?.name ||
      "보정 이미지 미등록 — 기존 3D 장면을 변경하지 않습니다.";
    $("review-approve").disabled=!record.blob || !CHECKS.every(k=>record.checks?.[k]) || busy;
    $("review-approve").textContent=record.approved?"검수 승인됨 · 다시 승인":"현재 시점 검수 승인";
    const accepted=Object.values(reviews).filter(r=>r.approved).length;
    $("review-counter").textContent=accepted+" / 8개 시점 검수 승인";
    $("review-export").disabled=!baseline || busy;
  }
  function refresh(){
    clearURLs();
    if(!baseline){
      original.removeAttribute("src");candidate.removeAttribute("src");
      $("review-overlay").hidden=true;
      markUI();
      return;
    }
    const record=reviews[view.value];
    showBlob(original,baseline.images[view.value]);
    showBlob(candidate,record?.blob);
    $("review-overlay").hidden=!record?.blob;
    $("review-candidate-container").style.clipPath =
      "inset(0 "+(100-Number($("review-slider").value))+"% 0 0)";
    markUI();
  }
  function verifiedMaster(){
    const master=getMaster();
    const info=baseline?.manifest?.master;
    return !!isMasterApproved() && !!master && !!info &&
      info.revision===master.revision &&
      info.site===master.siteFile && info.artwork===master.artworkFile;
  }
  async function loadBatch(file){
    if(!file)return;
    if(!isMasterApproved())return setStatus("먼저 현재 프로젝트의 MASTER VIEW를 승인하세요.");
    if(file.size>MAX_ZIP)return setStatus("렌더 ZIP은 180 MB 이하만 지원합니다.");
    busy=true;
    setStatus("기준 렌더 ZIP 검증 중…");
    try{
      const zip=await JSZip.loadAsync(file);
      if(Object.keys(zip.files).length>16)throw Error("예상보다 ZIP 내부 파일이 많습니다.");
      const manifestEntry=zip.file("render-manifest.json");
      if(!manifestEntry || manifestEntry._data?.uncompressedSize>1024*1024)
        throw Error("렌더 매니페스트가 없거나 비정상적으로 큽니다.");
      const manifest=JSON.parse(await manifestEntry.async("string"));
      if(!validManifest(manifest))throw Error("v0.8 이상에서 생성한 표준 8컷 ZIP이 필요합니다.");
      const master=getMaster();
      if(!master || !isMasterApproved() ||
         manifest.master.revision!==master.revision ||
         manifest.master.site!==master.siteFile ||
         manifest.master.artwork!==master.artworkFile){
        throw Error("현재 승인된 MASTER와 ZIP의 Revision·현장·작품이 일치하지 않습니다.");
      }
      const sizes=manifest.views.map(v=>zip.file(v.filename)?._data?.uncompressedSize||0);
      if(sizes.some(n=>n<50||n>MAX_IMAGE) || sizes.reduce((a,b)=>a+b,0)>MAX_UNPACKED)
        throw Error("압축된 이미지의 크기가 허용 범위를 벗어납니다.");
      const images={};
      for(const v of manifest.views){
        const entry=zip.file(v.filename);
        if(!entry)throw Error(v.filename+" 이미지가 누락됐습니다.");
        const blob=await entry.async("blob");
        const info=await imageInfo(blob);
        if(info.width!==v.width || info.height!==v.height)
          throw Error(v.filename+"의 실제 픽셀 크기와 매니페스트가 다릅니다.");
        images[v.key]=blob;
      }
      // Atomic commit after all archive members have passed verification.
      baseline={manifest,images};
      reviews={};
      setStatus("MASTER REV "+manifest.master.revision+
        " 기준 8컷 불러오기 완료 · 실사화 결과 이미지를 시점별로 추가하세요.");
      refresh();
    }catch(error){
      console.error(error);
      setStatus("기준 렌더 불러오기 실패: "+error.message);
    }finally{busy=false;markUI();}
  }
  async function loadCandidate(file){
    if(!file || !baseline)return;
    if(!verifiedMaster())return setStatus("현재 승인 MASTER와 렌더 기준이 달라 다시 확인해야 합니다.");
    if(!["image/png","image/jpeg"].includes(file.type) || file.size>MAX_IMAGE)
      return setStatus("후보 이미지는 28MB 이하 PNG/JPEG만 가능합니다.");
    busy=true;
    try{
      const img=await imageInfo(file);
      const standard=baseline.manifest.views.find(x=>x.key===view.value);
      const referenceRatio=standard.width/standard.height;
      const candidateRatio=img.width/img.height;
      if(Math.abs(referenceRatio-candidateRatio)>0.025)
        throw Error("보정 이미지 비율이 기준 시점과 다릅니다. 같은 화면 비율로 만들어주세요.");
      reviews[view.value]={
        blob:file,file:{name:file.name,type:file.type},checks:{},note:"",approved:false,
        dimensions:img,reviewedAt:null
      };
      setStatus(view.selectedOptions[0].textContent+" 보정 이미지 등록 · 비교 후 항목별 확인 필요");
      refresh();
    }catch(error){
      setStatus("보정 이미지 등록 실패: "+error.message);
    }finally{busy=false;markUI();}
  }
  async function exportReview(){
    if(!baseline || busy)return;
    if(!verifiedMaster())return setStatus("현재 MASTER와 렌더 기준이 일치하지 않습니다.");
    busy=true;$("review-export").disabled=true;
    try{
      const zip=new JSZip();
      const reviewed=Object.entries(reviews).filter(([k,r])=>!!r.blob);
      const allApproved=KEYS.every(k=>reviews[k]?.approved);
      const report={
        schema:OUTPUT_SCHEMA,
        createdAt:new Date().toISOString(),
        baseMaster:baseline.manifest.master,
        overallStatus:allApproved?"human-reviewed-all-8":"incomplete-review",
        humanApprovedCount:KEYS.filter(k=>reviews[k]?.approved).length,
        warning:"Pixel resemblance or these checkboxes do NOT prove exact geometry, artistic approval, surveyed dimensions or authorized use.",
        checks:CHECKS,
        items:KEYS.map(key=>{
          const entry=reviews[key];
          return {
            view:key,
            status:entry?.approved?"human-reviewed":entry?.blob?"pending-review":"no-candidate",
            candidate:entry?.blob?("candidate/"+key+(entry.file.type==="image/png"?".png":".jpg")):null,
            source:"reference/"+key+".png",
            checklist:entry?.checks||{},
            note:entry?.note||"",
            reviewerAttestation:entry?.approved===true,
            reviewedAt:entry?.reviewedAt||null
          };
        })
      };
      for(const key of KEYS)zip.file("reference/"+key+".png",baseline.images[key]);
      for(const [key,r] of reviewed)
        zip.file("candidate/"+key+(r.file.type==="image/png"?".png":".jpg"),r.blob);
      zip.file("visual-review.json",JSON.stringify(report,null,2));
      zip.file("README.txt", "AXOO VISUAL REVIEW · "+report.overallStatus+
        "\nThis is a MANUAL review, not automatic geometric or legal validation."+
        "\nReference pictures are original WebGL renders. Enhanced images are user-provided and may hallucinate details."+
        "\nDo not substitute candidate images for the verified MASTER source files.");
      const blob=await zip.generateAsync({type:"blob",compression:"DEFLATE",compressionOptions:{level:3}});
      const url=URL.createObjectURL(blob);
      const a=document.createElement("a");a.href=url;
      a.download=fileName(baseline.manifest.project)+"-visual-review-"+(allApproved?"APPROVED":"DRAFT")+".zip";
      document.body.append(a);a.click();a.remove();
      setTimeout(()=>URL.revokeObjectURL(url),6000);
      setStatus("검수 ZIP 저장 완료 · "+report.humanApprovedCount+"/8 승인 · "+
        (allApproved?"모든 시점 수동 확인":"미승인 시점 있음 (DRAFT)"));
    }catch(error){console.error(error);setStatus("검수 ZIP 저장 실패: "+error.message);}
    finally{busy=false;markUI();}
  }
  $("review-batch-file").addEventListener("change",e=>loadBatch(e.target.files[0]));
  candidateInput.addEventListener("change",e=>loadCandidate(e.target.files[0]));
  view.addEventListener("change",refresh);
  $("review-slider").addEventListener("input",e=>{
    $("review-candidate-container").style.clipPath="inset(0 "+(100-Number(e.target.value))+"% 0 0)";
    $("review-slider-value").textContent=e.target.value+"%";
  });
  for(const k of CHECKS)$("review-"+k).addEventListener("change",()=>{
    const r=reviews[view.value];if(!r)return;
    r.checks[k]=$("review-"+k).checked;
    r.approved=false;r.reviewedAt=null;
    markUI();
  });
  $("review-note").addEventListener("input",e=>{
    const r=reviews[view.value];
    if(r){r.note=e.target.value.slice(0,3000);r.approved=false;r.reviewedAt=null;}
    markUI();
  });
  $("review-approve").addEventListener("click",()=>{
    if(!verifiedMaster())return setStatus("MASTER 일치 상태를 재확인하세요.");
    const r=reviews[view.value];
    if(!r?.blob || !CHECKS.every(k=>r.checks[k]))return;
    r.approved=true;r.reviewedAt=new Date().toISOString();
    setStatus("수동 검수 완료: "+view.selectedOptions[0].textContent+
      " · 원본 MASTER 모델은 변경되지 않았습니다.");
    markUI();
  });
  $("review-export").addEventListener("click",exportReview);
  refresh();
}
