import { checkMongoHealth } from "../src/auth-db.js";
import { getProviderHealthStatus } from "../src/ai-providers.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  const dbHealth = await checkMongoHealth();
  const aiHealth = getProviderHealthStatus();

  return res.status(200).json({
    status: "ok",
    timestamp: new Date().toISOString(),
    service: "AI Software Compiler",
    database: dbHealth,
    ai: aiHealth,
    features: [
      "Intent Extraction",
      "System Design",
      "Schema Generation",
      "Validation + Automatic Repair",
      "Full-Stack Code Generation (React + Express + MongoDB)",
      "Runtime Simulation",
      "ZIP Export"
    ]
  });
}
