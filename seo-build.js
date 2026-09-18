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
  return m ? m[1] || m[2] || '' : '';
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

function applyGtagToTree(siteDir, gtagId, dryRun) {
  if (!gtagId) return 0;
  let n = 0;
  for (const file of walkHtmlFiles(siteDir, [])) {
    const html = fs.readFileSync(file, 'utf8');
    const next = ensureGtag(html, gtagId);
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
    const next = ensureAmplitude(html, apiKey);
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
      /<script\b[^>]*id=["']seo-jsonld["'][^>]*>[\s\S]*?<\/script>\s*/i,
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

  html = ensureGtag(html, cfg.site && cfg.site.gtagId);
  if (!String(pagePath || '').startsWith('/ksadbwefreggh')) {
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
    html = result.html;

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
    ['/ksadbwefreggh/']
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
    html = result.html;

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
    ['/ksadbwefreggh/']
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
