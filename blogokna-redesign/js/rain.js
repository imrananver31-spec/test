/*
 * RainGlass — a house seen through wet, slightly fogged glass.
 *
 * 1. A few drops are simulated on a 2D canvas ("water map"). Each is drawn
 *    with one of several irregular sprites that encode the surface normal
 *    (RG), thickness (B) and coverage (A).
 * 2. A fog canvas stores condensation; sliding drops wipe clear streaks that
 *    slowly fog up again.
 * 3. WebGL renders the scene (a 4K still) with a slow camera pull-back:
 *    a blurred low-res copy for the fogged glass, a clearer one in wiped
 *    streaks, and a sharp, inverted view inside every drop.
 *
 * Degrades gracefully: lower tier for weak/mobile devices, static frame for
 * prefers-reduced-motion, CSS fallback when WebGL is unavailable.
 */
(function () {
  'use strict';

  const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
  const chance = (p) => Math.random() < p;

  /* ---------------------------------------------------------------- */
  /* Sprites                                                          */
  /* ---------------------------------------------------------------- */

  // Real drops are never perfect circles: a lumpy outline, often narrowing
  // upwards into a pear where the water clings to the glass.
  // `shape` scales the outline noise, `power` the lens strength
  // (tiny beads are shallow and never show a dark rim).
  function makeDropSprite(size, seed, shape = 1, power = 1) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(size, size);
    const h = size / 2;
    const p1 = seed * 2.1;
    const p2 = seed * 3.7;
    const p3 = seed * 5.3;
    const a1 = (0.03 + (seed % 3) * 0.02) * shape;
    const a2 = (0.025 + (seed % 2) * 0.02) * shape;
    const a3 = 0.012 * shape;
    const taper = (seed % 4) * 0.22 * shape;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        let dx = (x + 0.5 - h) / h;
        const dy = (y + 0.5 - h) / h;
        // pear: the upper half is squeezed sideways
        dx *= 1 + taper * Math.max(0, -dy);
        const th = Math.atan2(dy, dx);
        // outline radius in this direction
        const R = 0.9 + a1 * Math.sin(2 * th + p1) + a2 * Math.sin(3 * th + p2) + a3 * Math.sin(5 * th + p3);
        const d = Math.sqrt(dx * dx + dy * dy) / R;
        const i = (y * size + x) * 4;
        if (d >= 1) {
          img.data[i + 3] = 0;
          continue;
        }
        // Flat cap with a steep rim: refraction concentrates near the edge.
        const k = Math.pow(d, 2.2) * power;
        const nx = (dx / (d * R + 1e-5)) * k;
        const ny = (dy / (d * R + 1e-5)) * k;
        img.data[i] = 128 + nx * 127;
        img.data[i + 1] = 128 + ny * 127;
        img.data[i + 2] = Math.sqrt(1 - d * d) * 255;
        // ~8% feathered edge so the outline stays smooth at any drawn size
        img.data[i + 3] = Math.min(1, (1 - d) / 0.08) * 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return c;
  }

  // Used by the non-WebGL fallback: a soft lit bead.
  function makeShadeSprite(size) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d');
    const h = size / 2;
    let g = ctx.createRadialGradient(h, h, 0, h, h, h);
    g.addColorStop(0, 'rgba(200,215,230,0.06)');
    g.addColorStop(0.8, 'rgba(160,180,200,0.12)');
    g.addColorStop(0.96, 'rgba(10,14,20,0.35)');
    g.addColorStop(1, 'rgba(10,14,20,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    g = ctx.createRadialGradient(h * 0.72, h * 0.62, 0, h * 0.72, h * 0.62, h * 0.25);
    g.addColorStop(0, 'rgba(255,255,255,0.45)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    return c;
  }

  /* ---------------------------------------------------------------- */
  /* Drop simulation                                                  */
  /* ---------------------------------------------------------------- */

  class RainSim {
    constructor(opts) {
      this.o = opts;
      this.drops = [];
      this.water = document.createElement('canvas');
      this.wctx = this.water.getContext('2d');
      this.beads = document.createElement('canvas');
      this.bctx = this.beads.getContext('2d');
      this.fog = document.createElement('canvas');
      this.fctx = this.fog.getContext('2d');
      this.fogScale = 0.25;
    }

    resize(w, h, scale) {
      this.w = w;
      this.h = h;
      this.scale = scale;
      this.water.width = this.beads.width = Math.max(1, Math.round(w * scale));
      this.water.height = this.beads.height = Math.max(1, Math.round(h * scale));
      this.fog.width = Math.max(1, Math.round(w * this.fogScale));
      this.fog.height = Math.max(1, Math.round(h * this.fogScale));
      this.area = (w * h) / (1440 * 900);
      this.drops = [];
      this.bctx.clearRect(0, 0, this.beads.width, this.beads.height);
      this.prefillFog();
      this.prefill();
    }

    sprite() {
      const s = this.o.sprites;
      return s[(Math.random() * s.length) | 0];
    }

    prefill() {
      const o = this.o;
      const n = Math.round(o.prefillBeads * this.area);
      for (let i = 0; i < n; i++) this.drawBead(rand(0, this.w), rand(0, this.h), this.beadSize());
      const d = Math.round(o.prefillDrops * this.area);
      for (let i = 0; i < d; i++) {
        this.drops.push(this.createDrop(rand(0, this.w), rand(0, this.h), o.minR + Math.pow(Math.random(), 1.7) * (o.maxR - o.minR), 0));
      }
    }

    // Mostly pinpoints, now and then a slightly bigger bead.
    beadSize() {
      const o = this.o;
      return o.beadMin + Math.pow(Math.random(), 2.5) * (o.beadMax - o.beadMin);
    }

    // Uneven breath on the glass: denser towards the bottom.
    prefillFog() {
      const c = this.fctx;
      const fw = this.fog.width;
      const fh = this.fog.height;
      c.clearRect(0, 0, fw, fh);
      const g = c.createLinearGradient(0, 0, 0, fh);
      g.addColorStop(0, 'rgba(255,255,255,0.08)');
      g.addColorStop(0.6, 'rgba(255,255,255,0.2)');
      g.addColorStop(1, 'rgba(255,255,255,0.42)');
      c.fillStyle = g;
      c.fillRect(0, 0, fw, fh);
      for (let i = 0; i < 22; i++) {
        const x = rand(0, fw);
        const y = rand(0, fh);
        const r = rand(fw * 0.08, fw * 0.25);
        const b = c.createRadialGradient(x, y, 0, x, y, r);
        const clear = chance(0.55);
        b.addColorStop(0, clear ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.3)');
        b.addColorStop(1, 'rgba(0,0,0,0)');
        c.globalCompositeOperation = clear ? 'destination-out' : 'source-over';
        c.fillStyle = b;
        c.fillRect(x - r, y - r, r * 2, r * 2);
      }
      c.globalCompositeOperation = 'source-over';
      // remember the resting haze: wiped streaks fog back up to it, no further
      this.fogBase = document.createElement('canvas');
      this.fogBase.width = fw;
      this.fogBase.height = fh;
      this.fogBase.getContext('2d').drawImage(this.fog, 0, 0);
    }

    regrowFog(ts) {
      const c = this.fctx;
      c.globalAlpha = Math.min(1, 0.004 * ts);
      c.drawImage(this.fogBase, 0, 0);
      c.globalAlpha = 1;
    }

    wipe(x, y, r) {
      const s = this.fogScale;
      const R = r * 1.2 * s;
      const c = this.fctx;
      const g = c.createRadialGradient(x * s, y * s, 0, x * s, y * s, R);
      g.addColorStop(0, 'rgba(0,0,0,0.85)');
      g.addColorStop(0.7, 'rgba(0,0,0,0.5)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      c.globalCompositeOperation = 'destination-out';
      c.fillStyle = g;
      c.fillRect(x * s - R, y * s - R, R * 2, R * 2);
      c.globalCompositeOperation = 'source-over';
      // a sliding drop also collects the tiny beads in its path
      const bs = this.scale;
      const b = this.bctx;
      b.globalCompositeOperation = 'destination-out';
      b.beginPath();
      b.ellipse(x * bs, y * bs, r * 0.85 * bs, r * 0.7 * bs, 0, 0, Math.PI * 2);
      b.fill();
      b.globalCompositeOperation = 'source-over';
    }

    // The thin wavy rivulet a sliding drop leaves behind it.
    trail(d, ts) {
      const o = this.o;
      const w = Math.max(1.2, d.r * o.trailWidth * (0.8 + 0.4 * Math.sin(d.y * 0.05 + d.stick * 9)));
      const y = d.y - d.r * 1.05;
      const step = Math.max(1, w * 0.5);
      const dy = d.momentum * o.gravity * ts;
      for (let t = 0; t <= dy; t += step) this.drawBead(d.x - d.momentumX * (t / (dy || 1)), y - t, w, true);
    }

    createDrop(x, y, r, momentum) {
      return {
        x, y, r, momentum,
        momentumX: 0,
        spreadX: 0, spreadY: 0,
        lastSpawn: 0,
        nextSpawn: rand(60, 200),
        killed: false,
        parent: null,
        sprite: this.sprite(),
        // drops spread sideways on the glass: wider than tall
        aspect: rand(1.05, 1.55),
        stick: rand(0, 1),
      };
    }

    drawBead(x, y, r, round) {
      const s = this.scale;
      const b = this.o.beadSprites;
      const a = round ? 1 : rand(1, 1.35);
      this.bctx.drawImage(b[(Math.random() * b.length) | 0], (x - r * a) * s, (y - r) * s, r * 2 * a * s, r * 2 * s);
    }

    update(dt) {
      const o = this.o;
      const ts = Math.min(dt / 16.667, 2.5);
      const { w, h } = this;

      this.regrowFog(ts);

      // Rare new drops landing on the glass.
      if (this.drops.length < o.maxDrops && chance(o.rainChance * ts * this.area)) {
        const r = o.minR + Math.pow(Math.random(), 2.6) * (o.maxR - o.minR);
        this.drops.push(this.createDrop(rand(0, w), rand(0, 0.85) * h, r, 0));
      }
      // Fine spray slowly refills the wiped paths with pinpoint beads.
      if (chance(o.beadRate * ts * this.area)) this.drawBead(rand(0, w), rand(0, h), this.beadSize());

      const newDrops = [];
      const drops = this.drops;
      const deltaR = o.maxR - o.minR;

      for (let i = 0; i < drops.length; i++) {
        const d = drops[i];
        if (d.killed) continue;

        // Only heavy drops break free; surface tension holds the rest.
        const heavy = (d.r - o.slideR) / deltaR;
        if (heavy > 0 && chance(heavy * 0.05 * ts * (1.2 - d.stick))) {
          d.momentum += rand(0.4, 1.4) * (d.r / o.maxR) * 3;
        }

        // Trail of tiny beads behind a sliding drop.
        d.lastSpawn += d.momentum * ts;
        if (d.lastSpawn > d.nextSpawn && d.momentum > 0.3 && d.r > o.slideR && drops.length + newDrops.length < o.maxDrops * 1.4) {
          const t = this.createDrop(d.x + rand(-1, 1) * d.r * 0.12, d.y - d.r * 0.6, d.r * rand(o.trailMin, o.trailMax), 0);
          t.parent = d;
          t.stick = 1;
          newDrops.push(t);
          d.r *= Math.pow(0.985, ts);
          d.lastSpawn = 0;
          d.nextSpawn = rand(o.maxR * 3, o.maxR * 8);
        }

        const moved = d.momentum > 0.05;
        if (moved) {
          d.y += d.momentum * o.gravity * ts;
          d.x += d.momentumX * ts;
          // glass is never perfectly clean: drops wander slightly
          if (chance(0.04 * ts)) d.momentumX = rand(-0.25, 0.25);
          if (d.y > h + d.r * 3) d.killed = true;
        }

        // Merge with drops in the path.
        if (moved && !d.killed) {
          for (let j = 0; j < drops.length; j++) {
            const e = drops[j];
            if (e === d || e.killed || d.r < e.r || d.parent === e || e.parent === d) continue;
            const dx = e.x - d.x;
            const dy = e.y - d.y;
            if (Math.abs(dy) > o.maxR * 2 || Math.abs(dx) > o.maxR * 2) continue;
            if (Math.sqrt(dx * dx + dy * dy) < (d.r + e.r) * 0.55) {
              d.r = Math.min(Math.sqrt(d.r * d.r + e.r * e.r * 0.8), o.maxR * 1.1);
              d.momentumX += dx * 0.02;
              d.spreadY = 0.25;
              e.killed = true;
              d.momentum = Math.min(9, d.momentum + 0.8);
            }
          }
        }

        // Friction: sliding comes in short runs and pauses.
        d.momentum -= 0.035 * ts * (1 + d.stick);
        if (chance(0.012 * ts)) d.momentum *= 0.3;
        if (d.momentum < 0) d.momentum = 0;
        d.momentumX *= Math.pow(0.9, ts);
        d.spreadY *= Math.pow(0.85, ts);

        if (moved && !d.killed) {
          this.wipe(d.x, d.y - d.r * 0.3, d.r);
          this.trail(d, ts);
        }
      }

      this.drops = drops.filter((d) => !d.killed).concat(newDrops);
    }

    render() {
      const ctx = this.wctx;
      const s = this.scale;
      ctx.imageSmoothingQuality = 'high'; // reset whenever the canvas is resized
      ctx.clearRect(0, 0, this.water.width, this.water.height);
      ctx.drawImage(this.beads, 0, 0);
      for (const d of this.drops) {
        // Sliding drops stretch: round heavy bottom, tapered top.
        const stretch = Math.min(d.momentum, 6) * 0.07;
        const rw = d.r * d.aspect * (1 - stretch * 0.25);
        const rh = d.r * (1 + stretch + d.spreadY);
        ctx.drawImage(d.sprite, (d.x - rw) * s, (d.y - rh * 1.15 + d.r * 0.15) * s, rw * 2 * s, rh * 2 * s);
      }
    }
  }

  /* ---------------------------------------------------------------- */
  /* WebGL                                                            */
  /* ---------------------------------------------------------------- */

  const VERT = `
    attribute vec2 aPos;
    varying vec2 vUv;
    void main() {
      vUv = aPos * 0.5 + 0.5;
      gl_Position = vec4(aPos, 0.0, 1.0);
    }`;

  // Pass 1: cover-fit the scene into a small FBO with a gaussian blur.
  const FRAG_BLUR = `
    precision mediump float;
    uniform sampler2D uTex;
    uniform vec2 uCover;
    uniform vec2 uOffset;
    uniform vec2 uStep;
    varying vec2 vUv;
    vec2 cover(vec2 uv) { return (uv - 0.5) * uCover + 0.5 + uOffset; }
    void main() {
      vec3 c = vec3(0.0);
      float tot = 0.0;
      for (int i = -2; i <= 2; i++) {
        for (int j = -2; j <= 2; j++) {
          vec2 o = vec2(float(i), float(j));
          float w = exp(-dot(o, o) / 4.5);
          c += texture2D(uTex, cover(vUv + o * uStep)).rgb * w;
          tot += w;
        }
      }
      gl_FragColor = vec4(c / tot, 1.0);
    }`;

  // Pass 2: fogged glass + wiped streaks + refracting drops.
  const FRAG_MAIN = `
    precision mediump float;
    uniform sampler2D uTex;
    uniform sampler2D uBlur;
    uniform sampler2D uWater;
    uniform sampler2D uFog;
    uniform vec2 uCover;
    uniform vec2 uOffset;
    uniform vec2 uBlurStep;
    uniform float uAspect;
    uniform float uRefract;
    uniform float uAlpha;
    uniform float uLight;
    uniform float uFocus;
    varying vec2 vUv;

    vec2 cover(vec2 uv) { return (uv - 0.5) * uCover + 0.5 + uOffset; }

    // Cool evening grade that keeps the warm light in the windows.
    vec3 grade(vec3 c) {
      float l = dot(c, vec3(0.299, 0.587, 0.114));
      c = mix(vec3(l), c, 0.72);
      c *= vec3(0.92, 0.97, 1.05);
      return pow(c, vec3(1.08)) * 0.9;
    }

    vec3 blurAt(vec2 uv, vec2 s) {
      vec3 c = texture2D(uBlur, uv).rgb * 0.36;
      c += texture2D(uBlur, uv + vec2(s.x, 0.0)).rgb * 0.16;
      c += texture2D(uBlur, uv - vec2(s.x, 0.0)).rgb * 0.16;
      c += texture2D(uBlur, uv + vec2(0.0, s.y)).rgb * 0.16;
      c += texture2D(uBlur, uv - vec2(0.0, s.y)).rgb * 0.16;
      return c;
    }

    void main() {
      vec3 soft = grade(blurAt(vUv, uBlurStep));
      vec3 wide = grade(blurAt(vUv, uBlurStep * 3.0));
      vec3 sharp = grade(texture2D(uTex, cover(vUv)).rgb);

      // Condensation: milky, scattered light where fogged; clearer where wiped.
      float fog = texture2D(uFog, vUv).a;
      float lum = dot(wide, vec3(0.299, 0.587, 0.114));
      vec3 milk = vec3(0.46, 0.5, 0.56) + lum * 0.4;
      // Focus sits on the glass: the house behind is softly out of focus.
      vec3 base = mix(sharp, soft, uFocus);
      vec3 fogged = mix(mix(sharp, soft, 0.6), milk, 0.1);
      vec3 bg = mix(base, fogged, smoothstep(0.1, 1.0, fog));

      // Drops
      vec4 w = texture2D(uWater, vUv);
      float a = smoothstep(0.15, 0.75, w.a);
      vec2 n = (w.rg - 0.5) * 2.0;
      n.y = -n.y;
      float th = w.b;
      float edge = length(n);

      // A drop is a tiny lens: a sharp, inverted, compressed view of the scene.
      vec2 ruv = vUv - n * uRefract * vec2(1.0 / uAspect, 1.0);
      // Water gathers light from a wide angle, so drops read a touch brighter.
      vec3 drop = grade(texture2D(uTex, cover(ruv)).rgb) * 1.22 + 0.06;
      vec2 nd = normalize(n + 1e-4);
      float rim = smoothstep(0.5, 1.0, edge);
      // Light from above: the upper edge refracts the dark ground below
      // into a thick arc, the drop focuses the sky into a bright bottom.
      float top = max(nd.y, 0.0);
      drop *= 1.0 - rim * (0.3 + 0.65 * top);
      drop += vec3(0.82, 0.88, 0.95) * rim * max(-nd.y, 0.0) * 0.38;
      vec3 N = normalize(vec3(n * 1.6, 1.0));
      vec3 L = normalize(vec3(-0.4, 0.7, 0.6));
      float spec = pow(max(dot(reflect(-L, N), vec3(0.0, 0.0, 1.0)), 0.0), 80.0);
      drop += spec * 0.32 * smoothstep(0.3, 0.8, th);

      vec3 col = mix(bg, drop, a);

      // Soft reflection of ambient light across the pane.
      float band = vUv.x * 0.75 + vUv.y * 0.55 - 0.95 - uLight;
      col += vec3(0.55, 0.65, 0.78) * 0.035 * exp(-band * band * 14.0);

      vec2 q = vUv - 0.5;
      col *= 1.0 - dot(q, q) * 0.7;
      gl_FragColor = vec4(col * uAlpha, 1.0);
    }`;

  function compile(gl, type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(s);
      gl.deleteShader(s);
      throw new Error(log);
    }
    return s;
  }

  function program(gl, vs, fs) {
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
    gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
    gl.bindAttribLocation(p, 0, 'aPos');
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const u = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) {
      const name = gl.getActiveUniform(p, i).name;
      u[name] = gl.getUniformLocation(p, name);
    }
    return { p, u };
  }

  function texture(gl) {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([12, 14, 18, 255]));
    return t;
  }

  /* ---------------------------------------------------------------- */
  /* Public component                                                 */
  /* ---------------------------------------------------------------- */

  class RainGlass {
    constructor({ canvas, image, reducedMotion = false }) {
      this.canvas = canvas;
      this.image = image;
      this.reduced = reducedMotion;
      this.alpha = 0;
      this.offset = { x: 0, y: 0 };
      this.dolly = 1;
      this.scroll = 0;
      this.light = 0;
      this.time = 0;
      this.running = false;
      this.frameTimes = [];

      const coarse = matchMedia('(pointer: coarse)').matches;
      const small = innerWidth < 820;
      const weak = (navigator.deviceMemory && navigator.deviceMemory <= 2) || (navigator.hardwareConcurrency || 8) <= 2;
      this.tier = weak ? 0 : coarse || small ? 1 : 2;

      const sprites = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((s) => makeDropSprite(128, s + 1));
      const beads = [0, 1, 2].map((s) => makeDropSprite(24, s + 1, 0.4, 0.62));
      this.sim = new RainSim(this.simOptions(sprites, beads));

      try {
        this.initGL();
        this.mode = 'webgl';
      } catch (e) {
        this.mode = 'fallback';
        this.initFallback();
      }

      this.onResize = this.resize.bind(this);
      addEventListener('resize', this.onResize, { passive: true });
      this.resize();
      this.loop = this.loop.bind(this);
    }

    // No drops: the pane is clean, only a light haze of condensation.
    // (Raise the counts below to bring drops back.)
    simOptions(sprites, beadSprites) {
      const t = this.tier;
      // drops keep their real size: smaller relative to the frame on phones
      const k = innerWidth < 820 ? 0.65 : 1;
      return {
        sprites,
        beadSprites,
        minR: (t === 2 ? 7 : 6) * k,
        maxR: (t === 2 ? 36 : 28) * k,
        slideR: (t === 2 ? 26 : 20) * k,
        maxDrops: 0,
        prefillDrops: 0,
        prefillBeads: 0,
        beadMin: 0.9,
        beadMax: 4.6,
        beadRate: 0,
        rainChance: 0,
        trailMin: 0.25,
        trailMax: 0.35,
        trailWidth: 0.16,
        gravity: 0.9,
      };
    }

    initGL() {
      const attrs = { antialias: false, alpha: false, preserveDrawingBuffer: false, powerPreference: 'high-performance' };
      let gl = this.canvas.getContext('webgl2', attrs);
      this.gl2 = !!gl;
      if (!gl) gl = this.canvas.getContext('webgl', attrs);
      if (!gl) throw new Error('no webgl');
      this.gl = gl;

      this.progBlur = program(gl, VERT, FRAG_BLUR);
      this.progMain = program(gl, VERT, FRAG_MAIN);

      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      this.texScene = texture(gl);
      this.texWater = texture(gl);
      this.texFog = texture(gl);
      this.texBlur = texture(gl);
      this.fbo = gl.createFramebuffer();
      this.srcSize = { w: 16, h: 9 };
      this.hasScene = false;

      this.canvas.addEventListener('webglcontextlost', (e) => {
        e.preventDefault();
        this.stop();
      });
    }

    initFallback() {
      this.ctx2d = this.canvas.getContext('2d');
      this.shade = makeShadeSprite(64);
      this.canvas.parentElement.classList.add('is-fallback');
    }

    resize() {
      const w = this.canvas.clientWidth || innerWidth;
      const h = this.canvas.clientHeight || innerHeight;
      if (w === this.cw && h === this.ch) return;
      this.cw = w;
      this.ch = h;
      const dpr = Math.min(devicePixelRatio || 1, [1, 1.5, 2][this.tier]);
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(h * dpr);
      this.sim.resize(w, h, [0.75, 1, 1.25][this.tier]);

      if (this.mode === 'webgl') {
        const gl = this.gl;
        this.bw = Math.max(32, Math.round(w / 6));
        this.bh = Math.max(32, Math.round(h / 6));
        gl.bindTexture(gl.TEXTURE_2D, this.texBlur);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.bw, this.bh, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.texBlur, 0);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      }
      if (!this.running) this.draw();
    }

    // Upload the 4K still once; mipmaps keep it crisp, without shimmer,
    // while the camera pulls back.
    uploadScene() {
      const img = this.image;
      if (this.hasScene || !img || !img.complete || !img.naturalWidth) return;
      const gl = this.gl;
      gl.bindTexture(gl.TEXTURE_2D, this.texScene);
      try {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      } catch (e) {
        // Tainted source (e.g. opened via file://) — switch to the CSS fallback.
        this.switchToFallback();
        return;
      }
      if (this.gl2) {
        gl.generateMipmap(gl.TEXTURE_2D);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      }
      this.srcSize = { w: img.naturalWidth, h: img.naturalHeight };
      this.hasScene = true;
    }

    switchToFallback() {
      this.mode = 'fallback';
      const fresh = this.canvas.cloneNode(false);
      this.canvas.replaceWith(fresh);
      this.canvas = fresh;
      this.gl = null;
      this.initFallback();
      this.cw = 0;
      this.resize();
    }

    zoom() {
      return this.dolly * (1.04 + this.scroll * 0.1);
    }

    coverScale() {
      const ca = this.cw / this.ch;
      const ta = this.srcSize.w / this.srcSize.h;
      const sx = ca < ta ? ca / ta : 1;
      const sy = ca < ta ? 1 : ta / ca;
      const z = this.zoom();
      return [sx / z, sy / z];
    }

    // Parallax + a barely perceptible drift, clamped inside the frame.
    sceneOffset(cover) {
      const drift = this.reduced ? 0 : Math.sin(this.time * 0.00012) * 0.006;
      const mx = (1 - cover[0]) / 2;
      const my = (1 - cover[1]) / 2;
      const ox = Math.max(-mx, Math.min(mx, this.offset.x * 0.01 + drift));
      const oy = Math.max(-my, Math.min(my, this.offset.y * 0.01));
      return [ox, oy];
    }

    drawGL() {
      const gl = this.gl;
      this.uploadScene();
      if (this.mode !== 'webgl') return this.drawFallback();

      gl.bindTexture(gl.TEXTURE_2D, this.texWater);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.sim.water);
      gl.bindTexture(gl.TEXTURE_2D, this.texFog);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.sim.fog);

      const cover = this.coverScale();
      const off = this.sceneOffset(cover);

      // Blur pass
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
      gl.viewport(0, 0, this.bw, this.bh);
      gl.useProgram(this.progBlur.p);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.texScene);
      gl.uniform1i(this.progBlur.u.uTex, 0);
      gl.uniform2fv(this.progBlur.u.uCover, cover);
      gl.uniform2fv(this.progBlur.u.uOffset, off);
      gl.uniform2f(this.progBlur.u.uStep, 0.9 / this.bw, 0.9 / this.bh);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      // Main pass
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      const u = this.progMain.u;
      gl.useProgram(this.progMain.p);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.texScene);
      gl.uniform1i(u.uTex, 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.texBlur);
      gl.uniform1i(u.uBlur, 1);
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, this.texWater);
      gl.uniform1i(u.uWater, 2);
      gl.activeTexture(gl.TEXTURE3);
      gl.bindTexture(gl.TEXTURE_2D, this.texFog);
      gl.uniform1i(u.uFog, 3);
      gl.uniform2fv(u.uCover, cover);
      gl.uniform2fv(u.uOffset, off);
      gl.uniform2f(u.uBlurStep, 1.5 / this.bw, 1.5 / this.bh);
      gl.uniform1f(u.uAspect, this.cw / this.ch);
      gl.uniform1f(u.uRefract, 0.11);
      gl.uniform1f(u.uAlpha, this.alpha);
      gl.uniform1f(u.uLight, this.light + this.offset.x * 0.04);
      // The house stays in sharp focus (no drops to focus on).
      gl.uniform1f(u.uFocus, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.activeTexture(gl.TEXTURE0);
    }

    drawFallback() {
      const ctx = this.ctx2d;
      const s = this.canvas.width / this.cw;
      ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      for (const d of this.sim.drops) {
        const rh = d.r * (1 + Math.min(d.momentum, 6) * 0.07);
        ctx.drawImage(this.shade, (d.x - d.r) * s, (d.y - rh) * s, d.r * 2 * s, rh * 2 * s);
      }
      this.canvas.style.opacity = this.alpha;
      const img = this.canvas.parentElement.querySelector('.hero__poster');
      if (img) img.style.transform = `scale(${this.zoom() * 1.08})`;
    }

    draw() {
      this.sim.render();
      if (this.mode === 'webgl') this.drawGL();
      else this.drawFallback();
    }

    loop(now) {
      if (!this.running) return;
      const dt = this.last ? now - this.last : 16.7;
      this.last = now;
      this.time = now;
      this.adapt(dt);
      this.sim.update(dt);
      this.draw();
      this.raf = requestAnimationFrame(this.loop);
    }

    // If the device struggles, step down a tier once.
    adapt(dt) {
      if (this.adapted || this.tier === 0) return;
      this.frameTimes.push(dt);
      if (this.frameTimes.length < 90) return;
      const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
      this.frameTimes = [];
      if (avg > 34) {
        this.adapted = true;
        this.tier -= 1;
        this.sim.o = this.simOptions(this.sim.o.sprites, this.sim.o.beadSprites);
        this.cw = 0;
        this.resize();
      }
    }

    start() {
      if (this.running) return;
      if (this.reduced) {
        this.draw();
        return;
      }
      this.running = true;
      this.last = 0;
      this.raf = requestAnimationFrame(this.loop);
    }

    stop() {
      this.running = false;
      cancelAnimationFrame(this.raf);
    }

    setAlpha(a) {
      this.alpha = a;
      if (!this.running) this.draw();
    }

    setParallax(x, y) {
      this.offset.x = x;
      this.offset.y = y;
    }

    // Camera pull-back: 1.35 → 1 over the intro.
    setDolly(z) {
      this.dolly = z;
      if (!this.running) this.draw();
    }

    setScroll(p) {
      this.scroll = p;
      this.light = p * 0.6;
      if (!this.running) this.draw();
    }
  }

  window.RainGlass = RainGlass;
})();
