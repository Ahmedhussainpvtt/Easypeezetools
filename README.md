# Easy Peeze Tools — website

Static site for **[https://easypeeze.com](https://easypeeze.com)** (GitHub Pages).

## Enable Pages
1. Repo Settings → Pages → Source: **GitHub Actions**
2. Push to `main` (workflow `.github/workflows/pages.yml`)
3. Temporary URL: `https://ahmedhussainpvtt.github.io/Easypeezetools/`
4. Custom domain **easypeeze.com** — add DNS (registrar), then set Pages custom domain:

### DNS (at your domain registrar)
| Type | Host | Value | TTL |
|------|------|-------|-----|
| **A** | `@` | `185.199.108.153` | 3600 |
| **A** | `@` | `185.199.109.153` | 3600 |
| **A** | `@` | `185.199.110.153` | 3600 |
| **A** | `@` | `185.199.111.153` | 3600 |
| **AAAA** | `@` | `2606:50c0:8000::153` | 3600 |
| **AAAA** | `@` | `2606:50c0:8001::153` | 3600 |
| **AAAA** | `@` | `2606:50c0:8002::153` | 3600 |
| **AAAA** | `@` | `2606:50c0:8003::153` | 3600 |
| **CNAME** | `www` | `ahmedhussainpvtt.github.io` | 3600 |

Then GitHub → **Easypeezetools** → Settings → Pages → Custom domain: `easypeeze.com` → check **Enforce HTTPS** (after DNS propagates). Repo already has a `CNAME` file with `easypeeze.com`.

## Brand
- Easy Peeze Tools / Pdf Buddy
- Colors: navy `#0F2A43` + teal `#14B8A6` (Manrope)
