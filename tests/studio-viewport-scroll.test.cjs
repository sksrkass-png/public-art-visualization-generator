// v4.0.2 desktop layout and real pointer wheel regression: no giant document tail below 3D studio.
const {chromium}=require("playwright");
const assert=require("node:assert/strict");
(async()=>{
  const browser=await chromium.launch({headless:true,
    ...(process.env.AXOO_CHROME_PATH?{executablePath:process.env.AXOO_CHROME_PATH}:{}),
    args:["--enable-webgl","--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader"]});
  try{
    const page=await browser.newPage({viewport:{width:1086,height:900}});
    const pageErrors=[];page.on("pageerror",error=>pageErrors.push(error.message));
    await page.goto("http://127.0.0.1:8787/studio/",{waitUntil:"domcontentloaded"});
    await page.locator("#viewport canvas").waitFor({timeout:30000});
    for(const [width,height] of [[1086,900],[1440,900],[1024,720],[801,650]]){
      await page.setViewportSize({width,height});
      await page.waitForTimeout(250);
      const layout=await page.evaluate(()=>{
        const rect=id=>{const r=document.querySelector(id).getBoundingClientRect();return {top:r.top,bottom:r.bottom,height:r.height};};
        return {
          innerHeight:window.innerHeight,scrollY:window.scrollY,
          htmlScroll:document.documentElement.scrollHeight,
          htmlClient:document.documentElement.clientHeight,
          bodyScroll:document.body.scrollHeight,
          bodyClient:document.body.clientHeight,
          htmlOverflow:getComputedStyle(document.documentElement).overflowY,
          bodyOverflow:getComputedStyle(document.body).overflowY,
          app:rect(".app"),workspace:rect(".workspace"),viewer:rect(".viewer-shell"),
          leftOverflow:getComputedStyle(document.querySelector(".sidepanel.left")).overflowY,
          rightOverflow:getComputedStyle(document.querySelector(".sidepanel.right")).overflowY,
          panelScrollable:document.querySelector(".sidepanel.left").scrollHeight>=document.querySelector(".sidepanel.left").clientHeight
        };
      });
      console.log("VIEWPORT_LAYOUT",width,height,JSON.stringify(layout));
      assert.ok(layout.viewer.height>150,"3D viewport should retain useful size "+width);
      assert.ok(layout.viewer.bottom<=height+2,"3D viewport stays within screen "+width);
      assert.ok(layout.workspace.bottom<=height+2,"workspace does not overflow screen "+width);
      assert.ok(layout.bodyScroll<=height+2,"no trailing blank body below workspace "+width);
      assert.equal(layout.htmlOverflow,"clip","root overflow must be clipped "+width);
      assert.equal(layout.bodyOverflow,"clip","body overflow must be clipped "+width);
      assert.equal(layout.leftOverflow,"auto");
      assert.equal(layout.rightOverflow,"auto");
      await page.evaluate(()=>window.scrollTo(0,10000));
      assert.equal(await page.evaluate(()=>window.scrollY),0,"browser page should not scroll "+width);
      // Scroll the tool list to its end, then keep turning the wheel: this must
      // never propagate to the document or push the canvas out of view.
      await page.locator(".sidepanel.left").evaluate(el=>{el.scrollTop=el.scrollHeight;});
      const leftBox=await page.locator(".sidepanel.left").boundingBox();
      await page.mouse.move(leftBox.x+Math.min(80,leftBox.width/2),leftBox.y+Math.min(170,leftBox.height/2));
      await page.mouse.wheel(0,1900);
      await page.waitForTimeout(130);
      assert.equal(await page.evaluate(()=>window.scrollY),0,"wheel at sidebar end must not scroll page "+width);
      const center=await page.locator(".viewer-shell").boundingBox();
      await page.mouse.move(center.x+center.width/2,center.y+center.height/2);
      await page.mouse.wheel(0,1550);
      await page.waitForTimeout(130);
      assert.equal(await page.evaluate(()=>window.scrollY),0,"wheel over 3D canvas must not scroll page "+width);
    }
    await page.setViewportSize({width:740,height:900});
    await page.waitForTimeout(250);
    const mobile=await page.evaluate(()=>({width:window.innerWidth,viewer:document.querySelector(".viewer-shell").getBoundingClientRect().height,
      overflow:getComputedStyle(document.body).overflowY}));
    assert.ok(mobile.viewer>=390,"mobile viewer should remain usable");
    assert.ok(["visible","auto"].includes(mobile.overflow),"mobile keeps page scrolling");
    assert.deepEqual(pageErrors,[],"no runtime exceptions");
    console.log("PASS v4.0.2: fixed desktop viewport without body scrollbar at 801-1440px; responsive mobile preserved");
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
