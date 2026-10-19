// pages/api/ai/parse-purchase-bill.js
// Universal AI Purchase Bill, Invoice & Receipt Scanner for Cafe QR POS

export const config = {
  maxDuration: 60,
  api: {
    bodyParser: {
      sizeLimit: "8mb",
    },
  },
};

const BILL_SCHEMA = {
  type: "OBJECT",
  properties: {
    supplierName: { type: "STRING" },
    invoiceNumber: { type: "STRING" },
    invoiceDate: { type: "STRING" },
    items: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          name: { type: "STRING" },
          rawName: { type: "STRING" },
          quantity: { type: "NUMBER" },
          unitOfMeasure: { type: "STRING" },
          unitPrice: { type: "NUMBER" },
          taxRate: { type: "NUMBER" },
          taxAmount: { type: "NUMBER" },
          lineTotal: { type: "NUMBER" },
          isIngredientLikely: { type: "BOOLEAN" },
          matchedCatalogItem: { type: "STRING" },
        },
        required: ["name", "quantity", "unitPrice"],
      },
    },
    subtotal: { type: "NUMBER" },
    taxTotal: { type: "NUMBER" },
    grandTotal: { type: "NUMBER" },
  },
  required: ["items"],
};

function buildPrompt() {
  return `
You are an expert procurement and accounting AI specializing in restaurant and cafe purchase bills, supplier invoices, delivery challans, and cash memos.
The image provided may be a printed tax invoice, a cash receipt, or a HANDWRITTEN supplier chit/bill. Decipher handwriting, cursive writing, abbreviations, and regional terms accurately.

Tasks:
1. Extract the Supplier/Vendor Name (from header, logo, or stamp). If not visible, return "".
2. Extract the Supplier Invoice / Bill Number / Reference. If not visible, return "".
3. Extract the Invoice Date (format as YYYY-MM-DD or ISO string if readable). If missing, return "".
4. Extract each line item purchased:
   - "name": Clean, intelligible item name in English (e.g., "Cashew", "Arrowroot", "Basmati Rice", "Full Cream Milk", "Onions", "Boneless Chicken", "Sunflower Oil").
   - "rawName": Text as printed or handwritten on the bill.
   - "quantity": Number purchased (e.g. 5, 10.5, 25). If unreadable, default to 1.
   - "unitOfMeasure": Standard unit (e.g. KG, G, LTR, ML, PCS, BOX, PKT, BAG, CAN, BOTTLE, TIN, UNIT). Infer from quantity or context if not explicitly written.
   - "unitPrice": Cost price per unit (numeric). If only the line total is given, calculate unitPrice = lineTotal / quantity.
   - "taxRate": Tax / GST rate percentage (e.g. 0, 5, 12, 18). Default 0 if absent.
   - "taxAmount": Total tax on this line.
   - "lineTotal": Total payable for this line item (quantity * unitPrice + tax - discount).
   - "isIngredientLikely": Set to TRUE if this is a raw cooking material, food ingredient, vegetable, dairy, oil, meat, grain, spice, bakery raw material, or packaging item used to prepare dishes. Set to FALSE if it is a pre-packaged finished good for direct retail resale (e.g., canned soda, bottled beverage, prepackaged chips).
5. Extract totals: "subtotal", "taxTotal", "grandTotal". If totals are unreadable, calculate from the sum of line items.

Important Rules:
- Do NOT skip items even if the handwriting is difficult. Use context clues to decipher them.
- Discard header rows, phone numbers, bank details, or footer notes from the items list.
- For prices in Indian format (₹, Rs., /-, INR), strip currency symbols and return plain numbers.
- Return only structured JSON matching the schema.
`;
}

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
  const envModels = (process.env.GEMINI_MODELS || "")
    .split(",")
    .map((model) => model.trim())
    .filter(Boolean);
  const envModel = (process.env.GEMINI_MODEL || process.env.AI_MODEL_NAME || "").trim();
  const defaults = [
    "gemini-2.5-flash-lite",
    "gemini-2.0-flash",
    "gemini-1.5-flash",
    "gemini-1.5-flash-8b",
    "gemini-2.5-flash",
    "gemini-2.0-flash-lite",
  ];

  return [...new Set([
    ...envModels,
    ...(envModel ? [envModel] : []),
    ...defaults,
  ])];
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

function isRetryableModelError(error) {
  const details = String(error?.details || error?.message || "");
  return error?.name === "AbortError" ||
    (error?.provider === "gemini" && error?.status === 500) ||
    error?.status === 503 ||
    error?.status === 504 ||
    /high demand|spikes in demand|temporarily unavailable|unavailable|overloaded|overload|try again later|deadline|timeout|timed out|internal error/i.test(details);
}

