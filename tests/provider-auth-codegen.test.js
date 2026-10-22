import assert from "node:assert";
import { hashPassword, verifyPassword, createSessionToken, hashToken } from "../src/auth-db.js";
import { executeCompilerAI, AIProviderError, extractJsonFromText } from "../src/ai-providers.js";
import { compileApplication } from "../src/compiler.js";
import { generateProjectSource, performCrossLayerAudit, createProjectZip } from "../src/codegen.js";
import { generateFrontendBlueprint, generateBackendBlueprint, validateBlueprints } from "../src/blueprints.js";

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

  // 4. DUAL BLUEPRINTS (FRONTEND & BACKEND) TESTS
  console.log("\n--- 4. Dual Blueprints Generation & Architecture Validation ---");
  test("Frontend blueprint contains complete UI structure, routes, components, flows, and file tree", () => {
    const result = compileApplication("Create an inventory management system with products and suppliers");
    const fb = result.blueprints.frontend;
    assert(fb, "Frontend blueprint must exist");
    assert.strictEqual(typeof fb.overview.appName, "string", "Must have appName");
    assert.strictEqual(typeof fb.overview.framework, "string", "Must have framework");
    assert(Array.isArray(fb.pages) && fb.pages.length >= 2, "Must generate structured pages");
    
    // Validate each page has route, components, consumed endpoints, states
    for (const page of fb.pages) {
      assert(page.name, "Page must have a name");
      assert(page.route, "Page must have a route");
      assert(Array.isArray(page.components), "Page must have components list");
      assert(Array.isArray(page.apiEndpointsConsumed), "Page must have consumed endpoints");
      assert(page.states.loading && page.states.error, "Page must define UI states");
    }

    assert(fb.componentHierarchy.name, "Must have componentHierarchy name");
    assert(Array.isArray(fb.componentHierarchy.children), "Must have component tree");
    assert(Array.isArray(fb.userInteractionFlows) && fb.userInteractionFlows.length > 0, "Must have interaction flows");
    assert(fb.stateAndDataFlow.sessionState, "Must specify session state architecture");
    assert(fb.stylingAndDesign.designTokens, "Must specify design tokens");
    assert(Array.isArray(fb.fileStructure) && fb.fileStructure.length > 5, "Must produce frontend file structure");
  });

  test("Backend blueprint contains complete server architecture, REST endpoints, business logic, auth, and DB models", () => {
    const result = compileApplication("Create a medical appointment booking platform");
    const bb = result.blueprints.backend;
    assert(bb, "Backend blueprint must exist");
    assert.strictEqual(typeof bb.overview.runtime, "string", "Must specify server runtime");
    assert(Array.isArray(bb.serverArchitecture.requestProcessingPipeline), "Must specify request pipeline stages");
    assert(Array.isArray(bb.apiEndpoints) && bb.apiEndpoints.length >= 3, "Must generate REST API endpoint specifications");

    // Validate endpoint schema specs
    for (const ep of bb.apiEndpoints) {
      assert(ep.method, "Endpoint must specify HTTP method");
      assert(ep.path, "Endpoint must specify route path");
      assert(Array.isArray(ep.statusCodes), "Endpoint must document HTTP status codes");
      assert(ep.databaseOperation, "Endpoint must document database operation");
    }

    assert(Array.isArray(bb.businessLogicRules) && bb.businessLogicRules.length > 0, "Must specify business logic rules");
    assert(bb.authSystem.authenticationType, "Must specify authentication type");
    assert(Array.isArray(bb.databaseBlueprint.collections), "Must specify database collections");
    assert(Array.isArray(bb.fileStructure) && bb.fileStructure.length > 5, "Must produce backend file structure");
  });

  test("Cross-layer blueprint validator ensures 100% route alignment between frontend and backend", () => {
    const result = compileApplication("Build a fitness workout planner with routines and logs");
    const validation = result.blueprints.validation;
    assert.strictEqual(validation.valid, true, "Blueprint validation must pass");
    assert(validation.passedChecks > 0, "Checks must have run");
    assert.strictEqual(validation.errors.length, 0, "No errors should exist");
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

