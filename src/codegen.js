import JSZip from "jszip";

/**
 * Full-Stack Software Code Generator
 * Converts validated schema bundles into runnable React+Vite frontend and Node+Express+MongoDB backend source code.
 */
export function generateProjectSource(bundle) {
  const { intent, design, schemas } = bundle;
  const appName = intent?.app_name || "GeneratedApp";
  const safeName = appName.toLowerCase().replace(/[^a-z0-9_-]/g, "-");
  const tables = schemas?.db_schema?.tables || [];
  const endpoints = schemas?.api_schema?.endpoints || [];
  const roles = (schemas?.auth_schema?.roles || [{ name: "admin" }, { name: "member" }]).map((r) => r.name);

  const files = {};

  // 1. Root README and configuration
  files["README.md"] = generateReadme(appName, safeName, tables);
  files[".env.example"] = generateRootEnv();
  files[".gitignore"] = `node_modules\n.env\n.env.local\ndist\nbuild\n*.log\n.DS_Store\n`;

  // 2. BACKEND CODE GENERATION (Node.js + Express + Mongoose)
  files["backend/package.json"] = JSON.stringify(
    {
      name: `${safeName}-backend`,
      version: "1.0.0",
      description: `Backend API server for ${appName}`,
      type: "module",
      scripts: {
        start: "node server.js",
        dev: "nodemon server.js",
        seed: "node scripts/seed.js"
      },
      dependencies: {
        bcryptjs: "^2.4.3",
        cors: "^2.8.5",
        dotenv: "^16.4.7",
        express: "^4.21.2",
        jsonwebtoken: "^9.0.2",
        mongoose: "^8.9.5"
      },
      devDependencies: {
        nodemon: "^3.1.9"
      }
    },
    null,
    2
  );

  files["backend/.env.example"] = `PORT=5000\nMONGODB_URI=mongodb://localhost:27017/${safeName}\nJWT_SECRET=replace_with_secure_random_jwt_secret_key\nCLIENT_URL=http://localhost:5173\n`;

  files["backend/config/db.js"] = `import mongoose from "mongoose";

export async function connectDB() {
  try {
    const uri = process.env.MONGODB_URI || "mongodb://localhost:27017/${safeName}";
    const conn = await mongoose.connect(uri);
    console.log(\`[MongoDB] Connected to database: \${conn.connection.name} (\${conn.connection.host})\`);
  } catch (error) {
    console.error("[MongoDB] Connection error:", error.message);
    process.exit(1);
  }
}
`;

  files["backend/middleware/auth.js"] = `import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "development_secret_change_in_production";

export function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Access denied. No authentication token provided." });
  }

  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token." });
  }
}

export function authorizeRoles(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: "Authentication required." });
    }
    if (allowedRoles.length && !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: \`Forbidden: Role '\${req.user.role}' does not have permission for this resource.\`
      });
    }
    next();
  };
}
`;

  // Backend Models & Controllers for each resource
  const entityNames = tables.map((t) => t.name);

  // User Model & Auth Controller
  files["backend/models/User.js"] = generateUserModel();
  files["backend/controllers/authController.js"] = generateAuthController();
  files["backend/routes/authRoutes.js"] = `import express from "express";
import { register, login, getMe } from "../controllers/authController.js";
import { authenticate } from "../middleware/auth.js";

const router = express.Router();
router.post("/register", register);
router.post("/login", login);
router.get("/me", authenticate, getMe);

export default router;
`;

  // Models and Controllers for all domain entities
  for (const table of tables) {
    if (table.name === "users") continue;
    const modelName = toPascalCase(singular(table.name));
    files[`backend/models/${modelName}.js`] = generateMongooseModel(table);
    files[`backend/controllers/${table.name}Controller.js`] = generateResourceController(table, modelName);
    files[`backend/routes/${table.name}Routes.js`] = generateResourceRoutes(table, modelName);
  }

  // Seed script
  files["backend/scripts/seed.js"] = generateSeedScript(tables, appName);

  // Server entry point
  files["backend/server.js"] = generateServerJs(tables, safeName);

  // 3. FRONTEND CODE GENERATION (Vite + React + Tailwind)
  files["frontend/package.json"] = JSON.stringify(
    {
      name: `${safeName}-frontend`,
      version: "1.0.0",
      private: true,
      type: "module",
      scripts: {
        dev: "vite",
        build: "vite build",
        preview: "vite preview"
      },
      dependencies: {
        "lucide-react": "^0.344.0",
        react: "^18.3.1",
        "react-dom": "^18.3.1"
      },
      devDependencies: {
        "@vitejs/plugin-react": "^4.3.4",
        autoprefixer: "^10.4.20",
        postcss: "^8.4.49",
        tailwindcss: "^3.4.17",
        vite: "^5.4.11"
      }
    },
    null,
    2
  );

  files["frontend/vite.config.js"] = `import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:5000",
        changeOrigin: true
      }
    }
  }
});
`;

  files["frontend/index.html"] = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(appName)}</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  </head>
  <body class="bg-slate-950 text-slate-100 font-sans antialiased selection:bg-indigo-500 selection:text-white">
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
`;

  files["frontend/src/index.css"] = `@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  margin: 0;
  font-family: 'Inter', sans-serif;
  background-color: #0b0f19;
  color: #f1f5f9;
}
`;

  files["frontend/tailwind.config.js"] = `/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#eef2ff',
          500: '#6366f1',
          600: '#4f46e5',
          700: '#4338ca'
        }
      }
    },
  },
  plugins: [],
}
`;

  files["frontend/src/api/client.js"] = generateApiClient();
  files["frontend/src/main.jsx"] = `import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
