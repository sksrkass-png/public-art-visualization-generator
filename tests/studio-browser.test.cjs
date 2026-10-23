const { chromium } = require("playwright");
const fs = require("node:fs");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const { siteFixtures, loadFbxFixture } = require("./site-model-fixtures.cjs");

(async () => {
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.AXOO_CHROME_PATH ? {executablePath:process.env.AXOO_CHROME_PATH} : {}),
    args: ["--enable-webgl", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"]
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const errors = [], diagnostics=[];
  page.on("pageerror", e => errors.push(e.stack || e.message));
  // Negative import tests deliberately log errors when corrupted ZIPs and
  // unsupported model extensions are rejected. Keep diagnostics for startup,
  // but assert only uncaught JS exceptions as runtime failures.
  page.on("console",message=>{if(message.type()==="error")diagnostics.push("console: "+message.text());});
  page.on("requestfailed",r=>diagnostics.push("request "+r.url()+" "+r.failure()?.errorText));
  page.on("response",r=>{if(r.status()>=400)diagnostics.push("HTTP "+r.status()+" "+r.url());});
  await page.addInitScript(()=>{
    window.__startupModuleErrors=[];
    window.addEventListener("error",e=>window.__startupModuleErrors.push({
      message:e.message,source:e.filename,line:e.lineno,column:e.colno
    }));
  });
  try {
    await page.goto("http://127.0.0.1:8787/studio/", { waitUntil: "domcontentloaded", timeout: 60000 });
    try{
      await page.locator("#viewport canvas").waitFor({ timeout: 12000 });
    }catch(err){
      const state=await page.evaluate(()=>({
        title:document.title,
        studioScript:document.querySelector('script[type="module"]')?.getAttribute("src"),
        viewport:!!document.querySelector("#viewport"),
        controls:!!document.querySelector("#precision-duplicate"),
        html:document.body.innerHTML.slice(-260),
        scriptErrors:window.__startupModuleErrors
      }));
      throw new Error("Studio startup diagnostic: "+JSON.stringify(state)+
        " errors "+JSON.stringify(errors)+" diagnostics "+JSON.stringify(diagnostics)+" / "+err.message);
    }
    await page.waitForFunction(() => document.querySelector("#art-filename")?.textContent.includes("Sample Artwork"), null, { timeout: 30000 });
    assert.equal(await page.locator("#site-status").textContent(), "예시 공간");
    assert.equal(await page.locator("#export-master-pack").isDisabled(),true,
      "unapproved scene must not export MASTER batch images");
    await page.locator('[data-mode="rotate"]').click();
    assert.match(await page.locator('[data-mode="rotate"]').getAttribute("class"), /active/);
    await page.locator('[data-mode="translate"]').click();
    const x = page.locator('[data-transform="position"][data-axis="x"]');
    await x.fill("2");
    await x.dispatchEvent("change");
    assert.equal(Number(await x.inputValue()), 2, "numeric transform updates the 3D object");
    await page.locator("#undo").click();
    assert.equal(Number(await x.inputValue()), 0, "undo should restore prior position");
    await page.locator("#redo").click();
    assert.equal(Number(await x.inputValue()), 2, "redo should repeat the position change");
    await page.locator('[data-view="aerial"]').click();
    assert.match(await page.locator('[data-view="aerial"]').getAttribute("class"), /active/);
    await page.locator("#sun-azimuth").evaluate(el => {
      el.value = "130";
      el.dispatchEvent(new Event("input", { bubbles: true }));
    });
    assert.equal(await page.locator("#sun-azimuth-value").textContent(), "130°");
    await page.locator("#master-lock").click();
    assert.equal(await x.isDisabled(), true, "approved placement should be locked");
    assert.equal(await page.locator("#site-preset").isDisabled(), true, "approved site should be locked");
    page.once("dialog", dialog => dialog.accept());
    await page.locator("#master-lock").click();
    assert.equal(await x.isDisabled(), false, "explicit unlock should restore controls");
    const pngEvent = page.waitForEvent("download", { timeout: 20000 });
    await page.locator("#shot-export").click();
    const png = await pngEvent;
    assert.match(png.suggestedFilename(), /\.png$/i);
    const jsonEvent = page.waitForEvent("download", { timeout: 10000 });
    await page.locator("#export-json").click();
    const json = await jsonEvent;
    const jsonFile = await json.path();
    const config = JSON.parse(fs.readFileSync(jsonFile, "utf8"));
    assert.equal(config.schema, "axoo-public-art-3d-studio-v1");
    assert.equal(config.artwork.transform.p[0], 2);
    assert.equal(config.lighting["sun-azimuth"], 130);
    // Full round-trip: modify the position, then re-apply saved project config.
    await x.fill("5");
    await x.dispatchEvent("change");
    await page.locator("#import-json").setInputFiles(jsonFile);
    await page.waitForFunction(() => Number(document.querySelector('[data-transform="position"][data-axis="x"]')?.value) === 2, null, { timeout: 10000 });
    const glbEvent = page.waitForEvent("download", { timeout: 45000 });
    await page.locator("#export-glb").click();
    const glb = await glbEvent;
    assert.match(glb.suggestedFilename(), /\.glb$/i);
    const file = await glb.path();
    const bytes = fs.readFileSync(file);
    assert.ok(bytes.length > 1000, "GLB should contain geometry");
    assert.equal(bytes.toString("ascii", 0, 4), "glTF", "binary GLB magic required");
    // The scene GLB can be round-tripped through the actual site loader.
    await page.locator("#site-file").setInputFiles({
      name: "test-import-site.glb",
      mimeType: "model/gltf-binary",
      buffer: bytes
    });
    await page.waitForFunction(
      () => document.querySelector("#site-status")?.textContent === "실제 모델",
      null, { timeout: 15000 }
    );
    assert.match(await page.locator("#site-filename").textContent(), /test-import-site\.glb/);
    // Imported artwork source geometry MUST retain its real dimensions.
    await page.locator("#art-height").fill("12");
    await page.locator("#art-file").setInputFiles({
      name: "saved-artwork.glb", mimeType: "model/gltf-binary", buffer: bytes
    });
    await page.waitForFunction(
      () => document.querySelector("#art-filename")?.textContent.includes("saved-artwork.glb"),
      null, { timeout: 15000 }
    );
    const sourceDims = await page.locator("#source-dimensions").textContent();
    const [sourceWidth, sourceHeight, sourceDepth] = sourceDims.split(" m ")[0].split(" × ").map(Number);
    assert.ok(sourceWidth > 2 && sourceHeight > 4 && sourceDepth > 2,
      "reimported full scene geometry must retain original site extents");
    const currentHeight = Number(await page.locator("#art-height").inputValue());
    assert.ok(Math.abs(currentHeight - sourceHeight) < 0.03,
      "artwork import should NOT silently resize to the previously entered 12 metres");
    assert.equal(Number(await page.locator('[data-transform="scale"][data-axis="x"]').inputValue()), 1,
      "initial artwork scale must stay 1 before user explicitly resizes");

    // 2D site plan is also embedded in the portable ZIP package.
    const pngPixel = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==",
      "base64"
    );
    await page.locator("#map-file").setInputFiles({ name: "site-plan.png", mimeType: "image/png", buffer: pngPixel });
    await page.waitForFunction(
      () => document.querySelector("#map-name")?.textContent.includes("site-plan.png"),
      null, { timeout: 12000 }
    );
    // Snapshot retains actual position, lighting and camera.
    const px = page.locator('[data-transform="position"][data-axis="x"]');
    await px.fill("4.5"); await px.dispatchEvent("change");
    await page.locator('[data-view="main"]').click();
    await page.locator("#master-lock").click();
    assert.equal(await px.isDisabled(), true);
    assert.match(await page.locator("#master-summary").textContent(), /Revision 1/);
    await page.locator('[data-view="rear"]').click();
    await page.locator("#restore-master-camera").click();
    const archiveDownloadEvent = page.waitForEvent("download", { timeout: 60000 });
    await page.locator("#export-project").click();
    const archiveDownload = await archiveDownloadEvent;
    assert.match(archiveDownload.suggestedFilename(), /\.zip$/);
    const archivePath = await archiveDownload.path();
    const archiveData = fs.readFileSync(archivePath);
    const archiveHeaders = archiveData.toString("latin1");
    assert.ok(archiveData.length > 2000, "project ZIP must contain binary assets");
    for (const entry of ["project.json", "assets/site", "assets/artwork", "assets/plan"]) {
      assert.ok(archiveHeaders.includes(entry), "ZIP must contain " + entry);
    }
    // ZIP compression can be smaller than a single source GLB: compare entries,
    // never compressed archive byte length against uncompressed model bytes.

    // Unlock and discard the scene; the full package restores real source assets.
    page.once("dialog", dialog => dialog.accept());
    await page.locator("#master-lock").click();
    await page.locator("#site-preset").selectOption("empty");
    await page.locator("#sample-art").click();
    assert.match(await page.locator("#art-filename").textContent(), /Sample Artwork/);
    await page.locator("#import-project").setInputFiles({
      name: "restored-project.zip", mimeType: "application/zip", buffer: archiveData
    });
    await page.waitForFunction(() =>
      document.querySelector("#site-filename")?.textContent.includes("test-import-site.glb") &&
      document.querySelector("#art-filename")?.textContent.includes("saved-artwork.glb") &&
      document.querySelector("#object-state")?.textContent === "MASTER LOCK",
      null, { timeout: 45000 }
    );
    assert.equal(Number(await px.inputValue()), 4.5, "ZIP restores saved model coordinates");
    assert.match(await page.locator("#map-name").textContent(), /site-plan\.png/);
    assert.match(await page.locator("#master-summary").textContent(), /Revision 1/);

    // Both settings-only and portable-project imports must fail closed when locked.
    await page.locator("#import-json").setInputFiles(jsonFile);
    await page.waitForTimeout(150);
    assert.equal(Number(await px.inputValue()), 4.5);
    await page.locator("#import-project").setInputFiles({
      name: "restored-project.zip", mimeType: "application/zip", buffer: archiveData
    });
    await page.waitForTimeout(150);
    assert.equal(Number(await px.inputValue()), 4.5);

    // An invalid ZIP cannot damage a currently loaded, unlocked scene.
    page.once("dialog", dialog => dialog.accept());
    await page.locator("#master-lock").click();
    await page.locator("#import-project").setInputFiles({
      name: "invalid.zip", mimeType: "application/zip", buffer: Buffer.from("invalid archive")
    });
    await page.waitForTimeout(250);
    assert.equal(Number(await px.inputValue()), 4.5);
    assert.match(await page.locator("#art-filename").textContent(), /saved-artwork\.glb/);
    // Regression: approving MASTER during an unfinished GLB read must cancel
    // the stale async import rather than replacing an already approved artwork.
    await page.evaluate(() => {
      const originalArrayBuffer = File.prototype.arrayBuffer;
      window.__originalFileArrayBuffer = originalArrayBuffer;
      File.prototype.arrayBuffer = async function () {
        await new Promise(resolve => setTimeout(resolve, 850));
        return originalArrayBuffer.call(this);
      };
    });
    await page.locator("#art-file").setInputFiles({
      name: "stale-import.glb", mimeType: "model/gltf-binary", buffer: bytes
    });
    await page.locator("#master-lock").click();
    await page.waitForTimeout(1200);
    await page.evaluate(() => { File.prototype.arrayBuffer = window.__originalFileArrayBuffer; });
    assert.match(await page.locator("#art-filename").textContent(), /saved-artwork\.glb/,
      "pending async import must not replace artwork after master approval");
    assert.equal(Number(await px.inputValue()), 4.5,
      "pending async import must preserve approved artwork placement");
    assert.equal(await px.isDisabled(), true, "scene remains locked after asynchronous import resolves");

    // Site model import compatibility: tests load actual mesh bytes through
    // the browser (not just checking the input file extension list).
    page.once("dialog", dialog => dialog.accept());
    await page.locator("#master-lock").click();
    const modelFiles = [...siteFixtures, await loadFbxFixture()];
    const fileInput = page.locator("#site-file");
    for (const file of modelFiles) {
      await fileInput.setInputFiles(file);
      await page.waitForFunction(
        name => document.querySelector("#site-filename")?.textContent === name,
        file.name, { timeout: 25000 }
      );
      assert.equal(await page.locator("#site-status").textContent(), "실제 모델");
      const dimensions = await page.locator("#site-dimensions").textContent();
      assert.match(dimensions, /메시 [1-9]\d*개/, file.name + " must contain a valid scene mesh");
      assert.doesNotMatch(dimensions, /^—$/, file.name + " must report real native dimensions");
      assert.equal(Number(await px.inputValue()), 4.5, "site loading must not alter artwork placement");
    }

    // Saving a non-GLB site file must keep its original source extension
    // and restore via the ZIP project asset decoder.
    const objFile = modelFiles.find(file => file.name.endsWith(".obj"));
    await fileInput.setInputFiles(objFile);
    await page.waitForFunction(() => document.querySelector("#site-filename")?.textContent === "test-site.obj");
    const zipDownload = page.waitForEvent("download", { timeout: 45000 });
    await page.locator("#export-project").click();
    const portable = fs.readFileSync(await (await zipDownload).path());
    await page.locator("#site-preset").selectOption("empty");
    await page.locator("#import-project").setInputFiles({
      name: "site-obj-roundtrip.zip", mimeType: "application/zip", buffer: portable
    });
    await page.waitForFunction(() => document.querySelector("#site-filename")?.textContent === "test-site.obj",
      null, { timeout: 20000 });
    assert.match(await page.locator("#site-dimensions").textContent(), /3\.00 × 2\.00 × 1\.00/);
    assert.equal(Number(await px.inputValue()), 4.5);

    // Reject unsupported CAD/BIM formats without discarding existing scene.
    await fileInput.setInputFiles({
      name: "unsupported.skp", mimeType: "application/octet-stream", buffer: Buffer.from("not-supported")
    });
    await page.waitForFunction(() => document.querySelector("#toast")?.textContent.includes("SKP/IFC"),
      null, { timeout: 10000 });
    assert.equal(await page.locator("#site-filename").textContent(), "test-site.obj");

    // v0.4: real imported site hides the redundant fallback ground mapping.
    assert.equal(await page.locator("#fallback-ground").isHidden(), true);
    assert.equal(await page.locator("#site-ground-note").isVisible(), true);
    await page.locator("#site-unit").selectOption("cm");
    assert.match(await page.locator("#site-dimensions").textContent(), /0\.03 × 0\.02 × 0\.01/,
      "cm-to-m correction changes site display, not source mesh");
    await page.locator("#site-up").selectOption("z");
    assert.match(await page.locator("#site-dimensions").textContent(), /0\.03 × 0\.01 × 0\.02/,
      "Z-up should rotate source site axes into Y-up world");
    await page.locator("#site-unit").selectOption("m");
    await page.locator("#site-up").selectOption("y");

    // Fast navigation is configurable without changing the camera pose or scene.
    await page.locator("#nav-speed").evaluate(el => {
      el.value="4";
      el.dispatchEvent(new Event("input", {bubbles:true}));
    });
    assert.equal(await page.locator("#nav-speed-value").textContent(), "4.0×");
    await page.locator("#light-preset").selectOption("golden");
    assert.equal(await page.locator("#sun-elevation").inputValue(), "17");
    assert.equal(await page.locator("#sun-helper").isChecked(), true);

    // A vertical-only imported mesh is not a verified ground surface.
    // Switch to the original demonstration plaza for legacy v0.4 free placement.
    // v0.5 separately tests grounding against a surveyed horizontal site mesh.
    await page.locator("#site-preset").selectOption("plaza");
    // Add two distinct foliage presets, a shrub, and two physically working lights.
    const canvas = page.locator("#viewport canvas");
    await page.locator('[data-view="aerial"]').click();
    const bounds = await canvas.boundingBox();
    assert.ok(bounds?.width && bounds?.height);
    for (const [kind, expected] of [
      ["tree-round", 1], ["tree-cone", 2], ["shrub", 3], ["point-light", 4], ["spot-light", 5]
    ]) {
      await page.locator('[data-add-extra="'+kind+'"]').click();
      await page.mouse.click(bounds.x+bounds.width*.65,bounds.y+bounds.height*.82);
      try {
        await page.waitForFunction(expectedCount =>
          document.querySelectorAll("#extra-list button").length === expectedCount,
          expected, {timeout:10000});
      } catch (error) {
        const state = await page.evaluate(() => ({
          displayed: document.querySelector("#extra-count")?.textContent,
          count: document.querySelectorAll("#extra-list button").length,
          placement: document.querySelector("#placement-hint")?.textContent,
          placementHidden: document.querySelector("#placement-hint")?.hidden,
          toast: document.querySelector("#toast")?.textContent,
          site: document.querySelector("#site-filename")?.textContent,
          viewport: document.querySelector("#viewport")?.getBoundingClientRect()?.toJSON()
        }));
        throw new Error(kind + " failed to place: " + JSON.stringify(state) +
          " / JS errors: " + JSON.stringify(errors) + " / " + error.message);
      }
    }
    assert.match(await page.locator("#extra-count").textContent(), /5개/);
    assert.equal(await page.locator("#delete-selected").isEnabled(), true);
    await page.locator("#extra-list button").first().click();
    assert.match(await page.locator("#object-name").textContent(), /활엽수/);
    const extraX = page.locator('[data-transform="position"][data-axis="x"]');
    await extraX.fill("6.5"); await extraX.dispatchEvent("change");
    assert.equal(Number(await extraX.inputValue()), 6.5, "selected foliage uses transform inspector");
    await page.locator("#delete-selected").click();
    assert.equal(await page.locator("#extra-list button").count(), 4);
    await page.locator("#undo").click();
    assert.equal(await page.locator("#extra-list button").count(), 5, "undo restores removed foliage");
    await page.locator("#extra-list button").last().click();
    assert.match(await page.locator("#object-name").textContent(), /스폿 조명/);
    assert.equal(await page.locator("#extra-light-controls").isVisible(), true);
    await page.locator("#extra-light-power").evaluate(el => {
      el.value="8";
      el.dispatchEvent(new Event("input",{bubbles:true}));
    });
    assert.equal(await page.locator("#extra-light-power-value").textContent(), "8.0");

    // Source site model can be reloaded without altering the placed trees.
    await page.locator("#site-file").setInputFiles(objFile);
    await page.waitForFunction(() => document.querySelector("#site-filename")?.textContent === "test-site.obj",
      null, {timeout:15000});
    // Light and foliage transforms persist through full project ZIP recovery.
    await page.locator("#select-artwork").click();
    const extraZipEvent = page.waitForEvent("download", {timeout:60000});
    await page.locator("#export-project").click();
    const extraZip = fs.readFileSync(await (await extraZipEvent).path());
    await page.locator("#site-preset").selectOption("empty");
    assert.equal(await page.locator("#fallback-ground").isVisible(),true);
    await page.locator("#import-project").setInputFiles({
      name:"full-scene-v04.zip", mimeType:"application/zip", buffer:extraZip
    });
    await page.waitForFunction(() =>
      document.querySelectorAll("#extra-list button").length===5 &&
      document.querySelector("#site-filename")?.textContent==="test-site.obj",
      null,{timeout:45000}
    );
    assert.equal(await page.locator("#fallback-ground").isHidden(),true);
    await page.locator("#extra-list button").last().click();
    assert.equal(await page.locator("#extra-light-power-value").textContent(),"8.0");
    await page.locator("#select-artwork").click();

    // Render image is a real PNG even with overlays visible in editing view.
    const imgEvent=page.waitForEvent("download",{timeout:60000});
    await page.locator("#shot-export").click();
    const img=fs.readFileSync(await (await imgEvent).path());
    assert.equal(img.toString("hex",0,8),"89504e470d0a1a0a");
    assert.ok(img.readUInt32BE(16)>bounds.width,"high resolution export increases image width");

    // A finished scene with planted trees and local lights must still
    // export as a real Blender-compatible glTF binary.
    const sceneGlbEvent = page.waitForEvent("download", {timeout:60000});
    await page.locator("#export-glb").click();
    const sceneGlb = fs.readFileSync(await (await sceneGlbEvent).path());
    assert.equal(sceneGlb.toString("ascii",0,4), "glTF");
    assert.ok(sceneGlb.length > 5000, "GLB must contain expanded scene geometry");

    await page.locator("#master-lock").click();
    assert.equal(await page.locator('[data-add-extra="shrub"]').isDisabled(), true,
      "approved master must prevent planting more objects");
    assert.equal(await page.locator("#site-unit").isDisabled(), true,
      "approved master must prevent site unit changes");
    assert.equal(await page.locator("#extra-list button").first().isDisabled(), true,
      "approved master must prevent selecting editable extras");

    // V0.5: a surveyed Y-up floor at exactly Y=1m. Its face normals point up.
    page.once("dialog", dialog => dialog.accept());
    await page.locator("#master-lock").click();
    const terrainOBJ = [
      "o surveyed_ground","v -10 1 -10","v 10 1 10",
      "v 10 1 -10","v -10 1 10",
      "f 1 2 3","f 1 4 2",""
    ].join("\n");
    await page.locator("#site-file").setInputFiles({
      name:"surveyed-ground.obj", mimeType:"text/plain", buffer:Buffer.from(terrainOBJ)
    });
    await page.waitForFunction(() => document.querySelector("#site-filename")?.textContent==="surveyed-ground.obj",
      null,{timeout:15000});
    await page.locator("#select-artwork").click();
    const artY=page.locator('[data-transform="position"][data-axis="y"]');
    const artX=page.locator('[data-transform="position"][data-axis="x"]');
    const artZ=page.locator('[data-transform="position"][data-axis="z"]');
    for(const [el,value] of [[artX,"0"],[artZ,"0"],[artY,"8"]]) {
      await el.fill(value); await el.dispatchEvent("change");
    }
    await page.locator("#ground-offset").fill("0.25");
    await page.locator("#ground-selected").click();
    assert.match(await page.locator("#ground-status").textContent(), /1\.00m/,
      "3D grounding must raycast actual terrain elevation");
    const groundedY=Number(await artY.inputValue());
    assert.ok(groundedY>1.0 && groundedY<2.0,"artwork base must rest 0.25m above real terrain, not y=0");
    await page.locator("#undo").click();
    assert.equal(Number(await artY.inputValue()),8,"undo must restore original ungrounded height");
    await page.locator("#redo").click();
    assert.ok(Math.abs(Number(await artY.inputValue())-groundedY)<.01);

    // No invented floor when off the imported site footprint.
    await artX.fill("30"); await artX.dispatchEvent("change");
    const oldY=Number(await artY.inputValue());
    await page.locator("#ground-selected").click();
    assert.equal(Number(await artY.inputValue()),oldY, "do not snap to fabricated y=0 outside real site");
    await artX.fill("0"); await artX.dispatchEvent("change");

    // X/Z movement snaps after editing when requested.
    await page.locator("#auto-ground").check();
    await artY.fill("7");await artY.dispatchEvent("change");
    await artZ.fill("1");await artZ.dispatchEvent("change");
    assert.ok(Math.abs(Number(await artY.inputValue())-groundedY)<.03,
      "auto-ground follows surveyed height on X/Z edits");
    await page.locator("#auto-ground").uncheck();

    // Plan can remain visible over a real loaded site; orientation and
    // opacity are manually adjustable and saved with portable ZIP files.
    await page.locator("#plan-visible").check();
    await page.locator("#map-width").fill("24");
    await page.locator("#map-width").dispatchEvent("change");
    for(const [id,val] of [["plan-x","3.5"],["plan-z","-1.5"],["plan-rotation","32"],
      ["plan-elevation","1.1"],["plan-opacity","45"]]) {
      const input=page.locator("#"+id);
      await input.fill(val);
      await input.dispatchEvent(id==="plan-opacity"?"input":"change");
    }
    assert.equal(await page.locator("#plan-opacity-value").textContent(),"45%");
    assert.equal(await page.locator("#fallback-ground").isHidden(),true);
    const planEvent=page.waitForEvent("download",{timeout:60000});
    await page.locator("#export-project").click();
    const savedPlanZip=fs.readFileSync(await (await planEvent).path());

    // Wipe scene then reopen model+plan alignment; location, geometry and
    // master-safe overlay flags must survive a complete round-trip.
    await page.locator("#site-preset").selectOption("empty");
    await page.locator("#plan-x").fill("0");await page.locator("#plan-x").dispatchEvent("change");
    await page.locator("#import-project").setInputFiles({
      name:"surveyed-plan.zip",mimeType:"application/zip",buffer:savedPlanZip
    });
    await page.waitForFunction(() =>
      document.querySelector("#site-filename")?.textContent==="surveyed-ground.obj" &&
      Number(document.querySelector("#plan-x")?.value)===3.5,
      null,{timeout:45000});
    assert.equal(Number(await page.locator("#plan-rotation").inputValue()),32);
    assert.equal(Number(await page.locator("#plan-z").inputValue()),-1.5);
    assert.equal(await page.locator("#plan-opacity").inputValue(),"45");
    assert.equal(await page.locator("#plan-elevation").inputValue(),"1.1");
    assert.equal(await page.locator("#plan-visible").isChecked(),true);
    assert.equal(await page.locator("#fallback-ground").isHidden(),true);

    // Approving MASTER disables both plan registration and ground placement.
    await page.locator("#master-lock").click();
    for(const id of ["plan-pick-center","plan-visible","ground-selected","pick-selected-site","ground-offset"]) {
      assert.equal(await page.locator("#"+id).isDisabled(),true,id+" must respect MASTER LOCK");
    }
    // v0.6 all layer controls must be disabled on an approved MASTER.
    assert.equal(await page.locator('[data-layer-visible="artwork"]').isDisabled(),true);
    assert.equal(await page.locator('[data-layer-lock="lighting"]').isDisabled(),true);
    page.once("dialog", dialog=>dialog.accept());
    await page.locator("#master-lock").click();

    // Group visibility protects the scene mesh without deleting it or its source.
    const artLayer=page.locator('[data-layer-visible="artwork"]');
    await artLayer.uncheck();
    assert.equal(await artX.isDisabled(),true,"hidden artwork cannot be transformed");
    await artLayer.check();
    assert.equal(await artX.isDisabled(),false,"visible artwork returns to editable state");
    await page.locator('[data-layer-lock="artwork"]').check();
    assert.equal(await artX.isDisabled(),true,"selection-locked artwork cannot be moved");
    await page.locator("#undo").click();
    assert.equal(await page.locator('[data-layer-lock="artwork"]').isChecked(),false,"Undo restores layer lock");
    assert.equal(await artX.isDisabled(),false);

    // Imported scene hierarchy remains read-only, but each source mesh can
    // be explicitly classified as building/landscape instead of guessed.
    await page.locator(".site-scene-objects summary").click();
    const siteRows=page.locator(".site-mesh-item");
    assert.ok(await siteRows.count()>=1,"real OBJ terrain has named site meshes");
    const category=siteRows.first().locator("select");
    await category.selectOption("buildings");
    assert.equal(await category.inputValue(),"buildings");
    const meshVisible=siteRows.first().locator('input[type="checkbox"]');
    await meshVisible.uncheck();
    assert.equal(await meshVisible.isChecked(),false);
    await page.locator("#undo").click();
    assert.equal(await page.locator(".site-mesh-item").first().locator('input[type="checkbox"]').isChecked(),true,
      "Undo restores individual site mesh visibility");
    await page.locator('[data-layer-visible="buildings"]').uncheck();

    // A layer group is a view filter, not an edit to imported site geometry.
    const sourceFile=await page.locator("#site-filename").textContent();
    assert.equal(sourceFile,"surveyed-ground.obj");
    const jsonLayerDownload=page.waitForEvent("download",{timeout:15000});
    await page.locator("#export-json").click();
    const layerJSON=JSON.parse(fs.readFileSync(await (await jsonLayerDownload).path(),"utf8"));
    assert.equal(layerJSON.layers.groups.buildings.visible,false);
    assert.ok(Object.values(layerJSON.layers.siteNodes).some(n=>n.category==="buildings"));
    assert.equal(layerJSON.site.file,"surveyed-ground.obj");

    // Independently hide/lock one existing lamp/tree, no modification to
    // others; type and transform survive portable ZIP roundtrip.
    await page.locator(".extra-scene-objects summary").click();
    assert.equal(await page.locator("#layer-extra-list .extra-layer-item").count(),5);
    const firstExtra=page.locator("#layer-extra-list .extra-layer-item").first();
    await firstExtra.locator('[data-extra-visible]').uncheck();
    const firstExtraLocked=page.locator("#layer-extra-list .extra-layer-item").first().locator('[data-extra-lock]');
    await firstExtraLocked.check();
    assert.equal(await firstExtraLocked.isChecked(),true);
    const layerZipEvent=page.waitForEvent("download",{timeout:60000});
    await page.locator("#export-project").click();
    const layerZip=fs.readFileSync(await (await layerZipEvent).path());
    await page.locator("#site-preset").selectOption("empty");
    await page.locator("#import-project").setInputFiles({
      name:"layers-v06.zip", mimeType:"application/zip", buffer:layerZip
    });
    await page.waitForFunction(()=>document.querySelector("#site-filename")?.textContent==="surveyed-ground.obj" &&
      document.querySelectorAll("#layer-extra-list .extra-layer-item").length===5,
      null,{timeout:45000});
    assert.equal(await page.locator('[data-layer-visible="buildings"]').isChecked(),false);
    assert.equal(await page.locator(".site-mesh-item").first().locator("select").inputValue(),"buildings");
    assert.equal(await page.locator("#layer-extra-list .extra-layer-item").first().locator('[data-extra-visible]').isChecked(),false);
    assert.equal(await page.locator("#layer-extra-list .extra-layer-item").first().locator('[data-extra-lock]').isChecked(),true);

    // Site visibility settings must lock after MASTER approval as well.
    await page.locator("#master-lock").click();
    assert.equal(await page.locator('[data-layer-visible="buildings"]').isDisabled(),true);
    assert.equal(await page.locator(".site-mesh-item").first().locator("select").isDisabled(),true);
    assert.equal(await page.locator("#layer-extra-list .extra-layer-item").first().locator('[data-extra-visible]').isDisabled(),true);

    // v0.7: never permit surface/matte alteration on an approved MASTER.
    assert.equal(await page.locator("#apply-material").isDisabled(),true);
    assert.equal(await page.locator("#reset-material").isDisabled(),true);
    page.once("dialog", dialog => dialog.accept());
    await page.locator("#master-lock").click();
    await page.locator("#art-material").selectOption("stainless");
    await page.locator("#art-material-color").fill("#cbd3d9");
    await page.locator("#apply-material").click();
    assert.match(await page.locator("#material-status").textContent(), /브러시드 스테인리스/);
    const matJSONEvent=page.waitForEvent("download",{timeout:20000});
    await page.locator("#export-json").click();
    const matJSON=JSON.parse(fs.readFileSync(await (await matJSONEvent).path(),"utf8"));
    assert.equal(matJSON.render.artworkMaterial.preset,"stainless");
    assert.equal(matJSON.render.artworkMaterial.color,"#cbd3d9");

    await page.locator("#undo").click();
    assert.match(await page.locator("#material-status").textContent(), /원본 작품 재질/,"Undo restores source materials");
    await page.locator("#redo").click();
    assert.match(await page.locator("#material-status").textContent(), /브러시드 스테인리스/);
    await page.locator("#reset-material").click();
    assert.match(await page.locator("#material-status").textContent(), /원본 작품 재질/);
    await page.locator("#art-material").selectOption("stone");
    await page.locator("#art-material-color").fill("#bdb49e");
    await page.locator("#apply-material").click();

    // Minimal valid Radiance RGBE HDR (uncompressed 4×2 panorama).
    const header=Buffer.from("#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y 2 +X 4\n","ascii");
    const pixels=Buffer.alloc(4*2*4);
    for(let k=0;k<8;k++){
      pixels[k*4]=160;pixels[k*4+1]=150;pixels[k*4+2]=140;pixels[k*4+3]=129;
    }
    await page.locator("#env-file").setInputFiles({
      name:"studio-light-test.hdr",mimeType:"image/vnd.radiance",buffer:Buffer.concat([header,pixels])
    });
    await page.waitForFunction(()=>document.querySelector("#env-mode")?.value==="hdr" &&
      document.querySelector("#env-filename")?.textContent.includes("studio-light-test.hdr"),
      null,{timeout:15000});
    await page.locator("#env-strength").evaluate(el=>{
      el.value="1.8";el.dispatchEvent(new Event("input",{bubbles:true}));
    });
    assert.equal(await page.locator("#env-strength-value").textContent(),"1.8");

    // A portrait browser viewport still supports exact 16:9 image export.
    await page.locator("#render-aspect").selectOption("landscape16x9");
    await page.locator("#render-resolution").selectOption("2");
    await page.locator("#camera-focal").evaluate(el=>{
      el.value="50";el.dispatchEvent(new Event("input",{bubbles:true}));
    });
    assert.equal(await page.locator("#camera-focal-value").textContent(),"50 mm");
    const renderDownload=page.waitForEvent("download",{timeout:60000});
    await page.locator("#shot-export").click();
    const image=fs.readFileSync(await (await renderDownload).path());
    assert.equal(image.toString("hex",0,8),"89504e470d0a1a0a");
    const outWidth=image.readUInt32BE(16),outHeight=image.readUInt32BE(20);
    assert.ok(Math.abs(outWidth/outHeight-16/9)<.003,
      "render PNG dimensions must follow selected 16:9 ratio, not viewport");
    const restoreJSONDownload=page.waitForEvent("download",{timeout:30000});
    await page.locator("#export-json").click();
    const beforeRestoreJSON=JSON.parse(fs.readFileSync(await (await restoreJSONDownload).path(),"utf8"));
    assert.equal(beforeRestoreJSON.render.focalLength,50,"temporary output aspect must not alter focal length");
    assert.equal(beforeRestoreJSON.render.aspect,"landscape16x9");

    // Complete portable ZIP must contain both user HDR asset and optional
    // material override settings. Imported file content remains untouched.
    const hdrZipEvent=page.waitForEvent("download",{timeout:60000});
    await page.locator("#export-project").click();
    const hdrArchive=fs.readFileSync(await (await hdrZipEvent).path());
    assert.ok(hdrArchive.toString("latin1").includes("assets/environment"),
      "original Radiance HDR binary must be embedded in archive");
    await page.locator("#reset-material").click();
    await page.locator("#env-mode").selectOption("neutral");
    await page.locator("#camera-focal").evaluate(el=>{
      el.value="35";el.dispatchEvent(new Event("input",{bubbles:true}));
    });
    await page.locator("#render-aspect").selectOption("square");
    await page.locator("#import-project").setInputFiles({
      name:"render-v07.zip",mimeType:"application/zip",buffer:hdrArchive
    });
    await page.waitForFunction(()=>
      document.querySelector("#material-status")?.textContent.includes("석재") &&
      document.querySelector("#env-mode")?.value==="hdr" &&
      document.querySelector("#camera-focal-value")?.textContent==="50 mm" &&
      document.querySelector("#render-aspect")?.value==="landscape16x9",
      null,{timeout:45000});
    assert.equal(await page.locator("#env-strength-value").textContent(),"1.8");
    assert.equal(await page.locator("#env-filename").textContent(),"HDRI: studio-light-test.hdr · 반사 적용");

    await page.locator("#master-lock").click();
    assert.equal(await page.locator("#apply-material").isDisabled(),true);
    assert.equal(await page.locator("#art-material").isDisabled(),true);

    // v0.8: accepted MASTER is required; all eight 16:9 frames, optional
    // contact sheet, immutable-geometry QA manifest and review notes ship
    // in a single portable browser-generated ZIP.
    assert.equal(await page.locator("#export-master-pack").isEnabled(),true);
    const projectBefore=page.waitForEvent("download",{timeout:20000});
    await page.locator("#export-json").click();
    const approvedBefore=JSON.parse(fs.readFileSync(await (await projectBefore).path(),"utf8"));
    await page.locator("#batch-quality").selectOption("1");
    assert.equal(await page.locator("#batch-contact").isChecked(),true);
    const batchEvent=page.waitForEvent("download",{timeout:90000});
    await page.locator("#export-master-pack").click();
    const batch=await batchEvent;
    assert.match(batch.suggestedFilename(),/MASTER-REV\d+-8views\.zip$/);
    const batchPath=await batch.path();
    const inspectScript=[
      "import json,sys,zipfile,struct",
      "with zipfile.ZipFile(sys.argv[1]) as z:",
      "  files=z.namelist()",
      "  m=json.loads(z.read('render-manifest.json'))",
      "  assert m['schema']=='axoo-master-render-pack-v1'",
      "  assert m['qa']['approvedMaster']",
      "  assert m['qa']['unchangedSceneAfter']",
      "  assert m['qa']['sceneSignaturePreserved']",
      "  assert len(m['views'])==8",
      "  assert 'REVIEW_NOTES.txt' in files",
      "  assert '00-contact-sheet.png' in files",
      "  shots=[]",
      "  for item in m['views']:",
      "    name=item['filename']",
      "    assert name in files",
      "    png=z.read(name)",
      "    assert png[:8]==b'\\x89PNG\\r\\n\\x1a\\n'",
      "    w,h=struct.unpack('>II',png[16:24])",
      "    assert abs(w/h-16/9)<0.003",
      "    assert w==item['width'] and h==item['height']",
      "    assert len(item['position'])==3 and len(item['target'])==3",
      "    shots.append((name,w,h))",
      "  print(json.dumps({'files':len(files),'shots':shots,'qa':m['qa']}))"
    ].join("\n");
    const inspected=JSON.parse(execFileSync("python3",["-c",inspectScript,batchPath],
      {encoding:"utf8",timeout:30000}).trim());
    assert.equal(inspected.shots.length,8,"all standard viewpoints must be exported");
    assert.match(await page.locator("#batch-status").textContent(),/장면 일치 검사 통과/);

    const projectAfter=page.waitForEvent("download",{timeout:20000});
    await page.locator("#export-json").click();
    const approvedAfter=JSON.parse(fs.readFileSync(await (await projectAfter).path(),"utf8"));
    assert.deepEqual(approvedAfter.artwork,approvedBefore.artwork,"batch export cannot change approved artwork");
    assert.deepEqual(approvedAfter.site,approvedBefore.site,"batch export cannot change original site");
    assert.deepEqual(approvedAfter.extras,approvedBefore.extras,"batch export cannot move/retint landscape objects");
    assert.deepEqual(approvedAfter.layers,approvedBefore.layers,"batch export cannot alter site layers");
    assert.deepEqual(approvedAfter.camera,approvedBefore.camera,"batch export must restore exact viewing camera");
    assert.deepEqual(approvedAfter.lighting,approvedBefore.lighting,"batch export must restore light controls");
    assert.deepEqual(approvedAfter.render,approvedBefore.render,"batch export cannot change material/lens");
    assert.equal(approvedAfter.artwork.locked,true,"master remains approved after render");

    // v0.9 review: use the actual v0.8 eight-PNG ZIP as baseline, then
    // a byte-for-byte image as a harmless mock of user-provided enhancement.
    await page.locator("#review-batch-file").setInputFiles({
      name:"master-eight-views.zip",mimeType:"application/zip",buffer:fs.readFileSync(batchPath)
    });
    await page.waitForFunction(()=>document.querySelector("#review-status")?.textContent.includes("8컷 불러오기 완료"),
      null,{timeout:45000});
    assert.equal(await page.locator("#review-export").isEnabled(),true);
    assert.equal(await page.locator("#review-approve").isDisabled(),true);
    const basePNG=execFileSync("python3",["-c",
      "import zipfile,sys;sys.stdout.buffer.write(zipfile.ZipFile(sys.argv[1]).read('01-main.png'))",
      batchPath],{timeout:20000});
    await page.locator("#review-candidate-file").setInputFiles({
      name:"artist-enhanced.png",mimeType:"image/png",buffer:basePNG
    });
    await page.waitForFunction(()=>document.querySelector("#review-candidate-name")?.textContent==="artist-enhanced.png",
      null,{timeout:20000});
    assert.equal(await page.locator("#review-overlay").isVisible(),true);
    await page.locator("#review-slider").evaluate(el=>{
      el.value="66";el.dispatchEvent(new Event("input",{bubbles:true}));
    });
    assert.equal(await page.locator("#review-slider-value").textContent(),"66%");
    for(const id of ["review-artwork","review-site","review-scale","review-materials"])
      await page.locator("#"+id).check();
    await page.locator("#review-note").fill("Mock candidate: matches original image exactly.");
    assert.equal(await page.locator("#review-approve").isEnabled(),true);
    await page.locator("#review-approve").click();
    assert.match(await page.locator("#review-counter").textContent(),/1 \/ 8/);
    const reviewEvent=page.waitForEvent("download",{timeout:60000});
    await page.locator("#review-export").click();
    const review=await reviewEvent;
    assert.match(review.suggestedFilename(),/visual-review-DRAFT.zip$/);
    const reviewZipPath=await review.path();
    const audit=JSON.parse(execFileSync("python3",["-c",
      ["import json,sys,zipfile","with zipfile.ZipFile(sys.argv[1]) as z:",
       "  r=json.loads(z.read('visual-review.json'))",
       "  assert r['schema']=='axoo-visual-review-v1'",
       "  assert r['humanApprovedCount']==1",
       "  assert r['overallStatus']=='incomplete-review'",
       "  assert len(r['items'])==8",
       "  assert 'reference/01-main.png' in z.namelist()",
       "  assert 'candidate/01-main.png' in z.namelist()",
       "  print(json.dumps({'approved':r['humanApprovedCount'],'status':r['overallStatus']}))"].join("\n"),
       reviewZipPath],{encoding:"utf8",timeout:20000}).trim());
    assert.equal(audit.approved,1);
    const afterReviewEvent=page.waitForEvent("download",{timeout:20000});
    await page.locator("#export-json").click();
    const afterReview=JSON.parse(fs.readFileSync(await (await afterReviewEvent).path(),"utf8"));
    // createdAt belongs to the export operation, not to the editable scene.
    delete afterReview.createdAt;
    delete approvedAfter.createdAt;
    assert.deepEqual(afterReview,approvedAfter,"enhanced-image review must not mutate MASTER 3D scene");

    // v1.0: internal proposal preflight cannot silently sign off a project.
    assert.match(await page.locator("#readiness-status").textContent(),/추가 확인 필요/);
    for(const id of ["ready-dimensions","ready-artwork","ready-placement","ready-render"])
      await page.locator("#"+id).check();
    await page.locator("#readiness-scan").click();
    assert.match(await page.locator("#readiness-status").textContent(),/사내 제안서 검토 준비 완료/);
    const readyDownload=page.waitForEvent("download",{timeout:20000});
    await page.locator("#readiness-export").click();
    const readinessReport=JSON.parse(fs.readFileSync(await (await readyDownload).path(),"utf8"));
    assert.equal(readinessReport.schema,"axoo-public-art-internal-readiness-v1");
    assert.equal(readinessReport.status,"ready-for-internal-review");
    assert.ok(readinessReport.source.siteImported&&readinessReport.source.artworkImported);
    assert.ok(readinessReport.caveats.some(t=>t.includes("NOT structural engineering approval")));

    // v1.0: exported full-project ZIP includes SHA-256 for every preserved
    // source file, and a mutated JSON member fails before any scene change.
    const integrityExport=page.waitForEvent("download",{timeout:45000});
    await page.locator("#export-project").click();
    const verifiedPath=await (await integrityExport).path();
    const intact=JSON.parse(execFileSync("python3",["-c",
      ["import zipfile,json,hashlib,sys","with zipfile.ZipFile(sys.argv[1]) as z:",
       "  m=json.loads(z.read('integrity.json'))",
       "  assert m['schema']=='axoo-studio-integrity-v1'",
       "  assert 'project.json' in m['files']",
       "  assert all(hashlib.sha256(z.read(n)).hexdigest()==v['sha256'] for n,v in m['files'].items())",
       "  print(json.dumps({'checks':len(m['files'])}))"].join("\n"),
       verifiedPath],{encoding:"utf8",timeout:30000}).trim());
    assert.ok(intact.checks>=3,"site, artwork and settings should all be checksummed");

    const corruptPath=verifiedPath+".corrupt.zip";
    execFileSync("python3",["-c",
      ["import zipfile,sys",
       "with zipfile.ZipFile(sys.argv[1]) as source, zipfile.ZipFile(sys.argv[2],'w',compression=zipfile.ZIP_DEFLATED) as target:",
       "  for info in source.infolist():",
       "    value=source.read(info.filename)",
       "    if info.filename=='project.json': value+=b'  '",
       "    target.writestr(info.filename,value)"].join("\n"),
      verifiedPath,corruptPath],{timeout:30000});
    page.once("dialog",dialog=>dialog.accept());
    await page.locator("#master-lock").click();
    const beforeCorrupt=await page.locator("#site-filename").textContent();
    await page.locator("#import-project").setInputFiles({
      name:"modified-project.zip",mimeType:"application/zip",buffer:fs.readFileSync(corruptPath)
    });
    try {
      await page.waitForFunction(()=>/무결성 검사 실패|파일 크기가 일치하지/.test(document.querySelector("#toast")?.textContent||""),
        null,{timeout:12000});
    }catch(error){
      const inspect=await page.evaluate(()=>({
        toast:document.querySelector("#toast")?.textContent,
        saveStatus:document.querySelector("#save-status")?.textContent,
        filename:document.querySelector("#site-filename")?.textContent,
        input:document.querySelector("#import-project")?.files?.[0]?.name,
        approved:document.querySelector("#master-lock")?.textContent
      }));
      throw new Error("Corrupted ZIP rejection diagnostic: "+JSON.stringify(inspect)+
        " JS errors: "+JSON.stringify(errors)+"; "+error.message);
    }
    assert.equal(await page.locator("#site-filename").textContent(),beforeCorrupt,
      "invalid ZIP must not replace original imported site");
    await page.locator("#readiness-scan").click();
    assert.match(await page.locator("#readiness-status").textContent(),/현재 MASTER VIEW가 승인되지 않았습니다/,
      "unlocking must invalidate internal READY status");

    // v1.1: authentic glTF 2.0 external .bin dependency in a self-contained
    // ZIP. Source origin is 15 km away: test reversible viewer recentering.
    const gltfZip=execFileSync("python3",["-c",[
      "import io,json,zipfile,struct,sys",
      "coordinates=[15000.,1.,-4.,15000.,1.,4.,15004.,1.,4.]",
      "payload=struct.pack('<9f',*coordinates)",
      "scene={'asset':{'version':'2.0'},'scene':0,'scenes':[{'nodes':[0]}],",
      "       'nodes':[{'mesh':0}],",
      "       'meshes':[{'primitives':[{'attributes':{'POSITION':0},'mode':4}]}],",
      "       'accessors':[{'bufferView':0,'componentType':5126,'count':3,'type':'VEC3',",
      "                     'min':[15000,1,-4],'max':[15004,1,4]}],",
      "       'bufferViews':[{'buffer':0,'byteOffset':0,'byteLength':len(payload)}],",
      "       'buffers':[{'byteLength':len(payload),'uri':'terrain.bin'}]}",
      "out=io.BytesIO()",
      "with zipfile.ZipFile(out,'w',compression=zipfile.ZIP_DEFLATED) as z:",
      "  z.writestr('site/scene.gltf',json.dumps(scene))",
      "  z.writestr('site/terrain.bin',payload)",
      "sys.stdout.buffer.write(out.getvalue())"].join("\n")],{timeout:15000});
    await page.locator("#site-file").setInputFiles({
      name:"surveyed-site-gltf.zip",mimeType:"application/zip",buffer:gltfZip
    });
    await page.waitForFunction(()=>document.querySelector("#site-filename")?.textContent===
      "surveyed-site-gltf.zip",null,{timeout:20000});
    assert.match(await page.locator("#site-preflight-summary").textContent(),/삼각형 1개/);
    assert.match(await page.locator("#site-preflight-summary").textContent(),/원점에서 멀리 떨어져/);
    await page.locator("#site-center-origin").check();
    const reportDownload=page.waitForEvent("download",{timeout:20000});
    await page.locator("#site-preflight-export").click();
    const report=JSON.parse(fs.readFileSync(await (await reportDownload).path(),"utf8"));
    assert.equal(report.schema,"axoo-site-import-preflight-v1");
    assert.equal(report.source.triangles,1);
    assert.equal(report.viewerCentering,true);
    assert.ok(report.source.center[0]>14000,"source coordinates must be preserved");
    assert.ok(Math.abs(report.rendered.centerMeters[0])<.001,"recentered viewport origin must be near zero");
    assert.ok(report.warnings.some(w=>w.includes("원점에서 멀리")));

    // New site packages must persist their original external .bin/glTF ZIP
    // through a full project ZIP save, then restore source and origin toggle.
    const bundledProject=page.waitForEvent("download",{timeout:60000});
    await page.locator("#export-project").click();
    const bundledProjectBytes=fs.readFileSync(await (await bundledProject).path());
    await page.locator("#site-preset").selectOption("empty");
    assert.equal(await page.locator("#site-center-origin").isChecked(),false);
    await page.locator("#import-project").setInputFiles({
      name:"full-glTF-package.zip",mimeType:"application/zip",buffer:bundledProjectBytes
    });
    await page.waitForFunction(()=>document.querySelector("#site-filename")?.textContent===
      "surveyed-site-gltf.zip" && document.querySelector("#site-center-origin")?.checked,
      null,{timeout:40000});
    assert.match(await page.locator("#site-preflight-summary").textContent(),/삼각형 1개/);
    assert.ok(await page.locator("#site-preflight-export").isEnabled());

    // v1.2: context asset categories must be movable editor objects, not
    // replacements for the sculpture or original imported site geometry.
    await page.locator("#site-preset").selectOption("plaza");
    await page.locator('[data-view="aerial"]').click();
    const sceneCanvas=page.locator("#viewport canvas");
    const rect=await sceneCanvas.boundingBox();
    const baselineCount=await page.locator("#extra-list button").count();
    for(const [index,kind] of
      ["tree-autumn","person-standing","park-bench","round-planter"].entries()){
      await page.locator('[data-add-extra="'+kind+'"]').click();
      await page.mouse.click(rect.x+rect.width*.65,rect.y+rect.height*.82);
      await page.waitForFunction(n=>document.querySelectorAll("#extra-list button").length===n,
        baselineCount+index+1,{timeout:15000});
    }
    assert.match(await page.locator("#extra-count").textContent(),/추가된 오브제/);
    await page.locator("#extra-list button").last().click();
    assert.match(await page.locator("#object-name").textContent(),/화분/);
    await page.locator('[data-transform="scale"][data-axis="x"]').fill("1.5");
    await page.locator('[data-transform="scale"][data-axis="x"]').dispatchEvent("change");
    assert.equal(Number(await page.locator('[data-transform="scale"][data-axis="x"]').inputValue()),1.5);

    // Upload an *actual* GLB binary exported by this browser earlier.
    await page.locator("#library-asset-category").selectOption("furniture");
    await page.locator("#library-asset-file").setInputFiles({
      name:"licensed-urban-seat.glb",mimeType:"model/gltf-binary",buffer:bytes
    });
    await page.waitForFunction(()=>
      document.querySelector("#library-asset-select")?.options.length===1 &&
      document.querySelector("#library-asset-select")?.value==="lib1",
      null,{timeout:20000});
    assert.match(await page.locator("#library-status").textContent(),/등록 1 \/ 6/);
    await page.locator("#library-place").click();
    await page.mouse.click(rect.x+rect.width*.65,rect.y+rect.height*.82);
    await page.waitForFunction(n=>document.querySelectorAll("#extra-list button").length===n,
      baselineCount+5,{timeout:15000});
    await page.locator("#extra-list button").last().click();
    assert.match(await page.locator("#object-name").textContent(),/licensed-urban-seat/);

    // Editor undo/redo reconstructs imported assets from the untouched
    // in-memory source rather than replacing them with dummy geometry.
    await page.locator("#undo").click();
    assert.equal(await page.locator("#extra-list button").count(),baselineCount+4);
    await page.locator("#redo").click();
    assert.equal(await page.locator("#extra-list button").count(),baselineCount+5);

    const assetProjectEvent=page.waitForEvent("download",{timeout:60000});
    await page.locator("#export-project").click();
    const assetProjectPath=await (await assetProjectEvent).path();
    const assetAudit=JSON.parse(execFileSync("python3",["-c",[
      "import json,sys,zipfile,hashlib",
      "with zipfile.ZipFile(sys.argv[1]) as z:",
      "  project=json.loads(z.read('project.json'))",
      "  integrity=json.loads(z.read('integrity.json'))",
      "  source='assets/library/lib1.glb'",
      "  assert source in z.namelist()",
      "  assert hashlib.sha256(z.read(source)).hexdigest()==integrity['files'][source]['sha256']",
      "  assert len(project['library'])==1 and project['library'][0]['category']=='furniture'",
      "  assert sum(x['kind']=='custom-glb' and x.get('assetId')=='lib1' for x in project['extras'])==1",
      "  print(json.dumps({'bytes':len(z.read(source)),'pieces':len(project['extras'])}))"
    ].join("\n"),assetProjectPath],{encoding:"utf8",timeout:30000}).trim());
    assert.equal(assetAudit.pieces,baselineCount+5);
    await page.locator("#site-preset").selectOption("empty");
    await page.locator("#import-project").setInputFiles({
      name:"context-asset-source.zip",mimeType:"application/zip",
      buffer:fs.readFileSync(assetProjectPath)
    });
    await page.waitForFunction(n=>
      document.querySelectorAll("#extra-list button").length===n &&
      document.querySelector("#library-asset-select")?.value==="lib1" &&
      document.querySelector("#site-status")?.textContent==="예시 공간",
      baselineCount+5,{timeout:40000});
    assert.match(await page.locator("#library-status").textContent(),/등록 1 \/ 6/);
    await page.locator("#extra-list button").last().click();
    assert.match(await page.locator("#object-name").textContent(),/licensed-urban-seat/);

    // v1.3 repeat the true source artwork as a new editable installation.
    const beforeCopies=await page.locator("#extra-list button").count();
    await page.locator("#select-artwork").click();
    await page.locator("#precision-duplicate").click();
    await page.waitForFunction(n=>document.querySelectorAll("#extra-list button").length===n,
      beforeCopies+1,{timeout:15000});
    assert.match(await page.locator("#object-name").textContent(),/작품 복제/);
    assert.equal(await page.locator("#precision-ungroup").isDisabled(),true);

    const stateEvent=page.waitForEvent("download",{timeout:20000});
    await page.locator("#export-json").click();
    const beforeState=JSON.parse(fs.readFileSync(await (await stateEvent).path(),"utf8"));
    const originalCopy=beforeState.extras.at(-1);
    const preceding=beforeState.extras.at(-2);
    assert.equal(originalCopy.kind,"artwork-copy");
    assert.equal(originalCopy.assetId,undefined);
    assert.ok(originalCopy.transform.p[0]>=2,"copy offset +2m from source");

    // Group the freshly duplicated sculpture with another editable contextual
    // object. Only translation is grouped; original source site is untouched.
    await page.locator('[data-precision-group-id="'+originalCopy.id+'"]').check();
    await page.locator('[data-precision-group-id="'+preceding.id+'"]').check();
    await page.locator("#precision-group").click();
    const groupedEvent=page.waitForEvent("download",{timeout:20000});
    await page.locator("#export-json").click();
    const groupedJSON=JSON.parse(fs.readFileSync(await (await groupedEvent).path(),"utf8"));
    const a1=groupedJSON.extras.find(x=>x.id===originalCopy.id);
    const b1=groupedJSON.extras.find(x=>x.id===preceding.id);
    assert.ok(a1.groupId>0);
    assert.equal(a1.groupId,b1.groupId);
    await page.locator("#measure-first").selectOption(String(originalCopy.id));
    await page.locator("#measure-second").selectOption(String(preceding.id));
    await page.locator("#measure-objects").click();
    assert.match(await page.locator("#measure-objects-status").textContent(),/외접 박스 간격/);

    const originalX=Number(await page.locator('[data-transform="position"][data-axis="x"]').inputValue());
    await page.locator('[data-transform="position"][data-axis="x"]').fill(String(originalX+3));
    await page.locator('[data-transform="position"][data-axis="x"]').dispatchEvent("change");
    const movedEvent=page.waitForEvent("download",{timeout:20000});
    await page.locator("#export-json").click();
    const movedJSON=JSON.parse(fs.readFileSync(await (await movedEvent).path(),"utf8"));
    const a2=movedJSON.extras.find(x=>x.id===originalCopy.id);
    const b2=movedJSON.extras.find(x=>x.id===preceding.id);
    assert.ok(Math.abs(a2.transform.p[0]-a1.transform.p[0]-3)<.0001);
    assert.ok(Math.abs(b2.transform.p[0]-b1.transform.p[0]-3)<.0001,
      "logical group members translate by same displacement");
    await page.locator("#undo").click();
    const unmoveEvent=page.waitForEvent("download",{timeout:20000});
    await page.locator("#export-json").click();
    const unmoveJSON=JSON.parse(fs.readFileSync(await (await unmoveEvent).path(),"utf8"));
    assert.ok(Math.abs(unmoveJSON.extras.find(x=>x.id===preceding.id).transform.p[0]-b1.transform.p[0])<.0001,
      "Undo restores all grouped positions");

    // Read-only AABB audit and optional two site-surface point distances.
    await page.locator("#precision-collision").click();
    assert.match(await page.locator("#precision-collision-status").textContent(),/중첩|박스/);
    await page.locator('[data-view="aerial"]').click();
    const capture=await page.locator("#viewport canvas").boundingBox();
    await page.locator("#measure-site-start").click();
    await page.mouse.click(capture.x+capture.width*.45,capture.y+capture.height*.76);
    await page.mouse.click(capture.x+capture.width*.63,capture.y+capture.height*.78);
    assert.match(await page.locator("#measure-site-status").textContent(),/3D 거리/);
    const precisionDownload=page.waitForEvent("download",{timeout:20000});
    await page.locator("#precision-report").click();
    const precisionJSON=JSON.parse(fs.readFileSync(await (await precisionDownload).path(),"utf8"));
    assert.equal(precisionJSON.schema,"axoo-modeling-precision-v1");
    assert.equal(precisionJSON.measuredPoints.length,2);
    assert.ok(precisionJSON.interference.warning.includes("AABB"));
    assert.ok(precisionJSON.logicalGroups.length>=2);

    // Only movable/selected copies are in the artwork layer. MASTER locks
    // duplication and grouping; ZIP must restore the approved copy geometry.
    await page.locator("#master-lock").click();
    assert.equal(await page.locator("#precision-duplicate").isDisabled(),true);
    const multiZIPEvent=page.waitForEvent("download",{timeout:60000});
    await page.locator("#export-project").click();
    const multiZip=fs.readFileSync(await (await multiZIPEvent).path());
    page.once("dialog",dialog=>dialog.accept());
    await page.locator("#master-lock").click();
    await page.locator("#site-preset").selectOption("empty");
    await page.locator("#import-project").setInputFiles({
      name:"precision-v13.zip",mimeType:"application/zip",buffer:multiZip
    });
    await page.waitForFunction(n=>
      document.querySelectorAll("#extra-list button").length===n &&
      document.querySelector("#object-state")?.textContent==="MASTER LOCK",
      beforeCopies+1,{timeout:45000});
    const restoredEvent=page.waitForEvent("download",{timeout:20000});
    await page.locator("#export-json").click();
    const restoredJSON=JSON.parse(fs.readFileSync(await (await restoredEvent).path(),"utf8"));
    assert.equal(restoredJSON.extras.find(x=>x.id===originalCopy.id).kind,"artwork-copy");
    assert.equal(restoredJSON.extras.find(x=>x.id===preceding.id).groupId,a1.groupId);

    // Import a *different* sculpture source through the same GLB registry.
    // It stays on artwork-layer locks, independent from base sculptural source.
    page.once("dialog",dialog=>dialog.accept());
    await page.locator("#master-lock").click();
    await page.locator("#library-asset-category").selectOption("artwork");
    await page.locator("#library-asset-file").setInputFiles({
      name:"second-sculpture.glb",mimeType:"model/gltf-binary",buffer:bytes
    });
    await page.waitForFunction(()=>
      document.querySelector("#library-asset-select")?.options.length===2 &&
      document.querySelector("#library-asset-select")?.value==="lib2",
      null,{timeout:20000});
    await page.locator('[data-view="aerial"]').click();
    const canvasRect=await page.locator("#viewport canvas").boundingBox();
    await page.locator("#library-place").click();
    await page.mouse.click(canvasRect.x+canvasRect.width*.65,canvasRect.y+canvasRect.height*.82);
    await page.waitForFunction(n=>document.querySelectorAll("#extra-list button").length===n,
      beforeCopies+2,{timeout:15000});
    await page.locator('[data-layer-lock="artwork"]').check();
    assert.equal(await page.locator('[data-transform="position"][data-axis="x"]').isDisabled(),true,
      "independently sourced sculptures must respect artwork layer lock");
    await page.locator('[data-layer-lock="artwork"]').uncheck();
    assert.equal(await page.locator('[data-transform="position"][data-axis="x"]').isDisabled(),false);
    const secondZipEvent=page.waitForEvent("download",{timeout:60000});
    await page.locator("#export-project").click();
    const secondPath=await (await secondZipEvent).path();
    const secondAudit=JSON.parse(execFileSync("python3",["-c",[
      "import json,zipfile,sys,hashlib",
      "with zipfile.ZipFile(sys.argv[1]) as z:",
      "  p=json.loads(z.read('project.json'))",
      "  m=json.loads(z.read('integrity.json'))",
      "  path='assets/library/lib2.glb'",
      "  assert path in z.namelist()",
      "  assert hashlib.sha256(z.read(path)).hexdigest()==m['files'][path]['sha256']",
      "  assert any(v['category']=='artwork' for v in p['library'])",
      "  assert any(v['kind']=='custom-glb' and v.get('assetId')=='lib2' for v in p['extras'])",
      "  print(json.dumps({'sources':len(p['library'])}))"
    ].join("\n"),secondPath],{encoding:"utf8",timeout:25000}).trim());
    assert.equal(secondAudit.sources,2);

    // v1.4 requires a currently approved MASTER; unsigned project state
    // cannot be packaged as a valid proposal image set.
    assert.equal(await page.locator("#proposal-export").isDisabled(),true);
    await page.locator("#master-lock").click();
    assert.equal(await page.locator("#export-master-pack").isEnabled(),true);
    await page.locator("#batch-quality").selectOption("1");
    const pRenderEvent=page.waitForEvent("download",{timeout:90000});
    await page.locator("#export-master-pack").click();
    const pRender=fs.readFileSync(await (await pRenderEvent).path());
    await page.locator("#proposal-render-file").setInputFiles({
      name:"approved-8views-v14.zip",mimeType:"application/zip",buffer:pRender
    });
    await page.waitForFunction(()=>document.querySelector("#proposal-status")?.textContent.includes("원본 8컷 확인 완료"),
      null,{timeout:45000});
    assert.equal(await page.locator("#proposal-export").isEnabled(),true);
    await page.locator("#proposal-artwork-title").fill('Urban Waves <img src="https://bad.invalid/x.png">');
    await page.locator("#proposal-artist").fill("AXOO TEST ARTIST");
    await page.locator("#proposal-site-label").fill("Goyang / Test installation site");
    await page.locator("#proposal-note").fill("Model geometry checked in scene preview; physical measurements remain unverified.");
    const pBeforeDownload=page.waitForEvent("download",{timeout:20000});
    await page.locator("#export-json").click();
    const pBefore=JSON.parse(fs.readFileSync(await (await pBeforeDownload).path(),"utf8"));

    const proposalDownload=page.waitForEvent("download",{timeout:90000});
    await page.locator("#proposal-export").click();
    const proposalArchive=await proposalDownload;
    assert.match(proposalArchive.suggestedFilename(),/proposal-DRAFT-REV\d+\.zip$/);
    const proposalFile=await proposalArchive.path();
    const proposalAudit=JSON.parse(execFileSync("python3",["-c",[
      "import json,sys,zipfile,struct",
      "with zipfile.ZipFile(sys.argv[1]) as z:",
      "  entries=z.namelist()",
      "  assert 'proposal-sheets.html' in entries",
      "  assert 'proposal-data.json' in entries",
      "  assert 'README.txt' in entries",
      "  assert 'precision-audit.json' in entries",
      "  assert 'readiness.json' in entries",
      "  data=json.loads(z.read('proposal-data.json'))",
      "  assert data['schema']=='axoo-proposal-export-v1'",
      "  assert data['status']=='DRAFT'",
      "  assert data['artwork']['viewerBoundsWHDMeters'][0] is not None",
      "  assert data['audit']['schema']=='axoo-modeling-precision-v1'",
      "  assert len(data['render']['views'])==8",
      "  html=z.read('proposal-sheets.html').decode('utf8')",
      "  assert '<script' not in html.lower()",
      "  assert '<img src=\"https://bad.invalid/x.png\">' not in html",
      "  assert '&lt;img src=&quot;https://bad.invalid/x.png&quot;&gt;' in html",
      "  assert 'Content-Security-Policy' in html",
      "  assert 'page-break-after:always' in html",
      "  assert '16in 9in' in html",
      "  for v in data['render']['views']:",
      "    path=v['filename']",
      "    assert path in entries",
      "    png=z.read(path)",
      "    assert png[:8]==b'\\x89PNG\\r\\n\\x1a\\n'",
      "    w,h=struct.unpack('>II',png[16:24])",
      "    assert w==v['width'] and h==v['height']",
      "  print(json.dumps({'images':len(data['render']['views']),'slides':html.count('class=\"slide'), 'status':data['status']}))"
    ].join("\n"),proposalFile],{encoding:"utf8",timeout:45000}).trim());
    assert.equal(proposalAudit.images,8);
    assert.equal(proposalAudit.slides,11); // cover + source summary + eight views + audit

    const pAfterDownload=page.waitForEvent("download",{timeout:20000});
    await page.locator("#export-json").click();
    const pAfter=JSON.parse(fs.readFileSync(await (await pAfterDownload).path(),"utf8"));
    delete pBefore.createdAt;delete pAfter.createdAt;
    assert.deepEqual(pBefore,pAfter,
      "compiling a proposal must leave artwork/site/extras/camera/MASTER unchanged");

    // Approval revision must match the imported render pack exactly:
    // stale frames must be blocked even after a fresh master approval.
    page.once("dialog",dialog=>dialog.accept());
    await page.locator("#master-lock").click();
    assert.equal(await page.locator("#proposal-export").isDisabled(),true);
    await page.locator("#master-lock").click();
    assert.equal(await page.locator("#proposal-export").isDisabled(),true);

    // v1.5: an approved, matching MASTER owns every offline review decision.
    assert.equal(await page.locator("#collab-request").isEnabled(),true);
    await page.locator("#collab-author").fill("AXOO Project Manager");
    await page.locator("#collab-note").fill("Please review the locked geometry, setting and material.");
    await page.locator("#collab-request").click();
    await page.waitForFunction(()=>document.querySelector("#collab-active")?.textContent.includes("검토 대기"));
    assert.equal(await page.locator("#collab-approve").isEnabled(),true);
    const requestDl=page.waitForEvent("download",{timeout:20000});
    await page.locator("#collab-export").click();
    const requestData=JSON.parse(fs.readFileSync(await (await requestDl).path(),"utf8"));
    assert.equal(requestData.schema,"axoo-team-review-v1");
    assert.equal(requestData.record.status,"pending");
    assert.match(requestData.record.requestNote,/Please review/);
    assert.match(requestData.record.masterDigest,/^[a-f0-9]{64}$/);
    await page.locator("#collab-reviewer").fill("AXOO Director");
    await page.locator("#collab-note").fill("Raise the label position and review from eye level.");
    await page.locator("#collab-changes").click();
    await page.waitForFunction(()=>document.querySelector("#collab-active")?.textContent.includes("수정 요청"));
    const rev1Dl=page.waitForEvent("download",{timeout:20000});
    await page.locator("#export-json").click();
    const rev1=JSON.parse(fs.readFileSync(await (await rev1Dl).path(),"utf8"));
    assert.equal(rev1.collaboration.records.at(-1).status,"changes-requested",
      "full project metadata must preserve review verdicts");
    // A change request never edits the original MASTER.
    assert.equal(await page.locator("#master-lock").textContent(),"🔒 MASTER LOCK 승인됨 · 수정하려면 잠금 해제");
    page.once("dialog",dialog=>dialog.accept());
    await page.locator("#master-lock").click();
    assert.equal(await page.locator("#collab-request").isDisabled(),true);
    await page.locator("#master-lock").click();
    assert.equal(await page.locator("#collab-request").isEnabled(),true,
      "next MASTER revision may be submitted independently");
    await page.locator("#collab-note").fill("Follow-up MASTER revision for approval.");
    await page.locator("#collab-request").click();
    await page.waitForFunction(()=>document.querySelector("#collab-active")?.textContent.includes("검토 대기"));
    // Older review file cannot be applied to a newly approved snapshot.
    await page.locator("#collab-import").setInputFiles({
      name:"old-review.json",mimeType:"application/json",
      buffer:Buffer.from(JSON.stringify(requestData))
    });
    await page.waitForFunction(()=>document.querySelector("#collab-status")?.textContent.includes("가져오기 실패"));
    assert.equal(await page.locator("#collab-approve").isEnabled(),true,
      "rejected stale review cannot replace the pending active record");
    await page.locator("#collab-note").fill("Confirmed architecture, artwork and installation against supplied data.");
    await page.locator("#collab-attest").check();
    await page.locator("#collab-approve").click();
    await page.waitForFunction(()=>document.querySelector("#collab-active")?.textContent.includes("수동 승인"));
    assert.equal(await page.locator("#collab-changes").isDisabled(),true);
    const approvedDl=page.waitForEvent("download",{timeout:20000});
    await page.locator("#export-json").click();
    const approvedData=JSON.parse(fs.readFileSync(await (await approvedDl).path(),"utf8"));
    assert.equal(approvedData.collaboration.records.length,2,"two distinct MASTER revisions must be preserved");
    assert.equal(approvedData.collaboration.records.at(-1).status,"director-approved");
    assert.equal(approvedData.artwork.locked,true,"review never unlocks MASTER");
    assert.match(await page.locator("#collab-history").textContent(),/디렉터 승인/);
        // v1.6: compare two persisted approved snapshots without changing live scene.
    const existingMasters=approvedData.masterSnapshots;
    const initialBaseIndex=existingMasters.length-2;
    const initialTargetIndex=existingMasters.length-1;
    await page.locator("#revision-base").selectOption(String(initialBaseIndex));
    await page.locator("#revision-target").selectOption(String(initialTargetIndex));
    assert.equal(await page.locator("#revision-export").isEnabled(),true);
    const revisionDl=page.waitForEvent("download",{timeout:20000});
    await page.locator("#revision-export").click();
    const revisionReport=JSON.parse(fs.readFileSync(await (await revisionDl).path(),"utf8"));
    assert.equal(revisionReport.schema,"axoo-master-revision-diff-v1");
    assert.equal(revisionReport.base.revision,existingMasters[initialBaseIndex].revision);
    assert.equal(revisionReport.target.revision,existingMasters[initialTargetIndex].revision);
    assert.match(revisionReport.fingerprint.targetSHA256,/^[a-f0-9]{64}$/);
    assert.ok(revisionReport.limitations.some(x=>x.includes("vertices")),
      "no false guarantee about mesh geometry equality");

    // A real transform edit appears in a subsequent MASTER Revision diff.
    page.once("dialog",dialog=>dialog.accept());
    await page.locator("#master-lock").click();
    await page.locator("#select-artwork").click();
    const priorArtX=Number(await x.inputValue());
    await x.fill(String(priorArtX+1.25));
    await x.dispatchEvent("change");
    await page.locator("#master-lock").click();
    await page.locator("#revision-base").selectOption(String(initialTargetIndex));
    await page.locator("#revision-target").selectOption(String(existingMasters.length));
    const previousRevision=existingMasters.at(-1).revision;
    await page.waitForFunction(n=>
      document.querySelector("#revision-summary")?.textContent.includes("REV "+n+" → REV "+(n+1)),
      previousRevision);
    assert.match(await page.locator("#revision-changes").textContent(),/작품 설치 좌표 · X/);
    assert.match(await page.locator("#revision-changes").textContent(),/작품 좌표 이동 거리/);
    const beforeDiffSave=page.waitForEvent("download",{timeout:20000});
    await page.locator("#export-json").click();
    const beforeDiffData=JSON.parse(fs.readFileSync(await (await beforeDiffSave).path(),"utf8"));
    const revisedReportDownload=page.waitForEvent("download",{timeout:20000});
    await page.locator("#revision-export").click();
    const revisedReport=JSON.parse(fs.readFileSync(await (await revisedReportDownload).path(),"utf8"));
    assert.ok(revisedReport.counts.critical>=2,"the new artwork position must be flagged as critical");
    assert.equal(revisedReport.target.revision,previousRevision+1);
    const afterDiffSave=page.waitForEvent("download",{timeout:20000});
    await page.locator("#export-json").click();
    const afterDiffData=JSON.parse(fs.readFileSync(await (await afterDiffSave).path(),"utf8"));
    delete beforeDiffData.createdAt;delete afterDiffData.createdAt;
    assert.deepEqual(beforeDiffData,afterDiffData,
      "comparison and JSON export cannot modify geometry, lighting, camera or approvals");
    // v1.7: reviewed 3D surface points are HTML pins, NOT geometry changes.
    assert.equal(await page.locator("#spatial-place").isEnabled(),true,
      "only a currently approved MASTER enables spatial annotation");
    await page.locator("#spatial-author").fill("AXOO Curator");
    await page.locator("#spatial-comment").fill("Confirm plinth clearance against visitor circulation.");
    await page.locator("#select-artwork").click();
    await page.locator("#focus").click();
    const pinBeforeEvent=page.waitForEvent("download",{timeout:20000});
    await page.locator("#export-json").click();
    const pinBefore=JSON.parse(fs.readFileSync(await (await pinBeforeEvent).path(),"utf8"));
    await page.locator("#spatial-place").click();
    assert.match(await page.locator("#spatial-status").textContent(),/한 번 클릭/);
    const pointRect=await page.locator("#viewport canvas").boundingBox();
    await page.mouse.click(pointRect.x+pointRect.width*.5,pointRect.y+pointRect.height*.5);
    await page.waitForFunction(()=>document.querySelector("#spatial-status")?.textContent.includes("기록 완료"),
      null,{timeout:15000});
    assert.equal(await page.locator(".spatial-list-row").count(),1);
    assert.equal(await page.locator(".spatial-screen-pin").count(),1);
    await page.locator("#spatial-resolve").click();
    assert.match(await page.locator("#spatial-summary").textContent(),/미처리 0개/);
    await page.locator("#spatial-reopen").click();
    assert.match(await page.locator("#spatial-summary").textContent(),/미처리 1개/);
    const pinSaveEvent=page.waitForEvent("download",{timeout:20000});
    await page.locator("#export-json").click();
    const pinAfter=JSON.parse(fs.readFileSync(await (await pinSaveEvent).path(),"utf8"));
    assert.equal(pinAfter.spatialReview.schema,"axoo-spatial-review-v1");
    assert.equal(pinAfter.spatialReview.pins.length,1);
    assert.equal(pinAfter.spatialReview.pins[0].status,"open");
    assert.match(pinAfter.spatialReview.pins[0].masterSHA256,/^[a-f0-9]{64}$/);
    assert.equal(pinAfter.spatialReview.pins[0].revision,pinAfter.masterSnapshots.at(-1).revision);
    delete pinBefore.createdAt;delete pinAfter.createdAt;delete pinAfter.spatialReview;
    delete pinBefore.spatialReview;
    assert.deepEqual(pinAfter,pinBefore,"pin notes must not mutate scene, MASTER, or camera");
    const reviewArchiveEvent=page.waitForEvent("download",{timeout:90000});
    await page.locator("#export-project").click();
    const reviewArchivePath=await (await reviewArchiveEvent).path();
    const savedReview=JSON.parse(execFileSync("python3",["-c",[
      "import json,sys,zipfile",
      "with zipfile.ZipFile(sys.argv[1]) as archive:",
      "  config=json.loads(archive.read('project.json'))",
      "  assert config['spatialReview']['schema']=='axoo-spatial-review-v1'",
      "  print(json.dumps(config['spatialReview']))"
    ].join("\n"),reviewArchivePath],{encoding:"utf8",timeout:25000}).trim());
    assert.equal(savedReview.pins.length,1,"whole-project ZIP must retain spatial notes");
    page.once("dialog",dialog=>dialog.accept());
    await page.locator("#master-lock").click();
    assert.equal(await page.locator("#spatial-place").isDisabled(),true,
      "edit mode must not accept review points for an unapproved revision");
    assert.equal(await page.locator(".spatial-screen-pin").count(),0,
      "a previous revision pin must not overlay a live editable model");
    await page.locator("#master-lock").click();
    await page.waitForFunction(()=>document.querySelector("#spatial-summary")?.textContent.includes("검토 핀 0개"));
    assert.equal(await page.locator(".spatial-screen-pin").count(),0,
      "newly approved revision must not inherit world-coordinate pins from old MASTER");
    const historicalReviewEvent=page.waitForEvent("download",{timeout:20000});
    await page.locator("#export-json").click();
    const historic=JSON.parse(fs.readFileSync(await (await historicalReviewEvent).path(),"utf8"));
    assert.equal(historic.spatialReview.pins.length,1,"earlier revision notes remain archived");
    // v2.0: camera styling and visual scene framing do not modify imported geometry.
    await page.locator("#visual-guide").selectOption("thirds");
    assert.equal(await page.locator("#visual-composition-overlay").isVisible(),true);
    assert.match(await page.locator("#visual-composition-overlay").getAttribute("class"),/visual-guide-thirds/);
    await page.locator("#visual-tone").selectOption("neutral");
    await page.locator("#visual-sky").selectOption("warm");
    await page.locator("#visual-shadows").selectOption("high");
    await page.locator("[data-visual-lens='50']").click();
    assert.match(await page.locator("#camera-focal-value").textContent(),/50 mm/);
    await page.locator("#render-aspect").selectOption("landscape16x9");
    await page.locator("#render-resolution").selectOption("2");
    await page.locator("#visual-quality-check").click();
    assert.match(await page.locator("#visual-quality-status").textContent(),/GPU/);
    assert.match(await page.locator("#visual-quality-status").textContent(),/16:9/);
    await page.locator("[data-frame='sculpture']").click();
    const shotA=page.waitForEvent("download",{timeout:20000});
    await page.locator("#export-json").click();
    const beforeFrame=JSON.parse(fs.readFileSync(await (await shotA).path(),"utf8"));
    const from=beforeFrame.camera.position,to=beforeFrame.camera.target;
    const distanceA=Math.hypot(...from.map((v,i)=>v-to[i]));
    await page.locator("[data-frame='nearby']").click();
    const shotB=page.waitForEvent("download",{timeout:20000});
    await page.locator("#export-json").click();
    const afterFrame=JSON.parse(fs.readFileSync(await (await shotB).path(),"utf8"));
    const distanceB=Math.hypot(...afterFrame.camera.position.map((v,i)=>v-afterFrame.camera.target[i]));
    assert.ok(distanceB>distanceA,"nearby scene framing includes more context");
    assert.deepEqual(afterFrame.artwork.transform,beforeFrame.artwork.transform,
      "framing must leave approved artwork XYZ and scale unchanged");
    assert.deepEqual(afterFrame.masterSnapshots,beforeFrame.masterSnapshots,
      "view helpers cannot modify previously approved MASTER metadata");
    assert.deepEqual(afterFrame.render.visual,
      {toneCurve:"neutral",sky:"warm",shadowProfile:"high",guide:"thirds"});
    // Verify the 16:9 PNG output excludes DOM-only composition lines.
    const visualPngEvent=page.waitForEvent("download",{timeout:60000});
    await page.locator("#shot-export").click();
    const pngBuffer=fs.readFileSync(await (await visualPngEvent).path());
    assert.equal(pngBuffer.subarray(1,4).toString("ascii"),"PNG");
    const pngWidth=pngBuffer.readUInt32BE(16),pngHeight=pngBuffer.readUInt32BE(20);
    assert.ok(Math.abs(pngWidth/pngHeight-16/9)<.005,
      "actual exported PNG pixel dimensions must conform to 16:9");
    assert.equal(await page.locator("#visual-composition-overlay").isVisible(),true,
      "composition guide must remain available in viewport after PNG export");
    await page.locator("#visual-guide").selectOption("none");
    assert.equal(await page.locator("#visual-composition-overlay").isVisible(),false);
    // v2.1: use an independent fresh scene so prior MASTER/asset regression tests stay intact.
    const precisionPage=await browser.newPage({viewport:{width:1440,height:900},acceptDownloads:true});
    precisionPage.on("pageerror",err=>errors.push(err.stack||err.message));
    await precisionPage.goto("http://127.0.0.1:8787/studio/",{waitUntil:"domcontentloaded",timeout:60000});
    await precisionPage.locator("#art-current-wdh").waitFor({timeout:30000});
    await precisionPage.waitForFunction(()=>document.querySelector("#art-current-wdh")?.textContent.includes("현재 W"));
    await precisionPage.locator("#dimension-mode").selectOption("uniform-height");
    await precisionPage.locator("#dimension-height").fill("4");
    await precisionPage.locator("#dimension-apply").click();
    assert.match(await precisionPage.locator("#dimension-status").textContent(),/비율 유지/);
    assert.match(await precisionPage.locator("#art-current-wdh").textContent(),/H 4\.000/);
    await precisionPage.locator("#plinth-width").fill("2");
    await precisionPage.locator("#plinth-depth").fill("2.5");
    await precisionPage.locator("#plinth-height").fill("0.5");
    await precisionPage.locator("#plinth-finish").selectOption("stone");
    await precisionPage.locator("#plinth-create").click();
    assert.match(await precisionPage.locator("#plinth-status").textContent(),/기단 #1/);
    const plinthFirstDL=precisionPage.waitForEvent("download",{timeout:20000});
    await precisionPage.locator("#export-json").click();
    const plinthFirst=JSON.parse(fs.readFileSync(await (await plinthFirstDL).path(),"utf8"));
    assert.equal(plinthFirst.extras.length,1);
    assert.equal(plinthFirst.extras[0].kind,"plinth");
    assert.equal(plinthFirst.extras[0].finish,"stone");
    assert.deepEqual(plinthFirst.extras[0].transform.s,[2,.5,2.5]);
    assert.ok(plinthFirst.artwork.transform.p[1]>=.49,
      "plinth creation must lift artwork up, not subtract a slab into existing floor");
    await precisionPage.locator("#plinth-width").fill("3.0");
    await precisionPage.locator("#plinth-finish").selectOption("metal");
    await precisionPage.locator("#plinth-update").click();
    await precisionPage.locator("#plinth-align").click();
    assert.match(await precisionPage.locator("#plinth-status").textContent(),/기단 상단 중심/);
    await precisionPage.locator("#anchor-mode").selectOption("front-left");
    await precisionPage.locator("#anchor-x").fill("10");
    await precisionPage.locator("#anchor-y").fill("0.5");
    await precisionPage.locator("#anchor-z").fill("20");
    await precisionPage.locator("#anchor-apply").click();
    assert.match(await precisionPage.locator("#anchor-status").textContent(),/기준점 이동/);
    const plinthDL=precisionPage.waitForEvent("download",{timeout:20000});
    await precisionPage.locator("#export-json").click();
    const precisionData=JSON.parse(fs.readFileSync(await (await plinthDL).path(),"utf8"));
    assert.deepEqual(precisionData.placementReference,{mode:"front-left",position:[10,.5,20]});
    assert.equal(precisionData.extras[0].finish,"metal");
    assert.equal(precisionData.extras[0].transform.s[0],3);
    assert.notEqual(precisionData.extras[0].transform.p[0],plinthFirst.extras[0].transform.p[0],
      "paired plinth must follow sculpture anchor relocation");
    assert.equal(precisionData.extras[0].followArtwork,true);
    await precisionPage.locator("#select-artwork").click();
    await precisionPage.locator("#dimension-mode").selectOption("independent");
    await precisionPage.locator("#dimension-distortion").uncheck();
    await precisionPage.locator("#dimension-apply").click();
    assert.match(await precisionPage.locator("#dimension-status").textContent(),/별도 확인/);
    const approvedPrecision=precisionPage.locator("#master-lock");
    await approvedPrecision.click();
    assert.equal(await precisionPage.locator("#plinth-create").isDisabled(),true);
    assert.equal(await precisionPage.locator("#dimension-apply").isDisabled(),true);
    const approvedDL=precisionPage.waitForEvent("download",{timeout:20000});
    await precisionPage.locator("#export-json").click();
    const approvedConfig=JSON.parse(fs.readFileSync(await (await approvedDL).path(),"utf8"));
    assert.equal(approvedConfig.masterSnapshots.length,1);
    assert.equal(approvedConfig.masterSnapshots[0].extras[0].kind,"plinth");
    assert.equal(approvedConfig.masterSnapshots[0].extras[0].finish,"metal");
    assert.deepEqual(approvedConfig.masterSnapshots[0].placementReference,approvedConfig.placementReference);
    const zipDL=precisionPage.waitForEvent("download",{timeout:90000});
    await precisionPage.locator("#export-project").click();
    const zipFile=await (await zipDL).path();
    const restorePage=await browser.newPage({viewport:{width:1440,height:900},acceptDownloads:true});
    restorePage.on("pageerror",err=>errors.push(err.stack||err.message));
    await restorePage.goto("http://127.0.0.1:8787/studio/",{waitUntil:"domcontentloaded",timeout:60000});
    await restorePage.locator("#viewport canvas").waitFor({timeout:20000});
    await restorePage.locator("#import-project").setInputFiles(zipFile);
    await restorePage.waitForFunction(()=>document.querySelector("#master-lock")?.textContent.includes("MASTER LOCK 승인됨"),null,{timeout:45000});
    const restoreDL=restorePage.waitForEvent("download",{timeout:20000});
    await restorePage.locator("#export-json").click();
    const restored=JSON.parse(fs.readFileSync(await (await restoreDL).path(),"utf8"));
    assert.equal(restored.extras[0].kind,"plinth","ZIP roundtrip must restore an actual pedestal mesh");
    assert.equal(restored.extras[0].finish,"metal","ZIP roundtrip must preserve physical finish");
    assert.deepEqual(restored.extras[0].transform.s,[3,.5,2.5]);
    assert.deepEqual(restored.placementReference,{mode:"front-left",position:[10,.5,20]});
    assert.equal(restored.artwork.locked,true,"MASTER approval survives complete portable ZIP restore");
    await restorePage.close();
    await precisionPage.close();
    // v2.2: ensure view-only construction never leaks into official PNGs or project model.
    const sitePage=await browser.newPage({viewport:{width:1440,height:900},acceptDownloads:true});
    sitePage.on("pageerror",e=>errors.push(e.stack||e.message));
    await sitePage.goto("http://127.0.0.1:8787/studio/",{waitUntil:"domcontentloaded",timeout:60000});
    await sitePage.locator("#viewport canvas").waitFor({timeout:30000});
    await sitePage.waitForFunction(()=>document.querySelector("#site-mesh-count")?.textContent!=="0개");
    const siteInitial=await sitePage.locator("#site-mesh-count").textContent();
    const officialBefore=sitePage.waitForEvent("download",{timeout:30000});
    await sitePage.locator("#shot-export").click();
    const originalPNG=fs.readFileSync(await (await officialBefore).path());
    await sitePage.locator("#site-view-mode").selectOption("ghost");
    await sitePage.locator("#site-focus-radius").selectOption("15");
    await sitePage.locator("#site-view-apply").click();
    assert.match(await sitePage.locator("#site-view-stat").textContent(),/임시 재질 [1-9]/);
    const configBefore=sitePage.waitForEvent("download",{timeout:20000});
    await sitePage.locator("#export-json").click();
    const ghostConfig=JSON.parse(fs.readFileSync(await (await configBefore).path(),"utf8"));
    assert.equal(Object.hasOwn(ghostConfig,"siteViewport"),false,
      "display-only clipping is not part of project source data");
    const ghostExport=sitePage.waitForEvent("download",{timeout:30000});
    await sitePage.locator("#shot-export").click();
    const ghostPNG=fs.readFileSync(await (await ghostExport).path());
    assert.equal(Buffer.compare(originalPNG,ghostPNG),0,
      "official PNG must ignore site ghost/focus preview and retain full source site");
    await sitePage.locator("#site-view-mode").selectOption("section");
    await sitePage.locator("#site-focus-radius").selectOption("0");
    await sitePage.locator("#site-section-side").selectOption("z-rear");
    await sitePage.locator("#site-section-offset").fill("5");
    await sitePage.locator("#site-view-apply").click();
    assert.match(await sitePage.locator("#site-view-stat").textContent(),/임시 재질 [1-9]/);
    const sectionExport=sitePage.waitForEvent("download",{timeout:30000});
    await sitePage.locator("#shot-export").click();
    const sectionPNG=fs.readFileSync(await (await sectionExport).path());
    assert.equal(Buffer.compare(originalPNG,sectionPNG),0,
      "site clipping preview must not appear in official PNG export");
    await sitePage.locator("#site-navigation-performance").selectOption("adaptive");
    await sitePage.locator("#site-view-reset").click();
    assert.match(await sitePage.locator("#site-view-stat").textContent(),/원본 복원/);
    assert.equal(await sitePage.locator("#site-mesh-count").textContent(),siteInitial);
    // Cached mesh index must invalidate after swapping the sample site.
    await sitePage.locator("#site-preset").selectOption("courtyard");
    const changed=await sitePage.locator("#site-mesh-count").textContent();
    assert.notEqual(changed,siteInitial,"site cache must rebuild with new imported/preset geometry");
    await sitePage.locator("#site-view-mode").selectOption("ghost");
    await sitePage.locator("#site-view-apply").click();
    assert.match(await sitePage.locator("#site-view-stat").textContent(),/현장 메시 [1-9]/);
    const restoredInfo=sitePage.waitForEvent("download",{timeout:20000});
    await sitePage.locator("#export-json").click();
    const restoredConfig=JSON.parse(fs.readFileSync(await (await restoredInfo).path(),"utf8"));
    assert.equal(restoredConfig.site.preset,"courtyard");
    assert.equal(restoredConfig.render.visual?.guide||"none","none");
    await sitePage.close();
    // v2.2.1: the creative workbench saves original sources, not only JSON.
    const creatorCtx=await browser.newContext({viewport:{width:1440,height:900},acceptDownloads:true});
    const creator=await creatorCtx.newPage();
    creator.on("pageerror",err=>errors.push(err.stack||err.message));
    await creator.goto("http://127.0.0.1:8787/studio/",{waitUntil:"domcontentloaded",timeout:60000});
    await creator.locator("#viewport canvas").waitFor({timeout:20000});
    assert.equal(await creator.locator("#site-inspector-fold").evaluate(el=>el.open),false);
    assert.equal(await creator.locator("#site-plan-fold").evaluate(el=>el.open),false);
    assert.equal(await creator.locator("#asset-library-fold").evaluate(el=>el.open),false);
    await creator.locator("#collapse-panels").click();
    assert.equal(await creator.locator(".right .inspector-fold[open]").count(),0);
    await creator.locator("#expand-panels").click();
    assert.ok(await creator.locator(".right .inspector-fold[open]").count()>10);
    await creator.locator("#plinth-shape").selectOption("round");
    await creator.locator("#plinth-finish").selectOption("black");
    await creator.locator("#plinth-create").click();
    assert.match(await creator.locator("#plinth-status").textContent(),/기단 #1/);
    const creatorModelFiles=["artwork-A.glb","artwork-B.glb","artwork-C.glb","artwork-D.glb"]
      .map(name=>({name,mimeType:"model/gltf-binary",buffer:bytes}));
    await creator.locator("#multi-art-files").setInputFiles(creatorModelFiles);
    await creator.waitForFunction(()=>document.querySelector("#multi-art-status")?.textContent.includes("추가 작품 4 / 4"),
      null,{timeout:60000});
    assert.equal(await creator.locator(".multi-art-row").count(),4);
    assert.equal(await creator.locator("#multi-art-files").isDisabled(),true);
    await creator.locator(".multi-art-row button").nth(1).click();
    assert.equal(await creator.locator(".multi-art-row").count(),3,"deleting artwork frees one of the four supplemental slots");
    await creator.locator("#multi-art-files").setInputFiles({name:"artwork-E.glb",mimeType:"model/gltf-binary",buffer:bytes});
    await creator.waitForFunction(()=>document.querySelector(".multi-art-row")!==null &&
      document.querySelectorAll(".multi-art-row").length===4,{timeout:30000});
    const detailsEvent=creator.waitForEvent("download",{timeout:25000});
    await creator.locator("#export-json").click();
    const creatorConfig=JSON.parse(fs.readFileSync(await (await detailsEvent).path(),"utf8"));
    assert.equal(creatorConfig.extras.filter(x=>x.kind==="custom-glb").length,4);
    assert.equal(creatorConfig.extras.find(x=>x.kind==="plinth").shape,"round");
    assert.equal(creatorConfig.extras.find(x=>x.kind==="plinth").finish,"black");
    await creator.locator("#project-name").fill("AXOO five-model test");
    await creator.locator("#quick-save").click();
    await creator.waitForFunction(()=>document.querySelector("#quick-project-select")?.value==="AXOO five-model test",
      null,{timeout:45000});
    await creator.reload({waitUntil:"domcontentloaded"});
    await creator.locator("#viewport canvas").waitFor({timeout:20000});
    await creator.waitForFunction(()=>document.querySelector("#quick-project-select")?.options.length>=2,{timeout:15000});
    await creator.locator("#quick-project-select").selectOption("AXOO five-model test");
    creator.once("dialog",dialog=>dialog.accept());
    await creator.locator("#quick-load").click();
    await creator.waitForFunction(()=>document.querySelector("#project-name")?.value==="AXOO five-model test" &&
      document.querySelectorAll(".multi-art-row").length===4,null,{timeout:60000});
    assert.equal(await creator.locator(".multi-art-row").count(),4);
    assert.equal(await creator.locator("#plinth-create").isDisabled(),true,
      "linked sculpture still has its one plinth after reload");
    await creator.locator("#measure-site-start").click();
    const creatorCanvas=await creator.locator("#viewport canvas").boundingBox();
    await creator.mouse.click(creatorCanvas.x+creatorCanvas.width*.37,creatorCanvas.y+creatorCanvas.height*.74);
    await creator.mouse.click(creatorCanvas.x+creatorCanvas.width*.61,creatorCanvas.y+creatorCanvas.height*.74);
    await creator.waitForFunction(()=>document.querySelector("#measure-mid-label")?.textContent.includes("m"),
      null,{timeout:10000});
    assert.equal(await creator.locator("#measure-mid-label").isVisible(),true);
    assert.equal(await creator.locator("#measure-visible-line").getAttribute("x2")!==null,true);
    await creator.locator("#measure-site-clear").click();
    assert.equal(await creator.locator("#measure-mid-label").isVisible(),false);
    await creator.locator("#quick-project-select").selectOption("AXOO five-model test");
    creator.once("dialog",dialog=>dialog.accept());
    await creator.locator("#quick-delete").click();
    await creator.waitForFunction(()=>document.querySelector("#quick-project-select")?.options.length===1,{timeout:10000});
    await creatorCtx.close();
    assert.deepEqual(errors, [], "no uncaught runtime errors");
    console.log("PASS studio browser: v1.4 11-slide proposal package, 8 source renders, manual metadata safety, DRAFT audit and immutable MASTER state plus all prior regressions");
  } finally {
    await browser.close();
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
