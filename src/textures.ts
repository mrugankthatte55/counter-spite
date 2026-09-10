import * as THREE from "three";

/**
 * Procedural PBR texture sets (color + normal + roughness) generated on canvases at startup.
 * Nothing is downloaded; every surface in the game comes from these generators.
 */

export interface TexSet {
  map: THREE.Texture;
  normalMap: THREE.Texture;
  roughnessMap: THREE.Texture;
}

// ---------- noise ----------
function hash(x: number, y: number, seed: number): number {
  let h = (x | 0) * 374761393 + (y | 0) * 668265263 + seed * 982451653;
  h = (h ^ (h >>> 13)) * 1274126177;
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967296;
}

function smooth(t: number) { return t * t * (3 - 2 * t); }

/** Tileable value noise over a period of `period` lattice cells. */
function noise(x: number, y: number, seed: number, period: number): number {
  const xi = Math.floor(x), yi = Math.floor(y);
  const fx = smooth(x - xi), fy = smooth(y - yi);
  const w = (a: number) => ((a % period) + period) % period;
  const a = hash(w(xi), w(yi), seed), b = hash(w(xi + 1), w(yi), seed);
  const c = hash(w(xi), w(yi + 1), seed), d = hash(w(xi + 1), w(yi + 1), seed);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

/** Tileable fractal noise, u/v in [0,1). */
function fbm(u: number, v: number, seed: number, octaves = 4, baseFreq = 4): number {
  let sum = 0, amp = 0.5, freq = baseFreq, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += noise(u * freq, v * freq, seed + i * 17, freq) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}

// ---------- pixel pipeline ----------
interface Px { r: number; g: number; b: number; h: number; rough: number }
type PixelFn = (u: number, v: number, px: Px, x: number, y: number) => void;

function makeSet(size: number, fn: PixelFn, normalStrength = 2, anisotropy = 8): TexSet {
  const color = new Uint8ClampedArray(new ArrayBuffer(size * size * 4));
  const rough = new Uint8ClampedArray(new ArrayBuffer(size * size * 4));
  const height = new Float32Array(size * size);
  const px: Px = { r: 0, g: 0, b: 0, h: 0, rough: 0.8 };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      px.r = px.g = px.b = 0.5; px.h = 0.5; px.rough = 0.8;
      fn(x / size, 1 - y / size, px, x, y);
      const i = (y * size + x);
      color[i * 4] = px.r * 255; color[i * 4 + 1] = px.g * 255; color[i * 4 + 2] = px.b * 255; color[i * 4 + 3] = 255;
      const rv = px.rough * 255;
      rough[i * 4] = rv; rough[i * 4 + 1] = rv; rough[i * 4 + 2] = rv; rough[i * 4 + 3] = 255;
      height[i] = px.h;
    }
  }
  // Normal map from height (tileable)
  const normal = new Uint8ClampedArray(new ArrayBuffer(size * size * 4));
  const H = (x: number, y: number) => height[(((y % size) + size) % size) * size + (((x % size) + size) % size)];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (H(x + 1, y) - H(x - 1, y)) * normalStrength;
      const dy = (H(x, y - 1) - H(x, y + 1)) * normalStrength; // +V is up in image
      const len = Math.hypot(dx, dy, 1);
      const i = (y * size + x) * 4;
      normal[i] = (-dx / len * 0.5 + 0.5) * 255;
      normal[i + 1] = (-dy / len * 0.5 + 0.5) * 255;
      normal[i + 2] = (1 / len * 0.5 + 0.5) * 255;
      normal[i + 3] = 255;
    }
  }
  const tex = (data: Uint8ClampedArray<ArrayBuffer>, srgb: boolean) => {
    const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = anisotropy;
    t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.magFilter = THREE.LinearFilter;
    t.needsUpdate = true;
    return t;
  };
  return { map: tex(color, true), normalMap: tex(normal, false), roughnessMap: tex(rough, false) };
}

function mix(a: number, b: number, t: number) { return a + (b - a) * t; }
function setRGB(px: Px, r: number, g: number, b: number, k = 1) { px.r = r * k; px.g = g * k; px.b = b * k; }

// ---------- generators ----------

