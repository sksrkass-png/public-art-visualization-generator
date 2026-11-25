import * as THREE from "three";
import { instantiateLibraryAsset } from "./assets.js";
import { addBlackNameplate } from "./nameplate-asset.js";
import { addSlopedStoneNameplate } from "./sloped-nameplates.js";
import {NEW_PLANT_VARIANTS,addPlantVariant} from "./plant-variants.js";
import { clone as cloneSkeleton } from "three/addons/utils/SkeletonUtils.js";
import {SPATIAL_FINISHES,validSpatialFinish} from "./spatial-visuals.js";

// Procedural planting is intentionally schematic rather than a claim of true
// botanical/photogrammetry accuracy. All extras are independent editables.
export const EXTRA_TYPES = Object.freeze(["tree-natural","tree-grove","tree-round", "tree-cone", "shrub", "tree-autumn",
  ...NEW_PLANT_VARIANTS,
  "person-standing", "person-man", "person-woman", "shrub-flower", "park-bench", "round-planter",
  "tree-birch", "grass-patch", "lawn-tile", "walkway-tile", "black-nameplate", "sloped-black-nameplate", "sloped-silver-nameplate", "car-sedan", "bollard", "custom-glb", "artwork-copy", "point-light", "spot-light", "plinth",
  "modular-wall","retail-shelf","display-podium","brand-counter","media-screen","signage-totem","experience-kiosk"]);

// Reuse GPU geometry/materials for hundreds of repeated botanical props.
// Clone the hierarchy only: each placed root retains its own transform,
// object identity, selection and serializable kind. Old versions keep their
// exact original geometry/color/proportions.
const PLANT_TEMPLATE_KINDS=new Set([
  "tree-natural","tree-grove","tree-round","tree-cone","tree-birch","tree-autumn","shrub","shrub-flower",
  ...NEW_PLANT_VARIANTS
]);
const plantTemplates=new Map();
function populatePlant(root,kind,appearanceVersion){
  if(NEW_PLANT_VARIANTS.includes(kind))addPlantVariant(root,kind);
  else if(kind==="tree-natural"||kind==="tree-grove")naturalBranchTree(root,kind==="tree-grove");
  else if(kind==="tree-round")(appearanceVersion===1?legacyTreeRound:treeRound)(root);
  else if(kind==="tree-cone")(appearanceVersion===1?legacyTreeCone:treeCone)(root);
  else if(kind==="shrub")(appearanceVersion===1?legacyShrub:shrub)(root);
  else if(kind==="shrub-flower")flowerShrub(root);
  else if(kind==="tree-birch")birchTree(root);
  else if(kind==="tree-autumn")autumnTree(root);
}
function addCachedPlant(root,kind,appearanceVersion){
  const key=kind+"@"+appearanceVersion;
  let template=plantTemplates.get(key);
  if(!template){
    template=new THREE.Group();
    populatePlant(template,kind,appearanceVersion);
    plantTemplates.set(key,template);
  }
  root.userData.botanicalPreview=NEW_PLANT_VARIANTS.includes(kind);
  // Geometry/material references remain shared; per-instance state is local.
  for(const child of template.children)root.add(child.clone(true));
}

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
// v3.9.5: independent botanical silhouettes; never alter legacy tree geometry.
function naturalBranchTree(root,multiStem=false){
  const bark=0x776350;
  const stem=mesh(new THREE.CylinderGeometry(.12,.22,multiStem?2.75:3.15,10),bark);
  stem.position.y=(multiStem?2.75:3.15)/2;
  if(multiStem)stem.rotation.z=-.12;
  root.add(stem);
  const forks=multiStem?[
    [[0,1.45,0],[-1.15,3.55,.3],.13],
    [[.08,1.5,0],[.96,3.8,-.45],.12],
    [[0,2.1,0],[.24,4.65,.65],.1],
    [[-.54,2.7,.15],[-1.45,4.15,.6],.055],
    [[.45,2.8,-.2],[1.68,4.55,-.46],.055]
  ]:[
    [[0,1.7,0],[-1.3,3.85,.25],.13],
    [[0,2.0,0],[1.35,4.1,-.5],.12],
    [[0,2.45,0],[-.3,4.75,.65],.09],
    [[-.6,3.15,.12],[-1.65,4.35,.65],.058],
    [[.7,3.25,-.24],[1.85,4.62,-.8],.052]
  ];
  const centers=[];
  for(const [start,end,radius] of forks){
    const from=new THREE.Vector3(...start),to=new THREE.Vector3(...end);
    const direction=to.clone().sub(from),length=direction.length();
    const branch=mesh(new THREE.CylinderGeometry(radius*.38,radius,length,8),bark);
    branch.position.copy(from).add(to).multiplyScalar(.5);
    branch.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),direction.normalize());
    root.add(branch);
    centers.push([end[0],end[1],end[2],radius>.08?.72:.47]);
  }
  for(let i=0;i<centers.length;i++){
    const [x,y,z,r]=centers[i];
    const foliage=mesh(new THREE.IcosahedronGeometry(r,2),LEAF_COLORS[(i+(multiStem?2:0))%LEAF_COLORS.length]);
    foliage.position.set(x,y,z);foliage.scale.set(1.2,.85,1.05);root.add(foliage);
  }
  detailFoliage(root,centers,26,multiStem?17:11);
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
function flowerShrub(root){
  shrub(root);
  for(let i=0;i<13;i++){
    const t=i*2.39996,rad=.35+(i%4)*.12;
    const bloom=mesh(new THREE.SphereGeometry(.075+(i%3)*.012,10,8),
      [0xe6b6c9,0xf4d4dc,0xe8cc94,0xe3a3b8][i%4]);
    bloom.position.set(Math.cos(t)*rad,.9+(i%5)*.065,Math.sin(t)*rad);
    root.add(bloom);
  }
}

