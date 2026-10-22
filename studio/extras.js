import * as THREE from "three";
import { instantiateLibraryAsset } from "./assets.js";

// Procedural planting is intentionally schematic rather than a claim of true
// botanical/photogrammetry accuracy. All extras are independent editables.
export const EXTRA_TYPES = Object.freeze(["tree-round", "tree-cone", "shrub", "tree-autumn",
  "person-standing", "park-bench", "round-planter", "custom-glb", "point-light", "spot-light"]);

function mesh(geometry, color, roughness = .85, metalness = 0) {
  const o = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color, roughness, metalness }));
  o.castShadow = true;
  o.receiveShadow = true;
  return o;
}
// v0.4 geometry is preserved for reopened old projects and approved MASTERs.
function legacyTreeRound(root) {
  const trunk = mesh(new THREE.CylinderGeometry(.2, .28, 2.25, 9), 0x7f6451);
  trunk.position.y = 1.13; root.add(trunk);
  for (const [x,y,z,r] of [[0,3.05,0,1.22],[-.68,2.88,.25,.8],[.67,3.1,.2,.87],[.24,3.85,-.2,.78]]) {
    const b = mesh(new THREE.IcosahedronGeometry(r, 2), 0x6b8863);
    b.position.set(x,y,z); root.add(b);
  }
}
function legacyTreeCone(root) {
  const trunk = mesh(new THREE.CylinderGeometry(.16,.24,3.8,8),0x84684f);trunk.position.y=1.9;root.add(trunk);
  for(const [y, radius, height] of [[1.55,1.15,2.25],[2.45,.93,2.15],[3.25,.68,1.65]]) {
    const p=mesh(new THREE.ConeGeometry(radius,height,9),0x4c7863);
    p.position.y=y+height*.23;root.add(p);
  }
}
function legacyShrub(root) {
  for(const [x,y,z,r] of [[0,.65,0,.79],[-.62,.5,.15,.56],[.62,.48,.12,.58],[-.26,.8,-.48,.56],[.32,.76,-.45,.59]]) {
    const b=mesh(new THREE.IcosahedronGeometry(r,1),0x73896b);
    b.position.set(x,y,z);root.add(b);
  }
}
// Reproducible foliage detail: no random source, so project reopens with
// the same botanical silhouettes in screenshots and exported GLB geometry.
const LEAF_COLORS = [0x5b7757, 0x6e9267, 0x7a9a6b, 0x476c50, 0x85a279];
function detailFoliage(root, centers, count, seed) {
  for (let i = 0; i < count; i++) {
    const c = centers[i % centers.length];
    const t = (i * 2.3999632297 + seed) % (Math.PI * 2);
    const spread = .22 + ((i * 17 + seed * 13) % 9) / 18;
    const radius = .14 + (i % 4) * .032;
    const leaf = mesh(new THREE.IcosahedronGeometry(radius, 1), LEAF_COLORS[(i + seed) % LEAF_COLORS.length]);
    leaf.position.set(
      c[0] + Math.cos(t) * c[3] * spread,
      c[1] + Math.sin(t * 1.73) * c[3] * .42,
      c[2] + Math.sin(t) * c[3] * spread
    );
    leaf.scale.set(1.15, .7, 1.25);
    root.add(leaf);
  }
}
function treeRound(root) {
  const trunk = mesh(new THREE.CylinderGeometry(.19, .29, 2.3, 12), 0x78624b);
  trunk.position.y = 1.15; root.add(trunk);
  for(const [y, angle, radius] of [[2.0,-.65,.08],[2.25,.9,.07],[1.95,2.25,.075]]) {
    const branch=mesh(new THREE.CylinderGeometry(radius*.5,radius,1.45,8),0x836d53);
    branch.position.set(Math.cos(angle)*.38,y+.24,Math.sin(angle)*.38);
    branch.rotation.z=.57;
    branch.rotation.y=angle;
    root.add(branch);
  }
  const centers=[[0,3.2,0,1.08],[-.63,2.95,.21,.78],[.62,3.05,.18,.8],[.25,3.68,-.13,.76]];
  centers.forEach((c,i)=>{
    const b=mesh(new THREE.IcosahedronGeometry(c[3],2), LEAF_COLORS[(i+2)%LEAF_COLORS.length]);
    b.position.set(c[0],c[1],c[2]); root.add(b);
  });
  detailFoliage(root, centers, 26, 7);
}
function treeCone(root) {
  const trunk=mesh(new THREE.CylinderGeometry(.14,.22,3.5,9),0x806b50);
  trunk.position.y=1.75;root.add(trunk);
  const layers=[[1.25,1.19,1.9],[2.05,1.03,1.8],[2.8,.82,1.55],[3.55,.47,1.2]];
  layers.forEach(([y,rad,height],i)=>{
    const foliage=mesh(new THREE.ConeGeometry(rad,height,12),[0x375d4c,0x426b52,0x527c60,0x547e5a][i]);
    foliage.position.y=y+.32;root.add(foliage);
  });
  const centers=layers.map(([y,rad])=>[0,y+.32,0,rad]);
  detailFoliage(root,centers,21,13);
}
function shrub(root) {
  const centers=[[0,.66,0,.71],[-.55,.56,.12,.51],[.55,.52,.16,.52],[-.2,.76,-.38,.45],[.29,.66,-.4,.47]];
  centers.forEach((c,i)=>{
    const b=mesh(new THREE.IcosahedronGeometry(c[3],2),LEAF_COLORS[(i+1)%LEAF_COLORS.length]);
    b.position.set(c[0],c[1],c[2]);root.add(b);
  });
  detailFoliage(root,centers,20,23);
}
function autumnTree(root){
  treeRound(root);
  let i=0;
  root.traverse(o=>{
    if(!o.isMesh || !(o.material instanceof THREE.MeshStandardMaterial))return;
    if(o.geometry.type==="IcosahedronGeometry"){
      const color=[0xc27838,0xd09e4d,0xa96a35,0xd0b363,0x997348][i++%5];
      o.material=o.material.clone();o.material.color.setHex(color);
    }
  });
}
function standingPerson(root){
  // Neutral mannequin proportions (1.73m). No claims of photogrammetry.
  const skin=0xbda996,coat=0x44576a,legs=0x343d48,shoes=0x20262a;
  const torso=mesh(new THREE.CapsuleGeometry(.21,.48,5,10),coat);
  torso.position.y=1.18;root.add(torso);
  const head=mesh(new THREE.SphereGeometry(.118,12,10),skin);
  head.position.y=1.61;root.add(head);
  for(const x of [-.115,.115]){
    const leg=mesh(new THREE.CapsuleGeometry(.083,.57,4,8),legs);
    leg.position.set(x,.44,0);root.add(leg);
    const foot=mesh(new THREE.BoxGeometry(.15,.1,.29),shoes);
    foot.position.set(x,.075,.06);root.add(foot);
  }
  for(const x of [-.27,.27]){
    const arm=mesh(new THREE.CapsuleGeometry(.068,.47,4,8),coat);
    arm.position.set(x,1.12,0);
    arm.rotation.z=x<0?-.16:.16;root.add(arm);
  }
}
function parkBench(root){
  const seat=mesh(new THREE.BoxGeometry(1.8,.12,.52),0x956f4e);
  seat.position.set(0,.51,0);root.add(seat);
  const back=mesh(new THREE.BoxGeometry(1.8,.6,.10),0x9e7856);
  back.position.set(0,.88,-.25);back.rotation.x=-.11;root.add(back);
  for(const x of [-.7,.7]){
    const leg=mesh(new THREE.BoxGeometry(.07,.5,.45),0x485056,.38,.75);
    leg.position.set(x,.25,0);root.add(leg);
  }
}
function roundPlanter(root){
  const pot=mesh(new THREE.CylinderGeometry(.56,.44,.64,16),0xadb0a6,.9,.04);
  pot.position.y=.32;root.add(pot);
  const soil=mesh(new THREE.CylinderGeometry(.52,.52,.03,16),0x4c4438);
  soil.position.y=.66;root.add(soil);
  const foliage=mesh(new THREE.IcosahedronGeometry(.56,2),0x5d8355);
  foliage.scale.set(1,.7,1);foliage.position.y=1.02;root.add(foliage);
}
function lightIcon(root, kind) {
  const icon = new THREE.Mesh(new THREE.SphereGeometry(.19,14,10),
    new THREE.MeshBasicMaterial({color:kind==="spot-light"?0xffcf88:0xfff4b4,depthTest:false,transparent:true,opacity:.85}));
  icon.userData.editorOnly=true;
  icon.name="Editor light marker · not exported";
  icon.renderOrder=1000;
  root.add(icon);
}
function lightFixture(root,kind) {
  const light = kind==="point-light" ?
    new THREE.PointLight(0xfff4dd,4,0,2):
    new THREE.SpotLight(0xfff4dd,10,20,Math.PI/5,.35,2);
  light.name=kind;
  light.castShadow=true;
  light.shadow.mapSize.set(512,512);
  root.add(light);
  if(kind==="spot-light"){
    const target=new THREE.Object3D();
    target.position.set(0,-5,0);
    target.name="Spot target";
    root.add(target);
    light.target=target;
  }
  lightIcon(root,kind);
  return light;
}
export function makeExtra(kind,id,appearanceVersion=2,assetId=null,library=null) {
  if(!EXTRA_TYPES.includes(kind))throw Error("Unknown decorative object kind");
  const root=new THREE.Group();
  root.userData.extraKind=kind;
  root.userData.extraId=id;
  root.userData.appearanceVersion=appearanceVersion;
  if(kind==="custom-glb")root.userData.assetId=assetId;
  root.name=({ "tree-round":"활엽수", "tree-cone":"침엽수", "shrub":"덤불",
    "tree-autumn":"가을 활엽수", "person-standing":"보행자", "park-bench":"공원 벤치",
    "round-planter":"화분", "custom-glb":"사용자 GLB",
    "point-light":"포인트 조명","spot-light":"스폿 조명" })[kind]+" #"+id;
  if(kind==="tree-round")(appearanceVersion === 1 ? legacyTreeRound : treeRound)(root);
  else if(kind==="tree-cone")(appearanceVersion === 1 ? legacyTreeCone : treeCone)(root);
  else if(kind==="shrub")(appearanceVersion === 1 ? legacyShrub : shrub)(root);
  else if(kind==="tree-autumn")autumnTree(root);
  else if(kind==="person-standing")standingPerson(root);
  else if(kind==="park-bench")parkBench(root);
  else if(kind==="round-planter")roundPlanter(root);
  else if(kind==="custom-glb"){
    const source=library?.get(assetId);
    if(!source)throw Error("사용자 GLB 원본이 없습니다: "+assetId);
    root.add(instantiateLibraryAsset(source));
    root.name=source.file.name.replace(/\.glb$/i,"")+" #"+id;
  }
  else lightFixture(root,kind);
  return root;
}
export function extraLight(root) {
  if(!root)return null;
  return root.children.find(item=>item.isLight)||null;
}
export function serializeExtras(container) {
  return container.children.map(root=>{
    const light=extraLight(root);
    return {
      id:root.userData.extraId,
      kind:root.userData.extraKind,
      appearanceVersion:root.userData.appearanceVersion || 1,
      ...(root.userData.extraKind==="custom-glb"?{assetId:root.userData.assetId}:{}),
      hidden:root.userData.layerHidden === true,
      selectionLocked:root.userData.layerLocked === true,
      transform:{
        p:root.position.toArray(),
        r:root.rotation.toArray().slice(0,3),
        s:root.scale.toArray()
      },
      ...(light?{power:light.intensity,color:"#"+light.color.getHexString()}: {})
    };
  });
}
export function validateExtras(extras) {
  if(!Array.isArray(extras)||extras.length>120)return false;
  const ids=new Set();
  for(const x of extras) {
    if(!x||!EXTRA_TYPES.includes(x.kind)||!Number.isInteger(x.id)||x.id<1||ids.has(x.id))return false;
    if(x.appearanceVersion !== undefined && ![1,2].includes(x.appearanceVersion))return false;
    if(x.kind==="custom-glb" && !/^lib[1-9]\d{0,4}$/.test(x.assetId||""))return false;
    if(x.hidden !== undefined && typeof x.hidden !== "boolean")return false;
    if(x.selectionLocked !== undefined && typeof x.selectionLocked !== "boolean")return false;
    ids.add(x.id);
    const t=x.transform;
    if(!t||!["p","r","s"].every(k=>Array.isArray(t[k])&&t[k].length===3&&
      t[k].every(v=>typeof v==="number"&&Number.isFinite(v)&&Math.abs(v)<100000)))return false;
    if(t.s.some(v=>v<=0.00001||v>1000))return false;
    if(x.power!==undefined&&(!Number.isFinite(x.power)||x.power<0||x.power>100))return false;
    if(x.color!==undefined&&!/^#[\da-f]{6}$/i.test(x.color))return false;
  }
  return true;
}
export function restoreExtras(container,entries,library=null) {
  if(!validateExtras(entries))throw Error("Invalid scene extras");
  container.clear();
  for(const x of entries){
    const root=makeExtra(x.kind,x.id,x.appearanceVersion || 1,x.assetId||null,library);
    root.userData.layerHidden = x.hidden === true;
    root.userData.layerLocked = x.selectionLocked === true;
    root.position.fromArray(x.transform.p);
    root.rotation.set(...x.transform.r);
    root.scale.fromArray(x.transform.s);
    const light=extraLight(root);
    if(light){
      if(x.power!==undefined)light.intensity=x.power;
      if(x.color)light.color.set(x.color);
    }
    container.add(root);
  }
}
export function setEditorGizmosVisible(container,visible){
  container.traverse(o=>{if(o.userData.editorOnly)o.visible=visible;});
}
