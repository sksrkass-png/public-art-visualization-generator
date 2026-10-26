const fs=require("node:fs"),path=require("node:path"),vm=require("node:vm"),assert=require("node:assert/strict");
const src=fs.readFileSync(path.join(__dirname,"../studio/context-catalog.js"),"utf8");
const scope={Object,String,Number,Math,Array,Set,Error};
vm.runInNewContext(src.replace(/\bexport\s+/g,"")+
  "\nthis.api={CONTEXT_CATALOG,CONTEXT_CATEGORIES,filterContextCatalog,uniformHeightScale,dimensionsLabel};",scope);
const {CONTEXT_CATALOG,filterContextCatalog,uniformHeightScale,dimensionsLabel}=scope.api;
assert.equal(CONTEXT_CATALOG.length,33,"built-in palette must contain 33 searchable entries");
for(const kind of ["tree-birch","grass-patch","lawn-tile","walkway-tile","black-nameplate","car-sedan","bollard"]){
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
for(const kind of ["tree-birch","grass-patch","lawn-tile","walkway-tile","black-nameplate","car-sedan","bollard"]){
  assert.ok(extras.includes('"'+kind+'"'),kind+" must be constructible and restorable");
  assert.ok(html.includes('data-add-extra="'+kind+'"'),kind+" must have placement button");
}
for(const id of ["context-search","context-category","asset-placement-status","library-toggle",
  "extra-target-height","extra-fit-height","library-size-note"]){
  assert.ok(html.includes('id="'+id+'"'),id+" UI required");
  assert.ok(js.includes('"'+id+'"'),id+" runtime wiring required");
}
assert.match(assets,/ASSET_CATEGORIES=.*"vehicle"/,"external vehicle GLBs allowed");
assert.match(js,/uniformHeightScale\(/);
assert.match(js,/approvedMaster/);
assert.equal(filterContextCatalog("잔디","surface").length,1);
assert.equal(filterContextCatalog("보도","surface").length,1);
assert.equal(filterContextCatalog("명판","signage").length,1);
assert.match(js,/isRepeatablePlacement\(kind\)/);
assert.match(js,/placementMode===kind/);
assert.match(js,/syncAssetPlacementUI\(\)/);
assert.ok(!html.includes('id="placement-repeat"'),"repeating is automatic, not a second checkbox");
const nameplate=fs.readFileSync(path.join(__dirname,"../studio/nameplate-asset.js"),"utf8");
assert.ok(nameplate.includes("접어 만든 별의 비행"));
assert.ok(nameplate.includes("LEE HO JOON"));
assert.ok(nameplate.includes("width:.30,height:.10,depth:.20"));
assert.ok(extras.includes("SURFACE_TILE_SIZE"));
assert.ok(extras.includes("new THREE.BoxGeometry(3,.08,3)"));
assert.ok(extras.includes("addBlackNameplate"));

const botanicalFamilies=[
  ["tree-round","tree-round-b","tree-round-c"],
  ["tree-cone","tree-cone-b","tree-cone-c"],
  ["tree-birch","tree-birch-b","tree-birch-c"],
  ["tree-maple-a","tree-maple-b","tree-maple-c"],
  ["tree-cherry-a","tree-cherry-b","tree-cherry-c"],
  ["shrub","shrub-b","shrub-c"],
  ["shrub-flower","shrub-flower-b","shrub-flower-c"]
];
for(const family of botanicalFamilies){
  for(const kind of family){
    assert.equal(CONTEXT_CATALOG.filter(x=>x.kind===kind).length,1,
      kind+" must occur exactly once in searchable library");
    assert.ok(html.includes('data-add-extra="'+kind+'"'),kind+" button");
  }
}
assert.equal(new Set(botanicalFamilies.flat()).size,21);
assert.equal(filterContextCatalog("단풍나무","planting").length,3);
assert.equal(filterContextCatalog("벚꽃","planting").length,3);
assert.equal(filterContextCatalog("덤불","planting").length,6);
assert.equal(filterContextCatalog("침엽수","planting").length,3);
assert.equal(filterContextCatalog("자작나무","planting").length,3);
assert.match(js,/variants.open=true/,"matching B/C results must auto-expand");
assert.match(js,/variants.hidden=!matchesVariants/,"other categories hide the optional plant group");
assert.ok(html.includes('id="plant-variants"'));
assert.ok(extras.includes("NEW_PLANT_VARIANTS"),"A legacy types unchanged, B/C types introduced separately");
console.log("PASS v3.2 21 botanical options, searchable B/C variants, compact UI and original asset compatibility");
