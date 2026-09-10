import * as THREE from "three";
import { sfx } from "./audio";
import * as T from "./textures";

export interface WeaponDef {
  name: string;
  damage: number;
  headshotMult: number;
  rpm: number;
  magSize: number;
  reserve: number;
  reloadTime: number;
  auto: boolean;
  spreadBase: number;
  spreadMax: number;
  spreadPerShot: number;
  spreadRecover: number;
  moveSpread: number;
  recoilPitch: number;
  recoilYaw: number;
  kick: number;
  scope?: number;
  sound: () => void;
  build: (m: Mats) => THREE.Group;
}

interface Mats {
  metal: THREE.MeshStandardMaterial;
  metalDark: THREE.MeshStandardMaterial;
  wood: THREE.MeshStandardMaterial;
  polymer: THREE.MeshStandardMaterial;
  green: THREE.MeshStandardMaterial;
  skin: THREE.MeshStandardMaterial;
  sleeve: THREE.MeshStandardMaterial;
  glove: THREE.MeshStandardMaterial;
  glass: THREE.MeshPhysicalMaterial;
  brass: THREE.MeshStandardMaterial;
}

let matsCache: Mats | null = null;
function mats(): Mats {
  if (!matsCache) {
    matsCache = {
      metal: T.pbr(T.gunmetal(), { metalness: 0.75, roughness: 0.45 }),
      metalDark: new THREE.MeshStandardMaterial({ color: 0x141416, metalness: 0.6, roughness: 0.55 }),
      wood: T.pbr(T.gunWood(), { roughness: 0.45 }),
      polymer: new THREE.MeshStandardMaterial({ color: 0x1e1e20, roughness: 0.7 }),
      green: new THREE.MeshStandardMaterial({ color: 0x3b4a33, roughness: 0.75 }),
      skin: T.pbr(T.skin()),
      sleeve: new THREE.MeshStandardMaterial({ color: 0x2b3a55, roughness: 0.9 }),
      glove: T.pbr(T.darkFabric()),
      glass: new THREE.MeshPhysicalMaterial({ color: 0x224466, roughness: 0.05, metalness: 0, transmission: 0.2, clearcoat: 1, reflectivity: 1 }),
      brass: new THREE.MeshStandardMaterial({ color: 0xc9a24a, metalness: 0.9, roughness: 0.35 }),
    };
  }
  return matsCache;
}

// ---------- geometry helpers ----------
function bx(g: THREE.Object3D, w: number, h: number, d: number, x: number, y: number, z: number, mat: THREE.Material, rot?: [number, number, number]) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  if (rot) m.rotation.set(rot[0], rot[1], rot[2]);
  m.castShadow = true;
  g.add(m);
  return m;
}
/** Cylinder along -z (barrel-style). */
function cyl(g: THREE.Object3D, r: number, len: number, x: number, y: number, z: number, mat: THREE.Material, r2 = r, seg = 12) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r2, len, seg), mat);
  m.rotation.x = Math.PI / 2;
  m.position.set(x, y, z);
  m.castShadow = true;
  g.add(m);
  return m;
}
/** Hand (glove) + forearm sleeve pointing from the hand toward `toward` (local coords). */
function hand(g: THREE.Object3D, M: Mats, x: number, y: number, z: number, toward: THREE.Vector3, gripRot = 0) {
  const palm = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), M.glove);
  palm.scale.set(1, 0.8, 1.2);
  palm.position.set(x, y, z);
  palm.rotation.z = gripRot;
  g.add(palm);
  // fingers wrapped
  for (let i = 0; i < 3; i++) {
    const f = new THREE.Mesh(new THREE.CapsuleGeometry(0.014, 0.05, 2, 6), M.glove);
    f.position.set(x - 0.02 + i * 0.02, y + 0.02, z - 0.04);
    f.rotation.x = Math.PI / 2;
    g.add(f);
  }
  const dir = toward.clone().normalize();
  const len = 0.32;
  const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, len, 4, 10), M.sleeve);
  arm.position.set(x + dir.x * len * 0.55, y + dir.y * len * 0.55, z + dir.z * len * 0.55);
  arm.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  g.add(arm);
  const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.04, 10), M.glove);
  cuff.position.set(x + dir.x * 0.07, y + dir.y * 0.07, z + dir.z * 0.07);
  cuff.quaternion.copy(arm.quaternion);
  g.add(cuff);
}

