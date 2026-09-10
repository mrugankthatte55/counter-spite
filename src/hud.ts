import type { Box } from "./map";

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;

export const WEAPON_ICON: Record<string, string> = { "AK-47": "ic-rifle", "USP-S": "ic-pistol", "AWP": "ic-sniper" };
export function iconSvg(id: string, cls = "") {
  return `<svg class="${cls}"><use href="#${id}"/></svg>`;
}

export interface RadarBlip { x: number; z: number; strength: number }

export class HUD {
  private healthPill = $("#healthPill");
  private healthValue = $("#healthPill .value");
  private armorValue = $("#armorPill .value");
  private ammoMag = $("#ammo .mag");
  private ammoReserve = $("#ammo .reserve");
  private ammoState = $("#ammo .state");
  private weapons = $("#weapons");
  private scoreCT = $("#score .ct-score");
  private scoreT = $("#score .t-score");
  private timer = $("#score .timer");
  private killfeed = $("#killfeed");
  private hitmarker = $("#hitmarker");
  private damage = $("#damage");
  private message = $("#message");
  private crosshair = $("#crosshair");
  private fps = $("#fps");
  private scope = $("#scope");
  private minimap = $("#minimap") as HTMLCanvasElement;
  private mmCtx = this.minimap.getContext("2d")!;
  private mmBase: HTMLCanvasElement | null = null;
  private mmScale = 1;
  private mmHalf = 40;
  private hitTimer = 0;
  private dmgTimer = 0;
  private msgTimer = 0;
  private lastWeaponsKey = "";

  setHealth(h: number, armor: number) {
    this.healthValue.textContent = String(Math.ceil(h));
    this.armorValue.textContent = String(Math.ceil(armor));
    this.healthPill.classList.toggle("low", h <= 30);
  }

  setAmmo(mag: number, reserve: number, reloading: boolean) {
    this.ammoMag.textContent = String(mag);
    this.ammoReserve.textContent = String(reserve);
    this.ammoState.textContent = reloading ? "RELOADING" : mag === 0 && reserve === 0 ? "EMPTY" : "";
  }

  /** Weapon slot list; `names` in key order, `active` is the index of the equipped one. */
  setWeapons(names: string[], active: number) {
    const key = names.join("|") + active;
    if (key === this.lastWeaponsKey) return;
    this.lastWeaponsKey = key;
    this.weapons.innerHTML = names.map((n, i) =>
      `<div class="slot${i === active ? " active" : ""}"><span class="key">${i + 1}</span>${iconSvg(WEAPON_ICON[n] ?? "ic-rifle")}<span class="name">${n}</span></div>`,
    ).join("");
  }

  setScore(ct: number, t: number, seconds: number) {
    this.scoreCT.textContent = String(ct);
    this.scoreT.textContent = String(t);
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    this.timer.textContent = `${m}:${s.toString().padStart(2, "0")}`;
    this.timer.classList.toggle("low", seconds < 30);
  }

  setSpread(spreadRad: number, scoped: boolean) {
    const px = 24 + spreadRad * 900;
    this.crosshair.style.width = this.crosshair.style.height = `${px}px`;
    this.crosshair.style.display = scoped ? "none" : "";
    this.scope.classList.toggle("hidden", !scoped);
  }

  setFps(v: number) {
    this.fps.textContent = `${v.toFixed(0)} FPS`;
  }

  hit(kill: boolean) {
    this.hitmarker.classList.toggle("kill", kill);
    this.hitmarker.style.opacity = "1";
    this.hitTimer = kill ? 0.3 : 0.12;
  }

  damageFlash() {
    this.damage.style.opacity = "1";
    this.dmgTimer = 0.35;
  }

