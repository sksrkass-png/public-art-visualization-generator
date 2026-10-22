// AXOO Studio v1.0: content integrity (accidental corruption detection).
// SHA-256 digests are NOT digital signatures or proof of creator provenance.
const ALLOWED=["project.json","assets/site","assets/artwork","assets/plan","assets/environment"];
const MAX_HASH_BYTES={"project.json":1048576,"assets/site":83886080,
  "assets/artwork":83886080,"assets/plan":20971520,"assets/environment":20971520};
const INTEGRITY_SCHEMA="axoo-studio-integrity-v1";
async function digest(bytes){
  if(!crypto?.subtle)throw Error("암호화 해시를 지원하는 보안 환경(HTTPS)이 필요합니다.");
  const value=await crypto.subtle.digest("SHA-256",bytes);
  return Array.from(new Uint8Array(value),n=>n.toString(16).padStart(2,"0")).join("");
}
function inspectZip(zip){
  const names=Object.keys(zip.files).filter(name=>!zip.files[name].dir);
  if(names.some(name=>![...ALLOWED,"integrity.json"].includes(name)))
    throw Error("알 수 없는 ZIP 내부 파일이 있습니다.");
  return names;
}
export async function makeIntegrityManifest(zip){
  const entries=inspectZip(zip);
  const files={};
  for(const name of ALLOWED){
    if(!entries.includes(name))continue;
    const entry=zip.file(name);
    const size=entry._data?.uncompressedSize;
    if(Number.isFinite(size) && size>MAX_HASH_BYTES[name])
      throw Error(name+" 항목이 허용 크기를 초과했습니다.");
    const bytes=await entry.async("uint8array");
    if(bytes.byteLength>MAX_HASH_BYTES[name])throw Error(name+" 항목이 너무 큽니다.");
    files[name]={sha256:await digest(bytes),bytes:bytes.byteLength};
  }
  if(!files["project.json"])throw Error("project.json이 빠졌습니다.");
  return {schema:INTEGRITY_SCHEMA,algorithm:"SHA-256",
    createdAt:new Date().toISOString(),description:"Integrity checksum only; not a cryptographic signature",
    files};
}
export async function verifyIntegrityManifest(zip){
  const entries=inspectZip(zip);
  if(!entries.includes("integrity.json"))return {legacy:true,verified:false};
  const entry=zip.file("integrity.json");
  if(!entry || (entry._data?.uncompressedSize||0)>8192)
    throw Error("ZIP 무결성 정보 크기가 비정상입니다.");
  const metadata=JSON.parse(await entry.async("string"));
  if(metadata?.schema!==INTEGRITY_SCHEMA || metadata?.algorithm!=="SHA-256" ||
      !metadata.files || typeof metadata.files!=="object" || Array.isArray(metadata.files))
    throw Error("지원하지 않는 무결성 검사 정보입니다.");
  const actual=entries.filter(name=>name!=="integrity.json").sort();
  const listed=Object.keys(metadata.files).sort();
  if(JSON.stringify(actual)!==JSON.stringify(listed))
    throw Error("ZIP 파일 목록이 저장 당시와 다릅니다.");
  for(const name of actual){
    if(!ALLOWED.includes(name))throw Error("허용되지 않은 파일 항목: "+name);
    const expected=metadata.files[name];
    if(!expected || !/^[a-f0-9]{64}$/.test(expected.sha256) ||
      !Number.isInteger(expected.bytes) || expected.bytes<0 ||
      expected.bytes>MAX_HASH_BYTES[name])throw Error("무결성 메타데이터가 잘못됐습니다.");
    const size=zip.file(name)._data?.uncompressedSize;
    if(Number.isFinite(size) && size!==expected.bytes)
      throw Error(name+" 파일 크기가 일치하지 않습니다.");
    const bytes=await zip.file(name).async("uint8array");
    if(bytes.byteLength!==expected.bytes || await digest(bytes)!==expected.sha256)
      throw Error(name+" SHA-256 무결성 검사 실패: 손상되거나 변경된 파일입니다.");
  }
  return {legacy:false,verified:true,count:actual.length};
}
