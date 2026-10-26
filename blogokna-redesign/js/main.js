(function () {
  'use strict';

  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => Array.from(root.querySelectorAll(s));
  const root = document.documentElement;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced) root.classList.add('reduced');

  const gsap = window.gsap;
  const ScrollTrigger = window.ScrollTrigger;
  gsap.registerPlugin(ScrollTrigger);
  gsap.defaults({ ease: 'power3.out' });

  const isDesktop = () => matchMedia('(min-width: 901px)').matches;

  /* ------------------------------------------------------------ */
  /* Smooth scroll                                                */
  /* ------------------------------------------------------------ */

  let lenis = null;
  if (!reduced && window.Lenis) {
    lenis = new window.Lenis({ lerp: 0.095, smoothWheel: true, wheelMultiplier: 0.95 });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((t) => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
  }

  function scrollToTarget(target, done) {
    const el = typeof target === 'string' ? (target === '#top' ? 0 : $(target)) : target;
    if (el === null) return;
    if (lenis) {
      lenis.scrollTo(el, { duration: 1.6, easing: (t) => 1 - Math.pow(1 - t, 4), onComplete: done });
    } else {
      const y = el === 0 ? 0 : el.getBoundingClientRect().top + scrollY;
      scrollTo({ top: y, behavior: reduced ? 'auto' : 'smooth' });
      if (done) setTimeout(done, reduced ? 0 : 700);
    }
  }

  // Works for links in the header, menu, hero and footer.
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[data-scroll]');
    if (!a) return;
    const href = a.getAttribute('href');
    if (!href || !href.startsWith('#')) return;
    e.preventDefault();
    const wasOpen = menu.isOpen;
    if (wasOpen) menu.close(false);
    setTimeout(() => scrollToTarget(href), wasOpen ? 450 : 0);
  });

  $('[data-scroll-top]').addEventListener('click', () => scrollToTarget('#top'));

  /* ------------------------------------------------------------ */
  /* Header                                                       */
  /* ------------------------------------------------------------ */

  const header = $('[data-header]');
  let lastY = 0;
  function onScrollHeader() {
    const y = scrollY;
    header.classList.toggle('is-solid', y > innerHeight * 0.6);
    const goingDown = y > lastY + 2;
    const goingUp = y < lastY - 2;
    if (goingDown && y > innerHeight) header.classList.add('is-hidden');
    else if (goingUp || y < innerHeight) header.classList.remove('is-hidden');
    lastY = y;
  }
  addEventListener('scroll', onScrollHeader, { passive: true });

  /* ------------------------------------------------------------ */
  /* Menu                                                         */
  /* ------------------------------------------------------------ */

  const menuEl = $('[data-menu]');
  const menuBtn = $('[data-menu-toggle]');
  const menu = {
    isOpen: false,
    open() {
      this.isOpen = true;
      menuEl.classList.add('is-open');
      menuEl.setAttribute('aria-hidden', 'false');
      menuBtn.setAttribute('aria-expanded', 'true');
      menuBtn.querySelector('.menu-btn__label').textContent = 'Закрыть';
      document.body.classList.add('menu-open');
      header.classList.remove('is-hidden');
      lenis ? lenis.stop() : document.body.classList.add('is-locked');
      setTimeout(() => $('a', menuEl).focus({ preventScroll: true }), 400);
    },
    close(returnFocus = true) {
      this.isOpen = false;
      menuEl.classList.remove('is-open');
      menuEl.setAttribute('aria-hidden', 'true');
      menuBtn.setAttribute('aria-expanded', 'false');
      menuBtn.querySelector('.menu-btn__label').textContent = 'Меню';
      document.body.classList.remove('menu-open');
      lenis ? lenis.start() : document.body.classList.remove('is-locked');
      if (returnFocus) menuBtn.focus({ preventScroll: true });
    },
  };
  menuEl.inert = true;
  menuBtn.addEventListener('click', () => {
    menu.isOpen ? menu.close() : menu.open();
    menuEl.inert = !menu.isOpen;
  });
  const syncInert = new MutationObserver(() => (menuEl.inert = !menu.isOpen));
  syncInert.observe(menuEl, { attributes: true, attributeFilter: ['class'] });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && menu.isOpen) menu.close();
  });

  /* ------------------------------------------------------------ */
  /* Hero: 4K scene behind rain glass                             */
  /* ------------------------------------------------------------ */

  const heroEl = $('.hero');
  const media = $('[data-hero-media]');
  const scene = $('.hero__poster');

  // Pick the smallest image that stays sharp at the start of the pull-back
  // (zoom 1.35) on this screen.
  {
    const coarse = matchMedia('(pointer: coarse)').matches;
    const dpr = Math.min(devicePixelRatio || 1, coarse || innerWidth < 820 ? 1.5 : 2);
    const need = Math.max(innerWidth, (innerHeight * 16) / 9) * dpr * 1.2;
    const size = need > 2600 ? 3840 : need > 1700 ? 2560 : 1600;
    scene.src = scene.dataset['src-' + size] || scene.getAttribute(`data-src-${size}`);
  }

  const rain = new window.RainGlass({
    canvas: $('.hero__glass'),
    image: scene,
    reducedMotion: reduced,
  });

  let heroVisible = true;
  new IntersectionObserver(([entry]) => {
    heroVisible = entry.isIntersecting;
    if (heroVisible && !document.hidden) rain.start();
    else rain.stop();
  }, { threshold: 0 }).observe(heroEl);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) rain.stop();
    else if (heroVisible) rain.start();
  });

  // Glass parallax: the scene behind the glass shifts, the drops don't.
  if (!reduced && matchMedia('(pointer: fine)').matches) {
    const target = { x: 0, y: 0 };
    const cur = { x: 0, y: 0 };
    heroEl.addEventListener('pointermove', (e) => {
      target.x = (e.clientX / innerWidth - 0.5) * 2;
      target.y = (e.clientY / innerHeight - 0.5) * -2;
    });
    heroEl.addEventListener('pointerleave', () => { target.x = target.y = 0; });
    gsap.ticker.add(() => {
      if (!heroVisible) return;
      cur.x += (target.x - cur.x) * 0.04;
      cur.y += (target.y - cur.y) * 0.04;
      rain.setParallax(cur.x, cur.y);
    });
  }

  /* ------------------------------------------------------------ */
  /* Loader → intro                                               */
  /* ------------------------------------------------------------ */

  const loader = $('.loader');
  const loaderBar = $('.loader__bar span');
  const glass = { a: 0 };

  function waitFor(promises, timeout) {
    let done = 0;
    const total = promises.length;
    const step = () => gsap.to(loaderBar, { scaleX: ++done / total, duration: 0.5, ease: 'power2.out' });
    return Promise.race([
      Promise.all(promises.map((p) => p.then(step, step))),
      new Promise((r) => setTimeout(r, timeout)),
    ]);
  }

  const sceneReady = (scene.decode ? scene.decode() : Promise.resolve()).catch(() => new Promise((r) => {
    if (scene.complete) return r();
    scene.addEventListener('load', r, { once: true });
    scene.addEventListener('error', r, { once: true });
  }));
  const fontsReady = document.fonts ? document.fonts.ready : Promise.resolve();

  waitFor([sceneReady, fontsReady], 4000).then(intro);

  const camera = { z: 1.35 };

  function intro() {
    rain.start();
    const titleLines = $$('.hero__title .line__in');
    const fades = $$('[data-hero-fade]');
    const frame = $('.hero__frame-rect');
    const mullV = $('.hero__mullion--v');
    const mullH = $('.hero__mullion--h');

    if (reduced) {
      gsap.to(loader, { autoAlpha: 0, duration: 0.3 });
      rain.setDolly(1);
      rain.setAlpha(1);
      return;
    }
    rain.setDolly(camera.z);

    const lf = $('.loader__frame').getBoundingClientRect();
    gsap.set(titleLines, { yPercent: 110 });
    gsap.set(fades, { autoAlpha: 0, y: 24 });
    gsap.set(header, { yPercent: -100, autoAlpha: 0 });
    gsap.set(frame, { width: lf.width, height: lf.height, opacity: 1 });
    gsap.set([mullV], { scaleY: 0 });
    gsap.set([mullH], { scaleX: 0 });

    const tl = gsap.timeline({ defaults: { ease: 'expo.out' } });
    tl.to('.loader__bar', { autoAlpha: 0, duration: 0.4, ease: 'power2.out' })
      .to('.loader__frame', { autoAlpha: 0, duration: 0.01 }, '<0.2')
      .to(loader, { backgroundColor: 'rgba(10,11,13,0)', duration: 0.01 }, '<')
      // The loader's tiny window frame becomes the whole screen.
      .to(frame, { width: '100%', height: '100%', duration: 1.8, ease: 'expo.inOut' }, '<')
      .to(glass, { a: 1, duration: 2.2, ease: 'power2.inOut', onUpdate: () => rain.setAlpha(glass.a) }, '<0.3')
      // Camera pulls back from the house — one long, decelerating move.
      // (Separate tween so it doesn't stretch the intro timeline.)
      .add(() => gsap.to(camera, { z: 1, duration: 11, ease: 'power3.out', onUpdate: () => rain.setDolly(camera.z) }), '<')
      .set(loader, { autoAlpha: 0 })
      .to(mullV, { scaleY: 1, duration: 1.4, ease: 'expo.inOut' }, '-=0.9')
      .to(mullH, { scaleX: 1, duration: 1.2, ease: 'expo.inOut' }, '-=0.9')
      .to(titleLines, { yPercent: 0, duration: 1.6, stagger: 0.12 }, '-=1.4')
      .to(fades, { autoAlpha: 1, y: 0, duration: 1.2, stagger: 0.1 }, '-=1.2')
      .to(header, { yPercent: 0, autoAlpha: 1, duration: 1.2 }, '-=1.2')
      .add(() => {
        gsap.set(frame, { clearProps: 'width,height' });
        gsap.set(header, { clearProps: 'transform,opacity,visibility' });
      });
  }

  // Leaving the hero: content lifts, the scene pushes in behind the glass.
  if (!reduced) {
    gsap.timeline({
      scrollTrigger: { trigger: heroEl, start: 'top top', end: 'bottom top', scrub: true,
        onUpdate: (st) => rain.setScroll(st.progress) },
    })
      .to('.hero__content', { yPercent: -18, autoAlpha: 0, ease: 'none' }, 0)
      .to(media, { yPercent: 22, ease: 'none' }, 0)
      .to('.hero__frame', { scale: 1.06, autoAlpha: 0, ease: 'none' }, 0);
  }

  /* ------------------------------------------------------------ */
  /* Generic reveals                                              */
  /* ------------------------------------------------------------ */

  if (!reduced) {
    $$('[data-split]').forEach((title) => {
      const lines = $$('.line__in', title);
      gsap.set(lines, { yPercent: 110 });
      ScrollTrigger.create({
        trigger: title, start: 'top 85%', once: true,
        onEnter: () => gsap.to(lines, { yPercent: 0, duration: 1.4, stagger: 0.1, ease: 'expo.out' }),
      });
    });

    ScrollTrigger.batch('[data-reveal]', {
      start: 'top 90%',
      once: true,
      onEnter: (els) => gsap.to(els, { autoAlpha: 1, y: 0, duration: 1.1, stagger: 0.08 }),
    });
  }

  // Manifest: words light up as you read.
  const manifest = $('[data-words]');
  {
    const text = manifest.textContent.replace(/[ \t\n\r]+/g, ' ').trim();
    manifest.innerHTML = text.split(' ').map((w) => `<span class="w">${w}</span>`).join(' ');
    const words = $$('.w', manifest);
    if (reduced) words.forEach((w) => w.classList.add('is-on'));
    else {
      ScrollTrigger.create({
        trigger: manifest, start: 'top 80%', end: 'bottom 45%', scrub: true,
        onUpdate: (st) => {
          const n = Math.round(st.progress * words.length);
          words.forEach((w, i) => w.classList.toggle('is-on', i < n));
        },
      });
    }
  }

  // Counters
  $$('[data-count]').forEach((el) => {
    const to = Number(el.dataset.count);
    if (reduced) return;
    const o = { v: 0 };
    el.textContent = '0';
    ScrollTrigger.create({
      trigger: el, start: 'top 90%', once: true,
      onEnter: () => gsap.to(o, { v: to, duration: 2, ease: 'power3.out', onUpdate: () => (el.textContent = Math.round(o.v)) }),
    });
  });

  /* ------------------------------------------------------------ */
  /* Stroke drawing helper                                        */
  /* ------------------------------------------------------------ */

  function prepDraw(el) {
    let len = 0;
    try { len = el.getTotalLength(); } catch (e) { len = 0; }
    if (!len) {
      el.setAttribute('pathLength', '1');
      len = 1;
    }
    el.style.strokeDasharray = `${len} ${len}`;
    el.style.strokeDashoffset = len;
    return len;
  }

  /* ------------------------------------------------------------ */
  /* Services                                                     */
  /* ------------------------------------------------------------ */

  // Mosquito-net mesh lines
  {
    const g = $('.art-mesh .mesh-lines');
    const ns = 'http://www.w3.org/2000/svg';
    for (let x = 26; x < 140; x += 6) {
      const l = document.createElementNS(ns, 'line');
      l.setAttribute('x1', x); l.setAttribute('x2', x);
      l.setAttribute('y1', 20); l.setAttribute('y2', 140);
      g.appendChild(l);
    }
  }

  if (!reduced) {
    $$('.svc').forEach((card) => {
      const box = $('.svc__media, .svc__art', card);
      const body = $('.svc__body', card);
      gsap.set(box, { clipPath: 'inset(100% 0% 0% 0%)' });
      gsap.set(body, { autoAlpha: 0, y: 20 });
      ScrollTrigger.create({
        trigger: card, start: 'top 88%', once: true,
        onEnter: () => {
          gsap.to(box, { clipPath: 'inset(0% 0% 0% 0%)', duration: 1.5, ease: 'expo.inOut' });
          gsap.to(body, { autoAlpha: 1, y: 0, duration: 1.1, delay: 0.5 });
        },
      });
    });

    // Gentle asymmetric drift
    const mm = gsap.matchMedia();
    mm.add('(min-width: 901px)', () => {
      [['.svc--b', -40], ['.svc--d', -30], ['.svc--e', 40]].forEach(([s, y]) => {
        gsap.fromTo(s, { y: -y / 2 }, { y, ease: 'none', scrollTrigger: { trigger: s, start: 'top bottom', end: 'bottom top', scrub: true } });
      });
    });
  }

  const svcToCalc = {
    house: { type: 'house' },
    flat: { type: 'flat' },
    silent: { type: 'flat', profile: 'silent' },
    repair: { type: 'repair' },
    nets: { type: 'nets' },
    paint: { type: 'paint' },
  };
  $$('.svc').forEach((card) => {
    card.addEventListener('click', () => {
      const cfg = svcToCalc[card.dataset.service];
      calc.select(cfg.type, cfg.profile);
      scrollToTarget('#calc');
    });
  });

  /* ------------------------------------------------------------ */
  /* Projects: blueprint → photograph                             */
  /* ------------------------------------------------------------ */

  const bp = $('[data-blueprint]');
  if (!reduced) {
    const sticky = $('.blueprint__sticky', bp);
    const photo = $('.blueprint__photo', bp);
    const img = $('img', photo);
    const svg = $('.blueprint__lines', bp);
    const house = $$('.bp-house path', bp);
    const dims = $$('.bp-dims path', bp);
    const guides = $('.bp-guides', bp);

    house.concat(dims).forEach(prepDraw);
    gsap.set(guides, { autoAlpha: 0 });

    // Window rect in screen space. Landscape: wide viewBox, "slice"-fitted,
    // the house sits below the caption. Portrait: tight crop around the
    // house, "meet"-fitted, so it fills a phone screen's width.
    const VB_WIDE = { x: -200, y: -150, w: 1400, h: 850 };
    const VB_TALL = { x: 150, y: 150, w: 960, h: 500 };
    const WIN = { x1: 560, y1: 210, x2: 960, y2: 500 };
    const winRect = () => {
      const W = sticky.clientWidth;
      const H = sticky.clientHeight;
      const slice = W / H >= 1;
      const VB = slice ? VB_WIDE : VB_TALL;
      svg.setAttribute('viewBox', `${VB.x} ${VB.y} ${VB.w} ${VB.h}`);
      svg.setAttribute('preserveAspectRatio', slice ? 'xMidYMid slice' : 'xMidYMid meet');
      const k = slice ? Math.max(W / VB.w, H / VB.h) : Math.min(W / VB.w, H / VB.h);
      const ox = (W - VB.w * k) / 2 - VB.x * k;
      const oy = (H - VB.h * k) / 2 - VB.y * k;
      return { W, H, l: ox + WIN.x1 * k, t: oy + WIN.y1 * k, r: ox + WIN.x2 * k, b: oy + WIN.y2 * k };
    };
    winRect();
    const winInset = () => {
      const r = winRect();
      return `inset(${r.t}px ${r.W - r.r}px ${r.H - r.b}px ${r.l}px)`;
    };
    const winOrigin = () => {
      const r = winRect();
      return `${(r.l + r.r) / 2}px ${(r.t + r.b) / 2}px`;
    };

    const tl = gsap.timeline({
      defaults: { ease: 'none' },
      scrollTrigger: { trigger: bp, start: 'top top', end: 'bottom bottom', scrub: 0.8, invalidateOnRefresh: true },
    });
    tl.to(guides, { autoAlpha: 1, duration: 0.08 }, 0)
      .to(house, { strokeDashoffset: 0, duration: 0.3, stagger: 0.03, ease: 'power1.inOut' }, 0.02)
      .to(dims, { strokeDashoffset: 0, duration: 0.12, stagger: 0.04 }, 0.24)
      .fromTo(photo, { clipPath: winInset, autoAlpha: 0 }, { clipPath: winInset, autoAlpha: 1, duration: 0.08, immediateRender: false }, 0.42)
      .to(photo, { clipPath: 'inset(0px 0px 0px 0px)', duration: 0.38, ease: 'power2.inOut' }, 0.52)
      .fromTo(img, { scale: 1.25 }, { scale: 1, duration: 0.46, ease: 'power2.out' }, 0.46)
      // Fly through the window: 2D drawing scales away around the glass.
      .fromTo(svg, { scale: 1, transformOrigin: winOrigin }, { scale: 2.6, autoAlpha: 0, transformOrigin: winOrigin, duration: 0.38, ease: 'power2.in' }, 0.52);

    const capLines = $$('.blueprint__caption .line__in', bp);
    gsap.set(capLines, { yPercent: 110 });
    ScrollTrigger.create({
      trigger: bp, start: 'top 60%', once: true,
      onEnter: () => gsap.to(capLines, { yPercent: 0, duration: 1.4, stagger: 0.1, ease: 'expo.out' }),
    });
  }

  /* ------------------------------------------------------------ */
  /* Projects: horizontal gallery                                 */
  /* ------------------------------------------------------------ */

  const gallery = $('[data-gallery]');
  const track = $('[data-gallery-track]');
  if (!reduced) {
    const mm = gsap.matchMedia();
    mm.add('(min-width: 901px)', () => {
      gallery.style.height = '100vh';
      gallery.style.display = 'flex';
      gallery.style.alignItems = 'center';
      gallery.style.padding = '0';
      const dist = () => Math.max(0, track.scrollWidth - innerWidth);
      const move = gsap.to(track, {
        x: () => -dist(),
        ease: 'none',
        scrollTrigger: { trigger: gallery, start: 'top top', end: () => '+=' + dist(), pin: true, scrub: 0.8, invalidateOnRefresh: true, anticipatePin: 1 },
      });
      $$('.shot', track).forEach((shot) => {
        gsap.fromTo($('img', shot), { xPercent: -5 }, {
          xPercent: 5, ease: 'none',
          scrollTrigger: { trigger: shot, containerAnimation: move, start: 'left right', end: 'right left', scrub: true },
        });
        gsap.from($('figcaption', shot), {
          autoAlpha: 0, y: 16, duration: 1,
          scrollTrigger: { trigger: shot, containerAnimation: move, start: 'left 85%', toggleActions: 'play none none reverse' },
        });
      });
      return () => {
        gallery.removeAttribute('style');
      };
    });
    mm.add('(max-width: 900px)', () => {
      $$('.shot', track).forEach((shot) => {
        gsap.from(shot, { autoAlpha: 0, y: 40, duration: 1.1, scrollTrigger: { trigger: shot, start: 'top 88%', once: true } });
      });
    });
  }

  /* ------------------------------------------------------------ */
  /* Calculator (demo coefficients)                               */
  /* ------------------------------------------------------------ */

  const calcEl = $('[data-calc]');
  const fmt = (n) => Math.round(n).toLocaleString('ru-RU');

  const TYPES = {
    flat:    { label: 'Квартира',          glazing: true,  area: [2, 60, 10],  count: [1, 12, 3], countLabel: 'Количество окон',   base: 15000, shape: 'window' },
    balcony: { label: 'Балкон / лоджия',   glazing: true,  area: [2, 30, 6],   count: [2, 10, 4], countLabel: 'Количество створок', base: 13000, shape: 'strip' },
    house:   { label: 'Загородный дом',    glazing: true,  area: [10, 120, 36], count: [2, 30, 10], countLabel: 'Количество окон',   base: 21000, shape: 'panorama' },
    terrace: { label: 'Терраса / веранда', glazing: true,  area: [6, 80, 20],  count: [2, 16, 6], countLabel: 'Количество секций', base: 17000, shape: 'panorama' },
    repair:  { label: 'Ремонт окон',       glazing: false, count: [1, 20, 3], countLabel: 'Окон в работе',      unit: 4500, shape: 'repair' },
    nets:    { label: 'Москитные сетки',   glazing: false, count: [1, 20, 3], countLabel: 'Количество сеток',   unit: 3800, shape: 'nets' },
    paint:   { label: 'Покраска окон',     glazing: false, count: [1, 20, 3], countLabel: 'Окон для покраски',  unit: 6000, shape: 'paint' },
  };
  const PROFILES = {
    std: { label: 'Стандарт', k: 1, stroke: 2 },
    warm: { label: 'Тёплое', k: 1.18, stroke: 3 },
    silent: { label: 'Шумоподавление', k: 1.36, stroke: 4 },
  };
  const OPTIONS = { dismantle: 'Демонтаж', sills: 'Подоконники и откосы', nets: 'Москитные сетки' };

  const ui = {
    types: $$('input[name="type"]', calcEl),
    profiles: $$('input[name="profile"]', calcEl),
    opts: $$('input[name="opt"]', calcEl),
    area: $('[data-calc-area]', calcEl),
    areaOut: $('[data-calc-area-out]', calcEl),
    areaField: $('[data-calc-area-field]', calcEl),
    profileField: $('[data-calc-profile-field]', calcEl),
    optsField: $('[data-calc-options-field]', calcEl),
    count: $('[data-calc-count]', calcEl),
    countLabel: $('#calc-count-label'),
    steps: $$('[data-step]', calcEl),
    scale: $('.range__scale', calcEl),
    thumb: $('.seg__thumb', calcEl),
    scheme: $('[data-scheme]', calcEl),
    summary: $('[data-calc-summary]', calcEl),
    total: $('[data-calc-total]', calcEl),
    bars: $('[data-calc-bars]', calcEl),
  };

  const state = { type: 'flat', area: 10, count: 3, profile: 'std', opts: new Set() };
  const shown = { total: 0 };

  function compute() {
    const t = TYPES[state.type];
    let construct, install, options = 0;
    if (t.glazing) {
      construct = state.area * t.base * PROFILES[state.profile].k;
      install = construct * 0.16 + state.count * 1500;
      if (state.opts.has('dismantle')) options += state.area * 1100;
      if (state.opts.has('sills')) options += state.count * 3200;
      if (state.opts.has('nets')) options += state.count * 3400;
    } else {
      construct = state.count * t.unit;
      install = 2500 + state.count * 600;
    }
    const total = Math.round((construct + install + options) / 1000) * 1000;
    return { construct, install, options, total };
  }

  function renderScheme(animate) {
    const t = TYPES[state.type];
    const p = PROFILES[t.glazing ? state.profile : 'std'];
    const box = { window: [100, 22, 200, 170], strip: [24, 62, 352, 110], panorama: [24, 22, 352, 170] }[t.shape] || [110, 22, 180, 170];
    const [x, y, w, h] = box;
    const n = t.glazing ? Math.min(state.count, t.shape === 'window' ? 4 : 8) : 2;
    const pw = w / n;
    let s = '';

    s += `<rect class="s-frame" x="${x}" y="${y}" width="${w}" height="${h}" stroke-width="${p.stroke}" ${t.shape === 'paint' ? 'style="fill:rgba(95,139,181,.35)"' : ''}/>`;
    for (let i = 0; i < n; i++) {
      const px = x + i * pw;
      const g = 8 + p.stroke;
      s += `<rect class="s-glass" x="${px + g}" y="${y + g}" width="${pw - g * 2}" height="${h - g * 2}"/>`;
      if (p === PROFILES.silent) s += `<rect class="s-glass" x="${px + g + 4}" y="${y + g + 4}" width="${pw - g * 2 - 8}" height="${h - g * 2 - 8}" style="fill:none"/>`;
      if (i > 0) s += `<line class="s-frame" x1="${px}" y1="${y}" x2="${px}" y2="${y + h}" stroke-width="${p.stroke}"/>`;
      // Opening sash: architectural convention (apex on the handle side)
      if (i % 2 === 0 && pw > 30) {
        const hx = i === n - 1 && n > 1 ? px + g : px + pw - g;
        const bx = hx === px + g ? px + pw - g : px + g;
        s += `<path class="s-open" d="M${bx} ${y + g} L${hx} ${y + h / 2} L${bx} ${y + h - g}"/>`;
      }
      const showNet = t.shape === 'nets' ? i === 0 : t.glazing && state.opts.has('nets') && i % 2 === 0;
      if (showNet) {
        for (let k = px + g + 4; k < px + pw - g; k += 5) s += `<line class="s-net" x1="${k}" y1="${y + g}" x2="${k}" y2="${y + h - g}"/>`;
      }
      if (t.shape === 'repair' && i === 0) {
        s += `<circle class="s-dim" cx="${px + pw - g - 6}" cy="${y + h / 2}" r="8"/><circle class="s-dim" cx="${px + g + 4}" cy="${y + g + 14}" r="5"/><circle class="s-dim" cx="${px + g + 4}" cy="${y + h - g - 14}" r="5"/>`;
      }
    }
    s += `<path class="s-glint" d="M${x + 22} ${y + 54} l22 -22 M${x + 22} ${y + 70} l34 -34"/>`;
    if (t.glazing && state.opts.has('sills')) s += `<rect class="s-frame" x="${x - 8}" y="${y + h}" width="${w + 16}" height="6" stroke-width="1"/>`;

    const dy = y + h + 26;
    const label = t.glazing ? `${state.area} м²` : `${state.count} шт.`;
    s += `<path class="s-dim" d="M${x} ${dy} H${x + w} M${x} ${dy - 5} V${dy + 5} M${x + w} ${dy - 5} V${dy + 5}"/>`;
    s += `<rect x="${x + w / 2 - 34}" y="${dy - 9}" width="68" height="18" fill="#0f1114"/>`;
    s += `<text class="s-txt" x="${x + w / 2}" y="${dy + 4}" text-anchor="middle" data-scheme-label>${label}</text>`;

    ui.scheme.innerHTML = s;
    if (animate && !reduced) {
      gsap.from(ui.scheme.querySelectorAll('.s-glass, .s-open, .s-net, .s-glint'), { opacity: 0, duration: 0.6, stagger: 0.015, ease: 'power2.out' });
      gsap.from(ui.scheme.querySelectorAll('.s-frame'), { opacity: 0.2, duration: 0.5 });
    }
  }

  function render(structural) {
    const t = TYPES[state.type];
    ui.areaField.hidden = !t.glazing;
    ui.profileField.hidden = !t.glazing;
    ui.optsField.hidden = !t.glazing;
    ui.countLabel.textContent = t.countLabel;

    if (t.glazing) {
      ui.area.min = t.area[0];
      ui.area.max = t.area[1];
      ui.area.value = state.area;
      const pct = ((state.area - t.area[0]) / (t.area[1] - t.area[0])) * 100;
      ui.area.style.setProperty('--p', pct + '%');
      ui.areaOut.textContent = `${state.area} м²`;
      const mid1 = Math.round(t.area[0] + (t.area[1] - t.area[0]) / 3);
      const mid2 = Math.round(t.area[0] + ((t.area[1] - t.area[0]) * 2) / 3);
      ui.scale.innerHTML = `<span>${t.area[0]}</span><span>${mid1}</span><span>${mid2}</span><span>${t.area[1]} м²</span>`;
    }

    ui.count.textContent = state.count;
    ui.steps[0].disabled = state.count <= t.count[0];
    ui.steps[1].disabled = state.count >= t.count[1];

    const pi = Object.keys(PROFILES).indexOf(state.profile);
    ui.thumb.style.transform = `translateX(${pi * 100}%)`;

    if (structural) renderScheme(true);
    else {
      const l = ui.scheme.querySelector('[data-scheme-label]');
      if (l) l.textContent = t.glazing ? `${state.area} м²` : `${state.count} шт.`;
    }

    const rows = [['Тип', t.label]];
    if (t.glazing) rows.push(['Площадь', `${state.area} м²`]);
    rows.push([t.countLabel, String(state.count)]);
    if (t.glazing) {
      rows.push(['Решение', PROFILES[state.profile].label]);
      rows.push(['Опции', state.opts.size ? [...state.opts].map((o) => OPTIONS[o]).join(', ') : '—']);
    }
    ui.summary.innerHTML = rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');

    const r = compute();
    const parts = t.glazing
      ? [['Конструкции', r.construct], ['Монтаж', r.install], ['Опции', r.options]]
      : [['Работы', r.construct], ['Выезд и материалы', r.install]];
    const sum = parts.reduce((a, [, v]) => a + v, 0) || 1;
    ui.bars.innerHTML = parts.map(([k, v]) => {
      const pct = Math.round((v / sum) * 100);
      return `<div class="bar"><span>${k}</span><span class="bar__track"><span class="bar__fill" style="width:${pct}%"></span></span><span class="bar__pct">${pct}%</span></div>`;
    }).join('');

    if (reduced) ui.total.textContent = fmt(r.total);
    else gsap.to(shown, { total: r.total, duration: 0.9, ease: 'power3.out', overwrite: true, onUpdate: () => (ui.total.textContent = fmt(shown.total)) });
  }

  const calc = {
    select(type, profile) {
      const t = TYPES[type];
      state.type = type;
      if (t.area) state.area = t.area[2];
      state.count = t.count[2];
      if (profile) state.profile = profile;
      ui.types.forEach((i) => (i.checked = i.value === type));
      ui.profiles.forEach((i) => (i.checked = i.value === state.profile));
      render(true);
    },
  };

  ui.types.forEach((i) => i.addEventListener('change', () => calc.select(i.value)));
  ui.profiles.forEach((i) => i.addEventListener('change', () => { state.profile = i.value; render(true); }));
  ui.opts.forEach((i) => i.addEventListener('change', () => {
    i.checked ? state.opts.add(i.value) : state.opts.delete(i.value);
    render(true);
  }));
  ui.area.addEventListener('input', () => { state.area = Number(ui.area.value); render(false); });
  ui.steps.forEach((b) => b.addEventListener('click', () => {
    const t = TYPES[state.type];
    state.count = Math.min(t.count[1], Math.max(t.count[0], state.count + Number(b.dataset.step)));
    render(true);
  }));

  $('[data-calc-request]').addEventListener('click', () => {
    const t = TYPES[state.type];
    const parts = [`Расчёт: ${t.label}`];
    if (t.glazing) parts.push(`${state.area} м²`);
    parts.push(`${t.countLabel.toLowerCase()}: ${state.count}`);
    if (t.glazing) {
      parts.push(PROFILES[state.profile].label.toLowerCase());
      if (state.opts.size) parts.push([...state.opts].map((o) => OPTIONS[o].toLowerCase()).join(', '));
    }
    const comment = $('#f-comment');
    comment.value = parts.join(', ') + '.';
    comment.dispatchEvent(new Event('input'));
    if (!formEl.hidden) {
      scrollToTarget('#contact', () => $('#f-name').focus({ preventScroll: true }));
    } else {
      resetForm();
      comment.value = parts.join(', ') + '.';
      comment.dispatchEvent(new Event('input'));
      scrollToTarget('#contact');
    }
  });

  calc.select('flat');

  /* ------------------------------------------------------------ */
  /* Process                                                      */
  /* ------------------------------------------------------------ */

  const stepsEl = $('[data-steps]');
  if (!reduced) {
    const rail = $('.steps__rail span', stepsEl);
    const mm = gsap.matchMedia();
    mm.add('(min-width: 901px)', () => {
      gsap.fromTo(rail, { scaleX: 0 }, { scaleX: 1, ease: 'none', scrollTrigger: { trigger: stepsEl, start: 'top 75%', end: 'bottom 55%', scrub: true } });
    });
    mm.add('(max-width: 900px)', () => {
      gsap.fromTo(rail, { scaleY: 0 }, { scaleY: 1, ease: 'none', scrollTrigger: { trigger: stepsEl, start: 'top 70%', end: 'bottom 60%', scrub: true } });
    });

    $$('.step', stepsEl).forEach((step, i) => {
      const parts = $$('.g', step);
      parts.forEach(prepDraw);
      const text = $$('.step__idx, .step__title, .step__text', step);
      gsap.set(text, { autoAlpha: 0, y: 18 });
      const tl = gsap.timeline({ paused: true });
      // Each glyph redraws the previous one, then adds its new element:
      // square → divided frame → measured frame → working window.
      tl.to(parts, { strokeDashoffset: 0, duration: 0.9, stagger: 0.25, ease: 'power2.inOut' })
        .to(text, { autoAlpha: 1, y: 0, duration: 0.9, stagger: 0.08, ease: 'power3.out' }, 0.2);
      ScrollTrigger.create({
        trigger: step, start: isDesktop() ? 'top 70%' : 'top 85%', once: true,
        onEnter: () => tl.delay(isDesktop() ? i * 0.12 : 0).play(),
      });
    });
  }

  /* ------------------------------------------------------------ */
  /* Contact form (demo, no network request)                      */
  /* ------------------------------------------------------------ */

  const formEl = $('[data-form]');
  const success = $('[data-success]');
  const nameIn = $('#f-name');
  const phoneIn = $('#f-phone');
  const commentIn = $('#f-comment');
  const counter = $('[data-count-chars]');

  // +7 (XXX) XXX-XX-XX. Separators appear only once the next digit exists,
  // so backspace never gets stuck on a bracket or a dash.
  function formatPhone(value) {
    let d = value.replace(/\D/g, '');
    if (value.trim().startsWith('+7')) d = d.slice(1);
    else if (d.length >= 11 && /[78]/.test(d[0])) d = d.slice(1);
    if (d.length > 10 && /[78]/.test(d[0])) d = d.slice(1);
    d = d.slice(0, 10);
    if (!d) return '';
    let out = '+7 (' + d.slice(0, 3);
    if (d.length > 3) out += ') ' + d.slice(3, 6);
    if (d.length > 6) out += '-' + d.slice(6, 8);
    if (d.length > 8) out += '-' + d.slice(8, 10);
    return out;
  }

  const validators = {
    name(v) {
      v = v.trim();
      if (!v) return 'Укажите имя';
      if (v.length < 2) return 'Имя слишком короткое';
      if (!/^[A-Za-zА-Яа-яЁё\s'’-]+$/.test(v)) return 'Используйте только буквы';
      return '';
    },
    phone(v) {
      const d = v.replace(/\D/g, '');
      if (!d) return 'Укажите телефон';
      if (d.length < 11) return 'Номер неполный: +7 (XXX) XXX-XX-XX';
      return '';
    },
  };

  function check(input, force) {
    const wrap = input.closest('.input');
    const err = $('.input__err', wrap);
    const msg = validators[input.name](input.value);
    const touched = force || wrap.classList.contains('is-touched');
    if (!touched) return !msg;
    wrap.classList.toggle('is-invalid', !!msg);
    wrap.classList.toggle('is-valid', !msg);
    input.setAttribute('aria-invalid', msg ? 'true' : 'false');
    input.setAttribute('aria-describedby', err.id);
    err.textContent = msg;
    return !msg;
  }

  phoneIn.addEventListener('focus', () => { if (!phoneIn.value) phoneIn.value = '+7 ('; });
  phoneIn.addEventListener('blur', () => { if (phoneIn.value.replace(/\D/g, '').length <= 1) phoneIn.value = ''; });
  phoneIn.addEventListener('input', () => {
    const v = formatPhone(phoneIn.value);
    phoneIn.value = v || (document.activeElement === phoneIn ? '+7 (' : '');
    check(phoneIn);
  });
  nameIn.addEventListener('input', () => check(nameIn));
  [nameIn, phoneIn].forEach((i) => i.addEventListener('blur', () => {
    if (i.value.trim() && i.value !== '+7 (') i.closest('.input').classList.add('is-touched');
    check(i);
  }));
  commentIn.addEventListener('input', () => (counter.textContent = commentIn.value.length));

  formEl.addEventListener('submit', (e) => {
    e.preventDefault();
    [nameIn, phoneIn].forEach((i) => i.closest('.input').classList.add('is-touched'));
    const okName = check(nameIn, true);
    const okPhone = check(phoneIn, true);
    if (!okName || !okPhone) {
      (okName ? phoneIn : nameIn).focus();
      if (!reduced) gsap.fromTo(formEl.querySelector('.is-invalid'), { x: -6 }, { x: 0, duration: 0.6, ease: 'elastic.out(1, 0.4)' });
      return;
    }
    showSuccess({ name: nameIn.value.trim(), phone: phoneIn.value, comment: commentIn.value.trim() });
  });

  function showSuccess(data) {
    const dl = $('[data-success-data]');
    const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    dl.innerHTML = [['Имя', data.name], ['Телефон', data.phone], ['Комментарий', data.comment || '—']]
      .map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('');

    const swap = () => {
      formEl.hidden = true;
      success.hidden = false;
      success.focus({ preventScroll: true });
      if (reduced) return;
      const parts = $$('.success__glyph rect, .success__glyph path', success);
      parts.forEach(prepDraw);
      gsap.timeline()
        .to(parts, { strokeDashoffset: 0, duration: 0.9, stagger: 0.35, ease: 'power2.inOut' })
        .from($$('.success__title, .success__text, .success__data, .success .btn', success), { autoAlpha: 0, y: 16, duration: 0.8, stagger: 0.08 }, 0.3);
    };
    if (reduced) swap();
    else gsap.to(formEl, { autoAlpha: 0, y: -12, duration: 0.4, ease: 'power2.in', onComplete: swap });
  }

  function resetForm() {
    formEl.reset();
    counter.textContent = '0';
    $$('.input', formEl).forEach((w) => {
      w.classList.remove('is-invalid', 'is-valid', 'is-touched');
      const e = $('.input__err', w);
      if (e) e.textContent = '';
    });
    success.hidden = true;
    formEl.hidden = false;
    gsap.set(formEl, { clearProps: 'all' });
  }
  $('[data-form-reset]').addEventListener('click', () => {
    resetForm();
    nameIn.focus();
  });

  /* ------------------------------------------------------------ */

  addEventListener('load', () => ScrollTrigger.refresh());
})();
