import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";
import { STLLoader } from "three/addons/loaders/STLLoader.js";
import { FBXLoader } from "three/addons/loaders/FBXLoader.js";
import { PLYLoader } from "three/addons/loaders/PLYLoader.js";
import { ColladaLoader } from "three/addons/loaders/ColladaLoader.js";
import { TDSLoader } from "three/addons/loaders/TDSLoader.js";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import JSZip from "https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { makeExtra, extraLight, serializeExtras, validateExtras, restoreExtras, setEditorGizmosVisible } from "./extras.js";
import { snapRootToSurface, surfaceAtPointer, toFinite } from "./placement.js";

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
try {
  const envGenerator = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const env = envGenerator.fromScene(room);
  scene.environment = env.texture;
  room.dispose();
  envGenerator.dispose();
} catch (error) {
  console.warn("Environment reflections unavailable; retaining standard PBR materials.", error);
}
viewport.appendChild(renderer.domElement);

const orbit = new OrbitControls(camera, renderer.domElement);
orbit.enableDamping = true;
orbit.minDistance = .25;
orbit.maxDistance = 800;
orbit.target.set(0, 1.5, 0);
orbit.screenSpacePanning = true;
orbit.rotateSpeed = 1.7;
orbit.panSpeed = 2.6;
orbit.zoomSpeed = 1.5;
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
const extrasRoot = new THREE.Group();
extrasRoot.name = "Editable placement assets";
scene.add(extrasRoot);
const sunGuide = new THREE.Mesh(
  new THREE.SphereGeometry(.7, 22, 16),
  new THREE.MeshBasicMaterial({ color: 0xffcb73, opacity: .28, transparent: true, depthWrite: false })
);
sunGuide.name = "Editor Sun Sphere — never saved into exports";
scene.add(sunGuide);
const sunGuideRing = new THREE.Mesh(
  new THREE.TorusGeometry(.77, .025, 8, 48),
  new THREE.MeshBasicMaterial({ color: 0xe0ad57, transparent: true, opacity: .85, depthTest: false })
);
sunGuide.add(sunGuideRing);
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
let activeSiteOperation = 0, activeArtOperation = 0, activePlanOperation = 0, activeProjectOperation = 0;
let siteSourceFile = null, artSourceFile = null, planSourceFile = null;
let masterSnapshots = [], sourceDimensions = null;
let selectedMode = "translate";
let selectedRoot = artRoot, placementMode = null, nextExtraId = 1;
const SITE_UNIT_TO_M = Object.freeze({ m: 1, cm: .01, mm: .001, ft: .3048 });
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
  activeSiteOperation++;
  siteRoot.scale.setScalar(1);
  siteRoot.rotation.set(0, 0, 0);
  $("site-unit").value = "m";
  $("site-up").value = "y";
  clearGroup(siteRoot);
  siteFileName = "";
  siteSourceFile = null;
  syncGroundAvailability();
  $("site-filename").textContent = "업로드된 현장 모델 없음";
  showSiteGeometryStats(null);
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
function syncGroundAvailability() {
  const imported = !!siteSourceFile;
  $("fallback-ground").hidden = imported;
  $("site-ground-note").hidden = !imported;
  floor.visible = !imported;
  syncPlanOverlay();
}
function applySiteUnits() {
  if (approvedMaster) return;
  const factor = SITE_UNIT_TO_M[$("site-unit").value] || 1;
  siteRoot.scale.setScalar(factor);
  siteRoot.rotation.set($("site-up").value === "z" ? -Math.PI / 2 : 0, 0, 0);
  siteRoot.updateMatrixWorld(true);
  if (siteSourceFile) showSiteGeometryStats(inspectSiteGeometry(siteRoot));
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
  // Do not mutate the imported artwork's local transform. The external holder
  // provides a practical center-ground pivot while preserving the source tree.
  const holder = new THREE.Group();
  holder.position.set(-center.x, -bounds.min.y, -center.z);
  holder.add(object);
  return { holder, sourceSize: size };
}
function setArtwork(object, name, options = {}) {
  transform.detach();
  clearGroup(artRoot);
  artRoot.position.set(0, 0, 0);
  artRoot.rotation.set(0, 0, 0);
  artRoot.scale.set(1, 1, 1);
  const aligned = normalizeArtwork(object);
  artRoot.add(aligned.holder);
  artRoot.name = name;
  artFileName = name;
  selectRoot(artRoot);
  artSourceFile = options.file || null;
  sourceDimensions = aligned.sourceSize.toArray();
  $("source-dimensions").textContent = sourceDimensions.map(v => v.toFixed(3)).join(" × ") + " m (W×H×D)";
  setShadows(artRoot);
  approvedMaster = false;
  revision = 1;
  masterSnapshots = [];
  clearUndo();
  if (Number.isFinite(options.height) && options.height > 0) fitArtworkHeight(options.height);
  transform.attach(artRoot);
  updateInspector(true);
  syncLock();
  renderMasterHistory();
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
  if (!loadedPlanTexture) return;
  const img = loadedPlanTexture.image;
  if (!img || !img.width || !img.height) return;
  const w = safeNumber($("map-width").value, 40, 1, 1000);
  planPlane.scale.set(w, w * img.height / img.width, 1);
  syncPlanOverlay();
}
function syncPlanOverlay() {
  planPlane.visible = !!loadedPlanTexture && $("plan-visible").checked;
  planPlane.position.set(
    toFinite($("plan-x").value, 0),
    toFinite($("plan-elevation").value, .05, -50, 1000),
    toFinite($("plan-z").value, 0)
  );
  // Rotation about the plane's local normal maps to world Y after X=-90°.
  planPlane.rotation.set(-Math.PI / 2, 0, THREE.MathUtils.degToRad(toFinite($("plan-rotation").value, 0, -36000, 36000)));
  const alpha = toFinite($("plan-opacity").value, 55, 10, 100);
  planPlane.material.opacity = alpha / 100;
  planPlane.material.transparent = true;
  $("plan-opacity-value").textContent = Math.round(alpha) + "%";
}
function decodePlanTexture(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    new THREE.TextureLoader().load(url, texture => {
      URL.revokeObjectURL(url);
      texture.colorSpace = THREE.SRGBColorSpace;
      resolve(texture);
    }, undefined, err => {
      URL.revokeObjectURL(url);
      reject(err || new Error("배치도 이미지를 읽을 수 없습니다."));
    });
  });
}
function applyPlanTexture(texture, file) {
  if (loadedPlanTexture) loadedPlanTexture.dispose();
  loadedPlanTexture = texture;
  planPlane.material.map = texture;
  planPlane.material.needsUpdate = true;
  planPlane.visible = true;
  planFileName = file.name;
  planSourceFile = file;
  $("map-name").textContent = "배치도: " + file.name;
  syncPlanWidth();
}
async function loadPlan(file) {
  if (!file || approvedMaster) return;
  if (!/^image\/(png|jpeg|webp)$/.test(file.type) || file.size > 20 * 1024 * 1024) {
    return notify("20MB 이하의 PNG/JPG/WEBP 이미지가 필요합니다.");
  }
  activeProjectOperation++;
  const token = ++activePlanOperation;
  try {
    const texture = await decodePlanTexture(file);
    if (approvedMaster || token !== activePlanOperation) { texture.dispose(); return; }
    applyPlanTexture(texture, file);
    notify("배치도 이미지를 불러왔습니다. 폭·좌표·회전·투명도를 조정할 수 있습니다.");
  } catch (error) {
    notify("배치도 불러오기 실패: " + (error.message || "알 수 없는 오류"));
  }
}
function snapshot(root = artRoot) {
  return { p: root.position.toArray(), r: root.rotation.toArray().slice(0, 3), s: root.scale.toArray() };
}
function editSnapshot() {
  return { artwork: snapshot(), extras: serializeExtras(extrasRoot),
    selectedId: selectedRoot === artRoot ? 0 : selectedRoot.userData.extraId };
}
function sameSnapshot(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}
function restore(data) {
  artRoot.position.fromArray(data.p);
  artRoot.rotation.set(...data.r);
  artRoot.scale.fromArray(data.s);
  updateInspector(true);
}
function restoreEdit(state) {
  restore(state.artwork);
  restoreExtras(extrasRoot, state.extras);
  nextExtraId = Math.max(1, ...state.extras.map(x => x.id + 1));
  const picked = state.selectedId ? extrasRoot.children.find(x => x.userData.extraId === state.selectedId) : artRoot;
  selectRoot(picked || artRoot);
  updateExtrasStatus();
}
function clearUndo() {
  undoStack = [];
  redoStack = [];
  updateUndoButtons();
}
function commit(before) {
  if (approvedMaster || !before || sameSnapshot(before, editSnapshot())) return;
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
  redoStack.push(editSnapshot());
  restoreEdit(undoStack.pop());
  updateUndoButtons();
}
function redo() {
  if (approvedMaster || !redoStack.length) return;
  undoStack.push(editSnapshot());
  restoreEdit(redoStack.pop());
  updateUndoButtons();
}
function masterSnapshot() {
  return {
    revision,
    approvedAt: new Date().toISOString(),
    artworkFile: artFileName,
    siteFile: siteFileName,
    planFile: planFileName,
    artworkTransform: snapshot(),
    camera: { position: camera.position.toArray(), target: orbit.target.toArray(), fov: camera.fov },
    lighting: Object.fromEntries(["sun-azimuth", "sun-elevation", "sun-strength", "ambient", "exposure"]
      .map(id => [id, Number($(id).value)])),
    shadows: $("shadows").checked,
    extras: serializeExtras(extrasRoot)
  };
}
function validMasterSnapshot(entry) {
  return entry && Number.isInteger(entry.revision) && entry.revision >= 1 &&
    typeof entry.approvedAt === "string" && !Number.isNaN(Date.parse(entry.approvedAt)) &&
    typeof entry.artworkFile === "string" && typeof entry.siteFile === "string" &&
    validTransform(entry.artworkTransform) &&
    entry.camera && isTriple(entry.camera.position) && isTriple(entry.camera.target) &&
    entry.lighting && typeof entry.lighting === "object" &&
    (entry.extras === undefined || validateExtras(entry.extras));
}
function renderMasterHistory() {
  const root = $("master-history");
  root.replaceChildren();
  const latest = masterSnapshots[masterSnapshots.length - 1];
  $("master-summary").textContent = latest
    ? "승인 기록 " + masterSnapshots.length + "개 · 마지막 승인 Revision " + latest.revision +
      " (" + new Date(latest.approvedAt).toLocaleString("ko-KR") + ")"
    : "승인된 마스터 없음";
  $("restore-master-camera").disabled = !latest;
  masterSnapshots.slice().reverse().forEach((entry, reverseIndex) => {
    const row = document.createElement("div");
    row.className = "master-item";
    const label = document.createElement("span");
    label.textContent = "REV " + entry.revision + " · " + new Date(entry.approvedAt).toLocaleString("ko-KR");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "master-item__button";
    button.textContent = "시점 복귀";
    button.addEventListener("click", () => restoreMasterCamera(masterSnapshots.length - 1 - reverseIndex));
    row.append(label, button);
    root.appendChild(row);
  });
}
function restoreMasterCamera(index) {
  const saved = masterSnapshots[index];
  if (!saved) return;
  camera.position.fromArray(saved.camera.position);
  orbit.target.fromArray(saved.camera.target);
  if (Number.isFinite(saved.camera.fov)) {
    camera.fov = saved.camera.fov;
    camera.updateProjectionMatrix();
  }
  for (const id of ["sun-azimuth", "sun-elevation", "sun-strength", "ambient", "exposure"]) {
    if (typeof saved.lighting[id] === "number" && Number.isFinite(saved.lighting[id])) {
      $(id).value = String(saved.lighting[id]);
    }
  }
  $("shadows").checked = !!saved.shadows;
  orbit.update();
  updateLight();
  notify("승인 Revision " + saved.revision + "의 카메라·조명으로 돌아왔습니다. 작품·현장 위치는 변경되지 않습니다.");
}
function syncLock() {
  transform.enabled = !approvedMaster;
  if (approvedMaster) {
    placementMode = null;
    $("placement-hint").hidden = true;
    // Even a file read that began before approval must not replace the master.
    activeSiteOperation++;
    activeArtOperation++;
    activePlanOperation++;
    transform.detach();
  }
  else if (selectedRoot) transform.attach(selectedRoot);
  ["site-unit", "site-up", "delete-selected", "extra-light-power", "extra-light-color",
    "auto-ground", "ground-selected", "pick-selected-site", "ground-offset",
    "plan-pick-center", "plan-visible", "map-file", "map-width", "plan-x", "plan-z",
    "plan-rotation", "plan-elevation", "plan-opacity"]
    .forEach(id => { $(id).disabled = approvedMaster; });
  document.querySelectorAll("[data-add-extra]").forEach(btn => { btn.disabled = approvedMaster; });
  updateExtrasStatus();
  controls.forEach(el => el.disabled = approvedMaster);
  ["apply-height", "art-height", "site-preset", "site-file", "art-file", "sample-art", "floor-map", "map-file", "map-width", "uniform-scale"]
    .forEach(id => { $(id).disabled = approvedMaster; });
  $("master-lock").classList.toggle("locked", approvedMaster);
  $("master-lock").textContent = approvedMaster ? "🔒 MASTER LOCK 승인됨 · 수정하려면 잠금 해제" : "MASTER VIEW 승인 · 작품 잠금";
  $("object-state").textContent = approvedMaster ? "MASTER LOCK" : "편집 가능";
  $("lock-desc").textContent = approvedMaster
    ? "승인된 작품 위치·회전·배율이 고정되었습니다. 잠금을 해제하면 새로운 수정 버전이 시작됩니다."
    : "승인하면 현재 작품의 배치를 잠급니다. 현장 모델은 항상 편집 대상에서 제외됩니다.";
  buttons.forEach(el => el.disabled = approvedMaster);
  updateUndoButtons();
}
function updateInspector(force = false) {
  const state = snapshot(selectedRoot);
  const values = { position: state.p, rotation: state.r.map(v => THREE.MathUtils.radToDeg(v)), scale: state.s };
  controls.forEach(el => {
    if (!force && document.activeElement === el) return;
    const axis = { x: 0, y: 1, z: 2 }[el.dataset.axis];
    el.value = Number(values[el.dataset.transform][axis].toFixed(3));
  });
  const bounds = new THREE.Box3().setFromObject(selectedRoot);
  const d = bounds.getSize(new THREE.Vector3());
  $("dimensions").textContent = [d.x, d.y, d.z].map(v => v.toFixed(2)).join(" × ") + " m (W×H×D)";
  $("coords").textContent = ["X", "Y", "Z"].map((k, i) => k + " " + state.p[i].toFixed(2)).join(" · ");
  $("object-name").textContent = selectedRoot.name;
  const light = selectedRoot === artRoot ? null : extraLight(selectedRoot);
  $("extra-light-controls").hidden = !light;
  if (light) {
    $("extra-light-power").value = light.intensity;
    $("extra-light-power-value").textContent = light.intensity.toFixed(1);
    $("extra-light-color").value = "#" + light.color.getHexString();
  }
  $("delete-selected").disabled = approvedMaster || selectedRoot === artRoot;
  if (selectedRoot === artRoot) $("art-height").value = d.y ? Number(d.y.toFixed(2)) : 0;
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
  sunGuide.position.copy(artRoot.position).addScaledVector(
    sun.position.clone().normalize(), 8
  );
  sunGuide.visible = $("sun-helper").checked;
  sun.intensity = +$("sun-strength").value;
  ambient.intensity = +$("ambient").value;
  renderer.toneMappingExposure = +$("exposure").value;
  sun.color.set($("light-preset").value === "golden" ? 0xffc489 : 0xfff7e6);
  scene.background.set($("light-preset").value === "night" ? 0x171f33 : 0xdce0e2);
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
function updateExtrasStatus() {
  $("extra-count").textContent = "추가된 오브제 " + extrasRoot.children.length + "개";
  const list = $("extra-list");
  const activeId = selectedRoot.userData.extraId;
  const currentIds = [...list.children].map(node => Number(node.dataset.extraId));
  const wantedIds = extrasRoot.children.map(node => node.userData.extraId);
  if (currentIds.join(",") !== wantedIds.join(",")) {
    list.replaceChildren();
    for (const root of extrasRoot.children) {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.extraId = String(root.userData.extraId);
      button.textContent = root.name;
      button.addEventListener("click", () => {
        // Resolve by ID at click time: undo/ZIP restore may rebuild mesh roots.
        const latest = extrasRoot.children.find(object => object.userData.extraId === root.userData.extraId);
        if (latest) selectRoot(latest);
      });
      list.append(button);
    }
  }
  for (const button of list.children) {
    const object = extrasRoot.children.find(node => node.userData.extraId === Number(button.dataset.extraId));
    if (object) button.textContent = object.name;
    button.classList.toggle("active", Number(button.dataset.extraId) === activeId);
    button.disabled = approvedMaster;
  }
  $("delete-selected").disabled = approvedMaster || selectedRoot === artRoot;
}
function selectRoot(object) {
  selectedRoot = object || artRoot;
  if (!approvedMaster && selectedRoot) transform.attach(selectedRoot);
  else transform.detach();
  updateInspector(true);
  updateExtrasStatus();
}
function setPlacement(kind) {
  if (approvedMaster) return;
  placementMode = kind;
  $("placement-hint").hidden = false;
  $("placement-hint").textContent = kind.includes("light")
    ? "현장 바닥을 클릭하여 조명 위치 지정 · 배치 후 이동(G)으로 높이 조절 · Esc 취소"
    : "현장 바닥을 클릭해 식재 배치 · 위치(G)·크기(S) 조절 · Esc 취소";
  notify("현장 위치를 클릭하여 추가하세요.");
}
function createPlacedExtra(kind, position) {
  if (approvedMaster || extrasRoot.children.length >= 120) return null;
  const before = editSnapshot();
  const root = makeExtra(kind, nextExtraId++);
  root.position.copy(position);
  if (kind.includes("light")) root.position.y += 3;
  extrasRoot.add(root);
  if (!kind.includes("light")) {
    snapRootToSurface(root, siteRoot, { allowFallback: !siteSourceFile,
      offset: toFinite($("ground-offset").value, 0, -20, 50) });
  }
  selectRoot(root);
  updateExtrasStatus();
  commit(before);
  return root;
}
function deleteSelectedExtra() {
  if (approvedMaster || selectedRoot === artRoot || !selectedRoot.parent) return;
  const before = editSnapshot();
  selectedRoot.parent.remove(selectedRoot);
  selectRoot(artRoot);
  commit(before);
  notify("선택한 오브제를 삭제했습니다. Ctrl+Z로 복원할 수 있습니다.");
}
function groundSelected({ silent = false } = {}) {
  if (approvedMaster) return null;
  if (selectedRoot !== artRoot && extraLight(selectedRoot)) {
    if (!silent) notify("조명은 공중 설치가 가능하므로 자동 밀착하지 않습니다. 현장 클릭 재배치에서 높이를 조정하세요.");
    return null;
  }
  const before = editSnapshot();
  const result = snapRootToSurface(selectedRoot, siteRoot, {
    allowFallback: !siteSourceFile,
    offset: toFinite($("ground-offset").value, 0, -20, 50)
  });
  if (result) {
    commit(before);
    updateInspector(true);
    $("ground-status").textContent = "밀착 완료 · 표면 높이 " + result.surfaceHeight.toFixed(2) +
      "m · 이동량 " + result.deltaY.toFixed(2) + "m";
    if (!silent) notify("선택 오브제의 최하단을 감지한 표면에 맞췄습니다.");
  } else if (!silent) {
    $("ground-status").textContent = "현장 표면을 찾지 못했습니다. 지면이 포함된 3D 모델인지 확인하세요.";
    notify("해당 좌표에서 위쪽을 향한 3D 표면을 찾지 못했습니다. 높이를 임의로 변경하지 않았습니다.");
  }
  return result;
}
function placeSelectedOnSite(hit) {
  if (approvedMaster || !hit) return;
  const before = editSnapshot();
  selectedRoot.position.x = hit.point.x;
  selectedRoot.position.z = hit.point.z;
  if (selectedRoot !== artRoot && extraLight(selectedRoot)) {
    selectedRoot.position.y = hit.point.y + 3 + toFinite($("ground-offset").value, 0, -20, 50);
  } else {
    const box = new THREE.Box3().setFromObject(selectedRoot);
    selectedRoot.position.y += hit.point.y + toFinite($("ground-offset").value, 0, -20, 50) - box.min.y;
  }
  commit(before);
  updateInspector(true);
  $("ground-status").textContent = "현장 클릭 배치 완료 · X " + hit.point.x.toFixed(2) +
    " / Z " + hit.point.z.toFixed(2) + " / 지면 Y " + hit.point.y.toFixed(2);
  notify("클릭한 현장 표면으로 선택 오브제를 이동했습니다.");
}
function pickPlacement(event) {
  return surfaceAtPointer(event, camera, viewport, siteRoot, !siteSourceFile);
}
function handleSelection(event) {
  if (mouseMoved || approvedMaster || transform.dragging || event.button !== 0) return;
  if (placementMode) {
    const hit = pickPlacement(event);
    if (!hit) { notify("해당 지점에서 위쪽 표면을 찾을 수 없습니다. 현장 메시와 각도를 확인하세요."); return; }
    const kind = placementMode;
    placementMode = null;
    $("placement-hint").hidden = true;
    if (kind === "plan-center") {
      $("plan-x").value = hit.point.x.toFixed(3);
      $("plan-z").value = hit.point.z.toFixed(3);
      syncPlanOverlay();
      notify("배치도 중심점의 X/Z를 현장 클릭 위치로 맞췄습니다.");
    } else if (kind === "selected-ground") {
      placeSelectedOnSite(hit);
    } else {
      createPlacedExtra(kind, hit.point);
    }
    return;
  }
  const rect = viewport.getBoundingClientRect();
  mouse.x = (event.clientX - rect.left) / rect.width * 2 - 1;
  mouse.y = -(event.clientY - rect.top) / rect.height * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
  const allHits = raycaster.intersectObjects([...extrasRoot.children, ...artRoot.children], true);
  if (!allHits.length) return;
  let candidate = allHits[0].object;
  while (candidate.parent && candidate.parent !== extrasRoot && candidate.parent !== artRoot) candidate = candidate.parent;
  if (candidate.parent === extrasRoot) selectRoot(candidate);
  else selectRoot(artRoot);
}
function setTransformFromField(el) {
  if (approvedMaster) return;
  const current = selectedRoot[el.dataset.transform][el.dataset.axis];
  const raw = safeNumber(el.value, NaN);
  if (!Number.isFinite(raw)) return updateInspector();
  if (el.dataset.transform === "scale" && (raw < .01 || raw > 1000)) return updateInspector();
  const next = el.dataset.transform === "rotation" ? THREE.MathUtils.degToRad(raw) : raw;
  if (Math.abs(current - next) < 1e-8) return;
  const before = editSnapshot();
  if (el.dataset.transform === "scale" && $("uniform-scale").checked) {
    // Preserve the existing XYZ ratio rather than forcing all values equal.
    const previousAxis = selectedRoot.scale[el.dataset.axis];
    if (Math.abs(previousAxis) > 1e-8) selectedRoot.scale.multiplyScalar(next / previousAxis);
  }
  else selectedRoot[el.dataset.transform][el.dataset.axis] = next;
  if ($("auto-ground").checked && el.dataset.transform === "position" &&
      ["x","z"].includes(el.dataset.axis) && !extraLight(selectedRoot)) {
    snapRootToSurface(selectedRoot, siteRoot, {
      allowFallback: !siteSourceFile,
      offset: toFinite($("ground-offset").value, 0, -20, 50)
    });
  }
  commit(before);
  updateInspector();
}
const SITE_MODEL_FORMATS = Object.freeze(["glb", "gltf", "obj", "fbx", "stl", "ply", "dae", "3ds"]);
const ARTWORK_MODEL_FORMATS = Object.freeze(["glb", "gltf", "obj", "stl"]);

function plainGeometryMesh(geometry, kind) {
  if (!geometry.getAttribute("normal")) geometry.computeVertexNormals();
  const hasVertexColors = !!geometry.getAttribute("color");
  const material = new THREE.MeshStandardMaterial({
    color: hasVertexColors ? 0xffffff : 0xc7d0d4,
    metalness: kind === "stl" ? .55 : .06,
    roughness: kind === "stl" ? .32 : .78,
    vertexColors: hasVertexColors,
    side: THREE.DoubleSide
  });
  return new THREE.Mesh(geometry, material);
}
async function decodeModel(file, isSite) {
  if (!file || file.size > 80 * 1024 * 1024) throw new Error("3D 모델은 80MB 이하여야 합니다.");
  const ext = file.name.split(".").pop().toLowerCase();
  const formats = isSite ? SITE_MODEL_FORMATS : ARTWORK_MODEL_FORMATS;
  if (!formats.includes(ext)) {
    throw new Error(isSite
      ? "현장 모델은 GLB, GLTF, OBJ, FBX, STL, PLY, DAE 또는 3DS 파일을 사용하세요. SKP/IFC/RVT/DWG는 GLB로 변환이 필요합니다."
      : "작품 모델은 GLB, GLTF, OBJ, STL 형식만 지원합니다.");
  }
  if (ext === "glb" || ext === "gltf") {
    // A standalone .gltf requires embedded geometry/texture data.
    // Prefer .glb when the source references additional .bin/images.
    const data = ext === "glb" ? await file.arrayBuffer() : await file.text();
    return (await new GLTFLoader().parseAsync(data, "")).scene;
  }
  if (ext === "obj") return new OBJLoader().parse(await file.text());
  if (ext === "stl") return plainGeometryMesh(new STLLoader().parse(await file.arrayBuffer()), "stl");
  if (ext === "ply") return plainGeometryMesh(new PLYLoader().parse(await file.arrayBuffer()), "ply");
  if (ext === "fbx") return new FBXLoader().parse(await file.arrayBuffer(), "");
  if (ext === "dae") return new ColladaLoader().parse(await file.text(), "").scene;
  if (ext === "3ds") return new TDSLoader().parse(await file.arrayBuffer(), "");
  throw new Error("지원하지 않는 확장자입니다.");
}
function showSiteGeometryStats(stats) {
  $("site-dimensions").textContent = stats
    ? stats.size.toArray().map(value => value.toFixed(2)).join(" × ") + " (W×H×D, 파일 단위) · 메시 " + stats.meshCount + "개"
    : "—";
}
function inspectSiteGeometry(model) {
  let meshCount = 0;
  model.traverse(object => {
    if (object.isMesh && object.geometry && object.geometry.getAttribute("position")) meshCount++;
  });
  const bounds = new THREE.Box3().setFromObject(model);
  const size = bounds.getSize(new THREE.Vector3());
  if (!meshCount || bounds.isEmpty() || !size.toArray().every(Number.isFinite) || size.lengthSq() < 1e-10) {
    throw new Error("현장 모델에 표시할 수 있는 3D 메시가 없습니다. 다른 형식으로 내보내 다시 시도하세요.");
  }
  return { meshCount, size };
}
async function importModel(file, isSite) {
  if (!file) return;
  if (approvedMaster) return notify("MASTER LOCK을 먼저 해제해야 작품·공간 모델을 변경할 수 있습니다.");
  activeProjectOperation++;
  const op = isSite ? ++activeSiteOperation : ++activeArtOperation;
  try {
    notify("파일을 읽고 있습니다: " + file.name);
    const model = await decodeModel(file, isSite);
    const siteStats = isSite ? inspectSiteGeometry(model) : null;
    if (approvedMaster || op !== (isSite ? activeSiteOperation : activeArtOperation)) return;
    if (isSite) {
      clearGroup(siteRoot);
      siteRoot.add(model);
      siteFileName = file.name;
      siteSourceFile = file;
      $("site-filename").textContent = file.name;
      $("site-status").textContent = "실제 모델";
      $("site-preset").value = "empty";
      $("site-unit").value = "m"; $("site-up").value = "y";
      applySiteUnits(); syncGroundAvailability();
      setShadows(siteRoot);
      showSiteGeometryStats(inspectSiteGeometry(siteRoot));
      notify("현장 " + file.name + " 불러오기 완료 · 원본 좌표·크기를 유지했습니다.");
    } else {
      // Imported geometry retains original dimensions; never fit to stale 3m field.
      setArtwork(model, file.name, { file });
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
      unit: $("site-unit").value, up: $("site-up").value,
      planFile: planFileName, planWidth: +$("map-width").value },
    extras: serializeExtras(extrasRoot),
    navSpeed: +$("nav-speed").value,
    lightPreset: $("light-preset").value,
    artwork: { source: artFileName, transform: snapshot(), locked: approvedMaster, revision, uniformScale: $("uniform-scale").checked },
    masterSnapshots,
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
function validateProjectConfig(data) {
  if (!data || data.schema !== "axoo-public-art-3d-studio-v1" || !data.site || !data.artwork ||
      !validTransform(data.artwork.transform) || !data.lighting || !data.camera ||
      !isTriple(data.camera.position) || !isTriple(data.camera.target) ||
      typeof data.artwork.source !== "string" || typeof data.site.file !== "string" ||
      !["empty", "plaza", "courtyard", "promenade"].includes(data.site.preset) ||
      (data.extras !== undefined && !validateExtras(data.extras)) ||
      (data.site.unit !== undefined && !Object.hasOwn(SITE_UNIT_TO_M,data.site.unit)) ||
      (data.site.up !== undefined && !["y","z"].includes(data.site.up)) ||
      (data.masterSnapshots !== undefined &&
        (!Array.isArray(data.masterSnapshots) || data.masterSnapshots.length > 40 ||
          !data.masterSnapshots.every(validMasterSnapshot)))) {
    throw new Error("올바른 스튜디오 프로젝트 파일이 아닙니다.");
  }
}
function importSceneConfig(data) {
  if (approvedMaster) throw new Error("MASTER LOCK을 해제한 후 프로젝트를 불러오세요.");
  validateProjectConfig(data);
  const originalSite = siteFileName;
  const originalArt = artFileName;
  $("project-name").value = String(data.projectName || "공공미술 시안").slice(0, 100);
  if (data.site.file && data.site.file !== originalSite) {
    buildSite("empty");
    $("site-status").textContent = "현장 파일 필요";
    $("site-filename").textContent = "재업로드 필요: " + data.site.file;
    showSiteGeometryStats(null);
  } else if (!data.site.file) {
    const preset = ["empty", "plaza", "courtyard", "promenade"].includes(data.site.preset) ? data.site.preset : "empty";
    $("site-preset").value = preset;
    buildSite(preset);
  }
  $("site-unit").value = Object.hasOwn(SITE_UNIT_TO_M,data.site.unit) ? data.site.unit : "m";
  $("site-up").value = data.site.up === "z" ? "z" : "y";
  applySiteUnits();
  syncGroundAvailability();
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
  $("shadows").checked = !!data.shadows;
  $("light-preset").value = ["clear","cloudy","golden","night"].includes(data.lightPreset) ? data.lightPreset : "custom";
  $("nav-speed").value = safeNumber(data.navSpeed, 2.6, .5, 5);
  $("nav-speed").dispatchEvent(new Event("input"));
  updateLight();
  restoreExtras(extrasRoot, data.extras || []);
  nextExtraId = Math.max(1,...extrasRoot.children.map(x => x.userData.extraId+1));
  selectRoot(artRoot);
  $("uniform-scale").checked = data.artwork.uniformScale !== false;
  if (data.artwork.source === originalArt) {
    approvedMaster = false;
    restore(data.artwork.transform);
    approvedMaster = !!data.artwork.locked;
    revision = safeNumber(data.artwork.revision, 1, 1, 1e6);
    syncLock();
  } else {
    // Mismatched assets cannot be silently substituted by the sample model.
    approvedMaster = false;
    syncLock();
    pendingArtwork = data.artwork;
    $("art-filename").textContent = "재업로드 필요: " + data.artwork.source;
    notify("작품 모델 파일을 다시 업로드해야 저장된 좌표·승인을 적용합니다.");
  }
  camera.position.fromArray(data.camera.position);
  orbit.target.fromArray(data.camera.target);
  orbit.update();
  if (Array.isArray(data.masterSnapshots)) {
    masterSnapshots = structuredClone(data.masterSnapshots);
  } else {
    // Backwards-compatible v0.1 JSON had only a boolean lock, not a snapshot.
    masterSnapshots = approvedMaster ? [masterSnapshot()] : [];
  }
  renderMasterHistory();
  syncLock();
  clearUndo();
}
// The portable project ZIP stores the actual original bytes, not just filenames.
// Built-in sample meshes and scene presets remain reproducible from the application.
const PROJECT_ARCHIVE_SCHEMA = "axoo-public-art-portable-v1";
const MAX_ZIP_BYTES = 200 * 1024 * 1024;
const MAX_MODEL_BYTES = 80 * 1024 * 1024;
const MAX_MAP_BYTES = 20 * 1024 * 1024;
async function exportProjectArchive() {
  try {
    const zip = new JSZip();
    const data = sceneConfig();
    data.archiveSchema = PROJECT_ARCHIVE_SCHEMA;
    // The source asset names are preserved in JSON. Fixed ZIP keys eliminate
    // path traversal and prevent the archive from assuming a user's directory.
    zip.file("project.json", JSON.stringify(data, null, 2));
    if (siteSourceFile) zip.file("assets/site", siteSourceFile);
    if (artSourceFile) zip.file("assets/artwork", artSourceFile);
    if (planSourceFile) zip.file("assets/plan", planSourceFile);
    $("save-status").textContent = "프로젝트 패키지 저장 중…";
    const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 2 } });
    download(safeFileName() + "-project.zip", blob);
    notify("프로젝트 ZIP에 현장·작품 원본 파일과 승인 이력을 포함했습니다.");
  } catch (err) {
    console.error(err);
    notify("프로젝트 저장 실패: " + (err.message || "메모리 용량 확인 필요"));
  } finally {
    $("save-status").textContent = "브라우저에서 로컬 처리";
  }
}
function checkedArchiveEntry(zip, name, limit, required) {
  const entry = zip.file(name);
  if (!entry) {
    if (required) throw new Error("ZIP에 필요한 모델이 없습니다: " + name);
    return null;
  }
  // Reject oversize payloads before allocation when metadata is available.
  const announced = entry._data && entry._data.uncompressedSize;
  if (announced && announced > limit) throw new Error("압축 해제 파일이 너무 큽니다: " + name);
  return entry;
}
async function recoverArchiveAsset(entry, name, maxSize, mime = "application/octet-stream") {
  if (!entry) return null;
  const bytes = await entry.async("uint8array");
  if (bytes.length > maxSize) throw new Error("허용 용량을 초과한 모델입니다.");
  return new File([bytes], name, { type: mime });
}
async function importProjectArchive(file) {
  if (!file) return;
  if (approvedMaster) return notify("MASTER LOCK을 해제한 뒤 프로젝트 ZIP을 불러오세요.");
  if (file.size > MAX_ZIP_BYTES) return notify("ZIP 파일은 200MB 이하여야 합니다.");
  const op = ++activeProjectOperation;
  $("save-status").textContent = "프로젝트 파일 검증 중…";
  let planTexture = null;
  try {
    const zip = await JSZip.loadAsync(file);
    if (Object.keys(zip.files).length > 10) throw new Error("허용되지 않는 파일이 너무 많습니다.");
    const metaEntry = checkedArchiveEntry(zip, "project.json", 1024 * 1024, true);
    const metadata = await metaEntry.async("string");
    if (metadata.length > 1024 * 1024) throw new Error("프로젝트 설정 정보가 너무 큽니다.");
    const data = JSON.parse(metadata);
    validateProjectConfig(data);
    if (data.archiveSchema !== PROJECT_ARCHIVE_SCHEMA) throw new Error("지원하지 않는 프로젝트 패키지 버전입니다.");
    // Decode and validate EVERYTHING before changing the current scene.
    const siteEntry = checkedArchiveEntry(zip, "assets/site", MAX_MODEL_BYTES, !!data.site.file);
    const artEntry = checkedArchiveEntry(zip, "assets/artwork", MAX_MODEL_BYTES, data.artwork.source !== "Sample Artwork");
    const planEntry = checkedArchiveEntry(zip, "assets/plan", MAX_MAP_BYTES, !!data.site.planFile);
    const siteFile = await recoverArchiveAsset(siteEntry, data.site.file, MAX_MODEL_BYTES);
    const artFile = await recoverArchiveAsset(artEntry, data.artwork.source, MAX_MODEL_BYTES);
    const planName = String(data.site.planFile || "");
    const planType = /\.png$/i.test(planName) ? "image/png" :
      /\.webp$/i.test(planName) ? "image/webp" : "image/jpeg";
    const planFile = await recoverArchiveAsset(planEntry, planName, MAX_MAP_BYTES, planType);
    const [siteModel, artModel] = await Promise.all([
      siteFile ? decodeModel(siteFile, true) : Promise.resolve(null),
      artFile ? decodeModel(artFile, false) : Promise.resolve(null)
    ]);
    const siteStats = siteModel ? inspectSiteGeometry(siteModel) : null;
    if (artModel) {
      const preparedBounds = new THREE.Box3().setFromObject(artModel);
      if (preparedBounds.isEmpty() || preparedBounds.getSize(new THREE.Vector3()).y <= 0.000001) {
        throw new Error("ZIP 내부 작품 모델의 형상 또는 높이가 유효하지 않습니다.");
      }
    }
    if (planFile) planTexture = await decodePlanTexture(planFile);
    if (approvedMaster || op !== activeProjectOperation) {
      if (planTexture) planTexture.dispose();
      return notify("작업 상태가 변경되어 이전 파일 로딩을 취소했습니다.");
    }
    // Commit an already validated package. No user's original file is uploaded.
    activeSiteOperation++; activeArtOperation++; activePlanOperation++;
    if (siteModel) {
      clearGroup(siteRoot);
      siteRoot.add(siteModel);
      siteFileName = siteFile.name;
      siteSourceFile = siteFile;
      $("site-status").textContent = "실제 모델";
      $("site-filename").textContent = siteFile.name;
      $("site-preset").value = "empty";
      $("site-unit").value = "m"; $("site-up").value = "y";
      applySiteUnits(); syncGroundAvailability();
      showSiteGeometryStats(inspectSiteGeometry(siteRoot));
      setShadows(siteRoot);
    } else {
      $("site-preset").value = data.site.preset;
      buildSite(data.site.preset);
    }
    if (artModel) setArtwork(artModel, artFile.name, { file: artFile });
    else setArtwork(sampleArtwork(), "Sample Artwork", { height: 3 });
    if (planTexture) {
      applyPlanTexture(planTexture, planFile);
      planTexture = null;
    } else {
      if (loadedPlanTexture) loadedPlanTexture.dispose();
      loadedPlanTexture = null; planSourceFile = null; planFileName = "";
      planPlane.material.map = null; planPlane.material.needsUpdate = true;
      planPlane.visible = false;
      $("map-name").textContent = "배치도 없음";
    }
    importSceneConfig(data);
    pendingArtwork = null;
    notify("전체 프로젝트 복원 완료 · 원본 모델과 MASTER 승인 이력 적용");
  } catch (err) {
    if (planTexture) planTexture.dispose();
    console.error(err);
    notify("전체 프로젝트 불러오기 실패: " + (err.message || "파일 확인 필요"));
  } finally {
    $("save-status").textContent = "브라우저에서 로컬 처리";
  }
}