function responseStatusForError(error) {
  if (isQuotaError(error) || isRetryableModelError(error)) return 503;
  if (error?.status === 413) return 413;
  if (error?.status >= 400 && error?.status < 500 && !isAuthError(error)) return error.status;
  return 500;
}

function responseMessageForError(error) {
  if (isRetryableModelError(error)) {
    return "AI service is temporarily busy.";
  }

  if (isQuotaError(error)) {
    return "AI quota is temporarily unavailable.";
  }

  return "Purchase bill extraction failed.";
}

function responseDetailsForError(error) {
  const modelTag = error?.model ? ` (${error.model})` : "";
  if (isRetryableModelError(error)) {
    return `The AI engine is temporarily experiencing high demand${modelTag}. Please retry in a few moments.`;
  }

  if (isQuotaError(error)) {
    return `All configured Gemini API keys are currently rate-limited${modelTag}. Please try again after quota reset or configure GEMINI_API_KEYS.`;
  }

  return error?.details || error?.message || "Please try again with a clearer photo of the bill.";
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

function toPrice(value) {
  const price = Number.parseFloat(value);
  return Number.isFinite(price) ? Math.max(0, price) : 0;
}

function toQuantity(value) {
  const qty = Number.parseFloat(value);
  return Number.isFinite(qty) && qty > 0 ? qty : 1;
}

function cleanString(value, fallback = "") {
  return String(value ?? fallback).replace(/\s+/g, " ").trim();
}

function normalizeUom(uomStr) {
  const raw = cleanString(uomStr).toUpperCase().replace(/[^A-Z]/g, '');
  if (!raw) return 'units';
  if (/^KGS?$/i.test(raw) || raw === 'KILOGRAM') return 'kg';
  if (/^GM?S?$/i.test(raw) || raw === 'GRAM') return 'gm';
  if (/^L(?:TR|ITRE?|ITER)?S?$/i.test(raw)) return 'ltr';
  if (/^ML$/i.test(raw) || raw === 'MILLILITRE') return 'ml';
  if (/^PCS?$/i.test(raw) || raw === 'PIECES?' || raw === 'NOS?') return 'pcs';
  if (/^PKTS?$/i.test(raw) || raw === 'PACKETS?' || raw === 'PACK') return 'packet';
  if (/^BOX(?:ES)?$/i.test(raw)) return 'box';
  if (/^BAGS?$/i.test(raw) || raw === 'SACK') return 'bag';
  if (/^TINS?$/i.test(raw)) return 'tin';
  if (/^CANS?$/i.test(raw)) return 'can';
  if (/^BOTTLES?$/i.test(raw)) return 'bottle';
  return uomStr.trim().toLowerCase();
}

function normalizeBillResult(raw) {
  const items = Array.isArray(raw?.items) ? raw.items : [];

  const normalizedItems = items
    .map((item) => {
      const name = cleanString(item?.name || item?.rawName || '');
      const rawName = cleanString(item?.rawName || item?.name || '');
      const quantity = toQuantity(item?.quantity);
      let unitPrice = toPrice(item?.unitPrice);
      let lineTotal = toPrice(item?.lineTotal);
      const taxRate = toPrice(item?.taxRate);
      let taxAmount = toPrice(item?.taxAmount);

      if (lineTotal === 0 && unitPrice > 0) {
        taxAmount = taxAmount || (unitPrice * quantity * (taxRate / 100));
        lineTotal = (unitPrice * quantity) + taxAmount;
      } else if (unitPrice === 0 && lineTotal > 0 && quantity > 0) {
        unitPrice = lineTotal / quantity;
      }

      return {
        name: name || 'Purchase Item',
        rawName: rawName || name || 'Purchase Item',
        quantity: Math.round(quantity * 1000) / 1000,
        unitOfMeasure: normalizeUom(item?.unitOfMeasure),
        unitPrice: Math.round(unitPrice * 100) / 100,
        taxRate: Math.round(taxRate * 100) / 100,
        taxAmount: Math.round(taxAmount * 100) / 100,
        lineTotal: Math.round(lineTotal * 100) / 100,
        isIngredientLikely: Boolean(item?.isIngredientLikely),
        matchedCatalogItem: cleanString(item?.matchedCatalogItem),
      };
    })
    .filter((it) => it.name && (it.quantity > 0 || it.unitPrice > 0));

  const subtotal = toPrice(raw?.subtotal) || normalizedItems.reduce((acc, it) => acc + (it.unitPrice * it.quantity), 0);
  const taxTotal = toPrice(raw?.taxTotal) || normalizedItems.reduce((acc, it) => acc + it.taxAmount, 0);
  const grandTotal = toPrice(raw?.grandTotal) || (subtotal + taxTotal);

  return {
    supplierName: cleanString(raw?.supplierName),
    invoiceNumber: cleanString(raw?.invoiceNumber),
    invoiceDate: cleanString(raw?.invoiceDate),
    items: normalizedItems,
    subtotal: Math.round(subtotal * 100) / 100,
    taxTotal: Math.round(taxTotal * 100) / 100,
    grandTotal: Math.round(grandTotal * 100) / 100,
  };
}

async function callGemini({ key, model, mimeType, base64Data, prompt, signal, useSchema }) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const generationConfig = {
    temperature: 0.1,
    maxOutputTokens: 8192,
    response_mime_type: "application/json",
  };

  if (useSchema) {
    generationConfig.response_schema = BILL_SCHEMA;
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
            { text: prompt },
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
    error.provider = "gemini";
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

const ALLOWED_ORIGINS = new Set([
  "https://cafeqr-frontend.pages.dev",
  "https://app.cafeqr.in",
  "https://cafe-test-qr-frontend.vercel.app",
  "http://localhost:3000",
]);

function setCorsHeaders(req, res) {
  const origin = req.headers.origin || "";
  if (ALLOWED_ORIGINS.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Max-Age", "86400");
}

export default async function handler(req, res) {
  setCorsHeaders(req, res);

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  const hardDeadline = Date.now() + 56_000;

  try {
    const { image, catalog } = req.body || {};
    if (!image || typeof image !== "string") {
      return res.status(400).json({ message: "No image provided" });
    }

    const match = image.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.*)$/);
    if (!match) {
      return res.status(400).json({ message: "Invalid image format. Expected a base64 image data URI." });
    }

    const mimeType = match[1];
    const base64Data = match[2];
    if (base64Data.length > 5_000_000) {
      return res.status(413).json({ message: "Image too large. Please upload a compressed image below 4MB." });
    }

    const keys = getApiKeys();
    if (!keys.length) {
      return res.status(500).json({
        message: "Gemini API key not configured on server.",
        details: "Set GEMINI_API_KEY or GEMINI_API_KEYS in the environment variables, then redeploy.",
      });
    }

    const prompt = buildPrompt();

    const models = getModels();
    let lastError = null;

    for (const key of keys) {
      let moveToNextKey = false;

      for (const model of models) {
        let moveToNextModel = false;
        if (moveToNextKey) break;

        for (const useSchema of [true, false]) {
          if (moveToNextKey || moveToNextModel) break;

          for (let attempt = 1; attempt <= 2; attempt++) {
            if (Date.now() > hardDeadline - 8_000) {
              break;
            }

            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 18_000);

            try {
              const parsed = await callGemini({
                key,
                model,
                mimeType,
                base64Data,
                prompt,
                signal: controller.signal,
                useSchema,
              });

              const normalized = normalizeBillResult(parsed);
              if (!normalized.items || normalized.items.length === 0) {
                return res.status(422).json({
                  message: "No purchase items detected on this bill.",
                  details: "Ensure the bill is legible and item names with rates or quantities are visible.",
                });
              }

              return res.status(200).json({
                success: true,
                data: normalized,
              });
            } catch (error) {
              error.model = model;
              lastError = error;
              console.warn(`Gemini bill parse failed. model=${model}, schema=${useSchema}, attempt=${attempt}, status=${error.status || "n/a"}:`, error.message);

              if (error.name === "AbortError") {
                if (attempt < 2) {
                  await sleep(600);
                  continue;
                }
                moveToNextModel = true;
                break;
              }

              if (error.status === 404) {
                moveToNextModel = true;
                break;
              }

              if (isAuthError(error)) {
                coolDownKey(key, AUTH_COOLDOWN_MS, error.message);
                moveToNextKey = true;
                break;
              }

              if (isQuotaError(error)) {
                coolDownKey(key, QUOTA_COOLDOWN_MS, error.message);
                moveToNextKey = true;
                break;
              }

              if (isRetryableModelError(error)) {
                await sleep(500 * attempt);
                moveToNextModel = true;
                break;
              }

              if (error.status === 400 && useSchema) {
                break;
              }

              if (!useSchema) {
                moveToNextModel = true;
                break;
              }
            } finally {
              clearTimeout(timeout);
            }
          }
        }
      }
    }

    const status = responseStatusForError(lastError);
    return res.status(status).json({
      message: responseMessageForError(lastError),
      details: responseDetailsForError(lastError),
    });
  } catch (err) {
    console.error("Unhandled error in parse-purchase-bill API:", err);
    return res.status(500).json({
      message: "Server encountered an error while scanning the bill.",
      details: err.message,
    });
  }
}