/** Sandstone brick wall with mortar and weathering. One tile = 2m x 2m. */
export function sandstoneBricks(size = 512): TexSet {
  const rows = 8, cols = 4, mortar = 0.012;
  return makeSet(size, (u, v, px) => {
    const row = Math.floor(v * rows);
    const offset = (row % 2) * 0.5;
    const cu = ((u + offset / cols) * cols) % 1;
    const cv = (v * rows) % 1;
    const col = Math.floor((u + offset / cols) * cols);
    const mw = mortar * cols, mh = mortar * rows;
    const edgeU = Math.min(cu, 1 - cu) / mw, edgeV = Math.min(cv, 1 - cv) / mh;
    const inMortar = edgeU < 1 || edgeV < 1;
    const grain = fbm(u, v, 7, 5, 16);
    const weather = fbm(u, v, 3, 3, 2);
    if (inMortar) {
      const k = 0.78 + grain * 0.3;
      setRGB(px, 0.62, 0.57, 0.5, k);
      px.h = 0.25 + grain * 0.15;
      px.rough = 0.95;
    } else {
      const tint = hash(col, row, 11);
      const tint2 = hash(col, row, 23);
      const r = mix(0.80, 0.68, tint), g = mix(0.68, 0.55, tint), b = mix(0.50, 0.38, tint2);
      const k = 0.82 + grain * 0.3 - weather * 0.15;
      setRGB(px, r, g, b, k);
      // rounded brick edge
      const e = Math.min(edgeU, edgeV, 3) / 3;
      px.h = 0.55 + smooth(e) * 0.35 + grain * 0.1 - (hash(col, row, 5) < 0.15 ? 0.1 : 0);
      px.rough = 0.85 + grain * 0.1;
    }
    // grime streaks near bottom
    const g2 = fbm(u * 3, v, 41, 3, 6);
    const grime = Math.max(0, (0.3 - v) * 1.5) * g2;
    px.r *= 1 - grime * 0.5; px.g *= 1 - grime * 0.5; px.b *= 1 - grime * 0.45;
  }, 2.2);
}

/** Cracked plaster over stone. */
export function plaster(size = 512): TexSet {
  return makeSet(size, (u, v, px) => {
    const n = fbm(u, v, 101, 5, 6);
    const stain = fbm(u, v, 55, 3, 2);
    const crackField = fbm(u, v, 77, 3, 5);
    const crack = Math.abs(crackField - 0.5) < 0.006 ? 1 : 0;
    const k = 0.9 + n * 0.2 - stain * 0.2;
    setRGB(px, 0.86, 0.80, 0.68, k);
    px.h = 0.6 + n * 0.25 - crack * 0.4;
    if (crack) { px.r *= 0.55; px.g *= 0.55; px.b *= 0.55; }
    // chipped patches revealing stone
    const chip = fbm(u, v, 91, 3, 3);
    if (chip > 0.68) {
      const t = Math.min(1, (chip - 0.68) * 12);
      px.r = mix(px.r, 0.6, t); px.g = mix(px.g, 0.52, t); px.b = mix(px.b, 0.42, t);
      px.h -= t * 0.25;
    }
    const grime = Math.max(0, (0.25 - v) * 2) * fbm(u * 2, v, 43, 3, 5);
    px.r *= 1 - grime * 0.45; px.g *= 1 - grime * 0.45; px.b *= 1 - grime * 0.4;
    px.rough = 0.9;
  }, 2.5);
}

/** Poured concrete with stains and pitting. */
export function concrete(size = 512): TexSet {
  return makeSet(size, (u, v, px) => {
    const n = fbm(u, v, 201, 5, 8);
    const stain = fbm(u, v, 202, 3, 2);
    const pit = fbm(u, v, 203, 2, 40);
    const k = 0.9 + n * 0.2 - stain * 0.25;
    setRGB(px, 0.62, 0.62, 0.6, k);
    px.h = 0.55 + n * 0.15 - (pit > 0.72 ? 0.3 : 0);
    // panel seams every half tile
    const su = Math.abs(((u * 2) % 1) - 0.5), sv = Math.abs(((v * 2) % 1) - 0.5);
    if (su > 0.495 || sv > 0.495) { px.h -= 0.3; px.r *= 0.7; px.g *= 0.7; px.b *= 0.7; }
    px.rough = 0.85 + n * 0.1;
  }, 2);
}

