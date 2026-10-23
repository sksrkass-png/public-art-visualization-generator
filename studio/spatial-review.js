import * as THREE from "three";
import {masterFingerprint} from "./collaboration.js";
import {SPATIAL_SCHEMA,emptySpatialReview,validSpatialReview,addSpatialPin,
  updateSpatialPinStatus,pinsForMaster,MAX_SPATIAL_PINS} from "./spatial-review-data.js";

// Screen-space HTML badges only: markers are never part of the WebGL scene,
// GLB exports, source models, 8-view batch renders, or approved MASTER snapshots.
const $=id=>document.getElementById(id);
const TYPES={artwork:"작품",site:"현장",context:"주변 오브제"};
export function initSpatialReview({getContext,viewport,camera,artRoot,siteRoot,extrasRoot,floor,allowExampleFloor}){
  let state=emptySpatialReview(), armed=false, selectedId=null;
  let verifiedMaster=null,verifiedDigest=null,pendingMaster=null,verifyToken=0;
  const overlay=$("spatial-pin-overlay"),list=$("spatial-pin-list");
  const status=$("spatial-status"),place=$("spatial-place");
  const raycaster=new THREE.Raycaster();
  const mouse=new THREE.Vector2();
  const heading=new THREE.Vector3(),point=new THREE.Vector3();
  function context(){return getContext();}
  function eligible(){
    const c=context();
    return !!c.locked&&!!c.matchesMaster&&!!c.master;
  }
  function ready(){
    const c=context();
    return eligible() && c.master===verifiedMaster && !!verifiedDigest;
  }
  function activePins(){
    const m=context().master;
    return ready()?pinsForMaster(state,m,verifiedDigest):[];
  }
  function report(message){status.textContent=message;}
  function clearMode(){
    armed=false;
    viewport.classList.remove("spatial-pick-mode");
    place.textContent="3D 위치 클릭해 검토 핀 추가";
  }
  function syncVerification(){
    const c=context();
    if(!eligible()){
      ++verifyToken;pendingMaster=null;verifiedMaster=null;verifiedDigest=null;
      if(armed)clearMode();
      return;
    }
    if(c.master===verifiedMaster || c.master===pendingMaster)return;
    verifiedMaster=null;verifiedDigest=null;
    const master=c.master,token=++verifyToken;
    pendingMaster=master;
    masterFingerprint(master).then(digest=>{
      if(token!==verifyToken)return;
      pendingMaster=null;
      const fresh=context();
      if(fresh.master===master && fresh.locked && fresh.matchesMaster){
        verifiedMaster=master;verifiedDigest=digest;
      }
      redraw();
    }).catch(error=>{
      if(token===verifyToken){pendingMaster=null;report("MASTER 지문 검증 오류: "+error.message);redraw();}
    });
  }
  function selectedPin(){
    return activePins().find(p=>p.id===selectedId)||null;
  }
  function redraw(){
    syncVerification();
    const current=activePins();
    const allowed=ready();
    const all=state.pins.length;
    if(!allowed && armed)clearMode();
    place.disabled=!allowed||all>=MAX_SPATIAL_PINS;
    $("spatial-export").disabled=all===0;
    $("spatial-cancel").disabled=!armed;
    $("spatial-summary").textContent=allowed?
      "MASTER REV "+context().master.revision+" · 검토 핀 "+current.length+
      "개 · 미처리 "+current.filter(p=>p.status==="open").length+"개 · 전체 이력 "+all+"/80"
      : "승인된 최신 MASTER가 잠겨 있고 작품·현장 상태가 일치해야 검토할 수 있습니다.";
    const chosen=selectedPin();
    $("spatial-resolve").disabled=!chosen || chosen.status!=="open";
    $("spatial-reopen").disabled=!chosen || chosen.status!=="resolved";
    list.replaceChildren();
    if(!current.length){
      const row=document.createElement("p");row.className="hint";
      row.textContent="현재 MASTER의 검토 핀이 없습니다.";
      list.append(row);
    }
    for(const pin of current){
      const row=document.createElement("button");
      row.type="button";row.className="spatial-list-row";
      if(pin.id===selectedId)row.classList.add("selected");
      const title=document.createElement("strong");
      title.textContent="#"+pin.id+" · "+TYPES[pin.type]+" · "+(pin.status==="open"?"미처리":"처리 완료");
      const info=document.createElement("span");
      info.textContent=pin.author+" — "+pin.comment;
      const xyz=document.createElement("small");
      xyz.textContent="XYZ "+pin.position.map(n=>n.toFixed(2)).join(" / ")+" m";
      row.append(title,info,xyz);
      row.addEventListener("click",()=>{selectedId=pin.id;redraw();});
      list.append(row);
    }
    const historical=state.pins.filter(p=>!current.includes(p));
    if(historical.length){
      const title=document.createElement("p");
      title.className="hint";
      title.textContent="다른 승인 Revision의 검토 핀 "+historical.length+
        "개는 현재 화면에 표시하지 않습니다. 프로젝트 ZIP 기록에는 남아 있습니다.";
      list.append(title);
    }
    overlay.replaceChildren();
    for(const pin of current){
      const marker=document.createElement("button");marker.type="button";
      marker.className="spatial-screen-pin"+(pin.status==="resolved"?" resolved":"")+
        (pin.id===selectedId?" selected":"");
      marker.dataset.pinId=String(pin.id);
      marker.textContent=String(pin.id);
      marker.setAttribute("aria-label","검토 핀 "+pin.id+" · "+TYPES[pin.type]+" · "+pin.comment.slice(0,90));
      marker.title=TYPES[pin.type]+" · "+pin.comment;
      marker.addEventListener("click",event=>{
        event.stopPropagation();selectedId=pin.id;redraw();
      });
      overlay.append(marker);
    }
    drawOverlay();
  }
  function drawOverlay(){
    if(!overlay.children.length)return;
    camera.getWorldDirection(heading);
    const width=viewport.clientWidth,height=viewport.clientHeight;
    for(const marker of overlay.children){
      const pin=state.pins.find(p=>p.id===Number(marker.dataset.pinId));
      if(!pin)continue;
      point.fromArray(pin.position);
      const inFront=point.clone().sub(camera.position).dot(heading)>0;
      const projected=point.project(camera);
      const visible=inFront && Number.isFinite(projected.x)&&Number.isFinite(projected.y)&&
        projected.x>=-1&&projected.x<=1&&projected.y>=-1&&projected.y<=1 &&
        projected.z>=-1&&projected.z<=1;
      marker.hidden=!visible;
      if(visible){
        marker.style.left=((projected.x+1)*width/2)+"px";
        marker.style.top=((1-projected.y)*height/2)+"px";
      }
    }
  }
  function classify(object){
    let node=object;
    while(node){
      if(node===artRoot)return "artwork";
      if(node===siteRoot||node===floor)return "site";
      if(node===extrasRoot)return "context";
      node=node.parent;
    }
    return null;
  }
  function handleCanvasClick(event,moved){
    if(!armed)return false;
    if(moved || event.button!==0)return true;
    if(!ready()){clearMode();redraw();report("현재 승인 MASTER가 변경되어 핀 추가를 중단했습니다.");return true;}
    const author=$("spatial-author").value.trim(),comment=$("spatial-comment").value.trim();
    if(!author||!comment){report("작성자 이름과 검토 의견을 먼저 입력하세요.");return true;}
    const rect=viewport.getBoundingClientRect();
    mouse.set((event.clientX-rect.left)/rect.width*2-1,
      -(event.clientY-rect.top)/rect.height*2+1);
    raycaster.setFromCamera(mouse,camera);
    const targets=[...artRoot.children,...siteRoot.children,...extrasRoot.children];
    if(allowExampleFloor())targets.push(floor);
    const hit=raycaster.intersectObjects(targets,true)
      .find(entry=>entry.object.visible && classify(entry.object));
    if(!hit){report("클릭한 위치에서 작품·현장 표면을 찾지 못했습니다. 다른 위치를 선택하세요.");return true;}
    const master=context().master,digest=verifiedDigest;
    try{
      state=addSpatialPin(state,{master,digest,type:classify(hit.object),position:hit.point.toArray(),
        author,comment,now:new Date().toISOString()});
      selectedId=state.pins.at(-1).id;
      clearMode();redraw();
      report("검토 핀 #"+selectedId+" 기록 완료 · 원본 모델과 승인 MASTER는 변경되지 않았습니다.");
    }catch(error){report("검토 핀 생성 실패: "+error.message);}
    return true;
  }
  place.addEventListener("click",()=>{
    if(!ready())return report("먼저 MASTER VIEW를 승인하고 상태 일치를 확인하세요.");
    if(!$("spatial-author").value.trim()||!$("spatial-comment").value.trim())
      return report("검토자 이름과 의견을 입력한 뒤 3D 위치를 선택하세요.");
    armed=true;viewport.classList.add("spatial-pick-mode");
    place.textContent="3D 위치 선택 중…";
    $("spatial-cancel").disabled=false;
    report("3D 작품·현장을 한 번 클릭하세요. 드래그는 핀을 생성하지 않습니다. Esc로 취소합니다.");
  });
  $("spatial-cancel").addEventListener("click",()=>{
    clearMode();redraw();report("검토 위치 선택을 취소했습니다.");
  });
  function cancel(){
    if(!armed)return false;
    clearMode();redraw();report("검토 위치 선택을 취소했습니다.");
    return true;
  }
  function changeStatus(next){
    if(!ready())return report("승인된 MASTER에서만 처리 상태를 바꿀 수 있습니다.");
    const pin=selectedPin(),reviewer=$("spatial-author").value.trim();
    if(!pin)return report("변경할 검토 핀을 선택하세요.");
    if(!reviewer)return report("처리 담당자 이름을 입력하세요.");
    try{
      state=updateSpatialPinStatus(state,pin.id,next,reviewer,new Date().toISOString());
      redraw();
      report("검토 핀 #"+pin.id+" 상태 변경 · "+(next==="resolved"?"처리 완료":"다시 검토 중"));
    }catch(error){report("검토 상태 변경 실패: "+error.message);}
  }
  $("spatial-resolve").addEventListener("click",()=>changeStatus("resolved"));
  $("spatial-reopen").addEventListener("click",()=>changeStatus("open"));
  $("spatial-export").addEventListener("click",()=>{
    if(!state.pins.length)return;
    const output={...structuredClone(state),exportedAt:new Date().toISOString(),
      project:String(context().project||"").slice(0,100),
      note:"Review points are fixed in viewer world metres and scoped to their approved MASTER SHA-256. Not a surveyed/BIM annotation or authenticated approval."};
    const blob=new Blob([JSON.stringify(output,null,2)],{type:"application/json"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");a.href=url;
    a.download="AXOO-spatial-review-pins.json";document.body.append(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),6000);
    report("검토 핀 보고서 저장 완료. 원본 모델 보존용 전체 프로젝트 ZIP도 별도로 보관하세요.");
  });
  redraw();
  return {
    handleCanvasClick,cancel,drawOverlay,refresh:redraw,
    reset(){state=emptySpatialReview();selectedId=null;clearMode();redraw();},
    getState:()=>structuredClone(state),
    setState(value){
      if(!validSpatialReview(value))throw Error("검토 핀 데이터 형식이 잘못됐습니다.");
      state=value===undefined?emptySpatialReview():structuredClone(value);
      selectedId=null;clearMode();redraw();
    }
  };
}
