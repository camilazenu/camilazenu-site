// GET /api/academy/me — who am I, and what can I access?
import type { Context } from "@netlify/functions"
import { accessFor, academyOpen, currentUser, getLibraries, getRecord, isAdmin, json, notifyAccess, OPENS_AT, saveRecord, store } from "../lib/academy.mts"

export default async (req: Request, context: Context) => {
  const user = await currentUser()
  if (!user) return json({ loggedIn: false, open: academyOpen(context), opensAt: OPENS_AT })
  const rec = await getRecord(context, user)
  const isNew = !(await store(context).get(`users/${user.id}`, { type: "text" }))
  if (isNew) {
    // First visit after signing up: keep a record so the roster shows the account, and tell the Leads board.
    await saveRecord(context, rec)
    await notifyAccess(context, rec.email, "account-created", user.name)
  } else if (rec.email && !(await store(context).get(`emails/${rec.email.toLowerCase()}`, { type: "text" }))) {
    await store(context).set(`emails/${rec.email.toLowerCase()}`, rec.userId) // accounts made before the email index
  }
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
    cc: access.cc,
    libraries: (await getLibraries(context)).filter((l) => access.libraries.includes(l.id)).map((l) => l.name),
    hasBilling: !!rec.customerId,
    foundersRsvp: !!rec.foundersRsvp,
    admin: isAdmin(user),
  })
}

export const config = { path: "/api/academy/me", method: ["GET", "POST"] }
