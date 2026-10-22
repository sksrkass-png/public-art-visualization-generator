/**
 * Minimal, reproducible native mesh fixtures for browser testing.
 * FBX uses the official Three.js r186 binary fixture.
 */
const triangleOBJ = [
  "o test_site",
  "v 0 0 0", "v 3 0 0", "v 0 2 0", "v 0 0 1",
  "f 1 2 3", "f 1 3 4", ""
].join("\n");

const triangleSTL = [
  "solid test_site",
  " facet normal 0 0 1", "  outer loop",
  "   vertex 0 0 0", "   vertex 3 0 0", "   vertex 0 2 1",
  "  endloop", " endfacet", "endsolid test_site", ""
].join("\n");

const trianglePLY = [
  "ply", "format ascii 1.0", "comment browser test",
  "element vertex 3", "property float x", "property float y", "property float z",
  "element face 1", "property list uchar int vertex_indices", "end_header",
  "0 0 0", "3 0 0", "0 2 1", "3 0 1 2", ""
].join("\n");

const triangleDAE = [
  '<?xml version="1.0" encoding="utf-8"?>',
  '<COLLADA xmlns="http://www.collada.org/2005/11/COLLADASchema" version="1.4.1">',
  '  <asset><contributor><authoring_tool>AXOO test</authoring_tool></contributor>',
  '    <created>2026-01-01T00:00:00Z</created><modified>2026-01-01T00:00:00Z</modified>',
  '    <unit name="meter" meter="1"/><up_axis>Y_UP</up_axis></asset>',
  '  <library_geometries>',
  '    <geometry id="site-geometry" name="Site Geometry"><mesh>',
  '      <source id="site-positions">',
  '        <float_array id="site-positions-array" count="9">0 0 0 3 0 0 0 2 1</float_array>',
  '        <technique_common><accessor source="#site-positions-array" count="3" stride="3">',
  '          <param name="X" type="float"/><param name="Y" type="float"/><param name="Z" type="float"/>',
  '        </accessor></technique_common>',
  '      </source>',
  '      <vertices id="site-vertices"><input semantic="POSITION" source="#site-positions"/></vertices>',
  '      <triangles count="1"><input semantic="VERTEX" source="#site-vertices" offset="0"/><p>0 1 2</p></triangles>',
  '    </mesh></geometry>',
  '  </library_geometries>',
  '  <library_visual_scenes><visual_scene id="Scene" name="Scene">',
  '    <node id="SiteNode" name="SiteNode"><instance_geometry url="#site-geometry"/></node>',
  '  </visual_scene></library_visual_scenes>',
  '  <scene><instance_visual_scene url="#Scene"/></scene>',
  '</COLLADA>'
].join("\n");

function chunk(id, body) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(id, 0);
  header.writeUInt32LE(body.length + 6, 2);
  return Buffer.concat([header, body]);
}
function mesh3DS() {
  const vertices = [[0, 0, 0], [3, 0, 0], [0, 2, 1]];
  const points = Buffer.alloc(2 + 12 * vertices.length);
  points.writeUInt16LE(vertices.length, 0);
  for (let i = 0; i < vertices.length; i++)
    vertices[i].forEach((v, axis) => points.writeFloatLE(v, 2 + i * 12 + axis * 4));
  const faces = Buffer.alloc(2 + 8);
  faces.writeUInt16LE(1, 0);
  faces.writeUInt16LE(0, 2);
  faces.writeUInt16LE(1, 4);
  faces.writeUInt16LE(2, 6);
  faces.writeUInt16LE(0, 8);
  const triMesh = chunk(0x4100, Buffer.concat([
    chunk(0x4110, points),
    chunk(0x4120, faces)
  ]));
  return chunk(0x4d4d, chunk(0x3d3d, chunk(0x4000, Buffer.concat([
    Buffer.from("Test Site\0"), triMesh
  ]))));
}
const siteFixtures = [
  { name: "test-site.obj", mimeType: "text/plain", buffer: Buffer.from(triangleOBJ) },
  { name: "test-site.stl", mimeType: "model/stl", buffer: Buffer.from(triangleSTL) },
  { name: "test-site.ply", mimeType: "application/octet-stream", buffer: Buffer.from(trianglePLY) },
  { name: "test-site.dae", mimeType: "model/vnd.collada+xml", buffer: Buffer.from(triangleDAE) },
  { name: "test-site.3ds", mimeType: "application/octet-stream", buffer: mesh3DS() }
];

async function loadFbxFixture() {
  const url = "https://raw.githubusercontent.com/mrdoob/three.js/r186/examples/models/fbx/vCube.fbx";
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error("FBX fixture unavailable: " + res.status);
  return { name: "three-vcube.fbx", mimeType: "application/octet-stream",
    buffer: Buffer.from(await res.arrayBuffer()) };
}

module.exports = { siteFixtures, loadFbxFixture };
