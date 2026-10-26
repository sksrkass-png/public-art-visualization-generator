const fs=require("node:fs"),path=require("node:path"),vm=require("node:vm"),assert=require("node:assert/strict");
const source=fs.readFileSync(path.join(__dirname,"../studio/plant-variants.js"),"utf8");
const scope={Object,Array,Math,Error,Set};
vm.runInNewContext(source.replace(/^import .*;$/gm,"").replace(/\bexport\s+/g,"")+
  "\nthis.api={NEW_PLANT_VARIANTS,PLANT_VARIANT_PROFILES};",scope);
const {NEW_PLANT_VARIANTS,PLANT_VARIANT_PROFILES}=scope.api;
assert.equal(NEW_PLANT_VARIANTS.length,16);
assert.equal(new Set(NEW_PLANT_VARIANTS).size,16);
assert.equal(Object.keys(PLANT_VARIANT_PROFILES).length,16);
const families={deciduous:2,conifer:2,birch:2,maple:3,cherry:3,shrub:2,"flower-shrub":2};
for(const [name,count] of Object.entries(families)){
  assert.equal(NEW_PLANT_VARIANTS.filter(kind=>
    PLANT_VARIANT_PROFILES[kind]?.family===name).length,count);
}
for(const kind of NEW_PLANT_VARIANTS){
  assert.ok(typeof PLANT_VARIANT_PROFILES[kind].shape==="string");
  assert.ok(PLANT_VARIANT_PROFILES[kind].height>.05);
}
assert.doesNotMatch(source,/Math\.random\(/,"reloaded projects must regenerate identical silhouettes");
assert.match(source,/new THREE\.InstancedMesh\(/,"flower previews should use low-draw-call geometry");
assert.match(source,/setColorAt\(/,"flower instances retain palette color differences");
const extras=fs.readFileSync(path.join(__dirname,"../studio/extras.js"),"utf8");
assert.match(extras,/if\(NEW_PLANT_VARIANTS\.includes\(kind\)\)addPlantVariant\(root,kind\)/);
for(const old of ["tree-round","tree-cone","tree-birch","shrub","shrub-flower","tree-autumn"])
  assert.ok(extras.includes('kind==="'+old+'"'),old+" legacy preset remains intact");
console.log("PASS v3.2 deterministic 16 new botanical morphologies, floral GPU instancing and legacy shapes");
