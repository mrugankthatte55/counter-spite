import { COLORWAYS, Career, Settings, applyColorway, currentColorway, iconFor, saveSettings } from "./menuShared";
import { WEAPONS } from "./weapon";

export interface MenuHooks {
  onPlay: () => void;
  onSettingsChanged: (s: Settings) => void;
  onQualityChanged: (q: string) => void;
  getQuality: () => string;
  getCareer: () => Career;
  getSession: () => { kills: number; deaths: number; streak: number };
}

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;

export class Menu {
  private root = $("#menu");
  private panel = $("#panel");
  private stats = $("#menuStats");
  private colorwayName = $("#colorwayName");
  private open: string | null = null;

  constructor(private settings: Settings, private hooks: MenuHooks) {
    applyColorway(currentColorway());
    this.colorwayName.textContent = currentColorway().name.replace("&", "&");
    this.root.addEventListener("click", (e) => {
      const btn = (e.target as HTMLElement).closest("[data-action]") as HTMLElement | null;
      if (!btn) return;
      const action = btn.dataset.action!;
      if (action === "play") hooks.onPlay();
      else if (action === "close") this.closePanel();
      else this.showPanel(action);
    });
    $("#colorwayBtn").addEventListener("click", () => {
      const cur = currentColorway();
      const i = COLORWAYS.findIndex((c) => c.id === cur.id);
      const next = COLORWAYS[(i + 1) % COLORWAYS.length];
      applyColorway(next);
      this.colorwayName.textContent = next.name;
      if (this.open === "settings") this.showPanel("settings");
    });
    window.addEventListener("keydown", (e) => { if (e.code === "Escape" && this.open) this.closePanel(); });
  }

  show(visible: boolean) {
    this.root.classList.toggle("hidden", !visible);
    if (visible) {
      const s = this.hooks.getSession();
      this.stats.innerHTML = `SESSION &nbsp; <b>${s.kills}</b> KILLS &nbsp; <b>${s.deaths}</b> DEATHS &nbsp; <b>${(s.kills / Math.max(1, s.deaths)).toFixed(2)}</b> K/D`;
      $("#playBtn").textContent = s.kills + s.deaths > 0 ? "RESUME" : "PLAY";
    } else this.closePanel();
  }

  private closePanel() {
    this.panel.classList.add("hidden");
    this.panel.innerHTML = "";
    this.open = null;
    for (const b of this.root.querySelectorAll(".stack button")) b.classList.remove("active");
  }

