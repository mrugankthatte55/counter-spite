import * as THREE from "three";
import { Sky } from "three/addons/objects/Sky.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { GTAOPass } from "three/addons/postprocessing/GTAOPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { buildMap } from "./map";
import { Input } from "./input";
import { Player } from "./player";
import { Arsenal } from "./weapon";
import { Enemy, BOT_NAMES } from "./enemy";
import { Effects } from "./effects";
import { HUD } from "./hud";
import { sfx, unlockAudio } from "./audio";

const ROUND_SECONDS = 300;
const BOT_COUNT = 5;
const RESPAWN_SECONDS = 3;
const BASE_FOV = 75;

type Quality = "high" | "medium" | "low";
const AUTOPLAY = new URLSearchParams(location.search).has("autoplay");
const gfxParam = new URLSearchParams(location.search).get("gfx") as Quality | null;
let quality: Quality = gfxParam || (localStorage.getItem("gfxQuality") as Quality) || "high";
if (AUTOPLAY && !gfxParam) quality = "low";

// ---------- Renderer / scene ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(AUTOPLAY ? 0.5 : Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.8;
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xc7d3e2, 70, 260);

const camera = new THREE.PerspectiveCamera(BASE_FOV, window.innerWidth / window.innerHeight, 0.05, 400);
scene.add(camera);

// Sky + sun + environment lighting
const sky = new Sky();
sky.scale.setScalar(3000);
const sunDir = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - 38), THREE.MathUtils.degToRad(160));
const skyU = sky.material.uniforms;
skyU.turbidity.value = 4;
skyU.rayleigh.value = 1.6;
skyU.mieCoefficient.value = 0.006;
skyU.mieDirectionalG.value = 0.85;
skyU.sunPosition.value.copy(sunDir);
scene.add(sky);
{
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  const envSky = new Sky();
  envSky.scale.setScalar(3000);
  envSky.material.uniforms.turbidity.value = 4;
  envSky.material.uniforms.rayleigh.value = 1.6;
  envSky.material.uniforms.mieCoefficient.value = 0.006;
  envSky.material.uniforms.mieDirectionalG.value = 0.85;
  envSky.material.uniforms.sunPosition.value.copy(sunDir);
  envScene.add(envSky);
  scene.environment = pmrem.fromScene(envScene, 0.02).texture;
  scene.environmentIntensity = 0.35;
  pmrem.dispose();
}

const hemi = new THREE.HemisphereLight(0xd6e4ff, 0x9a8a6a, 0.35);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff0d8, 2.6);
sun.position.copy(sunDir).multiplyScalar(80);
sun.castShadow = true;
sun.shadow.camera.left = sun.shadow.camera.bottom = -48;
sun.shadow.camera.right = sun.shadow.camera.top = 48;
sun.shadow.camera.near = 10;
sun.shadow.camera.far = 200;
sun.shadow.bias = -0.0002;
sun.shadow.normalBias = 0.03;
scene.add(sun);
scene.add(sun.target);

const map = buildMap();
scene.add(map.group);

const input = new Input(renderer.domElement);
const player = new Player(camera);
const arsenal = new Arsenal(camera);
const effects = new Effects(scene);
const hud = new HUD();

const enemies: Enemy[] = [];
for (let i = 0; i < BOT_COUNT; i++) {
  const e = new Enemy(BOT_NAMES[i % BOT_NAMES.length], map);
  scene.add(e.group);
  enemies.push(e);
}

// ---------- Post-processing / quality ----------
let composer: EffectComposer | null = null;
let gtao: GTAOPass | null = null;

function applyQuality(q: Quality) {
  quality = q;
  if (!AUTOPLAY) localStorage.setItem("gfxQuality", q);
  const w = window.innerWidth, h = window.innerHeight;
  if (composer) { composer.dispose(); composer = null; gtao = null; }
  const shadowSize = q === "high" ? 4096 : q === "medium" ? 2048 : 1024;
  sun.shadow.mapSize.set(shadowSize, shadowSize);
  if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
  renderer.shadowMap.enabled = !(AUTOPLAY && q === "low");
  if (q === "low") return;
  const target = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: 4 });
  composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));
  if (q === "high") {
    gtao = new GTAOPass(scene, camera, w, h);
    gtao.output = GTAOPass.OUTPUT.Default;
    gtao.blendIntensity = 0.9;
    gtao.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1, thickness: 1, scale: 1, samples: 12, distanceFallOff: 1, screenSpaceRadius: false });
    gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 4, radiusExponent: 1, rings: 2, samples: 12 });
    composer.addPass(gtao);
  }
  const bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.28, 0.5, 0.92);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
}
applyQuality(quality);

const qualitySelect = document.getElementById("quality") as HTMLSelectElement;
qualitySelect.value = quality;
qualitySelect.addEventListener("change", () => applyQuality(qualitySelect.value as Quality));
qualitySelect.addEventListener("click", (e) => e.stopPropagation());

