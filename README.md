# PUBLIC ART VISUALIZATION — Prompt Generator

건축물 미술작품 공모를 위한 작품 × 설치 공간 시안 생성 프롬프트 도구.

A lightweight, static, Korean-first web tool that generates structured, copy-paste-ready image-generation prompts for **public art competition visualizations**. Built for curators, planners, and public-art proposal teams who need consistent, locked-down prompt packages for ChatGPT / image generation workflows.

No backend, no build step, no API keys — pure HTML/CSS/JavaScript, deployable directly to GitHub Pages. Design system shared with [Artist Visual Extension Prompt Generator](https://sksrkass-png.github.io/sksrkass.github.io/) (ⓒ AXOO CORP.) — cream background, white 26px-radius cards, lime-green (`#38D430`) accent, Pretendard typography.

## Purpose

Public art competition visualizations need to satisfy a specific, non-negotiable constraint that generic AI art prompts don't handle: **the site must stay the site, and the artwork must stay the artwork** — only the camera should change between shots. This tool encodes that workflow directly into the prompt structure:

**SITE LOCK + ARTWORK LOCK + SCALE LOCK + CAMERA VARIATION**

Instead of writing each camera-angle prompt from scratch (and risking the AI silently redesigning the artwork or moving the building), you fill in the project/site/artwork details once, set your lock preferences, and generate a full prompt package in one pass — always anchored to a MASTER → MASTER LOCK → SHOT workflow.

## Feature Overview

- **Korean-first input form** across four sections (A–D): 프로젝트/설치 공간, 작품 정보, 작품/공간 고정 규칙, 시안 출력. Field labels lead in Korean with the English term as a small secondary caption.
- **Always-on Master Workflow** — every generation produces a MASTER PROMPT (project brief), MASTER VIEW (first approved image prompt, highlighted with a green border and STEP 01 badge), and MASTER LOCK (STEP 02 anchor instruction), followed by numbered shot prompts (STEP 03).
- **Shot-by-shot prompts** for up to 12 camera angles: Main Perspective, Eye Level, Left 3/4, Right 3/4, Rear, Aerial, Long Shot, Close-up, plus optional technical views (Front/Rear Orthographic, Left/Right Elevation) — all 8 base shots checked by default.
- **Automatic lock language** — STRICT / STANDARD / FLEXIBLE artwork lock levels insert progressively stronger preservation instructions; individual preserve checkboxes (형태/비율/컬러/재료/구성요소 수/방향/기단/내부 디테일) add targeted clauses.
- **Site lock language** — 건축물 / 조경 / 바닥·포장 / 동선 유지 checkboxes automatically protect massing, paving, planting, and circulation paths in every generated prompt.
- **Reference-insufficiency warnings** — Rear, Left/Right 3/4, and all technical (orthographic/elevation) shots automatically display a Korean caution that AI-generated results should be treated as presentation-only, not fabrication drawings.
- **Numbered output cards** (00, 01, 02…) each with a short Korean description, the full English prompt in a dark code block, and its own COPY button — plus **COPY ALL** at the top of the results column.
- **Export** the full prompt package as `.txt` or `.json`.
- **Local history** (browser `localStorage`, last 20 generations) — reload or delete past generations without re-typing the form.
- **샘플 불러오기** (sample data) link for instant demoing/QA.
- **초기화** (reset) clears the form and output back to a blank slate.

Everything runs client-side. Nothing is uploaded anywhere; history and drafts live only in your browser's local storage.

## How to Use

1. **A. 프로젝트 / 설치 공간** — 프로젝트명, 공모명, 작가명, 작품명, 공간 유형, 설치 위치, 현장 레퍼런스 유형, 시간대를 입력합니다.
2. **B. 작품 정보** — 가로(W) × 깊이(D) × 높이(H, mm), 재료, 주요 컬러, 기단 여부, 작품 설명, 설치 의도를 입력합니다.
3. **C. 작품 / 공간 고정 규칙** — ARTWORK LOCK LEVEL(STRICT/STANDARD/FLEXIBLE)을 정하고, 작품 고정 항목과 공간 고정(SITE LOCK) 항목을 체크합니다.
4. **D. 시안 출력** — 이미지 비율, 리얼리즘, 인물 스케일을 정하고 촬영 각도(SHOT SELECT)를 선택합니다.
5. **💭 시안 프롬프트 생성**을 누릅니다.
6. **E. 생성 결과**에서 `00 MASTER PROMPT`를 먼저 이미지 생성 도구에 붙여 넣어 전체 컨셉을 검토합니다.
7. `01 MASTER VIEW` 프롬프트로 대표 이미지를 생성하고 승인합니다.
8. 승인된 MASTER 이미지를 첨부한 채로 `02 MASTER LOCK` 지침과 각 `03 SHOT` 프롬프트를 함께 사용해 각도별 이미지를 생성합니다.

### Suggested workflow with ChatGPT / image tools

1. 작품 정보와 설치 공간 정보를 입력합니다.
2. 작품 / 공간 고정 규칙을 설정합니다.
3. MASTER VIEW를 먼저 생성합니다.
4. 승인된 MASTER를 기준으로 각도별 Prompt를 사용합니다.

## File Structure

```
/
├── index.html          # Page structure: hero + sticky sidebar form + output panel
├── assets/
│   ├── style.css        # Design tokens + components (cream/white/lime-green system)
│   └── app.js            # Form state, prompt-building logic, output rendering, history
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
