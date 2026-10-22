import { randomBytes, pbkdf2Sync, timingSafeEqual, createHash } from "node:crypto";
import { MongoClient } from "mongodb";
import { loadLocalEnv } from "./env.js";

let clientPromise = null;
let fallbackStoreInstance = null;
let lastMongoErrorTime = 0;
const MONGO_RETRY_INTERVAL_MS = 30_000;

export async function getAuthDb() {
  loadLocalEnv();

  const uri = process.env.MONGODB_URI || process.env.MONGO_URL;
  const now = Date.now();

  if (uri && (now - lastMongoErrorTime > MONGO_RETRY_INTERVAL_MS || clientPromise)) {
    try {
      if (!clientPromise) {
        const client = new MongoClient(uri, {
          serverSelectionTimeoutMS: 3000,
          connectTimeoutMS: 3000
        });
        clientPromise = client.connect();
      }

      const client = await clientPromise;
      const dbName = process.env.MONGODB_DB_NAME || databaseNameFromUri(uri) || "ai_software_compiler";
      const db = client.db(dbName);
      await ensureIndexes(db).catch(() => {});
      return db;
    } catch (err) {
      lastMongoErrorTime = Date.now();
      clientPromise = null; // Allow retry on next cooldown interval if network recovers
      console.warn(`[auth-db] MongoDB connection failed: ${err.message}. Operating in resilient fallback mode.`);
    }
  } else if (!uri) {
    if (!fallbackStoreInstance) {
      console.warn("[auth-db] MONGODB_URI not configured. Operating in resilient fallback mode.");
    }
  }

  if (!fallbackStoreInstance) {
    fallbackStoreInstance = createFallbackAuthDb();
  }
  return fallbackStoreInstance;
}

export async function checkMongoHealth() {
  loadLocalEnv();
  const uri = process.env.MONGODB_URI || process.env.MONGO_URL;
  if (!uri) {
    return {
      status: "fallback",
      database: "in-memory-fallback",
      message: "MONGODB_URI is not configured. Using local in-memory storage."
    };
  }

  const start = Date.now();
  try {
    const db = await getAuthDb();
    if (db.databaseName === "fallback-memory-auth") {
      return {
        status: "fallback",
        database: "in-memory-fallback",
        message: "MongoDB connection unreachable. Operating in resilient fallback mode."
      };
    }
    await db.command({ ping: 1 });
    return {
      status: "connected",
      database: db.databaseName,
      latencyMs: Date.now() - start
    };
  } catch (err) {
    return {
      status: "error",
      database: "unreachable",
      message: err.message
    };
  }
}

export function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = pbkdf2Sync(password, salt, 120000, 32, "sha256").toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  const [salt, hash] = String(stored || "").split(":");
  if (!salt || !hash) return false;

  const candidate = pbkdf2Sync(password, salt, 120000, 32, "sha256");
  const expected = Buffer.from(hash, "hex");
  return expected.length === candidate.length && timingSafeEqual(expected, candidate);
}

export function createSessionToken() {
  const token = randomBytes(32).toString("hex");
  return {
    token,
    tokenHash: hashToken(token),
    expiresAt: tokenExpiry()
  };
}

export function hashToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

export function publicUser(user) {
  if (!user) return null;
  return {
    id: String(user._id),
    name: user.name,
    email: user.email,
    role: user.role || "member",
    avatarUrl: user.avatarUrl || null,
    experienceProfile: user.experienceProfile || null,
    providers: (user.providers || []).map((entry) => entry.provider),
    createdAt: user.createdAt
  };
}

export async function issueSessionForUser(user) {
  const session = createSessionToken();
  const db = await getAuthDb();
  const now = new Date();

  await db.collection("users").updateOne(
    { _id: user._id },
    {
      $push: {
        sessions: { tokenHash: session.tokenHash, createdAt: now, expiresAt: session.expiresAt }
      },
      $set: { updatedAt: now }
    }
  );

  const fresh = await db.collection("users").findOne({ _id: user._id });
  return { token: session.token, user: publicUser(fresh) };
}

export async function findUserByToken(token) {
  if (!token) return null;

  const db = await getAuthDb();
  return db.collection("users").findOne({
    sessions: {
      $elemMatch: {
        tokenHash: hashToken(token),
        expiresAt: { $gt: new Date() }
      }
    }
  });
}

