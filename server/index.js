// v2026-09-11 open-access build
import express from "express";
import helmet from "helmet";
import multer from "multer";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import {
  db,
  id,
  now,
  getKV,
  setKV,
  encrypt,
  settings,
  defaults,
  dataDir,
  customer,
  detail,
  transaction,
  applyExtraction,
  normalize,
} from "./store.js";
import { kick, validBase, testModel } from "./ai.js";
const app = express();
app.disable("x-powered-by");
if (process.env.TRUST_PROXY === "1") app.set("trust proxy", 1);
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        "img-src": ["'self'", "data:"],
        "media-src": ["'self'", "blob:"],
        "script-src": ["'self'"],
        "style-src": ["'self'", "'unsafe-inline'"],
        "connect-src": ["'self'"],
        "upgrade-insecure-requests": null,
      },
    },
    strictTransportSecurity:
      process.env.COOKIE_SECURE === "1" ? undefined : false,
  }),
);
app.use(express.json({ limit: "2mb" }));
app.use("/api", (req, res, next) => {
  res.set("Cache-Control", "no-store");
  if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    const origin = req.headers.origin;
    if (origin && origin !== `${req.protocol}://${req.get("host")}`)
      return res.status(403).json({ error: "请求来源不匹配" });
    if (req.headers["x-compass-request"] !== "1")
      return res.status(403).json({ error: "缺少请求校验" });
  }
  next();
});
app.get("/api/health", (req, res) =>
  res.json({
    application: "customer-compass",
    instance: process.env.COMPASS_INSTANCE || "foreground",
    pid: process.pid,
  }),
);
const fail = (message, status = 400) =>
  Object.assign(new Error(message), { status });
const required = (value, label, max = 200) => {
  if (typeof value !== "string" || !value.trim() || value.length > max)
    throw fail(`${label}不能为空，且不能超过 ${max} 字`);
  return value.trim();
};
const opt = (value, max = 2000) =>
  typeof value === "string" ? value.trim().slice(0, max) : "";
