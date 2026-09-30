import { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity,
  ArrowLeft,
  CheckCircle2,
  Clock3,
  Database,
  Download,
  Eye,
  Pencil,
  FolderClock,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  Monitor,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Satellite,
  Search,
  Trash2,
  Users,
} from "lucide-react";
import { api, connect } from "./lib/api";
import { cn, date, time } from "./lib/utils";
import { Button } from "./components/ui/button";
import { Card } from "./components/ui/card";
import { Input, Textarea } from "./components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "./components/ui/dialog";
import { Screen } from "./components/Exercise";
import { Flow } from "./components/Flow";
import { activityNames, levels, quizzes, validateFlow, referencePlan, initialFrame, type Plan } from "../shared/engine";
export function Teacher({ goStudent }: { goStudent: () => void }) {
  const [user, setUser] = useState<string | null>(null),
    [loading, setLoading] = useState(true),
    [username, setUsername] = useState("Alumos"),
    [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    api("/teacher/me")
      .then((v) => setUser(v.username))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);
  if (loading) return <div className="loading-page">正在连接飞控中心……</div>;
  if (user)
    return (
      <Dashboard
        user={user}
        logout={async () => {
          await api("/teacher/logout", {});
          setUser(null);
        }}
      />
    );
  return (
    <div className="teacher-login">
      <Button
        variant="ghost"
        className="absolute top-6 left-6"
        onClick={goStudent}
      >
        <ArrowLeft />
        学生入口
      </Button>
      <Card className="login-card">
        <span className="brand-icon mb-6">
          <Satellite />
        </span>
        <div className="eyebrow">MISSION CONTROL</div>
        <h1>教师工作台</h1>
        <p className="text-muted-foreground mt-2 mb-6">
          使用 ClassOrbit 的同一教师账号登录。
        </p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              const u = await api("/teacher/login", { username, password });
              setUser(u.username);
              setPassword("");
            } catch (e: any) {
              setError(e.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label className="field-label">
            教师账号
            <Input
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </label>
          <label className="field-label mt-4">
            密码
            <Input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          {error && (
            <div className="error-box mt-4" role="alert">
              {error}
            </div>
          )}
          <Button className="w-full mt-6" disabled={busy}>
            {busy ? "正在验证……" : "进入飞控中心"}
          </Button>
        </form>
        <p className="text-xs text-muted-foreground mt-6">
          查看实时进度、观察学生画面、回放操作过程。
        </p>
      </Card>
    </div>
  );
}
function Dashboard({ user, logout }: { user: string; logout: () => void }) {
  const [tab, setTab] = useState<"overview" | "storage">("overview"),
    [rooms, setRooms] = useState<any[]>([]),
    [roomId, setRoomId] = useState(""),
    [roster, setRoster] = useState<any>(null),
    [summary, setSummary] = useState<any[]>([]),
    [selected, setSelected] = useState<string | null>(null),
    [error, setError] = useState(""),
    [online, setOnline] = useState(false),
    [createOpen, setCreateOpen] = useState(false),
    [newClass, setNewClass] = useState(""),
    [newName, setNewName] = useState("循环结构 · 月球自主巡视"),
    [search, setSearch] = useState(""),
    [filter, setFilter] = useState("all"),
    [notice, setNotice] = useState(""),
    [creating, setCreating] = useState(false);
  const room = rooms.find((r) => r.id === roomId),
    ref = useRef({ roomId, selected });
  ref.current = { roomId, selected };
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshRooms = useCallback(
    () =>
      api("/teacher/classrooms").then((v) => {
        setRooms(v);
        setRoomId((id) =>
          v.some((r: any) => r.id === id) ? id : v[0]?.id || "",
        );
      }),
    [],
  );
  const refresh = useCallback(() => {
    const id = ref.current.roomId;
    if (id)
      api(`/teacher/classrooms/${id}/summary`)
        .then(setSummary)
        .catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    refreshRooms().catch((e) => setError(e.message));
    api("/teacher/roster")
      .then(setRoster)
      .catch((e) => setError(e.message));
  }, [refreshRooms]);
  useEffect(() => {
    setSelected(null);
    setSummary([]);
    refresh();
  }, [roomId, refresh]);
  useEffect(() => {
    const stop = connect(
      "teacher",
      (v) => {
        if (v.type === "state" && v.data.classroomId === ref.current.roomId) {
          setSummary((rows) =>
            rows.map((p) =>
              p.id === v.data.id
                ? {
                    ...p,
                    state: v.data.state,
                    last_seen: v.data.last_seen,
                    lastLabel: v.data.label,
                    needs_help: v.data.label.startsWith("举手求助")
                      ? 1
                      : p.needs_help,
                  }
                : p,
            ),
          );
        }
        if (v.type === "classroom")
          setRooms((rs) => rs.map((r) => (r.id === v.data.id ? v.data : r)));
        if (v.type === "refresh" || v.type === "connected") {
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => {
            refresh();
            void refreshRooms();
          }, 350);
        }
      },
      setOnline,
    );
    const poll = setInterval(refresh, 15000);
    return () => {
      stop();
      clearInterval(poll);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [refresh, refreshRooms]);
  async function settings(patch: any) {
    try {
      const v = await api(`/teacher/classrooms/${roomId}`, patch, "PATCH");
      setRooms((rs) => rs.map((r) => (r.id === v.id ? v : r)));
    } catch (e: any) {
      setError(e.message);
    }
  }
  const cl = roster?.data.classes.find((c: any) => c.id === room?.class_id),
    joined = summary.reduce((n, p) => n + p.members.length, 0),
    passed = summary.filter(
      (p) => p.attempts.filter((a: any) => a.passed).length === levels.length,
    ).length,
    answered = summary.reduce((n, p) => n + p.answers.length, 0),
    attention = (p: any) =>
      p.needs_help || p.attempts.some((a: any) => a.count >= 3 && !a.passed);
  const visible = summary.filter(
    (p) =>
      p.members.some((m: any) => `${m.name} ${m.id}`.includes(search)) &&
      (filter === "all" ||
        (filter === "attention" && attention(p)) ||
        (filter === "complete" &&
          p.attempts.filter((a: any) => a.passed).length === levels.length)),
  );
  return (
    <div className="workspace teacher-workspace">
      <header className="app-header">
        <a className="brand" href="/teacher">
          <span className="brand-icon">
            <Satellite />
          </span>
          <span>
            飞控中心<small>教师工作台</small>
          </span>
        </a>
        <span className={cn("connection", online && "connected")}>
          <span className="live-dot" />
          {online ? "实时连接正常" : "正在重新连接"}
        </span>
        <div className="flex items-center gap-3 text-sm">
          <span>{user}</span>
          <Button
            size="icon"
            variant="ghost"
            aria-label="退出教师后台"
            onClick={logout}
          >
            <LogOut />
          </Button>
        </div>
      </header>
      <div className="teacher-layout">
        <aside className="teacher-sidebar">
          <div className="sidebar-label">课堂管理</div>
          <button
            className={cn("nav-item", tab === "overview" && "active")}
            onClick={() => setTab("overview")}
          >
            <LayoutDashboard size={18} />
            课堂总览
          </button>
          <button
            className={cn("nav-item", tab === "storage" && "active")}
            onClick={() => {
              setTab("storage");
              setSelected(null);
            }}
          >
            <Database size={18} />
            记录与存储
          </button>
          <div className="sidebar-bottom">
            <div className="text-xs leading-6 text-muted-foreground">
              用过程证据理解学习
              <br />
              预测 · 运行 · 观察 · 修正
            </div>
          </div>
        </aside>
        <main className="teacher-main">
          {error && (
            <div className="error-box" role="alert">
              {error}
              <button className="ml-3 underline" onClick={() => setError("")}>
                关闭
              </button>
            </div>
          )}
          {notice && <div className="hint-panel mb-4">{notice}</div>}
          {tab === "storage" ? (
            <Storage
              rooms={rooms}
              onRefresh={() => {
                refresh();
                void refreshRooms();
              }}
            />
          ) : selected ? (
            <Detail
              id={selected}
              live={summary.find((p) => p.id === selected)}
              onBack={() => setSelected(null)}
              onError={setError}
            />
          ) : (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">课堂驾驶舱</div>
                  <h1>每一次尝试，都看得见。</h1>
                  <p>观察全班进度，找到需要指导的那一步。</p>
                </div>
                <Button onClick={() => setCreateOpen(true)}>
                  <Plus />
                  开启新课堂
                </Button>
              </div>
              <div className="class-toolbar">
                <label className="field-label flex-1">
                  当前课堂
                  <select
                    value={roomId}
                    onChange={(e) => setRoomId(e.target.value)}
                  >
                    <option value="" disabled>
                      请选择课堂
                    </option>
                    {rooms.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name} ·{" "}
                        {roster?.data.classes.find(
                          (c: any) => c.id === r.class_id,
                        )?.name || r.class_id}
                        {r.active ? "" : "（已结束）"}
                      </option>
                    ))}
                  </select>
                </label>
                <Button
                  variant="outline"
                  onClick={() => {
                    refresh();
                    void refreshRooms();
                  }}
                >
                  <RefreshCw />
                  刷新
                </Button>
                <Button
                  variant="outline"
                  onClick={async () => {
                    try {
                      const v = await api("/teacher/roster/sync", {});
                      setRoster(v);
                      setNotice(
                        v.stale
                          ? "名单服务不可用，继续使用缓存。"
                          : "学生名单已同步。",
                      );
                    } catch (e: any) {
                      setError(e.message);
                    }
                  }}
                >
                  同步名单
                </Button>
                {room && (
                  <Button variant="outline" asChild>
                    <a href={`/api/teacher/classrooms/${roomId}/export`}>
                      <Download />
                      导出记录
                    </a>
                  </Button>
                )}
              </div>
              {room ? (
                <>
                  <div className="stats-grid">
                    <Stat
                      label="已加入学生"
                      value={`${joined} / ${cl?.students.length ?? "—"}`}
                      icon={<Users />}
                      note={`${summary.length} 个独立席位或合作小组`}
                    />
                    <Stat
                      label="三关全部完成"
                      value={String(passed)}
                      icon={<FlagIcon />}
                      note="按练习小组统计"
                    />
                    <Stat
                      label="验收题已提交"
                      value={`${answered} / ${joined * 3}`}
                      icon={<GraduationCap />}
                      note="每名学生独立记录三题"
                    />
                    <Stat
                      label="值得关注"
                      value={String(summary.filter(attention).length)}
                      icon={<Activity />}
                      note="重复出错或主动求助"
                    />
                  </div>
                  <Card className="class-controls">
                    <div>
                      <span
                        className={cn(
                          "status-pill",
                          room.active ? "success" : "neutral",
                        )}
                      >
                        {room.active ? "课堂进行中" : "课堂已结束"}
                      </span>
                      <span className="text-sm text-muted-foreground ml-3">
                        教师控制
                      </span>
                    </div>
                    <label className="text-sm flex gap-2 items-center">
                      探究关卡
                      <select
                        aria-label="开放关卡"
                        value={room.settings.openLevel}
                        onChange={(e) =>
                          void settings({
                            settings: {
                              ...room.settings,
                              openLevel: e.target.value,
                            },
                          })
                        }
                      >
                        <option value="all">全部开放</option>
                        {levels.map((l) => (
                          <option key={l.id} value={l.id}>
                            {l.title}
                          </option>
                        ))}
                      </select>
                    </label>
                    <Button
                      size="sm"
                      variant={room.settings.quizOpen ? "default" : "outline"}
                      onClick={() =>
                        void settings({
                          settings: {
                            ...room.settings,
                            quizOpen: !room.settings.quizOpen,
                          },
                        })
                      }
                    >
                      {room.settings.quizOpen ? "验收已开放" : "开放综合验收"}
                    </Button>
                    <Button
                      size="sm"
                      variant={
                        room.settings.answersOpen ? "default" : "outline"
                      }
                      onClick={() =>
                        void settings({
                          settings: {
                            ...room.settings,
                            answersOpen: !room.settings.answersOpen,
                          },
                        })
                      }
                    >
                      {room.settings.answersOpen
                        ? "收起讲评答案"
                        : "统一公布答案"}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void settings({ active: !room.active })}
                    >
                      {room.active ? "结束课堂" : "重新开启"}
                    </Button>
                  </Card>
                  <Card className="mt-5 overflow-hidden">
                    <div className="table-toolbar">
                      <div>
                        <h2>学生练习实况</h2>
                        <p>点击一行，观察画面与操作过程。</p>
                      </div>
                      <div className="flex gap-2">
                        <div className="search-input">
                          <Search size={15} />
                          <Input
                            aria-label="查找学生"
                            placeholder="查找姓名 / 学号"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                          />
                        </div>
                        <select
                          aria-label="筛选完成情况"
                          value={filter}
                          onChange={(e) => setFilter(e.target.value)}
                        >
                          <option value="all">全部学生</option>
                          <option value="attention">需要关注</option>
                          <option value="complete">三关完成</option>
                        </select>
                      </div>
                    </div>
                    <div className="table-scroll">
                      <table className="progress-table">
                        <thead>
                          <tr>
                            <th>学生 / 合作小组</th>
                            <th>当前任务</th>
                            {levels.map((l, i) => (
                              <th key={l.id} title={l.title}>
                                关卡 {i + 1}
                              </th>
                            ))}
                            <th>综合验收</th>
                            <th>实时状态</th>
                            <th />
                          </tr>
                        </thead>
                        <tbody>
                          {visible.map((p) => (
                            <tr
                              key={p.id}
                              tabIndex={0}
                              onClick={() => setSelected(p.id)}
                              onKeyDown={(e) =>
                                e.key === "Enter" && setSelected(p.id)
                              }
                            >
                              <td>
                                <strong>
                                  {p.members
                                    .map((m: any) => m.name)
                                    .join(" / ")}
                                </strong>
                                <small>
                                  {p.members.map((m: any) => m.id).join(" · ")}
                                </small>
                              </td>
                              <td>
                                <span>
                                  {activityNames[p.state?.activity] ||
                                    "刚刚进入"}
                                </span>
                                {attention(p) && (
                                  <small className="attention-text">
                                    {p.needs_help
                                      ? "举手求助"
                                      : "连续尝试，建议关注"}
                                  </small>
                                )}
                              </td>
                              {levels.map((l) => {
                                const a = p.attempts.find(
                                  (a: any) => a.level === l.id,
                                );
                                return (
                                  <td key={l.id}>
                                    {a ? (
                                      <span
                                        className={cn(
                                          "result-dot",
                                          a.passed ? "done" : "trying",
                                        )}
                                      >
                                        {a.passed ? (
                                          <CheckCircle2 size={17} />
                                        ) : (
                                          a.count
                                        )}
                                      </span>
                                    ) : (
                                      <span className="text-muted-foreground">
                                        —
                                      </span>
                                    )}
                                  </td>
                                );
                              })}
                              <td>
                                {p.members.map((m: any) => (
                                  <div className="text-xs leading-6" key={m.id}>
                                    {p.members.length > 1 ? m.name + "：" : ""}
                                    {
                                      p.answers.filter(
                                        (a: any) => a.student_id === m.id,
                                      ).length
                                    }
                                    /3 题 ·{" "}
                                    {p.answers
                                      .filter((a: any) => a.student_id === m.id)
                                      .reduce(
                                        (n: number, a: any) => n + a.score,
                                        0,
                                      )}
                                    /6 分
                                  </div>
                                ))}
                              </td>
                              <td>
                                <span
                                  className={cn(
                                    "status-pill",
                                    Date.now() - p.last_seen < 45000
                                      ? "success"
                                      : "neutral",
                                  )}
                                >
                                  {Date.now() - p.last_seen < 45000
                                    ? p.state?.running
                                      ? "正在运行"
                                      : "在线"
                                    : "离线"}
                                </span>
                              </td>
                              <td>
                                <Eye size={17} />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {!visible.length && (
                      <div className="empty-state">
                        <Monitor />
                        <h3>等待学生加入</h3>
                        <p>学生打开本站，选择班级和姓名即可进入。</p>
                      </div>
                    )}
                  </Card>
                  {cl && (
                    <div className="absent-list">
                      <span>尚未加入 · </span>
                      {cl.students
                        .filter(
                          (s: any) =>
                            !summary.some((p) =>
                              p.members.some((m: any) => m.id === s.id),
                            ),
                        )
                        .map((s: any) => s.name)
                        .join("、") || "全班已经加入"}
                    </div>
                  )}
                </>
              ) : (
                <div className="empty-state large">
                  <Satellite />
                  <h2>为今天的探索开启一间课堂</h2>
                  <p>选择已有班级，学生即可从姓名列表进入。</p>
                  <Button onClick={() => setCreateOpen(true)}>
                    <Plus />
                    开启新课堂
                  </Button>
                </div>
              )}
            </>
          )}
        </main>
      </div>
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogTitle className="text-xl font-semibold">
            开启新课堂
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            每次课堂单独保存记录，方便观察和清理。
          </DialogDescription>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setCreating(true);
              try {
                const r = await api("/teacher/classrooms", {
                  classId: newClass,
                  name: newName,
                });
                await refreshRooms();
                setRoomId(r.id);
                setCreateOpen(false);
              } catch (e: any) {
                setError(e.message);
              } finally {
                setCreating(false);
              }
            }}
          >
            <label className="field-label">
              班级
              <select
                value={newClass}
                required
                onChange={(e) => setNewClass(e.target.value)}
              >
                <option value="">选择班级</option>
                {roster?.data.classes.map((c: any) => (
                  <option key={c.id} value={c.id}>
                    {c.name}（{c.students.length} 人）
                  </option>
                ))}
              </select>
            </label>
            <label className="field-label mt-4">
              课堂名称
              <Input
                maxLength={80}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                required
              />
            </label>
            <Button className="mt-5 w-full" disabled={creating}>
              {creating ? "正在开启……" : "开启课堂"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
function FlagIcon() {
  return <CheckCircle2 />;
}
function Stat({
  label,
  value,
  icon,
  note,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  note: string;
}) {
  return (
    <Card className="stat-card">
      <div>
        <span>{label}</span>
        {icon}
      </div>
      <strong>{value}</strong>
      <small>{note}</small>
    </Card>
  );
}
function Detail({
  id,
  live,
  onBack,
  onError,
}: {
  id: string;
  live: any;
  onBack: () => void;
  onError: (s: string) => void;
}) {
  const [detail, setDetail] = useState<any>(null),
    [mode, setMode] = useState<"live" | "replay">("live"),
    [events, setEvents] = useState<any[]>([]),
    [hasMore, setHasMore] = useState(false),
    [index, setIndex] = useState(0),
    [playing, setPlaying] = useState(false),
    [speed, setSpeed] = useState(1),
    [anonymous, setAnonymous] = useState(false),
    [loading, setLoading] = useState(false),
    [reviewStudent, setReviewStudent] = useState(""),
    [score, setScore] = useState(0),
    [note, setNote] = useState(""),
    [saved, setSaved] = useState(false);
  const [editing, setEditing] = useState(false),
    [showAnswer, setShowAnswer] = useState(false),
    [workingPlan, setWorkingPlan] = useState<Plan | null>(null);
  const saveQueue = useRef<Promise<unknown>>(Promise.resolve());
  const load = useCallback(
    () =>
      api(`/teacher/participants/${id}`)
        .then((v) => {
          setDetail(v);
          setReviewStudent((s) => s || v.members[0].id);
        })
        .catch((e) => onError(e.message)),
    [id, onError],
  );
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    setSaved(false);
    const r = detail?.reviews.find((v: any) => v.student_id === reviewStudent);
    setScore(r?.score || 0);
    setNote(r?.note || "");
  }, [reviewStudent, detail]);
  useEffect(() => {
    if (!playing || mode !== "replay" || !events.length) return;
    if (index >= events.length - 1) {
      setPlaying(false);
      return;
    }
    const delta =
      Math.max(
        40,
        Math.min(2000, events[index + 1].client_at - events[index].client_at),
      ) / speed;
    const t = setTimeout(() => setIndex((i) => i + 1), delta);
    return () => clearTimeout(t);
  }, [playing, index, events, speed, mode]);
  async function history(older = false) {
    setLoading(true);
    try {
      const d = await api(
        `/teacher/participants/${id}/events${older && events.length ? "?before=" + events[0].seq : ""}`,
      );
      setEvents((es) => (older ? [...d.events, ...es] : d.events));
      setIndex((i) => (older ? i + d.events.length : 0));
      setHasMore(d.hasMore);
      setMode("replay");
      setPlaying(false);
    } catch (e: any) {
      onError(e.message);
    } finally {
      setLoading(false);
    }
  }
  const snapshot =
      mode === "live" ? live?.state || detail?.state : events[index]?.snapshot,
    members = (detail?.members || []).map((m: any, i: number) => ({
      ...m,
      name: anonymous ? `顾问 ${i + 1}` : m.name,
    }));
  const currentLevel = levels.find((l) => l.id === snapshot?.activity),
    flowCheck =
      currentLevel && snapshot?.plan?.nodes
        ? validateFlow(currentLevel, snapshot.plan)
        : null;
  const correct = (plan: Plan) => {
    setWorkingPlan(plan);
    saveQueue.current = saveQueue.current.catch(() => {}).then(async () => {
      const response = await api(`/teacher/participants/${id}/plan`, { plan }, "PATCH");
      setDetail((previous: any) => previous && { ...previous, state: response.snapshot });
    }).catch((error: Error) => onError(error.message));
  };
  return (
    <div>
      <div className="detail-heading">
        <div>
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft />
            全班概览
          </Button>
          <h1>{members.map((m: any) => m.name).join(" / ") || "正在加载"}</h1>
          <p className="text-muted-foreground text-sm">
            {mode === "live"
              ? "同步练习区域、巡视方案和鼠标位置"
              : "只查看流程图变化、预测答案与运行结果，跳过鼠标和动画过程"}
          </p>
        </div>
        <div className="flex items-center flex-wrap gap-2">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={anonymous}
              onChange={(e) => setAnonymous(e.target.checked)}
            />
            匿名讲评
          </label>
          <Button
            variant={mode === "live" ? "default" : "outline"}
            onClick={() => {
              setMode("live");
              setPlaying(false);
              void load();
            }}
          >
            <Monitor />
            实时画面
          </Button>
          <Button
            variant={mode === "replay" ? "default" : "outline"}
            disabled={loading}
            onClick={() => void history()}
          >
            <FolderClock />
            方案记录
          </Button>
        </div>
      </div>
      {mode === "live" && (
        <div className="monitor-status">
          <span
            className={cn(
              "live-dot",
              Date.now() - (live?.last_seen || detail?.last_seen || 0) >
                45000 && "offline-dot",
            )}
          />
          {Date.now() - (live?.last_seen || detail?.last_seen || 0) > 45000
            ? "学生已离线，显示最后同步画面"
            : "正在同步学生练习画面"}
          <span className="ml-auto">
            最后活动 {time(live?.last_seen || detail?.last_seen || Date.now())}
          </span>
        </div>
      )}
      {mode === "replay" && (
        <Card className="replay-controls">
          <div className="flex gap-2 items-center">
            <Button
              size="icon"
              aria-label={playing ? "暂停回放" : "播放回放"}
              disabled={!events.length}
              onClick={() => {
                if (index === events.length - 1) setIndex(0);
                setPlaying((p) => !p);
              }}
            >
              {playing ? <Pause /> : <Play />}
            </Button>
            <select
              aria-label="回放速度"
              value={speed}
              onChange={(e) => setSpeed(Number(e.target.value))}
            >
              {[0.5, 1, 2, 4].map((n) => (
                <option key={n} value={n}>
                  {n} 倍速
                </option>
              ))}
            </select>
            <span className="text-xs text-muted-foreground">
              {events.length
                ? `${index + 1} / ${events.length} · ${time(events[index]?.client_at)}`
                : "暂无操作记录"}
            </span>
            {hasMore && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => void history(true)}
                disabled={loading}
              >
                加载更早记录
              </Button>
            )}
          </div>
          <input
            aria-label="回放时间轴"
            type="range"
            min={0}
            max={Math.max(0, events.length - 1)}
            value={index}
            onChange={(e) => {
              setPlaying(false);
              setIndex(Number(e.target.value));
            }}
          />
          <div className="text-sm">
            {events[index]?.label || "回放可能已过保留期，成绩仍可在下方查看。"}
          </div>
          <select
            aria-label="跳转到方案或预测"
            value={events[index]?.kind === "pointer" ? "" : String(index)}
            onChange={(e) => {
              if (e.target.value) {
                setIndex(Number(e.target.value));
                setPlaying(false);
              }
            }}
          >
            <option value="">跳转到方案或预测……</option>
            {events.map((e, i) =>
              e.kind !== "pointer" && e.kind !== "step" ? (
                <option key={e.seq} value={i}>
                  {time(e.client_at)} · {e.label}
                </option>
              ) : null,
            )}
          </select>
        </Card>
      )}
      {mode === "live" && currentLevel && snapshot?.plan && (
        <div className="teacher-flow-tools">
          <div className="teacher-flow-actions">
            <strong>学生流程图</strong>
            <div className="flex gap-2">
              <Button size="sm" variant={editing ? "default" : "outline"} onClick={() => {
                if (!editing) setWorkingPlan(snapshot.plan);
                setEditing(!editing);
                setShowAnswer(false);
              }}><Pencil size={15}/>{editing ? "完成修正" : "修正流程图"}</Button>
              <Button size="sm" variant={showAnswer ? "default" : "outline"} onClick={() => setShowAnswer(!showAnswer)}>
                <Eye size={15}/>{showAnswer ? "收起标准答案" : "显示标准答案"}
              </Button>
            </div>
          </div>
          {showAnswer && <Flow level={currentLevel} plan={referencePlan(currentLevel.id)} frame={initialFrame(currentLevel)} onPlan={() => {}} readonly />}
          {editing && !showAnswer && <Flow key={`${id}-${currentLevel.id}`} level={currentLevel} plan={workingPlan || snapshot.plan} frame={initialFrame(currentLevel)} onPlan={correct} readonly={false} />}
        </div>
      )}
      <Card className="p-4 mb-4">
        <div className="section-label mb-3">各关预测记录</div>
        <div className="grid grid-cols-2 gap-3">
          {levels.map((l) => {
            const recorded = detail?.predictions?.find(
              (v: any) => v.level === l.id,
            )?.prediction;
            const prediction =
              snapshot?.activity === l.id
                ? snapshot.prediction || recorded
                : recorded;
            return (
              <div key={l.id} className="rounded-lg border p-3 text-sm">
                <span className="text-muted-foreground">{l.title}</span>
                <strong className="block mt-1">
                  {prediction || "尚未作答"}
                </strong>
              </div>
            );
          })}
        </div>
      </Card>
      {!editing && <Card className="monitor-frame">
        {snapshot ? (
          <Screen snapshot={snapshot} members={members} />
        ) : (
          <div className="empty-state">
            <Monitor />
            <p>学生尚未开始操作。</p>
          </div>
        )}
      </Card>}
      {flowCheck && (
        <div className="flow-evidence">
          <span>
            外层判断：
            {snapshot.plan.nodes.filter((n: any) => n.role === "loop-condition")
              .length === 1
              ? "已摆放"
              : "待补齐"}
          </span>
          {currentLevel?.id === "l2" && (
            <span>
              内部分支：
              {flowCheck.issues.some((v) =>
                ["INNER_DECISION", "BRANCH", "TURN_BRANCH", "MERGE"].includes(
                  v.code,
                ),
              )
                ? "待补齐"
                : "已连接"}
            </span>
          )}
          <span>
            返回箭头：
            {snapshot.plan.edges?.filter((e: any) => e.kind === "return")
              .length === 1 &&
            !flowCheck.issues.some((v) =>
              ["RETURN", "RETURN_TARGET", "REPEAT_BRANCH"].includes(v.code),
            )
              ? "已连接"
              : "待检查"}
          </span>
          <strong>{flowCheck.valid ? "流程完整" : "流程待完善"}</strong>
        </div>
      )}
      {detail && (
        <div className="detail-records">
          <Card className="p-5">
            <div className="flex justify-between items-center">
              <h2 className="font-semibold">尝试与作答记录</h2>
              {live?.needs_help === 1 && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    try {
                      await api(`/teacher/participants/${id}/ack-help`, {});
                    } catch (e: any) {
                      onError(e.message);
                    }
                  }}
                >
                  已处理求助
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={() => void load()}>
                <RefreshCw />
                刷新
              </Button>
            </div>
            <div className="attempt-history">
              {detail.attempts.map((a: any) => (
                <div className="attempt-record" key={a.id}>
                  <span className={cn("result-dot", a.win ? "done" : "trying")}>
                    {a.win ? <CheckCircle2 size={16} /> : <Clock3 size={16} />}
                  </span>
                  <div>
                    <strong>{activityNames[a.level]}{levels.find((l) => l.id === a.level)?.timingMode === "compare" ? ` · ${a.plan.timing === "pre" ? "先判断" : "先执行"}` : ""}</strong>
                    <p>{a.reason}</p>
                    <small>
                      预测：{a.prediction} ·{" "}
                      {a.assisted ? "提示后尝试" : "自主尝试"} · {time(a.at)}
                    </small>
                  </div>
                </div>
              ))}
            </div>
            <div className="timing-evidence">
              {levels
                .filter((l) => l.timingMode === "compare")
                .map((l) => {
                  const records = detail.attempts.filter(
                      (a: any) =>
                        a.level === l.id &&
                        a.plan.nodes &&
                        validateFlow(l, a.plan).valid,
                    ),
                    pre = records.filter((a: any) => a.plan.timing === "pre"),
                    post = records.filter((a: any) => a.plan.timing === "post"),
                    compared = pre.some((a: any) =>
                      post.some(
                        (b: any) =>
                          a.plan.condition === b.plan.condition &&
                          validateFlow(l, a.plan).body.join(",") ===
                            validateFlow(l, b.plan).body.join(","),
                      ),
                    );
                  return (
                    <p key={l.id}>
                      <strong>{l.title}</strong> · 先判断 {pre.length} 次 ·
                      先执行 {post.length} 次<br />
                      <span>
                        {compared
                          ? "已用同一循环体完成对照"
                          : "尚未完成同一方案的对照"}
                      </span>
                    </p>
                  );
                })}
            </div>
            {detail.answers.map((a: any) => (
              <div className="answer-record" key={a.id}>
                <strong>
                  {members.find((m: any) => m.id === a.student_id)?.name} ·{" "}
                  {activityNames[a.question]}{" "}
                  <span className="small-tag">{a.score}/2 分</span>
                </strong>
                {quizzes
                  .find((q) => q.id === a.question)
                  ?.questions.map((q, i) => (
                    <p key={i}>
                      {q.text} {q.options[a.answers[i]]}
                    </p>
                  ))}
                {a.note && <p>补充理由：{a.note}</p>}
              </div>
            ))}
          </Card>
          <Card className="p-5">
            <h2 className="font-semibold">过程表现 · 教师核定</h2>
            <p className="text-xs text-muted-foreground mt-2 mb-4">
              结合预测、流程图与返回箭头、修正与合作、如实记录四项证据，每项 1
              分，共 4 分。
            </p>
            <label className="field-label">
              学生
              <select
                value={reviewStudent}
                onChange={(e) => setReviewStudent(e.target.value)}
              >
                {members.map((m: any) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field-label mt-4">
              核定分数
              <select
                value={score}
                onChange={(e) => setScore(Number(e.target.value))}
              >
                {[0, 1, 2, 3, 4].map((n) => (
                  <option key={n} value={n}>
                    {n} 分
                  </option>
                ))}
              </select>
            </label>
            <Textarea
              className="mt-4"
              placeholder="记录合作表现与举证情况……"
              maxLength={1000}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <Button
              className="mt-4"
              onClick={async () => {
                try {
                  await api(
                    `/teacher/participants/${id}/review`,
                    { studentId: reviewStudent, score, note },
                    "PUT",
                  );
                  setSaved(true);
                } catch (e: any) {
                  onError(e.message);
                }
              }}
            >
              {saved ? "已保存" : "保存核定"}
            </Button>
          </Card>
        </div>
      )}
    </div>
  );
}
function Storage({
  rooms,
  onRefresh,
}: {
  rooms: any[];
  onRefresh: () => void;
}) {
  const [stats, setStats] = useState<any>(null),
    [roomId, setRoomId] = useState(""),
    [participantId, setParticipantId] = useState(""),
    [students, setStudents] = useState<any[]>([]),
    [days, setDays] = useState(""),
    [replaysOnly, setReplaysOnly] = useState(true),
    [preview, setPreview] = useState<any>(null),
    [confirmation, setConfirmation] = useState(""),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const load = useCallback(
    () =>
      api("/teacher/storage")
        .then(setStats)
        .catch((e) => setError(e.message)),
    [],
  );
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    setParticipantId("");
    setPreview(null);
    if (roomId)
      api(`/teacher/classrooms/${roomId}/summary`)
        .then(setStudents)
        .catch((e) => setError(e.message));
    else setStudents([]);
  }, [roomId]);
  const criteria = {
    ...(roomId ? { classroomId: roomId } : {}),
    ...(participantId ? { participantId } : {}),
    ...(days ? { inactiveDays: Number(days) } : {}),
    replaysOnly,
  };
  return (
    <div>
      <div className="page-heading">
        <div>
          <div className="eyebrow">数据管理</div>
          <h1>让课堂记录，按需留存。</h1>
          <p>先导出需要的证据，再清理历史记录。班级和学生名单不受影响。</p>
        </div>
        <Button
          variant="outline"
          onClick={async () => {
            setBusy(true);
            try {
              await api("/teacher/storage/compact", {});
              await load();
              setMessage("已整理数据库并回收空闲磁盘空间。");
            } catch (e: any) {
              setError(e.message);
            } finally {
              setBusy(false);
            }
          }}
          disabled={busy}
        >
          <Database />
          回收空闲空间
        </Button>
      </div>
      {error && (
        <div className="error-box" role="alert">
          {error}
        </div>
      )}
      {message && <div className="hint-panel mb-4">{message}</div>}
      <div className="stats-grid">
        <Stat
          label="数据库磁盘占用"
          value={stats ? `${(stats.bytes / 1024 / 1024).toFixed(2)} MB` : "—"}
          icon={<Database />}
          note="包含数据库与写入日志"
        />
        <Stat
          label="关键状态保留"
          value={`${stats?.replayDays ?? "—"} 天`}
          icon={<FolderClock />}
          note="过期自动删除回放，暂留成绩"
        />
        <Stat
          label="未活动记录保留"
          value={`${stats?.recordDays ?? "—"} 天`}
          icon={<Clock3 />}
          note="超过期限自动清理做题记录"
        />
        <Stat
          label="已保存关键状态"
          value={String(stats?.events ?? "—")}
          icon={<Activity />}
          note={`每组最多保留 ${stats?.maxEvents ?? "—"} 条`}
        />
      </div>
      <Card className="cleanup-card">
        <div>
          <h2>清理练习记录</h2>
          <p className="text-muted-foreground text-sm mt-2">
            两人合作的探究记录属于同一组，清理该组会同时影响两位成员。
          </p>
        </div>
        <div className="cleanup-fields">
          <label className="field-label">
            课堂范围
            <select value={roomId} onChange={(e) => setRoomId(e.target.value)}>
              <option value="">全部课堂</option>
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} · {date(r.created_at)}
                </option>
              ))}
            </select>
          </label>
          <label className="field-label">
            学生 / 小组
            <select
              value={participantId}
              disabled={!roomId}
              onChange={(e) => {
                setParticipantId(e.target.value);
                setPreview(null);
              }}
            >
              <option value="">全部学生</option>
              {students.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.members.map((m: any) => m.name).join(" / ")}
                </option>
              ))}
            </select>
          </label>
          <label className="field-label">
            最后活动时间
            <select
              value={days}
              onChange={(e) => {
                setDays(e.target.value);
                setPreview(null);
              }}
            >
              <option value="">不限，包含当前课堂记录</option>
              <option value="7">超过 7 天未活动</option>
              <option value="30">超过 30 天未活动</option>
              <option value="90">超过 90 天未活动</option>
            </select>
          </label>
          <label className="field-label">
            清理内容
            <select
              value={replaysOnly ? "replays" : "all"}
              onChange={(e) => {
                setReplaysOnly(e.target.value === "replays");
                setPreview(null);
              }}
            >
              <option value="replays">仅操作回放，保留成绩与作答</option>
              <option value="all">全部做题记录，学生需重新进入</option>
            </select>
          </label>
        </div>
        <Button
          variant="outline"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              setPreview(await api("/teacher/cleanup/preview", criteria));
              setConfirmation("");
            } catch (e: any) {
              setError(e.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <Search />
          预览清理范围
        </Button>
      </Card>
      <Dialog
        open={!!preview}
        onOpenChange={(v) => {
          if (!v) setPreview(null);
        }}
      >
        <DialogContent>
          <DialogTitle className="text-xl font-semibold">
            确认清理这些记录
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            {replaysOnly
              ? "只删除操作回放，保留练习成绩。"
              : "删除后学生需重新选择姓名进入；本机未上传的旧记录也会失效。"}
            此操作无法撤销，请先导出需要的记录。
          </DialogDescription>
          {preview && (
            <div className="cleanup-preview">
              <p>
                {preview.groups} 个小组 · {preview.students} 名学生
              </p>
              <p>{preview.events} 条操作事件</p>
              <p>
                {preview.attempts} 次闯关尝试 · {preview.answers} 份验收作答
              </p>
            </div>
          )}
          <label className="field-label">
            输入“清理”确认
            <Input
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              placeholder="清理"
            />
          </label>
          <Button
            variant="destructive"
            disabled={confirmation !== "清理" || busy}
            onClick={async () => {
              setBusy(true);
              try {
                await api("/teacher/cleanup", {
                  ...criteria,
                  token: preview.token,
                  confirmation,
                });
                setPreview(null);
                await load();
                onRefresh();
                setMessage("记录已清理，数据库空闲空间已回收。");
              } catch (e: any) {
                setError(e.message);
                setPreview(null);
              } finally {
                setBusy(false);
              }
            }}
          >
            <Trash2 />
            {busy ? "正在清理……" : "确认清理"}
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
