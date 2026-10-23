// AXOO v1.5 · offline review handoff. No network, account authentication or mesh mutation.
const $ = id => document.getElementById(id);
export const COLLAB_SCHEMA = "axoo-team-review-v1";
const MAX_RECORDS = 40;
const STATUS = new Set(["pending", "changes-requested", "director-approved"]);
const textValue = (v, max=100) => typeof v === "string" ? v.trim().slice(0,max) : "";
const validDate = value => typeof value === "string" && !Number.isNaN(Date.parse(value));
const hexDigest = value => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
function canonical(value) {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object")
    return "{" + Object.keys(value).sort().map(k=>JSON.stringify(k)+":"+canonical(value[k])).join(",") + "}";
  return JSON.stringify(value);
}
export async function masterFingerprint(master) {
  if (!master || !Number.isInteger(master.revision) || !validDate(master.approvedAt))
    throw Error("승인된 MASTER 데이터가 없습니다.");
  // The approved snapshot, not the mutable orbit camera or reviewer inputs, anchors review.
  const bytes = new TextEncoder().encode(canonical(master));
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map(n=>n.toString(16).padStart(2,"0")).join("");
}
export function validateCollaborationState(data) {
  if (data === undefined) return true; // v1.4 archives have no review metadata.
  if (!data || data.schema !== COLLAB_SCHEMA || !Array.isArray(data.records) ||
      data.records.length > MAX_RECORDS) return false;
  const unique = new Set();
  for (const item of data.records) {
    if (!item || !Number.isInteger(item.revision) || item.revision < 1 ||
        !validDate(item.masterApprovedAt) || !hexDigest(item.masterDigest) ||
        !STATUS.has(item.status) || !validDate(item.createdAt) || !validDate(item.updatedAt) ||
        typeof item.requester !== "string" || item.requester.length < 1 || item.requester.length > 90 ||
        typeof item.reviewer !== "string" || item.reviewer.length > 90 ||
        typeof item.note !== "string" || item.note.length > 1800 ||
        (item.status !== "pending" && !item.reviewer.trim()) ||
        (item.status === "changes-requested" && !item.note.trim()) ||
        (item.status === "director-approved" && item.attested !== true) ||
        (item.status !== "director-approved" && item.attested === true) ||
        (item.reviewer && item.reviewer.trim().toLowerCase() === item.requester.trim().toLowerCase()))
      return false;
    const key = item.revision + "|" + item.masterApprovedAt + "|" + item.masterDigest;
    if (unique.has(key)) return false;
    unique.add(key);
  }
  return true;
}
export function initTeamCollaboration({getContext}) {
  let state = {schema:COLLAB_SCHEMA,records:[]};
  let busy=false;
  const status=$("collab-status");
  function context() { return getContext(); }
  function activeRecord() {
    const m=context().master;
    return m ? state.records.find(r=>r.revision===m.revision &&
      r.masterApprovedAt===m.approvedAt) || null : null;
  }
  function available() {
    const ctx=context();
    return !!ctx.locked && !!ctx.matchesMaster && !!ctx.master;
  }
  function message(value) { status.textContent=value; }
  function refresh() {
    const ctx=context(), current=activeRecord(), valid=available();
    const hasReview=!!current && valid;
    $("collab-request").disabled=busy || !valid || !!current;
    $("collab-changes").disabled=busy || !hasReview || current.status!=="pending";
    $("collab-approve").disabled=busy || !hasReview || current.status!=="pending";
    $("collab-export").disabled=busy || !hasReview;
    $("collab-attest").disabled=busy || !hasReview || current.status!=="pending";
    const active=$("collab-active");
    active.textContent=!valid
      ? "승인된 최신 MASTER가 잠겨 있고 원본과 일치해야 검토할 수 있습니다."
      : current ? ("REV "+current.revision+" · "+({
          "pending":"디렉터 검토 대기","changes-requested":"수정 요청됨",
          "director-approved":"디렉터 수동 승인 기록됨"
        }[current.status])+" · 작성자: "+current.requester)
      : "REV "+ctx.master.revision+" · 아직 검토 요청 전";
    const list=$("collab-history"); list.replaceChildren();
    for(const master of [...(ctx.history||[])].reverse().slice(0,MAX_RECORDS)){
      const record=state.records.find(r=>r.revision===master.revision &&
        r.masterApprovedAt===master.approvedAt);
      const row=document.createElement("div");
      row.className="collab-history-row";
      const title=document.createElement("strong");
      title.textContent="REV "+master.revision+" · "+new Date(master.approvedAt).toLocaleString("ko-KR");
      const detail=document.createElement("span");
      detail.textContent=record
        ? {"pending":"검토 중","changes-requested":"수정 요청","director-approved":"디렉터 승인(수동)"}[record.status]+
          (record.reviewer?" · "+record.reviewer:"")
        : "검토 기록 없음";
      row.append(title,detail);list.append(row);
    }
    if (!ctx.history?.length)list.textContent="기록된 MASTER 버전이 없습니다.";
  }
  async function requestReview(){
    if(!available())return message("MASTER LOCK과 현재 원본 일치를 먼저 확인하세요.");
    if(activeRecord())return message("현재 REV의 검토 요청이 이미 있습니다. 수정은 다음 MASTER Revision으로 진행하세요.");
    const author=textValue($("collab-author").value,90);
    if(!author)return message("검토 요청자 이름을 입력하세요.");
    busy=true;refresh();
    try{
      const m=context().master;
      const digest=await masterFingerprint(m);
      if(!available() || context().master!==m)
        throw Error("검토 중 MASTER 상태가 변경되었습니다. 다시 시도하세요.");
      const now=new Date().toISOString();
      state.records.push({revision:m.revision,masterApprovedAt:m.approvedAt,
        masterDigest:digest,requester:author,reviewer:"",note:textValue($("collab-note").value,1800),
        status:"pending",attested:false,createdAt:now,updatedAt:now});
      if(state.records.length>MAX_RECORDS)state.records.shift();
      $("collab-attest").checked=false;
      message("MASTER REV "+m.revision+" 검토 요청 기록 완료. 전체 프로젝트 ZIP과 검토 JSON을 검토자에게 전달하세요.");
    }catch(e){message("검토 요청 실패: "+e.message);}
    finally{busy=false;refresh();}
  }
  async function decide(statusValue){
    if(!available())return message("MASTER 승인·일치 상태가 아닙니다.");
    const current=activeRecord();
    if(!current || current.status!=="pending")return message("검토 대기 중인 요청이 없습니다.");
    const reviewer=textValue($("collab-reviewer").value,90);
    const note=textValue($("collab-note").value,1800);
    if(!reviewer || reviewer.toLowerCase()===current.requester.trim().toLowerCase())
      return message("요청자와 다른 디렉터/검토자 이름을 입력하세요.");
    if(statusValue==="changes-requested" && !note)return message("수정 요청 내용을 작성하세요.");
    if(statusValue==="director-approved" && !$("collab-attest").checked)
      return message("원본·배치·스케일·재질 검토 확인을 체크해야 승인할 수 있습니다.");
    busy=true;refresh();
    try{
      const m=context().master;
      const digest=await masterFingerprint(m);
      if(!available() || context().master!==m || current.masterDigest!==digest)
        throw Error("요청한 MASTER와 현재 잠긴 MASTER의 지문이 다릅니다.");
      current.reviewer=reviewer;current.note=note;current.status=statusValue;
      current.attested=statusValue==="director-approved";
      current.updatedAt=new Date().toISOString();
      message(statusValue==="director-approved"?
        "REV "+m.revision+" 디렉터 수동 검토 승인 기록 · 파일을 내보내 전달하세요.":
        "REV "+m.revision+" 수정 요청 기록 · 새 Revision으로 수정한 뒤 다시 검토 요청하세요.");
    }catch(e){message("검토 반영 실패: "+e.message);}
    finally{busy=false;refresh();}
  }
  function downloadRecord(){
    if(!available() || !activeRecord())return message("먼저 MASTER 검토 요청을 생성하세요.");
    const ctx=context(),record=activeRecord();
    const output={schema:COLLAB_SCHEMA,project:textValue(ctx.project,100),
      exportedAt:new Date().toISOString(),record:structuredClone(record),
      notice:"Manual, unauthenticated review handoff only. SHA-256 is not an identity signature or statutory approval."};
    const blob=new Blob([JSON.stringify(output,null,2)],{type:"application/json"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");a.href=url;
    a.download="AXOO-REV"+record.revision+"-"+record.status+"-review.json";
    document.body.append(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),6000);
    message("검토 JSON 저장 완료. 전체 모델은 별도의 프로젝트 ZIP으로 공유하세요.");
  }
  async function importRecord(file){
    if(!file)return;
    if(file.size>256*1024)return message("검토 JSON은 256KB 이하여야 합니다.");
    if(!available())return message("먼저 해당 버전의 승인 MASTER 프로젝트 ZIP을 열고 잠금 상태를 확인하세요.");
    busy=true;refresh();
    try{
      const data=JSON.parse(await file.text());
      if(!data || data.schema!==COLLAB_SCHEMA ||
        !validateCollaborationState({schema:COLLAB_SCHEMA,records:[data.record]}))
        throw Error("검토 JSON 형식이 올바르지 않습니다.");
      const m=context().master;
      const r=data.record;
      if(m.revision!==r.revision || m.approvedAt!==r.masterApprovedAt ||
        await masterFingerprint(m)!==r.masterDigest || !available() || context().master!==m)
        throw Error("다른 MASTER Revision 또는 변경된 원본의 검토 기록입니다.");
      const previous=activeRecord();
      if(previous && previous.masterDigest!==r.masterDigest)
        throw Error("현재 프로젝트의 기존 검토 요청과 지문이 다릅니다.");
      if(previous && (previous.status!=="pending" && previous.status!==r.status ||
        Date.parse(previous.updatedAt)>Date.parse(r.updatedAt)))
        throw Error("이미 종료되었거나 더 최신인 검토 기록은 덮어쓸 수 없습니다.");
      if(previous && (previous.requester!==r.requester || previous.createdAt!==r.createdAt))
        throw Error("검토 요청자의 원본 기록이 일치하지 않습니다.");
      if(previous)Object.assign(previous,structuredClone(r));
      else{state.records.push(structuredClone(r));if(state.records.length>MAX_RECORDS)state.records.shift();}
      $("collab-attest").checked=false;
      message("MASTER 지문 일치 · "+r.status+" 기록을 로컬 프로젝트에 반영했습니다. 프로젝트 ZIP으로 다시 백업하세요.");
    }catch(e){message("검토 JSON 가져오기 실패: "+e.message);}
    finally{busy=false;refresh();}
  }
  $("collab-request").addEventListener("click",requestReview);
  $("collab-changes").addEventListener("click",()=>decide("changes-requested"));
  $("collab-approve").addEventListener("click",()=>decide("director-approved"));
  $("collab-export").addEventListener("click",downloadRecord);
  $("collab-import").addEventListener("change",e=>{
    const file=e.target.files[0];e.target.value="";void importRecord(file);
  });
  refresh();
  return {
    refresh,
    getState:()=>structuredClone(state),
    setState:data=>{
      if(!validateCollaborationState(data))throw Error("검토 기록 데이터가 올바르지 않습니다.");
      state=data===undefined?{schema:COLLAB_SCHEMA,records:[]} : structuredClone(data);
      $("collab-attest").checked=false;refresh();
    },
    reset:()=>{
      state={schema:COLLAB_SCHEMA,records:[]};
      $("collab-attest").checked=false;refresh();
    }
  };
}