function exportImage() {
  const width = Math.max(1, Math.floor(viewport.clientWidth));
  const height = Math.max(1, Math.floor(viewport.clientHeight));
  const originalRatio = renderer.getPixelRatio();
  const originalGrid = grid.visible;
  const originalHelper = transform.getHelper().visible;
  const originalSun = sunGuide.visible;
  const originalEditorGizmos = true;
  try {
    const targetMultiplier = safeNumber($("render-resolution").value, 2, 2, 4);
    const maxPixels = renderer.capabilities.maxTextureSize;
    const scale = Math.min(targetMultiplier, maxPixels / width, maxPixels / height);
    renderer.setPixelRatio(1);
    renderer.setSize(Math.round(width * scale), Math.round(height * scale), false);
    grid.visible = false;
    transform.getHelper().visible = false;
    sunGuide.visible = false;
    setEditorGizmosVisible(extrasRoot, false);
    renderer.render(scene, camera);
    const data = renderer.domElement.toDataURL("image/png");
    const link = document.createElement("a");
    link.href = data;
    link.download = safeFileName() + "-high-quality.png";
    document.body.appendChild(link);
    link.click();
    link.remove();
    notify("편집 보조물 없는 " + scale.toFixed(1) + "배 해상도 PNG 렌더를 저장했습니다.");
  } catch (err) {
    notify("렌더 저장 실패: " + (err.message || "그래픽 메모리 부족"));
  } finally {
    grid.visible = originalGrid;
    transform.getHelper().visible = originalHelper;
    sunGuide.visible = originalSun;
    setEditorGizmosVisible(extrasRoot, originalEditorGizmos);
    renderer.setPixelRatio(originalRatio);
    renderer.setSize(width, height, false);
  }
}
async function exportGLB() {
  try {
    notify("GLB를 생성하고 있습니다.");
    const exportRoot = new THREE.Group();
    exportRoot.name = $("project-name").value;
    exportRoot.add(siteRoot.clone(true));
    exportRoot.add(artRoot.clone(true));
    if (floor.visible) exportRoot.add(floor.clone());
    if (planPlane.visible) exportRoot.add(planPlane.clone());
    const exportedExtras = extrasRoot.clone(true);
    exportedExtras.traverse(object => {
      if (object.userData.editorOnly) object.visible = false;
    });
    exportRoot.add(exportedExtras);
    const output = await new GLTFExporter().parseAsync(exportRoot, { binary: true, onlyVisible: true });
    download(safeFileName() + ".glb", new Blob([output], { type: "model/gltf-binary" }));
    notify("3D 씬을 GLB로 내보냈습니다.");
  } catch (err) {
    console.error(err);
    notify("GLB 내보내기 실패: " + (err.message || "텍스처 확인 필요"));
  }
}

