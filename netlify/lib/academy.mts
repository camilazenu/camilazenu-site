// Shared server-side helpers for Creator Academy.
// Secrets (Stripe, Cloudflare) come from Netlify environment variables only.
// Member data, Zoom links, replay IDs and posts live in Netlify Blobs, never in the repo.
import { getStore } from "@netlify/blobs"
import { getUser, admin, type User } from "@netlify/identity"
import Stripe from "stripe"
import type { Context } from "@netlify/functions"

/** Doors open Wed Nov 4, 2026, 12:00 AM PT. Previews are always open for testing. */
export const OPENS_AT = Date.parse("2026-11-04T08:00:00Z")

export const isProduction = (context: Context) => context.deploy?.context === "production"

export const academyOpen = (context: Context) => !isProduction(context) || Date.now() >= OPENS_AT

/** Production and previews use separate stores so tests never touch real member data. */
export const store = (context: Context) =>
  getStore({ name: isProduction(context) ? "academy" : "academy-preview", consistency: "strong" })

let stripeClient: Stripe | undefined
export const stripe = () => {
  const key = Netlify.env.get("STRIPE_SECRET_KEY")?.trim()
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set")
  stripeClient ??= new Stripe(key)
  return stripeClient
}

export const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { "cache-control": "no-store" } })

export const fail = (message: string, status: number) => json({ error: message }, status)

// ── Member records ───────────────────────────────────────────────

export interface MemberRecord {
  userId: string
  email: string
  name?: string
  customerId?: string
  subscriptionId?: string
  status?: Stripe.Subscription.Status | "none"
  plan?: "monthly" | "yearly"
  periodEnd?: number // unix seconds
  cancelAtPeriodEnd?: boolean
  trialUsed?: boolean
  foundersRsvp?: boolean
  createdAt: number
  updatedAt: number
}

export interface Comp {
  email: string
  until: string // YYYY-MM-DD
  note?: string
}

const userKey = (id: string) => `users/${id}`
const customerKey = (id: string) => `customers/${id}`
const compKey = (email: string) => `comps/${email.trim().toLowerCase()}`
const alumniKey = (email: string) => `ccalumni/${email.trim().toLowerCase()}`

export async function getRecord(context: Context, user: Pick<User, "id" | "email" | "name">) {
  const s = store(context)
  const rec = (await s.get(userKey(user.id), { type: "json" })) as MemberRecord | null
  if (rec) return rec
  const now = Date.now()
  return { userId: user.id, email: user.email ?? "", name: user.name, createdAt: now, updatedAt: now } as MemberRecord
}

export async function saveRecord(context: Context, rec: MemberRecord) {
  rec.updatedAt = Date.now()
  await store(context).setJSON(userKey(rec.userId), rec)
  if (rec.customerId) await store(context).set(customerKey(rec.customerId), rec.userId)
  if (rec.email) await store(context).set(`emails/${rec.email.trim().toLowerCase()}`, rec.userId)
}

export async function userIdForCustomer(context: Context, customerId: string) {
  return await store(context).get(customerKey(customerId), { type: "text" })
}

export async function getRecordById(context: Context, userId: string) {
  return (await store(context).get(userKey(userId), { type: "json" })) as MemberRecord | null
}

export async function getComp(context: Context, email?: string) {
  if (!email) return null
  return (await store(context).get(compKey(email), { type: "json" })) as Comp | null
}

export async function setComp(context: Context, comp: Comp) {
  await store(context).setJSON(compKey(comp.email), { ...comp, email: comp.email.trim().toLowerCase() })
}

export async function removeComp(context: Context, email: string) {
  await store(context).delete(compKey(email))
}

/** Library access for one email (works before the person creates an account).
 *  Stored under ccalumni/{email} for continuity with the first version. */
export interface Alumni {
  email: string
  libraries?: string[] // library ids, e.g. ["cc2"]
  cohort?: string // first version only
  addedAt: number
  source: "stripe" | "admin"
}

