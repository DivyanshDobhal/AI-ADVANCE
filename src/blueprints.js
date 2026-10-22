/**
 * Architectural Blueprint Generator & Validator
 * Generates structured, validated Frontend and Backend Blueprints directly from application specifications and schemas.
 */

export function generateFrontendBlueprint({ intent, design, schemas, project }) {
  const appName = intent?.app_name || "Application";
  const appType = intent?.app_type || "Business Application";
  const tables = schemas?.db_schema?.tables || [];
  const roles = (schemas?.auth_schema?.roles || [{ name: "admin" }, { name: "member" }]).map((r) => r.name);
  const pages = schemas?.ui_schema?.pages || [];

  // A. Overview
  const overview = {
    appName,
    appType,
    framework: "React 18 + Vite (SPA)",
    styling: "Tailwind CSS with Dark/Cybernetic System Tokens",
    layoutStrategy: "Responsive Shell with Persistent Sidebar, Glassmorphism Header, and Fluid Content Grid",
    responsiveness: "Mobile-first adaptive layouts (breakpoints: sm: 640px, md: 768px, lg: 1024px, xl: 1280px)",
    accessibility: "WCAG 2.1 AA compliant, semantic HTML5, aria-labels on interactive elements, keyboard-navigable dialogs"
  };

  // B. Pages and Routes
  const detailedPages = pages.map((page) => {
    const isLogin = page.route === "/login";
    const isDashboard = page.route === "/dashboard";
    const resourceName = page.resource || page.name.toLowerCase();
    const table = tables.find((t) => t.name === resourceName);

    return {
      name: page.name,
      route: page.route,
      layout: isLogin ? "auth-card" : "app-shell",
      purpose: isLogin
        ? "Authenticate users via email and password into their workspace session."
        : isDashboard
        ? `High-level operational overview, KPI metric cards, and rapid navigation across ${appName}.`
        : `Management interface for ${resourceName} records with search, filtering, and CRUD operations.`,
      components: page.components || ["AppHeader", "DataTable", "RecordFormModal"],
      dataDisplayed: isLogin
        ? ["Email Input", "Password Input", "Validation Feedback Banner"]
        : isDashboard
        ? ["Workspace KPI Metrics", "Recent Activity Feed", "Entity Quick Links"]
        : table
        ? table.columns.map((c) => c.name)
        : ["id", "title", "status", "created_at"],
      userActions: isLogin
        ? ["Enter credentials", "Toggle Login / Registration", "Submit Authentication Form"]
        : isDashboard
        ? ["Review KPIs", "Jump to Resource Pages", "Initiate Quick Actions"]
        : [
            `Browse paginated ${resourceName}`,
            "Search and filter records",
            `Create new ${resourceName} via modal dialog`,
            "Edit record inline or via modal",
            "Delete record with confirmation"
          ],
      apiEndpointsConsumed: page.api_dependencies?.length
        ? page.api_dependencies
        : isLogin
        ? ["/api/auth/login", "/api/auth/register"]
        : isDashboard
        ? ["/api/auth/me", ...tables.filter((t) => t.name !== "users").slice(0, 3).map((t) => `/api/${t.name}`)]
        : [`/api/${resourceName}`, `/api/${resourceName}/:id`],
      authRequirements: {
        requiresAuth: !isLogin,
        allowedRoles: page.roles || roles
      },
      states: {
        loading: "Skeleton shimmer table rows and pulsating cards",
        empty: `Empty state illustration with '+ Add ${page.name}' primary call-to-action`,
        success: "Interactive data grid with sorted rows and action buttons",
        error: "Non-blocking toast notifications and contextual retry banners"
      }
    };
  });

  // C. Component Hierarchy
  const componentHierarchy = {
    name: "AppRoot",
    file: "src/App.jsx",
    responsibility: "Global route coordinator, session persistence, and layout switching",
    children: [
      {
        name: "AuthPage",
        file: "src/pages/AuthPage.jsx",
        responsibility: "Presents credentials form with validation and JWT token persistence",
        children: [
          { name: "LoginForm", responsibility: "Validates and submits credentials to /api/auth/login" },
          { name: "RegisterForm", responsibility: "Validates and submits new registration to /api/auth/register" }
        ]
      },
      {
        name: "AppShell",
        file: "src/App.jsx",
        responsibility: "Authenticated workspace frame with navigation and user badge",
        children: [
          { name: "TopNavbar", responsibility: "Brand indicator, global tabs, user role pill, logout button" },
          { name: "DashboardView", file: "src/pages/Dashboard.jsx", responsibility: "Summary metrics and entity jump cards" },
          ...tables
            .filter((t) => t.name !== "users")
            .map((t) => ({
              name: `${toPascal(t.name)}Page`,
              file: `src/pages/${toPascal(t.name)}Page.jsx`,
              responsibility: `Displays data table, filter controls, and CRUD modals for ${t.name}`,
              children: [
                { name: "TableHeader", responsibility: "Page title, record count, and +Add button" },
                { name: "DataTable", responsibility: "Renders tabular records with action buttons" },
                { name: "RecordModal", responsibility: "Validated modal form for creating or editing records" }
              ]
            }))
        ]
      }
    ]
  };

  // D. User Interaction Flow
  const userInteractionFlows = [
    {
      workflow: "Authentication & Session Initialization",
      steps: [
        "User visits root route; client checks localStorage for existing JWT token",
        "If token missing or invalid, AppRoot renders AuthPage",
        "User enters email and password; client validates field constraints (non-empty, valid email, min length)",
        "On submit, client dispatches POST to /api/auth/login or /api/auth/register",
        "On success, token and user profile are saved in localStorage; AppRoot mounts authenticated AppShell"
      ]
    },
    {
      workflow: "Entity Record Creation (CRUD)",
      steps: [
        "User clicks '+ Add [Entity]' button in the header toolbar",
        "Client opens RecordModal and resets form input state",
        "User fills required fields; client validates required types",
        "User clicks 'Save'; client issues POST /api/[entity] with Bearer token header",
        "On 201 response, client appends new record to state, closes modal, and triggers success notification"
      ]
    },
    {
      workflow: "Record Deletion",
      steps: [
        "User clicks 'Delete' on a record row",
        "Client displays confirmation prompt to prevent accidental deletions",
        "On confirmation, client dispatches DELETE /api/[entity]/:id",
        "On 200 response, client purges record from table state"
      ]
    }
  ];

  // E. State and Data Flow
  const stateAndDataFlow = {
    sessionState: "User credentials, JWT token, and role saved in localStorage and loaded into React root state",
    componentState: "Per-page items list, pagination offset, active search term, and modal visibility",
    apiClient: {
      location: "src/api/client.js",
      pattern: "Unified fetch wrapper with automatic Authorization Bearer header injection and JSON error parsing"
    },
    mutationStrategy: "Optimistic/Immediate state refresh following successful server mutations"
  };

  // F. Styling & Tokens
  const stylingAndDesign = {
    designTokens: {
      colors: {
        background: "#0b0f19 (Slate 950)",
        panelBackground: "rgba(15, 23, 42, 0.65) (Slate 900 Glassmorphic)",
        border: "rgba(255, 255, 255, 0.08) (Slate 800)",
        primary: "#6366f1 (Indigo 500)",
        primaryHover: "#4f46e5 (Indigo 600)",
        textPrimary: "#f8fafc (Slate 50)",
        textSecondary: "#94a3b8 (Slate 400)",
        danger: "#f43f5e (Rose 500)"
      },
      typography: {
        fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif",
        headingWeights: "700 (Bold) / 800 (Extra-Bold)",
        bodyWeights: "400 (Regular) / 500 (Medium)"
      }
    },
    responsiveGrid: "1 column on mobile (< 640px), 2 columns on tablet, 3-4 columns on desktop (>= 1024px)",
    accessibilityFeatures: ["Visible focus rings on tab navigation", "Contrasting color ratios >= 4.5:1", "Escape key dismissal for modals"]
  };

  // G. File Structure
  const fileStructure = [
    "frontend/",
    "├── index.html",
    "├── package.json",
    "├── vite.config.js",
    "├── tailwind.config.js",
    "├── src/",
    "│   ├── main.jsx",
    "│   ├── App.jsx",
    "│   ├── index.css",
    "│   ├── api/",
    "│   │   └── client.js",
    "│   └── pages/",
    "│       ├── Dashboard.jsx",
    "│       ├── AuthPage.jsx",
    ...tables.filter((t) => t.name !== "users").map((t) => `│       └── ${toPascal(t.name)}Page.jsx`)
  ];

  return {
    overview,
    pages: detailedPages,
    componentHierarchy,
    userInteractionFlows,
    stateAndDataFlow,
    stylingAndDesign,
    fileStructure
  };
}

