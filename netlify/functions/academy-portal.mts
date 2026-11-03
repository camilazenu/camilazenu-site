// POST /api/academy/portal — open the Stripe customer portal (update card, switch plan, cancel).
import type { Context } from "@netlify/functions"
import { currentUser, fail, getRecord, json, stripe } from "../lib/academy.mts"

const handler = async (req: Request, context: Context) => {
  const user = await currentUser()
  if (!user) return fail("Please log in first.", 401)
  const rec = await getRecord(context, user)
  if (!rec.customerId) return fail("No billing account yet.", 404)
  const session = await stripe().billingPortal.sessions.create({
    customer: rec.customerId,
    return_url: `${new URL(req.url).origin}/academy/#account`,
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

export const config = { path: "/api/academy/portal", method: "POST" }
