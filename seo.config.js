/**
 * Easy Peeze Tools — SEO source of truth.
 * Run: npm run seo:easypeeze   (or npm run seo)
 * Wired into: scripts/push-easypeeze-website.ps1
 */
module.exports = {
  site: {
    name: 'Easy Peeze Tools',
    origin: 'https://easypeeze.com',
    locale: 'en_IN',
    language: 'en-IN',
    themeColor: '#0085FF',
    defaultTitle: 'Easy Peeze Tools — Pdf Buddy & Kharch Log | Simple tools. Zero hassle.',
    titleTemplate: '%s | Easy Peeze Tools',
    defaultDescription:
      'Easy Peeze Tools: your data stays yours. Pdf Buddy — local Windows PDF editor. Kharch Log — expenses in your Google Sheet.',
    defaultOgImage: 'https://easypeeze.com/og-image.jpg',
    favicon: 'https://easypeeze.com/favicon.png',
    twitterCard: 'summary_large_image',
    author: 'Easy Peeze Tools',
    gtagId: 'G-VNHDP7MYHF',
  },

  organization: {
    '@type': 'Organization',
    '@id': 'https://easypeeze.com/#organization',
    name: 'Easy Peeze Tools',
    url: 'https://easypeeze.com/',
    logo: 'https://easypeeze.com/logo.png',
    email: 'easypeezetools@gmail.com',
    sameAs: ['https://kharchlog.com/'],
  },

  robots: {
    extra: [
      'User-agent: *',
      'Allow: /',
      'Disallow: /pay/',
      'Disallow: /ksadbwefreggh/',
      '',
      'Sitemap: https://easypeeze.com/sitemap.xml',
      '',
    ].join('\n'),
  },

  /** Paths that must never appear in sitemap (even if HTML exists). */
  excludeFromSitemap: [
    '/pay/',
    '/pay/success.html',
    '/ksadbwefreggh/',
  ],

  /** Glob-ish path prefixes skipped entirely by the injector. */
  skipPaths: ['/ksadbwefreggh/'],

  defaults: {
    changefreq: 'monthly',
    priority: 0.5,
    robots: 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1',
  },

  /**
   * Per-path overrides. Unlisted public pages keep existing title/description
   * but still get canonical, OG URL, sitemap entry, and base schema.
   */
  pages: {
    '/': {
      title: 'Easy Peeze Tools — Pdf Buddy & Kharch Log | Simple tools. Zero hassle.',
      description:
        'Easy Peeze Tools: your data stays yours. Pdf Buddy — 100% local Windows PDF editor (3 free edits/day, then ₹299/year or ₹999 lifetime). Kharch Log — expenses in your Google Sheet (₹149 lifetime).',
      changefreq: 'weekly',
      priority: 1.0,
      schemaType: 'WebSite',
    },
    '/products/': {
      title: 'Products — Pdf Buddy & Kharch Log',
      description: 'Pdf Buddy for Windows and Kharch Log for Android — simple tools from Easy Peeze Tools.',
      priority: 0.7,
      changefreq: 'weekly',
    },
    '/features/': {
      title: 'Pdf Buddy features — edit, merge, split, compress, OCR, sign',
      description: 'All Pdf Buddy tools: edit PDF text, merge, split, compress, OCR, unlock, and e-sign on Windows — files stay on your PC.',
      priority: 0.8,
      changefreq: 'weekly',
    },
    '/pricing/': {
      title: 'Pricing — Pdf Buddy & Kharch Log',
      description: 'Pdf Buddy from ₹299/year. Kharch Log lifetime ₹149. Pay in INR (Razorpay) or USD (PayPal).',
      priority: 0.8,
      changefreq: 'weekly',
    },
    '/download/': {
      title: 'Download Pdf Buddy for Windows',
      description: 'Download Pdf Buddy — free PDF editor for Windows with 3 edits/day. No upload, files stay local.',
      priority: 0.8,
    },
    '/blog/': {
      title: 'Blog — PDF tips for India',
      description: 'Guides on merge, compress, OCR, KYC PDFs, and offline PDF editing for Indian workflows.',
      priority: 0.8,
      changefreq: 'weekly',
    },
    '/guides/': {
      title: 'Guides — PDF editor how-tos',
      description: 'Step-by-step Pdf Buddy guides: Adobe alternatives, compress for WhatsApp, e-sign vs DSC, and more.',
      priority: 0.8,
      changefreq: 'weekly',
    },
    '/faq/': {
      title: 'FAQ — Easy Peeze Tools',
      description: 'Answers about Pdf Buddy, Kharch Log, pricing, privacy, and refunds.',
      priority: 0.7,
      schemaType: 'FAQPage',
    },
    '/about/': {
      title: 'About Easy Peeze Tools',
      description: 'Who we are — local-first Pdf Buddy and Kharch Log expense tracking for India.',
      priority: 0.6,
    },
    '/contact/': {
      title: 'Contact Easy Peeze Tools',
      description: 'Email easypeezetools@gmail.com for Pdf Buddy and Kharch Log support.',
      priority: 0.5,
      changefreq: 'yearly',
    },
    '/privacy/': {
      title: 'Privacy Policy',
      description: 'How Easy Peeze Tools handles data for Pdf Buddy and Kharch Log.',
      priority: 0.3,
      changefreq: 'yearly',
    },
    '/terms/': {
      title: 'Terms of Service',
      description: 'Terms for Pdf Buddy and Kharch Log licenses from Easy Peeze Tools.',
      priority: 0.3,
      changefreq: 'yearly',
    },
    '/refund/': {
      title: 'Refund Policy',
      description: 'Refund policy for Pdf Buddy and Kharch Log digital licenses.',
      priority: 0.3,
      changefreq: 'yearly',
    },
    '/pay/': {
      title: 'Pay — Pdf Buddy | Easy Peeze Tools',
      description: 'Unlock Pdf Buddy yearly or lifetime. Free tier: 3 edits/day with no subscription.',
      noindex: true,
      sitemap: false,
    },
  },
};
