import * as THREE from "three";
import * as T from "./textures";

export interface Box {
  min: THREE.Vector3;
  max: THREE.Vector3;
}

export interface GameMap {
  group: THREE.Group;
  colliders: Box[];         // AABBs used for movement collision
  solids: THREE.Object3D[]; // meshes used for raycasts (bullets, line of sight)
  ctSpawns: THREE.Vector3[];
  tSpawns: THREE.Vector3[];
  waypoints: THREE.Vector3[];
  bounds: { min: number; max: number };
}

export function buildMap(): GameMap {
  const group = new THREE.Group();
  const colliders: Box[] = [];
  const solids: THREE.Object3D[] = [];

  // ---------- materials ----------
  const brick = T.pbr(T.sandstoneBricks());
  const plaster = T.pbr(T.plaster());
  const concrete = T.pbr(T.concrete());
  const crate = T.pbr(T.woodCrate());
  const sandSet = T.sand();
  const sandMat = T.pbr(sandSet);
  const roof = T.pbr(T.corrugated(), { metalness: 0.4 });
  const burlap = T.pbr(T.burlap());
  const barrelRed = T.pbr(T.metalBarrel(0.6, 0.15, 0.1), { metalness: 0.5 });
  const barrelBlue = T.pbr(T.metalBarrel(0.15, 0.3, 0.55), { metalness: 0.5 });
  const barrelGreen = T.pbr(T.metalBarrel(0.25, 0.4, 0.2), { metalness: 0.5 });
  const trim = new THREE.MeshStandardMaterial({ color: 0x8c7a5c, roughness: 0.9 });
  const woodDark = new THREE.MeshStandardMaterial({ color: 0x4a3620, roughness: 0.9 });

  // ---------- ground ----------
  const SIZE = 80;
  const half = SIZE / 2;
  const floorGeo = new THREE.PlaneGeometry(SIZE, SIZE, 1, 1);
  const fuv = floorGeo.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < fuv.count; i++) fuv.setXY(i, fuv.getX(i) * SIZE / 4, fuv.getY(i) * SIZE / 4);
  const floor = new THREE.Mesh(floorGeo, sandMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  group.add(floor);
  solids.push(floor);

  // Concrete pad under mid + at platforms (purely visual, sits on the sand)
  const pad = (x: number, z: number, w: number, d: number) => {
    const g = T.worldBox(w, 0.06, d, 2);
    const m = new THREE.Mesh(g, concrete);
    m.position.set(x, 0.03, z);
    m.receiveShadow = true;
    group.add(m);
    solids.push(m);
  };
  pad(0, 0, 26, 20);

  // ---------- helpers ----------
  function addCollider(x: number, y: number, z: number, w: number, h: number, d: number) {
    colliders.push({
      min: new THREE.Vector3(x - w / 2, y, z - d / 2),
      max: new THREE.Vector3(x + w / 2, y + h, z + d / 2),
    });
  }

  function box(x: number, y: number, z: number, w: number, h: number, d: number, mat: THREE.Material, tile = 2, collide = true) {
    const m = new THREE.Mesh(T.worldBox(w, h, d, tile), mat);
    m.position.set(x, y + h / 2, z);
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
    solids.push(m);
    if (collide) addCollider(x, y, z, w, h, d);
    return m;
  }

  /** Wall with a slightly wider cap on top. */
  function wall(x: number, y: number, z: number, w: number, h: number, d: number, mat: THREE.Material = brick) {
    box(x, y, z, w, h, d, mat);
    const capW = w + (w > d ? 0 : 0.2), capD = d + (d > w ? 0 : 0.2);
    box(x, y + h, z, capW, 0.15, capD, trim, 2, false);
  }

  function crateBox(x: number, y: number, z: number, s = 2, rotY = 0) {
    const m = box(x, y, z, s, s * 0.6, s, crate, s, true);
    m.rotation.y = rotY; // visual only; collider stays axis-aligned (small rotations)
    return m;
  }

  const barrelGeo = new THREE.CylinderGeometry(0.42, 0.42, 1.2, 20, 1);
  const barrelTop = new THREE.CylinderGeometry(0.36, 0.42, 0.06, 20, 1);
  function barrel(x: number, z: number, mat: THREE.Material) {
    const m = new THREE.Mesh(barrelGeo, mat);
    m.position.set(x, 0.6, z);
    m.rotation.y = Math.random() * Math.PI;
    m.castShadow = m.receiveShadow = true;
    group.add(m);
    solids.push(m);
    const top = new THREE.Mesh(barrelTop, mat);
    top.position.set(x, 1.22, z);
    group.add(top);
    addCollider(x, 0, z, 0.84, 1.2, 0.84);
  }

  const bagGeo = new THREE.SphereGeometry(0.5, 12, 8);
  bagGeo.scale(1, 0.42, 0.62);
  function sandbags(x: number, z: number, length: number, rotY = 0) {
    const g = new THREE.Group();
    const rows = 3;
    for (let r = 0; r < rows; r++) {
      const count = Math.floor(length / 0.9);
      for (let i = 0; i < count; i++) {
        const b = new THREE.Mesh(bagGeo, burlap);
        b.position.set(-length / 2 + 0.45 + i * 0.9 + (r % 2) * 0.45, 0.2 + r * 0.38, 0);
        b.rotation.y = (Math.random() - 0.5) * 0.3;
        b.castShadow = b.receiveShadow = true;
        g.add(b);
        solids.push(b);
      }
    }
    g.position.set(x, 0, z);
    g.rotation.y = rotY;
    group.add(g);
    const along = Math.abs(Math.cos(rotY)) > 0.5;
    addCollider(x, 0, z, along ? length : 0.9, 1.25, along ? 0.9 : length);
  }

  const palletGeo = new THREE.BoxGeometry(1.2, 0.12, 1.0);
  function pallet(x: number, z: number, rotY = 0) {
    const m = new THREE.Mesh(palletGeo, woodDark);
    m.position.set(x, 0.06, z);
    m.rotation.y = rotY;
    m.castShadow = m.receiveShadow = true;
    group.add(m);
  }

  const pillarGeo = new THREE.CylinderGeometry(0.7, 0.7, 6, 16, 1);
  const pillarCapGeo = new THREE.BoxGeometry(1.8, 0.3, 1.8);
  function pillar(x: number, z: number) {
    const m = new THREE.Mesh(pillarGeo, concrete);
    m.position.set(x, 3, z);
    m.castShadow = m.receiveShadow = true;
    group.add(m);
    solids.push(m);
    const base = new THREE.Mesh(pillarCapGeo, concrete);
    base.position.set(x, 0.15, z);
    base.castShadow = base.receiveShadow = true;
    group.add(base);
    solids.push(base);
    addCollider(x, 0, z, 1.5, 6, 1.5);
  }

  // ---------- outer walls ----------
  const H = 6;
  wall(0, 0, -half, SIZE, H, 1);
  wall(0, 0, half, SIZE, H, 1);
  wall(-half, 0, 0, 1, H, SIZE);
  wall(half, 0, 0, 1, H, SIZE);
  // Buttresses along outer walls for visual rhythm
  for (let i = -3; i <= 3; i++) {
    if (i === 0) continue;
    const p = i * 11;
    box(p, 0, -half + 0.8, 1.2, 4.5, 0.8, brick);
    box(p, 0, half - 0.8, 1.2, 4.5, 0.8, brick);
    box(-half + 0.8, 0, p, 0.8, 4.5, 1.2, brick);
    box(half - 0.8, 0, p, 0.8, 4.5, 1.2, brick);
  }

  // ---------- mid building ----------
  wall(0, 0, -6, 18, 5, 1, plaster);
  wall(0, 0, 6, 18, 5, 1, plaster);
  wall(-9, 0, -3.5, 1, 5, 4, plaster);
  wall(-9, 0, 3.5, 1, 5, 4, plaster);
  wall(9, 0, -3.5, 1, 5, 4, plaster);
  wall(9, 0, 3.5, 1, 5, 4, plaster);
  // Door lintels + frames
  box(-9, 3.6, 0, 1, 1.4, 3, plaster);
  box(9, 3.6, 0, 1, 1.4, 3, plaster);
  for (const sx of [-9, 9]) {
    box(sx, 0, -1.55, 1.1, 3.6, 0.12, woodDark, 1, false);
    box(sx, 0, 1.55, 1.1, 3.6, 0.12, woodDark, 1, false);
    box(sx, 3.55, 0, 1.1, 0.12, 3.2, woodDark, 1, false);
  }
  // Roof: corrugated sheets with a lip
  box(0, 5, 0, 19.4, 0.25, 13.4, roof, 2);
  box(0, 5.25, 0, 19.6, 0.2, 0.3, woodDark, 1, false).position.z = -6.7;
  box(0, 5.25, 0, 19.6, 0.2, 0.3, woodDark, 1, false).position.z = 6.7;
  crateBox(0, 0, 0, 2.6, 0.2);
  crateBox(-5, 0, -3, 1.6, -0.3);
  barrel(5.5, 3.5, barrelBlue);
  barrel(6.4, 2.6, barrelRed);
  pallet(-6, 3.5, 0.4);

  // ---------- lane walls ----------
  wall(-22, 0, -14, 1, 4, 22);
  wall(22, 0, 14, 1, 4, 22);
  wall(-14, 0, 22, 22, 4, 1);
  wall(14, 0, -22, 22, 4, 1);

  // ---------- spawn-area cover ----------
  wall(-24, 0, -30, 8, 2.5, 1, concrete);
  wall(-30, 0, -22, 1, 2.5, 8, concrete);
  wall(24, 0, 30, 8, 2.5, 1, concrete);
  wall(30, 0, 22, 1, 2.5, 8, concrete);
  sandbags(-33, -26, 4.5, Math.PI / 2);
  sandbags(33, 26, 4.5, Math.PI / 2);

  // ---------- elevated platforms ----------
  pad(28, -28, 14, 14);
  box(28, 0, -28, 12, 2.5, 12, concrete);
  box(20.5, 0, -28, 3, 0.8, 6, concrete);
  box(23.5, 0, -28, 3, 1.6, 6, concrete);
  pad(-28, 28, 14, 14);
  box(-28, 0, 28, 12, 2.5, 12, concrete);
  box(-20.5, 0, 28, 3, 0.8, 6, concrete);
  box(-23.5, 0, 28, 3, 1.6, 6, concrete);
  // low parapets on platform edges
  box(28, 2.5, -33.6, 12, 0.9, 0.4, concrete);
  box(33.6, 2.5, -28, 0.4, 0.9, 12, concrete);
  box(-28, 2.5, 33.6, 12, 0.9, 0.4, concrete);
  box(-33.6, 2.5, 28, 0.4, 0.9, 12, concrete);
  sandbags(28, -22.6, 5);
  sandbags(-28, 22.6, 5);

  // ---------- crate clusters ----------
  const crates: [number, number, number][] = [
    [-15, 0, -5], [-15, 0, -3], [-15, 1.2, -4],
    [15, 0, 5], [15, 0, 3], [15, 1.2, 4],
    [-5, 0, 15], [-3, 0, 15], [-4, 1.2, 15],
    [5, 0, -15], [3, 0, -15], [4, 1.2, -15],
    [-30, 0, 8], [-30, 0, 10], [30, 0, -8], [30, 0, -10],
    [8, 0, 30], [10, 0, 30], [-8, 0, -30], [-10, 0, -30],
    [-20, 0, 0], [20, 0, 0], [0, 0, 20], [0, 0, -20],
  ];
  for (const [x, y, z] of crates) crateBox(x, y, z, 2, (Math.random() - 0.5) * 0.15);

  // Big crates for cover
  crateBox(-12, 0, 12, 4);
  crateBox(12, 0, -12, 4);
  box(-33, 0, -8, 3, 2.4, 6, crate, 3);
  box(33, 0, 8, 3, 2.4, 6, crate, 3);

  // Barrel groups
  barrel(-17, -8, barrelGreen); barrel(-17.9, -8.3, barrelRed);
  barrel(17, 8, barrelBlue); barrel(17.9, 8.3, barrelGreen);
  barrel(-2, 25, barrelRed); barrel(2, -25, barrelBlue);
  barrel(-27, 14, barrelGreen); barrel(27, -14, barrelRed);
  pallet(-16, -11, 0.2); pallet(16, 11, -0.5); pallet(6, 18, 1.1); pallet(-6, -18, 0.3);

  // Pillars
  for (const [x, z] of [[-10, -10], [10, 10], [-10, 10], [10, -10]] as [number, number][]) pillar(x, z);

  const ctSpawns = [
    new THREE.Vector3(-34, 0, -34), new THREE.Vector3(-30, 0, -36), new THREE.Vector3(-36, 0, -30),
    new THREE.Vector3(-34, 0, -20), new THREE.Vector3(-20, 0, -34),
  ];
  const tSpawns = [
    new THREE.Vector3(34, 0, 34), new THREE.Vector3(30, 0, 36), new THREE.Vector3(36, 0, 30),
    new THREE.Vector3(34, 0, 20), new THREE.Vector3(20, 0, 34), new THREE.Vector3(36, 0, 10),
  ];
  const waypoints = [
    new THREE.Vector3(0, 0, 0), new THREE.Vector3(-15, 0, 0), new THREE.Vector3(15, 0, 0),
    new THREE.Vector3(0, 0, -15), new THREE.Vector3(0, 0, 15),
    new THREE.Vector3(-30, 0, 0), new THREE.Vector3(30, 0, 0), new THREE.Vector3(0, 0, 30), new THREE.Vector3(0, 0, -30),
    new THREE.Vector3(-30, 0, 15), new THREE.Vector3(30, 0, -15), new THREE.Vector3(15, 0, 30), new THREE.Vector3(-15, 0, -30),
    new THREE.Vector3(-34, 0, -34), new THREE.Vector3(34, 0, 34), new THREE.Vector3(-34, 0, 34), new THREE.Vector3(34, 0, -34),
    new THREE.Vector3(-18, 0, 18), new THREE.Vector3(18, 0, -18), new THREE.Vector3(-25, 0, -5), new THREE.Vector3(25, 0, 5),
  ];

  return { group, colliders, solids, ctSpawns, tSpawns, waypoints, bounds: { min: -half + 1, max: half - 1 } };
}

