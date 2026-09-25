/* Mobile nav - a kebab button that collapses the header links into a panel.
   Runs before any motion code because navigation must work even when the
   visitor asks for reduced motion. */
(() => {
  const header = document.querySelector('.site-header');
  const inner = header && header.querySelector('.site-header__inner');
  const nav = inner && inner.querySelector('.site-nav');
  if (!nav) return;

  // The CTA stays visible in the bar; the rest of the links collapse.
  const actions = document.createElement('div');
  actions.className = 'nav-bar-actions';
  const cta = nav.querySelector('.nav-cta');
  if (cta) actions.appendChild(cta);

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'nav-toggle';
  toggle.setAttribute('aria-label', 'Open menu');
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-controls', 'site-nav-panel');
  toggle.innerHTML = '<span></span><span></span><span></span>';
  actions.appendChild(toggle);
  inner.appendChild(actions);

  if (!nav.id) nav.id = 'site-nav-panel';
  // Only adopt the collapsed layout once the toggle exists, so a no-JS
  // visitor keeps the plain inline links.
  header.classList.add('nav-ready');
  // Enable the open/close transition a frame later, so collapsing on load
  // is instant rather than an animated flash of the full menu.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => header.classList.add('nav-anim'));
  });

  const isOpen = () => header.classList.contains('nav-open');
  const setOpen = (open) => {
    header.classList.toggle('nav-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  };

  toggle.addEventListener('click', (event) => {
    event.stopPropagation();
    setOpen(!isOpen());
  });

  // Tapping a link, tapping outside, or Escape all dismiss the panel.
  nav.addEventListener('click', (event) => {
    if (event.target.closest('a')) setOpen(false);
  });
  document.addEventListener('click', (event) => {
    if (!isOpen()) return;
    if (!nav.contains(event.target) && !toggle.contains(event.target)) setOpen(false);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && isOpen()) {
      setOpen(false);
      toggle.focus();
    }
  });
  window.addEventListener('resize', () => {
    if (isOpen() && window.innerWidth > 820) setOpen(false);
  });
})();

