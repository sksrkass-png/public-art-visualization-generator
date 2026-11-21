// AXOO v3.8 — offline material/reflection regression tests.
// Run: node --test tests/studio-v3.8-materials.test.cjs
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const text=file=>fs.readFileSync(path.join(__dirname,"..",file),"utf8");
function pure(file,names,globals={}){
  const source=text(file)
    .replace(/^\s*import\s+[\s\S]*?from\s+["'][^"']+["'];/gm,"")
    .replace(/^export\s+/gm,"");
  return vm.runInNewContext(source+"\n({"+names.join(",")+"})",
    {...globals,structuredClone},{timeout:5000});
}
class Colour{constructor(value){this.value=value;}}
class PhysicalMaterial{constructor(props){Object.assign(this,props);}}
const THREE={Color:Colour,MeshPhysicalMaterial:PhysicalMaterial,DoubleSide:2};
const render=pure("studio/rendering.js",[
  "ENVIRONMENT_MODES","ART_MATERIALS","validMaterialConfig","validMaterialTuning",
  "validRenderConfig","normalizeRenderConfig","makeMaterial","materialTuningForPreset"
],{THREE,validVisualSettings:()=>true,normalizeVisualSettings:()=>({toneCurve:"aces",sky:"cool",shadowProfile:"balanced"})});
const reflect=pure("studio/reflection-environments.js",[
 "REFLECTION_ENVIRONMENTS","REFLECTION_ENVIRONMENT_IDS","softEnvironmentPixels","createSoftReflectionTexture"
]);

