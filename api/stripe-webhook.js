export const config = { api: { bodyParser: false } };

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
  const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

  if (!STRIPE_SECRET_KEY || !STRIPE_WEBHOOK_SECRET || !SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return res.status(500).json({ error: 'Missing environment variables' });
  }

  const rawBody = await getRawBody(req);
  const sig = req.headers['stripe-signature'];

  // Verify webhook signature using Stripe's manual verification
  let event;
  try {
    event = verifyStripeWebhook(rawBody, sig, STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  const supabaseHeaders = {
    'Content-Type': 'application/json',
    'apikey': SUPABASE_SERVICE_KEY,
    'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
  };

  async function upsertSubscription(data) {
    await fetch(`${SUPABASE_URL}/rest/v1/subscriptions?on_conflict=user_id`, {
      method: 'POST',
      headers: { ...supabaseHeaders, 'Prefer': 'resolution=merge-duplicates' },
      body: JSON.stringify(data),
    });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const userId = session.metadata?.user_id;
        const plan = session.metadata?.plan;
        if (!userId) break;

        const isTrialing = session.subscription ? true : false;
        await upsertSubscription({
          user_id: userId,
          stripe_customer_id: session.customer,
          stripe_subscription_id: session.subscription,
          plan: plan || 'monthly',
          status: 'active',
          trial_end: null,
          updated_at: new Date().toISOString(),
        });
        break;
      }

      case 'customer.subscription.updated': {
        const sub = event.data.object;
        const userId = sub.metadata?.user_id;
        if (!userId) break;

        await upsertSubscription({
          user_id: userId,
          stripe_customer_id: sub.customer,
          stripe_subscription_id: sub.id,
          plan: sub.metadata?.plan || 'monthly',
          status: sub.status, // active, trialing, past_due, canceled, etc.
          trial_end: sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null,
          updated_at: new Date().toISOString(),
        });
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        const userId = sub.metadata?.user_id;
        if (!userId) break;

        await upsertSubscription({
          user_id: userId,
          stripe_customer_id: sub.customer,
          stripe_subscription_id: sub.id,
          plan: sub.metadata?.plan || 'monthly',
          status: 'canceled',
          trial_end: null,
          updated_at: new Date().toISOString(),
        });
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        const subId = invoice.subscription;
        if (!subId) break;
        // Fetch subscription to get user_id from metadata
        const subRes = await fetch(`https://api.stripe.com/v1/subscriptions/${subId}`, {
          headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}` },
        });
        const sub = await subRes.json();
        const userId = sub.metadata?.user_id;
        if (!userId) break;

        await upsertSubscription({
          user_id: userId,
          stripe_customer_id: invoice.customer,
          stripe_subscription_id: subId,
          plan: sub.metadata?.plan || 'monthly',
          status: 'past_due',
          trial_end: null,
          updated_at: new Date().toISOString(),
        });
        break;
      }
    }

    res.json({ received: true });
  } catch (err) {
    console.error('Webhook handler error:', err);
    res.status(500).json({ error: err.message });
  }
}

// Manual Stripe webhook signature verification (no SDK needed)
function verifyStripeWebhook(payload, header, secret) {
  const parts = header.split(',').reduce((acc, part) => {
    const [k, v] = part.split('=');
    acc[k] = v;
    return acc;
  }, {});

  const timestamp = parts['t'];
  const signatures = header.split(',').filter(p => p.startsWith('v1=')).map(p => p.slice(3));

  if (!timestamp || signatures.length === 0) throw new Error('Invalid signature header');

  const signedPayload = `${timestamp}.${payload.toString()}`;

  // Use Web Crypto API (available in Node 18+)
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const messageData = encoder.encode(signedPayload);

  // We'll do sync HMAC via a simple implementation
  const expectedSig = computeHmacSha256Hex(secret, signedPayload);
  const isValid = signatures.some(sig => sig === expectedSig);
  if (!isValid) throw new Error('Signature mismatch');

  // Check timestamp tolerance (5 minutes)
  const tolerance = 300;
  if (Math.abs(Date.now() / 1000 - parseInt(timestamp)) > tolerance) {
    throw new Error('Timestamp too old');
  }

  return JSON.parse(payload.toString());
}

function computeHmacSha256Hex(key, message) {
  const crypto = require('crypto');
  return crypto.createHmac('sha256', key).update(message).digest('hex');
}
