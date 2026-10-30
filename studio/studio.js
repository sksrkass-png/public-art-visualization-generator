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
import { initProposalExport } from "./proposal.js";
import { initTeamCollaboration, validateCollaborationState } from "./collaboration.js";
import { initRevisionCompare } from "./revision-compare.js";
import {initSpatialReview} from "./spatial-review.js";
import {validSpatialReview} from "./spatial-review-data.js";
import {FRAME_MODES,CAMERA_LENSES,normalizeVisualSettings,
  fitDistance,localContextRadius,renderQualityFlags} from "./modeling-quality.js";
import { pairMeasurement,sceneInterferences,translateGroupPeers } from "./precision.js";
import { parseLibraryGLB, validLibraryManifest, libraryManifest, libraryMemoryStats,
  MAX_LIBRARY_ASSETS, MAX_LIBRARY_BYTES } from "./assets.js";
import { decodeSiteBundle, inspectImportedSite, validSiteAlignment } from "./site-import.js";
import { makeExtra, extraLight, serializeExtras, validateExtras, restoreExtras, setEditorGizmosVisible, applyPlinthFinish, applyPlinthShape, upgradeGroundLight } from "./extras.js";
import {DIM_MODES,ANCHOR_MODES,fitDimensionScale,targetAnchorTranslation,
  validPlacementReference,validatePlinthDimensions} from "./dimensioning.js";
import { snapRootToSurface, surfaceAtPointer, toFinite } from "./placement.js";
import { LAYER_KEYS, SITE_CATEGORIES, defaultLayerState, validateLayerState, importLayerState,
  enumerateSiteMeshes, invalidateSiteMeshIndex, applyLayerVisibility, normalizeSiteAnnotations, canEditObject,
  layerForObject } from "./layers.js";
import {createSiteViewportController,normalizeSiteViewSettings} from "./site-viewport.js";
import {cameraFocusSettings,shouldAutoFocusImportedSite} from "./camera-focus.js";
import {isCanvasClick,navigationSpeeds,CLICK_TOLERANCE_PX} from "./navigation-ux.js";
import {CAMERA_SLOTS,validCameraBookmarks,bookmarkCamera,savedCameraCount} from "./camera-bookmarks.js";
import {sceneFootprint,productionReport,verifyPngCapture,assertRendererAvailable} from "./production-qa.js";
import {ARCHVIZ_LOOKS,renderShadowSettings,fillLightIntensity,SKY_COLORS,NIGHT_SKY_COLOR,NIGHT_KEY_COLOR} from "./render-looks.js";
import {CONTEXT_CATALOG,filterContextCatalog,uniformHeightScale,dimensionsLabel} from "./context-catalog.js";
import {VISUAL_SLOTS,WALKING_EYE_HEIGHT,preliminaryClearances,validVariants,
  visualReadiness,visualPackageManifest} from "./visual-workflow.js";
import {createVisualOptionStage} from "./visual-option-render.js";

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
const initialNavigation = navigationSpeeds(3.4);
orbit.rotateSpeed = initialNavigation.rotate;
orbit.panSpeed = initialNavigation.pan;
orbit.zoomSpeed = initialNavigation.zoom;
let navigationSiteRadius = 0;
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
// Viewport-only yellow selection box. No source mesh/material edits.
const selectionBounds=new THREE.Box3();
const selectionOutline=new THREE.Box3Helper(selectionBounds,0xffd51f);
selectionOutline.name="Editor Selection Outline — excluded from output";
selectionOutline.material.depthTest=false;
selectionOutline.material.toneMapped=false;
selectionOutline.renderOrder=995;
selectionOutline.visible=false;
scene.add(selectionOutline);
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
// Subtle cool bounce helps preserve detail in the unlit sculpture side.
// Renderer-only light — no scene geometry/material edits.
const fillLight=new THREE.DirectionalLight(0xc0d5ee,.13);
fillLight.castShadow=false;
scene.add(fillLight);
const lastSunArtworkPosition=new THREE.Vector3();

