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
for(const id of ["master-render-panel","batch-quality","batch-contact","export-master-pack","batch-status"])
  assert.ok(unique.has(id), "v0.8 8-view UI missing: "+id);
for(const marker of ["function exportMasterPack","function createContactSheet","function baselineForMaster","function syncBatchAvailability","masterConsistency("])
  assert.ok(js.includes(marker), "v0.8 batch export wiring missing: "+marker);
assert.match(js,/new JSZip\(\)/,"ZIP batch export required");
assert.match(js,/render-manifest\.json/,"QA JSON manifest required");
assert.match(js,/REVIEW_NOTES\.txt/,"human review notes required");
const batchScript=fs.readFileSync(path.join(base,"studio/batch.js"),"utf8");
for(const marker of ["createStandardCameras","captureSceneIntegrity","masterConsistency","validateBatchManifest"])
  assert.ok(batchScript.includes(marker),"standard 8-view integrity helper missing: "+marker);

for (const id of ["export-project", "import-project", "source-dimensions", "master-summary", "master-history", "restore-master-camera"])
  assert.ok(unique.has(id), "v0.2 safety control missing: " + id);
for(const id of ["render-review","review-batch-file","review-view","review-candidate-file",
  "review-slider","review-overlay","review-artwork","review-site","review-scale",
  "review-materials","review-note","review-approve","review-export","review-status"])
  assert.ok(unique.has(id),"v0.9 review control missing: "+id);
const reviewSource=fs.readFileSync(path.join(base,"studio/review.js"),"utf8");
for(const marker of ["initVisualReview","validManifest","humanApprovedCount","incomplete-review",
  "verifiedMaster","visual-review.json"])
  assert.ok(reviewSource.includes(marker),"v0.9 review data safeguard missing: "+marker);
