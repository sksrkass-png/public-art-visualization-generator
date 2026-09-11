/* ==========================================================================
   PUBLIC ART VISUALIZATION — Prompt Generator
   Static, client-side only. No build step, no dependencies, no API keys.
   ========================================================================== */

(function () {
  "use strict";

  var STORAGE_KEY_HISTORY = "pavpg.history.v2";
  var MAX_HISTORY = 20;

  var TECHNICAL_SHOTS = ["Front Orthographic", "Rear Orthographic", "Left Elevation", "Right Elevation"];
  var LIMITED_REFERENCE_SHOTS = ["Rear", "Left 3/4", "Right 3/4"].concat(TECHNICAL_SHOTS);

  var ALL_SHOTS = [
    "Main Perspective", "Eye Level", "Left 3/4", "Right 3/4", "Rear", "Aerial", "Long Shot", "Close-up",
    "Front Orthographic", "Rear Orthographic", "Left Elevation", "Right Elevation"
  ];
  var STANDARD_SHOT_SET = ["Main Perspective", "Eye Level", "Left 3/4", "Right 3/4", "Rear", "Aerial", "Long Shot", "Close-up"];

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

  var SHOT_DESC_KO = {
    "Main Perspective": "마스터 뷰와 동일한 구도로, 작품과 공간을 함께 보여주는 대표 퍼스펙티브 샷입니다.",
    "Eye Level": "보행자의 눈높이(약 1.6m)에서 바라본 시점 샷입니다.",
    "Left 3/4": "작품 왼쪽 45도 방향에서 바라본 샷입니다.",
    "Right 3/4": "작품 오른쪽 45도 방향에서 바라본 샷입니다.",
    "Rear": "작품 정면의 반대편, 후면에서 바라본 샷입니다.",
    "Aerial": "위에서 내려다보는 조감(버드아이) 샷으로 전체 배치를 보여줍니다.",
    "Long Shot": "주변 맥락과 함께 작품을 멀리서 보여주는 롱샷입니다.",
    "Close-up": "작품 표면, 재질, 디테일을 강조하는 클로즈업 샷입니다.",
    "Front Orthographic": "정면 정투상(입면) 프레젠테이션용 샷입니다. 원근 왜곡이 없습니다.",
    "Rear Orthographic": "후면 정투상(입면) 프레젠테이션용 샷입니다.",
    "Left Elevation": "좌측 입면 프레젠테이션용 샷입니다.",
    "Right Elevation": "우측 입면 프레젠테이션용 샷입니다."
  };

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

  var SITE_REFERENCE_CERTAINTY = {
    "Real Site Photo": "HIGH",
    "Architectural Rendering": "MEDIUM",
    "Aerial / Bird's-eye View": "LOW",
    "Site Plan": "LOW",
    "Mixed": "MIXED"
  };

  // LOW certainty covers two distinct reference types (Site Plan, Aerial)
  // that must never share the same wording — an aerial image is not a
  // "site plan" and the prompt must say so accurately.
  var LOW_REFERENCE_TYPES = ["Site Plan", "Aerial / Bird's-eye View"];

  function lowVariantFor(siteReferenceType) {
    return LOW_REFERENCE_TYPES.indexOf(siteReferenceType) !== -1 ? siteReferenceType : "Site Plan";
  }

  var SITE_CERTAINTY_LABEL_KO = {
    HIGH: "HIGH · 실제 현장사진",
    MEDIUM: "MEDIUM · 건축/조경 렌더",
    MIXED: "MIXED · 복수 레퍼런스"
  };

  var LOW_LABEL_KO = {
    "Site Plan": "LOW · 배치도 기반",
    "Aerial / Bird's-eye View": "LOW · 조감 이미지 기반"
  };

  function siteCertaintyFor(siteReferenceType) {
    return SITE_REFERENCE_CERTAINTY[siteReferenceType] || "MEDIUM";
  }

  function siteCertaintyLabelFor(siteReferenceType) {
    var certainty = siteCertaintyFor(siteReferenceType);
    if (certainty === "LOW") return LOW_LABEL_KO[lowVariantFor(siteReferenceType)];
    return SITE_CERTAINTY_LABEL_KO[certainty];
  }

  // Preservation phrasing for each SITE LOCK checkbox, tuned to what each
  // reference type can actually verify — a site plan or aerial image cannot
  // confirm a façade, so LOW must never claim to preserve it "exactly", and
  // must never call an aerial image a "site plan" or vice versa.
  var SITE_PRESERVE_CLAUSES_BY_CERTAINTY = {
    HIGH: {
      buildingPreserve: "the existing architecture and building exteriors exactly as shown",
      landscapePreserve: "existing planting and landscape features exactly as shown",
      pavingPreserve: "paving and ground surface materials exactly as shown",
      circulationPreserve: "pedestrian circulation paths exactly as shown"
    },
    MEDIUM: {
      buildingPreserve: "the façade proportions and visible exterior materials shown in the reference",
      landscapePreserve: "visible planting masses and landscape structures shown in the reference",
      pavingPreserve: "visible paving patterns and materials shown in the reference",
      circulationPreserve: "pedestrian circulation paths visible in the reference"
    },
    MIXED: {
      buildingPreserve: "the building footprints, positions, and orientation defined by the site plan, refined by any visible architecture shown in accompanying renderings or photos",
      landscapePreserve: "the landscape zones defined by the site plan, refined by any visible planting or landscape features shown in accompanying renderings or photos",
      pavingPreserve: "the paved surface areas defined by the site plan, refined by any visible paving shown in accompanying renderings or photos",
      circulationPreserve: "the pedestrian circulation defined by the site plan, refined by any visible circulation shown in accompanying renderings or photos"
    }
  };

  var SITE_PRESERVE_CLAUSES_LOW = {
    "Site Plan": {
      buildingPreserve: "the building footprints, positions, and orientation shown in the plan (the façade design itself is not specified)",
      landscapePreserve: "the landscape / open-space zone boundaries shown in the plan (specific planting species and landscape design are not specified)",
      pavingPreserve: "the paved and circulation surface areas shown in the plan (the specific paving material is not specified)",
      circulationPreserve: "the pedestrian circulation routes shown in the plan"
    },
    "Aerial / Bird's-eye View": {
      buildingPreserve: "the visible building positions and massing relationships shown in the aerial reference (the façade design itself is not verified)",
      landscapePreserve: "the major landscape organization and open-space zones shown in the aerial reference (specific planting species and landscape design are not verified)",
      pavingPreserve: "the paved and circulation surface areas visible from above in the aerial reference (the specific paving material is not verified)",
      circulationPreserve: "the circulation routes visible in the aerial reference"
    }
  };

  function preserveClauseMapFor(siteReferenceType) {
    var certainty = siteCertaintyFor(siteReferenceType);
    if (certainty === "LOW") return SITE_PRESERVE_CLAUSES_LOW[lowVariantFor(siteReferenceType)];
    return SITE_PRESERVE_CLAUSES_BY_CERTAINTY[certainty];
  }

  var SITE_CERTAINTY_BLOCK = {
    HIGH: "This is an actual site photograph. Preserve the existing architecture, paving, trees, landscape, furniture, signage, and spatial proportions exactly as shown. Do not redesign the site beyond the minimal compositing needed to insert the artwork.",
    MEDIUM: "Preserve visible architecture and landscape features shown in the reference. Areas not visible in the reference, such as the rear or unseen sides of the site, must not be arbitrarily expanded or over-designed — keep them neutral and consistent with the visible portions.",
    MIXED: "Multiple site references are provided (site plan, renderings, and/or photos). When references conflict, prioritize the higher-certainty visual reference — actual site photo, then architectural/landscape rendering, then aerial rendering, then site plan — while preserving the spatial layout defined by the site plan."
  };

  var SITE_CERTAINTY_BLOCK_LOW = {
    "Site Plan": "The site plan defines spatial relationships, not verified architectural appearance. Preserve the building footprints, positions, orientation, circulation, landscape zones, and relative spatial relationships shown in the plan. Architectural façades and landscape details that are not specified in the reference must remain neutral, generic, and visually restrained. Do not treat inferred façade or landscape details as verified design information.",
    "Aerial / Bird's-eye View": "The aerial reference provides an overall spatial and massing impression, but does not fully verify architectural façades, materials, or detailed landscape design. Preserve the visible building positions, massing relationships, circulation, open-space zones, and major landscape organization shown in the aerial reference. Details that cannot be reliably confirmed from the aerial reference must remain neutral, generic, and visually restrained."
  };

  function siteCertaintyBlockFor(siteReferenceType) {
    var certainty = siteCertaintyFor(siteReferenceType);
    if (certainty === "LOW") return SITE_CERTAINTY_BLOCK_LOW[lowVariantFor(siteReferenceType)];
    return SITE_CERTAINTY_BLOCK[certainty];
  }

  var AI_MARKETING_SUPPRESSION_CLAUSE = "Avoid: luxury real-estate advertising style, golden-hour marketing renders, cinematic bloom, excessive flowering plants, resort-like landscaping, invented fountains, invented podiums or platforms, invented Korean signage or slogans, invented building numbers, branded signage, exaggerated material reflections, and overly perfect lifestyle scenes. People: include 0-3 ordinary pedestrians only. Camera: natural eye-level perspective equivalent to a 35-50mm architectural photography lens, neutral contrast, natural saturation, no heroic framing, no cinematic depth-of-field.";

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

  var LIGHTING_BY_TIME = {
    "Day": "Warm daylight lighting, soft golden-hour warmth without full sunset color.",
    "Night": "Night lighting scenario with artificial site and artwork lighting, accent lighting on the artwork, and ambient dusk/night sky.",
    "Sunset": "Dramatic sunset lighting with strong warm color temperature and long shadows."
  };

  var DOMINANCE_TEXT = "Balance the visual weight of the artwork and its site context so neither dominates the frame.";

  var UNBUILT_SITE_CLAUSE = "SITE CONTEXT (UNBUILT / PLANNING STAGE): This apartment complex has not been built yet — it is still at the planning / pre-construction stage. Treat the provided site plan, diagram, or guide map as the primary spatial reference, not a fully verified built environment. Preserve the overall site geometry, building arrangement, circulation, landscape zones, road edges, entrances, and the relative positions of key outdoor spaces exactly as shown in that reference, and keep the designated installation zone consistent with it. Do not invent new plazas, fountains, retaining walls, gateways, signage, sculptural landscape elements, or luxury amenities unless clearly indicated in the reference. Do not add wall slogans, building numbers, branded text, or decorative environmental graphics unless explicitly required. Do not alter the external building massing or invent different architecture, and do not relocate the installation into a different, unrelated courtyard-like space. Where exact built details are unknown, use a neutral, generic apartment landscape interpretation rather than inventing a different type of space — follow the planning layout first and keep all unknown details conservative and generic.";

  var UNBUILT_TONE_CLAUSE = "This is a conservative, proposal-stage competition submission — prioritize accuracy over beauty. Avoid a luxury apartment advertisement look: no cinematic lighting, no excessive golden-hour mood, no dramatic lens flare, no hyper-polished CGI, no exaggerated reflections, and no overly lush landscaping. Use soft, neutral daytime lighting and realistic but restrained material reflectivity so the result feels like a believable installation simulation, not a marketing rendering.";

  var ADULT_HEIGHT_MM = 1700;

  // Applied when the site is unbuilt AND the only reference is LOW certainty
  // (site plan / aerial) — without it, the AI tends to invent an impressive
  // plaza/hardscape around the artwork instead of adapting to the plan.
  var HARDSCAPE_LOCK_CLAUSE = "SITE HARDSCAPE LOCK: Do not invent a circular plaza, radial paving pattern, dedicated sculpture court, reflecting pool, fountain, water basin, special podium or platform, decorative retaining wall, gateway, monument base, custom sculpture paving, or special lighting installation unless clearly visible in the site reference. Do not redesign the surrounding site to make the artwork look more impressive. The artwork must adapt to the planned site; the site must not be redesigned around the artwork. Do not create a dedicated sculpture plaza or special hardscape unless explicitly visible in the site reference. If ground treatment is uncertain, use simple, neutral, continuous landscape or paving consistent with the reference.";

  // ---------------------------------------------------------------------
  // Preservation-level presets (UI convenience layer over the existing
  // preserve* checkboxes + lockLevel — the engine above is untouched;
  // this just batch-sets the same fields it already reads).
  // ---------------------------------------------------------------------

  var PRESERVE_LEVEL_PRESETS = {
    "최소": {
      lockLevel: "FLEXIBLE",
      preserveGeometry: true, preserveProportion: true, preserveColor: false, preserveMaterial: false,
      preserveComponentCount: false, preserveOrientation: false, preserveBase: false, preserveInnerDetail: false,
      buildingPreserve: false, landscapePreserve: false, pavingPreserve: false, circulationPreserve: true
    },
    "보통": {
      lockLevel: "STANDARD",
      preserveGeometry: true, preserveProportion: true, preserveColor: true, preserveMaterial: true,
      preserveComponentCount: true, preserveOrientation: true, preserveBase: false, preserveInnerDetail: false,
      buildingPreserve: true, landscapePreserve: true, pavingPreserve: true, circulationPreserve: true
    },
    "최대": {
      lockLevel: "STRICT",
      preserveGeometry: true, preserveProportion: true, preserveColor: true, preserveMaterial: true,
      preserveComponentCount: true, preserveOrientation: true, preserveBase: true, preserveInnerDetail: true,
      buildingPreserve: true, landscapePreserve: true, pavingPreserve: true, circulationPreserve: true
    }
  };

  var PRESERVE_LEVEL_FIELD_NAMES = Object.keys(PRESERVE_LEVEL_PRESETS["보통"]);

  // ---------------------------------------------------------------------
  // Site-type recommendations — one-click "추천 적용" that patches
  // multiple existing fields at once. Purely a UI convenience layer.
  // ---------------------------------------------------------------------

  var RECOMMENDATIONS = {
    "Apartment Courtyard": {
      chips: ["Long Shot", "Eye Level", "중립 주간광", "건축물 유지", "조경 유지"],
      preserveLevel: "보통", humanScale: "Natural", realismLevel: "Architectural Visualization", timeOfDay: "Day",
      shots: ["Main Perspective", "Eye Level", "Long Shot"]
    },
    "Plaza": {
      chips: ["Aerial", "Long Shot", "커뮤니티 활성", "동선 유지"],
      preserveLevel: "보통", humanScale: "Active Community", realismLevel: "Architectural Visualization", timeOfDay: "Day",
      shots: ["Main Perspective", "Eye Level", "Aerial", "Long Shot"]
    },
    "Park": {
      chips: ["Long Shot", "Aerial", "자연스러운 인물", "조경 유지"],
      preserveLevel: "보통", humanScale: "Natural", realismLevel: "Photoreal", timeOfDay: "Day",
      shots: ["Main Perspective", "Long Shot", "Aerial"]
    },
    "Building Entrance": {
      chips: ["Eye Level", "Close-up", "건축물 유지", "최소 인물"],
      preserveLevel: "최대", humanScale: "Minimal", realismLevel: "Architectural Visualization", timeOfDay: "Day",
      shots: ["Main Perspective", "Eye Level", "Close-up"]
    },
    "Indoor Lobby": {
      chips: ["Eye Level", "Close-up", "포토리얼", "최소 인물"],
      preserveLevel: "최대", humanScale: "Minimal", realismLevel: "Photoreal", timeOfDay: "Day",
      shots: ["Main Perspective", "Eye Level", "Close-up"]
    },
    "Pedestrian Street": {
      chips: ["Long Shot", "Eye Level", "동선 유지", "자연스러운 인물"],
      preserveLevel: "보통", humanScale: "Natural", realismLevel: "Architectural Visualization", timeOfDay: "Day",
      shots: ["Main Perspective", "Eye Level", "Long Shot"]
    },
    "Other": {
      chips: ["Main Perspective", "Eye Level", "표준 보존"],
      preserveLevel: "보통", humanScale: "Natural", realismLevel: "Architectural Visualization", timeOfDay: "Day",
      shots: ["Main Perspective", "Eye Level", "Long Shot"]
    }
  };

  // ---------------------------------------------------------------------
  // Form state
  // ---------------------------------------------------------------------

  var form = document.getElementById("prompt-form");

  var CHECKBOX_FIELDS = [
    "preserveGeometry", "preserveProportion", "preserveColor", "preserveMaterial",
    "preserveComponentCount", "preserveOrientation", "preserveBase", "preserveInnerDetail",
    "buildingPreserve", "landscapePreserve", "pavingPreserve", "circulationPreserve",
    "unbuiltSite"
  ];

  function getFormState() {
    var fd = new FormData(form);
    var state = {};
    fd.forEach(function (value, key) {
      if (key === "shot") return;
      state[key] = value;
    });
    CHECKBOX_FIELDS.forEach(function (name) {
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

  var SITE_LOCK_INTRO_BY_CERTAINTY = {
    HIGH: "Site lock: keep the existing site exactly as referenced.",
    MEDIUM: "Site lock: keep the existing site consistent with the reference.",
    MIXED: "Site lock: keep the existing site consistent with the combined references."
  };

  var SITE_LOCK_INTRO_LOW = {
    "Site Plan": "Site lock: keep the existing site consistent with the spatial layout defined by the site plan.",
    "Aerial / Bird's-eye View": "Site lock: keep the existing site consistent with the spatial and massing relationships shown in the aerial reference."
  };

  function siteLockIntroFor(siteReferenceType) {
    var certainty = siteCertaintyFor(siteReferenceType);
    if (certainty === "LOW") return SITE_LOCK_INTRO_LOW[lowVariantFor(siteReferenceType)];
    return SITE_LOCK_INTRO_BY_CERTAINTY[certainty];
  }

  function siteLockText(state) {
    var certainty = siteCertaintyFor(state.siteReferenceType);
    var clauseMap = preserveClauseMapFor(state.siteReferenceType);
    var lines = [];
    lines.push("Site: a " + (state.siteType || "public") + " setting" +
      (state.installationPosition ? ", with the artwork installed at " + state.installationPosition : "") + ".");
    lines.push("Site reference type: " + (state.siteReferenceType || "Mixed") + " (SITE CERTAINTY: " + certainty +
      "). Time of day: " + (state.timeOfDay || "Day") + ".");

    var protect = [];
    Object.keys(clauseMap).forEach(function (key) {
      if (state[key]) protect.push(clauseMap[key]);
    });

    if (protect.length) {
      lines.push(siteLockIntroFor(state.siteReferenceType) + " Do not alter, redesign, or omit " +
        protect.join("; ") + ". Only the artwork and camera angle may change between shots.");
    } else {
      lines.push("Site lock: keep the existing site consistent across all generated views.");
    }
    lines.push(siteCertaintyBlockFor(state.siteReferenceType));
    if (state.unbuiltSite) lines.push(UNBUILT_SITE_CLAUSE);
    if (state.unbuiltSite && certainty === "LOW") lines.push(HARDSCAPE_LOCK_CLAUSE);
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

  function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  function splitLines(text) {
    return (text || "").split("\n").map(function (s) { return s.trim(); }).filter(Boolean);
  }

  var GENERIC_IDENTITY_NEGATIVES = [
    "reinterpretation of the artwork",
    "simplified abstract sculpture",
    "new sculptural design",
    "loss of the artwork's original color and form identity"
  ];

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
    if (state.basePedestal === "No") {
      lines.push("Do not add a pedestal, water basin, circular reflecting pool, or special platform since none is specified for this artwork.");
    }

    var keyElements = splitLines(state.artworkKeyElements);
    var forbiddenForms = splitLines(state.artworkForbiddenForms);

    if (keyElements.length) {
      lines.push("Use the artwork reference image as the exact artwork reference. The artwork in the output must be the same object shown in that reference image, not a reinterpretation, simplification, or variation.");
      lines.push("Preserve exactly: " + keyElements.join("; ") + ".");
    }
    if (forbiddenForms.length) {
      lines.push("Do not transform the artwork into " + forbiddenForms.join(", ") + ", or any newly designed object.");
    }
    if (keyElements.length || forbiddenForms.length) {
      lines.push("Do not recolor the sculpture. Do not simplify the silhouette. Do not replace the artwork's distinctive components with generic or structural forms. The result must clearly read as the exact same artwork shown in the reference image.");
      lines.push("NEGATIVE (avoid): " + forbiddenForms.concat(GENERIC_IDENTITY_NEGATIVES).join(", ") + ".");
    }

    var heightMm = parseFloat(state.artworkHeight);
    if (heightMm > 0) {
      var ratio = (heightMm / ADULT_HEIGHT_MM).toFixed(2);
      lines.push("The artwork height is exactly " + state.artworkHeight + " mm. Relative to an average adult height of approximately " +
        ADULT_HEIGHT_MM + " mm, the sculpture should appear about " + ratio + " times the height of a person.");
      lines.push("Do not visually enlarge the artwork for dramatic effect. Keep this human-to-artwork scale relationship consistent across all views.");
      lines.push("Even in views with no people present, the artwork's scale must still read as accurate relative to surrounding elements such as buildings, benches, walkways, and planting.");
    }
    lines.push("Scale lock: the artwork must always read at its true specified scale (" + dimsText(state) +
      ") relative to the site and any human figures present. Do not enlarge, shrink, or otherwise misrepresent scale between shots.");
    return lines.join(" ");
  }

  function visualizationText(state) {
    var lines = [];
    lines.push(REALISM_TEXT[state.realismLevel] || REALISM_TEXT["Architectural Visualization"]);
    lines.push(DOMINANCE_TEXT);
    if (state.unbuiltSite && state.timeOfDay === "Day") {
      lines.push("Soft neutral daytime lighting, no golden-hour warmth.");
    } else {
      lines.push(LIGHTING_BY_TIME[state.timeOfDay] || LIGHTING_BY_TIME.Day);
    }
    lines.push(HUMAN_SCALE_TEXT[state.humanScale] || HUMAN_SCALE_TEXT.None);
    lines.push("Output aspect ratio: " + (state.outputRatio || "4:3") + ".");
    if (state.unbuiltSite) lines.push(UNBUILT_TONE_CLAUSE);
    if (state.unbuiltSite && siteCertaintyFor(state.siteReferenceType) === "LOW") {
      lines.push(AI_MARKETING_SUPPRESSION_CLAUSE);
    }
    return lines.join(" ");
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
    lines.push("This master view establishes the definitive human-to-artwork scale relationship and site hardscape footprint — every later shot must match both exactly, with no new landscape or paving features introduced afterward.");
    return lines.join("\n");
  }

  function buildMasterLockInstruction(state) {
    var lines = [];
    lines.push("MASTER LOCK INSTRUCTION — apply this to every subsequent generation in this project:");
    lines.push("");
    lines.push("1. Use the approved master view image as the visual anchor for site, artwork design, and materials.");
    lines.push("2. Do not redesign, restyle, or reinterpret the artwork. " + (LOCK_LEVEL_TEXT[state.lockLevel] || LOCK_LEVEL_TEXT.STANDARD));

    var keyElements = splitLines(state.artworkKeyElements);
    var forbiddenForms = splitLines(state.artworkForbiddenForms);
    if (keyElements.length) lines.push("   Preserve exactly: " + keyElements.join("; ") + ".");
    if (forbiddenForms.length) lines.push("   Do not transform the artwork into " + forbiddenForms.join(", ") + ".");

    lines.push("3. Keep the installation position and orientation fixed exactly as shown in the master view.");
    lines.push("4. Keep the site, landscape, and building context consistent with the master view.");
    lines.push("5. Only the camera angle, distance, and framing may change between shots. All other elements must remain locked.");
    lines.push("6. Keep the approved master-view scale relationship unchanged.");
    lines.push("7. Do not introduce new hardscape or landscape features in later camera views.");
    return lines.join("\n");
  }

  function buildShotPrompt(state, shotName) {
    var lines = [];
    lines.push("SHOT: " + shotName);
    lines.push("");
    lines.push(CAMERA_DIRECTIVES[shotName] || "Camera direction not defined for this shot.");
    lines.push("");
    lines.push("Use the approved master view image as the anchor. Do not redesign the artwork or move its installation position — change only the camera angle as described above.");
    lines.push("");
    lines.push("SITE LOCK: " + siteLockText(state));
    lines.push("ARTWORK LOCK: " + artworkLockText(state));
    lines.push("VISUALIZATION STYLE: " + visualizationText(state));
    return lines.join("\n");
  }

  function shotWarning(shotName) {
    if (LIMITED_REFERENCE_SHOTS.indexOf(shotName) === -1) return null;
    if (TECHNICAL_SHOTS.indexOf(shotName) !== -1) {
      return "⚠ 후면/측면 참고 자료가 부족합니다. AI가 생성한 기술 도면(입면)은 프레젠테이션용으로만 사용하고, 실제 제작 도면으로 사용하지 마세요.";
    }
    return "⚠ 후면/측면 참고 자료가 부족합니다. 이 샷은 검증된 정확한 묘사가 아닌 프레젠테이션용 추정 이미지로 취급하세요.";
  }

  // ---------------------------------------------------------------------
  // Output rendering
  // ---------------------------------------------------------------------

  var currentOutputs = []; // [{ id, index, title, descKo, body, warning, master, step, type }]

  function generate() {
    var state = getFormState();
    currentOutputs = [];
    var idx = 0;

    currentOutputs.push({
      index: pad(idx++), title: "MASTER PROMPT", descKo: "전체 프로젝트를 설명하는 기준 프롬프트입니다. 작품, 공간, 고정 규칙, 톤을 총괄합니다.",
      body: buildMasterPrompt(state), type: "master"
    });
    var masterCertainty = siteCertaintyFor(state.siteReferenceType);
    var MASTER_VIEW_LOW_WARNING = {
      "Site Plan": "LOW SITE CERTAINTY · 배치도 기반 시뮬레이션 — 건축 입면/조경 디테일은 실제 설계와 다를 수 있습니다.",
      "Aerial / Bird's-eye View": "LOW SITE CERTAINTY · 조감 이미지 기반 시뮬레이션 — 건축 입면/조경 디테일은 실제 설계와 다를 수 있습니다."
    };
    currentOutputs.push({
      index: pad(idx++), title: "MASTER VIEW", descKo: "가장 먼저 생성해야 하는 대표 이미지 프롬프트입니다. 이 이미지가 이후 모든 각도의 기준이 됩니다.",
      body: buildMasterViewPrompt(state), type: "master-view", step: "STEP 01",
      warning: masterCertainty === "LOW" ? MASTER_VIEW_LOW_WARNING[lowVariantFor(state.siteReferenceType)] : null
    });
    currentOutputs.push({
      index: pad(idx++), title: "MASTER LOCK", descKo: "승인된 MASTER 이미지를 기준으로 재해석을 막고 카메라만 바꾸도록 지시하는 잠금 문구입니다.",
      body: buildMasterLockInstruction(state), type: "master-lock", step: "STEP 02"
    });

    var shots = ALL_SHOTS.filter(function (s) { return state.shots.indexOf(s) !== -1; });
    shots.forEach(function (shot) {
      currentOutputs.push({
        index: pad(idx++), title: shot.toUpperCase(), descKo: SHOT_DESC_KO[shot] || "",
        body: buildShotPrompt(state, shot), warning: shotWarning(shot), type: "shot", step: "STEP 03"
      });
    });

    if (!shots.length) {
      showToast("촬영 각도를 하나 이상 선택해주세요.");
    }

    renderOutputs();
    saveToHistory(state, currentOutputs);
    showToast("프롬프트가 생성되었습니다.");
  }

  function pad(n) { return String(n).padStart(2, "0"); }

  function renderOutputs() {
    var outputs = document.getElementById("outputs");
    var empty = document.getElementById("empty");
    outputs.innerHTML = "";

    var masterItems = currentOutputs.filter(function (o) { return o.type !== "shot"; });
    var shotItems = currentOutputs.filter(function (o) { return o.type === "shot"; });

    masterItems.forEach(function (item) {
      outputs.appendChild(buildCard(item));
    });

    if (shotItems.length) {
      var grid = document.createElement("div");
      grid.className = "shots-grid";
      shotItems.forEach(function (item) {
        grid.appendChild(buildCard(item));
      });
      outputs.appendChild(grid);
    }

    empty.hidden = true;
    outputs.hidden = false;

    ["btn-copy-all", "btn-export-txt", "btn-export-json"].forEach(function (id) {
      document.getElementById(id).disabled = false;
    });
  }

  function buildCard(item) {
    var card = document.createElement("article");
    card.className = "out-card" + (item.type === "master-view" ? " master-view" : "");

    var head = document.createElement("div");
    head.className = "out-card-head";

    var indexSpan = document.createElement("span");
    indexSpan.className = "out-index";
    indexSpan.textContent = item.index;

    var titleSpan = document.createElement("span");
    titleSpan.className = "out-title";
    titleSpan.textContent = item.title;

    head.appendChild(indexSpan);
    head.appendChild(titleSpan);

    if (item.step) {
      var badge = document.createElement("span");
      badge.className = "step-badge";
      badge.textContent = item.step;
      head.appendChild(badge);
    }

    var toggleBtn = document.createElement("button");
    toggleBtn.type = "button";
    toggleBtn.className = "out-toggle";
    toggleBtn.innerHTML = "프롬프트 생성 완료 <span class=\"out-toggle__arrow\">▾</span> 펼치기";
    toggleBtn.addEventListener("click", function () {
      var open = card.classList.toggle("is-open");
      toggleBtn.innerHTML = "프롬프트 생성 완료 <span class=\"out-toggle__arrow\">▾</span> " + (open ? "접기" : "펼치기");
    });
    head.appendChild(toggleBtn);

    var desc = document.createElement("p");
    desc.className = "out-desc";
    desc.textContent = item.descKo;

    var actions = document.createElement("div");
    actions.className = "out-card-actions";
    var copyBtn = document.createElement("button");
    copyBtn.type = "button";
    copyBtn.className = "btn btn-outline btn-small";
    copyBtn.textContent = "복사하기";
    copyBtn.addEventListener("click", function () {
      copyText(item.body);
      showToast(item.title + " 복사 완료");
    });
    actions.appendChild(copyBtn);

    var collapsible = document.createElement("div");
    collapsible.className = "out-collapsible";
    var collapsibleInner = document.createElement("div");
    collapsibleInner.className = "out-collapsible-inner";

    var pre = document.createElement("pre");
    pre.className = "out-body";
    pre.textContent = item.body;
    collapsibleInner.appendChild(pre);

    if (item.warning) {
      var warn = document.createElement("div");
      warn.className = "out-warning";
      warn.textContent = item.warning;
      collapsibleInner.appendChild(warn);
    }

    collapsible.appendChild(collapsibleInner);

    card.appendChild(head);
    if (item.descKo) card.appendChild(desc);
    card.appendChild(actions);
    card.appendChild(collapsible);

    return card;
  }

  function copyAll() {
    var text = currentOutputs.map(function (o) {
      return "=== [" + o.index + "] " + o.title + " ===\n" + o.body + (o.warning ? "\n\n[" + o.warning + "]" : "");
    }).join("\n\n");
    copyText(text);
    showToast("전체 프롬프트가 복사되었습니다.");
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
      return "=== [" + o.index + "] " + o.title + " ===\n" + o.body + (o.warning ? "\n\n[" + o.warning + "]" : "");
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
      .toLowerCase().trim().replace(/[^a-z0-9가-힣]+/gi, "-").replace(/(^-|-$)/g, "");
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
      title: state.projectName || state.artworkName || "제목 없음",
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
      var p = document.createElement("p");
      p.className = "muted";
      p.textContent = "저장된 기록이 없습니다.";
      list.appendChild(p);
      return;
    }

    history.forEach(function (entry) {
      var row = document.createElement("div");
      row.className = "history-item";

      var meta = document.createElement("div");
      meta.className = "history-item__meta";
      var title = document.createElement("span");
      title.className = "history-item__title";
      title.textContent = entry.title;
      var time = document.createElement("span");
      time.className = "history-item__time";
      time.textContent = new Date(entry.time).toLocaleString("ko-KR");
      meta.appendChild(title);
      meta.appendChild(time);

      var actions = document.createElement("div");
      actions.className = "history-item__actions";

      var loadBtn = document.createElement("button");
      loadBtn.type = "button";
      loadBtn.className = "mini-link";
      loadBtn.textContent = "불러오기";
      loadBtn.addEventListener("click", function () {
        applyFormState(entry.formState);
        currentOutputs = entry.outputs;
        renderOutputs();
        showToast("기록을 불러왔습니다.");
        window.scrollTo({ top: 0, behavior: "smooth" });
      });

      var delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "mini-link";
      delBtn.textContent = "삭제";
      delBtn.addEventListener("click", function () {
        var updated = loadHistory().filter(function (h) { return h.id !== entry.id; });
        localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(updated));
        renderHistory();
      });

      actions.appendChild(loadBtn);
      actions.appendChild(delBtn);

      row.appendChild(meta);
      row.appendChild(actions);
      list.appendChild(row);
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
    updateSiteCertaintyUI();
    syncPresetRadioToState();
    renderRecommendationBanner();
    goToStep(1);
  }

  // ---------------------------------------------------------------------
  // Preservation-level preset UI
  // ---------------------------------------------------------------------

  function applyPreserveLevel(level) {
    var preset = PRESERVE_LEVEL_PRESETS[level];
    if (!preset) return;
    Object.keys(preset).forEach(function (key) {
      var el = form.elements[key];
      if (!el) return;
      if (el.type === "checkbox") el.checked = preset[key];
      else el.value = preset[key];
    });
  }

  function syncPresetRadioToState() {
    var state = getFormState();
    var matchedLevel = null;
    Object.keys(PRESERVE_LEVEL_PRESETS).forEach(function (level) {
      var preset = PRESERVE_LEVEL_PRESETS[level];
      var matches = PRESERVE_LEVEL_FIELD_NAMES.every(function (key) {
        return key === "lockLevel" ? state[key] === preset[key] : !!state[key] === !!preset[key];
      });
      if (matches) matchedLevel = level;
    });
    var radios = form.querySelectorAll('input[name="preserveLevelPreset"]');
    radios.forEach(function (el) { el.checked = el.value === matchedLevel; });
  }

  // ---------------------------------------------------------------------
  // AI 추천 (site-type recommendation banner)
  // ---------------------------------------------------------------------

  var dismissedRecommendationFor = null;

  function renderRecommendationBanner() {
    var siteType = form.elements["siteType"].value;
    var banner = document.getElementById("recommend-banner");
    var rec = RECOMMENDATIONS[siteType];
    if (!rec || dismissedRecommendationFor === siteType) {
      banner.hidden = true;
      return;
    }
    var chipsEl = document.getElementById("recommend-chips");
    chipsEl.innerHTML = "";
    rec.chips.forEach(function (label) {
      var span = document.createElement("span");
      span.textContent = "✓ " + label;
      chipsEl.appendChild(span);
    });
    banner.hidden = false;
  }

  function applyCurrentRecommendation() {
    var siteType = form.elements["siteType"].value;
    var rec = RECOMMENDATIONS[siteType];
    if (!rec) return;
    applyPreserveLevel(rec.preserveLevel);
    form.elements["humanScale"].value = rec.humanScale;
    form.elements["realismLevel"].value = rec.realismLevel;
    form.elements["timeOfDay"].value = rec.timeOfDay;
    var shotEls = form.querySelectorAll('input[name="shot"]');
    shotEls.forEach(function (el) { el.checked = rec.shots.indexOf(el.value) !== -1; });
    syncPresetRadioToState();
    showToast("추천 설정이 적용되었습니다.");
  }

  var LOW_HINT_KO = {
    "Site Plan": "배치도는 공간의 위치 관계만 확인할 수 있습니다. 건축 입면과 조경 디테일은 실제 설계와 다를 수 있으므로 AI가 보수적으로 추론하도록 프롬프트가 생성됩니다.",
    "Aerial / Bird's-eye View": "조감 이미지는 전체 배치와 매스 관계를 확인할 수 있지만, 건축 입면·재료·세부 조경은 정확히 확인하기 어렵습니다. 확인되지 않는 요소는 보수적으로 추론합니다."
  };

  function updateSiteCertaintyUI() {
    var refType = form.elements["siteReferenceType"].value;
    var certainty = siteCertaintyFor(refType);
    var badge = document.getElementById("site-certainty-badge");
    var hint = document.getElementById("site-certainty-hint");
    badge.textContent = "SITE CERTAINTY: " + siteCertaintyLabelFor(refType);
    badge.className = "certainty-badge certainty-badge--" + certainty.toLowerCase();
    hint.hidden = certainty !== "LOW";
    if (certainty === "LOW") {
      var text = LOW_HINT_KO[lowVariantFor(refType)];
      if (form.elements["unbuiltSite"].checked) {
        text += " 미착공·LOW 레퍼런스에서는 AI가 작품 전용 광장·수경·포장 등을 임의 생성하지 않도록 자동 제한됩니다.";
      }
      hint.textContent = text;
    }
  }

  var SAMPLE_STATE = {
    projectName: "한강 시네폴리스 워터프론트 광장",
    competitionName: "2026 공공미술 설계공모",
    artistName: "홍길동",
    artworkName: "떠오르는 파도",
    siteType: "Plaza",
    installationPosition: "중앙 광장 축, 보행 정문 정면",
    siteReferenceType: "Architectural Rendering",
    timeOfDay: "Day",
    unbuiltSite: false,
    artworkWidth: "3000",
    artworkDepth: "2000",
    artworkHeight: "4500",
    material: "Mirror Stainless",
    mainColors: "폴리시드 미러 실버, 은은한 블루 반사",
    basePedestal: "Yes",
    artworkDescription: "낮은 원형 기단에서 솟아오르는 역동적인 파도 형상으로, 연속적으로 비틀리는 리본 형태의 표면을 가진다.",
    installationMessage: "강의 흐름과 워터프론트에 모이는 커뮤니티의 에너지를 상징한다.",
    lockLevel: "STANDARD",
    preserveGeometry: true, preserveProportion: true, preserveColor: true, preserveMaterial: true,
    preserveComponentCount: true, preserveOrientation: true, preserveBase: false, preserveInnerDetail: false,
    buildingPreserve: true, landscapePreserve: true, pavingPreserve: true, circulationPreserve: true,
    outputRatio: "16:9",
    humanScale: "Natural",
    realismLevel: "Architectural Visualization",
    shots: ["Main Perspective", "Eye Level", "Left 3/4", "Right 3/4", "Rear", "Aerial", "Long Shot", "Close-up"]
  };

  var UNBUILT_SAMPLE_STATE = {
    projectName: "OO아파트 조경존 미술장식품 설치",
    competitionName: "2026 건축물 미술작품 설계공모",
    artistName: "홍길동",
    artworkName: "제안 조형물",
    siteType: "Apartment Courtyard",
    installationPosition: "배치도 상 지정된 조경존 (계획 단계)",
    siteReferenceType: "Site Plan",
    timeOfDay: "Day",
    unbuiltSite: true,
    artworkWidth: "2300",
    artworkDepth: "600",
    artworkHeight: "3000",
    material: "Stainless Steel",
    mainColors: "무광 화이트, 실버 브러시드 포인트",
    basePedestal: "No",
    artworkDescription: "수직으로 뻗은 절제된 형태의 조형물로, 과도한 장식 없이 단순한 매스와 표면으로 구성된다.",
    installationMessage: "단지 진입부 조경존에서 주민들의 시선을 자연스럽게 안내하는 절제된 랜드마크 역할을 한다.",
    lockLevel: "STRICT",
    preserveGeometry: true, preserveProportion: true, preserveColor: true, preserveMaterial: true,
    preserveComponentCount: true, preserveOrientation: true, preserveBase: false, preserveInnerDetail: true,
    buildingPreserve: true, landscapePreserve: true, pavingPreserve: true, circulationPreserve: true,
    outputRatio: "4:3",
    humanScale: "Minimal",
    realismLevel: "Architectural Visualization",
    shots: ["Main Perspective", "Eye Level", "Long Shot"]
  };

  function loadUnbuiltSample() {
    applyFormState(UNBUILT_SAMPLE_STATE);
    showToast("미착공 현장 샘플을 불러왔습니다.");
  }

  function loadSample() {
    applyFormState(SAMPLE_STATE);
    showToast("샘플 데이터를 불러왔습니다.");
  }

  function resetForm() {
    form.reset();
    currentOutputs = [];
    document.getElementById("outputs").innerHTML = "";
    document.getElementById("outputs").hidden = true;
    document.getElementById("empty").hidden = false;
    ["btn-copy-all", "btn-export-txt", "btn-export-json"].forEach(function (id) {
      document.getElementById(id).disabled = true;
    });
    updateSiteCertaintyUI();
    dismissedRecommendationFor = null;
    renderRecommendationBanner();
    goToStep(1);
    showToast("초기화되었습니다.");
  }

  // ---------------------------------------------------------------------
  // Wizard (step navigation) + Simple/Expert mode
  // ---------------------------------------------------------------------

  var currentStep = 1;
  var TOTAL_STEPS = 4;

  function isExpertMode() { return document.body.classList.contains("mode-expert"); }

  function goToStep(n) {
    currentStep = Math.min(Math.max(n, 1), TOTAL_STEPS);
    updateWizardUI();
    if (!isExpertMode()) window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function updateWizardUI() {
    var expert = isExpertMode();
    document.querySelectorAll(".step-panel").forEach(function (panel) {
      var step = Number(panel.getAttribute("data-step"));
      panel.hidden = expert ? false : step !== currentStep;
      panel.classList.toggle("is-active", step === currentStep);
    });
    document.querySelectorAll(".stepper__step").forEach(function (btn) {
      var step = Number(btn.getAttribute("data-step"));
      btn.classList.toggle("is-active", step === currentStep);
      btn.classList.toggle("is-done", step < currentStep);
    });
  }

  function setMode(mode) {
    var expert = mode === "expert";
    document.body.classList.toggle("mode-expert", expert);
    document.getElementById("btn-mode-simple").classList.toggle("is-active", !expert);
    document.getElementById("btn-mode-simple").setAttribute("aria-pressed", String(!expert));
    document.getElementById("btn-mode-expert").classList.toggle("is-active", expert);
    document.getElementById("btn-mode-expert").setAttribute("aria-pressed", String(expert));
    try { localStorage.setItem("pavpg.mode", mode); } catch (e) { /* ignore */ }
    updateWizardUI();
  }

  // ---------------------------------------------------------------------
  // Misc UI helpers
  // ---------------------------------------------------------------------

  var toastTimer = null;
  function showToast(message) {
    var toast = document.getElementById("toast");
    toast.textContent = message;
    toast.style.display = "block";
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toast.style.display = "none"; }, 2200);
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
    var resultTitle = document.getElementById("result-title");
    if (resultTitle) resultTitle.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  document.getElementById("btn-reset").addEventListener("click", resetForm);
  document.getElementById("btn-sample").addEventListener("click", loadSample);
  document.getElementById("btn-sample-unbuilt").addEventListener("click", loadUnbuiltSample);
  document.getElementById("btn-copy-all").addEventListener("click", copyAll);
  document.getElementById("btn-export-txt").addEventListener("click", exportTxt);
  document.getElementById("btn-export-json").addEventListener("click", exportJson);
  document.getElementById("btn-clear-history").addEventListener("click", clearHistory);
  document.getElementById("btn-jump-history").addEventListener("click", function () {
    document.getElementById("history-section").scrollIntoView({ behavior: "smooth", block: "center" });
  });

  document.querySelectorAll("[data-select-shots]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      selectShots(btn.getAttribute("data-select-shots"));
    });
  });

  form.elements["siteReferenceType"].addEventListener("change", updateSiteCertaintyUI);
  form.elements["unbuiltSite"].addEventListener("change", updateSiteCertaintyUI);
  form.elements["siteType"].addEventListener("change", function () {
    dismissedRecommendationFor = null;
    renderRecommendationBanner();
  });

  // Mode toggle (Simple / Expert)
  document.getElementById("btn-mode-simple").addEventListener("click", function () { setMode("simple"); });
  document.getElementById("btn-mode-expert").addEventListener("click", function () { setMode("expert"); });

  // Wizard: stepper clicks + in-panel 다음/이전 buttons
  document.querySelectorAll(".stepper__step").forEach(function (btn) {
    btn.addEventListener("click", function () { goToStep(Number(btn.getAttribute("data-step"))); });
  });
  document.querySelectorAll("[data-goto]").forEach(function (btn) {
    btn.addEventListener("click", function () { goToStep(Number(btn.getAttribute("data-goto"))); });
  });

  // 공간 보존 수준 프리셋
  document.querySelectorAll('input[name="preserveLevelPreset"]').forEach(function (radio) {
    radio.addEventListener("change", function () {
      if (radio.checked) applyPreserveLevel(radio.value);
    });
  });

  // AI 추천 배너
  document.getElementById("btn-apply-recommend").addEventListener("click", applyCurrentRecommendation);
  document.getElementById("btn-dismiss-recommend").addEventListener("click", function () {
    dismissedRecommendationFor = form.elements["siteType"].value;
    renderRecommendationBanner();
  });

  // ---- init ----
  var savedMode = null;
  try { savedMode = localStorage.getItem("pavpg.mode"); } catch (e) { /* ignore */ }
  setMode(savedMode === "expert" ? "expert" : "simple");
  goToStep(1);
  updateSiteCertaintyUI();
  syncPresetRadioToState();
  renderRecommendationBanner();
  renderHistory();
})();
