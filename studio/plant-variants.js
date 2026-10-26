import * as THREE from "three";

// v3.2 source-safe procedural planting: deliberately repeatable, approximate
// silhouettes for visual scale, NOT botanically surveyed or imported source.
// v3.1 and older A variants are maintained unchanged in extras.js.
export const NEW_PLANT_VARIANTS=Object.freeze([
  "tree-round-b","tree-round-c",
  "tree-cone-b","tree-cone-c",
  "tree-birch-b","tree-birch-c",
  "tree-maple-a","tree-maple-b","tree-maple-c",
  "tree-cherry-a","tree-cherry-b","tree-cherry-c",
  "shrub-b","shrub-c","shrub-flower-b","shrub-flower-c"
]);
export const PLANT_VARIANT_PROFILES=Object.freeze({
  "tree-round-b":{family:"deciduous",shape:"wide-forked",height:4.6},
  "tree-round-c":{family:"deciduous",shape:"upright-columnar",height:5.6},
  "tree-cone-b":{family:"conifer",shape:"narrow-tapered",height:5.3},
  "tree-cone-c":{family:"conifer",shape:"open-tiered",height:5.3},
  "tree-birch-b":{family:"birch",shape:"three-trunk-clump",height:5.9},
  "tree-birch-c":{family:"birch",shape:"leaning-full-canopy",height:6.0},
  "tree-maple-a":{family:"maple",shape:"upright-green-canopy",height:4.3},
  "tree-maple-b":{family:"maple",shape:"broad-crimson-canopy",height:4.2},
  "tree-maple-c":{family:"maple",shape:"asymmetric-orange-canopy",height:4.0},
  "tree-cherry-a":{family:"cherry",shape:"round-pink-blossoms",height:5.0},
  "tree-cherry-b":{family:"cherry",shape:"spreading-pale-blossoms",height:4.5},
  "tree-cherry-c":{family:"cherry",shape:"weeping-blossom-branches",height:5.1},
  "shrub-b":{family:"shrub",shape:"low-wide-hedge",height:.9},
  "shrub-c":{family:"shrub",shape:"natural-asymmetrical",height:1.45},
  "shrub-flower-b":{family:"flower-shrub",shape:"low-wide-mixed-bloom",height:1.0},
  "shrub-flower-c":{family:"flower-shrub",shape:"loose-upright-bloom",height:1.4}
});
const brown=0x735741,birch=0xe9e6df;
const leafy=[0x628b54,0x547947,0x7ca36c,0x456f50,0x8da875];
const mapleGreen=[0x638942,0x769a54,0x527647,0x8ca653];
const mapleRed=[0x9a392f,0xbb523d,0xa94730,0xcf7349];
const mapleOrange=[0xb56330,0xd18137,0xa94f2a,0xdb9950];
const cherryPink=[0xedb7c7,0xe8a5bb,0xf4c8d2,0xd991ae];
const cherryPale=[0xf7dce1,0xf2c8d3,0xe9d1d8,0xf8e6e6];
const cherryWhite=[0xf3e6ea,0xe5b8c9,0xf6cad8,0xeacbd9];
function physical(color,roughness=.92){
  return new THREE.MeshStandardMaterial({color,roughness,metalness:0});
}
function primitive(root,geometry,color,name,casts=true){
  const m=new THREE.Mesh(geometry,physical(color));
  m.name=name;m.castShadow=casts;m.receiveShadow=true;
  root.add(m);return m;
}
function limb(root,start,end,radius=.1,color=brown,name="Branch"){
  const from=new THREE.Vector3(...start),to=new THREE.Vector3(...end);
  const delta=to.clone().sub(from),length=delta.length();
  if(length<.01)return null;
  const m=primitive(root,new THREE.CylinderGeometry(radius*.57,radius,length,8),
    color,name);
  m.position.copy(from).add(to).multiplyScalar(.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());
  return m;
}
function crown(root,x,y,z,rx,ry,rz,color,name="Canopy"){
  const m=primitive(root,new THREE.IcosahedronGeometry(1,1),color,name);
  m.position.set(x,y,z);m.scale.set(rx,ry,rz);return m;
}
function canopy(root,parts,colors,name="Canopy"){
  parts.forEach(([x,y,z,rx,ry,rz],i)=>{
    crown(root,x,y,z,rx,ry,rz,colors[i%colors.length],name+" "+(i+1));
  });
}
function bark(root,start,end,radius=.12,white=false){
  const tree=limb(root,start,end,radius,white?birch:brown,white?"Birch trunk":"Trunk");
  if(!white||!tree)return;
  // Painted birch bands are fixed coordinates, never random at reload.
  const direction=new THREE.Vector3(...end).sub(new THREE.Vector3(...start));
  for(let i=1;i<=4;i++){
    const y=start[1]+(end[1]-start[1])*i/5;
    const x=start[0]+(end[0]-start[0])*i/5;
    const z=start[2]+(end[2]-start[2])*i/5;
    const spot=primitive(root,new THREE.BoxGeometry(radius*1.55,.034,.014),
      0x373b39,"Birch bark band",false);
    spot.position.set(x,y,z+radius*.93);
  }
}
function branchNet(root,points,baseY=2.0,branchColor=brown){
  points.forEach(([x,y,z],i)=>limb(root,[0,baseY-i*.07,0],[x,y,z],
    .095-(i%3)*.013,branchColor));
}
function blooms(root,parts,colors,qty,seed){
  for(let i=0;i<qty;i++){
    const c=parts[i%parts.length],a=(i*2.399963+seed),r=.31+((i*13+seed)%11)/16;
    const x=c[0]+Math.sin(a)*c[3]*r;
    const y=c[1]+Math.cos(a*.9)*c[4]*r;
    const z=c[2]+Math.cos(a)*c[5]*r;
    const p=primitive(root,new THREE.IcosahedronGeometry(.06+(i%3)*.018,0),
      colors[(i+seed)%colors.length],"Flower blossom",false);
    p.position.set(x,y,z);
  }
}
function shrubbery(root,kind){
  const wide=kind.endsWith("-b");
  const flower=kind.startsWith("shrub-flower");
  const parts=wide?[
    [-.86,.48,.02,.65,.42,.6],[-.28,.57,.16,.64,.45,.58],
    [.53,.52,-.18,.72,.41,.59],[1.08,.44,.27,.49,.34,.47],
    [.03,.39,-.57,.62,.31,.52]
  ]:[
    [-.58,.62,.12,.45,.54,.52],[.19,.84,-.36,.52,.68,.43],
    [.78,.70,.41,.42,.52,.53],[-.95,.48,-.47,.38,.36,.39],
    [.24,.45,.67,.53,.38,.47],[.62,1.04,-.08,.34,.42,.33]
  ];
  const greens=flower?[0x547a40,0x779a53,0x648044,0x486e45]:leafy;
  for(let i=0;i<parts.length;i++){
    const c=parts[i];
    limb(root,[c[0]*.5,.05,c[2]*.4],[c[0],c[1],c[2]],.032,0x807050,"Twig");
  }
  canopy(root,parts,greens,"Shrub foliage");
  if(flower)blooms(root,parts,wide?cherryPink:[0xeaad83,0xf6d2dc,0xf4e5aa,0xe4a0c1],
    wide?23:26,wide?5:12);
}
function conifer(root,kind){
  if(kind==="tree-cone-b"){
    bark(root,[0,0,0],[0,5.0,0],.135);
    const layers=[[1.05,.67,1.7],[1.85,.59,1.65],[2.65,.49,1.52],
      [3.43,.35,1.36],[4.14,.24,1.08]];
    layers.forEach(([y,r,h],i)=>{
      const m=primitive(root,new THREE.ConeGeometry(r,h,11),
        [0x294a41,0x426a4a,0x315843,0x50774e][i%4],"Narrow evergreen tier");
      m.position.set(.035*Math.sin(i*1.4),y+.21,.015*i);
    });
  } else {
    bark(root,[0,0,0],[.08,5.0,.04],.18);
    const arms=[[1.05,1.85,.15],[2.0,2.65,-.22],
      [3.05,3.5,.12],[4.13,4.6,-.14]];
    arms.forEach(([y,x,z],i)=>{
      const spread=1.55-i*.29;
      for(const sign of [-1,1]){
        limb(root,[0,y,0],[sign*spread,y+.17,z],.073,0x685f47,"Exposed conifer limb");
        const m=primitive(root,new THREE.ConeGeometry(.48-i*.065,.87-i*.08,10),
          [0x476b52,0x325845,0x527a54][i%3],"Separate needle cluster");
        m.position.set(sign*spread*.73,y+.26,z);
      }
    });
    const apex=primitive(root,new THREE.ConeGeometry(.31,.95,10),
      0x375d49,"Evergreen apex");
    apex.position.y=4.84;
  }
}
function birchTreeVariant(root,kind){
  if(kind==="tree-birch-b"){
    const trunks=[[[0,0,0],[-.42,4.7,.11]],
      [[.19,0,.13],[.72,4.1,.34]],
      [[-.15,0,-.13],[-.18,5.2,-.38]]];
    trunks.forEach(([from,to])=>bark(root,from,to,.105,true));
    const parts=[[-.72,4.55,.2,.67,.84,.64],
      [-.15,5.32,-.38,.58,.72,.56],[.78,4.1,.28,.68,.69,.65],
      [.2,4.6,-.23,.52,.68,.57],[-.27,3.9,.18,.59,.58,.56]];
    canopy(root,parts,[0x8ea97c,0xa1ba8d,0x799c73],"Birch foliage");
  }else{
    bark(root,[0,0,0],[.75,4.95,.2],.165,true);
    branchNet(root,[[-.55,4.0,.4],[-1.2,4.5,-.3],[1.62,4.8,.38],
      [.8,5.65,-.38]],3.5,birch);
    const parts=[[-.62,4.0,.27,.77,.68,.72],[-1.1,4.45,-.25,.76,.77,.64],
      [.69,5.2,.25,.91,.85,.75],[1.65,4.78,.38,.68,.75,.73],
      [.72,5.87,-.37,.61,.63,.62],[0,4.66,-.6,.59,.65,.56]];
    canopy(root,parts,[0x85a87b,0xa2c18d,0x789b76],"Full birch canopy");
  }
}
function broadleaf(root,kind){
  if(kind==="tree-round-b"){
    bark(root,[0,0,0],[-.35,2.85,0],.2);
    bark(root,[0,.9,0],[.73,3.07,-.06],.16);
    const parts=[[-1.27,3.33,.18,1.02,.72,.93],
      [-.22,3.66,-.38,1.12,.83,.85],[.92,3.42,.18,1.01,.75,.97],
      [1.4,3.18,-.45,.62,.60,.62]];
    branchNet(root,[[-1.17,3.22,.2],[-.30,3.6,-.4],[.96,3.36,.2]],2.3);
    canopy(root,parts,leafy,"Forked broadleaf crown");
  }else{
    bark(root,[0,0,0],[0,4.3,0],.175);
    const parts=[[0,4.95,0,.79,1.04,.79],
      [-.5,4.25,.1,.53,.87,.50],[.43,4.28,-.16,.56,.88,.49],
      [.06,3.40,.35,.54,.79,.48],[-.23,5.51,-.18,.45,.55,.44]];
    branchNet(root,[[-.45,4.6,.03],[.38,4.47,-.17],[.03,5.22,.04]],3.6);
    canopy(root,parts,[0x477d51,0x79a15a,0x568456],"Columnar broadleaf crown");
  }
}
function maple(root,kind){
  const version=kind.slice(-1);
  const color=version==="a"?mapleGreen:version==="b"?mapleRed:mapleOrange;
  bark(root,[0,0,0],[version==="c"?.16:0,2.25,0],.20,);
  let ends,parts;
  if(version==="a"){
    ends=[[-.80,3.1,.2],[.72,3.14,-.3],[0,3.56,.35]];
    parts=[[-.78,3.24,.15,.80,.72,.75],[.78,3.17,-.29,.81,.70,.71],
      [0,3.69,.3,.93,.71,.78],[-.04,3.03,-.55,.67,.64,.65]];
  }else if(version==="b"){
    ends=[[-1.35,2.72,.1],[-.65,3.37,-.65],[1.37,2.76,-.3],[.74,3.31,.6]];
    parts=[[-1.47,2.90,.1,1.02,.56,.82],[-.7,3.54,-.68,.78,.55,.79],
      [.93,3.49,.54,.79,.59,.77],[1.48,2.91,-.32,.96,.61,.93],
      [.08,3.38,-.04,.90,.61,.76]];
  }else{
    ends=[[-1.45,2.72,.1],[-.45,3.36,-.42],[.97,2.7,.36],[1.38,3.2,-.3]];
    parts=[[-1.5,2.61,.1,.89,.53,.78],[-.61,3.55,-.41,.76,.60,.75],
      [.92,2.9,.34,.95,.60,.77],[1.45,3.11,-.29,.66,.52,.64],
      [0,3.23,-.05,.66,.57,.58]];
  }
  ends.forEach((point,i)=>limb(root,[0,1.95-i*.07,0],point,
    .10-(i%2)*.02,0x65513e,"Maple branching"));
  canopy(root,parts,color,"Maple crown");
}
function cherry(root,kind){
  const version=kind.slice(-1),branches=[],parts=[];
  if(version==="a"){
    bark(root,[0,0,0],[0,2.55,0],.205,0x775247);
    branches.push([-.82,3.47,.17],[.80,3.42,-.25],[0,4.1,.3]);
    parts.push([-.89,3.52,.17,.83,.72,.75],[.81,3.45,-.3,.89,.76,.79],
      [0,4.24,.24,.94,.76,.91],[.09,3.31,.58,.75,.75,.76]);
  }else if(version==="b"){
    bark(root,[0,0,0],[0,2.15,0],.19);
    branches.push([-1.56,2.97,.20],[-.69,3.47,-.44],[1.53,2.92,-.27],[.66,3.57,.63]);
    parts.push([-1.63,3.06,.14,.91,.62,.78],[-.78,3.52,-.47,.74,.53,.73],
      [1.47,2.99,-.27,.94,.61,.86],[.73,3.6,.65,.78,.57,.76],
      [0,3.13,.02,.76,.61,.80]);
  }else{
    bark(root,[0,0,0],[.15,3.5,0],.19);
    branches.push([-1.22,3.9,.2],[-.43,4.44,-.46],[1.29,4.15,.13],[.86,3.95,-.46]);
    parts.push([-1.25,3.71,.20,.68,.45,.63],[-.43,4.42,-.46,.64,.56,.64],
      [1.36,3.97,.13,.66,.46,.69],[.85,4.18,-.46,.61,.47,.60],
      [-1.5,2.97,.23,.36,.56,.41],[1.46,3.06,.06,.38,.54,.43]];
    for(const [x,y,z] of branches){
      limb(root,[x,y,z],[x*1.06,y-.78,z],.045,0x72594f,"Cherry hanging twig");
    }
  }
  for(const [x,y,z] of branches)limb(root,[0,2.3,0],[x,y,z],.086,0x755949,"Cherry branch");
  const petals=version==="a"?cherryPink:version==="b"?cherryPale:cherryWhite;
  canopy(root,parts,petals,"Cherry blossom cloud");
  blooms(root,parts,petals,version==="c"?31:26,version==="a"?3:version==="b"?9:17);
}
export function addPlantVariant(root,kind){
  if(!NEW_PLANT_VARIANTS.includes(kind))throw Error("Unknown plant variant: "+kind);
  root.userData.botanicalPreview=true;
  if(kind.startsWith("tree-round-"))broadleaf(root,kind);
  else if(kind.startsWith("tree-cone-"))conifer(root,kind);
  else if(kind.startsWith("tree-birch-"))birchTreeVariant(root,kind);
  else if(kind.startsWith("tree-maple-"))maple(root,kind);
  else if(kind.startsWith("tree-cherry-"))cherry(root,kind);
  else shrubbery(root,kind);
}
