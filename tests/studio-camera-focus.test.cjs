const fs=require("node:fs"),path=require("node:path"),vm=require("node:vm"),assert=require("node:assert/strict");
const code=fs.readFileSync(path.join(__dirname,"../studio/camera-focus.js"),"utf8");
const ctx={Object,Number,Math,Error,fitDistance:(radius,deg,aspect,padding)=>{
  const vfov=deg*Math.PI/180;
  return radius*padding/Math.sin(Math.min(vfov/2,Math.atan(Math.tan(vfov/2)*aspect)));
}};
vm.runInNewContext(code.replace(/^import[^\n]*\n/mg,"").replace(/\bexport\s+/g,"")+
  "\nthis.api={cameraFocusSettings,shouldAutoFocusImportedSite};",ctx);
const {cameraFocusSettings,shouldAutoFocusImportedSite}=ctx.api;
const small=cameraFocusSettings({radius:3,fov:46,aspect:16/9});
const huge=cameraFocusSettings({radius:5000,fov:46,aspect:16/9});
assert.ok(small.distance>3&&small.distance<100);
assert.ok(huge.distance>800,"5km diameter source must not be clamped to old 780m");
assert.ok(huge.maxDistance>huge.distance);
assert.ok(huge.far>huge.distance+5000);
assert.ok(huge.near>0&&huge.near<huge.distance);
assert.equal(shouldAutoFocusImportedSite(300,0),true);
assert.equal(shouldAutoFocusImportedSite(20,300),true);
assert.equal(shouldAutoFocusImportedSite(20,2),false);
assert.equal(shouldAutoFocusImportedSite(Infinity,2),false);
const veryHuge=cameraFocusSettings({radius:999999,fov:46,aspect:1});
assert.equal(veryHuge.limited,true);
assert.ok(veryHuge.maxDistance<=1000000);
assert.throws(()=>cameraFocusSettings({radius:-1,fov:46,aspect:1}));
console.log("PASS v2.2.1 huge OBJ camera fit, adaptive OrbitControls distance and safe clipping");