const fs=require("node:fs"),path=require("node:path"),vm=require("node:vm"),assert=require("node:assert/strict");
const source=fs.readFileSync(path.join(__dirname,"../studio/production-qa.js"),"utf8");
const scope={Object,Number,Math,Array,Error,atob};
vm.runInNewContext(source.replace(/\bexport\s+/g,"")+
  "\nthis.api={sceneFootprint,productionReport,verifyPngCapture,assertRendererAvailable};",scope);
const {sceneFootprint,productionReport,verifyPngCapture,assertRendererAvailable}=scope.api;
const geom={getAttribute(name){return name==="position"?{count:900}:null;},index:{count:1800}};
const root={traverse(fn){
  fn({isMesh:true,geometry:geom,material:{color:1}});
  fn({isMesh:true,isInstancedMesh:true,count:2,geometry:geom,material:[{},{}]});
  fn({isMesh:false});
}};
const metrics=sceneFootprint(root);
assert.equal(metrics.meshes,2);
assert.equal(metrics.triangles,1800,"instancing should count rendered triangles");
assert.equal(metrics.drawMaterials,3);
assert.equal(metrics.vertices,2700);
const common={project:"Real project",siteModel:true,artworkModel:true,masterApproved:true,
  masterMatches:true,site:{meshes:100,triangles:120000},artwork:{meshes:5,triangles:10000},
  extras:{meshes:4,triangles:20000},output:{width:2560,height:1440,limited:false}};
const clean=productionReport(common);
assert.equal(clean.state,"candidate");
assert.equal(clean.metrics.totalTriangles,150000);
assert.equal(clean.blockers.length,0);
assert.equal(clean.warnings.length,0);
const draft=productionReport({...common,masterApproved:false,artworkModel:false});
assert.equal(draft.state,"blocked");
assert.ok(draft.blockers.some(x=>x.includes("MASTER")));
assert.ok(draft.warnings.some(x=>x.includes("원본")));
const heavy=productionReport({...common,site:{meshes:2100,triangles:1700000},
  output:{width:6000,height:4000,limited:true}});
assert.equal(heavy.state,"review");
assert.ok(heavy.warnings.some(x=>x.includes("삼각형")));
assert.ok(heavy.warnings.some(x=>x.includes("메시")));
assert.ok(heavy.warnings.some(x=>x.includes("GPU")));
const lost=productionReport({...common,gpuContextLost:true});
assert.equal(lost.state,"blocked");
assert.throws(()=>assertRendererAvailable({getContext:()=>({isContextLost:()=>true}),
  domElement:{width:100,height:100}}),/WebGL/);
assert.doesNotThrow(()=>assertRendererAvailable({getContext:()=>({isContextLost:()=>false}),
  domElement:{width:100,height:100}}));
function mockPng(width,height){
  const bytes=Buffer.alloc(33,0);
  Buffer.from([137,80,78,71,13,10,26,10]).copy(bytes,0);
  bytes.writeUInt32BE(13,8);bytes.write("IHDR",12,"ascii");
  bytes.writeUInt32BE(width,16);bytes.writeUInt32BE(height,20);
  return "data:image/png;base64,"+bytes.toString("base64");
}
const png=mockPng(1920,1080);
assert.equal(verifyPngCapture(png,1920,1080).width,1920);
assert.throws(()=>verifyPngCapture(png,1080,1920),/불일치/);
assert.throws(()=>verifyPngCapture("data:image/png;base64,AAAA",1920,1080),/헤더|인코딩/);
assert.throws(()=>verifyPngCapture("data:text/plain;base64,AAAA",1920,1080),/PNG/);
const app=fs.readFileSync(path.join(__dirname,"../studio/studio.js"),"utf8");
const html=fs.readFileSync(path.join(__dirname,"../studio/index.html"),"utf8");
for(const id of ["production-audit-run","production-audit-summary","production-audit-metrics","production-audit-export"]){
  assert.ok(html.includes('id="'+id+'"'),id+" must exist");
  assert.ok(app.includes('"'+id+'"'),id+" runtime handler required");
}
assert.ok(app.match(/verifyPngCapture\(/g).length>=3,"single/compare/eight-shot renders must verify PNG sizes");
assert.match(app,/sceneBefore!==sceneAfter/,"single export requires integrity check");
assert.match(app,/for\(const \[node,wasVisible\] of editorIcons\)node.visible=wasVisible/,
  "render must restore each editor marker to its original visibility");
assert.doesNotMatch(source,/\.position\.set\(|\.material\s*=|\.geometry\s*=/,
  "QA library must not mutate scene source");
console.log("PASS v3.0 scene complexity audit, GPU health, PNG dimensions, source/selection restoration");
