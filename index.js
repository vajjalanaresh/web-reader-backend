// index.js
require("dotenv").config();
const express = require("express");
const axios = require("axios");
const cheerio = require("cheerio");
const cors = require("cors");

// Import the Google Gen AI SDK
// Official SDK: @google/genai (Node.js). See quickstart / docs.
const { GoogleGenAI } = require("@google/genai");

const app = express();
app.use(express.json());
app.use(cors());

// Helper: extract readable text from HTML using Cheerio
function extractText(html) {
  const $ = cheerio.load(html || "");
  // remove scripts/styles and common layout elements
  $("script, style, noscript, header, footer, nav, svg").remove();
  const text = $("body").text() || "";
  return text.replace(/\s+/g, " ").trim();
}

// Initialize Gemini (Google Gen AI client)
// We support:
//  - API key mode (recommended for quick testing) via GEMINI_API_KEY
//  - ADC / Vertex AI mode via GOOGLE_GENAI_USE_VERTEXAI + GOOGLE_CLOUD_PROJECT (recommended for production)
function createGenClient() {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  const useVertex =
    (process.env.GOOGLE_GENAI_USE_VERTEXAI || "false").toLowerCase() === "true";
  const project = process.env.GOOGLE_CLOUD_PROJECT;
  const location = process.env.GOOGLE_CLOUD_LOCATION || "global";

  // Create the client with whichever auth method is available.
  // The SDK supports passing an apiKey for Developer API, or using ADC / project+location for Vertex AI.
  const clientConfig = {};

  if (apiKey) {
    clientConfig.apiKey = apiKey;
  }
  if (useVertex) {
    clientConfig.vertexai = true;
    if (project) clientConfig.project = project;
    if (location) clientConfig.location = location;
  }

  // Instantiate SDK client
  // (See Google quickstart for Node.js: npm install @google/genai ... usage)
  const genai = new GoogleGenAI(clientConfig);
  return genai;
}

const genaiClient = createGenClient();

/**
 * POST /api/extract
 * { url: string, question: string }
 *
 * Flow:
 *  - fetch page HTML (axios)
 *  - extract readable text (cheerio)
 *  - prepare prompt/context
 *  - call Gemini via genaiClient.models.generateContent
 *  - return { answer: "..." }
 */
app.post("/api/extract", async (req, res) => {
  try {
    const { url, question } = req.body;
    // console.log(req, { url, question }, "-------");
    if (!url || !question)
      return res.status(400).json({ error: "url and question required" });

    // Fetch the HTML
    const pageResp = await axios.get(url, {
      timeout: 15000,
      headers: { "User-Agent": "web-reader-bot/1.0" },
    });
    const html = pageResp.data;
    // Extract text
    let extracted = extractText(html);
    // console.log(extracted, "-------html------------");

    // Truncate to a safe length for prompt/context
    const maxLen = parseInt(process.env.MAX_EXTRACT_CHARS || "25000", 10);
    if (extracted.length > maxLen) {
      extracted = extracted.slice(0, maxLen);
    }

    // Build the prompt / instruction for Gemini
    // Keep it structured: first the context (extracted text) then the user question.
    // You can refine prompt engineering as needed.
    const model =
      process.env.GEMINI_MODEL ||
      process.env.GOOGLE_GENAI_MODEL ||
      "gemini-2.5-flash";
    const promptPieces = [
      "You are an assistant that reads the provided webpage contents and answers the user's question based on that content.",
      "Webpage content (context):",
      extracted,
      "----",
      `User question: ${question}`,
      "Answer concisely and cite (briefly) if the content contains specific facts. If the information is not present in the content, say you couldn't find it in the page.",
    ];
    // Join with newlines
    const prompt = promptPieces.join("\n\n");

    // Call Gemini via the SDK
    // The quickstart shows client.models.generateContent({ model, contents: "..." })
    let aiResponseText = null;
    try {
      const response = await genaiClient.models.generateContent({
        model,
        // The SDK accepts an array "contents" or a single string depending on version;
        // 'contents' is the quickstart example.
        contents: prompt,
        // optional: temperature, maxOutputTokens, safety settings, etc.
        // temperature: 0.2,
        // maxOutputTokens: 1024
      });

      // Try a few common shapes for the SDK response
      // 1) response.text (quickstart shows response.text)
      if (typeof response?.text === "string" && response.text.trim()) {
        aiResponseText = response.text;
      }
      // 2) response.text() if SDK returns a function
      else if (typeof response?.text === "function") {
        try {
          aiResponseText = await response.text();
        } catch {}
      }
      // 3) response.output[0].content or response?.results
      else if (response?.output?.[0]?.content) {
        aiResponseText = Array.isArray(response.output[0].content)
          ? response.output[0].content.map((c) => c.text || c).join("\n")
          : response.output[0].content.text || response.output[0].content;
      } else if (response?.results?.[0]?.output_text) {
        aiResponseText = response.results[0].output_text;
      } else {
        // fallback to JSON string
        aiResponseText = JSON.stringify(response);
      }
    } catch (sdkErr) {
      console.error("Gemini SDK error:", sdkErr);
      return res.status(500).json({
        error: "Error calling Gemini API",
        details: sdkErr?.message || String(sdkErr),
      });
    }

    // Return AI answer
    return res.json({ answer: aiResponseText });
  } catch (err) {
    console.error("Error in /api/extract:", err?.message || err);
    return res.status(500).json({ error: err?.message || "server error" });
  }
});

// Start server
const PORT = process.env.PORT || 4000;
app.listen(PORT, () =>
  console.log(`Backend running on http://localhost:${PORT}`)
);
