// Health check: confirms the site can reach Cloudflare Stream.
// Returns only ok/status flags. Never returns the token, video IDs or any member content.
export default async () => {
  const account = Netlify.env.get("CLOUDFLARE_ACCOUNT_ID")
  const token = Netlify.env.get("CLOUDFLARE_STREAM_TOKEN")
  if (!account || !token) {
    return Response.json({ ok: false, accountId: !!account, token: !!token }, { status: 500 })
  }
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${account}/stream?limit=1`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  const body = (await res.json().catch(() => ({}))) as { success?: boolean }
  return Response.json(
    { ok: res.ok && body.success === true, cloudflareStatus: res.status },
    { status: res.ok ? 200 : 502, headers: { "cache-control": "no-store" } }
  )
}

export const config = { path: "/api/stream-health" }