// ---------- weapon models ----------
function buildRifle(M: Mats) {
  const g = new THREE.Group();
  bx(g, 0.07, 0.085, 0.36, 0, 0, 0, M.metal);                    // receiver
  bx(g, 0.064, 0.03, 0.3, 0, 0.055, -0.02, M.metal);             // dust cover
  bx(g, 0.05, 0.03, 0.06, 0.05, 0.01, 0.05, M.metal);            // charging handle side
  cyl(g, 0.014, 0.5, 0, 0.03, -0.43, M.metalDark);               // barrel
  cyl(g, 0.011, 0.24, 0, 0.065, -0.32, M.metalDark);             // gas tube
  bx(g, 0.062, 0.062, 0.22, 0, 0.0, -0.31, M.wood);              // handguard
  bx(g, 0.03, 0.05, 0.03, 0, 0.055, -0.44, M.metal);             // gas block
  bx(g, 0.03, 0.07, 0.025, 0, 0.07, -0.62, M.metal);             // front sight base
  cyl(g, 0.004, 0.03, 0, 0.11, -0.62, M.metalDark, 0.004, 6).rotation.x = 0; // sight post
  cyl(g, 0.02, 0.06, 0, 0.03, -0.71, M.metalDark, 0.017);        // muzzle brake
  bx(g, 0.04, 0.03, 0.04, 0, 0.075, -0.05, M.metal);             // rear sight
  // curved magazine
  for (let i = 0; i < 4; i++) {
    const seg = bx(g, 0.04, 0.06, 0.075, 0, -0.07 - i * 0.05, -0.06 + i * 0.012, M.metalDark);
    seg.rotation.x = 0.15 + i * 0.12;
  }
  bx(g, 0.04, 0.02, 0.09, 0, -0.09, 0.02, M.metalDark);          // trigger guard
  bx(g, 0.008, 0.03, 0.01, 0, -0.06, 0.02, M.metalDark);         // trigger
  bx(g, 0.042, 0.13, 0.06, 0, -0.1, 0.09, M.wood, [0.35, 0, 0]);  // pistol grip
  bx(g, 0.045, 0.07, 0.3, 0, -0.03, 0.33, M.wood, [-0.06, 0, 0]); // stock
  bx(g, 0.05, 0.1, 0.03, 0, -0.04, 0.48, M.metalDark);           // butt plate
  hand(g, M, 0.0, -0.12, 0.1, new THREE.Vector3(0.6, -0.5, 1), 0.2);       // right hand on grip
  hand(g, M, -0.01, -0.06, -0.3, new THREE.Vector3(-0.45, -0.7, 0.6), -0.3); // left hand on handguard
  return g;
}

function buildPistol(M: Mats) {
  const g = new THREE.Group();
  bx(g, 0.042, 0.05, 0.21, 0, 0.03, -0.03, M.metal);             // slide
  for (let i = 0; i < 4; i++) bx(g, 0.044, 0.03, 0.006, 0, 0.03, 0.04 + i * 0.012, M.metalDark); // serrations
  bx(g, 0.04, 0.04, 0.19, 0, -0.01, -0.02, M.polymer);           // frame
  bx(g, 0.03, 0.02, 0.06, 0, -0.02, -0.1, M.polymer);            // rail
  cyl(g, 0.02, 0.17, 0, 0.032, -0.22, M.metalDark);              // suppressor
  bx(g, 0.036, 0.13, 0.055, 0, -0.09, 0.05, M.polymer, [0.25, 0, 0]); // grip
  bx(g, 0.036, 0.02, 0.07, 0, -0.045, -0.01, M.polymer);         // trigger guard
  bx(g, 0.007, 0.025, 0.008, 0, -0.03, -0.01, M.metalDark);      // trigger
  bx(g, 0.012, 0.02, 0.012, 0, 0.065, -0.12, M.metalDark);       // front sight
  bx(g, 0.03, 0.018, 0.012, 0, 0.064, 0.06, M.metalDark);        // rear sight
  bx(g, 0.02, 0.03, 0.03, 0, 0.01, 0.09, M.metalDark);           // hammer
  hand(g, M, 0.0, -0.1, 0.06, new THREE.Vector3(0.5, -0.6, 1), 0.15);
  return g;
}

