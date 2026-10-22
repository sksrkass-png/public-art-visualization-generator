const { chromium } = require("playwright");
const fs = require("node:fs");
const assert = require("node:assert/strict");

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
    assert.deepEqual(errors, [], "no uncaught runtime errors");
    console.log("PASS studio browser: WebGL, edit, undo/redo, lights, views, lock, PNG, JSON roundtrip, GLB export, source scale, master snapshot, ZIP recovery and locks");
  } finally {
    await browser.close();
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