// v2.7 optional real-scale context geometry. These are lightweight illustrative
// proxies, not photogrammetry or replacement of the imported site's landscaping.
function birchTree(root){
  const trunk=mesh(new THREE.CylinderGeometry(.115,.19,5.1,12),0xe8e4d8,.9);
  trunk.position.y=2.55;root.add(trunk);
  for(let i=0;i<9;i++){
    const band=mesh(new THREE.CylinderGeometry(.122-i*.003,.123-i*.003,.045,12),0x414a43);
    band.position.y=.65+i*.45;root.add(band);
  }
  const crowns=[[0,5.1,0,.86],[-.65,4.55,.18,.68],[.55,4.8,-.2,.73],[0,5.9,0,.63]];
  for(const [x,y,z,r] of crowns){
    const branch=mesh(new THREE.IcosahedronGeometry(r,2),0x8cae72,.96);
    branch.position.set(x,y,z);branch.scale.set(1,1.24,1);root.add(branch);
  }
}
function grassPatch(root){
  // One non-indexed mesh for ~60 blades: small renderer draw-call footprint.
  // No opaque lawn plane: existing pathways and imported ground stay visible.
  const vertices=[];
  for(let i=0;i<60;i++){
    const x=((i*37)%59)/59*1.8-.9,z=((i*23)%61)/61*1.8-.9;
    const angle=i*2.39996,dx=Math.cos(angle),dz=Math.sin(angle);
    const height=.12+(i%7)*.028, w=.025+(i%4)*.006;
    const px=x+dx*height*.16,pz=z+dz*height*.16;
    vertices.push(x-dz*w,0,z+dx*w,x+dz*w,0,z-dx*w,px,height,pz);
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute("position",new THREE.Float32BufferAttribute(vertices,3));
  geometry.computeVertexNormals();
  const grass=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({
    color:0x749a5e,roughness:1,side:THREE.DoubleSide
  }));
  grass.name="Grass blades — no ground-surface replacement";
  grass.receiveShadow=true;
  grass.castShadow=false;
  root.add(grass);
}