(() => {
  const doc = document.documentElement;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) {
    doc.classList.add('reduced-motion');
    return;
  }

  const pointerFine = window.matchMedia('(pointer: fine)').matches;
  const body = document.body;

  // Feature / product boxes: alternate left <-> right as they enter viewport
  const slideGroups = [
    '.feature-grid',
    '.product-grid',
    '.feature-links',
    '.blog-grid'
  ];

  // Grids that read better rising into place than sliding sideways
  const liftGroups = ['.pricing-grid', '.steps', '.compare-grid', '.faq'];

  const revealNodes = [];
  const seen = new Set();

  slideGroups.forEach((groupSelector) => {
    document.querySelectorAll(groupSelector).forEach((group) => {
      [...group.children].forEach((node, index) => {
        if (seen.has(node)) return;
        seen.add(node);
        node.classList.add('motion-reveal');
        node.classList.add(index % 2 === 0 ? 'motion-enter-left' : 'motion-enter-right');
        node.style.setProperty('--reveal-delay', `${Math.min(index, 5) * 70}ms`);
        revealNodes.push(node);
      });
    });
  });

  liftGroups.forEach((groupSelector) => {
    document.querySelectorAll(groupSelector).forEach((group) => {
      [...group.children].forEach((node, index) => {
        if (seen.has(node)) return;
        seen.add(node);
        node.classList.add('motion-reveal', 'motion-enter-scale');
        node.style.setProperty('--reveal-delay', `${Math.min(index, 5) * 80}ms`);
        revealNodes.push(node);
      });
    });
  });

  // Section headings: fade up and draw their accent rule
  document.querySelectorAll('.section__head, .section > h2, .precision').forEach((node) => {
    if (seen.has(node)) return;
    seen.add(node);
    node.classList.add('motion-reveal', 'motion-enter-up');
    revealNodes.push(node);
  });

  // Trust pills / chip rows stagger in one by one
  document.querySelectorAll('.trust__list, .hero__chips, .chip-row').forEach((list) => {
    [...list.children].forEach((node, index) => {
      if (seen.has(node)) return;
      seen.add(node);
      node.classList.add('motion-chip');
      node.style.setProperty('--reveal-delay', `${Math.min(index, 8) * 60}ms`);
      revealNodes.push(node);
    });
  });

  // Showcase rows: copy from one side, media from the other
  document.querySelectorAll('.showcase').forEach((showcase, index) => {
    if (seen.has(showcase)) return;
    seen.add(showcase);
    showcase.classList.add('motion-reveal');
    showcase.classList.add(index % 2 === 0 ? 'motion-enter-left' : 'motion-enter-right');
    showcase.style.setProperty('--reveal-delay', '0ms');
    revealNodes.push(showcase);
  });

  const reveal = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        reveal.unobserve(entry.target);
      });
    },
    { threshold: 0.12, rootMargin: '0px 0px -6% 0px' }
  );
  revealNodes.forEach((node) => reveal.observe(node));

  // Scroll progress bar + header depth, both driven by one rAF-throttled read.
  const progress = document.createElement('div');
  progress.className = 'scroll-progress';
  body.appendChild(progress);

  const header = document.querySelector('.site-header');
  let scrollRaf = 0;
  const onScroll = () => {
    scrollRaf = 0;
    const scrollable = doc.scrollHeight - window.innerHeight;
    const ratio = scrollable > 0 ? Math.min(1, window.scrollY / scrollable) : 0;
    progress.style.setProperty('--scroll-progress', String(ratio));
    if (header) header.classList.toggle('is-stuck', window.scrollY > 8);
  };
  window.addEventListener(
    'scroll',
    () => {
      if (!scrollRaf) scrollRaf = requestAnimationFrame(onScroll);
    },
    { passive: true }
  );
  onScroll();

  const heroPhoto = document.querySelector('.hero__visual--photo img');
  if (heroPhoto && pointerFine) {
    const hero = heroPhoto.closest('.hero');
    let raf = 0;
    let targetX = 0;
    let targetY = 0;
    const apply = () => {
      raf = 0;
      heroPhoto.style.setProperty('--hero-tilt-x', `${targetX}deg`);
      heroPhoto.style.setProperty('--hero-tilt-y', `${targetY}deg`);
    };
    hero.addEventListener('mousemove', (event) => {
      const rect = hero.getBoundingClientRect();
      const px = (event.clientX - rect.left) / rect.width - 0.5;
      const py = (event.clientY - rect.top) / rect.height - 0.5;
      targetY = Math.max(-3, Math.min(3, px * 6));
      targetX = Math.max(-3, Math.min(3, py * -6));
      if (!raf) raf = requestAnimationFrame(apply);
    });
    hero.addEventListener('mouseleave', () => {
      targetX = 0;
      targetY = 0;
      if (!raf) raf = requestAnimationFrame(apply);
    });
  }

  if (pointerFine) {
    const canvas = document.createElement('canvas');
    canvas.className = 'mouse-tail';
    body.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    const hexToRgb = (hex) => {
      const match = String(hex || '').trim().match(/^#?([0-9a-f]{6})$/i);
      if (!match) return [0, 133, 255];
      const value = parseInt(match[1], 16);
      return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
    };

    let c1 = [0, 133, 255];
    let c2 = [0, 196, 154];
    const readColors = () => {
      const css = getComputedStyle(doc);
      c1 = hexToRgb(css.getPropertyValue('--primary')) || [0, 133, 255];
      c2 = hexToRgb(css.getPropertyValue('--secondary')) || [0, 196, 154];
    };
    readColors();

    const mix = (p) => [
      Math.round(c1[0] + (c2[0] - c1[0]) * p),
      Math.round(c1[1] + (c2[1] - c1[1]) * p),
      Math.round(c1[2] + (c2[2] - c1[2]) * p)
    ];

    const TRAIL_MS = 620;
    const MAX_W = 9;
    const STEP_PX = 2.5;
    const pts = [];
    let have = false;
    let raf = null;
    let shown = false;
    let lastMove = 0;

    const addTrailPoint = (x, y, t) => {
      const last = pts[pts.length - 1];
      if (last) {
        const dx = x - last.x;
        const dy = y - last.y;
        const dist = Math.hypot(dx, dy);
        if (dist > STEP_PX) {
          const n = Math.ceil(dist / STEP_PX);
          for (let i = 1; i < n; i += 1) {
            const f = i / n;
            pts.push({ x: last.x + dx * f, y: last.y + dy * f, t: last.t + (t - last.t) * f });
          }
        } else if (dist < 0.4) {
          return;
        }
      }
      pts.push({ x, y, t });
      while (pts.length > 240) pts.shift();
    };

    const livePts = (now) => {
      while (pts.length && now - pts[0].t > TRAIL_MS) pts.shift();
      return pts;
    };

    const draw = () => {
      const now = performance.now();
      if (now - lastMove > 80) have = false;
      const live = livePts(now);
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      if (live.length > 1) {
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.globalCompositeOperation = 'lighter';
        for (let i = 1; i < live.length; i += 1) {
          const a = live[i - 1];
          const b = live[i];
          const p = i / (live.length - 1);
          const age = 1 - (now - b.t) / TRAIL_MS;
          if (age <= 0) continue;
          const w = Math.max(1.5, MAX_W * p * age);
          const c = mix(p);
          ctx.lineWidth = w;
          ctx.strokeStyle = `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${0.72 * age})`;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
        ctx.globalCompositeOperation = 'source-over';
      }
      if (live.length || have) {
        raf = requestAnimationFrame(draw);
      } else {
        raf = null;
      }
    };

    const wake = () => {
      if (!raf) raf = requestAnimationFrame(draw);
    };

    const clearTrail = () => {
      if (pts.length) {
        pts.length = 0;
        ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      }
      have = false;
      if (shown) {
        shown = false;
        canvas.classList.remove('is-visible');
      }
    };

    window.addEventListener(
      'pointermove',
      (event) => {
        lastMove = performance.now();
        have = true;
        addTrailPoint(event.clientX, event.clientY, lastMove);
        if (!shown) {
          shown = true;
          canvas.classList.add('is-visible');
          readColors();
        }
        wake();
      },
      { passive: true }
    );

    document.addEventListener('mouseleave', clearTrail);
    window.addEventListener('blur', clearTrail);
  }
})();

