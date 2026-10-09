import * as THREE from "three";

export function createD10Geometry() {
  // Proporciones REALES del d10:
  //   h = 0.1056 * H  → las 4 esquinas de cada cometa son COPLANARES
  //   r = 0.65   * H  → los lados largos miden ~2.5x los cortos
  const H = 1.05;
  const h = 0.1056 * H;
  const r = 0.78 * H;

  const topApex = new THREE.Vector3(0, H, 0);
  const bottomApex = new THREE.Vector3(0, -H, 0);

  const upperRing = [];
  const lowerRing = [];
  for (let i = 0; i < 5; i++) {
    const aU = (2 * Math.PI * i) / 5;
    const aL = aU + Math.PI / 5;
    upperRing.push(new THREE.Vector3(r * Math.sin(aU), h, r * Math.cos(aU)));
    lowerRing.push(new THREE.Vector3(r * Math.sin(aL), -h, r * Math.cos(aL)));
  }

  const faces = [];
  for (let i = 0; i < 5; i++) {
    const j = (i + 1) % 5;
    faces.push([topApex, upperRing[i], lowerRing[i], upperRing[j]]);
    faces.push([bottomApex, lowerRing[j], upperRing[j], lowerRing[i]]);
  }

  // UVs ajustadas a la forma real de la cometa.
  // Los vértices laterales están al ~81% del camino del ápice a la base.
  const uvCorners = [
    [0.5, 0.9],    // ápice
    [0.26, 0.25],  // lateral izquierdo
    [0.5, 0.1],    // base
    [0.74, 0.25],  // lateral derecho
  ];

  const positions = [];
  const normals = [];
  const uvs = [];
  const faceNormals = [];
  const faceApexDirs = [];

  for (const face of faces) {
    const center = new THREE.Vector3();
    face.forEach((v) => center.add(v));
    center.divideScalar(face.length);

    const v1 = new THREE.Vector3().subVectors(face[1], face[0]);
    const v2 = new THREE.Vector3().subVectors(face[2], face[0]);
    const faceNormal = new THREE.Vector3().crossVectors(v1, v2).normalize();
    if (center.dot(faceNormal) < 0) faceNormal.negate();
    faceNormals.push(faceNormal);

    const apexDir = new THREE.Vector3().subVectors(face[0], center).normalize();
    faceApexDirs.push(apexDir);

    const tris = [
      [0, 1, 2],
      [0, 2, 3],
    ];
    for (const tri of tris) {
      for (const idx of tri) {
        const v = face[idx];
        positions.push(v.x, v.y, v.z);
        normals.push(faceNormal.x, faceNormal.y, faceNormal.z);
        uvs.push(uvCorners[idx][0], uvCorners[idx][1]);
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));

  for (let i = 0; i < 10; i++) {
    geometry.addGroup(i * 6, 6, i);
  }

  return { geometry, faceNormals, faceApexDirs };
}

function createNumberTexture(number, bgColor, fgColor, showNumbers) {
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, size, size);

  if (showNumbers) {
    const text = number === 10 ? "0" : String(number);
    const ratio = text.length === 1 ? 0.22 : 0.15;

    // Centroide de la cometa (a ~58% del canvas desde arriba, ver cálculo)
    const cx = size * 0.5;
    const cy = size * 0.58;

    ctx.fillStyle = fgColor;
    ctx.font = `bold ${size * ratio}px system-ui, -apple-system, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, cx, cy);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export function createD10(colorBg, colorFg, showNumbers) {
  const { geometry, faceNormals, faceApexDirs } = createD10Geometry();

  const materials = [];
  for (let i = 0; i < 10; i++) {
    const texture = createNumberTexture(i + 1, colorBg, colorFg, showNumbers);
    materials.push(
      new THREE.MeshStandardMaterial({
        map: texture,
        roughness: 0.35,
        metalness: 0.1,
      })
    );
  }

  const mesh = new THREE.Mesh(geometry, materials);
  mesh.userData.faceNormals = faceNormals;
  mesh.userData.faceApexDirs = faceApexDirs;

  const edges = new THREE.EdgesGeometry(geometry, 15);
  const edgeLines = new THREE.LineSegments(
    edges,
    new THREE.LineBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.3,
    })
  );
  edgeLines.renderOrder = 1;
  mesh.add(edgeLines);

  return mesh;
}

export function showNumber(mesh, number) {
  const faceIndex = number - 1;
  const nF = mesh.userData.faceNormals[faceIndex].clone();
  const aF = mesh.userData.faceApexDirs[faceIndex].clone();

  const zSource = nF.normalize();
  const ySource = aF.normalize();
  const xSource = new THREE.Vector3().crossVectors(ySource, zSource).normalize();

  const m = new THREE.Matrix4().makeBasis(xSource, ySource, zSource);
  m.invert();

  const q = new THREE.Quaternion().setFromRotationMatrix(m);
  mesh.quaternion.copy(q);
}