// 3 × 3 m, 8 cm-thick independent ground-surface elements.
// Never alter or replace imported building/landscape original materials.
export const SURFACE_TILE_SIZE=Object.freeze({width:3,depth:3,thickness:.08});
function surfaceTile(root,kind){
  const grass=kind==="lawn-tile";
  const slab=mesh(new THREE.BoxGeometry(3,.08,3),grass?0x52783f:0xaeb1b0,
    grass?1:.93,0);
  slab.position.y=.04;slab.name=grass?"3×3m artificial lawn surface":"3×3m concrete sidewalk";
  root.add(slab);
  // Layered physical surface, aligned to the top of the 8cm tile.
  if(grass){
    const turf=mesh(new THREE.PlaneGeometry(3,3),0x6b974e,.98,0);
    turf.rotation.x=-Math.PI/2;turf.position.y=.081;
    turf.castShadow=false;turf.name="Grass turf surface";
    root.add(turf);
  }else{
    // Three subtle concrete joints on the top plane: surface is still 3×3m.
    for(const pos of [-.98,.98]){
      const joint=mesh(new THREE.BoxGeometry(.011,.001,3),0x878c89,1);
      joint.position.set(pos,.0808,0);joint.castShadow=false;root.add(joint);
      const cross=mesh(new THREE.BoxGeometry(3,.001,.011),0x878c89,1);
      cross.position.set(0,.0808,pos);cross.castShadow=false;root.add(cross);
    }
  }
}
function carSedan(root){
  // Approx. 1.8m W x 4.5m L x 1.55m H; Z is forward.
  const body=mesh(new THREE.BoxGeometry(1.78,.55,4.45),0x9da8b0,.37,.46);
  body.position.y=.66;root.add(body);
  const bonnet=mesh(new THREE.BoxGeometry(1.72,.13,1.35),0x929ca4,.34,.53);
  bonnet.position.set(0,.98,1.37);root.add(bonnet);
  const cabin=mesh(new THREE.BoxGeometry(1.57,.48,2.20),0x303f48,.28,.28);
  cabin.position.set(0,1.18,-.16);root.add(cabin);
  const roof=mesh(new THREE.BoxGeometry(1.47,.1,1.78),0x9da8b0,.38,.46);
  roof.position.set(0,1.47,-.16);root.add(roof);
  for(const x of [-.92,.92]){
    for(const z of [-1.32,1.33]){
      const wheel=mesh(new THREE.CylinderGeometry(.33,.33,.16,24),0x252729,.97,.1);
      wheel.rotation.z=Math.PI/2;wheel.position.set(x,.33,z);root.add(wheel);
      const hub=mesh(new THREE.CylinderGeometry(.15,.15,.17,20),0xb9c2c6,.45,.72);
      hub.rotation.z=Math.PI/2;hub.position.set(x,.33,z);root.add(hub);
    }
  }
  for(const z of [-2.245,2.245]){
    for(const x of [-.62,.62]){
      const lamp=mesh(new THREE.BoxGeometry(.32,.13,.035),z>0?0xf6e9c7:0xb74743,.25);
      lamp.position.set(x,.7,z);root.add(lamp);
    }
  }
}
function safetyBollard(root){
  const post=mesh(new THREE.CylinderGeometry(.075,.092,.84,20),0x545c62,.54,.55);
  post.position.y=.42;root.add(post);
  const cap=mesh(new THREE.CylinderGeometry(.09,.09,.06,20),0x282d32,.38,.6);
  cap.position.y=.85;root.add(cap);
  const reflective=mesh(new THREE.CylinderGeometry(.078,.078,.07,20),0xe3ddd0,.32,.08);
  reflective.position.y=.65;root.add(reflective);
}

