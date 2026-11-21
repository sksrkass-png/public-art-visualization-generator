# PUBLIC ART VISUALIZATION — Prompt Generator

건축물 미술작품 공모를 위한 작품 × 설치 공간 시안 생성 프롬프트 도구.

A lightweight, static, Korean-first web tool that generates structured, copy-paste-ready image-generation prompts for **public art competition visualizations**. Built for curators, planners, and public-art proposal teams who need consistent, locked-down prompt packages for ChatGPT / image generation workflows.

No backend, no build step, no API keys — pure HTML/CSS/JavaScript, deployable directly to GitHub Pages. ⓒ AXOO CORP. — designed as an extension of the AXOO creative portfolio: black-and-white editorial palette, large display typography, sharp (unrounded) grid, generous whitespace, Pretendard typeface. Hierarchy comes from type scale and spacing, not color — the interface is meant to read as a premium creative studio tool, not a configuration dashboard.

## Interactive 3D Studio — Alpha 0.1

A new companion editor lives at **[3D STUDIO](https://sksrkass-png.github.io/public-art-visualization-generator/studio/)** (`studio/index.html`).

Unlike the text-prompt generator below, the studio lets proposal teams load scene models and artwork, move/rotate/scale using 3D gizmos, choose ground mappings, place a horizontal site-plan reference image, tune lighting and camera, lock an approved master placement, and export PNG/JSON/GLB. Built on pinned Three.js; no API key or backend. See [studio/README.md](studio/README.md) for supported model formats, source constraints and workflow.

**Scope distinction:** The studio is an interactive 3D **scene editor**, not an AI image generator, full Blender CAD replacement, architectural photogrammetry tool or verified reconstruction of any real site. The older prompt generator continues to operate independently.

## Purpose

Public art competition visualizations need to satisfy a specific, non-negotiable constraint that generic AI art prompts don't handle: **the site must stay the site, and the artwork must stay the artwork** — only the camera should change between shots. This tool encodes that workflow directly into the prompt structure:

**SITE LOCK + ARTWORK LOCK + SCALE LOCK + CAMERA VARIATION**

Instead of writing each camera-angle prompt from scratch (and risking the AI silently redesigning the artwork or moving the building), you fill in the project/site/artwork details once, set your lock preferences, and generate a full prompt package in one pass — always anchored to a MASTER → MASTER LOCK → SHOT workflow.

## Feature Overview

### UX & visual identity (v1.4 — editorial studio redesign)

- **Black-and-white editorial visual system** — pure white ground, near-black ink, one neutral gray for secondary text, hairline dividers instead of cards/shadows, sharp (0-radius) corners throughout. No accent color is used for hierarchy or meaning; large type scale, weight, and whitespace do that job instead (recommendation/certainty/selected states are all communicated in black/white — filled vs. outlined vs. bordered).
- **4-stage creative flow** — large editorial stage headlines (**Project → Site → Visual Direction → Generate**, Stage 01–04) with a Korean subtitle underneath each. Only one stage shown at a time in Simple Mode, with a minimal text-based stepper (not a dashboard progress bar) at the top.
- **간편 모드 / 전문가 모드 (Simple / Expert)** toggle in the header (persisted in `localStorage`), styled as plain underlined text tabs. Simple Mode shows only what's needed; Expert Mode reveals every individual lock checkbox, technical shot views, and the ratio field, and unlocks all 4 stages on one scrollable page for power users.
- **공간 보존 수준 프리셋 (최소 / 보통 / 최대)** — a three-way selector (selection shown by inverting to solid black, not a color highlight) replaces two dozen individual lock checkboxes. The checkboxes still exist underneath and still drive the prompt engine unchanged — Expert Mode's "개별 고정 항목 직접 설정" panel exposes them for fine-tuning.
- **AI 추천 (site-type recommendations)** — picking a 공간 유형 (e.g. 아파트 중정) surfaces a bordered, confident recommendation panel (a small solid "AI" mark, no colored alert box) with suggested camera shots, human-scale, and preservation level; one **추천 적용** click applies all of them at once.
- **ⓘ tooltips** on every field (hover or tap/focus), explaining in one line why it matters — this is what lets the form stay visually quiet instead of pairing every label with an English caption.
- **Collapsible result cards** — every generated prompt starts collapsed ("프롬프트 생성 완료 ▾ 펼치기"); the copy action stays reachable without expanding.
- **Example preview instead of a blank result area** — before you generate anything, the results panel shows the 4-part output structure (00 기준 프롬프트 → 01 기준 시점 → 02 기준 고정 지침 → 03 카메라 구도별 프롬프트) with a sample excerpt, so the empty state teaches the workflow instead of just being empty.
- One filled black primary action per screen; every other control is either outlined or a plain underlined text link — no competing buttons.

### Prompt engine

- **작품 고정 강화 (identity-lock reinforcement, optional)** — under "작품 고정 강화" in Stage 01, list the artwork's distinctive visual elements (one per line, e.g. "상단 하트 모양", "흑·금 배색") and/or forms the AI must never turn it into (e.g. "하우스 오브 카드 구조", "백색 조각물"). When either list is filled, every generated prompt (Master/View/Lock/every shot) automatically gets an itemized "Preserve exactly: …" clause, a "Do not transform the artwork into …" clause, and a dedicated `NEGATIVE (avoid): …` line combining your forbidden forms with generic identity-loss negatives. This exists because generic STRICT-level language ("don't redesign the artwork") isn't always enough for artworks with highly specific, easily-misread iconography — being explicit about the exact shapes/colors and the wrong shapes an AI might substitute closes that gap.
- **Always-on Master Workflow** — every generation produces a 기준 프롬프트 (project brief), 기준 시점/Master View (first approved image prompt, highlighted with a green border and STEP 01 badge), and 기준 고정 지침/Master Lock (STEP 02 anchor instruction), followed by numbered shot prompts (STEP 03).
- **Shot-by-shot prompts** for up to 12 camera angles: Main Perspective, Eye Level, Left 3/4, Right 3/4, Rear, Aerial, Long Shot, Close-up, plus optional technical views (Front/Rear Orthographic, Left/Right Elevation).
- **Automatic lock language** — STRICT / STANDARD / FLEXIBLE artwork lock levels insert progressively stronger preservation instructions.
- **Reference-insufficiency warnings** — Rear, Left/Right 3/4, and all technical (orthographic/elevation) shots automatically display a Korean caution that AI-generated results should be treated as presentation-only, not fabrication drawings.
- **Site Reference Certainty** — 현장 레퍼런스 유형(실제 현장 사진/건축 투시도·조경 렌더/조감도/배치도/Mixed)에 따라 SITE CERTAINTY(HIGH/MEDIUM/LOW/MIXED)가 자동 표시되고, 각 등급에 맞춰 SITE LOCK 문장 자체가 달라집니다. 배치도·조감도(LOW)처럼 입면/외장재 정보가 없는 레퍼런스에서는 "façade를 정확히 유지하라"는 모순된 문구 대신 부지 경계·건물 위치·동선 등 확인 가능한 요소만 고정합니다. 배치도와 조감도는 서로 다른 문구를 사용합니다(조감도를 "site plan"이라고 부르지 않습니다). 미착공(unbuilt) + LOW 인증 조합에서는 럭셔리 마케팅 렌더링을 막는 강화된 억제 문구가 추가로 삽입됩니다.
- **기단(base) 없음 자동 처리** — 기단 여부를 "없음"으로 설정하면 받침대/수반/플랫폼을 임의로 만들지 말라는 문구가 자동으로 삽입됩니다.
- **수치 기반 Scale Lock** — 작품 높이(H)를 입력하면 평균 성인 키(1700mm) 대비 배율을 자동 계산해 "The artwork height is exactly 3000 mm... about 1.76 times the height of a person" 형태의 문장을 삽입합니다. "과장 확대 금지", "모든 뷰에서 동일 비율 유지", 사람이 없는 컷에서도 건축물·벤치·보행로·식재 등 주변 요소 대비 실제 크기로 보여야 한다는 문구가 함께 추가됩니다. 높이를 입력하지 않으면 기존의 일반 scale lock 문장만 사용됩니다.
- **Site Hardscape Lock** — 미착공(unbuilt) + SITE CERTAINTY LOW 조합에서만 자동 적용되는 억제 규칙입니다. 원형 광장, 방사형 포장, 전용 조형광장, 수경/분수, 특수 받침대·플랫폼, 장식 옹벽, 게이트, 기념비형 기단, 특수 조경 조명 등을 배치도에 없는 한 임의로 만들지 않도록 제한하고, "작품이 계획된 부지에 맞춰야 하며 부지가 작품을 위해 재설계되어서는 안 된다"는 핵심 원칙을 명시합니다. MASTER VIEW에는 이 관계가 이후 모든 샷의 기준이 된다는 강조 문장이, MASTER LOCK에는 "스케일 관계 유지"·"이후 컷에서 새 하드스케이프 도입 금지" 항목이 추가로 포함됩니다.
- **Export / Import** — export the full package as `.txt` or `.json`, then use **JSON 불러오기** to restore project inputs, reference type, preservation settings, and selected shots from a previously exported package. Import validates the file locally (max 1 MB), ignores unknown fields and prior output text, and **regenerates the prompts with the current engine**. No file is uploaded to a server. **Local history** stays in browser `localStorage` (last 20 generations).

Everything runs client-side. Nothing is uploaded anywhere; history and drafts live only in your browser's local storage.

## How to Use

1. **① 프로젝트 & 작품** — 프로젝트명, 작품명(필수) + 작가명, 공모명, 작품 규격(W·D·H·재료·컬러·기단)을 입력합니다. 설명/의도는 선택 사항입니다.
2. **② 설치 공간** — 공간 유형과 설치 위치를 정하면 추천 배너가 나타납니다. 원하면 **추천 적용**을 눌러 카메라 구도·보존 수준·인물 스케일을 한 번에 채웁니다. 현장 레퍼런스 유형과 시간대, 미착공 현장 여부를 정합니다.
3. **③ 스타일** — **공간 보존 수준**(최소/보통/최대)을 고르고, 리얼리즘과 인물 스케일을 정합니다. 전문가 모드에서는 개별 고정 항목을 직접 조정할 수 있습니다.
4. **④ Prompt 생성** — 촬영 구도를 선택하고 **프롬프트 생성**을 누릅니다. 이전에 JSON으로 내보낸 프로젝트를 재개할 때는 페이지 하단의 **JSON 불러오기**로 파일을 선택하세요. 입력값을 복원하고 최신 프롬프트 규칙으로 다시 생성합니다.
5. 결과에서 `00 기준 프롬프트`를 먼저 이미지 생성 도구에 붙여 넣어 전체 컨셉을 검토합니다.
6. `01 기준 시점(Master View)` 프롬프트로 대표 이미지를 생성하고 승인합니다.
7. 승인된 이미지를 첨부한 채로 `02 기준 고정 지침`과 각 `03 카메라 구도` 프롬프트를 함께 사용해 각도별 이미지를 생성합니다.

### Suggested workflow with ChatGPT / image tools

1. 작품 정보와 설치 공간 정보를 입력합니다.
2. 작품 / 공간 고정 규칙을 설정합니다.
3. MASTER VIEW를 먼저 생성합니다.
4. 승인된 MASTER를 기준으로 각도별 Prompt를 사용합니다.

## File Structure

```
/
├── index.html          # 4-step wizard markup: topbar/mode toggle, stepper, step panels, result section
├── assets/
│   ├── style.css        # Monochrome editorial design tokens + wizard/preset/tooltip UI
│   └── app.js            # Prompt engine (unchanged) + wizard/mode/preset/recommendation UI layer
└── README.md
```

## Deployment (GitHub Pages)

1. Push this repository to GitHub (see commands below if the repo doesn't exist yet).
2. In the repository, go to **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to `Deploy from a branch`.
4. Select branch `main` and folder `/ (root)`, then Save.
5. GitHub will publish the site at `https://sksrkass-png.github.io/public-art-visualization-generator/`.

No build step is needed for deployment — this is a static site served as-is. An optional GitHub Actions validation workflow (`.github/workflows/validate-static.yml`) runs JavaScript syntax checks and dependency-free JSON-import regression tests on pushes and pull requests. To run the checks locally, use `node --check assets/app.js` and `node tests/json-import.test.cjs` (Node 22+).

### Git commands (if the GitHub repo hasn't been created yet)

```bash
gh auth login
gh repo create sksrkass-png/public-art-visualization-generator --public --source=. --remote=origin --push
```

Or manually:

```bash
git remote add origin https://github.com/sksrkass-png/public-art-visualization-generator.git
git branch -M main
git push -u origin main
```

## Limitations

- Prompt text is generated from templates and simple conditional logic — it does not call any AI model itself. Quality of the final image still depends entirely on the image-generation tool you paste the prompt into.
- Rear, side (Left/Right 3/4), and all technical/orthographic views are inherently limited when only front-facing reference material is available — the tool surfaces a warning, but cannot fabricate missing reference geometry.
- History and drafts are stored in browser `localStorage` only: clearing browser data, using a different browser, or a different device will not carry history over. Use **JSON 내보내기** for anything you need to keep long-term or share with teammates.
- No authentication, multi-user sync, or cloud storage — this is a single-user local tool by design.
- The generated prompt body is intentionally English-only (for direct use in image-generation tools); only the surrounding UI and descriptions are Korean.

## Future Roadmap

- Per-project saved presets (e.g. save a site's lock configuration for reuse across multiple artwork proposals).
- Batch shot selection presets tailored to specific competition submission requirements.
- Optional side-by-side Korean translation of the generated English prompt for internal review.


## AXOO 3D Studio v3.3 — Universal Import I (2026-11)

This release upgrades the **existing static, browser-local studio**. It does **not** add a remote backend, cross-device saving, real-time teamwork, or native SKP/BLEND/3DM/RVT/DWG/IFC parsers. Previous v3.2 portable project ZIPs and MASTER approval data remain supported.

### Supported model sources

- **Site and primary artwork**: GLB, glTF 2.0 (.gltf), OBJ, FBX, STL, PLY, DAE, 3DS and ZIP containing **one** supported model plus linked assets. Model or model-ZIP upload cap: **120 MiB**.
- **OBJ**: select OBJ and one MTL, plus optional supported texture images, in a **single multi-file selection**, whole-folder chooser, or ZIP. OBJ+MTL keeps its established stricter sidecar limits (maximum 24, 40 MiB per image/material file). OBJ material names and original geometry are retained.
- **glTF**: choose .gltf, external .bin buffers and referenced JPG/PNG/WEBP/BMP together (multi-file or folder), or zip them. Nested paths are respected when provided; flat file selections match unique basenames. External URLs are blocked. Standalone .glb is recommended when available.
- **FBX/DAE/3DS**: source geometry can be loaded; external texture paths are not automatically imported. Re-export self-contained GLB if materials must be preserved.
- Companion file budget: **45 files, total 80 MiB** for the general bundle workflow; ZIP payloads validate the uncompressed sizes before allocation.

### Import process and diagnostics

- Two identical source import panels: **site** and **artwork**, each with multi-select, folder picker, and file drag-and-drop. Browser folder picker support depends on the client (Chromium recommended).
- Four stage indicators: verify inputs → parse geometry and materials → inspect complexity and scale → finish. Percent in progress bar represents **stages, not actual transferred bytes**; heavy synchronous parsers may still temporarily block the tab.
- Diagnostics show mesh count, triangle count, approximate geometry/texture GPU memory footprint, non-destructive format-specific unit/axis hints, and performance warnings. These are engineering estimates, **not a guarantee of renderer memory usage**.
- Source geometry is not decimated, rescaled, or recentered by this workflow. Site units/height axis still require physical measurement and explicit user checking; FBX conversions can be performed by its loader.

### Project persistence and migration

- Both **site and artwork** companion files are stored in the portable project ZIP with original relative paths. v3.2 projects without these fields still open through the previous `axoo-public-art-portable-v1` schema.
- A local-only `sourceManifest` is saved in the JSON as groundwork for a future cloud project database. Source files are not uploaded to AXOO or other remote storage.
- The total portable project ZIP cap remains **320 MiB**. A combination of two 120 MiB models and extensive texture assets can exceed this limit; lighten assets or save smaller versions before exporting. A model file being accepted does **not** guarantee that the final ZIP fits or that the device can render it.
- Existing MASTER LOCK, revisions, site coordinates, project ZIP integrity checking, camera bookmarks, and the offline Team Review workflow stay in place.

### QA checks and known gaps

Use real artist-provided sample sets (OBJ+MTL+images, glTF+BIN+images in a folder, bundled ZIP, FBX, and 120 MiB models), then save and reload a portable ZIP to confirm materials and matching real-world dimensions. Validation covers path traversal, duplicate filenames, oversized files, missing textures and basic glTF references. Browser/GPU smoke tests with actual large models are still required.

**Planned later**: offline SKP/Rhino/Blender/CAD format conversion services in v3.4; project-type modes in v3.5; account-based cloud workspaces in v4.0; true online concurrent team editing in v4.1.


## AXOO 3D Studio v3.4 — Format Bridge (2026-11)

### Newly available
- **Rhino 3DM**: first-party Three.js `Rhino3dmLoader` integration for the *site* and *artwork* primary-model import slots. Native Rhino geometry decoding uses the pinned `rhino3dm@8.32.1` browser WASM library loaded on demand from jsDelivr; original user files are **not uploaded** to the library CDN. Curves/NURBS and external texture/material behavior depends on Rhino decoder capabilities. Verify size, coordinate axis and appearance. Use a GLB fallback when Rhino decoding fails.
- **ASCII DXF**: site-side **2D reference drawing only**, not full AutoCAD 3D/BIM geometry. A conservative local parser renders LINE, LWPOLYLINE, ARC and CIRCLE as schematic layer-separated, thin display meshes on the reference plane. Maximum **24 MiB** ASCII DXF. Other entities (e.g., INSERT/BLOCK, legacy POLYLINE, HATCH, SPLINE, 3DFACE) can be omitted and are reported as unsupported. Unsupported-only plans fail rather than being shown as complete. DWG and binary DXF are not supported. The CAD lines are **not** trusted for 3D terrain, ground snapping or physical site certification; a fallback reference plane remains visible.
- **CAD units**: when the DXF `$INSUNITS` header declares metres, millimetres, centimetres, feet or inches, the importer sets the corresponding non-destructive site conversion control. Unknown values remain metres by default and require manual verification. The new inch option is also available in the normal site import settings.
- **Format Bridge advisory**: a local-file *metadata-only* checker for SKP, BLEND, RVT, IFC, DWG, DXF, 3DM, STEP/STP, IGES/IGS, USD/USDZ and 3MF (plus current supported mesh formats). Selecting a file generates appropriate export/checking steps and a copyable checklist. It **does not convert** proprietary or unsupported formats, change source assets, or send them to a server.

### Still unsupported natively
SKP, BLEND, DWG, RVT, IFC, STEP/IGES, USD/USDZ and 3MF continue to require conversion by the source application's export function or a separate trusted tool, usually to GLB. This release does **not** introduce a hosted conversion backend or the v4.x cloud collaboration platform.

### Backwards compatibility and QA
- Existing supported model formats, 120 MiB primary model cap, 80 MiB companion budget, 320 MiB project ZIP cap, v3.2/v3.3 portable archive schema, SHA-256 integrity checks and MASTER LOCK remain unchanged.
- Rhino 3DM and ASCII DXF source bytes are preserved inside the existing site/artwork project ZIP keys. The browser reads them again on restore; Rhino decoding needs the same library availability. No source-geometry rescaling or remeshing is silently applied by the studio beyond the decoder's visualization conversion.
- Suggested manual validation: Rhino NURBS, meshes and SubD cases; ASCII DXF with mm/m units, layers, unsupported blocks, and malicious paths; archive round-trip; actual 120 MiB file performance on Chrome/Edge. Static and mocked checks alone do not establish complete visual fidelity or architectural accuracy.


## v3.5 — Multi-Project Studio (2026-11)

### Four spatial project modes (manual, non-destructive)
- **PUBLIC ART** — artist artwork, site preservation and MASTER LOCK (default and fallback for all older scene JSON/project ZIPs).
- **POP-UP & RETAIL** — modular partitions, merchandise shelves, service counter, podium, screens, signage and kiosks.
- **EXHIBITION DESIGN** — display plinths, temporary partitions, media walls and visitor flow concept arrangements.
- **SPATIAL BRANDING** — totem signage, outdoor fixtures, greenery, directional spatial experiences.

The Project Mode selector changes **UI guidance, QA checklist and suggested built-in assets only**. It does not move, hide, duplicate, rescale or replace any user model or site. The new mode name persists as optional `projectMode` in the existing `axoo-public-art-3d-studio-v1` scene JSON and portable ZIP. Older v3.4 and previous projects lacking this field restore as `public-art`, with the existing MASTER LOCK and project integrity behavior preserved.

### Seven new manually editable schematic assets
`modular-wall` (3m x 2.6m), `retail-shelf` (2m x 2m), `display-podium` (~1m), `brand-counter` (~2.4m), `media-screen` (3.15m), `signage-totem` (2.25m high), `experience-kiosk` (~1.43m high). These are **brand-neutral editable scale proxies**, not third-party IP, fabrication engineering or functioning screens. They participate in existing scene selection, transform, duplicate, layer controls, undo/redo, render and project ZIP restoration as separately tracked `extras`. No existing artist geometry is modified.

### Optional starter layouts and clear editor responsibilities
Each mode provides an **explicit**, opt-in starter-layout button adding 4–7 independent placeholders near the current scene focus. Real imported site data or an already populated scene prompts before addition; no layouts are loaded just by switching modes. The placements are **schematic starting points**, not measured, approved site positions. Existing artwork and site source files remain unchanged, even when a starter layout is accepted. Non-public-art modes expose an optional toggle to hide the **default sample sculpture only** using the existing undoable artwork-layer visibility (not source deletion); no sample-only control is offered while a real sculpture or additional artwork model is present. Existing layer management can restore visibility.

### Expanded project GLB library
Up to **12 distinct user-supplied GLB source models**, each **20 MiB max**, combined **120 MiB max**; existing per-model triangle validation remains in place. New categories: architecture, display, media and signage, in addition to plants, people, furniture, vehicles and artwork. Source GLBs continue to be preserved locally in the portable project ZIP and may be independently placed multiple times. Be mindful that the **overall project ZIP limit is still 320 MiB**, so combinations of two 120 MiB sources and many GLBs can exceed that cap. There is still **no automatic external asset download** or account-based collaboration.

### Suggested QA before production use
1. Change between all four modes, verify the loaded site, artwork, transforms and file sizes do not change.
2. Add each starter layout to an empty sample scene and verify placement, selection, resize, duplicate and undo.
3. Confirm existing v3.4 portable ZIPs open as Public Art, and new non-default mode ZIPs restore with the exact mode, extra kinds and layer visibility.
4. Confirm MASTER LOCK prevents layout addition, primary mode changes and sample visibility changes.
5. Use a real retail/exhibition source GLB to check material fidelity, route width and physical dimensions; schematic templates do not certify structural safety, life safety or building-code compliance.


## AXOO Studio v3.6 — Spatial Visualization (2026-11)

### Project-type lighting presets
- Three lighting looks per Public Art, Pop-up & Retail, Exhibition Design and Spatial Branding: 12 total. Each look sets the existing sun, ambient, exposure, tone mapping, shadow, sky, and environment controls.
- Source artwork, imported site, real-world geometry and their materials are untouched. MASTER LOCK prevents lighting recipe changes. Applying non-HDRI modes preserves existing uploaded HDRI source bytes but changes selected reflection mode.
- These are artistic starting points for WebGL rendering rather than a photometric simulation.

### Six spatial camera framing presets
- Hero, Whole Installation, Visitor Eye Level, Diagonal, Overhead, and Selected Detail. Uses world bounds of actual visible staging objects (artist artwork / separately placed space fixtures). Changes only camera position, look target and focal length; user can refine manually.
- Whole Installation intentionally prioritizes the composition over a massive full-site city mesh; use the separate full-site camera option for complete-site framing. Visitor eye height is approximate, not measured against finished terrain.
- Camera changes are available with MASTER LOCK, consistent with existing orbit controls. Model forms, transforms and approval snapshot are not rewritten.

### Selected spatial-fixture finish presets
- Original, Gallery White, Graphite, Brushed Metal, Warm Timber, Brand Accent hex color.
- Strictly limited to the seven v3.5 schematic space fixtures. Never applies to imported external GLB, artist model, site meshes, or other planting.
- Undo/Redo, manual duplicate and scene extras serialization/reimport maintain finish metadata. Original material references are cached privately with a WeakMap, not placed on Three.js userData. Users may restore the original procedural finish at any time.

### A/B/C and archive interoperability
- The already-existing A/B/C visual variant engine saves actual camera and lighting values. v3.6 also stores the look and camera shot names as optional metadata for each variant.
- The already-existing isolated A/B/C WebGL PNG plus contact-sheet ZIP export now records project mode and per-variant look/shot identifiers in its JSON metadata. It remains a WebGL render, not generative AI.
- Scene JSON and full project ZIP use the existing portable schema. Optional spatialVisualization data defaults safely when reading old v3.5 or earlier projects; extra fixture finish metadata is similarly optional. MASTER LOCK, source model limits and 320 MiB portable project ZIP cap are unchanged.

### QA / known limitations
Static checks and mocked pure tests cover lighting recipe bounds, all spatial camera poses, fixture finish reversibility, scene extra serialization and restoration, backwards compatibility and code wiring. Real-world Chrome/Edge browser rendering, texture fidelity, shadows, actual 3D model and ZIP round-trip QA still require a smoke test with studio files. No real-time cloud collaboration, material texture baking, physically traced rendering, live video playback or AI image generation has been added.


## AXOO STUDIO v3.7 — Stability & Performance (2026-11)

**Release goal:** harden browser-local imports, large scenes, ZIP backup and WebGL recovery *before* introducing any cloud login, third-party server or paid subscription. This release changes neither original site/artist artwork geometry nor MASTER approval contents.

### Fixes for dense scene and A/B/C alternatives
- Removed an outdated **120 extras validation cap in the A/B/C visual variant helper**. Scene placement had already supported more than 120 extras since v3.2.1, but attempting to save a dense visual option failed silently at variant validation. The existing full scene-extra validator still checks each item's kind, ID, transform and related properties.
- To avoid a separate mismatch, raised the old **project.json ZIP import limit from 1 MiB to 8 MiB** (both saved JSON write guard and compressed ZIP load guard). Existing v1 portable ZIP archive schema, up to 320 MiB final ZIP size, source manifest checks, SHA-256 integrity verification and older archives remain compatible.
- If a scene exceeds the 8 MiB settings JSON limit, the editor now stops the **new archive export** with a clear message. This is a practical local-file size cap, **not a 120-object placement cap**.

### Safer, clearer project backups
- Suppresses concurrent full ZIP exports (including both quick save and lower export button) so repeated clicks cannot begin multiple large compression jobs. Full archive **import is blocked while an export is in progress**.
- The editor shows **ZIP compression progress in 5% steps**. Source files and project contents are still assembled and verified locally, not uploaded.
- The new opt-in **프로젝트 성능·백업 점검** button reports the count of live independent assets/meshes/triangles, last rendered WebGL frame draw calls, registered GPU resources (counts only), original file byte budget, and JSON metadata size. It produces a standalone JSON report without rewriting any scene content or MASTER revision.
- A raw file total above 320 MiB is **only a warning**: compression can reduce the actual ZIP file. The existing **actual resulting ZIP size** is the authoritative save limit. Source sizes are read from File metadata without rereading the binary data.
- These statistics are **not direct GPU VRAM/heap probes**, and the opt-in check is not an FPS benchmark or certified structural assessment.

### Resource stress and error handling
- On a WebGL context loss, pause the normal animation render loop, display a visible warning banner, keep the original model/source files in memory and allow manual project backup. On WebGL restoration, rerun lighting and visual-quality checks and ask the user to verify the result. Browser/driver recovery may still require a reload.
- Skip continuous WebGL render work while the page is in a hidden/background tab. On return, the existing animation loop resumes. This does **not** change offline saved render output settings.
- New model decodes now check if their import operation was superseded **before** running further scene inspection, preventing unnecessary expensive checks for a stale import. Decoded-but-uncommitted models do not replace the current site or sculpture.
- Accelerated the non-mutating imported-site coordinate-finiteness scan for ordinary packed XYZ BufferAttributes. The existing Three.js attribute getter fallback remains for interleaved/normalized coordinates. Source geometry and materials are not modified.
- Fixed the v3.4 DXF site-import unit hint to include **inches** when the source DXF header declares inch units (in addition to m/mm/cm/ft).

### Regression tests and limitations
- Added the standalone Node test suite at `tests/studio-v3.7-stability.test.cjs` for density/ZIP budget, GPU-state diagnosis, >120-item A/B/C validation, basic source/MASTER wiring and packed-XYZ site scanning. Run from repo root: `node --test tests/studio-v3.7-stability.test.cjs`.
- Source logic and pure helper checks are done; **do not claim** real Windows/macOS Chrome/Edge model loading, big-memory rendering, project ZIP round-trip and MASTER 8-view visual inspection are completed until tested with actual Rhino, OBJ, glTF and 3D sculpture/site assets.
- The browser still relies on Three.js/CDN libraries for initial loading. There is **no paid server, cloud storage, real-time editing, automatic online backup or background saving**, and the existing **320 MiB ZIP** and **120 MiB per primary model** limits remain.


## AXOO STUDIO v3.8 — Material & Reflection Studio (2026-11)

**Goal:** provide manually approved, reversible high-quality metal finish controls and remove conspicuous square studio panels / bubble-like reflection artifacts from mirror-polished stainless material previews. No server, cloud subscription or uploaded texture dependencies.

### Smooth gradient reflection environments — non-photographic and source-safe
- Two new optional environment modes: **🪞 Smooth Mirror (smooth-studio)** and **🌤️ Soft Outdoor (outdoor-soft)**. Both use lightweight deterministic, seamless 256 × 128 procedural equirectangular gradients; reflection highlights are broad and continuous, **not a room full of cuboids, panels or bubble shapes**. Generated locally in the browser by `studio/reflection-environments.js` and lazily cached per mode.
- Existing **neutral, bright, overcast, user-uploaded HDRI** options remain compatible. **Nothing is silently changed on opening old scenes.** For smooth mirror work, explicitly select the new Smooth Mirror environment from the right-hand Environment / HDRI panel; adjust global environment intensity as required.
- These textures are visual **reflection proxies**, not physically correct reflections of the building, landscaping, pedestrians or sky at a real site. For genuinely site-matching reflections supply an approved panorama/HDRI (or render with a physically accurate workflow). The normal renderer remains **Three.js WebGL PBR**, not path tracing or AI photorealistic synthesis. The environment map may affect all reflective materials in the scene without changing their source mesh/material properties.
- A/B/C separate render scenes reproduce the selected procedural environment via a reusable resolver. The approved MASTER eight-view exporter already restores the saved environment mode and uses the same render environment. Project JSON and source-file ZIP save the mode string with existing schema and integrity checks.

### Four precise artwork material controls (explicit opt-in)
- Under **작품 재질 / 명시적 변경** select a preset, then choose **roughness** (0.01–1), **metalness** (0–1), **material reflection multiplier** (0–3), and **hairline anisotropy** (0–1). Sliders do not modify the model until the user presses **선택한 작품 재질 적용**.
- Preset-appropriate defaults: **Mirror Stainless** roughness 0.065, metalness 1.0, anisotropy 0; **Brushed Stainless** roughness 0.28, metalness 1.0, anisotropy 0.45. A reset button restores the selected preset's suggested values **in the UI only**, and does not apply until the user presses the material-apply button. The existing **restore original material** action returns untouched source materials, including supplied texture maps.
- Explicit override is made only on **artwork preview meshes**, not imported site, surrounding planting, plan, other GLBs, sculptures' shape/scale/placement, or the original files. Material overrides are copied onto artwork instances via the established source material sync, and are stored with Undo/Redo, A/B/C variants, scene JSON and portable ZIP.
- Older pre-v3.8 `artworkMaterial: {preset, color}` objects remain valid: missing `tuning` simply uses original material preset defaults. New tuning objects are validated for finite values and the four allowed keys. Approved **MASTER LOCK** blocks editing the material and reflection environment; camera orbit/exports are unaffected. Changing finish after approval requires unlocking and approving a new revision.

### User workflow
1. Back up existing approved project via whole-project ZIP.
2. With MASTER unlocked choose **미러 스테인리스** and in **환경광 / HDRI** select **스무스 미러**.
3. For a near mirror look, keep roughness around 0.03–0.09, metalness 1.0, reflection 0.8–1.4, anisotropy 0. For a satin brushed look, start around roughness 0.28, metalness 1.0 and anisotropy 0.45.
4. Click **선택한 작품 재질 적용**, review the render at several angles, and only then approve the next MASTER Revision.
5. Use existing A/B/C comparison, 8-view captures and portable ZIP backup to preserve the selected appearance.

### QA
- `node --test tests/studio-v3.8-materials.test.cjs` covers both new reflection maps, seam checks, material parameter validation, backward compatibility, rendering stage integration and MASTER source protections.
- Actual Chrome/Edge WebGL reflections, site HDR realism and full loaded Rhino/OBJ/GLB material fidelity should be assessed visually with real source art assets before a client/competition submission. This release does not claim real reflected site geometry or physically measured polish.


## AXOO STUDIO v3.9 — Workspace UX (2026-11)

### ⚡ Quick / 🛠 Advanced workspace
- A two-button mode switch in the Studio header allows **QUICK** (core inspector folds open, other specialist folds individually accessible) versus **ADVANCED** (all right-hand inspector folds expanded). These modes change only interface presentation: **no change to source artwork, building geometry, layer state, scale, camera, ZIP metadata, or approved MASTER**.
- Five **workspace jump** links near the top of the left panel: Project, Assets, Material, Camera, Full Project Backup. Navigating to a right-hand inspector opens its containing fold before scrolling into view.
- The mode choice persists **only in this browser's localStorage** under a new v3.9 user-interface key; failed/blocked localStorage falls back gracefully. The legacy `?panels=open` link still enters Advanced mode for the current page. The saved ZIP/JSON project format is unchanged.

### 🌿 Visual asset cards and local favorites
- Each existing built-in asset palette button is presented as a legible **category pictogram preview card**, with a separate star toggle. These visuals are symbolic 2D preview icons **not a rendered photograph/thumbnail of its actual GLB geometry**. All original asset IDs, native procedural shapes, number of independent placeable objects, category/search filters, and click-to-repeat placement remain intact.
- User may select **☆ 즐겨찾기만 보기**, which switches to the all-assets catalog before applying the saved-star filter. Favorite data are stored only in localStorage and cleaned against known catalog item IDs; at most 100 valid favorite IDs. A browser with blocked localStorage retains favorites for the current tab only. No external assets, network requests, or account/paid backends.
- Existing uploaded custom GLB user library, up to 12 source models, stays untouched. Starred built-in catalog items do not change the editable scene or add geometry.

### 📐 Multi-select, alignment, and equal-gap placement
- The established **ADVANCED MODELING** panel gains searchable checkbox multi-selection, **검색 결과 선택**, **선택 해제**, selected count, **X/Z axis**, align by **start / center / end world-AABB edges**, and **equal edge-to-edge spacing**. The 3D viewport also supports Ctrl+left-click (Windows) and ⌘+left-click (macOS) on independently placed editable extras to toggle multi-selection.
- Alignment uses the **union of selected object world-space bounds**: each object translates only along the chosen X or Z axis so its chosen boundary or center matches the common target. Equal-gap placement requires three or more objects and preserves the outermost placement boundaries. If total object extents exceed available span (overlap too large), equal-gap is refused rather than allowing negative gaps.
- Only **independent extras** that are still present, visible/editable and on unlocked layers may be transformed. The imported site/building and primary sculptural source are **never accepted** as batch targets. MASTER LOCK blocks all batch transforms. No automatic editing of unselected peers, no changes to imported mesh vertices, Y elevation, rotation, scale, source materials, or preapproved artwork position.
- Every successful batch action is one **undoable `editSnapshot` / `commit`** transaction. Existing separately managed logical groups still work for manual move of group peers. Batch alignment itself moves only the explicitly checked root IDs, to avoid hidden/unselected group mutations. No automatic ground-snap or real clearance guarantee; verify site and spacing physically before architectural submission.
- The multi-selection checkbox list searches all placed extras even if there are more than the original 100 recently visible; when no query is entered, **검색 결과 선택** selects the most recent 100 as a safety/convenience default. A non-empty query can select all matching editable objects, while up to 150 are displayed at once to protect the inspector from very large DOM renders.

### Compatibility / testing
- No changes to `axoo-public-art-portable-v1` ZIP/JSON project schema, `artworkMaterial`, scene extras serialization, camera history, A/B/C visual variants, or MASTER snapshots. The current local-storage UI preferences are not included in portable project ZIPs; sending a ZIP to another machine gives it that machine's own preferred layout.
- Added `studio/workspace-ux.js` (pure batch geometry, favorite whitelist, symbolic preview classification) and `tests/studio-v3.9-workspace.test.cjs`. Tests include X/Z positioning by min/center/max, equal gap, locked/missing object rejection, bookmark safety, input validation, local-only state, stable DOM IDs and unchanged MASTER/project schema. **17/17 isolated JavaScript regression cases passed** during implementation.
- Expanded the GitHub validation workflow to syntax-check v3.7–v3.9 modules and run v3.7, v3.8 and v3.9 test suites. The old v3.7 suite now checks a generic v3.x Studio label, not the release's old exact version.
- This is a **free static browser UI update**, not shared cloud saving or account login. Actual desktop Chrome/Edge pointer interactions, layout on small screens and real imported model alignment should be smoke-tested with source assets before field deployment.