// Event connections
$("site-unit").addEventListener("change", () => {
  if (approvedMaster) return;
  applySiteUnits();
  notify("현장 단위 보정 적용 · 실제 크기를 확인하세요.");
});
$("site-up").addEventListener("change", () => {
  if (approvedMaster) return;
  applySiteUnits();
  notify("현장 높이축 보정 적용");
});
$("site-preset").addEventListener("change", e => {
  if (approvedMaster) return;
  activeProjectOperation++;
  buildSite(e.target.value); notify("예시 현장 프리셋을 적용했습니다.");
});
$("site-file").addEventListener("change", e => importModel(e.target.files[0], true));
$("art-file").addEventListener("change", e => importModel(e.target.files[0], false));
$("map-file").addEventListener("change", e => loadPlan(e.target.files[0]));
$("map-width").addEventListener("change", () => { if (!approvedMaster) syncPlanWidth(); });
["plan-x","plan-z","plan-rotation","plan-elevation","plan-opacity","plan-visible"].forEach(id=>{
  $(id).addEventListener(id === "plan-opacity" ? "input" : "change", () => {
    if (!approvedMaster) syncPlanOverlay();
  });
});
$("ground-selected").addEventListener("click", () => groundSelected());
$("pick-selected-site").addEventListener("click", () => {
  if (approvedMaster) return;
  placementMode = "selected-ground";
  $("placement-hint").textContent = "대상 오브제를 옮길 실제 현장 바닥을 클릭하세요 · Esc 취소";
  $("placement-hint").hidden = false;
});
$("plan-pick-center").addEventListener("click", () => {
  if (approvedMaster) return;
  if (!loadedPlanTexture) return notify("먼저 배치도 이미지를 불러오세요.");
  placementMode = "plan-center";
  $("placement-hint").textContent = "배치도 중심을 정렬할 현장 위치를 클릭하세요 · Esc 취소";
  $("placement-hint").hidden = false;
});
$("floor-map").addEventListener("change", () => { if (!approvedMaster) updateGround(); });
$("grid").addEventListener("change", e => { grid.visible = e.target.checked; });
$("sun-helper").addEventListener("change", e => { sunGuide.visible = e.target.checked; });
$("nav-speed").addEventListener("input", e => {
  const speed = +e.target.value;
  orbit.panSpeed = speed;
  orbit.rotateSpeed = speed * .65;
  orbit.zoomSpeed = Math.max(.5, speed * .62);
  $("nav-speed-value").textContent = speed.toFixed(1) + "×";
});
$("light-preset").addEventListener("change", e => {
  const presets = {
    clear: {az:45, el:45, sun:2, ambient:1.3, exposure:1},
    cloudy: {az:50,el:58,sun:.65,ambient:2,exposure:1.1},
    golden: {az:65,el:17,sun:2.25,ambient:.95,exposure:1.0},
    night: {az:90,el:8,sun:0,ambient:.35,exposure:.85}
  };
  const p = presets[e.target.value];
  if (p) {
    for (const [id,value] of Object.entries({"sun-azimuth":p.az,"sun-elevation":p.el,"sun-strength":p.sun,ambient:p.ambient,exposure:p.exposure})) $(id).value=value;
  }
  updateLight();
});
document.querySelectorAll("[data-add-extra]").forEach(el => el.addEventListener("click", () => setPlacement(el.dataset.addExtra)));
$("select-artwork").addEventListener("click", () => selectRoot(artRoot));
$("delete-selected").addEventListener("click", deleteSelectedExtra);
$("extra-light-power").addEventListener("input", e => {
  if (approvedMaster) return;
  const light = extraLight(selectedRoot);
  if (light) { light.intensity = +e.target.value; $("extra-light-power-value").textContent = light.intensity.toFixed(1); }
});
$("extra-light-color").addEventListener("input", e => {
  if (approvedMaster) return;
  const light = extraLight(selectedRoot);
  if (light) light.color.set(e.target.value);
});
$("snap").addEventListener("change", snapSetting);
$("sample-art").addEventListener("click", () => {
  if (approvedMaster) return notify("MASTER LOCK 해제 후 작품을 변경하세요.");
  activeArtOperation++;
  activeProjectOperation++;
  setArtwork(sampleArtwork(), "Sample Artwork", { height: 3 }); changeView("main");
});
$("apply-height").addEventListener("click", () => {
  if (approvedMaster) return;
  const h = safeNumber($("art-height").value, NaN, .05, 100);
  if (!Number.isFinite(h)) return notify("높이는 0.05~100m 범위로 입력하세요.");
  const before = editSnapshot();
  fitArtworkHeight(h);
  commit(before);
});
buttons.forEach(el => el.addEventListener("click", () => changeMode(el.dataset.mode)));
controls.forEach(el => el.addEventListener("change", () => setTransformFromField(el)));
$("master-lock").addEventListener("click", () => {
  if (approvedMaster && !window.confirm("MASTER LOCK을 해제하고 새 수정 버전을 시작하시겠습니까?")) return;
  activeProjectOperation++;
  if (approvedMaster) {
    revision++;
    approvedMaster = false;
  } else {
    masterSnapshots.push(masterSnapshot());
    if (masterSnapshots.length > 40) masterSnapshots.shift();
    approvedMaster = true;
  }
  syncLock();
  renderMasterHistory();
  notify(approvedMaster ? "MASTER VIEW 승인 · 작품, 현장, 카메라 기준 저장" : "MASTER LOCK 해제 · Revision " + revision);
});
$("restore-master-camera").addEventListener("click", () => restoreMasterCamera(masterSnapshots.length - 1));
$("undo").addEventListener("click", undo);
$("redo").addEventListener("click", redo);
["sun-azimuth", "sun-elevation", "sun-strength", "ambient", "exposure", "shadows"]
  .forEach(id => $(id).addEventListener("input", () => {
    $("light-preset").value = "custom";
    updateLight();
  }));
