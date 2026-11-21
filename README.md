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
