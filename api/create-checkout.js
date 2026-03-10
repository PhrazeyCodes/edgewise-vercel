export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
  if (!STRIPE_SECRET_KEY) return res.status(500).json({ error: 'Stripe not configured' });

  const { plan, userId, email } = req.body;
  if (!plan || !userId || !email) return res.status(400).json({ error: 'Missing plan, userId or email' });

  const origin = req.headers.origin || 'https://edgewisetrader.com';

  const prices = {
    monthly: {
      price: 'price_1T9GQaFMqkHZd7FTeUcJSieN',
      trial_period_days: null,
    },
    annual: {
      price: 'price_1T9GR7FMqkHZd7FTEW12EfJ6',
      trial_period_days: 14,
    },
  };

  const selected = prices[plan];
  if (!selected) return res.status(400).json({ error: 'Invalid plan' });

  // Build form params explicitly — avoids nested object flattening bugs
  const params = new URLSearchParams();
  params.append('mode', 'subscription');
  params.append('customer_email', email);
  params.append('line_items[0][price]', selected.price);
  params.append('line_items[0][quantity]', '1');
  params.append('metadata[user_id]', userId);
  params.append('metadata[plan]', plan);
  params.append('subscription_data[metadata][user_id]', userId);
  params.append('subscription_data[metadata][plan]', plan);
  params.append('allow_promotion_codes', 'true');
  params.append('success_url', `${origin}/?checkout=success`);
  params.append('cancel_url', `${origin}/?checkout=cancelled`);

  if (selected.trial_period_days) {
    params.append('subscription_data[trial_period_days]', String(selected.trial_period_days));
  }

  try {
    const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    const session = await response.json();

    if (session.error) {
      console.error('Stripe error:', session.error);
      return res.status(400).json({ error: session.error.message });
    }

    if (!session.url) {
      console.error('No session URL returned:', JSON.stringify(session));
      return res.status(500).json({ error: 'No checkout URL returned from Stripe' });
    }

    res.json({ url: session.url });
  } catch (err) {
    console.error('Checkout error:', err);
    res.status(500).json({ error: err.message });
  }
}