function personScaled(root,height,color){
  standingPerson(root);
  const children=[...root.children];
  const holder=new THREE.Group();root.add(holder);
  for(const item of children)holder.add(item);
  holder.scale.setScalar(height/1.73);
  for(const child of holder.children)
    if(child.isMesh && child.material.color.getHex()===0x44576a)
      child.material.color.setHex(color);
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
export const PLINTH_MATERIALS=Object.freeze({
  concrete:{color:0xb1b4b3,roughness:.9,metalness:0},
  white:{color:0xeeeeeb,roughness:.78,metalness:0},
  black:{color:0x1f2227,roughness:.45,metalness:.12},
  stone:{color:0x999991,roughness:.7,metalness:0},
  metal:{color:0x8c9499,roughness:.3,metalness:.85}
});
export function applyPlinthShape(root,shape){
  if(root?.userData?.extraKind!=="plinth"||!["box","round"].includes(shape))
    throw Error("유효하지 않은 좌대 형태입니다.");
  const old=root.children.find(child=>child.isMesh);
  if(!old)return;
  old.geometry.dispose();
  old.geometry=shape==="round"
    ?new THREE.CylinderGeometry(.5,.5,1,48):new THREE.BoxGeometry(1,1,1);
  root.userData.plinthShape=shape;
}
export function applyPlinthFinish(root,finish) {
  if(root?.userData?.extraKind!=="plinth"||!Object.hasOwn(PLINTH_MATERIALS,finish))
    throw Error("유효한 기단 마감이 아닙니다.");
  root.userData.plinthFinish=finish;
  const material=root.children.find(child=>child.isMesh)?.material;
  const spec=PLINTH_MATERIALS[finish];
  if(material){material.color.setHex(spec.color);material.roughness=spec.roughness;
    material.metalness=spec.metalness;material.needsUpdate=true;}
}
function lightIcon(root, kind) {
  const icon = new THREE.Mesh(new THREE.SphereGeometry(.19,14,10),
    new THREE.MeshBasicMaterial({color:kind==="spot-light"?0xffcf88:0xfff4b4,depthTest:false,transparent:true,opacity:.85}));
  icon.userData.editorOnly=true;
  icon.name="Editor light marker · not exported";
  icon.renderOrder=1000;
  root.add(icon);
}
// v4: low-profile recessed architectural ground uplight. 240 mm diameter,
// ~55 mm height, compared with previous 400 x 140 mm housing.
// No volumetric ray/cone geometry: night lighting illuminates nearby surfaces
// naturally through the actual SpotLight. Concentric bezel + anti-glare grid.
export const RECESSED_GROUND_LIGHT=Object.freeze({diameter:.24,height:.055});
function recessedGroundHousing(root){
  const housing=new THREE.Mesh(new THREE.CylinderGeometry(.115,.115,.047,32),
    new THREE.MeshStandardMaterial({color:0x32373a,metalness:.72,roughness:.39}));
  housing.position.y=.0235;housing.name="Recessed waterproof lamp housing";
  housing.castShadow=true;housing.receiveShadow=true;root.add(housing);
  const bezel=new THREE.Mesh(new THREE.TorusGeometry(.103,.013,8,44),
    new THREE.MeshStandardMaterial({color:0x5d666b,metalness:.86,roughness:.3}));
  bezel.rotation.x=Math.PI/2;bezel.position.y=.042; // top is flush at 55mm
  bezel.name="Slim brushed steel flush top ring";bezel.castShadow=false;root.add(bezel);
  const darkWell=new THREE.Mesh(new THREE.CircleGeometry(.091,40),
    new THREE.MeshStandardMaterial({color:0x131b22,metalness:.18,roughness:.57,side:THREE.DoubleSide}));
  darkWell.rotation.x=-Math.PI/2;darkWell.position.y=.048;
  darkWell.name="Recessed optical well";darkWell.castShadow=false;root.add(darkWell);
  const lens=new THREE.Mesh(new THREE.CircleGeometry(.066,32),
    new THREE.MeshPhysicalMaterial({color:0xd9d2be,roughness:.3,metalness:.04,
      clearcoat:.2,clearcoatRoughness:.34,side:THREE.DoubleSide}));
  lens.rotation.x=-Math.PI/2;lens.position.y=.050;
  lens.name="Recessed warm glass optical lens";lens.castShadow=false;root.add(lens);
  // Flat non-emissive grille protects the lamp, without visual light beams.
  for(const x of [-.038,0,.038]){
    const grille=new THREE.Mesh(new THREE.BoxGeometry(.007,.003,.131),
      new THREE.MeshStandardMaterial({color:0x30373c,metalness:.77,roughness:.42}));
    grille.position.set(x,.053,0);grille.castShadow=false;
    grille.name="Anti-glare slat";root.add(grille);
  }
}
function lightFixture(root,kind,appearanceVersion=2) {
  // v3 point-light is an upward architectural uplight. Existing v1–v2 project
  // lights reopen with the original behavior to protect approved scenes.
  const uplight=kind==="point-light"&&appearanceVersion>=3;
  const recessed=uplight&&appearanceVersion>=4;
  const light=recessed?new THREE.SpotLight(0xffedce,11,10,Math.PI/5,.92,2):
    uplight?new THREE.SpotLight(0xfff1cc,16,12,Math.PI/7,.55,1.5):
    kind==="point-light"?new THREE.PointLight(0xfff4dd,4,0,2):
      new THREE.SpotLight(0xfff4dd,10,20,Math.PI/5,.35,2);
  light.name=kind;
  light.castShadow=true;
  light.shadow.mapSize.set(512,512);
  if(recessed){
    light.position.y=.067;
    const target=new THREE.Object3D();target.position.y=6;
    target.name="Upward light target";root.add(target);light.target=target;
    recessedGroundHousing(root);
  }else if(uplight){
    light.position.y=.17;
    const target=new THREE.Object3D();
    target.position.y=5;root.add(target);light.target=target;
    const beam=new THREE.Mesh(new THREE.ConeGeometry(1.35,4.8,28,1,true),
      new THREE.MeshBasicMaterial({color:0xffecca,transparent:true,opacity:.075,
        depthWrite:false,side:THREE.DoubleSide}));
    beam.rotation.z=Math.PI;
    beam.position.y=2.5;
    beam.name="Visible architectural uplight beam (visual preview)";
    root.add(beam);
    const body=mesh(new THREE.CylinderGeometry(.17,.2,.14,20),0x4c4e50,.38,.75);
    body.position.y=.07;root.add(body);
  } else if(kind==="spot-light"){
    const target=new THREE.Object3D();
    target.position.set(0,-5,0);
    target.name="Spot target";
    root.add(target);light.target=target;
  }
  root.add(light);
  // The old 38cm debug globe would obscure a 24cm realistic flush lamp.
  if(!recessed)lightIcon(root,kind);
  return light;
}
export function upgradeGroundLight(root){
  if(root?.userData?.extraKind!=="point-light" ||
    (root.userData.appearanceVersion||1)>=4)
    throw Error("업그레이드 가능한 기존 바닥조명을 선택해 주세요.");
  const old=extraLight(root),oldPower=old?.intensity??11;
  const oldColor=old?.color?.clone();
  // This function is invoked explicitly by the user on an unlocked scene.
  for(const child of [...root.children]){
    root.remove(child);
    child.traverse(o=>{
      if(o.isMesh){
        o.geometry?.dispose();
        if(Array.isArray(o.material))o.material.forEach(m=>m.dispose());
        else o.material?.dispose();
      }
      if(o.isLight)o.shadow?.dispose?.();
    });
  }
  root.userData.appearanceVersion=4;
  const light=lightFixture(root,"point-light",4);
  light.intensity=Math.min(20,oldPower);
  if(oldColor)light.color.copy(oldColor);
  return root;
}
// v3.5 - simple schematic spatial/retail fixtures, no third-party IP.
// Geometry origin at floor. These are conceptual placeholders, not fabrication drawings.
const SPATIAL_FIXTURES=new Set(["modular-wall","retail-shelf","display-podium",
  "brand-counter","media-screen","signage-totem","experience-kiosk"]);
function spatialBox(root,w,h,d,x,y,z,color,roughness=.72,metalness=0){
  const object=mesh(new THREE.BoxGeometry(w,h,d),color,roughness,metalness);
  object.position.set(x,y,z);root.add(object);return object;
}
function makeSpatialFixture(root,kind){
  root.userData.schematicSpatialAsset=true;
  root.userData.sourceUnit="m";
  if(kind==="modular-wall"){
    spatialBox(root,3,2.6,.15,0,1.3,0,0xe4e4df,.87);
    spatialBox(root,3,.07,.22,0,.035,0,0x7f8487,.38,.65);
  }else if(kind==="retail-shelf"){
    for(const x of [-.95,.95])spatialBox(root,.065,2,.5,x,1,0,0x565c62,.35,.6);
    for(const y of [.22,.75,1.28,1.8])spatialBox(root,2,.055,.54,0,y,0,0xd7cfc3,.72);
    spatialBox(root,2,.08,.58,0,.04,0,0x5b6065,.5,.4);
  }else if(kind==="display-podium"){
    spatialBox(root,1,.95,1,0,.475,0,0xe7e6e1,.83);
    spatialBox(root,1.05,.045,1.05,0,.973,0,0xfcfcfa,.55);
  }else if(kind==="brand-counter"){
    spatialBox(root,2.4,1.05,.72,0,.525,0,0xe6e3de,.8);
    spatialBox(root,2.55,.055,.85,0,1.08,0,0x787c79,.32,.18);
    spatialBox(root,1.92,.5,.012,0,.63,.37,0x9aa0a3,.73);
  }else if(kind==="media-screen"){
    spatialBox(root,3.15,2.08,.14,0,1.13,0,0x393b3c,.35,.42);
    spatialBox(root,2.96,1.82,.013,0,1.13,.079,0x16242b,.3,.16);
    spatialBox(root,3.35,.085,.45,0,.042,0,0x777c7d,.5,.35);
  }else if(kind==="signage-totem"){
    spatialBox(root,.85,2.25,.23,0,1.125,0,0x252a30,.44,.32);
    spatialBox(root,.72,1.7,.016,0,1.23,.125,0xf4f1eb,.85);
    spatialBox(root,.88,.07,.26,0,.035,0,0x787b7c,.36,.55);
  }else if(kind==="experience-kiosk"){
    spatialBox(root,.72,1.43,.52,0,.715,0,0xd5d8d9,.65,.15);
    spatialBox(root,.59,.76,.013,0,1.06,.268,0x273e45,.24,.1);
    spatialBox(root,.75,.07,.55,0,.035,0,0x545b60,.45,.42);
  }
}
export function makeExtra(kind,id,appearanceVersion=2,assetId=null,library=null,artRoot=null) {
  if(!EXTRA_TYPES.includes(kind))throw Error("Unknown decorative object kind");
  const root=new THREE.Group();
  root.userData.extraKind=kind;
  root.userData.extraId=id;
  root.userData.appearanceVersion=appearanceVersion;
  if(kind==="custom-glb")root.userData.assetId=assetId;
  const plantVariantLabels={
    "tree-round-b":"활엽수 B · 넓게 갈라진 수형",
    "tree-round-c":"활엽수 C · 세로형 수관",
    "tree-cone-b":"침엽수 B · 가느다란 원추형",
    "tree-cone-c":"침엽수 C · 가지 드러난 층형",
    "tree-birch-b":"자작나무 B · 다간형",
    "tree-birch-c":"자작나무 C · 휘어진 풍성형",
    "tree-maple-a":"단풍나무 A · 녹색 수관",
    "tree-maple-b":"단풍나무 B · 넓은 붉은 수관",
    "tree-maple-c":"단풍나무 C · 비대칭 주황 수관",
    "tree-cherry-a":"벚꽃나무 A · 둥근 꽃 수관",
    "tree-cherry-b":"벚꽃나무 B · 퍼지는 수관",
    "tree-cherry-c":"벚꽃나무 C · 늘어진 가지",
    "shrub-b":"덤불 B · 낮게 퍼지는 형",
    "shrub-c":"덤불 C · 비대칭 자연형",
    "shrub-flower-b":"꽃 덤불 B · 넓은 꽃군락",
    "shrub-flower-c":"꽃 덤불 C · 높고 성긴 꽃군락"
  };
  root.name=({ ...plantVariantLabels,"tree-round":"활엽수", "tree-cone":"침엽수", "shrub":"덤불",
    "tree-autumn":"가을 활엽수", "person-standing":"보행자","person-man":"남성 175cm","person-woman":"여성 160cm","shrub-flower":"꽃 덤불", "park-bench":"공원 벤치",
    "round-planter":"화분", "tree-birch":"자작나무", "grass-patch":"잔디 패치",
    "lawn-tile":"3×3m 잔디밭", "walkway-tile":"3×3m 콘크리트 보도", "black-nameplate":"검정 명판", "sloped-black-nameplate":"경사형 검정 석재 명판", "sloped-silver-nameplate":"경사형 석재+실버 명판",
    "car-sedan":"승용차", "bollard":"안전 볼라드",
    "custom-glb":"사용자 GLB", "artwork-copy":"작품 복제",
    "point-light":"포인트 조명","spot-light":"스폿 조명","plinth":"기단",
    "modular-wall":"모듈 가벽 3m","retail-shelf":"리테일 진열대 2m",
    "display-podium":"전시 디스플레이 좌대","brand-counter":"브랜드 운영 카운터",
    "media-screen":"미디어 스크린 3.15m","signage-totem":"사이니지 토템",
    "experience-kiosk":"체험용 키오스크" })[kind]+" #"+id;
  if(PLANT_TEMPLATE_KINDS.has(kind))addCachedPlant(root,kind,appearanceVersion);
  else if(SPATIAL_FIXTURES.has(kind))makeSpatialFixture(root,kind);
  else if(kind==="person-man")personScaled(root,1.75,0x394956);
  else if(kind==="person-woman")personScaled(root,1.6,0xb4847c);
  else if(kind==="person-standing")standingPerson(root);
  else if(kind==="park-bench")parkBench(root);
  else if(kind==="round-planter")roundPlanter(root);
  else if(kind==="grass-patch")grassPatch(root);
  else if(kind==="lawn-tile"||kind==="walkway-tile")surfaceTile(root,kind);
  else if(kind==="black-nameplate")addBlackNameplate(root);
  else if(kind==="sloped-black-nameplate")addSlopedStoneNameplate(root,false);
  else if(kind==="sloped-silver-nameplate")addSlopedStoneNameplate(root,true);
  else if(kind==="car-sedan")carSedan(root);
  else if(kind==="bollard")safetyBollard(root);
  else if(kind==="plinth"){
    // Unit pedestal with bottom at local y=0; root scale is width / height / depth (m).
    const shape=mesh(new THREE.BoxGeometry(1,1,1),0xb1b4b3);
    shape.position.y=.5;
    shape.name="Plinth solid (dimensions via root scale)";
    root.add(shape);
    root.userData.plinthShape="box";
    applyPlinthFinish(root,"concrete");
  }
  else if(kind==="artwork-copy"){
    if(!artRoot?.children?.length)throw Error("원본 작품 모델을 먼저 불러와 주세요.");
    const holder=new THREE.Group();
    for(const child of artRoot.children)holder.add(cloneSkeleton(child));
    root.add(holder);
    root.name="작품 복제 #"+id;
    root.scale.copy(artRoot.scale);
  }
  else if(kind==="custom-glb"){
    const source=library?.get(assetId);
    if(!source)throw Error("사용자 GLB 원본이 없습니다: "+assetId);
    root.userData.assetCategory=source.category;
    root.add(instantiateLibraryAsset(source));
    root.name=source.file.name.replace(/\.glb$/i,"")+" #"+id;
  }
  else lightFixture(root,kind,appearanceVersion);
  return root;
}
const spatialMaterialCache=new WeakMap();
export function applySpatialFinish(root,finish="original",color="#ff3b30"){
  if(!root?.userData?.schematicSpatialAsset)return false;
  if(!validSpatialFinish(finish,color))throw Error("공간 에셋 마감 설정이 올바르지 않습니다.");
  // Keep original independent procedural materials intact; never touch imported GLB.
  let cache=spatialMaterialCache.get(root);
  if(!cache){
    const base=[];
    root.traverse(node=>{if(node.isMesh)base.push([node,node.material]);});
    cache={base,applied:[]};
    spatialMaterialCache.set(root,cache);
  }
  for(const [node,material] of cache.base)node.material=material;
  cache.applied.forEach(material=>material.dispose());
  cache.applied=[];
  const look=SPATIAL_FINISHES[finish];
  if(finish!=="original"){
    const chosen=finish==="brand-accent"?color:look.color;
    for(const [node,material] of cache.base){
      const copy=material.clone();
      copy.color.set(chosen);
      copy.metalness=look.metalness;
      copy.roughness=look.roughness;
      node.material=copy;
      cache.applied.push(copy);
    }
  }
  root.userData.spatialFinish=finish;
  root.userData.spatialFinishColor=color;
  return true;
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
      ...(root.userData.groupId?{groupId:root.userData.groupId}:{}),
      ...(root.userData.extraKind==="plinth"?{finish:root.userData.plinthFinish||"concrete",shape:root.userData.plinthShape||"box",followArtwork:root.userData.followArtwork===true}:{}),
      ...(root.userData.schematicSpatialAsset&&root.userData.spatialFinish&&root.userData.spatialFinish!=="original"?{spatialFinish:root.userData.spatialFinish,spatialFinishColor:root.userData.spatialFinishColor||"#ff3b30"}:{}),
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
  if(!Array.isArray(extras))return false;
  const ids=new Set();
  for(const x of extras) {
    if(!x||!EXTRA_TYPES.includes(x.kind)||!Number.isInteger(x.id)||x.id<1||ids.has(x.id))return false;
    if(x.appearanceVersion !== undefined && ![1,2,3,4].includes(x.appearanceVersion))return false;
    if(x.kind==="custom-glb" && !/^lib[1-9]\d{0,4}$/.test(x.assetId||""))return false;
    if(x.kind==="plinth" && x.shape!==undefined && !["box","round"].includes(x.shape))return false;
    if(x.kind==="plinth" && x.finish!==undefined && !Object.hasOwn(PLINTH_MATERIALS,x.finish))return false;
    if(x.followArtwork!==undefined && (x.kind!=="plinth" || typeof x.followArtwork!=="boolean"))return false;
    if(x.spatialFinish!==undefined && (!SPATIAL_FIXTURES.has(x.kind)||!validSpatialFinish(x.spatialFinish,x.spatialFinishColor)))return false;
    if(x.spatialFinishColor!==undefined && (!SPATIAL_FIXTURES.has(x.kind)||!validSpatialFinish(x.spatialFinish||"original",x.spatialFinishColor)))return false;
    if(x.hidden !== undefined && typeof x.hidden !== "boolean")return false;
    if(x.selectionLocked !== undefined && typeof x.selectionLocked !== "boolean")return false;
    if(x.groupId!==undefined && (!Number.isSafeInteger(x.groupId)||x.groupId<1))return false;
    ids.add(x.id);
    const t=x.transform;
    if(!t||!["p","r","s"].every(k=>Array.isArray(t[k])&&t[k].length===3&&
      t[k].every(v=>typeof v==="number"&&Number.isFinite(v)&&Math.abs(v)<100000)))return false;
    if(t.s.some(v=>v<=0.00001||v>1000))return false;
    if(x.kind==="plinth" && t.s.some(v=>v<.05||v>30))return false;
    if(x.power!==undefined&&(!Number.isFinite(x.power)||x.power<0||x.power>100))return false;
    if(x.color!==undefined&&!/^#[\da-f]{6}$/i.test(x.color))return false;
  }
  return true;
}
export function restoreExtras(container,entries,library=null,artRoot=null) {
  if(!validateExtras(entries))throw Error("Invalid scene extras");
  container.clear();
  for(const x of entries){
    const root=makeExtra(x.kind,x.id,x.appearanceVersion || 1,x.assetId||null,library,artRoot);
    root.userData.layerHidden = x.hidden === true;
    root.userData.layerLocked = x.selectionLocked === true;
    root.userData.groupId=x.groupId||null;
    root.position.fromArray(x.transform.p);
    root.rotation.set(...x.transform.r);
    root.scale.fromArray(x.transform.s);
    if(x.spatialFinish)applySpatialFinish(root,x.spatialFinish,x.spatialFinishColor||"#ff3b30");
    if(x.kind==="plinth"){
      applyPlinthShape(root,x.shape||"box");
      applyPlinthFinish(root,x.finish||"concrete");
      root.userData.followArtwork=x.followArtwork===true;
    }
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
