import {compareMasterRevisions} from "./revision-diff.js";
import {masterFingerprint} from "./collaboration.js";

// v1.6 read-only comparison UI. Approved historical snapshots are inspected in memory.
const $=id=>document.getElementById(id);
const CATEGORY={critical:"핵심 설계",context:"현장·배치",visual:"렌더·표현"};
export function initRevisionCompare({getContext}){
  const base=$("revision-base"),target=$("revision-target");
  const list=$("revision-changes"),summary=$("revision-summary");
  const reportButton=$("revision-export");
  let signature="",result=null, busy=false;
  function ctx(){return getContext();}
  function repopulate(history){
    const value=signature;
    const next=JSON.stringify(history.map(m=>[m.revision,m.approvedAt,m.artworkFile,m.siteFile]));
    if(value===next)return;
    const oldCount=base.options.length;
    const oldBase=base.selectedIndex,oldTarget=target.selectedIndex;
    const previouslyLatest=oldCount>=2&&oldBase===oldCount-2&&oldTarget===oldCount-1;
    signature=next;
    for(const sel of [base,target]){
      sel.replaceChildren();
      history.forEach((m,i)=>{
        const option=document.createElement("option");
        option.value=String(i);
        option.textContent="REV "+m.revision+" · "+new Date(m.approvedAt).toLocaleString("ko-KR");
        sel.append(option);
      });
    }
    if(history.length>=2){
      base.value=String(!previouslyLatest&&oldBase>=0&&oldBase<history.length?oldBase:history.length-2);
      target.value=String(!previouslyLatest&&oldTarget>=0&&oldTarget<history.length?oldTarget:history.length-1);
      if(base.value===target.value){
        base.value=String(history.length-2);target.value=String(history.length-1);
      }
    }
    $("revision-empty").hidden=history.length>=2;
  }
  function refresh(){
    const {history=[],locked,matchesMaster}=ctx();
    repopulate(history);
    list.replaceChildren();
    result=null;
    const hasPair=history.length>=2;
    base.disabled=!hasPair||busy;target.disabled=!hasPair||busy;
    if(!hasPair){
      summary.textContent="승인 MASTER가 2개 이상 필요합니다. 수정 후 새 Revision을 승인하세요.";
      reportButton.disabled=true;return;
    }
    try{
      const a=Number(base.value),b=Number(target.value);
      if(!Number.isInteger(a)||!Number.isInteger(b)||a<0||b<0||a>=b||b>=history.length)
        throw Error("이전 승인본을 기준으로 선택하고, 더 최신 승인본을 비교 대상으로 선택하세요.");
      result=compareMasterRevisions(history[a],history[b]);
      const counts=result.counts;
      summary.textContent="REV "+result.base.revision+" → REV "+result.target.revision+
        " · 변경 "+result.total+"건 (핵심 "+counts.critical+" · 배치 "+counts.context+
        " · 표현 "+counts.visual+")"+
        (locked&&matchesMaster?" · 현재 MASTER 일치":" · 과거 승인 스냅샷 비교")+
        (result.unverified.length?" · 일부 구형 MASTER 속성 미기록":"");
      if(result.total===0){
        const row=document.createElement("p");
        row.textContent="기록된 주요 스냅샷 속성의 변경 사항이 없습니다. 원본 메시·바이너리 동일성을 보증하지 않습니다.";
        list.append(row);
      }else{
        for(const item of result.changes){
          const row=document.createElement("div");
          row.className="revision-diff-item revision-diff-"+item.severity;
          const title=document.createElement("strong");
          title.textContent=CATEGORY[item.severity]+" · "+item.label;
          const value=document.createElement("span");
          value.textContent=item.summary;
          row.append(title,value);
          list.append(row);
        }
        if(result.truncated){
          const row=document.createElement("p");
          row.textContent="변경 사항이 많아 목록을 500건까지만 표시했습니다. 합계는 전체 항목 기준입니다.";
          list.append(row);
        }
      }
      reportButton.disabled=busy;
    }catch(error){
      summary.textContent="비교 대상을 다시 선택하세요: "+error.message;
      reportButton.disabled=true;
    }
  }
  async function exportReport(){
    if(!result||busy)return;
    const h=ctx().history, a=h[Number(base.value)], b=h[Number(target.value)];
    if(!a||!b)return refresh();
    busy=true;reportButton.disabled=true;
    try{
      const digestA=await masterFingerprint(a),digestB=await masterFingerprint(b);
      const live=ctx().history;
      if(live[Number(base.value)]!==a||live[Number(target.value)]!==b)
        throw Error("MASTER 목록이 변경되었습니다. 다시 비교하세요.");
      const data=compareMasterRevisions(a,b);
      const output={...data,projectName:String(ctx().project||"").slice(0,100),
        exportedAt:new Date().toISOString(),
        fingerprint:{baseSHA256:digestA,targetSHA256:digestB},
        verification:"SHA-256 fingerprints identify saved approval metadata, not original model files."};
      const blob=new Blob([JSON.stringify(output,null,2)],{type:"application/json"});
      const url=URL.createObjectURL(blob);
      const link=document.createElement("a");link.href=url;
      link.download="AXOO-MASTER-REV"+a.revision+"-to-REV"+b.revision+"-DIFF.json";
      document.body.append(link);link.click();link.remove();
      setTimeout(()=>URL.revokeObjectURL(url),6000);
      $("revision-status").textContent="Revision 비교 보고서 저장 완료 · 원본 모델과 MASTER는 변경되지 않았습니다.";
    }catch(error){$("revision-status").textContent="비교 보고서 저장 실패: "+error.message;}
    finally{busy=false;refresh();}
  }
  base.addEventListener("change",refresh);
  target.addEventListener("change",refresh);
  reportButton.addEventListener("click",()=>{void exportReport();});
  refresh();
  return {refresh};
}
