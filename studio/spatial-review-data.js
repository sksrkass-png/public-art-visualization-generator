// v1.7: portable, revision-scoped review notes. No scene geometry is stored or modified.
export const SPATIAL_SCHEMA = "axoo-spatial-review-v1";
export const MAX_SPATIAL_PINS = 80;
const TYPES = ["artwork", "site", "context"];
const STATUSES = ["open", "resolved"];
const validDate = x => typeof x === "string" && !Number.isNaN(Date.parse(x));
const finitePosition = p => Array.isArray(p) && p.length === 3 &&
  p.every(n => typeof n === "number" && Number.isFinite(n) && Math.abs(n) <= 100000);
export function validSpatialReview(value) {
  if (value === undefined) return true; // pre-v1.7 files have no review pins
  if (!value || value.schema !== SPATIAL_SCHEMA || !Array.isArray(value.pins) ||
      value.pins.length > MAX_SPATIAL_PINS) return false;
  const ids = new Set();
  return value.pins.every(p => {
    if (!p || !Number.isInteger(p.id) || p.id < 1 || p.id > 1000000 || ids.has(p.id) ||
        !Number.isInteger(p.revision) || p.revision < 1 ||
        !validDate(p.masterApprovedAt) || !/^[a-f0-9]{64}$/.test(p.masterSHA256 || "") ||
        !TYPES.includes(p.type) || !STATUSES.includes(p.status) ||
        !finitePosition(p.position) ||
        typeof p.author !== "string" || !p.author.trim() || p.author.length > 80 ||
        typeof p.comment !== "string" || !p.comment.trim() || p.comment.length > 1500 ||
        !validDate(p.createdAt) || !validDate(p.updatedAt) ||
        Date.parse(p.updatedAt) < Date.parse(p.createdAt) ||
        (p.status === "resolved" && (!p.resolvedBy || typeof p.resolvedBy !== "string" ||
          p.resolvedBy.length > 80 || !validDate(p.resolvedAt))) ||
        (p.status === "open" && (p.resolvedAt !== null || p.resolvedBy !== null)) ||
        (p.status === "resolved" && Date.parse(p.resolvedAt) < Date.parse(p.createdAt)))
      return false;
    ids.add(p.id);
    return true;
  });
}
export function emptySpatialReview() { return {schema:SPATIAL_SCHEMA,pins:[]}; }
function guard(data) {
  if (!validSpatialReview(data)) throw Error("검토 핀 기록이 올바르지 않습니다.");
}
export function addSpatialPin(data, {master, digest, type, position, author, comment, now}) {
  guard(data);
  if (!master || !Number.isInteger(master.revision) || !validDate(master.approvedAt) ||
      !/^[a-f0-9]{64}$/.test(digest || "") ||
      !TYPES.includes(type) || !finitePosition(position) ||
      typeof author !== "string" || author.trim().length < 1 || author.trim().length > 80 ||
      typeof comment !== "string" || comment.trim().length < 1 || comment.trim().length > 1500 ||
      !validDate(now)) throw Error("MASTER 정보, 검토자, 위치 또는 의견을 확인하세요.");
  if (data.pins.length >= MAX_SPATIAL_PINS) throw Error("프로젝트 검토 핀은 최대 80개입니다.");
  const id = Math.max(0, ...data.pins.map(p => p.id)) + 1;
  if (id > 1000000) throw Error("검토 핀 ID 한도를 초과했습니다.");
  const pin = {
    id, revision:master.revision, masterApprovedAt:master.approvedAt, masterSHA256:digest,
    type, position:position.map(n => Number(n.toFixed(5))), author:author.trim(),
    comment:comment.trim(), status:"open", createdAt:now,updatedAt:now,
    resolvedBy:null,resolvedAt:null
  };
  const next = {schema:SPATIAL_SCHEMA,pins:[...data.pins,pin]};
  guard(next);
  return next;
}
export function updateSpatialPinStatus(data,id,status,reviewer,now) {
  guard(data);
  if (!STATUSES.includes(status) || !validDate(now) ||
      typeof reviewer !== "string" || !reviewer.trim() || reviewer.trim().length > 80)
    throw Error("처리 상태 또는 검토자 정보를 확인하세요.");
  const found=data.pins.find(p => p.id === id);
  if (!found) throw Error("검토 핀을 찾을 수 없습니다.");
  if (Date.parse(now) < Date.parse(found.createdAt)) throw Error("검토 기록의 날짜가 올바르지 않습니다.");
  const updated={...found,status,updatedAt:now,
    resolvedBy:status==="resolved"?reviewer.trim():null,
    resolvedAt:status==="resolved"?now:null};
  const next={schema:SPATIAL_SCHEMA,pins:data.pins.map(p=>p.id===id?updated:p)};
  guard(next);
  return next;
}
export function pinsForMaster(data,master,digest) {
  guard(data);
  if (!master || !/^[a-f0-9]{64}$/.test(digest||"")) return [];
  return data.pins.filter(p=>p.revision===master.revision &&
    p.masterApprovedAt===master.approvedAt && p.masterSHA256===digest);
}
