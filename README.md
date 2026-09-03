# Easy Peeze Tools — website

Static site for **https://easypeeze.com** (GitHub Pages).

Repo: https://github.com/Ahmedhussainpvtt/Easypeezetools

## Enable Pages (required once)

1. Open **Settings → Pages**
2. **Build and deployment → Source:** Deploy from a branch
3. Branch: **main** / folder: **/ (root)** → Save
4. Site URL: `https://ahmedhussainpvtt.github.io/Easypeezetools/`

## Connect easypeeze.com later

1. Rename `CNAME.example` → `CNAME` (contents: `easypeeze.com`)
2. In Pages → Custom domain → `easypeeze.com`
3. Point DNS (A/AAAA or CNAME) at GitHub Pages

Canonical URLs already use `https://easypeeze.com` for SEO.

## What’s included

- Homepage + 8 feature SEO pages (edit/merge/split/compress/sign/OCR/unlock/convert)
- Blog (6 posts), glossary (12 terms), pricing, FAQ, contact, privacy, terms
- Schema.org JSON-LD, sitemap.xml, robots.txt
- Brand: navy `#0F2A43` + teal `#14B8A6`, Manrope (same as Kharch Log)

## Regenerate from ExpenseTracker

```powershell
py -3 scripts/generate-easypeeze-site.py
# then sync easypeeze-website/ → this repo and push
```