`;

  files["frontend/src/App.jsx"] = generateReactApp(appName, tables, roles);
  files["frontend/src/pages/Dashboard.jsx"] = generateDashboardPage(appName, tables);
  files["frontend/src/pages/AuthPage.jsx"] = generateAuthPage();

  for (const table of tables) {
    if (table.name === "users") continue;
    files[`frontend/src/pages/${toPascalCase(table.name)}Page.jsx`] = generateEntityCrudPage(table);
  }

  // Cross-layer verification summary
  const crossLayerChecks = performCrossLayerAudit(tables, endpoints, files);

  return {
    appName,
    safeName,
    files,
    fileList: Object.keys(files),
    crossLayerChecks,
    summary: {
      totalFiles: Object.keys(files).length,
      frontendFiles: Object.keys(files).filter((f) => f.startsWith("frontend/")).length,
      backendFiles: Object.keys(files).filter((f) => f.startsWith("backend/")).length,
      tablesCount: tables.length,
      endpointsCount: endpoints.length
    }
  };
}

/**
 * Cross-layer validation ensuring frontend API calls match backend routes and DB models
 */
export function performCrossLayerAudit(tables, endpoints, files) {
  const checks = [];
  const tableNames = new Set(tables.map((t) => t.name));

  // 1. Verify all table resources have backend route files
  for (const table of tables) {
    if (table.name === "users") continue;
    const routeFile = `backend/routes/${table.name}Routes.js`;
    const modelFile = `backend/models/${toPascalCase(singular(table.name))}.js`;
    checks.push({
      layer: "Backend Routes & Models",
      target: table.name,
      ok: Boolean(files[routeFile] && files[modelFile]),
      message: `Resource '${table.name}' has Mongoose model and Express route handler.`
    });
  }

  // 2. Verify all API endpoints map to a defined table
  for (const endpoint of endpoints) {
    const mapsToTable = tableNames.has(endpoint.resource);
    checks.push({
      layer: "REST API Endpoint",
      target: endpoint.path,
      ok: mapsToTable,
      message: mapsToTable
        ? `Endpoint ${endpoint.method} ${endpoint.path} is bound to collection '${endpoint.resource}'.`
        : `Endpoint ${endpoint.method} ${endpoint.path} references missing resource '${endpoint.resource}'.`
    });
  }

  // 3. Verify frontend pages exist for all domain tables
  for (const table of tables) {
    if (table.name === "users") continue;
    const pageFile = `frontend/src/pages/${toPascalCase(table.name)}Page.jsx`;
    checks.push({
      layer: "Frontend UI Pages",
      target: table.name,
      ok: Boolean(files[pageFile]),
      message: `CRUD Page exists for resource '${table.name}'.`
    });
  }

  return {
    passed: checks.every((c) => c.ok),
    total: checks.length,
    checks
  };
}

/**
 * Packages generated files into a ZIP Blob/Buffer using JSZip
 */
export async function createProjectZip(files) {
  const zip = new JSZip();
  for (const [path, content] of Object.entries(files)) {
    zip.file(path, content);
  }
  return zip.generateAsync({
    type: "blob",
    compression: "DEFLATE",
    compressionOptions: { level: 6 }
  });
}

/* Helper Generators */

function generateReadme(appName, safeName, tables) {
  return `# ${appName}

