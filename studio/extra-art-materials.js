import {makeMaterial,validMaterialConfig} from "./rendering.js";

// Render-only, per-instance overrides. Source GLB/OBJ meshes and materials
// are never mutated; each placed root retains independent appearance.
const originalByRoot=new WeakMap();
const overridesByRoot=new WeakMap();
export function applyExtraArtworkMaterial(root,config){
  if(root?.userData?.extraKind!=="custom-glb")return false;
  if(!validMaterialConfig(config))throw Error("추가 작품 재질 설정이 올바르지 않습니다.");
  const meshes=[];
  root.traverse(o=>{if(o.isMesh)meshes.push(o);});
  let originals=originalByRoot.get(root);
  if(!originals){
    originals=new Map(meshes.map(o=>[o,o.material]));
    originalByRoot.set(root,originals);
  }
  for(const [mesh,material] of originals)mesh.material=material;
  for(const material of overridesByRoot.get(root)||[])material.dispose();
  const made=[];
  if(config.preset!=="original"){
    for(const mesh of meshes){
      const old=originals.get(mesh);
      const replacement=(Array.isArray(old)?old:[old]).map(()=>
        makeMaterial(config.preset,config.color,config.tuning||null));
      made.push(...replacement);
      mesh.material=Array.isArray(old)?replacement:replacement[0];
    }
  }
  overridesByRoot.set(root,made);
  root.userData.materialOverride=config.preset==="original"?null:structuredClone(config);
  return true;
}
export function extraArtworkMaterial(root){
  return root?.userData?.materialOverride
    ?structuredClone(root.userData.materialOverride)
    :{preset:"original",color:"#d0d6db"};
}