export async function getAlumni(context: Context, email?: string) {
  if (!email) return null
  return (await store(context).get(alumniKey(email), { type: "json" })) as Alumni | null
}

/** Turn one library on or off for an email. Returns the person's libraries afterwards. */
export async function setLibraryAccess(context: Context, email: string, library: string, on: boolean, source: Alumni["source"] = "admin") {
  const e = email.trim().toLowerCase()
  const existing = await getAlumni(context, e)
  const libs = new Set(existing?.libraries ?? [])
  if (on) libs.add(library)
  else libs.delete(library)
  if (!libs.size && !on) {
    await store(context).delete(alumniKey(e))
    return []
  }
  await store(context).setJSON(alumniKey(e), {
    email: e, libraries: [...libs], addedAt: existing?.addedAt ?? Date.now(), source: existing?.source ?? source,
  } satisfies Alumni)
  return [...libs]
}

export async function removeAlumni(context: Context, email: string) {
  await store(context).delete(alumniKey(email))
}

const compActive = (comp: Comp | null) =>
  !!comp && Date.parse(`${comp.until}T23:59:59-08:00`) >= Date.now()

/** Gates:
 *  member    — Creator Academy (paid, or complimentary until a date). Past-due and canceled lose it.
 *  libraries — the Creator Consciousness rounds this email was part of (CC 1.0, 2.0 …), each its own library. */
export async function accessFor(context: Context, rec: Pick<MemberRecord, "email" | "status">) {
  const paid = rec.status === "active" || rec.status === "trialing"
  const [comp, alumni] = await Promise.all([getComp(context, rec.email), getAlumni(context, rec.email)])
  const libraries = alumni?.libraries ?? []
  return { member: paid || compActive(comp), paid, comp: compActive(comp) ? comp : null, libraries, cc: libraries.length > 0 }
}

/** Which libraries a user may watch. Admins see everything. */
export const canWatch = (program: Program, a: { member: boolean; libraries: string[] }, admin: boolean) =>
  admin || (program === "academy" ? a.member : a.libraries.includes(program))

// ── Libraries ────────────────────────────────────────────────────

export interface Library {
  id: string
  name: string // "Creator Consciousness 2.0"
  short: string // "CC 2.0", also the label on the Leads board
}

export const DEFAULT_LIBRARIES: Library[] = ["1.0", "2.0", "3.0", "4.0"].map((v, i) => ({
  id: `cc${i + 1}`, name: `Creator Consciousness ${v}`, short: `CC ${v}`,
}))

export const getLibraries = async (context: Context) =>
  ((await store(context).get("content/libraries", { type: "json" })) as Library[] | null) ?? DEFAULT_LIBRARIES
export const saveLibraries = (context: Context, l: Library[]) => store(context).setJSON("content/libraries", l)

/** Free Creator Academy for past Creator Consciousness participants, through the end of 2026. */
export const ALUMNI_ACADEMY_UNTIL = "2026-12-31"

// ── Leads board sync (Monday, via Zapier) ────────────────────────

/** Tells the Leads board what this email can access now. Production only, so test data never reaches Monday. */
export async function notifyAccess(context: Context, email: string, event: string, name?: string) {
  const hook = Netlify.env.get("ZAPIER_ACCESS_HOOK")
  if (!hook || !isProduction(context) || !email) return
  try {
    const e = email.trim().toLowerCase()
    const userId = await store(context).get(`emails/${e}`, { type: "text" })
    const rec = userId ? await getRecordById(context, userId) : null
    const access = await accessFor(context, { email: e, status: rec?.status })
    const libs = await getLibraries(context)
    const academy = access.paid ? "Paid"
      : access.comp ? "Free trial"
      : rec?.status === "past_due" ? "Past due"
      : rec?.status === "canceled" ? "Canceled"
      : rec ? "Account only" : "Invited"
    await fetch(hook, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: e, name: name ?? rec?.name ?? "", event, academy,
        plan: access.paid ? rec?.plan ?? "" : "",
        academyUntil: access.paid ? (rec?.periodEnd ? new Date(rec.periodEnd * 1000).toISOString().slice(0, 10) : "") : access.comp?.until ?? "",
        rounds: libs.filter((l) => access.libraries.includes(l.id)).map((l) => l.short),
        hasAccount: !!rec,
      }),
    })
  } catch (err) {
    console.error("notifyAccess failed", email, err)
  }
}

