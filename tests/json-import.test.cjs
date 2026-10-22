/**
 * Dependency-free regression checks for JSON project restoration.
 * Run: node tests/json-import.test.cjs
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const app = fs.readFileSync(path.join(root, "assets/app.js"), "utf8");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");

assert.doesNotThrow(() => new Function(app), "assets/app.js must parse");
assert.match(html, /id="btn-import-json"/, "import button must exist");
assert.match(html, /id="import-json-file"/, "file input must exist");
assert.match(app, /"btn-import-json"\)\.addEventListener/, "import button must be wired");
assert.match(app, /"import-json-file"\)\.addEventListener/, "file input must be wired");

const start = app.indexOf("  function normalizeImportedState(payload)");
const end = app.indexOf("  function importJsonFile(file)", start);
assert.ok(start !== -1 && end > start, "import validation function must exist");

// Exercise the function from the shipped code, with minimal browser-field mocks.
const source = app.slice(start, end);
const knownState = {
  projectName: "", artworkName: "", artworkHeight: "",
  artworkWidth: "", artworkDepth: "", siteReferenceType: "Site Plan",
  lockLevel: "STRICT", material: "", shots: [], unbuiltSite: true,
  preserveGeometry: true
};
const fieldOptions = {
  siteReferenceType: ["Site Plan", "Architectural Rendering"],
  lockLevel: ["STRICT", "STANDARD"],
  material: ["", "Stainless Steel"]
};
const form = {
  elements: {
    namedItem(key) {
      if (fieldOptions[key]) {
        return { tagName: "SELECT", options: fieldOptions[key].map(value => ({ value })) };
      }
      return { type: ["artworkHeight", "artworkWidth", "artworkDepth"].includes(key) ? "number" : "text" };
    }
  }
};
const normalize = new Function(
  "ALL_SHOTS", "CHECKBOX_FIELDS", "getFormState", "form",
  source + "return normalizeImportedState;"
)(
  ["Main Perspective", "Eye Level", "Close-up"],
  ["unbuiltSite", "preserveGeometry"],
  () => knownState,
  form
);

const original = {
  projectName: "테스트", artworkName: "조형물",
  artworkWidth: "2300", artworkDepth: "600", artworkHeight: "3000",
  siteReferenceType: "Site Plan", lockLevel: "STRICT",
  material: "Stainless Steel",
  shots: ["Eye Level", "Main Perspective", "Eye Level"],
  unbuiltSite: true, preserveGeometry: true,
  preserveLevelPreset: "최대"
};
const restored = normalize({ formState: original, outputs: [] });
assert.equal(restored.artworkHeight, "3000", "valid numeric dimensions must survive");
assert.deepEqual(restored.shots, ["Main Perspective", "Eye Level"], "shots must be de-duplicated in standard order");
assert.equal(restored.unbuiltSite, true);
assert.equal(restored.preserveLevelPreset, undefined, "preset is derived from underlying locks");

const oldPackage = { formState: { projectName: "", artworkName: "", artworkHeight: "3000", shots: [] } };
assert.equal(normalize(oldPackage).artworkHeight, "3000", "older packages need not include new optional fields");

const invalidCases = [
  { formState: { ...original, shots: "Eye Level" } },
  { formState: { ...original, shots: ["Imaginary Shot"] } },
  { formState: { ...original, artworkHeight: "3 meters" } },
  { formState: { ...original, unbuiltSite: "yes" } },
  { formState: { ...original, siteReferenceType: "Fake Reference" } },
  { formState: { ...original, projectName: 22 } },
  { formState: { artworkName: "Incomplete", shots: [] } },
  { unexpected: "data" },
  null
];
invalidCases.forEach((input, index) => {
  assert.throws(() => normalize(input), "invalid case " + (index + 1) + " should fail");
});

const withUnknownField = normalize({ formState: { ...original, extraneous: "ignore me" } });
assert.equal(withUnknownField.extraneous, undefined, "unrecognized fields must be ignored");

console.log("PASS: app syntax, import wiring, valid/legacy/invalid JSON, locks, and shot normalization");
