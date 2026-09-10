import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { DatabaseSync } from "node:sqlite";
const exec = promisify(execFile);
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "compass-service-test-"));
const runtime = path.join(temp, "runtime"),
  dataDir = path.join(temp, "data");
const stateFile = path.join(runtime, "service.json");
const owned = new Set();
let port, state;
let env;
async function run(command, extra = {}) {
  return exec(process.execPath, ["scripts/service.mjs", command], {
    cwd: path.resolve("."),
    env: { ...env, ...extra },
    timeout: 12000,
  });
}
async function health() {
  return (await fetch(`http://127.0.0.1:${port}/api/health`)).json();
}
before(async () => {
  const s = net.createServer();
  await new Promise((r) => s.listen(0, "127.0.0.1", r));
  port = s.address().port;
  await new Promise((r) => s.close(r));
  env = {
    ...process.env,
    PORT: String(port),
    HOST: "127.0.0.1",
    DATA_DIR: dataDir,
    COMPASS_RUNTIME_DIR: runtime,
  };
});
after(() => {
  for (const pid of owned) {
    try {
      process.kill(pid, "SIGTERM");
    } catch {}
  }
  fs.rmSync(temp, { recursive: true, force: true });
});
test("启动命令退出后后台仍可访问，重复启动不产生第二个实例", async () => {
  const first = await run("start");
  assert.match(first.stdout, /启动成功/);
  state = JSON.parse(fs.readFileSync(stateFile));
  owned.add(state.pid);
  assert.equal((await health()).instance, state.instance);
  const second = await run("start");
  assert.match(second.stdout, /已在运行/);
  assert.equal(JSON.parse(fs.readFileSync(stateFile)).pid, state.pid);
  assert.match((await run("status")).stdout, /正在后台运行/);
});
test("身份不匹配或仍有处理任务时拒绝停止，数据不受影响", async () => {
  fs.writeFileSync(
    stateFile,
    JSON.stringify({ ...state, instance: "mismatched" }),
  );
  await assert.rejects(run("stop"), (e) => e.stderr.includes("身份"));
  assert.equal((await health()).pid, state.pid);
  fs.writeFileSync(stateFile, JSON.stringify(state));
  const db = new DatabaseSync(path.join(dataDir, "compass.sqlite"));
  db.exec(
    "PRAGMA foreign_keys=ON; INSERT INTO companies VALUES ('co','Lifecycle test'); INSERT INTO departments VALUES ('dep','co','Test'); INSERT INTO customers VALUES ('c','dep','Test person','','','','2026-09-07'); INSERT INTO visits (id,customer_id,title,happened_at,created_at,status) VALUES ('v','c','Test','2026-09-07','2026-09-07','pending');",
  );
  await assert.rejects(run("stop"), (e) => e.stderr.includes("正在处理"));
  assert.equal((await health()).pid, state.pid);
  db.prepare(
    "UPDATE visits SET status='waiting_transcription' WHERE id='v'",
  ).run();
  db.close();
  assert.match((await run("stop")).stdout, /已停止/);
  assert.ok(!fs.existsSync(stateFile));
  const check = new DatabaseSync(path.join(dataDir, "compass.sqlite"), {
    readOnly: true,
  });
  assert.equal(check.prepare("SELECT COUNT(*) n FROM customers").get().n, 1);
  check.close();
  assert.match((await run("stop")).stdout, /已经停止/);
});
test("清理失效记录后可重启，端口被其他程序占用时不干预该程序", async () => {
  fs.writeFileSync(stateFile, JSON.stringify({ ...state, pid: 2147483646 }));
  assert.match((await run("start")).stdout, /启动成功/);
  state = JSON.parse(fs.readFileSync(stateFile));
  owned.add(state.pid);
  assert.equal((await health()).instance, state.instance);
  await run("stop");
  const other = net.createServer((socket) => socket.end());
  await new Promise((r) => other.listen(port, "127.0.0.1", r));
  try {
    await assert.rejects(run("start"), (e) => e.stderr.includes("已被占用"));
    assert.equal(other.listening, true);
    assert.ok(!fs.existsSync(stateFile));
  } finally {
    await new Promise((r) => other.close(r));
  }
});
