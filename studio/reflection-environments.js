// AXOO Studio v3.8 — procedural soft equirectangular reflection gradients.
// Pure data generator. No rectangular studio panels, cube maps or bubble assets.
// This is a visual environment proxy, NOT physical reflections of buildings.
export const REFLECTION_ENVIRONMENTS=Object.freeze({
  "smooth-studio":Object.freeze({
    label:"미러 스테인리스 · 스무스 스튜디오",
    description:"하이라이트가 이어지는 저주파 그라데이션. 스튜디오 사각 박스/거품 형태 없음.",
    sky:[183,192,200],horizon:[223,226,226],ground:[115,125,135],tone:"studio"
  }),
  "outdoor-soft":Object.freeze({
    label:"자연광 · 부드러운 야외 반사",
    description:"넓은 하늘·지평선·지면 밝기를 추상화한 환경광. 실제 단지 주변 건물은 반사하지 않음.",
    sky:[140,172,201],horizon:[223,227,223],ground:[111,124,112],tone:"outdoor"
  })
});
export const REFLECTION_ENVIRONMENT_IDS=Object.freeze(Object.keys(REFLECTION_ENVIRONMENTS));
const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,n));
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a));return t*t*(3-2*t)};
export function softEnvironmentPixels(mode,width=256,height=128){
  const cfg=REFLECTION_ENVIRONMENTS[mode];
  if(!cfg||!Number.isInteger(width)||!Number.isInteger(height)||
    width<32||height<16||width>2048||height>1024)
    throw Error("지원하지 않는 반사 환경 또는 텍스처 크기입니다.");
  const rgba=new Uint8Array(width*height*4);
  for(let y=0;y<height;y++){
    const v=y/Math.max(1,height-1);
    // Y=0 points to sky, Y=1 to ground in equirectangular textures.
    const skyMix=smooth(.05,.49,v);
    const groundMix=smooth(.495,.92,v);
    const upper=cfg.sky.map((n,i)=>n*(1-skyMix)+cfg.horizon[i]*skyMix);
    const base=upper.map((n,i)=>n*(1-groundMix)+cfg.ground[i]*groundMix);
    for(let x=0;x<width;x++){
      const u=x/width,theta=u*Math.PI*2;
      // Broad wrapping highlight lobes; no sharp straight edges / square panels.
      // Cosine periodicity keeps the horizontal texture seam continuous.
      const broadA=Math.pow(Math.max(0,Math.cos(theta-.55)),4);
      const broadB=Math.pow(Math.max(0,Math.cos(theta-3.5)),3);
      const altitude=Math.exp(-Math.pow((v-(cfg.tone==="studio"?.36:.4))/.28,2));
      const highlight=altitude*(cfg.tone==="studio"?25*broadA+11*broadB:18*broadA+8*broadB);
      const offset=(y*width+x)*4;
      for(let c=0;c<3;c++)rgba[offset+c]=Math.round(clamp(base[c]+highlight,0,255));
      rgba[offset+3]=255;
    }
  }
  return {width,height,data:rgba,mode};
}
export function createSoftReflectionTexture(THREE,mode,width=256,height=128){
  const pixels=softEnvironmentPixels(mode,width,height);
  const texture=new THREE.DataTexture(pixels.data,pixels.width,pixels.height,THREE.RGBAFormat);
  texture.name="AXOO Soft Reflection · "+mode;
  texture.mapping=THREE.EquirectangularReflectionMapping;
  texture.colorSpace=THREE.SRGBColorSpace;
  texture.wrapS=THREE.RepeatWrapping;
  texture.minFilter=THREE.LinearFilter;
  texture.magFilter=THREE.LinearFilter;
  texture.generateMipmaps=false;
  texture.needsUpdate=true;
  return texture;
}
