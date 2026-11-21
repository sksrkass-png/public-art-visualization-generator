// AXOO v3.4: conservative ASCII DXF 2D reference renderer.
// This is NOT a CAD solid converter, BIM parser, or survey-certified drawing.
export const DXF_MAX_BYTES = 24 * 1024 * 1024;
export const DXF_DRAWABLE = Object.freeze(["LINE", "LWPOLYLINE", "CIRCLE", "ARC"]);
const KNOWN_UNITS = Object.freeze({1:"inch",2:"ft",4:"mm",5:"cm",6:"m"});
const MAX_DRAWING_ENTITIES = 30000;
const MAX_SEGMENTS = 180000;
const valid = n => Number.isFinite(n) && Math.abs(n)<1e9;
function val(fields,code,fallback=NaN){
  const item=fields.find(([k])=>k===code);
  return item?Number(item[1]):fallback;
}
function field(fields,code,fallback=""){
  return fields.find(([k])=>k===code)?.[1]??fallback;
}
function xy(fields,prefix){
  const x=val(fields,prefix),y=val(fields,prefix+10);
  if(!valid(x)||!valid(y))throw Error("DXF 좌표가 잘못되었습니다.");
  return [x,y];
}
function lwpoints(fields){
  const pts=[];
  let next=null;
  for(const [k,s] of fields){
    if(k===10){next=[Number(s),NaN];pts.push(next);}
    else if(k===20 && next){next[1]=Number(s);}
    else if(k===42 && Math.abs(Number(s))>1e-10)
      throw Error("DXF BULGE 곡선은 정확한 CAD 변환을 위해 GLB로 변환해 주세요.");
  }
  if(pts.some(p=>!p.every(valid)))throw Error("DXF LWPOLYLINE 좌표가 잘못되었습니다.");
  return pts;
}
export function parseDXF2D(text){
  if(typeof text!=="string" || text.length<20 || text.length>DXF_MAX_BYTES)
    throw Error("ASCII DXF는 24MB 이하만 지원합니다.");
  if(text.startsWith("AutoCAD Binary DXF"))
    throw Error("Binary DXF는 지원하지 않습니다. ASCII DXF로 다시 저장하세요.");
  const lines=text.replace(/^\uFEFF/,"").split(/\r\n|\r|\n/);
  if(lines.length%2!==0 && lines[lines.length-1]==="")lines.pop();
  if(lines.length%2!==0)throw Error("DXF 코드-값 쌍이 불완전합니다.");
  let section="",sectionPending=false,current=null,headerUnitPending=false,insunits=0,entityCount=0;
  const segments=[],unsupported=new Map();
  let count=0;
  const add=(a,b,layer)=>{
    if(segments.length>=MAX_SEGMENTS)throw Error("DXF 선분이 너무 많습니다. 도면을 경량화해 주세요.");
    if(a.every(valid)&&b.every(valid)&&Math.hypot(b[0]-a[0],b[1]-a[1])>1e-9)
      segments.push({a,b,layer});
  };
  function flush(){
    if(!current)return;
    entityCount++;
    if(entityCount>MAX_DRAWING_ENTITIES)throw Error("DXF 객체 30,000개 초과: 먼저 도면을 경량화하세요.");
    const {type,fields}=current;
    const layer=String(field(fields,8,"CAD")).slice(0,80);
    if(type==="LINE")add(xy(fields,10),xy(fields,11),layer);
    else if(type==="LWPOLYLINE"){
      const pts=lwpoints(fields);
      for(let i=1;i<pts.length;i++)add(pts[i-1],pts[i],layer);
      if((val(fields,70,0)&1)&&pts.length>2)add(pts[pts.length-1],pts[0],layer);
    }else if(type==="CIRCLE"||type==="ARC"){
      const [cx,cy]=xy(fields,10),radius=val(fields,40);
      if(!valid(radius)||radius<=0)throw Error("DXF 원호 반지름이 잘못되었습니다.");
      let start=type==="ARC"?val(fields,50):0;
      let end=type==="ARC"?val(fields,51):360;
      if(!valid(start)||!valid(end))throw Error("DXF 호 각도가 잘못되었습니다.");
      if(end<start)end+=360;
      const sweep=type==="CIRCLE"?360:Math.min(360,end-start);
      const steps=Math.max(8,Math.min(128,Math.ceil(sweep/7.5)));
      let last=null;
      for(let i=0;i<=steps;i++){
        const angle=(start+sweep*i/steps)*Math.PI/180;
        const point=[cx+Math.cos(angle)*radius,cy+Math.sin(angle)*radius];
        if(last)add(last,point,layer);
        last=point;
      }
    }else if(!["SEQEND","VERTEX","POLYLINE","ENDSEC","ENDBLK"].includes(type)){
      unsupported.set(type,(unsupported.get(type)||0)+1);
    }
    current=null;
  }
  for(let i=0;i+1<lines.length;i+=2){
    const code=Number(lines[i].trim()),content=lines[i+1].trim();
    if(!Number.isInteger(code))throw Error("DXF 데이터 코드가 올바르지 않습니다.");
    if(code===0&&content==="SECTION"){flush();sectionPending=true;section="";continue;}
    if(sectionPending&&code===2){section=content.toUpperCase();sectionPending=false;continue;}
    if(code===0&&content==="ENDSEC"){flush();section="";continue;}
    if(section==="HEADER"){
      if(code===9)headerUnitPending=content==="$INSUNITS";
      else if(headerUnitPending&&code===70){insunits=Number(content);headerUnitPending=false;}
    }
    if(section!=="ENTITIES")continue;
    if(code===0){flush();if(content!=="EOF")current={type:content.toUpperCase(),fields:[]};continue;}
    if(current)current.fields.push([code,content]);
  }
  flush();
  if(!segments.length)
    throw Error("표시 가능한 DXF 2D 선분이 없습니다. 블록·3D 솔리드 또는 다른 CAD 객체라면 GLB로 변환하세요.");
  const unsupportedList=[...unsupported.entries()].map(([type,n])=>type+" "+n+"개");
  return {segments,unit:KNOWN_UNITS[insunits]||"unknown",insunits,
    entityCount,unsupported:unsupportedList,
    warning:unsupportedList.length ? "일부 CAD 객체 미표시: "+unsupportedList.join(", ")+" · 완전한 공간 모델이 필요하면 GLB 변환" : ""};
}
export function buildDXFReference(drawing,THREE){
  const segments=drawing.segments;
  let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
  for(const seg of segments){
    for(const p of [seg.a,seg.b]){
      minX=Math.min(minX,p[0]);maxX=Math.max(maxX,p[0]);
      minY=Math.min(minY,p[1]);maxY=Math.max(maxY,p[1]);
    }
  }
  const span=Math.max(maxX-minX,maxY-minY,1);
  const stroke=Math.min(Math.max(span*0.00012,0.001),span*0.002);
  const byLayer=new Map();
  for(const segment of segments){
    const layer=segment.layer;
    if(!byLayer.has(layer))byLayer.set(layer,[]);
    const [x0,z0]=segment.a,[x1,z1]=segment.b;
    const dx=x1-x0,dz=z1-z0,len=Math.hypot(dx,dz);
    if(len<1e-9)continue;
    const sx=-dz/len*stroke/2,sz=dx/len*stroke/2;
    const y=stroke/3;
    const a=[x0+sx,y,z0+sz],b=[x0-sx,y,z0-sz];
    const c=[x1+sx,y,z1+sz],d=[x1-sx,y,z1-sz];
    byLayer.get(layer).push(...a,...b,...c,...c,...b,...d);
  }
  const root=new THREE.Group();root.name="DXF 2D CAD Reference";
  for(const [layer,positions] of byLayer){
    if(!positions.length)continue;
    const geom=new THREE.BufferGeometry();
    geom.setAttribute("position",new THREE.Float32BufferAttribute(positions,3));
    geom.computeVertexNormals();
    const material=new THREE.MeshBasicMaterial({color:0x45515f,side:THREE.DoubleSide});
    const mesh=new THREE.Mesh(geom,material);
    mesh.name="DXF · "+layer;mesh.userData.cadLayer=layer;
    mesh.userData.cadReferenceOnly=true;
    mesh.castShadow=false;mesh.receiveShadow=false;
    root.add(mesh);
  }
  root.userData.cadReferenceOnly=true;
  root.userData.cadUnit=drawing.unit;
  root.userData.cadImportWarning=drawing.warning||"DXF는 2D 선 도면 참조용이며 건축물·바닥의 실제 3D 형상이 아닙니다.";
  return root;
}
