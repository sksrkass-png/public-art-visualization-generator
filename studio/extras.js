import * as THREE from "three";

// Procedural planting is intentionally schematic rather than a claim of true
// botanical/photogrammetry accuracy. All extras are independent editables.
export const EXTRA_TYPES = Object.freeze(["tree-round", "tree-cone", "shrub", "point-light", "spot-light"]);

function mesh(geometry, color, roughness = .85, metalness = 0) {
  const o = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color, roughness, metalness }));
  o.castShadow = true;
  o.receiveShadow = true;
  return o;
}
function treeRound(root) {
  const trunk = mesh(new THREE.CylinderGeometry(.2, .28, 2.25, 9), 0x7f6451);
  trunk.position.y = 1.13; root.add(trunk);
  for (const [x,y,z,r] of [[0,3.05,0,1.22],[-.68,2.88,.25,.8],[.67,3.1,.2,.87],[.24,3.85,-.2,.78]]) {
    const b = mesh(new THREE.IcosahedronGeometry(r, 2), 0x6b8863);
    b.position.set(x,y,z); root.add(b);
  }
}
function treeCone(root) {
  const trunk = mesh(new THREE.CylinderGeometry(.16,.24,3.8,8),0x84684f);trunk.position.y=1.9;root.add(trunk);
  for(const [y, radius, height] of [[1.55,1.15,2.25],[2.45,.93,2.15],[3.25,.68,1.65]]) {
    const p=mesh(new THREE.ConeGeometry(radius,height,9),0x4c7863);
    p.position.y=y+height*.23;root.add(p);
  }
}
function shrub(root) {
  for(const [x,y,z,r] of [[0,.65,0,.79],[-.62,.5,.15,.56],[.62,.48,.12,.58],[-.26,.8,-.48,.56],[.32,.76,-.45,.59]]) {
    const b=mesh(new THREE.IcosahedronGeometry(r,1),0x73896b);
    b.position.set(x,y,z);root.add(b);
  }
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
export function makeExtra(kind,id) {
  if(!EXTRA_TYPES.includes(kind))throw Error("Unknown decorative object kind");
  const root=new THREE.Group();
  root.userData.extraKind=kind;
  root.userData.extraId=id;
  root.name=({ "tree-round":"활엽수", "tree-cone":"침엽수", "shrub":"덤불",
    "point-light":"포인트 조명","spot-light":"스폿 조명" })[kind]+" #"+id;
  if(kind==="tree-round")treeRound(root);
  else if(kind==="tree-cone")treeCone(root);
  else if(kind==="shrub")shrub(root);
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
export function restoreExtras(container,entries) {
  if(!validateExtras(entries))throw Error("Invalid scene extras");
  container.clear();
  for(const x of entries){
    const root=makeExtra(x.kind,x.id);
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
