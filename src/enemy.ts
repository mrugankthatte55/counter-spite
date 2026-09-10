import * as THREE from "three";
import { GameMap, moveWithCollision } from "./map";
import { sfx } from "./audio";
import * as T from "./textures";

const HEIGHT = 1.8;
const RADIUS = 0.35;
const SPEED = 4.2;
const GRAVITY = 16;
const EYE = 1.62;

export const BOT_NAMES = ["Viper", "Ghost", "Rook", "Hex", "Jackal", "Nomad", "Sable", "Wraith"];

type State = "patrol" | "chase" | "attack";

export interface EnemyShot {
  from: THREE.Vector3;
  to: THREE.Vector3;
  hit: boolean;
  damage: number;
}

// Shared materials (each enemy clones the ones that flash on hit)
let shared: { camo: THREE.MeshStandardMaterial; dark: THREE.MeshStandardMaterial; skin: THREE.MeshStandardMaterial; metal: THREE.MeshStandardMaterial; wood: THREE.MeshStandardMaterial } | null = null;
function mats() {
  if (!shared) {
    shared = {
      camo: T.pbr(T.camo()),
      dark: T.pbr(T.darkFabric()),
      skin: T.pbr(T.skin()),
      metal: T.pbr(T.gunmetal(), { metalness: 0.7 }),
      wood: T.pbr(T.gunWood()),
    };
  }
  return shared;
}

function capsule(r: number, len: number, mat: THREE.Material) {
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 4, 12), mat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}
function boxMesh(w: number, h: number, d: number, mat: THREE.Material) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

export class Enemy {
  group = new THREE.Group();
  pos = new THREE.Vector3();
  vel = new THREE.Vector3();
  yaw = 0;
  health = 100;
  alive = true;
  respawnTimer = 0;
  deathTimer = 0;
  hitboxes: THREE.Mesh[] = [];
  name: string;
  private state: State = "patrol";
  private target = new THREE.Vector3();
  private lastKnown: THREE.Vector3 | null = null;
  private stuckTimer = 0;
  private lastPos = new THREE.Vector3();
  private fireTimer = 0;
  private burstLeft = 0;
  private reactTimer = 0;
  private strafeDir = 1;
  private strafeTimer = 0;
  private hitFlash = 0;
  private hipL: THREE.Group;
  private hipR: THREE.Group;
  private kneeL: THREE.Group;
  private kneeR: THREE.Group;
  private torso: THREE.Group;
  private walkTime = 0;
  private gunTip = new THREE.Object3D();
  private flashMats: THREE.MeshStandardMaterial[] = [];
  private rayc = new THREE.Raycaster();