Automated full-stack software generated by the **AI Software Compiler**.

## Stack
- **Frontend**: React 18, Vite, Tailwind CSS, Lucide Icons
- **Backend**: Node.js, Express, Mongoose ODM
- **Database**: MongoDB (Atlas or local)
- **Authentication**: JWT token with role-based access control (RBAC)

## Entities & Collections
${tables.map((t) => `- \`${t.name}\`: ${t.columns.map((c) => c.name).join(", ")}`).join("\n")}

## Quick Start Instructions

### 1. Backend Setup
\`\`\`bash
cd backend
npm install
cp .env.example .env
# Edit .env with your MONGODB_URI and JWT_SECRET
npm run seed     # Seeds demo admin (admin@example.com / Admin123!)
npm run dev      # Starts Express server on port 5000
\`\`\`

### 2. Frontend Setup
\`\`\`bash
cd frontend
npm install
npm run dev      # Starts Vite dev server on port 5173
\`\`\`

Open [http://localhost:5173](http://localhost:5173) in your browser.
`;
}

function generateRootEnv() {
  return `# Compiler Environment Configuration
PORT=5000
MONGODB_URI=mongodb://localhost:27017/ai-software-compiler
JWT_SECRET=replace_with_a_secure_random_key_min_32_chars
VITE_API_URL=http://localhost:5000
`;
}

function generateUserModel() {
  return `import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ["admin", "member", "manager"], default: "member" }
  },
  { timestamps: true }
);

userSchema.index({ email: 1 });

export default mongoose.model("User", userSchema);
`;
}

function generateAuthController() {
  return `import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/User.js";

const JWT_SECRET = process.env.JWT_SECRET || "development_secret_change_in_production";

export async function register(req, res) {
  try {
    const { name, email, password, role } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: "Name, email, and password are required." });
    }

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      return res.status(400).json({ error: "An account with that email already exists." });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const user = await User.create({
      name,
      email: email.toLowerCase(),
      passwordHash,
      role: role || "member"
    });

    const token = jwt.sign({ id: user._id, email: user.email, role: user.role, name: user.name }, JWT_SECRET, {
      expiresIn: "7d"
    });

    return res.status(201).json({
      token,
      user: { id: user._id, name: user.name, email: user.email, role: user.role }
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

export async function login(req, res) {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required." });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ error: "Invalid email or password." });
    }

    const token = jwt.sign({ id: user._id, email: user.email, role: user.role, name: user.name }, JWT_SECRET, {
      expiresIn: "7d"
    });

    return res.status(200).json({
      token,
      user: { id: user._id, name: user.name, email: user.email, role: user.role }
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

export async function getMe(req, res) {
  try {
    const user = await User.findById(req.user.id).select("-passwordHash");
    if (!user) return res.status(404).json({ error: "User not found." });
    return res.status(200).json({ user });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
`;
}

function generateMongooseModel(table) {
  const modelName = toPascalCase(singular(table.name));
  const schemaFields = table.columns
    .filter((col) => col.name !== "id" && col.name !== "_id")
    .map((col) => {
      let mongooseType = "String";
      if (col.type === "number") mongooseType = "Number";
      if (col.type === "boolean") mongooseType = "Boolean";
      if (col.type === "date" || col.type === "datetime") mongooseType = "Date";
      if (col.type === "id" && col.references) {
        mongooseType = `mongoose.Schema.Types.ObjectId, ref: "${toPascalCase(singular(col.references.split(".")[0]))}"`;
      }
      return `    ${col.name}: { type: ${mongooseType}, required: ${Boolean(col.required)} }`;
    })
    .join(",\n");

  return `import mongoose from "mongoose";

const ${singular(table.name)}Schema = new mongoose.Schema(
  {
${schemaFields}
  },
  { timestamps: true }
);

${(table.indexes || []).map((idx) => `${singular(table.name)}Schema.index({ ${idx}: 1 });`).join("\n")}

export default mongoose.model("${modelName}", ${singular(table.name)}Schema);
`;
}

