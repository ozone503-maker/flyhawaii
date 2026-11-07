import * as THREE from 'three';

// Hull forward is -Z, chase camera is +Z. These are untextured rear silhouettes,
// not billboards: no face, helmet or hat can turn toward the chase camera.
export function buildPilotHead(id) {
  const head = new THREE.Group(); head.name = `pilot-back-${id}`;
  const color = id === 'ipo' ? 0xff8cc6 : id === 'mj' ? 0x79503b : 0x479bdf;
  const material = new THREE.MeshStandardMaterial({ color, roughness: 0.85 });
  const part = (x, y, z, sx, sy, sz) => {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), material);
    mesh.position.set(x, y, z); mesh.scale.set(sx, sy, sz); head.add(mesh);
  };
  part(0, 0, 0, 0.48, id === 'drone' ? 0.62 : 0.48, 0.4);
  if (id !== 'drone') for (const side of [-1, 1]) {
    part(side * 0.47, id === 'ipo' ? -0.12 : 0.08, -0.04,
      id === 'ipo' ? 0.18 : 0.23, id === 'ipo' ? 0.48 : 0.24, 0.16);
  }
  return head;
}
