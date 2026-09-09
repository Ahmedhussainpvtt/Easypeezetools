(() => {
  const doc = document.documentElement;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) {
    doc.classList.add('reduced-motion');
    return;
  }

  const pointerFine = window.matchMedia('(pointer: fine)').matches;
  const body = document.body;

  const revealSelectors = [
    '.feature',
    '.feature-card',
    '.product-card',
    '.pricing-tease',
    '.blog-card',
    '.showcase',
    '.seo-block',
    '.faq details',
    '.compare-table',
    '.contact-card',
    '.page-hero',
    '.precision',
    '.section__head',
    '.trust > *',
    '.checklist li',
    '.steps li',
    '.guide-card',
    '.glossary-card',
    '.term-card',
    '.product-grid > *',
    '.feature-grid > *',
    '.blog-grid > *'
  ];

  const seen = new Set();
  const revealNodes = [];
  revealSelectors.forEach((selector) => {
    document.querySelectorAll(selector).forEach((node) => {
      if (seen.has(node)) return;
      seen.add(node);
      node.classList.add('motion-reveal');
      revealNodes.push(node);
    });
  });
  revealNodes.forEach((node, index) => {
    node.style.setProperty('--reveal-delay', `${Math.min(index % 8, 7) * 55}ms`);
  });

  const reveal = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        reveal.unobserve(entry.target);
      });
    },
    { threshold: 0.14, rootMargin: '0px 0px -8% 0px' }
  );
  revealNodes.forEach((node) => reveal.observe(node));

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
    const trail = document.createElement('div');
    trail.className = 'mouse-tail';
    trail.innerHTML = '<span></span><span></span><span></span>';
    body.appendChild(trail);
    const dots = [...trail.children];
    const pos = dots.map(() => ({ x: window.innerWidth / 2, y: window.innerHeight / 2 }));
    let mouseX = pos[0].x;
    let mouseY = pos[0].y;
    let shown = false;

    window.addEventListener(
      'pointermove',
      (event) => {
        mouseX = event.clientX;
        mouseY = event.clientY;
        if (!shown) {
          trail.classList.add('is-visible');
          shown = true;
        }
      },
      { passive: true }
    );

    const tick = () => {
      pos[0].x += (mouseX - pos[0].x) * 0.26;
      pos[0].y += (mouseY - pos[0].y) * 0.26;
      for (let i = 1; i < pos.length; i += 1) {
        pos[i].x += (pos[i - 1].x - pos[i].x) * 0.24;
        pos[i].y += (pos[i - 1].y - pos[i].y) * 0.24;
      }
      dots.forEach((dot, index) => {
        dot.style.transform = `translate(${pos[index].x}px, ${pos[index].y}px) scale(${1 - index * 0.18})`;
      });
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
})();
