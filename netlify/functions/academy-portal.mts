// POST /api/academy/portal — open the Stripe customer portal (update card, switch plan, cancel).
import type { Context } from "@netlify/functions"
import { currentUser, fail, getRecord, json, stripe } from "../lib/academy.mts"

export default async (req: Request, context: Context) => {
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

export const config = { path: "/api/academy/portal", method: "POST" }
