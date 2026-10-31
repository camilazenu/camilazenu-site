// POST /api/stripe/webhook — Stripe tells us when memberships start, renew, fail or end.
// Grants or removes Creator Academy access and closes the Creator Consciousness 2-pay plan after payment 2.
import type { Context } from "@netlify/functions"
import type Stripe from "stripe"
import { accessFor, getRecordById, saveRecord, stripe, syncRole, userIdForCustomer, type MemberRecord } from "../lib/academy.mts"

export default async (req: Request, context: Context) => {
  const secret = Netlify.env.get("STRIPE_WEBHOOK_SECRET")?.trim()
  if (!secret) return new Response("Webhook secret not configured", { status: 500 })
  const sig = req.headers.get("stripe-signature") ?? ""
  const raw = await req.text()
  const s = stripe()

  let event: Stripe.Event
  try {
    event = await s.webhooks.constructEventAsync(raw, sig, secret)
  } catch {
    return new Response("Bad signature", { status: 400 })
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session
        const subId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id
        if (session.metadata?.offer === "creator-consciousness" && session.metadata?.plan === "installment" && subId) {
          await endAfterTwoPayments(s, subId)
        }
        if (session.metadata?.offer === "creator-academy" && subId) {
          await applySubscription(context, await s.subscriptions.retrieve(subId), session.client_reference_id ?? undefined)
        }
        break
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
      case "customer.subscription.paused":
      case "customer.subscription.resumed": {
        const sub = event.data.object as Stripe.Subscription
        // Re-read so out-of-order events can't roll a member back to a stale state.
        const fresh = await s.subscriptions.retrieve(sub.id).catch(() => sub)
        await applySubscription(context, fresh)
        break
      }
    }
  } catch (err) {
    console.error("Webhook handling failed", event.type, err)
    return new Response("Handler error", { status: 500 }) // Stripe will retry
  }
  return new Response("ok")
}

async function applySubscription(context: Context, sub: Stripe.Subscription, userIdHint?: string) {
  if (sub.metadata?.offer !== "creator-academy") return
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id
  const userId = userIdHint || sub.metadata?.identityUserId || (await userIdForCustomer(context, customerId))
  if (!userId) {
    console.warn("No Identity user for customer", customerId)
    return
  }
  const now = Date.now()
  const rec: MemberRecord = (await getRecordById(context, userId)) ?? { userId, email: "", createdAt: now, updatedAt: now }

  // Ignore late events from an older, already-replaced subscription.
  const ended = sub.status === "canceled" || sub.status === "incomplete_expired"
  if (rec.subscriptionId && rec.subscriptionId !== sub.id && ended) return

  const item = sub.items?.data?.[0] as (Stripe.SubscriptionItem & { current_period_end?: number }) | undefined
  rec.customerId = customerId
  rec.subscriptionId = sub.id
  rec.status = sub.status
  rec.plan = (sub.metadata?.plan as MemberRecord["plan"]) ?? rec.plan
  rec.periodEnd = item?.current_period_end ?? (sub as unknown as { current_period_end?: number }).current_period_end
  rec.cancelAtPeriodEnd = !!sub.cancel_at_period_end || !!sub.cancel_at
  if (sub.trial_start) rec.trialUsed = true
  if (!rec.email) {
    const customer = await stripe().customers.retrieve(customerId)
    if (!("deleted" in customer && customer.deleted)) rec.email = (customer as Stripe.Customer).email ?? ""
  }
  await saveRecord(context, rec)
  const { member } = await accessFor(context, rec)
  await syncRole(userId, member)
}

/** The $500 × 2 plan: cancel right after the second charge, with no proration. */
async function endAfterTwoPayments(s: Stripe, subId: string) {
  const sub = await s.subscriptions.retrieve(subId)
  if (sub.cancel_at) return
  const anchor = new Date(sub.billing_cycle_anchor * 1000)
  anchor.setUTCMonth(anchor.getUTCMonth() + 1)
  const cancelAt = Math.floor(anchor.getTime() / 1000) + 2 * 24 * 60 * 60
  await s.subscriptions.update(subId, {
    cancel_at: cancelAt,
    proration_behavior: "none",
    metadata: { ...sub.metadata, installments: "2" },
  })
}

export const config = { path: "/api/stripe/webhook", method: "POST" }
