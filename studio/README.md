# AXOO Public Art 3D Studio — v0.4

Static, browser-based interactive editor for public-art proposal staging. Version 0.3 expands site model imports. It is a companion to the existing prompt generator: `/studio/` leaves the legacy app unchanged.

## v0.4 additions

- **Camera:** Mouse pan and rotate speeds increased; `nav-speed` slider adjusts OrbitControls pan/rotate/zoom. Remove the old full-width viewport footer; keep a small floating coordinates label.
- **Site calibration:** UI can scale an imported site's top-level transform from m/cm/mm/ft and rotate Z-up into world Y-up. Imported meshes and original file bytes stay unchanged. **Verify real-world dimensions**; some FBX/DAE loaders may have already converted units and should not be corrected twice.
- **Ground mapping:** Default ground textures and 2D plans remain as an optional fallback for dummy site presets, but are hidden after an actual site model is imported so they do not overwrite modeled paving.
- **Selectable environment assets:** Add a round canopy tree, pine/conifer tree, or shrub; point/spot lights can be placed directly on a clicked surface. Extra assets can be chosen by click or selection list, moved (G), rotated (R), scaled (S), deleted and restored with undo/redo. Supplemental foliage is **stylized concept geometry**, not existing-site survey data.
- **Lighting & sun indicator:** clear/cloudy/late-day/night presets, positionable point/spot lights (intensity/color), optional semi-transparent sun sphere. Sphere, editors and light-location icons are hidden during PNG capture and never added as export geometry.
- **Rendering:** 2x/3x/4x clean PNG capture of the actual 3D scene using ACES tonemapping, physically based materials, basic room reflections, soft shadows where supported. This improves presentation but **is not photographic AI reconstruction, Blender Cycles or offline path-tracing**. Higher settings depend on GPU and may consume significant memory.
- **Persistence:** Site unit/up selection, foliage, additional lights, camera speed and lighting preset persist through existing settings JSON and complete-project ZIP.

## User workflow

1. **현장**: Choose a schematic preset (plaza/courtyard/promenade/empty), or load an actual site **GLB / standalone GLTF / OBJ / FBX / STL / PLY / DAE / 3DS**. The three built-in presets are demonstrative massing only, **not real architecture**.
2. **배치도 참조**: Optional PNG/JPG/WebP map placed flat on ground. Enter the real measured horizontal map width in metres. **It is not photogrammetry**; site photos are not automatically converted to 3D.
3. **작품**: Load GLB/standalone GLTF/OBJ/STL, or use the dummy sample. The artwork's model shape/material parts remain intact; its pivot is centered horizontally and moved to ground. Imported artwork is **never automatically rescaled**: source W×H×D dimensions (interpreted as metres) are displayed. When units have been verified, the explicit **높이 맞춤** button proportionally scales the model to the entered real height.
4. **조작**: Click the artwork; G = move, R = rotate, S = scale, or click toolbar tools. Use the color-axis gizmo or precise X/Y/Z numbers. Proportional size lock is on by default. Holding right mouse to pan, wheel to zoom; left-drag on empty area to orbit. Grid and snap toggles are available; undo/redo saves transforms.
5. **빛 / 카메라**: Adjust sun azimuth, elevation, intensity, ambient lighting, exposure and shadows. Eight view presets are provided.
6. **승인**: MASTER VIEW approval saves an immutable snapshot of artwork transform, asset identity, camera, time, and lighting, then freezes artwork transforms **and site models/mapping**. Unlock requires explicit confirmation and starts a new revision. The Master History list and **승인 마스터의 카메라·조명으로 복귀** can restore any approved camera/lighting arrangement while leaving geometry in place.
7. **내보내기**: Preferred: **전체 프로젝트 ZIP 저장** creates a portable bundle with source artwork/site model bytes, optional plan image, transforms, lighting, camera, and master approval history. Importing this ZIP restores the project across sessions without choosing individual model files. PNG, GLB, and backwards-compatible settings-only JSON remain available.

## Constraints / known limitations

- The editor uses a **Y-up world and metre-based grid**, but **does not change or infer imported site-model units, scale, pivot or orientation**. GLB export from Blender with applied scale and Y-up conversion remains the best way to ensure coordinate and measurement consistency. Imported OBJ/STL/PLY/FBX/DAE/3DS files may use differing unit conventions and axes. Confirm their W×H×D readout against the plan before positioning artwork.
- **Site formats:** GLB, standalone GLTF, OBJ, FBX, STL, PLY, DAE (Collada), 3DS (legacy). The uploaded original binary/text file is saved inside the project ZIP. Geometry must include at least one mesh. Exporting the project as scene GLB remains available for cross-app use.
- **Not yet direct import:** SKP (SketchUp), IFC (BIM), RVT (Revit), DWG/DXF (CAD). Convert through SketchUp/Blender/FreeCAD or a compatible specialist exporter into GLB, preferably using real-world metres and Y-up. IFC-native semantics and precise surveyed coordinates require a separate dedicated import pipeline.
- A standalone `.gltf` works only if it embeds its binary/images. When its `.bin` and textures are external, **export a single `.glb` file instead**. OBJ material companion `.mtl` is not loaded; STL/PLY use a neutral PBR material (PLY embedded vertex colors are retained when available). FBX, DAE and 3DS may reference **external textures** that the single-file importer cannot resolve; such textures may be missing. Prefer a GLB with embedded textures for architectural render fidelity.
- Imported artwork is normalized to a center-ground pivot for editing. This intentionally discards the *object's world placement*, not its original mesh geometry, material colors, components or ratios.
- Site model remains **non-editable** to enforce SITE LOCK. Dummy site presets are explicitly not substitutes for verified real-site architecture or landscape.
- Settings-only JSON is retained for backwards compatibility, but does not include source assets. **Use the complete project ZIP for reliable recovery**; it includes original uploaded model bytes and plan image. ZIP compression runs inside the browser. Current size limits: ZIP 200 MB, each model 80 MB, plan image 20 MB.
- Map underlay remains an optional schematic reference plane for a preset site. A geospatially registered coordinate import and exact surveyed plan alignment are not implemented. Imported site files hide its fallback controls and use their own modeled ground.
- One artwork root is currently editable per scene; the additional flora/lights are separate transformable objects. Full CAD mesh sculpting and precise landscape planning are future extensions.
- Exact screen parity with `site-model-v1/artwork-v2/viewer/index.html` **has not been checked** because `file:///C:/...` paths are not reachable from the hosted repo.
- Three.js is loaded from pinned jsDelivr `three@0.186.1` and ZIP handling from pinned `jszip@3.10.1`; internet access is required on first page load. No user assets are sent to a server; the scene is client-side.
- A glTF/OBJ/STL file does not contain reliable metres metadata: units must be checked against real artwork W×D×H before manually applying a size change. Imported local transforms are left intact; only an external center-ground editing pivot is added.
- The ZIP restoration path is intended for project recovery, not collaborative cloud sync. Uploaded site files and artist assets remain on the user device; use the ZIP to archive or share with collaborators.

## Developer QA

```sh
node --check studio/studio.js
node tests/studio-static.test.cjs
```

CI automates a browser/WebGL smoke test covering G/R/S, source scale, master locking, lighting, camera presets, PNG/GLB exports, project ZIP roundtrip, and site-format samples (OBJ/STL/PLY/DAE/3DS plus pinned Three.js FBX reference). Real architectural models can expose vendor-specific unit, texture, geometry or animation differences: perform a visual review with real files before assuming site accuracy.
