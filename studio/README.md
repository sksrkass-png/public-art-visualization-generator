# AXOO Public Art 3D Studio — Alpha 0.1

Static, browser-based interactive editor for public-art proposal staging. It is a companion to the existing prompt generator: `/studio/` leaves the legacy app unchanged.

## User workflow

1. **현장**: Choose a schematic preset (plaza/courtyard/promenade/empty), or load an actual site **GLB** or standalone GLTF. The three built-in presets are demonstrative massing only, **not real architecture**.
2. **배치도 참조**: Optional PNG/JPG/WebP map placed flat on ground. Enter the real measured horizontal map width in metres. **It is not photogrammetry**; site photos are not automatically converted to 3D.
3. **작품**: Load GLB/standalone GLTF/OBJ/STL, or use the dummy sample. The artwork's model shape/material parts remain intact; its pivot is centered horizontally and moved to ground. Artwork height is resized proportionally to the entered metres.
4. **조작**: Click the artwork; G = move, R = rotate, S = scale, or click toolbar tools. Use the color-axis gizmo or precise X/Y/Z numbers. Proportional size lock is on by default. Holding right mouse to pan, wheel to zoom; left-drag on empty area to orbit. Grid and snap toggles are available; undo/redo saves transforms.
5. **빛 / 카메라**: Adjust sun azimuth, elevation, intensity, ambient lighting, exposure and shadows. Eight view presets are provided.
6. **승인**: MASTER VIEW button freezes artwork transforms **and site models/mapping**. Unlock requires explicit confirmation and starts a new revision; camera and lighting remain adjustable.
7. **내보내기**: Save 2× viewport PNG, a geometry-embedded scene GLB for Blender, or JSON settings to reopen later.

## Constraints / known limitations

- All coordinates and model heights use **metres (m), Y-up** as in glTF. Export from Blender using glTF 2.0 (.glb), +Y up at runtime; apply Blender scales before exporting when accurate site geometry is essential. The site model is kept in original coordinates and scale.
- A standalone `.gltf` works only if it embeds its binary/images. When its `.bin` and textures are external, **export a single `.glb` file instead**. OBJ material companion `.mtl` is not loaded; STL uses a neutral PBR material.
- Imported artwork is normalized to a center-ground pivot for editing. This intentionally discards the *object's world placement*, not its original mesh geometry, material colors, components or ratios.
- Site model remains **non-editable** to enforce SITE LOCK. Dummy site presets are explicitly not substitutes for verified real-site architecture or landscape.
- JSON is a project **settings** snapshot; it includes file *names*, transform, lock/revision status, lighting and camera, **not binary uploaded models nor the embedded map image**. Reattach the matching 3D asset to restore its transform. GLB export contains the current geometry and map when exportable.
- Map underlay is a horizontal reference plane centered on world origin; a geospatially registered coordinate import and exact surveyed plan alignment are not implemented.
- One artwork root is currently editable per scene. Multi-artwork scene hierarchy, physically precise CAD drafting, area masks and geometry sculpting are future extensions.
- Exact screen parity with `site-model-v1/artwork-v2/viewer/index.html` **has not been checked** because `file:///C:/...` paths are not reachable from the hosted repo.
- Three.js is loaded from pinned jsDelivr `three@0.186.1`; internet access is required on first page load. No user assets are sent to a server; the scene is client-side.

## Developer QA

```sh
node --check studio/studio.js
node tests/studio-static.test.cjs
```

Manual browser smoke checks: open `/studio/`, verify sample artwork and orbit; toggle G/R/S, translate in X, undo/redo; activate MASTER LOCK and confirm drag/site controls are disabled; unlock then upload one valid GLB for site and one for artwork; move artwork and vary sunlight; verify 8 camera presets, PNG, JSON roundtrip and scene GLB export. A browser/WebGL test is **not yet automated** in this alpha.