function buildSniper(M: Mats) {
  const g = new THREE.Group();
  bx(g, 0.05, 0.075, 0.42, 0, 0, 0.05, M.green);                 // receiver
  cyl(g, 0.017, 0.8, 0, 0.02, -0.62, M.metalDark, 0.014);        // barrel
  cyl(g, 0.022, 0.06, 0, 0.02, -1.0, M.metalDark);               // muzzle
  bx(g, 0.06, 0.06, 0.34, 0, -0.01, -0.35, M.green);             // fore-end
  bx(g, 0.045, 0.14, 0.07, 0, -0.11, 0.1, M.green, [0.3, 0, 0]);  // grip
  bx(g, 0.04, 0.12, 0.07, 0, -0.1, -0.1, M.metalDark);           // magazine
  bx(g, 0.05, 0.09, 0.34, 0, -0.02, 0.5, M.green);               // stock
  bx(g, 0.05, 0.05, 0.16, 0, 0.05, 0.42, M.green);               // cheek rest
  bx(g, 0.055, 0.11, 0.03, 0, -0.03, 0.68, M.polymer);           // butt pad
  // bolt
  const bolt = cyl(g, 0.01, 0.07, 0.05, 0.02, 0.0, M.metal);
  bolt.rotation.set(0, 0, Math.PI / 2);
  bolt.position.set(0.06, 0.0, 0.02);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.014, 8, 8), M.metal);
  knob.position.set(0.1, -0.01, 0.02); g.add(knob);
  // scope
  bx(g, 0.02, 0.05, 0.03, 0, 0.055, -0.1, M.metalDark);
  bx(g, 0.02, 0.05, 0.03, 0, 0.055, 0.12, M.metalDark);
  cyl(g, 0.026, 0.3, 0, 0.1, 0.0, M.metalDark);
  cyl(g, 0.036, 0.08, 0, 0.1, -0.18, M.metalDark, 0.028);        // objective bell
  cyl(g, 0.03, 0.005, 0, 0.1, -0.22, M.glass, 0.03, 16);          // lens
  cyl(g, 0.03, 0.06, 0, 0.1, 0.17, M.metalDark, 0.026);          // eyepiece
  cyl(g, 0.012, 0.02, 0, 0.13, 0.0, M.metalDark);                 // elevation turret
  cyl(g, 0.012, 0.02, 0.03, 0.1, 0.0, M.metalDark).rotation.set(0, 0, Math.PI / 2);
  // folded bipod
  for (const s of [-1, 1]) {
    const leg = cyl(g, 0.006, 0.18, s * 0.025, -0.045, -0.4, M.metalDark);
    leg.rotation.x = Math.PI / 2 + 0.1;
  }
  hand(g, M, 0.0, -0.13, 0.11, new THREE.Vector3(0.6, -0.5, 1), 0.2);
  hand(g, M, -0.01, -0.06, -0.36, new THREE.Vector3(-0.45, -0.7, 0.6), -0.3);
  return g;
}

export const WEAPONS: WeaponDef[] = [
  {
    name: "AK-47", damage: 36, headshotMult: 4, rpm: 600, magSize: 30, reserve: 90, reloadTime: 2.4, auto: true,
    spreadBase: 0.003, spreadMax: 0.03, spreadPerShot: 0.005, spreadRecover: 0.25, moveSpread: 0.04,
    recoilPitch: 0.012, recoilYaw: 0.004, kick: 0.05, sound: sfx.rifleShot, build: buildRifle,
  },
  {
    name: "USP-S", damage: 30, headshotMult: 4, rpm: 400, magSize: 12, reserve: 48, reloadTime: 1.8, auto: false,
    spreadBase: 0.003, spreadMax: 0.04, spreadPerShot: 0.014, spreadRecover: 0.16, moveSpread: 0.03,
    recoilPitch: 0.018, recoilYaw: 0.004, kick: 0.04, sound: sfx.pistolShot, build: buildPistol,
  },
  {
    name: "AWP", damage: 115, headshotMult: 2, rpm: 41, magSize: 5, reserve: 20, reloadTime: 3.2, auto: false,
    spreadBase: 0.0008, spreadMax: 0.15, spreadPerShot: 0.15, spreadRecover: 0.3, moveSpread: 0.12,
    recoilPitch: 0.06, recoilYaw: 0.01, kick: 0.12, scope: 18, sound: sfx.sniperShot, build: buildSniper,
  },
];

