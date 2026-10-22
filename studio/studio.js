import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";
import { STLLoader } from "three/addons/loaders/STLLoader.js";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";

const $ = id => document.getElementById(id);
const viewport = $("viewport");
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xdce0e2);
const camera = new THREE.PerspectiveCamera(46, 1, 0.05, 3000);
camera.position.set(10, 8, 13);
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.domElement.setAttribute("aria-label", "공공미술 3D 뷰포트");
viewport.appendChild(renderer.domElement);

const orbit = new OrbitControls(camera, renderer.domElement);
orbit.enableDamping = true;
orbit.minDistance = .25;
orbit.maxDistance = 800;
orbit.target.set(0, 1.5, 0);
const transform = new TransformControls(camera, renderer.domElement);
scene.add(transform.getHelper());
const grid = new THREE.GridHelper(120, 120, 0x9ba4ac, 0xc7cdd1);
grid.position.y = 0.021;
grid.material.transparent = true;
grid.material.opacity = .44;
scene.add(grid);

const siteRoot = new THREE.Group();
siteRoot.name = "Locked Site";
scene.add(siteRoot);
const artRoot = new THREE.Group();
artRoot.name = "Editable Artwork";
scene.add(artRoot);
const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(120, 120),
  new THREE.MeshStandardMaterial({ color: 0xe4e5e4, roughness: 1 })
);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -.022;
floor.receiveShadow = true;
floor.name = "Ground — reference only";
scene.add(floor);
const planPlane = new THREE.Mesh(
  new THREE.PlaneGeometry(1, 1),
  new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .82, depthWrite: false, side: THREE.DoubleSide })
);
planPlane.rotation.x = -Math.PI / 2;
planPlane.position.y = .018;
planPlane.visible = false;
scene.add(planPlane);

const sun = new THREE.DirectionalLight(0xfff7e6, 2);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -70;
sun.shadow.camera.right = 70;
sun.shadow.camera.top = 70;
sun.shadow.camera.bottom = -70;
sun.shadow.camera.near = .1;
sun.shadow.camera.far = 250;
sun.shadow.bias = -.00015;
scene.add(sun);
scene.add(sun.target);
const ambient = new THREE.HemisphereLight(0xeaf4ff, 0x96989a, 1.3);
scene.add(ambient);

let artFileName = "Sample Artwork", siteFileName = "", planFileName = "";
let approvedMaster = false, revision = 1, loadedPlanTexture = null;
let lastDrag = null, mouseMoved = false, toastTimer = null;
let undoStack = [], redoStack = [];
let pendingArtwork = null;
let activeFileOperation = 0;
let selectedMode = "translate";
const MAX_UNDO = 40;
const raycaster = new THREE.Raycaster(), mouse = new THREE.Vector2();
const buttons = [...document.querySelectorAll("[data-mode]")];
const controls = [...document.querySelectorAll("[data-transform]")];

function notify(message) {
  const el = $("toast");
  el.textContent = message;
  el.classList.add("show");
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 3600);
}
function safeNumber(value, fallback, min = -Infinity, max = Infinity) {
  const n = Number(value);
  return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
}
function fileBase(file) {
  return file.name.replace(/\.[^.]+$/, "").slice(0, 100);
}
function download(name, blob) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
function safeFileName() {
  return ($("project-name").value || "public-art-scene").trim().replace(/[^a-z0-9가-힣_-]+/gi, "-").slice(0, 64) || "public-art-scene";
}
function clearGroup(root) {
  while (root.children.length) root.remove(root.children[0]);
}
function mesh(geometry, color, metalness = 0, roughness = .7) {
  const m = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color, metalness, roughness }));
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}
function box(parent, w, h, d, x, y, z, color = 0xc9cdcd) {
  const m = mesh(new THREE.BoxGeometry(w, h, d), color);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}
