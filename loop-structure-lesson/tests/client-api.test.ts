import { test } from "node:test";
import assert from "node:assert/strict";
import { api, ApiError } from "../src/lib/api.js";

test("名单请求成功后清除超时，保留同源 Cookie", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let signal: AbortSignal;
  t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    assert.equal(url, "/api/enrollment");
    assert.equal(init.credentials, "same-origin");
    signal = init.signal!;
    return new Response(JSON.stringify({ classes: [{ id: "demo-5" }] }));
  });
  assert.deepEqual(await api("/enrollment"), { classes: [{ id: "demo-5" }] });
  t.mock.timers.tick(15000);
  assert.equal(signal!.aborted, false);
});

test("请求与读取响应体均受超时保护，并显示可理解的提示", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  for (const stage of ["request", "body"]) {
    let signal: AbortSignal;
    t.mock.method(globalThis, "fetch", (_url: string, init: RequestInit) => {
      signal = init.signal!;
      const pending = () =>
        new Promise<never>((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(new Error("aborted")), {
            once: true,
          });
        });
      return stage === "request"
        ? pending()
        : Promise.resolve({ ok: true, json: pending });
    });
    const result = api("/enrollment");
    const rejected = assert.rejects(result, /请求超时，请检查网络后重试/);
    await Promise.resolve();
    t.mock.timers.tick(15000);
    await rejected;
    assert.equal(signal!.aborted, true);
  }
});

test("接口错误保留状态码及失效标识，网络错误也清除计时器", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let signal: AbortSignal;
  t.mock.method(
    globalThis,
    "fetch",
    async (_url: string, init: RequestInit) => {
      signal = init.signal!;
      return new Response(
        JSON.stringify({ error: "请重新登录", reset: true }),
        { status: 401 },
      );
    },
  );
  await assert.rejects(
    api("/student/me"),
    (error: unknown) =>
      error instanceof ApiError && error.status === 401 && error.reset,
  );
  t.mock.timers.tick(15000);
  assert.equal(signal!.aborted, false);
  t.mock.method(
    globalThis,
    "fetch",
    async (_url: string, init: RequestInit) => {
      signal = init.signal!;
      throw new TypeError("Failed to fetch");
    },
  );
  await assert.rejects(api("/enrollment"), /Failed to fetch/);
  t.mock.timers.tick(15000);
  assert.equal(signal!.aborted, false);
});
