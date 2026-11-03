// GET /api/academy/content — gated content. Zoom links and replay IDs never ship in the static site.
// Academy members: weekly call, prompts, resources, Academy replays.
// Creator Consciousness alumni: the CC video library.
import type { Context } from "@netlify/functions"
import { accessFor, currentUser, fail, getPosts, getRecord, getReplays, getSettings, isAdmin, json, type Replay } from "../lib/academy.mts"

const list = (rs: Replay[]) =>
  [...rs].sort((a, b) => b.date.localeCompare(a.date)).map(({ uid, title, date, note }) => ({ uid, title, date, note }))

export default async (_req: Request, context: Context) => {
  const user = await currentUser()
  if (!user) return fail("Please log in.", 401)
  const settings = await getSettings(context)
  const rec = await getRecord(context, user)
  const access = await accessFor(context, rec)
  const admin = isAdmin(user)
  const academy = access.member || admin
  const cc = access.cc || admin

  const out: Record<string, unknown> = {
    academy, cc,
    founders: { zoomUrl: rec.foundersRsvp || academy ? settings.foundersZoomUrl ?? null : null },
  }
  if (!academy && !cc) return json(out)

  const replays = await getReplays(context)
  if (cc) out.ccReplays = list(replays.filter((r) => r.program === "cc"))
  if (academy) {
    const posts = await getPosts(context)
    out.call = { title: settings.callTitle ?? "Weekly Live Call", when: settings.callTime ?? "", next: settings.nextCall ?? null, zoomUrl: settings.zoomUrl ?? null }
    out.welcome = settings.welcome ?? ""
    out.replays = list(replays.filter((r) => (r.program ?? "academy") === "academy"))
    out.posts = [...posts]
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((p) => ({ ...p, comments: p.comments.map((c) => ({ id: c.id, name: c.name, body: c.body, createdAt: c.createdAt, mine: c.userId === user.id })) }))
  }
  return json(out)
}

export const config = { path: "/api/academy/content", method: "GET" }
