const fs=require("node:fs"),path=require("node:path"),assert=require("node:assert/strict");
const extras=fs.readFileSync(path.join(__dirname,"../studio/extras.js"),"utf8");
const app=fs.readFileSync(path.join(__dirname,"../studio/studio.js"),"utf8");
const precise=fs.readFileSync(path.join(__dirname,"../studio/precision.js"),"utf8");
const html=fs.readFileSync(path.join(__dirname,"../studio/index.html"),"utf8");
// The historical cap existed independently in JSON validator, placement,
// clone, plinth creation, custom GLB placement, grouping and project restore.
assert.doesNotMatch(extras,/extras\.length\s*>\s*120/);
assert.doesNotMatch(app,/extrasRoot\.children\.length\s*>=\s*120/);
assert.doesNotMatch(extras,/groupId\s*>\s*120/);
assert.doesNotMatch(precise,/groupId\s*<=\s*120/);
assert.doesNotMatch(app,/Array\.from\(\{length:120\}/);
assert.doesNotMatch(app,/Math\.max\(1,\.\.\.extrasRoot\.children/);
assert.match(extras,/const plantTemplates=new Map\(\)/);
assert.match(extras,/child\.clone\(true\)/);
assert.match(extras,/plantTemplates\.set\(key,template\)/);
assert.match(html,/🧱 콘크리트 보도 3×3m/);
assert.match(html,/>⬛ 검정 명판<\/button>/);
assert.doesNotMatch(html,/>⬛ 검정 명판 · 접어 만든 별의 비행<\/button>/);
assert.match(extras,/"black-nameplate":"검정 명판"/);
assert.match(html,/id="asset-density-status"/);
assert.match(html,/id="extra-list-search"/);
assert.match(html,/id="extra-layer-search"/);
assert.match(app,/matched\.slice\(-100\)/);
assert.match(app,/matching\.slice\(-100\)/);
assert.match(app,/extrasRoot\.children\.reduce\(/);
assert.match(app,/extrasRoot\.children\.length\.toLocaleString/);
console.log("PASS v3.2.1 no arbitrary 120-object cutoff, lightweight inspector, shared botanical GPU resources and refreshed labels");
