// pages/api/ai/parse-menu.js

export const config = {
  maxDuration: 60,
  api: {
    bodyParser: {
      sizeLimit: "8mb",
    },
  },
};

const MENU_SCHEMA = {
  type: "OBJECT",
  properties: {
    items: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          name: { type: "STRING" },
          category: { type: "STRING" },
          price: { type: "NUMBER" },
          description: { type: "STRING" },
          veg: { type: "BOOLEAN" },
          variants: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                template: { type: "STRING" },
                required: { type: "BOOLEAN" },
                options: {
                  type: "ARRAY",
                  items: {
                    type: "OBJECT",
                    properties: {
                      name: { type: "STRING" },
                      price: { type: "NUMBER" },
                    },
                    required: ["name"],
                  },
                },
              },
              required: ["template", "options"],
            },
          },
        },
        required: ["name"],
      },
    },
  },
  required: ["items"],
};

const PROMPT = `
Extract restaurant menu products from this image and return only structured JSON.

Rules:
- Include only real menu products/items, not headings, phone numbers, address text, GST text, decorative text, or instructions.
- Preserve the product name as printed, correcting obvious OCR mistakes.
- Infer category from nearby headings such as Starters, Rice & Breads, Grilled, Drinks, etc. Use "General" only when no category is visible.
- Parse prices as plain numbers. For Indian menus, "RS 120", "₹120", and "120/-" should become 120.
- If an item has multiple prices for sizes/portions, set price to the lowest/base price and add variants with useful option names.
- For variants, infer useful group names such as "Size", "Portion", "Rice Type", or "Preparation".
- If multiple variant groups have the same name but different options, rename them clearly so they stay unique.
- Do not use the menu item name as the variant group name.
- If a price is unreadable but the item is clearly visible, include the item with price 0.
- Keep descriptions short. Leave description empty if none is visible.
- Return JSON in this shape: { "items": [ { "name": "...", "category": "...", "price": 100, "description": "", "veg": false, "variants": [] } ] }.
`;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const keyState =
  globalThis.__cafeQrGeminiKeyState ||
  {
    cursor: Math.floor(Math.random() * 1000000),
    cooldowns: new Map(),
  };

globalThis.__cafeQrGeminiKeyState = keyState;

function envNumber(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

const QUOTA_COOLDOWN_MS = envNumber("GEMINI_QUOTA_COOLDOWN_MS", 12 * 60 * 60 * 1000);
const AUTH_COOLDOWN_MS = envNumber("GEMINI_AUTH_COOLDOWN_MS", 60 * 60 * 1000);

function getApiKeys() {
  const keysEnv = process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || "";
  const keys = [...new Set(
    keysEnv
      .split(",")
      .map((key) => key.trim())
      .filter(Boolean)
  )];

  if (!keys.length) return [];

  const now = Date.now();
  const start = keyState.cursor % keys.length;
  keyState.cursor = (keyState.cursor + 1) % keys.length;

  const ordered = [...keys.slice(start), ...keys.slice(0, start)];
  const active = [];

  for (const key of ordered) {
    const cooldownUntil = keyState.cooldowns.get(key);
    if (cooldownUntil && cooldownUntil > now) {
      continue;
    }

    if (cooldownUntil) keyState.cooldowns.delete(key);
    active.push(key);
  }

  return active.length ? active : ordered;
}

function getModels() {
  const envModel = (process.env.GEMINI_MODEL || process.env.AI_MODEL_NAME || "").trim();
  const defaults = [
    "gemini-2.5-flash",
    "gemini-2.0-flash",
    "gemini-1.5-flash",
    "gemini-1.5-flash-001",
  ];

  return envModel
    ? [envModel, ...defaults.filter((model) => model !== envModel)]
    : defaults;
}

function extractErrorMessage(status, body) {
  if (!body) return `Gemini API error (Status ${status})`;

  try {
    const parsed = JSON.parse(body);
    return parsed?.error?.message || parsed?.message || body;
  } catch {
    return body.slice(0, 800);
  }
}

function coolDownKey(key, durationMs, reason) {
  keyState.cooldowns.set(key, Date.now() + durationMs);
  console.warn(`Gemini API key temporarily skipped for ${Math.ceil(durationMs / 60000)} minutes: ${reason}`);
}

function isQuotaError(error) {
  const details = String(error?.details || error?.message || "");
  return error?.status === 429 || /RESOURCE_EXHAUSTED|quota|rate limit|rate-limit/i.test(details);
}

function isAuthError(error) {
  const details = String(error?.details || error?.message || "");
  return error?.status === 401 ||
    error?.status === 403 ||
    /API_KEY_INVALID|API key not valid|permission denied|forbidden|unauthorized/i.test(details);
}

function parseJsonText(text) {
  if (!text || typeof text !== "string") {
    throw new Error("AI returned no readable JSON content.");
  }

  const cleaned = text
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("AI response did not contain a JSON object.");
    return JSON.parse(match[0]);
  }
}

