const {chromium}=require("playwright");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const OBJ=Buffer.from([
"o Remote_Origin_Sculpture",
"v 10000 2500 5000","v 10002 2500 5000","v 10000 2503 5000",
"v 10000 2500 5002","f 1 2 3","f 1 2 4","f 1 3 4","f 2 3 4"
].join("\n")+"\n");
(async()=>{
 const browser=await chromium.launch({headless:true,
   ...(process.env.AXOO_CHROME_PATH?{executablePath:process.env.AXOO_CHROME_PATH}:{}),
   args:["--enable-webgl","--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader"]});
 const page=await browser.newPage({viewport:{width:1440,height:900},acceptDownloads:true});
 const errors=[];page.on("pageerror",error=>errors.push(error.message));
 try{
  await page.goto("http://127.0.0.1:8787/studio/",{waitUntil:"domcontentloaded"});
  await page.locator("#viewport canvas").waitFor({timeout:30000});
  // Test actual geometry pivot using remote-object coordinates while retaining raw geometry.
  const pivot=await page.evaluate(async()=>{
    const THREE=await import("three");
    const {parseLibraryModel}=await import("/studio/assets.js?v=4.1");
    const {makeExtra}=await import("/studio/extras.js");
    const text=["o Remote_Origin_Sculpture","v 10000 2500 5000","v 10002 2500 5000",
      "v 10000 2503 5000","v 10000 2500 5002","f 1 2 3","f 1 2 4","f 1 3 4","f 2 3 4"].join("\n")+"\n";
    const file=new File([text],"remote-test.obj",{type:"text/plain"});
    const library=new Map();
    library.set("lib99",await parseLibraryModel(file,"lib99","artwork"));
    const oldRoot=makeExtra("custom-glb",98,2,"lib99",library,null);
    const newRoot=makeExtra("custom-glb",99,3,"lib99",library,null);
    const oldBox=new THREE.Box3().setFromObject(oldRoot),newBox=new THREE.Box3().setFromObject(newRoot);
    const result={oldCenter:oldBox.getCenter(new THREE.Vector3()).toArray(),
       newCenter:newBox.getCenter(new THREE.Vector3()).toArray(),
       newMin:newBox.min.toArray(), oldVersion:oldRoot.userData.appearanceVersion,
       newVersion:newRoot.userData.appearanceVersion};
    const oldVertices=oldRoot.children[0].children[0].geometry.getAttribute("position");
    const newVertices=newRoot.children[0].children[0].geometry.getAttribute("position");
    result.sourceFirst=[oldVertices.getX(0),oldVertices.getY(0),oldVertices.getZ(0)];
    result.cloneFirst=[newVertices.getX(0),newVertices.getY(0),newVertices.getZ(0)];
    return result;
  });
  assert.ok(pivot.oldCenter[0]>9000&&pivot.oldCenter[1]>2000,"v2 legacy keeps authoring offset");
  assert.ok(Math.abs(pivot.newCenter[0])<.001&&Math.abs(pivot.newCenter[2])<.001,
    "new artwork pivot must sit at actual geometry center");
  assert.ok(Math.abs(pivot.newMin[1])<.001,"new artwork pivot is at sculpture bottom");
  assert.deepEqual(pivot.cloneFirst,pivot.sourceFirst,"vertex geometry unchanged");
  await page.locator("#multi-art-file").setInputFiles({name:"remote-obj.obj",mimeType:"text/plain",buffer:OBJ});
  await page.waitForFunction(()=>document.querySelector("#multi-art-status")?.textContent.includes("작품 2/5개"),null,{timeout:30000});
  await page.locator("#export-json").evaluate(el=>{const fold=el.closest("details.inspector-fold");if(fold)fold.open=true;});
  async function snapshot(){
    const [download]=await Promise.all([page.waitForEvent("download",{timeout:40000}),page.locator("#export-json").click()]);
    return JSON.parse(fs.readFileSync(await download.path(),"utf8"));
  }
  let state=await snapshot(),added=state.extras.find(o=>o.kind==="custom-glb");
  assert.ok(added,"additional OBJ exists as actual scene extra");
  assert.equal(added.appearanceVersion,3);
  assert.ok(added.transform.p[0]>0&&added.transform.p[0]<100,
    "remote OBJ geometry should be placed near original rather than kilometers away");
  assert.ok(Math.abs(added.transform.p[1])<100,"no massive remote-origin Y offset");
  // Real GLB with authoring origin outside viewport, created in the same Three.js engine.
  const bytes=await page.evaluate(async()=>{
    const THREE=await import("three");
    const {GLTFExporter}=await import("three/addons/exporters/GLTFExporter.js");
    const group=new THREE.Group();
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(1.5,2.6,1.5),
      new THREE.MeshStandardMaterial({color:0xe94a2b}));
    mesh.position.set(4000,1200,2400);
    group.add(mesh);
    const binary=await new GLTFExporter().parseAsync(group,{binary:true});
    return Array.from(new Uint8Array(binary));
  });
  await page.locator("#multi-art-file").setInputFiles({
    name:"remote-glb.glb",mimeType:"model/gltf-binary",buffer:Buffer.from(bytes)
  });
  await page.waitForFunction(()=>document.querySelector("#multi-art-status")?.textContent.includes("작품 3/5개"),null,{timeout:30000});
  state=await snapshot();
  const works=state.extras.filter(o=>o.kind==="custom-glb");
  assert.equal(works.length,2,"two independent extras were placed");
  assert.ok(works.every(o=>o.appearanceVersion===3),"every new independent art has pivot-safe placement");
  assert.ok(works[1].transform.p[0]>works[0].transform.p[0],
     "models appear side by side, not overlapping original or each other");
  assert.ok(works.every(o=>Number.isFinite(o.transform.s[0])&&o.transform.s[0]>0),
     "model transforms stay editable and serializable");
  assert.deepEqual(errors,[]);
  console.log("PASS v4.1.1: remote OBJ/GLB geometry centered, two distinct adjacent artworks, no vertex edits");
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
