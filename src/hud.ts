const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;

export class HUD {
  private health = $("#health");
  private healthValue = $("#health .value");
  private ammoMag = $("#ammo .mag");
  private ammoReserve = $("#ammo .reserve");
  private ammoWeapon = $("#ammo .weapon");
  private scoreCT = $("#score .ct");
  private scoreT = $("#score .t");
  private timer = $("#score .timer");
  private killfeed = $("#killfeed");
  private hitmarker = $("#hitmarker");
  private damage = $("#damage");
  private message = $("#message");
  private crosshair = $("#crosshair");
  private fps = $("#fps");
  private scope = $("#scope");
  private hitTimer = 0;
  private dmgTimer = 0;
  private msgTimer = 0;

  setHealth(h: number) {
    this.healthValue.textContent = String(Math.ceil(h));
    this.health.classList.toggle("low", h <= 30);
  }

  setAmmo(name: string, mag: number, reserve: number, reloading: boolean) {
    this.ammoWeapon.textContent = reloading ? `${name} — RELOADING` : name;
    this.ammoMag.textContent = String(mag);
    this.ammoReserve.textContent = `/ ${reserve}`;
  }

  setScore(ct: number, t: number, seconds: number) {
    this.scoreCT.textContent = `CT ${ct}`;
    this.scoreT.textContent = `T ${t}`;
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    this.timer.textContent = `${m}:${s.toString().padStart(2, "0")}`;
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

  feed(killer: string, victim: string, weapon: string, killerIsYou: boolean, victimIsYou: boolean) {
    const div = document.createElement("div");
    div.innerHTML = `<span class="${killerIsYou ? "you" : "bot"}">${killer}</span> &nbsp;[${weapon}]&nbsp; <span class="${victimIsYou ? "you" : "bot"}">${victim}</span>`;
    this.killfeed.prepend(div);
    while (this.killfeed.children.length > 5) this.killfeed.lastChild!.remove();
    setTimeout(() => div.remove(), 6000);
  }

  showMessage(text: string, sub = "", seconds = 2.5) {
    this.message.innerHTML = `${text}${sub ? `<small>${sub}</small>` : ""}`;
    this.message.style.opacity = "1";
    this.msgTimer = seconds;
  }

  update(dt: number) {
    if (this.hitTimer > 0) { this.hitTimer -= dt; if (this.hitTimer <= 0) this.hitmarker.style.opacity = "0"; }
    if (this.dmgTimer > 0) { this.dmgTimer -= dt; if (this.dmgTimer <= 0) this.damage.style.opacity = "0"; }
    if (this.msgTimer > 0) { this.msgTimer -= dt; if (this.msgTimer <= 0) this.message.style.opacity = "0"; }
  }
}
