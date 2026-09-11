/* ==========================================================================
   PUBLIC ART VISUALIZATION — Prompt Generator
   Static, client-side only. No build step, no dependencies, no API keys.
   ========================================================================== */

(function () {
  "use strict";

  var STORAGE_KEY_HISTORY = "pavpg.history.v1";
  var MAX_HISTORY = 20;

  var TECHNICAL_SHOTS = ["Front Orthographic", "Rear Orthographic", "Left Elevation", "Right Elevation"];
  var LIMITED_REFERENCE_SHOTS = ["Rear", "Left 3/4", "Right 3/4"].concat(TECHNICAL_SHOTS);

  var CAMERA_DIRECTIVES = {
    "Main Perspective": "Primary three-quarter perspective view showing the artwork within its full site context. This view should match the framing and composition of the approved master view.",
    "Eye Level": "Eye-level human perspective, camera height approximately 1.6 m, standing viewpoint at pedestrian eye level facing the artwork.",
    "Left 3/4": "Three-quarter view from the front-left side of the artwork, camera rotated approximately 45 degrees to the left of the main perspective.",
    "Right 3/4": "Three-quarter view from the front-right side of the artwork, camera rotated approximately 45 degrees to the right of the main perspective.",
    "Rear": "View from directly behind the artwork, opposite the main façade, showing the rear of the installation within the site.",
    "Aerial": "Bird's-eye aerial view looking down at the site and artwork, showing overall placement, scale, and relationship to surrounding paths and landscape.",
    "Long Shot": "Wide, long-distance shot showing the artwork within the broader site and surrounding architectural context, emphasizing scale relative to the environment.",
    "Close-up": "Close-up detail shot emphasizing the artwork's surface, material finish, texture, and craftsmanship.",
    "Front Orthographic": "Flat orthographic front elevation. No perspective distortion, no vanishing points. Technical presentation style, elevation drawing composition.",
    "Rear Orthographic": "Flat orthographic rear elevation. No perspective distortion, no vanishing points. Technical presentation style, elevation drawing composition.",
    "Left Elevation": "Flat orthographic left-side elevation. No perspective distortion, no vanishing points. Technical presentation style, elevation drawing composition.",
    "Right Elevation": "Flat orthographic right-side elevation. No perspective distortion, no vanishing points. Technical presentation style, elevation drawing composition."
  };

  var STANDARD_SHOT_SET = ["Main Perspective", "Eye Level", "Left 3/4", "Right 3/4", "Long Shot", "Close-up"];
  var ALL_SHOTS = Object.keys(CAMERA_DIRECTIVES);

  var LOCK_LEVEL_TEXT = {
    STRICT: "Lock level: STRICT. Do not redesign, simplify, reinterpret, add, remove, or recolor any part of the artwork. Treat the artwork's form, material, and color exactly as specified and as shown in reference images.",
    STANDARD: "Lock level: STANDARD. Keep the artwork's core design, proportions, and materials consistent with the reference. Minor rendering-level interpretation is acceptable, but the artwork must remain clearly recognizable as the same piece.",
    FLEXIBLE: "Lock level: FLEXIBLE. Maintain the general concept, silhouette, and character of the artwork while allowing minor stylistic adaptation for rendering quality."
  };

  var PRESERVE_CLAUSES = {
    preserveGeometry: "preserve the artwork's exact geometry and structural form",
    preserveProportion: "maintain the original width-depth-height proportions without stretching or resizing",
    preserveColor: "keep the original color palette unchanged",
    preserveMaterial: "retain the specified material, surface finish, and reflectivity",
    preserveComponentCount: "do not add, remove, merge, or duplicate any structural components",
    preserveOrientation: "maintain the artwork's fixed orientation and installation position within the site",
    preserveBase: "preserve the base/pedestal design, height, and footprint as specified",
    preserveInnerDetail: "retain inner surface details, seams, and textures as specified"
  };

  var HUMAN_SCALE_TEXT = {
    "None": "Do not include any human figures in the scene.",
    "Minimal": "Include only a small number of subtle human figures placed for scale reference; they should not be the focus of the composition.",
    "Natural": "Include naturally placed pedestrians at realistic human scale, behaving naturally within the space, to help convey the artwork's true size.",
    "Active Community": "Include multiple people actively using and engaging with the space (walking, sitting, gathering) to convey a lively, in-use public environment and clear human-scale reference."
  };

  var REALISM_TEXT = {
    "Conceptual": "Conceptual visualization style: clean, simplified, diagrammatic rendering suitable for early-stage design communication.",
    "Architectural Visualization": "Architectural visualization (arch-viz) style: polished 3D rendering quality, realistic materials and lighting, competition-presentation grade.",
    "Photoreal": "Photorealistic rendering style: indistinguishable from a real photograph, accurate physical lighting, lens characteristics, and material response."
  };

  var DOMINANCE_TEXT = {
    "Context": "The artwork should read as part of the site composition, with the surrounding context (landscape, architecture, people) given comparable visual weight.",
    "Balanced": "Balance the visual weight of the artwork and its site context so neither dominates the frame.",
    "Hero": "The artwork should be the clear visual hero of the composition, prominently framed and emphasized over the surrounding context."
  };

  var LIGHTING_TEXT = {
    "Neutral": "Neutral, even lighting with minimal dramatic shadow.",
    "Warm Daylight": "Warm daylight lighting, soft golden-hour warmth without full sunset color.",
    "Soft Overcast": "Soft, diffused overcast daylight with minimal hard shadows.",
    "Dramatic Sunset": "Dramatic sunset lighting with strong warm color temperature and long shadows.",
    "Night Lighting": "Night lighting scenario with artificial site and artwork lighting, accent lighting on the artwork, and ambient dusk/night sky."
  };

  var SITE_TYPE_LABEL = {}; // pass-through, values are already display-ready

  // ---------------------------------------------------------------------
  // Form state
  // ---------------------------------------------------------------------

  var form = document.getElementById("prompt-form");

  function getFormState() {
    var fd = new FormData(form);
    var state = {};
    fd.forEach(function (value, key) {
      if (key === "shot") return; // handled separately (multi-value)
      state[key] = value;
    });
    // checkboxes not present in FormData when unchecked — normalize booleans
    ["sitePreserve", "landscapePreserve", "buildingPreserve", "useMasterWorkflow",
      "preserveGeometry", "preserveProportion", "preserveColor", "preserveMaterial",
      "preserveComponentCount", "preserveOrientation", "preserveBase", "preserveInnerDetail"
    ].forEach(function (name) {
      var el = form.elements[name];
      state[name] = !!(el && el.checked);
    });
    state.shots = fd.getAll("shot");
    return state;
  }

  // ---------------------------------------------------------------------
  // Prompt text builders
  // ---------------------------------------------------------------------

  function dimsText(state) {
    var parts = [];
    if (state.artworkWidth) parts.push("W " + state.artworkWidth + "mm");
    if (state.artworkDepth) parts.push("D " + state.artworkDepth + "mm");
    if (state.artworkHeight) parts.push("H " + state.artworkHeight + "mm");
    return parts.length ? parts.join(" x ") : "dimensions not specified";
  }

  function siteLockText(state) {
    var lines = [];
    lines.push("Site: a " + (state.siteType || "public") + " setting" +
      (state.installationPosition ? ", with the artwork installed at " + state.installationPosition : "") + ".");
    lines.push("Site reference type: " + (state.siteReferenceType || "Mixed") + ". Time of day: " + (state.timeOfDay || "Day") + ".");

    var protect = [];
    if (state.buildingPreserve) protect.push("building massing and façade");
    if (state.landscapePreserve) protect.push("planting, paving, and fountain/water features");
    if (state.sitePreserve) protect.push("circulation paths and overall spatial structure");

    if (protect.length) {
      lines.push("Site lock: keep the existing site exactly as referenced. Do not alter, redesign, or omit the " +
        protect.join("; ") + ". Only the artwork and camera angle may change between shots.");
    } else {
      lines.push("Site lock: keep the existing site consistent across all generated views.");
    }
    return lines.join(" ");
  }

  function artworkText(state) {
    var lines = [];
    lines.push("Artwork \"" + (state.artworkName || "Untitled Artwork") + "\" by " + (state.artistName || "the artist") +
      ", dimensions " + dimsText(state) + ".");
    lines.push("Material: " + (state.material || "not specified") +
      (state.mainColors ? ", main colors: " + state.mainColors : "") + ".");
    lines.push("Base/pedestal: " + (state.basePedestal || "Unknown") + ".");
    if (state.artworkDescription) lines.push("Description: " + state.artworkDescription);
    if (state.installationMessage) lines.push("Intent/message: " + state.installationMessage);
    return lines.join(" ");
  }

  function artworkLockText(state) {
    var lines = [];
    lines.push(LOCK_LEVEL_TEXT[state.lockLevel] || LOCK_LEVEL_TEXT.STANDARD);
    var clauses = [];
    Object.keys(PRESERVE_CLAUSES).forEach(function (key) {
      if (state[key]) clauses.push(PRESERVE_CLAUSES[key]);
    });
    if (clauses.length) {
      lines.push("Additionally: " + capitalize(clauses.join("; ")) + ".");
    }
    lines.push("Scale lock: the artwork must always read at its true specified scale (" + dimsText(state) +
      ") relative to the site and any human figures present. Do not enlarge, shrink, or otherwise misrepresent scale between shots.");
    return lines.join(" ");
  }

  function visualizationText(state) {
    var lines = [];
    lines.push(REALISM_TEXT[state.realismLevel] || REALISM_TEXT["Architectural Visualization"]);
    lines.push(DOMINANCE_TEXT[state.sculptureDominance] || DOMINANCE_TEXT.Balanced);
    lines.push(LIGHTING_TEXT[state.lightingStyle] || LIGHTING_TEXT.Neutral);
    lines.push(HUMAN_SCALE_TEXT[state.humanScale] || HUMAN_SCALE_TEXT.None);
    lines.push("Output aspect ratio: " + (state.outputRatio || "4:3") + ".");
    return lines.join(" ");
  }

  function capitalize(s) {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  function buildMasterPrompt(state) {
    var lines = [];
    lines.push("ROLE: You are an architectural visualization artist producing a competition-grade public art rendering.");
    lines.push("OBJECTIVE: Generate a single master reference image that will anchor all subsequent camera-angle variations for this project. This is the foundational image — get the site, artwork, and mood right before any other view is produced.");
    lines.push("");
    lines.push("PROJECT: " + (state.projectName || "Untitled Project") +
      (state.competitionName ? " — " + state.competitionName : "") + ".");
    lines.push("");
    lines.push("SITE: " + siteLockText(state));
    lines.push("");
    lines.push("ARTWORK: " + artworkText(state));
    lines.push("");
    lines.push("PRESERVATION RULES: " + artworkLockText(state));
    lines.push("");
    lines.push("VISUALIZATION TONE: " + visualizationText(state));
    return lines.join("\n");
  }

  function buildMasterViewPrompt(state) {
    var lines = [];
    lines.push("Generate the MASTER VIEW image for this public art installation — the primary approved composition that all later shots will be derived from.");
    lines.push("");
    lines.push(CAMERA_DIRECTIVES["Main Perspective"]);
    lines.push("");
    lines.push("SITE: " + siteLockText(state));
    lines.push("ARTWORK: " + artworkText(state));
    lines.push("LOCK: " + artworkLockText(state));
    lines.push("STYLE: " + visualizationText(state));
    lines.push("");
    lines.push("This image will be reviewed and approved as the reference anchor. Prioritize correctness of site layout, artwork geometry, and scale over stylistic flourish.");
    return lines.join("\n");
  }

  function buildMasterLockInstruction(state) {
    var lines = [];
    lines.push("MASTER LOCK INSTRUCTION — apply this to every subsequent generation in this project:");
    lines.push("");
    lines.push("1. Use the approved master view image as the visual anchor for site, artwork design, and materials.");
    lines.push("2. Do not redesign, restyle, or reinterpret the artwork. " + (LOCK_LEVEL_TEXT[state.lockLevel] || LOCK_LEVEL_TEXT.STANDARD));
    lines.push("3. Keep the installation position and orientation fixed exactly as shown in the master view.");
    lines.push("4. Keep the site, landscape, and building context consistent with the master view.");
    lines.push("5. Only the camera angle, distance, and framing may change between shots. All other elements must remain locked.");
    return lines.join("\n");
  }

  function buildShotPrompt(state, shotName) {
    var lines = [];
    lines.push("SHOT: " + shotName);
    lines.push("");
    lines.push(CAMERA_DIRECTIVES[shotName] || "Camera direction not defined for this shot.");
    lines.push("");
    if (state.useMasterWorkflow) {
      lines.push("Use the approved master view image as the anchor. Do not redesign the artwork or move its installation position — change only the camera angle as described above.");
      lines.push("");
    }
    lines.push("SITE LOCK: " + siteLockText(state));
    lines.push("ARTWORK LOCK: " + artworkLockText(state));
    lines.push("VISUALIZATION STYLE: " + visualizationText(state));
    return lines.join("\n");
  }

  function shotWarning(shotName) {
    if (LIMITED_REFERENCE_SHOTS.indexOf(shotName) === -1) return null;
    if (TECHNICAL_SHOTS.indexOf(shotName) !== -1) {
      return "Warning: side/rear reference is insufficient. AI-generated technical views should be treated as presentation-only, not fabrication drawings.";
    }
    return "Warning: side/rear reference is insufficient. Treat this view as a presentation estimate rather than a verified accurate depiction.";
  }

  // ---------------------------------------------------------------------
  // Output rendering
  // ---------------------------------------------------------------------

  var currentOutputs = []; // [{ id, title, body, warning }]

  function generate() {
    var state = getFormState();
    currentOutputs = [];

    if (state.useMasterWorkflow) {
      currentOutputs.push({ id: "master", title: "Master Prompt", body: buildMasterPrompt(state) });
      currentOutputs.push({ id: "master-view", title: "Master View Prompt", body: buildMasterViewPrompt(state) });
      currentOutputs.push({ id: "master-lock", title: "Master Lock Instruction", body: buildMasterLockInstruction(state) });
    }

    var shots = state.shots.length ? state.shots : [];
    shots.forEach(function (shot, i) {
      currentOutputs.push({
        id: "shot-" + i,
        title: "Shot: " + shot,
        body: buildShotPrompt(state, shot),
        warning: shotWarning(shot)
      });
    });

    if (!currentOutputs.length) {
      showToast("Select at least one output shot, or enable Master View Workflow.");
      return;
    }

    renderOutputs();
    saveToHistory(state, currentOutputs);
    showToast("Prompts generated.");
  }

  function renderOutputs() {
    var list = document.getElementById("output-list");
    var empty = document.getElementById("output-empty");
    list.innerHTML = "";

    currentOutputs.forEach(function (item) {
      var card = document.createElement("div");
      card.className = "output-card";

      var header = document.createElement("div");
      header.className = "output-card__header";

      var title = document.createElement("span");
      title.className = "output-card__title";
      title.textContent = item.title;

      var copyBtn = document.createElement("button");
      copyBtn.type = "button";
      copyBtn.className = "btn btn--ghost btn--small";
      copyBtn.textContent = "Copy";
      copyBtn.addEventListener("click", function () {
        copyText(item.body);
        showToast(item.title + " copied.");
      });

      header.appendChild(title);
      header.appendChild(copyBtn);

      var body = document.createElement("div");
      body.className = "output-card__body";
      body.textContent = item.body;

      card.appendChild(header);
      card.appendChild(body);

      if (item.warning) {
        var warn = document.createElement("div");
        warn.className = "output-card__warning";
        warn.textContent = item.warning;
        card.appendChild(warn);
      }

      list.appendChild(card);
    });

    empty.hidden = true;
    list.hidden = false;

    ["btn-copy-all", "btn-export-txt", "btn-export-json", "btn-clear-output"].forEach(function (id) {
      document.getElementById(id).disabled = false;
    });
  }

  function clearOutput() {
    currentOutputs = [];
    document.getElementById("output-list").innerHTML = "";
    document.getElementById("output-list").hidden = true;
    document.getElementById("output-empty").hidden = false;
    ["btn-copy-all", "btn-export-txt", "btn-export-json", "btn-clear-output"].forEach(function (id) {
      document.getElementById(id).disabled = true;
    });
  }

  function copyAll() {
    var text = currentOutputs.map(function (o) {
      return "=== " + o.title + " ===\n" + o.body + (o.warning ? "\n\n[" + o.warning + "]" : "");
    }).join("\n\n");
    copyText(text);
    showToast("All prompts copied.");
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).catch(function () { fallbackCopy(text); });
    } else {
      fallbackCopy(text);
    }
  }

  function fallbackCopy(text) {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); } catch (e) { /* no-op */ }
    document.body.removeChild(ta);
  }

  function triggerDownload(filename, content, mime) {
    var blob = new Blob([content], { type: mime });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function exportTxt() {
    var text = currentOutputs.map(function (o) {
      return "=== " + o.title + " ===\n" + o.body + (o.warning ? "\n\n[" + o.warning + "]" : "");
    }).join("\n\n");
    triggerDownload(exportFilename() + ".txt", text, "text/plain");
  }

  function exportJson() {
    var payload = {
      generatedAt: new Date().toISOString(),
      formState: getFormState(),
      outputs: currentOutputs
    };
    triggerDownload(exportFilename() + ".json", JSON.stringify(payload, null, 2), "application/json");
  }

  function exportFilename() {
    var state = getFormState();
    var base = (state.projectName || state.artworkName || "public-art-prompts")
      .toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    return (base || "public-art-prompts") + "-" + Date.now();
  }

  // ---------------------------------------------------------------------
  // History (localStorage)
  // ---------------------------------------------------------------------

  function loadHistory() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY_HISTORY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function saveToHistory(state, outputs) {
    var history = loadHistory();
    history.unshift({
      id: "h-" + Date.now(),
      time: new Date().toISOString(),
      title: state.projectName || state.artworkName || "Untitled",
      formState: state,
      outputs: outputs
    });
    history = history.slice(0, MAX_HISTORY);
    try {
      localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(history));
    } catch (e) { /* storage unavailable — ignore */ }
    renderHistory();
  }

  function renderHistory() {
    var list = document.getElementById("history-list");
    var history = loadHistory();
    list.innerHTML = "";

    if (!history.length) {
      var li = document.createElement("li");
      li.className = "history-empty";
      li.textContent = "No saved generations yet.";
      list.appendChild(li);
      return;
    }

    history.forEach(function (entry) {
      var li = document.createElement("li");
      li.className = "history-item";

      var meta = document.createElement("div");
      meta.className = "history-item__meta";
      var title = document.createElement("span");
      title.className = "history-item__title";
      title.textContent = entry.title;
      var time = document.createElement("span");
      time.className = "history-item__time";
      time.textContent = new Date(entry.time).toLocaleString();
      meta.appendChild(title);
      meta.appendChild(time);

      var actions = document.createElement("div");
      actions.className = "history-item__actions";

      var loadBtn = document.createElement("button");
      loadBtn.type = "button";
      loadBtn.className = "btn btn--ghost btn--small";
      loadBtn.textContent = "Load";
      loadBtn.addEventListener("click", function () {
        applyFormState(entry.formState);
        currentOutputs = entry.outputs;
        renderOutputs();
        showToast("Loaded from history.");
      });

      var delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "btn btn--ghost btn--small";
      delBtn.textContent = "Delete";
      delBtn.addEventListener("click", function () {
        var updated = loadHistory().filter(function (h) { return h.id !== entry.id; });
        localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(updated));
        renderHistory();
      });

      actions.appendChild(loadBtn);
      actions.appendChild(delBtn);

      li.appendChild(meta);
      li.appendChild(actions);
      list.appendChild(li);
    });
  }

  function clearHistory() {
    localStorage.removeItem(STORAGE_KEY_HISTORY);
    renderHistory();
  }

  // ---------------------------------------------------------------------
  // Form state apply / reset / sample
  // ---------------------------------------------------------------------

  function applyFormState(state) {
    Object.keys(state).forEach(function (key) {
      if (key === "shots") return;
      var el = form.elements[key];
      if (!el) return;
      if (el.type === "checkbox") {
        el.checked = !!state[key];
      } else {
        el.value = state[key];
      }
    });
    var shotEls = form.querySelectorAll('input[name="shot"]');
    shotEls.forEach(function (el) {
      el.checked = (state.shots || []).indexOf(el.value) !== -1;
    });
  }

  var SAMPLE_STATE = {
    projectName: "Hangang Cinepolis Waterfront Plaza",
    competitionName: "2026 Public Art Design Competition",
    artistName: "Jane Doe",
    artworkName: "Rising Wave",
    siteType: "Plaza",
    installationPosition: "central plaza axis, facing the main pedestrian entrance",
    siteReferenceType: "Architectural Rendering",
    timeOfDay: "Day",
    sitePreserve: true,
    landscapePreserve: true,
    buildingPreserve: true,
    artworkWidth: "3000",
    artworkDepth: "2000",
    artworkHeight: "4500",
    material: "Mirror Stainless",
    mainColors: "polished mirror silver with subtle blue reflection",
    basePedestal: "Yes",
    artworkDescription: "A dynamic sweeping wave form rising from a low circular base, with a continuous twisting ribbon-like surface.",
    installationMessage: "Symbolizes the flow of the river and the energy of the community gathering along the waterfront.",
    lockLevel: "STANDARD",
    preserveGeometry: true,
    preserveProportion: true,
    preserveColor: true,
    preserveMaterial: true,
    preserveComponentCount: true,
    preserveOrientation: true,
    preserveBase: false,
    preserveInnerDetail: false,
    outputRatio: "16:9",
    humanScale: "Natural",
    realismLevel: "Architectural Visualization",
    sculptureDominance: "Balanced",
    lightingStyle: "Warm Daylight",
    useMasterWorkflow: true,
    shots: ["Main Perspective", "Eye Level", "Left 3/4", "Right 3/4", "Long Shot", "Close-up"]
  };

  function loadSample() {
    applyFormState(SAMPLE_STATE);
    showToast("Sample data loaded.");
  }

  function resetForm() {
    form.reset();
    clearOutput();
    showToast("Form reset.");
  }

  // ---------------------------------------------------------------------
  // Misc UI helpers
  // ---------------------------------------------------------------------

  var toastTimer = null;
  function showToast(message) {
    var toast = document.getElementById("toast");
    toast.textContent = message;
    toast.hidden = false;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toast.hidden = true; }, 2200);
  }

  function selectShots(mode) {
    var shotEls = form.querySelectorAll('input[name="shot"]');
    shotEls.forEach(function (el) {
      if (mode === "all") el.checked = true;
      else if (mode === "none") el.checked = false;
      else el.checked = STANDARD_SHOT_SET.indexOf(el.value) !== -1;
    });
  }

  // ---------------------------------------------------------------------
  // Wiring
  // ---------------------------------------------------------------------

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    generate();
  });

  document.getElementById("btn-reset").addEventListener("click", resetForm);
  document.getElementById("btn-load-sample").addEventListener("click", loadSample);
  document.getElementById("btn-copy-all").addEventListener("click", copyAll);
  document.getElementById("btn-export-txt").addEventListener("click", exportTxt);
  document.getElementById("btn-export-json").addEventListener("click", exportJson);
  document.getElementById("btn-clear-output").addEventListener("click", clearOutput);
  document.getElementById("btn-clear-history").addEventListener("click", clearHistory);

  document.querySelectorAll("[data-select-shots]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      selectShots(btn.getAttribute("data-select-shots"));
    });
  });

  renderHistory();
})();
