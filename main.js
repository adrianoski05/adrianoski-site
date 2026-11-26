/*
 * Adrianoski · interactive portfolio
 * Plain JavaScript, no dependencies. Everything you may want to change lives in CONFIG.
 */
(() => {
  'use strict';

  // ------------------------------------------------------------------
  // CONFIG
  // ------------------------------------------------------------------
  const CONFIG = {
    email: 'tu@email.com',        // used by the contact links, "Copiar email" and "Escribirme"
    hiddenLayer: 'codigo',        // 'codigo' or 'robot': the image revealed under the photo
    transition: 'tiles',          // 'tiles' (squares flipping) or 'laser' (scan lines)
    trailSize: 1,                 // size of the smoke trail (0.5 – 2)
    autopilot: true,              // the trail wanders over the face when the mouse is idle
    intro: true,                  // boot screen on load
    perspective: 2,               // max head turn in degrees
    photoScale: 0.9,              // photo height as a fraction of the screen height
    background: '#F3F2EE',
    images: {
      photo: 'assets/foto.webp',
      robot: 'assets/robot.webp',
      code: 'assets/codigo.png'
    },
    // Scroll budget, in screen heights. Keep .story height in styles.css = END + 1 screens (here 11.2 → 1120vh).
    HERO: 4.6,       // photo → scan → dissolve
    TIMELINE: 4.2,   // horizontal timeline
    CONTACT: 1.4,    // contact curtain
    END: 10.2
  };

  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const clamp01 = (v) => Math.max(0, Math.min(1, v));
  const smooth = (v) => { v = clamp01(v); return v * v * (3 - 2 * v); };

  class Story {
    constructor() {
      this.outer = $('#story');
      this.wrap = $('#stage');
      this.cv = $('#cv');

      // Light copy of the header/titles/HUD, clipped to the dark areas so text flips colour exactly where the dark side is.
      const dark = $('#uiDark');
      const light = dark.cloneNode(true);
      light.removeAttribute('id');
      light.className = 'ui ui--light';
      light.setAttribute('aria-hidden', 'true');
      $$('[id]', light).forEach((n) => n.removeAttribute('id'));
      $$('a, button', light).forEach((n) => n.setAttribute('tabindex', '-1'));
      $$('h1, h2', light).forEach((h) => { const d = document.createElement('div'); d.className = h.className; d.innerHTML = h.innerHTML; h.replaceWith(d); });
      dark.after(light);
      this.uiLight = light;
      this.scrollLabel = $('#scrollLabel'); this.scrollPct = $('#scrollPct');

      // Timeline
      this.tl = { el: $('#trayectoria'), track: $('#tlTrack'), line: $('#tlLine'), fill: $('#tlFill'), items: $$('.tl-item') };
      this.tl.items.forEach((li) => {
        li._card = $('.tl-card', li); li._img = $('.tl-img', li); li._year = $('.tl-year', li);
      });
      this.tlStart = 640; this.tlStep = 320;
      this.trackW = this.tlStart + this.tl.items.length * this.tlStep + 340 + 140;
      this.tl.track.style.width = this.trackW + 'px';
      this.tl.line.style.width = (this.trackW - 600 - 140) + 'px';
      this.tl.items.forEach((li, i) => { li.style.left = (this.tlStart + i * this.tlStep) + 'px'; });

      // Contact
      this.ctEl = $('#contacto'); this.ctInner = $('#ctInner');
      $$('[data-email]').forEach((a) => { a.href = 'mailto:' + CONFIG.email; });
      $$('[data-email-text] .ct-v').forEach((s) => { s.textContent = CONFIG.email; });

      // Rail
      this.railFill = $('#railFill');
      this.marks = $$('.rail-mark').map((el) => ({ el, at: parseFloat(el.dataset.at) / CONFIG.END }));
      this.marks.forEach((m) => { m.el.style.top = (m.at * 100) + '%'; });

      // Boot, palette, toast, cursor
      this.boot = { el: $('#boot'), lines: $('#bootLines'), fill: $('#bootFill'), pct: $('#bootPct'), shown: 0, start: null, on: CONFIG.intro && !reduceMotion };
      if (!this.boot.on) this.boot.el.hidden = true;
      this.pal = { el: $('#pal'), input: $('#palInput'), list: $('#palList'), empty: $('#palEmpty'), open: false, sel: 0, items: [] };
      this.toastEl = $('#toast');
      this.cur = $('#cur'); this.ring = $('#curRing');

      // Animation state
      this.parts = [];
      this.ptr = { last: null, lastT: -1e9 };
      this.hx = 0.5; this.hy = 0.5; this.mode = 'ESCANEANDO'; this.hudT = 0;
      this.pc = 0; this.tlP = 0; this.ctP = 0; this.gp = 0; this.k3 = 0;
      this.layerAlt = null;
      this.prev = {};

      this.bindEvents();
      this.setup();
    }

    // ---------------- events ----------------
    bindEvents() {
      const w = this.wrap;
      w.addEventListener('pointermove', (e) => this.move(e));
      w.addEventListener('pointerdown', (e) => this.move(e));
      w.addEventListener('pointerleave', () => { this.ptr.last = null; this.curOn = false; });

      $$('[data-go]').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); this.scrollToVh(parseFloat(a.dataset.go)); }));

      window.addEventListener('keydown', (e) => {
        if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); this.pal.open ? this.closePal() : this.openPal(); }
        else if (e.key === 'Escape' && this.pal.open) { e.preventDefault(); this.closePal(); }
      });
      $('#cmdBtn').addEventListener('click', () => this.openPal());
      $('#palBackdrop').addEventListener('click', () => this.closePal());
      this.pal.input.addEventListener('input', () => { this.pal.sel = 0; this.renderCmds(); });
      this.pal.input.addEventListener('keydown', (e) => {
        const n = this.pal.items.length;
        if (e.key === 'ArrowDown') { e.preventDefault(); this.pal.sel = Math.min(n - 1, this.pal.sel + 1); this.paintSel(); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); this.pal.sel = Math.max(0, this.pal.sel - 1); this.paintSel(); }
        else if (e.key === 'Enter') { e.preventDefault(); const c = this.pal.items[this.pal.sel]; if (c) this.runCmd(c); }
      });
      $('#bootSkip').addEventListener('click', () => { this.boot.skip = true; });
    }

    // ---------------- canvas setup ----------------
    loadImg(src) {
      const im = new Image();
      im.onload = () => { if (this.L) { this.drawBase(); this.drawReveal(); } };
      im.src = src;
      return im;
    }
    setup() {
      this.ctx = this.cv.getContext('2d');
      const mk = () => document.createElement('canvas');
      this.L = { base: mk(), reveal: mk(), bin: mk(), dense: mk(), core: mk(), edge: mk(), tmp: mk(), rob: mk(), glw: mk() };
      this.km = mk(); this.gl = mk();
      this.photo = this.loadImg(CONFIG.images.photo);
      this.robot = this.loadImg(CONFIG.images.robot);
      this.code = this.loadImg(CONFIG.images.code);
      this.resize();
      if (window.ResizeObserver) new ResizeObserver(() => this.resize()).observe(this.wrap);
      else window.addEventListener('resize', () => this.resize());
      this.last = performance.now(); this.t0 = this.last; this.binT = 0;
      const loop = (now) => { this.frame(now); requestAnimationFrame(loop); };
      requestAnimationFrame(loop);
    }
    resize() {
      const w = Math.max(320, this.wrap.clientWidth), h = Math.max(320, this.wrap.clientHeight);
      if (w === this.w && h === this.h) return;
      this.w = w; this.h = h;
      const d = this.dpr = Math.min(2, window.devicePixelRatio || 1);
      [this.cv].concat(Object.values(this.L)).forEach((c) => { c.width = Math.round(w * d); c.height = Math.round(h * d); });
      this.C = {};
      for (const k in this.L) { const g = this.L[k].getContext('2d'); g.setTransform(d, 0, 0, d, 0, 0); g.imageSmoothingQuality = 'high'; this.C[k] = g; }
      this.ctx.setTransform(d, 0, 0, d, 0, 0);
      // low-res dissolve masks, scaled up with smoothing = soft smoky edges
      this.nw = Math.ceil(w / 6); this.nh = Math.ceil(h / 6);
      this.km.width = this.gl.width = this.nw; this.km.height = this.gl.height = this.nh;
      this.kmImg = this.km.getContext('2d').createImageData(this.nw, this.nh);
      this.glImg = this.gl.getContext('2d').createImageData(this.nw, this.nh);
      this.initGrid(); this.drawBase(); this.drawReveal(); this.drawBin();
    }

    // ---------------- portrait ----------------
    // Where the photo sits: centred and anchored to the bottom edge (all images are 1312×1199 and aligned).
    rect() {
      const w = this.w, h = this.h, ar = 1312 / 1199;
      let ih = h * CONFIG.photoScale, iw = ih * ar;
      if (iw > w * 0.98) { iw = w * 0.98; ih = iw / ar; }
      return { x: (w - iw) / 2, y: h - ih, w: iw, h: ih };
    }
    geo() {
      const r = this.rect();
      return { cx: r.x + r.w * 0.5, hy: r.y + r.h * 0.42, rx: r.w * 0.19, ry: r.h * 0.26 };
    }
    // Fake 3D: the image is drawn in vertical strips, each scaled as if the plane were turned by `yaw`.
    warp(g, img, yaw, pitch) {
      if (!img || !img.complete || !img.naturalWidth) return;
      const r = this.rect();
      if (Math.abs(yaw) < 0.001) { g.drawImage(img, Math.round(r.x), Math.round(r.y), Math.round(r.w), Math.round(r.h)); return; }
      const N = 72, iw = img.naturalWidth, ih = img.naturalHeight, sw = iw / N;
      const s = Math.sin(yaw), c = Math.cos(yaw), k = 0.45;
      const cx = r.x + r.w / 2 + Math.sin(yaw) * r.w * 0.06, by = r.y + r.h;
      const lift = pitch * Math.sin(this.maxR || 0) * r.h * 0.5;
      const d = this.dpr || 1, snap = (v) => Math.round(v * d) / d;
      const proj = (u) => { const z = 1 + u * s * k; return { x: (u * c) / z, sc: 1 / z }; };
      for (let i = 0; i < N; i++) {
        const a = proj(-1 + (2 * i) / N), b = proj(-1 + (2 * (i + 1)) / N);
        const x0 = snap(cx + (a.x * r.w) / 2), x1 = snap(cx + (b.x * r.w) / 2);
        const sc = (a.sc + b.sc) / 2, hh = r.h * sc;
        g.drawImage(img, i * sw, 0, sw, ih, x0, by - hh + lift * sc, x1 - x0 + 1 / d, hh);
      }
    }
    currentLayer() { return this.layerAlt || CONFIG.hiddenLayer; }
    hiddenImg() { return this.currentLayer() === 'codigo' ? this.code : this.robot; }
    drawBase() {
      const g = this.C.base; g.clearRect(0, 0, this.w, this.h);
      this.warp(g, this.photo, this.yaw || 0, this.pitch || 0);
    }
    drawReveal() {
      const g = this.C.reveal, W = this.w, H = this.h;
      g.clearRect(0, 0, W, H);
      g.fillStyle = '#060708'; g.fillRect(0, 0, W, H);
      g.globalAlpha = 0.22; g.drawImage(this.L.dense, 0, 0, W, H); g.globalAlpha = 1;
      if (!(this.k3 > 0.001) || !this.kmImg) { this.warp(g, this.hiddenImg(), this.yaw || 0, this.pitch || 0); return; }
      // Final phase: the hidden portrait burns away behind a flowing neon edge.
      const rc = this.C.rob;
      this.dissolve(-0.12 + this.k3 * 1.3, (performance.now() - this.t0) / 1000);
      rc.globalCompositeOperation = 'source-over'; rc.clearRect(0, 0, W, H);
      this.warp(rc, this.hiddenImg(), this.yaw || 0, this.pitch || 0);
      const gc = this.C.glw;
      gc.globalCompositeOperation = 'source-over'; gc.clearRect(0, 0, W, H);
      gc.save(); gc.filter = 'blur(10px)'; gc.globalAlpha = 0.7; gc.drawImage(this.gl, 0, 0, W, H); gc.restore();
      gc.globalCompositeOperation = 'lighter'; gc.drawImage(this.gl, 0, 0, W, H);
      gc.globalCompositeOperation = 'destination-in'; gc.drawImage(this.L.rob, 0, 0, W, H); // smoke only over the portrait
      gc.globalCompositeOperation = 'source-over';
      rc.globalCompositeOperation = 'destination-in'; rc.drawImage(this.km, 0, 0, W, H);
      rc.globalCompositeOperation = 'source-over';
      g.drawImage(this.L.rob, 0, 0, W, H);
      g.globalCompositeOperation = 'lighter'; g.drawImage(this.L.glw, 0, 0, W, H);
      g.globalCompositeOperation = 'source-over';
    }

    // ---------------- transitions ----------------
    // 40px squares flip to the dark side: right half bottom-up, then the left half toward the edge.
    // Returns a CSS clip-path covering the squares already turned (for the light copy of the texts).
    tiles(m, kT) {
      const W = this.w, H = this.h, T = 40, cols = Math.ceil(W / T), rows = Math.ceil(H / T);
      const split = this.geo().cx, d = this.dpr, R = this.L.reveal;
      const flips = [], runs = []; let full = 0, total = 0;
      m.save(); m.beginPath();
      for (let r = 0; r < rows; r++) {
        let run = -1;
        for (let c = 0; c <= cols; c++) {
          let f = 0;
          if (c < cols) {
            total++;
            const x = c * T, y = r * T, mx = x + T / 2, my = y + T / 2, n = this.hash(c + 7, r + 999);
            const s = mx >= split ? 0.5 * (((H - my) / H) * 0.82 + n * 0.18) : 0.5 + 0.5 * (((split - mx) / split) * 0.82 + n * 0.18);
            f = clamp01((kT - s) / 0.06);
            if (f >= 1) { m.rect(x, y, T, T); full++; } else if (f > 0) flips.push([x, y, f]);
          }
          if (f >= 0.5 && run < 0) run = c;
          if (f < 0.5 && run >= 0) { runs.push([run * T, r * T, c * T, r * T + T]); run = -1; }
        }
      }
      if (full) { m.clip(); m.drawImage(R, 0, 0, W, H); }
      m.restore();
      m.save();
      for (const [x, y, f] of flips) {
        const e = Math.sin((f * Math.PI) / 2), w = Math.max(1, T * e), ox = x + (T - w) / 2;
        m.globalAlpha = 1; m.drawImage(R, x * d, y * d, T * d, T * d, ox, y, w, T);
        m.globalAlpha = 0.25 * (1 - f); m.fillStyle = '#2EE6FF'; m.fillRect(ox, y, w, T);
        m.globalAlpha = 0.9 * (1 - f); m.strokeStyle = '#2EE6FF'; m.lineWidth = 1; m.strokeRect(ox + 0.5, y + 0.5, w - 1, T - 1);
      }
      m.restore();
      if (full === total) return 'inset(0px)';
      if (!runs.length) return 'polygon(0px 0px, 0px 0px, 0px 0px)';
      let p = '0px 0px';
      for (const [x0, y0, x1, y1] of runs) p += ',' + x0 + 'px ' + y0 + 'px,' + x1 + 'px ' + y0 + 'px,' + x1 + 'px ' + y1 + 'px,' + x0 + 'px ' + y1 + 'px,' + x0 + 'px ' + y0 + 'px,0px 0px';
      return 'polygon(' + p + ')';
    }
    // One glowing scan line: dir 'h' at y = pos from a..b, or 'v' at x = pos from a..b.
    laser(m, dir, pos, a, b, k, t, pct) {
      const H = dir === 'h';
      m.save();
      m.globalCompositeOperation = 'lighter';
      m.strokeStyle = 'rgba(46,230,255,1)'; m.lineWidth = 1;
      for (let i = 1; i <= 8; i++) {
        const o = i * 18; m.globalAlpha = k * 0.22 * (1 - i / 9);
        m.beginPath();
        if (H) { m.moveTo(a, pos + o); m.lineTo(b, pos + o); } else { m.moveTo(pos - o, a); m.lineTo(pos - o, b); }
        m.stroke();
      }
      const gr = H ? m.createLinearGradient(0, pos - 60, 0, pos + 60) : m.createLinearGradient(pos - 60, 0, pos + 60, 0);
      gr.addColorStop(0, 'rgba(46,230,255,0)'); gr.addColorStop(0.5, 'rgba(46,230,255,0.55)'); gr.addColorStop(1, 'rgba(46,230,255,0)');
      m.globalAlpha = k; m.fillStyle = gr;
      if (H) m.fillRect(a, pos - 60, b - a, 120); else m.fillRect(pos - 60, a, 120, b - a);
      m.fillStyle = 'rgba(46,230,255,0.9)';
      if (H) m.fillRect(a, pos - 2, b - a, 4); else m.fillRect(pos - 2, a, 4, b - a);
      m.fillStyle = 'rgba(235,255,255,1)';
      if (H) m.fillRect(a, pos - 0.75, b - a, 1.5); else m.fillRect(pos - 0.75, a, 1.5, b - a);
      m.fillStyle = '#ffffff';
      for (let i = 0; i < 6; i++) {
        const f = (t * (0.35 + i * 0.11) + i * 0.17) % 1, p = a + (b - a) * f;
        m.globalAlpha = k * (0.5 + 0.5 * Math.sin(t * 9 + i));
        if (H) m.fillRect(p - 10, pos - 1.5, 20, 3); else m.fillRect(pos - 1.5, p - 10, 3, 20);
      }
      m.globalCompositeOperation = 'source-over'; m.globalAlpha = k;
      m.font = '500 11px "JetBrains Mono", ui-monospace, monospace'; m.fillStyle = '#2EE6FF';
      const label = (H ? 'SCAN Y ' : 'SCAN X ') + String(pct).padStart(3, '0') + '%';
      if (H) { m.textAlign = 'right'; m.fillText(label, b - 16, pos - 12); } else { m.textAlign = 'left'; m.fillText(label, pos + 10, b * 0.5); }
      m.restore();
    }

    // ---------------- noise + dissolve ----------------
    hash(i, j) {
      let h = (Math.imul(i, 374761393) + Math.imul(j, 668265263)) | 0;
      h = Math.imul(h ^ (h >>> 13), 1274126177);
      return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
    }
    vnoise(x, y) {
      const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
      const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
      const a = this.hash(xi, yi), b = this.hash(xi + 1, yi), c = this.hash(xi, yi + 1), d = this.hash(xi + 1, yi + 1);
      return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
    }
    dissolve(th, t) {
      const nw = this.nw, nh = this.nh, kd = this.kmImg.data, gd = this.glImg.data, band = 0.07;
      const pal = [[255, 61, 184], [232, 60, 255], [155, 77, 255], [61, 123, 255], [61, 255, 122], [255, 122, 61], [255, 61, 184]];
      for (let y = 0; y < nh; y++) {
        for (let x = 0; x < nw; x++) {
          const X = (x / nw) * 7, Y = (y / nh) * 5;
          const n = this.vnoise(X + t * 0.12, Y - t * 0.28) * 0.55 + this.vnoise(X * 2.3 + 11, Y * 2.3 - t * 0.45) * 0.3 + this.vnoise(X * 5 + 37, Y * 5 + t * 0.3) * 0.15;
          const v = n * 0.7 + (x / nw) * 0.15 + (y / nh) * 0.15;
          const i = (y * nw + x) * 4;
          const keep = v > th + band ? 1 : v > th ? (v - th) / band : 0;
          kd[i] = kd[i + 1] = kd[i + 2] = 0; kd[i + 3] = keep * 255;
          const e = 1 - Math.abs(v - th - band * 0.25) / (band * 0.75);
          if (e > 0) {
            let s = ((x / nw) * 0.8 + (y / nh) * 0.5 + t * 0.06) % 1; s *= pal.length - 1;
            const k = Math.floor(s), f = s - k, A = pal[k], B = pal[k + 1];
            gd[i] = A[0] + (B[0] - A[0]) * f; gd[i + 1] = A[1] + (B[1] - A[1]) * f; gd[i + 2] = A[2] + (B[2] - A[2]) * f;
            gd[i + 3] = Math.min(1, e * 1.4) * 255;
          } else gd[i + 3] = 0;
        }
      }
      this.km.getContext('2d').putImageData(this.kmImg, 0, 0);
      this.gl.getContext('2d').putImageData(this.glImg, 0, 0);
    }

    // ---------------- 0s and 1s ----------------
    initGrid() {
      this.cw = 9; this.ch = 16;
      this.cols = Math.ceil(this.w / this.cw); this.rows = Math.ceil(this.h / this.ch);
      const n = this.cols * this.rows; this.grid = new Uint8Array(n); this.dgrid = new Uint8Array(n);
      this.colDen = new Float32Array(this.cols);
      for (let c = 0; c < this.cols; c++) this.colDen[c] = Math.random() < 0.35 ? 0.05 : 0.15 + Math.random() * 0.5;
      for (let i = 0; i < n; i++) { const c = i % this.cols; this.grid[i] = Math.random() < this.colDen[c] ? 1 + (Math.random() < 0.5) : 0; this.dgrid[i] = 1 + (Math.random() < 0.5); }
    }
    mutate() {
      const n = this.grid.length, k = Math.floor(n * 0.03);
      for (let i = 0; i < k; i++) { const j = (Math.random() * n) | 0; const c = j % this.cols; this.grid[j] = Math.random() < this.colDen[c] ? 1 + (Math.random() < 0.5) : 0; }
      for (let i = 0; i < k * 2; i++) { const j = (Math.random() * n) | 0; this.dgrid[j] = 1 + (Math.random() < 0.5); }
    }
    drawBin() {
      const W = this.w, H = this.h, t = (performance.now() - (this.t0 || 0)) / 1000;
      const draw = (g, grid, light) => {
        g.clearRect(0, 0, W, H); g.font = '500 13px "JetBrains Mono", ui-monospace, monospace'; g.textBaseline = 'top';
        for (let c = 0; c < this.cols; c++) {
          const hue = ((c / this.cols) * 300 + t * 20) % 360;
          g.fillStyle = 'hsl(' + hue + ',' + (light ? '70%,55%' : '90%,48%') + ')';
          for (let r = 0; r < this.rows; r++) { const v = grid[r * this.cols + c]; if (v) g.fillText(v === 1 ? '0' : '1', c * this.cw, r * this.ch); }
        }
      };
      draw(this.C.bin, this.grid, true);
      draw(this.C.dense, this.dgrid, false);
    }

    // ---------------- pointer + smoke trail ----------------
    move(e) {
      if (!this.w) return;
      const r = this.wrap.getBoundingClientRect();
      const x = (e.clientX - r.left) * (this.w / r.width), y = (e.clientY - r.top) * (this.h / r.height);
      this.ptr.lastT = performance.now(); this.mode = 'RASTREANDO';
      this.curX = x; this.curY = y; this.curOn = e.pointerType === 'mouse';
      this.curHover = !!(e.target && e.target.closest && e.target.closest('a, button, input'));
      this.hx = x / this.w; this.hy = y / this.h;
      this.trail(x, y);
    }
    trail(x, y) {
      const L = this.ptr.last;
      if (!L) { this.ptr.last = { x, y }; this.spawn(x, y, 0, 0); return; }
      const dx = x - L.x, dy = y - L.y, dist = Math.hypot(dx, dy);
      if (dist > 260) { this.ptr.last = { x, y }; this.spawn(x, y, 0, 0); return; }
      const steps = Math.ceil(dist / 7);
      for (let i = 1; i <= steps; i++) { const f = i / steps; if (Math.random() < 0.75) this.spawn(L.x + dx * f, L.y + dy * f, dx, dy); }
      this.ptr.last = { x, y };
    }
    spawn(x, y, vx, vy) {
      const size = CONFIG.trailSize;
      const r = (14 + Math.random() * 30) * size;
      this.parts.push({
        x: x + (Math.random() - 0.5) * 18 * size, y: y + (Math.random() - 0.5) * 18 * size,
        vx: vx * 0.05 + (Math.random() - 0.5) * 0.5, vy: vy * 0.05 + (Math.random() - 0.5) * 0.5 - 0.2,
        r, g: 0.15 + Math.random() * 0.35, life: 1, d: 0.006 + Math.random() * 0.009, ph: Math.random() * 6.28
      });
      if (this.parts.length > 520) this.parts.splice(0, this.parts.length - 520);
    }

    // ---------------- main loop ----------------
    frame(now) {
      const dt = Math.min(50, now - this.last) / 16.67; this.last = now;
      const t = (now - this.t0) / 1000;
      if (now - this.binT > 110) { this.mutate(); this.drawBin(); this.binT = now; }

      // Scroll progress through the tall box (the stage stays pinned meanwhile).
      const ro = this.outer.getBoundingClientRect(), vh = Math.max(1, this.wrap.getBoundingClientRect().height), s = -ro.top;
      const prog = clamp01(s / (vh * CONFIG.HERO));
      const tlp = clamp01((s - vh * CONFIG.HERO) / (vh * CONFIG.TIMELINE));
      const ctp = clamp01((s - vh * (CONFIG.HERO + CONFIG.TIMELINE)) / (vh * CONFIG.CONTACT));
      this.gp = clamp01(s / (vh * CONFIG.END));
      const ease = (cur, target) => { const v = cur + (target - cur) * Math.min(1, 0.14 * dt); return Math.abs(target - v) < 0.0005 ? target : v; };
      this.pc = ease(this.pc, prog); this.tlP = ease(this.tlP, tlp); this.ctP = ease(this.ctP, ctp);
      this.k3 = smooth((this.pc - 0.64) / 0.36);

      // Idle: the trail wanders over the face on its own.
      if (now - this.ptr.lastT > 2200) {
        this.mode = this.ctP > 0.5 ? 'CONTACTO' : this.tlP > 0.01 ? 'TRAYECTORIA' : this.k3 > 0.02 ? 'DISOLVIENDO' : this.pc > 0.3 ? 'DIVIDIDO' : 'ESCANEANDO';
        if (CONFIG.autopilot && !reduceMotion && this.pc < 0.08) {
          const { cx, hy, rx, ry } = this.geo();
          const x = cx + Math.sin(t * 0.55) * rx * 1.9 + Math.sin(t * 1.7) * rx * 0.3;
          const y = hy + Math.sin(t * 0.83 + 1) * ry * 1.1;
          this.hx = x / this.w; this.hy = y / this.h; this.trail(x, y);
        }
      } else if (Math.random() < 0.25 && this.ptr.last) {
        this.spawn(this.ptr.last.x, this.ptr.last.y, 0, 0);
      }

      // Ease the head toward the pointer.
      const maxR = this.maxR = (CONFIG.perspective * Math.PI) / 180;
      const tx = (clamp01(this.hx) - 0.5) * 2 * maxR;
      const ty = maxR > 0 ? (clamp01(this.hy) - 0.5) * 2 : 0;
      const he = Math.min(1, 0.07 * dt);
      this.yaw = (this.yaw || 0) + (tx - (this.yaw || 0)) * he;
      this.pitch = (this.pitch || 0) + (ty - (this.pitch || 0)) * he;
      this.drawBase(); this.drawReveal();

      // Smoke particles.
      const ps = this.parts;
      for (let i = ps.length - 1; i >= 0; i--) {
        const p = ps[i];
        p.x += (p.vx + Math.sin(p.y * 0.013 + t * 1.6 + p.ph) * 0.45) * dt;
        p.y += p.vy * dt; p.vx *= 0.985; p.vy = p.vy * 0.985 - 0.01 * dt;
        p.r += p.g * dt; p.life -= p.d * dt;
        if (p.life <= 0) ps.splice(i, 1);
      }
      const W = this.w, H = this.h, C = this.C, L = this.L, m = this.ctx;
      C.core.clearRect(0, 0, W, H); C.edge.clearRect(0, 0, W, H);
      C.core.fillStyle = '#000'; C.edge.fillStyle = '#000';
      for (const p of ps) {
        const e = Math.min(1, p.life * 1.5), rc = p.r * e * e;
        if (rc < 0.5) continue;
        C.edge.beginPath(); C.edge.arc(p.x, p.y, rc * 1.45 + 8, 0, Math.PI * 2); C.edge.fill();
        if (p.life > 0.18) { C.core.beginPath(); C.core.arc(p.x, p.y, rc * 0.95, 0, Math.PI * 2); C.core.fill(); }
      }

      // Compose: background, faint digits, photo.
      m.globalCompositeOperation = 'source-over'; m.globalAlpha = 1;
      m.fillStyle = CONFIG.background; m.fillRect(0, 0, W, H);
      m.globalAlpha = 0.3; m.drawImage(L.bin, 0, 0, W, H); m.globalAlpha = 1;
      m.drawImage(L.base, 0, 0, W, H);

      // Transition to the dark side (k1: right half, k2: left half).
      const k1 = smooth(this.pc / 0.3), k2 = smooth((this.pc - 0.32) / 0.2);
      const split = Math.round(this.geo().cx), left = Math.round(split * (1 - k2));
      const top = Math.round(H * (1 - k1));
      let clip = 'inset(' + (k1 > 0.001 ? Math.max(0, top) : H + 100) + 'px 0px 0px ' + left + 'px)';
      if (CONFIG.transition === 'tiles') {
        clip = k1 > 0.001 ? this.tiles(m, ((k1 + k2) / 2) * 1.12) : 'polygon(0px 0px, 0px 0px, 0px 0px)';
      } else if (k1 > 0.001) {
        m.save(); m.beginPath(); m.rect(left, top, W - left, H - top); m.clip(); m.drawImage(L.reveal, 0, 0, W, H); m.restore();
        const flick = 0.85 + Math.sin(t * 40) * 0.08 + Math.random() * 0.07;
        const ih = Math.min(1, k1 * 10, (1 - k1) * 10) * flick;
        if (ih > 0.01) this.laser(m, 'h', top, left, W, ih, t, Math.round(k1 * 100));
        const iv = Math.min(1, k2 * 10, (1 - k2) * 10) * flick;
        if (iv > 0.01) this.laser(m, 'v', left, 0, H, iv, t, Math.round(k2 * 100));
      }

      // Smoke trail: band of digits, hidden layer inside, faint digits on top.
      const tc = C.tmp;
      tc.globalCompositeOperation = 'source-over'; tc.clearRect(0, 0, W, H);
      tc.drawImage(L.dense, 0, 0, W, H);
      tc.globalCompositeOperation = 'destination-in'; tc.drawImage(L.edge, 0, 0, W, H);
      tc.globalCompositeOperation = 'source-over';
      m.drawImage(L.tmp, 0, 0, W, H);
      tc.clearRect(0, 0, W, H); tc.drawImage(L.reveal, 0, 0, W, H);
      tc.globalCompositeOperation = 'destination-in'; tc.drawImage(L.core, 0, 0, W, H);
      tc.globalCompositeOperation = 'source-over';
      m.drawImage(L.tmp, 0, 0, W, H);
      tc.clearRect(0, 0, W, H); tc.drawImage(L.dense, 0, 0, W, H);
      tc.globalCompositeOperation = 'destination-in'; tc.drawImage(L.core, 0, 0, W, H);
      tc.globalCompositeOperation = 'source-over';
      m.globalAlpha = 0.12; m.drawImage(L.tmp, 0, 0, W, H); m.globalAlpha = 1;

      this.updateDom(now, clip);
    }

    // ---------------- DOM that follows the scroll ----------------
    setVar(name, v) { if (this.prev[name] !== v) { this.prev[name] = v; this.wrap.style.setProperty(name, v); } }
    updateDom(now, clip) {
      // Header shrinks; the two titles fade in with the transition, hold, then fade out before the dissolve.
      this.setVar('--hs', (1 - 0.45 * Math.min(1, this.pc / 0.25)).toFixed(3));
      const tOp = clamp01(Math.min((this.pc - 0.12) / 0.15, 1 - (this.pc - 0.57) / 0.06));
      this.setVar('--tOp', tOp.toFixed(3));
      this.setVar('--tY', ((1 - tOp) * 40).toFixed(1));
      if (this.prev.clip !== clip) { this.prev.clip = clip; this.uiLight.style.clipPath = clip; }

      // Timeline
      const tl = +this.tlP.toFixed(4);
      if (this.prev.tl !== tl || this.prev.tlW !== this.w) {
        this.prev.tl = tl; this.prev.tlW = this.w;
        const W = this.w, tlX = W - tl * this.trackW, centre = W * 0.5;
        this.tl.el.style.opacity = tl > 0.0005 ? '1' : '0';
        this.tl.track.style.transform = 'translateX(' + tlX.toFixed(1) + 'px)';
        this.tl.fill.style.width = Math.max(0, Math.min(this.trackW - 740, centre - tlX - 600)) + 'px';
        this.tl.items.forEach((li, i) => {
          const left = this.tlStart + i * this.tlStep, up = i % 2 === 0;
          const v = clamp01((W * 0.92 - (tlX + left)) / (W * 0.3));
          li._card.style.opacity = v.toFixed(3);
          li._card.style.transform = 'translateY(' + ((1 - v) * (up ? 30 : -30)).toFixed(1) + 'px)';
          li._img.style.clipPath = 'inset(0 0 ' + ((1 - v) * 100).toFixed(1) + '% 0)';
          li._year.style.color = 'rgba(243,242,238,' + (0.15 + 0.75 * v).toFixed(3) + ')';
          li.classList.toggle('is-passed', tlX + left + 170 < centre);
        });
      }

      // Contact curtain
      const c = +this.ctP.toFixed(4);
      if (this.prev.ct !== c) {
        this.prev.ct = c;
        const ce = smooth(c), cin = clamp01((c - 0.55) / 0.45);
        this.ctEl.style.transform = 'translateY(' + ((1 - ce) * 112).toFixed(2) + '%)';
        this.ctEl.style.pointerEvents = c > 0.98 ? 'auto' : 'none';
        this.ctInner.style.opacity = cin.toFixed(3);
        this.ctInner.style.transform = 'translateY(' + ((1 - cin) * 40).toFixed(1) + 'px)';
      }

      // Progress rail
      const gp = +this.gp.toFixed(3);
      if (this.prev.gp !== gp) {
        this.prev.gp = gp;
        this.railFill.style.height = (gp * 100).toFixed(2) + '%';
        let active = 0; this.marks.forEach((mk, i) => { if (gp + 0.005 >= mk.at) active = i; });
        this.marks.forEach((mk, i) => { mk.el.classList.toggle('is-active', i === active); mk.el.classList.toggle('is-reached', i <= active); });
        this.scrollPct.textContent = String(Math.round(gp * 100)).padStart(3, '0') + '%';
        this.scrollLabel.textContent = gp < 0.01 ? 'Scroll' : gp > 0.995 ? 'Fin' : this.marks[active].el.textContent.trim();
      }

      this.updateBoot(now);

      // Reticle cursor, eased toward the pointer.
      const cx = this.curX == null ? -100 : this.curX, cy = this.curY == null ? -100 : this.curY;
      this.rcx = this.rcx == null ? cx : this.rcx + (cx - this.rcx) * 0.4;
      this.rcy = this.rcy == null ? cy : this.rcy + (cy - this.rcy) * 0.4;
      this.cur.style.transform = 'translate(' + this.rcx.toFixed(1) + 'px,' + this.rcy.toFixed(1) + 'px)';
      this.cur.style.opacity = this.curOn ? '1' : '0';
      this.ring.style.transform = 'scale(' + (this.curHover ? 1.7 : 1) + ')';

    }

    // ---------------- boot screen ----------------
    updateBoot(now) {
      const b = this.boot;
      if (!b.on) return;
      if (b.start == null) b.start = now;
      if (b.skip) { b.skip = false; if (now - b.start < 1900) b.start = now - 1900; }
      const bt = (now - b.start) / 1000;
      if (bt > 2.5) { b.on = false; b.el.hidden = true; return; }
      const lines = [['booting adrianoski.dev', ''], ['loading face mesh ........ ', '478 pts'], ['compiling creativity ..... ', 'ok'], ['linking engineering ...... ', 'ok'], ['rendering portrait ....... ', '100%']];
      const n = Math.max(0, Math.min(lines.length, Math.floor((bt - 0.1) / 0.3) + 1));
      while (b.shown < n) {
        const [txt, res] = lines[b.shown++];
        const row = document.createElement('div');
        const p = document.createElement('span'); p.className = 'boot-c'; p.textContent = '> ';
        const r = document.createElement('span'); r.className = 'boot-c'; r.textContent = res;
        row.append(p, document.createTextNode(txt), r);
        b.lines.appendChild(row);
      }
      const pct = Math.round(clamp01((bt - 0.1) / 1.6) * 100);
      b.fill.style.width = pct + '%';
      b.pct.textContent = String(pct).padStart(3, '0') + '%';
      b.el.style.clipPath = 'inset(0 0 ' + (smooth((bt - 1.9) / 0.55) * 100).toFixed(1) + '% 0)';
    }
    restartBoot() {
      const b = this.boot;
      b.lines.textContent = ''; b.shown = 0; b.start = null; b.skip = false; b.on = true;
      b.el.style.clipPath = 'inset(0 0 0 0)'; b.el.hidden = false;
    }

    // ---------------- navigation ----------------
    scrollToVh(n) {
      const top = this.outer.getBoundingClientRect().top + window.scrollY + n * this.wrap.clientHeight;
      window.scrollTo({ top, behavior: reduceMotion ? 'auto' : 'smooth' });
    }

    // ---------------- command palette ----------------
    commands() {
      return [
        { label: 'Ir al inicio', hint: 'Navegar', act: () => this.scrollToVh(0) },
        { label: 'Ver el escaneo', hint: 'Navegar', act: () => this.scrollToVh(2.2) },
        { label: 'Ir a la trayectoria', hint: 'Navegar', act: () => this.scrollToVh(5.5) },
        { label: 'Ir a contacto', hint: 'Navegar', act: () => this.scrollToVh(CONFIG.END) },
        { label: 'Copiar email', hint: 'Acción', act: () => this.copyEmail() },
        { label: 'Escribirme un email', hint: 'Acción', act: () => { window.location.href = 'mailto:' + CONFIG.email; } },
        { label: 'Alternar capa oculta (código / robot)', hint: 'Efecto', act: () => { this.layerAlt = this.currentLayer() === 'codigo' ? 'robot' : 'codigo'; } },
        { label: 'Repetir la intro', hint: 'Efecto', act: () => this.restartBoot() }
      ];
    }
    openPal() {
      this.pal.open = true; this.pal.el.hidden = false;
      this.pal.input.value = ''; this.pal.sel = 0; this.renderCmds();
      this.pal.input.focus();
    }
    closePal() {
      this.pal.open = false; this.pal.el.hidden = true;
      this.outer.focus({ preventScroll: true });
    }
    renderCmds() {
      const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
      const q = norm(this.pal.input.value.trim());
      this.pal.items = this.commands().filter((c) => !q || norm(c.label).includes(q));
      this.pal.list.textContent = '';
      this.pal.items.forEach((c, i) => {
        const li = document.createElement('li');
        const btn = document.createElement('button');
        btn.type = 'button'; btn.className = 'pal-item';
        const l = document.createElement('span'); l.textContent = c.label;
        const h = document.createElement('span'); h.className = 'pal-hint'; h.textContent = c.hint;
        btn.append(l, h);
        btn.addEventListener('click', () => this.runCmd(c));
        btn.addEventListener('mouseenter', () => { this.pal.sel = i; this.paintSel(); });
        li.appendChild(btn); this.pal.list.appendChild(li);
      });
      this.pal.empty.hidden = this.pal.items.length > 0;
      this.paintSel();
    }
    paintSel() { $$('.pal-item', this.pal.list).forEach((b, i) => b.classList.toggle('is-sel', i === this.pal.sel)); }
    runCmd(c) { this.closePal(); setTimeout(() => c.act(), 40); }
    copyEmail() {
      const ok = () => this.toast('Email copiado'), fail = () => this.toast('No se pudo copiar');
      try { navigator.clipboard.writeText(CONFIG.email).then(ok, fail); } catch (e) { fail(); }
    }
    toast(msg) {
      this.toastEl.textContent = msg; this.toastEl.hidden = false;
      clearTimeout(this.toastT); this.toastT = setTimeout(() => { this.toastEl.hidden = true; }, 1800);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => new Story());
  else new Story();
})();
