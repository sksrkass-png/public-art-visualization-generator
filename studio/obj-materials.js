import { LoadingManager } from "three";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";
import { MTLLoader } from "three/addons/loaders/MTLLoader.js";

// Sidecars are kept separate from the OBJ and stored in the portable project ZIP.
// Keep a modest cap to avoid allocating oversized textures alongside 120MB meshes.
export const MAX_OBJ_RESOURCES = 24;
export const MAX_OBJ_RESOURCE_BYTES = 80 * 1024 * 1024;
export const MAX_OBJ_SINGLE_RESOURCE_BYTES = 40 * 1024 * 1024;
const EXTENSIONS = new Set(["mtl", "png", "jpg", "jpeg", "webp", "bmp"]);

function extension(name) {
  return name.split(".").pop().toLowerCase();
}
function baseName(name) {
  return name.replace(/\\/g, "/").split("/").pop();
}
export function validateOBJResources(resources) {
  if (!Array.isArray(resources) || resources.length > MAX_OBJ_RESOURCES)
    throw Error("OBJ 부속 파일은 최대 24개까지 가능합니다.");
  let total = 0, materials = 0;
  const names = new Set();
  for (const file of resources) {
    const name = baseName(file.name);
    if (!name || name === "." || name === ".." ||
        !EXTENSIONS.has(extension(name)) ||
        !Number.isFinite(file.size) || file.size <= 0 ||
        file.size > MAX_OBJ_SINGLE_RESOURCE_BYTES)
      throw Error("지원하지 않는 OBJ 부속 파일이거나 파일당 40MB를 초과했습니다: " + file.name);
    const key = name.toLowerCase();
    if (names.has(key)) throw Error("같은 이름의 OBJ 부속 파일이 중복되었습니다: " + name);
    names.add(key);
    total += file.size;
    if (extension(name) === "mtl") materials++;
  }
  if (total > MAX_OBJ_RESOURCE_BYTES)
    throw Error("OBJ 부속 파일의 전체 용량은 80MB 이하여야 합니다.");
  if (materials > 1) throw Error("OBJ에는 MTL 파일 한 개만 선택해 주세요.");
  if (resources.length && !materials)
    throw Error("텍스처 이미지만 선택할 수 없습니다. MTL 파일도 함께 선택해 주세요.");
  return true;
}
export async function loadOBJWithMaterials(objFile, resources = []) {
  validateOBJResources(resources);
  const objSource = await objFile.text();
  if (!resources.length) return new OBJLoader().parse(objSource);
  const mtlFile = resources.find(file => extension(file.name) === "mtl");
  const images = resources.filter(file => file !== mtlFile);
  const urls = new Map();
  const filenameMap = new Map();
  for (const file of images) {
    const name = baseName(file.name).toLowerCase();
    const url = URL.createObjectURL(file);
    urls.set(name, url);
    filenameMap.set(name, file.name);
  }
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    for (const url of urls.values()) URL.revokeObjectURL(url);
  };
  const manager = new LoadingManager();
  manager.setURLModifier(url => {
    if (/^(?:data:|blob:)/i.test(url)) return url;
    let decoded = url;
    try { decoded = decodeURIComponent(url); } catch (_) { /* original name */ }
    const key = baseName(decoded.split(/[?#]/)[0]).toLowerCase();
    return urls.get(key) || url;
  });
  manager.onLoad = release;
  manager.onError = url => console.warn("OBJ texture unavailable:", url);
  try {
    const mtlLoader = new MTLLoader(manager);
    mtlLoader.setMaterialOptions({ side: 2 });
    const materials = mtlLoader.parse(await mtlFile.text(), "");
    materials.preload();
    const loader = new OBJLoader(manager);
    loader.setMaterials(materials);
    const model = loader.parse(objSource);
    // If no texture was requested, LoadingManager won't emit onLoad.
    if (!images.length) release();
    return model;
  } catch (error) {
    release();
    throw error;
  }
}
