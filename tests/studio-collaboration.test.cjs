const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const assert=require("node:assert/strict");
const {webcrypto}=require("node:crypto");
const {TextEncoder}=require("node:util");
const code=fs.readFileSync(path.join(__dirname,"../studio/collaboration.js"),"utf8");
assert.match(code,/SHA-256/);
assert.doesNotMatch(code,/innerHTML|eval\(|fetch\(/,"review must not execute notes or send data");
const scope={crypto:webcrypto,TextEncoder,Date,JSON,Uint8Array,Number,Object,Array,Set,Error,String,RegExp,Map};
vm.runInNewContext(code.replace(/\bexport\s+/g,"")+"\nthis.api={COLLAB_SCHEMA,masterFingerprint,validateCollaborationState};",scope);
const {COLLAB_SCHEMA,masterFingerprint,validateCollaborationState}=scope.api;
const original={revision:3,approvedAt:"2026-10-22T12:00:00.000Z",
  artworkFile:"art.glb",siteFile:"site.glb",artworkTransform:{p:[1,2,3],r:[0,0,0],s:[1,1,1]},
  layers:{site:true,art:true},material:{preset:"original"}};
(async()=>{
  const hash=await masterFingerprint(original);
  assert.match(hash,/^[0-9a-f]{64}$/);
  assert.equal(hash,await masterFingerprint({...original,material:{preset:"original"},layers:{art:true,site:true}}),
    "canonical key order must not change fingerprint");
  assert.notEqual(hash,await masterFingerprint({...original,artworkTransform:{...original.artworkTransform,p:[2,2,3]}}),
    "new installation position must invalidate review");
  const pending={revision:3,masterApprovedAt:original.approvedAt,masterDigest:hash,
    requester:"PM",reviewer:"",note:"Please review",status:"pending",attested:false,
    createdAt:"2026-10-22T12:01:00Z",updatedAt:"2026-10-22T12:01:00Z"};
  const check=records=>validateCollaborationState({schema:COLLAB_SCHEMA,records});
  assert.equal(check([pending]),true);
  assert.equal(check([]),true);
  assert.equal(validateCollaborationState(undefined),true,"v1.4 backwards compatibility");
  assert.equal(check([pending,pending]),false,"duplicate master reviews rejected");
  assert.equal(check([{...pending,masterDigest:"not-a-hash"}]),false);
  assert.equal(check([{...pending,status:"director-approved",reviewer:"Director",attested:false}]),false,
    "unsigned decision must not be marked director-approved");
  assert.equal(check([{...pending,status:"director-approved",reviewer:"PM",attested:true}]),false,
    "requester cannot self-approve");
  assert.equal(check([{...pending,status:"changes-requested",reviewer:"Director",note:""}]),false,
    "revision request must state why");
  assert.equal(check([{...pending,status:"director-approved",reviewer:"Director",attested:true}]),true);
  assert.equal(check([{...pending,status:"changes-requested",reviewer:"Director",note:"Shift 30cm"}]),true);
  assert.equal(check(new Array(41).fill(pending)),false,"review history bound required");
  console.log("PASS v1.5 collaboration: canonical fingerprints, state validation, review roles and legacy compatibility");
})().catch(e=>{console.error(e);process.exitCode=1;});
