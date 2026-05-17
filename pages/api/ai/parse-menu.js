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
          printedName: { type: "STRING" },
          category: { type: "STRING" },
          price: { type: "NUMBER" },
          priceText: { type: "STRING" },
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
- If a printed line has slash-separated choices, treat those choices as variants, not separate products.
- For slash variants, make the product name the clean base name and move choices into variants.
- Preserve the original printed product line in printedName and the printed price chunk in priceText when possible.
- If an item has multiple prices for choices/sizes/portions, set price to the lowest/base price and add variants with useful option names.
- For variants, infer useful group names such as "Protein", "Preparation", "Size", "Portion", or "Rice Type".
- Example: "PANEER / CHICKEN BUTTER MASALA RS 200/220" => product name "BUTTER MASALA", variant group "Protein", options PANEER 200 and CHICKEN 220.
- Example: "CHILLY GOBI / PANEER / BEEF / CHICKEN RS 140/170/180" => product name "CHILLY", variant group "Protein", options GOBI 140, PANEER 170, BEEF 180, CHICKEN 180.
- Example: "EGG CURRY / ROAST RS 80" => product name "EGG", variant group "Preparation", options CURRY 80 and ROAST 80.
- Example: "KIZHI POROTTA VEG/EGG/CHK/BEEF RS 160" => product name "KIZHI POROTTA", variant group "Protein", options VEG, EGG, CHICKEN, BEEF at 160.
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
  const envModels = (process.env.GEMINI_MODELS || "")
    .split(",")
    .map((model) => model.trim())
    .filter(Boolean);
  const envModel = (process.env.GEMINI_MODEL || process.env.AI_MODEL_NAME || "").trim();
  const defaults = [
    "gemini-2.5-flash-lite",
    "gemini-2.5-flash",
    "gemini-2.0-flash",
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
    return "Gemini is temporarily busy.";
  }

  if (isQuotaError(error)) {
    return "Gemini quota is temporarily unavailable.";
  }

  return "Menu extraction failed.";
}

