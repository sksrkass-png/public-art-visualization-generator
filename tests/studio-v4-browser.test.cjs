const {chromium}=require("playwright");
const assert=require("node:assert/strict");
(async()=>{
  const browser=await chromium.launch({headless:true,
    ...(process.env.AXOO_CHROME_PATH?{executablePath:process.env.AXOO_CHROME_PATH}:{}),
    args:["--enable-webgl","--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader"]});
  const page=await browser.newPage({viewport:{width:1350,height:880},acceptDownloads:true});
  const exceptions=[];page.on("pageerror",e=>exceptions.push(e.message));
  try{
    await page.goto("http://127.0.0.1:8787/studio/?panels=open",{waitUntil:"domcontentloaded"});
    await page.locator("#viewport canvas").waitFor({timeout:30000});
    await page.waitForFunction(()=>document.querySelector("#art-filename")?.textContent.includes("Sample Artwork"));
    assert.equal(await page.locator("[data-inspector-category]").count(),5);
    await page.locator('[data-inspector-category="camera"]').click();
    assert.ok(await page.locator('details.inspector-fold[hidden]').count()>4);
    assert.equal(await page.locator('#workspace-camera-panel').isVisible(),false);
    await page.locator('[data-inspector-category="camera"]').click();
    await page.locator("#workspace-camera-panel").locator("xpath=..").evaluate(el=>el.open=true);
    await page.locator('[data-camera-save="1"]').click();
    await page.locator('[data-view="rear"]').click();
    await page.locator('[data-camera-save="2"]').click();
    await page.locator("#camera-tour-prev").click();
    assert.equal(await page.locator('[data-camera-load="1"]').getAttribute("class"),"is-current-camera");
    await page.locator("#project-name").fill("v4 프로젝트 테스트");
    await page.locator("#vault-save-new").click();
    await page.waitForFunction(()=>document.querySelector("#vault-status")?.textContent.includes("저장 완료"),null,{timeout:60000});
    const id=await page.locator("#vault-list").inputValue();
    assert.ok(id.length>10);
    await page.reload({waitUntil:"domcontentloaded"});
    await page.locator("#viewport canvas").waitFor({timeout:30000});
    await page.waitForFunction(()=>document.querySelector("#vault-list")?.options.length>=2,null,{timeout:30000});
    await page.locator("#workspace-advanced").click();
    await page.locator("#vault-list").selectOption(id);
    await page.locator("#vault-load").click();
    page.once("dialog",dialog=>dialog.accept());
    await page.waitForFunction(()=>document.querySelector("#vault-status")?.textContent.includes("복원 완료"),null,{timeout:60000});
    assert.equal(await page.locator("#project-name").inputValue(),"v4 프로젝트 테스트");
    await page.locator("#vault-list").selectOption(id);
    page.once("dialog",dialog=>dialog.accept());
    await page.locator("#vault-delete").click();
    await page.waitForFunction(()=>document.querySelector("#vault-list")?.options.length===1,null,{timeout:20000});
    assert.deepEqual(exceptions,[]);
    console.log("PASS v4.0 browser: grouped inspector, saved cameras and IndexedDB ZIP save/reload/restore/delete");
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
