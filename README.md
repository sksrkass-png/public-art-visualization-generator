# PUBLIC ART VISUALIZATION — Prompt Generator

A lightweight, static web tool that generates structured, copy-paste-ready image-generation prompts for **public art competition visualizations**. Built for curators, planners, and public-art proposal teams who need consistent, locked-down prompt packages for tools like ChatGPT / image generation workflows.

No backend, no build step, no API keys — pure HTML/CSS/JavaScript, deployable directly to GitHub Pages.

## Purpose

Public art competition visualizations need to satisfy a specific, non-negotiable constraint that generic AI art prompts don't handle: **the site must stay the site, and the artwork must stay the artwork** — only the camera should change between shots. This tool encodes that workflow directly into the prompt structure:

**SITE LOCK + ARTWORK LOCK + SCALE LOCK + CAMERA VARIATION**

Instead of writing each camera-angle prompt from scratch (and risking the AI silently redesigning the artwork or moving the building), you fill in the project/site/artwork details once, set your lock preferences, and generate a full prompt package in one pass.

## Feature Overview

- **Structured input form** across five sections: Project/Site, Artwork, Artwork Lock, Visualization, and Master Reference Mode.
- **Master View Workflow** — generates a Master Prompt (full project brief), a Master View Prompt (first approved image), and a Master Lock Instruction (anchor text for every later shot), so all shots stay visually consistent.
- **Shot-by-shot prompts** for up to 12 camera angles: Main Perspective, Eye Level, Left 3/4, Right 3/4, Rear, Aerial, Long Shot, Close-up, plus optional technical views (Front/Rear Orthographic, Left/Right Elevation).
- **Automatic lock language** — STRICT / STANDARD / FLEXIBLE artwork lock levels insert progressively stronger preservation instructions; individual preserve toggles (geometry, proportion, color, material, component count, orientation, base, inner detail) add targeted clauses.
- **Site protection language** — Site/Landscape/Building preserve toggles automatically protect massing, paving, planting, fountains, and circulation paths in every generated prompt.
- **Reference-insufficiency warnings** — Rear, Left/Right 3/4, and all technical (orthographic/elevation) shots automatically display a caution that AI-generated results should be treated as presentation-only, not fabrication drawings.
- **Copy buttons** on every individual output card, plus **Copy All**.
- **Export** the full prompt package as `.txt` or `.json`.
- **Local history** (browser `localStorage`, last 20 generations) — reload or delete past generations without re-typing the form.
- **Sample data** button to see a fully filled example instantly.
- **Reset** clears the form and output back to a blank slate.

Everything runs client-side. Nothing is uploaded anywhere; history and drafts live only in your browser's local storage.

## How to Use

1. **Fill in Project / Site info** — project name, competition, artist, artwork name, site type, installation position, site reference type, time of day, and which parts of the site must stay untouched (site / landscape / building preserve).
2. **Fill in Artwork info** — dimensions (W × D × H in mm), material, main colors, base/pedestal, description, and installation intent.
3. **Choose Lock settings** — pick a Lock Level (STRICT / STANDARD / FLEXIBLE) and toggle which specific attributes must be preserved.
4. **Configure Visualization** — output ratio, human scale figures, realism level, sculpture dominance, and lighting style.
5. **Select output shots** — check the camera angles you need (quick buttons: Standard Set / All / None).
6. **Enable Master Reference Mode** (recommended) — keeps every shot anchored to one approved master image.
7. Click **Generate Prompts**.
8. Copy the **Master Prompt** into your image generation tool first, review the result, then send the **Master View Prompt** to create your anchor image.
9. Once you approve the master image, prepend the **Master Lock Instruction** to each **Shot Prompt** and generate your angle variations.

### Suggested workflow with ChatGPT / image tools

1. Fill in site and artwork info
2. Choose lock settings
3. Select output shots
4. Generate master prompt
5. Create master image in ChatGPT (or your image tool of choice)
6. Approve the master view
7. Use shot prompts (with the Master Lock Instruction) for angle variations

## File Structure

```
/
├── index.html          # Page structure: form + output panel
├── assets/
│   ├── style.css        # All styling (monochrome, card-based, responsive)
│   └── app.js            # Form state, prompt-building logic, output rendering, history
└── README.md
```

## Deployment (GitHub Pages)

1. Push this repository to GitHub (see commands below if the repo doesn't exist yet).
2. In the repository, go to **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to `Deploy from a branch`.
4. Select branch `main` and folder `/ (root)`, then Save.
5. GitHub will publish the site at `https://<your-username>.github.io/public-art-visualization-generator/`.

No build step, no GitHub Actions workflow required — this is a static site served as-is.

### Git commands (if the GitHub repo hasn't been created yet)

```bash
gh repo create public-art-visualization-generator --public --source=. --remote=origin --push
```

Or manually:

```bash
git remote add origin https://github.com/<your-username>/public-art-visualization-generator.git
git branch -M main
git push -u origin main
```

## Limitations

- Prompt text is generated from templates and simple conditional logic — it does not call any AI model itself. Quality of the final image still depends entirely on the image-generation tool you paste the prompt into.
- Rear, side (Left/Right 3/4), and all technical/orthographic views are inherently limited when only front-facing reference material is available — the tool surfaces a warning, but cannot fabricate missing reference geometry.
- History and drafts are stored in browser `localStorage` only: clearing browser data, using a different browser, or a different device will not carry history over. Use **Export .json** for anything you need to keep long-term or share with teammates.
- No authentication, multi-user sync, or cloud storage — this is a single-user local tool by design.

## Future Roadmap

- Optional Korean-language labels/notes alongside the English prompt output for internal team review.
- Import a previously exported `.json` package back into the form.
- Per-project saved presets (e.g. save a site's lock configuration for reuse across multiple artwork proposals).
- Batch shot selection presets tailored to specific competition submission requirements.
