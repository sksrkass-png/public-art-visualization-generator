// v2.8 — render-only lighting recipes. No mesh/source/master edits.
// WebGL PBR lighting, not path-traced or generative photorealism.
export const NIGHT_SKY_COLOR=0x11192c;   // deep midnight blue, for browser render only
export const NIGHT_KEY_COLOR=0xb6d0ff;   // cool moonlit directional illumination
export const ARCHVIZ_LOOKS=Object.freeze({
  architectural:Object.freeze({
    label:"따뜻한 건축 주광",lightPreset:"clear",azimuth:48,elevation:43,
    sun:2.25,ambient:1.05,exposure:1.05,
    shadowProfile:"high",toneCurve:"aces",sky:"warm",
    environmentMode:"neutral",environmentIntensity:1.1
  }),
  soft:Object.freeze({
    label:"부드러운 흐린 주광",lightPreset:"cloudy",azimuth:50,elevation:58,
    sun:1.15,ambient:1.55,exposure:1.0,
    shadowProfile:"soft",toneCurve:"aces",sky:"white",
    environmentMode:"overcast",environmentIntensity:1.15
  }),
  detail:Object.freeze({
    label:"조형물 입체감 강조",lightPreset:"clear",azimuth:75,elevation:37,
    sun:2.8,ambient:.8,exposure:1.0,
    shadowProfile:"high",toneCurve:"neutral",sky:"cool",
    environmentMode:"bright",environmentIntensity:1.05
  }),
  night:Object.freeze({
    label:"달빛이 비치는 야간",lightPreset:"night",azimuth:125,elevation:28,
    sun:1.1,ambient:.48,exposure:1.1,
    shadowProfile:"soft",toneCurve:"aces",sky:"cool",
    environmentMode:"neutral",environmentIntensity:.55
  })
});
export const SHADOW_CONFIGS=Object.freeze({
  balanced:Object.freeze({resolution:2048,normalBias:.018,bias:-.0001,radius:2}),
  high:Object.freeze({resolution:4096,normalBias:.009,bias:-.00008,radius:1.3}),
  soft:Object.freeze({resolution:2048,normalBias:.025,bias:-.0001,radius:3.5})
});
export function renderShadowSettings({width,height,depth,profile="balanced",maxTextureSize=4096}){
  if(![width,height,depth].every(v=>Number.isFinite(v)&&v>=0))
    throw Error("그림자 대상 경계가 유효하지 않습니다.");
  const look=SHADOW_CONFIGS[profile]||SHADOW_CONFIGS.balanced;
  const maxDim=Math.max(width,height,depth);
  // Shadow camera tightly frames sculpture + immediate ground, not the whole city.
  const reach=Math.min(120,Math.max(8,maxDim*1.55+5));
  const device=Number.isFinite(maxTextureSize)?Math.max(512,Math.floor(maxTextureSize)):2048;
  // Bound each shadow texture to protect device memory.
  const resolution=Math.min(look.resolution,device,4096);
  return {reach,resolution,near:.5,far:Math.max(180,reach*3.5),
    bias:look.bias,normalBias:look.normalBias,radius:look.radius};
}
export function fillLightIntensity(ambientLevel){
  const ambient=Number(ambientLevel);
  return Number.isFinite(ambient)?Math.min(.3,Math.max(.04,ambient*.14)):.12;
}
