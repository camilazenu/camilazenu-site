// POST /api/newsletter {name, email, page} — the site's newsletter pop-up.
// Forwards the sign-up to a Zapier workflow that adds it to Camila's CZ Leads board in Monday;
// her existing Monday → Kit sync then subscribes them in Kit.
// The Zapier catch-hook URL lives in the ZAPIER_SIGNUP_HOOK environment variable, never in the repo.
import type { Config } from "@netlify/functions"

const clean = (v: unknown, max: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max)

export default async (req: Request) => {
  const body = await req.json().catch(() => ({}))
  // Honeypot: real people never fill the hidden "company" field.
  if (clean(body.company, 200)) return Response.json({ ok: true })

  const email = clean(body.email, 200).toLowerCase()
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return Response.json({ error: "Please enter a valid email." }, { status: 400 })

  const hook = Netlify.env.get("ZAPIER_SIGNUP_HOOK")?.trim()
  if (!hook) {
    console.error("ZAPIER_SIGNUP_HOOK is not set; newsletter sign-up not forwarded", email)
    return Response.json({ error: "Sign-ups are briefly unavailable." }, { status: 503 })
  }

  const res = await fetch(hook, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      form: "newsletter",
      name: clean(body.name, 120),
      email,
      page: clean(body.page, 200),
      submitted_at: new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles", dateStyle: "medium", timeStyle: "short" }),
    }),
  })
  if (!res.ok) {
    console.error("Zapier hook returned", res.status)
    return Response.json({ error: "Please try again in a moment." }, { status: 502 })
  }
  return Response.json({ ok: true })
}

export const config: Config = {
  path: "/api/newsletter",
  method: "POST",
  rateLimit: { windowLimit: 5, windowSize: 60, aggregateBy: ["ip", "domain"] },
}
