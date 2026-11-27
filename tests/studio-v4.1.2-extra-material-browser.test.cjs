const {chromium}=require("playwright");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const OBJ=Buffer.from([
"o Sculpture_A","v 0 0 0","v 2 0 0","v 0 2 0","v 0 0 2",
"f 1 2 3","f 1 2 4","f 1 3 4","f 2 3 4"
].join("\n")+"\n");
(async()=>{
  const browser=await chromium.launch({headless:true,
    ...(process.env.AXOO_CHROME_PATH?{executablePath:process.env.AXOO_CHROME_PATH}:{}),
    args:["--enable-webgl","--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader"]});
  const page=await browser.newPage({viewport:{width:1440,height:900},acceptDownloads:true});
  const errors=[];page.on("pageerror",err=>errors.push(err.message));
  try{
    await page.goto("http://127.0.0.1:8787/studio/",{waitUntil:"domcontentloaded"});
    await page.locator("#viewport canvas").waitFor({timeout:30000});
    const isolated=await page.evaluate(async()=>{
      const THREE=await import("three");
      const {parseLibraryModel}=await import("/studio/assets.js?v=4.1");
      const {makeExtra,serializeExtras,restoreExtras}=await import("/studio/extras.js");
      const {applyExtraArtworkMaterial}=await import("/studio/extra-art-materials.js");
      const model=["o Sculpture","v 0 0 0","v 2 0 0","v 0 2 0","v 0 0 2",
        "f 1 2 3","f 1 2 4","f 1 3 4","f 2 3 4"].join("\n")+"\n";
      const lib=new Map();
      lib.set("lib42",await parseLibraryModel(new File([model],"isolation.obj"),"lib42","artwork"));
      const x=makeExtra("custom-glb",42,3,"lib42",lib,null);
      const y=makeExtra("custom-glb",43,3,"lib42",lib,null);
      const meshes=o=>{const result=[];o.traverse(t=>{if(t.isMesh)result.push(t);});return result;};
      const source=meshes(lib.get("lib42").model)[0],a=meshes(x)[0],b=meshes(y)[0];
      const oldSource=source.material,oldA=a.material,oldB=b.material;
      applyExtraArtworkMaterial(x,{preset:"painted",color:"#e02020"});
      const separate=a.material!==b.material && b.material===oldB &&
        source.material===oldSource && a.material!==oldA &&
        a.material.color.getHexString()==="e02020";
      const holder=new THREE.Group();holder.add(x,y);
      const saved=serializeExtras(holder);
      const restoredHolder=new THREE.Group();
      restoreExtras(restoredHolder,saved,lib,null);
      const restored=meshes(restoredHolder.children[0])[0];
      const restoredOther=meshes(restoredHolder.children[1])[0];
      const roundtrip=restored.material.color.getHexString()==="e02020"&&
        restoredOther.material===oldB&&saved[0].materialOverride?.preset==="painted"&&
        !saved[1].materialOverride;
      applyExtraArtworkMaterial(x,{preset:"original",color:"#d0d6db"});
      return {separate,roundtrip,reset:a.material===oldA};
    });
    assert.equal(isolated.separate,true,"only selected instance should change appearance");
    assert.equal(isolated.roundtrip,true,"serialized material override survives restore");
    assert.equal(isolated.reset,true,"original material restored without source changes");
    await page.locator("#multi-art-file").setInputFiles({name:"material-1.obj",mimeType:"text/plain",buffer:OBJ});
    await page.waitForFunction(()=>document.querySelector("#multi-art-status")?.textContent.includes("작품 2/5개"),null,{timeout:30000});
    assert.equal(await page.locator("#multi-art-apply-material").isDisabled(),false);
    await page.locator("#multi-art-material").selectOption("mirror");
    await page.locator("#multi-art-color").fill("#aabbcc");
    await page.locator("#multi-art-apply-material").click();
    assert.match(await page.locator("#multi-art-material-status").textContent(),/미러 스테인리스/);
    await page.locator("#export-json").evaluate(el=>{const fold=el.closest("details.inspector-fold");if(fold)fold.open=true;});
    const download=async()=>{
      const [file]=await Promise.all([page.waitForEvent("download",{timeout:60000}),page.locator("#export-json").click()]);
      return JSON.parse(fs.readFileSync(await file.path(),"utf8"));
    };
    let config=await download();
    assert.deepEqual(config.extras.find(x=>x.kind==="custom-glb").materialOverride,
      {preset:"mirror",color:"#aabbcc"});
    await page.locator("#undo").click();
    config=await download();
    assert.equal(config.extras.find(x=>x.kind==="custom-glb").materialOverride,undefined);
    await page.locator("#redo").click();
    config=await download();
    assert.equal(config.extras.find(x=>x.kind==="custom-glb").materialOverride?.preset,"mirror");
    await page.locator("#multi-art-reset-material").click();
    config=await download();
    assert.equal(config.extras.find(x=>x.kind==="custom-glb").materialOverride,undefined);
    assert.deepEqual(errors,[],"no JS errors");
    console.log("PASS v4.1.2: independent material color, original restore, serialized state, undo/redo");
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
