// GET /api/academy/content — gated content. Zoom links and replay IDs never ship in the static site.
// Academy members: weekly call, prompts, resources, Academy replays.
// Creator Consciousness: one library per round (CC 1.0, 2.0 …); people see only the rounds they were in.
import type { Context } from "@netlify/functions"
import { accessFor, canSeePost, currentUser, fail, getLibraries, getPosts, getRecord, getReplays, getSettings, isAdmin, json, type Replay } from "../lib/academy.mts"

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
  const allLibs = await getLibraries(context)
  const mine = allLibs.filter((l) => admin || access.libraries.includes(l.id))
  const cc = mine.length > 0

  const out: Record<string, unknown> = {
    academy, cc,
    founders: { zoomUrl: rec.foundersRsvp || academy ? settings.foundersZoomUrl ?? null : null },
  }
  if (!academy && !cc) return json(out)

  const replays = await getReplays(context)
  const posts = await getPosts(context)
  const shape = (ps: typeof posts) => [...ps]
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((p) => ({ ...p, comments: p.comments.map((c) => ({ id: c.id, name: c.name, body: c.body, createdAt: c.createdAt, mine: c.userId === user.id })) }))
  const shortName = (aud: string) => aud === "cc" ? "All rounds" : allLibs.find((l) => l.id === aud)?.short ?? aud
  if (cc) {
    // Creator Consciousness prompts: for every round, or one round only.
    out.ccPosts = shape(posts.filter((p) => (p.audience ?? "academy") !== "academy" && canSeePost(p, access, admin)))
      .map((p) => ({ ...p, audienceName: shortName(p.audience ?? "cc") }))
  }
  if (cc) {
    out.libraries = mine.map((l) => ({ id: l.id, name: l.name, short: l.short, replays: list(replays.filter((r) => r.program === l.id)) }))
    // Uploaded before the libraries were split: admins only, so they can re-file them.
    const unfiled = replays.filter((r) => r.program === "cc")
    if (admin && unfiled.length) (out.libraries as unknown[]).push({ id: "cc", name: "Not yet filed (older uploads)", short: "Unfiled", replays: list(unfiled) })
  }
  if (academy) {
    out.call = { title: settings.callTitle ?? "Weekly Live Call", when: settings.callTime ?? "", next: settings.nextCall ?? null, zoomUrl: settings.zoomUrl ?? null }
    out.welcome = settings.welcome ?? ""
    out.replays = list(replays.filter((r) => (r.program ?? "academy") === "academy"))
    out.posts = shape(posts.filter((p) => (p.audience ?? "academy") === "academy"))
  }
  return json(out)
}

export const config = { path: "/api/academy/content", method: "GET" }
