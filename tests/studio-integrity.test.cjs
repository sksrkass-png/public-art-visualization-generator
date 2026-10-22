const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const {webcrypto}=require("node:crypto");
globalThis.crypto=webcrypto;
class MemoryEntry {
  constructor(bytes){this.bytes=Buffer.from(bytes);this.dir=false;this._data={uncompressedSize:this.bytes.length};}
  async async(type){
    if(type==="uint8array")return new Uint8Array(this.bytes);
    if(type==="string")return this.bytes.toString("utf8");
    throw Error("Unsupported test format");
  }
}
class MemoryZip {
  constructor(){this.files={};}
  file(name,value){
    if(value===undefined)return this.files[name]||null;
    this.files[name]=new MemoryEntry(typeof value==="string"?Buffer.from(value,"utf8"):value);
    return this;
  }
}
(async()=>{
  const content=fs.readFileSync(path.join(__dirname,"../studio/integrity.js"),"utf8");
  const {makeIntegrityManifest,verifyIntegrityManifest}=await import(
    "data:text/javascript;base64,"+Buffer.from(content).toString("base64"));
  const zip=new MemoryZip();
  zip.file("project.json",'{"schema":"axoo-public-art-3d-studio-v1"}');
  zip.file("assets/site",Buffer.from("synthetic site mesh bytes"));
  zip.file("assets/artwork",Buffer.from("synthetic artwork mesh bytes"));
  const expected=await makeIntegrityManifest(zip);
  assert.equal(expected.schema,"axoo-studio-integrity-v1");
  assert.equal(Object.keys(expected.files).length,3);
  assert.match(expected.files["assets/site"].sha256,/^[a-f0-9]{64}$/);
  zip.file("integrity.json",JSON.stringify(expected));
  const checked=await verifyIntegrityManifest(zip);
  assert.deepEqual(checked,{legacy:false,verified:true,count:3});
  const earlier=new MemoryZip();
  earlier.file("project.json","old-style");
  assert.equal((await verifyIntegrityManifest(earlier)).legacy,true);
  zip.file("project.json",Buffer.from('{"schema":"corrupted"}'));
  await assert.rejects(verifyIntegrityManifest(zip),/SHA-256 무결성 검사 실패|파일 크기가 일치하지/);
  zip.file("project.json",'{"schema":"axoo-public-art-3d-studio-v1"}');
  zip.file("untrusted/additional-file",Buffer.from("hidden"));
  await assert.rejects(verifyIntegrityManifest(zip),/알 수 없는 ZIP 내부 파일/);
  console.log("PASS production integrity: 3 sha256 digests, valid archive, legacy compat, tamper rejection, disallowed file");
})().catch(e=>{console.error(e);process.exitCode=1;});
