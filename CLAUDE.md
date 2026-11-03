# Working on camilazenu.com (read this first)

Plain static site: HTML pages at the root, shared styles in `assets/`, Netlify Functions in `netlify/`.
`npm run build` copies everything into `dist/` (that is what Netlify serves).

## Branches
- `main` = what Netlify publishes to the public site. Never commit or push to `main`.
- `phase-1` = the new build (Woody / WvH Hospitality). Pull request #1 merges it into `main` at launch.
- `brand-refresh` = Camila's visual pass. Branched from `phase-1`; opens as a draft pull request into `phase-1`.
- Each pushed branch with an open pull request gets its own Netlify preview link. Preview links are private-ish test pages, not the live site.

## Where the look lives
- `assets/base.css`: brand tokens (colors in `:root`, fonts) and global styles. Change a token here and it changes everywhere.
- `assets/pages.css`: page layouts (offerings, events, Products I Love, etc.).
- `assets/menu.css`: top bar, slide-out menu, newsletter pop-up.
- `assets/academy.css`: Creator Academy member area.
- `about.html` and `creator-consciousness.html` also carry their own `<style>` block.
- Fonts load from Google Fonts in each page's `<head>`. Images live in `img/`.

## Hands off (function, not looks)
- `netlify/` (payments, logins, member access), `netlify.toml`, `package.json`, `scripts/`, `assets/vendor/`.
- `assets/menu.js` logic, `assets/academy-client.js`, inline `<script>` blocks, `data-*` attributes, form field names, element `id`s, and checkout/booking link URLs. Restyle these elements freely; don't rename or remove them.
- Never put API keys, passwords, Zoom links, member recordings, or private links in this repo. It is public.
