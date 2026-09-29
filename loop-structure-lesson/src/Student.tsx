import { compactSnapshot, editableSnapshot } from "../shared/records";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  Cloud,
  CloudOff,
  Flag,
  LogOut,
  Radio,
  Satellite,
  Users,
} from "lucide-react";
import { api, connect } from "./lib/api";
import { enqueue, startQueue, clearJobs } from "./lib/queue";
import { cn, uuid } from "./lib/utils";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { Card } from "./components/ui/card";
import {
  Exercise,
  QuizView,
  Challenge,
  Review,
  type Change,
} from "./components/Exercise";
import {
  levels,
  quizzes,
  initialPlan,
  initialFrame,
  simulate,
  validateFlow,
  type Snapshot,
  activityNames,
} from "../shared/engine";
export function Student({ goTeacher }: { goTeacher: () => void }) {
  const [data, setData] = useState<any>(null),
    [enrollment, setEnrollment] = useState<any>(null),
    [classId, setClassId] = useState(""),
    [roomId, setRoomId] = useState(""),
    [ids, setIds] = useState<string[]>([]),
    [search, setSearch] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true);
  const load = useCallback(() => {
    api("/enrollment")
      .then(setEnrollment)
      .catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    api("/student/me")
      .then(setData)
      .catch(() => load())
      .finally(() => setLoading(false));
  }, [load]);
  const reset = useCallback(
    (message = "练习记录已清理，请重新选择姓名") => {
      setData(null);
      setIds([]);
      setError(message);
      load();
    },
    [load],
  );
  if (data) return <Workspace data={data} setData={setData} reset={reset} />;
  const cl = enrollment?.classes.find((c: any) => c.id === classId),
    rooms = cl?.rooms || [];
  return (
    <div className="entry-layout">
      <div className="entry-hero">
        <a className="brand" href="/">
          <span className="brand-icon">
            <Satellite />
          </span>
          <span>
            飞控课堂<small>LUNAR EXPLORER LAB</small>
          </span>
        </a>
        <div className="entry-copy">
          <div className="eyebrow light">青少年飞控顾问团 · 五年级信息科技</div>
          <h1>
            下一段月球旅程，
            <br />
            由你来设计。
          </h1>
          <p>
            从一条指令，到自主巡视。
            <br />
            用循环，让小玉兔走得更远。
          </p>
          <div className="hero-orbit">
            <div className="orbit-ring" />
            <div className="moon-sphere" />
            <Satellite className="orbit-satellite" size={52} />
            <span className="orbit-coordinate">南极巡视区 / 04 个探索任务</span>
          </div>
        </div>
        <span className="hero-footer">嫦娥七号主题 · 月面地图为教学模拟</span>
      </div>
      <div className="entry-form-wrap">
        <div className="entry-top">
          <span>学生入口</span>
          <Button variant="ghost" onClick={goTeacher}>
            教师工作台 <ChevronRight />
          </Button>
        </div>
        <div className="entry-form">
          <span className="small-tag">
            <Radio size={12} />
            准备加入课堂
          </span>
          <h2>你好，飞控顾问</h2>
          <p className="text-muted-foreground mt-2 mb-7">
            选择你的班级和姓名，开始今天的探索。
          </p>
          {error && (
            <div className="error-box" role="alert">
              {error}
            </div>
          )}
          {loading ? (
            <p>正在连接课堂……</p>
          ) : !enrollment?.classes.length ? (
            <Card className="p-6">
              <p>老师还没有开启课堂。</p>
              <p className="text-sm text-muted-foreground mt-2">
                请等老师选择班级并开启今天的巡视任务。
              </p>
              <Button variant="outline" className="mt-4" onClick={load}>
                刷新课堂
              </Button>
            </Card>
          ) : (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                setError("");
                try {
                  const d = await api("/student/join", {
                    classroomId: roomId || rooms[0]?.id,
                    studentIds: ids,
                  });
                  setData({ ...d, attempts: [], submitted: [] });
                } catch (e: any) {
                  setError(e.message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <label className="field-label">
                你的班级
                <select
                  value={classId}
                  onChange={(e) => {
                    setClassId(e.target.value);
                    setRoomId("");
                    setIds([]);
                  }}
                  required
                >
                  <option value="">请选择班级</option>
                  {enrollment.classes.map((c: any) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              {rooms.length > 1 && (
                <label className="field-label mt-4">
                  当前课堂
                  <select
                    value={roomId || rooms[0]?.id}
                    onChange={(e) => setRoomId(e.target.value)}
                  >
                    {rooms.map((r: any) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {cl && (
                <div className="mt-5">
                  <div className="flex justify-between items-center mb-2">
                    <label className="text-sm font-medium">你的姓名</label>
                    <span className="text-xs text-muted-foreground">
                      两人一机可选择 2 位
                    </span>
                  </div>
                  <Input
                    placeholder="搜索姓名或学号"
                    aria-label="搜索姓名或学号"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                  <div className="name-grid">
                    {cl.students
                      .filter((s: any) => `${s.name} ${s.id}`.includes(search))
                      .map((s: any) => (
                        <button
                          type="button"
                          className={cn(
                            "name-button",
                            ids.includes(s.id) && "selected",
                          )}
                          key={s.id}
                          onClick={() =>
                            setIds((v) =>
                              v.includes(s.id)
                                ? v.filter((id) => id !== s.id)
                                : v.length < 2
                                  ? [...v, s.id]
                                  : v,
                            )
                          }
                        >
                          <span>{s.name}</span>
                          <small>{s.id}</small>
                          {ids.includes(s.id) && <CheckCircle2 size={15} />}
                        </button>
                      ))}
                  </div>
                </div>
              )}
              <Button
                className="w-full mt-6"
                size="lg"
                disabled={busy || !ids.length || !cl}
              >
                {busy ? "正在进入……" : "进入巡视课堂"}
                <ChevronRight />
              </Button>
            </form>
          )}
          <p className="entry-notice">
            本课堂保存流程图方案、预测答案与练习结果，供老师指导与讲评。鼠标和运行画面仅供实时观察，不保存轨迹。
          </p>
          {enrollment?.stale && (
            <p className="text-xs text-amber-700">
              名单服务暂不可用，正在使用已同步名单。
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
function Workspace({
  data,
  setData,
  reset,
}: {
  data: any;
  setData: (d: any) => void;
  reset: (m?: string) => void;
}) {
  const p = data.participant,
    c = data.classroom;
  const [snapshot, setSnapshot] = useState<Snapshot>(() => {
    const saved = p.state as Snapshot | null;
    return saved?.activity.startsWith("l")
      ? editableSnapshot(saved)
      : fresh("l1", p.members[0].id);
  });
  const [pending, setPending] = useState(0),
    [syncMessage, setSyncMessage] = useState(""),
    [online, setOnline] = useState(false),
    [error, setError] = useState(""),
    [results, setResults] = useState<any>(null),
    [attempts, setAttempts] = useState<any[]>(data.attempts || []),
    [submitted, setSubmitted] = useState<any[]>(data.submitted || []);
  const ref = useRef(snapshot),
    dataRef = useRef(data),
    drafts = useRef<Record<string, Snapshot>>(data.drafts || {}),
    runToken = useRef(0),
    pendingText = useRef<ReturnType<typeof setTimeout> | null>(null),
    mounted = useRef(true),
    lastPointer = useRef(0),
    stage = useRef<HTMLDivElement>(null);
  ref.current = snapshot;
  dataRef.current = data;
  function fresh(activity: string, student: string): Snapshot {
    const l = levels.find((l) => l.id === activity);
    return {
      activity,
      ...(l ? { plan: initialPlan(l.id), frame: initialFrame(l) } : {}),
      answers: [-1, -1],
      selectedStudent: student,
      operator: p.members[0].id,
    };
  }
  const refresh = useCallback(() => {
    api("/student/me")
      .then((d) => {
        setData(d);
        setAttempts(d.attempts);
        setSubmitted(d.submitted);
      })
      .catch(() => {});
  }, [setData]);
  const liveBusy = useRef(false);
  const emit = useCallback(
    (s: Snapshot, kind: string, label: string) => {
      if (kind === "pointer" || kind === "step") {
        // Live observation is best effort: never queue or replay animation telemetry.
        if (!navigator.onLine || liveBusy.current) return;
        liveBusy.current = true;
        void api("/student/live", { snapshot: s, label })
          .catch(() => {})
          .finally(() => {
            liveBusy.current = false;
          });
        return;
      }
      void enqueue(p.id, "/student/events", {
        events: [
          {
            id: uuid(),
            at: Date.now(),
            kind,
            label,
            snapshot: compactSnapshot(s),
          },
        ],
      }).catch(() =>
        setError("本机存储不可用，操作无法可靠保存。请联系教师。"),
      );
    },
    [p.id],
  );
  const change: Change = (patch, kind = "edit", label = "修改方案") => {
    const s = { ...ref.current, ...patch };
    ref.current = s;
    setSnapshot(s);
    drafts.current[s.activity] = s;
    if (pendingText.current) {
      clearTimeout(pendingText.current);
      pendingText.current = null;
    }
    if (kind === "explain" || (kind === "answer" && patch.note !== undefined))
      pendingText.current = setTimeout(() => {
        emit(s, kind, label);
        pendingText.current = null;
      }, 600);
    else emit(s, kind, label);
  };
  useEffect(() => {
    mounted.current = true;
    const queue = startQueue(
      p.id,
      (n, m) => {
        setPending(n);
        if (m) setSyncMessage(m);
        else if (!n) setSyncMessage("");
      },
      () => reset(),
      refresh,
    );
    const stop = connect(
      "student",
      (v) => {
        if (v.type === "reset") {
          void clearJobs(p.id);
          reset();
        }
        if (v.type === "replaced")
          reset("该姓名已在另一台设备进入，请确认当前操作设备");
        if (v.type === "classroom") {
          setData({ ...dataRef.current, classroom: v.data });
          if (
            !v.data.active ||
            (v.data.settings.openLevel !== "all" &&
              ref.current.activity.startsWith("l") &&
              v.data.settings.openLevel !== ref.current.activity)
          ) {
            runToken.current++;
            setSnapshot((s) => ({ ...s, running: false }));
          }
        }
      },
      setOnline,
    );
    const heartbeat = setInterval(
      () =>
        api("/student/heartbeat", {})
          .then((v) => setData({ ...dataRef.current, classroom: v.classroom }))
          .catch(() => {}),
      20000,
    );
    emit(ref.current, "navigate", "进入巡视课堂");
    return () => {
      mounted.current = false;
      runToken.current++;
      queue.stop();
      stop();
      clearInterval(heartbeat);
      if (pendingText.current) {
        clearTimeout(pendingText.current);
        emit(ref.current, "explain", "保存最后的学习记录");
      }
    };
  }, [p.id, refresh, reset, emit, setData]);
  useEffect(() => {
    if (c.settings.answersOpen)
      api("/student/results")
        .then(setResults)
        .catch(() => {});
  }, [c.settings.answersOpen, submitted.length]);
  async function run() {
    const s = ref.current;
    if (!s.plan || !s.prediction) return;
    const l = levels.find((v) => v.id === s.activity);
    if (l) {
      const check = validateFlow(l, s.plan);
      if (!check.valid) throw new Error(check.errors[0] || "请先完成流程图");
    }
    const result = simulate(s.activity, s.plan),
      token = ++runToken.current;
    change({ running: true, result: undefined }, "run", "开始模拟");
    for (const frame of result.frames) {
      await new Promise((r) => setTimeout(r, 460));
      if (token !== runToken.current || !mounted.current) return;
      change({ frame }, "step", frame.text);
    }
    change({ running: false, result: result.reason }, "result", result.reason);
    const attempt = {
      id: uuid(),
      level: s.activity,
      plan: s.plan,
      prediction: s.prediction,
      assisted: !!s.hint || c.settings.answersOpen,
    };
    setAttempts((a) => [
      ...a,
      { ...attempt, win: result.win, reason: result.reason },
    ]);
    await enqueue(p.id, "/student/attempts", attempt);
  }
  function navigate(id: string) {
    runToken.current++;
    drafts.current[ref.current.activity] = { ...ref.current, running: false };
    const next = id.startsWith("q")
      ? fresh(id, p.members[0].id)
      : editableSnapshot(drafts.current[id] || fresh(id, p.members[0].id));
    if (pendingText.current) {
      clearTimeout(pendingText.current);
      emit(ref.current, "explain", "保存学习记录");
      pendingText.current = null;
    }
    const nextState = {
      ...next,
      running: false,
      pointer: undefined,
      operator: ref.current.operator,
    };
    ref.current = nextState;
    setSnapshot(nextState);
    emit(nextState, "navigate", `进入${activityNames[id]}`);
  }
  const isSubmitted = submitted.some(
    (a: any) =>
      a.student_id === snapshot.selectedStudent &&
      a.question === snapshot.activity,
  );
  async function submit() {
    if (!snapshot.selectedStudent || !snapshot.answers) return;
    await enqueue(p.id, "/student/answers", {
      id: uuid(),
      studentId: snapshot.selectedStudent,
      question: snapshot.activity,
      answers: snapshot.answers,
      note: snapshot.note || "",
    });
    setSubmitted((a: any[]) => [
      ...a,
      { student_id: snapshot.selectedStudent, question: snapshot.activity },
    ]);
    change({}, "submit", "提交独立验收题");
  }
  const editable =
    c.active &&
    (snapshot.activity.startsWith("l")
      ? c.settings.openLevel === "all" ||
        c.settings.openLevel === snapshot.activity
      : snapshot.activity.startsWith("q")
        ? c.settings.quizOpen && !c.settings.answersOpen
        : true);
  const pointer = (e: React.PointerEvent<HTMLDivElement>, kind: string) => {
    if (!c.active) return;
    const now = Date.now();
    if (kind === "move" && now - lastPointer.current < 350) return;
    lastPointer.current = now;
    const r = e.currentTarget.getBoundingClientRect();
    const s = {
      ...ref.current,
      pointer: {
        x: Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)),
        y: Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)),
        kind,
      },
    };
    ref.current = s;
    emit(s, "pointer", kind === "click" ? "点击练习区域" : "移动鼠标");
  };
  return (
    <div className="workspace">
      <header className="app-header">
        <a className="brand" href="/">
          <span className="brand-icon">
            <Satellite />
          </span>
          <span>
            飞控课堂<small>月球南极自主巡视</small>
          </span>
        </a>
        <div className="header-center">
          <span className={cn("connection", online && "connected")}>
            {online ? <Cloud size={14} /> : <CloudOff size={14} />}{" "}
            {pending
              ? `${pending} 条待同步`
              : online
                ? "已连接教师端"
                : "重新连接中"}
          </span>
        </div>
        <div className="flex gap-2 items-center">
          <span className="text-sm hidden sm:inline">
            {p.members.map((m: any) => m.name).join(" · ")}
          </span>
          <Button
            variant="ghost"
            size="icon"
            aria-label="退出学生课堂"
            onClick={async () => {
              if (pending) {
                setError("请等待操作同步完成后再退出。");
                return;
              }
              await api("/student/logout", {});
              reset("");
            }}
          >
            <LogOut />
          </Button>
        </div>
      </header>
      <div className="workspace-body">
        <aside className="student-sidebar">
          <div className="eyebrow">{c.name}</div>
          <div className="sidebar-label">探索任务</div>
          {levels.map((l, i) => {
            const done = attempts.some((a) => a.level === l.id && a.win);
            return (
              <button
                className={cn(
                  "nav-item",
                  snapshot.activity === l.id && "active",
                )}
                key={l.id}
                disabled={
                  c.settings.openLevel !== "all" &&
                  c.settings.openLevel !== l.id
                }
                onClick={() => navigate(l.id)}
              >
                <span className="nav-number">
                  {done ? (
                    <CheckCircle2 size={17} />
                  ) : (
                    String(i + 1).padStart(2, "0")
                  )}
                </span>
                <span>
                  {l.title}
                  <small>{l.brief}</small>
                </span>
              </button>
            );
          })}
          <div className="sidebar-label mt-6">飞控验收</div>
          {quizzes.map((q, i) => (
            <button
              className={cn(
                "nav-item compact",
                snapshot.activity === q.id && "active",
              )}
              key={q.id}
              disabled={!c.settings.quizOpen && !c.settings.answersOpen}
              onClick={() => navigate(q.id)}
            >
              <span className="nav-number">{i + 1}</span>
              {q.title}
            </button>
          ))}
          <button
            className={cn(
              "nav-item compact",
              snapshot.activity === "challenge" && "active",
            )}
            onClick={() => navigate("challenge")}
          >
            <Flag size={16} />
            充电调试 <span className="small-tag ml-auto">选做</span>
          </button>
          <button
            className={cn(
              "nav-item compact",
              snapshot.activity === "review" && "active",
            )}
            onClick={() => navigate("review")}
          >
            <CheckCircle2 size={16} />
            学习小结
          </button>
          <div className="sidebar-bottom">
            <Users size={16} />
            <div>
              操作员
              <select
                aria-label="当前操作员"
                value={snapshot.operator || p.members[0].id}
                onChange={(e) =>
                  change(
                    { operator: e.target.value },
                    "operator",
                    "轮换操作员与观察员",
                  )
                }
              >
                {p.members.map((m: any) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <Button
            variant="outline"
            className="w-full"
            onClick={() => change({}, "help", "举手求助：请老师指导")}
          >
            <CircleHelp />
            向老师求助
          </Button>
        </aside>
        <main className="student-main">
          {(error || syncMessage) && (
            <div className="error-box" role="alert">
              {error || syncMessage}
              <button className="ml-3 underline" onClick={() => setError("")}>
                知道了
              </button>
            </div>
          )}
          {!c.active && (
            <div className="hint-panel mb-4">
              本次课堂已结束，可以查看练习内容。
            </div>
          )}
          {!editable && c.active && (
            <div className="hint-panel mb-4">
              当前任务暂未开放，或已进入统一讲评。
            </div>
          )}
          <div
            ref={stage}
            onPointerMove={(e) => pointer(e, "move")}
            onPointerDown={(e) => pointer(e, "click")}
            className="student-stage"
          >
            {snapshot.activity.startsWith("l") ? (
              <Exercise
                snapshot={snapshot}
                onChange={change}
                onRun={() => void run().catch((e) => setError(e.message))}
                onStop={() => {
                  runToken.current++;
                  change({ running: false }, "run", "手动停止模拟");
                }}
                readonly={!editable}
                answersOpen={c.settings.answersOpen}
                attempts={attempts}
              />
            ) : snapshot.activity.startsWith("q") ? (
              <QuizView
                snapshot={snapshot}
                onChange={change}
                onSubmit={() => void submit().catch((e) => setError(e.message))}
                readonly={!editable}
                submitted={isSubmitted}
                members={p.members}
              />
            ) : snapshot.activity === "challenge" ? (
              <Challenge
                snapshot={snapshot}
                onChange={change}
                readonly={!editable}
              />
            ) : (
              <Review
                snapshot={snapshot}
                onChange={change}
                readonly={!editable}
              />
            )}
          </div>
          {results && snapshot.activity.startsWith("q") && (
            <Card className="p-5 mt-6">
              <h3 className="font-semibold">统一讲评</h3>
              <p className="text-sm mt-3">
                {snapshot.activity === "q1"
                  ? "一轮是取样＋放入盒；判断盒中是否已有 3 个样本。否：返回取样；是：结束。"
                  : snapshot.activity === "q2"
                    ? "先判断再执行，0 轮。起初已经到站，停止条件成立。"
                    : "先拍照后判断，拍 1 张。先拍才有照片，第一张清晰就停止。"}
              </p>
              {results.answers
                .filter((a: any) => a.question === snapshot.activity)
                .map((a: any) => (
                  <p className="text-sm mt-2" key={a.id}>
                    {p.members.find((m: any) => m.id === a.student_id)?.name}：
                    {a.score} / 2 分
                  </p>
                ))}
            </Card>
          )}
        </main>
      </div>
    </div>
  );
}
