import * as THREE from "three";

const UP = new THREE.Vector3(0, 1, 0);
const DOWN = new THREE.Vector3(0, -1, 0);
const raycaster = new THREE.Raycaster();

export function upwardFace(hit, minimumDot = 0.72) {
  if (!hit?.face || !hit.object?.matrixWorld) return false;
  const n = hit.face.normal.clone();
  n.applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld));
  return n.dot(UP) >= minimumDot;
}
export function siteSurfaceAtXZ(siteRoot, x, z, minimumDot = 0.72) {
  siteRoot.updateWorldMatrix(true, true);
  const bounds = new THREE.Box3().setFromObject(siteRoot);
  if (bounds.isEmpty()) return null;
  const start = bounds.max.y + Math.max(2, bounds.getSize(new THREE.Vector3()).y * 0.05);
  raycaster.set(new THREE.Vector3(x, start, z), DOWN);
  const hits = raycaster.intersectObjects(siteRoot.children, true);
  const hit = hits.find(h => upwardFace(h, minimumDot));
  return hit ? { point: hit.point.clone(), mesh: hit.object, source: "site" } : null;
}
export function surfaceAtPointer(pointer, camera, viewport, siteRoot, allowFallback = false) {
  const rect = viewport.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  const ndc = new THREE.Vector2(
    ((pointer.clientX - rect.left) / rect.width) * 2 - 1,
    -((pointer.clientY - rect.top) / rect.height) * 2 + 1
  );
  raycaster.setFromCamera(ndc, camera);
  siteRoot.updateWorldMatrix(true, true);
  const matches = raycaster.intersectObjects(siteRoot.children, true);
  const hit = matches.find(h => upwardFace(h));
  if (hit) return { point: hit.point.clone(), mesh: hit.object, source: "site" };
  if (!allowFallback) return null;
  const plane = new THREE.Plane(UP, 0);
  const point = new THREE.Vector3();
  return raycaster.ray.intersectPlane(plane, point)
    ? { point, mesh: null, source: "reference-plane" }
    : null;
}
export function snapRootToSurface(root, siteRoot, { allowFallback = false, offset = 0 } = {}) {
  if (!root) return null;
  root.updateWorldMatrix(true, true);
  const existing = new THREE.Box3().setFromObject(root);
  if (existing.isEmpty()) return null;
  const contact = siteSurfaceAtXZ(siteRoot, root.position.x, root.position.z);
  if (!contact && !allowFallback) return null;
  const height = contact ? contact.point.y : 0;
  const deltaY = height + offset - existing.min.y;
  root.position.y += deltaY;
  root.updateWorldMatrix(true, true);
  return { source: contact?.source || "reference-plane", surfaceHeight: height, deltaY };
}
export function toFinite(value, fallback, min = -10000, max = 10000) {
  const n = Number(value);
  return Number.isFinite(n) ? THREE.MathUtils.clamp(n, min, max) : fallback;
}
