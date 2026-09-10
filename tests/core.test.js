import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { spawn } from "node:child_process";
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "compass-test-"));
process.env.DATA_DIR = path.join(dir, "unit");
const { db, id, now, applyExtraction, detail, encrypt, decrypt, normalize } =
  await import("../server/store.js");
const { validBase } = await import("../server/ai.js");
const co = id(),
  dep = id(),
  cid = id(),
  other = id();
db.prepare("INSERT INTO companies VALUES (?,?)").run(co, "测试公司");
db.prepare("INSERT INTO departments VALUES (?,?,?)").run(dep, co, "业务部");
for (const c of [cid, other])
  db.prepare("INSERT INTO customers VALUES (?,?,?,?,?,?,?)").run(
    c,
    dep,
    c,
    "采购",
    "",
    "",
    now(),
  );
function visit(text, customerId = cid) {
  const v = { id: id(), customer_id: customerId, transcript: text };
  db.prepare(
    "INSERT INTO visits (id,customer_id,title,happened_at,created_at,transcript,status) VALUES (?,?,?,?,?,?,?)",
  ).run(v.id, customerId, "拜访", now(), now(), text, "pending");
  return v;
}
const fact = (value, quote, extra = {}) => ({
  dimension: "business",
  field: "预算",
  value,
  quote,
  confidence: 0.95,
  ...extra,
});
const result = (facts) => ({ summary: "摘要", facts, actions: [] });
test("密钥加密可逆，密文不包含明文", () => {
  const secret = "test-secret-key";
  const encrypted = encrypt(secret);
  assert.notEqual(encrypted, secret);
  assert.ok(!encrypted.includes(secret));
  assert.equal(decrypt(encrypted), secret);
  assert.notEqual(encrypt(secret), encrypted);
});
test("接口 URL 仅允许 HTTPS 或明确的本机 HTTP，拒绝凭据与重定向型参数", () => {
  assert.equal(
    validBase("https://api.example.com/v1/"),
    "https://api.example.com/v1",
  );
  assert.equal(
    validBase("http://127.0.0.1:9000/v1"),
    "http://127.0.0.1:9000/v1",
  );
  for (const s of [
    "http://remote.example/v1",
    "https://u:p@example.com/v1",
    "https://example.com/?key=x",
    "file:///etc/passwd",
  ])
    assert.throws(() => validBase(s));
});
test("新事实归档，重复事实增加来源，冲突待核对且不覆盖旧值", () => {
  const one = visit("客户：预算三十万元。");
  applyExtraction(one, result([fact("三十万元", "预算三十万元。")]), true);
  let c = detail(cid);
  assert.equal(c.facts.filter((f) => f.status === "active").length, 1);
  const two = visit("客户：预算仍然是三十万元。");
  applyExtraction(
    two,
    result([fact("三十万元", "预算仍然是三十万元。")]),
    true,
  );
  c = detail(cid);
  assert.equal(c.facts.length, 1);
  assert.equal(c.facts[0].sources.length, 2);
  const three = visit("客户：预算改为五十万元。");
  applyExtraction(
    three,
    result([fact("五十万元", "预算改为五十万元。")]),
    true,
  );
  c = detail(cid);
  assert.equal(c.facts.find((f) => f.status === "active").value, "三十万元");
  assert.equal(c.facts.find((f) => f.status === "review").value, "五十万元");
  assert.equal(detail(other).facts.length, 0);
});
test("缺失原话的模型输出不写档，低置信度和关闭自动写入均待核对", () => {
  const v = visit("客户：也许周五可以见面。", other);
  applyExtraction(
    v,
    result([
      fact("一百万元", "并不存在的原话"),
      fact("周五见面", "也许周五可以见面。", {
        dimension: "personal",
        field: "时间偏好",
        confidence: 0.6,
      }),
    ]),
    true,
  );
  assert.equal(detail(other).facts.length, 1);
  assert.equal(detail(other).facts[0].status, "review");
  const v2 = visit("客户：我喜欢文字沟通。", other);
  applyExtraction(
    v2,
    result([
      fact("文字沟通", "我喜欢文字沟通。", {
        dimension: "personal",
        field: "沟通偏好",
      }),
    ]),
    false,
  );
  assert.equal(
    detail(other).facts.find((f) => f.field === "沟通偏好").status,
    "review",
  );
});
test("明确行动保存，推断日期保持空白，模型异常不会部分写档", () => {
  const v = visit("销售：明天发送方案。");
  applyExtraction(
    v,
    {
      summary: "",
      facts: [],
      actions: [
        { text: "发送方案", due_date: "2026-09-07", quote: "明天发送方案。" },
        { text: "无证据事项", quote: "错误" },
      ],
    },
    true,
  );
  const a = detail(cid).actions;
  assert.equal(a.length, 1);
  assert.equal(a[0].due_date, "");
  const bad = visit("客户：现在预算九十万。");
  const beforeCount = detail(cid).facts.length;
  assert.throws(() =>
    applyExtraction(
      bad,
      { facts: [fact("九十万", "现在预算九十万。"), null] },
      true,
    ),
  );
  assert.equal(detail(cid).facts.length, beforeCount);
});
let server,
  provider,
  base,
  customerId,
  visitId,
  providerRequests = 0;