test("Two extra reflection profiles are selectable without changing legacy modes",()=>{
 assert.ok(render.ENVIRONMENT_MODES.includes("neutral"));
 assert.ok(render.ENVIRONMENT_MODES.includes("hdr"));
 assert.ok(render.ENVIRONMENT_MODES.includes("smooth-studio"));
 assert.ok(render.ENVIRONMENT_MODES.includes("outdoor-soft"));
 assert.equal(reflect.REFLECTION_ENVIRONMENT_IDS.length,2);
});
test("Smooth reflection map uses a 256×128 wrap-friendly RGBA gradient",()=>{
 const env=reflect.softEnvironmentPixels("smooth-studio");
 assert.equal(env.data.length,256*128*4);
 assert.ok(env.data.some(n=>n>100));
 for(const y of [0,30,64,100,127]){
   const p=(y*256)*4,q=(y*256+255)*4;
   for(let channel=0;channel<3;channel++)
     assert.ok(Math.abs(env.data[p+channel]-env.data[q+channel])<=5);
   assert.equal(env.data[p+3],255);
 }
});
test("Gradient has continuously varying colours rather than square or bubble images",()=>{
 const a=reflect.softEnvironmentPixels("smooth-studio",64,32);
 const b=reflect.softEnvironmentPixels("outdoor-soft",64,32);
 assert.notDeepEqual(Array.from(a.data),Array.from(b.data));
 const row=16;let distinct=new Set();
 for(let x=0;x<64;x++)distinct.add(a.data[(row*64+x)*4]);
 assert.ok(distinct.size>5);
});
test("Invalid environment names and invalid texture sizes fail",()=>{
 assert.throws(()=>reflect.softEnvironmentPixels("unknown"));
 assert.throws(()=>reflect.softEnvironmentPixels("smooth-studio",10,10));
 assert.throws(()=>reflect.softEnvironmentPixels("smooth-studio",5000,100));
});
test("Texture adapter sets required Three.js equirectangular color space",()=>{
 class DataTexture{constructor(data,width,height,format){Object.assign(this,{data,width,height,format});}}
 const shim={DataTexture,RGBAFormat:10,EquirectangularReflectionMapping:11,
   SRGBColorSpace:12,RepeatWrapping:13,LinearFilter:14};
 const tex=reflect.createSoftReflectionTexture(shim,"smooth-studio",64,32);
 assert.equal(tex.width,64);
 assert.equal(tex.height,32);
 assert.equal(tex.mapping,11);
 assert.equal(tex.colorSpace,12);
 assert.equal(tex.needsUpdate,true);
});
test("Legacy pre-3.8 source material metadata remains valid",()=>{
 assert.equal(render.validMaterialConfig({preset:"mirror",color:"#d0d6db"}),true);
 assert.equal(render.validMaterialConfig({preset:"original",color:"#d0d6db"}),true);
 assert.equal(render.validMaterialConfig({preset:"notreal",color:"#d0d6db"}),false);
});
test("Detailed metal settings within bounds are valid",()=>{
 const tuning={roughness:.07,metalness:1,reflection:1.5,anisotropy:0};
 assert.equal(render.validMaterialTuning(tuning),true);
 assert.equal(render.validMaterialConfig({preset:"mirror",color:"#abcdef",tuning}),true);
});
test("Unsafe/out-of-bounds material tuning fails",()=>{
 const base=render.materialTuningForPreset("stainless");
 assert.equal(render.validMaterialTuning({...base,roughness:-.1}),false);
 assert.equal(render.validMaterialTuning({...base,metalness:2}),false);
 assert.equal(render.validMaterialTuning({...base,reflection:3.5}),false);
 assert.equal(render.validMaterialTuning({...base,anisotropy:NaN}),false);
 assert.equal(render.validMaterialTuning({...base,unknown:1}),false);
});
test("Mirror material uses smooth microfinish and chosen reflectivity",()=>{
 const tuning={roughness:.03,metalness:1,reflection:1.3,anisotropy:0};
 const m=render.makeMaterial("mirror","#ccddee",tuning);
 assert.equal(m.roughness,.03);
 assert.equal(m.metalness,1);
 assert.equal(m.envMapIntensity,1.3);
 assert.equal(m.color.value,"#ccddee");
});
test("Brushed metal directional anisotropy is only applied to material override",()=>{
 const brush=render.makeMaterial("stainless","#dddddd");
 assert.equal(brush.anisotropy,.45);
 assert.equal(brush.roughness,.28);
});
test("Original material preset never creates a replacement",()=>{
 assert.throws(()=>render.makeMaterial("original","#ffffff"));
});
test("Old project material settings normalize without tuning loss",()=>{
 const old={aspect:"viewport",environmentMode:"neutral",environmentFile:"",
   envIntensity:1,focalLength:38.3,multiplier:2,
   artworkMaterial:{preset:"original",color:"#d0d6db"}};
 assert.equal(render.validRenderConfig(old),true);
 assert.equal(render.normalizeRenderConfig(old).artworkMaterial.preset,"original");
});
test("New project configuration stores smooth environment and tuned mirror",()=>{
 const config={aspect:"landscape16x9",environmentMode:"smooth-studio",environmentFile:"",
   envIntensity:1.1,focalLength:40,multiplier:3,
   artworkMaterial:{preset:"mirror",color:"#aabbcc",
     tuning:{roughness:.04,metalness:1,reflection:1.2,anisotropy:0}}};
 assert.equal(render.validRenderConfig(config),true);
 assert.equal(render.normalizeRenderConfig(config).artworkMaterial.tuning.roughness,.04);
});
test("A/B/C detached rendering receives reflection resolver and same material tuning",()=>{
 const stage=text("studio/visual-option-render.js");
 assert.match(stage,/resolveSoftEnvironment/);
 assert.match(stage,/materialConfig\.tuning\|\|null/);
});
test("MASTER editing protection is present for all added controls",()=>{
 const source=text("studio/studio.js");
 assert.match(source,/art-roughness","art-metalness","art-reflection","art-anisotropy"/);
 assert.match(source,/env-mode","env-strength","env-file","clear-hdr"/);
 assert.match(source,/if\(approvedMaster\)return notify\("MASTER LOCK 해제 후 HDRI/);
 assert.match(source,/recordUndo:true/);
});
