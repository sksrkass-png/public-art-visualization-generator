// AXOO v3.7 regression: Node built-in tests, no CDN/npm/browser prerequisites.
// node --test tests/studio-v3.7-stability.test.cjs
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const path=require("node:path");
const read=p=>fs.readFileSync(path.join(__dirname,"..",p),"utf8");
function loadPure(source, names,globals={}){
  return vm.runInNewContext(
    source.replace(/^\s*import\s+[\s\S]*?from\s+["'][^"']+["'];/gm,"")
      .replace(/^export\s+/gm,"")+
    "\n({"+names.join(",")+"})",globals,{timeout:5000});
}
const health=loadPure(read("studio/stability-qa.js"),
 ["archiveBudget","sceneHealth","readableBytes","PROJECT_ZIP_LIMIT","PROJECT_METADATA_LIMIT"]);
const workflow=loadPure(read("studio/visual-workflow.js"),["validVariant","validVariants"]);

test("empty project budget uses existing 320MB ZIP cap",()=>{
  const result=health.archiveBudget([],10000);
  assert.equal(result.rawBytes,10000);
  assert.equal(result.aboveRawBudget,false);
  assert.equal(result.zipLimit,320*1024*1024);
  assert.equal(health.PROJECT_METADATA_LIMIT,8*1024*1024);
});
test("budget lists are sorted and input is not modified",()=>{
  const files=[{label:"site",bytes:3*1048576},{label:"artwork",bytes:9*1048576}];
  const result=health.archiveBudget(files,1024);
  assert.deepEqual(Array.from(result.breakdown.map(x=>x.label)),["artwork","site"]);
  assert.equal(files[0].label,"site");
});
test("large raw ZIP warns without incorrectly rejecting compressible sources",()=>{
  const result=health.archiveBudget([{label:"site",bytes:120*1048576},
    {label:"art",bytes:120*1048576},{label:"assets",bytes:90*1048576}],4096);
  assert.equal(result.aboveRawBudget,true);
  assert.equal(health.sceneHealth({archive:result}).status,"review");
});
test("budget detects duplicate keys and bad byte sizes",()=>{
  assert.throws(()=>health.archiveBudget([{label:"a",bytes:1},{label:"a",bytes:2}]));
  assert.throws(()=>health.archiveBudget([{label:"a",bytes:-1}]));
  assert.throws(()=>health.archiveBudget([{label:"a",bytes:1.5}]));
});
test("normal and heavy scene have distinct health results",()=>{
  assert.equal(health.sceneHealth({meshes:200,triangles:120000,extras:40,drawCalls:300}).status,"ok");
  const v=health.sceneHealth({meshes:2500,triangles:2000000,extras:500,drawCalls:2200});
  assert.equal(v.status,"review");
  assert.ok(v.notices.length>=4);
});
test("GPU context loss is a blocker",()=>{
  const v=health.sceneHealth({gpuLost:true});
  assert.equal(v.status,"block");
  assert.match(v.notices[0].text,/WebGL/);
});
test("readable size uses real MiB",()=>{
  assert.equal(health.readableBytes(1048576),"1.0MB");
  assert.throws(()=>health.readableBytes(-1));
});
function variant(extrasCount){
  return {
    slot:"A",name:"A안",sourceArt:"Sample Artwork",sourceSite:"",
    scene:{artwork:{p:[0,0,0],r:[0,0,0],s:[1,1,1]},
      extras:Array.from({length:extrasCount},(_,i)=>({id:i+1}))},
    camera:{position:[10,3,8],target:[0,1,0],fov:40},
    lighting:{ambient:1},render:{aspect:"landscape16x9"}
  };
}
test("A/B/C validation accepts 135 scene extras (formerly capped at 120)",()=>{
  assert.equal(workflow.validVariant(variant(135)),true);
  assert.equal(workflow.validVariants({A:variant(135)}),true);
});
test("A/B/C validation accepts 1,000 independent scene extras",()=>{
  assert.equal(workflow.validVariant(variant(1000)),true);
});
test("malformed variant still fails",()=>{
  assert.equal(workflow.validVariant({...variant(150),camera:{}}),false);
});
test("source wiring keeps original archive and MASTER guards",()=>{
  const code=read("studio/studio.js"),html=read("studio/index.html");
  assert.match(code,/const PROJECT_ARCHIVE_SCHEMA = "axoo-public-art-portable-v1"/);
  assert.match(code,/const MAX_ZIP_BYTES = PROJECT_ZIP_LIMIT/);
  assert.match(code,/if \(approvedMaster\) return notify\("MASTER LOCK을 해제한 뒤 프로젝트 ZIP/);
  assert.match(code,/if\(archiveExportInProgress\)return notify/);
  assert.match(code,/checkedArchiveEntry\(zip, "project\.json", PROJECT_METADATA_LIMIT, true\)/);
  assert.match(code,/if\(document\.hidden\|\|gpuContextLost\)return/);
  assert.match(html,/VERSION [34]\.\d+(?:\.\d+)? ·/);
  assert.match(html,/id="stability-audit-run"/);
  assert.match(html,/id="gpu-recovery-status"/);
});
test("packed site scan is non-mutating and avoids expensive coordinate getters",()=>{
  class Vector3 {
    constructor(x=0,y=0,z=0){this.x=x;this.y=y;this.z=z}
    set(x,y,z){this.x=x;this.y=y;this.z=z;return this}
    toArray(){return [this.x,this.y,this.z]}
  }
  class Box3 {
    constructor(){this.min=new Vector3(-5,0,-4);this.max=new Vector3(5,6,4)}
    setFromObject(){return this}
    getSize(){return new Vector3(10,6,8)}
    getCenter(){return new Vector3(0,3,0)}
  }
  const THREE={Box3,Vector3};
  const {inspectImportedSite}=loadPure(read("studio/site-import.js"),
    ["inspectImportedSite"],{THREE});
  let calls=0;
  const attr={isBufferAttribute:true,normalized:false,itemSize:3,count:3,
    array:new Float32Array([0,0,0,1,1,1,2,2,2]),
    getX(){calls++;return 0},getY(){calls++;return 0},getZ(){calls++;return 0}};
  const mesh={isMesh:true,geometry:{getAttribute:k=>k==="position"?attr:null,index:null},
    material:{uuid:"test"}};
  const root={updateWorldMatrix(){},traverse(fn){fn(mesh)}};
  const before=Array.from(attr.array);
  const result=inspectImportedSite(root);
  assert.equal(result.meshCount,1);
  assert.equal(result.pointCount,3);
  assert.equal(calls,0);
  assert.deepEqual(Array.from(attr.array),before);
});
