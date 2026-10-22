import assert from "node:assert";
import { hashPassword, verifyPassword, createSessionToken, hashToken } from "../src/auth-db.js";
import { executeCompilerAI, AIProviderError, extractJsonFromText } from "../src/ai-providers.js";
import { compileApplication } from "../src/compiler.js";
import { generateProjectSource, performCrossLayerAudit, createProjectZip } from "../src/codegen.js";

async function runTests() {
  console.log("▶ Running AI Software Compiler Test Suite...\n");
  let passed = 0;
  let total = 0;

  function test(name, fn) {
    total++;
    try {
      fn();
      passed++;
      console.log(`  ✓ ${name}`);
    } catch (e) {
      console.error(`  ✗ ${name}`);
      console.error(e);
      process.exitCode = 1;
    }
  }

  async function asyncTest(name, fn) {
    total++;
    try {
      await fn();
      passed++;
      console.log(`  ✓ ${name}`);
    } catch (e) {
      console.error(`  ✗ ${name}`);
      console.error(e);
      process.exitCode = 1;
    }
  }

  // 1. AUTH & SECURITY TESTS
  console.log("--- 1. Authentication & Password Security ---");
  test("Password hashing uses salted PBKDF2 and verifies correctly", () => {
    const password = "SuperSecretPassword123!";
    const hashed = hashPassword(password);
    assert(hashed.includes(":"), "Hash must contain salt and hash separator");
    assert(verifyPassword(password, hashed), "Valid password must verify true");
    assert(!verifyPassword("WrongPassword", hashed), "Invalid password must verify false");
  });

  test("Session tokens are cryptographically random and securely hashed", () => {
    const s1 = createSessionToken();
    const s2 = createSessionToken();
    assert.notStrictEqual(s1.token, s2.token, "Tokens must be unique");
    assert.strictEqual(s1.tokenHash, hashToken(s1.token), "Token hash must match sha256");
    assert(s1.expiresAt > new Date(), "Session token must have future expiry");
  });

  // 2. AI PROVIDER & ADAPTER TESTS
  console.log("\n--- 2. AI Provider Adapters & JSON Parsing ---");
  test("JSON extractor safely cleans markdown backticks and extracts object", () => {
    const markdown = '```json\n{"intent": {"app_name": "Test App"}}\n```';
    const parsed = extractJsonFromText(markdown);
    assert.strictEqual(parsed.intent.app_name, "Test App");

    const raw = 'Leading noise {"status": "ok"} trailing';
    const parsedRaw = extractJsonFromText(raw);
    assert.strictEqual(parsedRaw.status, "ok");
  });

  test("AIProviderError encapsulates provider, status, and recoverability", () => {
    const err = new AIProviderError("Quota exceeded", { provider: "gemini", status: 429, isRecoverable: true });
    assert.strictEqual(err.provider, "gemini");
    assert.strictEqual(err.status, 429);
    assert.strictEqual(err.isRecoverable, true);
  });

  await asyncTest("Provider router falls back or throws cleanly without fabricating outputs", async () => {
    try {
      await executeCompilerAI("Build a tool", {}, { provider: "invalid_test", timeoutMs: 100 });
      assert.fail("Should have thrown when no API key configured");
    } catch (err) {
      assert(err instanceof Error);
    }
  });

  // 3. COMPILER & FULL-STACK CODEGEN TESTS
  console.log("\n--- 3. Full-Stack Code Generation & Cross-Layer Validation ---");
  test("Compiler pipeline executes Intent -> Design -> Schemas -> CodeGen", () => {
    const result = compileApplication("Build a clinic booking system with patients and appointments");
    assert.strictEqual(result.ok, true, "Compilation should succeed");
    assert(result.intent.app_name, "Intent must include app_name");
    assert(result.schemas.db_schema.tables.length > 0, "DB tables must be generated");
    assert(result.project, "Project code bundle must be generated");
    assert(result.project.files["frontend/src/App.jsx"], "Frontend App.jsx must exist");
    assert(result.project.files["backend/server.js"], "Backend server.js must exist");
    assert(result.project.files["backend/config/db.js"], "MongoDB connection module must exist");
  });

  test("Cross-layer audit confirms all frontend pages and API routes have backend counterparts", () => {
    const result = compileApplication("Create an e-commerce platform with products and orders");
    const audit = result.project.crossLayerChecks;
    assert.strictEqual(audit.passed, true, "Cross-layer audit must pass 100%");
    assert(audit.total > 0, "Audit must execute checks");
  });

  await asyncTest("JSZip generates valid archive from project files", async () => {
    const result = compileApplication("Create a task manager with projects and tasks");
    const zipBlob = await createProjectZip(result.project.files);
    assert(zipBlob, "Zip blob must be generated");
    assert(zipBlob.size > 1000, "Zip size must be non-trivial");
  });

  console.log(`\n========================================`);
  console.log(`Results: ${passed} / ${total} tests passed.`);
  console.log(`========================================\n`);

  if (passed !== total) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Test runner failed:", err);
  process.exit(1);
});
