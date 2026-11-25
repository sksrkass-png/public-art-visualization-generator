const {chromium}=require("playwright");
const assert=require("node:assert/strict");
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.AXOO_CHROME_PATH?{executablePath:process.env.AXOO_CHROME_PATH}:{}),
  args:["--enable-webgl","--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader"]});
 try{
  const page=await browser.newPage({viewport:{width:1360,height:820}});
  const errors=[];page.on("pageerror",error=>errors.push(error.message));
  await page.goto("http://127.0.0.1:8787/studio/",{waitUntil:"domcontentloaded"});
  await page.locator("#viewport canvas").waitFor({timeout:30000});
  assert.equal(await page.locator("#grid").isChecked(),false,"grid checkbox is off by default");
  assert.equal(await page.locator('[data-add-extra="sloped-black-nameplate"]').count(),1);
  assert.equal(await page.locator('[data-add-extra="sloped-silver-nameplate"]').count(),1);
  const result=await page.evaluate(async()=>{
    const THREE=await import("three");
    const {addSlopedStoneNameplate,SLOPED_PLAQUE_DIMENSIONS}=await import("/studio/sloped-nameplates.js");
    const out=[];
    for(const silver of [false,true]){
      const group=new THREE.Group();
      addSlopedStoneNameplate(group,silver);
      const box=new THREE.Box3().setFromObject(group),size=box.getSize(new THREE.Vector3());
      const meshes=group.children.filter(c=>c.isMesh);
      out.push({silver,children:group.children.length,meshCount:meshes.length,
        width:size.x,depth:size.z,height:size.y,
        construction:group.userData.nameplateConstruction,
        names:meshes.map(m=>m.name),
        metalness:meshes.map(m=>m.material.metalness??null)});
      group.traverse(o=>{if(o.geometry)o.geometry.dispose();});
    }
    return {dimensions:SLOPED_PLAQUE_DIMENSIONS,items:out};
  });
  assert.equal(result.dimensions.width,.30);
  assert.equal(result.dimensions.depth,.20);
  assert.equal(result.dimensions.frontHeight,.05);
  assert.equal(result.dimensions.rearHeight,.10);
  for(const v of result.items){
    assert.ok(Math.abs(v.width-.30)<.001,"300mm nameplate width");
    assert.ok(Math.abs(v.depth-.20)<.001,"200mm nameplate depth");
    assert.ok(v.height>=.10&&v.height<.106,"100mm back edge plus thin overlay");
    assert.equal(v.meshCount,v.silver?3:2,"stone body, separate metal sheet if needed, and readable plaque face");
  }
  assert.equal(result.items[0].construction,"black-stone-only");
  assert.equal(result.items[1].construction,"silver-on-black-stone");
  assert.ok(result.items[1].names.some(n=>n.includes("Brushed silver")));
  assert.ok(result.items[1].names.some(n=>n.includes("1.2mm")),"metal overlay must have physical edge thickness");
  assert.ok(result.items[1].metalness.some(v=>v>.5),"silver finish has actual metallic PBR");
  assert.deepEqual(errors,[]);
  console.log("PASS: 2 sloped plaques at true dimensions, black stone + silver metal overlays, default grid UI off");
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});