/**
 * Public Art Studio v0.6 visual-layer state.
 * Site components are never moved, recreated or edited: only the render
 * visibility of individual source meshes changes. Mesh IDs are stable child
 * index paths under siteRoot, not temporary Three.js UUIDs.
 */
export const LAYER_KEYS = Object.freeze([
  "site", "buildings", "landscape", "unassigned",
  "artwork", "planting", "lighting"
]);
export const SITE_CATEGORIES = Object.freeze(["buildings", "landscape", "unassigned"]);
export const EDITABLE_LAYERS = Object.freeze(["artwork", "planting", "lighting"]);
export const SITE_NODE_LIMIT = 5000;
export function defaultLayerState() {
  return {
    groups: Object.fromEntries(LAYER_KEYS.map(key => [key, {visible: true, locked: !EDITABLE_LAYERS.includes(key)}])),
    siteNodes: {}
  };
}
export function validateLayerState(value) {
  if (!value || typeof value !== "object" || !value.groups || !value.siteNodes ||
      Array.isArray(value.siteNodes) || typeof value.siteNodes !== "object") return false;
  if (Object.keys(value.siteNodes).length > SITE_NODE_LIMIT) return false;
  for (const key of LAYER_KEYS) {
    const layer = value.groups[key];
    if (!layer || typeof layer.visible !== "boolean" || typeof layer.locked !== "boolean") return false;
    // Source architecture and landscape are always read-only, even from ZIP.
    if (!EDITABLE_LAYERS.includes(key) && !layer.locked) return false;
  }
  for (const [path, entry] of Object.entries(value.siteNodes)) {
    if (!/^\d+(?:\/\d+)*$/.test(path) || path.length > 120 || !entry ||
        !SITE_CATEGORIES.includes(entry.category) || typeof entry.hidden !== "boolean") return false;
  }
  return true;
}
export function importLayerState(value) {
  return validateLayerState(value) ? structuredClone(value) : defaultLayerState();
}
export function enumerateSiteMeshes(root) {
  const entries = [];
  const visit = (parent, prefix) => {
    parent.children.forEach((child, index) => {
      const path = prefix ? prefix + "/" + index : String(index);
      if (child.isMesh && child.geometry?.getAttribute("position")) {
        entries.push({path, object: child, name: String(child.name || "현장 메시 " + (entries.length + 1)).slice(0, 100)});
      }
      visit(child, path);
    });
  };
  visit(root, "");
  return entries;
}
export function isExtraLight(root) {
  return !!root?.userData?.extraKind?.includes("light");
}
export function layerForObject(root, artRoot) {
  if (root === artRoot || root?.userData?.extraKind==="artwork-copy" ||
      (root?.userData?.extraKind==="custom-glb" && root?.userData?.assetCategory==="artwork"))
    return "artwork";
  return isExtraLight(root) ? "lighting" : "planting";
}
export function canEditObject(root, artRoot, state, masterLocked) {
  if (!root || masterLocked) return false;
  const group = state.groups[layerForObject(root, artRoot)];
  return !!group.visible && !group.locked &&
    root.userData?.layerHidden !== true && root.userData?.layerLocked !== true;
}
export function applyLayerVisibility(state, siteRoot, artRoot, extrasRoot) {
  const entries = enumerateSiteMeshes(siteRoot);
  siteRoot.visible = state.groups.site.visible;
  for (const {path, object} of entries) {
    if (object.userData.__sourceVisible === undefined) object.userData.__sourceVisible = object.visible;
    const info = state.siteNodes[path] || {category:"unassigned",hidden:false};
    object.visible = object.userData.__sourceVisible &&
      !info.hidden && state.groups.site.visible && state.groups[info.category].visible;
  }
  artRoot.visible = state.groups.artwork.visible;
  for (const root of extrasRoot.children) {
    const layer = state.groups[layerForObject(root, artRoot)];
    root.visible = layer.visible && root.userData.layerHidden !== true;
  }
  return entries;
}
export function normalizeSiteAnnotations(state, siteRoot) {
  const paths = new Set(enumerateSiteMeshes(siteRoot).map(x => x.path));
  for (const path of Object.keys(state.siteNodes)) if (!paths.has(path)) delete state.siteNodes[path];
}
