const {chromium}=require("playwright");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const {execFileSync}=require("node:child_process");
const OBJ=Buffer.from([
"o AXOO_Independent_Artwork",
"v 0 0 0","v 1 0 0","v 0 1 0","v 0 0 1",
"f 1 2 3","f 1 2 4","f 1 3 4","f 2 3 4"
].join("\n")+"\n");
(async()=>{
 const browser=await chromium.launch({headless:true,
  ...(process.env.AXOO_CHROME_PATH?{executablePath:process.env.AXOO_CHROME_PATH}:{}),
  args:["--enable-webgl","--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader"]});
 const page=await browser.newPage({viewport:{width:1440,height:900},acceptDownloads:true});
 const errors=[];page.on("pageerror",e=>errors.push(e.message));
 try{
   await page.goto("http://127.0.0.1:8787/studio/",{waitUntil:"domcontentloaded"});
   await page.locator("#viewport canvas").waitFor({timeout:30000});
   assert.match(await page.locator("#multi-art-file").getAttribute("accept"),/\.obj/);
   await page.locator("#multi-art-file").setInputFiles({name:"AXOO-extra.obj",mimeType:"text/plain",buffer:OBJ});
   await page.waitForFunction(()=>document.querySelector("#multi-art-status")?.textContent.includes("작품 2/5개"),null,{timeout:30000});
   assert.equal(await page.locator("#multi-art-select option").count(),2);
   assert.match(await page.locator("#object-name").textContent(),/AXOO-extra/);
   const chosen=await page.locator("#multi-art-select").inputValue();
   assert.ok(chosen,"just-imported artwork must be selected");
   await page.locator('[data-multi-art-mode="rotate"]').click();
   assert.match(await page.locator('[data-mode="rotate"]').getAttribute("class"),/active/);
   const fold=page.locator("#workspace-transform-panel").locator("xpath=..");
   await fold.evaluate(el=>el.open=true);
   const field=async (kind,axis,value)=>{
     const el=page.locator('[data-transform="'+kind+'"][data-axis="'+axis+'"]');
     await el.fill(String(value));
     await el.dispatchEvent("change");
   };
   await field("position","x",3.25);
   await field("rotation","y",42);
   await page.locator('[data-multi-art-mode="scale"]').click();
   await field("scale","x",1.8);
   const json=page.waitForEvent("download",{timeout:60000});
   await page.locator("#export-json").click();
   const config=JSON.parse(fs.readFileSync(await (await json).path(),"utf8"));
   const model=config.extras.find(x=>x.kind==="custom-glb"&&x.assetId);
   assert.ok(model,"independent OBJ must be persisted as editable extra");
   assert.equal(config.library.find(x=>x.id===model.assetId).name,"AXOO-extra.obj");
   assert.ok(Math.abs(model.transform.p[0]-3.25)<.001);
   assert.ok(Math.abs(model.transform.r[1]-42*Math.PI/180)<.001);
   assert.ok(Math.abs(model.transform.s[0]-1.8)<.001);
   const dl=page.waitForEvent("download",{timeout:90000});
   await page.locator("#project-quick-save").click();
   const downloaded=await dl,zipPath=await downloaded.path();
   const names=execFileSync("unzip",["-Z1",zipPath],{encoding:"utf8"});
   assert.match(names,/assets\/library\/lib\d+\.obj/);
   const restored=execFileSync("unzip",["-p",zipPath,"assets/library/"+model.assetId+".obj"]);
   assert.deepEqual(restored,OBJ,"original OBJ bytes must be retained in full project ZIP");
   await page.locator("#import-project").setInputFiles(zipPath);
   await page.waitForFunction(()=>document.querySelector("#multi-art-status")?.textContent.includes("작품 2/5개"),null,{timeout:45000});
   await page.waitForFunction(()=>document.querySelector("#save-status")?.textContent.includes("브라우저에서 로컬 처리"),null,{timeout:45000});
   await page.locator("#multi-art-select").selectOption(String(model.id));
   await page.locator("#multi-art-select-edit").click();
   assert.match(await page.locator("#object-name").textContent(),/AXOO-extra/);
   assert.deepEqual(errors,[],"no JS errors");
   console.log("PASS v4.1: independent OBJ import, direct move/rotate/scale, original-byte ZIP roundtrip");
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
