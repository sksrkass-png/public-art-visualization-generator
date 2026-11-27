const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const path=require("node:path");
const read=p=>fs.readFileSync(path.join(__dirname,"..",p),"utf8");
const assets=read("studio/assets.js");
const html=read("studio/index.html");
const studio=read("studio/studio.js");
const script=assets.replace(/^import .*;\s*$/gm,"").replace(/\bexport /g,"")
  +"\nthis.contract={validLibraryManifest,MAX_LIBRARY_ITEM_BYTES,MAX_LIBRARY_BYTES,MAX_ARTWORK_TRIANGLES};";
const context={};
vm.runInNewContext(script,context);
const {validLibraryManifest,MAX_LIBRARY_ITEM_BYTES,MAX_LIBRARY_BYTES,MAX_ARTWORK_TRIANGLES}=context.contract;
assert.equal(MAX_LIBRARY_ITEM_BYTES,120*1024*1024);
assert.equal(MAX_LIBRARY_BYTES,300*1024*1024);
assert.equal(MAX_ARTWORK_TRIANGLES,1200000);
const manifest=(names,sizes)=>names.map((name,i)=>({id:"lib"+(i+1),name,byteSize:sizes[i],category:"artwork"}));
assert.equal(validLibraryManifest(manifest(["fifty-plus.obj"],[65*1024*1024])),true,
  "OBJ larger than 50MB must validate");
assert.equal(validLibraryManifest(manifest(["large.glb"],[100*1024*1024])),true);
assert.equal(validLibraryManifest(manifest(["too-big.obj"],[121*1024*1024])),false);
assert.equal(validLibraryManifest(manifest(["a.obj","b.glb"],[110*1024*1024,110*1024*1024])),true);
assert.equal(validLibraryManifest(manifest(["a.obj","b.obj","c.obj"],[110*1024*1024,110*1024*1024,110*1024*1024])),false);
assert.match(assets,/new OBJLoader\(\)\.parse\(contents\)/);
assert.match(assets,/parseLibraryModel\(file,id,category/);
for(const id of ["multi-art-select","multi-art-select-edit","multi-art-edit-status"]){
  assert.ok(html.includes('id="'+id+'"'));
  assert.ok(studio.includes('"'+id+'"'));
}
for(const mode of ["translate","rotate","scale"])
  assert.ok(html.includes('data-multi-art-mode="'+mode+'"'));
assert.match(studio,/parseLibraryModel\(file,id,"artwork"\)/);
assert.match(studio,/checkedArchiveEntry\(zip,"assets\/library\/"\+entry\.id\+"\."\+extension,MAX_LIBRARY_ITEM_BYTES/);
assert.match(studio,/zip\.file\("assets\/library\/"\+asset\.id\+"\."\+extension,asset\.file\)/);
assert.match(studio,/\^assets\\\/library\\\/lib/);
assert.match(studio,/selectRoot\(root,true\)/);
assert.match(studio,/changeMode\(button\.dataset\.multiArtMode\)/);
assert.match(html,/accept="\.glb,\.obj,/);
console.log("PASS v4.1: >50MB OBJ/GLB models, editable additional works, original ZIP source retention");