function tree(parent, x, z, height = 3.6) {
  const trunk = mesh(new THREE.CylinderGeometry(.13, .16, height * .46, 8), 0x898378);
  trunk.position.set(x, height * .23, z);
  const crown = mesh(new THREE.IcosahedronGeometry(height * .25, 1), 0x829489, 0, .95);
  crown.position.set(x, height * .7, z);
  parent.add(trunk, crown);
}
function buildSite(preset) {
  clearGroup(siteRoot);
  siteFileName = "";
  $("site-filename").textContent = "업로드된 현장 모델 없음";
  $("site-status").textContent = preset === "empty" ? "빈 공간" : "예시 공간";
  if (preset === "plaza") {
    box(siteRoot, 18, 9, 2, -17, 4.5, -15);
    box(siteRoot, 11, 7, 2, 16, 3.5, -16);
    box(siteRoot, 2, 7, 24, 22, 3.5, 4);
    for (let x = -14; x <= 14; x += 7) tree(siteRoot, x, 14);
    for (let x of [-7, 7]) {
      box(siteRoot, 2.2, .38, .75, x, .44, 6, 0xa9aba8);
      for (let z of [5.75, 6.25]) box(siteRoot, .18, .52, .18, x - .75, .26, z, 0x919796);
    }
  } else if (preset === "courtyard") {
    box(siteRoot, 7, 16, 38, -22, 8, 0, 0xc2c6c9);
    box(siteRoot, 7, 16, 38, 22, 8, 0, 0xc5c9ca);
    box(siteRoot, 37, 12, 7, 0, 6, -20, 0xc6c8c6);
    for (let x of [-14, 14]) for (let z of [-10, 10]) tree(siteRoot, x, z, 4);
  } else if (preset === "promenade") {
    box(siteRoot, 54, .10, 5, 0, .04, -13, 0xb0b4b4);
    for (let z of [-9, 9]) for (let x = -24; x <= 24; x += 8) tree(siteRoot, x, z, 4);
    for (let z of [-18, 18]) box(siteRoot, 54, 6, 5, 0, 3, z, 0xc6c8c8);
  }
}
function sampleArtwork() {
  const g = new THREE.Group();
  const base = mesh(new THREE.CylinderGeometry(.7, .82, .18, 48), 0x969c9c, .7, .28);
  base.position.y = .09; g.add(base);
  for (let i = 0; i < 3; i++) {
    const ring = mesh(new THREE.TorusGeometry(.79 - i * .08, .115, 16, 72), i === 1 ? 0xa8b8bd : 0xd4dce0, .85, .2);
    ring.rotation.set(Math.PI / 3 + i * .55, i * Math.PI / 3, i * .6);
    ring.position.set(0, .93 + i * .54, 0);
    g.add(ring);
  }
  const spindle = mesh(new THREE.CylinderGeometry(.07, .18, 2.75, 16), 0x8c969b, .8, .24);
  spindle.position.y = 1.5; g.add(spindle);
  return g;
}
function setShadows(root, enabled = true) {
  root.traverse(o => { if (o.isMesh) { o.castShadow = enabled; o.receiveShadow = true; } });
}
function normalizeArtwork(object) {
  object.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(object);
  if (bounds.isEmpty()) throw new Error("모델 안에 표시 가능한 메시가 없습니다.");
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  if (size.y <= 0.000001) throw new Error("작품 높이를 측정할 수 없습니다.");
  object.position.x -= center.x;
  object.position.y -= bounds.min.y;
  object.position.z -= center.z;
  const holder = new THREE.Group();
  holder.add(object);
  return holder;
}
function setArtwork(object, name, height = 3) {
  transform.detach();
  clearGroup(artRoot);
  artRoot.position.set(0, 0, 0);
  artRoot.rotation.set(0, 0, 0);
  artRoot.scale.set(1, 1, 1);
  const aligned = normalizeArtwork(object);
  artRoot.add(aligned);
  artRoot.name = name;
  artFileName = name;
  setShadows(artRoot);
  fitArtworkHeight(height);
  approvedMaster = false;
  revision = 1;
  clearUndo();
  transform.attach(artRoot);
  updateInspector();
  syncLock();
  $("art-filename").textContent = "현재: " + name;
  $("art-status").textContent = name === "Sample Artwork" ? "샘플" : "가져온 작품";
  $("object-name").textContent = name;
}
function fitArtworkHeight(height) {
  if (!artRoot.children.length || approvedMaster) return;
  artRoot.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(artRoot);
  const realHeight = box.getSize(new THREE.Vector3()).y;
  if (realHeight < .000001) return;
  const factor = height / realHeight;
  artRoot.scale.multiplyScalar(factor);
  updateInspector();
}
function groundTexture(mode) {
  const colors = { concrete: ["#d8dbd9", "#ccd0cf"], pavers: ["#c7c9c6", "#9a9d9a"],
    grass: ["#899d7d", "#7e9672"], asphalt: ["#747a7f", "#82878b"], white: ["#eeefed", "#eeeeee"] };
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const ctx = c.getContext("2d");
  const [base, detail] = colors[mode] || colors.concrete;
  ctx.fillStyle = base; ctx.fillRect(0, 0, 256, 256);
  if (mode === "pavers") {
    ctx.strokeStyle = detail; ctx.lineWidth = 2;
    for (let y = 0; y <= 256; y += 64) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(256, y); ctx.stroke();
      const off = (y / 64 % 2) * 64;
      for (let x = -off; x < 256; x += 128) {
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 64); ctx.stroke();
      }
    }
  } else if (mode !== "white") {
    ctx.fillStyle = detail;
    for (let i = 0; i < 400; i++) {
      // Stable nonrandom pseudo-noise: same mapping on each refresh.
      const x = (i * 73) % 256, y = (i * 131) % 256;
      ctx.globalAlpha = .12 + (i % 5) * .03;
      ctx.fillRect(x, y, mode === "grass" ? 2 : 1, mode === "grass" ? 3 : 1);
    }
    ctx.globalAlpha = 1;
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(mode === "pavers" ? 30 : 12, mode === "pavers" ? 30 : 12);
  tex.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);
  return tex;
}
function updateGround() {
  const old = floor.material.map;
  floor.material.map = groundTexture($("floor-map").value);
  floor.material.color.set(0xffffff);
  floor.material.needsUpdate = true;
  if (old) old.dispose();
}
function syncPlanWidth() {
  if (!planPlane.visible || !loadedPlanTexture) return;
  const img = loadedPlanTexture.image;
  if (!img || !img.width || !img.height) return;
  const w = safeNumber($("map-width").value, 40, 1, 1000);
  planPlane.scale.set(w, w * img.height / img.width, 1);
}
function loadPlan(file) {
  if (!file) return;
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) return notify("배치도는 PNG/JPG/WEBP 이미지만 지원합니다.");
  const url = URL.createObjectURL(file);
  new THREE.TextureLoader().load(url, texture => {
    URL.revokeObjectURL(url);
    if (loadedPlanTexture) loadedPlanTexture.dispose();
    loadedPlanTexture = texture;
    texture.colorSpace = THREE.SRGBColorSpace;
    planPlane.material.map = texture;
    planPlane.material.needsUpdate = true;
    planPlane.visible = true;
    planFileName = file.name;
    $("map-name").textContent = "배치도: " + file.name;
    syncPlanWidth();
    notify("배치도 이미지를 현장의 수평면에 배치했습니다.");
  }, undefined, () => { URL.revokeObjectURL(url); notify("배치도 이미지를 읽지 못했습니다."); });
}
function snapshot() {
  return { p: artRoot.position.toArray(), r: artRoot.rotation.toArray().slice(0, 3), s: artRoot.scale.toArray() };
}
function sameSnapshot(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}
function restore(data) {
  artRoot.position.fromArray(data.p);
  artRoot.rotation.set(...data.r);
  artRoot.scale.fromArray(data.s);
  updateInspector();
}
function clearUndo() {
  undoStack = [];
  redoStack = [];
  updateUndoButtons();
}
function commit(before) {
  if (approvedMaster || !before || sameSnapshot(before, snapshot())) return;
  undoStack.push(before);
  if (undoStack.length > MAX_UNDO) undoStack.shift();
  redoStack = [];
  updateUndoButtons();
}
function updateUndoButtons() {
  $("undo").disabled = approvedMaster || undoStack.length === 0;
  $("redo").disabled = approvedMaster || redoStack.length === 0;
}
function undo() {
  if (approvedMaster || !undoStack.length) return;
  redoStack.push(snapshot());
  restore(undoStack.pop());
  updateUndoButtons();
}
function redo() {
  if (approvedMaster || !redoStack.length) return;
  undoStack.push(snapshot());
  restore(redoStack.pop());
  updateUndoButtons();
}
function syncLock() {
  transform.enabled = !approvedMaster;
  if (approvedMaster) transform.detach();
  else if (artRoot.children.length) transform.attach(artRoot);
  controls.forEach(el => el.disabled = approvedMaster);
  $("apply-height").disabled = approvedMaster;
  $("master-lock").classList.toggle("locked", approvedMaster);
  $("master-lock").textContent = approvedMaster ? "🔒 MASTER LOCK 승인됨 · 수정하려면 잠금 해제" : "MASTER VIEW 승인 · 작품 잠금";
  $("object-state").textContent = approvedMaster ? "MASTER LOCK" : "편집 가능";
  $("lock-desc").textContent = approvedMaster
    ? "승인된 작품 위치·회전·배율이 고정되었습니다. 잠금을 해제하면 새로운 수정 버전이 시작됩니다."
    : "승인하면 현재 작품의 배치를 잠급니다. 현장 모델은 항상 편집 대상에서 제외됩니다.";
  buttons.forEach(el => el.disabled = approvedMaster);
  updateUndoButtons();
}
function updateInspector() {
  const state = snapshot();
  const values = { position: state.p, rotation: state.r.map(v => THREE.MathUtils.radToDeg(v)), scale: state.s };
  controls.forEach(el => {
    if (document.activeElement === el) return;
    const axis = { x: 0, y: 1, z: 2 }[el.dataset.axis];
    el.value = Number(values[el.dataset.transform][axis].toFixed(3));
  });
  const bounds = new THREE.Box3().setFromObject(artRoot);
  const d = bounds.getSize(new THREE.Vector3());
  $("dimensions").textContent = [d.x, d.y, d.z].map(v => v.toFixed(2)).join(" × ") + " m (W×H×D)";
  $("coords").textContent = ["X", "Y", "Z"].map((k, i) => k + " " + state.p[i].toFixed(2)).join(" · ");
  $("art-height").value = d.y ? Number(d.y.toFixed(2)) : 0;
}
function changeMode(mode) {
  if (approvedMaster) return;
  selectedMode = mode;
  transform.setMode(mode);
  buttons.forEach(btn => btn.classList.toggle("active", btn.dataset.mode === mode));
}
function snapSetting() {
  const yes = $("snap").checked;
  transform.setTranslationSnap(yes ? .5 : null);
  transform.setRotationSnap(yes ? THREE.MathUtils.degToRad(15) : null);
  transform.setScaleSnap(yes ? .1 : null);
}
function updateLight() {
  const az = THREE.MathUtils.degToRad(+$("sun-azimuth").value);
  const el = THREE.MathUtils.degToRad(+$("sun-elevation").value);
  const radius = 65;
  sun.position.set(radius * Math.cos(el) * Math.sin(az), radius * Math.sin(el), radius * Math.cos(el) * Math.cos(az));
  sun.target.position.copy(artRoot.position);
  sun.target.updateMatrixWorld();
  sun.intensity = +$("sun-strength").value;
  ambient.intensity = +$("ambient").value;
  renderer.toneMappingExposure = +$("exposure").value;
  sun.castShadow = $("shadows").checked;
  renderer.shadowMap.enabled = $("shadows").checked;
  ["sun-azimuth", "sun-elevation", "sun-strength", "ambient", "exposure"].forEach(id => {
    $(id + "-value").textContent = $(id).value + (id.startsWith("sun-") && id !== "sun-strength" ? "°" : "");
  });
}
function artworkTarget() {
  const box = new THREE.Box3().setFromObject(artRoot);
  if (box.isEmpty()) return new THREE.Vector3(0, 1.5, 0);
  return box.getCenter(new THREE.Vector3());
}
function changeView(name) {
  const center = artworkTarget();
  const size = new THREE.Box3().setFromObject(artRoot).getSize(new THREE.Vector3());
  const dist = Math.max(9, size.length() * 2.5);
  const offsets = {
    main: [dist * .7, dist * .6, dist],
    eye: [0, 1.65 - center.y, dist],
    left: [-dist, dist * .4, dist],
    right: [dist, dist * .4, dist],
    rear: [0, dist * .25, -dist],
    aerial: [.01, dist * 1.65, dist * .25],
    long: [dist * 1.6, dist * .9, dist * 2.2],
    detail: [dist * .3, dist * .2, dist * .6]
  };
  const o = offsets[name] || offsets.main;
  camera.position.set(center.x + o[0], center.y + o[1], center.z + o[2]);
  orbit.target.copy(center);
  orbit.update();
  document.querySelectorAll("[data-view]").forEach(b => b.classList.toggle("active", b.dataset.view === name));
}
function fitCamera() { changeView("main"); }
function resize() {
  const rect = viewport.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  camera.aspect = rect.width / rect.height;
  camera.updateProjectionMatrix();
  renderer.setSize(rect.width, rect.height, false);
}
function handleSelection(event) {
  if (mouseMoved || approvedMaster || transform.dragging) return;
  const rect = viewport.getBoundingClientRect();
  mouse.x = (event.clientX - rect.left) / rect.width * 2 - 1;
  mouse.y = -(event.clientY - rect.top) / rect.height * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
  if (raycaster.intersectObjects(artRoot.children, true).length) transform.attach(artRoot);
}
function setTransformFromField(el) {
  if (approvedMaster) return;
  const current = artRoot[el.dataset.transform][el.dataset.axis];
  const raw = safeNumber(el.value, NaN);
  if (!Number.isFinite(raw)) return updateInspector();
  if (el.dataset.transform === "scale" && (raw < .01 || raw > 1000)) return updateInspector();
  const next = el.dataset.transform === "rotation" ? THREE.MathUtils.degToRad(raw) : raw;
  if (Math.abs(current - next) < 1e-8) return;
  const before = snapshot();
  if (el.dataset.transform === "scale" && $("uniform-scale").checked) artRoot.scale.setScalar(next);
  else artRoot[el.dataset.transform][el.dataset.axis] = next;
  commit(before);
  updateInspector();
}
async function decodeModel(file, isSite) {
  if (!file || file.size > 80 * 1024 * 1024) throw new Error("3D 모델은 80MB 이하여야 합니다.");
  const ext = file.name.split(".").pop().toLowerCase();
  if ((isSite && !["glb", "gltf"].includes(ext)) || (!isSite && !["glb", "gltf", "obj", "stl"].includes(ext)))
    throw new Error("지원하지 않는 모델 형식입니다.");
  if (ext === "glb" || ext === "gltf") {
    const data = ext === "glb" ? await file.arrayBuffer() : await file.text();
    const result = await new GLTFLoader().parseAsync(data, "");
    return result.scene;
  }
  if (ext === "obj") return new OBJLoader().parse(await file.text());
  const geometry = new STLLoader().parse(await file.arrayBuffer());
  geometry.computeVertexNormals();
  return new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: 0xc7d0d4, metalness: .55, roughness: .32 }));
}
async function importModel(file, isSite) {
  if (!file) return;
  const op = ++activeFileOperation;
  try {
    notify("파일을 읽고 있습니다: " + file.name);
    const model = await decodeModel(file, isSite);
    if (op !== activeFileOperation) return;
    if (isSite) {
      clearGroup(siteRoot);
      siteRoot.add(model);
      siteFileName = file.name;
      $("site-filename").textContent = file.name;
      $("site-status").textContent = "실제 모델";
      $("site-preset").value = "empty";
      setShadows(siteRoot);
      notify("현장 모델을 불러왔습니다. 원본 좌표와 스케일이 유지됩니다.");
    } else {
      setArtwork(model, file.name, safeNumber($("art-height").value, 3, .05, 100));
      if (pendingArtwork && pendingArtwork.source === file.name) {
        restore(pendingArtwork.transform);
        approvedMaster = !!pendingArtwork.locked;
        pendingArtwork = null;
        syncLock();
      }
      changeView("main");
      notify("작품 모델을 불러왔습니다. 크기와 위치를 조정할 수 있습니다.");
    }
  } catch (error) {
    console.error(error);
    notify("불러오기 실패: " + (error.message || "파일 형식 확인 필요"));
  }
}
function sceneConfig() {
  return {
    schema: "axoo-public-art-3d-studio-v1",
    projectName: $("project-name").value,
    createdAt: new Date().toISOString(),
    site: { file: siteFileName, preset: $("site-preset").value, floor: $("floor-map").value,
      planFile: planFileName, planWidth: +$("map-width").value },
    artwork: { source: artFileName, transform: snapshot(), locked: approvedMaster, revision },
    lighting: Object.fromEntries(["sun-azimuth", "sun-elevation", "sun-strength", "ambient", "exposure"].map(id => [id, +$(id).value])),
    shadows: $("shadows").checked,
    camera: { position: camera.position.toArray(), target: orbit.target.toArray() }
  };
}
function isTriple(a) {
  return Array.isArray(a) && a.length === 3 && a.every(v => typeof v === "number" && Number.isFinite(v) && Math.abs(v) < 1e6);
}
function validTransform(t) {
  return t && isTriple(t.p) && isTriple(t.r) && isTriple(t.s) &&
    t.s.every(v => v > .00001 && v < 1000);
}
function importSceneConfig(data) {
  if (!data || data.schema !== "axoo-public-art-3d-studio-v1" || !data.site || !data.artwork ||
      !validTransform(data.artwork.transform) || !data.lighting || !data.camera ||
      !isTriple(data.camera.position) || !isTriple(data.camera.target)) {
    throw new Error("올바른 스튜디오 프로젝트 파일이 아닙니다.");
  }
  const originalSite = siteFileName;
  const originalArt = artFileName;
  $("project-name").value = String(data.projectName || "공공미술 시안").slice(0, 100);
  if (data.site.file && data.site.file !== originalSite) {
    buildSite("empty");
    $("site-status").textContent = "현장 파일 필요";
    $("site-filename").textContent = "재업로드 필요: " + data.site.file;
  } else if (!data.site.file) {
    const preset = ["empty", "plaza", "courtyard", "promenade"].includes(data.site.preset) ? data.site.preset : "empty";
    $("site-preset").value = preset;
    buildSite(preset);
  }
  if (["concrete", "pavers", "grass", "asphalt", "white"].includes(data.site.floor)) {
    $("floor-map").value = data.site.floor; updateGround();
  }
  $("map-width").value = safeNumber(data.site.planWidth, 40, 1, 1000);
  syncPlanWidth();
  if (data.site.planFile && data.site.planFile !== planFileName) {
    $("map-name").textContent = "배치도 다시 업로드 필요: " + data.site.planFile;
    planPlane.visible = false;
  }
  for (const id of ["sun-azimuth", "sun-elevation", "sun-strength", "ambient", "exposure"]) {
    if (typeof data.lighting[id] === "number" && Number.isFinite(data.lighting[id])) {
      $(id).value = String(data.lighting[id]);
    }
  }
  $("shadows").checked = !!data.shadows; updateLight();
  if (data.artwork.source === originalArt) {
    approvedMaster = false;
    restore(data.artwork.transform);
    approvedMaster = !!data.artwork.locked;
    revision = safeNumber(data.artwork.revision, 1, 1, 1e6);
    syncLock();
  } else {
    pendingArtwork = data.artwork;
    $("art-filename").textContent = "재업로드 필요: " + data.artwork.source;
    notify("작품 모델 파일을 다시 업로드해야 저장된 좌표·승인을 적용합니다.");
  }
  camera.position.fromArray(data.camera.position);
  orbit.target.fromArray(data.camera.target);
  orbit.update();
  clearUndo();
}
function exportImage() {
  try {
    const width = Math.max(1, Math.floor(viewport.clientWidth)), height = Math.max(1, Math.floor(viewport.clientHeight));
    const ratio = renderer.getPixelRatio();
    renderer.setPixelRatio(1);
    renderer.setSize(width * 2, height * 2, false);
    grid.visible = false;
    transform.getHelper().visible = false;
    renderer.render(scene, camera);
    const image = renderer.domElement.toDataURL("image/png");
    grid.visible = $("grid").checked;
    transform.getHelper().visible = true;
    renderer.setPixelRatio(ratio);
    renderer.setSize(width, height, false);
    renderer.render(scene, camera);
    const a = document.createElement("a");
    a.href = image; a.download = safeFileName() + "-render.png"; a.click();
    notify("화면을 2배 해상도 PNG로 저장했습니다.");
  } catch (err) {
    notify("이미지 캡처 실패: " + (err.message || "렌더링 오류"));
    resize();
  }
}
async function exportGLB() {
  try {
    notify("GLB를 생성하고 있습니다.");
    const exportRoot = new THREE.Group();
    exportRoot.name = $("project-name").value;
    exportRoot.add(siteRoot.clone(true));
    exportRoot.add(artRoot.clone(true));
    exportRoot.add(floor.clone());
    if (planPlane.visible) exportRoot.add(planPlane.clone());
    const output = await new GLTFExporter().parseAsync(exportRoot, { binary: true, onlyVisible: true });
    download(safeFileName() + ".glb", new Blob([output], { type: "model/gltf-binary" }));
    notify("3D 씬을 GLB로 내보냈습니다.");
  } catch (err) {
    console.error(err);
    notify("GLB 내보내기 실패: " + (err.message || "텍스처 확인 필요"));
  }
}

