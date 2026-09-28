import { z } from "zod";
export const rosterSchema = z.object({
  classes: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      students: z.array(z.object({ id: z.string(), name: z.string() })),
    }),
  ),
});
export type Roster = z.infer<typeof rosterSchema>;
const demo: Roster = {
  classes: [
    {
      id: "demo-5",
      name: "五年级演示班",
      students: [
        { id: "001", name: "演示学生甲" },
        { id: "002", name: "演示学生乙" },
        { id: "003", name: "演示学生丙" },
      ],
    },
  ],
};
export function createRoster(
  load: () => { data: Roster; etag: string; at: number } | null,
  save: (data: Roster, etag: string) => void,
) {
  const base = (
    process.env.CLASS_SYSTEM_URL || "https://class.alumos.cn"
  ).replace(/\/$/, "");
  const username = process.env.TEACHER_USERNAME || "Alumos";
  let pending: Promise<{ data: Roster; stale: boolean }> | null = null;
  async function sync(
    force = false,
  ): Promise<{ data: Roster; stale: boolean }> {
    if (process.env.AUTH_MODE === "demo") return { data: demo, stale: false };
    const cache = load();
    if (!force && cache && Date.now() - cache.at < 300_000)
      return { data: cache.data, stale: false };
    if (pending) return pending;
    pending = (async () => {
      try {
        if (!process.env.CLASS_SYSTEM_TOKEN)
          throw new Error("名单共享密钥尚未配置");
        const headers: Record<string, string> = {
          Accept: "application/json",
          Authorization: `Bearer ${process.env.CLASS_SYSTEM_TOKEN}`,
        };
        if (cache?.etag) headers["If-None-Match"] = cache.etag;
        const r = await fetch(
          `${base}/api/integration/classes?teacher_username=${encodeURIComponent(username)}`,
          { headers, signal: AbortSignal.timeout(10000), redirect: "error" },
        );
        if (r.status === 304 && cache) {
          save(cache.data, cache.etag);
          return { data: cache.data, stale: false };
        }
        if (!r.ok) throw new Error(`名单服务暂不可用（${r.status}）`);
        const data = rosterSchema.parse(await r.json());
        save(data, r.headers.get("etag") || "");
        return { data, stale: false };
      } catch (e) {
        if (cache) return { data: cache.data, stale: true };
        throw e;
      }
    })();
    try {
      return await pending;
    } finally {
      pending = null;
    }
  }
  async function login(user: string, password: string) {
    if (user.toLowerCase() !== username.toLowerCase()) return false;
    if (process.env.AUTH_MODE === "demo")
      return (
        !!process.env.DEMO_PASSWORD && password === process.env.DEMO_PASSWORD
      );
    const r = await fetch(`${base}/api/auth`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: user, password }),
      signal: AbortSignal.timeout(10000),
      redirect: "error",
    });
    if (r.status === 401 || r.status === 403) return false;
    if (!r.ok) throw new Error("教师认证服务暂不可用");
    const result = (await r.json()) as {
      authenticated?: boolean;
      username?: string;
    };
    return (
      result.authenticated === true &&
      result.username?.toLowerCase() === username.toLowerCase()
    );
  }
  return { sync, login, username };
}
