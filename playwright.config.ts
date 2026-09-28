import { defineConfig } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
export default defineConfig({
  testDir: "tests/browser",
  workers: 1,
  timeout: 90000,
  use: {
    actionTimeout: 12000,
    baseURL: "http://127.0.0.1:19342",
    viewport: { width: 1440, height: 1050 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "node dist/server.js",
    url: "http://127.0.0.1:19342/api/health",
    reuseExistingServer: false,
    env: {
      PORT: "19342",
      DATA_DIR: mkdtempSync(join(tmpdir(), "moon-e2e-")),
      AUTH_MODE: "demo",
      DEMO_PASSWORD: "browser-test-password",
      TEACHER_USERNAME: "Alumos",
    },
    timeout: 30000,
  },
});
