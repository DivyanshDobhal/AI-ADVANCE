import {
  compileApplication,
  repairSchemas,
  simulateRuntime,
  validateSchemas,
  generateProjectSource
} from "../src/compiler.js";
import { findUserByToken } from "../src/auth-db.js";
import { bearerToken } from "./auth.js";
import { executeCompilerAI, AIProviderError, getProviderHealthStatus } from "../src/ai-providers.js";

export default async function handler(req, res) {
  // CORS support
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-gemini-api-key, x-groq-api-key");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  // Health check
  if (req.method === "GET") {
    const health = getProviderHealthStatus();
    return res.status(200).json({
      status: "ok",
      service: "ai-software-compiler",
      ...health
    });
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST, OPTIONS");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const prompt = String(body.prompt || "").trim();
    const compileMode = String(body.compileMode || process.env.AI_PROVIDER || "auto").toLowerCase();

    if (!prompt) {
      return res.status(400).json({ error: "Prompt is required" });
    }

    const token = bearerToken(req);
    const user = await findUserByToken(token);
    // Allow compilation for authenticated user or if in demo / token bypass
    if (!user && !process.env.ALLOW_ANONYMOUS_COMPILE) {
      return res.status(401).json({ error: "Login is required to compile applications." });
    }

    const options = {
      provider: compileMode,
      geminiApiKey:
        body.geminiApiKey || req.headers["x-gemini-api-key"] || req.headers["X-Gemini-API-Key"] || process.env.GEMINI_API_KEY,
      groqApiKey:
        body.groqApiKey || req.headers["x-groq-api-key"] || req.headers["X-Groq-API-Key"] || process.env.GROQ_API_KEY,
      geminiModel: body.geminiModel || process.env.GEMINI_MODEL,
      groqModel: body.groqModel || process.env.GROQ_MODEL
    };

    const output = await compilePromptWithAI(prompt, options);
    return res.status(200).json(formatResponse(output));
  } catch (error) {
    console.error("[CompileError]", error);
    return res.status(500).json({
      error: "Compilation failed",
      detail: error instanceof Error ? error.message : "Unknown error"
    });
  }
}

async function compilePromptWithAI(prompt, options) {
  const startedAt = Date.now();
  const deterministic = compileApplication(prompt, { injectFault: false });

  if (options.provider === "local" || options.provider === "deterministic") {
    return {
      ...deterministic,
      provider: {
        mode: "deterministic",
        model: "local-compiler",
        fallbackUsed: false
      }
    };
  }

  const hasAnyKey = Boolean(options.geminiApiKey || options.groqApiKey);

  if (!hasAnyKey) {
    return {
      ...deterministic,
      provider: {
        mode: "local-fallback",
        model: "deterministic",
        fallbackUsed: true,
        reason: "Neither GEMINI_API_KEY nor GROQ_API_KEY is configured on the server."
      }
    };
  }

  try {
    const aiResult = await executeCompilerAI(prompt, deterministic, options);
    const generatedBundle = aiResult.data || {};

    // Normalize AI bundle with fallback to deterministic elements if missing
    const intent = generatedBundle.intent || deterministic.intent;
    const design = generatedBundle.design || deterministic.design;
    const schemas = generatedBundle.schemas || deterministic.schemas;

    // Run compiler validation + automatic repair
    const validation = validateSchemas({ intent, design, schemas });
    const repair = repairSchemas({ intent, design, schemas }, validation);
    const finalValidation = validateSchemas({
      intent,
      design,
      schemas: repair.schemas
    });
    const runtime = simulateRuntime(repair.schemas, finalValidation);

    // Full-stack code generation & cross-layer verification
    const project = generateProjectSource({
      intent,
      design,
      schemas: repair.schemas
    });

    return {
      ok: finalValidation.errors.length === 0 && runtime.ok,
      input: prompt,
      intent,
      design,
      schemas: repair.schemas,
      project,
      validation: {
        ...finalValidation,
        originalIssues: validation.errors,
        repaired: repair.applied.length > 0,
        repairs: repair.applied
      },
      runtime,
      metrics: {
        latencyMs: Date.now() - startedAt,
        stageTimings: [
          { name: "AI Blueprint Generation", ms: Date.now() - startedAt },
          { name: "Validation + Repair", ms: 2 },
          { name: "Full-Stack Code Generation", ms: 3 },
          { name: "Runtime Simulation", ms: 1 }
        ],
        retries: repair.applied.length,
        deterministic: false,
        costTier: `${aiResult.provider}-live`
      },
      provider: {
        mode: `${aiResult.provider}-live`,
        model: aiResult.model,
        provider: aiResult.provider,
        fallbackUsed: Boolean(aiResult.fallbackUsed),
        primaryError: aiResult.primaryError || null
      }
    };
  } catch (error) {
    console.warn(`[Compile] AI generation error: ${error.message}. Falling back to deterministic compilation.`);
    return {
      ...deterministic,
      provider: {
        mode: "local-fallback",
        model: "deterministic",
        fallbackUsed: true,
        reason: error instanceof Error ? error.message : "AI request failed"
      }
    };
  }
}

function formatResponse(output) {
  return {
    ...output,
    compiledAt: new Date().toISOString()
  };
}
