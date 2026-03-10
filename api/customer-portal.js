export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

  if (!STRIPE_SECRET_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return res.status(500).json({ error: 'Missing environment variables' });
  }

  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: 'Missing userId' });

  const origin = req.headers.origin || 'https://edgewisetrader.com';

  // Look up stripe_customer_id from Supabase
  try {
    const sbRes = await fetch(
      `${SUPABASE_URL}/rest/v1/subscriptions?user_id=eq.${userId}&select=stripe_customer_id`,
      {
        headers: {
          'apikey': SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        },
      }
    );
    const rows = await sbRes.json();
    const customerId = rows?.[0]?.stripe_customer_id;

    if (!customerId) {
      return res.status(404).json({ error: 'No Stripe customer found for this user' });
    }

    // Create Stripe billing portal session
    const params = new URLSearchParams();
    params.append('customer', customerId);
    params.append('return_url', origin);

    const portalRes = await fetch('https://api.stripe.com/v1/billing_portal/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    const portal = await portalRes.json();
    if (portal.error) return res.status(400).json({ error: portal.error.message });

    res.json({ url: portal.url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
