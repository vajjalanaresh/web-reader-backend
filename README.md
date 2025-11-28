Web Reader Backend
A lightweight backend service that reads any public webpage, extracts meaningful text, and answers
user questions using Google Gemini (GenAI). Used by the Web Reader Frontend.
Purpose:
1. Fetch webpage HTML
2. Extract readable text
3. Send text + question to Gemini
4. Return AI answer
Repository:
- index.js
- package.json
- .env.example
- README
Setup:
git clone YOUR_BACKEND_REPO_URL
cd web-reader-backend
npm install
cp .env.example .env
.env:
PORT=4000
NODE_ENV=development
GEMINI_API_KEY=your_api_key
GEMINI_MODEL=gemini-2.5-flash
MAX_EXTRACT_CHARS=25000
Run:
node index.js
API:
POST /api/extract
{ "url": "...", "question": "..." }
Response: { "answer": "..." }
Deployment (Render):
- Build: npm install
- Start: node index.js
- Add env vars
- Use Render URL in frontend
Extraction Flow:
Axios → Cheerio → Clean → Limit → Gemini → Answer