export class WeaponState {
  mag: number;
  reserve: number;
  constructor(public def: WeaponDef) {
    this.mag = def.magSize;
    this.reserve = def.reserve;
  }
}

export class Arsenal {
  weapons: WeaponState[];
  index = 0;
  cooldown = 0;
  reloading = 0;
  spread = 0;
  scoped = false;
  viewmodel = new THREE.Group();
  burstCount = 0;
  private sinceShot = 10;
  private models: THREE.Group[];
  private kickZ = 0;
  private kickRot = 0;
  private swayX = 0;
  private swayY = 0;
  private flash: THREE.PointLight;
  private flashMesh: THREE.Mesh;
  private muzzles: THREE.Object3D[];
  private ejects: THREE.Object3D[];
  private switchAnim = 0;

  constructor(camera: THREE.Camera) {
    const M = mats();
    this.weapons = WEAPONS.map((d) => new WeaponState(d));
    this.models = WEAPONS.map((d) => d.build(M));
    // Muzzle / ejection port markers per model (local coords)
    const muzzleZ = [-0.74, -0.31, -1.03];
    const muzzleY = [0.03, 0.032, 0.02];
    this.muzzles = this.models.map((m, i) => { const o = new THREE.Object3D(); o.position.set(0, muzzleY[i], muzzleZ[i]); m.add(o); return o; });
    this.ejects = this.models.map((m) => { const o = new THREE.Object3D(); o.position.set(0.05, 0.03, 0.0); m.add(o); return o; });
    for (const m of this.models) { m.visible = false; this.viewmodel.add(m); }
    this.models[0].visible = true;
    this.viewmodel.position.set(0.28, -0.26, -0.45);
    this.viewmodel.scale.setScalar(0.55);
    camera.add(this.viewmodel);

    this.flash = new THREE.PointLight(0xffb060, 0, 6, 2);
    this.viewmodel.add(this.flash);
    this.flashMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.06, 6, 6),
      new THREE.MeshBasicMaterial({ color: 0xffe0a0, transparent: true, opacity: 0.9 }),
    );
    this.flashMesh.visible = false;
    this.viewmodel.add(this.flashMesh);
  }

  get current() { return this.weapons[this.index]; }
  get def() { return this.current.def; }

  /** World-space muzzle position of the active weapon. */
  muzzleWorld() { return this.muzzles[this.index].getWorldPosition(new THREE.Vector3()); }
  ejectWorld() { return this.ejects[this.index].getWorldPosition(new THREE.Vector3()); }

  switchTo(i: number) {
    if (i === this.index || i < 0 || i >= this.weapons.length) return;
    this.models[this.index].visible = false;
    this.index = i;
    this.models[i].visible = true;
    this.reloading = 0;
    this.cooldown = 0.4;
    this.switchAnim = 1;
    this.spread = 0;
    this.scoped = false;
  }

  reload() {
    const w = this.current;
    if (this.reloading > 0 || w.mag === w.def.magSize || w.reserve <= 0) return;
    this.reloading = w.def.reloadTime;
    this.scoped = false;
    sfx.reload();
  }

  refillAll() {
    for (const w of this.weapons) { w.mag = w.def.magSize; w.reserve = w.def.reserve; }
    this.reloading = 0;
  }

  tryFire(triggerHeld: boolean, triggerPressed: boolean): boolean {
    const w = this.current;
    if (this.cooldown > 0 || this.reloading > 0) return false;
    const wants = w.def.auto ? triggerHeld : triggerPressed;
    if (!wants) return false;
    if (w.mag <= 0) {
      sfx.dryFire();
      this.cooldown = 0.25;
      if (w.reserve > 0) this.reload();
      return false;
    }
    w.mag--;
    if (this.sinceShot > 0.3) this.burstCount = 0;
    this.burstCount++;
    this.sinceShot = 0;
    this.cooldown = 60 / w.def.rpm;
    w.def.sound();
    this.spread = Math.min(w.def.spreadMax, this.spread + w.def.spreadPerShot);
    this.kickZ = w.def.kick;
    this.kickRot = w.def.kick * 2;
    const mz = this.muzzles[this.index].position;
    this.flash.position.copy(mz);
    this.flashMesh.position.copy(mz);
    this.flash.intensity = 8;
    this.flashMesh.visible = true;
    this.flashMesh.scale.setScalar(0.7 + Math.random() * 0.8);
    if (w.def.scope) this.scoped = false;
    return true;
  }

  totalSpread(moveFactor: number, crouching: boolean, onGround: boolean) {
    const d = this.def;
    let s = d.spreadBase + this.spread + d.moveSpread * moveFactor;
    if (crouching) s *= 0.6;
    if (!onGround) s += 0.05;
    if (this.scoped) s *= 0.15;
    return s;
  }

  shotRecoil(): { pitch: number; yaw: number } {
    const d = this.def;
    const n = this.burstCount;
    if (!d.auto) return { pitch: d.recoilPitch * (0.9 + Math.random() * 0.2), yaw: (Math.random() - 0.5) * d.recoilYaw * 2 };
    let pitch: number;
    if (n <= 2) pitch = d.recoilPitch * 0.6;
    else if (n <= 9) pitch = d.recoilPitch * 1.3;
    else pitch = d.recoilPitch * 0.35;
    pitch *= 0.85 + Math.random() * 0.3;
    const phase = n <= 9 ? 0 : Math.sin(n * 0.55);
    const yaw = d.recoilYaw * (phase * 2.5 + (Math.random() - 0.5));
    return { pitch, yaw };
  }

  update(dt: number, mouseDX: number, mouseDY: number, bobTime: number, moveFactor: number) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.sinceShot += dt;
    if (this.reloading > 0) {
      this.reloading -= dt;
      if (this.reloading <= 0) {
        const w = this.current;
        const need = w.def.magSize - w.mag;
        const take = Math.min(need, w.reserve);
        w.mag += take;
        w.reserve -= take;
        this.reloading = 0;
      }
    }
    this.spread = Math.max(0, this.spread - this.def.spreadRecover * dt);
    this.kickZ *= Math.max(0, 1 - dt * 14);
    this.kickRot *= Math.max(0, 1 - dt * 12);
    this.switchAnim = Math.max(0, this.switchAnim - dt * 3);
    this.flash.intensity *= Math.max(0, 1 - dt * 40);
    if (this.flash.intensity < 0.3) this.flashMesh.visible = false;

    this.swayX += (-mouseDX * 0.0006 - this.swayX) * Math.min(1, dt * 10);
    this.swayY += (mouseDY * 0.0006 - this.swayY) * Math.min(1, dt * 10);

    const bobX = Math.sin(bobTime) * 0.012 * moveFactor;
    const bobY = Math.abs(Math.cos(bobTime)) * 0.01 * moveFactor;
    const reloadDip = this.reloading > 0 ? Math.sin(Math.min(1, (this.def.reloadTime - this.reloading) / this.def.reloadTime) * Math.PI) : 0;
    const scopedHide = this.scoped ? 1 : 0;

    this.viewmodel.position.set(
      0.28 + this.swayX + bobX - scopedHide * 0.28,
      -0.26 + this.swayY + bobY - reloadDip * 0.15 - this.switchAnim * 0.3 - scopedHide * 0.35,
      -0.45 + this.kickZ,
    );
    this.viewmodel.rotation.set(
      -this.kickRot + this.swayY * 2 + reloadDip * 0.6 + this.switchAnim * 0.8,
      0.06 + this.swayX * 2,
      reloadDip * 0.25,
    );
  }
}
