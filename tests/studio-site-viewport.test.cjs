const fs=require("node:fs"),path=require("node:path"),assert=require("node:assert/strict"),vm=require("node:vm");
const src=fs.readFileSync(path.join(__dirname,"../studio/site-viewport.js"),"utf8");
const context={Object,Array,Number,Math,Error};
vm.runInNewContext(src.replace(/^import .*;?$/mg,"").replace(/\bexport\s+/g,"")+
  "\nthis.api={normalizeSiteViewSettings,cutPlaneSpec,focusVisible,MAX_VIEW_MESHES};",context);
const {normalizeSiteViewSettings,cutPlaneSpec,focusVisible,MAX_VIEW_MESHES}=context.api;
assert.equal(MAX_VIEW_MESHES,10000);
assert.equal(JSON.stringify(normalizeSiteViewSettings()),
 JSON.stringify({mode:"solid",cut:"x-left",offset:0,radius:0}));
assert.equal(JSON.stringify(normalizeSiteViewSettings({mode:"section",cut:"z-rear",offset:18,radius:30})),
 JSON.stringify({mode:"section",cut:"z-rear",offset:18,radius:30}));
assert.equal(normalizeSiteViewSettings({mode:"bad",cut:"unsafe",offset:Infinity,radius:19}).mode,"solid");
assert.equal(normalizeSiteViewSettings({mode:"bad",cut:"unsafe",offset:Infinity,radius:19}).radius,0);
assert.equal(normalizeSiteViewSettings({mode:"section",offset:800}).offset,100);
assert.equal(JSON.stringify(cutPlaneSpec("x-left",[10,2,30],5)),
 JSON.stringify({normal:[-1,0,0],point:[15,0,0]}));
assert.equal(JSON.stringify(cutPlaneSpec("y-above",[10,2,30],-.5)),
 JSON.stringify({normal:[0,1,0],point:[0,1.5,0]}));
assert.equal(JSON.stringify(cutPlaneSpec("z-front",[1,2,3],0)),
 JSON.stringify({normal:[0,0,1],point:[0,0,3]}));
assert.throws(()=>cutPlaneSpec("invalid",[0,0,0]));
assert.throws(()=>cutPlaneSpec("x-left",[Infinity,0,0]));
assert.equal(focusVisible([10,-1,-1],[14,1,1],[0,0,0],15),true);
assert.equal(focusVisible([20,-1,-1],[22,1,1],[0,0,0],15),false);
assert.equal(focusVisible([20,0,0],[22,1,1],[0,0,0],0),true);
assert.equal(focusVisible([-30,-30,-30],[30,30,30],[0,0,0],15),true);
console.log("PASS v2.2 site views: valid settings, correct clip-plane normals, focus sphere and safe caps");