export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public reset = false,
  ) {
    super(message);
  }
}
export async function api<T = any>(
  path: string,
  body?: unknown,
  method?: string,
): Promise<T> {
  // Older classroom browsers support AbortController but not AbortSignal.timeout.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const r = await fetch("/api" + path, {
      method: method || (body === undefined ? "GET" : "POST"),
      headers: body === undefined ? {} : { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    const value = await r.json().catch(() => ({ error: "服务未返回有效数据" }));
    if (controller.signal.aborted)
      throw new Error("请求超时，请检查网络后重试");
    if (!r.ok)
      throw new ApiError(value.error || "请求失败", r.status, value.reset);
    return value;
  } catch (error) {
    if (controller.signal.aborted)
      throw new Error("请求超时，请检查网络后重试");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
export function connect(
  role: "student" | "teacher",
  receive: (v: any) => void,
  status?: (online: boolean) => void,
) {
  let closed = false,
    timer: ReturnType<typeof setTimeout>,
    ws: WebSocket,
    delay = 1000;
  function start() {
    ws = new WebSocket(
      `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws?role=${role}`,
    );
    ws.onopen = () => {
      delay = 1000;
      status?.(true);
    };
    ws.onmessage = (e) => {
      try {
        receive(JSON.parse(e.data));
      } catch {
        /* Ignore malformed notification. */
      }
    };
    ws.onclose = () => {
      status?.(false);
      if (!closed) {
        timer = setTimeout(start, delay);
        delay = Math.min(delay * 2, 15000);
      }
    };
    ws.onerror = () => ws.close();
  }
  start();
  return () => {
    closed = true;
    clearTimeout(timer);
    ws?.close();
  };
}
