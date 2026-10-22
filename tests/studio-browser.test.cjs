const { chromium } = require("playwright");
const fs = require("node:fs");
const assert = require("node:assert/strict");
const { siteFixtures, loadFbxFixture } = require("./site-model-fixtures.cjs");

(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: ["--enable-webgl", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"]
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  try {
    await page.goto("http://127.0.0.1:8787/studio/", { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.locator("#viewport canvas").waitFor({ timeout: 60000 });
    await page.waitForFunction(() => document.querySelector("#art-filename")?.textContent.includes("Sample Artwork"), null, { timeout: 30000 });
    assert.equal(await page.locator("#site-status").textContent(), "예시 공간");
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
    assert.deepEqual(errors, [], "no uncaught runtime errors");
    console.log("PASS studio browser: v0.7 HDRI file, PBR override/reset/Undo, exact 16:9 PNG, 50mm lens, ZIP recovery and previous MASTER/site controls");
  } finally {
    await browser.close();
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
