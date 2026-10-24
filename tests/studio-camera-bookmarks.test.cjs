const fs=require("node:fs"),path=require("node:path"),vm=require("node:vm"),assert=require("node:assert/strict");
const file=fs.readFileSync(path.join(__dirname,"../studio/camera-bookmarks.js"),"utf8");
const scope={Object,Array,Math,Number,Error};
vm.runInNewContext(file.replace(/\bexport\s+/g,"")+
  "\nthis.api={CAMERA_SLOTS,validCameraPose,validCameraBookmarks,bookmarkCamera,savedCameraCount};",scope);
const {CAMERA_SLOTS,validCameraPose,validCameraBookmarks,bookmarkCamera,savedCameraCount}=scope.api;
const pose={position:[9,8,6],target:[0,1,0],fov:46};
assert.equal(CAMERA_SLOTS.length,3);
assert.equal(validCameraPose(pose),true);
assert.equal(validCameraPose({...pose,position:[0,1,0]}),false);
assert.equal(validCameraPose({...pose,fov:NaN}),false);
assert.equal(validCameraPose({...pose,position:[Infinity,8,6]}),false);
assert.equal(validCameraBookmarks({}),true);
const first=bookmarkCamera({},"1",pose);
assert.equal(savedCameraCount(first),1);
pose.position[0]=100;assert.equal(first["1"].position[0],9,"camera bookmark must clone");
const second=bookmarkCamera(first,"2",{position:[6,7,8],target:[1,1,1],fov:52});
assert.equal(savedCameraCount(second),2);
assert.equal(savedCameraCount({a:pose}),0);
assert.equal(validCameraBookmarks({"4":first["1"]}),false);
assert.equal(validCameraBookmarks({"1":first["1"],"2":second["2"],"3":first["1"],"4":first["1"]}),false);
assert.throws(()=>bookmarkCamera(first,"4",pose),/유효하지/);
const app=fs.readFileSync(path.join(__dirname,"../studio/studio.js"),"utf8");
const html=fs.readFileSync(path.join(__dirname,"../studio/index.html"),"utf8");
assert.match(app,/cameraBookmarks:structuredClone\(cameraBookmarks\)/);
assert.match(app,/validCameraBookmarks\(data.cameraBookmarks\)/);
assert.match(app,/masterConsistency\(approved,baselineForMaster\(\)\)/);
assert.match(app,/createStandardCameras\(approved.camera,bounds\)/);
for(const slot of CAMERA_SLOTS){
  assert.ok(html.includes('data-camera-save="'+slot+'"'));
  assert.ok(html.includes('data-camera-load="'+slot+'"'));
}
for(const id of ["master-preview-view","master-preview-apply","master-preview-return","master-render-preflight"]){
  assert.ok(html.includes('id="'+id+'"'),"UI must include "+id);
  assert.ok(app.includes('"'+id+'"'),"runtime must wire "+id);
}
console.log("PASS v2.9 camera-only bookmarks, legacy compatibility, locked MASTER shot preview contract");
