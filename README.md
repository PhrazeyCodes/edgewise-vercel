# Edgewise — Trading Journal

A trading journal web app powered by Claude AI and Supabase.

## Stack

- **Frontend**: Single-page app (`public/app.html`)
- **Backend**: Vercel Serverless Function (`api/analyze.js`)
- **AI**: Anthropic Claude API (proxied via `/api/analyze`)
- **Auth & DB**: Supabase

---

## Deploy to Vercel via GitHub

### 1. Push to GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/edgewise.git
git push -u origin main
```

### 2. Import to Vercel

1. Go to [vercel.com](https://vercel.com) → **Add New → Project**
2. Import your GitHub repo
3. No build command needed — Vercel auto-detects static files + serverless functions
4. Click **Deploy**

### 3. Add Environment Variables

In the Vercel dashboard → your project → **Settings → Environment Variables**:

| Key | Value |
|-----|-------|
| `CLAUDE_API_KEY` | Your Anthropic API key (`sk-ant-...`) |

> After adding env vars, trigger a redeployment from the Vercel dashboard.

### 4. Update Supabase Auth Redirect URL

In your Supabase dashboard → **Authentication → URL Configuration**,
replace your old Render URL with your Vercel URL in **Redirect URLs**:
```
https://your-project.vercel.app
```

### 5. Auto-deploy on Push

Vercel auto-deploys on every push to `main`.

---

## Local Development

```bash
npm install -g vercel
vercel dev
# → http://localhost:3000
```

---

## Project Structure

```
edgewise/
├── public/
│   └── app.html          # Full SPA frontend
├── api/
│   └── analyze.js        # Vercel serverless function
├── vercel.json           # Routing + cache headers
├── package.json
└── README.md
```

## What Changed from Render

| Render | Vercel |
|--------|--------|
| `server.js` (Express) | Removed |
| `render.yaml` | Replaced by `vercel.json` |
| `app.post('/api/analyze')` | `api/analyze.js` serverless function |
| Static files via Express | Served natively by Vercel |
| `express` npm dependency | No backend dependency needed |