/** Wooden planks with metal straps (crates). */
export function woodCrate(size = 256): TexSet {
  const planks = 5;
  return makeSet(size, (u, v, px) => {
    const p = Math.floor(v * planks);
    const pv = (v * planks) % 1;
    const gap = pv < 0.04 || pv > 0.96;
    const grain = fbm(u * 1, v * 6 + hash(p, 0, 3) * 10, 301 + p, 4, 3);
    const rings = Math.abs(Math.sin((u * 8 + grain * 2) * Math.PI));
    const tint = hash(p, 1, 9);
    const k = (0.75 + tint * 0.3) * (0.85 + rings * 0.25) * (0.85 + grain * 0.2);
    setRGB(px, 0.62, 0.44, 0.26, k);
    px.h = 0.6 + grain * 0.2 - rings * 0.05;
    px.rough = 0.8;
    if (gap) { px.r *= 0.35; px.g *= 0.35; px.b *= 0.35; px.h = 0.2; }
    // metal straps
    const strap = (u > 0.12 && u < 0.2) || (u > 0.8 && u < 0.88);
    if (strap) {
      const scratch = fbm(u * 4, v, 305, 3, 6);
      setRGB(px, 0.35, 0.34, 0.33, 0.8 + scratch * 0.4);
      const rust = fbm(u, v, 306, 3, 3) > 0.6 ? 1 : 0;
      if (rust) { px.r = 0.45; px.g = 0.28; px.b = 0.15; }
      px.h = 0.85;
      px.rough = 0.55;
      // rivets
      const rv = (v * planks) % 1, ru = ((u - 0.12) % 0.68) / 0.08;
      if (Math.hypot(ru - 0.5, (rv - 0.5) * 1.2) < 0.18) { px.h = 1; px.r *= 1.3; px.g *= 1.3; px.b *= 1.3; }
    }
  }, 2.5);
}

/** Dusty sand ground. One tile = 4m. */
export function sand(size = 512): TexSet {
  return makeSet(size, (u, v, px) => {
    const n = fbm(u, v, 401, 6, 4);
    const big = fbm(u, v, 402, 2, 1);
    const pebble = fbm(u, v, 403, 2, 64);
    const ripple = Math.sin((u * 3 + v * 1.2 + n * 0.5) * Math.PI * 6) * 0.5 + 0.5;
    const k = 0.85 + n * 0.25 - big * 0.15 + ripple * 0.05;
    setRGB(px, 0.78, 0.68, 0.5, k);
    px.h = 0.5 + n * 0.2 + ripple * 0.08;
    if (pebble > 0.77) { const t = (pebble - 0.77) * 8; px.h += t * 0.3; px.r *= 1 - t * 0.35; px.g *= 1 - t * 0.35; px.b *= 1 - t * 0.3; }
    px.rough = 0.95;
  }, 1.8);
}

/** Painted steel barrel with rust and reinforcing rings. */
export function metalBarrel(r: number, g: number, b: number, size = 256): TexSet {
  return makeSet(size, (u, v, px) => {
    const n = fbm(u, v, 501, 4, 6);
    const rustF = fbm(u, v, 502, 4, 3);
    const scratch = fbm(u * 8, v * 0.5, 503, 2, 8);
    const k = 0.85 + n * 0.25 + scratch * 0.1;
    setRGB(px, r, g, b, k);
    px.h = 0.5;
    px.rough = 0.45 + n * 0.2;
    const ring = Math.abs(v - 0.3) < 0.02 || Math.abs(v - 0.7) < 0.02;
    if (ring) { px.h = 0.8; px.r *= 0.85; px.g *= 0.85; px.b *= 0.85; }
    const rust = Math.max(0, (rustF - 0.55) * 4) * (v < 0.25 ? 1.5 : 1);
    if (rust > 0) {
      const t = Math.min(1, rust);
      px.r = mix(px.r, 0.42, t); px.g = mix(px.g, 0.24, t); px.b = mix(px.b, 0.12, t);
      px.rough = mix(px.rough, 0.95, t); px.h -= t * 0.05;
    }
  }, 2.5);
}

/** Burlap sandbag weave. */
export function burlap(size = 128): TexSet {
  return makeSet(size, (u, v, px) => {
    const weave = (Math.sin(u * Math.PI * 64) * Math.sin(v * Math.PI * 64)) * 0.5 + 0.5;
    const n = fbm(u, v, 601, 3, 4);
    setRGB(px, 0.6, 0.53, 0.38, 0.8 + weave * 0.25 + n * 0.15);
    px.h = 0.5 + weave * 0.3;
    px.rough = 0.95;
  }, 1.5);
}

/** Corrugated metal roofing. */
export function corrugated(size = 256): TexSet {
  return makeSet(size, (u, v, px) => {
    const wave = Math.sin(u * Math.PI * 24) * 0.5 + 0.5;
    const n = fbm(u, v, 701, 4, 4);
    const rust = fbm(u, v, 702, 3, 2);
    setRGB(px, 0.5, 0.48, 0.45, 0.7 + wave * 0.3 + n * 0.1);
    px.h = 0.3 + wave * 0.6;
    px.rough = 0.6;
    if (rust > 0.58) { const t = Math.min(1, (rust - 0.58) * 5); px.r = mix(px.r, 0.5, t); px.g = mix(px.g, 0.27, t); px.b = mix(px.b, 0.12, t); px.rough = 0.95; }
  }, 2);
}

