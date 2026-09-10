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
import { HUD, RadarBlip } from "./hud";
import { Menu } from "./menu";
import { sfx, unlockAudio, setVolume } from "./audio";
import { loadSettings, loadCareer, saveCareer, Settings } from "./theme";

const ROUND_SECONDS = 300;
const BOT_COUNT = 5;
const RESPAWN_SECONDS = 3;
const BASE_FOV = 75;

type Quality = "high" | "medium" | "low";
const params = new URLSearchParams(location.search);
const AUTOPLAY = params.has("autoplay");
const gfxParam = params.get("gfx") as Quality | null;
let quality: Quality = gfxParam || (localStorage.getItem("gfxQuality") as Quality) || "high";
if (AUTOPLAY && !gfxParam) quality = "low";

const settings: Settings = loadSettings();
const career = loadCareer();

// ---------- Renderer / scene ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(AUTOPLAY ? 0.5 : Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.8;
renderer.domElement.className = "game";
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xc7d3e2, 70, 260);

const camera = new THREE.PerspectiveCamera(BASE_FOV, window.innerWidth / window.innerHeight, 0.05, 400);
scene.add(camera);

// Sky + sun + environment lighting
const sky = new Sky();
sky.scale.setScalar(3000);
const sunDir = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - 38), THREE.MathUtils.degToRad(160));
const setSkyUniforms = (s: Sky) => {
  const u = s.material.uniforms;
  u.turbidity.value = 4;
  u.rayleigh.value = 1.6;
  u.mieCoefficient.value = 0.006;
  u.mieDirectionalG.value = 0.85;
  u.sunPosition.value.copy(sunDir);
};
setSkyUniforms(sky);
scene.add(sky);
{
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  const envSky = new Sky();
  envSky.scale.setScalar(3000);
  setSkyUniforms(envSky);
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
player.sensitivity = settings.sensitivity;
const arsenal = new Arsenal(camera);
arsenal.setLoadout(settings.primary);
const effects = new Effects(scene);
const hud = new HUD();
hud.buildMinimap(map.colliders, 40);
setVolume(settings.volume);

const enemies: Enemy[] = [];
for (let i = 0; i < BOT_COUNT; i++) {
  const e = new Enemy(BOT_NAMES[i % BOT_NAMES.length], map);
  scene.add(e.group);
  enemies.push(e);
}
const radarTimers = new Map<Enemy, number>();

// Menu hero: a posed operator in front of the mid building, framed by a slow camera drift
const hero = new Enemy("Hero", map);
hero.pos.set(3, 0, -10.2);
hero.yaw = 0; // face -z, toward the menu camera and into the sunlight
scene.add(hero.group);
const heroLook = new THREE.Vector3(3, 1.15, -10.2);

// ---------- Post-processing / quality ----------
let composer: EffectComposer | null = null;

function applyQuality(q: Quality) {
  quality = q;
  if (!AUTOPLAY) localStorage.setItem("gfxQuality", q);
  const w = window.innerWidth, h = window.innerHeight;
  if (composer) { composer.dispose(); composer = null; }
  const shadowSize = q === "high" ? 4096 : q === "medium" ? 2048 : 1024;
  sun.shadow.mapSize.set(shadowSize, shadowSize);
  if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
  renderer.shadowMap.enabled = !(AUTOPLAY && q === "low");
  if (q === "low") return;
  const target = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: 4 });
  composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));
  if (q === "high") {
    const gtao = new GTAOPass(scene, camera, w, h);
    gtao.output = GTAOPass.OUTPUT.Default;
    gtao.blendIntensity = 0.9;
    gtao.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1, thickness: 1, scale: 1, samples: 12, distanceFallOff: 1, screenSpaceRadius: false });
    gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 4, radiusExponent: 1, rings: 2, samples: 12 });
    composer.addPass(gtao);
  }
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(w, h), 0.28, 0.5, 0.92));
  composer.addPass(new OutputPass());
}
applyQuality(quality);

// ---------- Game state ----------
let scoreCT = 0;
let scoreT = 0;
let roundTime = ROUND_SECONDS;
let roundOver = false;
let playerRespawn = 0;
let paused = true;
let sessionKills = 0;
let sessionDeaths = 0;
let streak = 0;
let showFps = false;
let clock = 0;

const menu = new Menu(settings, {
  onPlay: () => { unlockAudio(); input.lock(); },
  onSettingsChanged: (s) => {
    player.sensitivity = s.sensitivity;
    setVolume(s.volume);
    if (arsenal.slots[0] !== s.primary) { arsenal.setLoadout(s.primary); arsenal.switchTo(s.primary); }
  },
  onQualityChanged: (q) => applyQuality(q as Quality),
  getQuality: () => quality,
  getCareer: () => career,
  getSession: () => ({ kills: sessionKills, deaths: sessionDeaths, streak }),
});

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
  arsenal.switchTo(arsenal.slots[0]);
}

function startRound() {
  scoreCT = 0;
  scoreT = 0;
  roundTime = ROUND_SECONDS;
  roundOver = false;
  spawnPlayer();
  enemies.forEach((e) => e.spawn(randomSpawn(map.tSpawns, player.pos)));
  if (!paused) hud.showMessage("ROUND <em>START</em>", "ELIMINATE THE TERRORISTS", 2.5);
}

