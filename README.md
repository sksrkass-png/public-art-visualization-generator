# PUBLIC ART VISUALIZATION — Prompt Generator

건축물 미술작품 공모를 위한 작품 × 설치 공간 시안 생성 프롬프트 도구.

A lightweight, static, Korean-first web tool that generates structured, copy-paste-ready image-generation prompts for **public art competition visualizations**. Built for curators, planners, and public-art proposal teams who need consistent, locked-down prompt packages for ChatGPT / image generation workflows.

No backend, no build step, no API keys — pure HTML/CSS/JavaScript, deployable directly to GitHub Pages. ⓒ AXOO CORP. — designed as an extension of the AXOO creative portfolio: black-and-white editorial palette, large display typography, sharp (unrounded) grid, generous whitespace, Pretendard typeface. Hierarchy comes from type scale and spacing, not color — the interface is meant to read as a premium creative studio tool, not a configuration dashboard.

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
- **Export** the full prompt package as `.txt` or `.json`; **local history** (browser `localStorage`, last 20 generations).

Everything runs client-side. Nothing is uploaded anywhere; history and drafts live only in your browser's local storage.

## How to Use

1. **① 프로젝트 & 작품** — 프로젝트명, 작품명(필수) + 작가명, 공모명, 작품 규격(W·D·H·재료·컬러·기단)을 입력합니다. 설명/의도는 선택 사항입니다.
2. **② 설치 공간** — 공간 유형과 설치 위치를 정하면 추천 배너가 나타납니다. 원하면 **추천 적용**을 눌러 카메라 구도·보존 수준·인물 스케일을 한 번에 채웁니다. 현장 레퍼런스 유형과 시간대, 미착공 현장 여부를 정합니다.
3. **③ 스타일** — **공간 보존 수준**(최소/보통/최대)을 고르고, 리얼리즘과 인물 스케일을 정합니다. 전문가 모드에서는 개별 고정 항목을 직접 조정할 수 있습니다.
4. **④ Prompt 생성** — 촬영 구도를 선택하고 **💭 프롬프트 생성**을 누릅니다.
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
│   ├── style.css        # Design tokens + components (cream/white/lime-green system, wizard/preset/tooltip UI)
│   └── app.js            # Prompt engine (unchanged) + wizard/mode/preset/recommendation UI layer
└── README.md
```

## Deployment (GitHub Pages)

1. Push this repository to GitHub (see commands below if the repo doesn't exist yet).
2. In the repository, go to **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to `Deploy from a branch`.
4. Select branch `main` and folder `/ (root)`, then Save.
5. GitHub will publish the site at `https://sksrkass-png.github.io/public-art-visualization-generator/`.

No build step, no GitHub Actions workflow required — this is a static site served as-is.

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

- Import a previously exported `.json` package back into the form.
- Per-project saved presets (e.g. save a site's lock configuration for reuse across multiple artwork proposals).
- Batch shot selection presets tailored to specific competition submission requirements.
- Optional side-by-side Korean translation of the generated English prompt for internal review.