/** Resolve a moving AABB (center `pos`, half-extents) against map colliders per-axis. */
export function moveWithCollision(
  pos: THREE.Vector3,
  delta: THREE.Vector3,
  radius: number,
  height: number,
  colliders: Box[],
  bounds: { min: number; max: number },
): { onGround: boolean; groundY: number } {
  // pos = feet position
  const step = 0.45; // max step-up height
  const eps = 0.001;

  const overlaps = (px: number, py: number, pz: number, b: Box) =>
    px + radius > b.min.x + eps && px - radius < b.max.x - eps &&
    pz + radius > b.min.z + eps && pz - radius < b.max.z - eps &&
    py + height > b.min.y + eps && py < b.max.y - eps;

  for (const axis of ["x", "z"] as const) {
    const d = delta[axis];
    if (d === 0) continue;
    const next = pos.clone();
    next[axis] += d;
    let blocked = false;
    for (const b of colliders) {
      if (overlaps(next.x, next.y, next.z, b)) {
        const stepped = b.max.y - pos.y;
        if (stepped > 0 && stepped <= step) {
          let free = true;
          for (const b2 of colliders) if (overlaps(next.x, b.max.y, next.z, b2)) { free = false; break; }
          if (free) { next.y = b.max.y; continue; }
        }
        blocked = true;
        break;
      }
    }
    if (!blocked) { pos.x = next.x; pos.z = next.z; pos.y = next.y; }
  }
  pos.x = Math.min(bounds.max - radius, Math.max(bounds.min + radius, pos.x));
  pos.z = Math.min(bounds.max - radius, Math.max(bounds.min + radius, pos.z));

  let groundY = 0;
  for (const b of colliders) {
    if (pos.x + radius > b.min.x && pos.x - radius < b.max.x && pos.z + radius > b.min.z && pos.z - radius < b.max.z) {
      if (b.max.y <= pos.y + 0.05 && b.max.y > groundY) groundY = b.max.y;
    }
  }
  let onGround = false;
  const ny = pos.y + delta.y;
  if (delta.y <= 0 && ny <= groundY) {
    pos.y = groundY;
    onGround = true;
  } else {
    let ceiling = Infinity;
    for (const b of colliders) {
      if (pos.x + radius > b.min.x && pos.x - radius < b.max.x && pos.z + radius > b.min.z && pos.z - radius < b.max.z) {
        if (b.min.y >= pos.y + height - 0.05 && b.min.y < ceiling) ceiling = b.min.y;
      }
    }
    pos.y = Math.min(ny, ceiling - height);
    if (pos.y <= groundY) { pos.y = groundY; onGround = true; }
  }
  return { onGround, groundY };
}
