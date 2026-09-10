import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "compass-ui-"));
const child = spawn(process.execPath, ["server/index.js"], {
  stdio: "inherit",
  env: { ...process.env, DATA_DIR: dir, PORT: "4389", HOST: "127.0.0.1" },
});
function clean() {
  child.kill();
  setTimeout(() => {
    fs.rmSync(dir, { recursive: true, force: true });
    process.exit();
  }, 100);
}
process.on("SIGTERM", clean);
process.on("SIGINT", clean);
child.on("exit", () => {
  fs.rmSync(dir, { recursive: true, force: true });
  process.exit();
});
