# Working on camilazenu.com (read this first)

This guide is for Camila and her Claude, and for Woody. It says what Camila can publish herself and what waits for Woody.

Plain static site: HTML pages at the root, shared styles in `assets/`, Netlify Functions in `netlify/`.
`npm run build` copies everything into `dist/` (that is what Netlify serves).

## Painting and plumbing

**Painting is Camila's to publish.** Words, pictures, colors and styles.

**Plumbing waits for Woody.** Anything that moves money, information or people through the site:

- prices, anywhere they appear
- Stripe checkout buttons and plans
- forms and their fields and choices (the newsletter pop-up, the waitlist)
- where any button or link goes
- booking links (Calendly)
- adding, removing or renaming a page
- the menu (`assets/menu.js`), the events list's links, and the site's settings and script files
- the member area's logic: logins, access, replays (`netlify/`, `assets/academy-client.js`)
- the Terms and Privacy pages
- anything tied to Monday, Zapier, Stripe, Kit or email

## How a change goes live

1. Pull first: `git pull` before you edit, every time.
2. Make the change on a new branch. Never push straight to `main`.
3. Open a pull request into `main`.
4. Two things appear on the pull request within a minute or two:
   - a **preview link** from Netlify, showing the site with the change
   - the **Plumbing check**, which turns green or red
5. Show Camila the preview.

**Green ("Painting only"):** when Camila says yes, merge it. The live site updates in about a minute. Check the live page afterward.

**Red ("Plumbing change"):** don't merge it. Send it to Woody in Slack as a "Plumbing request for Woody" with the pull request link and one line on what Camila wants. Woody reviews and merges it.

If one request mixes painting and plumbing, split it: publish the painting now and send the plumbing to Woody.

## Rules

- Never push straight to `main`.
- Never edit the Plumbing check, this guide, or anything in `.github/`.
- Never reword a red change to get it past the check. If the check looks wrong, tell Woody.
- If no preview link appears, stop and tell Woody. Don't merge without Camila seeing the preview.
- Never put API keys, passwords, Zoom links, member recordings, or private links in this repo. It is public.

## Where the look lives (painting)

- `assets/base.css`: brand tokens (colors in `:root`, fonts) and global styles. Change a token here and it changes everywhere.
- `assets/pages.css`: page layouts (offerings, events, Products I Love, Terms and Privacy, etc.).
- `assets/menu.css`: top bar, slide-out menu, newsletter pop-up.
- `assets/academy.css`: Creator Academy member area.
- `about.html` and `creator-consciousness.html` also carry their own `<style>` block.
- Fonts load from Google Fonts in each page's `<head>`. Images live in `img/`.
- Event wording and dates live in `assets/events.json`. Changing an event's words or dates is painting; changing where its button goes is plumbing.

## Hands off (plumbing)

- `netlify/` (payments, logins, member access), `netlify.toml`, `package.json`, `scripts/`, `assets/vendor/`.
- `assets/menu.js` (the menu and the "Book a call" link), `assets/academy-client.js`, inline `<script>` blocks, `data-*` attributes, form field names, element `id`s, and checkout/booking link URLs. Restyle these elements freely; don't rename or remove them.
- `terms.html` and `privacy.html`.

## Camila's standing choices

- Quiet and editorial: flat, no gradients or shadows, no all-caps labels, no emojis or sparkle marks.
- Brown, not black. Buttons in brown with bone text.
- She goes by Camila Zenu on the site.
