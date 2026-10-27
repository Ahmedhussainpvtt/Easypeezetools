#!/usr/bin/env node
/**
 * SEO build pipeline
 *   seo.config.js  →  this script  →  HTML meta/canonical/OG + JSON-LD
 *                                  →  sitemap.xml + robots.txt
 *
 * Usage:
 *   node scripts/seo-build.js                 # both sites
 *   node scripts/seo-build.js --site easypeeze
 *   node scripts/seo-build.js --site kharch
 *   node scripts/seo-build.js --dry-run
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const TODAY = new Date().toISOString().slice(0, 10);

const SITES = {
  easypeeze: {
    label: 'easypeeze',
    dir: path.join(ROOT, 'easypeeze-website'),
    configName: 'seo.config.js',
  },
  kharch: {
    label: 'kharch',
    dir: path.join(ROOT, 'website'),
    configName: 'seo.config.js',
  },
};

function parseArgs(argv) {
  const out = { site: 'both', dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') out.dryRun = true;
    else if (a === '--site') out.site = String(argv[++i] || 'both').toLowerCase();
  }
  return out;
}

function loadConfig(siteDir, configName) {
  const cfgPath = path.join(siteDir, configName);
  if (!fs.existsSync(cfgPath)) {
    throw new Error(`Missing ${cfgPath}`);
  }
  // Fresh require each run
  delete require.cache[require.resolve(cfgPath)];
  return require(cfgPath);
}

function walkHtmlFiles(dir, skipPrefixes = []) {
  const out = [];
  function walk(current) {
    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      if (ent.name.startsWith('.') || ent.name === 'node_modules') continue;
      const full = path.join(current, ent.name);
      const rel = path.relative(dir, full).split(path.sep).join('/');
      const urlPath = '/' + rel.replace(/\\/g, '/');
      const skip = skipPrefixes.some((p) => {
        const norm = p.endsWith('/') ? p : p + '/';
        return urlPath === p.replace(/\/$/, '') || urlPath === norm.slice(0, -1) || urlPath.startsWith(norm);
      });
      if (skip) continue;
      if (ent.isDirectory()) {
        walk(full);
        continue;
      }
      if (!ent.name.toLowerCase().endsWith('.html')) continue;
      // Only public pages: index.html or root-level html like success.html under pay
      out.push(full);
    }
  }
  walk(dir);
  return out;
}

function fileToUrlPath(siteDir, filePath) {
  let rel = path.relative(siteDir, filePath).split(path.sep).join('/');
  if (rel.toLowerCase() === 'index.html') return '/';
  if (rel.toLowerCase().endsWith('/index.html')) {
    return '/' + rel.slice(0, -'index.html'.length);
  }
  return '/' + rel;
}

function escapeAttr(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}

function getMetaContent(html, name) {
  const re = new RegExp(
    `<meta\\s+[^>]*name=["']${name}["'][^>]*content=["']([^"']*)["'][^>]*>|<meta\\s+[^>]*content=["']([^"']*)["'][^>]*name=["']${name}["'][^>]*>`,
    'i'
  );
  const m = html.match(re);
  return m ? decodeAttr(m[1] || m[2] || '') : '';
}

// Values read back from the page are escaped already; decode so upsert does not escape twice.
// The &amp; collapse also repairs chains left by earlier runs.
function decodeAttr(s) {
  return String(s)
    .replace(/&(?:amp;)+/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'");
}

function getTitle(html) {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? m[1].replace(/\s+/g, ' ').trim() : '';
}

function upsertTitle(html, title) {
  if (/<title[^>]*>[\s\S]*?<\/title>/i.test(html)) {
    return html.replace(/<title[^>]*>[\s\S]*?<\/title>/i, `<title>${title}</title>`);
  }
  return html.replace(/<head[^>]*>/i, (h) => `${h}\n  <title>${title}</title>`);
}

function upsertNamedMeta(html, name, content) {
  const tag = `<meta name="${name}" content="${escapeAttr(content)}" />`;
  const re = new RegExp(`<meta\\s+[^>]*name=["']${name}["'][^>]*>`, 'i');
  if (re.test(html)) return html.replace(re, tag);
  return html.replace(/<\/head>/i, `  ${tag}\n</head>`);
}

function upsertPropMeta(html, property, content) {
  const tag = `<meta property="${property}" content="${escapeAttr(content)}" />`;
  const re = new RegExp(`<meta\\s+[^>]*property=["']${property}["'][^>]*>`, 'i');
  if (re.test(html)) return html.replace(re, tag);
  return html.replace(/<\/head>/i, `  ${tag}\n</head>`);
}

function ensureCharsetFirst(html) {
  if (!/<head[\s>]/i.test(html)) return html;
  const charsetTag = '  <meta charset="utf-8" />\n';
  const without = html.replace(/\s*<meta\b[^>]*charset\b[^>]*>\s*/gi, '\n');
  return without.replace(/<head[^>]*>/i, (open) => `${open}\n${charsetTag}`);
}