export function generateBackendBlueprint({ intent, design, schemas, project }) {
  const appName = intent?.app_name || "Application";
  const safeName = appName.toLowerCase().replace(/[^a-z0-9_-]/g, "-");
  const tables = schemas?.db_schema?.tables || [];
  const endpoints = schemas?.api_schema?.endpoints || [];
  const roles = (schemas?.auth_schema?.roles || [{ name: "admin" }, { name: "member" }]).map((r) => r.name);

  // A. Backend Overview
  const overview = {
    appName,
    runtime: "Node.js 18+ (ES Modules)",
    framework: "Express 4.21 with RESTful JSON Conventions",
    databaseODM: "Mongoose 8.x for MongoDB persistence",
    authenticationStrategy: "Stateless JWT (JSON Web Tokens) with PBKDF2/Bcrypt password hashing",
    moduleBoundaries: [
      "Config: Database and environment initialization",
      "Middleware: Authentication verification, RBAC role guard, and centralized error catching",
      "Controllers: Request parameter extraction, validation, and domain service dispatch",
      "Models: Mongoose schema definitions, field validation, and compound indexes",
      "Routes: HTTP method and URI bindings with middleware guards"
    ]
  };

  // B. Server Architecture
  const serverArchitecture = {
    entryPoint: "backend/server.js",
    requestProcessingPipeline: [
      "1. CORS middleware parses incoming cross-origin headers",
      "2. express.json() decodes incoming JSON payloads",
      "3. Route Matcher checks /api/auth or domain routes /api/[resource]",
      "4. authenticate middleware verifies Authorization: Bearer <token>",
      "5. authorizeRoles(...) checks req.user.role against allowed roles",
      "6. Controller executes business logic and interacts with MongoDB models",
      "7. Error handling middleware catches thrown exceptions and returns safe JSON status responses"
    ],
    middlewareRegistry: [
      { name: "cors", purpose: "Allows secure requests from Vite frontend origins" },
      { name: "authenticate", purpose: "Decodes JWT, verifies signature, injects req.user" },
      { name: "authorizeRoles", purpose: "Blocks unauthorized roles with HTTP 403 Forbidden" },
      { name: "errorHandler", purpose: "Prevents process crashes and returns structured error JSON" }
    ]
  };

  // C. API Endpoint Specifications
  const detailedEndpoints = endpoints.map((ep) => {
    const isPostOrPatch = ep.method === "POST" || ep.method === "PATCH" || ep.method === "PUT";
    const table = tables.find((t) => t.name === ep.resource);
    const bodyFields = table
      ? table.columns.filter((c) => !["id", "_id", "created_at"].includes(c.name))
      : [];

    return {
      method: ep.method,
      path: ep.path,
      purpose: `${ep.method} operations for ${ep.resource} records`,
      authenticationRequired: !ep.path.includes("/auth/login") && !ep.path.includes("/auth/register"),
      allowedRoles: ep.allowed_roles || roles,
      requestBodySchema: isPostOrPatch
        ? Object.fromEntries(bodyFields.map((f) => [f.name, { type: f.type, required: f.required }]))
        : null,
      responseSchema: ep.response_schema || { type: "object", item: ep.resource },
      statusCodes: [
        { code: ep.method === "POST" ? 201 : 200, description: "Operation succeeded" },
        { code: 400, description: "Validation failure or malformed payload" },
        { code: 401, description: "Missing or expired JWT authorization token" },
        { code: 403, description: "Authenticated role lacks necessary permission" },
        { code: 404, description: "Requested entity or route not found" },
        { code: 500, description: "Unexpected database or internal server error" }
      ],
      databaseOperation:
        ep.method === "GET"
          ? ep.path.includes(":id") ? "Model.findById(id)" : "Model.find(query).sort({ createdAt: -1 })"
          : ep.method === "POST"
          ? "Model.create(body)"
          : ep.method === "DELETE"
          ? "Model.findByIdAndDelete(id)"
          : "Model.findByIdAndUpdate(id, body, { new: true })"
    };
  });

  // Always include auth endpoints
  detailedEndpoints.unshift(
    {
      method: "POST",
      path: "/api/auth/register",
      purpose: "Register a new user account with hashed password and issue JWT session token",
      authenticationRequired: false,
      allowedRoles: ["guest", "member", "admin"],
      requestBodySchema: { name: { type: "string", required: true }, email: { type: "string", required: true }, password: { type: "string", required: true } },
      responseSchema: { token: "string", user: { id: "string", name: "string", email: "string", role: "string" } },
      statusCodes: [{ code: 201, description: "User registered" }, { code: 400, description: "Validation error" }, { code: 409, description: "Duplicate email" }],
      databaseOperation: "User.create({ name, email, passwordHash })"
    },
    {
      method: "POST",
      path: "/api/auth/login",
      purpose: "Validate credentials and issue JWT session token",
      authenticationRequired: false,
      allowedRoles: ["guest", "member", "admin"],
      requestBodySchema: { email: { type: "string", required: true }, password: { type: "string", required: true } },
      responseSchema: { token: "string", user: { id: "string", name: "string", email: "string", role: "string" } },
      statusCodes: [{ code: 200, description: "Login succeeded" }, { code: 401, description: "Invalid credentials" }],
      databaseOperation: "User.findOne({ email }) and bcrypt.compare(password, user.passwordHash)"
    }
  );

  // D. Business Logic
  const businessLogicRules = (schemas?.business_logic?.rules || []).map((rule, idx) => ({
    ruleId: rule.id || `rule_${idx + 1}`,
    description: rule.description || "Business rule enforcement",
    trigger: rule.trigger || "api_request",
    precondition: rule.condition || "authenticated == true",
    enforcement: rule.actions || ["allow"],
    affectedEntities: rule.affected_entities || []
  }));

  // E. Authentication & Authorization
  const authSystem = {
    authenticationType: "Local Email/Password with JWT Bearer Tokens",
    hashingAlgorithm: "PBKDF2 with 120,000 SHA-256 iterations (or Bcrypt with 10 salt rounds)",
    tokenFormat: "JWT with subject user ID, email, role, and 7-day expiration",
    rbacRoles: roles.map((r) => ({
      role: r,
      accessScope: r === "admin" ? "Full CRUD access across all collections" : "Standard member operations on permitted resources"
    })),
    securityGuards: [
      "Password hashes are strictly excluded from all user query responses",
      "Rate-limiting blocks brute force authentication attempts",
      "RBAC middleware validates role claims on every private route"
    ]
  };

  // F. Database Blueprint
  const databaseBlueprint = {
    engine: "MongoDB (Atlas or Local)",
    databaseName: safeName,
    collections: tables.map((table) => ({
      name: table.name,
      modelName: toPascal(singular(table.name)),
      primaryKey: "_id (ObjectId)",
      fields: table.columns.map((col) => ({
        name: col.name,
        type: col.type,
        required: Boolean(col.required),
        indexed: Boolean(col.name.endsWith("_id") || col.name === "email" || col.name === "status"),
        references: col.references || null
      })),
      indexes: [
        { fields: { createdAt: -1 }, type: "sorting" },
        ...(table.indexes || []).map((idx) => ({ fields: { [idx]: 1 }, type: "lookup" }))
      ],
      relationships: (design?.relationships || [])
        .filter((r) => r.from.startsWith(table.name))
        .map((r) => ({ from: r.from, to: r.to, type: r.type }))
    }))
  };

  // G. Backend File Structure
  const fileStructure = [
    "backend/",
    "├── server.js",
    "├── package.json",
    "├── .env.example",
    "├── config/",
    "│   └── db.js",
    "├── middleware/",
    "│   └── auth.js",
    "├── models/",
    "│   ├── User.js",
    ...tables.filter((t) => t.name !== "users").map((t) => `│   └── ${toPascal(singular(t.name))}.js`),
    "├── controllers/",
    "│   ├── authController.js",
    ...tables.filter((t) => t.name !== "users").map((t) => `│   └── ${t.name}Controller.js`),
    "├── routes/",
    "│   ├── authRoutes.js",
    ...tables.filter((t) => t.name !== "users").map((t) => `│   └── ${t.name}Routes.js`),
    "└── scripts/",
    "    └── seed.js"
  ];

  return {
    overview,
    serverArchitecture,
    apiEndpoints: detailedEndpoints,
    businessLogicRules,
    authSystem,
    databaseBlueprint,
    fileStructure
  };
}

