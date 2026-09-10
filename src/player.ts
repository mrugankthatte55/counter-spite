import * as THREE from "three";
import { Input } from "./input";
import { GameMap, moveWithCollision } from "./map";
import { sfx } from "./audio";

const STAND_HEIGHT = 1.8;
const CROUCH_HEIGHT = 1.1;
const EYE_OFFSET = 0.15;
const RADIUS = 0.35;
const RUN_SPEED = 6.5;
const WALK_SPEED = 3.0;
const CROUCH_SPEED = 2.5;
const JUMP_SPEED = 5.5;
const GRAVITY = 16;
const SENSITIVITY = 0.0022;

export class Player {
  pos = new THREE.Vector3(0, 0, 0); // feet
  vel = new THREE.Vector3();
  yaw = 0;
  pitch = 0;
  height = STAND_HEIGHT;
  crouching = false;
  onGround = false;
  health = 100;
  armor = 0;
  alive = true;
  sensitivity = 1;
  speedFactor = 0; // 0..1 how fast we're moving (for spread/bob)
  bobTime = 0;
  // Recoil is a view offset: it kicks toward the target quickly and the target decays back to zero.
  private recoilTargetPitch = 0;
  private recoilTargetYaw = 0;
  recoilPitch = 0;
  recoilYaw = 0;
  camera: THREE.PerspectiveCamera;
  private stepTimer = 0;

  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera;
  }

  get eyeY() { return this.pos.y + this.height - EYE_OFFSET; }
  get radius() { return RADIUS; }

  spawn(at: THREE.Vector3, lookAt?: THREE.Vector3) {
    this.pos.copy(at);
    this.vel.set(0, 0, 0);
    this.health = 100;
    this.armor = 100;
    this.alive = true;
    this.pitch = 0;
    this.recoilPitch = this.recoilYaw = 0;
    this.recoilTargetPitch = this.recoilTargetYaw = 0;
    if (lookAt) {
      const d = lookAt.clone().sub(at);
      this.yaw = Math.atan2(-d.x, -d.z);
    }
    this.updateCamera();
  }

  addRecoil(pitch: number, yaw: number) {
    this.recoilTargetPitch = Math.min(0.35, this.recoilTargetPitch + pitch);
    this.recoilTargetYaw = Math.max(-0.12, Math.min(0.12, this.recoilTargetYaw + yaw));
  }

  update(dt: number, input: Input, map: GameMap) {
    // Look
    if (this.alive) {
      this.yaw -= input.mouseDX * SENSITIVITY * this.sensitivity;
      this.pitch -= input.mouseDY * SENSITIVITY * this.sensitivity;
    }
    // Recoil: target decays (recovery), offset chases target (kick)
    const decay = Math.exp(-dt * 5);
    this.recoilTargetPitch *= decay;
    this.recoilTargetYaw *= decay;
    const chase = Math.min(1, dt * 30);
    this.recoilPitch += (this.recoilTargetPitch - this.recoilPitch) * chase;
    this.recoilYaw += (this.recoilTargetYaw - this.recoilYaw) * chase;
    this.pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, this.pitch));

    // Crouch
    const wantCrouch = this.alive && input.down("ControlLeft");
    if (wantCrouch !== this.crouching) {
      if (wantCrouch) { this.crouching = true; this.height = CROUCH_HEIGHT; }
      else {
        // check headroom
        let ok = true;
        for (const b of map.colliders) {
          if (this.pos.x + RADIUS > b.min.x && this.pos.x - RADIUS < b.max.x && this.pos.z + RADIUS > b.min.z && this.pos.z - RADIUS < b.max.z) {
            if (b.min.y >= this.pos.y + CROUCH_HEIGHT - 0.05 && b.min.y < this.pos.y + STAND_HEIGHT) ok = false;
          }
        }
        if (ok) { this.crouching = false; this.height = STAND_HEIGHT; }
      }
    }

    // Movement
    const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(-forward.z, 0, forward.x);
    const wish = new THREE.Vector3();
    if (this.alive) {
      if (input.down("KeyW")) wish.add(forward);
      if (input.down("KeyS")) wish.sub(forward);
      if (input.down("KeyD")) wish.add(right);
      if (input.down("KeyA")) wish.sub(right);
    }
    let speed = RUN_SPEED;
    if (this.crouching) speed = CROUCH_SPEED;
    else if (input.down("ShiftLeft")) speed = WALK_SPEED;
    if (wish.lengthSq() > 0) wish.normalize().multiplyScalar(speed);

    const accel = this.onGround ? 12 : 2.5;
    this.vel.x += (wish.x - this.vel.x) * Math.min(1, accel * dt);
    this.vel.z += (wish.z - this.vel.z) * Math.min(1, accel * dt);

    if (this.onGround && this.alive && input.justPressed("Space")) {
      this.vel.y = JUMP_SPEED;
      this.onGround = false;
      sfx.jump();
    }
    this.vel.y -= GRAVITY * dt;

    const delta = this.vel.clone().multiplyScalar(dt);
    const res = moveWithCollision(this.pos, delta, RADIUS, this.height, map.colliders, map.bounds);
    const wasGround = this.onGround;
    this.onGround = res.onGround;
    if (this.onGround && this.vel.y < 0) this.vel.y = 0;
    if (this.onGround && !wasGround) sfx.step();

    const hs = Math.hypot(this.vel.x, this.vel.z);
    this.speedFactor = Math.min(1, hs / RUN_SPEED);
    if (this.onGround && hs > 0.5) {
      this.bobTime += dt * hs * 1.6;
      this.stepTimer -= dt * hs;
      if (this.stepTimer <= 0) { this.stepTimer = 2.6; if (!this.crouching && speed !== WALK_SPEED) sfx.step(); }
    } else {
      this.stepTimer = 0.5;
    }

    this.updateCamera();
  }

  updateCamera() {
    const bob = this.onGround ? Math.sin(this.bobTime) * 0.035 * this.speedFactor : 0;
    this.camera.position.set(this.pos.x, this.eyeY + bob, this.pos.z);
    this.camera.rotation.set(0, 0, 0);
    this.camera.rotation.order = "YXZ";
    this.camera.rotation.y = this.yaw + this.recoilYaw;
    this.camera.rotation.x = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, this.pitch + this.recoilPitch));
    this.camera.rotation.z = Math.cos(this.bobTime * 0.5) * 0.006 * this.speedFactor;
    if (!this.alive) {
      this.camera.position.y = this.pos.y + 0.4;
      this.camera.rotation.z = 0.6;
    }
  }

  /** Armor absorbs half of incoming damage until it is depleted. */
  damage(amount: number): boolean {
    if (!this.alive) return false;
    const absorbed = Math.min(this.armor, amount * 0.5);
    this.armor -= absorbed;
    this.health = Math.max(0, this.health - (amount - absorbed));
    if (this.health <= 0) {
      this.alive = false;
      this.vel.set(0, 0, 0);
      return true;
    }
    return false;
  }
}