  feed(killer: string, victim: string, weapon: string, killerIsYou: boolean, victimIsYou: boolean, headshot = false) {
    const div = document.createElement("div");
    div.className = `row${killerIsYou ? " you" : victimIsYou ? " victim" : ""}${headshot ? " hs" : ""}`;
    div.innerHTML =
      `<span class="${killerIsYou ? "you-name" : "bot"}">${killer}</span>` +
      iconSvg(WEAPON_ICON[weapon] ?? "ic-rifle") +
      (headshot ? iconSvg("ic-head", "head") : "") +
      `<span class="${victimIsYou ? "you-name" : "bot"}">${victim}</span>`;
    this.killfeed.prepend(div);
    while (this.killfeed.children.length > 5) this.killfeed.lastChild!.remove();
    setTimeout(() => div.remove(), 6000);
  }

  showMessage(html: string, sub = "", seconds = 2.5) {
    this.message.innerHTML = `${html}${sub ? `<small>${sub}</small>` : ""}`;
    this.message.style.opacity = "1";
    this.msgTimer = seconds;
  }

  /** Pre-render the static map layout for the radar. */
  buildMinimap(colliders: Box[], half: number) {
    const size = this.minimap.width;
    this.mmHalf = half;
    this.mmScale = size / (half * 2);
    const c = document.createElement("canvas");
    c.width = c.height = size;
    const g = c.getContext("2d")!;
    g.fillStyle = "rgba(0,0,0,0.35)";
    g.fillRect(0, 0, size, size);
    // grid
    g.strokeStyle = "rgba(255,255,255,0.06)";
    g.lineWidth = 1;
    for (let i = 1; i < 8; i++) {
      const p = (size / 8) * i;
      g.beginPath(); g.moveTo(p, 0); g.lineTo(p, size); g.stroke();
      g.beginPath(); g.moveTo(0, p); g.lineTo(size, p); g.stroke();
    }
    const accent = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#c6ff3a";
    for (const b of colliders) {
      const h = b.max.y - b.min.y;
      if (h < 1) continue;
      const x = (b.min.x + half) * this.mmScale, y = (b.min.z + half) * this.mmScale;
      const w = (b.max.x - b.min.x) * this.mmScale, d = (b.max.z - b.min.z) * this.mmScale;
      g.fillStyle = h >= 3 ? accent : "rgba(255,255,255,0.55)";
      g.globalAlpha = h >= 3 ? 0.55 : 0.5;
      g.fillRect(x, y, Math.max(1.5, w), Math.max(1.5, d));
    }
    g.globalAlpha = 1;
    this.mmBase = c;
  }

  drawMinimap(px: number, pz: number, yaw: number, blips: RadarBlip[]) {
    if (!this.mmBase) return;
    const g = this.mmCtx;
    const size = this.minimap.width;
    g.clearRect(0, 0, size, size);
    g.drawImage(this.mmBase, 0, 0);
    const accent = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#c6ff3a";
    for (const b of blips) {
      const x = (b.x + this.mmHalf) * this.mmScale, y = (b.z + this.mmHalf) * this.mmScale;
      g.fillStyle = `rgba(255,70,70,${0.35 + 0.65 * b.strength})`;
      g.beginPath(); g.arc(x, y, 3 + (1 - b.strength) * 4, 0, Math.PI * 2); g.fill();
    }
    const x = (px + this.mmHalf) * this.mmScale, y = (pz + this.mmHalf) * this.mmScale;
    g.save();
    g.translate(x, y);
    g.rotate(-yaw);
    g.fillStyle = accent;
    g.beginPath(); g.moveTo(0, -6); g.lineTo(4.5, 5); g.lineTo(0, 2.5); g.lineTo(-4.5, 5); g.closePath(); g.fill();
    g.restore();
  }

  update(dt: number) {
    if (this.hitTimer > 0) { this.hitTimer -= dt; if (this.hitTimer <= 0) this.hitmarker.style.opacity = "0"; }
    if (this.dmgTimer > 0) { this.dmgTimer -= dt; if (this.dmgTimer <= 0) this.damage.style.opacity = "0"; }
    if (this.msgTimer > 0) { this.msgTimer -= dt; if (this.msgTimer <= 0) this.message.style.opacity = "0"; }
  }
}
