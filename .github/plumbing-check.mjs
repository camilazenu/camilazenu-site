// Plumbing check for camilazenu.com pull requests.
//
// Camila (and her Claude) may merge "painting" changes herself: words, pictures, colors, styles.
// Anything that moves money, data or people through the site is "plumbing" and waits for Woody.
// This check fails when a pull request touches plumbing, so it's obvious which is which.
//
// Plumbing = a protected file changed, a page added or removed, or any price, link, checkout,
// form, form field or script changed anywhere (even inside a page that is otherwise just words).
//
// This site is plain HTML at the top of the repository: every public page is a .html file there.
// The member area pages live in academy/, payments, logins and member access in netlify/,
// the menu and the "Book a call" link in assets/menu.js, and the events list in assets/events.json.

import { execSync } from "node:child_process";

const base = process.env.BASE_SHA;
const head = process.env.HEAD_SHA;
const sh = (cmd) => execSync(cmd, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });

// Files that are always plumbing.
const PROTECTED = [
  /^assets\/[^/]+\.js$/,          // menu.js (menu + booking link), academy-client.js (member area)
  /^assets\/vendor\//,            // login and video-upload libraries
  /^terms\.html$/,                // legal: terms, prices and renewals
  /^privacy\.html$/,              // legal: privacy policy
  /^_redirects$/,
  /^_headers$/,
  /^netlify\.toml$/,
  /^netlify\//,                   // payments, logins, member access, newsletter sign-up
  /^scripts\//,                   // the build
  /^sitemap\.xml$/,
  /^robots\.txt$/,
  /^llms\.txt$/,
  /^package(-lock)?\.json$/,
  /^\.gitignore$/,
  /^\.github\//,
  /^CLAUDE\.md$/,                 // the editing guide
];

// A page is any .html file at the top of the repository, or in the member area (academy/).
// Member-area pages are checked like any other page: their wording and look are painting,
// their scripts, ids, data-* hooks, forms and links are plumbing.
const isPage = (file) => /^(academy\/)?[^/]+\.html$/.test(file);

// Addresses that are painting, not plumbing: fonts and the standard SVG namespace.
const paintingAddress = (u) =>
  /^https?:\/\/fonts\.(googleapis|gstatic)\.com\b/i.test(u) ||
  /^https?:\/\/www\.w3\.org\//i.test(u) ||
  /\.(png|jpe?g|webp|gif|svg|avif|heic|woff2?|mp4|mov)(\?[^\s]*)?$/i.test(u);

// Things inside any file that are plumbing: prices, links, checkouts, forms, their fields, and scripts.
// A stylesheet or picture link may carry a version tag (base.css?v=20261124) that changes with every
// style update. Styles are painting, so the tag is ignored. Script files are protected on their own.
const stripVersions = (t) => t.replace(/(\.(?:css|png|jpe?g|webp|gif|svg|avif|woff2?))\?v=[\w.-]+/gi, "$1");

function plumbingTokens(raw) {
  const text = stripVersions(raw);
  const out = [];
  const grab = (re, tag) => { for (const m of text.matchAll(re)) out.push(`${tag}:${m.slice(1).filter(Boolean).join("=") || m[0]}`); };
  // Whole <script> blocks (checkout buttons, sign-up pop-up, events list)
  grab(/<script\b[^>]*>[\s\S]*?<\/script>/g, "script");
  // Prices: any dollar amount, anywhere
  grab(/\$\s?\d[\d,]*(?:\.\d+)?/g, "price");
  // Links (pictures and fonts are painting, so their addresses are skipped)
  for (const m of text.matchAll(/https?:\/\/[^\s"'<>`)]+/g)) {
    if (!paintingAddress(m[0])) out.push(`url:${m[0]}`);
  }
  for (const m of text.matchAll(/\bhref\s*=\s*["']([^"']*)["']/g)) {
    if (!paintingAddress(m[1])) out.push(`href:${m[1]}`);
  }
  grab(/\baction\s*=\s*["']([^"']*)["']/g, "action");
  // Forms and their fields
  grab(/<(form|input|select|option|textarea|button|iframe)\b[^>]*>/g, "tag");
  grab(/\bname\s*=\s*["']([^"']*)["']/g, "name");
  grab(/<option\b[^>]*>([^<]*)/g, "option"); // a choice's wording is also the answer the form sends
  grab(/\b(data-netlify|netlify-honeypot|form-name)\b/g, "netlify");
  // Hooks the site's scripts use to fill in checkout buttons, plans and forms
  grab(/\b(data-[a-z0-9-]+)\s*=\s*["']([^"']*)["']/g, "data");
  grab(/\bid\s*=\s*["']([^"']*)["']/g, "id");
  grab(/\b(on[a-z]+)\s*=\s*["']([^"']*)["']/g, "handler");
  grab(/<meta\s+name=["']robots["'][^>]*>/g, "robots");
  // Where an event's button goes (assets/events.json)
  grab(/"(href|url|link|cta|ctaHref|buttonHref|formName|formId|external)"\s*:\s*("[^"]*"|true|false)/g, "jsonlink");
  return out.sort();
}

const show = (sha, file) => { try { return sh(`git show ${sha}:"${file}"`); } catch { return null; } };

const changed = sh(`git diff --name-status ${base} ${head}`).trim().split("\n").filter(Boolean);
const problems = [];

for (const line of changed) {
  const [status, ...rest] = line.split("\t");
  const file = rest[rest.length - 1];
  const paths = rest; // a rename lists the old and the new name
  if (paths.some((p) => PROTECTED.some((re) => re.test(p)))) {
    // A protected page whose only change is a stylesheet version tag is still painting.
    const was = show(base, file), now = show(head, file);
    if (status === "M" && was !== null && now !== null && stripVersions(was) === stripVersions(now)) continue;
    problems.push(`${file}: protected plumbing file`);
    continue;
  }
  if (paths.some(isPage) && /^[ADR]/.test(status)) { problems.push(`${file}: page added, removed or renamed`); continue; }
  if (/\.(png|jpe?g|webp|gif|svg|avif|heic|woff2?|mp4|mov|ico)$/i.test(file)) continue; // pictures, video and fonts are painting
  const before = show(base, file) ?? "";
  const after = show(head, file) ?? "";
  const a = plumbingTokens(before).join("\n");
  const b = plumbingTokens(after).join("\n");
  if (a !== b) problems.push(`${file}: a price, link, checkout, form, form field or script changed`);
}

const summary = problems.length
  ? `## Plumbing change: Woody merges this one\n\n${problems.map((p) => `- ${p}`).join("\n")}\n\nSend it to Woody as a "Plumbing request for Woody" in Slack.`
  : `## Painting only: Camila can merge this herself\n\nNo prices, links, checkouts, forms, scripts, protected files or pages were changed.`;

if (process.env.GITHUB_STEP_SUMMARY) sh(`cat >> "$GITHUB_STEP_SUMMARY" <<'EOF_SUMMARY'\n${summary}\nEOF_SUMMARY`);
console.log(summary);
process.exit(problems.length ? 1 : 0);
