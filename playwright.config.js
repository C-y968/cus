import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  testMatch: "ui.spec.js",
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  use: {
    baseURL: "http://127.0.0.1:4389",
    headless: true,
    channel: "chrome",
    viewport: { width: 1440, height: 1000 },
    launchOptions: {
      args: [
        "--use-fake-ui-for-media-stream",
        "--use-fake-device-for-media-stream",
      ],
    },
    permissions: ["microphone"],
    trace: "retain-on-failure",
  },
  webServer: {
    command: "node tests/e2e-server.js",
    url: "http://127.0.0.1:4389/api/health",
    reuseExistingServer: false,
    timeout: 20000,
  },
  reporter: "list",
});