assert.match(js,/initVisualReview\(/,"render reviewer must be initialized");
for(const id of ["release-readiness","readiness-scan","readiness-export","readiness-status","readiness-badge",
 "ready-dimensions","ready-artwork","ready-placement","ready-render"])
  assert.ok(unique.has(id),"v1.0 readiness control missing: "+id);
const integrityCode=fs.readFileSync(path.join(base,"studio/integrity.js"),"utf8");
for(const marker of ["makeIntegrityManifest","verifyIntegrityManifest","SHA-256","project.json","assets/site"])
  assert.ok(integrityCode.includes(marker),"checksum routine missing: "+marker);
const readinessCode=fs.readFileSync(path.join(base,"studio/readiness.js"),"utf8");
for(const marker of ["initReadiness","validateReadiness","ready-for-internal-review","needs-human-or-source-review"])
  assert.ok(readinessCode.includes(marker),"readiness guard missing: "+marker);
assert.match(js,/integrity\.json/,"checksum must be saved in full project ZIP");
assert.match(js,/verifyIntegrityManifest\(zip\)/,"checksum must be checked on ZIP import");
for(const id of ["site-import-inspector","site-center-origin","site-preflight-summary",
  "site-preflight-export"])assert.ok(unique.has(id),"v1.1 site diagnostic UI missing: "+id);
for(const symbol of ["decodeSiteBundle","inspectImportedSite","validSiteAlignment"])
  assert.ok(js.includes(symbol),"v1.1 site import functions not wired: "+symbol);
assert.match(js,/centerOrigin:\$\("site-center-origin"\)\.checked/,"site center preference persisted to project");
const preflightSource=fs.readFileSync(path.join(base,"studio/site-import.js"),"utf8");
for(const token of ["decodeSiteBundle","resourceName","inspectImportedSite","GLTFLoader","MAX_UNPACKED"])
  assert.ok(preflightSource.includes(token),"v1.1 bundled glTF import guard absent: "+token);
for(const id of ["asset-library-panel","library-asset-file","library-asset-category",
 "library-asset-select","library-place","library-status"])
 assert.ok(unique.has(id),"v1.2 asset browser control missing: "+id);
for(const marker of ["importLibraryGLB","refreshAssetLibraryUI","assetLibrary=new Map","loadedLibrary",
 "libraryManifest(assetLibrary)","assets/library/"])
 assert.ok(js.includes(marker),"v1.2 missing source registry: "+marker);
const assetsModule=fs.readFileSync(path.join(base,"studio/assets.js"),"utf8");
for(const marker of ["parseLibraryGLB","instantiateLibraryAsset","validLibraryManifest","MAX_LIBRARY_TRIANGLES"])
 assert.ok(assetsModule.includes(marker),"v1.2 custom GLB module missing: "+marker);
const extrasModule=fs.readFileSync(path.join(base,"studio/extras.js"),"utf8");
for(const marker of ["tree-autumn","person-standing","park-bench","round-planter","custom-glb"])
 assert.ok(extrasModule.includes(marker),"v1.2 scene asset missing: "+marker);
const integrity=fs.readFileSync(path.join(base,"studio/integrity.js"),"utf8");
assert.ok(integrity.includes("assets/library/"),"checksums for external GLB sources required");
for(const id of ["precision-modeling","precision-duplicate","precision-group-list",
"precision-group","precision-ungroup","measure-site-start","measure-site-clear",
"measure-site-status","measure-first","measure-second","measure-objects",
"measure-objects-status","precision-collision","precision-collision-status","precision-report"])
  assert.ok(unique.has(id),"v1.3 precision UI missing: "+id);
for(const token of ["duplicateEditable","createLogicalGroup","shiftGroupMembers",
"addMeasuredPoint","showPairMeasurement","checkInterferences","exportPrecisionReport"])
  assert.ok(js.includes(token),"v1.3 precision feature missing: "+token);
const precisionSource=fs.readFileSync(path.join(base,"studio/precision.js"),"utf8");
for(const fn of ["pairMeasurement","sceneInterferences","translateGroupPeers","boxGap"])
  assert.ok(precisionSource.includes(fn),"v1.3 precise geometry helper missing: "+fn);
assert.match(js,/restoreExtras\(extrasRoot, state\.extras,assetLibrary,artRoot\)/,
  "artist duplicate source required for undo restore");
for(const id of ["proposal-export-panel","proposal-render-file","proposal-artwork-title",
  "proposal-artist","proposal-site-label","proposal-note","proposal-export","proposal-status","proposal-refresh"])
  assert.ok(unique.has(id),"v1.4 proposal UI missing: "+id);
for(const marker of ["initProposalExport","collectPrecisionReport","readinessBridge.getReport()"])
  assert.ok(js.includes(marker),"v1.4 proposal app integration missing: "+marker);
const proposalModule=fs.readFileSync(path.join(base,"studio/proposal.js"),"utf8");
for(const marker of ["validateProposalArchive","makeProposalData","proposalHtml","MASTER","README.txt",
  "proposal-data.json","proposal-sheets.html","ready-for-internal-review"])
  assert.ok(proposalModule.includes(marker),"v1.4 proposal module missing: "+marker);
assert.match(proposalModule,/escapeHtml/,"escape user metadata before HTML export");
assert.match(proposalModule,/Content-Security-Policy/,"prevent external scripts and images in proposal sheets");
assert.match(proposalModule,/images\//,"embed linked original eight render PNGs in ZIP");
// v1.5 team review must remain strictly offline and bound to approved MASTER.
for(const id of ["team-collaboration-panel","collab-active","collab-author","collab-reviewer",
 "collab-note","collab-request","collab-attest","collab-changes","collab-approve",
 "collab-export","collab-import","collab-history","collab-status","collab-feedback"])
 assert.ok(unique.has(id),"v1.5 review control missing: "+id);
for(const token of ["initTeamCollaboration","validateCollaborationState",
 "collaboration:collaborationBridge?.getState()","collaborationBridge.setState(data.collaboration)",
 "collaborationBridge.reset()"])
 assert.ok(js.includes(token),"v1.5 persistence or MASTER integration missing: "+token);
const collaboration=fs.readFileSync(path.join(base,"studio/collaboration.js"),"utf8");
for(const token of ["masterFingerprint","SHA-256","masterApprovedAt","director-approved",
 "changes-requested","validateCollaborationState","crypto.subtle.digest","masterDigest"])
 assert.ok(collaboration.includes(token),"v1.5 review guard missing: "+token);
assert.doesNotMatch(collaboration,/innerHTML|\beval\(/,"reviewer-controlled HTML execution is forbidden");
assert.match(css,/#team-collaboration-panel/,"v1.5 panel must be styled");
// v1.6 read-only MASTER snapshot difference inspector.
for(const id of ["revision-diff-panel","revision-base","revision-target","revision-empty",
  "revision-summary","revision-changes","revision-export","revision-status"])
  assert.ok(unique.has(id),"v1.6 MASTER diff control missing: "+id);
for(const word of ["initRevisionCompare","revisionBridge.refresh()","history:masterSnapshots"])
  assert.ok(js.includes(word),"v1.6 revision UI integration missing: "+word);
const diffModule=fs.readFileSync(path.join(base,"studio/revision-diff.js"),"utf8");
const compareModule=fs.readFileSync(path.join(base,"studio/revision-compare.js"),"utf8");
for(const word of ["compareMasterRevisions","REVISION_DIFF_SCHEMA","artworkTransform",
  "siteFile","planAlignment","material","extras","camera","lighting"])
  assert.ok(diffModule.includes(word),"v1.6 snapshot comparison coverage missing: "+word);
assert.match(compareModule,/masterFingerprint/,"comparison report must bind source snapshots");
assert.match(compareModule,/\.textContent=/,"safe text-only rendering is required");
assert.doesNotMatch(compareModule,/innerHTML|eval\(|fetch\(/,"review info must not be interpreted as HTML or uploaded");
assert.match(css,/#revision-diff-panel/,"v1.6 comparison visual hierarchy missing");
// v1.7 spatial notes are DOM-only, never inserted into WebGL exports.
for(const id of ["spatial-review-panel","spatial-pin-overlay","spatial-author","spatial-comment",
 "spatial-place","spatial-cancel","spatial-summary","spatial-pin-list",
 "spatial-resolve","spatial-reopen","spatial-export","spatial-status"])
 assert.ok(unique.has(id),"v1.7 review pin control missing: "+id);
for(const marker of ["initSpatialReview","spatialBridge?.handleCanvasClick","spatialBridge?.drawOverlay()",
  "spatialReview:spatialBridge?.getState()","spatialBridge.setState(data.spatialReview)",
  "validSpatialReview(data.spatialReview)"])
 assert.ok(js.includes(marker),"v1.7 editor persistence/pin guard missing: "+marker);
const spatial=fs.readFileSync(path.join(base,"studio/spatial-review.js"),"utf8");
const spatialData=fs.readFileSync(path.join(base,"studio/spatial-review-data.js"),"utf8");
assert.match(spatial,/masterFingerprint/);
assert.match(spatial,/raycaster.intersectObjects/);
assert.match(spatial,/point.project\(camera\)/);
assert.doesNotMatch(spatial,/innerHTML|\beval\(|fetch\(/,"user comments must be rendered as text only");
assert.match(spatialData,/MAX_SPATIAL_PINS = 80/);
assert.match(css,/#spatial-review-panel/);
assert.match(css, /#viewport canvas/, "canvas must fill the viewport");
console.log("PASS studio: module syntax, HTML wiring, 8 cameras, tools, locks, import/export contracts");
