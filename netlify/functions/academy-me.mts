// GET /api/academy/me — who am I, and what can I access?
import type { Context } from "@netlify/functions"
import { accessFor, academyOpen, currentUser, getRecord, isAdmin, json, OPENS_AT, saveRecord } from "../lib/academy.mts"

export default async (req: Request, context: Context) => {
  const user = await currentUser()
  if (!user) return json({ loggedIn: false, open: academyOpen(context), opensAt: OPENS_AT })
  const rec = await getRecord(context, user)
  if (req.method === "POST") {
    // The only self-service flag: RSVP to the free Founders Call.
    const body = await req.json().catch(() => ({}))
    if (body.foundersRsvp === true) {
      rec.foundersRsvp = true
      await saveRecord(context, rec)
    }
  }
  const access = await accessFor(context, rec)
  return json({
    loggedIn: true,
    email: user.email,
    name: user.name,
    open: academyOpen(context),
    opensAt: OPENS_AT,
    member: access.member,
    paid: access.paid,
    comp: access.comp ? { until: access.comp.until } : null,
    status: rec.status ?? "none",
    plan: rec.plan ?? null,
    periodEnd: rec.periodEnd ?? null,
    cancelAtPeriodEnd: !!rec.cancelAtPeriodEnd,
    trialAvailable: !rec.trialUsed,
    hasBilling: !!rec.customerId,
    foundersRsvp: !!rec.foundersRsvp,
    admin: isAdmin(user),
  })
}

export const config = { path: "/api/academy/me", method: ["GET", "POST"] }