function gtagSnippet(id) {
  return `<!-- Google tag (gtag.js) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=${id}"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());

  gtag('config', '${id}');
</script>
`;
}

function ensureGtag(html, id) {
  if (!id || !/<head[\s>]/i.test(html)) return html;
  if (html.includes(`gtag/js?id=${id}`)) return html;
  html = html.replace(
    /\s*<!-- Google tag \(gtag\.js\) -->[\s\S]*?gtag\('config',\s*'G-[A-Z0-9]+'\);\s*<\/script>\s*/i,
    '\n'
  );
  return html.replace(/<head[^>]*>/i, (open) => `${open}\n${gtagSnippet(id)}`);
}

function stripGtag(html) {
  return html.replace(
    /\s*<!-- Google tag \(gtag\.js\) -->[\s\S]*?gtag\('config',\s*'G-[A-Z0-9]+'\);\s*<\/script>\s*/i,
    '\n'
  );
}

function stripAmplitude(html) {
  html = html.replace(
    /\s*<!-- Amplitude -->\s*<script src="https:\/\/cdn\.amplitude\.com\/script\/[^"]+\.js"><\/script><script>window\.amplitude[\s\S]*?<\/script>\s*/i,
    '\n'
  );
  return html.replace(
    /\s*<script src="https:\/\/cdn\.amplitude\.com\/script\/[^"]+\.js"><\/script>\s*<script>window\.amplitude[\s\S]*?<\/script>\s*/i,
    '\n'
  );
}

const INTERNAL_SKIP_PATHS = ['/khsynloyrebnsbyo/'];

function applyGtagToTree(siteDir, gtagId, dryRun, skipPrefixes = INTERNAL_SKIP_PATHS) {
  let n = 0;
  if (gtagId) {
    for (const file of walkHtmlFiles(siteDir, skipPrefixes)) {
      const html = fs.readFileSync(file, 'utf8');
      const next = ensureCharsetFirst(ensureGtag(html, gtagId));
      if (next === html) continue;
      if (!dryRun) fs.writeFileSync(file, next, 'utf8');
      n += 1;
    }
  }
  for (const file of walkHtmlFiles(siteDir, [])) {
    const pagePath = fileToUrlPath(siteDir, file);
    const skipped = skipPrefixes.some((p) => pagePath === p || pagePath.startsWith(p));
    if (!skipped) continue;
    const html = fs.readFileSync(file, 'utf8');
    const next = stripAmplitude(stripGtag(html));
    if (next === html) continue;
    if (!dryRun) fs.writeFileSync(file, next, 'utf8');
    n += 1;
  }
  return n;
}

function amplitudeSnippet(apiKey) {
  return `<!-- Amplitude -->
<script src="https://cdn.amplitude.com/script/${apiKey}.js"></script><script>window.amplitude.add(window.sessionReplay.plugin({sampleRate: 1}));window.amplitude.init('${apiKey}', {"fetchRemoteConfig":true,"autocapture":true});</script>
`;
}

function ensureAmplitude(html, apiKey) {
  if (!apiKey || !/<head[\s>]/i.test(html)) return html;
  if (html.includes(`cdn.amplitude.com/script/${apiKey}.js`)) return html;
  html = html.replace(
    /\s*<!-- Amplitude -->\s*<script src="https:\/\/cdn\.amplitude\.com\/script\/[^"]+\.js"><\/script><script>window\.amplitude[\s\S]*?<\/script>\s*/i,
    '\n'
  );
  html = html.replace(
    /\s*<script src="https:\/\/cdn\.amplitude\.com\/script\/[^"]+\.js"><\/script>\s*<script>window\.amplitude[\s\S]*?<\/script>\s*/i,
    '\n'
  );
  return html.replace(/<head[^>]*>/i, (open) => `${open}\n${amplitudeSnippet(apiKey)}`);
}

function applyAmplitudeToTree(siteDir, apiKey, dryRun, skipPrefixes = []) {
  if (!apiKey) return 0;
  let n = 0;
  for (const file of walkHtmlFiles(siteDir, skipPrefixes)) {
    const html = fs.readFileSync(file, 'utf8');
    const next = ensureCharsetFirst(ensureAmplitude(html, apiKey));
    if (next === html) continue;
    if (!dryRun) fs.writeFileSync(file, next, 'utf8');
    n += 1;
  }
  return n;
}