document.querySelectorAll("[data-view]").forEach(el => el.addEventListener("click", () => changeView(el.dataset.view)));
$("focus").addEventListener("click", fitCamera);
$("shot-export").addEventListener("click", exportImage);
$("export-glb").addEventListener("click", exportGLB);
$("export-project").addEventListener("click", exportProjectArchive);
$("import-project").addEventListener("change", e => {
  importProjectArchive(e.target.files[0]);
  e.target.value = "";
});
$("export-json").addEventListener("click", () => download(safeFileName() + ".json",
  new Blob([JSON.stringify(sceneConfig(), null, 2)], { type: "application/json" })));
$("import-json").addEventListener("change", async e => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    if (file.size > 1024 * 1024) throw new Error("1MB 이하의 설정 파일만 지원합니다.");
    const data = JSON.parse(await file.text());
    validateProjectConfig(data);
    if (approvedMaster) throw new Error("MASTER LOCK을 해제한 후 불러오세요.");
    activeProjectOperation++;
    importSceneConfig(data);
    notify("프로젝트 설정을 불러왔습니다. 외부 3D/배치도 파일은 별도 재업로드가 필요할 수 있습니다.");
  } catch (err) { notify("설정 불러오기 실패: " + err.message); }
  e.target.value = "";
});
transform.addEventListener("dragging-changed", e => { orbit.enabled = !e.value; });
transform.addEventListener("mouseDown", () => { lastDrag = editSnapshot(); });
transform.addEventListener("mouseUp", () => {
  if (lastDrag && !approvedMaster && selectedMode === "translate" && $("auto-ground").checked &&
      !extraLight(selectedRoot)) {
    snapRootToSurface(selectedRoot, siteRoot, { allowFallback: !siteSourceFile,
      offset: toFinite($("ground-offset").value, 0, -20, 50) });
  }
  if (lastDrag) commit(lastDrag);
  lastDrag = null;
  updateInspector();
});
transform.addEventListener("objectChange", () => {
  // Keep size proportional by default, including direct gizmo manipulation.
  // The axis with the strongest deviation from the drag's starting scale wins.
  if (!approvedMaster && selectedMode === "scale" && $("uniform-scale").checked && lastDrag) {
    const base = selectedRoot === artRoot ? lastDrag.artwork.s :
      lastDrag.extras.find(x => x.id === selectedRoot.userData.extraId)?.transform.s;
    if (base) {
      const current = selectedRoot.scale.toArray();
      const delta = current.map((v, i) => Math.abs(v / base[i] - 1));
      const axis = delta.indexOf(Math.max(...delta));
      const factor = current[axis] / base[axis];
      selectedRoot.scale.fromArray(base.map(v => v * factor));
    }
  }
  // Artistic geometry is never rebuilt. All transforms are on the root group.
  updateInspector();
  sun.target.position.copy(artRoot.position);
});
renderer.domElement.addEventListener("pointerdown", () => { mouseMoved = false; });
renderer.domElement.addEventListener("pointermove", e => { if (e.buttons) mouseMoved = true; });
renderer.domElement.addEventListener("pointerup", handleSelection);
window.addEventListener("keydown", e => {
  if (e.target instanceof HTMLElement && e.target.closest("input,textarea,select,[contenteditable]")) return;
  if (e.key === "Escape" && placementMode) {
    placementMode = null; $("placement-hint").hidden = true; return;
  }
  if ((e.key === "Delete" || e.key === "Backspace") && !approvedMaster) {
    deleteSelectedExtra(); return;
  }
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
setArtwork(sampleArtwork(), "Sample Artwork", { height: 3 });
updateGround();
syncLock();
snapSetting();
updateLight();
fitCamera();
resize();
animate();
notify("3D Studio 준비 완료 · 작품을 클릭하거나 G/R/S로 조작하세요.");
