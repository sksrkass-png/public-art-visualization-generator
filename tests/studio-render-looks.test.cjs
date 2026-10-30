const fs=require("node:fs"),path=require("node:path"),vm=require("node:vm"),assert=require("node:assert/strict");
const src=fs.readFileSync(path.join(__dirname,"../studio/render-looks.js"),"utf8");
const scope={Object,Number,Math,Array,Error};
vm.runInNewContext(src.replace(/\bexport\s+/g,"")+
  "\nthis.api={ARCHVIZ_LOOKS,SHADOW_CONFIGS,renderShadowSettings,fillLightIntensity,SKY_COLORS,NIGHT_SKY_COLOR,NIGHT_KEY_COLOR};",scope);
const {ARCHVIZ_LOOKS,SHADOW_CONFIGS,renderShadowSettings,fillLightIntensity,SKY_COLORS,NIGHT_SKY_COLOR,NIGHT_KEY_COLOR}=scope.api;
assert.equal(Object.keys(ARCHVIZ_LOOKS).length,4);
assert.ok(["architectural","soft","detail","night"].every(key=>!!ARCHVIZ_LOOKS[key]));
for(const preset of Object.values(ARCHVIZ_LOOKS)){
  assert.ok(preset.elevation>=5 && preset.elevation<=85,"daytime sun elevation");
  assert.ok(preset.sun>=0 && preset.sun<=5,"render-only sun range");
  assert.ok(preset.ambient>=0 && preset.ambient<=4,"render-only ambient range");
  assert.ok(preset.environmentIntensity>=0 && preset.environmentIntensity<=3);
  assert.ok(SHADOW_CONFIGS[preset.shadowProfile]);
}
const profiles=["balanced","high","soft"].map(profile=>renderShadowSettings({
  width:3,height:5,depth:2,profile,maxTextureSize:8192
}));
assert.equal(profiles[0].resolution,2048);
assert.equal(profiles[1].resolution,4096);
assert.equal(profiles[2].resolution,2048);
assert.ok(profiles[2].radius>profiles[1].radius,"soft shadows spread pixels more widely");
const small=renderShadowSettings({width:2,height:3,depth:2,profile:"high",maxTextureSize:2048});
assert.equal(small.resolution,2048,"shadow texture respects GPU cap");
const huge=renderShadowSettings({width:5000,height:60,depth:5000,profile:"high",maxTextureSize:8192});
assert.ok(huge.reach<=120,"huge imported scene cannot expand sculpture shadow to city scale");
assert.ok(huge.far>huge.reach*2);
assert.ok(fillLightIntensity(1.1)>.04 && fillLightIntensity(1.1)<.3);
assert.throws(()=>renderShadowSettings({width:NaN,height:3,depth:4}),/유효하지/);
const html=fs.readFileSync(path.join(__dirname,"../studio/index.html"),"utf8");
const app=fs.readFileSync(path.join(__dirname,"../studio/studio.js"),"utf8");
const stage=fs.readFileSync(path.join(__dirname,"../studio/visual-option-render.js"),"utf8");
for(const key of Object.keys(ARCHVIZ_LOOKS))assert.match(html,
  new RegExp('data-render-look="'+key+'"'));
assert.match(html,/value="soft"/);
assert.ok(html.includes('data-render-look="night"'));
assert.ok(html.includes("🌗 ARCHVIZ · 원클릭 주·야간 룩"));
assert.ok(html.includes("🧰 조작 패널"));
assert.ok(html.includes("🎞️ MASTER 8-VIEW RENDER"));
assert.ok(html.includes("🗺️ SCENE LAYERS / 레이어"));
assert.equal(ARCHVIZ_LOOKS.night.lightPreset,"night");
assert.ok(ARCHVIZ_LOOKS.night.sun>0 && ARCHVIZ_LOOKS.night.sun<ARCHVIZ_LOOKS.architectural.sun);
assert.ok(ARCHVIZ_LOOKS.night.ambient<ARCHVIZ_LOOKS.architectural.ambient);
assert.ok(ARCHVIZ_LOOKS.night.environmentIntensity<ARCHVIZ_LOOKS.architectural.environmentIntensity);
assert.notEqual(NIGHT_SKY_COLOR,0xdce0e2);
assert.notEqual(NIGHT_KEY_COLOR,0xfff7e6);
assert.ok(SKY_COLORS.blue!==undefined);
assert.notEqual(SKY_COLORS.blue,SKY_COLORS.cool);
assert.notEqual(SKY_COLORS.blue,SKY_COLORS.white);
assert.ok(html.includes('<option value="blue">🔵 푸른 맑은 하늘</option>'));
assert.match(app,/SKY_COLORS\[settings.sky\]/);
assert.match(stage,/SKY_COLORS\[kind\]/);
const extras=fs.readFileSync(path.join(__dirname,"../studio/extras.js"),"utf8");
assert.match(extras,/RECESSED_GROUND_LIGHT/);
assert.match(extras,/diameter:\.24,height:\.055/);
assert.match(extras,/const recessed=uplight&&appearanceVersion>=4/);
assert.match(extras,/recessedGroundHousing\(root\)/);
assert.match(extras,/if\(!recessed\)lightIcon\(root,kind\)/);
assert.match(extras,/export function upgradeGroundLight\(root\)/);
assert.match(app,/kind==="point-light"\?4:2/);
assert.match(app,/ground-light-upgrade/);
assert.match(extras,/\[1,2,3,4\]\.includes\(x.appearanceVersion\)/);

assert.match(app,/saved.lightPreset/);
assert.match(app,/master.lightPreset/);
assert.match(app,/NIGHT_SKY_COLOR/);
assert.match(app,/NIGHT_KEY_COLOR/);
assert.match(stage,/NIGHT_SKY_COLOR/);
assert.match(stage,/NIGHT_KEY_COLOR/);
assert.match(app,/lastSunArtworkPosition/);
assert.match(app,/renderShadowSettings\(/);
assert.match(stage,/renderShadowSettings\(/);
assert.match(stage,/fillLightIntensity\(/);
assert.doesNotMatch(src,/artRoot\.|siteRoot\.|\.geometry\s*=/,
  "render-only helper must never mutate source geometry");
console.log("PASS v2.8 daylight recipe validity, bounded shadow maps and renderer-only context");