function responseDetailsForError(error) {
  if (isRetryableModelError(error)) {
    return "Gemini is temporarily busy. The app tried the configured fallback models/keys. Please retry in a minute, or set GEMINI_MODELS=gemini-2.5-flash-lite,gemini-2.5-flash for steadier hosted imports.";
  }

  if (isQuotaError(error)) {
    return "All available Gemini API keys are currently quota-limited or rate-limited. Try again after quota reset or add another key in GEMINI_API_KEYS.";
  }

  return error?.details || error?.message || "Please try again with a clearer image.";
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

function cleanString(value, fallback = "") {
  return String(value ?? fallback).replace(/\s+/g, " ").trim();
}

function toUpperClean(value) {
  return cleanString(value)
    .replace(/[()]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function toPrice(value) {
  const price = Number.parseFloat(value);
  return Number.isFinite(price) ? price : 0;
}

const OPTION_ALIASES = new Map([
  ["CH", "CHICKEN"],
  ["CHK", "CHICKEN"],
  ["CHKN", "CHICKEN"],
  ["CHICK", "CHICKEN"],
  ["CHICKN", "CHICKEN"],
  ["CHICKEN", "CHICKEN"],
  ["VEGETABLE", "VEG"],
  ["VEGETARIAN", "VEG"],
  ["VEG", "VEG"],
  ["EGG", "EGG"],
  ["BEEF", "BEEF"],
  ["MUTTON", "MUTTON"],
  ["FISH", "FISH"],
  ["PRAWN", "PRAWN"],
  ["PRAWNS", "PRAWNS"],
  ["PANEER", "PANEER"],
  ["GOBI", "GOBI"],
  ["CURRY", "CURRY"],
  ["ROAST", "ROAST"],
  ["FRY", "FRY"],
  ["FRIED", "FRIED"],
  ["DRY", "DRY"],
  ["GRAVY", "GRAVY"],
  ["HALF", "HALF"],
  ["FULL", "FULL"],
  ["SMALL", "SMALL"],
  ["MEDIUM", "MEDIUM"],
  ["LARGE", "LARGE"],
  ["REGULAR", "REGULAR"],
  ["JUMBO", "JUMBO"],
]);

const PROTEIN_OPTIONS = new Set([
  "VEG",
  "EGG",
  "CHICKEN",
  "BEEF",
  "MUTTON",
  "FISH",
  "PRAWN",
  "PRAWNS",
  "PANEER",
  "GOBI",
]);

const PREPARATION_OPTIONS = new Set([
  "CURRY",
  "ROAST",
  "FRY",
  "FRIED",
  "DRY",
  "GRAVY",
]);

const SIZE_OPTIONS = new Set([
  "HALF",
  "FULL",
  "SMALL",
  "MEDIUM",
  "LARGE",
  "REGULAR",
  "JUMBO",
]);

function wordsFor(value) {
  return toUpperClean(value).split(/\s+/).filter(Boolean);
}

function normalizeOptionName(value) {
  const label = toUpperClean(value).replace(/[.,:;]+$/g, "");
  if (!label) return "";

  const alias = OPTION_ALIASES.get(label);
  if (alias) return alias;

  const words = label.split(/\s+/);
  if (words.length === 1) return label;

  return words.map((word) => OPTION_ALIASES.get(word) || word).join(" ");
}

function optionToken(word) {
  return normalizeOptionName(word);
}

function isKnownOptionName(value) {
  const label = normalizeOptionName(value);
  return PROTEIN_OPTIONS.has(label) || PREPARATION_OPTIONS.has(label) || SIZE_OPTIONS.has(label);
}

function inferVariantGroup(options) {
  const labels = options.map((option) => normalizeOptionName(option)).filter(Boolean);
  if (labels.length && labels.every((label) => PROTEIN_OPTIONS.has(label))) return "Protein";
  if (labels.length && labels.every((label) => PREPARATION_OPTIONS.has(label))) return "Preparation";
  if (labels.length && labels.every((label) => SIZE_OPTIONS.has(label))) return "Size";
  return "Options";
}

function stripPriceText(value) {
  return cleanString(value)
    .replace(/(?:₹|rs\.?|inr)\s*(?:\d+(?:\.\d+)?\s*\/\s*)*\d+(?:\.\d+)?\s*(?:\/-)?/gi, " ")
    .replace(/\s+\d+(?:\.\d+)?(?:\s*\/\s*\d+(?:\.\d+)?)+\s*$/g, " ")
    .replace(/\s+\d+(?:\.\d+)?\s*\/-\s*$/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractPriceValuesFromText(value, allowBare = false) {
  const text = cleanString(value);
  if (!text) return [];

  const values = [];
  const prefixedPattern = /(?:₹|rs\.?|inr)\s*((?:\d+(?:\.\d+)?\s*\/\s*)*\d+(?:\.\d+)?)/gi;
  let match;

  while ((match = prefixedPattern.exec(text)) !== null) {
    values.push(
      ...match[1]
        .split("/")
        .map((part) => toPrice(part))
        .filter((price) => price > 0)
    );
  }

  if (!values.length && allowBare && /^\s*(?:\d+(?:\.\d+)?\s*\/\s*)+\d+(?:\.\d+)?\s*$/.test(text)) {
    values.push(
      ...text
        .split("/")
        .map((part) => toPrice(part))
        .filter((price) => price > 0)
    );
  }

  return values;
}

function collectPriceValues(rawItem, fallbackPrice) {
  const sources = [
    [rawItem?.priceText, true],
    [rawItem?.printedName, false],
    [rawItem?.rawName, false],
    [rawItem?.name, false],
  ];

  for (const [source, allowBare] of sources) {
    const values = extractPriceValuesFromText(source, allowBare);
    if (values.length) return values;
  }

  return fallbackPrice > 0 ? [fallbackPrice] : [];
}

function priceForOption(prices, index, fallback) {
  if (!prices.length) return fallback || 0;
  if (prices.length === 1) return prices[0];
  return prices[Math.min(index, prices.length - 1)];
}

function compactVariantOptions(options) {
  const seen = new Set();

  return options
    .map((option) => ({
      name: normalizeOptionName(option?.name),
      price: toPrice(option?.price),
    }))
    .filter((option) => {
      if (!option.name) return false;
      const key = option.name.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function normalizeVariants(variants) {
  if (!Array.isArray(variants)) return [];

  return variants
    .map((variant) => {
      const options = compactVariantOptions(Array.isArray(variant?.options) ? variant.options : []);

      return {
        template: cleanString(variant?.template || variant?.name || variant?.group, "Options") || "Options",
        required: variant?.required !== false,
        options,
      };
    })
    .filter((variant) => variant.options.length);
}

function mergeVariants(...variantGroups) {
  const byTemplate = new Map();

  for (const variants of variantGroups) {
    for (const variant of variants || []) {
      const template = cleanString(variant.template, "Options") || "Options";
      const key = template.toLowerCase();
      const current = byTemplate.get(key) || {
        template,
        required: variant.required !== false,
        options: [],
      };
      const optionKeys = new Set(current.options.map((option) => option.name.toLowerCase()));

      for (const option of compactVariantOptions(variant.options)) {
        const optionKey = option.name.toLowerCase();
        if (!optionKeys.has(optionKey)) {
          current.options.push(option);
          optionKeys.add(optionKey);
        } else {
          current.options = current.options.map((existing) => (
            existing.name.toLowerCase() === optionKey && !existing.price && option.price
              ? { ...existing, price: option.price }
              : existing
          ));
        }
      }

      byTemplate.set(key, current);
    }
  }

  return Array.from(byTemplate.values()).filter((variant) => variant.options.length);
}

function standaloneOptionPart(part) {
  const words = wordsFor(part);
  return words.length === 1 && isKnownOptionName(words[0]);
}

function buildSlashVariantFromName(sourceName, rawItem, fallbackPrice) {
  const cleanName = stripPriceText(sourceName);
  if (!cleanName.includes("/")) return null;

  const segments = cleanName
    .split("/")
    .map((segment) => toUpperClean(segment).replace(/^[\-–—]+|[\-–—]+$/g, "").trim())
    .filter(Boolean);

  if (segments.length < 2) return null;

  const parts = segments.map((segment) => {
    const words = wordsFor(segment);
    const first = words[0] || "";
    const last = words[words.length - 1] || "";

    return {
      segment,
      words,
      leadingOption: optionToken(first),
      trailingOption: optionToken(last),
      leadingKnown: isKnownOptionName(first),
      trailingKnown: isKnownOptionName(last),
    };
  });

  const first = parts[0];
  const last = parts[parts.length - 1];
  let baseWords = [];
  let options = [];

  const middleParts = parts.slice(1, -1);
  const middlePartsAreOptions = middleParts.every((part) => standaloneOptionPart(part.segment));

  if (
    first.words.length > 1 &&
    first.trailingKnown &&
    middlePartsAreOptions &&
    (last.words.length === 1 ? last.trailingKnown : last.leadingKnown)
  ) {
    const prefixWords = first.words.slice(0, -1);
    const suffixWords = last.words.length > 1 ? last.words.slice(1) : [];

    baseWords = [...prefixWords, ...suffixWords];
    options = [
      first.trailingOption,
      ...middleParts.map((part) => normalizeOptionName(part.segment)),
      last.words.length > 1 ? last.leadingOption : last.trailingOption,
    ];
  } else if (
    last.words.length > 1 &&
    last.leadingKnown &&
    parts.slice(0, -1).every((part) => standaloneOptionPart(part.segment))
  ) {
    baseWords = last.words.slice(1);
    options = [
      ...parts.slice(0, -1).map((part) => normalizeOptionName(part.segment)),
      last.leadingOption,
    ];
  } else {
    return null;
  }

  const baseName = baseWords.join(" ").trim();
  const normalizedOptions = options.map(normalizeOptionName).filter(Boolean);
  const uniqueOptions = [...new Set(normalizedOptions)];

  if (!baseName || uniqueOptions.length < 2) return null;

  const prices = collectPriceValues(rawItem, fallbackPrice);
  const variantOptions = uniqueOptions.map((name, index) => ({
    name,
    price: priceForOption(prices, index, fallbackPrice),
  }));
  const positivePrices = variantOptions.map((option) => option.price).filter((price) => price > 0);

  return {
    name: baseName,
    price: positivePrices.length ? Math.min(...positivePrices) : fallbackPrice,
    variants: [
      {
        template: inferVariantGroup(uniqueOptions),
        required: true,
        options: variantOptions,
      },
    ],
  };
}

function deriveSlashVariant(item, rawItem) {
  const sources = [
    rawItem?.printedName,
    rawItem?.rawName,
    rawItem?.name,
    item.name,
  ];

  for (const source of sources) {
    const derived = buildSlashVariantFromName(source, rawItem, item.price);
    if (derived) return derived;
  }

  return null;
}

function mergeItems(items) {
  const merged = [];
  const byKey = new Map();

  for (const item of items) {
    if (!item.name) continue;
    const key = `${item.category.toLowerCase()}::${item.name.toLowerCase()}`;
    const existingIndex = byKey.get(key);

    if (existingIndex === undefined) {
      byKey.set(key, merged.length);
      merged.push(item);
      continue;
    }

    const existing = merged[existingIndex];
    const prices = [existing.price, item.price].filter((price) => price > 0);
    merged[existingIndex] = {
      ...existing,
      price: prices.length ? Math.min(...prices) : 0,
      description: existing.description || item.description,
      veg: existing.veg || item.veg,
      variants: mergeVariants(existing.variants, item.variants),
    };
  }

  return merged;
}

function normalizeItems(raw) {
  const items = Array.isArray(raw?.items) ? raw.items : [];

  const normalized = items
    .map((item) => {
      const name = stripPriceText(item?.name || item?.printedName || "");
      const category = cleanString(item?.category, "General") || "General";
      const price = toPrice(item?.price);
      const variants = normalizeVariants(item?.variants);

      const normalizedItem = {
        name,
        category,
        price,
        description: cleanString(item?.description),
        veg: Boolean(item?.veg),
        variants,
      };

      const derived = deriveSlashVariant(normalizedItem, item);
      if (!derived) return normalizedItem;

      return {
        ...normalizedItem,
        name: derived.name,
        price: derived.price || normalizedItem.price,
        variants: mergeVariants(normalizedItem.variants, derived.variants),
      };
    });

  return mergeItems(normalized).filter((item) => item.name);
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
        let moveToNextModel = false;
        if (moveToNextKey) break;

        for (const useSchema of [true, false]) {
          if (moveToNextKey || moveToNextModel) break;

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
                if (attempt < 2) {
                  await sleep(800);
                  continue;
                }

                moveToNextModel = true;
                break;
              }

              if (error.status === 404) {
                break;
              }

              if (isQuotaError(error)) {
                coolDownKey(key, QUOTA_COOLDOWN_MS, "quota or rate limit reached");
                moveToNextKey = true;
                break;
              }

              if (isRetryableModelError(error)) {
                await sleep(500 * attempt);
                moveToNextModel = true;
                break;
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

    return res.status(responseStatusForError(lastError)).json({
      message: responseMessageForError(lastError),
      details: responseDetailsForError(lastError),
      retryable: isQuotaError(lastError) || isRetryableModelError(lastError),
    });
  } catch (error) {
    console.error("Parse Menu API Route Error:", error);
    return res.status(500).json({
      message: "Internal Server Error during menu parsing",
      details: error.message,
    });
  }
}
