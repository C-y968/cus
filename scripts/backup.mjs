import fs from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline/promises";
const rl = createInterface({ input: process.stdin, output: process.stdout });
const answer = await rl.question(
  "请先停止客序服务。已停止并开始完整备份？输入 yes：",
);
rl.close();
if (answer.trim() !== "yes") {
  console.log("未执行备份。");
  process.exit(0);
}
const source = path.resolve(process.env.DATA_DIR || "./data");
if (!fs.existsSync(source)) {
  console.error("数据目录不存在");
  process.exit(1);
}
const target = path.resolve(
  "backups",
  new Date().toISOString().replaceAll(":", "-"),
);
fs.mkdirSync(target, { recursive: true, mode: 0o700 });
try {
  fs.cpSync(source, target, {
    recursive: true,
    errorOnExist: true,
    force: false,
  });
  console.log("完整备份已保存：" + target);
} catch (e) {
  console.error("备份未完成：" + e.message);
  process.exit(1);
}