// ---------- Game state ----------
let scoreCT = 0;
let scoreT = 0;
let roundTime = ROUND_SECONDS;
let roundOver = false;
let playerRespawn = 0;
let paused = true;
let totalKills = 0;
let totalDeaths = 0;

const overlay = document.getElementById("overlay")!;
const menuStats = document.getElementById("menuStats")!;

function randomSpawn(list: THREE.Vector3[], avoid?: THREE.Vector3) {
  let best = list[Math.floor(Math.random() * list.length)];
  if (avoid) {
    for (let i = 0; i < 4; i++) {
      const c = list[Math.floor(Math.random() * list.length)];
      if (c.distanceTo(avoid) > best.distanceTo(avoid)) best = c;
    }
  }
  return best;
}

function spawnPlayer() {
  const at = randomSpawn(map.ctSpawns);
  player.spawn(at, new THREE.Vector3(0, 0, 0));
  arsenal.refillAll();
  arsenal.switchTo(0);
}

function startRound() {
  scoreCT = 0;
  scoreT = 0;
  roundTime = ROUND_SECONDS;
  roundOver = false;
  spawnPlayer();
  enemies.forEach((e) => e.spawn(randomSpawn(map.tSpawns, player.pos)));
  if (!paused) hud.showMessage("ROUND START", "Eliminate the terrorists", 2.5);
}

function endRound() {
  roundOver = true;
  const win = scoreCT > scoreT;
  const tie = scoreCT === scoreT;
  hud.showMessage(tie ? "DRAW" : win ? "COUNTER-TERRORISTS WIN" : "TERRORISTS WIN", "Next round in 6 seconds", 6);
  if (win) sfx.roundWin(); else sfx.roundLose();
  setTimeout(startRound, 6000);
}

// ---------- Pointer lock / menu ----------
document.getElementById("playBtn")!.addEventListener("click", () => {
  unlockAudio();
  input.lock();
});
overlay.addEventListener("click", (e) => {
  const t = e.target as HTMLElement;
  if (t.id !== "playBtn" && t.tagName !== "SELECT" && t.tagName !== "LABEL") { unlockAudio(); input.lock(); }
});
document.addEventListener("pointerlockchange", () => {
  paused = !input.locked;
  overlay.classList.toggle("hidden", !paused);
  if (paused) {
    menuStats.textContent = `Kills: ${totalKills}   Deaths: ${totalDeaths}   K/D: ${(totalKills / Math.max(1, totalDeaths)).toFixed(2)}`;
    document.getElementById("playBtn")!.textContent = "CLICK TO RESUME";
  }
});

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer?.setSize(window.innerWidth, window.innerHeight);
});

// ---------- Shooting ----------
const raycaster = new THREE.Raycaster();
const tmpDir = new THREE.Vector3();

function fireWeapon() {
  const def = arsenal.def;
  const spread = arsenal.totalSpread(player.speedFactor, player.crouching, player.onGround);
  camera.getWorldDirection(tmpDir);
  const r = spread * Math.sqrt(Math.random());
  const a = Math.random() * Math.PI * 2;
  const right = new THREE.Vector3().crossVectors(tmpDir, camera.up).normalize();
  const up = new THREE.Vector3().crossVectors(right, tmpDir).normalize();
  const dir = tmpDir.clone().addScaledVector(right, Math.cos(a) * r).addScaledVector(up, Math.sin(a) * r).normalize();

  raycaster.set(camera.position, dir);
  raycaster.far = 200;
  const targets: THREE.Object3D[] = [...map.solids];
  for (const e of enemies) if (e.alive) targets.push(...e.hitboxes);
  const hits = raycaster.intersectObjects(targets, false);

  camera.updateMatrixWorld();
  const muzzle = arsenal.muzzleWorld();
  let end: THREE.Vector3;
  if (hits.length > 0) {
    const h = hits[0];
    end = h.point;
    const enemy = h.object.userData.enemy as Enemy | undefined;
    if (enemy) {
      const part = h.object.userData.part as string;
      let dmg = def.damage;
      if (part === "head") dmg *= def.headshotMult;
      else if (part === "leg") dmg *= 0.75;
      const killed = enemy.damage(dmg, player.pos);
      hud.hit(killed);
      if (killed) {
        sfx.kill();
        scoreCT++;
        totalKills++;
        hud.feed("You", enemy.name, part === "head" ? `${def.name} ★` : def.name, true, false);
      } else sfx.hit();
      effects.impact(h.point, dir.clone().negate(), true);
    } else {
      const n = h.face ? h.face.normal.clone().transformDirection(h.object.matrixWorld) : dir.clone().negate();
      effects.impact(h.point, n, false);
      sfx.impact();
    }
  } else {
    end = camera.position.clone().addScaledVector(dir, 200);
  }
  effects.tracer(muzzle, end);
  effects.muzzle(muzzle, tmpDir, def.name === "AWP");
  effects.shell(arsenal.ejectWorld(), right, up);
  const recoil = arsenal.shotRecoil();
  player.addRecoil(recoil.pitch, recoil.yaw);
}

