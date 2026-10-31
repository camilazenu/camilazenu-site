// Health check: confirms the site can reach Cloudflare Stream.
// Returns only ok/status flags. Never returns the token, video IDs or any member content.
export default async () => {
  const account = Netlify.env.get("CLOUDFLARE_ACCOUNT_ID")
  const token = Netlify.env.get("CLOUDFLARE_STREAM_TOKEN")?.trim()
  if (!account || !token) {
    return Response.json({ ok: false, accountId: !!account, token: !!token }, { status: 500 })
  }
  const headers = { Authorization: `Bearer ${token}` }
  type CF = { success?: boolean; errors?: { code: number; message: string }[]; result?: { status?: string } }
  const verify = await fetch("https://api.cloudflare.com/client/v4/user/tokens/verify", { headers })
  const v = (await verify.json().catch(() => ({}))) as CF
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account.trim()}/stream`, { headers })
  const body = (await res.json().catch(() => ({}))) as CF
  return Response.json(
    {
      ok: res.ok && body.success === true,
      tokenValid: v.success === true && v.result?.status === "active",
      tokenLength: token.length,
      verifyErrors: v.errors?.map((e) => e.code),
      cloudflareStatus: res.status,
      streamErrors: body.errors?.map((e) => `${e.code}: ${e.message}`),
    },
    { status: res.ok ? 200 : 502, headers: { "cache-control": "no-store" } }
  )
}

export const config = { path: "/api/stream-health" }
