import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import net from "node:net";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const runtime = path.resolve(
  process.env.COMPASS_RUNTIME_DIR || path.join(root, ".runtime"),
);
const stateFile = path.join(runtime, "service.json");
const logFile = path.join(runtime, "server.log");
const lockFile = path.join(runtime, "control.lock");
const command = process.argv[2] || "status";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const alive = (pid) => {
  if (!Number.isInteger(pid) || pid < 2) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};
const readState = () => {
  try {
    return JSON.parse(fs.readFileSync(stateFile, "utf8"));
  } catch {
    return null;
  }
};
async function health(port) {
  try {
    const r = await fetch(`http://127.0.0.1:${port}/api/health`, {
      signal: AbortSignal.timeout(800),
    });
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}
const matches = (state, h) =>
  !!state &&
  h?.application === "customer-compass" &&
  h.instance === state.instance &&
  h.pid === state.pid;
async function portFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.listen(port, "127.0.0.1", () => server.close(() => resolve(true)));
  });
}
function acquire() {
  fs.mkdirSync(runtime, { recursive: true, mode: 0o700 });
  try {
    const fd = fs.openSync(lockFile, "wx", 0o600);
    fs.writeFileSync(fd, String(process.pid));
    fs.closeSync(fd);
  } catch (e) {
    if (e.code !== "EEXIST") throw e;
    const owner = Number(fs.readFileSync(lockFile, "utf8"));
    if (owner > 1 && !alive(owner)) {
      fs.rmSync(lockFile);
      return acquire();
    }
    throw new Error("另一个启动或停止操作正在进行，请稍后重试。");
  }
}
function locations(port) {
  const ips = Object.values(os.networkInterfaces())
    .flat()
    .filter(
      (x) =>
        x.family === "IPv4" &&
        !x.internal &&
        /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(x.address),
    );
  return [...new Set(ips.map((x) => `http://${x.address}:${port}`))];
}
function show(state) {
  console.log(`电脑入口：http://127.0.0.1:${state.port}`);
  if (state.host === "0.0.0.0")
    for (const url of locations(state.port))
      console.log(`同一网络手机上传：${url}/capture`);
  console.log("后台运行不依赖终端窗口。电脑重启后请再次双击启动。");
}
async function main() {
  if (!["start", "stop", "status"].includes(command))
    throw new Error("用法：node scripts/service.mjs start|stop|status");
  const state = readState();
  if (command === "status") {
    const h = state ? await health(state.port) : null;
    if (matches(state, h) && alive(state.pid)) {
      console.log("客序正在后台运行。");
      show(state);
      return;
    }
    console.log("未检测到由此启动器管理的运行实例。");
    return;
  }
  acquire();
  let child;
  try {
    const current = readState();
    const currentHealth = current ? await health(current.port) : null;
    if (command === "stop") {
      if (!current || !alive(current.pid)) {
        fs.rmSync(stateFile, { force: true });
        console.log("客序已经停止。");
        return;
      }
      if (!matches(current, currentHealth))
        throw new Error(
          "进程身份与客序记录不匹配，未停止任何进程。请检查状态。",
        );
      const database = path.join(current.dataDir, "compass.sqlite");
      if (fs.existsSync(database)) {
        const db = new DatabaseSync(database, { readOnly: true });
        let busy;
        try {
          busy = db
            .prepare(
              "SELECT count(*) n FROM visits WHERE status IN ('pending','transcribing','extracting')",
            )
            .get().n;
        } finally {
          db.close();
        }
        if (busy)
          throw new Error(
            `仍有 ${busy} 条拜访正在处理，请等待处理结束后停止。`,
          );
      }
      process.kill(current.pid, "SIGTERM");
      for (let i = 0; i < 40; i++) {
        if (!matches(current, await health(current.port))) {
          fs.rmSync(stateFile, { force: true });
          console.log("客序已停止，客户数据保留。");
          return;
        }
        await wait(100);
      }
      throw new Error("服务尚未停止，请稍后检查状态；未强制终止进程。");
    }
    if (current && alive(current.pid)) {
      if (matches(current, currentHealth)) {
        console.log("客序已在运行，无需重复启动。");
        show(current);
        return;
      }
      throw new Error(
        "已有进程记录但未能核验身份，未重复启动。请检查 .runtime/service.json 和运行日志。",
      );
    }
    if (!fs.existsSync(path.join(root, "dist", "index.html")))
      throw new Error("前端尚未构建，请先运行 npm run build。");
    const port = Number(process.env.PORT || 4380);
    if (!Number.isInteger(port) || port < 1 || port > 65535)
      throw new Error("PORT 必须是有效端口。");
    if (!(await portFree(port)))
      throw new Error(`端口 ${port} 已被占用，未修改现有进程。`);
    const host = process.env.HOST || "0.0.0.0";
    const dataDir = path.resolve(root, process.env.DATA_DIR || "data");
    const instance = crypto.randomUUID();
    if (fs.existsSync(logFile) && fs.statSync(logFile).size > 5 * 1024 * 1024) {
      fs.rmSync(logFile + ".previous", { force: true });
      fs.renameSync(logFile, logFile + ".previous");
    }
    const fd = fs.openSync(logFile, "a", 0o600);
    try {
      child = spawn(process.execPath, [path.join(root, "server", "index.js")], {
        cwd: root,
        detached: true,
        stdio: ["ignore", fd, fd],
        env: {
          ...process.env,
          PORT: String(port),
          HOST: host,
          DATA_DIR: dataDir,
          COMPASS_INSTANCE: instance,
          PUBLIC_URL:
            process.env.PUBLIC_URL ||
            (host === "0.0.0.0" ? locations(port)[0] || "" : ""),
        },
      });
    } finally {
      fs.closeSync(fd);
    }
    let spawnError;
    child.on("error", (e) => {
      spawnError = e;
    });
    child.unref();
    const next = {
      pid: child.pid,
      port,
      host,
      instance,
      dataDir,
      startedAt: new Date().toISOString(),
    };
    for (let i = 0; i < 40; i++) {
      if (spawnError) throw spawnError;
      if (matches(next, await health(port))) {
        fs.writeFileSync(stateFile, JSON.stringify(next, null, 2) + "\n", {
          mode: 0o600,
        });
        console.log("客序后台启动成功。");
        show(next);
        console.log(`运行日志：${logFile}`);
        return;
      }
      if (child.exitCode !== null) break;
      await wait(150);
    }
    throw new Error(`启动未完成，请查看日志：${logFile}`);
  } catch (e) {
    if (child && child.exitCode === null) child.kill("SIGTERM");
    throw e;
  } finally {
    fs.rmSync(lockFile, { force: true });
  }
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
