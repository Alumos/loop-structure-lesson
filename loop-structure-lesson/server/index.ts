import { allowedOrigin } from "./origin.js";
import {
  compactSnapshot,
  restoreSnapshot,
  keepHistory,
} from "../shared/records.js";
import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { createServer } from "node:http";
import { DatabaseSync } from "node:sqlite";
import { randomBytes, createHash } from "node:crypto";
import { mkdirSync, existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { WebSocketServer, WebSocket } from "ws";
import { z } from "zod";
import { createRoster, type Roster } from "./roster.js";
import {
  simulate,
  validateFlow,
  gradeQuiz,
  levels,
  type Snapshot,
} from "../shared/engine.js";

const dir = resolve(process.env.DATA_DIR || "data");
mkdirSync(dir, { recursive: true, mode: 0o700 });
const dbFile = resolve(dir, "classroom.sqlite");
const db = new DatabaseSync(dbFile);
db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA secure_delete=ON;
 CREATE TABLE IF NOT EXISTS cache (id INTEGER PRIMARY KEY, data TEXT NOT NULL, etag TEXT NOT NULL, at INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS classrooms (id TEXT PRIMARY KEY, class_id TEXT NOT NULL, name TEXT NOT NULL, created_at INTEGER NOT NULL, active INTEGER NOT NULL DEFAULT 1, settings TEXT NOT NULL DEFAULT '{"quizOpen":false,"answersOpen":false,"openLevel":"all"}');
 CREATE TABLE IF NOT EXISTS participants (id TEXT PRIMARY KEY, classroom_id TEXT NOT NULL REFERENCES classrooms(id), members TEXT NOT NULL, state TEXT, joined_at INTEGER NOT NULL, last_seen INTEGER NOT NULL, needs_help INTEGER NOT NULL DEFAULT 0);
 CREATE TABLE IF NOT EXISTS drafts (participant_id TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE, activity TEXT NOT NULL, snapshot TEXT NOT NULL, PRIMARY KEY(participant_id,activity));
 CREATE TABLE IF NOT EXISTS sessions (hash TEXT PRIMARY KEY, role TEXT NOT NULL, entity TEXT NOT NULL, expires INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS events (seq INTEGER PRIMARY KEY AUTOINCREMENT, event_id TEXT NOT NULL, participant_id TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE, at INTEGER NOT NULL, client_at INTEGER NOT NULL, kind TEXT NOT NULL, label TEXT NOT NULL, snapshot TEXT NOT NULL, UNIQUE(participant_id,event_id));
 CREATE TABLE IF NOT EXISTS attempts (id TEXT PRIMARY KEY, participant_id TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE, level TEXT NOT NULL, at INTEGER NOT NULL, plan TEXT NOT NULL, prediction TEXT NOT NULL, win INTEGER NOT NULL, reason TEXT NOT NULL, assisted INTEGER NOT NULL DEFAULT 0);
 CREATE TABLE IF NOT EXISTS answers (id TEXT PRIMARY KEY, participant_id TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE, student_id TEXT NOT NULL, question TEXT NOT NULL, at INTEGER NOT NULL, answers TEXT NOT NULL, note TEXT NOT NULL, score INTEGER NOT NULL, UNIQUE(participant_id,student_id,question));
 CREATE TABLE IF NOT EXISTS reviews (participant_id TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE, student_id TEXT NOT NULL, score INTEGER NOT NULL, note TEXT NOT NULL, PRIMARY KEY(participant_id,student_id));
 CREATE INDEX IF NOT EXISTS events_participant ON events(participant_id,seq);
 CREATE INDEX IF NOT EXISTS events_time ON events(at);
 CREATE INDEX IF NOT EXISTS participants_classroom ON participants(classroom_id);
 CREATE INDEX IF NOT EXISTS attempts_participant ON attempts(participant_id,at);
`);
const stmt = (sql: string) => db.prepare(sql);
const parse = (v: any, fallback: any = null) => (v ? JSON.parse(v) : fallback);
const uid = () => randomBytes(16).toString("hex");
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const roster = createRoster(
  () => {
    const row = stmt("SELECT * FROM cache WHERE id=1").get() as any;
    return row
      ? { data: parse(row.data) as Roster, etag: row.etag, at: row.at }
      : null;
  },
  (data, etag) => {
    stmt("INSERT OR REPLACE INTO cache VALUES(1,?,?,?)").run(
      JSON.stringify(data),
      etag,
      Date.now(),
    );
  },
);
const app = express();
app.disable("x-powered-by");
if (process.env.TRUST_PROXY === "1") app.set("trust proxy", 1);
app.use(express.json({ limit: "768kb" }));
const originOptions = () => ({
  publicOrigin: process.env.PUBLIC_ORIGIN,
  trustProxy: process.env.TRUST_PROXY === "1",
});
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "same-origin");
  res.setHeader("X-Frame-Options", "DENY");
  if (req.path.startsWith("/api")) res.setHeader("Cache-Control", "no-store");
  if (
    !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
    !allowedOrigin(req, originOptions())
  ) {
    return res
      .status(403)
      .json({
        error:
          "来源校验失败，请通过本站页面操作；若使用反向代理，请检查 PUBLIC_ORIGIN 配置",
        code: "ORIGIN_MISMATCH",
      });
  }
  next();
});
const limits = new Map<string, { count: number; until: number }>();
function rate(req: Request, res: Response, next: NextFunction) {
  const key = `${req.ip}:${req.path}`,
    now = Date.now(),
    record = limits.get(key);
  if (!record || record.until < now)
    limits.set(key, { count: 1, until: now + 60_000 });
  else if (++record.count > (req.path === "/api/student/join" ? 240 : 20))
    return res.status(429).json({ error: "请求过于频繁，请稍后再试" });
  next();
}
function cookie(req: { headers: { cookie?: string } }, name: string) {
  return (
    (req.headers.cookie || "")
      .split(";")
      .map((s) => s.trim())
      .find((s) => s.startsWith(name + "="))
      ?.slice(name.length + 1) || ""
  );
}
function session(
  req: { headers: { cookie?: string } },
  role: "teacher" | "student",
) {
  const token = cookie(req, `moon_${role}`);
  if (!token) return null;
  return stmt(
    "SELECT * FROM sessions WHERE hash=? AND role=? AND expires>?",
  ).get(sha(token), role, Date.now()) as
    { hash: string; role: string; entity: string; expires: number } | undefined;
}
function requireRole(role: "teacher" | "student") {
  return (req: Request, res: Response, next: NextFunction) => {
    const s = session(req, role);
    if (!s)
      return res
        .status(401)
        .json({ error: "请重新登录", reset: role === "student" });
    res.locals.session = s;
    next();
  };
}
function setSession(
  res: Response,
  role: "teacher" | "student",
  entity: string,
) {
  const token = uid() + uid(),
    expires = Date.now() + 12 * 3600_000;
  stmt("INSERT INTO sessions VALUES(?,?,?,?)").run(
    sha(token),
    role,
    entity,
    expires,
  );
  res.cookie(`moon_${role}`, token, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.COOKIE_SECURE === "true",
    path: "/",
    maxAge: 12 * 3600_000,
  });
}
function classroom(id: string) {
  const c = stmt("SELECT * FROM classrooms WHERE id=?").get(id) as any;
  return c ? { ...c, settings: parse(c.settings) } : null;
}
function participant(id: string) {
  const p = stmt("SELECT * FROM participants WHERE id=?").get(id) as any;
  return p ? { ...p, members: parse(p.members), state: parse(p.state) } : null;
}
function requireParticipant(req: Request, res: Response, next: NextFunction) {
  const p = participant(res.locals.session.entity);
  if (!p)
    return res
      .status(401)
      .json({ error: "练习记录已清理，请重新选择姓名", reset: true });
  res.locals.participant = p;
  res.locals.classroom = classroom(p.classroom_id);
  next();
}
function writable(req: Request, res: Response, next: NextFunction) {
  if (!res.locals.classroom?.active)
    return res.status(409).json({ error: "课堂已经结束" });
  next();
}
const http = createServer(app);
const wss = new WebSocketServer({ noServer: true, maxPayload: 2048 });
const sockets = new Map<
  WebSocket,
  { role: string; entity: string; hash: string; expires: number }
>();
function broadcast(type: string, data: any, studentClass?: string) {
  for (const [ws, s] of sockets) {
    if (ws.readyState !== WebSocket.OPEN) continue;
    if (
      s.role === "teacher" ||
      (studentClass && participant(s.entity)?.classroom_id === studentClass)
    )
      ws.send(JSON.stringify({ type, data }));
  }
}
http.on("upgrade", (req, socket, head) => {
  if (req.url?.split("?")[0] !== "/ws") {
    socket.destroy();
    return;
  }
  if (!allowedOrigin(req, { ...originOptions(), requireOrigin: true })) {
    socket.write("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
    socket.destroy();
    return;
  }
  const role =
    new URL(req.url, "http://local").searchParams.get("role") === "teacher"
      ? "teacher"
      : "student";
  const s = session(req, role);
  if (!s || (role === "student" && !participant(s.entity))) {
    socket.destroy();
    return;
  }
  if ([...sockets.values()].filter((v) => v.hash === s.hash).length >= 4) {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => {
    sockets.set(ws, s);
    ws.send(JSON.stringify({ type: "connected" }));
    ws.on("close", () => sockets.delete(ws));
    ws.on("error", () => sockets.delete(ws));
  });
});
const teacher = requireRole("teacher");
const student = [requireRole("student"), requireParticipant];
app.get("/api/health", (_req, res) => {
  stmt("SELECT 1").get();
  res.json({ ok: true });
});
app.post("/api/teacher/login", rate, async (req, res) => {
  const b = z
    .object({
      username: z.string().min(1).max(100),
      password: z.string().min(1).max(300),
    })
    .parse(req.body);
  if (!(await roster.login(b.username, b.password)))
    return res.status(401).json({ error: "账号或密码不正确" });
  const old = session(req, "teacher");
  if (old) stmt("DELETE FROM sessions WHERE hash=?").run(old.hash);
  setSession(res, "teacher", roster.username);
  res.json({ username: roster.username });
});
app.get("/api/teacher/me", teacher, (_req, res) =>
  res.json({ username: res.locals.session.entity }),
);
app.post("/api/:role/logout", (req, res) => {
  const role = req.params.role === "teacher" ? "teacher" : "student",
    s = session(req, role);
  if (s) {
    stmt("DELETE FROM sessions WHERE hash=?").run(s.hash);
    for (const [ws, v] of sockets) if (v.hash === s.hash) ws.close();
  }
  res.clearCookie(`moon_${role}`, { path: "/" });
  res.json({ ok: true });
});
app.get("/api/teacher/roster", teacher, async (_req, res) =>
  res.json(await roster.sync()),
);
app.post("/api/teacher/roster/sync", teacher, async (_req, res) =>
  res.json(await roster.sync(true)),
);
app.get("/api/enrollment", async (_req, res) => {
  const { data, stale } = await roster.sync();
  const rooms = stmt(
    "SELECT * FROM classrooms WHERE active=1 ORDER BY created_at DESC",
  ).all() as any[];
  res.json({
    stale,
    classes: data.classes
      .filter((c) => rooms.some((r) => r.class_id === c.id))
      .map((c) => ({
        id: c.id,
        name: c.name,
        students: c.students,
        rooms: rooms
          .filter((r) => r.class_id === c.id)
          .map((r) => ({ id: r.id, name: r.name })),
      })),
  });
});
app.post("/api/student/join", rate, async (req, res) => {
  const b = z
      .object({
        classroomId: z.string(),
        studentIds: z.array(z.string()).min(1).max(2),
      })
      .parse(req.body),
    c = classroom(b.classroomId);
  if (!c?.active) return res.status(400).json({ error: "请等待教师开启课堂" });
  const { data } = await roster.sync(),
    cl = data.classes.find((v) => v.id === c.class_id);
  const ids = [...new Set(b.studentIds)];
  const members = ids.map((id) => cl?.students.find((s) => s.id === id));
  if (members.some((m) => !m))
    return res.status(400).json({ error: "学生不属于该班级，请重新选择" });
  const existing = stmt("SELECT * FROM participants WHERE classroom_id=?").all(
    c.id,
  ) as any[];
  let p = existing.find((p) => {
    const m = parse(p.members) as any[];
    return (
      m.length === ids.length && ids.every((id) => m.some((v) => v.id === id))
    );
  });
  if (
    existing.some(
      (v) =>
        v.id !== p?.id &&
        (parse(v.members) as any[]).some((m) => ids.includes(m.id)),
    )
  )
    return res.status(409).json({
      error: "该学生已经加入另一小组，请选择原来的小组成员，或请教师清理原记录",
    });
  if (!p) {
    const id = uid(),
      now = Date.now();
    stmt(
      "INSERT INTO participants(id,classroom_id,members,joined_at,last_seen) VALUES(?,?,?,?,?)",
    ).run(id, c.id, JSON.stringify(members), now, now);
    p = { id };
  }
  // A fresh selection replaces the old device session for this group.
  stmt("DELETE FROM sessions WHERE role='student' AND entity=?").run(p.id);
  for (const [ws, v] of sockets)
    if (v.role === "student" && v.entity === p.id) {
      ws.send(JSON.stringify({ type: "replaced" }));
      ws.close();
    }
  setSession(res, "student", p.id);
  broadcast("refresh", { classroomId: c.id });
  res.json({ participant: participant(p.id), classroom: c });
});
function studentData(p: any, c: any) {
  const drafts = Object.fromEntries(
    (
      stmt("SELECT activity,snapshot FROM drafts WHERE participant_id=?").all(
        p.id,
      ) as any[]
    ).map((d) => [d.activity, parse(d.snapshot)]),
  );
  const answers = stmt(
    "SELECT student_id,question FROM answers WHERE participant_id=?",
  ).all(p.id);
  return {
    participant: p,
    classroom: c,
    drafts,
    attempts: stmt("SELECT * FROM attempts WHERE participant_id=? ORDER BY at")
      .all(p.id)
      .map((v: any) => ({ ...v, plan: parse(v.plan) })),
    submitted: answers,
  };
}
app.get("/api/student/me", ...student, (_req, res) =>
  res.json(studentData(res.locals.participant, res.locals.classroom)),
);
const planSchema = z.object({
  timing: z.enum(["pre", "post"]),
  condition: z.string().max(30),
  body: z.array(z.string().max(20)).max(8),
  nodes: z
    .array(
      z.object({
        id: z.string().max(80),
        kind: z.enum(["start", "end", "action", "decision"]),
        block: z.string().max(30).optional(),
        role: z
          .enum(["loop-condition", "body-condition", "branch-action"])
          .optional(),
        condition: z.string().max(30).optional(),
      }),
    )
    .max(30)
    .optional(),
  edges: z
    .array(
      z.object({
        id: z.string().max(100),
        from: z.string().max(80),
        to: z.string().max(80),
        label: z.enum(["yes", "no"]).optional(),
        kind: z.enum(["normal", "return"]).optional(),
      }),
    )
    .max(50)
    .optional(),
});
const frameSchema = z.object({
  x: z.number().int().min(-1).max(20),
  y: z.number().int().min(-1).max(20),
  d: z.number().int().min(0).max(3),
  rounds: z.number().int().min(0).max(61),
  steps: z.number().int().min(0).max(500),
  moves: z.number().int().min(0).max(500),
  turns: z.number().int().min(0).max(500),
  scans: z.number().int().min(0).max(500),
  pulses: z.number().int().min(0).max(500),
  battery: z.number().int().min(0).max(100),
  scanResult: z.boolean().nullable(),
  visited: z.array(z.string().max(10)).max(50),
  scanned: z.array(z.number()).max(20),
  active: z.union([z.number(), z.literal("condition")]).nullable(),
  nodeId: z.string().max(80).optional(),
  edgeId: z.string().max(100).optional(),
  text: z.string().max(500),
});
const snapshotSchema = z.object({
  activity: z.enum([
    "l1",
    "l2",
    "l3",
    "l4",
    "q1",
    "q2",
    "q3",
    "challenge",
    "review",
  ]),
  plan: planSchema.optional(),
  frame: frameSchema.optional(),
  prediction: z.string().max(150).optional(),
  explanation: z.string().max(1000).optional(),
  running: z.boolean().optional(),
  result: z.string().max(500).optional(),
  answers: z.array(z.number().int().min(-1).max(3)).max(2).optional(),
  note: z.string().max(1000).optional(),
  selectedStudent: z.string().max(100).optional(),
  pointer: z
    .object({
      x: z.number().min(0).max(1),
      y: z.number().min(0).max(1),
      kind: z.string().max(20),
    })
    .optional(),
  hint: z.boolean().optional(),
  operator: z.string().max(100).optional(),
  challenge: z
    .object({
      timing: z.enum(["pre", "post"]),
      initial: z.number().int().min(0).max(100),
    })
    .optional(),
  selfReview: z.array(z.boolean()).max(4).optional(),
});
const eventSchema = z.object({
  id: z.string().uuid(),
  at: z.number().int(),
  kind: z.enum([
    "navigate",
    "edit",
    "predict",
    "run",
    "step",
    "result",
    "pointer",
    "hint",
    "explain",
    "answer",
    "submit",
    "operator",
    "selfReview",
    "help",
  ]),
  label: z.string().max(200),
  snapshot: snapshotSchema,
});
app.post("/api/student/live", ...student, writable, (req, res) => {
  const b = z
    .object({ snapshot: snapshotSchema, label: z.string().max(200) })
    .parse(req.body);
  const p = res.locals.participant;
  broadcast("state", {
    id: p.id,
    classroomId: p.classroom_id,
    state: b.snapshot,
    last_seen: Date.now(),
    label: b.label,
  });
  res.json({ ok: true });
});
app.post("/api/student/events", ...student, writable, (req, res) => {
  const { events } = z
      .object({ events: z.array(eventSchema).min(1).max(100) })
      .parse(req.body),
    p = res.locals.participant;
  let latest: any = null;
  const now = Date.now();
  db.exec("BEGIN");
  try {
    const insert = stmt(
      "INSERT OR IGNORE INTO events(event_id,participant_id,at,client_at,kind,label,snapshot) VALUES(?,?,?,?,?,?,?)",
    );
    for (const e of events) {
      // Discard legacy queued mouse/animation events as well.
      if (e.kind === "pointer" || e.kind === "step") continue;
      if (
        stmt("SELECT 1 FROM events WHERE participant_id=? AND event_id=?").get(
          p.id,
          e.id,
        )
      )
        continue;
      const snapshot = compactSnapshot(e.snapshot);
      const previous = parse(
        (
          stmt(
            "SELECT snapshot FROM drafts WHERE participant_id=? AND activity=?",
          ).get(p.id, snapshot.activity) as any
        )?.snapshot,
      );
      if (keepHistory(e.kind, snapshot, previous)) {
        insert.run(
          e.id,
          p.id,
          now,
          e.at,
          e.kind,
          e.label,
          JSON.stringify(snapshot),
        );
      }
      latest = { ...e, snapshot };
      if (e.kind === "help")
        stmt("UPDATE participants SET needs_help=1 WHERE id=?").run(p.id);
      stmt("INSERT OR REPLACE INTO drafts VALUES(?,?,?)").run(
        p.id,
        snapshot.activity,
        JSON.stringify(snapshot),
      );
    }
    if (latest)
      stmt("UPDATE participants SET state=?,last_seen=? WHERE id=?").run(
        JSON.stringify(latest.snapshot),
        now,
        p.id,
      );
    stmt(
      "DELETE FROM events WHERE participant_id=? AND seq NOT IN (SELECT seq FROM events WHERE participant_id=? ORDER BY seq DESC LIMIT ?)",
    ).run(p.id, p.id, maxEvents);
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
  if (latest)
    broadcast("state", {
      id: p.id,
      classroomId: p.classroom_id,
      state: restoreSnapshot(latest.snapshot),
      last_seen: now,
      label: latest.label,
    });
  res.json({ ack: events.map((e) => e.id) });
});
app.post("/api/student/heartbeat", ...student, (_req, res) => {
  stmt("UPDATE participants SET last_seen=? WHERE id=?").run(
    Date.now(),
    res.locals.participant.id,
  );
  res.json({ classroom: res.locals.classroom });
});
app.post("/api/student/attempts", ...student, writable, (req, res) => {
  const b = z
      .object({
        id: z.string().uuid(),
        level: z.string(),
        plan: planSchema,
        prediction: z.string().min(1).max(150),
        assisted: z.boolean(),
      })
      .parse(req.body),
    p = res.locals.participant,
    c = res.locals.classroom;
  if (c.settings.openLevel !== "all" && c.settings.openLevel !== b.level)
    return res.status(403).json({ error: "教师尚未开放此关卡" });
  const level = levels.find((l) => l.id === b.level);
  if (!level) return res.status(400).json({ error: "未知关卡" });
  const check = validateFlow(level, b.plan);
  if (!check.valid)
    return res
      .status(400)
      .json({ error: check.errors[0], issues: check.issues });
  b.plan.body = check.body;
  const result = simulate(b.level, b.plan);
  stmt("INSERT OR IGNORE INTO attempts VALUES(?,?,?,?,?,?,?,?,?)").run(
    b.id,
    p.id,
    b.level,
    Date.now(),
    JSON.stringify(b.plan),
    b.prediction,
    Number(result.win),
    result.reason,
    Number(b.assisted),
  );
  broadcast("refresh", { classroomId: c.id });
  res.json({ win: result.win, reason: result.reason });
});
app.post("/api/student/answers", ...student, writable, (req, res) => {
  const b = z
      .object({
        id: z.string().uuid(),
        studentId: z.string(),
        question: z.enum(["q1", "q2", "q3"]),
        answers: z.array(z.number().int().min(0).max(2)).length(2),
        note: z.string().max(1000),
      })
      .parse(req.body),
    p = res.locals.participant,
    c = res.locals.classroom;
  if (!c.settings.quizOpen || c.settings.answersOpen)
    return res.status(403).json({ error: "验收未开放或已进入讲评" });
  if (!p.members.some((m: any) => m.id === b.studentId))
    return res.status(403).json({ error: "只能提交本组成员的答案" });
  const score = gradeQuiz(b.question, b.answers);
  stmt("INSERT OR IGNORE INTO answers VALUES(?,?,?,?,?,?,?,?)").run(
    b.id,
    p.id,
    b.studentId,
    b.question,
    Date.now(),
    JSON.stringify(b.answers),
    b.note,
    score,
  );
  broadcast("refresh", { classroomId: c.id });
  res.json({ submitted: true });
});
app.get("/api/student/results", ...student, (_req, res) => {
  const c = res.locals.classroom;
  if (!c.settings.answersOpen)
    return res.status(403).json({ error: "教师尚未公布答案" });
  res.json({
    answers: stmt("SELECT * FROM answers WHERE participant_id=?").all(
      res.locals.participant.id,
    ),
    reviews: stmt("SELECT * FROM reviews WHERE participant_id=?").all(
      res.locals.participant.id,
    ),
  });
});
app.get("/api/teacher/classrooms", teacher, (_req, res) =>
  res.json(
    stmt("SELECT * FROM classrooms ORDER BY created_at DESC")
      .all()
      .map((c: any) => ({ ...c, settings: parse(c.settings) })),
  ),
);
app.post("/api/teacher/classrooms", teacher, async (req, res) => {
  const b = z
      .object({ classId: z.string(), name: z.string().trim().min(1).max(80) })
      .parse(req.body),
    { data } = await roster.sync();
  if (!data.classes.some((c) => c.id === b.classId))
    return res.status(400).json({ error: "请选择名单中的班级" });
  const id = uid();
  stmt(
    "INSERT INTO classrooms(id,class_id,name,created_at) VALUES(?,?,?,?)",
  ).run(id, b.classId, b.name, Date.now());
  broadcast("refresh", {});
  res.json(classroom(id));
});
app.patch("/api/teacher/classrooms/:id", teacher, (req, res) => {
  const c = classroom(req.params.id as string);
  if (!c) return res.status(404).json({ error: "课堂不存在" });
  const b = z
    .object({
      active: z.boolean().optional(),
      settings: z
        .object({
          quizOpen: z.boolean(),
          answersOpen: z.boolean(),
          openLevel: z.enum(["all", "l1", "l2", "l3", "l4"]),
        })
        .optional(),
    })
    .parse(req.body);
  stmt("UPDATE classrooms SET active=?,settings=? WHERE id=?").run(
    b.active === undefined ? c.active : Number(b.active),
    JSON.stringify(b.settings || c.settings),
    c.id,
  );
  broadcast("classroom", classroom(c.id), c.id);
  res.json(classroom(c.id));
});
function summary(classroomId: string) {
  return (
    stmt(
      "SELECT * FROM participants WHERE classroom_id=? ORDER BY joined_at",
    ).all(classroomId) as any[]
  ).map((p) => ({
    ...p,
    members: parse(p.members),
    state: parse(p.state),
    attempts: stmt(
      "SELECT level,count(*) AS count,max(win) AS passed,sum(assisted) AS assisted FROM attempts WHERE participant_id=? GROUP BY level",
    ).all(p.id),
    answers: stmt(
      "SELECT student_id,question,score FROM answers WHERE participant_id=?",
    ).all(p.id),
    reviews: stmt(
      "SELECT student_id,score,note FROM reviews WHERE participant_id=?",
    ).all(p.id),
  }));
}
app.get("/api/teacher/classrooms/:id/summary", teacher, (req, res) =>
  res.json(summary(req.params.id as string)),
);
app.get("/api/teacher/participants/:id", teacher, (req, res) => {
  const p = participant(req.params.id as string);
  if (!p) return res.status(404).json({ error: "学生记录不存在或已清理" });
  res.json({
    ...p,
    predictions: (
      stmt("SELECT activity,snapshot FROM drafts WHERE participant_id=?").all(
        p.id,
      ) as any[]
    )
      .filter((d) => d.activity.startsWith("l"))
      .map((d) => ({
        level: d.activity,
        prediction: parse(d.snapshot)?.prediction || "",
      })),
    attempts: stmt("SELECT * FROM attempts WHERE participant_id=? ORDER BY at")
      .all(p.id)
      .map((v: any) => ({ ...v, plan: parse(v.plan) })),
    answers: stmt("SELECT * FROM answers WHERE participant_id=?")
      .all(p.id)
      .map((v: any) => ({ ...v, answers: parse(v.answers) })),
    reviews: stmt("SELECT * FROM reviews WHERE participant_id=?").all(p.id),
  });
});
app.post("/api/teacher/participants/:id/ack-help", teacher, (req, res) => {
  stmt("UPDATE participants SET needs_help=0 WHERE id=?").run(
    req.params.id as string,
  );
  broadcast("refresh", {});
  res.json({ ok: true });
});
app.get("/api/teacher/participants/:id/events", teacher, (req, res) => {
  const before = Number(req.query.before) || Number.MAX_SAFE_INTEGER;
  const rows = stmt(
    "SELECT * FROM events WHERE participant_id=? AND seq<? ORDER BY seq DESC LIMIT 300",
  ).all(req.params.id as string, before) as any[];
  res.json({
    events: rows.reverse().map((e) => ({ ...e, snapshot: parse(e.snapshot) })),
    hasMore: rows.length === 300,
  });
});
app.put("/api/teacher/participants/:id/review", teacher, (req, res) => {
  const b = z
      .object({
        studentId: z.string(),
        score: z.number().int().min(0).max(4),
        note: z.string().max(1000),
      })
      .parse(req.body),
    p = participant(req.params.id as string);
  if (!p?.members.some((m: any) => m.id === b.studentId))
    return res.status(400).json({ error: "学生不属于该组" });
  stmt("INSERT OR REPLACE INTO reviews VALUES(?,?,?,?)").run(
    p.id,
    b.studentId,
    b.score,
    b.note,
  );
  broadcast("refresh", { classroomId: p.classroom_id });
  res.json({ ok: true });
});
app.get("/api/teacher/classrooms/:id/export", teacher, (req, res) => {
  const c = classroom(req.params.id as string);
  if (!c) return res.sendStatus(404);
  const ps = summary(c.id);
  res.setHeader(
    "Content-Disposition",
    'attachment; filename="classroom-records.json"',
  );
  res.json({
    classroom: c,
    exportedAt: new Date().toISOString(),
    participants: ps.map((p) => ({
      ...p,
      attempts: stmt("SELECT * FROM attempts WHERE participant_id=?")
        .all(p.id)
        .map((v: any) => ({ ...v, plan: parse(v.plan) })),
      answers: stmt("SELECT * FROM answers WHERE participant_id=?")
        .all(p.id)
        .map((v: any) => ({ ...v, answers: parse(v.answers) })),
    })),
  });
});
const cleanupSchema = z.object({
  classroomId: z.string().optional(),
  participantId: z.string().optional(),
  inactiveDays: z.number().int().min(1).max(3650).optional(),
  replaysOnly: z.boolean(),
});
function cleanupPreview(b: z.infer<typeof cleanupSchema>) {
  const where = ["1=1"],
    args: any[] = [];
  if (b.classroomId) {
    where.push("classroom_id=?");
    args.push(b.classroomId);
  }
  if (b.participantId) {
    where.push("id=?");
    args.push(b.participantId);
  }
  if (b.inactiveDays) {
    where.push("last_seen<?");
    args.push(Date.now() - b.inactiveDays * 86400_000);
  }
  const ps = stmt(
    `SELECT id,members,classroom_id FROM participants WHERE ${where.join(" AND ")} ORDER BY id`,
  ).all(...args) as any[];
  let eventCount = 0,
    attemptCount = 0,
    answerCount = 0;
  for (const p of ps) {
    eventCount += Number(
      (
        stmt("SELECT count(*) AS n FROM events WHERE participant_id=?").get(
          p.id,
        ) as any
      ).n,
    );
    attemptCount += Number(
      (
        stmt("SELECT count(*) AS n FROM attempts WHERE participant_id=?").get(
          p.id,
        ) as any
      ).n,
    );
    answerCount += Number(
      (
        stmt("SELECT count(*) AS n FROM answers WHERE participant_id=?").get(
          p.id,
        ) as any
      ).n,
    );
  }
  const preview = {
    groups: ps.length,
    students: ps.reduce((n, p) => n + parse(p.members).length, 0),
    events: eventCount,
    attempts: b.replaysOnly ? 0 : attemptCount,
    answers: b.replaysOnly ? 0 : answerCount,
  };
  return {
    ps,
    preview,
    token: sha(JSON.stringify({ b, ids: ps.map((p) => p.id), preview })),
  };
}
app.post("/api/teacher/cleanup/preview", teacher, (req, res) => {
  const b = cleanupSchema.parse(req.body),
    r = cleanupPreview(b);
  res.json({ ...r.preview, token: r.token });
});
app.post("/api/teacher/cleanup", teacher, (req, res) => {
  const b = cleanupSchema
    .extend({ token: z.string(), confirmation: z.literal("清理") })
    .parse(req.body);
  const criteria = cleanupSchema.parse(b);
  const r = cleanupPreview(criteria);
  if (r.token !== b.token)
    return res.status(409).json({ error: "记录数量已变化，请重新预览后确认" });
  db.exec("BEGIN");
  try {
    for (const p of r.ps) {
      if (b.replaysOnly) {
        stmt("DELETE FROM events WHERE participant_id=?").run(p.id);
      } else {
        stmt("DELETE FROM sessions WHERE role='student' AND entity=?").run(
          p.id,
        );
        stmt("DELETE FROM participants WHERE id=?").run(p.id);
      }
    }
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
  if (!b.replaysOnly)
    for (const [ws, s] of sockets)
      if (s.role === "student" && r.ps.some((p) => p.id === s.entity)) {
        ws.send(JSON.stringify({ type: "reset" }));
        ws.close();
      }
  db.exec(
    "PRAGMA wal_checkpoint(TRUNCATE); VACUUM; PRAGMA wal_checkpoint(TRUNCATE);",
  );
  broadcast("refresh", {});
  res.json({ deleted: r.preview });
});
const replayDays = Math.max(1, Number(process.env.REPLAY_RETENTION_DAYS) || 7),
  recordDays = Math.max(
    replayDays,
    Number(process.env.RECORD_RETENTION_DAYS) || 30,
  ),
  maxEvents = Math.max(
    1000,
    Number(process.env.MAX_EVENTS_PER_STUDENT) || 20000,
  );
function maintenance() {
  const now = Date.now();
  stmt("DELETE FROM sessions WHERE expires<?").run(now);
  stmt("DELETE FROM events WHERE at<?").run(now - replayDays * 86400_000);
  for (const p of stmt(
    "SELECT id,last_seen FROM participants",
  ).all() as any[]) {
    stmt(
      "DELETE FROM events WHERE participant_id=? AND seq NOT IN (SELECT seq FROM events WHERE participant_id=? ORDER BY seq DESC LIMIT ?)",
    ).run(p.id, p.id, maxEvents);
    if (p.last_seen < now - recordDays * 86400_000) {
      stmt("DELETE FROM sessions WHERE role='student' AND entity=?").run(p.id);
      stmt("DELETE FROM participants WHERE id=?").run(p.id);
    }
  }
  db.exec(
    "PRAGMA wal_checkpoint(TRUNCATE); VACUUM; PRAGMA wal_checkpoint(TRUNCATE);",
  );
}
function compactLegacyRecords() {
  const version = (stmt("PRAGMA user_version").get() as any).user_version;
  if (version >= 1) return;
  db.exec("BEGIN");
  try {
    db.exec(
      "DELETE FROM events WHERE kind NOT IN ('edit','predict','run','result','help')",
    );
    for (const e of stmt(
      "SELECT seq,snapshot FROM events",
    ).iterate() as Iterable<any>)
      stmt("UPDATE events SET snapshot=? WHERE seq=?").run(
        JSON.stringify(compactSnapshot(parse(e.snapshot))),
        e.seq,
      );
    for (const d of stmt(
      "SELECT participant_id,activity,snapshot FROM drafts",
    ).iterate() as Iterable<any>)
      stmt(
        "UPDATE drafts SET snapshot=? WHERE participant_id=? AND activity=?",
      ).run(
        JSON.stringify(compactSnapshot(parse(d.snapshot))),
        d.participant_id,
        d.activity,
      );
    for (const p of stmt(
      "SELECT id,state FROM participants WHERE state IS NOT NULL",
    ).iterate() as Iterable<any>)
      stmt("UPDATE participants SET state=? WHERE id=?").run(
        JSON.stringify(compactSnapshot(parse(p.state))),
        p.id,
      );
    db.exec("PRAGMA user_version=1; COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}
compactLegacyRecords();
maintenance();
const retentionTimer = setInterval(maintenance, 3600_000);
retentionTimer.unref();
const socketTimer = setInterval(() => {
  for (const [ws, s] of sockets) {
    if (
      s.expires < Date.now() ||
      !stmt("SELECT hash FROM sessions WHERE hash=?").get(s.hash)
    ) {
      ws.close();
      continue;
    }
    ws.ping();
  }
  for (const [k, v] of limits) if (v.until < Date.now()) limits.delete(k);
}, 30_000);
socketTimer.unref();
app.get("/api/teacher/storage", teacher, (_req, res) => {
  const bytes = [dbFile, dbFile + "-wal", dbFile + "-shm"].reduce(
    (n, p) => n + (existsSync(p) ? statSync(p).size : 0),
    0,
  );
  res.json({
    bytes,
    replayDays,
    recordDays,
    maxEvents,
    events: (stmt("SELECT count(*) AS n FROM events").get() as any).n,
    participants: (stmt("SELECT count(*) AS n FROM participants").get() as any)
      .n,
  });
});
app.post("/api/teacher/storage/compact", teacher, (_req, res) => {
  maintenance();
  db.exec(
    "PRAGMA wal_checkpoint(TRUNCATE); VACUUM; PRAGMA wal_checkpoint(TRUNCATE);",
  );
  res.json({ ok: true });
});
app.use("/api", (_req, res) => res.status(404).json({ error: "接口不存在" }));
app.use(express.static(resolve("dist/public")));
app.get("/{*path}", (_req, res) => {
  const p = resolve("dist/public/index.html");
  if (existsSync(p)) res.sendFile(p);
  else res.status(503).send("开发模式请访问 Vite 提供的地址");
});
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof z.ZodError)
    return res.status(400).json({ error: "请求内容格式不正确" });
  if (err?.type === "entity.too.large")
    return res.status(413).json({ error: "请求过大" });
  console.error("Request failed:", err instanceof Error ? err.name : "Unknown");
  res.status(500).json({ error: "操作未完成，请检查服务配置或稍后重试" });
});
const port = Number(process.env.PORT) || 3000;
http.listen(port, "0.0.0.0", () =>
  console.log(
    `Moon classroom listening on ${port} (${process.env.AUTH_MODE === "demo" ? "demo" : "ClassOrbit authentication"})`,
  ),
);
function shutdown() {
  clearInterval(retentionTimer);
  clearInterval(socketTimer);
  for (const ws of sockets.keys()) ws.close();
  http.close(() => {
    db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
