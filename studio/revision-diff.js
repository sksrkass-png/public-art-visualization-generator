// AXOO Studio v1.6 — snapshot-only, read-only MASTER revision comparison.
// This cannot inspect source mesh triangles, licensing, surveyed dimensions, or approvals.
export const REVISION_DIFF_SCHEMA = "axoo-master-revision-diff-v1";
const EPS=1e-5, MAX_CHANGES=500;
const LEVEL={critical:"핵심 설계",context:"현장·구성",visual:"표현·출력"};
const isObject=v=>v!==null&&typeof v==="object"&&!Array.isArray(v);
function equal(a,b){
  if(typeof a==="number"&&typeof b==="number")
    return Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<=EPS;
  if(Array.isArray(a)||Array.isArray(b))
    return Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((v,i)=>equal(v,b[i]));
  if(isObject(a)||isObject(b)){
    if(!isObject(a)||!isObject(b))return false;
    const keys=new Set([...Object.keys(a),...Object.keys(b)]);
    return [...keys].every(k=>equal(a[k],b[k]));
  }
  return a===b;
}
function number(v){return typeof v==="number"&&Number.isFinite(v)?Number(v.toFixed(5)):v;}
function safeValue(v,depth=0){
  if(depth>5)return "[depth limit]";
  if(typeof v==="number")return number(v);
  if(typeof v==="string")return v.slice(0,250);
  if(Array.isArray(v))return v.slice(0,140).map(x=>safeValue(x,depth+1));
  if(isObject(v))return Object.fromEntries(Object.entries(v).slice(0,70).map(([k,x])=>[k,safeValue(x,depth+1)]));
  return v===undefined?null:v;
}
function identity(entry){
  return !!entry && Number.isInteger(entry.revision) && entry.revision>=1 &&
    typeof entry.approvedAt==="string"&&!Number.isNaN(Date.parse(entry.approvedAt)) &&
    typeof entry.artworkFile==="string"&&typeof entry.siteFile==="string" &&
    entry.artworkTransform&&["p","r","s"].every(k=>
      Array.isArray(entry.artworkTransform[k])&&entry.artworkTransform[k].length===3&&
      entry.artworkTransform[k].every(Number.isFinite));
}
function fmt(v,unit=""){
  if(v===undefined||v===null)return "미설정";
  if(typeof v==="number")return (Math.round(v*1000)/1000).toString()+unit;
  if(typeof v==="boolean")return v?"표시 / 활성":"숨김 / 비활성";
  if(typeof v==="string")return v.slice(0,110);
  return JSON.stringify(safeValue(v)).slice(0,280);
}
export function compareMasterRevisions(before,after) {
  if(!identity(before)||!identity(after))throw Error("유효한 승인 MASTER 두 건이 필요합니다.");
  if(before.revision===after.revision && before.approvedAt===after.approvedAt)
    throw Error("비교할 MASTER Revision을 서로 다르게 선택하세요.");
  if(Date.parse(before.approvedAt)>Date.parse(after.approvedAt))
    throw Error("기준 Revision은 비교 대상보다 앞서야 합니다.");
  const changes=[], counts={critical:0,context:0,visual:0};
  const add=(group,severity,label,oldValue,newValue,unit="")=>{
    if(equal(oldValue,newValue))return;
    counts[severity]++;
    if(changes.length>=MAX_CHANGES)return;
    changes.push({group,severity,label,previous:safeValue(oldValue),
      current:safeValue(newValue),summary:fmt(oldValue,unit)+" → "+fmt(newValue,unit)});
  };
  const fields=(group,severity,label,a,b)=>{
    const walk=(name,left,right,depth)=>{
      if(equal(left,right))return;
      if(depth<4 && (isObject(left)||isObject(right))){
        const keys=[...new Set([...Object.keys(isObject(left)?left:{}),
          ...Object.keys(isObject(right)?right:{})])].sort();
        if(keys.length && isObject(left)&&isObject(right)){
          for(const key of keys)walk(name+" · "+key,left[key],right[key],depth+1);
          return;
        }
      }
      add(group,severity,name,left,right);
    };
    walk(label,a,b,0);
  };
  for(const [key,label,sev] of [
    ["siteFile","현장 소스 파일","critical"],
    ["artworkFile","작품 소스 파일","critical"],
    ["planFile","배치도 파일","context"]])
      add("source",sev,label,before[key]||"",after[key]||"");
  for(const [field,unit,label] of [
    ["p","m","작품 설치 좌표"],["s","","작품 배율"]]){
    const left=before.artworkTransform[field],right=after.artworkTransform[field];
    for(let i=0;i<3;i++)add("artwork","critical",label+" · "+["X","Y","Z"][i],left[i],right[i],unit);
    if(field==="p"&&!equal(left,right)){
      const d=Math.hypot(...right.map((v,i)=>v-left[i]));
      add("artwork","critical","작품 좌표 이동 거리",0,Number(d.toFixed(5)),"m");
    }
  }
  for(let i=0;i<3;i++)
    add("artwork","critical","작품 회전 · "+["X","Y","Z"][i],
      Number((before.artworkTransform.r[i]*180/Math.PI).toFixed(5)),
      Number((after.artworkTransform.r[i]*180/Math.PI).toFixed(5)),"°");
  fields("artwork","critical","작품 렌더 재질",before.material,after.material);
  function classifyExtra(item){
    if(item?.kind==="artwork-copy")return "critical";
    if(item?.kind==="custom-glb"){
      const lib=[...(before.library||[]),...(after.library||[])].find(v=>v.id===item.assetId);
      if(lib?.category==="artwork")return "critical";
    }
    return "context";
  }
  const leftExtras=new Map((before.extras||[]).map(v=>[v.id,v]));
  const rightExtras=new Map((after.extras||[]).map(v=>[v.id,v]));
  for(const id of [...new Set([...leftExtras.keys(),...rightExtras.keys()])].sort((a,b)=>a-b)){
    const a=leftExtras.get(id),b=rightExtras.get(id),sev=classifyExtra(b||a);
    const name="배치 오브제 #"+id;
    if(!a||!b){add("objects",sev,name+(a?" 삭제":" 추가"),a||null,b||null);continue;}
    if(a.kind!==b.kind||a.assetId!==b.assetId)
      add("objects",sev,name+" 소스·유형",{kind:a.kind,assetId:a.assetId},{kind:b.kind,assetId:b.assetId});
    for(const key of ["p","r","s"]){
      for(let axis=0;axis<3;axis++){
        const radians=key==="r";
        const v1=a.transform?.[key]?.[axis],v2=b.transform?.[key]?.[axis];
        add("objects",sev,name+" "+{p:"좌표",r:"회전",s:"배율"}[key]+" "+["X","Y","Z"][axis],
          radians?Number((v1*180/Math.PI).toFixed(5)):v1,
          radians?Number((v2*180/Math.PI).toFixed(5)):v2,
          radians?"°":key==="p"?"m":"");
      }
    }
    for(const key of ["hidden","selectionLocked","groupId","appearanceVersion","power","color"])
      add("objects",sev,name+" "+key,a[key],b[key]);
  }
  const leftLibrary=new Map((before.library||[]).map(x=>[x.id,x]));
  const rightLibrary=new Map((after.library||[]).map(x=>[x.id,x]));
  for(const id of [...new Set([...leftLibrary.keys(),...rightLibrary.keys()])].sort())
    add("sources","context","에셋 라이브러리 "+id,leftLibrary.get(id),rightLibrary.get(id));
  // File identity and stored annotations can be compared, NOT actual site mesh geometry.
  fields("site","critical","현장 단위·원점",before.siteSetup,after.siteSetup);
  fields("site","context","현장/레이어",before.layers,after.layers);
  fields("site","context","배치도 정렬",before.planAlignment,after.planAlignment);
  fields("visual","visual","카메라",before.camera,after.camera);
  fields("visual","visual","조명",before.lighting,after.lighting);
  add("visual","visual","그림자",before.shadows,after.shadows);
  fields("visual","visual","렌더 옵션",before.render,after.render);
  const total=Object.values(counts).reduce((a,b)=>a+b,0);
  return {
    schema:REVISION_DIFF_SCHEMA,
    base:{revision:before.revision,approvedAt:before.approvedAt,siteFile:before.siteFile,artworkFile:before.artworkFile},
    target:{revision:after.revision,approvedAt:after.approvedAt,siteFile:after.siteFile,artworkFile:after.artworkFile},
    total,counts,
    unchanged:total===0,
    truncated:total>changes.length,
    changes,
    limitations:[
      "Snapshot metadata comparison only: original mesh vertices, textures, source binary checksums, hidden native geometry and physical safety are not independently compared.",
      "Model-file names do not establish binary-file equality. The approved MASTER and full project ZIP must be reviewed separately.",
      "Numeric tolerances are for reporting only; the scene and MASTER are not changed.",
      "A change summary is not an artist, structural, safety, legal or government authorization."
    ],
    labels:LEVEL
  };
}
