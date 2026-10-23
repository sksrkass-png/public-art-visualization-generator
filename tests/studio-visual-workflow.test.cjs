const fs=require("node:fs"),path=require("node:path"),assert=require("node:assert/strict"),vm=require("node:vm");
const source=fs.readFileSync(path.join(__dirname,"../studio/visual-workflow.js"),"utf8");
const context={Object,Number,Math,Array,Set,Error};
vm.runInNewContext(source.replace(/\bexport\s+/g,"")+
  "\nthis.api={worldAabbDistance,preliminaryClearances,validVariant,validVariants,visualReadiness,visualPackageManifest};",context);
const {worldAabbDistance,preliminaryClearances,validVariant,validVariants,visualReadiness,visualPackageManifest}=context.api;
const bounds=(min,max)=>({min,max});
assert.equal(worldAabbDistance(bounds([0,0,0],[2,2,2]),bounds([3,0,0],[5,2,2])),1);
assert.equal(worldAabbDistance(bounds([0,0,0],[2,2,2]),bounds([1,1,1],[5,5,5])),0);
assert.ok(Math.abs(worldAabbDistance(bounds([0,0,0],[1,1,1]),bounds([2,3,6],[4,5,7]))-Math.hypot(1,2,5))<1e-12);
assert.throws(()=>worldAabbDistance(bounds([1,0,0],[0,0,0]),bounds([0,0,0],[1,1,1])));
const found=preliminaryClearances([{name:"work",bounds:bounds([0,0,0],[2,3,2])}],
 [{name:"wall",bounds:bounds([3,0,0],[4,4,2])},
 {name:"far",bounds:bounds([100,0,0],[110,4,2])}],1.5);
assert.equal(found.checkedBuildings,2);
assert.equal(found.warnings.length,1);
assert.equal(found.warnings[0].gapM,1);
assert.equal(found.warnings[0].status,"near");
assert.equal(preliminaryClearances([{name:"art",bounds:bounds([0,0,0],[2,3,2])}],
 [{name:"wall",bounds:bounds([1,0,1],[3,3,3])}],0).warnings[0].status,"overlap");
assert.throws(()=>preliminaryClearances([],[],30));
const option={slot:"A",sourceArt:"Artwork.glb",sourceSite:"Site.obj",name:"A안",
 scene:{artwork:{p:[0,0,0],r:[0,0,0],s:[1,1,1]},extras:[]},
 camera:{position:[1,2,3],target:[0,0,0],fov:45},
 lighting:{"sun-strength":2,ambient:.7},render:{aspect:"landscape16x9"}};
assert.equal(validVariant(option),true);
assert.equal(validVariants({A:option}),true);
assert.equal(validVariants({B:option}),false,"variant must have matching slot key");
assert.equal(validVariants({A:{...option,camera:{...option.camera,fov:0}}}),false);
assert.equal(validVariants({A:{...option,lighting:{ambient:Infinity}}}),false);
assert.equal(validVariants({}),true);
const evaluation=visualReadiness({realSite:false,realArtwork:false,masterApproved:false,
 masterConsistent:false,dimensionsM:[3,2,4],clearance:{warnings:[{status:"overlap"}]}});
assert.ok(evaluation.warnings.length>=4);
assert.equal(evaluation.ready,false);
const good=visualReadiness({realSite:true,realArtwork:true,masterApproved:true,
 masterConsistent:true,dimensionsM:[3,2,4],clearance:{warnings:[]},hasLighting:true});
assert.equal(good.ready,true);
const manifest=visualPackageManifest({project:"Site",slots:["A","B"],width:1920,height:1080,warnings:[]});
assert.equal(manifest.schema,"axoo-visual-options-v1");
assert.equal(JSON.stringify(manifest.filenames),JSON.stringify(["A-visual.png","B-visual.png"]));
assert.throws(()=>visualPackageManifest({project:"Site",slots:["A","A"],width:1920,height:1080,warnings:[]}));
console.log("PASS v2.3-v2.5: broad-phase building clearances, variant slots, preflight honesty and visual outputs");