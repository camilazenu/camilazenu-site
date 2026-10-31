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

const compActive = (comp: Comp | null) =>
  !!comp && Date.parse(`${comp.until}T23:59:59-08:00`) >= Date.now()

/** Paid (active/trialing) or complimentary access. Past-due and canceled lose access. */
export async function accessFor(context: Context, rec: MemberRecord) {
  const paid = rec.status === "active" || rec.status === "trialing"
  const comp = await getComp(context, rec.email)
  return { member: paid || compActive(comp), paid, comp: compActive(comp) ? comp : null }
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

export interface Replay {
  uid: string
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
  kind: "prompt" | "post"
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