// ---------- Main loop ----------
let last = performance.now();
let fpsAcc = 0, fpsFrames = 0;

function render() {
  if (composer) composer.render();
  else renderer.render(scene, camera);
}

function frame(now: number) {
  requestAnimationFrame(frame);
  const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
  last = now;
  fpsAcc += dt; fpsFrames++;
  if (fpsAcc >= 0.5) { hud.setFps(fpsFrames / fpsAcc); fpsAcc = 0; fpsFrames = 0; }

  // Keep the shadow frustum centred on the player so the map stays sharp
  sun.target.position.set(player.pos.x, 0, player.pos.z);
  sun.position.copy(sunDir).multiplyScalar(80).add(sun.target.position);

  if (paused) { render(); input.endFrame(); return; }

  if (!roundOver) {
    roundTime -= dt;
    if (roundTime <= 0) { roundTime = 0; endRound(); }
  }

  player.update(dt, input, map);
  if (player.alive) {
    if (input.justPressed("Digit1")) arsenal.switchTo(0);
    if (input.justPressed("Digit2")) arsenal.switchTo(1);
    if (input.justPressed("Digit3")) arsenal.switchTo(2);
    if (input.wheel !== 0) arsenal.switchTo((arsenal.index + input.wheel + arsenal.weapons.length) % arsenal.weapons.length);
    if (input.justPressed("KeyR")) arsenal.reload();
    if (arsenal.def.scope && arsenal.reloading <= 0 && (input.justClicked2() || input.justPressed("KeyQ"))) {
      arsenal.scoped = !arsenal.scoped;
    }
    if (!roundOver && arsenal.tryFire(input.mouseDown, input.justClicked())) fireWeapon();
  } else {
    playerRespawn -= dt;
    if (playerRespawn <= 0 && !roundOver) spawnPlayer();
  }
  arsenal.update(dt, input.mouseDX, input.mouseDY, player.bobTime, player.speedFactor);

  const targetFov = arsenal.scoped && arsenal.def.scope ? arsenal.def.scope : BASE_FOV;
  camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 12);
  camera.updateProjectionMatrix();

  const eye = camera.position.clone();
  for (const e of enemies) {
    if (!e.alive && e.respawnTimer <= 0 && !roundOver) e.spawn(randomSpawn(map.tSpawns, player.pos));
    const shot = e.update(dt, player.pos, eye, player.alive && !roundOver, player.speedFactor);
    if (shot) {
      effects.tracer(shot.from, shot.to);
      effects.flash(shot.from);
      if (shot.hit && player.alive) {
        const died = player.damage(shot.damage);
        hud.damageFlash();
        sfx.hurt();
        if (died) {
          sfx.death();
          scoreT++;
          totalDeaths++;
          playerRespawn = RESPAWN_SECONDS;
          arsenal.scoped = false;
          hud.feed(e.name, "You", "AK-47", false, true);
          hud.showMessage("YOU DIED", `Respawning in ${RESPAWN_SECONDS}s`, RESPAWN_SECONDS);
        }
      } else if (!shot.hit) {
        raycaster.set(shot.from, shot.to.clone().sub(shot.from).normalize());
        raycaster.far = 120;
        const h = raycaster.intersectObjects(map.solids, false)[0];
        if (h) {
          const n = h.face ? h.face.normal.clone().transformDirection(h.object.matrixWorld) : new THREE.Vector3(0, 1, 0);
          effects.impact(h.point, n, false);
        }
      }
    }
  }

  effects.update(dt);

  hud.setHealth(player.health);
  hud.setAmmo(arsenal.def.name, arsenal.current.mag, arsenal.current.reserve, arsenal.reloading > 0);
  hud.setScore(scoreCT, scoreT, roundTime);
  hud.setSpread(arsenal.totalSpread(player.speedFactor, player.crouching, player.onGround), arsenal.scoped);
  hud.update(dt);

  render();
  input.endFrame();
}

if (AUTOPLAY) {
  overlay.classList.add("hidden");
  const origEnd = input.endFrame.bind(input);
  input.endFrame = () => { origEnd(); input.mouseDown = true; input.keys.add("KeyW"); input.mouseDX = 6; };
  setTimeout(() => console.log(`[autoplay] kills=${totalKills} deaths=${totalDeaths} hp=${player.health} pos=${player.pos.x.toFixed(1)},${player.pos.z.toFixed(1)} bots=${enemies.filter((e) => e.alive).length}`), 3500);
}

startRound();
paused = !AUTOPLAY;
requestAnimationFrame(frame);
