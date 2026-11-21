// AXOO v3.6 — spatial presentation recipes; never mutate artwork or source site.
// A recipe is a *render state recommendation*, not a material or geometry edit.
export const SPATIAL_LOOKS=Object.freeze({
  "art-day":Object.freeze({mode:"public-art",label:"☀️ 심의용 맑은 낮",lightPreset:"clear",azimuth:52,elevation:39,sun:2.25,ambient:1.0,exposure:1.0,shadows:true,shadowProfile:"high",toneCurve:"neutral",sky:"blue",environmentMode:"bright",environmentIntensity:1.0}),
  "art-soft":Object.freeze({mode:"public-art",label:"☁️ 조형물 부드러운 빛",lightPreset:"cloudy",azimuth:48,elevation:62,sun:1.1,ambient:1.5,exposure:1.0,shadows:true,shadowProfile:"soft",toneCurve:"aces",sky:"white",environmentMode:"overcast",environmentIntensity:1.1}),
  "art-evening":Object.freeze({mode:"public-art",label:"🌙 야간 경관조명",lightPreset:"night",azimuth:118,elevation:20,sun:1.15,ambient:.6,exposure:1.05,shadows:true,shadowProfile:"soft",toneCurve:"aces",sky:"cool",environmentMode:"neutral",environmentIntensity:.7}),
  "retail-day":Object.freeze({mode:"popup-retail",label:"🛍️ 리테일 자연광",lightPreset:"clear",azimuth:58,elevation:48,sun:1.65,ambient:1.5,exposure:1.1,shadows:true,shadowProfile:"soft",toneCurve:"neutral",sky:"white",environmentMode:"bright",environmentIntensity:1.0}),
  "retail-graphic":Object.freeze({mode:"popup-retail",label:"💎 상품·집기 디테일",lightPreset:"clear",azimuth:38,elevation:54,sun:1.9,ambient:1.65,exposure:1.0,shadows:true,shadowProfile:"high",toneCurve:"neutral",sky:"white",environmentMode:"neutral",environmentIntensity:.95}),
  "retail-evening":Object.freeze({mode:"popup-retail",label:"✨ 팝업 이브닝",lightPreset:"golden",azimuth:72,elevation:19,sun:1.75,ambient:1.1,exposure:1.0,shadows:true,shadowProfile:"soft",toneCurve:"aces",sky:"warm",environmentMode:"neutral",environmentIntensity:.9}),
  "museum-neutral":Object.freeze({mode:"exhibition",label:"🏛️ 뮤지엄 화이트",lightPreset:"cloudy",azimuth:48,elevation:65,sun:1.1,ambient:1.8,exposure:1.0,shadows:true,shadowProfile:"soft",toneCurve:"neutral",sky:"white",environmentMode:"neutral",environmentIntensity:1.1}),
  "museum-contrast":Object.freeze({mode:"exhibition",label:"🎨 작품 입체감",lightPreset:"clear",azimuth:71,elevation:38,sun:2.45,ambient:1.0,exposure:.95,shadows:true,shadowProfile:"high",toneCurve:"aces",sky:"cool",environmentMode:"neutral",environmentIntensity:1.05}),
  "museum-media":Object.freeze({mode:"exhibition",label:"📽️ 미디어 전시 무드",lightPreset:"night",azimuth:100,elevation:25,sun:.75,ambient:.52,exposure:1.0,shadows:true,shadowProfile:"soft",toneCurve:"aces",sky:"cool",environmentMode:"neutral",environmentIntensity:.7}),
  "urban-clear":Object.freeze({mode:"spatial-branding",label:"🌤️ 거리 연출 맑은 낮",lightPreset:"clear",azimuth:58,elevation:48,sun:2.2,ambient:1.2,exposure:1.0,shadows:true,shadowProfile:"high",toneCurve:"neutral",sky:"blue",environmentMode:"bright",environmentIntensity:1.0}),
  "urban-overcast":Object.freeze({mode:"spatial-branding",label:"☁️ 도시 흐린 주광",lightPreset:"cloudy",azimuth:62,elevation:58,sun:.95,ambient:1.55,exposure:1.05,shadows:true,shadowProfile:"soft",toneCurve:"aces",sky:"cool",environmentMode:"overcast",environmentIntensity:.95}),
  "urban-twilight":Object.freeze({mode:"spatial-branding",label:"🌆 도시 골든아워",lightPreset:"golden",azimuth:89,elevation:14,sun:2.3,ambient:.9,exposure:1.0,shadows:true,shadowProfile:"soft",toneCurve:"aces",sky:"warm",environmentMode:"neutral",environmentIntensity:.9})
});
export const SPATIAL_SHOTS=Object.freeze({
  "hero":Object.freeze({label:"메인 히어로",distance:1.65,azimuth:46,elevation:19,focal:38,subject:"hero"}),
  "whole":Object.freeze({label:"공간 전체",distance:1.9,azimuth:40,elevation:30,focal:28,subject:"overall"}),
  "visitor":Object.freeze({label:"방문객 아이레벨",distance:2.2,azimuth:9,elevation:0,focal:35,subject:"overall"}),
  "side":Object.freeze({label:"대각선 동선",distance:1.85,azimuth:-42,elevation:18,focal:35,subject:"overall"}),
  "top":Object.freeze({label:"공간 상부 조감",distance:1.7,azimuth:22,elevation:64,focal:35,subject:"overall"}),
  "detail":Object.freeze({label:"선택 객체 클로즈업",distance:1.65,azimuth:30,elevation:12,focal:65,subject:"selected"})
});
export const SPATIAL_SHOT_IDS=Object.freeze(Object.keys(SPATIAL_SHOTS));
const FINISH_IDS=["original","gallery-white","graphite","brushed-metal","warm-timber","brand-accent"];
export const SPATIAL_FINISHES=Object.freeze({
 "original":Object.freeze({label:"원본 기본 마감",color:null,metalness:null,roughness:null}),
 "gallery-white":Object.freeze({label:"갤러리 화이트",color:"#f4f2ec",metalness:.02,roughness:.72}),
 "graphite":Object.freeze({label:"차콜 그래파이트",color:"#343b40",metalness:.25,roughness:.57}),
 "brushed-metal":Object.freeze({label:"브러시드 실버",color:"#c3c8cc",metalness:.76,roughness:.31}),
 "warm-timber":Object.freeze({label:"웜 우드 톤",color:"#a88362",metalness:0,roughness:.79}),
 "brand-accent":Object.freeze({label:"브랜드 포인트 컬러",color:null,metalness:.12,roughness:.53})
});
export const SPATIAL_FINISH_IDS=Object.freeze([...FINISH_IDS]);
export function looksForMode(mode){
 return Object.entries(SPATIAL_LOOKS).filter(([,v])=>v.mode===mode).map(([id,v])=>({id,label:v.label}));
}
export function isSpatialLook(id){return Object.hasOwn(SPATIAL_LOOKS,id);}
export function isSpatialShot(id){return SPATIAL_SHOT_IDS.includes(id);}
export function validSpatialState(v){
 if(v===undefined)return true; // v3.5 and older portable ZIP / JSON
 return !!v && typeof v==="object" && !Array.isArray(v) &&
  Object.keys(v).every(k=>["look","shot"].includes(k)) &&
  (v.look===null||v.look===undefined||isSpatialLook(v.look)) &&
  (v.shot===null||v.shot===undefined||isSpatialShot(v.shot));
}
export function validSpatialFinish(id,color){
 if(!SPATIAL_FINISH_IDS.includes(id))return false;
 return color===undefined||typeof color==="string"&&/^#[\da-f]{6}$/i.test(color);
}
export function spatialShotPose(shot,box,{aspect=16/9,cameraFov=45}={}){
 if(!isSpatialShot(shot))throw Error("지원하지 않는 공간 카메라 구도입니다.");
 if(!box||!Array.isArray(box.center)||!Array.isArray(box.size)||
    box.center.length!==3||box.size.length!==3||
    ![...box.center,...box.size,aspect,cameraFov].every(Number.isFinite)||
    box.size.some(v=>v<0)||aspect<=0||aspect>10||cameraFov<10||cameraFov>120)
   throw Error("카메라에 사용할 공간 경계가 유효하지 않습니다.");
 const p=SPATIAL_SHOTS[shot],radius=Math.max(.5,Math.hypot(...box.size)/2);
 const vFov=cameraFov*Math.PI/180; // live camera FOV, measured after setFocalLength()
 const half=Math.min(vFov,2*Math.atan(Math.tan(vFov/2)*aspect))/2;
 const distance=Math.max(2.5,radius/Math.sin(Math.max(.13,half)) * p.distance);
 const az=p.azimuth*Math.PI/180,el=p.elevation*Math.PI/180;
 const center=[...box.center];
 // Keep perspective at human eye height only if actual bounds permit it.
 if(shot==="visitor")center[1]=box.center[1]-box.size[1]/2+Math.min(1.65,Math.max(.8,box.size[1]*.4));
 const direction=[Math.sin(az)*Math.cos(el),Math.sin(el),Math.cos(az)*Math.cos(el)];
 const position=direction.map((v,i)=>center[i]+distance*v);
 if(shot==="visitor")position[1]=center[1];
 return {position,target:center,focal:p.focal,distance,near:.02,far:Math.max(3000,distance*8),label:p.label};
}
