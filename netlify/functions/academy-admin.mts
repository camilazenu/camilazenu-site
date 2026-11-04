// POST /api/academy/admin {action, ...} — Camila's tools: call details, prompts/posts, replays, uploads, comps, roster.
import type { Context } from "@netlify/functions"
import {
  cloudflare, currentUser, fail, getPosts, getReplays, getSettings, isAdmin, json, newId,
  removeComp, saveReplays, savePosts, saveSettings, setComp, store, accessFor, removeAlumni, type MemberRecord, type Settings,
  getLibraries, saveLibraries, setLibraryAccess, notifyAccess, getComp, ALUMNI_ACADEMY_UNTIL, type Alumni, type Comp,
} from "../lib/academy.mts"

const str = (v: unknown, max = 2000) => String(v ?? "").trim().slice(0, max)
const isEmail = (e: string) => /^[^@\s,;]+@[^@\s,;]+\.[^@\s,;]+$/.test(e)
const emailList = (v: unknown) =>
  [...new Set(String(v ?? "").split(/[\s,;<>]+/).map((e) => e.trim().toLowerCase()).filter(isEmail))]

/** Give free Academy through the alumni date, unless they already have later free access. */
async function alumniComp(context: Context, email: string) {
  const c = await getComp(context, email)
  if (c && c.until >= ALUMNI_ACADEMY_UNTIL) return
  await setComp(context, { email, until: ALUMNI_ACADEMY_UNTIL, note: "Creator Consciousness alumni" })
}