// Event connections
$("site-preset").addEventListener("change", e => { buildSite(e.target.value); notify("예시 현장 프리셋을 적용했습니다."); });
$("site-file").addEventListener("change", e => importModel(e.target.files[0], true));
$("art-file").addEventListener("change", e => importModel(e.target.files[0], false));
$("map-file").addEventListener("change", e => loadPlan(e.target.files[0]));
$("map-width").addEventListener("change", syncPlanWidth);
$("floor-map").addEventListener("change", updateGround);
$("grid").addEventListener("change", e => { grid.visible = e.target.checked; });
$("snap").addEventListener("change", snapSetting);
$("sample-art").addEventListener("click", () => { setArtwork(sampleArtwork(), "Sample Artwork", 3); changeView("main"); });
$("apply-height").addEventListener("click", () => {
  if (approvedMaster) return;
  const h = safeNumber($("art-height").value, NaN, .05, 100);
  if (!Number.isFinite(h)) return notify("높이는 0.05~100m 범위로 입력하세요.");
  const before = snapshot();
  fitArtworkHeight(h);
  commit(before);
});
buttons.forEach(el => el.addEventListener("click", () => changeMode(el.dataset.mode)));
controls.forEach(el => el.addEventListener("change", () => setTransformFromField(el)));
$("master-lock").addEventListener("click", () => {
  if (approvedMaster && !window.confirm("MASTER LOCK을 해제하고 새 수정 버전을 시작하시겠습니까?")) return;
  if (approvedMaster) { revision++; approvedMaster = false; } else approvedMaster = true;
  syncLock();
  notify(approvedMaster ? "MASTER VIEW 승인 완료 · 작품 잠금" : "MASTER LOCK 해제 · Revision " + revision);
});
$("undo").addEventListener("click", undo);
$("redo").addEventListener("click", redo);
["sun-azimuth", "sun-elevation", "sun-strength", "ambient", "exposure", "shadows"]
  .forEach(id => $(id).addEventListener("input", updateLight));
