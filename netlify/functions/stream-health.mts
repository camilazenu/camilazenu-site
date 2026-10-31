// Health check: confirms the site can reach Cloudflare Stream.
// Returns only a pass/fail flag. Never returns the token, video IDs or member content.
export default async () => {
  const account = Netlify.env.get("CLOUDFLARE_ACCOUNT_ID")?.trim()
  const token = Netlify.env.get("CLOUDFLARE_STREAM_TOKEN")?.trim()
  let ok = false
  if (account && token) {
    const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/stream`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const body = (await res.json().catch(() => ({}))) as { success?: boolean }
    ok = res.ok && body.success === true
  }
  return Response.json({ ok }, { status: ok ? 200 : 503, headers: { "cache-control": "no-store" } })
}

export const config = { path: "/api/stream-health" }
