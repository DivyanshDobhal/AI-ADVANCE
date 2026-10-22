import { GoogleGenAI } from "@google/genai";
import Groq from "groq-sdk";

export const SUPPORTED_MODELS = {
  gemini: process.env.GEMINI_MODEL || "gemini-2.5-flash",
  groq: process.env.GROQ_MODEL || "llama-3.3-70b-versatile"
};

export class AIProviderError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = "AIProviderError";
    this.provider = options.provider || "unknown";
    this.status = options.status || 500;
    this.isRecoverable = Boolean(options.isRecoverable);
    this.originalError = options.originalError || null;
  }
}

/**
 * Common prompt template that instructs the LLM to act as the AI Software Compiler.
 */
export function buildCompilerPrompt(prompt, seed) {
  return `You are the AI Software Compiler engine.
Given the user's software requirement, produce a complete, strictly valid JSON specification for the full-stack application.
Do NOT include markdown fences, backticks, or explanatory text. Output ONLY raw JSON matching this schema:

{
  "intent": {
    "app_name": "${seed?.intent?.app_name || "Enterprise App"}",
    "app_type": "${seed?.intent?.app_type || "Business Application"}",
    "confidence": "high",
    "features": [
      { "name": "user_management", "priority": "must-have", "source": "explicit" }
    ],
    "roles": [
      { "name": "admin", "description": "Full system administrator" },
      { "name": "member", "description": "Standard authorized user" }
    ],
    "business_rules": [
      "Users can only modify records they own unless they have admin role."
    ],
    "assumptions": [
      "Modern full-stack React + Express + MongoDB architecture"
    ],
    "ambiguities": []
  },
  "design": {
    "entities": [
      {
        "name": "users",
        "fields": [
          { "name": "id", "type": "id", "required": true },
          { "name": "email", "type": "string", "required": true },
          { "name": "name", "type": "string", "required": true },
          { "name": "role", "type": "string", "required": true }
        ]
      }
    ],
    "relationships": [],
    "flows": [],
    "access_control": {
      "admin": [{ "resource": "users", "actions": ["create", "read", "update", "delete"] }]
    }
  },
  "schemas": {
    "ui_schema": {
      "navigation": [
        { "label": "Dashboard", "route": "/dashboard", "roles": ["admin", "member"] }
      ],
      "pages": [
        {
          "name": "Dashboard",
          "route": "/dashboard",
          "layout": "app",
          "roles": ["admin", "member"],
          "components": ["MetricGrid", "DataTable", "PrimaryActions"],
          "api_dependencies": ["/api/users"]
        }
      ]
    },
    "api_schema": {
      "endpoints": [
        {
          "method": "GET",
          "path": "/api/users",
          "resource": "users",
          "response_schema": { "type": "array", "item": "users" },
          "allowed_roles": ["admin", "member"]
        }
      ]
    },
    "db_schema": {
      "tables": [
        {
          "name": "users",
          "columns": [
            { "name": "id", "type": "id", "required": true, "references": null },
            { "name": "email", "type": "string", "required": true, "references": null },
            { "name": "name", "type": "string", "required": true, "references": null },
            { "name": "role", "type": "string", "required": true, "references": null }
          ],
          "primary_key": "id",
          "indexes": ["email"]
        }
      ]
    },
    "auth_schema": {
      "roles": [
        { "name": "admin", "description": "Full administrator" },
        { "name": "member", "description": "Standard user" }
      ],
      "permissions": {},
      "flows": []
    },
    "business_logic": {
      "rules": []
    }
  }
}

User Prompt:
${prompt}
`;
}

/**
 * Safe JSON parser that strips markdown ticks and extracts first JSON object
 */
export function extractJsonFromText(text) {
  if (!text || typeof text !== "string") {
    throw new Error("Empty model response");
  }
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("Model response did not contain a valid JSON object");
    return JSON.parse(match[0]);
  }
}

/**
 * Gemini Provider Adapter
 */
export async function generateWithGemini(prompt, seed, options = {}) {
  const apiKey = options.apiKey || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new AIProviderError("GEMINI_API_KEY is not configured", {
      provider: "gemini",
      status: 401,
      isRecoverable: false
    });
  }

  const model = options.model || process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const timeoutMs = options.timeoutMs || 45000;

  try {
    // Attempt official @google/genai SDK
    const ai = new GoogleGenAI({ apiKey });
    const responsePromise = ai.models.generateContent({
      model,
      contents: buildCompilerPrompt(prompt, seed),
      config: {
        temperature: 0.1,
        responseMimeType: "application/json"
      }
    });

    const response = await Promise.race([
      responsePromise,
      new Promise((_, reject) => setTimeout(() => reject(new Error("Gemini request timeout")), timeoutMs))
    ]);

    const rawText = response.text || (typeof response.text === "function" ? response.text() : "");
    if (!rawText) throw new Error("Gemini returned empty text output");
    const parsed = extractJsonFromText(rawText);
    return { data: parsed, provider: "gemini", model };
  } catch (err) {
    // Check if error is recoverable (e.g. rate limit 429, timeout, 5xx)
    const msg = String(err.message || "");
    const isRateLimit = msg.includes("429") || msg.toLowerCase().includes("quota") || msg.toLowerCase().includes("rate limit");
    const isTimeout = msg.toLowerCase().includes("timeout");
    const isAuth = msg.includes("401") || msg.includes("403") || msg.toLowerCase().includes("api key");

    throw new AIProviderError(msg, {
      provider: "gemini",
      status: isAuth ? 401 : isRateLimit ? 429 : 500,
      isRecoverable: isRateLimit || isTimeout || !isAuth,
      originalError: err
    });
  }
}