/* APK-style yellow busy orbit on CTAs so every click shows feedback. */
(() => {
  const SELECTOR = '.btn, .pay-btn, .btn-download, .nav-cta, button[type="submit"]';

  const markBusy = (el) => {
    if (!el || el.disabled || el.classList.contains('nav-toggle')) return;
    el.classList.add('is-busy');
    el.setAttribute('aria-busy', 'true');
  };

  const clearBusy = (el) => {
    if (!el) return;
    el.classList.remove('is-busy');
    el.removeAttribute('aria-busy');
  };

  const isSubmitControl = (el) =>
    el.matches('button[type="submit"], input[type="submit"], .contact-submit, .pay-btn');

  document.addEventListener(
    'click',
    (event) => {
      const el = event.target.closest(SELECTOR);
      if (!el || el.classList.contains('nav-toggle')) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      // Submit controls: page handlers own busy. Click-capture busy blocks
      // form submit / leaves a stuck ring after validation errors.
      if (isSubmitControl(el)) return;
      if (el.tagName === 'A') {
        const href = el.getAttribute('href') || '';
        const blank = el.getAttribute('target') === '_blank';
        markBusy(el);
        if (blank || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) {
          window.setTimeout(() => clearBusy(el), 900);
        }
        return;
      }
      markBusy(el);
      window.setTimeout(() => {
        if (!el.disabled) clearBusy(el);
      }, 12000);
    },
    true
  );
})();

/* Stretchy pull for pricing CTAs: follows the cursor and elongates toward it,
   then snaps home once pulled past BREAK. Copied from the portfolio sticky buttons. */