/** Desert camo fabric for bot uniforms. */
export function camo(size = 256): TexSet {
  return makeSet(size, (u, v, px) => {
    const a = fbm(u, v, 801, 3, 3), b = fbm(u, v, 802, 3, 4);
    const weave = (Math.sin(u * Math.PI * 128) * Math.sin(v * Math.PI * 128)) * 0.05;
    if (a > 0.58) setRGB(px, 0.42, 0.34, 0.22);
    else if (b > 0.55) setRGB(px, 0.62, 0.52, 0.36);
    else setRGB(px, 0.72, 0.64, 0.46);
    px.r += weave; px.g += weave; px.b += weave;
    px.h = 0.5 + weave * 4;
    px.rough = 0.95;
  }, 1);
}

/** Dark tactical fabric (vest, mask). */
export function darkFabric(size = 128): TexSet {
  return makeSet(size, (u, v, px) => {
    const weave = (Math.sin(u * Math.PI * 96) * Math.sin(v * Math.PI * 96)) * 0.5 + 0.5;
    const n = fbm(u, v, 901, 3, 4);
    setRGB(px, 0.16, 0.16, 0.17, 0.85 + weave * 0.2 + n * 0.15);
    px.h = 0.5 + weave * 0.2;
    px.rough = 0.9;
  }, 1);
}

/** Brushed gunmetal. */
export function gunmetal(size = 128): TexSet {
  return makeSet(size, (u, v, px) => {
    const brush = fbm(u * 0.2, v * 6, 1001, 3, 8);
    const wear = fbm(u, v, 1002, 3, 3);
    setRGB(px, 0.16, 0.17, 0.18, 0.8 + brush * 0.4 + (wear > 0.62 ? 0.3 : 0));
    px.h = 0.5 + brush * 0.05;
    px.rough = 0.4 + brush * 0.2;
  }, 0.8);
}

/** Polished wood for gun furniture. */
export function gunWood(size = 128): TexSet {
  return makeSet(size, (u, v, px) => {
    const grain = fbm(u * 0.5, v * 5, 1101, 4, 4);
    const rings = Math.abs(Math.sin((v * 6 + grain * 1.5) * Math.PI));
    setRGB(px, 0.5, 0.3, 0.14, 0.8 + rings * 0.3 + grain * 0.15);
    px.h = 0.5 + grain * 0.05;
    px.rough = 0.5;
  }, 0.8);
}

/** Skin with subtle pores. */
export function skin(size = 64): TexSet {
  return makeSet(size, (u, v, px) => {
    const n = fbm(u, v, 1201, 3, 8);
    setRGB(px, 0.82, 0.62, 0.46, 0.92 + n * 0.12);
    px.h = 0.5 + n * 0.05;
    px.rough = 0.7;
  }, 0.6);
}

/** Soft radial particle sprite. */
export function softParticle(size = 64): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.4, "rgba(255,255,255,0.5)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Bullet hole decal. */
export function bulletHole(size = 64): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, "rgba(10,8,6,1)");
  grad.addColorStop(0.35, "rgba(20,16,12,0.9)");
  grad.addColorStop(0.6, "rgba(60,50,40,0.35)");
  grad.addColorStop(1, "rgba(80,70,60,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  // jagged cracks
  g.strokeStyle = "rgba(20,16,12,0.7)";
  g.lineWidth = 1.5;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.random() * 0.5;
    g.beginPath();
    g.moveTo(size / 2, size / 2);
    g.lineTo(size / 2 + Math.cos(a) * size * (0.25 + Math.random() * 0.2), size / 2 + Math.sin(a) * size * (0.25 + Math.random() * 0.2));
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Standard material from a texture set. */
export function pbr(set: TexSet, opts: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    map: set.map,
    normalMap: set.normalMap,
    roughnessMap: set.roughnessMap,
    roughness: 1,
    metalness: 0,
    ...opts,
  });
}

/** Box geometry whose UVs are in world units so textures tile consistently across differently sized boxes. */
export function worldBox(w: number, h: number, d: number, tileSize: number): THREE.BoxGeometry {
  const geo = new THREE.BoxGeometry(w, h, d);
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  // face order: +x, -x, +y, -y, +z, -z ; 4 verts each
  const dims: [number, number][] = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    const [su, sv] = dims[f];
    for (let i = 0; i < 4; i++) {
      const idx = f * 4 + i;
      uv.setXY(idx, uv.getX(idx) * su / tileSize, uv.getY(idx) * sv / tileSize);
    }
  }
  uv.needsUpdate = true;
  return geo;
}