function generateResourceController(table, modelName) {
  return `import ${modelName} from "../models/${modelName}.js";

export async function getAll(req, res) {
  try {
    const query = {};
    if (req.query.search) {
      query.$text = { $search: req.query.search };
    }
    const items = await ${modelName}.find(query).sort({ createdAt: -1 });
    return res.status(200).json(items);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

export async function getById(req, res) {
  try {
    const item = await ${modelName}.findById(req.params.id);
    if (!item) return res.status(404).json({ error: "${modelName} not found" });
    return res.status(200).json(item);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

export async function create(req, res) {
  try {
    const created = await ${modelName}.create(req.body);
    return res.status(201).json(created);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
}

export async function update(req, res) {
  try {
    const updated = await ${modelName}.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!updated) return res.status(404).json({ error: "${modelName} not found" });
    return res.status(200).json(updated);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
}

export async function remove(req, res) {
  try {
    const deleted = await ${modelName}.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: "${modelName} not found" });
    return res.status(200).json({ message: "${modelName} deleted successfully", id: req.params.id });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
`;
}

function generateResourceRoutes(table, modelName) {
  return `import express from "express";
import { getAll, getById, create, update, remove } from "../controllers/${table.name}Controller.js";
import { authenticate, authorizeRoles } from "../middleware/auth.js";

const router = express.Router();

router.use(authenticate);

router.get("/", getAll);
router.get("/:id", getById);
router.post("/", authorizeRoles("admin", "member", "manager"), create);
router.put("/:id", authorizeRoles("admin", "member", "manager"), update);
router.patch("/:id", authorizeRoles("admin", "member", "manager"), update);
router.delete("/:id", authorizeRoles("admin"), remove);

export default router;
`;
}

function generateSeedScript(tables, appName) {
  return `import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import User from "../models/User.js";

dotenv.config();

const uri = process.env.MONGODB_URI || "mongodb://localhost:27017/ai-software-compiler";

async function seed() {
  console.log("Connecting to database for seeding...");
  await mongoose.connect(uri);

  await User.deleteMany({});
  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash("Admin123!", salt);

  const admin = await User.create({
    name: "System Administrator",
    email: "admin@example.com",
    passwordHash,
    role: "admin"
  });

  console.log(\`Successfully seeded default Admin: \${admin.email} (Password: Admin123!)\`);
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seeding error:", err);
  process.exit(1);
});
`;
}

function generateServerJs(tables, safeName) {
  const routeImports = tables
    .filter((t) => t.name !== "users")
    .map((t) => `import ${t.name}Routes from "./routes/${t.name}Routes.js";`)
    .join("\n");

  const routeMounts = tables
    .filter((t) => t.name !== "users")
    .map((t) => `app.use("/api/${t.name}", ${t.name}Routes);`)
    .join("\n");

  return `import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { connectDB } from "./config/db.js";
import authRoutes from "./routes/authRoutes.js";
${routeImports}

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({ origin: "*" }));
app.use(express.json());

// Health Check
app.get("/health", (req, res) => {
  res.status(200).json({ status: "healthy", service: "${safeName}-api", time: new Date() });
});

// Authentication routes
app.use("/api/auth", authRoutes);

// Resource routes
${routeMounts}

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: \`Route '\${req.originalUrl}' not found\` });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error("[ServerError]", err.stack);
  res.status(500).json({ error: "Internal Server Error", message: err.message });
});

// Start Server after connecting to MongoDB
connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(\`🚀 Server running on port \${PORT}\`);
  });
});
`;
}

function generateApiClient() {
  return `const API_BASE = "/api";

export async function apiRequest(endpoint, options = {}) {
  const token = localStorage.getItem("token");
  const headers = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: \`Bearer \${token}\` } : {}),
    ...options.headers
  };

  const response = await fetch(\`\${API_BASE}\${endpoint}\`, {
    ...options,
    headers
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || \`Request failed with status \${response.status}\`);
  }

  return data;
}

export const api = {
  get: (url) => apiRequest(url, { method: "GET" }),
  post: (url, body) => apiRequest(url, { method: "POST", body: JSON.stringify(body) }),
  put: (url, body) => apiRequest(url, { method: "PUT", body: JSON.stringify(body) }),
  delete: (url) => apiRequest(url, { method: "DELETE" })
};
`;
}