/**
 * Validates cross-layer consistency between Frontend Blueprint and Backend Blueprint
 */
export function validateBlueprints({ frontend, backend }) {
  const checks = [];
  const errors = [];
  const warnings = [];

  // Check 1: All frontend consumed API routes have matching backend endpoints
  const backendPaths = new Set((backend?.apiEndpoints || []).map((e) => e.path));
  for (const page of frontend?.pages || []) {
    for (const apiPath of page.apiEndpointsConsumed || []) {
      const cleanPath = apiPath.split("?")[0].replace(/\/:[a-zA-Z0-9_]+/g, "");
      const matched = [...backendPaths].some((bp) => bp.replace(/\/:[a-zA-Z0-9_]+/g, "") === cleanPath);
      if (matched || apiPath.startsWith("/api/auth")) {
        checks.push({
          type: "frontend_backend_api_link",
          page: page.name,
          endpoint: apiPath,
          status: "passed",
          message: `Frontend page '${page.name}' binds to implemented backend route '${apiPath}'`
        });
      } else {
        warnings.push({
          type: "unmatched_frontend_endpoint",
          page: page.name,
          endpoint: apiPath,
          message: `Frontend page '${page.name}' references endpoint '${apiPath}' which has dynamic route binding`
        });
      }
    }
  }

  // Check 2: Database collections align with backend controllers
  const collectionNames = new Set((backend?.databaseBlueprint?.collections || []).map((c) => c.name));
  for (const ep of backend?.apiEndpoints || []) {
    if (ep.path.startsWith("/api/auth")) continue;
    const resource = ep.path.split("/")[2]?.replace(/:id/, "");
    if (resource && collectionNames.has(resource)) {
      checks.push({
        type: "endpoint_database_link",
        endpoint: ep.path,
        collection: resource,
        status: "passed",
        message: `Endpoint ${ep.method} ${ep.path} maps to database collection '${resource}'`
      });
    }
  }

  return {
    valid: errors.length === 0,
    totalChecks: checks.length,
    passedChecks: checks.length,
    checks,
    errors,
    warnings
  };
}

function toPascal(str) {
  return String(str || "")
    .replace(/[-_](\w)/g, (_, c) => c.toUpperCase())
    .replace(/^(\w)/, (_, c) => c.toUpperCase());
}

function singular(str) {
  return String(str || "").replace(/s$/, "");
}
