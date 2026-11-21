// AXOO Studio v3.9 workspace UX regression — pure local logic and source guards.
// Run: node --test tests/studio-v3.9-workspace.test.cjs
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const read=p=>fs.readFileSync(path.join(__dirname,"..",p),"utf8");
const src=read("studio/workspace-ux.js").replace(/^export\s+/gm,"");
const api=vm.runInNewContext(src+"\n({validWorkspaceMode,cleanAssetFavorites,toggleAssetFavorite,"+
  "alignBatch,distributeBatch,findSelectableBatchRoots,validBatchItems,assetPreviewType,ASSET_PREVIEW_EMOJIS})",
  {Number,Math,Set,Array,Object,Error},{timeout:4000});
const input=(ids,mins,maxs,axis="x")=>ids.map((id,i)=>{
  const a=axis==="x"?0:2;
  const min=[0,0,0],max=[1,1,1],position=[0,0,0];
  min[a]=mins[i];max[a]=maxs[i];position[a]=mins[i];
  return {id,min,max,position};
});
const deltas=moves=>Array.from(moves.map(x=>x.delta));

test("Quick/Advanced only, no accidental mode keys",()=>{
  assert.equal(api.validWorkspaceMode("quick"),true);
  assert.equal(api.validWorkspaceMode("advanced"),true);
  assert.equal(api.validWorkspaceMode("edit-source"),false);
});
test("Favorites are unique, safe and filtered to built-in catalogue",()=>{
  assert.deepEqual(Array.from(api.cleanAssetFavorites(
    ["tree-round","unknown","tree-round","media-screen",null],
    ["tree-round","media-screen"])),["tree-round","media-screen"]);
});
test("Favorites can toggle on and back off",()=>{
  const valid=["tree-round","car-sedan"];
  const one=api.toggleAssetFavorite([],"tree-round",valid);
  assert.deepEqual(Array.from(one),["tree-round"]);
  assert.deepEqual(Array.from(api.toggleAssetFavorite(one,"tree-round",valid)),[]);
  assert.throws(()=>api.toggleAssetFavorite(one,"unknown",valid));
});
test("Favorites enforce 100-item local UI bound",()=>{
  const keys=Array.from({length:120},(_,i)=>"asset-"+i);
  assert.equal(api.cleanAssetFavorites(keys,keys).length,100);
});
test("Batch validation rejects duplicate IDs, NaN and inverted bounds",()=>{
  const good=input([1,2],[0,4],[2,6]);
  assert.equal(api.validBatchItems(good),true);
  assert.equal(api.validBatchItems([good[0],good[0]]),false);
  assert.equal(api.validBatchItems([good[0],{...good[1],position:[NaN,0,0]}]),false);
  assert.equal(api.validBatchItems([good[0],{...good[1],max:[-2,1,1]}]),false);
});
test("Align X by starting edge: move only offsets to first boundary",()=>{
  const moves=api.alignBatch(input([3,9,12],[0,4,10],[2,7,13]),"x","min");
  assert.deepEqual(deltas(moves),[0,-4,-10]);
});
test("Align X by ending edge: use group maximum",()=>{
  const moves=api.alignBatch(input([3,9,12],[0,4,10],[2,7,13]),"x","max");
  assert.deepEqual(deltas(moves),[11,6,0]);
});
test("Align X by centre uses the whole selected group footprint",()=>{
  const moves=api.alignBatch(input([1,2,3],[0,6,11],[2,8,13]),"x","center");
  assert.deepEqual(deltas(moves),[5.5,-.5,-5.5]);
});
test("Align Z uses depth bounds and cannot affect Y or X",()=>{
  const moves=api.alignBatch(input([1,2],[0,4],[2,6],"z"),"z","min");
  assert.deepEqual(deltas(moves),[0,-4]);
  assert.throws(()=>api.alignBatch(input([1,2],[0,4],[2,6]),"y","min"));
});
test("Distribute X equalizes edge-to-edge gaps preserving the outer boundaries",()=>{
  const items=input([1,2,3],[0,3,10],[2,5,12]);
  const result=api.distributeBatch(items,"x");
  assert.equal(result.gapM,3);
  assert.deepEqual(deltas(result.moves),[0,2,0]);
  assert.equal(items[1].min[0],3,"pure planner must not mutate world bounds");
});
test("Distribute Z follows coordinate order rather than selected order",()=>{
  const items=input([3,1,2],[10,0,3],[12,2,5],"z");
  const result=api.distributeBatch(items,"z");
  assert.deepEqual(Array.from(result.moves.map(x=>x.id)),[1,2,3]);
  assert.deepEqual(deltas(result.moves),[0,2,0]);
});
test("Distribute requires three objects and sufficient space",()=>{
  assert.throws(()=>api.distributeBatch(input([1,2],[0,7],[2,10])));
  assert.throws(()=>api.distributeBatch(input([1,2,3],[0,5,10],[8,14,18])));
});
test("No current editing roots: locked, missing and too few selected are blocked",()=>{
  const roots=[1,2,3].map(i=>({userData:{extraId:i},locked:i===3}));
  assert.deepEqual(Array.from(api.findSelectableBatchRoots(roots,new Set([1,2]),x=>!x.locked).map(x=>x.userData.extraId)),[1,2]);
  assert.throws(()=>api.findSelectableBatchRoots(roots,new Set([1,3]),x=>!x.locked));
  assert.throws(()=>api.findSelectableBatchRoots(roots,new Set([1,55]),x=>!x.locked));
  assert.throws(()=>api.findSelectableBatchRoots(roots,new Set([1]),x=>!x.locked));
});
test("Asset cards clearly distinguish plant, wall, media, lighting and site tiles",()=>{
  assert.equal(api.assetPreviewType("tree-cherry-c","planting"),"plant");
  assert.equal(api.assetPreviewType("modular-wall","architecture"),"wall");
  assert.equal(api.assetPreviewType("media-screen","media"),"media");
  assert.equal(api.assetPreviewType("point-light","lighting"),"light");
  assert.equal(api.assetPreviewType("walkway-tile","surface"),"surface");
  assert.ok(api.ASSET_PREVIEW_EMOJIS.plant);
});
test("All UI IDs are unique and mode/asset/batch actions are actually wired",()=>{
  const html=read("studio/index.html"),js=read("studio/studio.js");
  const ids=[...html.matchAll(/\sid="([^"]+)"/g)].map(x=>x[1]);
  assert.equal(ids.length,new Set(ids).size,"HTML IDs should remain unique");
  for(const id of ["workspace-quick","workspace-advanced","workspace-mode-status",
    "workspace-project-panel","workspace-assets-panel","workspace-camera-panel",
    "workspace-backup-panel","context-favorites-only","context-favorites-count",
    "precision-multi-search","precision-select-visible","precision-clear-selection",
    "precision-selected-count","workspace-batch-axis","workspace-batch-anchor",
    "workspace-align","workspace-distribute","workspace-batch-status"]){
    assert.ok(ids.includes(id),"missing UI "+id);
    assert.ok(js.includes('"'+id+'"'),"missing JS wiring "+id);
  }
  assert.match(js,/event\.ctrlKey\|\|event\.metaKey/);
  assert.match(js,/runBatchTransform\("align"\)/);
  assert.match(js,/runBatchTransform\("distribute"\)/);
  assert.match(js,/decorateAssetCards\(\)/);
});
test("Legacy MASTER/ZIP unchanged and bulk transforms use established undo",()=>{
  const js=read("studio/studio.js"),legacy=read("studio/visual-workflow.js");
  assert.match(js,/const PROJECT_ARCHIVE_SCHEMA = "axoo-public-art-portable-v1"/);
  assert.match(js,/if\(approvedMaster\)return notify\("MASTER LOCK을 먼저 해제하고 새 Revision/);
  assert.match(js,/canEditObject\(root,artRoot,layerState,approvedMaster\)/);
  assert.match(js,/const before=editSnapshot\(\);\s*for\(const move of moves\)/);
  assert.match(js,/commit\(before\)/);
  assert.ok(legacy.includes("validVariants"),"existing A/B/C serializer intact");
});
test("UI preference keys are local-only and absent from model serialisation",()=>{
  const js=read("studio/studio.js");
  assert.match(js,/window\.localStorage\.setItem\(UI_LOCAL_KEY/);
  assert.match(js,/const UI_LOCAL_KEY="axoo-studio-workspace-v3\.9"/);
  const cfg=js.slice(js.indexOf("function sceneConfig(){"),js.indexOf("function validateProjectConfig("));
  assert.ok(cfg.length>1000,"sceneConfig and validation should exist");
  assert.ok(!cfg.includes("UI_LOCAL_KEY"),"do not persist favorites into source ZIP");
  assert.ok(!cfg.includes("workspaceMode"),"do not change original project format");
});