export default async (req: Request, context: Context) => {
  const user = await currentUser()
  if (!user) return fail("Please log in.", 401)
  if (!isAdmin(user)) return fail("Admins only.", 403)
  const b = await req.json().catch(() => ({}))

  switch (b.action) {
    case "load": {
      const s = store(context)
      const all = async <T,>(prefix: string) => {
        const { blobs } = await s.list({ prefix })
        return (await Promise.all(blobs.map((x) => s.get(x.key, { type: "json" }) as Promise<T | null>))).filter(Boolean) as T[]
      }
      const [members, comps, alumni] = await Promise.all([all<MemberRecord>("users/"), all<Comp>("comps/"), all<Alumni>("ccalumni/")])
      // One row per email: accounts plus people given access who haven't signed up yet.
      const byEmail = new Map<string, MemberRecord | null>()
      for (const m of members) if (m.email) byEmail.set(m.email.toLowerCase(), m)
      for (const x of [...comps, ...alumni]) if (!byEmail.has(x.email)) byEmail.set(x.email, null)
      const roster = await Promise.all(
        [...byEmail].map(async ([email, m]) => {
          const a = await accessFor(context, { email, status: m?.status })
          return {
            email, name: m?.name ?? "", hasAccount: !!m, status: m?.status ?? "none", plan: m?.plan ?? null,
            periodEnd: m?.periodEnd ?? null, cancelAtPeriodEnd: !!m?.cancelAtPeriodEnd, foundersRsvp: !!m?.foundersRsvp,
            member: a.member, paid: a.paid, compUntil: a.comp?.until ?? null, libraries: a.libraries,
            joined: m?.createdAt ?? null,
          }
        }),
      )
      return json({
        settings: await getSettings(context), replays: await getReplays(context), posts: await getPosts(context),
        roster, libraries: await getLibraries(context), alumniUntil: ALUMNI_ACADEMY_UNTIL,
      })
    }

    case "setLibrary": {
      // One switch on the roster: library on/off for one email.
      const email = str(b.email, 200).toLowerCase(), library = str(b.library, 40)
      if (!isEmail(email)) return fail("That email doesn't look right.", 400)
      if (!(await getLibraries(context)).some((l) => l.id === library)) return fail("Unknown library.", 400)
      const libs = await setLibraryAccess(context, email, library, !!b.on)
      if (b.on && b.withAcademy) await alumniComp(context, email)
      await notifyAccess(context, email, "access-changed")
      return json({ ok: true, libraries: libs })
    }

    case "setAcademy": {
      // Free Academy on/off for one email (paid members are handled by Stripe).
      const email = str(b.email, 200).toLowerCase()
      if (!isEmail(email)) return fail("That email doesn't look right.", 400)
      if (b.on) {
        const until = /^\d{4}-\d{2}-\d{2}$/.test(str(b.until, 10)) ? str(b.until, 10) : ALUMNI_ACADEMY_UNTIL
        await setComp(context, { email, until, note: str(b.note, 200) || "Given by Camila" })
      } else await removeComp(context, email)
      await notifyAccess(context, email, "access-changed")
      return json({ ok: true })
    }

    case "bulkAccess": {
      // Paste a round's email list: each gets that library, plus free Academy through the alumni date if asked.
      const library = str(b.library, 40)
      if (!(await getLibraries(context)).some((l) => l.id === library)) return fail("Pick a library.", 400)
      const emails = emailList(b.emails)
      if (!emails.length) return fail("Add at least one email.", 400)
      if (emails.length > 500) return fail("Up to 500 emails at a time.", 400)
      for (const email of emails) {
        await setLibraryAccess(context, email, library, true)
        if (b.withAcademy) await alumniComp(context, email)
        if (b.notify !== false) await notifyAccess(context, email, "access-changed")
      }
      return json({ ok: true, added: emails.length })
    }

    case "removePerson": {
      // Takes away every library and any free Academy. Paid subscriptions are untouched (cancel those in Stripe).
      const email = str(b.email, 200).toLowerCase()
      await removeAlumni(context, email)
      await removeComp(context, email)
      await notifyAccess(context, email, "access-removed")
      return json({ ok: true })
    }

    case "addLibrary": {
      const name = str(b.name, 80), short = str(b.short, 20) || name
      if (!name) return fail("Name the library.", 400)
      const libs = await getLibraries(context)
      let id = short.toLowerCase().replace(/^creator consciousness/, "cc").replace(/[^a-z0-9]+/g, "")
      if (!id || id === "academy" || id === "cc" || libs.some((l) => l.id === id)) id = `lib${libs.length + 1}`
      libs.push({ id, name, short })
      await saveLibraries(context, libs)
      return json({ ok: true, id })
    }

    case "moveReplay": {
      const program = str(b.program, 40)
      if (program !== "academy" && !(await getLibraries(context)).some((l) => l.id === program)) return fail("Pick a library.", 400)
      const replays = await getReplays(context)
      const r = replays.find((x) => x.uid === b.uid)
      if (!r) return fail("Replay not found.", 404)
      r.program = program
      await saveReplays(context, replays)
      return json({ ok: true })
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
      const audience = str(b.audience, 40) || "academy"
      if (audience !== "academy" && audience !== "cc" && !(await getLibraries(context)).some((l) => l.id === audience)) return fail("Pick who sees it.", 400)
      posts.push({ id: newId(), kind: b.kind === "prompt" || b.kind === "resource" ? b.kind : "post", audience, title, body, createdAt: Date.now(), comments: [] })
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

    case "importDrive": {
      // Cloudflare fetches the file straight from Google Drive: nothing passes through the browser.
      // The Drive file must be shared "Anyone with the link" until the import finishes downloading.
      const m = str(b.link, 500).match(/(?:\/d\/|[?&]id=)([A-Za-z0-9_-]{20,})/)
      if (!m) return fail("Paste a Google Drive file link.", 400)
      const title = str(b.title, 200), date = str(b.date, 10), program = str(b.program, 40) || "academy"
      if (!title || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return fail("Add a title and a date.", 400)
      if (program !== "academy" && !(await getLibraries(context)).some((l) => l.id === program)) return fail("Pick a library.", 400)
      const cf = cloudflare()
      const res = await fetch(`${cf.base}/copy`, {
        method: "POST",
        headers: { Authorization: `Bearer ${cf.token}`, "content-type": "application/json" },
        body: JSON.stringify({
          url: `https://drive.usercontent.google.com/download?id=${m[1]}&export=download&confirm=t`,
          meta: { name: title },
          requireSignedURLs: true,
        }),
      })
      const out = (await res.json().catch(() => ({}))) as { success?: boolean; result?: { uid?: string }; errors?: { message?: string }[] }
      const uid = out.result?.uid
      if (!res.ok || !out.success || !uid) return fail(`Cloudflare couldn't start the import: ${out.errors?.[0]?.message ?? res.status}`, 502)
      const replays = (await getReplays(context)).filter((r) => r.uid !== uid)
      replays.push({ uid, title, date, note: str(b.note, 1000), program })
      await saveReplays(context, replays)
      return json({ ok: true, uid })
    }

    case "videoStatus": {
      // Processing state for replays: downloading → queued → inprogress → ready (or error).
      const cf = cloudflare()
      const uids = (Array.isArray(b.uids) ? b.uids : []).map((u: unknown) => str(u, 64)).filter((u: string) => /^[a-f0-9]{32}$/i.test(u)).slice(0, 50)
      const states = await Promise.all(uids.map(async (uid: string) => {
        const r = await fetch(`${cf.base}/${uid}`, { headers: { Authorization: `Bearer ${cf.token}` } })
        const v = (await r.json().catch(() => ({}))) as { result?: { status?: { state?: string; pctComplete?: string; errorReasonText?: string }; duration?: number; requireSignedURLs?: boolean } }
        const st = v.result?.status
        return { uid, state: st?.state ?? (r.status === 404 ? "missing" : "unknown"), pct: st?.pctComplete ?? null, error: st?.errorReasonText ?? null, duration: v.result?.duration ?? null, signed: v.result?.requireSignedURLs ?? null }
      }))
      return json({ states })
    }

    case "addReplay": {
      const uid = str(b.uid, 64), title = str(b.title, 200), date = str(b.date, 10)
      if (!/^[a-f0-9]{32}$/i.test(uid)) return fail("That video ID doesn't look right.", 400)
      if (!title || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return fail("Add a title and a date.", 400)
      const replays = (await getReplays(context)).filter((r) => r.uid !== uid)
      const program = str(b.program, 40) || "academy"
      if (program !== "academy" && !(await getLibraries(context)).some((l) => l.id === program)) return fail("Pick a library.", 400)
      replays.push({ uid, title, date, note: str(b.note, 1000), program })
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
      await notifyAccess(context, email, "access-changed")
      return json({ ok: true })
    }

    case "removeAlumni": {
      await removeAlumni(context, str(b.email, 200))
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