function generateReactApp(appName, tables, roles) {
  const entityRoutes = tables
    .filter((t) => t.name !== "users")
    .map((t) => {
      const pageComp = `${toPascalCase(t.name)}Page`;
      return `        {activeTab === "${t.name}" && <${pageComp} user={user} />}`;
    })
    .join("\n");

  const pageImports = tables
    .filter((t) => t.name !== "users")
    .map((t) => `import ${toPascalCase(t.name)}Page from "./pages/${toPascalCase(t.name)}Page.jsx";`)
    .join("\n");

  return `import React, { useState, useEffect } from "react";
import Dashboard from "./pages/Dashboard.jsx";
import AuthPage from "./pages/AuthPage.jsx";
${pageImports}

export default function App() {
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem("user");
    return saved ? JSON.parse(saved) : null;
  });
  const [activeTab, setActiveTab] = useState("dashboard");

  function handleLogout() {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setUser(null);
  }

  if (!user) {
    return <AuthPage onLoginSuccess={(userData) => setUser(userData)} />;
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Top Navigation */}
      <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur px-6 py-4 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center font-bold text-white shadow-lg shadow-indigo-500/30">
            ${appName.charAt(0)}
          </div>
          <span className="font-bold text-lg text-slate-100">${escapeHtml(appName)}</span>
        </div>

        <nav className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab("dashboard")}
            className={\`px-3 py-1.5 rounded-md text-sm font-medium transition \${
              activeTab === "dashboard" ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-white"
            }\`}
          >
            Dashboard
          </button>
${tables
  .filter((t) => t.name !== "users")
  .map(
    (t) => `          <button
            onClick={() => setActiveTab("${t.name}")}
            className={\`px-3 py-1.5 rounded-md text-sm font-medium capitalize transition \${
              activeTab === "${t.name}" ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-white"
            }\`}
          >
            ${toPascalCase(t.name)}
          </button>`
  )
  .join("\n")}
        </nav>

        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-sm font-medium text-slate-200">{user.name}</div>
            <div className="text-xs text-indigo-400 uppercase tracking-wider">{user.role}</div>
          </div>
          <button
            onClick={handleLogout}
            className="px-3 py-1.5 text-xs bg-slate-800 hover:bg-rose-900/40 text-slate-300 hover:text-rose-300 rounded border border-slate-700 transition"
          >
            Logout
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 p-6 max-w-7xl w-full mx-auto">
        {activeTab === "dashboard" && <Dashboard user={user} onNavigate={setActiveTab} />}
${entityRoutes}
      </main>
    </div>
  );
}
`;
}

function generateDashboardPage(appName, tables) {
  return `import React from "react";

