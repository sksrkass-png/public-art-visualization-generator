import {validVisualSettings,normalizeVisualSettings} from "./modeling-quality.js";
import * as THREE from "three";

export const OUTPUT_ASPECTS = Object.freeze({
  viewport: 0, landscape16x9: 16/9, classic4x3:4/3, editorial3x2:3/2,
  square:1, portrait4x5:4/5, portrait9x16:9/16
});
export const ART_MATERIALS = Object.freeze({
  original: {label:"원본 유지"},
  painted: {label:"도장 금속", metalness:.62,roughness:.36},
  stainless: {label:"브러시드 스테인리스", metalness:1,roughness:.28},
  mirror: {label:"미러 스테인리스", metalness:1,roughness:.065},
  stone: {label:"석재", metalness:0,roughness:.82},
  glass: {label:"투명 유리", metalness:0,roughness:.035,transmission:.94,thickness:.24,ior:1.5},
  frosted: {label:"반투명 유리", metalness:0,roughness:.39,transmission:.72,thickness:.4,ior:1.5}
});
export const ENVIRONMENT_MODES = Object.freeze(["neutral","bright","overcast","hdr"]);
export function validMaterialConfig(data) {
  return !!data && typeof data==="object" &&
    Object.hasOwn(ART_MATERIALS,data.preset) &&
    typeof data.color==="string" && /^#[\da-f]{6}$/i.test(data.color);
}
export function validRenderConfig(data) {
  return !!data && typeof data==="object" &&
    Object.hasOwn(OUTPUT_ASPECTS,data.aspect) &&
    ENVIRONMENT_MODES.includes(data.environmentMode) &&
    typeof data.environmentFile==="string" && data.environmentFile.length<=120 &&
    Number.isFinite(data.envIntensity) && data.envIntensity>=0 && data.envIntensity<=3 &&
    Number.isFinite(data.focalLength) && data.focalLength>=16 && data.focalLength<=120 &&
    [2,3,4].includes(data.multiplier) &&
    validMaterialConfig(data.artworkMaterial) &&
    (data.visual===undefined || validVisualSettings(data.visual));
}
export function normalizeRenderConfig(value) {
  const defaults={
    aspect:"viewport", environmentMode:"neutral",environmentFile:"",
    envIntensity:1, focalLength:38.3, multiplier:2,
    artworkMaterial:{preset:"original",color:"#d0d6db"},
    visual:normalizeVisualSettings()
  };
  return validRenderConfig(value) ? {...structuredClone(value),visual:normalizeVisualSettings(value.visual)} : defaults;
}
export function targetSize(viewportWidth,viewportHeight,aspect,multiplier,maxTextureSize=8192,maxPixels=20000000) {
  const width=Math.max(1,Math.round(viewportWidth));
  const height=Math.max(1,Math.round(viewportHeight));
  const desired=OUTPUT_ASPECTS[aspect]||width/height;
  let targetWidth, targetHeight;
  if (aspect==="viewport") {
    targetWidth=width*multiplier;
    targetHeight=height*multiplier;
  } else {
    // Fixed height preserves intuitive "scale" from the interactive viewport,
    // avoids wildly changing shot size for tall print ratios.
    targetHeight=height*multiplier;
    targetWidth=targetHeight*desired;
  }
  const maxDim=Math.max(targetWidth,targetHeight);
  const clamp=Math.min(1,maxTextureSize/maxDim,Math.sqrt(maxPixels/(targetWidth*targetHeight)));
  return {
    width:Math.max(1,Math.floor(targetWidth*clamp)),
    height:Math.max(1,Math.floor(targetHeight*clamp)),
    limited:clamp<.999
  };
}
export function makeMaterial(preset,color) {
  const source=ART_MATERIALS[preset];
  if(!source || preset==="original")throw Error("Explicit material override required");
  return new THREE.MeshPhysicalMaterial({
    color:new THREE.Color(color),
    metalness:source.metalness,
    roughness:source.roughness,
    transmission:source.transmission||0,
    thickness:source.thickness||0,
    ior:source.ior||1.5,
    clearcoat:preset==="painted"?.45:0,
    clearcoatRoughness:.23,
    envMapIntensity:1,
    side:THREE.DoubleSide
  });
}
