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

assert.doesNotThrow(() => new Function(js.replace(/^import .*?;\s*$/gm, "")), "studio module parses after stripping top-level static imports");
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
assert.match(js, /new GLTFExporter/, "GLB model export required");
assert.match(js, /function sceneConfig/, "portable project settings exporter required");
assert.match(js, /function importSceneConfig/, "portable settings importer required");
assert.match(js, /if \(approvedMaster\) return notify\("MASTER LOCK/, "locked models must not be replaced");
assert.match(js, /artRoot\.scale\.fromArray\(lastDrag\.s\.map/, "proportional scale gizmo enforcement required");
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
