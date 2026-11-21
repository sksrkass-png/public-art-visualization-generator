const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const path=require("node:path");
const read=p=>fs.readFileSync(path.join(__dirname,"..",p),"utf8");
const vault=read("studio/project-vault.js");
const js=read("studio/studio.js"),html=read("studio/index.html"),css=read("studio/studio.css");
const scope={Blob,Date,Math,Object,String,Number,Error};
vm.runInNewContext(vault.replace(/export /g,"")+"\nthis.api={validVaultName,VAULT_MAX_BYTES,VAULT_MAX_RECORDS};",scope);
assert.equal(scope.api.validVaultName("고양 창릉"),true);
assert.equal(scope.api.validVaultName("  "),false);
assert.equal(scope.api.validVaultName("a".repeat(101)),false);
assert.equal(scope.api.VAULT_MAX_BYTES,320*1024*1024);
assert.equal(scope.api.VAULT_MAX_RECORDS,12);
for(const id of ["inspector-category-nav","camera-tour-prev","camera-tour-next","camera-smooth","vault-save","vault-load","vault-delete","vault-list","vault-status"]){
  assert.ok(html.includes('id="'+id+'"'),id+" missing UI");
  if(id!=="inspector-category-nav")assert.ok(js.includes('"'+id+'"'),id+" missing wiring");
}
for(const group of ["modeling","assets","appearance","camera","projects"]){
  assert.ok(html.includes('data-inspector-category="'+group+'"'),group+" not offered in nav");
  assert.ok(html.includes('"'+group+'"'),group+" not mapped");
}
assert.match(js,/import \{listLocalProjects,saveLocalProject,getLocalProject,deleteLocalProject\} from "\.\/project-vault\.js"/);
assert.match(js,/importProjectArchive\(file\)/);
assert.match(js,/makeIntegrityManifest\(zip\)/);
assert.match(js,/toVault/);
assert.match(js,/function animatedCameraBookmark/);
assert.match(js,/function browseCameraBookmarks/);
assert.match(js,/cameraMotionToken/);
assert.match(vault,/openCursor\(\)/);
assert.match(vault,/indexedDBImpl\.open/);
assert.match(css,/browser-vault-panel/);
assert.ok(!vault.includes("fetch(")&&!vault.includes("XMLHttpRequest"));
console.log("PASS v4.0: five workgroups, camera tour, local ZIP vault and no network calls");