function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
async function call(
  route,
  { method = "GET", body, headers = {}, form = false } = {},
) {
  const r = await fetch(base + route, {
    method,
    headers: {
      "X-Compass-Request": "1",
      ...(form ? {} : { "Content-Type": "application/json" }),
      ...headers,
    },
    body: body ? (form ? body : JSON.stringify(body)) : undefined,
  });
  const raw = await r.text();
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    data = raw;
  }
  return { r, data };
}
async function untilDone(vid) {
  for (let i = 0; i < 100; i++) {
    const { data } = await call("/api/visits/" + vid);
    if (!["pending", "transcribing", "extracting"].includes(data.status))
      return data;
    await wait(100);
  }
  throw Error("处理超时");
}
before(async () => {
  provider = http.createServer(async (req, res) => {
    providerRequests++;
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = Buffer.concat(chunks).toString();
    res.setHeader("Content-Type", "application/json");
    if (req.url.endsWith("/audio/transcriptions")) {
      assert.ok(body.includes('name="file"'));
      res.end(
        JSON.stringify({
          text: "客户：项目预算三十万元。客户：我希望先拿到试点结果。客户：请在工作日上午联系我。销售：我会发送方案。",
        }),
      );
    } else {
      let data;
      try {
        data = JSON.parse(body);
      } catch {
        res.statusCode = 400;
        res.end("{}");
        return;
      }
      const input = data.messages.find((m) => m.role === "user")?.content || "";
      if (input === "Reply with OK.")
        res.end(JSON.stringify({ choices: [{ message: { content: "OK" } }] }));
      else {
        const source = JSON.parse(input).transcript;
        const newBudget = source.includes("五十万元");
        res.end(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    summary: "试点预算与后续跟进",
                    facts: [
                      {
                        dimension: "business",
                        field: "预算",
                        value: newBudget ? "五十万元" : "三十万元",
                        quote: newBudget
                          ? "预算改为五十万元。"
                          : "项目预算三十万元。",
                        confidence: 0.99,
                      },
                      {
                        dimension: "needs",
                        field: "工作目标",
                        value: "先拿到试点结果",
                        quote: "我希望先拿到试点结果。",
                        confidence: 0.96,
                      },
                      {
                        dimension: "personal",
                        field: "沟通偏好",
                        value: "工作日上午联系",
                        quote: "请在工作日上午联系我。",
                        confidence: 0.96,
                      },
                    ],
                    actions: [
                      {
                        text: "发送方案",
                        quote: "我会发送方案。",
                        due_date: "",
                      },
                    ],
                  }),
                },
              },
            ],
          }),
        );
      }
    }
  });
  await new Promise((r) => provider.listen(0, "127.0.0.1", r));
  const portServer = http.createServer();
  await new Promise((r) => portServer.listen(0, "127.0.0.1", r));
  const port = portServer.address().port;
  await new Promise((r) => portServer.close(r));
  base = "http://127.0.0.1:" + port;
  server = spawn(process.execPath, ["server/index.js"], {
    cwd: path.resolve("."),
    env: {
      ...process.env,
      DATA_DIR: path.join(dir, "integration"),
      PORT: String(port),
      HOST: "127.0.0.1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let logs = "";
  server.stdout.on("data", (c) => (logs += c));
  server.stderr.on("data", (c) => (logs += c));
  for (let i = 0; i < 80; i++) {
    try {
      await fetch(base + "/api/health");
      return;
    } catch {
      await wait(100);
    }
  }
  throw Error(logs);
});
after(async () => {
  server?.kill();
  if (provider) await new Promise((r) => provider.close(r));
  db.close();
  await wait(150);
  fs.rmSync(dir, { recursive: true, force: true });
});
test("HTTP 匿名访问与跨站请求拦截", async () => {
  let response = await call("/api/bootstrap");
  assert.equal(response.r.status, 200);
  response = await call("/api/customers", {
    method: "POST",
    body: {},
    headers: { Origin: "https://evil.example" },
  });
  assert.equal(response.r.status, 403);
});
test("创建层级客户，保存录音，未配置模型时不发外部请求", async () => {
  const c = await call("/api/customers", {
    method: "POST",
    body: {
      company: "测试集团",
      department: "采购部",
      name: "张经理",
      title: "采购负责人",
    },
  });
  assert.equal(c.r.status, 201);
  customerId = c.data.id;
  const wav = Buffer.alloc(32044);
  wav.write("RIFF");
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(16000, 24);
  wav.writeUInt32LE(32000, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(32000, 40);
  const form = new FormData();
  form.set("customer_id", customerId);
  form.set("request_id", "integration-first-upload");
  form.set("title", "首次录音");
  form.set("happened_at", now());
  form.set("consent", "true");
  form.set("audio", new Blob([wav], { type: "audio/wav" }), "test.wav");
  const v = await call("/api/visits", {
    method: "POST",
    body: form,
    form: true,
  });
  assert.equal(v.r.status, 201);
  visitId = v.data.id;
  const repeated = await call("/api/visits", {
    method: "POST",
    body: form,
    form: true,
  });
  assert.equal(repeated.r.status, 200);
  assert.equal(repeated.data.id, visitId);
  assert.equal(
    fs.readdirSync(path.join(dir, "integration", "audio")).length,
    1,
  );
  assert.equal((await untilDone(visitId)).status, "waiting_transcription");
  assert.equal(providerRequests, 0);
  const audio = await fetch(base + "/api/visits/" + visitId + "/audio");
  assert.equal(audio.status, 200);
  assert.equal((await audio.arrayBuffer()).byteLength, wav.length);
});
test("配置接口后跑通录音→转写→三维档案，密钥不回显", async () => {
  const url = "http://127.0.0.1:" + provider.address().port + "/v1";
  const saved = await call("/api/settings", {
    method: "PUT",
    body: {
      asr: {
        baseUrl: url,
        model: "test-asr",
        apiKey: "private-asr-key",
        language: "zh",
      },
      llm: { baseUrl: url, model: "test-llm", apiKey: "private-llm-key" },
      autoApply: true,
      publicUrl: "",
    },
  });
  assert.equal(saved.r.status, 200);
  assert.equal(saved.data.asr.hasKey, true);
  assert.equal(saved.data.asr.apiKey, "");
  assert.ok(!JSON.stringify(saved.data).includes("private"));
  await call("/api/resume", { method: "POST" });
  const v = await untilDone(visitId);
  assert.equal(v.status, "done", v.error);
  assert.ok(v.transcript.includes("三十万元"));
  const { data: c } = await call("/api/customers/" + customerId);
  assert.equal(c.facts.filter((f) => f.status === "active").length, 3);
  assert.equal(c.actions.length, 1);
  assert.ok(c.facts.every((f) => f.sources[0].quote));
});
test("第二次拜访变化待核对，人工替换保留历史，导出含证据", async () => {
  const form = new FormData();
  for (const [k, v] of Object.entries({
    customer_id: customerId,
    title: "第二次拜访",
    happened_at: now(),
    consent: "true",
    transcript: "客户：预算改为五十万元。",
  }))
    form.set(k, v);
  const { data } = await call("/api/visits", {
    method: "POST",
    form: true,
    body: form,
  });
  assert.equal((await untilDone(data.id)).status, "done");
  let c = (await call("/api/customers/" + customerId)).data;
  const pending = c.facts.find((f) => f.status === "review");
  assert.equal(pending.value, "五十万元");
  assert.ok(
    c.facts.some((f) => f.status === "active" && f.value === "三十万元"),
  );
  await call("/api/facts/" + pending.id + "/resolve", {
    method: "POST",
    body: { action: "replace" },
  });
  c = (await call("/api/customers/" + customerId)).data;
  assert.equal(c.facts.find((f) => f.value === "三十万元").status, "archived");
  assert.equal(c.facts.find((f) => f.value === "五十万元").status, "active");
  const md = await call("/api/customers/" + customerId + "/export");
  assert.equal(md.r.status, 200);
  assert.ok(md.data.includes("五十万元"));
  assert.ok(md.data.includes("原话"));
  const exported = (await call("/api/export")).data;
  assert.ok(!JSON.stringify(exported).includes("private-asr-key"));
  assert.ok(exported.customers[0].visits[0].transcript);
});
test("错误文件不留垃圾，删除拜访清理独有事实", async () => {
  const prior = fs.readdirSync(path.join(dir, "integration", "audio")).length;
  const bad = new FormData();
  bad.set("customer_id", "missing");
  bad.set("audio", new Blob(["data"]), "test.mp3");
  let r = await call("/api/visits", { method: "POST", body: bad, form: true });
  assert.equal(r.r.status, 400);
  assert.equal(
    fs.readdirSync(path.join(dir, "integration", "audio")).length,
    prior,
  );
  r = await call("/api/visits/" + visitId, { method: "DELETE" });
  assert.equal(r.r.status, 200);
  assert.equal(
    fs.readdirSync(path.join(dir, "integration", "audio")).length,
    0,
  );
  const c = (await call("/api/customers/" + customerId)).data;
  assert.ok(c.facts.every((f) => f.sources.length > 0));
});
