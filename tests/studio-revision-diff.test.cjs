const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const assert=require("node:assert/strict");
const source=fs.readFileSync(path.join(__dirname,"../studio/revision-diff.js"),"utf8");
const scope={Date,JSON,Number,Math,Array,Object,Set,Error,String};
vm.runInNewContext(source.replace(/\bexport\s+/g,"")+"\nthis.api={compareMasterRevisions,REVISION_DIFF_SCHEMA};",scope);
const {compareMasterRevisions,REVISION_DIFF_SCHEMA}=scope.api;
const clone=o=>JSON.parse(JSON.stringify(o));
const first={
  revision:1,approvedAt:"2026-10-22T11:00:00.000Z",
  artworkFile:"sculpture.glb",siteFile:"plaza.glb",planFile:"plan.png",
  artworkTransform:{p:[0,0,0],r:[0,0,0],s:[1,1,1]},
  material:{preset:"original",color:"#d0d6db"},
  siteSetup:{unit:"m",up:"y",centerOrigin:false},
  extras:[{id:10,kind:"tree-round",transform:{p:[2,0,1],r:[0,0,0],s:[1,1,1]},hidden:false}],
  library:[],layers:{groups:{artwork:{locked:true},site:{locked:true}}},
  planAlignment:{x:0,z:0},camera:{position:[5,4,6],target:[0,0,0],fov:45},
  lighting:{"sun-azimuth":130,exposure:1},shadows:true,
  render:{aspect:"16:9",multiplier:1}
};
function revised(fn){const copy=clone(first);copy.revision=2;copy.approvedAt="2026-10-23T11:00:00.000Z";fn(copy);return copy;}
{
 const b=revised(()=>{});
 const report=compareMasterRevisions(first,b);
 assert.equal(report.schema,REVISION_DIFF_SCHEMA);
 assert.equal(report.total,0,"only revision metadata changed");
 assert.equal(report.unchanged,true);
}
{
 const b=revised(v=>{v.artworkTransform.p[0]=2;v.artworkTransform.r[1]=Math.PI/2;
   v.material.preset="chrome";});
 const report=compareMasterRevisions(first,b);
 assert.equal(report.counts.critical,4,"position axis + distance + 90° rotation + material");
 assert.ok(report.changes.find(c=>c.label==="작품 설치 좌표 · X"&&c.summary.includes("2m")));
 assert.ok(report.changes.find(c=>c.label==="작품 회전 · Y"&&c.summary.includes("90°")));
 assert.ok(report.changes.find(c=>c.label==="작품 좌표 이동 거리"));
 assert.equal(report.counts.context,0);
 assert.equal(report.counts.visual,0);
}
{
 const b=revised(v=>{v.camera.position[0]=8;v.lighting.exposure=.7;v.shadows=false;});
 const report=compareMasterRevisions(first,b);
 assert.equal(report.counts.critical,0);
 assert.equal(report.counts.visual,3,"camera, light, shadows are presentation-only");
}
{
 const b=revised(v=>{v.extras[0].transform.p[0]=3;v.extras.push({id:12,kind:"artwork-copy",
   transform:{p:[4,0,0],r:[0,0,0],s:[1,1,1]}});});
 const report=compareMasterRevisions(first,b);
 assert.equal(report.counts.context,1,"plant move is context");
 assert.equal(report.counts.critical,1,"artwork-copy is critical");
}
{
 const b=revised(v=>{v.extras=[...v.extras].reverse();v.library=[{id:"lib1",name:"asset.glb",
   category:"artwork",byteSize:300}];v.siteFile="another-site.glb";});
 const report=compareMasterRevisions(first,b);
 assert.equal(report.counts.critical,1,"site source identity is critical");
 assert.equal(report.counts.context,1,"asset library change is context");
 assert.equal(report.changes.find(x=>x.label==="현장 소스 파일").current,"another-site.glb");
}
{
 const b=revised(v=>{v.extras[0].transform.p[0]+=.000001;});
 assert.equal(compareMasterRevisions(first,b).total,0,"floating-point jitter is ignored");
}
{
 const b=revised(v=>{v.siteSetup.unit="cm";v.siteSetup.centerOrigin=true;});
 const report=compareMasterRevisions(first,b);
 assert.equal(report.counts.critical,2,"site units and origin changes must be critical");
 assert.ok(report.changes.some(item=>item.label.includes("centerOrigin")));
}
assert.throws(()=>compareMasterRevisions(first,first),/서로 다르게/);
assert.throws(()=>compareMasterRevisions(revised(()=>{}),first),/앞서야/);
assert.match(source,/source binary checksums/,"explicit mesh-integrity limitations remain visible");
console.log("PASS v1.6 revision diff: metadata-only, engineering severity, precise rotation, source changes and zero-mutability");