let artFileName = "Sample Artwork", siteFileName = "", planFileName = "";
let approvedMaster = false, revision = 1, loadedPlanTexture = null;
let lastDrag = null, mouseMoved = false, toastTimer = null;
let pointerDown = null, pointerStartedOnGizmo = false;
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
const visualVariants={};
const cameraBookmarks={};
let masterPreviewReturn=null;
let lastInstallationCheck=null,lastProductionAudit=null;
let layerState = defaultLayerState(), pendingSiteLayers = null, siteHighlight = null;
let proposalBridge = null, collaborationBridge = null, revisionBridge = null, spatialBridge = null;
const assetLibrary=new Map();
const siteViewport=createSiteViewportController({renderer,siteRoot,artRoot});
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
function refreshContextPalette(){
  const query=$("context-search").value;
  const matched=new Set(filterContextCatalog(query,$("context-category").value).map(a=>a.kind));
  document.querySelectorAll("[data-add-extra]").forEach(button=>{
    button.hidden=!matched.has(button.dataset.addExtra);
  });
  // A compact 14-variant subsection avoids a huge default inspector. An
  // explicit search auto-expands matching B/C variants so results aren't hidden.
  const variants=$("plant-variants");
  if(variants){
    const matchesVariants=[...variants.querySelectorAll("[data-add-extra]")]
      .some(button=>!button.hidden);
    variants.hidden=!matchesVariants;
    if(matchesVariants && query.trim())variants.open=true;
  }
  syncAssetPlacementUI();
  $("context-search-count").textContent=matched.size+" / "+CONTEXT_CATALOG.length+
    "개 기본 에셋 · B/C 수형은 아래 펼치기 · 장면에 추가한 모델은 필터로 숨겨지지 않습니다.";
}
function syncContextHeightUI(){
  const root=selectedRoot;
  const eligible=root?.parent===extrasRoot &&
    !["point-light","spot-light","plinth","artwork-copy"].includes(root.userData.extraKind);
  const box=eligible?new THREE.Box3().setFromObject(root):null;
  const height=box&&!box.isEmpty()?box.getSize(new THREE.Vector3()).y:0;
  const enabled=eligible&&Number.isFinite(height)&&height>.00001&&selectedCanEdit();
  $("extra-target-height").disabled=!enabled;
  $("extra-fit-height").disabled=!enabled;
  if(!enabled){
    $("extra-target-height").value="";
    $("extra-height-note").textContent=approvedMaster?"MASTER LOCK · 주변 에셋 크기 변경 불가":
      "수목·인물·가구·차량을 선택하면 실측 높이를 조정할 수 있습니다.";
    return;
  }
  if(document.activeElement!==$("extra-target-height"))
    $("extra-target-height").value=height.toFixed(2);
  const size=box.getSize(new THREE.Vector3());
  $("extra-height-note").textContent="현재 3D 크기 "+dimensionsLabel(size.toArray())+
    " · 원본 메시 유지 · 균일 배율만 적용";
}
function applyContextHeight(){
  if(!selectedCanEdit()||selectedRoot.parent!==extrasRoot)return;
  const root=selectedRoot;
  if(["point-light","spot-light","plinth","artwork-copy"].includes(root.userData.extraKind))return;
  const current=new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3()).y;
  try{
    const factor=uniformHeightScale(current,Number($("extra-target-height").value),root.scale.toArray());
    if(Math.abs(factor-1)<.00001)return syncContextHeightUI();
    const before=editSnapshot();
    root.scale.multiplyScalar(factor);
    if($("auto-ground").checked)snapRootToSurface(root,siteRoot,{
      allowFallback:!siteSourceFile,offset:toFinite($("ground-offset").value,0,-20,50)
    });
    commit(before);
    updateInspector(true);
    refreshSelectionOutline();
    notify("주변 에셋 높이 적용 · 원본 모델과 MASTER 작품은 변경하지 않았습니다.");
  }catch(error){notify("에셋 높이 적용 실패: "+error.message);}
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
  const chosenSource=assetLibrary.get(select.value);
  $("library-size-note").textContent=chosenSource
    ?"원본 3D 크기 "+dimensionsLabel(chosenSource.stats.size)+
      " · "+chosenSource.stats.triangles.toLocaleString()+" 삼각형 · 파일 단위가 실제 m인지 확인하세요."
    :"등록된 GLB를 선택하면 원본 크기·폴리곤 수가 표시됩니다.";
  const chosenLayer=chosenSource?.category==="artwork"?layerState.groups.artwork:layerState.groups.planting;
  $("library-place").disabled=approvedMaster || !assetLibrary.size ||
    !chosenLayer.visible || chosenLayer.locked;
  $("library-asset-file").disabled=approvedMaster || assetLibrary.size>=MAX_LIBRARY_ASSETS;
  $("library-asset-category").disabled=approvedMaster;
}
function additionalArtworks(){
  return extrasRoot.children.filter(o=>o.userData.extraKind==="custom-glb"&&o.userData.assetCategory==="artwork");
}
function updateMultiArtStatus(){
  const count=additionalArtworks().length;
  $("multi-art-file").disabled=approvedMaster||count>=4;
  $("multi-art-status").textContent="작품 "+(count+1)+"/5개 · 추가 슬롯 "+(4-count)+
    "개 · 개별 선택/삭제 가능 · 전체 프로젝트 ZIP에 원본 GLB 보존";
}
async function addArtworkGLB(file){
  if(!file||approvedMaster)return;
  if(additionalArtworks().length>=4)
    return notify("기본 작품 포함 최대 5개입니다. 추가 작품 하나를 삭제하면 슬롯이 열립니다.");
  const existingBytes=[...assetLibrary.values()].reduce((sum,a)=>sum+a.file.size,0);
  if(assetLibrary.size>=MAX_LIBRARY_ASSETS||existingBytes+file.size>MAX_LIBRARY_BYTES)
    return notify("프로젝트 GLB 파일 한도를 확인하세요 (전체 최대 60MB).");
  const op=++activeLibraryOperation,id="lib"+nextLibraryId++;
  try{
    const asset=await parseLibraryGLB(file,id,"artwork");
    if(op!==activeLibraryOperation||approvedMaster)return;
    const before=editSnapshot();
    assetLibrary.set(id,asset);
    const root=makeExtra("custom-glb",nextExtraId++,2,id,assetLibrary,artRoot);
    root.position.copy(artRoot.position);
    root.position.x+=1.6*(additionalArtworks().length+1);
    extrasRoot.add(root);
    refreshLayers({redrawSite:false});
    selectRoot(root,true);
    commit(before);
    updateMultiArtStatus();
    notify("독립 작품 추가 "+(additionalArtworks().length+1)+"/5 · "+file.name);
  }catch(e){notify("추가 작품 가져오기 실패: "+e.message);}
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
  $("extra-layer-count").textContent=extrasRoot.children.length.toLocaleString("ko-KR")+"개";
  const filter=$("extra-layer-search")?.value.trim().toLocaleLowerCase("ko-KR")||"";
  const matching=filter?extrasRoot.children.filter(root=>
    root.name.toLocaleLowerCase("ko-KR").includes(filter)||String(root.userData.extraId).includes(filter))
    :extrasRoot.children;
  const visible=matching.length>100?matching.slice(-100):matching;
  if($("extra-layer-summary"))$("extra-layer-summary").textContent=
    matching.length.toLocaleString("ko-KR")+"개 중 최근 "+visible.length+
      "개 표시 · 이전 객체는 위 검색에서 찾을 수 있습니다.";
  for(const root of visible){
    const item=document.createElement("div");
    item.className="extra-layer-item";item.dataset.extraLayerId=String(root.userData.extraId);
    const label=document.createElement("button");
    label.type="button";label.textContent=root.name;label.title="선택 후 이동·회전·크기 변경";
    const editable=canEditObject(root,artRoot,layerState,approvedMaster);
    label.disabled=!editable;
    label.addEventListener("click",()=>selectRoot(root,true));
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
  // Avoid building thousands of checkbox DOM nodes after every placement.
  // Preserve selected and previously checked distant IDs for grouping.
  const recent=extrasRoot.children.length>100?extrasRoot.children.slice(-100):extrasRoot.children;
  const kept=extrasRoot.children.filter(x=>
    (previous.has(x.userData.extraId)||x===selectedRoot)&&!recent.includes(x));
  for(const root of [...kept,...recent]){
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
  const all=modelingObjects();
  const newest=all.length>101?[all[0],...all.slice(-100)]:all;
  const keep=all.filter(o=>o===selectedRoot||String(o.userData.extraId)===prevA||
    String(o.userData.extraId)===prevB);
  const candidates=[...new Set([...newest,...keep])];
  for(const [id,selected] of [["measure-first",prevA],["measure-second",prevB]]){
    const input=$(id);input.replaceChildren();
    for(const [i,o] of candidates.entries())input.add(new Option(o.name,i===0?"main":String(o.userData.extraId)));
    if([...input.options].some(o=>o.value===selected))input.value=selected;
    else input.selectedIndex=id==="measure-second" && candidates.length>1?1:0;
  }
  $("precision-duplicate").disabled=!selectedCanEdit();
  $("precision-group").disabled=approvedMaster || groupChecked.size<2;
  $("precision-ungroup").disabled=approvedMaster || !selectedRoot?.userData?.groupId;
}
function duplicateEditable(){
  if(!selectedCanEdit())return;
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
  let id=1;
  while(used.has(id))id++;
  if(!Number.isSafeInteger(id))return notify("그룹 ID 범위를 초과했습니다.");
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
// SVG-only dimension guide: not part of the 3D scene or exported models.
const measurementSvg=document.createElementNS("http://www.w3.org/2000/svg","svg");
measurementSvg.classList.add("measurement-svg");
measurementSvg.setAttribute("aria-hidden","true");
$("measurement-overlay").append(measurementSvg);
function drawMeasurementOverlay(){
  measurementSvg.replaceChildren();
  if(!measuredPoints.length)return;
  const w=viewport.clientWidth,h=viewport.clientHeight;
  measurementSvg.setAttribute("viewBox","0 0 "+w+" "+h);
  const pts=measuredPoints.map(pos=>{
    const v=new THREE.Vector3(...pos).project(camera);
    return {x:(v.x+1)*w/2,y:(1-v.y)*h/2,z:v.z};
  });
  if(pts.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)||p.z<-1||p.z>1))return;
  const ns="http://www.w3.org/2000/svg";
  const add=(type,attrs)=>{const el=document.createElementNS(ns,type);
    for(const [key,val] of Object.entries(attrs))el.setAttribute(key,String(val));
    measurementSvg.append(el);return el;};
  if(pts.length===2){
    const [p,q]=pts;
    add("line",{x1:p.x,y1:p.y,x2:q.x,y2:q.y,stroke:"#fff","stroke-width":5});
    add("line",{x1:p.x,y1:p.y,x2:q.x,y2:q.y,stroke:"#e34230","stroke-width":2});
    const d=new THREE.Vector3(...measuredPoints[0]).distanceTo(new THREE.Vector3(...measuredPoints[1]));
    const label=add("text",{x:(p.x+q.x)/2,y:(p.y+q.y)/2-12,"text-anchor":"middle",
      fill:"#fff","font-size":14,"font-weight":800,stroke:"#20252a",
      "stroke-width":4,"paint-order":"stroke"});
    label.textContent=d.toFixed(3)+" m";
  }
  for(const p of pts)add("circle",{cx:p.x,cy:p.y,r:6,fill:"#e34230",stroke:"#fff","stroke-width":2});
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
  syncAssetPlacementUI();
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
// v2.3–v2.5: spatial preliminary checks and independent A/B/C scene snapshots.
function stageObjectBounds(root){
  const box=new THREE.Box3().setFromObject(root);
  return box.isEmpty()?null:{min:box.min.toArray(),max:box.max.toArray()};
}
function installationObjects(){
  return [artRoot,...extrasRoot.children.filter(x=>["artwork-copy","custom-glb","plinth"].includes(x.userData.extraKind))]
    .filter(x=>x.visible&&!x.userData.layerHidden)
    .map(x=>({name:x.name,bounds:stageObjectBounds(x)})).filter(x=>x.bounds);
}
function installationBuildings(){
  if(!siteSourceFile)return [];
  return enumerateSiteMeshes(siteRoot).filter(entry=>
    layerState.siteNodes[entry.path]?.category==="buildings"&&entry.object.visible)
    .map(entry=>({name:entry.object.name||entry.path,bounds:stageObjectBounds(entry.object)}))
    .filter(x=>x.bounds);
}
function assessInstallation(){
  const threshold=Number($("installation-clearance").value);
  const data=preliminaryClearances(installationObjects(),installationBuildings(),threshold);
  lastInstallationCheck=data;
  const hits=data.warnings.slice(0,4)
    .map(x=>x.actor+" ↔ "+x.site+" "+x.gapM.toFixed(2)+"m").join(" / ");
  $("installation-check-status").textContent=
    "현장 건물 "+data.checkedBuildings+"개 / 설치물 "+data.checkedActors+"개 예비 검사 · "+
    (data.warnings.length?data.warnings.length+"개 이격/겹침 후보: "+hits+
      (data.warnings.length>4?" 외 "+(data.warnings.length-4)+"개":""):
      "검사 대상에서 경고 없음")+
    (data.checkedBuildings===0?" · 건물 메시가 분류되지 않아 설치 안전을 판단할 수 없습니다.":"")+
    (data.truncated?" · 일부 객체 미검사":"")+
    " · 외접박스 예비 검토이며 실제 충돌 판정은 아닙니다.";
  return data;
}
function pedestrianCamera(type){
  const box=new THREE.Box3().setFromObject(artRoot);
  if(box.isEmpty())return notify("작품을 먼저 불러오세요.");
  const center=box.getCenter(new THREE.Vector3()),height=box.max.y-box.min.y;
  const out=camera.position.clone().sub(orbit.target);
  out.y=0;
  if(out.lengthSq()<.000001)out.set(0,0,1);
  out.normalize();
  const d=type==="approach"?Math.max(25,height*8):Math.max(6,height*2.7);
  const base=artworkAssemblyBounds().min.y;
  const eye=new THREE.Vector3(center.x,base+WALKING_EYE_HEIGHT,center.z);
  camera.position.copy(eye).addScaledVector(out,d);
  orbit.target.set(center.x,box.min.y+Math.max(1.2,Math.min(height*.58,3)),center.z);
  orbit.maxDistance=Math.max(800,d*3);
  camera.near=.02;camera.far=Math.max(3000,d*10);
  camera.updateProjectionMatrix();orbit.update();
  $("installation-check-status").textContent=
    (type==="approach"?"보행자 진입 원거리":"보행자 아이레벨 근거리")+
    " · 카메라 높이 설치물 하단 기준 "+WALKING_EYE_HEIGHT.toFixed(2)+
    "m · 모델 형상/위치 변경 없음 (실제 지면 고도 별도 확인)";
}
function snapshotVisualVariant(slot){
  return {
    slot,name:slot+"안",sourceArt:artFileName,sourceSite:siteFileName,
    sourcePreset:$("site-preset").value,sourceLibrary:libraryManifest(assetLibrary),
    scene:structuredClone(editSnapshot()),
    camera:{position:camera.position.toArray(),target:orbit.target.toArray(),fov:camera.fov},
    lighting:Object.fromEntries(["sun-azimuth","sun-elevation","sun-strength","ambient","exposure"].map(id=>[id,Number($(id).value)])),
    lightPreset:$("light-preset").value,shadows:$("shadows").checked,
    render:currentRenderConfig(),placementReference:currentPlacementReference()
  };
}
function validStoredVisualVariants(value){
  return validVariants(value) && Object.values(value).every(v=>
    validTransform(v.scene.artwork) && validateExtras(v.scene.extras) &&
    validateLayerState(v.scene.layers) && validMaterialConfig(v.scene.material) &&
    validRenderConfig(v.render) && validPlacementReference(v.placementReference) &&
    (v.sourcePreset===undefined||["empty","plaza","courtyard","promenade"].includes(v.sourcePreset)) &&
    (v.sourceLibrary===undefined||validLibraryManifest(v.sourceLibrary)) &&
    typeof v.shadows==="boolean");
}
function visualVariantSourceMatches(v){
  return v.sourceArt===artFileName&&v.sourceSite===siteFileName &&
    v.sourcePreset===$("site-preset").value &&
    JSON.stringify(v.sourceLibrary||[])===JSON.stringify(libraryManifest(assetLibrary));
}
function refreshVisualSlots(){
  const saved=VISUAL_SLOTS.filter(slot=>visualVariants[slot]);
  $("visual-option-status").textContent="저장 슬롯 "+saved.length+"/3 · "+
    VISUAL_SLOTS.map(slot=>slot+"안 "+(visualVariants[slot]?"저장됨":"비어 있음")).join(" / ")+
    (approvedMaster?" · MASTER 승인 중: 시안 수정 불가":"");
  document.querySelectorAll("[data-option-save]").forEach(btn=>btn.disabled=approvedMaster);
  document.querySelectorAll("[data-option-load]").forEach(btn=>{
    btn.disabled=approvedMaster||!visualVariants[btn.dataset.optionLoad];
  });
  $("visual-options-export").disabled=saved.length===0;
}
function saveVisualOption(slot){
  if(approvedMaster)return notify("MASTER 승인 중에는 시안 변경을 저장할 수 없습니다. 새 Revision을 시작하세요.");
  const v=snapshotVisualVariant(slot);
  if(!validStoredVisualVariants({[slot]:v}))return notify("시안 속성 검증에 실패했습니다.");
  visualVariants[slot]=v;
  refreshVisualSlots();
  notify(slot+"안 배치·카메라·조명 저장 완료 · 프로젝트 ZIP에 보존됩니다.");
}
function loadVisualOption(slot){
  if(approvedMaster)return notify("MASTER LOCK 해제 후 시안을 바꾸세요.");
  const v=visualVariants[slot];
  if(!v)return notify(slot+"안 저장 기록이 없습니다.");
  if(!visualVariantSourceMatches(v))return notify("해당 안의 작품·현장·참조 GLB 원본이 현재와 다릅니다.");
  const before=editSnapshot();
  restoreEdit(structuredClone(v.scene));
  restorePlacementReference(v.placementReference);
  for(const [id,value] of Object.entries(v.lighting))if($(id))$(id).value=String(value);
  $("light-preset").value=v.lightPreset;
  $("shadows").checked=v.shadows;
  restoreRenderConfig(v.render);
  camera.position.fromArray(v.camera.position);
  orbit.target.fromArray(v.camera.target);
  camera.fov=v.camera.fov;
  camera.updateProjectionMatrix();orbit.update();updateLight();
  commit(before);refreshVisualSlots();
  notify(slot+"안 복원 · 모델과 카메라/조명 설정 적용 (Ctrl+Z 가능)");
}
function checkVisualReadiness(){
  const box=new THREE.Box3().setFromObject(artRoot);
  const size=box.isEmpty()?[]:box.getSize(new THREE.Vector3()).toArray();
  const master=masterSnapshots[masterSnapshots.length-1];
  const clearance=assessInstallation();
  const evaluation=visualReadiness({
    realSite:!!siteSourceFile,realArtwork:!!artSourceFile,
    masterApproved:approvedMaster,
    masterConsistent:!!master&&masterConsistency(master,baselineForMaster()).ok,
    dimensionsM:size,clearance,hasLighting:$("shadows").checked
  });
  const problems=[...evaluation.warnings];
  if(!clearance.checkedBuildings)
    problems.push("현장 건축 메시 분류가 없어 벽체 이격 검토가 완료되지 않았습니다.");
  $("visual-preflight-status").textContent=
    (problems.length?"추가 확인 "+problems.length+"건 · ":"예비 품질 점검 통과 · ")+
    (problems.join(" / ")||"현장·작품·배치 확인 조건 충족")+
    " · "+evaluation.warning;
  return {evaluation,warnings:problems};
}
function collectPrecisionReport(){
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
  return data;
}
function exportPrecisionReport(){
  const data=collectPrecisionReport();
  download(safeFileName()+"-precision-audit.json",new Blob([JSON.stringify(data,null,2)],{type:"application/json"}));
}
function selectedCanEdit() {
  return canEditObject(selectedRoot,artRoot,layerState,approvedMaster);
}
function refreshLayers({redrawSite = false} = {}) {
  // Clear temporary clipped/ghost display before recomputing source visibility.
  const resumeSite=siteViewport.suspend();
  const entries=applyLayerVisibility(layerState,siteRoot,artRoot,extrasRoot);
  resumeSite();
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
  else if(gizmoRequested && !transform.dragging && transform.object!==selectedRoot) transform.attach(selectedRoot);
  refreshSelectionOutline();
  controls.forEach(input=>{input.disabled=!selectedCanEdit();});
  $("delete-selected").disabled=!selectedCanEdit() || selectedRoot===artRoot;
  $("ground-selected").disabled=!selectedCanEdit();
  $("pick-selected-site").disabled=!selectedCanEdit();
  $("apply-height").disabled=!canEditObject(artRoot,artRoot,layerState,approvedMaster);
  $("extra-light-power").disabled=!selectedCanEdit();
  $("extra-light-color").disabled=!selectedCanEdit();
  $("ground-light-upgrade").disabled=!selectedCanEdit();
  document.querySelectorAll("[data-add-extra]").forEach(button=>{
    const group=button.dataset.addExtra.includes("light") ? layerState.groups.lighting : layerState.groups.planting;
    button.disabled=approvedMaster || !group.visible || group.locked;
  });
  refreshAssetLibraryUI();
}
// v2.2 transient visualization tools: never become part of MASTER or saved site geometry.
function resetSitePreviewUI(){
  siteViewport.reset();
  $("site-view-mode").value="solid";
  $("site-focus-radius").value="0";
  $("site-section-side").value="x-left";
  $("site-section-offset").value="0";
  $("site-view-stat").textContent="현장 표시 원본 복원 · 임시 가림·단면 효과 없음";
}
function applySitePreview(){
  try{
    const next=normalizeSiteViewSettings({
      mode:$("site-view-mode").value,
      cut:$("site-section-side").value,
      offset:Number($("site-section-offset").value),
      radius:Number($("site-focus-radius").value)
    });
    if(Number($("site-section-offset").value)!==next.offset)
      throw Error("단면 이동은 -100~100m 범위에서 설정하세요.");
    const stats=siteViewport.set(next);
    if(stats.limited){
      $("site-view-stat").textContent=
        "현장 메시 "+stats.meshCount+"개 · 안전 제한 "+10000+"개 초과: 일부만 가리거나 잘라내지 않고 원본 화면을 유지합니다.";
      return;
    }
    $("site-view-stat").textContent=
      "현장 메시 "+stats.meshCount+"개 · 집중 뷰에서 제외 "+stats.hiddenByFocus+
      "개 · 렌더용 임시 재질 "+stats.temporaryMaterials+"개 · 원본 변경 없음";
  }catch(error){
    siteViewport.set({mode:"solid",radius:0});
    $("site-view-stat").textContent="현장 보기 실패: "+error.message;
    notify(error.message);
  }
}
function setupNavigationPerformance(){
  const mode=$("site-navigation-performance").value;
  const high=Math.min(window.devicePixelRatio||1,2);
  if(mode==="quality"&&!orbitDragging)renderer.setPixelRatio(high);
}
let orbitDragging=false;
orbit.addEventListener("start",()=>{
  orbitDragging=true;
  if($("site-navigation-performance").value==="adaptive")
    renderer.setPixelRatio(Math.min(1,window.devicePixelRatio||1));
});
orbit.addEventListener("end",()=>{
  orbitDragging=false;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
});
orbit.addEventListener("change",updateNavigationSpeed);
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
  siteViewport.reset();
  invalidateSiteMeshIndex(siteRoot);
  clearGroup(siteRoot);
  siteFileName = "";
  siteSourceFile = null;
  navigationSiteRadius = 0;
  updateNavigationSpeed();
  resetSiteAnnotations();
  syncGroundAvailability();
  resetSitePreviewUI();
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
  invalidateSiteMeshIndex(siteRoot);
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
  refreshNavigationRadius();
}
function currentVisualSettings(){
  return normalizeVisualSettings({
    toneCurve:$("visual-tone").value,sky:$("visual-sky").value,
    shadowProfile:$("visual-shadows").value,guide:$("visual-guide").value
  });
}
function applyVisualGuide(){
  const overlay=$("visual-composition-overlay");
  const guide=$("visual-guide").value;
  overlay.hidden=guide==="none";
  overlay.className="visual-composition-overlay"+(guide==="none"?"":" visual-guide-"+guide);
}
function applyVisualLook(){
  const settings=currentVisualSettings();
  renderer.toneMapping=settings.toneCurve==="neutral"?THREE.NeutralToneMapping:THREE.ACESFilmicToneMapping;
  const isNight=$("light-preset").value==="night";
  scene.background.set(isNight?NIGHT_SKY_COLOR:SKY_COLORS[settings.sky]);
  const bounds=new THREE.Box3().setFromObject(artRoot);
  const size=bounds.getSize(new THREE.Vector3());
  const shadow=renderShadowSettings({
    width:size.x,height:size.y,depth:size.z,profile:settings.shadowProfile,
    maxTextureSize:renderer.capabilities.maxTextureSize
  });
  if(sun.shadow.mapSize.x!==shadow.resolution){
    sun.shadow.mapSize.set(shadow.resolution,shadow.resolution);
    if(sun.shadow.map){sun.shadow.map.dispose();sun.shadow.map=null;}
  }
  // World-scale, artwork-focused shadow frustum (never encompass an entire city OBJ).
  const shadowCam=sun.shadow.camera;
  shadowCam.left=-shadow.reach;shadowCam.right=shadow.reach;
  shadowCam.top=shadow.reach;shadowCam.bottom=-shadow.reach;
  shadowCam.near=shadow.near;shadowCam.far=shadow.far;
  shadowCam.updateProjectionMatrix();
  sun.shadow.bias=shadow.bias;
  sun.shadow.normalBias=shadow.normalBias;
  sun.shadow.radius=shadow.radius;
  sun.shadow.needsUpdate=true;
  applyVisualGuide();
}
function sceneFrame(mode){
  if(!FRAME_MODES.includes(mode))return;
  const artwork=new THREE.Box3().setFromObject(artRoot);
  if(artwork.isEmpty())return notify("프레이밍할 작품 모델이 없습니다.");
  const artSphere=artwork.getBoundingSphere(new THREE.Sphere());
  const site=new THREE.Box3().setFromObject(siteRoot);
  const siteSphere=site.isEmpty()?null:site.getBoundingSphere(new THREE.Sphere());
  let center=artSphere.center.clone();
  let allRadius=siteSphere?.radius||artSphere.radius;
  if(mode==="site"&&siteSphere){
    const union=artwork.clone().union(site);
    const both=union.getBoundingSphere(new THREE.Sphere());
    center=both.center;
    allRadius=both.radius;
  }
  const radius=localContextRadius(artSphere.radius,allRadius,mode);
  const delta=camera.position.clone().sub(orbit.target);
  if(delta.lengthSq()<.0001)delta.set(1,.45,1);
  delta.normalize();
  const settings=cameraFocusSettings({radius:Math.max(.3,radius),fov:camera.fov,
    aspect:camera.aspect,padding:1.32});
  const allowed=settings.distance;
  orbit.maxDistance=settings.maxDistance;
  camera.position.copy(center).addScaledVector(delta,allowed);
  orbit.target.copy(center);
  camera.near=settings.near;
  camera.far=settings.far;
  camera.updateProjectionMatrix();
  orbit.update();
  $("visual-frame-status").textContent=
    {sculpture:"작품 중심",nearby:"작품 + 근거리 환경",site:"전체 현장"}[mode]+
    " · 카메라 거리 "+allowed.toFixed(1)+"m"+
    (settings.limited?" · 초대형 OBJ 프레이밍 안전 상한 적용":"");
}
// v3.0 — independent model/report inspection; no modifications to source,
 // editable user groups, master approval or render configuration.
function currentProductionAudit(){
  const master=masterSnapshots[masterSnapshots.length-1];
  const size=targetSize(viewport.clientWidth,viewport.clientHeight,
    "landscape16x9",Number($("batch-quality").value),
    renderer.capabilities.maxTextureSize,14000000);
  const site=sceneFootprint(siteRoot),artwork=sceneFootprint(artRoot),
    extras=sceneFootprint(extrasRoot);
  return productionReport({
    project:$("project-name").value,
    siteModel:!!siteSourceFile,artworkModel:!!artSourceFile,
    masterApproved:approvedMaster,
    masterMatches:!!master&&masterConsistency(master,baselineForMaster()).ok,
    site,artwork,extras,
    output:size,gpuContextLost:!!renderer.getContext()?.isContextLost?.()
  });
}
function runProductionAudit(){
  const report=currentProductionAudit();
  lastProductionAudit=report;
  const state={blocked:"출력 전 확인 필수",review:"실제 원본·성능 추가 확인",
    candidate:"사내 시안 기술 점검 통과"}[report.state];
  $("production-audit-summary").textContent=[
    state,
    ...report.blockers.map(s=>"⚠ "+s),
    ...report.warnings.map(s=>"• "+s),
    "주의: 사내 렌더 작업 점검이며 법적·구조 안전 인증이 아닙니다."
  ].join("\n");
  $("production-audit-metrics").textContent=
    "현장 "+report.metrics.site.meshes+"개 메시 / "+
      report.metrics.site.triangles.toLocaleString()+" tris · 작품 "+
      report.metrics.artwork.meshes+"개 메시 · 전체 "+
      report.metrics.totalTriangles.toLocaleString()+" tris · "+
      "MASTER 8컷 PNG "+report.metrics.output.width+" × "+
      report.metrics.output.height+"px";
  $("production-audit-export").disabled=false;
  return report;
}
function checkVisualQuality(){
  const size=targetSize(viewport.clientWidth,viewport.clientHeight,
    $("render-aspect").value,+$("render-resolution").value,renderer.capabilities.maxTextureSize);
  const flags=renderQualityFlags({
    width:size.width,height:size.height,limited:size.limited,
    hasSite:!!siteSourceFile,hasArtwork:!!artSourceFile,
    locked:approvedMaster,shadowProfile:$("visual-shadows").value
  });
  const dimensions=new THREE.Box3().setFromObject(artRoot).getSize(new THREE.Vector3());
  const name=$("render-aspect").selectedOptions[0]?.textContent||"현재 화면";
  $("visual-quality-status").textContent=[
    "출력 "+size.width+"×"+size.height+"px · "+name,
    "작품 크기 "+[dimensions.x,dimensions.z,dimensions.y].map(n=>n.toFixed(2)).join("×")+"m (W×D×H, 뷰어 값)",
    "렌더 방식: WebGL PBR · GPU 최대 텍스처 "+renderer.capabilities.maxTextureSize+"px",
    "v2.8 그림자: "+$("visual-shadows").value+" · 작품 경계 중심 자동 조정 · 환경 반사 "+$("env-mode").value,
    "모델은 시안용이며 현장 실측 검증·물리 기반 경로 추적·AI 실사화는 수행하지 않습니다.",
    ...flags.map(x=>"• "+x)
  ].join("\n");
}
function currentRenderConfig(){
  return {
    aspect:$("render-aspect").value,environmentMode:$("env-mode").value,
    environmentFile:hdrSourceFile?.name || "",envIntensity:Number($("env-strength").value),
    focalLength:Number(camera.getFocalLength().toFixed(3)),multiplier:Number($("render-resolution").value),
    artworkMaterial:structuredClone(artworkMaterialState),
    visual:currentVisualSettings()
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
  const visual=normalizeVisualSettings(config.visual);
  $("visual-tone").value=visual.toneCurve;
  $("visual-sky").value=visual.sky;
  $("visual-shadows").value=visual.shadowProfile;
  $("visual-guide").value=visual.guide;
  applyVisualLook();
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
  if(collaborationBridge)collaborationBridge.reset();
  if(spatialBridge)spatialBridge.reset();
  clearUndo();
  if (Number.isFinite(options.height) && options.height > 0) fitArtworkHeight(options.height);
  transform.detach();
  gizmoRequested=false;
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
// v2.1 — precision mounting is always user-initiated. Source mesh vertices remain intact.
function artworkWorldBox(){
  artRoot.updateMatrixWorld(true);
  const box=new THREE.Box3().setFromObject(artRoot);
  if(box.isEmpty())throw Error("작품 모델을 먼저 불러오세요.");
  return box;
}
function currentPlacementReference(){
  return {
    mode:$("anchor-mode").value,
    position:["x","y","z"].map(axis=>Number($("anchor-"+axis).value))
  };
}
function restorePlacementReference(value){
  const ref=validPlacementReference(value)?value:{mode:"center",position:[0,0,0]};
  $("anchor-mode").value=ref.mode;
  ["x","y","z"].forEach((axis,i)=>{$("anchor-"+axis).value=String(ref.position[i]);});
}
function updateArtworkDimensionReadout(){
  if(!artRoot.children.length)return;
  const size=artworkWorldBox().getSize(new THREE.Vector3());
  const dimensions=[size.x,size.z,size.y];
  $("art-current-wdh").textContent="현재 W "+size.x.toFixed(3)+" × D "+size.z.toFixed(3)+
    " × H "+size.y.toFixed(3)+" m · 월드 외접 크기";
  ["width","depth","height"].forEach((field,i)=>{
    if(document.activeElement!==$("dimension-"+field))
      $("dimension-"+field).value=dimensions[i].toFixed(3);
  });
}
function refreshPlinthControls(){
  const selected=selectedRoot?.userData?.extraKind==="plinth"?selectedRoot:null;
  $("plinth-update").disabled=approvedMaster||!selected||!selectedCanEdit();
  $("plinth-align").disabled=approvedMaster||!selected||!selectedCanEdit()||!canEditObject(artRoot,artRoot,layerState,approvedMaster);
  $("plinth-create").disabled=approvedMaster||linkedPlinths().length>0||
    !canEditObject(artRoot,artRoot,layerState,approvedMaster);
  if(selected){
    if(document.activeElement!==$("plinth-width"))$("plinth-width").value=selected.scale.x.toFixed(3);
    if(document.activeElement!==$("plinth-depth"))$("plinth-depth").value=selected.scale.z.toFixed(3);
    if(document.activeElement!==$("plinth-height"))$("plinth-height").value=selected.scale.y.toFixed(3);
    if(document.activeElement!==$("plinth-finish"))$("plinth-finish").value=selected.userData.plinthFinish||"concrete";
    $("plinth-shape").value=selected.userData.plinthShape||"box";
  }
}
function plinthInputs(){
  const w=Number($("plinth-width").value),d=Number($("plinth-depth").value),h=Number($("plinth-height").value);
  if(!validatePlinthDimensions(w,d,h))throw Error("기단 W/D/H는 각각 0.05~30m 범위여야 합니다.");
  return {w,d,h,finish:$("plinth-finish").value};
}
function linkedPlinths(){
  return extrasRoot.children.filter(root=>root.userData.extraKind==="plinth" &&
    root.userData.followArtwork===true);
}
function translateLinkedPlinths(delta){
  if(!delta || delta.lengthSq()<1e-12)return;
  for(const root of linkedPlinths())root.position.add(delta);
}
function artworkAssemblyBounds(){
  const b=artworkWorldBox();
  for(const root of linkedPlinths())b.union(new THREE.Box3().setFromObject(root));
  return b;
}
function createPlinth(){
  if(approvedMaster||!canEditObject(artRoot,artRoot,layerState,approvedMaster))
    return notify("MASTER 잠금/작품 레이어 잠금을 해제하세요.");
  try{
    if(linkedPlinths().length)throw Error("이미 작품에 연결된 기단이 있습니다. 기존 기단을 선택해 수정하세요.");
    const {w,d,h,finish}=plinthInputs();
    const bounds=artworkWorldBox();
    const center=bounds.getCenter(new THREE.Vector3());
    const before=editSnapshot();
    const root=makeExtra("plinth",nextExtraId++,2);
    root.scale.set(w,h,d);
    root.position.set(center.x,bounds.min.y,center.z);
    applyPlinthShape(root,$("plinth-shape").value);
    applyPlinthFinish(root,finish);
    root.userData.followArtwork=true;
    extrasRoot.add(root);
    artRoot.position.y+=h;
    selectRoot(root);
    refreshLayers({redrawSite:false});
    updateExtrasStatus();
    updateLight();commit(before);
    $("plinth-status").textContent="기단 #"+root.userData.extraId+
      " 생성 · 작품 하단을 기단 상단으로 "+h.toFixed(3)+"m 올렸습니다. 실제 지면과 간섭은 별도로 확인하세요.";
    notify("독립 기단 설치 + 원본 작품 하단 정렬 완료");
  }catch(error){$("plinth-status").textContent=error.message;notify(error.message);}
}
function updateSelectedPlinth(){
  if(approvedMaster||selectedRoot?.userData?.extraKind!=="plinth"||!selectedCanEdit())return;
  try{
    const {w,d,h,finish}=plinthInputs();
    const before=editSnapshot();
    selectedRoot.scale.set(w,h,d);
    applyPlinthShape(selectedRoot,$("plinth-shape").value);
    applyPlinthFinish(selectedRoot,finish);
    commit(before);updateInspector(true);
    $("plinth-status").textContent="선택 기단의 W/D/H와 마감 수정 완료 · 작품은 움직이지 않았습니다.";
  }catch(error){$("plinth-status").textContent=error.message;notify(error.message);}
}
function alignArtworkOnPlinth(){
  if(approvedMaster||selectedRoot?.userData?.extraKind!=="plinth"||!selectedCanEdit()||
    !canEditObject(artRoot,artRoot,layerState,approvedMaster))return;
  const before=editSnapshot();
  const plinthBox=new THREE.Box3().setFromObject(selectedRoot);
  const artBox=artworkWorldBox();
  const center=artBox.getCenter(new THREE.Vector3());
  const plinthCenter=plinthBox.getCenter(new THREE.Vector3());
  artRoot.position.x+=plinthCenter.x-center.x;
  artRoot.position.z+=plinthCenter.z-center.z;
  artRoot.position.y+=plinthBox.max.y-artBox.min.y;
  commit(before);updateLight();updateInspector(true);
  $("plinth-status").textContent="기단 상단 중심에 작품 배치 완료 · 원본 형상 및 기단은 변경되지 않았습니다.";
}
function applyArtworkDimensions(){
  if(approvedMaster||!canEditObject(artRoot,artRoot,layerState,approvedMaster))
    return notify("작품 잠금을 해제한 후 크기를 설정하세요.");
  try{
    const mode=$("dimension-mode").value;
    if(!DIM_MODES.includes(mode))throw Error("치수 조정 방식을 확인하세요.");
    if(mode==="independent" && artRoot.rotation.toArray().slice(0,3).some(n=>Math.abs(n)>1e-6))
      throw Error("회전된 작품에서는 W/D/H 개별 조정을 제한합니다. 회전을 정리하거나 원래 비율 유지 모드를 사용하세요.");
    const box=artworkWorldBox(),dims=box.getSize(new THREE.Vector3());
    const target=["width","height","depth"].map(field=>Number($("dimension-"+field).value));
    if(target.some(v=>!Number.isFinite(v)||v<.05||v>100))
      throw Error("지정 크기는 각 축마다 0.05~100m 범위입니다.");
    const scale=fitDimensionScale([dims.x,dims.y,dims.z],artRoot.scale.toArray(),
      target,mode,$("dimension-distortion").checked);
    const before=editSnapshot(),bottom=box.min.y,center=box.getCenter(new THREE.Vector3());
    artRoot.scale.fromArray(scale);
    const next=artworkWorldBox(),newCenter=next.getCenter(new THREE.Vector3());
    artRoot.position.x+=center.x-newCenter.x;
    artRoot.position.y+=bottom-next.min.y;
    artRoot.position.z+=center.z-newCenter.z;
    commit(before);updateLight();updateInspector(true);
    const measured=artworkWorldBox().getSize(new THREE.Vector3());
    $("dimension-status").textContent="적용 완료 · W "+measured.x.toFixed(3)+
      " / D "+measured.z.toFixed(3)+" / H "+measured.y.toFixed(3)+
      "m · 모델 정점 수정 없음"+(mode==="independent"?" · 작품 비율 변경됨":" · 작품 비율 유지");
  }catch(error){$("dimension-status").textContent=error.message;notify(error.message);}
}
function applyArtworkAnchor(){
  if(approvedMaster||!canEditObject(artRoot,artRoot,layerState,approvedMaster))
    return notify("작품 및 MASTER 잠금을 확인하세요.");
  try{
    const ref=currentPlacementReference();
    if(!validPlacementReference(ref))throw Error("기준 좌표는 정확한 숫자여야 합니다.");
    const box=artworkAssemblyBounds();
    const delta=targetAnchorTranslation({min:box.min.toArray(),max:box.max.toArray()},
      ref.mode,ref.position);
    const before=editSnapshot();
    const shift=new THREE.Vector3(...delta);
    artRoot.position.add(shift);
    translateLinkedPlinths(shift);
    commit(before);updateLight();updateInspector(true);
    $("anchor-status").textContent="기준점 이동 "+delta.map(v=>v.toFixed(3)).join(" / ")+
      "m · 지정 XYZ에 맞췄습니다. 월드 X/Z 기준이며 현장 방위·실측은 별도 확인하세요.";
  }catch(error){$("anchor-status").textContent=error.message;notify(error.message);}
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
  updateLight();
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
    siteSetup:{unit:$("site-unit").value,up:$("site-up").value,
      centerOrigin:$("site-center-origin").checked},
    artworkTransform: snapshot(),
    camera: { position: camera.position.toArray(), target: orbit.target.toArray(), fov: camera.fov },
    lighting: Object.fromEntries(["sun-azimuth", "sun-elevation", "sun-strength", "ambient", "exposure"]
      .map(id => [id, Number($(id).value)])),
    shadows: $("shadows").checked,
    lightPreset:$("light-preset").value,
    extras: serializeExtras(extrasRoot),
    library:libraryManifest(assetLibrary),
    layers:structuredClone(layerState),
    material:structuredClone(artworkMaterialState),
    render:currentRenderConfig(),
    placementReference:currentPlacementReference(),
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
    (entry.lightPreset===undefined ||
      ["custom","clear","cloudy","golden","night"].includes(entry.lightPreset)) &&
    (entry.extras === undefined || validateExtras(entry.extras)) &&
    (entry.library === undefined || validLibraryManifest(entry.library)) &&
    (entry.layers === undefined || validateLayerState(entry.layers)) &&
    (entry.material === undefined || validMaterialConfig(entry.material)) &&
    (entry.render === undefined || validRenderConfig(entry.render)) &&
    (entry.placementReference === undefined || validPlacementReference(entry.placementReference)) &&
    (entry.siteSetup === undefined ||
      (entry.siteSetup && Object.hasOwn(SITE_UNIT_TO_M,entry.siteSetup.unit) &&
        ["y","z"].includes(entry.siteSetup.up) &&
        typeof entry.siteSetup.centerOrigin==="boolean"));
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
  if(revisionBridge)revisionBridge.refresh();
  if(spatialBridge)spatialBridge.refresh();
  refreshPlinthControls();
  updateArtworkDimensionReadout();
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
  if(saved.lightPreset!==undefined)$("light-preset").value=saved.lightPreset;
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
    syncAssetPlacementUI();
    // Even a file read that began before approval must not replace the master.
    activeSiteOperation++;
    activeArtOperation++;
    activePlanOperation++;
    transform.detach();
  }
  else if (gizmoRequested && selectedRoot && selectedCanEdit()) transform.attach(selectedRoot);
  ["library-place","library-asset-file","library-asset-category","extra-target-height","extra-fit-height",
    "site-center-origin", "site-unit", "site-up", "delete-selected", "extra-light-power", "extra-light-color", "ground-light-upgrade",
    "auto-ground", "ground-selected", "pick-selected-site", "ground-offset",
    "plan-pick-center", "plan-visible", "map-file", "map-width", "plan-x", "plan-z",
    "plan-rotation", "plan-elevation", "plan-opacity"]
    .forEach(id => { $(id).disabled = approvedMaster; });
  document.querySelectorAll("[data-add-extra]").forEach(btn => { btn.disabled = approvedMaster; });
  ["art-material","art-material-color","apply-material","reset-material"].forEach(id=>{$(id).disabled=approvedMaster;});
  updateExtrasStatus();
  syncContextHeightUI();
  refreshVisualSlots();
  controls.forEach(el => el.disabled = approvedMaster);
  ["apply-height", "art-height", "site-preset", "site-file", "art-file", "sample-art", "floor-map", "map-file", "map-width", "uniform-scale",
    "dimension-width","dimension-depth","dimension-height","dimension-mode","dimension-distortion","dimension-apply",
    "plinth-width","plinth-depth","plinth-height","plinth-finish","plinth-shape","plinth-create","plinth-update","plinth-align",
    "anchor-mode","anchor-x","anchor-y","anchor-z","anchor-pick","anchor-apply","multi-art-file"]
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
  updateMultiArtStatus();
  if(proposalBridge)proposalBridge.refresh();
  if(collaborationBridge)collaborationBridge.refresh();
  if(revisionBridge)revisionBridge.refresh();
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
  syncContextHeightUI();
  updateArtworkDimensionReadout();
  refreshPlinthControls();
  $("coords").textContent = ["X", "Y", "Z"].map((k, i) => k + " " + state.p[i].toFixed(2)).join(" · ");
  $("object-name").textContent = selectedRoot.name;
  const light = selectedRoot === artRoot ? null : extraLight(selectedRoot);
  $("extra-light-controls").hidden = !light;
  const oldUplight=selectedRoot?.userData?.extraKind==="point-light" &&
    (selectedRoot.userData.appearanceVersion||1)<4;
  $("ground-light-upgrade").hidden=!oldUplight;
  $("ground-light-upgrade").disabled=!selectedCanEdit();
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
  const bounds=new THREE.Box3().setFromObject(artRoot);
  const focus=bounds.isEmpty()?artRoot.position.clone():bounds.getCenter(new THREE.Vector3());
  // Real imported sculpture meshes may be offset far from their local origin.
  // Move lights only (not artwork/site) around actual world-space sculpture bounds.
  sun.target.position.copy(focus);
  const direction=new THREE.Vector3(
    Math.cos(el) * Math.sin(az),Math.sin(el),Math.cos(el) * Math.cos(az));
  sun.position.copy(focus).addScaledVector(direction,radius);
  fillLight.position.copy(focus).addScaledVector(direction,-45).add(new THREE.Vector3(0,25,0));
  fillLight.target.position.copy(focus);
  fillLight.target.updateMatrixWorld();
  sun.target.updateMatrixWorld();
  lastSunArtworkPosition.copy(artRoot.position);
  sunGuide.position.copy(focus).addScaledVector(direction,8);
  sunGuide.visible = $("sun-helper").checked;
  sun.intensity = +$("sun-strength").value;
  ambient.intensity = +$("ambient").value;
  fillLight.intensity=fillLightIntensity(ambient.intensity);
  renderer.toneMappingExposure = +$("exposure").value;
  sun.color.set($("light-preset").value==="night"?NIGHT_KEY_COLOR:
    $("light-preset").value==="golden"?0xffc489:0xfff7e6);
  applyVisualLook();
  sun.castShadow = $("shadows").checked;
  renderer.shadowMap.enabled = $("shadows").checked;
  ["sun-azimuth", "sun-elevation", "sun-strength", "ambient", "exposure"].forEach(id => {
    $(id + "-value").textContent = $(id).value + (id.startsWith("sun-") && id !== "sun-strength" ? "°" : "");
  });
}
function refreshNavigationRadius(){
  const box=siteSourceFile?new THREE.Box3().setFromObject(siteRoot):null;
  navigationSiteRadius=box&&!box.isEmpty()
    ?box.getBoundingSphere(new THREE.Sphere()).radius:0;
  updateNavigationSpeed();
}
function updateNavigationSpeed(){
  const settings=navigationSpeeds(+$("nav-speed").value,{
    siteRadius:navigationSiteRadius,
    cameraDistance:camera.position.distanceTo(orbit.target)
  });
  orbit.panSpeed=settings.pan;
  orbit.rotateSpeed=settings.rotate;
  orbit.zoomSpeed=settings.zoom;
  $("nav-speed-value").textContent=(+$("nav-speed").value).toFixed(1)+"×";
}
function fitCameraToBounds(bounds,label,{preserveDirection=true}={}){
  if(bounds.isEmpty())return false;
  const sphere=bounds.getBoundingSphere(new THREE.Sphere());
  if(!Number.isFinite(sphere.radius)||sphere.radius<=0)return false;
  const config=cameraFocusSettings({
    radius:Math.max(.15,sphere.radius),fov:camera.fov,
    aspect:viewport.clientWidth/Math.max(1,viewport.clientHeight),padding:1.35
  });
  const direction=preserveDirection?
    camera.position.clone().sub(orbit.target):new THREE.Vector3(1,.6,1);
  if(direction.lengthSq()<.000001)direction.set(1,.6,1);
  direction.normalize();
  orbit.maxDistance=config.maxDistance;
  orbit.minDistance=Math.max(.01,Math.min(.25,config.distance/150));
  camera.near=config.near;
  camera.far=config.far;
  camera.position.copy(sphere.center).addScaledVector(direction,config.distance);
  orbit.target.copy(sphere.center);
  camera.updateProjectionMatrix();
  orbit.update();
  updateNavigationSpeed();
  $("camera-focus-status").textContent=label+" · 카메라 거리 "+
    config.distance.toFixed(1)+"m · 원본 모델 크기·좌표 변경 없음"+
    (config.limited?" · 매우 큰 모델이므로 표시 한계 확인":"");
  return true;
}
function focusImportedSite(){
  const box=new THREE.Box3().setFromObject(siteRoot);
  if(box.isEmpty())return notify("현장 모델이 없습니다. 현장 3D 파일을 먼저 불러오세요.");
  fitCameraToBounds(box,"현장 전체 맞춤");
}
function focusCurrentSelection(){
  const root=gizmoRequested?selectedRoot:artRoot;
  const box=new THREE.Box3().setFromObject(root);
  if(box.isEmpty())return notify("선택할 모델이 없습니다.");
  fitCameraToBounds(box,gizmoRequested?"선택 객체 맞춤":"작품 맞춤");
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
  if(size.length()>160 && name==="main")
    fitCameraToBounds(new THREE.Box3().setFromObject(artRoot),"대형 작품 자동 맞춤");
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
  const totalExtras=extrasRoot.children.length;
  $("extra-count").textContent = "추가된 오브제 " + totalExtras.toLocaleString("ko-KR") + "개";
  const advice=$("asset-density-status");
  if(advice)advice.textContent=totalExtras<80
    ? "에셋 수량의 고정 제한 없이 배치할 수 있습니다. 장면 복잡도는 GPU 성능에 따라 달라집니다."
    : totalExtras<250
      ? "🌳 "+totalExtras.toLocaleString("ko-KR")+"개 배치됨 · 같은 수목은 3D 자원 재사용 · 화면이 느리면 이동 중 가변 해상도를 사용하세요."
      : "⚠️ "+totalExtras.toLocaleString("ko-KR")+"개 배치됨 · 대용량 장면은 저장·렌더·GPU 메모리가 느려질 수 있습니다. 프로젝트 ZIP을 자주 저장하세요.";
  const list = $("extra-list");
  const activeId = selectedRoot.userData.extraId;
  const currentIds = [...list.children].map(node => Number(node.dataset.extraId));
  const filter=$("extra-list-search")?.value.trim().toLocaleLowerCase("ko-KR")||"";
  const matched=filter?extrasRoot.children.filter(node=>
    node.name.toLocaleLowerCase("ko-KR").includes(filter)||String(node.userData.extraId).includes(filter))
    :extrasRoot.children;
  const last=matched.length>100?matched.slice(-100):matched;
  const displayed=selectedRoot?.parent===extrasRoot && !last.includes(selectedRoot) && !filter
    ? [selectedRoot,...last]:last;
  if($("extra-list-summary"))$("extra-list-summary").textContent=
    matched.length.toLocaleString("ko-KR")+"개 중 "+displayed.length+
    "개 표시 · 오래된 객체는 검색으로 찾을 수 있습니다.";
  const wantedIds = displayed.map(node => node.userData.extraId);
  if (currentIds.join(",") !== wantedIds.join(",")) {
    list.replaceChildren();
    for (const root of displayed) {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.extraId = String(root.userData.extraId);
      button.textContent = root.name;
      button.addEventListener("click", () => {
        // Resolve by ID at click time: undo/ZIP restore may rebuild mesh roots.
        const latest = extrasRoot.children.find(object => object.userData.extraId === root.userData.extraId);
        if (latest) selectRoot(latest,true);
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
let gizmoRequested=false;
function refreshSelectionOutline(){
  const visible=gizmoRequested&&selectedRoot?.parent&&selectedRoot.visible &&
    (selectedRoot===artRoot?layerState.groups.artwork.visible:
       !selectedRoot.userData.layerHidden);
  if(visible){
    selectedRoot.updateMatrixWorld(true);
    selectionBounds.setFromObject(selectedRoot);
  }
  selectionOutline.visible=!!visible&&!selectionBounds.isEmpty();
  viewport.dataset.selectionActive=selectionOutline.visible?"yes":"no";
}
function clearCanvasSelection(){
  gizmoRequested=false;
  transform.detach();
  selectedRoot=artRoot;
  selectionOutline.visible=false;
  viewport.dataset.selectionActive="no";
  updateInspector(true);
  updateExtrasStatus();
}
function selectRoot(object, showGizmo=false) {
  updateMultiArtStatus();
  selectedRoot = object || artRoot;
  gizmoRequested=!!showGizmo;
  if (gizmoRequested && selectedCanEdit())transform.attach(selectedRoot);
  else transform.detach();
  refreshSelectionOutline();
  updateInspector(true);
  updateExtrasStatus();
  refreshLayers();
}
function groupForPlacement(kind){
  if(kind.includes("light"))return layerState.groups.lighting;
  if(kind==="artwork-copy" ||
    (kind==="custom-glb" && assetLibrary.get($("library-asset-select").value)?.category==="artwork"))
    return layerState.groups.artwork;
  return layerState.groups.planting;
}
// v3.1: click a palette item once to enter continuous placement. Clicking
// the same item again, or Escape, disables it. All tools remain source-safe.
function isRepeatablePlacement(kind){
  return kind==="custom-glb"||CONTEXT_CATALOG.some(item=>item.kind===kind);
}
function syncAssetPlacementUI(){
  document.querySelectorAll("[data-add-extra]").forEach(button=>{
    const active=placementMode===button.dataset.addExtra;
    button.classList.toggle("is-placing",active);
    button.setAttribute("aria-pressed",String(active));
  });
  const libraryActive=placementMode==="custom-glb";
  $("library-place").classList.toggle("is-placing",libraryActive);
  $("library-place").setAttribute("aria-pressed",String(libraryActive));
  $("asset-placement-status").textContent=isRepeatablePlacement(placementMode)
    ? "🟢 연속 배치 ON · "+(CONTEXT_CATALOG.find(item=>item.kind===placementMode)?.label||"내 GLB")+
      " · 화면을 클릭할 때마다 추가 / 같은 버튼 다시 누르면 OFF / Esc 종료"
    : "⚪ 배치 OFF · 에셋 버튼 → 화면 연속 클릭 / 같은 버튼으로 OFF / Esc 종료";
}
function stopAssetPlacement(){
  placementMode=null;
  $("placement-hint").hidden=true;
  if(gizmoRequested&&selectedCanEdit())transform.attach(selectedRoot);
  syncAssetPlacementUI();
}
function setPlacement(kind) {
  if(placementMode===kind){stopAssetPlacement();return;}
  const group=groupForPlacement(kind);
  if (approvedMaster || group.locked || !group.visible) return notify("잠긴 레이어나 숨겨진 레이어에는 오브제를 추가할 수 없습니다.");
  placementMode = kind;
  transform.detach();
  $("placement-hint").hidden = false;
  $("placement-hint").textContent =
    "🟢 연속 배치 · 현장 클릭마다 "+(CONTEXT_CATALOG.find(item=>item.kind===kind)?.label||"내 GLB")+
    " 추가 · 같은 에셋 버튼 또는 Esc로 종료";
  syncAssetPlacementUI();
  notify("연속 배치 ON · 같은 버튼을 다시 누르거나 Esc로 종료할 수 있습니다.");
}
function createPlacedExtra(kind, position) {
  const group=groupForPlacement(kind);
  if (approvedMaster || group.locked || !group.visible)
    return notify("MASTER 승인 또는 에셋 레이어 잠금/숨김으로 배치할 수 없습니다.");
  const before = editSnapshot();
  const assetId=kind==="custom-glb"?$("library-asset-select").value:null;
  if(kind==="custom-glb" && !assetLibrary.has(assetId))return notify("에셋을 선택하세요.");
  const root = makeExtra(kind, nextExtraId++,kind==="point-light"?4:2,assetId,assetLibrary,artRoot);
  root.position.copy(position);
  if (kind.includes("light") && kind!=="point-light") root.position.y += 3;
  extrasRoot.add(root);
  if (!kind.includes("light")) {
    snapRootToSurface(root, siteRoot, { allowFallback: !siteSourceFile,
      offset: toFinite($("ground-offset").value, 0, -20, 50) });
  }
  selectRoot(root);
  if(isRepeatablePlacement(placementMode))transform.detach();
  updateExtrasStatus();
  commit(before);
  return root;
}
function deleteSelectedExtra() {
  if (!selectedCanEdit() || selectedRoot === artRoot || !selectedRoot.parent) return;
  const before = editSnapshot();
  const deletedId=selectedRoot.userData.extraKind==="custom-glb" &&
    selectedRoot.userData.assetCategory==="artwork"?selectedRoot.userData.assetId:null;
  selectedRoot.parent.remove(selectedRoot);
  selectRoot(artRoot);
  if(deletedId && !extrasRoot.children.some(o=>o.userData.assetId===deletedId)){
    assetLibrary.delete(deletedId);
    clearUndo(); // discarded source can't be resurrected from an obsolete undo snapshot
    refreshAssetLibraryUI();
    notify("추가 작품과 원본 GLB 슬롯을 정리했습니다. 복원하려면 GLB를 다시 불러오세요.");
  }else{
    commit(before);
    notify("선택한 오브제를 삭제했습니다. Ctrl+Z로 복원할 수 있습니다.");
  }
  updateMultiArtStatus();
}
function groundSelected({ silent = false } = {}) {
  if (!selectedCanEdit()) return null;
  if (selectedRoot !== artRoot && extraLight(selectedRoot)) {
    if (!silent) notify("조명은 공중 설치가 가능하므로 자동 밀착하지 않습니다. 현장 클릭 재배치에서 높이를 조정하세요.");
    return null;
  }
  const before = editSnapshot();
  // Artwork with a linked plinth must touch the site at the PLINTH bottom,
  // not at the sculpture's raised bottom.
  const linked=selectedRoot===artRoot?linkedPlinths():[];
  const snapTarget=linked[0]||selectedRoot;
  const result = snapRootToSurface(snapTarget, siteRoot, {
    allowFallback: !siteSourceFile,
    offset: toFinite($("ground-offset").value, 0, -20, 50)
  });
  if (result) {
    if(linked.length){
      artRoot.position.y+=result.deltaY;
      for(const other of linked.slice(1))other.position.y+=result.deltaY;
      updateLight();
    }
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
  const linked=selectedRoot===artRoot?linkedPlinths():[];
  if(linked.length){
    const assembly=artworkAssemblyBounds();
    const center=assembly.getCenter(new THREE.Vector3());
    const delta=new THREE.Vector3(
      hit.point.x-center.x,hit.point.y+toFinite($("ground-offset").value,0,-20,50)-assembly.min.y,
      hit.point.z-center.z
    );
    artRoot.position.add(delta);
    translateLinkedPlinths(delta);
    updateLight();
  } else {
    selectedRoot.position.x = hit.point.x;
    selectedRoot.position.z = hit.point.z;
    if (selectedRoot !== artRoot && extraLight(selectedRoot)) {
    selectedRoot.position.y = hit.point.y + 3 + toFinite($("ground-offset").value, 0, -20, 50);
    } else {
      const box = new THREE.Box3().setFromObject(selectedRoot);
      selectedRoot.position.y += hit.point.y + toFinite($("ground-offset").value, 0, -20, 50) - box.min.y;
    }
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
  if(spatialBridge?.handleCanvasClick(event,mouseMoved))return;
  if (mouseMoved || transform.dragging || event.button !== 0) return;
  if (placementMode) {
    const hit = pickPlacement(event);
    if (!hit) { notify("해당 지점에서 위쪽 표면을 찾을 수 없습니다. 현장 메시와 각도를 확인하세요."); return; }
    const kind = placementMode;
    const repeating=isRepeatablePlacement(kind);
    if(kind!=="measure-point"&&!repeating){
      placementMode=null;
      $("placement-hint").hidden=true;
      syncAssetPlacementUI();
    }
    if (kind === "measure-point") {
      addMeasuredPoint(hit.point);
    } else if (kind === "art-anchor") {
      ["x","y","z"].forEach((axis,i)=>{$("anchor-"+axis).value=hit.point.toArray()[i].toFixed(4);});
      $("anchor-status").textContent="현장 클릭 기준점 "+hit.point.toArray().map(n=>n.toFixed(3)).join(" / ")+"m · 작품 이동 버튼을 눌러 적용하세요.";
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
  if (!first) { clearCanvasSelection(); return; }
  let candidate = first.object;
  while (candidate.parent && candidate.parent !== extrasRoot && candidate.parent !== artRoot) candidate = candidate.parent;
  if (candidate.parent === extrasRoot) selectRoot(candidate,true);
  else selectRoot(artRoot,true);
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
  if ($("auto-ground").checked && !(selectedRoot===artRoot&&linkedPlinths().length) &&
      el.dataset.transform === "position" &&
      ["x","z"].includes(el.dataset.axis) && !extraLight(selectedRoot)) {
    snapRootToSurface(selectedRoot, siteRoot, {
      allowFallback: !siteSourceFile,
      offset: toFinite($("ground-offset").value, 0, -20, 50)
    });
  }
  if(el.dataset.transform==="position" && selectedRoot!==artRoot)
    shiftGroupMembers(selectedRoot,selectedRoot.position.clone().sub(oldPosition));
  if(el.dataset.transform==="position" && selectedRoot===artRoot)
    translateLinkedPlinths(selectedRoot.position.clone().sub(oldPosition));
  commit(before);
  updateInspector();
  if(selectedRoot===artRoot)updateLight();
  refreshSelectionOutline();
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
    if(!isSite && linkedPlinths().length)
      throw Error("작품 연결 기단을 먼저 삭제한 후 원본 작품을 교체하세요.");
    const siteStats = isSite ? inspectSiteGeometry(model) : null;
    const inspected = isSite ? inspectImportedSite(model) : null;
    if (approvedMaster || op !== (isSite ? activeSiteOperation : activeArtOperation)) return;
    if (isSite) {
      siteViewport.reset();
      invalidateSiteMeshIndex(siteRoot);
      clearGroup(siteRoot);
      siteRoot.add(model);
      resetSitePreviewUI();
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
      const siteSphere=new THREE.Box3().setFromObject(siteRoot).getBoundingSphere(new THREE.Sphere());
      const toArt=siteSphere.center.distanceTo(artworkTarget());
      if(shouldAutoFocusImportedSite(siteSphere.radius,toArt))
        fitCameraToBounds(new THREE.Box3().setFromObject(siteRoot),"대형 현장 자동 맞춤");
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
    visualVariants:structuredClone(visualVariants),
    cameraBookmarks:structuredClone(cameraBookmarks),
    navSpeed: +$("nav-speed").value,
    lightPreset: $("light-preset").value,
    artwork: { source: artFileName, transform: snapshot(), locked: approvedMaster, revision, uniformScale: $("uniform-scale").checked },
    render:currentRenderConfig(),
    placementReference:currentPlacementReference(),
    masterSnapshots,
    collaboration:collaborationBridge?.getState(),
    spatialReview:spatialBridge?.getState(),
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
      (data.visualVariants !== undefined && !validStoredVisualVariants(data.visualVariants)) ||
       (data.cameraBookmarks !== undefined && !validCameraBookmarks(data.cameraBookmarks)) ||
      (data.placementReference !== undefined && !validPlacementReference(data.placementReference)) ||
      (data.site.unit !== undefined && !Object.hasOwn(SITE_UNIT_TO_M,data.site.unit)) ||
      (data.site.up !== undefined && !["y","z"].includes(data.site.up)) ||
      (data.site.alignment !== undefined && !validSiteAlignment(data.site.alignment)) ||
      (data.site.planAlignment !== undefined && !validPlanAlignment(data.site.planAlignment)) ||
      (data.groundPlacement !== undefined &&
        (!data.groundPlacement || typeof data.groundPlacement.auto !== "boolean" ||
          typeof data.groundPlacement.offset !== "number" ||
          !Number.isFinite(data.groundPlacement.offset) ||
          data.groundPlacement.offset < -20 || data.groundPlacement.offset > 50)) ||
      (data.collaboration !== undefined && !validateCollaborationState(data.collaboration)) ||
      (data.spatialReview !== undefined && !validSpatialReview(data.spatialReview)) ||
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
  // Avoid Math.max(...ids): a large planting plan can exceed JS argument limits.
  nextExtraId = extrasRoot.children.reduce((max,root)=>
    Math.max(max,root.userData.extraId+1),1);
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
  resetSitePreviewUI();
  restorePlacementReference(data.placementReference);
  if (Array.isArray(data.masterSnapshots)) {
    masterSnapshots = structuredClone(data.masterSnapshots);
  } else {
    // Backwards-compatible v0.1 JSON had only a boolean lock, not a snapshot.
    masterSnapshots = approvedMaster ? [masterSnapshot()] : [];
  }
  renderMasterHistory();
  if(collaborationBridge)collaborationBridge.setState(data.collaboration);
  if(spatialBridge)spatialBridge.setState(data.spatialReview);
  for(const slot of VISUAL_SLOTS)delete visualVariants[slot];
  Object.assign(visualVariants,structuredClone(data.visualVariants||{}));
  for(const slot of CAMERA_SLOTS)delete cameraBookmarks[slot];
  Object.assign(cameraBookmarks,structuredClone(data.cameraBookmarks||{}));
  masterPreviewReturn=null;
  refreshCameraBookmarks();
  syncLock();
  refreshVisualSlots();
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
      siteViewport.reset();
      invalidateSiteMeshIndex(siteRoot);
      clearGroup(siteRoot);
      siteRoot.add(siteModel);
      resetSitePreviewUI();
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

// v2.9 camera-only bookmarks. They are independent from A/B/C scene variants.
function currentCameraPose(){
  return {position:camera.position.toArray(),target:orbit.target.toArray(),fov:camera.fov};
}
function setCameraOnly(pose){
  camera.position.fromArray(pose.position);
  orbit.target.fromArray(pose.target);
  camera.fov=pose.fov;
  const distance=camera.position.distanceTo(orbit.target);
  orbit.maxDistance=Math.max(800,distance*3);
  camera.near=Math.max(.02,Math.min(.5,distance/10000));
  camera.far=Math.max(3000,distance*8);
  camera.updateProjectionMatrix();
  orbit.update();
  $("camera-focal").value=String(Math.round(camera.getFocalLength()));
  $("camera-focal-value").textContent=Math.round(camera.getFocalLength())+" mm";
  updateNavigationSpeed();
}
function refreshCameraBookmarks(){
  $("camera-bookmarks-status").textContent="시점 "+savedCameraCount(cameraBookmarks)+"/3 저장됨"+
    (approvedMaster?" · 승인 중에도 카메라만 조정 가능":"");
  document.querySelectorAll("[data-camera-load]").forEach(button=>{
    button.disabled=!cameraBookmarks[button.dataset.cameraLoad];
  });
}
function saveCameraBookmark(slot){
  try{
    const result=bookmarkCamera(cameraBookmarks,slot,currentCameraPose());
    Object.assign(cameraBookmarks,result);
    refreshCameraBookmarks();
    notify("카메라 "+slot+"번 시점 저장 · 프로젝트 JSON/ZIP에도 포함됩니다.");
  }catch(error){notify(error.message);}
}
function loadCameraBookmark(slot){
  const pose=cameraBookmarks[slot];
  if(!pose)return notify("카메라 "+slot+"번에 저장된 시점이 없습니다.");
  masterPreviewReturn=null;
  setCameraOnly(pose);
  refreshMasterPreviewUI();
  notify("카메라 "+slot+"번 시점 복원 · 작품·현장·MASTER 변경 없음");
}
function refreshMasterPreviewUI(){
  const available=masterBatchReady();
  $("master-preview-apply").disabled=!available;
  $("master-render-preflight").disabled=!available;
  if(!available)masterPreviewReturn=null;
  $("master-preview-return").disabled=!masterPreviewReturn;
  if(!available)$("master-preview-status").textContent=
    "MASTER 승인 후 8개 시점을 하나씩 검토할 수 있습니다.";
}
function previewMasterCamera(){
  if(!masterBatchReady())return notify("MASTER VIEW 승인 후 미리볼 수 있습니다.");
  const approved=masterSnapshots[masterSnapshots.length-1];
  const consistency=masterConsistency(approved,baselineForMaster());
  if(!consistency.ok)return notify("승인 장면과 현재 장면이 일치하지 않아 미리보기를 중단했습니다.");
  const bounds=new THREE.Box3().setFromObject(artRoot);
  if(bounds.isEmpty())return notify("작품 모델이 없어 시점을 만들 수 없습니다.");
  const approvedCamera={...approved.camera,
    fov:Number.isFinite(approved.camera.fov)?approved.camera.fov:camera.fov};
  const previews=createStandardCameras(approvedCamera,bounds);
  const selected=previews.find(view=>view.key===$("master-preview-view").value);
  if(!selected)return;
  if(!masterPreviewReturn)masterPreviewReturn={
    pose:currentCameraPose(),near:camera.near,far:camera.far,maxDistance:orbit.maxDistance
  };
  setCameraOnly(selected);
  $("master-preview-status").textContent="미리보기 "+selected.label+
    " · 승인 작품·배치·재질 변경 없음";
  refreshMasterPreviewUI();
}
function returnFromMasterPreview(){
  const saved=masterPreviewReturn;
  if(!saved)return;
  setCameraOnly(saved.pose);
  camera.near=saved.near;
  camera.far=saved.far;
  orbit.maxDistance=saved.maxDistance;
  camera.updateProjectionMatrix();orbit.update();
  masterPreviewReturn=null;
  $("master-preview-status").textContent="미리보기 전 카메라로 복귀 · MASTER 변경 없음";
  refreshMasterPreviewUI();
}
function preflightMasterRender(){
  if(!masterBatchReady())return;
  const master=masterSnapshots[masterSnapshots.length-1];
  const consistency=masterConsistency(master,baselineForMaster());
  const bounds=new THREE.Box3().setFromObject(artRoot);
  const valid=!bounds.isEmpty()&&consistency.ok;
  const render=targetSize(viewport.clientWidth,viewport.clientHeight,"landscape16x9",
    Number($("batch-quality").value),renderer.capabilities.maxTextureSize,14000000);
  $("master-render-preflight-status").textContent=[
    (valid?"✓ MASTER 승인본 일치":"⚠ MASTER 승인본 불일치"),
    "출력 예정 8장 · "+render.width+" × "+render.height+"px (16:9)",
    siteSourceFile?"실제 현장 모델 확인됨":"예시 현장 — 실제 현장 파일 권장",
    artSourceFile?"실제 작품 파일 확인됨":"샘플 작품 — 원본 작품 파일 권장",
    render.limited?"GPU 제한으로 출력 크기 축소됨":"GPU 출력 크기 범위 내",
    "WebGL 이미지이며 현장 실측·안전성은 별도 확인 필요",
    ...consistency.issues
  ].join(" · ");
}
function masterBatchReady() {
  return approvedMaster && masterSnapshots.length > 0;
}
function syncBatchAvailability(){
  $("export-master-pack").disabled = !masterBatchReady();
  if(!masterBatchReady())$("batch-status").textContent="먼저 MASTER VIEW를 승인하면 일괄 출력할 수 있습니다.";
  refreshMasterPreviewUI();
}
function baselineForMaster(){
  return {
    artworkTransform:snapshot(),
    extras:serializeExtras(extrasRoot),
    library:libraryManifest(assetLibrary),
    layers:structuredClone(layerState),
    material:structuredClone(artworkMaterialState),
    artworkFile:artFileName,siteFile:siteFileName,
    placementReference:currentPlacementReference(),
    siteSetup:{unit:$("site-unit").value,up:$("site-up").value,
      centerOrigin:$("site-center-origin").checked}
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
async function createVisualOptionsSheet(images){
  const width=520,height=293,pad=16,top=62,foot=46;
  const canvas=document.createElement("canvas");
  canvas.width=(width+pad)*images.length+pad;canvas.height=top+height+foot+pad;
  const ctx=canvas.getContext("2d");
  if(!ctx)throw Error("시안 비교 시트를 만들 수 없습니다.");
  ctx.fillStyle="#161a1e";ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.fillStyle="#fff";ctx.font="bold 25px Arial";
  ctx.fillText("AXOO / VISUAL OPTIONS",pad,38);
  for(let i=0;i<images.length;i++){
    const [slot,url]=images[i],img=new Image();
    img.src=url;await img.decode();
    const x=pad+(width+pad)*i;
    ctx.drawImage(img,x,top,width,height);
    ctx.fillStyle="#fafafa";ctx.font="bold 18px Arial";
    ctx.fillText(slot+" / ARTWORK VISUAL",x,top+height+31);
  }
  return canvas.toDataURL("image/png").split(",")[1];
}
async function exportVisualOptions(){
  const slots=VISUAL_SLOTS.filter(slot=>visualVariants[slot]);
  if(!slots.length)return notify("먼저 A/B/C 중 하나 이상을 저장하세요.");
  for(const slot of slots){
    const option=visualVariants[slot];
    if(!visualVariantSourceMatches(option))
      return notify(slot+"안의 저장된 원본 작품·현장·참조 에셋이 현재와 다릅니다. ZIP으로 복원하세요.");
    if(option.render.environmentMode==="hdr" &&
        option.render.environmentFile!==hdrSourceFile?.name)
      return notify(slot+"안 저장 당시 HDRI 파일이 없습니다. 원본 HDRI를 다시 불러오세요.");
  }
  const before=captureSceneIntegrity({artRoot,siteRoot,extrasRoot,artworkMaterialState,layerState});
  const restorePreview=siteViewport.suspend();
  const original={
    width:Math.max(1,viewport.clientWidth),height:Math.max(1,viewport.clientHeight),
    pixelRatio:renderer.getPixelRatio(),toneMapping:renderer.toneMapping,
    exposure:renderer.toneMappingExposure,shadow:renderer.shadowMap.enabled
  };
  const size=targetSize(original.width,original.height,"landscape16x9",
    Number($("visual-options-resolution").value),renderer.capabilities.maxTextureSize,9000000);
  let status="시안 렌더 준비 중…";
  $("visual-options-export-status").textContent=status;
  $("visual-options-export").disabled=true;
  const images=[],zip=new JSZip();
  let failure=null;
  try{
    assertRendererAvailable(renderer);
    renderer.setPixelRatio(1);
    renderer.setSize(size.width,size.height,false);
    for(const slot of slots){
      const option=visualVariants[slot];
      const stage=createVisualOptionStage({
        option,artRoot,siteRoot,floor,sceneEnvironment:scene.environment,
        neutralEnvironment,hdrEnvironment:hdrTexture,
        library:assetLibrary,originalArtMaterials,
        sourceArtFile:artFileName,sourceSiteFile:siteFileName
      });
      try{
        renderer.shadowMap.enabled=option.shadows;
        renderer.toneMapping=option.render.visual?.toneCurve==="neutral"?
          THREE.NeutralToneMapping:THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure=option.lighting.exposure??1;
        stage.camera.aspect=size.width/size.height;
        stage.camera.updateProjectionMatrix();
        renderer.render(stage.scene,stage.camera);
        const png=renderer.domElement.toDataURL("image/png");
        verifyPngCapture(png,size.width,size.height);
        zip.file(slot+"-visual.png",png.split(",")[1],{base64:true});
        images.push([slot,png]);
      }finally{stage.release();}
    }
  }catch(error){failure=error;console.error(error);}
  finally{
    renderer.shadowMap.enabled=original.shadow;
    renderer.toneMapping=original.toneMapping;
    renderer.toneMappingExposure=original.exposure;
    renderer.setPixelRatio(original.pixelRatio);
    renderer.setSize(original.width,original.height,false);
    restorePreview();
    $("visual-options-export").disabled=false;
  }
  if(failure){
    $("visual-options-export-status").textContent="시안 출력 실패 · "+failure.message;
    return notify("모델링 시안 비교 이미지 생성 실패: "+failure.message);
  }
  const after=captureSceneIntegrity({artRoot,siteRoot,extrasRoot,artworkMaterialState,layerState});
  if(before!==after){
    $("visual-options-export-status").textContent="시안 모델이 변경된 것으로 감지돼 다운로드 차단";
    return notify("검증 오류: 장면 보존 조건을 충족하지 못했습니다.");
  }
  try{
    const review=checkVisualReadiness();
    const manifest=visualPackageManifest({
      project:$("project-name").value,slots,width:size.width,height:size.height,
      warnings:review.warnings
    });
    zip.file("00-visual-comparison.png",await createVisualOptionsSheet(images),{base64:true});
    zip.file("visual-metadata.json",JSON.stringify(manifest,null,2));
    const blob=await zip.generateAsync({type:"blob",compression:"DEFLATE",compressionOptions:{level:4}});
    download(safeFileName()+"-A_B_C-visuals.zip",blob);
    $("visual-options-export-status").textContent=
      slots.join(" / ")+"안 시안 이미지 "+slots.length+"장 + 비교 시트 · "+
      size.width+" × "+size.height+"px · 원본 작품·현장 변화 없음"+
      (review.warnings.length?" · 사전 검토 경고 "+review.warnings.length+"건":"");
    notify("A/B/C 시안 이미지·비교 시트 ZIP 출력 완료 · 편집 상태 보존");
  }catch(error){
    $("visual-options-export-status").textContent="시안 ZIP 생성 실패 · "+error.message;
    notify("시안 이미지 ZIP 저장 실패: "+error.message);
  }finally{refreshVisualSlots();}
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
  const restoreSitePreview=siteViewport.suspend();
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
  const originalVisual=currentVisualSettings();
  const states={
    grid:grid.visible,gizmo:transform.getHelper().visible,
    sun:sunGuide.visible,selectionOutline:selectionOutline.visible,
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
    assertRendererAvailable(renderer);
    // Image capture is synchronous so the user's edit state cannot interleave.
    for(const [id,value] of Object.entries(master.lighting || {})){
      if(lights[id]!==undefined && Number.isFinite(value))$(id).value=String(value);
    }
    $("shadows").checked=!!master.shadows;
    if(master.lightPreset!==undefined)$("light-preset").value=master.lightPreset;
    if(master.render){
      $("env-mode").value=master.render.environmentMode==="hdr" ? "hdr" :
        master.render.environmentMode;
      $("env-strength").value=String(master.render.envIntensity);
    }
    if(master.render?.visual){
      const visual=normalizeVisualSettings(master.render.visual);
      $("visual-tone").value=visual.toneCurve;
      $("visual-sky").value=visual.sky;
      $("visual-shadows").value=visual.shadowProfile;
    }
    updateLight();applyEnvironment();
    renderer.setPixelRatio(1);
    renderer.setSize(size.width,size.height,false);
    grid.visible=false;
    transform.getHelper().visible=false;
    sunGuide.visible=false;
    selectionOutline.visible=false;
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
      verifyPngCapture(data,size.width,size.height);
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
    $("visual-tone").value=originalVisual.toneCurve;
    $("visual-sky").value=originalVisual.sky;
    $("visual-shadows").value=originalVisual.shadowProfile;
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
    selectionOutline.visible=states.selectionOutline;
    if(siteHighlight)siteHighlight.visible=states.highlight;
    for(const [node,wasVisible] of editorIcons)node.visible=wasVisible;
  }
  if(renderError){
    restoreSitePreview();
    $("batch-status").textContent="일괄 렌더 실패: "+(renderError.message || "GPU 오류");
    syncBatchAvailability();
    return notify("8컷 렌더 실패 · 기존 장면은 복원됐습니다.");
  }
  const sceneAfter=captureSceneIntegrity({
    artRoot,siteRoot,extrasRoot,artworkMaterialState,layerState
  });
  restoreSitePreview();
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
  // Suspension removes editor-only ghost/section materials. Compare source
  // identities in that suspended state, not ephemeral preview clone UUIDs.
  const restoreSitePreview=siteViewport.suspend();
  const sceneBefore=captureSceneIntegrity({
    artRoot,siteRoot,extrasRoot,artworkMaterialState,layerState
  });
  const w=Math.max(1,Math.round(viewport.clientWidth));
  const h=Math.max(1,Math.round(viewport.clientHeight));
  const originalRatio=renderer.getPixelRatio();
  const originalAspect=camera.aspect;
  const originalGrid=grid.visible;
  const originalHelper=transform.getHelper().visible;
  const originalSun=sunGuide.visible;
  const originalHighlight=siteHighlight?.visible;
  const originalSelection=selectionOutline.visible;
  const editorIcons=[];
  extrasRoot.traverse(obj=>{
    if(obj.userData.editorOnly)editorIcons.push([obj,obj.visible]);
  });
  let png=null,size=null,captureFailure=null,sceneAfter=null;
  try {
    assertRendererAvailable(renderer);
    size=targetSize(w,h,$("render-aspect").value,
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
    selectionOutline.visible=false;
    assertRendererAvailable(renderer);
    renderer.render(scene,camera);
    png=renderer.domElement.toDataURL("image/png");
    verifyPngCapture(png,size.width,size.height);
  }catch(error){
    captureFailure=error;
    console.error(error);
  }finally{
    grid.visible=originalGrid;
    transform.getHelper().visible=originalHelper;
    sunGuide.visible=originalSun;
    if(siteHighlight)siteHighlight.visible=originalHighlight;
    selectionOutline.visible=originalSelection;
    // Do not turn on formerly hidden light markers/layer editor objects.
    for(const [node,wasVisible] of editorIcons)node.visible=wasVisible;
    camera.aspect=originalAspect;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(originalRatio);
    renderer.setSize(w,h,false);
    try{
      sceneAfter=captureSceneIntegrity({
        artRoot,siteRoot,extrasRoot,artworkMaterialState,layerState
      });
    }finally{restoreSitePreview();}
  }
  if(captureFailure){
    return notify("고해상도 렌더 실패: "+(captureFailure.message||"GPU 메모리/출력 설정 확인"));
  }
  if(sceneBefore!==sceneAfter)
    return notify("PNG 출력 차단: 조형물·현장·선택 상태 복원 검증에 실패했습니다.");
  const link=document.createElement("a");
  link.href=png;
  link.download=safeFileName()+"-"+size.width+"x"+size.height+".png";
  document.body.appendChild(link);link.click();link.remove();
  notify("원본 작품·현장 보존 검증 통과 · "+size.width+" × "+size.height+
    " PNG 저장 완료"+(size.limited?" (GPU 한도에 맞춰 축소)":""));
}
async function exportGLB() {
  const restoreSitePreview=siteViewport.suspend();
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
  } finally {
    restoreSitePreview();
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
  if(siteSourceFile)fitCameraToBounds(new THREE.Box3().setFromObject(siteRoot),
    "현장 단위 변경 후 자동 맞춤");
  notify("현장 단위 보정 적용 · 실제 크기를 확인하세요.");
});
$("site-up").addEventListener("change", () => {
  if (approvedMaster) return;
  applySiteUnits();
  if(siteSourceFile)fitCameraToBounds(new THREE.Box3().setFromObject(siteRoot),
    "현장 높이축 변경 후 자동 맞춤");
  notify("현장 높이축 보정 적용");
});
$("site-preset").addEventListener("change", e => {
  if (approvedMaster) return;
  activeProjectOperation++;
  buildSite(e.target.value); notify("예시 현장 프리셋을 적용했습니다.");
});
$("site-view-apply").addEventListener("click",applySitePreview);
$("site-view-reset").addEventListener("click",resetSitePreviewUI);
$("site-navigation-performance").addEventListener("change",setupNavigationPerformance);
$("site-file").addEventListener("change", e => importModel(e.target.files[0], true));
$("art-file").addEventListener("change", e => importModel(e.target.files[0], false));
$("multi-art-file").addEventListener("change",e=>{
  addArtworkGLB(e.target.files[0]);e.target.value="";
});
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
  syncAssetPlacementUI();
  $("placement-hint").textContent = "대상 오브제를 옮길 실제 현장 바닥을 클릭하세요 · Esc 취소";
  $("placement-hint").hidden = false;
});
$("plan-pick-center").addEventListener("click", () => {
  if (approvedMaster) return;
  if (!loadedPlanTexture) return notify("먼저 배치도 이미지를 불러오세요.");
  placementMode = "plan-center";
  syncAssetPlacementUI();
  $("placement-hint").textContent = "배치도 중심을 정렬할 현장 위치를 클릭하세요 · Esc 취소";
  $("placement-hint").hidden = false;
});
$("floor-map").addEventListener("change", () => { if (!approvedMaster) updateGround(); });
$("grid").addEventListener("change", e => { grid.visible = e.target.checked; });
$("sun-helper").addEventListener("change", e => { sunGuide.visible = e.target.checked; });
$("nav-speed").addEventListener("input",updateNavigationSpeed);
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
for(const input of ["visual-tone","visual-sky","visual-shadows"])
  $(input).addEventListener("change",()=>{applyVisualLook();checkVisualQuality();});
$("visual-guide").addEventListener("change",applyVisualGuide);
document.querySelectorAll("[data-frame]").forEach(btn=>
  btn.addEventListener("click",()=>sceneFrame(btn.dataset.frame)));
document.querySelectorAll("[data-visual-lens]").forEach(btn=>
  btn.addEventListener("click",()=>{
    const focal=Number(btn.dataset.visualLens);
    if(!CAMERA_LENSES.includes(focal))return;
    $("camera-focal").value=String(focal);
    camera.setFocalLength(focal);
    camera.updateProjectionMatrix();
    $("camera-focal-value").textContent=Math.round(camera.getFocalLength())+" mm";
    $("visual-frame-status").textContent="렌즈 "+focal+"mm 적용 · 3D 작품 크기와 위치 불변";
  }));
$("visual-quality-check").addEventListener("click",checkVisualQuality);
$("camera-focal").addEventListener("input",e=>{
  camera.setFocalLength(Number(e.target.value));
  camera.updateProjectionMatrix();
  $("camera-focal-value").textContent=Math.round(camera.getFocalLength())+" mm";
});
$("render-aspect").addEventListener("change",updateRenderSizeLabel);
$("render-resolution").addEventListener("change",updateRenderSizeLabel);
document.querySelectorAll("[data-render-look]").forEach(button=>
  button.addEventListener("click",()=>{
    if(approvedMaster)return notify("승인된 MASTER에서는 조명 룩을 변경할 수 없습니다. 잠금을 해제해 주세요.");
    const look=ARCHVIZ_LOOKS[button.dataset.renderLook];
    if(!look)return;
    $("light-preset").value=look.lightPreset;
    const values={
      "sun-azimuth":look.azimuth,"sun-elevation":look.elevation,
      "sun-strength":look.sun,ambient:look.ambient,exposure:look.exposure
    };
    for(const [id,value] of Object.entries(values))$(id).value=String(value);
    $("visual-shadows").value=look.shadowProfile;
    $("visual-tone").value=look.toneCurve;
    $("visual-sky").value=look.sky;
    $("env-mode").value=look.environmentMode;
    $("env-strength").value=String(look.environmentIntensity);
    updateLight();applyEnvironment();checkVisualQuality();
    document.querySelectorAll("[data-render-look]").forEach(b=>{
      const selected=b.dataset.renderLook===button.dataset.renderLook;
      b.classList.toggle("is-active",selected);
      b.setAttribute("aria-pressed",String(selected));
    });
    $("render-look-status").textContent=look.label+
      " · 조명·반사·하늘·그림자만 변경 · 작품/건물 원본 불변";
    notify("렌더 룩 적용: "+look.label);
  }));
$("light-preset").addEventListener("change", e => {
  document.querySelectorAll("[data-render-look]").forEach(b=>{
    b.classList.remove("is-active");b.setAttribute("aria-pressed","false");
  });
  const presets = {
    clear: {az:45, el:45, sun:2.4, ambient:.65, exposure:1},
    cloudy: {az:50,el:58,sun:.85,ambient:1.1,exposure:1.05},
    golden: {az:65,el:17,sun:2.7,ambient:.6,exposure:1.0},
    night: {az:90,el:8,sun:0,ambient:.35,exposure:.85}
  };
  const p = presets[e.target.value];
  if (p) {
    for (const [id,value] of Object.entries({"sun-azimuth":p.az,"sun-elevation":p.el,"sun-strength":p.sun,ambient:p.ambient,exposure:p.exposure})) $(id).value=value;
  }
  updateLight();
});
document.querySelectorAll("[data-add-extra]").forEach(el => el.addEventListener("click", () => setPlacement(el.dataset.addExtra)));
$("context-search").addEventListener("input",refreshContextPalette);
$("context-category").addEventListener("change",refreshContextPalette);
$("extra-list-search").addEventListener("input",updateExtrasStatus);
$("extra-layer-search").addEventListener("input",renderExtraLayerRows);

$("library-toggle").addEventListener("click",()=>{
  const expanded=$("library-toggle").getAttribute("aria-expanded")==="true";
  $("library-toggle").setAttribute("aria-expanded",String(!expanded));
  $("library-toggle").textContent=!expanded?"📂 내 GLB 에셋 라이브러리 닫기":"📂 내 GLB 에셋 라이브러리 열기";
  document.documentElement.classList.toggle("studio-library-open",!expanded);
  $("asset-library-panel").hidden=expanded;
  if(!expanded)refreshAssetLibraryUI();
});
$("extra-fit-height").addEventListener("click",applyContextHeight);
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
  syncAssetPlacementUI();
  $("placement-hint").hidden=false;
  $("placement-hint").textContent="실제 현장 표면의 두 점을 차례로 클릭 · ESC 취소";
  $("measure-site-status").textContent="첫 번째 점을 선택하세요.";
});
$("measure-site-clear").addEventListener("click",()=>{
  measuredPoints=[];
  if(placementMode==="measure-point"){placementMode=null;$("placement-hint").hidden=true;syncAssetPlacementUI();}
  $("measure-site-status").textContent="측정점 초기화됨";
});
$("measure-objects").addEventListener("click",showPairMeasurement);
$("precision-collision").addEventListener("click",checkInterferences);
$("precision-report").addEventListener("click",exportPrecisionReport);
$("select-artwork").addEventListener("click", () => selectRoot(artRoot,true));
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
$("ground-light-upgrade").addEventListener("click",()=>{
  if(!selectedCanEdit() || selectedRoot?.userData?.extraKind!=="point-light" ||
    (selectedRoot.userData.appearanceVersion||1)>=4)
    return notify("MASTER 잠금 해제 후 기존 바닥조명을 선택하세요.");
  const before=editSnapshot();
  upgradeGroundLight(selectedRoot);
  commit(before);
  updateInspector(true);
  updateExtrasStatus();
  notify("선택한 바닥조명을 작은 매입형으로 변경했습니다 · 원래 형태는 실행 취소로 복원할 수 있습니다.");
});
$("snap").addEventListener("change", snapSetting);
$("sample-art").addEventListener("click", () => {
  if (approvedMaster) return notify("MASTER LOCK 해제 후 작품을 변경하세요.");
  if(extrasRoot.children.some(o=>o.userData.extraKind==="artwork-copy"))
    return notify("기존 복제 작품을 삭제한 뒤 원본을 변경하세요.");
  if(linkedPlinths().length)
    return notify("작품에 연결된 기단을 먼저 삭제한 뒤 원본을 변경하세요.");
  activeArtOperation++;
  activeProjectOperation++;
  setArtwork(sampleArtwork(), "Sample Artwork", { height: 3 }); changeView("main");
});
$("dimension-apply").addEventListener("click",applyArtworkDimensions);
$("plinth-create").addEventListener("click",createPlinth);
$("plinth-update").addEventListener("click",updateSelectedPlinth);
$("plinth-align").addEventListener("click",alignArtworkOnPlinth);
$("anchor-pick").addEventListener("click",()=>{
  if(approvedMaster)return;
  placementMode="art-anchor";
  syncAssetPlacementUI();
  $("placement-hint").hidden=false;
  $("placement-hint").textContent="현장 표면을 클릭해 설치 기준점 선택 · Esc 취소";
});
$("anchor-apply").addEventListener("click",applyArtworkAnchor);
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
  if (!approvedMaster && !validPlacementReference(currentPlacementReference()))
    return notify("설치 기준점 XYZ가 유효하지 않습니다. 10만 m 범위의 숫자를 입력하세요.");
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
  masterPreviewReturn=null;
  refreshMasterPreviewUI();
  notify(approvedMaster ? "MASTER VIEW 승인 · 작품, 현장, 카메라 기준 저장" : "MASTER LOCK 해제 · Revision " + revision);
});
$("restore-master-camera").addEventListener("click", () => {
  masterPreviewReturn=null;restoreMasterCamera(masterSnapshots.length - 1);refreshMasterPreviewUI();
});
document.querySelectorAll("[data-camera-save]").forEach(b=>
  b.addEventListener("click",()=>saveCameraBookmark(b.dataset.cameraSave)));
document.querySelectorAll("[data-camera-load]").forEach(b=>
  b.addEventListener("click",()=>loadCameraBookmark(b.dataset.cameraLoad)));
$("master-preview-apply").addEventListener("click",previewMasterCamera);
$("master-preview-return").addEventListener("click",returnFromMasterPreview);
$("master-render-preflight").addEventListener("click",preflightMasterRender);
$("batch-quality").addEventListener("change",()=>{
  if(masterBatchReady())preflightMasterRender();
});
$("undo").addEventListener("click", undo);
$("redo").addEventListener("click", redo);
["sun-azimuth", "sun-elevation", "sun-strength", "ambient", "exposure", "shadows"]
  .forEach(id => $(id).addEventListener("input", () => {
    $("light-preset").value = "custom";
    updateLight();
  }));
document.querySelectorAll("[data-view]").forEach(el => el.addEventListener("click", () => changeView(el.dataset.view)));
$("focus-selected-quick").addEventListener("click",focusCurrentSelection);
$("focus-site-quick").addEventListener("click",focusImportedSite);
$("focus").addEventListener("click", fitCamera);
$("project-quick-save").addEventListener("click",()=>$("export-project").click());
$("production-audit-run").addEventListener("click",runProductionAudit);
$("production-audit-export").addEventListener("click",()=>{
  const report=runProductionAudit();
  download(safeFileName()+"-v3-production-audit.json",
    new Blob([JSON.stringify({...report,generatedAt:new Date().toISOString()},null,2)],
      {type:"application/json"}));
});
$("installation-check").addEventListener("click",()=>{
  try{assessInstallation();}catch(e){$("installation-check-status").textContent=e.message;}
});
$("pedestrian-eye-near").addEventListener("click",()=>pedestrianCamera("near"));
$("pedestrian-eye-approach").addEventListener("click",()=>pedestrianCamera("approach"));
document.querySelectorAll("[data-option-save]").forEach(el=>
  el.addEventListener("click",()=>saveVisualOption(el.dataset.optionSave)));
document.querySelectorAll("[data-option-load]").forEach(el=>
  el.addEventListener("click",()=>loadVisualOption(el.dataset.optionLoad)));
$("visual-preflight").addEventListener("click",()=>{
  try{checkVisualReadiness();}catch(e){$("visual-preflight-status").textContent=e.message;}
});
$("visual-options-export").addEventListener("click",exportVisualOptions);
$("shot-export").addEventListener("click", exportImage);
$("export-master-pack").addEventListener("click",exportMasterPack);
initVisualReview({
  isMasterApproved:()=>approvedMaster,
  getMaster:()=>masterSnapshots[masterSnapshots.length-1] || null
});
const readinessBridge=initReadiness({getScene:()=>{
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
proposalBridge=initProposalExport({getContext:()=>{
  const master=masterSnapshots[masterSnapshots.length-1] || null;
  const bounding=new THREE.Box3().setFromObject(artRoot);
  const dims=bounding.isEmpty()?new THREE.Vector3(0,0,0):bounding.getSize(new THREE.Vector3());
  return {
    locked:approvedMaster,
    master,
    matchesMaster:!!master && masterConsistency(master,baselineForMaster()).ok,
    config:sceneConfig(),
    readiness:readinessBridge.getReport(),
    precision:collectPrecisionReport(),
    artworkDimensions:dims.toArray(),
    artworkPosition:artRoot.position.toArray()
  };
}});
collaborationBridge=initTeamCollaboration({getContext:()=>{
  const master=masterSnapshots[masterSnapshots.length-1] || null;
  return {
    project:$("project-name").value,
    master,
    history:masterSnapshots,
    locked:approvedMaster,
    matchesMaster:!!master && masterConsistency(master,baselineForMaster()).ok
  };
}});
revisionBridge=initRevisionCompare({getContext:()=>({
  project:$("project-name").value,
  history:masterSnapshots,
  locked:approvedMaster,
  matchesMaster:!!masterSnapshots.length &&
    masterConsistency(masterSnapshots[masterSnapshots.length-1],baselineForMaster()).ok
})});
spatialBridge=initSpatialReview({
  viewport,camera,artRoot,siteRoot,extrasRoot,floor,
  allowExampleFloor:()=>!siteSourceFile,
  getContext:()=>({
    master:masterSnapshots[masterSnapshots.length-1] || null,
    project:$("project-name").value,
    locked:approvedMaster,
    matchesMaster:!!masterSnapshots.length &&
      masterConsistency(masterSnapshots[masterSnapshots.length-1],baselineForMaster()).ok
  })
});
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
    const linked=selectedRoot===artRoot?linkedPlinths():[];
    const target=linked[0]||selectedRoot;
    const result=snapRootToSurface(target,siteRoot,{
      allowFallback:!siteSourceFile,
      offset:toFinite($("ground-offset").value,0,-20,50)
    });
    if(result&&linked.length){
      artRoot.position.y+=result.deltaY;
      for(const other of linked.slice(1))other.position.y+=result.deltaY;
    }
  }
  if(lastDrag && !approvedMaster && selectedMode==="translate" && dragStart){
    const delta=selectedRoot.position.clone().sub(new THREE.Vector3().fromArray(dragStart));
    shiftGroupMembers(selectedRoot,delta);
  }
  if (lastDrag) commit(lastDrag);
  lastDrag = null;
  updateInspector();
  if(selectedRoot===artRoot)updateLight();
  refreshSelectionOutline();
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
  // Maintain solar direction during interactive artwork dragging; do not
  // recompute the expensive shadow fit until the drag is finished.
  const artDelta=artRoot.position.clone().sub(lastSunArtworkPosition);
  if(!approvedMaster && selectedRoot===artRoot){
    translateLinkedPlinths(artDelta);
    lastSunArtworkPosition.copy(artRoot.position);
    sun.position.add(artDelta);
    sun.target.position.add(artDelta);
    fillLight.position.add(artDelta);
    fillLight.target.position.add(artDelta);
    fillLight.target.updateMatrixWorld();
    sun.target.updateMatrixWorld();
  }
  refreshSelectionOutline();
});
renderer.domElement.addEventListener("pointerdown",e=>{
  pointerDown={x:e.clientX,y:e.clientY,button:e.button,pointerId:e.pointerId};
  pointerStartedOnGizmo=!!transform.axis&&!placementMode;
  mouseMoved=false;
});
renderer.domElement.addEventListener("pointermove",e=>{
  if(e.buttons&&pointerDown&&!isCanvasClick(pointerDown,{
    x:e.clientX,y:e.clientY,button:pointerDown.button,pointerId:e.pointerId
  },CLICK_TOLERANCE_PX))mouseMoved=true;
});
renderer.domElement.addEventListener("pointerup",e=>{
  const wasGizmo=pointerStartedOnGizmo;
  const click=!mouseMoved&&!wasGizmo&&isCanvasClick(pointerDown,{
    x:e.clientX,y:e.clientY,button:e.button,pointerId:e.pointerId
  });
  pointerDown=null;
  pointerStartedOnGizmo=false;
  if(!click){mouseMoved=true;return;}
  mouseMoved=false;
  handleSelection(e);
});
renderer.domElement.addEventListener("pointercancel",()=>{
  pointerDown=null;pointerStartedOnGizmo=false;mouseMoved=true;
});
window.addEventListener("keydown", e => {
  if (e.target instanceof HTMLElement && e.target.closest("input,textarea,select,[contenteditable]")) return;
  if (e.key === "Escape" && spatialBridge?.cancel()) { e.preventDefault(); return; }
  if (e.key === "Escape" && placementMode) {
    stopAssetPlacement();
    e.preventDefault();return;
  }
  if (e.key === "Escape" && gizmoRequested) {clearCanvasSelection();e.preventDefault();return;}
  if (e.key.toLowerCase()==="f"&&!e.ctrlKey&&!e.metaKey&&!e.altKey){
    if(e.shiftKey)focusImportedSite();else focusCurrentSelection();
    e.preventDefault();return;
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
  drawMeasurementOverlay();
  spatialBridge?.drawOverlay();
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
updateNavigationSpeed();
refreshCameraBookmarks();
refreshMasterPreviewUI();
refreshContextPalette();
syncContextHeightUI();
checkVisualQuality();
resize();
animate();
notify("3D Studio 준비 완료 · 작품을 클릭하거나 G/R/S로 조작하세요.");
