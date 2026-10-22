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
import { RGBELoader } from "three/addons/loaders/RGBELoader.js";
import { ART_MATERIALS, validMaterialConfig, validRenderConfig, normalizeRenderConfig,
  targetSize, makeMaterial } from "./rendering.js";
import { STANDARD_VIEWS, createStandardCameras, captureSceneIntegrity,
  masterConsistency, validateBatchManifest } from "./batch.js";
import { initVisualReview } from "./review.js";
import { makeIntegrityManifest, verifyIntegrityManifest } from "./integrity.js";
import { initReadiness } from "./readiness.js";
import { pairMeasurement,sceneInterferences,translateGroupPeers } from "./precision.js";
import { parseLibraryGLB, validLibraryManifest, libraryManifest, libraryMemoryStats,
  MAX_LIBRARY_ASSETS, MAX_LIBRARY_BYTES } from "./assets.js";
import { decodeSiteBundle, inspectImportedSite, validSiteAlignment } from "./site-import.js";
import { makeExtra, extraLight, serializeExtras, validateExtras, restoreExtras, setEditorGizmosVisible } from "./extras.js";
import { snapRootToSurface, surfaceAtPointer, toFinite } from "./placement.js";
import { LAYER_KEYS, SITE_CATEGORIES, defaultLayerState, validateLayerState, importLayerState,
  enumerateSiteMeshes, applyLayerVisibility, normalizeSiteAnnotations, canEditObject,
  layerForObject } from "./layers.js";

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
let sourceSiteInspection = null;
let masterSnapshots = [], sourceDimensions = null;
let selectedMode = "translate";
let selectedRoot = artRoot, placementMode = null, nextExtraId = 1;
const groupChecked=new Set();
let nextGroupId=1,measuredPoints=[],lastCollisionReport=null,lastDistanceReport=null;
let layerState = defaultLayerState(), pendingSiteLayers = null, siteHighlight = null;
const assetLibrary=new Map();
let nextLibraryId=1,activeLibraryOperation=0;
const neutralEnvironment=scene.environment;
let hdrTexture=null,hdrSourceFile=null,activeHDRIOperation=0;
let originalArtMaterials=new Map(),overrideArtMaterials=new Set();
let artworkMaterialState={preset:"original",color:"#d0d6db"};
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
function clearSiteHighlight() {
  if (siteHighlight) {
    scene.remove(siteHighlight);
    siteHighlight.geometry.dispose();
    siteHighlight.material.dispose();
    siteHighlight = null;
  }
}
function siteMeshByPath(path) {
  return enumerateSiteMeshes(siteRoot).find(entry => entry.path === path);
}
function focusSiteMesh(path) {
  if (approvedMaster) return;
  const entry = siteMeshByPath(path);
  if (!entry) return;
  clearSiteHighlight();
  siteHighlight = new THREE.BoxHelper(entry.object, 0xb17823);
  siteHighlight.name = "Editor site selection bounds — not exported";
  scene.add(siteHighlight);
  $("site-selected-name").textContent = "보기 선택: " + entry.name + " · 원본 현장은 편집할 수 없습니다.";
  const bounds = new THREE.Box3().setFromObject(entry.object);
  if (!bounds.isEmpty()) {
    const newTarget = bounds.getCenter(new THREE.Vector3());
    camera.position.add(newTarget.clone().sub(orbit.target));
    orbit.target.copy(newTarget);
    orbit.update();
  }
}
function siteLayerCounts(entries) {
  return entries.reduce((acc, entry) => {
    const category = layerState.siteNodes[entry.path]?.category || "unassigned";
    acc[category]++;return acc;
  },{buildings:0,landscape:0,unassigned:0});
}
function renderSiteLayerRows(entries) {
  const root = $("site-object-list");
  const query = $("site-object-search").value.trim().toLocaleLowerCase("ko-KR");
  const matched = entries.filter(e => e.name.toLocaleLowerCase("ko-KR").includes(query) || e.path.includes(query));
  root.replaceChildren();
  for (const entry of matched.slice(0, 80)) {
    const state = layerState.siteNodes[entry.path] || {category:"unassigned",hidden:false};
    const item = document.createElement("div");
    item.className = "site-mesh-item";
    item.dataset.meshPath = entry.path;
    const focus = document.createElement("button");
    focus.type = "button";focus.className = "site-mesh-focus";
    focus.title = "이 메시의 위치 보기 · 구조 편집 불가";
    focus.textContent = entry.name;
    focus.disabled = approvedMaster; // Approved camera stays locked to master unless user changes view preset.
    focus.addEventListener("click", () => focusSiteMesh(entry.path));
    const select = document.createElement("select");
    select.setAttribute("aria-label",entry.name+" 분류");
    select.dataset.siteMeshCategory = entry.path;
    for(const [key,label] of [["unassigned","미분류"],["buildings","건물"],["landscape","조경"]]){
      const option = document.createElement("option");
      option.value=key;option.textContent=label;select.appendChild(option);
    }
    select.value=state.category;
    select.disabled=approvedMaster;
    const eye = document.createElement("input");
    eye.type="checkbox";eye.checked=!state.hidden;eye.disabled=approvedMaster;
    eye.dataset.siteMeshVisible=entry.path;
    eye.setAttribute("aria-label",entry.name+" 표시");
    item.append(focus,select,eye);
    root.appendChild(item);
  }
  $("site-object-truncated").textContent = matched.length > 80
    ? matched.length+"개 중 80개 표시 · 검색어를 입력하면 원하는 메시를 찾을 수 있습니다."
    : (matched.length ? matched.length+"개 목록 · 분류 후 위 레이어 표시를 조절하세요." : "일치하는 메시 없음");
}
function refreshAssetLibraryUI(){
  const chosen=$("library-asset-select").value;
  const select=$("library-asset-select");
  select.replaceChildren();
  if(!assetLibrary.size)select.add(new Option("등록한 GLB 에셋 없음",""));
  for(const asset of assetLibrary.values())select.add(new Option(
    asset.file.name+" · "+asset.stats.triangles.toLocaleString()+" tris",asset.id));
  if(assetLibrary.has(chosen))select.value=chosen;
  const total=[...assetLibrary.values()].reduce((sum,a)=>sum+a.file.size,0);
  const placed=extrasRoot.children.filter(x=>x.userData.extraKind==="custom-glb");
  const perf=libraryMemoryStats(assetLibrary,placed);
  $("library-status").textContent="등록 "+assetLibrary.size+" / "+MAX_LIBRARY_ASSETS+" · "+
    (total/1048576).toFixed(1)+"MB / 60MB · 장면 내 GLB "+placed.length+
    "개 / 약 "+perf.visibleTriangles.toLocaleString()+" 삼각형"+
    (perf.visibleTriangles>500000?" · 저사양 GPU 주의":"");
  $("library-place").disabled=approvedMaster || !assetLibrary.size ||
    !layerState.groups.planting.visible || layerState.groups.planting.locked ||
    extrasRoot.children.length>=120;
  $("library-asset-file").disabled=approvedMaster || assetLibrary.size>=MAX_LIBRARY_ASSETS;
  $("library-asset-category").disabled=approvedMaster;
}
async function importLibraryGLB(file){
  if(!file || approvedMaster)return;
  if(assetLibrary.size>=MAX_LIBRARY_ASSETS)return notify("에셋은 최대 6개까지 등록할 수 있습니다.");
  const bytes=[...assetLibrary.values()].reduce((sum,a)=>sum+a.file.size,0);
  if(bytes+file.size>MAX_LIBRARY_BYTES)return notify("GLB 합계 60MB 초과입니다.");
  const op=++activeLibraryOperation;activeProjectOperation++;
  const id="lib"+nextLibraryId++;
  try{
    const asset=await parseLibraryGLB(file,id,$("library-asset-category").value);
    if(op!==activeLibraryOperation || approvedMaster)return;
    assetLibrary.set(id,asset);
    refreshAssetLibraryUI();
    $("library-asset-select").value=id;
    notify("에셋 등록 완료 · 원본 크기와 재질 유지: "+file.name);
  }catch(error){console.error(error);notify("에셋 등록 실패: "+error.message);}
}
function ensureAvailableLibrary(assets,library=assetLibrary){
  if(!validLibraryManifest(assets))throw Error("GLB 에셋 목록 형식이 올바르지 않습니다.");
  for(const a of assets){
    const entry=library.get(a.id);
    if(!entry || entry.file.name!==a.name || entry.file.size!==a.byteSize ||
      entry.category!==a.category)throw Error("사용자 GLB 파일을 다시 불러오세요: "+a.name);
  }
}
function renderExtraLayerRows() {
  const list=$("layer-extra-list");
  list.replaceChildren();
  $("extra-layer-count").textContent=extrasRoot.children.length+"개";
  for(const root of extrasRoot.children){
    const item=document.createElement("div");
    item.className="extra-layer-item";item.dataset.extraLayerId=String(root.userData.extraId);
    const label=document.createElement("button");
    label.type="button";label.textContent=root.name;label.title="선택 후 이동·회전·크기 변경";
    const editable=canEditObject(root,artRoot,layerState,approvedMaster);
    label.disabled=!editable;
    label.addEventListener("click",()=>selectRoot(root));
    const eye=document.createElement("input");
    eye.type="checkbox";eye.checked=root.userData.layerHidden!==true;
    eye.disabled=approvedMaster;
    eye.dataset.extraVisible=String(root.userData.extraId);
    eye.setAttribute("aria-label",root.name+" 표시");
    const lock=document.createElement("input");
    lock.type="checkbox";lock.checked=root.userData.layerLocked===true;
    lock.disabled=approvedMaster;
    lock.dataset.extraLock=String(root.userData.extraId);
    lock.setAttribute("aria-label",root.name+" 선택 잠금");
    item.append(label,eye,lock);
    list.appendChild(item);
  }
}
function modelingObjects(){
  return [artRoot,...extrasRoot.children];
}
function renderPrecisionRows(){
  const list=$("precision-group-list"),previous=groupChecked;
  const selectedIds=new Set(extrasRoot.children.map(root=>root.userData.extraId));
  for(const id of previous)if(!selectedIds.has(id))previous.delete(id);
  list.replaceChildren();
  for(const root of extrasRoot.children){
    const label=document.createElement("label");
    const check=document.createElement("input");
    check.type="checkbox";check.dataset.precisionGroupId=String(root.userData.extraId);
    check.checked=previous.has(root.userData.extraId);
    check.disabled=!canEditObject(root,artRoot,layerState,approvedMaster);
    const suffix=root.userData.groupId?" · 그룹 #"+root.userData.groupId:"";
    label.append(check,document.createTextNode(" "+root.name+suffix));
    list.append(label);
  }
}
function refreshPrecisionUI(){
  if(!$("precision-group-list"))return;
  renderPrecisionRows();
  const prevA=$("measure-first").value,prevB=$("measure-second").value;
  const candidates=modelingObjects();
  for(const [id,selected] of [["measure-first",prevA],["measure-second",prevB]]){
    const input=$(id);input.replaceChildren();
    for(const [i,o] of candidates.entries())input.add(new Option(o.name,i===0?"main":String(o.userData.extraId)));
    if([...input.options].some(o=>o.value===selected))input.value=selected;
    else input.selectedIndex=id==="measure-second" && candidates.length>1?1:0;
  }
  $("precision-duplicate").disabled=!selectedCanEdit() || extrasRoot.children.length>=120;
  $("precision-group").disabled=approvedMaster || groupChecked.size<2;
  $("precision-ungroup").disabled=approvedMaster || !selectedRoot?.userData?.groupId;
}
function duplicateEditable(){
  if(!selectedCanEdit() || extrasRoot.children.length>=120)return;
  const original=selectedRoot;
  const kind=original===artRoot?"artwork-copy":original.userData.extraKind;
  const sourceID=original.userData?.assetId||null;
  const before=editSnapshot();
  const root=makeExtra(kind,nextExtraId++,original.userData.appearanceVersion||2,sourceID,assetLibrary,artRoot);
  root.position.copy(original.position).add(new THREE.Vector3(2,0,0));
  root.rotation.copy(original.rotation);
  root.scale.copy(original.scale);
  const currentLight=extraLight(original),nextLight=extraLight(root);
  if(currentLight && nextLight){
    nextLight.intensity=currentLight.intensity;
    nextLight.color.copy(currentLight.color);
  }
  extrasRoot.add(root);
  selectRoot(root);
  commit(before);
  notify("원형을 변경하지 않고 "+root.name+" 복제본을 2m 옆에 배치했습니다.");
}
function createLogicalGroup(){
  if(approvedMaster)return;
  const list=extrasRoot.children.filter(root=>groupChecked.has(root.userData.extraId));
  if(list.length<2 || list.some(root=>!canEditObject(root,artRoot,layerState,approvedMaster)))
    return notify("그룹으로 묶을 편집 가능한 오브제 2개 이상을 선택하세요.");
  const used=new Set(extrasRoot.children.map(x=>x.userData.groupId).filter(Boolean));
  const id=Array.from({length:120},(_,i)=>i+1).find(x=>!used.has(x));
  if(!id)return notify("그룹은 최대 120개까지 가능합니다.");
  const before=editSnapshot();
  for(const root of list)root.userData.groupId=id;
  groupChecked.clear();
  commit(before);
  refreshPrecisionUI();
  notify(list.length+"개 오브제를 그룹 #"+id+"로 연결했습니다. 이동만 함께 적용됩니다.");
}
function ungroupLogical(){
  if(approvedMaster || !selectedRoot?.userData.groupId)return;
  const before=editSnapshot();
  const id=selectedRoot.userData.groupId;
  for(const root of extrasRoot.children)if(root.userData.groupId===id)root.userData.groupId=null;
  commit(before);
  refreshPrecisionUI();
  notify("그룹 #"+id+" 연결을 해제했습니다.");
}
function shiftGroupMembers(selected,delta){
  return translateGroupPeers(extrasRoot,selected,delta,
    other=>canEditObject(other,artRoot,layerState,approvedMaster));
}
function measuredPairs(){
  const referenceKey=$("measure-first").value,targetKey=$("measure-second").value;
  const find=key=>key==="main"?artRoot:extrasRoot.children.find(root=>String(root.userData.extraId)===key);
  const a=find(referenceKey),b=find(targetKey);
  if(!a||!b||a===b)throw Error("서로 다른 두 객체를 지정하세요.");
  const result=pairMeasurement(a,b);
  return {first:a.name,second:b.name,centerDistanceM:result.centerDistance,
    boxGapM:result.minimumBoxGap,boxOverlap:result.overlap};
}
function showPairMeasurement(){
  try{
    lastDistanceReport=measuredPairs();
    const m=lastDistanceReport;
    $("measure-objects-status").textContent="중심 거리 "+m.centerDistanceM.toFixed(3)+
      "m · 외접 박스 간격 "+m.boxGapM.toFixed(3)+"m"+
      (m.boxOverlap?" · 박스 겹침 (예비 간섭)":"");
  }catch(error){$("measure-objects-status").textContent="객체 측정 불가: "+error.message;}
}
function addMeasuredPoint(point){
  if(measuredPoints.length>=2)measuredPoints=[];
  measuredPoints.push(point.toArray());
  if(measuredPoints.length===1){
    $("measure-site-status").textContent="첫 번째 점 X "+
      point.x.toFixed(2)+", Y "+point.y.toFixed(2)+", Z "+point.z.toFixed(2)+
      " · 두 번째 현장 표면을 클릭하세요.";
    return;
  }
  const first=new THREE.Vector3().fromArray(measuredPoints[0]);
  const second=new THREE.Vector3().fromArray(measuredPoints[1]);
  const delta=first.distanceTo(second);
  const planar=Math.hypot(first.x-second.x,first.z-second.z);
  $("measure-site-status").textContent="3D 거리 "+delta.toFixed(3)+"m · 수평 거리 "+
    planar.toFixed(3)+"m · 높이차 "+Math.abs(first.y-second.y).toFixed(3)+"m";
  placementMode=null;$("placement-hint").hidden=true;
}
function checkInterferences(){
  const annotated=siteSourceFile?enumerateSiteMeshes(siteRoot).filter(entry=>
    layerState.siteNodes[entry.path]?.category==="buildings" && entry.object.visible)
    .map(entry=>entry.object):[];
  const output=sceneInterferences(modelingObjects(),annotated);
  lastCollisionReport={
    schema:"axoo-aabb-site-interference-v1",
    checkedAt:new Date().toISOString(),
    inspectedBuildingMeshes:output.checkedBuildings,
    placedObjects:output.checkedActors,
    pairs:output.pairs,
    truncated:output.truncated,
    warning:"AABB는 부피 중첩의 예비 지표이며 삼각형 실제 충돌/이격거리/안전성 인증이 아닙니다. 건물 메시를 직접 분류해야 검사에 포함됩니다."
  };
  const examples=output.pairs.slice(0,4).map(p=>p.first+" ↔ "+p.second).join(" / ");
  $("precision-collision-status").textContent=output.pairs.length
    ? output.pairs.length+"건의 외접 박스 중첩 후보 · "+examples+
       (output.pairs.length>4?" 외 "+(output.pairs.length-4)+"건":"")
    :"검사 범위에서 외접 박스 중첩 없음 · 건물 메시 "+output.checkedBuildings+"개 분류됨";
  if(output.truncated)$("precision-collision-status").textContent+=" · 전체 메시를 검사하지 못했습니다.";
}
function exportPrecisionReport(){
  checkInterferences();
  const data={schema:"axoo-modeling-precision-v1",project:$("project-name").value,
    site:siteFileName,artwork:artFileName,masterLocked:approvedMaster,
    measuredPoints:measuredPoints.length===2?measuredPoints:null,
    measurement:measuredPoints.length===2?(()=>{
      const a=new THREE.Vector3().fromArray(measuredPoints[0]),b=new THREE.Vector3().fromArray(measuredPoints[1]);
      return {distance3DM:a.distanceTo(b),horizontalDistanceM:Math.hypot(a.x-b.x,a.z-b.z),heightDifferenceM:Math.abs(a.y-b.y)};
    })():null,
    objectMeasurement:lastDistanceReport,interference:lastCollisionReport,
    logicalGroups:extrasRoot.children.filter(x=>x.userData.groupId).map(x=>({
      name:x.name,id:x.userData.extraId,groupId:x.userData.groupId
    })),
    warning:"CAD 실측 검증이나 충돌 메시 삼각형 판정이 아닙니다. 실제 현장 도면 및 전문가 검토가 필요합니다."
  };
  download(safeFileName()+"-precision-audit.json",new Blob([JSON.stringify(data,null,2)],{type:"application/json"}));
}
function selectedCanEdit() {
  return canEditObject(selectedRoot,artRoot,layerState,approvedMaster);
}
function refreshLayers({redrawSite = false} = {}) {
  const entries=applyLayerVisibility(layerState,siteRoot,artRoot,extrasRoot);
  const counts=siteLayerCounts(entries);
  $("site-mesh-count").textContent=entries.length+"개";
  for(const key of LAYER_KEYS){
    const checkbox=document.querySelector('[data-layer-visible="'+key+'"]');
    checkbox.checked=layerState.groups[key].visible;
    checkbox.disabled=approvedMaster;
    const lock=document.querySelector('[data-layer-lock="'+key+'"]');
    if(lock){lock.checked=layerState.groups[key].locked;lock.disabled=approvedMaster;}
    const row=document.querySelector('[data-layer-row="'+key+'"]');
    if(row){
      row.classList.toggle("muted",!layerState.groups[key].visible);
      const title=row.querySelector(".layer-group-title");
      const count=counts[key];
      if(title && count!==undefined) title.title=count+"개 메시 (분류는 직접 지정)";
    }
  }
  if(redrawSite) renderSiteLayerRows(entries);
  renderExtraLayerRows();
  refreshPrecisionUI();
  if(!selectedCanEdit()) transform.detach();
  else if(!transform.dragging && transform.object!==selectedRoot) transform.attach(selectedRoot);
  controls.forEach(input=>{input.disabled=!selectedCanEdit();});
  $("delete-selected").disabled=!selectedCanEdit() || selectedRoot===artRoot;
  $("ground-selected").disabled=!selectedCanEdit();
  $("pick-selected-site").disabled=!selectedCanEdit();
  $("apply-height").disabled=!canEditObject(artRoot,artRoot,layerState,approvedMaster);
  $("extra-light-power").disabled=!selectedCanEdit();
  $("extra-light-color").disabled=!selectedCanEdit();
  document.querySelectorAll("[data-add-extra]").forEach(button=>{
    const group=button.dataset.addExtra.includes("light") ? layerState.groups.lighting : layerState.groups.planting;
    button.disabled=approvedMaster || !group.visible || group.locked;
  });
  refreshAssetLibraryUI();
}
function setLayerGroupVisible(key, value) {
  if(approvedMaster || !LAYER_KEYS.includes(key))return;
  const before=editSnapshot();
  layerState.groups[key].visible=value;
  refreshLayers({redrawSite:false});
  updateExtrasStatus();
  commit(before);
}
function setLayerGroupLocked(key,value){
  if(approvedMaster || !["artwork","planting","lighting"].includes(key))return;
  const before=editSnapshot();
  layerState.groups[key].locked=value;
  refreshLayers();
  updateExtrasStatus();
  commit(before);
}
function changeSiteMesh(path, field, value) {
  if(approvedMaster) return;
  if(!siteMeshByPath(path))return;
  const before=editSnapshot();
  const previous=layerState.siteNodes[path] || {category:"unassigned",hidden:false};
  layerState.siteNodes[path]={...previous,[field]:value};
  refreshLayers({redrawSite:field==="category"});
  commit(before);
}
function changeExtraLayer(id,field,value){
  if(approvedMaster)return;
  const extra=extrasRoot.children.find(x=>x.userData.extraId===id);
  if(!extra)return;
  const before=editSnapshot();
  extra.userData[field]=value;
  refreshLayers();
  updateExtrasStatus();
  commit(before);
}
function resetSiteAnnotations({clearPending = true} = {}){
  layerState.siteNodes={};
  if(clearPending) pendingSiteLayers=null;
  clearSiteHighlight();
  refreshLayers({redrawSite:true});
}
function buildSite(preset) {
  activeSiteOperation++;
  siteRoot.scale.setScalar(1);
  siteRoot.rotation.set(0, 0, 0);
  siteRoot.position.set(0,0,0);
  $("site-center-origin").checked = false;
  sourceSiteInspection=null;
  $("site-unit").value = "m";
  $("site-up").value = "y";
  clearGroup(siteRoot);
  siteFileName = "";
  siteSourceFile = null;
  resetSiteAnnotations();
  syncGroundAvailability();
  $("site-filename").textContent = "업로드된 현장 모델 없음";
  showSiteGeometryStats(null);
  updateSitePreflight();
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
  refreshLayers({redrawSite:true});
}
function syncGroundAvailability() {
  const imported = !!siteSourceFile;
  $("fallback-ground").hidden = imported;
  $("site-ground-note").hidden = !imported;
  floor.visible = !imported;
  syncPlanOverlay();
}
function currentSitePreflight() {
  if(!sourceSiteInspection || !siteSourceFile)return null;
  const factor=SITE_UNIT_TO_M[$("site-unit").value]||1;
  const visible=new THREE.Box3().setFromObject(siteRoot);
  const actual=visible.getSize(new THREE.Vector3());
  const center=visible.getCenter(new THREE.Vector3());
  return {
    schema:"axoo-site-import-preflight-v1",
    createdAt:new Date().toISOString(),
    file:siteFileName,
    fileBytes:siteSourceFile.size,
    selectedSourceUnit:$("site-unit").value,
    axis:$("site-up").value,
    viewerCentering:$("site-center-origin").checked,
    source:structuredClone(sourceSiteInspection),
    rendered:{
      dimensionsMeters:actual.toArray().map(n=>Number(n.toFixed(5))),
      centerMeters:center.toArray().map(n=>Number(n.toFixed(5))),
      appliedUnitScale:factor
    },
    warnings:[
      ...sourceSiteInspection.warnings,
      ...(!Number.isFinite(actual.y)||actual.y<.05?["모델 높이가 5cm 미만입니다. 단위·축·바닥을 확인하세요."]:[]),
      ...(sourceSiteInspection.triangles>1000000?["백만 삼각형 이상: 그림자·일괄 렌더 전에 외부에서 폴리곤 경량화 권장."]:[])
    ],
    verification:"메시와 좌표 검사 결과이며 실측 도면·건축 정보나 안전 승인을 대체하지 않습니다."
  };
}
function updateSitePreflight() {
  const result=currentSitePreflight();
  $("site-preflight-export").disabled=!result;
  if(!result){
    $("site-preflight-summary").textContent=
      "실제 현장 모델을 가져오면 크기·폴리곤·원점 위치를 점검합니다.";
    return;
  }
  const dim=result.rendered.dimensionsMeters.map(x=>x.toFixed(2)).join(" × ");
  $("site-preflight-summary").textContent=
    "현장 메시 "+result.source.meshCount+"개 · 삼각형 "+result.source.triangles.toLocaleString()+
    "개 · 고유 재질 "+result.source.materialCount+"개\n"+
    "뷰어 크기 "+dim+" m (W×H×D)\n"+
    (result.warnings.length?"주의: "+result.warnings.join(" / "):
      "자동 기하 검사에 주의사항 없음 · 실측 자료로 크기를 확인하세요.");
}
function exportSitePreflight(){
  const data=currentSitePreflight();
  if(!data)return notify("실제 현장 모델부터 불러오세요.");
  download(safeFileName()+"-site-preflight.json",
    new Blob([JSON.stringify(data,null,2)],{type:"application/json"}));
}
function applySiteUnits() {
  if (approvedMaster) return;
  const factor = SITE_UNIT_TO_M[$("site-unit").value] || 1;
  siteRoot.scale.setScalar(factor);
  siteRoot.rotation.set($("site-up").value === "z" ? -Math.PI / 2 : 0, 0, 0);
  siteRoot.position.set(0,0,0);
  siteRoot.updateMatrixWorld(true);
  // View-only centering maintains original geometry/vertex positions and
  // is recomputed from raw coordinates on every unit/up change (no drift).
  if (siteSourceFile && $("site-center-origin").checked) {
    const center=new THREE.Box3().setFromObject(siteRoot).getCenter(new THREE.Vector3());
    if (center.toArray().every(Number.isFinite))siteRoot.position.sub(center);
    siteRoot.updateMatrixWorld(true);
  }
  if (siteSourceFile) showSiteGeometryStats(inspectSiteGeometry(siteRoot));
  updateSitePreflight();
}
function currentRenderConfig(){
  return {
    aspect:$("render-aspect").value,environmentMode:$("env-mode").value,
    environmentFile:hdrSourceFile?.name || "",envIntensity:Number($("env-strength").value),
    focalLength:Number(camera.getFocalLength().toFixed(3)),multiplier:Number($("render-resolution").value),
    artworkMaterial:structuredClone(artworkMaterialState)
  };
}
function applyEnvironment(){
  const mode=$("env-mode").value,strength=safeNumber($("env-strength").value,1,0,3);
  scene.environment=mode==="hdr" && hdrTexture ? hdrTexture : neutralEnvironment;
  scene.environmentIntensity=strength*(mode==="bright"?1.35:mode==="overcast"?.65:1);
  $("env-strength-value").textContent=strength.toFixed(1);
  $("env-filename").textContent=hdrSourceFile
    ?"HDRI: "+hdrSourceFile.name+(mode==="hdr"?" · 반사 적용":" · 파일 보관 중")
    :"HDRI 미설정 · .HDR를 업로드하면 ZIP에 포함됩니다.";
}
async function decodeHDR(file){
  if(!file || !/\.hdr$/i.test(file.name) || file.size>20*1024*1024)
    throw Error("20MB 이하 Radiance .HDR만 지원합니다.");
  const url=URL.createObjectURL(file);
  try{
    const texture=await new RGBELoader().loadAsync(url);
    texture.mapping=THREE.EquirectangularReflectionMapping;
    return texture;
  }finally{URL.revokeObjectURL(url);}
}
async function loadHDR(file){
  if(!file)return;
  const op=++activeHDRIOperation;
  try{
    const texture=await decodeHDR(file);
    if(op!==activeHDRIOperation){texture.dispose();return;}
    const old=hdrTexture;
    hdrTexture=texture;hdrSourceFile=file;
    $("env-mode").value="hdr";
    applyEnvironment();
    if(old)old.dispose();
    notify("HDRI 환경 반사가 적용됐습니다. 원본 작품·현장 모델은 변경되지 않습니다.");
  }catch(error){console.error(error);notify("HDRI 불러오기 실패: "+error.message);}
}
function clearHDR(){
  activeHDRIOperation++;
  if(hdrTexture)hdrTexture.dispose();
  hdrTexture=null;hdrSourceFile=null;
  if($("env-mode").value==="hdr")$("env-mode").value="neutral";
  applyEnvironment();
}
function restoreOriginalArtworkMaterials(){
  for(const [mesh,original] of originalArtMaterials)mesh.material=original;
  for(const material of overrideArtMaterials)material.dispose();
  originalArtMaterials.clear();overrideArtMaterials.clear();
}
// Map each source artwork mesh to the same material on its editable copies.
// This restores consistent appearance after ZIP/Undo without rewriting geometry.
function syncArtworkCopyMaterials(){
  const source=[];
  artRoot.traverse(obj=>{if(obj.isMesh)source.push(obj);});
  for(const clone of extrasRoot.children.filter(x=>x.userData.extraKind==="artwork-copy")){
    const copies=[];
    clone.traverse(obj=>{if(obj.isMesh)copies.push(obj);});
    if(copies.length!==source.length)continue;
    copies.forEach((obj,i)=>{obj.material=source[i].material;});
  }
}
function setArtworkMaterial(config,{recordUndo=false}={}){
  if(approvedMaster)return false;
  if(!validMaterialConfig(config))throw Error("지원하지 않는 재질 설정");
  const before=recordUndo?editSnapshot():null;
  restoreOriginalArtworkMaterials();
  artworkMaterialState=structuredClone(config);
  if(config.preset!=="original")artRoot.traverse(mesh=>{
    if(!mesh.isMesh)return;
    originalArtMaterials.set(mesh,mesh.material);
    const existing=Array.isArray(mesh.material)?mesh.material:[mesh.material];
    const applied=existing.map(()=>makeMaterial(config.preset,config.color));
    applied.forEach(material=>overrideArtMaterials.add(material));
    mesh.material=Array.isArray(mesh.material)?applied:applied[0];
  });
  $("art-material").value=config.preset;
  $("art-material-color").value=config.color;
  $("material-status").textContent=config.preset==="original"
    ?"원본 작품 재질·텍스처 유지 중"
    :ART_MATERIALS[config.preset].label+" 렌더용 적용 · 원본 파일 보존";
  syncArtworkCopyMaterials();
  if(before)commit(before);
  return true;
}
function updateRenderSizeLabel(){
  const size=targetSize(viewport.clientWidth,viewport.clientHeight,$("render-aspect").value,
    Number($("render-resolution").value),renderer.capabilities.maxTextureSize);
  $("render-size-label").textContent="PNG 예상 "+size.width+" × "+size.height+" px"+(size.limited?" · GPU 안전 제한 적용":"");
}
function restoreRenderConfig(raw){
  const config=normalizeRenderConfig(raw);
  $("render-aspect").value=config.aspect;
  $("render-resolution").value=String(config.multiplier);
  $("camera-focal").value=String(Math.round(config.focalLength));
  camera.setFocalLength(config.focalLength);
  camera.updateProjectionMatrix();
  $("camera-focal-value").textContent=Math.round(camera.getFocalLength())+" mm";
  $("env-strength").value=String(config.envIntensity);
  $("env-mode").value=config.environmentMode==="hdr"&&!hdrTexture?"neutral":config.environmentMode;
  applyEnvironment();
  setArtworkMaterial(config.artworkMaterial);
  updateRenderSizeLabel();
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
  restoreOriginalArtworkMaterials();
  artworkMaterialState={preset:"original",color:"#d0d6db"};
  $("art-material").value="original";
  $("art-material-color").value="#d0d6db";
  $("material-status").textContent="원본 작품 재질·텍스처 유지 중";
  // The old base artwork may be replaced only after the user deletes its
  // clones; ZIP restore replaces everything from a validated package.
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
    material:structuredClone(artworkMaterialState),
    layers:structuredClone(layerState),
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
  restoreExtras(extrasRoot, state.extras,assetLibrary,artRoot);
  setArtworkMaterial(state.material || {preset:"original",color:"#d0d6db"});
  if(state.layers) layerState=importLayerState(state.layers);
  refreshLayers({redrawSite:true});
  nextExtraId = Math.max(1, ...state.extras.map(x => x.id + 1));
  groupChecked.clear();refreshPrecisionUI();
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
    extras: serializeExtras(extrasRoot),
    library:libraryManifest(assetLibrary),
    layers:structuredClone(layerState),
    material:structuredClone(artworkMaterialState),
    render:currentRenderConfig(),
    planAlignment: planAlignmentSnapshot()
  };
}
function validMasterSnapshot(entry) {
  return entry && Number.isInteger(entry.revision) && entry.revision >= 1 &&
    typeof entry.approvedAt === "string" && !Number.isNaN(Date.parse(entry.approvedAt)) &&
    typeof entry.artworkFile === "string" && typeof entry.siteFile === "string" &&
    validTransform(entry.artworkTransform) &&
    entry.camera && isTriple(entry.camera.position) && isTriple(entry.camera.target) &&
    entry.lighting && typeof entry.lighting === "object" &&
    (entry.extras === undefined || validateExtras(entry.extras)) &&
    (entry.library === undefined || validLibraryManifest(entry.library)) &&
    (entry.layers === undefined || validateLayerState(entry.layers)) &&
    (entry.material === undefined || validMaterialConfig(entry.material)) &&
    (entry.render === undefined || validRenderConfig(entry.render));
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
  if(saved.render){
    $("render-aspect").value=saved.render.aspect;
    $("render-resolution").value=String(saved.render.multiplier);
    $("env-strength").value=String(saved.render.envIntensity);
    $("env-mode").value=saved.render.environmentMode==="hdr" &&
      hdrSourceFile?.name!==saved.render.environmentFile
      ? "neutral" : saved.render.environmentMode;
    applyEnvironment();
    updateRenderSizeLabel();
  }
  $("camera-focal").value=String(Math.round(camera.getFocalLength()));
  $("camera-focal-value").textContent=Math.round(camera.getFocalLength())+" mm";
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
  else if (selectedRoot && selectedCanEdit()) transform.attach(selectedRoot);
  ["library-place","library-asset-file","library-asset-category",
    "site-center-origin", "site-unit", "site-up", "delete-selected", "extra-light-power", "extra-light-color",
    "auto-ground", "ground-selected", "pick-selected-site", "ground-offset",
    "plan-pick-center", "plan-visible", "map-file", "map-width", "plan-x", "plan-z",
    "plan-rotation", "plan-elevation", "plan-opacity"]
    .forEach(id => { $(id).disabled = approvedMaster; });
  document.querySelectorAll("[data-add-extra]").forEach(btn => { btn.disabled = approvedMaster; });
  ["art-material","art-material-color","apply-material","reset-material"].forEach(id=>{$(id).disabled=approvedMaster;});
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
  syncBatchAvailability();
  refreshLayers({redrawSite:true});
  updateUndoButtons();
}
function updateInspector(force = false) {
  const state = snapshot(selectedRoot);
  const values = { position: state.p, rotation: state.r.map(v => THREE.MathUtils.radToDeg(v)), scale: state.s };
  controls.forEach(el => {
    el.disabled=!selectedCanEdit();
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
  $("delete-selected").disabled = !selectedCanEdit() || selectedRoot === artRoot;
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
  updateRenderSizeLabel();
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
    button.disabled = !object || !canEditObject(object,artRoot,layerState,approvedMaster);
  }
  $("delete-selected").disabled = !selectedCanEdit() || selectedRoot === artRoot;
  refreshPrecisionUI();
}
function selectRoot(object) {
  selectedRoot = object || artRoot;
  if (selectedCanEdit()) transform.attach(selectedRoot);
  else transform.detach();
  updateInspector(true);
  updateExtrasStatus();
  refreshLayers();
}
function setPlacement(kind) {
  const group=kind.includes("light")?layerState.groups.lighting:layerState.groups.planting;
  if (approvedMaster || group.locked || !group.visible) return notify("잠긴 레이어나 숨겨진 레이어에는 오브제를 추가할 수 없습니다.");
  placementMode = kind;
  $("placement-hint").hidden = false;
  $("placement-hint").textContent = kind.includes("light")
    ? "현장 바닥을 클릭하여 조명 위치 지정 · 배치 후 이동(G)으로 높이 조절 · Esc 취소"
    : "현장 바닥을 클릭해 식재 배치 · 위치(G)·크기(S) 조절 · Esc 취소";
  notify("현장 위치를 클릭하여 추가하세요.");
}
function createPlacedExtra(kind, position) {
  const group=kind.includes("light")?layerState.groups.lighting:layerState.groups.planting;
  if (approvedMaster || group.locked || !group.visible || extrasRoot.children.length >= 120) return null;
  const before = editSnapshot();
  const assetId=kind==="custom-glb"?$("library-asset-select").value:null;
  if(kind==="custom-glb" && !assetLibrary.has(assetId))return notify("에셋을 선택하세요.");
  const root = makeExtra(kind, nextExtraId++,2,assetId,assetLibrary,artRoot);
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
  if (!selectedCanEdit() || selectedRoot === artRoot || !selectedRoot.parent) return;
  const before = editSnapshot();
  selectedRoot.parent.remove(selectedRoot);
  selectRoot(artRoot);
  commit(before);
  notify("선택한 오브제를 삭제했습니다. Ctrl+Z로 복원할 수 있습니다.");
}
function groundSelected({ silent = false } = {}) {
  if (!selectedCanEdit()) return null;
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
  if (!selectedCanEdit() || !hit) return;
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
  if (!siteSourceFile) {
    // Preserve the original v0.4 picking behavior for schematic demonstration
    // sites (buildings / trees / placeholder ground may be arbitrary meshes).
    const rect = viewport.getBoundingClientRect();
    mouse.x = (event.clientX - rect.left) / rect.width * 2 - 1;
    mouse.y = -(event.clientY - rect.top) / rect.height * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const hits = raycaster.intersectObjects(siteRoot.children, true);
    const groundHits = raycaster.intersectObject(floor);
    const hit = hits[0] || groundHits[0];
    if (hit) return { point: hit.point.clone(), mesh: hit.object, source: "preset" };
  }
  // Real imported sites require a verified, upward-facing 3D mesh triangle;
  // avoid manufacturing a ground surface when only a facade/sky is clicked.
  return surfaceAtPointer(event, camera, viewport, siteRoot, !siteSourceFile);
}
function handleSelection(event) {
  if (mouseMoved || approvedMaster || transform.dragging || event.button !== 0) return;
  if (placementMode) {
    const hit = pickPlacement(event);
    if (!hit) { notify("해당 지점에서 위쪽 표면을 찾을 수 없습니다. 현장 메시와 각도를 확인하세요."); return; }
    const kind = placementMode;
    if(kind!=="measure-point"){
      placementMode=null;
      $("placement-hint").hidden=true;
    }
    if (kind === "measure-point") {
      addMeasuredPoint(hit.point);
    } else if (kind === "plan-center") {
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
  const first = allHits.find(hit=>{
    let obj=hit.object;
    while(obj.parent && obj.parent!==extrasRoot && obj.parent!==artRoot) obj=obj.parent;
    const root=obj.parent===extrasRoot ? obj : artRoot;
    return canEditObject(root,artRoot,layerState,false);
  });
  if (!first) return;
  let candidate = first.object;
  while (candidate.parent && candidate.parent !== extrasRoot && candidate.parent !== artRoot) candidate = candidate.parent;
  if (candidate.parent === extrasRoot) selectRoot(candidate);
  else selectRoot(artRoot);
}
function setTransformFromField(el) {
  if (!selectedCanEdit()) return;
  const current = selectedRoot[el.dataset.transform][el.dataset.axis];
  const raw = safeNumber(el.value, NaN);
  if (!Number.isFinite(raw)) return updateInspector();
  if (el.dataset.transform === "scale" && (raw < .01 || raw > 1000)) return updateInspector();
  const next = el.dataset.transform === "rotation" ? THREE.MathUtils.degToRad(raw) : raw;
  if (Math.abs(current - next) < 1e-8) return;
  const before = editSnapshot();
  const oldPosition=selectedRoot.position.clone();
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
  if(el.dataset.transform==="position" && selectedRoot!==artRoot)
    shiftGroupMembers(selectedRoot,selectedRoot.position.clone().sub(oldPosition));
  commit(before);
  updateInspector();
}
const SITE_MODEL_FORMATS = Object.freeze(["glb", "gltf", "obj", "fbx", "stl", "ply", "dae", "3ds", "zip"]);
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
      ? "현장 모델은 GLB, GLTF, OBJ, FBX, STL, PLY, DAE, 3DS 또는 glTF 번들 ZIP을 사용하세요. SKP/IFC/RVT/DWG는 GLB 변환이 필요합니다."
      : "작품 모델은 GLB, GLTF, OBJ, STL 형식만 지원합니다.");
  }
  if (isSite && ext === "zip")return (await decodeSiteBundle(file)).model;
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
    if(!isSite && extrasRoot.children.some(o=>o.userData.extraKind==="artwork-copy"))
      throw Error("작품 복제본이 남아 있습니다. 복제본을 삭제한 뒤 원본 작품을 교체하세요.");
    const siteStats = isSite ? inspectSiteGeometry(model) : null;
    const inspected = isSite ? inspectImportedSite(model) : null;
    if (approvedMaster || op !== (isSite ? activeSiteOperation : activeArtOperation)) return;
    if (isSite) {
      clearGroup(siteRoot);
      siteRoot.add(model);
      siteRoot.position.set(0,0,0);
      $("site-center-origin").checked=false;
      sourceSiteInspection=inspected;
      siteFileName = file.name;
      siteSourceFile = file;
      $("site-filename").textContent = file.name;
      $("site-status").textContent = "실제 모델";
      $("site-preset").value = "empty";
      $("site-unit").value = "m"; $("site-up").value = "y";
      applySiteUnits(); syncGroundAvailability();
      setShadows(siteRoot);
      resetSiteAnnotations({clearPending:false});
      if(pendingSiteLayers && pendingSiteLayers.file === file.name){
        layerState.siteNodes=structuredClone(pendingSiteLayers.nodes);
        pendingSiteLayers=null;refreshLayers({redrawSite:true});
      } else {
        pendingSiteLayers=null;
      }
      showSiteGeometryStats(inspectSiteGeometry(siteRoot));
      updateSitePreflight();
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
function planAlignmentSnapshot() {
  return {
    visible: $("plan-visible").checked,
    x: +$("plan-x").value,
    z: +$("plan-z").value,
    rotation: +$("plan-rotation").value,
    elevation: +$("plan-elevation").value,
    opacity: +$("plan-opacity").value
  };
}
function validPlanAlignment(value) {
  return value && typeof value.visible === "boolean" &&
    ["x","z","rotation","elevation","opacity"].every(field =>
      typeof value[field] === "number" && Number.isFinite(value[field])) &&
    value.opacity >= 10 && value.opacity <= 100 &&
    Math.abs(value.x) <= 10000 && Math.abs(value.z) <= 10000 &&
    value.elevation >= -50 && value.elevation <= 1000 &&
    Math.abs(value.rotation) <= 36000;
}
function restorePlanAlignment(value) {
  const plan = validPlanAlignment(value) ? value :
    {visible:true, x:0, z:0, rotation:0, elevation:.05, opacity:55};
  $("plan-visible").checked = plan.visible;
  for (const id of ["x","z","rotation","elevation","opacity"]) {
    $("plan-"+id).value = String(plan[id]);
  }
  syncPlanOverlay();
}
function sceneConfig() {
  return {
    schema: "axoo-public-art-3d-studio-v1",
    projectName: $("project-name").value,
    library:libraryManifest(assetLibrary),
    createdAt: new Date().toISOString(),
    site: { file: siteFileName, preset: $("site-preset").value, floor: $("floor-map").value,
      unit: $("site-unit").value, up: $("site-up").value,
      alignment:{centerOrigin:$("site-center-origin").checked},
      planFile: planFileName, planWidth: +$("map-width").value,
      planAlignment: planAlignmentSnapshot() },
    groundPlacement: { auto: $("auto-ground").checked, offset: +$("ground-offset").value },
    extras: serializeExtras(extrasRoot),
    layers:structuredClone(layerState),
    navSpeed: +$("nav-speed").value,
    lightPreset: $("light-preset").value,
    artwork: { source: artFileName, transform: snapshot(), locked: approvedMaster, revision, uniformScale: $("uniform-scale").checked },
    render:currentRenderConfig(),
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
      (data.library !== undefined && !validLibraryManifest(data.library)) ||
      (data.extras || []).some(x=>x.kind==="custom-glb" &&
        !(data.library || []).some(a=>a.id===x.assetId)) ||
      (data.layers !== undefined && !validateLayerState(data.layers)) ||
      (data.render !== undefined && !validRenderConfig(data.render)) ||
      (data.site.unit !== undefined && !Object.hasOwn(SITE_UNIT_TO_M,data.site.unit)) ||
      (data.site.up !== undefined && !["y","z"].includes(data.site.up)) ||
      (data.site.alignment !== undefined && !validSiteAlignment(data.site.alignment)) ||
      (data.site.planAlignment !== undefined && !validPlanAlignment(data.site.planAlignment)) ||
      (data.groundPlacement !== undefined &&
        (!data.groundPlacement || typeof data.groundPlacement.auto !== "boolean" ||
          typeof data.groundPlacement.offset !== "number" ||
          !Number.isFinite(data.groundPlacement.offset) ||
          data.groundPlacement.offset < -20 || data.groundPlacement.offset > 50)) ||
      (data.masterSnapshots !== undefined &&
        (!Array.isArray(data.masterSnapshots) || data.masterSnapshots.length > 40 ||
          !data.masterSnapshots.every(validMasterSnapshot)))) {
    throw new Error("올바른 스튜디오 프로젝트 파일이 아닙니다.");
  }
}
function importSceneConfig(data) {
  if (approvedMaster) throw new Error("MASTER LOCK을 해제한 후 프로젝트를 불러오세요.");
  validateProjectConfig(data);
  ensureAvailableLibrary(data.library||[]);
  // A settings-only import may refer to already loaded GLB sources. Remove
  // unrelated sources to avoid silently importing assets from another project.
  const used=new Set((data.library||[]).map(a=>a.id));
  for(const id of [...assetLibrary.keys()])if(!used.has(id))assetLibrary.delete(id);
  nextLibraryId=Math.max(1,...[...assetLibrary.keys()].map(id=>Number(id.slice(3))+1));
  refreshAssetLibraryUI();
  const originalSite = siteFileName;
  const originalArt = artFileName;
  if((data.extras||[]).some(x=>x.kind==="artwork-copy") &&
    data.artwork.source!==artFileName)
    throw Error("복제 작품 복원에는 원본 작품 파일이 먼저 필요합니다. 전체 프로젝트 ZIP을 사용하세요.");
  if(!data.render?.environmentFile ||
      data.render.environmentFile!==hdrSourceFile?.name)clearHDR();
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
  $("site-center-origin").checked=!!data.site.alignment?.centerOrigin;
  applySiteUnits();
  syncGroundAvailability();
  if (["concrete", "pavers", "grass", "asphalt", "white"].includes(data.site.floor)) {
    $("floor-map").value = data.site.floor; updateGround();
  }
  $("map-width").value = safeNumber(data.site.planWidth, 40, 1, 1000);
  restorePlanAlignment(data.site.planAlignment);
  $("auto-ground").checked = !!data.groundPlacement?.auto;
  $("ground-offset").value = toFinite(data.groundPlacement?.offset, 0, -20, 50);
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
  restoreExtras(extrasRoot, data.extras || [],assetLibrary,artRoot);
  refreshAssetLibraryUI();
  layerState=importLayerState(data.layers);
  if(data.site.file && data.site.file!==siteFileName){
    pendingSiteLayers={file:data.site.file,nodes:structuredClone(layerState.siteNodes)};
    layerState.siteNodes={};
  }else{
    normalizeSiteAnnotations(layerState,siteRoot);
  }
  refreshLayers({redrawSite:true});
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
  // Apply render settings while the scene is temporarily unlocked so only
  // the user-authored material override is restored; original assets survive.
  const originalApproval=approvedMaster;
  approvedMaster=false;
  restoreRenderConfig(data.render);
  approvedMaster=originalApproval;
  if(data.render?.environmentMode==="hdr" && !hdrTexture){
    $("env-filename").textContent="재업로드 필요: "+data.render.environmentFile;
  }
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
    if (hdrSourceFile) zip.file("assets/environment", hdrSourceFile);
    for(const asset of assetLibrary.values())zip.file("assets/library/"+asset.id+".glb",asset.file);
    $("save-status").textContent = "SHA-256 원본 검증 정보 생성 중…";
    const integrity=await makeIntegrityManifest(zip);
    zip.file("integrity.json",JSON.stringify(integrity,null,2));
    $("save-status").textContent = "검증 가능한 프로젝트 패키지 저장 중…";
    const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 2 } });
    if(blob.size>MAX_ZIP_BYTES)
      throw Error("ZIP 200MB 복원 한도를 초과했습니다. 현장·작품·에셋 파일을 경량화하세요.");
    download(safeFileName() + "-project.zip", blob);
    notify("프로젝트 ZIP 저장 완료 · 원본과 SHA-256 손상 검증 정보 포함");
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
  let planTexture = null, preparedHDR=null, recoveredHDRFile=null;
  try {
    const zip = await JSZip.loadAsync(file);
    if (Object.keys(zip.files).length > 26) throw new Error("허용되지 않는 파일이 너무 많습니다.");
    const integrityResult=await verifyIntegrityManifest(zip);
    $("save-status").textContent=integrityResult.verified
      ? "ZIP 모든 파일 SHA-256 검사 통과"
      : "구형 ZIP · 무결성 정보가 없어 호환 모드로 읽습니다.";
    const metaEntry = checkedArchiveEntry(zip, "project.json", 1024 * 1024, true);
    const metadata = await metaEntry.async("string");
    if (metadata.length > 1024 * 1024) throw new Error("프로젝트 설정 정보가 너무 큽니다.");
    const data = JSON.parse(metadata);
    validateProjectConfig(data);
    const loadedLibrary=new Map();
    for(const entry of data.library||[]){
      const bin=checkedArchiveEntry(zip,"assets/library/"+entry.id+".glb",20*1024*1024,true);
      const file=await recoverArchiveAsset(bin,entry.name,20*1024*1024,"model/gltf-binary");
      if(file.size!==entry.byteSize)throw Error("사용자 GLB 파일 크기가 일치하지 않습니다: "+entry.name);
      loadedLibrary.set(entry.id,await parseLibraryGLB(file,entry.id,entry.category));
    }
    ensureAvailableLibrary(data.library||[],loadedLibrary);
    const actualGlbSources=Object.keys(zip.files).filter(name=>
      /^assets\/library\/lib[1-9]\d{0,4}\.glb$/.test(name)).sort();
    const declaredGlbSources=(data.library||[]).map(a=>"assets/library/"+a.id+".glb").sort();
    if(JSON.stringify(actualGlbSources)!==JSON.stringify(declaredGlbSources))
      throw Error("프로젝트 설정과 ZIP 내 GLB 에셋 목록이 일치하지 않습니다.");
    if (data.archiveSchema !== PROJECT_ARCHIVE_SCHEMA) throw new Error("지원하지 않는 프로젝트 패키지 버전입니다.");
    // Decode and validate EVERYTHING before changing the current scene.
    const siteEntry = checkedArchiveEntry(zip, "assets/site", MAX_MODEL_BYTES, !!data.site.file);
    const artEntry = checkedArchiveEntry(zip, "assets/artwork", MAX_MODEL_BYTES, data.artwork.source !== "Sample Artwork");
    const planEntry = checkedArchiveEntry(zip, "assets/plan", MAX_MAP_BYTES, !!data.site.planFile);
    const hdrEntry = checkedArchiveEntry(zip,"assets/environment",MAX_MAP_BYTES,!!data.render?.environmentFile);
    const siteFile = await recoverArchiveAsset(siteEntry, data.site.file, MAX_MODEL_BYTES);
    const artFile = await recoverArchiveAsset(artEntry, data.artwork.source, MAX_MODEL_BYTES);
    const planName = String(data.site.planFile || "");
    const planType = /\.png$/i.test(planName) ? "image/png" :
      /\.webp$/i.test(planName) ? "image/webp" : "image/jpeg";
    const planFile = await recoverArchiveAsset(planEntry, planName, MAX_MAP_BYTES, planType);
    recoveredHDRFile=await recoverArchiveAsset(hdrEntry,data.render?.environmentFile || "",MAX_MAP_BYTES,"image/vnd.radiance");
    const [siteModel, artModel] = await Promise.all([
      siteFile ? decodeModel(siteFile, true) : Promise.resolve(null),
      artFile ? decodeModel(artFile, false) : Promise.resolve(null)
    ]);
    const siteStats = siteModel ? inspectSiteGeometry(siteModel) : null;
    const siteInspected=siteModel ? inspectImportedSite(siteModel) : null;
    if (artModel) {
      const preparedBounds = new THREE.Box3().setFromObject(artModel);
      if (preparedBounds.isEmpty() || preparedBounds.getSize(new THREE.Vector3()).y <= 0.000001) {
        throw new Error("ZIP 내부 작품 모델의 형상 또는 높이가 유효하지 않습니다.");
      }
    }
    if (planFile) planTexture = await decodePlanTexture(planFile);
    if(recoveredHDRFile) preparedHDR=await decodeHDR(recoveredHDRFile);
    if (approvedMaster || op !== activeProjectOperation) {
      if (planTexture) planTexture.dispose();
      if(preparedHDR)preparedHDR.dispose();
      return notify("작업 상태가 변경되어 이전 파일 로딩을 취소했습니다.");
    }
    // Commit an already validated package. No user's original file is uploaded.
    activeLibraryOperation++;
    assetLibrary.clear();
    for(const [key,value] of loadedLibrary)assetLibrary.set(key,value);
    nextLibraryId=Math.max(1,...[...assetLibrary.keys()].map(id=>Number(id.slice(3))+1));
    refreshAssetLibraryUI();
    activeSiteOperation++; activeArtOperation++; activePlanOperation++;
    if (siteModel) {
      clearGroup(siteRoot);
      siteRoot.add(siteModel);
      siteRoot.position.set(0,0,0);
      sourceSiteInspection=siteInspected;
      siteFileName = siteFile.name;
      siteSourceFile = siteFile;
      $("site-status").textContent = "실제 모델";
      $("site-filename").textContent = siteFile.name;
      $("site-preset").value = "empty";
      $("site-unit").value = "m"; $("site-up").value = "y";
      applySiteUnits(); syncGroundAvailability();
      showSiteGeometryStats(inspectSiteGeometry(siteRoot));
      setShadows(siteRoot);
      resetSiteAnnotations();
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
    // Cancel an older asynchronous upload before switching archived lighting.
    activeHDRIOperation++;
    if(hdrTexture)hdrTexture.dispose();
    hdrTexture=preparedHDR;hdrSourceFile=recoveredHDRFile;
    preparedHDR=null;
    importSceneConfig(data);
    pendingArtwork = null;
    notify(integrityResult.verified
      ? "프로젝트 파일 SHA-256 검증 통과 · 원본 모델과 MASTER 이력 복원 완료"
      : "구형 프로젝트 복원 완료 · 무결성 검사 정보는 없습니다.");
  } catch (err) {
    if (planTexture) planTexture.dispose();
    if(preparedHDR)preparedHDR.dispose();
    console.error(err);
    notify("전체 프로젝트 불러오기 실패: " + (err.message || "파일 확인 필요"));
  } finally {
    $("save-status").textContent = "브라우저에서 로컬 처리";
  }
}

