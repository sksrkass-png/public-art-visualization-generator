import * as THREE from "three";

// Source reference: user-provided "명판_접어만든별의비행.glb", inspected
// dimensions 0.30m W × 0.10m H × 0.20m D, dark granite body and printed top.
// Browser-local lightweight schematic: NOT an embedded binary/texture-identical
// copy of the supplied GLB. Original GLB remains importable via custom asset UI.
export const NAMEPLATE_SIZE=Object.freeze({width:.30,height:.10,depth:.20});
let sharedFaceTexture=null;
function faceTexture(){
  if(sharedFaceTexture)return sharedFaceTexture;
  const canvas=document.createElement("canvas");
  canvas.width=1536;canvas.height=1024;
  const ctx=canvas.getContext("2d");
  const w=canvas.width,h=canvas.height;
  ctx.fillStyle="#17181b";ctx.fillRect(0,0,w,h);
  // Repeatable dark-granite flecking, no random visual differences on project restore.
  for(let i=0;i<3500;i++){
    const x=(i*277)%w,y=(i*659)%h;
    const val=25+(i*7)%23;
    ctx.fillStyle="rgba("+val+","+val+","+val+",0.13)";
    ctx.fillRect(x,y,1+(i%3),1+(i%3));
  }
  ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillStyle="#e6e8e9";
  ctx.font="34px sans-serif";
  ctx.fillText("이호준",w/2,99);
  ctx.font="28px sans-serif";
  ctx.fillText("LEE HO JOON",w/2,151);
  ctx.font="bold 71px sans-serif";
  ctx.fillText("접어 만든 별의 비행",w/2,275);
  ctx.font="23px sans-serif";
  ctx.fillText("3,075×2,230×3,100(h)mm / Stainless steel, Urethane paint / January 2027",w/2,366);
  ctx.font="31px sans-serif";
  const lines=[
    "〈접어 만든 별의 비행〉은 종이별과 종이비행기를",
    "별똥별의 궤적으로 연결한 작품이다.",
    "각진 접기 면과 부드럽게 휘어진 새벽의 띠가 어우러져,",
    "상상 속 비행의 순간을 그려낸다.",
    "손끝에서 접어 만든 작은 형상들은 공간 속으로 확장되어",
    "별을 날리고 하늘을 여행하는 상상을 건넨다."
  ];
  lines.forEach((line,i)=>ctx.fillText(line,w/2,472+i*76));
  sharedFaceTexture=new THREE.CanvasTexture(canvas);
  sharedFaceTexture.colorSpace=THREE.SRGBColorSpace;
  sharedFaceTexture.anisotropy=4;
  return sharedFaceTexture;
}

export function addBlackNameplate(root){
  const {width,height,depth}=NAMEPLATE_SIZE;
  const stone=new THREE.MeshPhysicalMaterial({
    color:0x17191c,roughness:.49,metalness:.04,clearcoat:.16,clearcoatRoughness:.65
  });
  // Chamfered pedestal, 300×200×100 mm outer dimensions (ground at y=0).
  const shape=new THREE.Shape();
  const slabWidth=width-.004,slabDepth=depth-.004;
  const x=-slabWidth/2,z=-slabDepth/2,r=.005;
  shape.moveTo(x+r,z);
  shape.lineTo(x+slabWidth-r,z);shape.quadraticCurveTo(x+slabWidth,z,x+slabWidth,z+r);
  shape.lineTo(x+slabWidth,z+slabDepth-r);shape.quadraticCurveTo(x+slabWidth,z+slabDepth,x+slabWidth-r,z+slabDepth);
  shape.lineTo(x+r,z+slabDepth);shape.quadraticCurveTo(x,z+slabDepth,x,z+slabDepth-r);
  shape.lineTo(x,z+r);shape.quadraticCurveTo(x,z,x+r,z);
  const geometry=new THREE.ExtrudeGeometry(shape,{
    depth:height-.008,bevelEnabled:true,bevelThickness:.004,bevelSize:.002,bevelSegments:2,
    curveSegments:2,steps:1
  });
  geometry.rotateX(-Math.PI/2);
  // Created geometry extrusion runs z=0..+height; after -90deg rotation y=0..+height.
  const body=new THREE.Mesh(geometry,stone);
  body.position.y=.004; // bevel bottom flush to y=0, top to y=.10
  body.name="300×200×100mm black granite nameplate base";
  body.castShadow=true;body.receiveShadow=true;
  root.add(body);
  const panel=new THREE.Mesh(new THREE.PlaneGeometry(width-.014,depth-.014),
    new THREE.MeshStandardMaterial({
      color:0xffffff,map:faceTexture(),roughness:.72,metalness:0,
      polygonOffset:true,polygonOffsetFactor:-1
    }));
  panel.rotation.x=-Math.PI/2;
  panel.position.y=height+.0005;
  panel.name="Lee Ho Joon / 접어 만든 별의 비행 — illustrated printed plaque";
  panel.castShadow=false;panel.receiveShadow=true;
  root.add(panel);
}
