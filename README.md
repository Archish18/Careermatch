# 🎯 CareerMatch — AI Job Platform

Upload your resume, find real jobs worldwide, and generate human-sounding cover letters — all powered by Claude AI.

![CareerMatch](https://img.shields.io/badge/Built%20with-Claude%20AI-orange) ![React](https://img.shields.io/badge/React-18-blue) ![Vite](https://img.shields.io/badge/Vite-5-purple)

## ✨ Features

- 📄 **Resume Parsing** — Upload PDF, DOCX, or TXT — extracts skills, experience, education automatically
- 🌍 **Real Job Search** — Uses Claude's built-in web search to find live jobs from LinkedIn, Indeed, Glassdoor, and company career pages worldwide
- ✉ **Cover Letter Generator** — Human-sounding, personalised cover letters (no AI clichés)
- 📋 **CV Tips** — Per-job analysis of missing skills, keywords to add, and specific improvements
- 🔗 **Direct Apply Links** — Real URLs to job postings

## 🚀 Deploy in 3 Minutes (Vercel)

### 1. Fork & clone this repo
```bash
git clone https://github.com/YOUR_USERNAME/careermatch.git
cd careermatch
```

### 2. Get a free Anthropic API key
Go to [console.anthropic.com](https://console.anthropic.com) → Create account → API Keys → Create Key

### 3. Deploy to Vercel
```bash
npm install -g vercel
vercel
```

When prompted, add your environment variable:
```
VITE_ANTHROPIC_API_KEY = your_api_key_here
```

**Or deploy via Vercel dashboard:**
1. Go to [vercel.com](https://vercel.com) → New Project → Import your GitHub repo
2. Add environment variable: `VITE_ANTHROPIC_API_KEY` = your key
3. Click Deploy ✅

## 💻 Run Locally

```bash
# 1. Install dependencies
npm install

# 2. Set up your API key
cp .env.example .env
# Edit .env and paste your Anthropic API key

# 3. Start dev server
npm run dev
# → Opens at http://localhost:3000
```

## 🗂 Project Structure

```
careermatch/
├── index.html          # Entry HTML
├── vite.config.js      # Vite config
├── vercel.json         # Vercel deployment config
├── .env.example        # API key template
└── src/
    ├── main.jsx        # React entry point
    └── App.jsx         # Main application (all-in-one)
```

## 🔑 Environment Variables

| Variable | Description |
|---|---|
| `VITE_ANTHROPIC_API_KEY` | Your Anthropic API key from [console.anthropic.com](https://console.anthropic.com) |

## 🛠 Tech Stack

- **React 18** + **Vite 5** — frontend framework
- **Claude claude-sonnet-4-5** — AI for resume parsing, job search, cover letters
- **Claude Web Search Tool** — real-time job discovery from live job boards
- **PDF.js** — client-side PDF text extraction
- **Mammoth.js** — client-side DOCX text extraction
- Zero backend — runs entirely in the browser

## 📝 How It Works

1. User uploads resume (PDF/DOCX/TXT)
2. Claude extracts structured profile (skills, experience, role)
3. User enters job preferences and optional search query
4. Claude uses **web_search** tool to find real open positions on LinkedIn, Indeed, Glassdoor
5. For each job: generate tailored cover letter + CV improvement tips on demand

## ⚠️ Note on API Usage

This app calls the Anthropic API directly from the browser. Each job search uses 1-3 API calls. Cover letters and CV tips each use 1 additional call. The free Anthropic API tier includes generous usage for personal projects.

## 📄 License

MIT — free to use, modify, and deploy.