  private showPanel(kind: string) {
    this.open = kind;
    for (const b of this.root.querySelectorAll<HTMLElement>(".stack button")) b.classList.toggle("active", b.dataset.action === kind);
    const head = (title: string, sub: string) =>
      `<button class="close" data-action="close">CLOSE &times;</button><h2>${title}</h2><div class="sub">${sub}</div>`;
    let html = "";
    if (kind === "loadout") {
      const primaries = [0, 2];
      const bar = (label: string, v: number) => `<div class="stat"><span>${label}</span><div class="bar"><i style="width:${Math.round(v * 100)}%"></i></div></div>`;
      html = head("<em>LOADOUT</em>", "PRIMARY WEAPON &middot; SECONDARY IS ALWAYS THE USP-S") + `<div class="cards">` +
        primaries.map((i) => {
          const w = WEAPONS[i];
          const desc = i === 0 ? "Full-auto assault rifle. Controllable spray, lethal headshots, forgiving at any range." : "Bolt-action sniper. One shot to the body kills. Scope with right click. Slow and unforgiving.";
          return `<div class="card${this.settings.primary === i ? " selected" : ""}" data-primary="${i}">${iconFor(w.name)}<h3>${w.name}</h3><div class="desc">${desc}</div>` +
            bar("DAMAGE", w.damage / 120) + bar("FIRE RATE", w.rpm / 650) + bar("ACCURACY", 1 - w.spreadBase * 300 - (w.auto ? 0.25 : 0)) + bar("MAGAZINE", w.magSize / 30) + `</div>`;
        }).join("") + `</div>`;
    } else if (kind === "rankings") {
      const c = this.hooks.getCareer();
      const s = this.hooks.getSession();
      const kd = (k: number, d: number) => (k / Math.max(1, d)).toFixed(2);
      const rows = [
        ["CAREER KILLS", c.kills], ["CAREER DEATHS", c.deaths], ["CAREER K/D", kd(c.kills, c.deaths)],
        ["HEADSHOTS", c.headshots], ["BEST STREAK", c.bestStreak], ["ROUNDS W / L / D", `${c.roundsWon} / ${c.roundsLost} / ${c.roundsDrawn}`],
        ["SESSION KILLS", s.kills], ["SESSION DEATHS", s.deaths], ["SESSION K/D", kd(s.kills, s.deaths)], ["CURRENT STREAK", s.streak],
      ];
      const rank = c.kills >= 500 ? "GLOBAL SPITE" : c.kills >= 200 ? "SUPREME" : c.kills >= 100 ? "EAGLE" : c.kills >= 50 ? "SHERIFF" : c.kills >= 20 ? "NOVA" : c.kills >= 5 ? "SILVER" : "UNRANKED";
      html = head(`<em>RANKINGS</em>`, `CURRENT RANK &middot; <b style="color:var(--accent)">${rank}</b> &middot; STORED IN THIS BROWSER`) +
        `<div class="kv">${rows.map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join("")}</div>`;
    } else if (kind === "controls") {
      const keys: [string, string][] = [
        ["W A S D", "Move"], ["Mouse", "Look"], ["Left click", "Fire"], ["Right click / Q", "Scope (AWP)"],
        ["Shift", "Walk"], ["Ctrl", "Crouch"], ["Space", "Jump"], ["R", "Reload"],
        ["1 / 2", "Primary / Secondary"], ["Scroll", "Switch weapon"], ["Esc", "Menu"], ["F", "Show FPS"],
      ];
      html = head("<em>CONTROLS</em>", "KEYBOARD &amp; MOUSE") + `<div class="keys">${keys.map(([k, v]) => `<div><span>${v}</span><kbd>${k}</kbd></div>`).join("")}</div>`;
    } else if (kind === "settings") {
      const q = this.hooks.getQuality();
      html = head("<em>SETTINGS</em>", "SAVED IN THIS BROWSER") +
        `<div class="setting"><label>MOUSE SENSITIVITY</label><input type="range" id="setSens" min="0.2" max="3" step="0.05" value="${this.settings.sensitivity}"><span class="val" id="sensVal">${this.settings.sensitivity.toFixed(2)}</span></div>` +
        `<div class="setting"><label>MASTER VOLUME</label><input type="range" id="setVol" min="0" max="1" step="0.05" value="${this.settings.volume}"><span class="val" id="volVal">${Math.round(this.settings.volume * 100)}%</span></div>` +
        `<div class="setting"><label>GRAPHICS</label><select id="setQuality"><option value="high"${q === "high" ? " selected" : ""}>High &middot; ambient occlusion + bloom</option><option value="medium"${q === "medium" ? " selected" : ""}>Medium &middot; bloom</option><option value="low"${q === "low" ? " selected" : ""}>Low</option></select><span></span></div>` +
        `<div class="setting"><label>COLORWAY</label><div class="swatches">${COLORWAYS.map((c) => `<button data-colorway="${c.id}" class="${currentColorway().id === c.id ? "selected" : ""}" style="background:${c.accent}" title="${c.name}"></button>`).join("")}</div><span></span></div>`;
    }
    this.panel.innerHTML = html;
    this.panel.classList.remove("hidden");

    // wire panel interactions
    this.panel.querySelectorAll<HTMLElement>("[data-primary]").forEach((card) => card.addEventListener("click", () => {
      this.settings.primary = Number(card.dataset.primary);
      saveSettings(this.settings);
      this.hooks.onSettingsChanged(this.settings);
      this.showPanel("loadout");
    }));
    const sens = this.panel.querySelector<HTMLInputElement>("#setSens");
    sens?.addEventListener("input", () => {
      this.settings.sensitivity = Number(sens.value);
      $("#sensVal").textContent = this.settings.sensitivity.toFixed(2);
      saveSettings(this.settings); this.hooks.onSettingsChanged(this.settings);
    });
    const vol = this.panel.querySelector<HTMLInputElement>("#setVol");
    vol?.addEventListener("input", () => {
      this.settings.volume = Number(vol.value);
      $("#volVal").textContent = `${Math.round(this.settings.volume * 100)}%`;
      saveSettings(this.settings); this.hooks.onSettingsChanged(this.settings);
    });
    this.panel.querySelector<HTMLSelectElement>("#setQuality")?.addEventListener("change", (e) => this.hooks.onQualityChanged((e.target as HTMLSelectElement).value));
    this.panel.querySelectorAll<HTMLElement>("[data-colorway]").forEach((b) => b.addEventListener("click", () => {
      const c = COLORWAYS.find((x) => x.id === b.dataset.colorway)!;
      applyColorway(c);
      this.colorwayName.textContent = c.name;
      this.showPanel("settings");
    }));
  }
}