document.querySelectorAll("[data-view]").forEach(el => el.addEventListener("click", () => changeView(el.dataset.view)));
$("focus").addEventListener("click", fitCamera);
$("shot-export").addEventListener("click", exportImage);
$("export-glb").addEventListener("click", exportGLB);
$("export-json").addEventListener("click", () => download(safeFileName() + ".json",
  new Blob([JSON.stringify(sceneConfig(), null, 2)], { type: "application/json" })));
$("import-json").addEventListener("change", async e => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    if (file.size > 1024 * 1024) throw new Error("1MB 이하의 설정 파일만 지원합니다.");
    const data = JSON.parse(await file.text());
    importSceneConfig(data);
    notify("프로젝트 설정을 불러왔습니다. 외부 3D/배치도 파일은 별도 재업로드가 필요할 수 있습니다.");
  } catch (err) { notify("설정 불러오기 실패: " + err.message); }
  e.target.value = "";
});
transform.addEventListener("dragging-changed", e => { orbit.enabled = !e.value; });
transform.addEventListener("mouseDown", () => { lastDrag = snapshot(); });
transform.addEventListener("mouseUp", () => { if (lastDrag) commit(lastDrag); lastDrag = null; updateInspector(); });
transform.addEventListener("objectChange", () => {
  // Artistic geometry is never rebuilt. All transforms are on the root group.
  updateInspector();
  sun.target.position.copy(artRoot.position);
});
renderer.domElement.addEventListener("pointerdown", () => { mouseMoved = false; });
renderer.domElement.addEventListener("pointermove", e => { if (e.buttons) mouseMoved = true; });
renderer.domElement.addEventListener("pointerup", handleSelection);
window.addEventListener("keydown", e => {
  if (e.target instanceof HTMLElement && e.target.closest("input,textarea,select,[contenteditable]")) return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
    e.preventDefault(); if (e.shiftKey) redo(); else undo(); return;
  }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const commands = { g: "translate", r: "rotate", s: "scale" };
  const mode = commands[e.key.toLowerCase()];
  if (mode) changeMode(mode);
});
window.addEventListener("resize", resize);
const resizeObserver = new ResizeObserver(resize);
resizeObserver.observe(viewport);

function animate() {
  requestAnimationFrame(animate);
  orbit.update();
  renderer.render(scene, camera);
}
buildSite("plaza");
setArtwork(sampleArtwork(), "Sample Artwork", 3);
updateGround();
syncLock();
snapSetting();
updateLight();
fitCamera();
resize();
animate();
notify("3D Studio 준비 완료 · 작품을 클릭하거나 G/R/S로 조작하세요.");
