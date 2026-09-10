import * as THREE from "three";
import * as T from "./textures";

type Kind = "smoke" | "dust" | "blood" | "spark" | "flash";

interface Particle {
  obj: THREE.Sprite;
  vel: THREE.Vector3;
  life: number;
  max: number;
  grow: number;
  gravity: number;
  startScale: number;
  startOpacity: number;
  drag: number;
}

interface Shell { obj: THREE.Mesh; vel: THREE.Vector3; spin: THREE.Vector3; life: number; }
interface Fade { obj: THREE.Object3D; life: number; max: number; mat: THREE.Material & { opacity: number }; startOpacity: number; }

/** Transient visuals: muzzle flash/smoke, tracers, impact dust, sparks, blood, shell casings, bullet holes. */
export class Effects {
  private particles: Particle[] = [];
  private shells: Shell[] = [];
  private fades: Fade[] = [];
  private soft = T.softParticle();
  private holeTex = T.bulletHole();
  private tracerMat = new THREE.LineBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
  private decalGeo = new THREE.PlaneGeometry(0.16, 0.16);
  private decalMat = new THREE.MeshBasicMaterial({ map: this.holeTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
  private shellGeo = new THREE.CylinderGeometry(0.008, 0.007, 0.03, 6);
  private shellMat = new THREE.MeshStandardMaterial({ color: 0xd4a648, metalness: 0.9, roughness: 0.3 });
  private matCache = new Map<string, THREE.SpriteMaterial>();
  private decalCount = 0;
  private decals: THREE.Mesh[] = [];

  constructor(private scene: THREE.Scene) {}

  private spriteMat(kind: Kind): THREE.SpriteMaterial {
    let m = this.matCache.get(kind);
    if (!m) {
      const cfg: Record<Kind, { color: number; blending: THREE.Blending }> = {
        smoke: { color: 0xb9b2a6, blending: THREE.NormalBlending },
        dust: { color: 0xcbb995, blending: THREE.NormalBlending },
        blood: { color: 0x8c0f0f, blending: THREE.NormalBlending },
        spark: { color: 0xffc766, blending: THREE.AdditiveBlending },
        flash: { color: 0xffd9a0, blending: THREE.AdditiveBlending },
      };
      m = new THREE.SpriteMaterial({ map: this.soft, color: cfg[kind].color, transparent: true, depthWrite: false, blending: cfg[kind].blending });
      this.matCache.set(kind, m);
    }
    return m;
  }

  private emit(kind: Kind, pos: THREE.Vector3, vel: THREE.Vector3, life: number, scale: number, grow: number, gravity: number, opacity = 1, drag = 0) {
    const s = new THREE.Sprite(this.spriteMat(kind).clone());
    s.position.copy(pos);
    s.scale.setScalar(scale);
    s.material.opacity = opacity;
    s.material.rotation = Math.random() * Math.PI * 2;
    this.scene.add(s);
    this.particles.push({ obj: s, vel, life, max: life, grow, gravity, startScale: scale, startOpacity: opacity, drag });
  }

  private rnd(spread: number) {
    return new THREE.Vector3((Math.random() - 0.5) * spread, (Math.random() - 0.5) * spread, (Math.random() - 0.5) * spread);
  }

  /** Player muzzle: flash sprite + drifting smoke. */
  muzzle(pos: THREE.Vector3, dir: THREE.Vector3, big = false) {
    this.emit("flash", pos, new THREE.Vector3(), 0.05, big ? 0.5 : 0.3, 3, 0, 0.9);
    const n = big ? 5 : 3;
    for (let i = 0; i < n; i++) {
      const v = dir.clone().multiplyScalar(1.5 + Math.random() * 2).add(this.rnd(0.8)).add(new THREE.Vector3(0, 0.6, 0));
      this.emit("smoke", pos.clone().add(this.rnd(0.05)), v, 0.6 + Math.random() * 0.5, 0.12, 1.6, -0.3, 0.35, 3);
    }
  }

  /** Enemy muzzle flash (seen from a distance). */
  flash(pos: THREE.Vector3) {
    this.emit("flash", pos, new THREE.Vector3(), 0.06, 0.55, 2, 0, 1);
    this.emit("smoke", pos, new THREE.Vector3(0, 0.8, 0).add(this.rnd(0.6)), 0.7, 0.2, 1.4, -0.2, 0.3, 2);
  }

  /** Eject a brass casing from `pos` toward `side` (world direction). */
  shell(pos: THREE.Vector3, side: THREE.Vector3, up: THREE.Vector3) {
    const m = new THREE.Mesh(this.shellGeo, this.shellMat);
    m.position.copy(pos);
    m.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
    this.scene.add(m);
    const vel = side.clone().multiplyScalar(1.5 + Math.random()).add(up.clone().multiplyScalar(1.8 + Math.random())).add(this.rnd(0.6));
    this.shells.push({ obj: m, vel, spin: this.rnd(30), life: 2.5 });
  }

  tracer(from: THREE.Vector3, to: THREE.Vector3) {
    const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
    const mat = this.tracerMat.clone();
    const line = new THREE.Line(geo, mat);
    this.scene.add(line);
    this.fades.push({ obj: line, life: 0.07, max: 0.07, mat, startOpacity: 0.85 });
  }

  impact(point: THREE.Vector3, normal: THREE.Vector3, isEnemy: boolean) {
    if (isEnemy) {
      for (let i = 0; i < 8; i++) {
        const v = normal.clone().multiplyScalar(1 + Math.random() * 2).add(this.rnd(2.5));
        this.emit("blood", point, v, 0.35 + Math.random() * 0.25, 0.08 + Math.random() * 0.08, 0.6, -9, 0.9);
      }
      this.emit("blood", point, normal.clone().multiplyScalar(0.5), 0.3, 0.25, 1.5, -1, 0.5);
      return;
    }
    // dust puff + sparks + decal
    for (let i = 0; i < 4; i++) {
      const v = normal.clone().multiplyScalar(0.8 + Math.random() * 1.2).add(this.rnd(1.2));
      this.emit("dust", point, v, 0.5 + Math.random() * 0.4, 0.1, 1.8, -0.5, 0.45, 2.5);
    }
    for (let i = 0; i < 5; i++) {
      const v = normal.clone().multiplyScalar(2 + Math.random() * 3).add(this.rnd(4));
      this.emit("spark", point, v, 0.12 + Math.random() * 0.15, 0.04, 0, -12, 1);
    }
    const d = new THREE.Mesh(this.decalGeo, this.decalMat);
    d.position.copy(point).addScaledVector(normal, 0.012);
    d.lookAt(point.clone().add(normal));
    d.rotateZ(Math.random() * Math.PI * 2);
    d.scale.setScalar(0.7 + Math.random() * 0.6);
    this.scene.add(d);
    this.decals.push(d);
    if (this.decals.length > 120) { const old = this.decals.shift()!; this.scene.remove(old); }
    this.decalCount++;
  }

  update(dt: number) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) { this.scene.remove(p.obj); p.obj.material.dispose(); this.particles.splice(i, 1); continue; }
      const t = 1 - p.life / p.max;
      p.vel.y += p.gravity * dt;
      if (p.drag) p.vel.multiplyScalar(Math.max(0, 1 - p.drag * dt));
      p.obj.position.addScaledVector(p.vel, dt);
      p.obj.scale.setScalar(p.startScale * (1 + p.grow * t));
      p.obj.material.opacity = p.startOpacity * (1 - t * t);
    }
    for (let i = this.shells.length - 1; i >= 0; i--) {
      const s = this.shells[i];
      s.life -= dt;
      if (s.life <= 0) { this.scene.remove(s.obj); this.shells.splice(i, 1); continue; }
      s.vel.y -= 9.8 * dt;
      s.obj.position.addScaledVector(s.vel, dt);
      s.obj.rotation.x += s.spin.x * dt; s.obj.rotation.y += s.spin.y * dt; s.obj.rotation.z += s.spin.z * dt;
      if (s.obj.position.y < 0.015) {
        s.obj.position.y = 0.015;
        s.vel.y = Math.abs(s.vel.y) * 0.35;
        s.vel.x *= 0.6; s.vel.z *= 0.6;
        s.spin.multiplyScalar(0.4);
        if (s.vel.y < 0.3) { s.vel.set(0, 0, 0); s.spin.set(0, 0, 0); s.obj.rotation.x = Math.PI / 2; }
      }
    }
    for (let i = this.fades.length - 1; i >= 0; i--) {
      const f = this.fades[i];
      f.life -= dt;
      if (f.life <= 0) {
        this.scene.remove(f.obj);
        if ((f.obj as THREE.Line).geometry) (f.obj as THREE.Line).geometry.dispose();
        f.mat.dispose();
        this.fades.splice(i, 1);
        continue;
      }
      f.mat.opacity = f.startOpacity * (f.life / f.max);
    }
  }
}