function upsertLink(html, rel, href, extra = '') {
  const tag = `<link rel="${rel}" href="${escapeAttr(href)}"${extra} />`;
  const re = new RegExp(`<link\\s+[^>]*rel=["']${rel}["'][^>]*>`, 'i');
  if (re.test(html)) return html.replace(re, tag);
  return html.replace(/<\/head>/i, `  ${tag}\n</head>`);
}

function buildJsonLd(cfg, pagePath, page, title, description) {
  const origin = cfg.site.origin.replace(/\/$/, '');
  const url = origin + (pagePath === '/' ? '/' : pagePath);
  const org = { ...cfg.organization };
  const graph = [org];

  const schemaType = page.schemaType || 'WebPage';
  if (schemaType === 'WebSite') {
    graph.push({
      '@type': 'WebSite',
      '@id': `${origin}/#website`,
      url: `${origin}/`,
      name: cfg.site.name,
      description: description,
      publisher: { '@id': org['@id'] },
      inLanguage: cfg.site.language || 'en-IN',
    });
  } else {
    graph.push({
      '@type': schemaType,
      '@id': `${url}#webpage`,
      url,
      name: title,
      description,
      isPartOf: { '@id': `${origin}/#website` },
      publisher: { '@id': org['@id'] },
      inLanguage: cfg.site.language || 'en-IN',
    });
  }

  return {
    '@context': 'https://schema.org',
    '@graph': graph,
  };
}

