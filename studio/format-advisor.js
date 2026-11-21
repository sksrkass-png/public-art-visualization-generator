// AXOO v3.4 - read-only local conversion guidance; no file uploaded or converted.
export const FORMAT_GUIDE = Object.freeze({
  glb:{name:"glTF Binary GLB",support:"direct",target:"GLB 바로 불러오기",
    steps:["현장·작품 불러오기에서 GLB를 선택합니다.","모델의 원본 치수와 텍스처·재질을 확인합니다."],
    warning:"매우 큰 파일이나 압축 텍스처는 브라우저/GPU 사양에 따라 제한될 수 있습니다."},
  gltf:{name:"glTF 2.0",support:"direct",target:"GLTF + BIN + 텍스처",
    steps:["GLTF가 참조하는 BIN·PNG·JPG·WEBP 파일을 함께 선택하거나 ZIP으로 묶습니다.","현장 또는 작품 파일 선택에서 불러옵니다.","원본 치수·재질과 텍스처 누락 여부를 확인합니다."],
    warning:"원본 GLTF가 외부 URL을 참조하면 이 스튜디오에서 차단됩니다."},
  obj:{name:"OBJ 모델",support:"direct",target:"OBJ + MTL + 이미지",
    steps:["OBJ에 연결되는 MTL과 표면 이미지 파일을 함께 선택합니다.","스튜디오에서 가져와 치수·재질을 검토합니다."],
    warning:"MTL 이외의 고급 PBR 셰이더는 완전 재현되지 않을 수 있습니다."},
  fbx:{name:"Autodesk FBX",support:"direct",target:"FBX 바로 불러오기 · GLB 권장",
    steps:["현장·작품 불러오기에서 FBX를 선택합니다.","원본 단위와 축 방향을 확인합니다.","외부 텍스처가 누락되면 텍스처를 포함한 GLB로 다시 내보냅니다."],
    warning:"파일 밖에 있는 FBX 텍스처는 현재 자동 연결되지 않습니다."},
  stl:{name:"STL 메쉬",support:"direct",target:"STL 바로 불러오기",
    steps:["현장·작품에서 STL을 불러옵니다.","STL에 재질이 안정적으로 포함되지 않으므로 실제 표면 사양을 확인합니다."],
    warning:"STL은 원본 색상·텍스처를 보존하는 대표 포맷이 아닙니다."},
  ply:{name:"PLY 메쉬",support:"direct",target:"PLY 바로 불러오기",
    steps:["PLY를 불러오고 치수·정점 색상 여부를 확인합니다."],
    warning:"모든 PLY 재질 체계를 지원하는 것은 아닙니다."},
  dae:{name:"Collada DAE",support:"direct",target:"DAE 바로 불러오기 · GLB 권장",
    steps:["DAE를 불러온 뒤 원본 크기와 재질을 확인합니다.","외부 텍스처 누락 시 GLB로 재내보내기합니다."],
    warning:"외부 참조 텍스처는 자동 연결되지 않습니다."},
  "3ds":{name:"3D Studio 3DS",support:"direct",target:"3DS 바로 불러오기 · GLB 권장",
    steps:["3DS 파일을 불러오고 객체명·메쉬·단위를 검토합니다.","외부 텍스처가 필요하면 GLB로 변환합니다."],
    warning:"레거시 3DS는 이름·재질·정밀도가 제한적일 수 있습니다."},
  skp:{name:"SketchUp",support:"convert",target:"GLB 권장 · FBX/DAE도 가능",
    steps:["SketchUp에서 필요한 공간·건축·가구 레이어만 표시합니다.","사용 가능한 내보내기 포맷(FBX/DAE 등)으로 3D 모델을 내보냅니다.","Blender 등에서 불러온 뒤 glTF 2.0 Binary(.glb)로 내보냅니다.","스케일·원본 색상·표면 방향·텍스처가 일치하는지 다시 확인합니다."],
    warning:"SketchUp 버전과 라이선스에 따라 직접 내보내기 포맷이 다릅니다."},
  blend:{name:"Blender",support:"convert",target:"GLB",
    steps:["필요한 객체를 선택하고 숨김·미사용 컬렉션을 정리합니다.","File > Export > glTF 2.0에서 GLB 형식을 선택합니다.","필요하면 텍스처를 패킹하고 재질 호환성을 검토합니다.","스케일은 미터 기준으로 확인한 후 스튜디오에서 W×D×H를 확인합니다."],
    warning:"Blender 노드 재질·파티클·시뮬레이션은 GLB로 그대로 옮겨지지 않을 수 있습니다."},
  dwg:{name:"AutoCAD DWG",support:"convert",target:"ASCII DXF(2D 참조) 또는 GLB(3D)",
    steps:["평면도 확인 목적이면 CAD에서 ASCII DXF로 저장합니다.","3D 건축·시설 모델이 필요하면 모델의 3D 솔리드를 FBX 등으로 내보내거나 3D 도구를 통해 GLB로 변환합니다.","2D DXF는 LINE·LWPOLYLINE·CIRCLE·ARC를 중심으로 제한적으로 표시됩니다.","단위와 삽입 기준점·층고·실제 건축물 형상은 별도 확인합니다."],
    warning:"DWG 원본을 브라우저에서 직접 해석하지 않습니다. DXF는 3D 건축 모델 대체물이 아닙니다."},
  dxf:{name:"DXF CAD",support:"preview",target:"2D 현장 참조(제한) · 3D는 GLB",
    steps:["ASCII DXF로 저장하고 블록(INSERT)을 분해하거나 2D 선 엔티티만 추출합니다.","현장 불러오기에서 DXF를 선택합니다(작품 3D 파일로는 권장하지 않습니다).","도면 INSUNITS와 실제 현장 치수를 확인합니다.","실제 입체 건축·바닥이 필요하면 GLB를 별도로 준비합니다."],
    warning:"현재 DXF는 2D 선 도면 참조용이며 일부 CAD 객체는 미표시됩니다."},
  "3dm":{name:"Rhino 3DM",support:"direct",target:"3DM 직접 불러오기 · GLB 권장 대안",
    steps:["현장 또는 작품 파일 선택에서 .3dm을 직접 선택합니다.","Rhino 3DM 디코더가 브라우저에서 파일을 처리합니다.","Rhino 문서 단위·메시화 결과·재질을 실제 모델과 비교합니다.","불러오기 오류 또는 외부 텍스처 누락 시 Rhino에서 GLB로 내보냅니다."],
    warning:"처음에는 WebAssembly 디코더가 CDN에서 로드됩니다. 원본 모델은 클라우드로 업로드되지 않습니다."},
  rvt:{name:"Revit RVT",support:"convert",target:"FBX 또는 IFC → GLB",
    steps:["Revit에서 필요한 3D 뷰와 카테고리만 준비합니다.","사용 가능한 FBX 내보내기 또는 IFC 내보내기를 선택합니다.","지원되는 외부 도구에서 GLB로 변환합니다.","건물 입면·원점·실측 치수·재질을 현장 원본과 비교합니다."],
    warning:"GLB는 BIM 속성을 모두 보존하지 않습니다. 원본 RVT/IFC는 별도로 보관하세요."},
  ifc:{name:"IFC BIM",support:"convert",target:"GLB/GLTF",
    steps:["IFC 호환 BIM 뷰어 또는 변환 도구에서 3D 형상을 확인합니다.","필요한 층·건물·객체만 GLB/GLTF로 내보냅니다.","표시된 구조물·장비·바닥이 원본과 일치하는지 확인합니다.","IFC 속성·분류·설계 정보는 원본 파일에서 별도 관리합니다."],
    warning:"BIM 속성 및 의미 정보는 일반 GLB 3D 모델에 자동 보존되지 않습니다."},
  step:{name:"STEP CAD",support:"convert",target:"GLB",
    steps:["Rhino, FreeCAD 등에서 STEP를 열고 실제 치수를 확인합니다.","원본 곡면을 적절한 메시 정밀도로 변환합니다.","GLB 또는 지원되는 메시 형식으로 내보냅니다.","금속·도장 재질과 실제 치수는 스튜디오에서 다시 확인합니다."],
    warning:"NURBS→메시 변환은 설정에 따라 미세한 형상 차이를 만들 수 있습니다."},
  iges:{name:"IGES CAD",support:"convert",target:"GLB",
    steps:["Rhino 또는 CAD 도구에서 IGES를 불러옵니다.","표면 누락 여부와 단위를 확인하고 메시화합니다.","GLB로 내보내고 원본과 치수·형상을 비교합니다."],
    warning:"원본 곡면과 메시 형상은 정확히 같지 않을 수 있습니다."},
  usd:{name:"USD / USDZ",support:"convert",target:"GLB",
    steps:["USD를 지원하는 도구(Blender 등)로 원본을 엽니다.","인스턴스·재질·텍스처의 호환성을 검토합니다.","GLB로 내보낸 후 형상·재질·축 방향을 점검합니다."],
    warning:"USDZ의 압축 텍스처 및 고급 셰이더는 변환 과정에서 일부 변경될 수 있습니다."},
  "3mf":{name:"3MF",support:"convert",target:"GLB 또는 STL",
    steps:["3MF를 지원하는 3D 제작 도구에서 모델을 엽니다.","장치·프린트 설정이 아닌 모델 메쉬를 추출합니다.","GLB(재질 포함) 또는 STL(형상 중심)로 내보냅니다."],
    warning:"STL은 표면 재질 정보를 안정적으로 보존하지 않습니다."},
});
const alias=Object.freeze({stp:"step",igs:"iges",usdz:"usd"});
export function formatAdvice(filename){
  const ext=String(filename||"").trim().toLowerCase().split(".").pop();
  const type=alias[ext]||ext;
  const result=FORMAT_GUIDE[type];
  if(result)return {ext,name:result.name,support:result.support,target:result.target,
    steps:[...result.steps],warning:result.warning};
  return {ext,name:ext?ext.toUpperCase():"파일",support:"unknown",target:"지원되는 GLB/GLTF 변환 여부 확인",
    steps:["원본을 제작한 프로그램에서 3D 메쉬 또는 GLB로 내보내는 방법을 확인합니다.","원본 W×D×H·재질·축·객체 구성과 변환본을 비교합니다."],
    warning:"이 파일의 자동 변환 기능은 현재 제공하지 않습니다."};
}
export function adviceText(file){
  const a=formatAdvice(file.name||"");
  return a.name+" · "+(file.size/1024/1024).toFixed(1)+"MB\n"+
    "권장 포맷: "+a.target+"\n"+
    a.steps.map((s,i)=>(i+1)+". "+s).join("\n")+"\n"+
    "주의: "+a.warning+"\n\n원본 파일은 로컬에서 선택 정보만 확인하며 업로드·변환하지 않습니다.";
}
