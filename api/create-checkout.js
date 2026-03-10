export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
  if (!STRIPE_SECRET_KEY) return res.status(500).json({ error: 'Stripe not configured' });

  const { plan, userId, email } = req.body;
  if (!plan || !userId || !email) return res.status(400).json({ error: 'Missing plan, userId or email' });

  const origin = req.headers.origin || 'https://edgewisetrader.com';

  // Stripe Price IDs
  const prices = {
    monthly: {
      price: 'price_1T9GQaFMqkHZd7FTeUcJSieN',
      mode: 'subscription',
      trial_period_days: null,
    },
    annual: {
      price: 'price_1T9GR7FMqkHZd7FTEW12EfJ6',
      mode: 'subscription',
      trial_period_days: 14,
    },
  };

  const selected = prices[plan];
  if (!selected) return res.status(400).json({ error: 'Invalid plan' });

  const sessionBody = {
    mode: selected.mode,
    customer_email: email,
    line_items: [{ price: selected.price, quantity: 1 }],
    metadata: { user_id: userId, plan },
    success_url: `${origin}/?checkout=success`,
    cancel_url: `${origin}/?checkout=cancelled`,
    subscription_data: {
      metadata: { user_id: userId, plan },
      ...(selected.trial_period_days ? { trial_period_days: selected.trial_period_days } : {}),
    },
  };

  try {
    const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(flattenForStripe(sessionBody)).toString(),
    });

    const session = await response.json();
    if (session.error) return res.status(400).json({ error: session.error.message });
    res.json({ url: session.url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// Stripe API requires nested objects as bracket notation: line_items[0][quantity]=1
function flattenForStripe(obj, prefix = '') {
  const result = {};
  for (const [key, val] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}[${key}]` : key;
    if (val === null || val === undefined) continue;
    if (typeof val === 'object' && !Array.isArray(val)) {
      Object.assign(result, flattenForStripe(val, fullKey));
    } else if (Array.isArray(val)) {
      val.forEach((item, i) => {
        if (typeof item === 'object') {
          Object.assign(result, flattenForStripe(item, `${fullKey}[${i}]`));
        } else {
          result[`${fullKey}[${i}]`] = item;
        }
      });
    } else {
      result[fullKey] = val;
    }
  }
  return result;
}
