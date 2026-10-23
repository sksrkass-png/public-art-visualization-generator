const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const assert=require("node:assert/strict");
const source=fs.readFileSync(path.join(__dirname,"../studio/spatial-review-data.js"),"utf8");
const scope={JSON,Date,Number,Math,Array,Set,Object,Error,String};
vm.runInNewContext(source.replace(/\bexport\s+/g,"")+
  "\nthis.api={SPATIAL_SCHEMA,emptySpatialReview,validSpatialReview,addSpatialPin,updateSpatialPinStatus,pinsForMaster};",scope);
const {SPATIAL_SCHEMA,emptySpatialReview,validSpatialReview,addSpatialPin,updateSpatialPinStatus,pinsForMaster}=scope.api;
const hash="d".repeat(64),approvedAt="2026-10-23T11:00:00Z";
const m={revision:4,approvedAt},day="2026-10-23T11:01:00Z";
const clone=x=>JSON.parse(JSON.stringify(x));
{
  const old=emptySpatialReview();
  assert.equal(old.schema,SPATIAL_SCHEMA);
  assert.equal(validSpatialReview(undefined),true,"old v1.6 projects are accepted");
  let state=addSpatialPin(old,{master:m,digest:hash,type:"artwork",position:[2,1,3],
    author:"Planner",comment:"Verify height.",now:day});
  assert.equal(old.pins.length,0,"old state remains immutable");
  assert.equal(state.pins[0].status,"open");
  assert.equal(state.pins[0].id,1);
  assert.equal(pinsForMaster(state,m,hash).length,1);
  assert.equal(pinsForMaster(state,{revision:5,approvedAt},hash).length,0,"new revision hides old pin");
  assert.equal(pinsForMaster(state,m,"a".repeat(64)).length,0,"different approved snapshot hides old pin");
  assert.equal(validSpatialReview(state),true);
  state=updateSpatialPinStatus(state,1,"resolved","Director","2026-10-23T11:03:00Z");
  assert.equal(state.pins[0].resolvedBy,"Director");
  assert.equal(state.pins[0].status,"resolved");
  assert.equal(validSpatialReview(state),true);
  state=updateSpatialPinStatus(state,1,"open","Director","2026-10-23T11:04:00Z");
  assert.equal(state.pins[0].resolvedAt,null);
  assert.equal(state.pins[0].resolvedBy,null);
  assert.equal(state.pins[0].status,"open");
  assert.equal(validSpatialReview(state),true);
  const bad=clone(state);bad.pins[0].position=[NaN,2,3];
  // JSON serialisation turns NaN into null; either way it must be invalid.
  assert.equal(validSpatialReview(bad),false);
  const corrupt=clone(state);corrupt.pins[0].comment="<script>x</script>";
  assert.equal(validSpatialReview(corrupt),true,"script text may be safely preserved as data");
  assert.throws(()=>addSpatialPin(state,{master:m,digest:hash,type:"site",
    position:[1,2,3],author:"",comment:"x",now:day}));
  assert.throws(()=>updateSpatialPinStatus(state,999,"resolved","Director",day));
}
{
 let data=emptySpatialReview();
 for(let i=0;i<80;i++)data=addSpatialPin(data,{master:m,digest:hash,type:"site",
   position:[i,0,-i],author:"Reviewer",comment:"Context review "+i,now:day});
 assert.equal(validSpatialReview(data),true);
 assert.throws(()=>addSpatialPin(data,{master:m,digest:hash,type:"site",
   position:[1,2,3],author:"Reviewer",comment:"Extra",now:day}),/80/);
 const bad=clone(data);bad.pins[1].id=bad.pins[0].id;
 assert.equal(validSpatialReview(bad),false,"duplicate pin IDs rejected");
 const badHash=clone(data);badHash.pins[0].masterSHA256="not-a-digest";
 assert.equal(validSpatialReview(badHash),false);
 const outside=clone(data);outside.pins[0].position=[100001,2,3];
 assert.equal(validSpatialReview(outside),false);
}
assert.match(source,/80/);
console.log("PASS v1.7 Spatial Review: snapshot-bound positions, status workflows, bounds, legacy files, no geometry mutation");