// ── Auth ─────────────────────────────────────────────────────────

const adminEmails = () =>
  (Netlify.env.get("ACADEMY_ADMINS") ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)

export const isAdmin = (user: User) =>
  (user.roles ?? []).includes("admin") || adminEmails().includes((user.email ?? "").toLowerCase())

/** Logged-in Identity user or null. */
export async function currentUser() {
  try {
    return await getUser()
  } catch {
    return null
  }
}

/** Keep the Identity "member" role in step with Stripe so edge rules and the JWT agree.
 *  Role changes reach the user's browser on their next login or token refresh, not instantly;
 *  every function re-checks membership from Blobs, so access is never decided by a stale JWT. */
export async function syncRole(userId: string, member: boolean) {
  try {
    const u = await admin.getUser(userId)
    const roles = new Set(u.roles ?? [])
    if (member) roles.add("member")
    else roles.delete("member")
    await admin.updateUser(userId, { app_metadata: { ...(u.appMetadata ?? {}), roles: [...roles] } })
  } catch (err) {
    console.error("syncRole failed", userId, err)
  }
}

// ── Content (Zoom link, prompts, replays, posts) ─────────────────

export interface Settings {
  callTitle?: string
  callTime?: string // human text, e.g. "Tuesdays · 6:00 PM PT"
  nextCall?: string // ISO date-time of next call
  zoomUrl?: string
  foundersZoomUrl?: string
  welcome?: string
}

export type Program = string // "academy", or a library id such as "cc2" ("cc" = uploaded before libraries were split)

export interface Replay {
  uid: string
  program?: Program // missing = academy
  title: string
  date: string // YYYY-MM-DD
  note?: string
}

export interface Comment {
  id: string
  userId: string
  name: string
  body: string
  createdAt: number
}

export interface Post {
  id: string
  kind: "prompt" | "post" | "resource"
  title: string
  body: string
  createdAt: number
  comments: Comment[]
}

export const getSettings = async (context: Context) =>
  ((await store(context).get("content/settings", { type: "json" })) as Settings | null) ?? {}
export const saveSettings = (context: Context, s: Settings) => store(context).setJSON("content/settings", s)

export const getReplays = async (context: Context) =>
  ((await store(context).get("content/replays", { type: "json" })) as Replay[] | null) ?? []
export const saveReplays = (context: Context, r: Replay[]) => store(context).setJSON("content/replays", r)

export const getPosts = async (context: Context) =>
  ((await store(context).get("content/posts", { type: "json" })) as Post[] | null) ?? []
export const savePosts = (context: Context, p: Post[]) => store(context).setJSON("content/posts", p)

export const newId = () => crypto.randomUUID().replace(/-/g, "").slice(0, 16)

export const displayName = (user: User) =>
  (user.name || (user.userMetadata?.full_name as string) || (user.email ?? "Member").split("@")[0]).slice(0, 60)

// ── Cloudflare Stream ────────────────────────────────────────────

export function cloudflare() {
  const account = Netlify.env.get("CLOUDFLARE_ACCOUNT_ID")?.trim()
  const token = Netlify.env.get("CLOUDFLARE_STREAM_TOKEN")?.trim()
  if (!account || !token) throw new Error("Cloudflare Stream is not configured")
  return { base: `https://api.cloudflare.com/client/v4/accounts/${account}/stream`, token }
}
