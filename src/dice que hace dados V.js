import * as THREE from "three";

export function createD10Geometry() {
  // Proporciones reales del d10: h = 0.448 * r hace que las cometas sean PLANAS
  const r = 1.0;
  const h = 0.448 * r;
  const H = 1.05;

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

  // 10 cometas: 5 superiores y 5 inferiores
  const faces = [];
  for (let i = 0; i < 5; i++) {
    const j = (i + 1) % 5;
    faces.push([topApex, upperRing[i], lowerRing[i], upperRing[j]]);
    faces.push([bottomApex, lowerRing[j], upperRing[j], lowerRing[i]]);
  }

  // Calculamos el aspect ratio real de la cometa para que las UVs no deformen los números
  const sample = faces[0];
  const longAxis = new THREE.Vector3().subVectors(sample[2], sample[0]).length();
  const shortAxis = new THREE.Vector3().subVectors(sample[3], sample[1]).length();
  const halfWidthUV = 0.5 * (shortAxis / longAxis);

  const uvCorners = [
    [0.5, 1.0],                        // vértice (ápice de la cometa)
    [0.5 - halfWidthUV, 0.5],          // lateral izquierdo
    [0.5, 0.0],                        // vértice opuesto
    [0.5 + halfWidthUV, 0.5],          // lateral derecho
  ];

  const positions = [];
  const normals = [];
  const uvs = [];
  const faceNormals = [];
  const faceApexDirs = [];

  for (const face of faces) {
    // Una única normal por cometa (ahora SÍ es válida, porque la cometa es plana)
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
    // El 10 se muestra como "0" (los dados físicos lo hacen así)
    const text = number === 10 ? "0" : String(number);
    const ratio = text.length === 1 ? 0.28 : 0.2;
    ctx.fillStyle = fgColor;
    ctx.font = `bold ${size * ratio}px system-ui, -apple-system, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, size / 2, size / 2);
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

  // Dibujamos las aristas de cada cara para que se vea la estructura del dado
  const edges = new THREE.EdgesGeometry(geometry, 15);
  const edgeLines = new THREE.LineSegments(
    edges,
    new THREE.LineBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.35,
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