function masterBatchReady() {
  return approvedMaster && masterSnapshots.length > 0;
}
function syncBatchAvailability(){
  $("export-master-pack").disabled = !masterBatchReady();
  if(!masterBatchReady())$("batch-status").textContent="먼저 MASTER VIEW를 승인하면 일괄 출력할 수 있습니다.";
}
function baselineForMaster(){
  return {
    artworkTransform:snapshot(),
    extras:serializeExtras(extrasRoot),
    library:libraryManifest(assetLibrary),
    layers:structuredClone(layerState),
    material:structuredClone(artworkMaterialState),
    artworkFile:artFileName,siteFile:siteFileName
  };
}
async function createContactSheet(images) {
  const itemW=560,itemH=315,titleH=46,padding=22,columns=2,rows=4;
  const canvas=document.createElement("canvas");
  canvas.width=(itemW+padding)*columns+padding;
  canvas.height=(itemH+titleH+padding)*rows+padding+78;
  const ctx=canvas.getContext("2d");
  if(!ctx)throw Error("컨택트 시트 2D 캔버스를 생성할 수 없습니다.");
  ctx.fillStyle="#14181e";ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.fillStyle="#fff";ctx.font="bold 26px Arial, sans-serif";
  ctx.fillText("AXOO / MASTER 8-VIEW",padding,44);
  ctx.font="14px Arial, sans-serif";ctx.fillStyle="#c4cbd1";
  ctx.fillText("Architectural visualization contact sheet · verify site and artwork placement",padding,66);
  for(let index=0;index<images.length;index++){
    const [name,data]=images[index];
    const column=index%columns,row=Math.floor(index/columns);
    const x=padding+column*(itemW+padding);
    const y=88+padding+row*(itemH+titleH+padding);
    const img=new Image();
    img.src=data;
    await img.decode();
    ctx.fillStyle="#252b33";
    ctx.fillRect(x,y,itemW,itemH);
    ctx.drawImage(img,x,y,itemW,itemH);
    ctx.fillStyle="#f1f4f8";ctx.font="bold 17px Arial, sans-serif";
    ctx.fillText(STANDARD_VIEWS[index].label,x,y+itemH+27);
  }
  return canvas.toDataURL("image/png").split(",")[1];
}
async function exportMasterPack() {
  if(!masterBatchReady())return notify("먼저 MASTER VIEW를 승인해 주세요.");
  const master=masterSnapshots[masterSnapshots.length-1];
  const consistency=masterConsistency(master,baselineForMaster());
  if(!consistency.ok){
    $("batch-status").textContent="검수 실패: "+consistency.issues.join(" / ");
    return notify("MASTER 승인본과 장면이 다릅니다. 수정 이력을 확인하세요.");
  }
  if(master.render?.environmentMode==="hdr" &&
    master.render.environmentFile!==hdrSourceFile?.name){
    $("batch-status").textContent="승인 당시 HDRI 파일이 필요합니다: "+master.render.environmentFile;
    return notify("승인 당시 HDRI 파일을 다시 불러온 후 출력하세요.");
  }
  const artBounds=new THREE.Box3().setFromObject(artRoot);
  if(artBounds.isEmpty() || !Number.isFinite(artBounds.getSize(new THREE.Vector3()).length()))
    return notify("작품 모델이 없어 MASTER 8컷을 생성할 수 없습니다.");
  const cameraMaster=master.camera;
  const viewCamera={
    position:cameraMaster.position,target:cameraMaster.target,
    fov:Number.isFinite(cameraMaster.fov)?cameraMaster.fov:camera.fov
  };
  const views=createStandardCameras(viewCamera,artBounds);
  if(views.length!==8)return notify("렌더 시점 정의가 올바르지 않습니다.");
  const sceneBefore=captureSceneIntegrity({
    artRoot,siteRoot,extrasRoot,artworkMaterialState,layerState
  });
  const pose={
    position:camera.position.toArray(),target:orbit.target.toArray(),
    fov:camera.fov,aspect:camera.aspect,ratio:renderer.getPixelRatio(),
    width:viewport.clientWidth,height:viewport.clientHeight
  };
  const lights=Object.fromEntries(["sun-azimuth","sun-elevation","sun-strength","ambient","exposure"]
    .map(id=>[id,$(id).value]));
  const originalShadows=$("shadows").checked;
  const originalPreset=$("light-preset").value;
  const originalEnvMode=$("env-mode").value;
  const originalEnvStrength=$("env-strength").value;
  const states={
    grid:grid.visible,gizmo:transform.getHelper().visible,
    sun:sunGuide.visible,
    highlight:siteHighlight?.visible
  };
  const editorIcons=[];
  extrasRoot.traverse(node=>{
    if(node.userData.editorOnly)editorIcons.push([node,node.visible]);
  });
  const mult=Number($("batch-quality").value);
  const size=targetSize(pose.width,pose.height,"landscape16x9",mult,
    renderer.capabilities.maxTextureSize,14000000);
  const files=[];
  const zip=new JSZip();
  const manifest={
    schema:"axoo-master-render-pack-v1",
    version:"0.8", createdAt:new Date().toISOString(),
    renderer:"Three.js WebGL PBR (not AI photorealization)",
    project:$("project-name").value,
    master:{revision:master.revision,approvedAt:master.approvedAt,
      site:master.siteFile,artwork:master.artworkFile},
    dimensions:{siteModelImported:!!siteSourceFile,
      artworkMeters:artBounds.getSize(new THREE.Vector3()).toArray().map(n=>Number(n.toFixed(5))),
      artworkWorldPosition:artRoot.position.toArray(),
      artworkWorldScale:artRoot.scale.toArray()},
    artworkMaterial:structuredClone(artworkMaterialState),
    layers:structuredClone(layerState),
    render:{aspect:"16:9",width:size.width,height:size.height,multiplier:mult,
      cappedByGPU:size.limited},
    qa:{approvedMaster:true,unchangedSceneBefore:true,unchangedSceneAfter:false,
      sceneSignaturePreserved:false,sourceGeometryNotAltered:true,
      actualDimensionsSurveyVerified:false,
      warning:"In-memory geometry/transform checks do not verify surveyed drawings, real-world dimensions or photorealism."},
    warnings:[
      ...(!siteSourceFile?["예시 현장입니다. 실제 건축 모델을 불러오지 않았습니다."]:[]),
      ...(artFileName==="Sample Artwork"?["예시 작품입니다. 실제 작가 원본 모델을 사용하지 않았습니다."]:[]),
      "원본 재질·형상·배치 검수는 렌더 결과와 별도로 담당자가 확인해야 합니다.",
      "HDRI 환경 반사·PBR 렌더는 사진 수준 AI 실사화가 아닙니다."
    ],
    views:[]
  };
  let renderError=null;
  $("export-master-pack").disabled=true;
  $("batch-status").textContent="MASTER 8컷 렌더 준비 중…";
  try{
    // Image capture is synchronous so the user's edit state cannot interleave.
    for(const [id,value] of Object.entries(master.lighting || {})){
      if(lights[id]!==undefined && Number.isFinite(value))$(id).value=String(value);
    }
    $("shadows").checked=!!master.shadows;
    if(master.render){
      $("env-mode").value=master.render.environmentMode==="hdr" ? "hdr" :
        master.render.environmentMode;
      $("env-strength").value=String(master.render.envIntensity);
    }
    updateLight();applyEnvironment();
    renderer.setPixelRatio(1);
    renderer.setSize(size.width,size.height,false);
    grid.visible=false;
    transform.getHelper().visible=false;
    sunGuide.visible=false;
    if(siteHighlight)siteHighlight.visible=false;
    for(const [node] of editorIcons)node.visible=false;
    for(let index=0;index<views.length;index++){
      const view=views[index];
      camera.position.fromArray(view.position);
      orbit.target.fromArray(view.target);
      camera.fov=view.fov;
      camera.aspect=size.width/size.height;
      camera.lookAt(orbit.target);
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld(true);
      renderer.render(scene,camera);
      const data=renderer.domElement.toDataURL("image/png");
      if(!data.startsWith("data:image/png;base64,"))throw Error("PNG 생성 실패: "+view.key);
      const file=view.key+".png";
      zip.file(file,data.split(",")[1],{base64:true});
      files.push([file,data]);
      manifest.views.push({...view,filename:file,width:size.width,height:size.height});
    }
  }catch(error){
    renderError=error;
    console.error(error);
  }finally{
    for(const [id,value] of Object.entries(lights))$(id).value=value;
    $("shadows").checked=originalShadows;
    $("light-preset").value=originalPreset;
    $("env-mode").value=originalEnvMode;
    $("env-strength").value=originalEnvStrength;
    updateLight();applyEnvironment();
    camera.position.fromArray(pose.position);
    orbit.target.fromArray(pose.target);
    camera.fov=pose.fov;
    camera.aspect=pose.aspect;
    camera.updateProjectionMatrix();
    orbit.update();
    renderer.setPixelRatio(pose.ratio);
    renderer.setSize(pose.width,pose.height,false);
    grid.visible=states.grid;
    transform.getHelper().visible=states.gizmo;
    sunGuide.visible=states.sun;
    if(siteHighlight)siteHighlight.visible=states.highlight;
    for(const [node,wasVisible] of editorIcons)node.visible=wasVisible;
  }
  if(renderError){
    $("batch-status").textContent="일괄 렌더 실패: "+(renderError.message || "GPU 오류");
    syncBatchAvailability();
    return notify("8컷 렌더 실패 · 기존 장면은 복원됐습니다.");
  }
  const sceneAfter=captureSceneIntegrity({
    artRoot,siteRoot,extrasRoot,artworkMaterialState,layerState
  });
  manifest.qa.unchangedSceneAfter=masterConsistency(master,baselineForMaster()).ok;
  manifest.qa.sceneSignaturePreserved=sceneBefore===sceneAfter;
  if(!manifest.qa.unchangedSceneAfter || !manifest.qa.sceneSignaturePreserved){
    $("batch-status").textContent="검수 차이 발견 · ZIP을 생성하지 않았습니다.";
    syncBatchAvailability();
    return notify("MASTER 배치·재질·현장 상태에 차이가 있어 렌더 패키지를 차단했습니다.");
  }
  try{
    if($("batch-contact").checked){
      const sheet=await createContactSheet(files);
      zip.file("00-contact-sheet.png",sheet,{base64:true});
      manifest.contactSheet="00-contact-sheet.png";
    }
    if(!validateBatchManifest(manifest))throw Error("렌더 촬영 메타데이터가 유효하지 않습니다.");
    zip.file("render-manifest.json",JSON.stringify(manifest,null,2));
    zip.file("REVIEW_NOTES.txt",
      "AXOO MASTER 8-VIEW QA\\n\\n"+[
        "Approved revision: "+master.revision,
        "Approved at: "+master.approvedAt,
        "Source site: "+(master.siteFile||"Example scene"),
        "Source artwork: "+master.artworkFile,
        "Scene geometry/material/placement unchanged: YES",
        "Eight standard viewpoints, 16:9 PNG. Camera restored after capture: YES",
        "IMPORTANT: This is WebGL PBR preview rendering, not photo-realistic generative AI.",
        "VERIFY: actual measured site/art dimensions, installation position, artist-approved materials, composition."
      ].join("\\n"));
    const bytes=await zip.generateAsync({type:"blob",compression:"DEFLATE",compressionOptions:{level:4}});
    download(safeFileName()+"-MASTER-REV"+master.revision+"-8views.zip",bytes);
    $("batch-status").textContent=
      "출력 완료 · 8개 시점 / "+size.width+" × "+size.height+
      " px / MASTER REV "+master.revision+" · 장면 일치 검사 통과";
    notify("승인된 MASTER 8컷 이미지·검수 기록 ZIP 저장 완료");
  }catch(error){
    console.error(error);
    $("batch-status").textContent="렌더 ZIP 생성 실패: "+(error.message||"파일 저장 오류");
    notify("렌더 결과 압축 실패 · 장면은 변경되지 않았습니다.");
  }finally{
    syncBatchAvailability();
  }
}
function exportImage() {
  const w=Math.max(1,Math.round(viewport.clientWidth));
  const h=Math.max(1,Math.round(viewport.clientHeight));
  const originalRatio=renderer.getPixelRatio();
  const originalAspect=camera.aspect;
  const originalGrid=grid.visible;
  const originalHelper=transform.getHelper().visible;
  const originalSun=sunGuide.visible;
  const originalHighlight=siteHighlight?.visible;
  try {
    const size=targetSize(w,h,$("render-aspect").value,
      Number($("render-resolution").value),renderer.capabilities.maxTextureSize);
    renderer.setPixelRatio(1);
    renderer.setSize(size.width,size.height,false);
    camera.aspect=size.width/size.height;
    camera.updateProjectionMatrix();
    grid.visible=false;
    transform.getHelper().visible=false;
    sunGuide.visible=false;
    if(siteHighlight)siteHighlight.visible=false;
    setEditorGizmosVisible(extrasRoot,false);
    renderer.render(scene,camera);
    const png=renderer.domElement.toDataURL("image/png");
    if(!png.startsWith("data:image/png;base64,"))throw Error("PNG 데이터를 만들지 못했습니다.");
    const link=document.createElement("a");
    link.href=png;
    link.download=safeFileName()+"-"+size.width+"x"+size.height+".png";
    document.body.appendChild(link);link.click();link.remove();
    notify("작품·현장 변형 없이 "+size.width+" × "+size.height+" PNG를 저장했습니다."+
      (size.limited?" (GPU 한도에 맞춰 축소)":""));
  }catch(error){
    console.error(error);
    notify("고해상도 렌더 실패: "+(error.message||"GPU 메모리/출력 설정 확인"));
  }finally{
    grid.visible=originalGrid;
    transform.getHelper().visible=originalHelper;
    sunGuide.visible=originalSun;
    if(siteHighlight)siteHighlight.visible=originalHighlight;
    setEditorGizmosVisible(extrasRoot,true);
    camera.aspect=originalAspect;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(originalRatio);
    renderer.setSize(w,h,false);
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
// Delegate changes from dynamically rendered layer rows; site source geometry stays read-only.
$("layer-manager").addEventListener("change", event => {
  const target=event.target;
  if(!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement))return;
  if(approvedMaster) return;
  if(target.dataset.layerVisible) return setLayerGroupVisible(target.dataset.layerVisible,target.checked);
  if(target.dataset.layerLock) return setLayerGroupLocked(target.dataset.layerLock,target.checked);
  if(target.dataset.siteMeshVisible) return changeSiteMesh(target.dataset.siteMeshVisible,"hidden",!target.checked);
  if(target.dataset.siteMeshCategory && SITE_CATEGORIES.includes(target.value)) return changeSiteMesh(target.dataset.siteMeshCategory,"category",target.value);
  if(target.dataset.extraVisible) return changeExtraLayer(Number(target.dataset.extraVisible),"layerHidden",!target.checked);
  if(target.dataset.extraLock) return changeExtraLayer(Number(target.dataset.extraLock),"layerLocked",target.checked);
});
$("site-object-search").addEventListener("input", () => renderSiteLayerRows(enumerateSiteMeshes(siteRoot)));
$("site-center-origin").addEventListener("change",()=>{
  if (approvedMaster)return;
  applySiteUnits();
  notify($("site-center-origin").checked
    ?"현장 그룹만 원점 중심으로 이동했습니다. 작품과 도면의 좌표는 변경되지 않았습니다."
    :"현장 그룹을 원본 좌표로 복원했습니다.");
});
$("site-preflight-export").addEventListener("click",exportSitePreflight);
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
$("env-mode").addEventListener("change", () => {
  if($("env-mode").value==="hdr"&&!hdrTexture){
    $("env-mode").value="neutral";
    return notify("먼저 Radiance .HDR 환경 이미지를 업로드하세요.");
  }
  applyEnvironment();
});
$("env-file").addEventListener("change",e=>{
  loadHDR(e.target.files[0]);
  e.target.value="";
});
$("clear-hdr").addEventListener("click",()=>{
  clearHDR();
  notify("사용자 HDRI 파일이 현재 렌더링 장면에서 해제됐습니다.");
});
$("env-strength").addEventListener("input",applyEnvironment);
$("apply-material").addEventListener("click",()=>{
  if(approvedMaster)return notify("MASTER LOCK 해제 후 작품 재질을 변경하세요.");
  setArtworkMaterial({preset:$("art-material").value,color:$("art-material-color").value},{recordUndo:true});
});
$("reset-material").addEventListener("click",()=>{
  if(approvedMaster)return;
  setArtworkMaterial({preset:"original",color:"#d0d6db"},{recordUndo:true});
});
$("camera-focal").addEventListener("input",e=>{
  camera.setFocalLength(Number(e.target.value));
  camera.updateProjectionMatrix();
  $("camera-focal-value").textContent=Math.round(camera.getFocalLength())+" mm";
});
$("render-aspect").addEventListener("change",updateRenderSizeLabel);
$("render-resolution").addEventListener("change",updateRenderSizeLabel);
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
$("library-asset-file").addEventListener("change",e=>{
  importLibraryGLB(e.target.files[0]);e.target.value="";
});
$("library-place").addEventListener("click",()=>{
  if(!assetLibrary.has($("library-asset-select").value))return notify("에셋을 등록하세요.");
  setPlacement("custom-glb");
});
$("library-asset-select").addEventListener("change",refreshAssetLibraryUI);
$("precision-group-list").addEventListener("change",e=>{
  const id=Number(e.target?.dataset?.precisionGroupId);
  if(!id || approvedMaster)return;
  if(e.target.checked)groupChecked.add(id);else groupChecked.delete(id);
  $("precision-group").disabled=groupChecked.size<2;
});
$("precision-duplicate").addEventListener("click",duplicateEditable);
$("precision-group").addEventListener("click",createLogicalGroup);
$("precision-ungroup").addEventListener("click",ungroupLogical);
$("measure-site-start").addEventListener("click",()=>{
  measuredPoints=[];
  placementMode="measure-point";
  $("placement-hint").hidden=false;
  $("placement-hint").textContent="실제 현장 표면의 두 점을 차례로 클릭 · ESC 취소";
  $("measure-site-status").textContent="첫 번째 점을 선택하세요.";
});
$("measure-site-clear").addEventListener("click",()=>{
  measuredPoints=[];
  if(placementMode==="measure-point"){placementMode=null;$("placement-hint").hidden=true;}
  $("measure-site-status").textContent="측정점 초기화됨";
});
$("measure-objects").addEventListener("click",showPairMeasurement);
$("precision-collision").addEventListener("click",checkInterferences);
$("precision-report").addEventListener("click",exportPrecisionReport);
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
  if(extrasRoot.children.some(o=>o.userData.extraKind==="artwork-copy"))
    return notify("기존 복제 작품을 삭제한 뒤 원본을 변경하세요.");
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
  syncBatchAvailability();
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
$("export-master-pack").addEventListener("click",exportMasterPack);
initVisualReview({
  isMasterApproved:()=>approvedMaster,
  getMaster:()=>masterSnapshots[masterSnapshots.length-1] || null
});
initReadiness({getScene:()=>{
  const master=masterSnapshots[masterSnapshots.length-1] || null;
  const bounds=new THREE.Box3().setFromObject(artRoot);
  const size=bounds.isEmpty()?new THREE.Vector3(0,0,0):bounds.getSize(new THREE.Vector3());
  return {
    project:$("project-name").value,
    siteFile:siteFileName,
    artworkFile:artFileName,
    realSite:!!siteSourceFile,
    realArtwork:!!artSourceFile,
    siteUnit:$("site-unit").value,
    siteUp:$("site-up").value,
    sourceUnitsSelected:["m","cm","mm","ft"].includes($("site-unit").value)
      && ["y","z"].includes($("site-up").value),
    artworkDimensions:size.toArray(),
    artworkHeight:size.y,
    masterApproved:approvedMaster,
    revision:master?.revision||null,
    approvedAt:master?.approvedAt||null,
    masterMatches:!!master && masterConsistency(master,baselineForMaster()).ok
  };
}});
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
  const dragStart=lastDrag && selectedRoot!==artRoot
    ?lastDrag.extras.find(x=>x.id===selectedRoot.userData.extraId)?.transform.p : null;
  if (lastDrag && !approvedMaster && selectedMode === "translate" && $("auto-ground").checked &&
      !extraLight(selectedRoot)) {
    snapRootToSurface(selectedRoot, siteRoot, { allowFallback: !siteSourceFile,
      offset: toFinite($("ground-offset").value, 0, -20, 50) });
  }
  if(lastDrag && !approvedMaster && selectedMode==="translate" && dragStart){
    const delta=selectedRoot.position.clone().sub(new THREE.Vector3().fromArray(dragStart));
    shiftGroupMembers(selectedRoot,delta);
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
applyEnvironment();
restoreRenderConfig(null);
fitCamera();
resize();
animate();
notify("3D Studio 준비 완료 · 작품을 클릭하거나 G/R/S로 조작하세요.");
