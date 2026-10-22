# AI Software Compiler

**Natural language or JSON specification ➔ Intent Extraction ➔ System Design ➔ Schema Generation ➔ Validation & Repair ➔ Full-Stack Code Generation (React + Express + MongoDB) ➔ Runtime Simulation & ZIP Export.**

An enterprise-grade AI software compiler built with a modular dual-provider AI engine (**Google Gemini** + **Groq**), persistent **MongoDB** data storage, secure local email/password authentication (Google & GitHub OAuth removed), and automatic cross-layer validation.

---

## Key Features

1. **Dual AI Provider Architecture**:
   - **Google Gemini**: Uses the official `@google/genai` SDK and Google Generative Language API (`GEMINI_MODEL`, default `gemini-2.5-flash`).
   - **Groq Cloud**: Uses the official `groq-sdk` for ultra-low latency Llama-3.3 generation (`GROQ_MODEL`, default `llama-3.3-70b-versatile`).
   - **Configurable Routing & Fallback**: `AI_PROVIDER=auto` tries Gemini as primary, automatically falling back to Groq upon recoverable error (rate limits, timeouts), and cleanly falling back to the deterministic engine when no API keys are configured.

2. **Full-Stack Source Code Generation**:
   - **Frontend**: Runnable React 18 + Vite + Tailwind CSS application complete with navigation, auth context, responsive CRUD data tables, forms, and API client.
   - **Backend**: Complete Node.js + Express REST API server with JWT authentication, role-based access control (RBAC), input validation, error handling, and health check endpoints.
   - **Database**: Mongoose models with field types, indexes, and initialization seed script.
   - **Export as ZIP**: In-browser client-side ZIP packaging using `JSZip` to download the entire generated application codebase.

3. **Secure Authentication & Persistent Sessions**:
   - Google Sign-In and GitHub Sign-In removed completely.
   - Local authentication using email and password with PBKDF2 salt-hashed passwords.
   - Persistent sessions in MongoDB with rate limiting and secure session management.

4. **MongoDB Persistence**:
   - Connection pooling across serverless invocations (`MONGODB_URI`, `MONGODB_DB_NAME`).
   - Resilient in-memory fallback mode so the application remains operable even during database network interruptions.
   - Unified health check endpoint (`/api/health`) reporting database latency without leaking credentials.

5. **Cross-Layer Validation & Automatic Repair**:
   - Validates that every frontend UI page and API dependency has a corresponding backend REST endpoint.
   - Verifies that all endpoints map to real database models and schema attributes.
   - Self-healing repair engine that resolves schema discrepancies.

---

## Target Deployment: Vercel & Node.js

- **Frontend**: Vite SPA built to `dist`.
- **Serverless API Routes**:
  - `api/compile.js`: Main compilation pipeline with AI provider routing, validation, and codegen.
  - `api/auth.js`: Registration, login, logout, session verification, rate-limited auth.
  - `api/health.js`: Live health check for MongoDB and AI provider connectivity.

---

## Environment Configuration

Create a `.env` or `.env.local` file (see `.env.example`):

```dotenv
# Environment
NODE_ENV=development
APP_URL=http://localhost:5173

# AI Provider Selection: "auto" | "gemini" | "groq" | "local"
AI_PROVIDER=auto

# Google Gemini
GEMINI_API_KEY=your_gemini_api_key
GEMINI_MODEL=gemini-2.5-flash

# Groq Cloud
GROQ_API_KEY=your_groq_api_key
GROQ_MODEL=llama-3.3-70b-versatile

# MongoDB Atlas
MONGODB_URI=mongodb+srv://<db_user>:<db_password>@cluster0.nhewmy8.mongodb.net/?retryWrites=true&w=majority
MONGODB_DB_NAME=ai_software_compiler

# Sessions & Token Lifetime
AUTH_TOKEN_TTL_DAYS=7
```

---

## Local Development & Testing

### 1. Install Dependencies
```bash
npm install
```

### 2. Run Test Suite
Runs auth security tests, provider error handling, cross-layer audits, and 20 evaluation benchmarks:
```bash
npm test
```

### 3. Run Production Build
```bash
npm run build
```

### 4. Start Local Dev Server
```bash
npm run dev
```

---

## MongoDB Atlas Configuration

1. In MongoDB Atlas, create a database user under **Database Access**.
2. Under **Network Access**, ensure `0.0.0.0/0` is allowed to permit Vercel's distributed serverless IP addresses to connect.
3. Configure `MONGODB_URI` and `MONGODB_DB_NAME` in your Vercel Project Settings.

---

## Deploying to Vercel

1. Push your repository to GitHub: `https://github.com/DivyanshDobhal/AI-ADVANCE`.
2. Connect your repository in Vercel.
3. Add the environment variables:
   - `GEMINI_API_KEY`
   - `GROQ_API_KEY`
   - `MONGODB_URI`
   - `MONGODB_DB_NAME`
   - `AI_PROVIDER` (e.g. `auto`)
4. Trigger deployment.
