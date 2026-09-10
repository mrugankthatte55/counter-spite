export interface Colorway {
  id: string;
  name: string;
  accent: string;
  accentDim: string;
  bg: string;
  panel: string;
}

export const COLORWAYS: Colorway[] = [
  { id: "lime", name: "NEON LIME & BLACK", accent: "#c6ff3a", accentDim: "#7fa51f", bg: "#090b07", panel: "rgba(10, 13, 8, 0.72)" },
  { id: "blue", name: "DEEP BLUE & BLACK", accent: "#4fa8ff", accentDim: "#2b64a3", bg: "#060a12", panel: "rgba(6, 10, 18, 0.72)" },
  { id: "purple", name: "TOXIC PURPLE & DARK GREY", accent: "#b44dff", accentDim: "#6e2ea3", bg: "#14111a", panel: "rgba(22, 18, 28, 0.74)" },
  { id: "crimson", name: "CRIMSON & DARK GREY", accent: "#ff2e4d", accentDim: "#a31c33", bg: "#16090c", panel: "rgba(24, 12, 14, 0.74)" },
];

const KEY = "cs.colorway";

export function currentColorway(): Colorway {
  const id = localStorage.getItem(KEY);
  return COLORWAYS.find((c) => c.id === id) ?? COLORWAYS[0];
}

export function applyColorway(c: Colorway) {
  const r = document.documentElement.style;
  r.setProperty("--accent", c.accent);
  r.setProperty("--accent-dim", c.accentDim);
  r.setProperty("--bg", c.bg);
  r.setProperty("--panel", c.panel);
  localStorage.setItem(KEY, c.id);
}

export function nextColorway(): Colorway {
  const cur = currentColorway();
  const i = COLORWAYS.findIndex((c) => c.id === cur.id);
  const next = COLORWAYS[(i + 1) % COLORWAYS.length];
  applyColorway(next);
  return next;
}

/** Accent color as a number for Three.js. */
export function accentHex(c = currentColorway()): number {
  return parseInt(c.accent.slice(1), 16);
}

export interface Settings {
  sensitivity: number; // multiplier
  volume: number;      // 0..1
  primary: number;     // weapon index of the primary slot
}

const SKEY = "cs.settings";
export function loadSettings(): Settings {
  try {
    const s = JSON.parse(localStorage.getItem(SKEY) || "{}");
    return { sensitivity: s.sensitivity ?? 1, volume: s.volume ?? 0.6, primary: s.primary ?? 0 };
  } catch { return { sensitivity: 1, volume: 0.6, primary: 0 }; }
}
export function saveSettings(s: Settings) {
  localStorage.setItem(SKEY, JSON.stringify(s));
}

export interface Career {
  kills: number; deaths: number; headshots: number; bestStreak: number; roundsWon: number; roundsLost: number; roundsDrawn: number;
}
const CKEY = "cs.career";
export function loadCareer(): Career {
  try {
    const c = JSON.parse(localStorage.getItem(CKEY) || "{}");
    return { kills: c.kills ?? 0, deaths: c.deaths ?? 0, headshots: c.headshots ?? 0, bestStreak: c.bestStreak ?? 0, roundsWon: c.roundsWon ?? 0, roundsLost: c.roundsLost ?? 0, roundsDrawn: c.roundsDrawn ?? 0 };
  } catch { return { kills: 0, deaths: 0, headshots: 0, bestStreak: 0, roundsWon: 0, roundsLost: 0, roundsDrawn: 0 }; }
}
export function saveCareer(c: Career) {
  localStorage.setItem(CKEY, JSON.stringify(c));
}
