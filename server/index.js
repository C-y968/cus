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

  const demoCases = [
    {
      company: "澄川科技",
      department: "数字化业务部",
      name: "林知远",
      title: "数字化业务负责人",
      contact: "138****6721",
      notes: "华东制造业数字化转型核心决策人，对试点结果量化要求高。",
      visits: [
        {
          title: "首次拜访 · 试点需求沟通",
          daysAgo: 3,
          transcript:
            "林知远：我们在评估华东三个工厂的设备数据整合，第一阶段先做苏州工厂。\n林知远：我希望月底能拿出可量化的试点结果，让内部团队对投入产出有共识。\n林知远：技术材料可以提前发我，工作日上午沟通比较方便。我周末喜欢徒步。\n销售：我会先发试点方案和同类工厂案例给您。",
          summary:
            "明确以苏州工厂作为首个试点，关注可量化的投入产出；后续发送试点方案和案例。",
          facts: [
            { dimension: "business", field: "当前项目", value: "华东三个工厂设备数据整合，先做苏州工厂试点。", quote: "我们在评估华东三个工厂的设备数据整合，第一阶段先做苏州工厂。", confidence: 1 },
            { dimension: "needs", field: "工作目标", value: "月底展示可量化的试点结果，推动内部对投入产出达成共识。", quote: "我希望月底能拿出可量化的试点结果，让内部团队对投入产出有共识。", confidence: 1 },
            { dimension: "personal", field: "沟通偏好", value: "技术材料提前发送，工作日上午沟通。", quote: "技术材料可以提前发我，工作日上午沟通比较方便。", confidence: 1 },
            { dimension: "personal", field: "兴趣爱好", value: "周末徒步。", quote: "我周末喜欢徒步。", confidence: 1 },
          ],
          actions: [
            { text: "发送试点方案和同类工厂案例", quote: "我会先发试点方案和同类工厂案例给您。" },
          ],
        },
        {
          title: "第二次拜访 · 苏州工厂方案确认",
          daysAgo: 1,
          transcript:
            "林知远：方案收到了，苏州工厂的数据采集点比我们预估多，需要调整设备接入范围。\n林知远：下周二我带工厂厂长一起开会，到时候把现场的问题都过一遍。\n销售：好的，我提前准备好设备接入清单和工期排期。",
          summary: "苏州工厂采集点需调整，下周二带厂长一起确认现场问题。",
          facts: [
            { dimension: "business", field: "项目进展", value: "苏州工厂数据采集点超出预估，需调整设备接入范围。", quote: "苏州工厂的数据采集点比我们预估多，需要调整设备接入范围。", confidence: 1 },
            { dimension: "needs", field: "近期安排", value: "下周二带厂长开会，现场过一遍问题。", quote: "下周二我带工厂厂长一起开会，到时候把现场的问题都过一遍。", confidence: 0.95 },
          ],
          actions: [
            { text: "准备设备接入清单和工期排期", quote: "我提前准备好设备接入清单和工期排期。" },
          ],
        },
      ],
    },
    {
      company: "云墨文化",
      department: "内容运营部",
      name: "苏婉清",
      title: "内容运营总监",
      contact: "wx_suwq",
      notes: "内容行业资深从业者，关注创作者生态和分发效率。",
      visits: [
        {
          title: "行业活动交流 · 创作者平台痛点",
          daysAgo: 7,
          transcript:
            "苏婉清：现在最大的痛点是创作者分层运营没有好工具，头部和腰部完全不同节奏。\n苏婉清：我们试过两套系统，数据打通太麻烦，运营同事每天要花两小时手动导。\n苏婉清：如果有能统一分层看板的方案，我可以安排产品团队对接。\n销售：我们的分层看板方案正好解决这个痛点，我会后发您详细文档。",
          summary: "创作者分层运营工具是核心痛点，现有系统数据难打通；有产品对接意愿。",
          facts: [
            { dimension: "business", field: "核心痛点", value: "创作者分层运营缺乏统一工具，两套系统数据打通困难。", quote: "现在最大的痛点是创作者分层运营没有好工具，头部和腰部完全不同节奏。", confidence: 1 },
            { dimension: "needs", field: "效率损失", value: "运营团队每天花两小时手动导数据。", quote: "运营同事每天要花两小时手动导。", confidence: 0.95 },
            { dimension: "needs", field: "决策权", value: "可安排产品团队对接评估方案。", quote: "如果有能统一分层看板的方案，我可以安排产品团队对接。", confidence: 0.9 },
          ],
          actions: [
            { text: "发送分层看板方案详细文档", quote: "我们的分层看板方案正好解决这个痛点，我会后发您详细文档。" },
            { text: "约产品团队演示会议", quote: "我可以安排产品团队对接。" },
          ],
        },
      ],
    },
    {
      company: "鼎信金融",
      department: "风控技术部",
      name: "陈柏霖",
      title: "风控技术总监",
      contact: "chenbl@dingxin.com",
      notes: "金融行业对合规和安全要求极高，是较难进入的客户。",
      visits: [
        {
          title: "初步接洽 · 风控场景了解",
          daysAgo: 14,
          transcript:
            "陈柏霖：我们风控规则引擎更新频率很高，业务侧改规则，技术侧要当天生效。\n陈柏霖：合规审计要求所有规则变更可追溯，现在靠人盯容易漏。\n陈柏霖：我对新供应商合作比较谨慎，需要先过安全评估。\n销售：理解，我们会配合完成安全评估问卷，也提供同业合规案例。",
          summary: "风控规则引擎高频更新需可追溯，合规要求严格；需先过安全评估。",
          facts: [
            { dimension: "business", field: "核心场景", value: "风控规则引擎高频更新，业务侧改规则当天需生效。", quote: "我们风控规则引擎更新频率很高，业务侧改规则，技术侧要当天生效。", confidence: 1 },
            { dimension: "needs", field: "合规要求", value: "所有规则变更可追溯，当前靠人工盯容易遗漏。", quote: "合规审计要求所有规则变更可追溯，现在靠人盯容易漏。", confidence: 1 },
            { dimension: "personal", field: "合作风格", value: "对新供应商谨慎，需先过安全评估。", quote: "我对新供应商合作比较谨慎，需要先过安全评估。", confidence: 0.95 },
          ],
          actions: [
            { text: "完成安全评估问卷并提供合规案例", quote: "我们会配合完成安全评估问卷，也提供同业合规案例。" },
          ],
        },
      ],
    },
    {
      company: "绿源农业",
      department: "智慧农业事业部",
      name: "周明远",
      title: "事业部总经理",
      contact: "139****8432",
      notes: "农业科技领域新锐，已进入商务谈判阶段。",
      visits: [
        {
          title: "需求确认 · 智慧大棚方案",
          daysAgo: 5,
          transcript:
            "周明远：我们五个大棚试点已经跑了一轮，数据采集的稳定性比预期好很多。\n周明远：下一步想扩展到二十个棚，但预算需要集团审批，走流程大概两周。\n周明远：这周内我会把内部立项材料准备完，你那边合同模板先发我看看。\n销售：合同模板今天就能发，我会标注可协商的条款。",
          summary: "五棚试点成功，计划扩展至二十棚；预算审批约两周，需提供合同模板。",
          facts: [
            { dimension: "business", field: "试点进展", value: "五个大棚试点已完成，数据采集稳定性优于预期。", quote: "我们五个大棚试点已经跑了一轮，数据采集的稳定性比预期好很多。", confidence: 1 },
            { dimension: "business", field: "扩展计划", value: "计划扩展到二十个棚，预算需集团审批约两周。", quote: "下一步想扩展到二十个棚，但预算需要集团审批，走流程大概两周。", confidence: 0.95 },
            { dimension: "needs", field: "商务进展", value: "本周完成内部立项，需要合同模板提前审阅。", quote: "这周内我会把内部立项材料准备完，你那边合同模板先发我看看。", confidence: 1 },
          ],
          actions: [
            { text: "发送标注可协商条款的合同模板", quote: "合同模板今天就能发，我会标注可协商的条款。" },
            { text: "两周后跟进集团预算审批进展", quote: "预算需要集团审批，走流程大概两周。" },
          ],
        },
      ],
    },
    {
      company: "星途教育",
      department: "技术部",
      name: "何雨桐",
      title: "技术负责人",
      contact: "heyutong@xingtu.edu",
      notes: "教育行业技术决策人，正在考察直播互动方案。",
      visits: [
        {
          title: "线上沟通 · 直播课堂方案讨论",
          daysAgo: 10,
          transcript:
            "何雨桐：我们现在直播课堂延迟太高，学生端体验很差，互动基本卡顿。\n何雨桐：双减之后我们重点做素质教育，互动性要求比以前更高了。\n何雨桐：下周三可以安排一次技术测试，让我看看实际延迟表现。\n销售：好的，我会提前搭建测试环境，确保周三顺利测试。",
          summary: "直播课堂延迟高影响体验，互动性要求高；下周三安排技术测试。",
          facts: [
            { dimension: "business", field: "业务方向", value: "双减后转向素质教育，互动性要求更高。", quote: "双减之后我们重点做素质教育，互动性要求比以前更高了。", confidence: 1 },
            { dimension: "needs", field: "核心痛点", value: "直播课堂延迟高，学生端互动卡顿。", quote: "我们现在直播课堂延迟太高，学生端体验很差，互动基本卡顿。", confidence: 1 },
            { dimension: "needs", field: "下一步", value: "下周三安排技术测试，验证实际延迟。", quote: "下周三可以安排一次技术测试，让我看看实际延迟表现。", confidence: 0.95 },
          ],
          actions: [
            { text: "搭建测试环境准备周三技术测试", quote: "我会提前搭建测试环境，确保周三顺利测试。" },
          ],
        },
      ],
    },
  ];

  const createdIds = [];
  for (const c of demoCases) {
    const cid = id();
    const did = departmentFor({ company: c.company, department: c.department });
    db.prepare("INSERT INTO customers VALUES (?,?,?,?,?,?,?)").run(
      cid, did, c.name, c.title, c.contact, c.notes, now(),
    );
    for (const v of c.visits) {
      const vid = id();
      const happenedAt = new Date(Date.now() - v.daysAgo * 86400000).toISOString();
      db.prepare(
        "INSERT INTO visits (id,customer_id,title,happened_at,created_at,transcript,summary,status,is_demo) VALUES (?,?,?,?,?,?,?,?,?)",
      ).run(vid, cid, v.title, happenedAt, happenedAt, v.transcript, v.summary, "done", 1);
      for (const f of v.facts) {
        if (!v.transcript.includes(f.quote)) continue;
        const fid = id();
        const review = f.confidence < 1 ? "review" : "active";
        db.prepare("INSERT INTO facts VALUES (?,?,?,?,?,?,?,?,?)").run(
          fid, cid, f.dimension, f.field, f.value, review, f.confidence, "", now(),
        );
        db.prepare("INSERT INTO evidence VALUES (?,?,?)").run(fid, vid, f.quote);
      }
      for (const a of v.actions) {
        if (!v.transcript.includes(a.quote)) continue;
        const aid = id();
        db.prepare("INSERT INTO actions VALUES (?,?,?,?,?,?,?)").run(
          aid, cid, vid, a.text, "", 0, a.quote,
        );
      }
    }
    createdIds.push(cid);
  }
  res.json({ ids: createdIds });
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
