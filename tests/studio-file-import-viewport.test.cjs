// v4.0.4: actual OBJ uploads must not shrink, displace or detach the editor from viewport.
const {chromium}=require("playwright");
const assert=require("node:assert/strict");
const OBJ=Buffer.from([
"o Imported_Public_Art_Site",
"v -15 0 -15","v 15 0 -15","v 15 0 15","v -15 0 15",
"v -15 8 -15","v 15 8 -15","v 15 8 15","v -15 8 15",
"f 1 2 3","f 1 3 4","f 1 5 6","f 1 6 2","f 2 6 7","f 2 7 3",
"f 3 7 8","f 3 8 4","f 4 8 5","f 4 5 1"
].join("\n"));
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.AXOO_CHROME_PATH?{executablePath:process.env.AXOO_CHROME_PATH}:{}),
  args:["--enable-webgl","--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader"]});
 try{
  const page=await browser.newPage({viewport:{width:1390,height:860},acceptDownloads:true});
  const errs=[];page.on("pageerror",e=>errs.push(e.message));
  await page.goto("http://127.0.0.1:8787/studio/",{waitUntil:"domcontentloaded"});
  await page.locator("#viewport canvas").waitFor({timeout:30000});
  const measure=()=>page.evaluate(()=>{
    const rect=s=>{const r=document.querySelector(s).getBoundingClientRect();return {top:r.top,bottom:r.bottom,height:r.height};};
    return {scrollY:window.scrollY,top:document.scrollingElement.scrollTop,
      app:rect(".app"),viewer:rect(".viewer-shell"),
      viewport:rect("#viewport"),left:rect(".sidepanel.left"),right:rect(".sidepanel.right"),
      innerHeight:window.innerHeight,clientHeight:document.documentElement.clientHeight};
  });
  const assertFit=(layout,at)=>{
    console.log("IMPORT_LAYOUT",at,JSON.stringify(layout));
    assert.ok(layout.viewer.top>=0&&layout.viewer.top<145,at+" viewer top");
    assert.ok(layout.viewer.height>320,at+" viewer height");
    assert.ok(layout.viewer.bottom<=layout.innerHeight+2,at+" viewer bottom");
    assert.ok(layout.app.top>=-1&&layout.app.bottom<=layout.innerHeight+2,at+" app within screen");
    assert.equal(layout.scrollY,0,at+" page scrollY");
  };
  assertFit(await measure(),"first load");
  // User scrolls the left tool panel to find the import control.
  await page.locator(".sidepanel.left").evaluate(el=>{el.scrollTop=600});
  await page.locator("#site-file").setInputFiles({name:"uploaded-site.obj",mimeType:"text/plain",buffer:OBJ});
  await page.waitForFunction(()=>document.querySelector("#site-filename")?.textContent==="uploaded-site.obj",null,{timeout:25000});
  await page.waitForTimeout(400);
  assertFit(await measure(),"after site OBJ");
  // Focusing a file input can cause implicit browser scroll even if body is clipped.
  await page.locator("#art-file").focus();
  await page.locator("#art-file").setInputFiles({name:"uploaded-art.obj",mimeType:"text/plain",buffer:OBJ});
  await page.waitForFunction(()=>document.querySelector("#art-filename")?.textContent==="uploaded-art.obj",null,{timeout:25000});
  await page.waitForTimeout(400);
  assertFit(await measure(),"after artwork OBJ");
  for(const height of [720,960,860]){
    await page.setViewportSize({width:1390,height});
    await page.waitForTimeout(300);
    assertFit(await measure(),"resize "+height);
  }
  await page.evaluate(()=>document.querySelector("#site-file").scrollIntoView({block:"center"}));
  await page.waitForTimeout(200);
  assertFit(await measure(),"file field scrollIntoView");
  assert.deepEqual(errs,[]);
  console.log("PASS import layout: real site/art OBJ, file input focus, resize, implicit scroll");
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});