function normalizeItems(raw) {
  const items = Array.isArray(raw?.items) ? raw.items : [];
  const seen = new Set();

  return items
    .map((item) => {
      const name = String(item?.name || "").trim();
      const category = String(item?.category || "General").trim() || "General";
      const price = Number.parseFloat(item?.price);

      const variants = Array.isArray(item?.variants)
        ? item.variants
            .map((variant) => ({
              template: String(variant?.template || "Options").trim() || "Options",
              required: Boolean(variant?.required),
              options: Array.isArray(variant?.options)
                ? variant.options
                    .map((option) => ({
                      name: String(option?.name || "").trim(),
                      price: Number.parseFloat(option?.price) || 0,
                    }))
                    .filter((option) => option.name)
                : [],
            }))
            .filter((variant) => variant.options.length)
        : [];

      return {
        name,
        category,
        price: Number.isFinite(price) ? price : 0,
        description: String(item?.description || "").trim(),
        veg: Boolean(item?.veg),
        variants,
      };
    })
    .filter((item) => {
      if (!item.name) return false;
      const key = `${item.category.toLowerCase()}::${item.name.toLowerCase()}::${item.price}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

async function callGemini({ key, model, mimeType, base64Data, signal, useSchema }) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const generationConfig = {
    temperature: 0.1,
    maxOutputTokens: 8192,
    response_mime_type: "application/json",
  };

  if (useSchema) {
    generationConfig.response_schema = MENU_SCHEMA;
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": key,
    },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [
            { text: PROMPT },
            { inline_data: { mime_type: mimeType, data: base64Data } },
          ],
        },
      ],
      generationConfig,
    }),
    signal,
  });

  const body = await response.text();
  if (!response.ok) {
    const message = extractErrorMessage(response.status, body);
    const error = new Error(`Gemini API error (Status ${response.status}): ${message}`);
    error.status = response.status;
    error.details = message;
    throw error;
  }

  const data = JSON.parse(body);
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    const reason = data?.candidates?.[0]?.finishReason || data?.promptFeedback?.blockReason;
    throw new Error(reason ? `AI returned no content (${reason}).` : "AI returned no content.");
  }

  return parseJsonText(text);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  const hardDeadline = Date.now() + 56_000;

  try {
    const { image } = req.body || {};
    if (!image || typeof image !== "string") {
      return res.status(400).json({ message: "No image provided" });
    }

    const match = image.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.*)$/);
    if (!match) {
      return res.status(400).json({ message: "Invalid image format. Expected a base64 image data URI." });
    }

    const mimeType = match[1];
    const base64Data = match[2];
    if (base64Data.length > 4_000_000) {
      return res.status(413).json({ message: "Image too large. Please upload a clearer, smaller image below about 3MB." });
    }

    const keys = getApiKeys();
    if (!keys.length) {
      return res.status(500).json({
        message: "Gemini API key not configured on server.",
        details: "Set GEMINI_API_KEY or GEMINI_API_KEYS in the Vercel project environment variables, then redeploy.",
      });
    }

    const models = getModels();
    let lastError = null;

    for (const key of keys) {
      let moveToNextKey = false;

      for (const model of models) {
        if (moveToNextKey) break;

        for (const useSchema of [true, false]) {
          if (moveToNextKey) break;

          for (let attempt = 1; attempt <= 2; attempt++) {
            if (Date.now() > hardDeadline - 8_000) {
              break;
            }

            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 25_000);

            try {
              const parsed = await callGemini({
                key,
                model,
                mimeType,
                base64Data,
                signal: controller.signal,
                useSchema,
              });

              const items = normalizeItems(parsed);
              if (!items.length) {
                return res.status(422).json({
                  message: "No menu items found.",
                  details: "Try a clearer photo with item names and prices visible.",
                });
              }

              return res.status(200).json({ items });
            } catch (error) {
              lastError = error;
              console.error(`Gemini menu parse failed. model=${model}, schema=${useSchema}, attempt=${attempt}, status=${error.status || "n/a"}:`, error.message);

              if (error.name === "AbortError") {
                await sleep(800);
                continue;
              }

              if (error.status === 404) {
                break;
              }

              if (isQuotaError(error)) {
                coolDownKey(key, QUOTA_COOLDOWN_MS, "quota or rate limit reached");
                moveToNextKey = true;
                break;
              }

              if (error.status === 503) {
                await sleep(1500 * attempt);
                continue;
              }

              if (isAuthError(error)) {
                coolDownKey(key, AUTH_COOLDOWN_MS, "authorization failed");
                moveToNextKey = true;
                break;
              }

              if (error.status === 400 && useSchema) {
                break;
              }

              if (error.status === 400 && model !== models[models.length - 1]) {
                break;
              }

              break;
            } finally {
              clearTimeout(timeout);
            }
          }
        }
      }
    }

    return res.status(lastError?.status === 429 ? 503 : 500).json({
      message: "Menu extraction failed.",
      details: lastError?.details || lastError?.message || "Please try again with a clearer image.",
    });
  } catch (error) {
    console.error("Parse Menu API Route Error:", error);
    return res.status(500).json({
      message: "Internal Server Error during menu parsing",
      details: error.message,
    });
  }
}