app.get("/api/bootstrap", (req, res) => {
  res.json({
    companies: db.prepare("SELECT * FROM companies ORDER BY name").all(),
    departments: db.prepare("SELECT * FROM departments ORDER BY name").all(),
    customers: db
      .prepare(
        `SELECT c.*,d.name department,d.company_id,co.name company,(SELECT MAX(happened_at) FROM visits WHERE customer_id=c.id) last_visit,(SELECT COUNT(*) FROM visits WHERE customer_id=c.id) visit_count,(SELECT COUNT(*) FROM facts WHERE customer_id=c.id AND status='review') review_count FROM customers c JOIN departments d ON c.department_id=d.id JOIN companies co ON d.company_id=co.id ORDER BY COALESCE(last_visit,c.created_at) DESC`,
      )
      .all(),
    actions: db
      .prepare(
        `SELECT a.*,c.name customer_name FROM actions a JOIN customers c ON a.customer_id=c.id WHERE a.done=0 ORDER BY CASE WHEN a.due_date='' THEN 1 ELSE 0 END,a.due_date LIMIT 100`,
      )
      .all(),
    recent: db
      .prepare(
        "SELECT v.id,v.customer_id,v.title,v.happened_at,v.status,v.error,c.name customer_name FROM visits v JOIN customers c ON c.id=v.customer_id ORDER BY v.created_at DESC LIMIT 12",
      )
      .all(),
    configured: {
      asr: !!settings().asr.hasKey,
      llm: !!settings().llm.hasKey && !!settings().llm.model,
    },
  });
});
function departmentFor(body) {
  const companyName = required(body.company, "公司名称");
  const departmentName = required(body.department, "部门名称");
  let co = db.prepare("SELECT id FROM companies WHERE name=?").get(companyName);
  if (!co) {
    co = { id: id() };
    db.prepare("INSERT INTO companies VALUES (?,?)").run(co.id, companyName);
  }
  let d = db
    .prepare("SELECT id FROM departments WHERE company_id=? AND name=?")
    .get(co.id, departmentName);
  if (!d) {
    d = { id: id() };
    db.prepare("INSERT INTO departments VALUES (?,?,?)").run(
      d.id,
      co.id,
      departmentName,
    );
  }
  return d.id;
}
app.post("/api/customers", (req, res) => {
  const name = required(req.body.name, "客户姓名");
  const cid = id();
  transaction(() => {
    const did = departmentFor(req.body);
    db.prepare("INSERT INTO customers VALUES (?,?,?,?,?,?,?)").run(
      cid,
      did,
      name,
      opt(req.body.title, 200),
      opt(req.body.contact, 300),
      opt(req.body.notes, 5000),
      now(),
    );
  });
  res.status(201).json(detail(cid));
});
app.get("/api/customers/:id", (req, res) => {
  const c = detail(req.params.id);
  if (!c) throw fail("客户不存在", 404);
  res.json(c);
});
app.put("/api/customers/:id", (req, res) => {
  if (!customer(req.params.id)) throw fail("客户不存在", 404);
  const name = required(req.body.name, "客户姓名");
  transaction(() => {
    const did = departmentFor(req.body);
    db.prepare(
      "UPDATE customers SET department_id=?,name=?,title=?,contact=?,notes=? WHERE id=?",
    ).run(
      did,
      name,
      opt(req.body.title, 200),
      opt(req.body.contact, 300),
      opt(req.body.notes, 5000),
      req.params.id,
    );
  });
  res.json(detail(req.params.id));
});
app.patch("/api/organizations/:type/:id", (req, res) => {
  const table =
    req.params.type === "companies"
      ? "companies"
      : req.params.type === "departments"
        ? "departments"
        : null;
  if (!table) throw fail("组织类型错误");
  const name = required(req.body.name, "名称");
  if (
    !db
      .prepare(`UPDATE ${table} SET name=? WHERE id=?`)
      .run(name, req.params.id).changes
  )
    throw fail("组织不存在", 404);
  res.json({ ok: true });
});
app.delete("/api/customers/:id", (req, res) => {
  if (
    db
      .prepare(
        "SELECT id FROM visits WHERE customer_id=? AND status IN ('pending','transcribing','extracting')",
      )
      .get(req.params.id)
  )
    throw fail("请等待处理结束再删除", 409);
  const paths = db
    .prepare(
      "SELECT audio_path FROM visits WHERE customer_id=? AND audio_path IS NOT NULL",
    )
    .all(req.params.id);
  db.prepare("DELETE FROM customers WHERE id=?").run(req.params.id);
  for (const p of paths)
    fs.rmSync(path.join(dataDir, "audio", p.audio_path), { force: true });
  res.json({ ok: true });
});
const allowed = new Set([
  ".mp3",
  ".mp4",
  ".mpeg",
  ".mpga",
  ".m4a",
  ".wav",
  ".webm",
  ".ogg",
  ".flac",
  ".aac",
  ".amr",
]);
const upload = multer({
  storage: multer.diskStorage({
    destination: path.join(dataDir, "audio"),
    filename: (req, file, cb) =>
      cb(null, id() + path.extname(file.originalname).toLowerCase()),
  }),
  limits: {
    fileSize: 200 * 1024 * 1024,
    files: 1,
    fields: 8,
    fieldSize: 1024 * 1024,
  },
  fileFilter: (req, file, cb) =>
    cb(
      allowed.has(path.extname(file.originalname).toLowerCase())
        ? null
        : fail("不支持此文件格式，请上传音频文件"),
      allowed.has(path.extname(file.originalname).toLowerCase()),
    ),
});
app.post("/api/visits", upload.single("audio"), (req, res, next) => {
  try {
    const cid = required(req.body.customer_id, "目标客户");
    if (!customer(cid)) throw fail("请先选择客户");
    if (req.body.consent !== "true")
      throw fail("请确认已获得录音及用于客户档案的授权");
    const transcript = opt(req.body.transcript, 200001);
    if (transcript.length > 200000)
      throw fail("文字记录不能超过 200,000 字，请拆成多次拜访记录");
    if (!req.file && !transcript) throw fail("请上传录音或填写文字记录");
    const title = required(req.body.title, "拜访标题");
    const happened = new Date(req.body.happened_at);
    if (!Number.isFinite(happened.getTime())) throw fail("拜访日期无效");
    const requestId = opt(req.body.request_id, 100) || null;
    const existing = requestId
      ? db
          .prepare("SELECT id,customer_id FROM visits WHERE request_id=?")
          .get(requestId)
      : null;
    if (existing) {
      if (req.file) fs.rmSync(req.file.path, { force: true });
      return res.json(existing);
    }
    const vid = id();
    db.prepare(
      "INSERT INTO visits (id,customer_id,title,happened_at,created_at,audio_path,audio_name,audio_type,transcript,status,request_id) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
    ).run(
      vid,
      cid,
      title,
      happened.toISOString(),
      now(),
      req.file?.filename || null,
      req.file
        ? Buffer.from(req.file.originalname, "latin1").toString("utf8")
        : null,
      req.file?.mimetype || null,
      transcript,
      "pending",
      requestId,
    );
    kick();
    res.status(201).json({ id: vid, customer_id: cid });
  } catch (e) {
    if (req.file) fs.rmSync(req.file.path, { force: true });
    next(e);
  }
});
app.get("/api/visits/:id", (req, res) => {
  const v = db.prepare("SELECT * FROM visits WHERE id=?").get(req.params.id);
  if (!v) throw fail("记录不存在", 404);
  res.json({ ...v, audio_path: undefined, has_audio: !!v.audio_path });
});
app.get("/api/visits/:id/audio", (req, res) => {
  const v = db
    .prepare("SELECT audio_path,audio_name FROM visits WHERE id=?")
    .get(req.params.id);
  if (!v?.audio_path) throw fail("录音不存在", 404);
  res.sendFile(path.join(dataDir, "audio", v.audio_path));
});
app.post("/api/visits/:id/retry", (req, res) => {
  const v = db.prepare("SELECT * FROM visits WHERE id=?").get(req.params.id);
  if (!v) throw fail("记录不存在", 404);
  if (["pending", "transcribing", "extracting", "done"].includes(v.status))
    throw fail("该记录正在处理或已完成", 409);
  if (req.body.transcript !== undefined) {
    const text = required(req.body.transcript, "文字稿", 200000);
    db.prepare("UPDATE visits SET transcript=? WHERE id=?").run(text, v.id);
  }
  db.prepare("UPDATE visits SET status='pending',error='' WHERE id=?").run(
    v.id,
  );
  kick();
  res.json({ ok: true });
});
app.delete("/api/visits/:id", (req, res) => {
  const v = db.prepare("SELECT * FROM visits WHERE id=?").get(req.params.id);
  if (!v) throw fail("记录不存在", 404);
  if (["pending", "transcribing", "extracting"].includes(v.status))
    throw fail("请等待处理结束再删除", 409);
  transaction(() => {
    db.prepare("DELETE FROM visits WHERE id=?").run(v.id);
    db.prepare(
      "DELETE FROM facts WHERE id NOT IN (SELECT fact_id FROM evidence)",
    ).run();
  });
  if (v.audio_path)
    fs.rmSync(path.join(dataDir, "audio", v.audio_path), { force: true });
  res.json({ ok: true });
});
app.post("/api/facts/:id/resolve", (req, res) => {
  const f = db.prepare("SELECT * FROM facts WHERE id=?").get(req.params.id);
  if (!f || f.status !== "review") throw fail("待核对条目不存在", 404);
  if (!["accept", "replace", "discard"].includes(req.body.action))
    throw fail("处理方式无效");
  transaction(() => {
    if (req.body.action === "replace") {
      for (const old of db
        .prepare(
          "SELECT id,field FROM facts WHERE customer_id=? AND dimension=? AND status='active'",
        )
        .all(f.customer_id, f.dimension)) {
        if (normalize(old.field) === normalize(f.field))
          db.prepare("UPDATE facts SET status='archived' WHERE id=?").run(
            old.id,
          );
      }
    }
    db.prepare("UPDATE facts SET status=?,reason=? WHERE id=?").run(
      req.body.action === "discard" ? "discarded" : "active",
      "人工核对",
      f.id,
    );
  });
  res.json({ ok: true });
});
app.patch("/api/facts/:id", (req, res) => {
  const f = db.prepare("SELECT * FROM facts WHERE id=?").get(req.params.id);
  if (!f || f.status !== "active") throw fail("可修订的信息不存在", 404);
  const field = required(req.body.field, "字段名称", 100),
    value = required(req.body.value, "内容", 2000),
    dimension = req.body.dimension;
  if (!["business", "needs", "personal"].includes(dimension))
    throw fail("信息维度无效");
  const fid = id();
  transaction(() => {
    db.prepare("UPDATE facts SET status='archived' WHERE id=?").run(f.id);
    db.prepare("INSERT INTO facts VALUES (?,?,?,?,?,?,?,?,?)").run(
      fid,
      f.customer_id,
      dimension,
      field,
      value,
      "active",
      1,
      "人工修订",
      now(),
    );
    db.prepare(
      "INSERT INTO evidence SELECT ?,visit_id,quote FROM evidence WHERE fact_id=?",
    ).run(fid, f.id);
  });
  res.json({ id: fid });
});
app.post("/api/actions", (req, res) => {
  if (!customer(req.body.customer_id)) throw fail("客户不存在", 404);
  const date = opt(req.body.due_date, 10);
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw fail("日期格式错误");
  db.prepare("INSERT INTO actions VALUES (?,?,?,?,?,?,?)").run(
    id(),
    req.body.customer_id,
    null,
    required(req.body.text, "跟进事项", 1000),
    date,
    0,
    "手动添加",
  );
  res.json({ ok: true });
});
app.patch("/api/actions/:id", (req, res) => {
  if (typeof req.body.done !== "boolean") throw fail("状态无效");
  db.prepare("UPDATE actions SET done=? WHERE id=?").run(
    req.body.done ? 1 : 0,
    req.params.id,
  );
  res.json({ ok: true });
});
app.get("/api/settings", (req, res) => {
  const lan = Object.values(os.networkInterfaces())
    .flat()
    .filter((x) => x.family === "IPv4" && !x.internal)
    .map((x) => `http://${x.address}:${process.env.PORT || 4380}`);
  res.json({ ...settings(), lanUrls: lan });
});
app.put("/api/settings", (req, res) => {
  const previous = getKV("settings", defaults);
  const next = {
    ...previous,
    autoApply: req.body.autoApply === true,
    publicUrl: opt(req.body.publicUrl, 500),
  };
  if (next.publicUrl) {
    const u = new URL(next.publicUrl);
    if (
      !["https:", "http:"].includes(u.protocol) ||
      u.username ||
      u.password ||
      u.search ||
      u.hash
    )
      throw fail("手机访问地址格式不正确");
    next.publicUrl = u.origin;
  }
  for (const type of ["asr", "llm"]) {
    const s = req.body[type];
    if (!s) throw fail("模型配置缺失");
    next[type] = {
      baseUrl: validBase(s.baseUrl),
      model: opt(s.model, 200),
      apiKey: s.clearKey
        ? ""
        : s.apiKey
          ? encrypt(required(s.apiKey, "API Key", 1000))
          : previous[type].apiKey,
      ...(type === "asr" ? { language: opt(s.language, 10) } : {}),
    };
  }
  setKV("settings", next);
  res.json(settings());
});
app.post("/api/settings/test/:type", async (req, res) => {
  if (!["asr", "llm"].includes(req.params.type)) throw fail("模型类型错误");
  await testModel(req.params.type);
  res.json({ ok: true });
});
app.post("/api/resume", (req, res) => {
  const result = db
    .prepare(
      "UPDATE visits SET status='pending',error='' WHERE status IN ('waiting_transcription','waiting_extraction')",
    )
    .run();
  kick();
  res.json({ count: result.changes });
});
app.get("/api/export", (req, res) => {
  const selected = req.query.customer_id;
  const rows = selected
    ? [detail(selected)].filter(Boolean)
    : db
        .prepare("SELECT id FROM customers")
        .all()
        .map((c) => detail(c.id));
  const data = {
    format: "customer-compass",
    version: 1,
    exported_at: now(),
    customers: rows.map((c) => ({
      ...c,
      visits: c.visits.map((v) => ({
        ...v,
        ...db
          .prepare("SELECT transcript,audio_name FROM visits WHERE id=?")
          .get(v.id),
      })),
    })),
  };
  res
    .set(
      "Content-Disposition",
      'attachment; filename="customer-compass-export.json"',
    )
    .json(data);
});
app.get("/api/customers/:id/export", (req, res) => {
  const c = detail(req.params.id);
  if (!c) throw fail("客户不存在", 404);
  const dims = {
    business: "业务方向",
    needs: "个人诉求",
    personal: "个人客情",
  };
  let md = `# ${c.name} · 客户档案\n\n${c.company} / ${c.department} / ${c.title}\n\n联系方式：${c.contact || "未填写"}\n\n备注：${c.notes || "无"}\n`;
  for (const [dim, label] of Object.entries(dims)) {
    md += `\n## ${label}\n`;
    for (const f of c.facts.filter(
      (f) => f.dimension === dim && f.status === "active",
    )) {
      md += `\n- **${f.field}**：${f.value}\n`;
      for (const s of f.sources)
        md += `  - 来源：${s.happened_at.slice(0, 10)} ${s.title}；原话：${s.quote}\n`;
    }
  }
  md += "\n## 待核对\n";
  for (const f of c.facts.filter((f) => f.status === "review"))
    md += `\n- ${dims[f.dimension]} / ${f.field}：${f.value}（${f.reason || "待人工核对"}）\n`;
  md += "\n## 跟进事项\n";
  for (const a of c.actions)
    md += `\n- [${a.done ? "x" : " "}] ${a.text}${a.due_date ? " · " + a.due_date : ""}\n`;
  md += "\n## 拜访记录\n";
  for (const v of c.visits)
    md += `\n### ${v.happened_at.slice(0, 10)} ${v.title}\n\n${v.summary || "尚未提炼"}\n`;
  res
    .set("Content-Type", "text/markdown; charset=utf-8")
    .set(
      "Content-Disposition",
      `attachment; filename*=UTF-8''${encodeURIComponent(c.name + "-客户档案.md")}`,
    )
    .send(md);
});
app.post("/api/demo", (req, res) => {
  if (db.prepare("SELECT id FROM visits WHERE is_demo=1").get())
    throw fail("示例已存在，可在客户档案查看");
  const cid = id();
  transaction(() => {
    const did = departmentFor({
      company: "澄川科技（示例）",
      department: "数字化业务部",
    });
    db.prepare("INSERT INTO customers VALUES (?,?,?,?,?,?,?)").run(
      cid,
      did,
      "林知远（示例）",
      "数字化业务负责人",
      "",
      "虚构示例，仅用于体验。可在编辑客户中删除。",
      now(),
    );
    const vid = id();
    const transcript =
      "林知远：我们在评估华东三个工厂的设备数据整合，第一阶段先做苏州工厂。\n林知远：我希望月底能拿出可量化的试点结果，让内部团队对投入产出有共识。\n林知远：技术材料可以提前发我，工作日上午沟通比较方便。我周末喜欢徒步。\n销售：我会先发试点方案和同类工厂案例给您。";
    db.prepare(
      "INSERT INTO visits (id,customer_id,title,happened_at,created_at,transcript,status,is_demo) VALUES (?,?,?,?,?,?,?,?)",
    ).run(
      vid,
      cid,
      "首次拜访 · 试点需求沟通",
      now(),
      now(),
      transcript,
      "done",
      1,
    );
  });
  const v = db.prepare("SELECT * FROM visits WHERE customer_id=?").get(cid);
  applyExtraction(
    v,
    {
      summary:
        "明确以苏州工厂作为首个试点，关注可量化的投入产出；后续发送试点方案和案例。",
      facts: [
        {
          dimension: "business",
          field: "当前项目",
          value: "华东三个工厂设备数据整合，先做苏州工厂试点。",
          quote: "我们在评估华东三个工厂的设备数据整合，第一阶段先做苏州工厂。",
          confidence: 1,
        },
        {
          dimension: "needs",
          field: "工作目标",
          value: "月底展示可量化的试点结果，推动内部对投入产出达成共识。",
          quote:
            "我希望月底能拿出可量化的试点结果，让内部团队对投入产出有共识。",
          confidence: 1,
        },
        {
          dimension: "personal",
          field: "沟通偏好",
          value: "技术材料提前发送，工作日上午沟通。",
          quote: "技术材料可以提前发我，工作日上午沟通比较方便。",
          confidence: 1,
        },
        {
          dimension: "personal",
          field: "兴趣爱好",
          value: "周末徒步。",
          quote: "我周末喜欢徒步。",
          confidence: 1,
        },
      ],
      actions: [
        {
          text: "发送试点方案和同类工厂案例",
          quote: "我会先发试点方案和同类工厂案例给您。",
          due_date: "",
        },
      ],
    },
    true,
  );
  res.json({ id: cid });
});
app.use("/api", (req, res) => res.status(404).json({ error: "接口不存在" }));
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
app.use(express.static(path.join(root, "dist"), { maxAge: 0 }));
app.get("/{*path}", (req, res) =>
  res.sendFile(path.join(root, "dist", "index.html")),
);
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  const uploadError = err instanceof multer.MulterError;
  const conflict = String(err.message).includes("UNIQUE constraint");
  res.status(uploadError ? 400 : conflict ? 409 : err.status || 400).json({
    error: uploadError
      ? "上传失败：单个文件不能超过 200 MB"
      : conflict
        ? "该名称已存在，请换一个名称"
        : String(err.message).includes("SQLITE")
          ? "保存失败，请检查输入"
          : err.message || "请求失败",
  });
});
app.listen(
  Number(process.env.PORT || 4380),
  process.env.HOST || "127.0.0.1",
  () => {
    console.log(
      `客序已启动：http://${process.env.HOST || "127.0.0.1"}:${process.env.PORT || 4380}`,
    );
    kick();
  },
);
