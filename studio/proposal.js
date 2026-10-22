import JSZip from "https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm";

const $=id=>document.getElementById(id);
const SHOTS=[
  ["01-main","MAIN PERSPECTIVE","대표 투시도"],
  ["02-eye","EYE LEVEL","보행자 시점"],
  ["03-left","LEFT 3/4","좌측 ¾"],
  ["04-right","RIGHT 3/4","우측 ¾"],
  ["05-rear","REAR VIEW","후면"],
  ["06-aerial","AERIAL","조감도"],
  ["07-long","LONG SHOT","원경"],
  ["08-detail","CLOSE-UP","근경"]
];
const MAX_ZIP_BYTES=190*1024*1024;
const MAX_IMAGE_BYTES=28*1024*1024;
const MAX_TOTAL_PIXELS=8*18000000;
const MAX_TOTAL_UNPACKED=235*1024*1024;
const REVIEW_SCHEMA="axoo-proposal-export-v1";
const escapeHtml=value=>String(value??"").replace(/[&<>"']/g,letter=>({
  "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
})[letter]);
const filename=s=>String(s||"public-art").replace(/[^a-z0-9가-힣_-]/gi,"-").slice(0,55);
function dateValue(){return new Date().toISOString();}
function finiteTriple(value){return Array.isArray(value)&&value.length===3&&value.every(Number.isFinite);}
function numeric(v){return Number.isFinite(v)?Number(v.toFixed(3)):null;}
function writeInfo(htmlValue){return escapeHtml(htmlValue||"미입력");}
export function validateProposalArchive(manifest,master){
  if(!master || !Number.isInteger(master.revision))throw Error("승인된 MASTER VIEW가 필요합니다.");
  if(!manifest || manifest.schema!=="axoo-master-render-pack-v1" ||
    !manifest.qa || manifest.qa.approvedMaster!==true ||
    manifest.qa.unchangedSceneAfter!==true ||
    manifest.qa.sceneSignaturePreserved!==true)
    throw Error("검수 완료된 MASTER 8컷 렌더 패키지만 사용할 수 있습니다.");
  if(manifest.master?.revision!==master.revision ||
    manifest.master.site!==master.siteFile ||
    manifest.master.artwork!==master.artworkFile)
    throw Error("렌더 ZIP의 MASTER revision / 현장 / 작품이 현재 승인본과 다릅니다.");
  if(!Array.isArray(manifest.views)||manifest.views.length!==8)
    throw Error("표준 8개 렌더가 필요합니다.");
  for(let i=0;i<SHOTS.length;i++){
    const shot=manifest.views[i];
    if(shot.key!==SHOTS[i][0] || shot.filename!==SHOTS[i][0]+".png" ||
       !Number.isInteger(shot.width)||!Number.isInteger(shot.height)||
       shot.width<=0||shot.height<=0||shot.width*shot.height>18000000||
       !finiteTriple(shot.position)||!finiteTriple(shot.target)||
       Math.abs(shot.width/shot.height-16/9)>.005)
       throw Error("렌더 시점 또는 이미지 크기 오류: "+SHOTS[i][0]);
  }
  return true;
}
export function makeProposalData(ctx,manifest,fields){
  const metadata={
    artworkTitle:fields.artworkTitle.trim().slice(0,130),
    artistName:fields.artistName.trim().slice(0,130),
    siteLabel:fields.siteLabel.trim().slice(0,160),
    note:fields.note.trim().slice(0,1600)
  };
  const supplied=!!metadata.artworkTitle&&!!metadata.artistName&&!!metadata.siteLabel;
  const ready=ctx.readiness?.status==="ready-for-internal-review" && supplied;
  const extras=Array.isArray(ctx.config.extras)?ctx.config.extras:[];
  const physical=ctx.artworkDimensions.map(numeric);
  const placement=ctx.artworkPosition.map(numeric);
  const statuses=[
    ...(ctx.readiness?.issues||[]),
    ...(!metadata.artworkTitle?["작품명이 입력되지 않았습니다."]:[]),
    ...(!metadata.artistName?["작가명이 입력되지 않았습니다."]:[]),
    ...(!metadata.siteLabel?["설치 현장명이 입력되지 않았습니다."]:[])
  ];
  return {
    schema:REVIEW_SCHEMA,
    createdAt:dateValue(),
    status:ready?"READY_FOR_INTERNAL_REVIEW":"DRAFT",
    statusMeaning:"사내 검토 준비이며 제출 승인·작가 동의·법적/구조적 안전 인증은 아닙니다.",
    project:ctx.config.projectName,
    metadata,
    master:{revision:ctx.master.revision,approvedAt:ctx.master.approvedAt,
      artworkSource:ctx.master.artworkFile,siteSource:ctx.master.siteFile},
    artwork:{
      viewerBoundsWHDMeters:[physical[0],physical[2],physical[1]],
      positionXYZMeters:placement,
      scaleXYZ:ctx.config.artwork.transform.s,
      sourceUnitNote:"기본적으로 뷰어 좌표계(m)의 렌더된 외접 박스 값이며 공인 실측 치수가 아닙니다."
    },
    context:{
      siteFile:ctx.config.site.file,siteUnit:ctx.config.site.unit,siteUp:ctx.config.site.up,
      sceneObjectCount:extras.length,
      supplementarySculptures:extras.filter(x=>x.kind==="artwork-copy" ||
        (x.kind==="custom-glb" && ctx.config.library?.some(a=>a.id===x.assetId&&a.category==="artwork"))).length,
      groupedObjects:extras.filter(x=>x.groupId).length
    },
    lighting:ctx.master.lighting,
    material:ctx.master.material||null,
    audit:ctx.precision||null,
    readiness:ctx.readiness||null,
    render:{renderer:manifest.renderer,views:manifest.views.map(v=>({
      key:v.key,filename:"images/"+v.filename,
      width:v.width,height:v.height,position:v.position,target:v.target,fov:v.fov
    }))},
    unresolved:statuses,
    notices:[
      "원본 3D 작품·건물의 변형은 수행하지 않았으며 MASTER 렌더 8컷을 원본 출처 그대로 구성했습니다.",
      "배치·거리·간섭 검사는 디지털 모델에 대한 예비 검토입니다. 건축물/작품의 실제 치수, 설치 인허가와 안전성은 별도 검증이 필요합니다.",
      "이 출력은 제안서 제작 편의용이며 공식 심사 제출 형식을 보증하지 않습니다.",
      "ZIP은 편집 가능한 전체 프로젝트 백업이 아닙니다. 전체 프로젝트 ZIP을 별도로 보관하세요."
    ]
  };
}
export function proposalHtml(data){
  const esc=escapeHtml;
  const entries=data.render.views;
  const labels=SHOTS.map(x=>x[1]);
  const lines=[
    ["ARTWORK",data.metadata.artworkTitle],
    ["ARTIST",data.metadata.artistName],
    ["SITE",data.metadata.siteLabel],
    ["ARTWORK SOURCE",data.master.artworkSource],
    ["SITE SOURCE",data.master.siteSource],
    ["MASTER REVISION",String(data.master.revision)],
    ["3D BOUNDS W×D×H (m)",data.artwork.viewerBoundsWHDMeters.map(x=>x?.toFixed(3)??"—").join(" × ")],
    ["INSTALL POSITION X / Y / Z (m)",data.artwork.positionXYZMeters.map(x=>x?.toFixed(3)??"—").join(" / ")],
    ["ADDED OBJECTS",String(data.context.sceneObjectCount)],
    ["ADDITIONAL ARTWORKS",String(data.context.supplementarySculptures)]
  ];
  const specs=lines.map(([k,v])=>'<div class="spec"><div class="label">'+esc(k)+'</div><div class="value">'+writeInfo(v)+'</div></div>').join("");
  const warnings=(data.unresolved.length?data.unresolved:["담당자 사내 검수 완료 표시. 실제 공모 요구사항 확인 필요."])
    .map(x=>'<li>'+esc(x)+'</li>').join("");
  const renderSlides=entries.map((v,i)=>'<section class="slide image-slide">'+
    '<header><strong>AXOO / ART & SPACE</strong><span>MASTER REV '+esc(data.master.revision)+' · '+String(i+1).padStart(2,"0")+'/08</span></header>'+
    '<div class="image-holder"><img src="'+esc(v.filename)+'" alt="'+esc(labels[i])+'"/></div>'+
    '<footer><div><span class="index">'+String(i+1).padStart(2,"0")+'</span> '+esc(labels[i])+'</div><span>'+esc(data.metadata.siteLabel||"SITE NOT PROVIDED")+'</span></footer>'+
    '</section>').join("\n");
  const details=data.audit?.interference;
  const auditRows=[
    ["MEASURED 3D DISTANCE",data.audit?.measurement?.distance3DM!==undefined?numeric(data.audit.measurement.distance3DM)+" m":"미측정"],
    ["HORIZONTAL DISTANCE",data.audit?.measurement?.horizontalDistanceM!==undefined?numeric(data.audit.measurement.horizontalDistanceM)+" m":"미측정"],
    ["AABB INTERFERENCE CANDIDATES",details?String(details.pairs?.length??0)+"건":"미검사"],
    ["CLASSIFIED BUILDINGS CHECKED",details?String(details.inspectedBuildingMeshes??0)+"개":"미검사"]
  ];
  const auditSpecs=auditRows.map(([k,v])=>'<div class="spec"><div class="label">'+esc(k)+'</div><div class="value">'+esc(v)+'</div></div>').join("");
  return '<!doctype html><html lang="ko"><head><meta charset="utf-8">'+
    '<meta name="viewport" content="width=device-width,initial-scale=1">'+
    '<meta http-equiv="Content-Security-Policy" content="default-src &#39;none&#39;; img-src &#39;self&#39; data:; style-src &#39;unsafe-inline&#39;">'+
    '<title>'+esc(data.project)+" / AXOO Proposal Sheets</title>"+
    '<style>*{box-sizing:border-box}body{margin:0;background:#222;font-family:"Pretendard","Noto Sans KR",Arial,sans-serif;color:#101419}'+
    '.slide{width:min(100vw,1600px);aspect-ratio:16/9;margin:0 auto 22px;background:#f5f5f2;display:flex;flex-direction:column;page-break-after:always;break-after:page;overflow:hidden;position:relative;padding:3% 4%}'+
    '.slide header,.slide footer{display:flex;align-items:center;justify-content:space-between;font-size:1.15vw;letter-spacing:.09em}.slide header strong{font-weight:900}'+
    '.cover{background:#19252a;color:#fff;justify-content:space-between}.big{font-weight:900;font-size:6.5vw;line-height:1.02;letter-spacing:-.06em;max-width:90%}'+
    '.overline{font-size:1.2vw;letter-spacing:.18em;color:#b5c4c6}.cover .muted{color:#d3d9d9}'+
    '.badge{font-size:1.4vw;background:#fff;color:#17252a;padding:.5em 1.2em;font-weight:800;display:inline-block}'+
    '.image-slide{padding:2% 3%}.image-holder{flex:1;min-height:0;margin:1.4% 0 1%;background:#ddd}.image-holder img{width:100%;height:100%;object-fit:contain;display:block}'+
    '.image-slide footer{font-weight:700}.image-slide .index{color:#e04e35;font-size:2vw;padding-right:1vw}'+
    'h2{font-size:3.3vw;line-height:1.05;letter-spacing:-.05em;margin:3% 0}'+
    '.spec-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1vw 4vw}.spec{padding:1.1vw 0;border-bottom:1px solid #aeb4b3;min-width:0}.label{font-size:1vw;color:#697376;font-weight:800}.value{font-size:1.6vw;font-weight:700;overflow-wrap:anywhere;margin-top:.35em}.note{font-size:1.1vw;line-height:1.7;max-width:90%;white-space:pre-wrap}.audit{background:#ecefed}.audit ul{font-size:1.25vw;line-height:1.75;max-height:22%;overflow:hidden}'+
    '.footnote{font-size:.95vw;line-height:1.5;color:#5d676a}.audit .footnote{margin-top:auto}'+
    '@media print{@page{size:16in 9in;margin:0}html,body{background:#fff} .slide{width:16in;height:9in;min-height:9in;aspect-ratio:auto;margin:0;page-break-after:always}'+
    '.slide header,.slide footer{font-size:14pt}.big{font-size:72pt}.overline{font-size:14pt}.badge{font-size:15pt}'+
    'h2{font-size:37pt}.label{font-size:11pt}.value{font-size:19pt}.spec{padding:15pt 0}.note{font-size:14pt}.audit ul{font-size:15pt}.footnote{font-size:11pt}.image-slide .index{font-size:26pt}}'+
    '</style></head><body>'+
    '<section class="slide cover"><header><strong>AXOO / PUBLIC ART STUDIO</strong><span>'+esc(data.createdAt.slice(0,10))+'</span></header>'+
    '<div><p class="overline">PUBLIC ART · ARCHITECTURAL VISUALIZATION</p><div class="big">'+esc(data.project||"PUBLIC ART PROPOSAL")+
    '</div><p class="overline">'+writeInfo(data.metadata.artworkTitle)+' / '+writeInfo(data.metadata.artistName)+'</p></div>'+
    '<footer><span class="badge">'+esc(data.status)+'</span><span class="muted">'+esc(data.metadata.siteLabel||"SITE UNCONFIRMED")+'</span></footer></section>'+
    '<section class="slide"><header><strong>01 / PROJECT PROFILE</strong><span>MASTER-SOURCE FACTS</span></header>'+
    '<h2>Artwork & Site Overview</h2><div class="spec-grid">'+specs+'</div>'+
    '<p class="footnote">3D 모델 바운딩 박스 수치는 뷰어 기준입니다. 실측·시공 승인 치수가 아닙니다.</p></section>'+
    renderSlides+
    '<section class="slide audit"><header><strong>02 / PLACEMENT QA</strong><span>HUMAN VERIFICATION REQUIRED</span></header>'+
    '<h2>Placement & Review</h2><div class="spec-grid">'+auditSpecs+'</div>'+
    '<p class="note">'+esc(data.metadata.note||"담당자 검토 의견이 입력되지 않았습니다.")+'</p>'+
    '<ul>'+warnings+'</ul>'+
    '<p class="footnote">'+esc(data.statusMeaning)+' · '+esc(data.notices[1])+'</p></section>'+
    '</body></html>';
}
async function inspectPNG(blob,width,height){
  const url=URL.createObjectURL(blob);
  try{
    const img=new Image();img.src=url;await img.decode();
    if(img.naturalWidth!==width || img.naturalHeight!==height)
      throw Error("이미지 실제 픽셀과 렌더 설정이 다릅니다.");
  }finally{URL.revokeObjectURL(url);}
}
export function initProposalExport({getContext}){
  let source=null,reading=false;
  const status=(text)=>{$("proposal-status").textContent=text;};
  function refresh(){
    const ctx=getContext();
    const valid=!!source && !!ctx.master && ctx.locked &&
      source.manifest.master.revision===ctx.master.revision &&
      source.manifest.master.artwork===ctx.master.artworkFile &&
      source.manifest.master.site===ctx.master.siteFile &&
      ctx.matchesMaster;
    $("proposal-export").disabled=!valid || reading;
    if(source&&!valid)status("MASTER가 변경됐습니다. 최신 승인본으로 8컷을 다시 렌더링해 불러와야 합니다.");
  }
  async function importMasterPack(file){
    if(!file)return;
    const ctx=getContext();
    if(!ctx.locked||!ctx.master||!ctx.matchesMaster)
      return status("현재 장면의 MASTER를 먼저 승인하고 일치 상태를 확인하세요.");
    if(file.size>MAX_ZIP_BYTES)return status("렌더 패키지는 190MB 이하만 지원합니다.");
    reading=true;refresh();status("렌더 이미지와 MASTER 정보를 검증하는 중…");
    try{
      const zip=await JSZip.loadAsync(file);
      const items=Object.entries(zip.files).filter(([,v])=>!v.dir);
      const allowed=new Set(["render-manifest.json","REVIEW_NOTES.txt","00-contact-sheet.png",...SHOTS.map(v=>v[0]+".png")]);
      if(items.some(([name])=>!allowed.has(name)))throw Error("렌더 ZIP에 예상하지 못한 파일이 있습니다.");
      const meta=zip.file("render-manifest.json");
      if(!meta || (meta._data?.uncompressedSize||0)>2*1024*1024)throw Error("MASTER 렌더 정보가 없거나 비정상적으로 큽니다.");
      const manifest=JSON.parse(await meta.async("string"));
      validateProposalArchive(manifest,ctx.master);
      const total=manifest.views.reduce((sum,v)=>sum+v.width*v.height,0);
      if(total>MAX_TOTAL_PIXELS)throw Error("전체 출력 픽셀 수가 너무 큽니다.");
      let bytes=0;
      const pictures=new Map();
      for(const shot of manifest.views){
        const member=zip.file(shot.filename);
        const size=member?._data?.uncompressedSize||0;
        if(!member || size<50||size>MAX_IMAGE_BYTES)throw Error(shot.filename+" 이미지 파일 크기 오류");
        bytes+=size;
        if(bytes>MAX_TOTAL_UNPACKED)throw Error("렌더 이미지 압축 해제 용량 제한 초과");
        const blob=await member.async("blob");
        await inspectPNG(blob,shot.width,shot.height);
        pictures.set(shot.key,blob);
      }
      const contactEntry=zip.file("00-contact-sheet.png");
      const contact=contactEntry&&(contactEntry._data?.uncompressedSize||0)<MAX_IMAGE_BYTES?
        await contactEntry.async("blob"):null;
      const current=getContext();
      validateProposalArchive(manifest,current.master);
      if(!current.locked||!current.matchesMaster)throw Error("검증하는 동안 MASTER 상태가 변경됐습니다.");
      source={manifest,pictures,contact};
      status("MASTER REV "+manifest.master.revision+" · 원본 8컷 확인 완료 · 제안서 정보 입력 후 ZIP 제작 가능");
    }catch(error){source=null;console.error(error);status("불러오기 실패: "+error.message);}
    finally{reading=false;refresh();}
  }
  async function exportProposal(){
    if(reading)return;
    const ctx=getContext();
    if(!source||!ctx.locked||!ctx.matchesMaster)return status("현재 승인 MASTER와 일치하는 렌더 ZIP이 필요합니다.");
    try{validateProposalArchive(source.manifest,ctx.master);}
    catch(error){return status(error.message);}
    reading=true;refresh();status("제안서 이미지와 요약 보고서를 제작하는 중…");
    try{
      const data=makeProposalData(ctx,source.manifest,{
        artworkTitle:$("proposal-artwork-title").value,
        artistName:$("proposal-artist").value,
        siteLabel:$("proposal-site-label").value,
        note:$("proposal-note").value
      });
      const zip=new JSZip();
      zip.file("proposal-sheets.html",proposalHtml(data));
      zip.file("proposal-data.json",JSON.stringify(data,null,2));
      zip.file("README.txt","AXOO Public Art / Proposal Pack v1.4\n"+
        "1. Unzip all files into the same directory.\n"+
        "2. Open proposal-sheets.html in a browser, review every slide, and use Print to save as PDF if needed.\n"+
        "3. Images in images/ are original 3D MASTER renders, not AI photorealizations.\n"+
        "4. Status "+data.status+" means "+data.statusMeaning+"\n"+
        "5. NEVER treat model dimensions and AABB checks as surveyed or certified values.\n"+
        "6. Keep the editable full-project ZIP separate from this presentation package.\n");
      for(const [key,blob] of source.pictures)zip.file("images/"+key+".png",blob);
      if(source.contact)zip.file("contact-sheet.png",source.contact);
      if(data.audit)zip.file("precision-audit.json",JSON.stringify(data.audit,null,2));
      if(data.readiness)zip.file("readiness.json",JSON.stringify(data.readiness,null,2));
      const current=getContext();
      validateProposalArchive(source.manifest,current.master);
      if(!current.locked||!current.matchesMaster)throw Error("제작하는 동안 MASTER 상태가 변경됐습니다.");
      const bundle=await zip.generateAsync({type:"blob",compression:"DEFLATE",compressionOptions:{level:3}});
      const url=URL.createObjectURL(bundle);
      const a=document.createElement("a");
      a.href=url;
      a.download=filename(data.project)+"-proposal-"+data.status+"-REV"+data.master.revision+".zip";
      document.body.append(a);a.click();a.remove();
      setTimeout(()=>URL.revokeObjectURL(url),5000);
      status("제안서 패키지 완료 · "+data.status+" · 8컷 렌더 + 16:9 HTML 슬라이드 + 측정/검수 JSON");
    }catch(error){console.error(error);status("제안서 제작 실패: "+error.message);}
    finally{reading=false;refresh();}
  }
  $("proposal-render-file").addEventListener("change",e=>{
    const file=e.target.files[0];e.target.value="";importMasterPack(file);
  });
  $("proposal-export").addEventListener("click",exportProposal);
  $("proposal-refresh").addEventListener("click",refresh);
  refresh();
  return {refresh};
}
