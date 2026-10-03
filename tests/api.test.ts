import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { request as httpRequest } from "node:http";
import WebSocket from "ws";
import { levels, referencePlan, simulate } from "../shared/engine.js";
const dir = mkdtempSync(join(tmpdir(), "moon-api-")),
  port = 19341,
  base = `http://127.0.0.1:${port}`;
let server: ChildProcess,
  teacherCookie = "",
  studentCookie = "",
  room = "",
  participant = "";
async function req(
  path: string,
  body?: any,
  cookie = teacherCookie,
  method?: string,
) {
  const r = await fetch(base + "/api" + path, {
    method: method || (body === undefined ? "GET" : "POST"),
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return {
    status: r.status,
    data: await r.json(),
    cookie: r.headers.get("set-cookie")?.split(";")[0] || "",
  };
}
before(async () => {
  server = spawn(process.execPath, ["--import", "tsx", "server/index.ts"], {
    env: {
      ...process.env,
      PORT: String(port),
      DATA_DIR: dir,
      AUTH_MODE: "demo",
      DEMO_PASSWORD: "test-password",
      TEACHER_USERNAME: "Alumos",
    },
    stdio: "pipe",
  });
  let logs = "";
  server.stderr?.on("data", (d) => (logs += d));
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(base + "/api/health")).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("Server failed: " + logs);
});
after(async () => {
  server?.kill("SIGTERM");
  if (server && server.exitCode === null)
    await new Promise<void>((r) => server.once("exit", () => r()));
  rmSync(dir, { recursive: true, force: true });
});
test("教师认证、独立作答、幂等补传、权限边界和两级清理", async () => {
  assert.equal((await req("/teacher/classrooms", undefined, "")).status, 401);
  assert.equal(
    (await req("/teacher/login", { username: "Alumos", password: "wrong" }, ""))
      .status,
    401,
  );
  const login = await req(
    "/teacher/login",
    { username: "Alumos", password: "test-password" },
    "",
  );
  assert.equal(login.status, 200);
  teacherCookie = login.cookie;
  const created = await req("/teacher/classrooms", {
    classId: "demo-5",
    name: "测试课堂",
  });
  assert.equal(created.status, 200);
  room = created.data.id;
  const enrollment = await req("/enrollment", undefined, "");
  assert.equal(enrollment.data.classes[0].students[0].id, "001");
  const joined = await req(
    "/student/join",
    { classroomId: room, studentIds: ["001", "002"] },
    "",
  );
  studentCookie = joined.cookie;
  participant = joined.data.participant.id;
  assert.equal(
    (
      await req(
        "/teacher/participants/" + participant,
        undefined,
        studentCookie,
      )
    ).status,
    401,
  );
  const csrf = await fetch(base + "/api/student/heartbeat", {
    method: "POST",
    headers: {
      Origin: "https://evil.example",
      Cookie: studentCookie,
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  assert.equal(csrf.status, 403);
  const event = {
    id: randomUUID(),
    at: Date.now(),
    kind: "predict",
    label: "预测 6 轮",
    snapshot: { activity: "l1", prediction: "6 轮" },
  };
  assert.equal(
    (await req("/student/events", { events: [event] }, studentCookie)).status,
    200,
  );
  await req("/student/events", { events: [event] }, studentCookie);
  let history = await req(`/teacher/participants/${participant}/events`);
  assert.equal(history.data.events.length, 1);
  const attempt = {
    id: randomUUID(),
    level: "l1",
    plan: referencePlan("l1"),
    prediction: "6 轮",
    assisted: false,
  };
  await req("/student/attempts", attempt, studentCookie);
  await req("/student/attempts", attempt, studentCookie);
  let detail = await req("/teacher/participants/" + participant);
  assert.equal(detail.data.attempts.length, 1);
  assert.equal(detail.data.attempts[0].win, 1);
  assert.deepEqual(
    detail.data.attempts[0].plan.nodes,
    JSON.parse(JSON.stringify(attempt.plan.nodes)),
  );
  assert.deepEqual(detail.data.attempts[0].plan.edges, attempt.plan.edges);
  const invalid = {
    ...attempt,
    id: randomUUID(),
    plan: {
      ...attempt.plan,
      edges: attempt.plan.edges!.filter((e) => e.kind !== "return"),
    },
  };
  assert.equal((await req("/student/attempts", invalid, studentCookie)).status, 200);
  detail = await req("/teacher/participants/" + participant);
  assert.equal(detail.data.attempts.at(-1).win, 0);
  assert.match(detail.data.attempts.at(-1).reason, /没有唯一的下一条箭头/);
  assert.equal(
    (
      await req(
        "/student/attempts",
        { ...attempt, id: randomUUID(), plan: levels[0].answer },
        studentCookie,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await req(
        "/student/attempts",
        {
          ...attempt,
          id: randomUUID(),
          plan: { ...attempt.plan, timing: "post" },
        },
        studentCookie,
      )
    ).status,
    200,
  );
  const answer = {
    id: randomUUID(),
    studentId: "001",
    question: "q1",
    answers: [1, 1],
    note: "两步合为一轮",
  };
  assert.equal(
    (await req("/student/answers", answer, studentCookie)).status,
    403,
  );
  await req(
    "/teacher/classrooms/" + room,
    { settings: { quizOpen: true, answersOpen: false, openLevel: "all" } },
    teacherCookie,
    "PATCH",
  );
  assert.equal(
    (
      await req(
        "/student/answers",
        { ...answer, studentId: "003" },
        studentCookie,
      )
    ).status,
    403,
  );
  assert.equal(
    (await req("/student/answers", answer, studentCookie)).status,
    200,
  );
  await req("/student/answers", answer, studentCookie);
  assert.equal(
    (await req("/student/results", undefined, studentCookie)).status,
    403,
  );
  detail = await req("/teacher/participants/" + participant);
  assert.equal(detail.data.answers.length, 1);
  assert.equal(detail.data.answers[0].score, 2);
  const replayCriteria = { classroomId: room, replaysOnly: true },
    replay = await req("/teacher/cleanup/preview", replayCriteria);
  assert.equal(replay.data.events, 1);
  assert.equal(replay.data.answers, 0);
  assert.equal(
    (
      await req("/teacher/cleanup", {
        ...replayCriteria,
        token: replay.data.token,
        confirmation: "清理",
      })
    ).status,
    200,
  );
  history = await req(`/teacher/participants/${participant}/events`);
  assert.equal(history.data.events.length, 0);
  detail = await req("/teacher/participants/" + participant);
  assert.equal(detail.data.attempts.length, 3);
  assert.equal(detail.data.answers.length, 1);
  const criteria = { classroomId: room, replaysOnly: false },
    preview = await req("/teacher/cleanup/preview", criteria);
  assert.equal(preview.data.students, 2);
  assert.equal(preview.data.attempts, 3);
  assert.equal(
    (
      await req("/teacher/cleanup", {
        ...criteria,
        token: "stale",
        confirmation: "清理",
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await req("/teacher/cleanup", {
        ...criteria,
        token: preview.data.token,
        confirmation: "清理",
      })
    ).status,
    200,
  );
  assert.equal(
    (await req("/student/events", { events: [event] }, studentCookie)).status,
    401,
  );
  assert.equal(
    (await req("/student/attempts", attempt, studentCookie)).status,
    401,
  );
  assert.equal((await req("/teacher/participants/" + participant)).status, 404);
  assert.equal(
    (await req("/enrollment", undefined, "")).data.classes[0].students.length,
    3,
  );
  assert.equal(
    (await req("/teacher/classrooms/" + room + "/summary")).data.length,
    0,
  );
});

test("教师可修正残图，旧离线事件不能覆盖修正，未预测也可记录尝试", async () => {
  const created = await req("/teacher/classrooms", { classId: "demo-5", name: "修正流程课堂" });
  const joined = await req("/student/join", {
    classroomId: created.data.id,
    studentIds: ["001"],
  }, "");
  const pid = joined.data.participant.id;
  const broken = referencePlan("l1");
  broken.edges = broken.edges!.filter((edge) => edge.kind !== "return");
  const oldSnapshot = { activity: "l1", plan: broken, planRevision: 0 };
  const event = (snapshot: any) => ({
    id: randomUUID(), at: Date.now(), kind: "edit", label: "修改方案", snapshot,
  });
  assert.equal((await req("/student/events", { events: [event(oldSnapshot)] }, joined.cookie)).status, 200);
  assert.equal((await req(`/teacher/participants/${pid}/plan`, { plan: referencePlan("l1") }, joined.cookie, "PATCH")).status, 401);
  const correction = await req(`/teacher/participants/${pid}/plan`, { plan: referencePlan("l1") }, teacherCookie, "PATCH");
  assert.equal(correction.status, 200);
  assert.equal(correction.data.snapshot.planRevision, 1);
  assert.equal(correction.data.snapshot.plan.edges.some((edge: any) => edge.kind === "return"), true);
  await req("/student/events", { events: [event(oldSnapshot)] }, joined.cookie);
  const studentState = (await req("/student/me", undefined, joined.cookie)).data;
  assert.equal(studentState.participant.state.planRevision, 1);
  assert.equal(studentState.drafts.l1.plan.edges.some((edge: any) => edge.kind === "return"), true);
  const history = (await req(`/teacher/participants/${pid}/events`)).data.events;
  assert.equal(history.length, 2);
  assert.equal(history[1].label, "教师修正流程图");
  const attempt = await req("/student/attempts", {
    id: randomUUID(), level: "l1", plan: broken, prediction: "未预测", assisted: false,
  }, joined.cookie);
  assert.equal(attempt.status, 200);
  assert.equal(attempt.data.win, false);
});

test("事件数量上限与到期清理保留近期成绩，删除过期小组", async () => {
  const recent = await req("/teacher/classrooms", {
    classId: "demo-5",
    name: "保留成绩课堂",
  });
  const joined = await req(
    "/student/join",
    { classroomId: recent.data.id, studentIds: ["003"] },
    "",
  );
  const cookie = joined.cookie,
    pid = joined.data.participant.id;
  for (let i = 0; i < 11; i++) {
    const events = Array.from({ length: 100 }, () => ({
      id: randomUUID(),
      at: Date.now(),
      kind: "pointer",
      label: "移动鼠标",
      snapshot: { activity: "l1" },
    }));
    assert.equal(
      (await req("/student/events", { events }, cookie)).status,
      200,
    );
  }
  const sql = new DatabaseSync(join(dir, "classroom.sqlite"));
  // Production cap is exercised by the same delete statement; set the fixture beyond its default cap.
  const insert = sql.prepare(
    "INSERT INTO events(event_id,participant_id,at,client_at,kind,label,snapshot) VALUES(?,?,?,?,?,?,?)",
  );
  sql.exec("BEGIN");
  for (let i = 0; i < 20000; i++)
    insert.run(
      randomUUID(),
      pid,
      Date.now(),
      Date.now(),
      "pointer",
      "移动鼠标",
      '{"activity":"l1"}',
    );
  sql.exec("COMMIT");
  await req(
    "/student/events",
    {
      events: [
        {
          id: randomUUID(),
          at: Date.now(),
          kind: "predict",
          label: "预测",
          snapshot: { activity: "l1" },
        },
      ],
    },
    cookie,
  );
  assert.equal(
    (
      sql
        .prepare("SELECT count(*) AS n FROM events WHERE participant_id=?")
        .get(pid) as any
    ).n,
    20000,
  );
  await req(
    "/student/attempts",
    {
      id: randomUUID(),
      level: "l1",
      plan: referencePlan("l1"),
      prediction: "6 轮",
      assisted: false,
    },
    cookie,
  );
  const old = await req("/teacher/classrooms", {
    classId: "demo-5",
    name: "过期课堂",
  });
  const oldJoin = await req(
    "/student/join",
    { classroomId: old.data.id, studentIds: ["001"] },
    "",
  );
  const oldId = oldJoin.data.participant.id;
  sql
    .prepare("UPDATE events SET at=? WHERE participant_id=?")
    .run(Date.now() - 8 * 86400000, pid);
  sql
    .prepare("UPDATE participants SET last_seen=? WHERE id=?")
    .run(Date.now() - 31 * 86400000, oldId);
  sql.close();
  await req("/teacher/storage/compact", {});
  assert.equal(
    (await req(`/teacher/participants/${pid}/events`)).data.events.length,
    0,
  );
  assert.equal(
    (await req("/teacher/participants/" + pid)).data.attempts.length,
    1,
  );
  assert.equal((await req("/teacher/participants/" + oldId)).status, 404);
  assert.equal(
    (await req("/student/me", undefined, oldJoin.cookie)).status,
    401,
  );
});

test("仅保存不同方案和预测，鼠标与动画不增加记录或覆盖学习状态", async () => {
  const created = await req("/teacher/classrooms", {
    classId: "demo-5",
    name: "精简记录课堂",
  });
  const joined = await req(
    "/student/join",
    { classroomId: created.data.id, studentIds: ["002"] },
    "",
  );
  const cookie = joined.cookie,
    pid = joined.data.participant.id;
  const snapshot = {
    activity: "l1",
    plan: levels[0].answer,
    prediction: "12 轮",
    frame: simulate("l1", levels[0].answer).frames[0],
    pointer: { x: 0.4, y: 0.5, kind: "move" },
  };
  const send = async (kind: string, s = snapshot) =>
    req(
      "/student/events",
      {
        events: [
          { id: randomUUID(), at: Date.now(), kind, label: kind, snapshot: s },
        ],
      },
      cookie,
    );
  await send("edit");
  await send("edit");
  await send("predict", { ...snapshot, prediction: "6 轮" });
  for (let i = 0; i < 60; i++) {
    const r = await req("/student/live", { snapshot, label: "模拟帧" }, cookie);
    assert.equal(r.status, 200);
  }
  await send("pointer");
  await send("step");
  const history = (await req(`/teacher/participants/${pid}/events`)).data
    .events;
  assert.equal(history.length, 2);
  assert.deepEqual(
    history.map((e: any) => e.kind),
    ["edit", "predict"],
  );
  assert.equal(history[0].snapshot.prediction, "12 轮");
  assert.equal(history[1].snapshot.prediction, "6 轮");
  for (const e of history) {
    assert.equal(e.snapshot.frame, undefined);
    assert.equal(e.snapshot.pointer, undefined);
  }
  const detail = (await req("/teacher/participants/" + pid)).data;
  assert.equal(detail.state.prediction, "6 轮");
  assert.equal(detail.state.frame, undefined);
  assert.equal(detail.predictions[0].prediction, "6 轮");
});

test("HTTPS 反代改写 Host 后可入班、恢复会话和连接实时画面，共享 IP 不阻止整班入班", async () => {
  const created = await req("/teacher/classrooms", {
    classId: "demo-5",
    name: "反向代理回归课堂",
  });
  const joinBody = JSON.stringify({
    classroomId: created.data.id,
    studentIds: ["001"],
  });
  const proxyHeaders = {
    Host: "internal-container:3000",
    Origin: "https://loop.alumos.cn",
    "Sec-Fetch-Site": "same-origin",
  };
  function proxyJoin(headers: Record<string, string>) {
    return new Promise<{ status: number; cookie: string; data: any }>(
      (resolve, reject) => {
        const request = httpRequest(
          base + "/api/student/join",
          {
            method: "POST",
            headers: { ...headers, "Content-Type": "application/json" },
          },
          (response) => {
            let body = "";
            response.on("data", (chunk) => {
              body += chunk;
            });
            response.on("end", () => {
              try {
                resolve({
                  status: response.statusCode!,
                  cookie:
                    response.headers["set-cookie"]?.[0]?.split(";")[0] || "",
                  data: JSON.parse(body),
                });
              } catch (error) {
                reject(error);
              }
            });
            response.on("error", reject);
          },
        );
        request.on("error", reject);
        request.end(joinBody);
      },
    );
  }
  let cookie = "";
  // Rejoin the same virtual student to exercise a classroom's shared-IP quota.
  for (let i = 0; i < 45; i++) {
    const joined = await proxyJoin(proxyHeaders);
    assert.equal(joined.status, 200, JSON.stringify(joined.data));
    cookie = joined.cookie;
  }
  assert.equal((await req("/student/me", undefined, cookie)).status, 200);
  const blocked = await proxyJoin({
    ...proxyHeaders,
    Origin: "https://evil.example",
    "Sec-Fetch-Site": "cross-site",
  });
  assert.equal(blocked.status, 403);
  assert.equal(blocked.data.code, "ORIGIN_MISMATCH");

  function handshake(headers: Record<string, string>) {
    return new Promise<number>((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?role=student`, {
        headers: { ...headers, Cookie: cookie },
        handshakeTimeout: 5000,
      });
      ws.once("message", (message) => {
        try {
          assert.equal(JSON.parse(String(message)).type, "connected");
          resolve(101);
        } catch (error) {
          reject(error);
        } finally {
          ws.close();
        }
      });
      ws.once("unexpected-response", (_request, response) => {
        response.resume();
        resolve(response.statusCode!);
        ws.terminate();
      });
      ws.on("error", reject);
    });
  }
  assert.equal(await handshake(proxyHeaders), 101);
  assert.equal(
    await handshake({
      ...proxyHeaders,
      Origin: "https://evil.example",
      "Sec-Fetch-Site": "cross-site",
    }),
    403,
  );
});

test("自由画布坐标和连接边缘经过保存、教师读取和提交后保持一致", async () => {
  const created = await req("/teacher/classrooms", {
    classId: "demo-5",
    name: "布局保存",
  });
  const joined = await req(
    "/student/join",
    { classroomId: created.data.id, studentIds: ["003"] },
    "",
  );
  const cookie = joined.cookie,
    pid = joined.data.participant.id;
  const plan = referencePlan("l1");
  plan.nodes = plan.nodes!.map((n, i) => ({
    ...n,
    x: 310 + i * 45,
    y: 110 + i * 95,
  }));
  plan.edges = plan.edges!.map((e) => ({
    ...e,
    fromAnchor: "left",
    toAnchor: "right",
  }));
  const saved = await req(
    "/student/events",
    {
      events: [
        {
          id: randomUUID(),
          at: Date.now(),
          kind: "edit",
          label: "移动节点",
          snapshot: { activity: "l1", plan },
        },
      ],
    },
    cookie,
  );
  assert.equal(saved.status, 200);
  const detail = (await req("/teacher/participants/" + pid)).data;
  assert.deepEqual(detail.state.plan, JSON.parse(JSON.stringify(plan)));
  const submit = await req(
    "/student/attempts",
    {
      id: randomUUID(),
      level: "l1",
      plan,
      prediction: "6 轮",
      assisted: false,
    },
    cookie,
  );
  assert.equal(submit.status, 200);
  const after = (await req("/teacher/participants/" + pid)).data;
  assert.deepEqual(after.attempts[0].plan, JSON.parse(JSON.stringify(plan)));
  const invalid = {
    ...plan,
    nodes: plan.nodes!.map((n) => ({ ...n, x: 9000 })),
  };
  assert.equal(
    (
      await req(
        "/student/events",
        {
          events: [
            {
              id: randomUUID(),
              at: Date.now(),
              kind: "edit",
              label: "无效坐标",
              snapshot: { activity: "l1", plan: invalid },
            },
          ],
        },
        cookie,
      )
    ).status,
    400,
  );
});
