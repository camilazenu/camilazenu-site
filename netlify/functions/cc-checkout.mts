// POST /api/cc/checkout {plan: "full"|"installment"} — Creator Consciousness enrollment via Stripe Checkout.
import type { Context } from "@netlify/functions"
import { fail, json, stripe } from "../lib/academy.mts"

const LOOKUP = { full: "cc_full", installment: "cc_installment" } as const

export default async (req: Request, _context: Context) => {
  const { plan } = await req.json().catch(() => ({}))
  if (plan !== "full" && plan !== "installment") return fail("Choose a payment option.", 400)
  const s = stripe()
  const prices = await s.prices.list({ lookup_keys: [LOOKUP[plan as keyof typeof LOOKUP]], active: true, limit: 1 })
  const price = prices.data[0]
  if (!price) return fail("Enrollment isn't available right now.", 500)

  const origin = new URL(req.url).origin
  const metadata = { offer: "creator-consciousness", plan }
  const common = {
    line_items: [{ price: price.id, quantity: 1 }],
    allow_promotion_codes: true,
    phone_number_collection: { enabled: true },
    metadata,
    success_url: `${origin}/creator-consciousness?enrolled=1`,
    cancel_url: `${origin}/creator-consciousness#pricing`,
  }
  const session =
    plan === "full"
      ? await s.checkout.sessions.create({
          ...common,
          mode: "payment",
          customer_creation: "always",
          invoice_creation: { enabled: true, invoice_data: { metadata } },
          payment_intent_data: { metadata },
        })
      : await s.checkout.sessions.create({ ...common, mode: "subscription", subscription_data: { metadata } })
  return json({ url: session.url })
}

export const config = { path: "/api/cc/checkout", method: "POST" }
