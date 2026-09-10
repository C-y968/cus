import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import fs from "node:fs";
import { createInterface } from "node:readline/promises";
const file = path.resolve(process.env.DATA_DIR || "./data", "compass.sqlite");
if (!fs.existsSync(file)) {
  console.error("没有现有数据库");
  process.exit(1);
}
const rl = createInterface({ input: process.stdin, output: process.stdout });
const answer = await rl.question(
  "请先停止服务。只重置密码与登录会话，保留客户资料。确认输入 reset：",
);
rl.close();
if (answer.trim() !== "reset") {
  console.log("未执行重置");
  process.exit(0);
}
const db = new DatabaseSync(file);
db.exec(
  "BEGIN IMMEDIATE; DELETE FROM kv WHERE key='password'; DELETE FROM sessions; COMMIT;",
);
db.close();
console.log("密码已重置。重启后在本机重新设置。");
