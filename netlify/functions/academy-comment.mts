// POST /api/academy/comment {postId, body} | {postId, deleteId} — members reply to prompts and posts.
import type { Context } from "@netlify/functions"
import { accessFor, currentUser, displayName, fail, getPosts, getRecord, isAdmin, json, newId, savePosts } from "../lib/academy.mts"

export default async (req: Request, context: Context) => {
  const user = await currentUser()
  if (!user) return fail("Please log in.", 401)
  const rec = await getRecord(context, user)
  const { member } = await accessFor(context, rec)
  const admin = isAdmin(user)
  if (!member && !admin) return fail("Members only.", 403)

  const { postId, body, deleteId } = await req.json().catch(() => ({}))
  const posts = await getPosts(context)
  const post = posts.find((p) => p.id === postId)
  if (!post) return fail("That post is gone.", 404)

  if (deleteId) {
    const c = post.comments.find((x) => x.id === deleteId)
    if (!c) return fail("Comment not found.", 404)
    if (c.userId !== user.id && !admin) return fail("You can only delete your own comments.", 403)
    post.comments = post.comments.filter((x) => x.id !== deleteId)
  } else {
    const text = String(body ?? "").trim()
    if (!text) return fail("Write something first.", 400)
    if (text.length > 4000) return fail("That's a little long. Keep it under 4,000 characters.", 400)
    post.comments.push({ id: newId(), userId: user.id, name: displayName(user), body: text, createdAt: Date.now() })
  }
  await savePosts(context, posts)
  return json({ ok: true })
}

export const config = { path: "/api/academy/comment", method: "POST" }