function upsertJsonLd(html, json) {
  const block =
    `  <script type="application/ld+json" id="seo-jsonld">\n` +
    JSON.stringify(json, null, 2)
      .split('\n')
      .map((l, i) => (i === 0 ? l : '  ' + l))
      .join('\n') +
    `\n  </script>\n`;

  if (/id=["']seo-jsonld["']/i.test(html)) {
    return html.replace(
      /[ \t]*<script\b[^>]*id=["']seo-jsonld["'][^>]*>[\s\S]*?<\/script>\s*/i,
      block
    );
  }
  // Insert before </head> - keep any existing hand-written ld+json; managed block is additive.
  return html.replace(/<\/head>/i, `${block}</head>`);
}

function applyPageSeo(html, cfg, pagePath, page) {
  const origin = cfg.site.origin.replace(/\/$/, '');
  const canonical = origin + (pagePath === '/' ? '/' : pagePath);
  const existingTitle = getTitle(html);
  const existingDesc = getMetaContent(html, 'description');

  let title = page.title || existingTitle || cfg.site.defaultTitle;
  if (page.titleSuffix && cfg.site.titleTemplate && !page.title) {
    title = cfg.site.titleTemplate.replace('%s', page.titleSuffix);
  }
  const description =
    page.description || existingDesc || cfg.site.defaultDescription;
  const ogImage = page.ogImage || cfg.site.defaultOgImage;
  const noindex = !!(page.noindex || /noindex/i.test(getMetaContent(html, 'robots')));
  const robots = noindex
    ? 'noindex'
    : page.robots || cfg.defaults.robots;

  const isInternal = String(pagePath || '').startsWith('/khsynloyrebnsbyo');
  if (isInternal) {
    html = stripAmplitude(stripGtag(html));
  } else {
    html = ensureGtag(html, cfg.site && cfg.site.gtagId);
    html = ensureAmplitude(html, cfg.site && cfg.site.amplitudeApiKey);
  }
  html = upsertTitle(html, title);
  html = upsertNamedMeta(html, 'description', description);
  html = upsertNamedMeta(html, 'robots', robots);
  html = upsertNamedMeta(html, 'googlebot', noindex ? 'noindex' : 'index, follow');
  if (cfg.site.author) html = upsertNamedMeta(html, 'author', cfg.site.author);
  if (cfg.site.themeColor) html = upsertNamedMeta(html, 'theme-color', cfg.site.themeColor);
  if (cfg.site.name) html = upsertNamedMeta(html, 'application-name', cfg.site.name);

  html = upsertLink(html, 'canonical', canonical);
  html = upsertLink(html, 'sitemap', `${origin}/sitemap.xml`, ' type="application/xml" title="Sitemap"');

  html = upsertPropMeta(html, 'og:type', page.ogType || 'website');
  html = upsertPropMeta(html, 'og:site_name', cfg.site.name);
  html = upsertPropMeta(html, 'og:title', title);
  html = upsertPropMeta(html, 'og:description', description);
  html = upsertPropMeta(html, 'og:url', canonical);
  html = upsertPropMeta(html, 'og:image', ogImage);
  html = upsertPropMeta(html, 'og:locale', cfg.site.locale || 'en_IN');

  html = upsertNamedMeta(html, 'twitter:card', cfg.site.twitterCard || 'summary_large_image');
  html = upsertNamedMeta(html, 'twitter:title', title);
  html = upsertNamedMeta(html, 'twitter:description', description);
  html = upsertNamedMeta(html, 'twitter:image', ogImage);

  if (cfg.site.language) {
    html = html.replace(/<html\b[^>]*>/i, `<html lang="${cfg.site.language}">`);
  }

  const jsonLd = buildJsonLd(cfg, pagePath, page, title, description);
  html = upsertJsonLd(html, jsonLd);
  html = ensureCharsetFirst(html);

  return { html, title, description, noindex, canonical };
}

function writeSitemap(cfg, entries, outPath, dryRun) {
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ];
  const sorted = entries.slice().sort((a, b) => {
    if (a.path === '/') return -1;
    if (b.path === '/') return 1;
    return a.path.localeCompare(b.path);
  });
  for (const e of sorted) {
    lines.push('  <url>');
    lines.push(`    <loc>${e.loc}</loc>`);
    lines.push(`    <lastmod>${e.lastmod}</lastmod>`);
    lines.push(`    <changefreq>${e.changefreq}</changefreq>`);
    lines.push(`    <priority>${Number(e.priority).toFixed(1)}</priority>`);
    lines.push('  </url>');
  }
  lines.push('</urlset>', '');
  const body = lines.join('\n');
  if (dryRun) {
    console.log(`[dry-run] would write sitemap (${sorted.length} urls) → ${outPath}`);
    return;
  }
  fs.writeFileSync(outPath, body, 'utf8');
  console.log(`  sitemap.xml (${sorted.length} urls)`);
}

function writeRobots(cfg, outPath, dryRun) {
  const body = cfg.robots && cfg.robots.extra ? cfg.robots.extra : `User-agent: *\nAllow: /\nSitemap: ${cfg.site.origin}/sitemap.xml\n`;
  if (dryRun) {
    console.log(`[dry-run] would write robots.txt → ${outPath}`);
    return;
  }
  fs.writeFileSync(outPath, body.endsWith('\n') ? body : body + '\n', 'utf8');
  console.log('  robots.txt');
}

function excludedFromSitemap(cfg, pagePath) {
  const list = cfg.excludeFromSitemap || [];
  return list.some((p) => pagePath === p || pagePath.startsWith(p.replace(/\/?$/, '/')));
}

// ---------------------------------------------------------------------------
// Performance pass (Lighthouse). Idempotent on purpose: it runs here before a
// push and again in the site repo's Pages workflow, and both runs must leave
// the same HTML. Assets it points at (fonts/, *-NNN.webp, hero poster) are
// committed files; it only switches to them when they exist.
// ---------------------------------------------------------------------------
const PERF_FONT = '/fonts/manrope.woff2';
const PERF_FONT_CSS =
  '@font-face{font-family:"Manrope Fallback";src:local("Arial"),local("ArialMT"),local("Roboto");' +
  'ascent-override:103.3095%;descent-override:29.074%;line-gap-override:0%;size-adjust:103.1851%}' +
  `@font-face{font-family:"Manrope";font-style:normal;font-weight:400 800;font-display:optional;src:url(${PERF_FONT}) format("woff2")}`;
const PERF_EVENTS = "['scroll','wheel','pointerdown','pointermove','keydown','touchstart']";
const PERF_IDLE_MS = 6000;

function pageDirOf(pagePath) {
  return pagePath.endsWith('/') ? pagePath : path.posix.dirname(pagePath) + '/';
}

function attrOf(tag, name) {
  const m = tag.match(new RegExp(`\\s${name}=(["'])([^"']*)\\1`, 'i'));
  return m ? m[2] : null;
}

// Runs a loader on the first real interaction, or a while after load.
function onIntent(body) {
  return `(function(){var on=0,ev=${PERF_EVENTS};function go(){if(on++)return;ev.forEach(function(n){removeEventListener(n,go,true)});${body}}` +
    `ev.forEach(function(n){addEventListener(n,go,{capture:true,passive:true})});` +
    `if(document.readyState==='complete')setTimeout(go,${PERF_IDLE_MS});else addEventListener('load',function(){setTimeout(go,${PERF_IDLE_MS})})})();`;
}

function analyticsLoader(gtagId, ampKey) {
  const queue = gtagId
    ? `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${gtagId}');`
    : '';
  const loads = ["function add(s,cb){var e=document.createElement('script');e.src=s;e.async=true;if(cb)e.onload=cb;document.head.appendChild(e)}"];
  if (gtagId) loads.push(`add('https://www.googletagmanager.com/gtag/js?id=${gtagId}');`);
  if (ampKey) {
    loads.push(
      `add('https://cdn.amplitude.com/script/${ampKey}.js',function(){try{window.amplitude.add(window.sessionReplay.plugin({sampleRate:1}));` +
        `window.amplitude.init('${ampKey}',{"fetchRemoteConfig":true,"autocapture":true})}catch(e){}});`
    );
  }
  return `<!-- Analytics (deferred) -->\n<script>${queue}${onIntent(loads.join(''))}</script>\n<!-- /Analytics -->`;
}

// gtag + Amplitude load on first interaction (or after load) instead of blocking the head.
function deferAnalytics(html, cfg) {
  const site = cfg.site || {};
  const blockRe = /\s*<!-- Analytics \(deferred\) -->[\s\S]*?<!-- \/Analytics -->\s*/;
  const original = html;
  const withoutBlock = html.replace(blockRe, '\n');
  const stripped = stripAmplitude(stripGtag(withoutBlock));
  if (withoutBlock === original && stripped === withoutBlock) return original;
  const gtagId = /gtag\/js\?id=/.test(original) ? site.gtagId : null;
  const ampKey = /cdn\.amplitude\.com\/script\//.test(original) ? site.amplitudeApiKey : null;
  if (!gtagId && !ampKey) return stripped;
  const loader = analyticsLoader(gtagId, ampKey);
  // After <meta charset> (ensureCharsetFirst keeps that first), so reruns leave the order alone.
  const charset = stripped.match(/<head[^>]*>\s*<meta\b[^>]*charset\b[^>]*>/i);
  if (charset) {
    const at = charset.index + charset[0].length;
    return `${stripped.slice(0, at)}\n${loader}${stripped.slice(at)}`;
  }
  return stripped.replace(/<head[^>]*>/i, (open) => `${open}\n${loader}`);
}

// Google Fonts (render-blocking, 2 subsets) -> one self-hosted subset with a metric-matched fallback.
function selfHostFonts(html, siteDir) {
  if (!fs.existsSync(path.join(siteDir, PERF_FONT))) return html;
  if (!/fonts\.googleapis\.com/.test(html) && !/data-perf-fonts/.test(html)) return html;
  html = html.replace(/\s*<link\b[^>]*href=["']https:\/\/fonts\.(?:googleapis|gstatic)\.com[^"']*["'][^>]*>/gi, '');
  html = html.replace(/\s*<link\b[^>]*data-perf-font[^>]*>/gi, '').replace(/\s*<style data-perf-fonts>[\s\S]*?<\/style>/gi, '');
  const tags = `<link rel="preload" href="${PERF_FONT}" as="font" type="font/woff2" crossorigin data-perf-font />\n  <style data-perf-fonts>${PERF_FONT_CSS}</style>\n  `;
  const at = html.search(/<link\b[^>]*rel=["']stylesheet["']|<style data-perf-css/i);
  const end = html.search(/<\/head>/i);
  const pos = at >= 0 && (end < 0 || at < end) ? at : end;
  return pos >= 0 ? html.slice(0, pos) + tags + html.slice(pos) : html;
}

function readSiteCss(siteDir, pagePath, href) {
  const clean = href.split(/[?#]/)[0];
  const rel = clean.startsWith('/') ? clean : path.posix.normalize(path.posix.join(pageDirOf(pagePath), clean));
  const file = path.join(siteDir, rel);
  if (!fs.existsSync(file)) return null;
  const cssDir = path.posix.dirname(rel) + '/';
  return fs
    .readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/url\(\s*(["']?)(?!data:|https?:|\/|#)([^"')]+)\1\s*\)/g, (m, q, u) => `url(${q}${path.posix.normalize(cssDir + u)}${q})`)
    .replace(/\s*\n\s*/g, '\n')
    .replace(/<\/style/gi, '<\\/style')
    .trim();
}

// Local stylesheets are inlined (no render-blocking request). Re-inlined on every run so they never go stale.
function inlineLocalCss(html, siteDir, pagePath) {
  const block = (href, css) => `<style data-perf-css="${href}">${css}</style>`;
  html = html.replace(/<style data-perf-css="([^"]+)">[\s\S]*?<\/style>/g, (m, href) => {
    const css = readSiteCss(siteDir, pagePath, href);
    return css == null ? m : block(href, css);
  });
  return html.replace(/<link\b[^>]*\brel=["']stylesheet["'][^>]*>/gi, (tag) => {
    const href = attrOf(tag, 'href');
    if (!href || /^(https?:)?\/\//i.test(href)) return tag;
    const css = readSiteCss(siteDir, pagePath, href);
    return css == null ? tag : block(href, css);
  });
}

const variantCache = new Map();
function imageVariants(siteDir, rel) {
  const dir = path.join(siteDir, path.posix.dirname(rel));
  if (!variantCache.has(dir)) variantCache.set(dir, fs.existsSync(dir) ? fs.readdirSync(dir) : []);
  const base = path.posix.basename(rel).replace(/\.(png|jpe?g)$/i, '');
  const re = new RegExp(`^${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-(\\d+)\\.webp$`);
  return variantCache.get(dir).map((n) => (n.match(re) || [])[1]).filter(Boolean).map(Number).sort((a, b) => a - b);
}

// <img> PNG/JPG -> WebP variants made by scripts/make-web-images.mjs (srcset when there are several).
function optimizeImages(html, siteDir, pagePath, origin) {
  return html.replace(/<img\b[^>]*>/gi, (tag) => {
    const src = attrOf(tag, 'src');
    if (!src) return tag;
    let rel = origin && src.startsWith(origin) ? src.slice(origin.length) : src;
    if (/^(https?:|data:|\/\/)/i.test(rel)) return tag;
    rel = rel.split(/[?#]/)[0];
    if (!/\.(png|jpe?g)$/i.test(rel)) return tag;
    const abs = rel.startsWith('/') ? rel : path.posix.normalize(path.posix.join(pageDirOf(pagePath), rel));
    const widths = imageVariants(siteDir, abs);
    if (!widths.length) return tag;
    const url = (w) => abs.replace(/\.(png|jpe?g)$/i, `-${w}.webp`);
    let next = tag.replace(/\s(src|srcset|sizes)=(["'])[^"']*\2/gi, '');
    let attrs;
    if (widths.length === 1) {
      attrs = ` src="${url(widths[0])}"`;
    } else {
      const w = parseInt(attrOf(tag, 'width') || '', 10);
      const shown = Number.isFinite(w) && w > 0 ? Math.min(w, 760) : 760;
      const pick = widths.filter((x) => x <= 960).pop() || widths[0];
      attrs =
        ` src="${url(pick)}" srcset="${widths.map((x) => `${url(x)} ${x}w`).join(', ')}"` +
        ` sizes="${attrOf(tag, 'sizes') || `(max-width: 760px) 92vw, ${shown}px`}"`;
    }
    if (!/\sdecoding=/i.test(next) && !/fetchpriority=["']high/i.test(next)) attrs += ' decoding="async"';
    return next.replace(/^<img/i, `<img${attrs}`);
  });
}

// Images after the first <section> of <main> are below the fold on load: lazy-load them
// so they do not compete with the hero for bandwidth.
function lazyBelowFold(html) {
  const main = html.search(/<main\b/i);
  if (main < 0) return html;
  const firstEnd = html.indexOf('</section>', main);
  if (firstEnd < 0) return html;
  const head = html.slice(0, firstEnd);
  const tail = html.slice(firstEnd).replace(/<img\b[^>]*>/gi, (tag) =>
    /\s(loading|fetchpriority)=/i.test(tag) ? tag : tag.replace(/^<img/i, '<img loading="lazy"')
  );
  return head + tail;
}

// "Learn more" alone is not descriptive link text; add the target for screen readers and Lighthouse.
function describeLearnMore(html) {
  return html.replace(/<a\b([^>]*)>\s*Learn more\s*<\/a>/gi, (m, attrs) => {
    const href = (attrs.match(/\bhref=["']([^"']+)["']/i) || [])[1] || '';
    const slug = href.replace(/[?#].*$/, '').replace(/\/(index\.html)?$/, '').split('/').pop();
    if (!slug) return m;
    const label = slug
      .replace(/-/g, ' ')
      .replace(/\b(pdf|upi|sms|ocr|ai|gst|kyc)\b/gi, (s) => s.toUpperCase())
      .replace(/^./, (c) => c.toUpperCase());
    return `<a${attrs}>Learn more<span class="sr-only"> about ${label}</span></a>`;
  });
}

// Easy Peeze home: the 3D Peezy (three.js + an 8 MB model) starts on first interaction;
// a still of the same pose shows until the scene is live.
function deferHero3d(html) {
  if (!/id=["']home-peezy-scene["']/.test(html)) return html;
  html = html.replace(/<script type="module" src="(hero\/hero\.js[^"]*)"><\/script>/i, (m, src) => {
    const load =
      `var s=document.createElement('script');s.type='module';s.src='${src}';document.head.appendChild(s);` +
      "var el=document.getElementById('home-peezy-scene');if(!el)return;var done=function(){el.classList.add('is-live');mo.disconnect()};" +
      "var mo=new MutationObserver(function(){if(el.querySelector('canvas')&&el.querySelector('.peezy-say.is-on'))setTimeout(done,150)});" +
      'mo.observe(el,{subtree:true,childList:true,attributes:true,attributeFilter:["class"]});setTimeout(done,20000);';
    return `<script data-perf-hero>${onIntent(load)}</script>`;
  });
  if (!/data-perf-poster/.test(html) && /data-perf-hero/.test(html)) {
    const preload =
      '<link rel="preload" as="image" href="/hero/peezy-poster-920.webp" ' +
      'imagesrcset="/hero/peezy-poster-460.webp 1x, /hero/peezy-poster-920.webp 2x" fetchpriority="high" data-perf-poster />\n  ';
    const at = html.search(/<link\b[^>]*data-perf-font|<style data-perf-css/i);
    if (at >= 0) html = html.slice(0, at) + preload + html.slice(at);
  }
  return html;
}

function applyPerf(html, siteDir, cfg, pagePath) {
  const origin = (cfg.site && cfg.site.origin ? cfg.site.origin : '').replace(/\/$/, '');
  html = deferAnalytics(html, cfg);
  html = inlineLocalCss(html, siteDir, pagePath);
  html = selfHostFonts(html, siteDir);
  html = optimizeImages(html, siteDir, pagePath, origin);
  html = lazyBelowFold(html);
  html = html.replace(/<img\b[^>]*fetchpriority=["']high["'][^>]*>/gi, (tag) => tag.replace(/\sdecoding=["']async["']/i, ''));
  html = describeLearnMore(html);
  html = deferHero3d(html);
  return html;
}

function buildSite(key, opts) {
  const meta = SITES[key];
  if (!meta) throw new Error(`Unknown site ${key}`);
  const cfg = loadConfig(meta.dir, meta.configName);
  console.log(`\n=== SEO build: ${meta.label} (${cfg.site.origin}) ===`);

  const files = walkHtmlFiles(meta.dir, cfg.skipPaths || []);
  const sitemapEntries = [];
  let updated = 0;

  for (const file of files) {
    const pagePath = fileToUrlPath(meta.dir, file);
    // Skip non-page assets mistakenly named .html in odd places - keep all
    const page = Object.assign({}, cfg.defaults || {}, cfg.pages && cfg.pages[pagePath] ? cfg.pages[pagePath] : {});
    let html = fs.readFileSync(file, 'utf8');
    if (!/<html[\s>]/i.test(html)) continue;

    const before = html;
    const result = applyPageSeo(html, cfg, pagePath, page);
    html = applyPerf(result.html, meta.dir, cfg, pagePath);

    if (html !== before) {
      if (!opts.dryRun) fs.writeFileSync(file, html, 'utf8');
      updated += 1;
    }

    const inSitemap =
      page.sitemap !== false &&
      !page.noindex &&
      !result.noindex &&
      !excludedFromSitemap(cfg, pagePath);

    if (inSitemap) {
      const origin = cfg.site.origin.replace(/\/$/, '');
      sitemapEntries.push({
        path: pagePath,
        loc: origin + (pagePath === '/' ? '/' : pagePath),
        lastmod: page.lastmod || TODAY,
        changefreq: page.changefreq || cfg.defaults.changefreq || 'monthly',
        priority: page.priority != null ? page.priority : cfg.defaults.priority || 0.5,
      });
    }
  }

  writeSitemap(cfg, sitemapEntries, path.join(meta.dir, 'sitemap.xml'), opts.dryRun);
  writeRobots(cfg, path.join(meta.dir, 'robots.txt'), opts.dryRun);
  const gtagPages = applyGtagToTree(meta.dir, cfg.site && cfg.site.gtagId, opts.dryRun);
  const ampPages = applyAmplitudeToTree(
    meta.dir,
    cfg.site && cfg.site.amplitudeApiKey,
    opts.dryRun,
    ['/khsynloyrebnsbyo/']
  );
  console.log(`  pages touched: ${updated}/${files.length}${opts.dryRun ? ' (dry-run)' : ''}`);
  console.log(`  gtag: ${gtagPages} html file(s)`);
  console.log(`  amplitude: ${ampPages} html file(s)`);
}

function buildLocal(siteDir, opts) {
  const cfg = loadConfig(siteDir, 'seo.config.js');
  const label = cfg.site && cfg.site.name ? cfg.site.name : path.basename(siteDir);
  console.log(`\n=== SEO build: ${label} (${cfg.site.origin}) [local] ===`);

  const files = walkHtmlFiles(siteDir, cfg.skipPaths || []);
  const sitemapEntries = [];
  let updated = 0;

  for (const file of files) {
    const pagePath = fileToUrlPath(siteDir, file);
    const page = Object.assign(
      {},
      cfg.defaults || {},
      cfg.pages && cfg.pages[pagePath] ? cfg.pages[pagePath] : {}
    );
    let html = fs.readFileSync(file, 'utf8');
    if (!/<html[\s>]/i.test(html)) continue;

    const before = html;
    const result = applyPageSeo(html, cfg, pagePath, page);
    html = applyPerf(result.html, siteDir, cfg, pagePath);

    if (html !== before) {
      if (!opts.dryRun) fs.writeFileSync(file, html, 'utf8');
      updated += 1;
    }

    const inSitemap =
      page.sitemap !== false &&
      !page.noindex &&
      !result.noindex &&
      !excludedFromSitemap(cfg, pagePath);

    if (inSitemap) {
      const origin = cfg.site.origin.replace(/\/$/, '');
      sitemapEntries.push({
        path: pagePath,
        loc: origin + (pagePath === '/' ? '/' : pagePath),
        lastmod: page.lastmod || TODAY,
        changefreq: page.changefreq || cfg.defaults.changefreq || 'monthly',
        priority: page.priority != null ? page.priority : cfg.defaults.priority || 0.5,
      });
    }
  }

  writeSitemap(cfg, sitemapEntries, path.join(siteDir, 'sitemap.xml'), opts.dryRun);
  writeRobots(cfg, path.join(siteDir, 'robots.txt'), opts.dryRun);
  const gtagPages = applyGtagToTree(siteDir, cfg.site && cfg.site.gtagId, opts.dryRun);
  const ampPages = applyAmplitudeToTree(
    siteDir,
    cfg.site && cfg.site.amplitudeApiKey,
    opts.dryRun,
    ['/khsynloyrebnsbyo/']
  );
  console.log(`  pages touched: ${updated}/${files.length}${opts.dryRun ? ' (dry-run)' : ''}`);
  console.log(`  discovered HTML: ${files.length} | sitemap urls: ${sitemapEntries.length}`);
  console.log(`  gtag: ${gtagPages} html file(s)`);
  console.log(`  amplitude: ${ampPages} html file(s)`);
}

function main() {
  const opts = parseArgs(process.argv.slice(2));

  // GitHub Actions / site-root mode: seo.config.js next to this script or in cwd
  const scriptDir = __dirname;
  const localCandidates = [
    path.join(process.cwd(), 'seo.config.js'),
    path.join(scriptDir, 'seo.config.js'),
  ];
  const localConfig = localCandidates.find((p) => fs.existsSync(p));
  const inMonorepo =
    fs.existsSync(path.join(ROOT, 'easypeeze-website', 'seo.config.js')) &&
    fs.existsSync(path.join(ROOT, 'website', 'seo.config.js')) &&
    path.basename(scriptDir) === 'scripts';

  if (localConfig && !inMonorepo && opts.site === 'both') {
    buildLocal(path.dirname(localConfig), opts);
    console.log('\nSEO build done.');
    return;
  }

  const keys =
    opts.site === 'both'
      ? ['easypeeze', 'kharch']
      : opts.site === 'easypeeze' || opts.site === 'easy'
        ? ['easypeeze']
        : opts.site === 'kharch' || opts.site === 'kharchlog'
          ? ['kharch']
          : opts.site === 'local'
            ? null
            : null;

  if (opts.site === 'local' && localConfig) {
    buildLocal(path.dirname(localConfig), opts);
    console.log('\nSEO build done.');
    return;
  }

  if (!keys) {
    console.error('Use --site easypeeze | kharch | both | local');
    process.exit(1);
  }
  for (const k of keys) buildSite(k, opts);
  console.log('\nSEO build done.');
}

main();
