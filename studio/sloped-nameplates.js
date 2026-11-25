import * as THREE from "three";

// Two NEW independent, serializable scene assets. Existing "black-nameplate"
// geometry, materials, saved projects and MASTER snapshots are unchanged.
// Reference silhouette: 300mm (W) × 200mm (D), 50mm front / 100mm rear.
export const SLOPED_PLAQUE_DIMENSIONS=Object.freeze({
  width:.30,depth:.20,frontHeight:.05,rearHeight:.10
});
const stoneMaterial=new THREE.MeshPhysicalMaterial({
  color:0x16171a,roughness:.58,metalness:.04,clearcoat:.1,clearcoatRoughness:.72
});
let inkBlack=null,inkSilver=null;
function faceMap(silver){
  if(silver&&inkSilver)return inkSilver;
  if(!silver&&inkBlack)return inkBlack;
  const c=document.createElement("canvas");c.width=1200;c.height=800;
  const ctx=c.getContext("2d"),w=c.width,h=c.height;
  ctx.fillStyle=silver?"#bcc6cb":"#1b1c1e";ctx.fillRect(0,0,w,h);
  for(let n=0;n<800;n++){
    const shade=(n*37)%16;
    ctx.fillStyle=silver?"rgba(255,255,255,.055)":"rgba(255,255,255,.018)";
    ctx.fillRect((n*71)%w,(n*191)%h,1+shade%2,1);
  }
  const foreground=silver?"#273039":"#d8d8d7";
  ctx.strokeStyle=silver?"#414d57":"#757576";ctx.lineWidth=3;
  ctx.strokeRect(28,28,w-56,h-56);
  ctx.fillStyle=foreground;ctx.textAlign="center";
  ctx.font="bold 64px sans-serif";ctx.fillText("ARTWORK",w/2,158);
  ctx.font="34px sans-serif";ctx.fillText("작품명 · Artwork Title",w/2,227);
  ctx.textAlign="left";ctx.font="28px sans-serif";
  ["작품의 의미와 제작 의도를 설명하는 명판입니다.",
   "아티스트명, 작품명, 재료 및 제작 연도 등을",
   "프로젝트에 맞게 별도로 표기할 수 있습니다."].forEach((line,i)=>ctx.fillText(line,80,360+i*63));
  ctx.font="bold 25px sans-serif";ctx.fillText("ARTIST  ·  YEAR  ·  MATERIAL",80,675);
  const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;
  tex.anisotropy=4;
  if(silver)inkSilver=tex;else inkBlack=tex;
  return tex;
}
function quadGeometry(a,b,c,d){
  const vertices=[...a,...b,...c,...a,...c,...d];
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute("position",new THREE.Float32BufferAttribute(vertices,3));
  geometry.setAttribute("uv",new THREE.Float32BufferAttribute([0,0,1,0,1,1,0,0,1,1,0,1],2));
  geometry.computeVertexNormals();
  return geometry;
}
function addSolidWedge(root){
  const {width:w,depth:d,frontHeight:f,rearHeight:b}=SLOPED_PLAQUE_DIMENSIONS;
  const zF=d/2,zB=-d/2,xL=-w/2,xR=w/2;
  const bottom=[[xL,0,zF],[xR,0,zF],[xR,0,zB],[xL,0,zB]];
  const top=[[xL,f,zF],[xR,f,zF],[xR,b,zB],[xL,b,zB]];
  // Outward windings give the stone correct sun/shadow normals on every face.
  const pts=[],faces=[
    [top[0],top[1],top[2],top[3]],
    [bottom[0],bottom[3],bottom[2],bottom[1]],
    [bottom[0],bottom[1],top[1],top[0]],
    [bottom[1],bottom[2],top[2],top[1]],
    [bottom[2],bottom[3],top[3],top[2]],
    [bottom[3],bottom[0],top[0],top[3]]
  ];
  for(const [a,bb,c,dd] of faces)pts.push(...a,...bb,...c,...a,...c,...dd);
  const g=new THREE.BufferGeometry();
  g.setAttribute("position",new THREE.Float32BufferAttribute(pts,3));
  g.computeVertexNormals();
  const base=new THREE.Mesh(g,stoneMaterial);
  base.name="Black stone angled wedge · 300×200mm · front 50mm / back 100mm";
  base.castShadow=true;base.receiveShadow=true;root.add(base);
}
function addFace(root,withSilver){
  const {width:w,depth:d,frontHeight:f,rearHeight:b}=SLOPED_PLAQUE_DIMENSIONS;
  const inset=withSilver?.011:.007;
  const offset=withSilver?.0012:.0009;
  if(withSilver){
    // A 1.2mm actual 3D metal sheet, flush with the inclined stone surface.
    // The decal below is merely a print layer: edges and thickness remain real.
    const incline=Math.atan2(b-f,d);
    const sheet=new THREE.Mesh(
      new THREE.BoxGeometry(w-2*inset,.0012,(d-2*inset)/Math.cos(incline)),
      new THREE.MeshStandardMaterial({color:0xadb7bd,metalness:.82,roughness:.36})
    );
    sheet.rotation.x=incline;
    sheet.position.y=(f+b)/2+.00055;
    sheet.name="Brushed stainless inset sheet · actual 1.2mm edge thickness";
    sheet.castShadow=true;sheet.receiveShadow=true;root.add(sheet);
  }
  const xl=-w/2+inset,xr=w/2-inset,zf=d/2-inset,zb=-d/2+inset;
  const y=z=>f+(b-f)*(d/2-z)/d+offset;
  const g=quadGeometry([xl,y(zf),zf],[xr,y(zf),zf],[xr,y(zb),zb],[xl,y(zb),zb]);
  const mat=new THREE.MeshStandardMaterial({
    color:0xffffff,map:faceMap(withSilver),metalness:withSilver?.64:0,
    roughness:withSilver?.43:.79,side:THREE.DoubleSide,
    polygonOffset:true,polygonOffsetFactor:-1
  });
  const plate=new THREE.Mesh(g,mat);
  plate.name=withSilver?"Brushed silver stainless inset plate · bonded to sloped stone":"Dark engraved/printed plaque surface";
  plate.castShadow=false;plate.receiveShadow=true;
  root.add(plate);
  if(withSilver){
    const border=new THREE.LineSegments(
      new THREE.EdgesGeometry(g),
      new THREE.LineBasicMaterial({color:0x59626a,transparent:true,opacity:.78})
    );
    border.position.y=.0005;border.name="Thin silver plaque boundary";root.add(border);
  }
}
export function addSlopedStoneNameplate(root,withSilver=false){
  addSolidWedge(root);
  addFace(root,withSilver);
  root.userData.nameplateConstruction=withSilver?"silver-on-black-stone":"black-stone-only";
}
