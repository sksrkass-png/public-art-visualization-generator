const fs=require("node:fs"),path=require("node:path"),vm=require("node:vm"),assert=require("node:assert/strict");
const src=fs.readFileSync(path.join(__dirname,"../studio/context-catalog.js"),"utf8");
const scope={Object,String,Number,Math,Array,Set,Error};
vm.runInNewContext(src.replace(/\bexport\s+/g,"")+
  "\nthis.api={CONTEXT_CATALOG,CONTEXT_CATEGORIES,filterContextCatalog,uniformHeightScale,dimensionsLabel};",scope);
const {CONTEXT_CATALOG,filterContextCatalog,uniformHeightScale,dimensionsLabel}=scope.api;
assert.equal(CONTEXT_CATALOG.length,14,"built-in palette must contain 14 searchable entries");
for(const kind of ["tree-birch","grass-patch","car-sedan","bollard"]){
  assert.equal(CONTEXT_CATALOG.filter(a=>a.kind===kind).length,1,kind+" catalog entry");
}
assert.equal(filterContextCatalog("  승용차  ","all")[0].kind,"car-sedan");
assert.equal(filterContextCatalog("car","street")[0].kind,"car-sedan");
assert.equal(filterContextCatalog("bench","planting").length,0);
assert.equal(filterContextCatalog("","people").length,2);
assert.equal(filterContextCatalog("","all").length,CONTEXT_CATALOG.length);
assert.equal(dimensionsLabel([1.75,1.6,4.5]),"1.75 × 1.60 × 4.50m (W×H×D)");
assert.equal(uniformHeightScale(1,2,[1,1,1]),2);
assert.equal(uniformHeightScale(5.5,6.6,[1,1,1]),1.2);
assert.throws(()=>uniformHeightScale(0,2),/높이/);
assert.throws(()=>uniformHeightScale(2,Infinity),/높이/);
assert.throws(()=>uniformHeightScale(2,41),/높이/);
assert.throws(()=>uniformHeightScale(.1,40,[100,100,100]),/제한/);
const extras=fs.readFileSync(path.join(__dirname,"../studio/extras.js"),"utf8");
const html=fs.readFileSync(path.join(__dirname,"../studio/index.html"),"utf8");
const js=fs.readFileSync(path.join(__dirname,"../studio/studio.js"),"utf8");
const assets=fs.readFileSync(path.join(__dirname,"../studio/assets.js"),"utf8");
for(const kind of ["tree-birch","grass-patch","car-sedan","bollard"]){
  assert.ok(extras.includes('"'+kind+'"'),kind+" must be constructible and restorable");
  assert.ok(html.includes('data-add-extra="'+kind+'"'),kind+" must have placement button");
}
for(const id of ["context-search","context-category","placement-repeat","library-toggle",
  "extra-target-height","extra-fit-height","library-size-note"]){
  assert.ok(html.includes('id="'+id+'"'),id+" UI required");
  assert.ok(js.includes('"'+id+'"'),id+" runtime wiring required");
}
assert.match(assets,/ASSET_CATEGORIES=.*"vehicle"/,"external vehicle GLBs allowed");
assert.match(js,/uniformHeightScale\(/);
assert.match(js,/approvedMaster/);
console.log("PASS v2.7 catalog filtering, dimension constraints, four source-safe presets and UI wiring");