function tokenExpiry() {
  const ttlDays = Number(process.env.AUTH_TOKEN_TTL_DAYS || 7);
  return new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);
}

async function ensureIndexes(db) {
  await db.collection("users").createIndex({ email: 1 }, { unique: true });
  await db.collection("users").createIndex({ "sessions.tokenHash": 1 });
  await db.collection("users").createIndex({ "providers.provider": 1, "providers.providerId": 1 });
}

function databaseNameFromUri(uri) {
  try {
    const parsed = new URL(uri);
    return parsed.pathname.replace(/^\//, "") || null;
  } catch {
    return null;
  }
}

/** Resilient fallback auth database implementation when MongoDB is unreachable */
function createFallbackAuthDb() {
  const users = [];

  function matches(user, filter) {
    if (!filter || Object.keys(filter).length === 0) return true;
    if (filter.$or && Array.isArray(filter.$or)) {
      return filter.$or.some((sub) => matches(user, sub));
    }
    for (const [key, val] of Object.entries(filter)) {
      if (key === "_id") {
        if (String(user._id) !== String(val)) return false;
      } else if (key === "email") {
        if (String(user.email).toLowerCase() !== String(val).toLowerCase()) return false;
      } else if (key === "sessions.tokenHash") {
        if (!user.sessions?.some((s) => s.tokenHash === val)) return false;
      } else if (key === "sessions" && val?.$elemMatch) {
        const matched = user.sessions?.some((s) => {
          if (val.$elemMatch.tokenHash && s.tokenHash !== val.$elemMatch.tokenHash) return false;
          if (val.$elemMatch.expiresAt?.$gt && !(new Date(s.expiresAt) > val.$elemMatch.expiresAt.$gt)) return false;
          return true;
        });
        if (!matched) return false;
      } else if (key === "providers" && val?.$elemMatch) {
        const matched = user.providers?.some(
          (p) => p.provider === val.$elemMatch.provider && String(p.providerId) === String(val.$elemMatch.providerId)
        );
        if (!matched) return false;
      } else if (user[key] !== val) {
        return false;
      }
    }
    return true;
  }

  function applyUpdate(user, update) {
    if (update.$set) {
      Object.assign(user, update.$set);
    }
    if (update.$push) {
      for (const [field, item] of Object.entries(update.$push)) {
        user[field] = user[field] || [];
        user[field].push(item);
      }
    }
    if (update.$pull) {
      for (const [field, filter] of Object.entries(update.$pull)) {
        if (Array.isArray(user[field])) {
          user[field] = user[field].filter((entry) => {
            if (filter.tokenHash && entry.tokenHash === filter.tokenHash) return false;
            return true;
          });
        }
      }
    }
    if (update.$addToSet) {
      for (const [field, item] of Object.entries(update.$addToSet)) {
        user[field] = user[field] || [];
        const exists = user[field].some(
          (entry) => JSON.stringify(entry) === JSON.stringify(item)
        );
        if (!exists) user[field].push(item);
      }
    }
    user.updatedAt = new Date();
  }

  const usersCollection = {
    async insertOne(doc) {
      const email = String(doc.email || "").toLowerCase();
      if (email && users.some((u) => u.email === email)) {
        const error = new Error("Duplicate email error");
        error.code = 11000;
        throw error;
      }
      const cloned = JSON.parse(JSON.stringify(doc));
      cloned._id = doc._id || `user_${randomBytes(12).toString("hex")}`;
      users.push(cloned);
      return { insertedId: cloned._id };
    },
    async findOne(filter) {
      const found = users.find((u) => matches(u, filter));
      return found ? JSON.parse(JSON.stringify(found)) : null;
    },
    async updateOne(filter, update) {
      const found = users.find((u) => matches(u, filter));
      if (!found) return { matchedCount: 0, modifiedCount: 0 };
      applyUpdate(found, update);
      return { matchedCount: 1, modifiedCount: 1 };
    },
    async createIndex() {
      return Promise.resolve();
    },
    async countDocuments(filter = {}) {
      return users.filter((u) => matches(u, filter)).length;
    }
  };

  return {
    databaseName: "fallback-memory-auth",
    collection(name) {
      if (name === "users") return usersCollection;
      return usersCollection;
    }
  };
}
