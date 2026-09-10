// Procedural audio via WebAudio so the game needs no sound assets.
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuffer: AudioBuffer | null = null;

function ensure(): AudioContext {
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = volume;
    master.connect(ctx.destination);
    const len = ctx.sampleRate * 1;
    noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

export function unlockAudio() {
  ensure();
}

let volume = 0.5;
export function setVolume(v: number) {
  volume = Math.max(0, Math.min(1, v));
  if (master) master.gain.value = volume;
}

function noise(duration: number, gain: number, filterFreq: number, filterQ = 1, type: BiquadFilterType = "lowpass") {
  const c = ensure();
  const src = c.createBufferSource();
  src.buffer = noiseBuffer!;
  const filter = c.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = filterFreq;
  filter.Q.value = filterQ;
  const g = c.createGain();
  g.gain.setValueAtTime(gain, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration);
  src.connect(filter).connect(g).connect(master!);
  src.start();
  src.stop(c.currentTime + duration);
}

function tone(freq: number, duration: number, gain: number, type: OscillatorType = "sine", slideTo?: number) {
  const c = ensure();
  const o = c.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, c.currentTime);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, c.currentTime + duration);
  const g = c.createGain();
  g.gain.setValueAtTime(gain, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration);
  o.connect(g).connect(master!);
  o.start();
  o.stop(c.currentTime + duration);
}

export const sfx = {
  rifleShot() {
    noise(0.18, 0.9, 1800, 0.8);
    noise(0.08, 0.6, 6000, 0.5, "highpass");
    tone(140, 0.12, 0.5, "triangle", 50);
  },
  pistolShot() {
    noise(0.12, 0.7, 2600, 0.8);
    tone(220, 0.08, 0.4, "triangle", 70);
  },
  sniperShot() {
    noise(0.35, 1.0, 1200, 0.7);
    noise(0.12, 0.7, 5000, 0.5, "highpass");
    tone(90, 0.25, 0.6, "triangle", 35);
  },
  enemyShot(distance: number) {
    const vol = Math.max(0.05, 0.5 - distance * 0.012);
    noise(0.15, vol, 1400, 0.8);
  },
  dryFire() {
    tone(900, 0.04, 0.2, "square");
  },
  reload() {
    tone(500, 0.05, 0.25, "square");
    setTimeout(() => tone(700, 0.05, 0.25, "square"), 220);
    setTimeout(() => noise(0.06, 0.3, 3000), 700);
  },
  hit() {
    tone(1400, 0.06, 0.35, "square", 900);
  },
  kill() {
    tone(1200, 0.08, 0.4, "square");
    setTimeout(() => tone(1700, 0.1, 0.4, "square"), 70);
  },
  hurt() {
    noise(0.2, 0.4, 500);
    tone(180, 0.15, 0.3, "sawtooth", 90);
  },
  impact() {
    noise(0.05, 0.25, 4000, 0.5, "highpass");
  },
  jump() {
    noise(0.05, 0.15, 800);
  },
  step() {
    noise(0.05, 0.08, 600);
  },
  death() {
    tone(300, 0.5, 0.4, "sawtooth", 60);
  },
  roundWin() {
    [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, 0.25, 0.35, "square"), i * 120));
  },
  roundLose() {
    [400, 350, 300, 200].forEach((f, i) => setTimeout(() => tone(f, 0.3, 0.35, "sawtooth"), i * 150));
  },
};