  constructor(name: string, private map: GameMap) {
    this.name = name;
    const M = mats();
    const camo = M.camo.clone(), dark = M.dark.clone(), skin = M.skin.clone();
    this.flashMats = [camo, dark, skin];
    const tag = (m: THREE.Mesh, part: string) => { m.userData = { enemy: this, part }; this.hitboxes.push(m); return m; };

    // ---- torso (pivot at hips so it can lean) ----
    this.torso = new THREE.Group();
    this.torso.position.y = 0.9;
    const chest = tag(capsule(0.27, 0.42, camo), "body");
    chest.position.y = 0.34;
    // Plate carrier: front and back plates outside the chest capsule, shoulder straps, pouches
    const plateF = tag(boxMesh(0.42, 0.4, 0.08, dark), "body"); plateF.position.set(0, 0.36, -0.27);
    const plateB = tag(boxMesh(0.42, 0.4, 0.08, dark), "body"); plateB.position.set(0, 0.36, 0.27);
    const strapL = boxMesh(0.08, 0.12, 0.5, dark); strapL.position.set(-0.15, 0.58, 0);
    const strapR = boxMesh(0.08, 0.12, 0.5, dark); strapR.position.set(0.15, 0.58, 0);
    const pouchL = boxMesh(0.12, 0.13, 0.08, dark); pouchL.position.set(-0.12, 0.22, -0.34);
    const pouchR = boxMesh(0.12, 0.13, 0.08, dark); pouchR.position.set(0.12, 0.22, -0.34);
    const pouchC = boxMesh(0.1, 0.1, 0.07, dark); pouchC.position.set(0, 0.4, -0.34);
    const belt = boxMesh(0.5, 0.08, 0.5, dark); belt.position.y = 0.02;
    this.torso.add(chest, plateF, plateB, strapL, strapR, pouchL, pouchR, pouchC, belt);

    // ---- head ----
    const neck = capsule(0.07, 0.06, skin); neck.position.y = 0.62;
    const head = tag(new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 12), dark), "head");
    head.position.y = 0.78;
    head.castShadow = true;
    const face = tag(new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 8), skin), "head");
    face.scale.set(0.7, 0.45, 0.5);
    face.position.set(0, 0.8, -0.1);
    const eyeGeo = new THREE.SphereGeometry(0.02, 6, 6);
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.3 });
    const eyeL = new THREE.Mesh(eyeGeo, eyeMat); eyeL.position.set(-0.05, 0.81, -0.15);
    const eyeR = new THREE.Mesh(eyeGeo, eyeMat); eyeR.position.set(0.05, 0.81, -0.15);
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.025, 6, 20), new THREE.MeshStandardMaterial({ color: 0x8a1f1f, roughness: 0.9 }));
    band.rotation.x = Math.PI / 2; band.position.y = 0.86;
    this.torso.add(neck, head, face, eyeL, eyeR, band);

    // ---- arms (posed holding the rifle) ----
    const makeArm = (side: number, upperRot: THREE.Euler, lowerRot: number) => {
      const shoulder = new THREE.Group();
      shoulder.position.set(side * 0.33, 0.52, 0);
      const upper = tag(capsule(0.075, 0.24, camo), "body");
      upper.position.y = -0.15;
      shoulder.add(upper);
      const elbow = new THREE.Group();
      elbow.position.y = -0.3;
      const lower = tag(capsule(0.065, 0.22, camo), "body");
      lower.position.y = -0.14;
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), skin);
      hand.position.y = -0.3;
      elbow.add(lower, hand);
      elbow.rotation.x = lowerRot;
      shoulder.add(elbow);
      shoulder.rotation.copy(upperRot);
      return shoulder;
    };
    const armR = makeArm(1, new THREE.Euler(-1.15, 0, -0.2), -0.9);
    const armL = makeArm(-1, new THREE.Euler(-1.35, 0.5, 0.35), -1.0);
    this.torso.add(armR, armL);

    // ---- rifle ----
    const gun = new THREE.Group();
    const body = boxMesh(0.055, 0.09, 0.42, M.metal);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.45, 8), M.metal);
    barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.02, -0.42);
    const mag = boxMesh(0.04, 0.16, 0.07, M.metal); mag.position.set(0, -0.11, -0.05); mag.rotation.x = 0.3;
    const stock = boxMesh(0.045, 0.07, 0.25, M.wood); stock.position.set(0, -0.01, 0.32);
    const guard = boxMesh(0.06, 0.06, 0.2, M.wood); guard.position.set(0, 0, -0.3);
    gun.add(body, barrel, mag, stock, guard);
    gun.position.set(0.12, 0.35, -0.42);
    gun.rotation.set(0.05, 0.12, 0);
    this.gunTip.position.set(0, 0.02, -0.65);
    gun.add(this.gunTip);
    this.torso.add(gun);

    // ---- legs ----
    const makeLeg = (side: number) => {
      const hip = new THREE.Group();
      hip.position.set(side * 0.16, 0.9, 0);
      const thigh = tag(capsule(0.11, 0.3, camo), "leg");
      thigh.position.y = -0.2;
      hip.add(thigh);
      const knee = new THREE.Group();
      knee.position.y = -0.42;
      const shin = tag(capsule(0.095, 0.28, camo), "leg");
      shin.position.y = -0.2;
      const boot = boxMesh(0.2, 0.14, 0.32, dark);
      boot.position.set(0, -0.41, -0.05);
      knee.add(shin, boot);
      hip.add(knee);
      return { hip, knee };
    };
    const L = makeLeg(-1), R = makeLeg(1);
    this.hipL = L.hip; this.hipR = R.hip; this.kneeL = L.knee; this.kneeR = R.knee;

    this.group.add(this.torso, this.hipL, this.hipR);
  }

  get eye() { return new THREE.Vector3(this.pos.x, this.pos.y + EYE, this.pos.z); }

  spawn(at: THREE.Vector3) {
    this.pos.copy(at);
    this.vel.set(0, 0, 0);
    this.health = 100;
    this.alive = true;
    this.state = "patrol";
    this.lastKnown = null;
    this.group.visible = true;
    this.group.rotation.set(0, 0, 0);
    this.group.position.copy(this.pos);
    this.pickWaypoint();
    for (const m of this.flashMats) m.emissive.setHex(0);
  }

  private pickWaypoint() {
    const wps = this.map.waypoints;
    let best = wps[Math.floor(Math.random() * wps.length)];
    for (let i = 0; i < 3; i++) {
      const c = wps[Math.floor(Math.random() * wps.length)];
      if (c.distanceTo(this.pos) > best.distanceTo(this.pos) * 0.5 && Math.random() < 0.5) best = c;
    }
    this.target.copy(best);
    this.stuckTimer = 0;
  }

  /** Returns true if this enemy died. */
  damage(amount: number, attackerPos: THREE.Vector3): boolean {
    if (!this.alive) return false;
    this.health -= amount;
    this.hitFlash = 0.12;
    this.lastKnown = attackerPos.clone();
    if (this.state === "patrol") { this.state = "chase"; this.reactTimer = 0.2; }
    if (this.health <= 0) {
      this.alive = false;
      this.deathTimer = 2.5;
      this.respawnTimer = 5;
      this.vel.set(0, 0, 0);
      return true;
    }
    return false;
  }

  canSee(point: THREE.Vector3): boolean {
    const eye = this.eye;
    const dir = point.clone().sub(eye);
    const dist = dir.length();
    if (dist > 60) return false;
    dir.normalize();
    const facing = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const flat = new THREE.Vector3(dir.x, 0, dir.z).normalize();
    if (dist > 3 && facing.dot(flat) < -0.3) return false;
    this.rayc.set(eye, dir);
    this.rayc.far = dist;
    const hits = this.rayc.intersectObjects(this.map.solids, false);
    return hits.length === 0;
  }

  /** Static idle pose with breathing, used for the menu hero. */
  idle(time: number) {
    this.group.position.copy(this.pos);
    this.group.rotation.set(0, this.yaw, 0);
    this.torso.position.y = 0.9 + Math.sin(time * 1.4) * 0.012;
    this.torso.rotation.set(-0.03 + Math.sin(time * 1.4) * 0.008, Math.sin(time * 0.35) * 0.06, 0);
    this.hipL.rotation.x = 0.05; this.hipR.rotation.x = -0.05;
    this.kneeL.rotation.x = this.kneeR.rotation.x = 0.05;
  }

  /** World-space muzzle position (for effects). */
  muzzle() { return this.gunTip.getWorldPosition(new THREE.Vector3()); }

  update(dt: number, playerPos: THREE.Vector3, playerEye: THREE.Vector3, playerAlive: boolean, playerMoving: number): EnemyShot | null {
    if (!this.alive) {
      if (this.deathTimer > 0) {
        this.deathTimer -= dt;
        const t = 1 - Math.max(0, this.deathTimer / 2.5);
        const fall = Math.min(1, t * 3);
        this.group.rotation.x = -fall * fall * Math.PI / 2;
        this.group.rotation.z = fall * 0.15;
        if (this.deathTimer <= 0) this.group.visible = false;
      }
      this.respawnTimer -= dt;
      return null;
    }

    if (this.hitFlash > 0) {
      this.hitFlash -= dt;
      const f = this.hitFlash > 0 ? 0.6 : 0;
      for (const m of this.flashMats) m.emissive.setRGB(f, 0, 0);
    }

    const sees = playerAlive && this.canSee(playerEye);
    const toPlayer = playerPos.clone().sub(this.pos);
    const dist = toPlayer.length();
    let shot: EnemyShot | null = null;

    if (sees) {
      this.lastKnown = playerPos.clone();
      if (this.state !== "attack") { this.state = "attack"; this.reactTimer = 0.25 + Math.random() * 0.3; }
    } else if (this.state === "attack") {
      this.state = "chase";
      this.fireTimer = 0.5;
    }

    const moveDir = new THREE.Vector3();
    let desiredYaw = this.yaw;
    let aimPitch = 0;

    if (this.state === "attack") {
      desiredYaw = Math.atan2(-toPlayer.x, -toPlayer.z);
      aimPitch = Math.atan2(playerEye.y - (this.pos.y + 1.25), Math.hypot(toPlayer.x, toPlayer.z));
      this.strafeTimer -= dt;
      if (this.strafeTimer <= 0) { this.strafeDir = Math.random() < 0.5 ? -1 : 1; this.strafeTimer = 0.8 + Math.random() * 1.2; }
      const flat = new THREE.Vector3(toPlayer.x, 0, toPlayer.z).normalize();
      const side = new THREE.Vector3(flat.z, 0, -flat.x).multiplyScalar(this.strafeDir);
      if (dist > 14) moveDir.copy(flat).add(side.multiplyScalar(0.4));
      else if (dist < 5) moveDir.copy(flat).multiplyScalar(-0.6).add(side);
      else moveDir.copy(side).multiplyScalar(0.7);

      this.reactTimer -= dt;
      this.fireTimer -= dt;
      if (this.reactTimer <= 0 && this.fireTimer <= 0) {
        if (this.burstLeft <= 0) { this.burstLeft = 3 + Math.floor(Math.random() * 4); this.fireTimer = 0.5 + Math.random() * 0.5; }
        else {
          this.burstLeft--;
          this.fireTimer = 0.11;
          let acc = 0.55 - dist * 0.012 - playerMoving * 0.15 - (this.burstLeft > 3 ? 0 : 0.05);
          acc = Math.max(0.08, Math.min(0.7, acc));
          const hit = Math.random() < acc;
          const from = this.muzzle();
          const to = playerEye.clone();
          if (!hit) to.add(new THREE.Vector3((Math.random() - 0.5) * 2.5, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2.5));
          sfx.enemyShot(dist);
          shot = { from, to, hit, damage: 9 + Math.floor(Math.random() * 8) };
        }
      }
    } else if (this.state === "chase") {
      if (this.lastKnown) {
        const d = this.lastKnown.clone().sub(this.pos); d.y = 0;
        if (d.length() < 1.5) { this.state = "patrol"; this.lastKnown = null; this.pickWaypoint(); }
        else { moveDir.copy(d).normalize(); desiredYaw = Math.atan2(-d.x, -d.z); }
      } else this.state = "patrol";
    } else {
      const d = this.target.clone().sub(this.pos); d.y = 0;
      if (d.length() < 1.5) this.pickWaypoint();
      else { moveDir.copy(d).normalize(); desiredYaw = Math.atan2(-d.x, -d.z); }
    }

    let dy = desiredYaw - this.yaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    this.yaw += dy * Math.min(1, dt * (this.state === "attack" ? 10 : 5));

    const speed = this.state === "attack" ? SPEED * 0.8 : SPEED;
    if (moveDir.lengthSq() > 0) moveDir.normalize().multiplyScalar(speed);
    this.vel.x += (moveDir.x - this.vel.x) * Math.min(1, dt * 8);
    this.vel.z += (moveDir.z - this.vel.z) * Math.min(1, dt * 8);
    this.vel.y -= GRAVITY * dt;
    const delta = this.vel.clone().multiplyScalar(dt);
    const res = moveWithCollision(this.pos, delta, RADIUS, HEIGHT, this.map.colliders, this.map.bounds);
    if (res.onGround && this.vel.y < 0) this.vel.y = 0;

    if (this.state !== "attack") {
      this.stuckTimer += dt;
      if (this.stuckTimer > 1.2) {
        if (this.lastPos.distanceTo(this.pos) < 0.6) { this.pickWaypoint(); if (this.state === "chase") { this.state = "patrol"; this.lastKnown = null; } }
        this.lastPos.copy(this.pos);
        this.stuckTimer = 0;
      }
    }

    // ---- animation ----
    const hs = Math.hypot(this.vel.x, this.vel.z);
    const gait = Math.min(1, hs / SPEED);
    this.walkTime += dt * hs * 2.4;
    const swing = Math.sin(this.walkTime) * 0.65 * gait;
    this.hipL.rotation.x = swing;
    this.hipR.rotation.x = -swing;
    this.kneeL.rotation.x = Math.max(0, -Math.sin(this.walkTime - 0.5)) * 0.9 * gait;
    this.kneeR.rotation.x = Math.max(0, Math.sin(this.walkTime - 0.5)) * 0.9 * gait;
    this.torso.position.y = 0.9 + Math.abs(Math.sin(this.walkTime)) * 0.04 * gait;
    this.torso.rotation.z = Math.sin(this.walkTime) * 0.04 * gait;
    // lean forward slightly while running, aim pitch when attacking
    this.torso.rotation.x = -0.08 * gait + (this.state === "attack" ? -aimPitch * 0.6 : 0);

    this.group.position.copy(this.pos);
    this.group.rotation.y = this.yaw;
    return shot;
  }
}
