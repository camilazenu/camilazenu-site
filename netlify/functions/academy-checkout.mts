// POST /api/academy/checkout {plan: "monthly"|"yearly"} — start Stripe Checkout for Creator Academy.
import type { Context } from "@netlify/functions"
import { accessFor, academyOpen, currentUser, fail, getRecord, json, saveRecord, stripe } from "../lib/academy.mts"

const LOOKUP = { monthly: "academy_monthly", yearly: "academy_yearly" } as const
const TRIAL_DAYS = 7

const handler = async (req: Request, context: Context) => {
  const user = await currentUser()
  if (!user) return fail("Please log in first.", 401)
  if (!academyOpen(context)) return fail("Doors open Wednesday, November 4.", 403)

  const { plan } = await req.json().catch(() => ({}))
  if (plan !== "monthly" && plan !== "yearly") return fail("Choose monthly or yearly.", 400)

  const rec = await getRecord(context, user)
  const access = await accessFor(context, rec)
  if (access.paid) return fail("You already have an active membership. Manage it from your account.", 409)

  const s = stripe()
  const prices = await s.prices.list({ lookup_keys: [LOOKUP[plan as keyof typeof LOOKUP]], active: true, limit: 1 })
  const price = prices.data[0]
  if (!price) return fail("That plan isn't available right now.", 500)

  if (!rec.customerId) {
    const customer = await s.customers.create({
      email: user.email,
      name: user.name || undefined,
      metadata: { identityUserId: user.id, source: "creator-academy" },
    })
    rec.customerId = customer.id
    await saveRecord(context, rec)
  }

  const origin = new URL(req.url).origin
  const trial = !rec.trialUsed && plan === "monthly"
  const session = await s.checkout.sessions.create({
    mode: "subscription",
    customer: rec.customerId,
    client_reference_id: user.id,
    line_items: [{ price: price.id, quantity: 1 }],
    allow_promotion_codes: true,
    subscription_data: {
      ...(trial ? { trial_period_days: TRIAL_DAYS } : {}),
      metadata: { offer: "creator-academy", plan, identityUserId: user.id },
    },
    metadata: { offer: "creator-academy", plan, identityUserId: user.id },
    success_url: `${origin}/academy/?welcome=1`,
    cancel_url: `${origin}/creator-academy#join`,
  })
  return json({ url: session.url })
}

export default async (req: Request, context: Context) => {
  try {
    return await handler(req, context)
  } catch (err) {
    const e = err as { type?: string; message?: string; code?: string }
    console.error("Stripe call failed", e?.type, e?.code, e?.message)
    // Stripe's own error text is safe to show; it never contains keys.
    const keyIssue = /api key/i.test(e?.message ?? "")
    return fail(e?.type?.startsWith("Stripe") && !keyIssue ? `Stripe: ${e.message}` : "Checkout is unavailable right now. Please try again.", 502)
  }
}

export const config = { path: "/api/academy/checkout", method: "POST" }
