import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
export const dataDir = path.resolve(process.env.DATA_DIR || "./data");
fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
fs.mkdirSync(path.join(dataDir, "audio"), { recursive: true, mode: 0o700 });
export const db = new DatabaseSync(path.join(dataDir, "compass.sqlite"));
db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS companies (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE);
CREATE TABLE IF NOT EXISTS departments (id TEXT PRIMARY KEY, company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE, name TEXT NOT NULL, UNIQUE(company_id,name));
CREATE TABLE IF NOT EXISTS customers (id TEXT PRIMARY KEY, department_id TEXT NOT NULL REFERENCES departments(id), name TEXT NOT NULL, title TEXT NOT NULL DEFAULT '', contact TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS visits (id TEXT PRIMARY KEY, customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE, title TEXT NOT NULL, happened_at TEXT NOT NULL, created_at TEXT NOT NULL, audio_path TEXT, audio_name TEXT, audio_type TEXT, transcript TEXT NOT NULL DEFAULT '', summary TEXT NOT NULL DEFAULT '', status TEXT NOT NULL, error TEXT NOT NULL DEFAULT '', is_demo INTEGER NOT NULL DEFAULT 0, request_id TEXT UNIQUE);
CREATE TABLE IF NOT EXISTS facts (id TEXT PRIMARY KEY, customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE, dimension TEXT NOT NULL CHECK(dimension IN ('business','needs','personal')), field TEXT NOT NULL, value TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('active','review','archived','discarded')), confidence REAL NOT NULL, reason TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS evidence (fact_id TEXT NOT NULL REFERENCES facts(id) ON DELETE CASCADE, visit_id TEXT NOT NULL REFERENCES visits(id) ON DELETE CASCADE, quote TEXT NOT NULL, PRIMARY KEY(fact_id,visit_id));
CREATE TABLE IF NOT EXISTS actions (id TEXT PRIMARY KEY, customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE, visit_id TEXT REFERENCES visits(id) ON DELETE CASCADE, text TEXT NOT NULL, due_date TEXT NOT NULL DEFAULT '', done INTEGER NOT NULL DEFAULT 0, quote TEXT NOT NULL DEFAULT '');
CREATE INDEX IF NOT EXISTS visits_customer ON visits(customer_id,happened_at);
CREATE INDEX IF NOT EXISTS facts_customer ON facts(customer_id,status);
CREATE INDEX IF NOT EXISTS evidence_visit ON evidence(visit_id);
`);
if (
  !db
    .prepare("PRAGMA table_info(visits)")
    .all()
    .some((c) => c.name === "request_id")
) {
  db.exec(
    "ALTER TABLE visits ADD COLUMN request_id TEXT; CREATE UNIQUE INDEX visits_request_id ON visits(request_id);",
  );
}
export const id = () => crypto.randomUUID();
export const now = () => new Date().toISOString();
export const getKV = (key, fallback = null) => {
  const r = db.prepare("SELECT value FROM kv WHERE key=?").get(key);
  return r ? JSON.parse(r.value) : fallback;
};
export const setKV = (key, value) =>
  db
    .prepare(
      "INSERT INTO kv VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
    )
    .run(key, JSON.stringify(value));
export function transaction(fn) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}
const keyPath = path.join(dataDir, ".encryption-key");
if (!fs.existsSync(keyPath))
  fs.writeFileSync(keyPath, crypto.randomBytes(32), { mode: 0o600 });
const key = fs.readFileSync(keyPath);
export function encrypt(value) {
  if (!value) return "";
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  return Buffer.concat([
    iv,
    cipher.update(value, "utf8"),
    cipher.final(),
    cipher.getAuthTag(),
  ]).toString("base64");
}
export function decrypt(value) {
  if (!value) return "";
  const b = Buffer.from(value, "base64");
  const c = crypto.createDecipheriv("aes-256-gcm", key, b.subarray(0, 12));
  c.setAuthTag(b.subarray(-16));
  return Buffer.concat([c.update(b.subarray(12, -16)), c.final()]).toString(
    "utf8",
  );
}
export const defaults = {
  asr: {
    baseUrl: "https://api.openai.com/v1",
    model: "whisper-1",
    apiKey: "",
    language: "zh",
  },
  llm: { baseUrl: "https://api.openai.com/v1", model: "", apiKey: "" },
  autoApply: true,
  publicUrl: process.env.PUBLIC_URL || "",
};
export function settings(secret = false) {
  const s = getKV("settings", defaults);
  return {
    ...s,
    asr: {
      ...s.asr,
      apiKey: secret ? decrypt(s.asr.apiKey) : "",
      hasKey: !!s.asr.apiKey,
    },
    llm: {
      ...s.llm,
      apiKey: secret ? decrypt(s.llm.apiKey) : "",
      hasKey: !!s.llm.apiKey,
    },
  };
}
export function customer(id) {
  return db
    .prepare(
      `SELECT c.*,d.name department, d.company_id, co.name company FROM customers c JOIN departments d ON c.department_id=d.id JOIN companies co ON d.company_id=co.id WHERE c.id=?`,
    )
    .get(id);
}
export function detail(cid) {
  const c = customer(cid);
  if (!c) return null;
  return {
    ...c,
    facts: db
      .prepare(
        "SELECT * FROM facts WHERE customer_id=? ORDER BY created_at DESC",
      )
      .all(cid)
      .map((f) => ({
        ...f,
        sources: db
          .prepare(
            "SELECT e.*,v.title,v.happened_at FROM evidence e JOIN visits v ON e.visit_id=v.id WHERE e.fact_id=? ORDER BY v.happened_at DESC",
          )
          .all(f.id),
      })),
    visits: db
      .prepare(
        "SELECT id,customer_id,title,happened_at,created_at,summary,status,error,is_demo,audio_name,length(transcript) transcript_length FROM visits WHERE customer_id=? ORDER BY happened_at DESC",
      )
      .all(cid),
    actions: db
      .prepare(
        "SELECT * FROM actions WHERE customer_id=? ORDER BY done,due_date",
      )
      .all(cid),
  };
}
export const normalize = (s) =>
  s.toLowerCase().replace(/[\s，。,.；;：:！!？?]/g, "");
export function applyExtraction(visit, result, autoApply) {
  return transaction(() => {
    for (const f of result.facts || []) {
      if (
        !["business", "needs", "personal"].includes(f.dimension) ||
        typeof f.field !== "string" ||
        !f.field.trim() ||
        typeof f.value !== "string" ||
        !f.value.trim()
      )
        continue;
      if (
        typeof f.quote !== "string" ||
        !f.quote.trim() ||
        !visit.transcript.includes(f.quote)
      )
        continue;
      const confidence = Number.isFinite(f.confidence)
        ? Math.max(0, Math.min(1, f.confidence))
        : 0.5;
      const existing = db
        .prepare(
          "SELECT * FROM facts WHERE customer_id=? AND dimension=? AND status IN ('active','review')",
        )
        .all(visit.customer_id, f.dimension);
      const same = existing.find(
        (x) =>
          normalize(x.field) === normalize(f.field) &&
          normalize(x.value) === normalize(f.value),
      );
      if (same) {
        db.prepare("INSERT OR IGNORE INTO evidence VALUES (?,?,?)").run(
          same.id,
          visit.id,
          f.quote,
        );
        continue;
      }
      const conflict = existing.some(
        (x) =>
          normalize(x.field) === normalize(f.field) && x.status === "active",
      );
      const review =
        conflict || confidence < 0.85 || !autoApply || f.uncertain === true;
      const fid = id();
      db.prepare("INSERT INTO facts VALUES (?,?,?,?,?,?,?,?,?)").run(
        fid,
        visit.customer_id,
        f.dimension,
        f.field.slice(0, 100),
        f.value.slice(0, 2000),
        review ? "review" : "active",
        confidence,
        conflict
          ? "同一字段已有不同记录，请核对时间和口径"
          : confidence < 0.85 || f.uncertain
            ? "原话含义或归属不够明确"
            : "",
        now(),
      );
      db.prepare("INSERT INTO evidence VALUES (?,?,?)").run(
        fid,
        visit.id,
        f.quote,
      );
    }
    for (const a of result.actions || []) {
      if (
        typeof a.text !== "string" ||
        !a.text.trim() ||
        typeof a.quote !== "string" ||
        !a.quote.trim() ||
        !visit.transcript.includes(a.quote)
      )
        continue;
      if (
        db
          .prepare("SELECT id FROM actions WHERE customer_id=? AND text=?")
          .get(visit.customer_id, a.text)
      )
        continue;
      // Relative or inferred dates remain blank: only an exact date explicitly present in the source is persisted.
      const date =
        /^\d{4}-\d{2}-\d{2}$/.test(a.due_date || "") &&
        visit.transcript.includes(a.due_date)
          ? a.due_date
          : "";
      db.prepare("INSERT INTO actions VALUES (?,?,?,?,?,?,?)").run(
        id(),
        visit.customer_id,
        visit.id,
        a.text.slice(0, 1000),
        date,
        0,
        a.quote,
      );
    }
    db.prepare(
      "UPDATE visits SET status='done',summary=?,error='' WHERE id=?",
    ).run(String(result.summary || "").slice(0, 4000), visit.id);
  });
}
