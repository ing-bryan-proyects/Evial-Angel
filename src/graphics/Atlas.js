/**
 * Atlas · hojas de sprites recortadas (assets/sprites/<id>.png + .json)
 * ---------------------------------------------------------------------
 * Las hojas de personajes se procesan con tools/slice_sheets.py: se quita el fondo de papel,
 * se recorta cada fotograma y se empaqueta en un atlas con su punto de anclaje (los pies).
 *
 *   loadAtlas(id)               carga y cachea un atlas (imagen + meta)
 *   atlas.draw(ctx, anim, i, x, y, opts)   dibuja el fotograma i anclado por los pies en (x, y)
 *       opts: { flip, alpha, scale, flash (0..1 blanco), tint:{color,alpha}, rot }
 *   atlas.count(anim) / atlas.has(anim)
 *
 * Además, AtlasActor lleva la cuenta del tiempo de animación (bucle o disparo único).
 */

const cache = new Map();

export class Atlas {
  constructor(id, img, meta) {
    this.id = id; this.img = img; this.meta = meta; this.anims = meta.anims;
    this.height = meta.height;
    this._white = null;
    this._tints = new Map();
  }
  has(anim) { return !!this.anims[anim]; }
  count(anim) { return this.anims[anim]?.length || 0; }
  frame(anim, i) { const a = this.anims[anim]; return a ? a[((i % a.length) + a.length) % a.length] : null; }

  #white() {
    if (!this._white) {
      const c = document.createElement("canvas");
      c.width = this.img.width; c.height = this.img.height;
      const x = c.getContext("2d");
      x.drawImage(this.img, 0, 0);
      x.globalCompositeOperation = "source-in";
      x.fillStyle = "#ffffff";
      x.fillRect(0, 0, c.width, c.height);
      this._white = c;
    }
    return this._white;
  }
  #tinted(color) {
    let c = this._tints.get(color);
    if (!c) {
      c = document.createElement("canvas");
      c.width = this.img.width; c.height = this.img.height;
      const x = c.getContext("2d");
      x.drawImage(this.img, 0, 0);
      x.globalCompositeOperation = "source-in";
      x.fillStyle = color;
      x.fillRect(0, 0, c.width, c.height);
      this._tints.set(color, c);
    }
    return c;
  }

  /** Dibuja anclado por los pies. `x` es el centro de los pies, `y` el suelo. */
  draw(ctx, anim, i, x, y, o = {}) {
    const f = this.frame(anim, i);
    if (!f) return null;
    const s = o.scale || 1, w = f.w * s, h = f.h * s;
    const xr = Math.round(x), yr = Math.round(y);
    const py = Math.round(y - f.ay * s);
    const prevA = ctx.globalAlpha;
    const A = o.alpha ?? 1;
    ctx.save();
    ctx.translate(xr, 0);                                       // el origen local x=0 es el ancla horizontal
    if (o.rot) { ctx.translate(0, yr); ctx.rotate(o.rot); ctx.translate(0, -yr); }
    if (o.flip) ctx.scale(-1, 1);
    const dx = Math.round(-f.ax * s);
    ctx.globalAlpha = prevA * A;
    ctx.drawImage(this.img, f.x, f.y, f.w, f.h, dx, py, w, h);
    if (o.tint) { ctx.globalAlpha = prevA * A * o.tint.alpha; ctx.drawImage(this.#tinted(o.tint.color), f.x, f.y, f.w, f.h, dx, py, w, h); }
    if (o.flash > 0) { ctx.globalAlpha = prevA * A * Math.min(1, o.flash); ctx.drawImage(this.#white(), f.x, f.y, f.w, f.h, dx, py, w, h); }
    ctx.restore();
    ctx.globalAlpha = prevA;
    return { x: xr + (o.flip ? -(w + dx) : dx), y: py, w, h };
  }
}

export function loadAtlas(id, base = "assets/sprites/") {
  if (cache.has(id)) return cache.get(id);
  const p = (async () => {
    const [img, meta] = await Promise.all([
      new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error("atlas " + id)); im.src = `${base}${id}.png`; }),
      fetch(`${base}${id}.json`).then((r) => r.json()),
    ]);
    return new Atlas(id, img, meta);
  })();
  cache.set(id, p);
  return p;
}

export const ATLAS = {};                                  // atlas ya cargados por id (síncrono tras preload)
export async function preloadAtlases(ids) {
  await Promise.all(ids.map(async (id) => { try { ATLAS[id] = await loadAtlas(id); } catch (e) { console.warn("sin atlas", id); } }));
}

/**
 * AtlasActor · reloj de animación de un personaje.
 *   play(anim, {loop, fps, hold})   cambia de animación (no reinicia si es la misma y ya está en bucle)
 *   frameIndex()                    fotograma actual
 *   finished                        true cuando un disparo único terminó
 */
export class AtlasActor {
  constructor(atlas, fps = 10) {
    this.atlas = atlas; this.anim = "idle"; this.t = Math.random() * 3; this.fps = fps; this.loop = true; this.finished = false; this.speed = 1;
  }
  play(anim, { loop = true, fps = null, restart = false, speed = 1 } = {}) {
    if (!this.atlas.has(anim)) anim = "idle";
    if (this.anim === anim && !restart && this.loop === loop) { this.speed = speed; return; }
    this.anim = anim; this.loop = loop; this.t = 0; this.finished = false; this.speed = speed;
    if (fps) this.fps = fps;
  }
  update(dt) { this.t += dt * this.fps * this.speed; if (!this.loop) { const n = this.atlas.count(this.anim); if (this.t >= n) { this.t = n - 0.001; this.finished = true; } } }
  frameIndex() { const n = this.atlas.count(this.anim); return n ? (this.loop ? Math.floor(this.t) % n : Math.min(n - 1, Math.floor(this.t))) : 0; }
  draw(ctx, x, y, o = {}) { return this.atlas.draw(ctx, this.anim, this.frameIndex(), x, y, o); }
}
