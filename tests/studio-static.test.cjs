/**
 * Static compatibility and safety checks for the Three.js editor.
 * Run: node tests/studio-static.test.cjs
 * Browser-rendering tests should be added before claiming visual parity
 * with the user's original local Blender viewer.
 */
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const base = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(base, "studio/index.html"), "utf8");
const css = fs.readFileSync(path.join(base, "studio/studio.css"), "utf8");
const js = fs.readFileSync(path.join(base, "studio/studio.js"), "utf8");
const legacy = fs.readFileSync(path.join(base, "index.html"), "utf8");

// The shipped module has multiline imports; the workflow's node --check
// is the real syntax check (stripping imports with a line regex is unsound).
assert.match(js, /from "\.\/layers\.js"/, "v0.6 layer module must be imported");
assert.match(legacy, /href="studio\/"/, "main application links to studio");
assert.match(html, /"three":\s*"https:\/\/cdn\.jsdelivr\.net\/npm\/three@0\.186\.1/, "pin exact Three.js version");
assert.match(html, /type="module" src="\.\/studio\.js"/, "app must be a browser ES module");
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(x => x[1]);
const unique = new Set(ids);
assert.equal(ids.length, unique.size, "duplicate HTML IDs are forbidden");
const javascriptIds = [...js.matchAll(/\$\("([^"]+)"\)/g)].map(x => x[1]);
const absent = [...new Set(javascriptIds)].filter(id => !unique.has(id));
assert.deepEqual(absent, [], "all literal ID lookups must exist in the DOM");
for (const type of ["translate", "rotate", "scale"])
  assert.match(html, new RegExp('data-mode="' + type + '"'), "transform tool missing: " + type);
for (const type of ["main", "eye", "left", "right", "rear", "aerial", "long", "detail"])
  assert.match(html, new RegExp('data-view="' + type + '"'), "camera preset missing: " + type);
for (const form of ["site-file", "art-file", "map-file", "map-width", "uniform-scale", "master-lock"])
  assert.ok(unique.has(form), "critical editor control missing: " + form);
assert.match(js, /new TransformControls/, "mouse translation/rotation/scale gizmo required");
assert.match(js, /new OrbitControls/, "camera orbit/pan/zoom required");
assert.match(js, /new GLTFLoader/, "GLB/GLTF scene import required");
assert.match(js, /new OBJLoader/, "OBJ artwork import required");
assert.match(js, /new STLLoader/, "STL artwork import required");
for (const [ext, loader] of [
  ["obj", "OBJLoader"], ["fbx", "FBXLoader"], ["stl", "STLLoader"],
  ["ply", "PLYLoader"], ["dae", "ColladaLoader"], ["3ds", "TDSLoader"]
]) {
  assert.match(js, new RegExp("new " + loader), "site " + ext + " loader required");
  assert.match(html, new RegExp('\\.' + ext + '(?:,|")'), "site " + ext + " input extension required");
}
assert.match(js, /function inspectSiteGeometry/, "site geometry validation required");
assert.ok(unique.has("site-dimensions"), "site size indicator required");
assert.match(js, /new GLTFExporter/, "GLB model export required");
assert.match(js, /function sceneConfig/, "portable project settings exporter required");
assert.match(js, /function importSceneConfig/, "portable settings importer required");
assert.match(js, /if \(approvedMaster\) return notify\("MASTER LOCK/, "locked models must not be replaced");
assert.match(js, /selectedRoot\.scale\.fromArray\(base\.map/, "proportional scale gizmo enforcement required");
assert.match(js, /const SITE_UNIT_TO_M/, "site unit conversion must exist");
assert.match(js, /function syncGroundAvailability/, "hide redundant ground mapping when site imported");
for (const marker of [
  "function refreshLayers", "function renderSiteLayerRows",
  "function renderExtraLayerRows", "function changeSiteMesh",
  "function changeExtraLayer", "function resetSiteAnnotations"
]) assert.ok(js.includes(marker), "v0.6 layer engine function missing: "+marker);
for (const id of ["layer-manager","layer-groups","site-object-search","site-object-list",
  "site-mesh-count","layer-extra-list","site-selected-name"]) {
  assert.ok(unique.has(id), "v0.6 DOM control missing: "+id);
}
const layerModule=fs.readFileSync(path.join(base,"studio/layers.js"),"utf8");
assert.doesNotThrow(() => new Function(layerModule.replace(/^export /gm,"")), "layer module parses");
assert.match(layerModule,/validateLayerState/, "archive validation of layer state");
assert.match(layerModule,/enumerateSiteMeshes/, "stable source geometry paths");
assert.match(layerModule,/canEditObject/, "selection lock gate");
assert.match(js,/layers:structuredClone\(layerState\)/, "layer state is saved in scene archives");
assert.match(js,/function clearSiteHighlight/, "source selection helper managed separately");
for(const id of ["env-mode","env-file","env-strength","art-material","art-material-color",
  "apply-material","reset-material","camera-focal","render-aspect","render-size-label"])
  assert.ok(unique.has(id), "v0.7 render setting absent: "+id);
for(const token of ["new RGBELoader","function setArtworkMaterial","function restoreOriginalArtworkMaterials",
  "function restoreRenderConfig","function currentRenderConfig","function updateRenderSizeLabel"])
  assert.ok(js.includes(token),"render system wiring missing: "+token);
assert.match(js,/render:currentRenderConfig\(\)/,"render state saved in project JSON/ZIP");
assert.match(js,/assets\/environment/,"HDRI binary included in project ZIP");
const renderModule=fs.readFileSync(path.join(base,"studio/rendering.js"),"utf8");
for(const token of ["validMaterialConfig","validRenderConfig","targetSize","makeMaterial"])
  assert.ok(renderModule.includes(token),"render module contract missing: "+token);


assert.match(js, /function createPlacedExtra/, "mouse placement for new objects");
assert.match(js, /function groundSelected/, "selected surface grounding required");
assert.match(js, /function placeSelectedOnSite/, "click-to-place selected objects required");
assert.match(js, /function syncPlanOverlay/, "alignable site plan reference required");
assert.match(js, /function validPlanAlignment/, "safe plan restoration required");
for (const id of ["plan-visible","plan-x","plan-z","plan-rotation","plan-elevation","plan-opacity",
  "plan-pick-center","ground-selected","pick-selected-site","auto-ground","ground-offset","ground-status"]) {
  assert.ok(unique.has(id), "v0.5 precision control missing: " + id);
}
assert.match(js, /function deleteSelectedExtra/, "selected object delete control");
assert.match(js, /sunGuide\.visible\s*=\s*false/, "sun sphere must not appear in render");
assert.match(js, /setEditorGizmosVisible\(extrasRoot,\s*false\)/, "light marker must not appear in render");
for(const id of ["site-unit","site-up","nav-speed","placement-hint","extra-count","sun-helper","render-resolution","extra-light-power","delete-selected"]){
  assert.ok(unique.has(id), "v0.4 control missing: "+id);
}
assert.match(js, /const MAX_UNDO = 40/, "history cap required");
assert.match(js, /import JSZip from/, "portable project ZIP handling required");
assert.match(js, /function exportProjectArchive/, "portable project exporter required");
assert.match(js, /function importProjectArchive/, "portable project importer required");
assert.match(js, /function masterSnapshot/, "master snapshot required");
assert.match(js, /function restoreMasterCamera/, "approved camera restore required");
for (const id of ["export-project", "import-project", "source-dimensions", "master-summary", "master-history", "restore-master-camera"])
  assert.ok(unique.has(id), "v0.2 safety control missing: " + id);
assert.match(css, /#viewport canvas/, "canvas must fill the viewport");
console.log("PASS studio: module syntax, HTML wiring, 8 cameras, tools, locks, import/export contracts");
