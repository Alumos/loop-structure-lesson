import { test } from "node:test";
import assert from "node:assert/strict";
import type { IncomingMessage } from "node:http";
import { allowedOrigin } from "../server/origin.js";
function request(headers: Record<string, string | undefined>, encrypted = false) {
  return { headers, socket: { encrypted } } as unknown as IncomingMessage;
}
test("同源 HTTPS 反代不依赖容器内协议或被改写的 Host，HTTP IP 直连同样可用", () => {
  assert.equal(
    allowedOrigin(
      request({
        host: "127.0.0.1:18763",
        origin: "https://loop.alumos.cn",
        "sec-fetch-site": "same-origin",
      }),
    ),
    true,
  );
  assert.equal(
    allowedOrigin(
      request({
        host: "203.0.113.5:18763",
        origin: "http://203.0.113.5:18763",
      }),
    ),
    true,
  );
  assert.equal(
    allowedOrigin(
      request({
        host: "loop.alumos.cn",
        origin: "https://loop.alumos.cn",
        "x-forwarded-proto": "https, http",
      }),
      { trustProxy: true },
    ),
    true,
  );
  assert.equal(
    allowedOrigin(
      request({ host: "internal:3000", origin: "https://loop.alumos.cn" }),
      { publicOrigin: "https://loop.alumos.cn/" },
    ),
    true,
  );
});
test("拒绝第三方 Origin、相邻子域、null Origin 与伪造转发头", () => {
  for (const headers of [
    { host: "loop.alumos.cn", origin: "https://evil.example" },
    {
      host: "loop.alumos.cn",
      origin: "https://class.alumos.cn",
      "sec-fetch-site": "same-site",
    },
    { host: "loop.alumos.cn", origin: "null", "sec-fetch-site": "same-origin" },
    {
      host: "internal:3000",
      origin: "https://evil.example",
      "x-forwarded-host": "evil.example",
      "x-forwarded-proto": "https",
    },
  ])
    assert.equal(allowedOrigin(request(headers)), false);
  assert.equal(
    allowedOrigin(
      request({
        host: "loop.alumos.cn",
        origin: "https://user:pass@loop.alumos.cn",
      }),
    ),
    false,
  );
});
test("WebSocket 必须有 Origin；旧浏览器可使用明确的域名或受信代理配置", () => {
  assert.equal(allowedOrigin(request({ host: "localhost:3000" })), true);
  assert.equal(
    allowedOrigin(request({ host: "localhost:3000" }), { requireOrigin: true }),
    false,
  );
  assert.equal(
    allowedOrigin(
      request({ host: "localhost:3000", origin: "https://loop.alumos.cn" }),
      { publicOrigin: "https://loop.alumos.cn", requireOrigin: true },
    ),
    true,
  );
  assert.equal(
    allowedOrigin(
      request({
        host: "loop.alumos.cn",
        origin: "https://loop.alumos.cn",
        "x-forwarded-proto": "https",
      }),
    ),
    false,
  );
});