/**
 * Groq Provider Adapter
 */
export async function generateWithGroq(prompt, seed, options = {}) {
  const apiKey = options.apiKey || process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new AIProviderError("GROQ_API_KEY is not configured", {
      provider: "groq",
      status: 401,
      isRecoverable: false
    });
  }

  const model = options.model || process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
  const timeoutMs = options.timeoutMs || 45000;

  try {
    const groq = new Groq({ apiKey });
    const completionPromise = groq.chat.completions.create({
      model,
      messages: [
        {
          role: "system",
          content: "You are the AI Software Compiler. Return strictly valid JSON with no markdown wrapping."
        },
        {
          role: "user",
          content: buildCompilerPrompt(prompt, seed)
        }
      ],
      temperature: 0.1,
      response_format: { type: "json_object" }
    });

    const completion = await Promise.race([
      completionPromise,
      new Promise((_, reject) => setTimeout(() => reject(new Error("Groq request timeout")), timeoutMs))
    ]);

    const rawText = completion.choices?.[0]?.message?.content || "";
    if (!rawText) throw new Error("Groq returned empty completion");
    const parsed = extractJsonFromText(rawText);
    return { data: parsed, provider: "groq", model };
  } catch (err) {
    const msg = String(err.message || "");
    const isRateLimit = msg.includes("429") || msg.toLowerCase().includes("rate limit") || msg.toLowerCase().includes("quota");
    const isTimeout = msg.toLowerCase().includes("timeout");
    const isAuth = msg.includes("401") || msg.includes("403") || msg.toLowerCase().includes("api key");

    throw new AIProviderError(msg, {
      provider: "groq",
      status: isAuth ? 401 : isRateLimit ? 429 : 500,
      isRecoverable: isRateLimit || isTimeout || !isAuth,
      originalError: err
    });
  }
}

/**
 * Provider Router with Fallback
 * Supports:
 * - "gemini": forces Gemini
 * - "groq": forces Groq
 * - "auto": chooses primary provider (default Gemini) and falls back to Groq if recoverable error occurs
 */
export async function executeCompilerAI(prompt, seed, options = {}) {
  const requestedProvider = String(options.provider || process.env.AI_PROVIDER || "auto").toLowerCase();

  if (requestedProvider === "groq") {
    return generateWithGroq(prompt, seed, options);
  }

  if (requestedProvider === "gemini") {
    return generateWithGemini(prompt, seed, options);
  }

  // AUTO MODE: Try Primary (Gemini) -> Recoverable Fallback to Groq
  // If only GROQ_API_KEY is present and no GEMINI_API_KEY, use Groq directly
  const hasGemini = Boolean(options.geminiApiKey || process.env.GEMINI_API_KEY);
  const hasGroq = Boolean(options.groqApiKey || process.env.GROQ_API_KEY);

  if (!hasGemini && hasGroq) {
    return generateWithGroq(prompt, seed, { ...options, apiKey: options.groqApiKey });
  }

  try {
    return await generateWithGemini(prompt, seed, { ...options, apiKey: options.geminiApiKey });
  } catch (geminiError) {
    if (geminiError.isRecoverable && hasGroq) {
      console.warn(`[AIProvider] Gemini failed with recoverable error (${geminiError.message}). Falling back to Groq.`);
      try {
        const groqResult = await generateWithGroq(prompt, seed, { ...options, apiKey: options.groqApiKey });
        return {
          ...groqResult,
          fallbackUsed: true,
          primaryError: geminiError.message
        };
      } catch (groqError) {
        throw new AIProviderError(
          `Both AI providers failed. Gemini: ${geminiError.message}. Groq: ${groqError.message}`,
          { provider: "auto", status: 502, isRecoverable: false }
        );
      }
    }
    throw geminiError;
  }
}

/**
 * Provider Health Status check without exposing secret keys
 */
export function getProviderHealthStatus() {
  const hasGemini = Boolean(process.env.GEMINI_API_KEY);
  const hasGroq = Boolean(process.env.GROQ_API_KEY);

  return {
    configuredProvider: process.env.AI_PROVIDER || "auto",
    providers: {
      gemini: {
        configured: hasGemini,
        model: SUPPORTED_MODELS.gemini,
        status: hasGemini ? "ready" : "unconfigured"
      },
      groq: {
        configured: hasGroq,
        model: SUPPORTED_MODELS.groq,
        status: hasGroq ? "ready" : "unconfigured"
      }
    }
  };
}
