// AXOO v2.0 — pure camera/framing and output-quality logic.
// No scene, mesh, source-file, or MASTER snapshot mutations are performed here.
export const FRAME_MODES=Object.freeze(["sculpture","nearby","site"]);
export const CAMERA_LENSES=Object.freeze([24,35,50,70]);
export const TONE_CURVES=Object.freeze(["aces","neutral"]);
export const SKY_BACKGROUNDS=Object.freeze(["cool","warm","white"]);
export const SHADOW_PROFILES=Object.freeze(["balanced","high"]);
export const COMPOSITION_GUIDES=Object.freeze(["none","thirds","center","safe"]);
export function validVisualSettings(v) {
  return !!v && typeof v==="object" &&
    TONE_CURVES.includes(v.toneCurve) && SKY_BACKGROUNDS.includes(v.sky) &&
    SHADOW_PROFILES.includes(v.shadowProfile) &&
    COMPOSITION_GUIDES.includes(v.guide);
}
export function normalizeVisualSettings(v) {
  const defaults={toneCurve:"aces",sky:"cool",shadowProfile:"balanced",guide:"none"};
  if(!v || typeof v!=="object")return {...defaults};
  const fields={...defaults};
  for(const key of Object.keys(defaults))
    if(key in v && (key==="toneCurve"?TONE_CURVES:
      key==="sky"?SKY_BACKGROUNDS:key==="shadowProfile"?SHADOW_PROFILES:COMPOSITION_GUIDES)
      .includes(v[key]))fields[key]=v[key];
  return fields;
}
// Fit a sphere with a bounded outer margin in the narrower of horizontal /
// vertical camera FOV. The return distance is from camera to target, in metres.
export function fitDistance(radius,verticalFovDeg,aspect,padding=1.24) {
  if(!Number.isFinite(radius)||radius<=0 || !Number.isFinite(verticalFovDeg) ||
      verticalFovDeg<=1||verticalFovDeg>=175 || !Number.isFinite(aspect)||aspect<=0 ||
      !Number.isFinite(padding)||padding<1||padding>2)
    throw Error("카메라 프레이밍 치수가 유효하지 않습니다.");
  const vfov=verticalFovDeg*Math.PI/180;
  const half=Math.min(vfov/2,Math.atan(Math.tan(vfov/2)*aspect));
  return radius*padding/Math.sin(half);
}
// Clamp context to the local installation surroundings so a gigantic
// imported site does not turn a human-scale sculpture into a tiny dot.
export function localContextRadius(artRadius,siteRadius,mode) {
  if(!FRAME_MODES.includes(mode))throw Error("지원하지 않는 프레이밍 모드입니다.");
  const art=Math.max(.2,artRadius);
  const site=Math.max(art,siteRadius);
  if(mode==="sculpture")return art;
  if(mode==="nearby")return Math.max(art*1.45,Math.min(site,Math.max(art*3.5,12)));
  return site;
}
export function renderQualityFlags({width,height,limited,hasSite,hasArtwork,locked,shadowProfile}) {
  const notes=[];
  if(!hasSite)notes.push("실제 현장 모델이 아닌 예시 배경입니다.");
  if(!hasArtwork)notes.push("실제 작품 원본 모델이 아닌 예시 조형물입니다.");
  if(limited)notes.push("GPU 메모리 및 최대 텍스처 크기에 맞춰 출력 해상도가 축소됩니다.");
  if(width*height>14000000)notes.push("대형 PNG는 기기 GPU 메모리 사용량이 높을 수 있습니다.");
  if(shadowProfile==="high")notes.push("고품질 그림자 프로필은 GPU 부담이 증가합니다.");
  if(!locked)notes.push("MASTER 미승인: 현재 이미지는 편집 중인 임시 시안입니다.");
  return notes;
}