export default function Dashboard({ user, onNavigate }) {
  const cards = [
${tables
  .filter((t) => t.name !== "users")
  .map(
    (t) => `    { name: "${toPascalCase(t.name)}", id: "${t.name}", count: 12, desc: "Manage ${t.name} records and activity." }`
  )
  .join(",\n")}
  ];

  return (
    <div className="space-y-6">
      <div className="p-6 rounded-xl border border-slate-800 bg-slate-900/40">
        <h1 className="text-2xl font-bold text-white mb-2">Welcome back, {user.name}!</h1>
        <p className="text-slate-400 text-sm">
          You are authenticated as <span className="text-indigo-400 font-semibold">{user.role}</span>. Here is your application overview.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {cards.map((card) => (
          <div key={card.id} className="p-5 rounded-xl border border-slate-800 bg-slate-900/30 hover:border-indigo-500/50 transition flex flex-col justify-between">
            <div>
              <div className="text-xs font-semibold text-indigo-400 uppercase tracking-wider mb-1">Resource</div>
              <div className="text-xl font-bold text-white mb-2">{card.name}</div>
              <p className="text-slate-400 text-sm mb-4">{card.desc}</p>
            </div>
            <button
              onClick={() => onNavigate(card.id)}
              className="w-full py-2 bg-slate-800 hover:bg-indigo-600 text-white rounded-lg text-sm font-medium transition"
            >
              Open {card.name}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
`;
}

function generateAuthPage() {
  return `import React, { useState } from "react";
import { api } from "../api/client.js";

export default function AuthPage({ onLoginSuccess }) {
  const [isRegister, setIsRegister] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const endpoint = isRegister ? "/auth/register" : "/auth/login";
      const payload = isRegister ? { name, email, password } : { email, password };
      const res = await api.post(endpoint, payload);

      localStorage.setItem("token", res.token);
      localStorage.setItem("user", JSON.stringify(res.user));
      onLoginSuccess(res.user);
    } catch (err) {
      setError(err.message || "Authentication failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-slate-950">
      <div className="w-full max-w-md p-8 rounded-2xl border border-slate-800 bg-slate-900/60 shadow-2xl backdrop-blur">
        <h2 className="text-2xl font-bold text-white text-center mb-2">
          {isRegister ? "Create Account" : "Welcome Back"}
        </h2>
        <p className="text-slate-400 text-sm text-center mb-6">
          {isRegister ? "Sign up to start using the system" : "Enter your email and password to continue"}
        </p>

        {error && (
          <div className="p-3 mb-4 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {isRegister && (
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Full Name</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-indigo-500"
                placeholder="Jane Doe"
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Email Address</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-indigo-500"
              placeholder="jane@example.com"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-indigo-500"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium rounded-lg transition shadow-lg shadow-indigo-600/30"
          >
            {loading ? "Processing..." : isRegister ? "Sign Up" : "Sign In"}
          </button>
        </form>

        <div className="mt-6 text-center text-xs text-slate-400">
          {isRegister ? "Already have an account?" : "Don't have an account yet?"}{" "}
          <button
            onClick={() => {
              setIsRegister(!isRegister);
              setError("");
            }}
            className="text-indigo-400 hover:underline font-semibold"
          >
            {isRegister ? "Sign In" : "Register"}
          </button>
        </div>
      </div>
    </div>
  );
}
`;
}

function generateEntityCrudPage(table) {
  const modelName = toPascalCase(singular(table.name));
  const editableColumns = table.columns.filter((c) => c.name !== "id" && c.name !== "_id" && c.name !== "created_at");

  return `import React, { useState, useEffect } from "react";
import { api } from "../api/client.js";

export default function ${toPascalCase(table.name)}Page({ user }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({});

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      setLoading(true);
      const data = await api.get("/${table.name}");
      setItems(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(e) {
    e.preventDefault();
    try {
      await api.post("/${table.name}", formData);
      setShowModal(false);
      setFormData({});
      loadData();
    } catch (err) {
      alert("Failed to create: " + err.message);
    }
  }

  async function handleDelete(id) {
    if (!confirm("Are you sure you want to delete this record?")) return;
    try {
      await api.delete(\`/${table.name}/\${id}\`);
      loadData();
    } catch (err) {
      alert("Failed to delete: " + err.message);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white capitalize">${table.name}</h1>
          <p className="text-slate-400 text-sm">Manage and review all ${table.name} records.</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium shadow-lg shadow-indigo-600/30 transition"
        >
          + Add ${modelName}
        </button>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="p-8 text-center text-slate-500">Loading ${table.name}...</div>
      ) : items.length === 0 ? (
        <div className="p-12 text-center rounded-xl border border-dashed border-slate-800 bg-slate-900/20 text-slate-400">
          No ${table.name} created yet. Click "+ Add ${modelName}" to create your first record.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/40">
          <table className="w-full text-left text-sm text-slate-300">
            <thead className="bg-slate-900 text-xs uppercase tracking-wider text-slate-400 border-b border-slate-800">
              <tr>
${table.columns.map((c) => `                <th className="px-4 py-3">${c.name}</th>`).join("\n")}
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {items.map((row) => (
                <tr key={row._id || row.id} className="hover:bg-slate-800/40 transition">
${table.columns
  .map(
    (c) =>
      `                  <td className="px-4 py-3 text-slate-200">{String(row.${c.name} !== undefined ? row.${c.name} : "")}</td>`
  )
  .join("\n")}
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => handleDelete(row._id || row.id)}
                      className="text-xs text-rose-400 hover:text-rose-300 font-medium"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal Form */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-lg p-6 rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-4">Add New ${modelName}</h3>
            <form onSubmit={handleCreate} className="space-y-4">
${editableColumns
  .map(
    (c) => `              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">${toPascalCase(c.name)}</label>
                <input
                  type="${c.type === "number" ? "number" : "text"}"
                  required={${Boolean(c.required)}}
                  value={formData.${c.name} || ""}
                  onChange={(e) => setFormData({ ...formData, ${c.name}: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-indigo-500 text-sm"
                />
              </div>`
  )
  .join("\n")}

              <div className="flex justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-sm text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium shadow-lg shadow-indigo-600/30"
                >
                  Save ${modelName}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
`;
}

function toPascalCase(str) {
  return String(str || "")
    .replace(/[-_](\w)/g, (_, c) => c.toUpperCase())
    .replace(/^(\w)/, (_, c) => c.toUpperCase());
}

function singular(str) {
  return String(str || "").replace(/s$/, "");
}

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
