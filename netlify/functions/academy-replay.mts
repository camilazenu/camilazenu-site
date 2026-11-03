// GET /api/academy/replay?uid=… — a short-lived signed playback token for one replay, members only.
import type { Context } from "@netlify/functions"
import { accessFor, canWatch, cloudflare, currentUser, fail, getRecord, getReplays, isAdmin, json } from "../lib/academy.mts"

export default async (req: Request, context: Context) => {
  const user = await currentUser()
  if (!user) return fail("Please log in.", 401)
  const rec = await getRecord(context, user)
  const access = await accessFor(context, rec)
  const admin = isAdmin(user)

  const uid = new URL(req.url).searchParams.get("uid") ?? ""
  const replay = (await getReplays(context)).find((r) => r.uid === uid)
  // Only published replays play, and only for the program the viewer belongs to.
  if (!replay && !admin) return fail("Replay not found.", 404)
  if (replay && !canWatch(replay.program ?? "academy", access, admin)) return fail("This video is for members of that program.", 403)

  const cf = cloudflare()
  const exp = Math.floor(Date.now() / 1000) + 4 * 60 * 60 // 4 hours
  const res = await fetch(`${cf.base}/${encodeURIComponent(uid)}/token`, {
    method: "POST",
    headers: { Authorization: `Bearer ${cf.token}`, "content-type": "application/json" },
    body: JSON.stringify({ exp, downloadable: false }),
  })
  const body = (await res.json().catch(() => ({}))) as { success?: boolean; result?: { token?: string } }
  if (!res.ok || !body.success || !body.result?.token) return fail("Couldn't load that replay. Try again in a minute.", 502)
  return json({ src: `https://iframe.videodelivery.net/${body.result.token}`, expiresAt: exp })
}

export const config = { path: "/api/academy/replay", method: "GET" }