(() => {
  const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!finePointer || reducedMotion) return;

  const CATCH = 90;
  const BREAK = 130;
  const PULL_RATIO = 0.45;

  const isPricingBtn = (el) => {
    if (el.classList.contains("nav-cta")) return true;
    if (el.hasAttribute("data-pay")) return true;
    const href = (el.getAttribute("href") || "").toLowerCase();
    return href.includes("pricing") || /(?:^|\/)pay\/|\bpay\/\?/.test(href);
  };

  const buttons = [...document.querySelectorAll("a.btn, a.nav-cta, a.pay-btn")].filter(isPricingBtn);
  buttons.forEach((el) => el.classList.add("btn-magnet"));
  if (!buttons.length) return;

  const active = new Map();
  let pointerX = 0;
  let pointerY = 0;
  let frame = 0;

  const rest = () => ({ x: 0, y: 0, sx: 1, sy: 1, angle: 0 });

  const apply = (el, state) => {
    el.style.setProperty("--tx", `${state.x.toFixed(2)}px`);
    el.style.setProperty("--ty", `${state.y.toFixed(2)}px`);
    el.style.setProperty("--stretch-x", state.sx.toFixed(3));
    el.style.setProperty("--stretch-y", state.sy.toFixed(3));
    el.style.setProperty("--pull-angle", `${state.angle.toFixed(2)}deg`);
  };

  const release = (el, entry) => {
    if (!entry.pulling) return;
    entry.pulling = false;
    entry.target = rest();
    el.classList.remove("is-pulling");
    el.classList.add("is-snapping");
    entry.state = rest();
    apply(el, entry.state);
    clearTimeout(entry.snapTimer);
    entry.snapTimer = setTimeout(() => {
      el.classList.remove("is-snapping");
      entry.state = rest();
      apply(el, entry.state);
      active.delete(el);
    }, 560);
  };

  const tick = () => {
    let busy = false;
    active.forEach((entry, el) => {
      const ease = entry.pulling ? 0.28 : 0.22;
      entry.state.x += (entry.target.x - entry.state.x) * ease;
      entry.state.y += (entry.target.y - entry.state.y) * ease;
      entry.state.sx += (entry.target.sx - entry.state.sx) * ease;
      entry.state.sy += (entry.target.sy - entry.state.sy) * ease;
      entry.state.angle = entry.target.angle;
      apply(el, entry.state);
      const settled =
        !entry.pulling &&
        Math.abs(entry.state.x) < 0.2 &&
        Math.abs(entry.state.y) < 0.2 &&
        Math.abs(entry.state.sx - 1) < 0.01;
      if (!settled) busy = true;
    });
    frame = busy ? requestAnimationFrame(tick) : 0;
  };

  const startLoop = () => {
    if (!frame) frame = requestAnimationFrame(tick);
  };

  const BLOCKER =
    "a, button, input, textarea, select, label, iframe, [role='checkbox'], [role='button'], p, h1, h2, h3, h4, h5, h6, li";

  const centerOf = (el, entry) => {
    if (entry?.pulling) return { x: entry.originX, y: entry.originY };
    const rect = el.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  };

  const findNearest = () => {
    let nearest = null;
    let nearestDist = Infinity;
    buttons.forEach((el) => {
      const rect = el.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2) return;
      const { x, y } = centerOf(el, active.get(el));
      const dist = Math.hypot(pointerX - x, pointerY - y);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = el;
      }
    });
    return { nearest, nearestDist };
  };

  const peekUnder = (ignoreEl) => {
    const prev = ignoreEl.style.pointerEvents;
    ignoreEl.style.pointerEvents = "none";
    const hit = document.elementFromPoint(pointerX, pointerY);
    ignoreEl.style.pointerEvents = prev;
    return hit;
  };

  const updateFromPointer = () => {
    let pullingEl = null;
    active.forEach((entry, el) => {
      if (entry.pulling) pullingEl = el;
    });

    const { nearest, nearestDist } = findNearest();

    if (pullingEl && nearest && nearest !== pullingEl && nearestDist <= CATCH) {
      release(pullingEl, active.get(pullingEl));
      pullingEl = null;
    }

    if (!pullingEl) {
      if (!nearest || nearestDist > CATCH) {
        active.forEach((entry, el) => {
          if (!entry.pulling) active.delete(el);
        });
        return;
      }
      pullingEl = nearest;
    }

    const el = pullingEl;
    const rect = el.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return;

    let entry = active.get(el);
    const liveCx = rect.left + rect.width / 2;
    const liveCy = rect.top + rect.height / 2;
    const cx = entry?.pulling ? entry.originX : liveCx;
    const cy = entry?.pulling ? entry.originY : liveCy;
    const dx = pointerX - cx;
    const dy = pointerY - cy;
    const dist = Math.hypot(dx, dy) || 0.0001;
    const baseSize = entry?.pulling ? entry.baseSize : Math.max(rect.width, rect.height);
    const reachLimit = baseSize * 0.5 + BREAK;

    if (!entry) {
      entry = {
        pulling: false,
        state: rest(),
        target: rest(),
        snapTimer: 0,
        originX: liveCx,
        originY: liveCy,
        baseSize: Math.max(rect.width, rect.height),
      };
      active.set(el, entry);
    }

    if (entry.pulling) {
      const hit = peekUnder(el);
      if (hit && !el.contains(hit)) {
        const otherBtn = hit.closest(".btn, .nav-cta, .pay-btn");
        if (otherBtn && otherBtn !== el) {
          release(el, entry);
          return;
        }
        if (hit.closest(BLOCKER)) {
          release(el, entry);
          return;
        }
      }
    }

    if (dist > reachLimit) {
      release(el, entry);
      return;
    }

    if (!entry.pulling) {
      entry.pulling = true;
      entry.originX = liveCx;
      entry.originY = liveCy;
      entry.baseSize = Math.max(rect.width, rect.height);
      el.classList.add("is-pulling");
      el.classList.remove("is-snapping");
      clearTimeout(entry.snapTimer);
    }

    const t = Math.min(dist / reachLimit, 1);
    const reach = dist * PULL_RATIO;
    entry.target.angle = (Math.atan2(dy, dx) * 180) / Math.PI;
    entry.target.x = (dx / dist) * reach;
    entry.target.y = (dy / dist) * reach;
    entry.target.sx = 1 + t * 0.22;
    entry.target.sy = 1 - t * 0.1;
    startLoop();
  };

  window.addEventListener(
    "pointermove",
    (event) => {
      pointerX = event.clientX;
      pointerY = event.clientY;
      updateFromPointer();
    },
    { passive: true }
  );
  window.addEventListener("blur", () => {
    active.forEach((entry, el) => release(el, entry));
  });
  document.addEventListener("pointerleave", () => {
    active.forEach((entry, el) => release(el, entry));
  });
})();