function endRound() {
  roundOver = true;
  const win = scoreCT > scoreT;
  const tie = scoreCT === scoreT;
  if (win) career.roundsWon++; else if (tie) career.roundsDrawn++; else career.roundsLost++;
  saveCareer(career);
  hud.showMessage(tie ? "<em>DRAW</em>" : win ? "COUNTER-TERRORISTS <em>WIN</em>" : "TERRORISTS <em>WIN</em>", "NEXT ROUND IN 6 SECONDS", 6);
  if (win) sfx.roundWin(); else sfx.roundLose();
  setTimeout(startRound, 6000);
}

// ---------- Pointer lock / menu ----------
document.addEventListener("pointerlockchange", () => {
  paused = !input.locked;
  menu.show(paused);
  arsenal.viewmodel.visible = !paused;
  hero.group.visible = paused;
  document.getElementById("hud")!.classList.toggle("hidden", paused);
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
        sessionKills++;
        streak++;
        career.kills++;
        if (part === "head") career.headshots++;
        if (streak > career.bestStreak) career.bestStreak = streak;
        saveCareer(career);
        hud.feed("YOU", enemy.name.toUpperCase(), def.name, true, false, part === "head");
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

// ---------- Menu camera ----------
function updateMenuCamera(dt: number) {
  clock += dt;
  const a = Math.sin(clock * 0.18) * 0.45;
  const radius = 2.9 + Math.sin(clock * 0.11) * 0.2;
  camera.position.set(heroLook.x + Math.sin(a) * radius, 1.45 + Math.sin(clock * 0.23) * 0.08, heroLook.z - Math.cos(a) * radius);
  camera.rotation.order = "YXZ";
  camera.lookAt(heroLook.x + 1.15, heroLook.y - 0.05, heroLook.z);
  camera.fov += (58 - camera.fov) * Math.min(1, dt * 4);
  camera.updateProjectionMatrix();
  hero.idle(clock);
  sun.target.position.copy(heroLook).setY(0);
  sun.position.copy(sunDir).multiplyScalar(80).add(sun.target.position);
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

  if (paused) {
    updateMenuCamera(dt);
    effects.update(dt);
    render();
    input.endFrame();
    return;
  }

  // Keep the shadow frustum centred on the player so the map stays sharp
  sun.target.position.set(player.pos.x, 0, player.pos.z);
  sun.position.copy(sunDir).multiplyScalar(80).add(sun.target.position);

  if (!roundOver) {
    roundTime -= dt;
    if (roundTime <= 0) { roundTime = 0; endRound(); }
  }

  if (input.justPressed("KeyF")) { showFps = !showFps; document.getElementById("fps")!.classList.toggle("hidden", !showFps); }

  player.update(dt, input, map);
  if (player.alive) {
    if (input.justPressed("Digit1")) arsenal.switchSlot(0);
    if (input.justPressed("Digit2")) arsenal.switchSlot(1);
    if (input.wheel !== 0) arsenal.switchSlot((arsenal.activeSlot + input.wheel + arsenal.slots.length) % arsenal.slots.length);
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
      radarTimers.set(e, 2.5);
      effects.tracer(shot.from, shot.to);
      effects.flash(shot.from);
      if (shot.hit && player.alive) {
        const died = player.damage(shot.damage);
        hud.damageFlash();
        sfx.hurt();
        if (died) {
          sfx.death();
          scoreT++;
          sessionDeaths++;
          streak = 0;
          career.deaths++;
          saveCareer(career);
          playerRespawn = RESPAWN_SECONDS;
          arsenal.scoped = false;
          hud.feed(e.name.toUpperCase(), "YOU", "AK-47", false, true);
          hud.showMessage("YOU <em>DIED</em>", `RESPAWNING IN ${RESPAWN_SECONDS}S`, RESPAWN_SECONDS);
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

  // HUD
  const blips: RadarBlip[] = [];
  for (const [e, t] of radarTimers) {
    const left = t - dt;
    if (left <= 0 || !e.alive) { radarTimers.delete(e); continue; }
    radarTimers.set(e, left);
    blips.push({ x: e.pos.x, z: e.pos.z, strength: left / 2.5 });
  }
  hud.drawMinimap(player.pos.x, player.pos.z, player.yaw, blips);
  hud.setHealth(player.health, player.armor);
  hud.setAmmo(arsenal.current.mag, arsenal.current.reserve, arsenal.reloading > 0);
  hud.setWeapons(arsenal.slotNames, arsenal.activeSlot);
  hud.setScore(scoreCT, scoreT, roundTime);
  hud.setSpread(arsenal.totalSpread(player.speedFactor, player.crouching, player.onGround), arsenal.scoped);
  hud.update(dt);

  render();
  input.endFrame();
}

document.getElementById("fps")!.classList.add("hidden");

if (AUTOPLAY) {
  document.getElementById("menu")!.classList.add("hidden");
  arsenal.viewmodel.visible = true;
  hero.group.visible = false;
  const origEnd = input.endFrame.bind(input);
  input.endFrame = () => { origEnd(); input.mouseDown = true; input.keys.add("KeyW"); input.mouseDX = 6; };
  setTimeout(() => console.log(`[autoplay] kills=${sessionKills} deaths=${sessionDeaths} hp=${player.health} pos=${player.pos.x.toFixed(1)},${player.pos.z.toFixed(1)} bots=${enemies.filter((e) => e.alive).length}`), 3500);
} else {
  arsenal.viewmodel.visible = false;
  document.getElementById("hud")!.classList.add("hidden");
  menu.show(true);
}

startRound();
paused = !AUTOPLAY;
requestAnimationFrame(frame);
