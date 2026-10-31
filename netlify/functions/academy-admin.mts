// POST /api/academy/admin {action, ...} — Camila's tools: call details, prompts/posts, replays, uploads, comps, roster.
import type { Context } from "@netlify/functions"
import {
  cloudflare, currentUser, fail, getPosts, getReplays, getSettings, isAdmin, json, newId,
  removeComp, saveReplays, savePosts, saveSettings, setComp, store, accessFor, type MemberRecord, type Settings,
} from "../lib/academy.mts"

const str = (v: unknown, max = 2000) => String(v ?? "").trim().slice(0, max)

export default async (req: Request, context: Context) => {
  const user = await currentUser()
  if (!user) return fail("Please log in.", 401)
  if (!isAdmin(user)) return fail("Admins only.", 403)
  const b = await req.json().catch(() => ({}))

  switch (b.action) {
    case "load": {
      const s = store(context)
      const { blobs } = await s.list({ prefix: "users/" })
      const members = (
        await Promise.all(blobs.map((x) => s.get(x.key, { type: "json" }) as Promise<MemberRecord | null>))
      ).filter(Boolean) as MemberRecord[]
      const { blobs: compBlobs } = await s.list({ prefix: "comps/" })
      const comps = await Promise.all(compBlobs.map((x) => s.get(x.key, { type: "json" })))
      const roster = await Promise.all(
        members.map(async (m) => ({
          email: m.email, name: m.name, status: m.status ?? "none", plan: m.plan ?? null,
          periodEnd: m.periodEnd ?? null, cancelAtPeriodEnd: !!m.cancelAtPeriodEnd,
          foundersRsvp: !!m.foundersRsvp, member: (await accessFor(context, m)).member,
        })),
      )
      return json({ settings: await getSettings(context), replays: await getReplays(context), posts: await getPosts(context), roster, comps })
    }

    case "saveSettings": {
      const s: Settings = {
        callTitle: str(b.callTitle, 120), callTime: str(b.callTime, 120), nextCall: str(b.nextCall, 40),
        zoomUrl: str(b.zoomUrl, 500), foundersZoomUrl: str(b.foundersZoomUrl, 500), welcome: str(b.welcome, 2000),
      }
      for (const u of [s.zoomUrl, s.foundersZoomUrl]) if (u && !/^https:\/\//.test(u)) return fail("Links must start with https://", 400)
      await saveSettings(context, s)
      return json({ ok: true })
    }

    case "addPost": {
      const title = str(b.title, 200), body = str(b.body, 8000)
      if (!title) return fail("Give it a title.", 400)
      const posts = await getPosts(context)
      posts.push({ id: newId(), kind: b.kind === "prompt" ? "prompt" : "post", title, body, createdAt: Date.now(), comments: [] })
      await savePosts(context, posts)
      return json({ ok: true })
    }

    case "deletePost": {
      await savePosts(context, (await getPosts(context)).filter((p) => p.id !== b.id))
      return json({ ok: true })
    }

    case "uploadUrl": {
      // Creates a resumable upload straight to Cloudflare; the file never passes through this site.
      const size = Number(b.size)
      if (!Number.isFinite(size) || size <= 0) return fail("Pick a video file.", 400)
      const cf = cloudflare()
      const b64 = (v: string) => btoa(unescape(encodeURIComponent(v)))
      const res = await fetch(`${cf.base}?direct_user=true`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${cf.token}`,
          "Tus-Resumable": "1.0.0",
          "Upload-Length": String(size),
          "Upload-Metadata": `requiresignedurls,name ${b64(str(b.name, 200) || "Replay")},maxdurationseconds ${b64("21600")}`,
        },
      })
      const location = res.headers.get("location")
      const uid = res.headers.get("stream-media-id")
      if (!res.ok || !location || !uid) return fail(`Cloudflare didn't accept the upload (${res.status}).`, 502)
      return json({ uploadUrl: location, uid })
    }

    case "addReplay": {
      const uid = str(b.uid, 64), title = str(b.title, 200), date = str(b.date, 10)
      if (!/^[a-f0-9]{32}$/i.test(uid)) return fail("That video ID doesn't look right.", 400)
      if (!title || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return fail("Add a title and a date.", 400)
      const replays = (await getReplays(context)).filter((r) => r.uid !== uid)
      replays.push({ uid, title, date, note: str(b.note, 1000) })
      await saveReplays(context, replays)
      return json({ ok: true })
    }

    case "removeReplay": {
      // Unpublishes from the library; the video stays in Cloudflare until deleted there.
      await saveReplays(context, (await getReplays(context)).filter((r) => r.uid !== b.uid))
      return json({ ok: true })
    }

    case "grantComp": {
      const email = str(b.email, 200).toLowerCase(), until = str(b.until, 10)
      if (!/^\S+@\S+\.\S+$/.test(email) || !/^\d{4}-\d{2}-\d{2}$/.test(until)) return fail("Add an email and an end date.", 400)
      await setComp(context, { email, until, note: str(b.note, 200) })
      return json({ ok: true })
    }

    case "removeComp": {
      await removeComp(context, str(b.email, 200))
      return json({ ok: true })
    }

    default:
      return fail("Unknown action.", 400)
  }
}

export const config = { path: "/api/academy/admin", method: "POST" }
