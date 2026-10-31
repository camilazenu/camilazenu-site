// GET /api/academy/content — member-only content. Zoom links and replay IDs never ship in the static site.
import type { Context } from "@netlify/functions"
import { accessFor, currentUser, fail, getPosts, getRecord, getReplays, getSettings, isAdmin, json } from "../lib/academy.mts"

export default async (_req: Request, context: Context) => {
  const user = await currentUser()
  if (!user) return fail("Please log in.", 401)
  const settings = await getSettings(context)
  const rec = await getRecord(context, user)
  const { member } = await accessFor(context, rec)
  const admin = isAdmin(user)

  // Free accounts see only the Founders Call details.
  if (!member && !admin) {
    return json({
      member: false,
      founders: { zoomUrl: rec.foundersRsvp ? settings.foundersZoomUrl ?? null : null },
    })
  }

  const [replays, posts] = await Promise.all([getReplays(context), getPosts(context)])
  return json({
    member: true,
    call: { title: settings.callTitle ?? "Weekly Live Call", when: settings.callTime ?? "", next: settings.nextCall ?? null, zoomUrl: settings.zoomUrl ?? null },
    founders: { zoomUrl: settings.foundersZoomUrl ?? null },
    welcome: settings.welcome ?? "",
    replays: [...replays].sort((a, b) => b.date.localeCompare(a.date)).map(({ uid, title, date, note }) => ({ uid, title, date, note })),
    posts: [...posts]
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((p) => ({
        ...p,
        comments: p.comments.map((c) => ({ id: c.id, name: c.name, body: c.body, createdAt: c.createdAt, mine: c.userId === user.id })),
      })),
  })
}

export const config = { path: "/api/academy/content", method: "GET" }
