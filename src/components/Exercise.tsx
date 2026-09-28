import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronRight,
  Flag,
  Lightbulb,
  MousePointer2,
  Play,
  Plus,
  Radio,
  RotateCcw,
  Satellite,
  Square,
  Trash2,
} from "lucide-react";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Textarea } from "./ui/input";
import {
  blocks,
  conditions,
  levels,
  quizzes,
  initialFrame,
  initialPlan,
  type Snapshot,
  type Plan,
  type Level,
  type Frame,
} from "../../shared/engine";
import { cn } from "../lib/utils";
export type Change = (
  patch: Partial<Snapshot>,
  kind?: string,
  label?: string,
) => void;
export function MoonBoard({
  level: l,
  frame: s,
}: {
  level: Level;
  frame: Frame;
}) {
  return (
    <div className="moon-panel">
      <div className="map-caption">
        <span>
          <span className="live-dot" /> 月面遥测
        </span>
        <span>SIMULATION / {l.id.toUpperCase()}</span>
      </div>
      <div
        className="moon-grid"
        style={{
          gridTemplateColumns: `repeat(${l.cols},minmax(0,1fr))`,
          maxWidth: l.cols <= 3 ? 330 : 550,
        }}
      >
        {Array.from({ length: l.cols * l.rows }, (_, i) => {
          const x = i % l.cols,
            y = Math.floor(i / l.cols),
            key = `${x},${y}`,
            crater = l.craters.includes(key),
            sample = l.samples?.findIndex(([a, b]) => a === x && b === y) ?? -1,
            start = x === l.start[0] && y === l.start[1],
            target = l.target?.[0] === x && l.target[1] === y,
            rover = s.x === x && s.y === y,
            scanned = s.scanned.includes(sample);
          return (
            <div
              key={key}
              className={cn(
                "moon-cell",
                crater && "crater",
                !crater && "safe",
                s.visited.includes(key) && "visited",
                start && "base",
                target && "target",
                sample === 7 && scanned && "ice",
              )}
            >
              {crater ? (
                <span className="crater-mark" />
              ) : rover ? (
                <div
                  className="rover"
                  style={{ transform: `rotate(${s.d * 90}deg)` }}
                >
                  ➤
                </div>
              ) : target ? (
                <Flag size={20} />
              ) : start ? (
                <Satellite size={18} />
              ) : (
                <span className="cell-dot" />
              )}
              <span className="cell-label">
                {crater
                  ? "撞击坑"
                  : sample >= 0
                    ? `${sample + 1}号${scanned ? (sample === 7 ? "水冰" : "无信号") : ""}`
                    : target
                      ? l.id === "l1"
                        ? "中继塔"
                        : "营地"
                      : start
                        ? "基地"
                        : ""}
              </span>
            </div>
          );
        })}
      </div>
      <div className="map-legend">
        <span>
          <i className="legend-safe" />
          安全路线
        </span>
        <span>
          <i className="legend-visited" />
          已巡视
        </span>
        <span>方向：{["东", "南", "西", "北"][s.d]}</span>
      </div>
    </div>
  );
}
function Flow({
  plan,
  active,
  onPlan,
  readonly,
}: {
  plan: Plan;
  active: Frame["active"];
  onPlan: (p: Plan) => void;
  readonly: boolean;
}) {
  const body = (
    <div className="loop-body">
      <span className="flow-label">循环体</span>
      {plan.body.map((id, i) => (
        <div key={`${id}-${i}`}>
          <div
            className={cn(
              "flow-block",
              active === i && "executing",
              id === "if_left" && "branch-block",
            )}
          >
            <span className="step-number">{i + 1}</span>
            <span className="flex-1">
              {id === "if_left" && <span aria-hidden="true">◇ </span>}
              {blocks[id]}
              {id === "if_left" && (
                <small className="block-note">是 → 左转　否 → 直接往下</small>
              )}
            </span>
            <div className="block-actions">
              <button
                disabled={readonly || i === 0}
                aria-label={`上移第${i + 1}块`}
                onClick={() => {
                  const a = [...plan.body];
                  [a[i - 1], a[i]] = [a[i], a[i - 1]];
                  onPlan({ ...plan, body: a });
                }}
              >
                <ArrowUp size={13} />
              </button>
              <button
                disabled={readonly || i === plan.body.length - 1}
                aria-label={`下移第${i + 1}块`}
                onClick={() => {
                  const a = [...plan.body];
                  [a[i + 1], a[i]] = [a[i], a[i + 1]];
                  onPlan({ ...plan, body: a });
                }}
              >
                <ArrowDown size={13} />
              </button>
              <button
                disabled={readonly}
                aria-label={`删除第${i + 1}块`}
                onClick={() =>
                  onPlan({ ...plan, body: plan.body.filter((_, k) => k !== i) })
                }
              >
                <Trash2 size={13} />
              </button>
            </div>
          </div>
          <ArrowDown className="flow-arrow" size={17} />
        </div>
      ))}
      <div
        className="drop-zone"
        onDragOver={(e) => {
          if (!readonly) e.preventDefault();
        }}
        onDrop={(e) => {
          e.preventDefault();
          const id = e.dataTransfer.getData("text/plain");
          if (!readonly && blocks[id] && plan.body.length < 8)
            onPlan({ ...plan, body: [...plan.body, id] });
        }}
      >
        <Plus size={16} />
        点击上方积木，或拖到这里
      </div>
    </div>
  );
  const condition = (
    <div className="condition-row">
      <div
        className={cn("condition-node", active === "condition" && "executing")}
      >
        <svg
          className="condition-shape"
          viewBox="0 0 240 108"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path d="M120 1 L239 54 L120 107 L1 54 Z" />
        </svg>
        <span className="text-xs opacity-60">循环判断条件</span>
        <strong>{conditions[plan.condition]}</strong>
      </div>
      <span className="stop-branch">是 → 结束</span>
    </div>
  );
  return (
    <div className="flow-diagram">
      <div className="flow-terminal">开始</div>
      <ArrowDown className="flow-arrow" size={18} />
      <div className="loop-rail">
        <div className="return-label">返回</div>
        {plan.timing === "pre" ? (
          <>
            {condition}
            <div className="flow-connector">否 ↓</div>
            {body}
          </>
        ) : (
          <>
            {body}
            <ArrowDown className="flow-arrow" size={18} />
            {condition}
            <div className="flow-connector">否 → 返回循环体</div>
          </>
        )}
      </div>
    </div>
  );
}
export function Exercise({
  snapshot: s,
  onChange = () => {},
  onRun = () => {},
  onStop = () => {},
  readonly = false,
  answersOpen = false,
  attempts = [],
}: {
  snapshot: Snapshot;
  onChange?: Change;
  onRun?: () => void;
  onStop?: () => void;
  readonly?: boolean;
  answersOpen?: boolean;
  attempts?: any[];
}) {
  const l = levels.find((l) => l.id === s.activity);
  if (!l) return null;
  const plan = s.plan || initialPlan(l.id),
    frame = s.frame || initialFrame(l);
  const edit = (p: Plan) => {
    if (p.body.some((b) => !l.blocks.includes(b))) return;
    onChange(
      { plan: p, frame: initialFrame(l), running: false, result: undefined },
      "edit",
      "修改巡视方案",
    );
  };
  return (
    <div className="exercise">
      <div className="mission-heading">
        <div>
          <div className="eyebrow">任务 {l.id.slice(1)} / 04</div>
          <h2>{l.title}</h2>
          <p>{l.task}</p>
        </div>
        <div className="orbit-icon">
          <Satellite />
        </div>
      </div>
      <div className="exercise-columns">
        <div className="space-y-4">
          <MoonBoard level={l} frame={frame} />
          <div className="telemetry">
            <div>
              <strong>
                {frame.rounds}
                <small>轮</small>
              </strong>
              <span>循环次数</span>
            </div>
            <div>
              <strong>
                {frame.steps}
                <small>步</small>
              </strong>
              <span>执行动作</span>
            </div>
            <div>
              <strong>
                {frame.battery}
                <small>格</small>
              </strong>
              <span>剩余电量</span>
            </div>
          </div>
          <Card className="p-4">
            <div className="section-label">
              <Radio size={15} />
              先预测，再运行
            </div>
            <p className="my-3 text-sm">{l.prediction}</p>
            <div className="flex flex-wrap gap-2">
              {l.options.map((v) => (
                <Button
                  key={v}
                  variant={s.prediction === v ? "default" : "outline"}
                  size="sm"
                  disabled={readonly || s.running}
                  onClick={() =>
                    onChange({ prediction: v }, "predict", `预测：${v}`)
                  }
                >
                  {s.prediction === v && <Check />}
                  {v}
                </Button>
              ))}
            </div>
          </Card>
          <div className="flex flex-wrap gap-2">
            <Button
              className="flex-1"
              disabled={readonly || !s.prediction || !plan.body.length}
              onClick={s.running ? onStop : onRun}
            >
              {s.running ? <Square /> : <Play />}
              {s.running ? "停止模拟" : "开始模拟"}
            </Button>
            <Button
              variant="outline"
              disabled={readonly || s.running}
              onClick={() =>
                onChange(
                  { frame: initialFrame(l), result: undefined },
                  "edit",
                  "复位地图",
                )
              }
            >
              <RotateCcw />
              复位
            </Button>
            <Button
              variant="ghost"
              disabled={readonly}
              onClick={() =>
                onChange(
                  { hint: !s.hint },
                  "hint",
                  s.hint ? "收起提示" : "查看提示",
                )
              }
            >
              <Lightbulb />
              提示
            </Button>
          </div>
          {!s.prediction && (
            <p className="text-xs text-muted-foreground">
              先留下你的预测，就可以开始模拟。
            </p>
          )}
          {s.hint && <div className="hint-panel">{l.hint}</div>}
          <div className={cn("run-status", s.result && "has-result")}>
            <span className="live-dot" />
            {frame.text}
          </div>
          {attempts.length > 0 && (
            <div className="comparison">
              <div className="section-label">我的对照记录</div>
              {(["pre", "post"] as const).map((t) => {
                const a = attempts
                  .filter((a) => a.level === l.id && a.plan.timing === t)
                  .at(-1);
                return (
                  <div key={t}>
                    <span>{t === "pre" ? "先判断" : "先执行"}</span>
                    <strong>{a ? a.reason : "尚未运行"}</strong>
                  </div>
                );
              })}
            </div>
          )}
          <label className="block text-sm">
            <span className="section-label mb-2">观察与修正</span>
            <Textarea
              placeholder="我发现……所以我把……"
              maxLength={1000}
              value={s.explanation || ""}
              disabled={readonly}
              onChange={(e) =>
                onChange(
                  { explanation: e.target.value },
                  "explain",
                  "补充观察与修正理由",
                )
              }
            />
          </label>
        </div>
        <Card className="designer">
          <div className="designer-heading">
            <div>
              <span className="section-label">巡视方案</span>
              <p className="text-xs text-muted-foreground mt-1">
                反复做什么，依据什么停止？
              </p>
            </div>
            <span className="small-tag">{plan.body.length} / 8 积木</span>
          </div>
          <div className="p-4 space-y-4">
            <label className="field-label">
              停止条件
              <select
                disabled={readonly || s.running}
                value={plan.condition}
                onChange={(e) => edit({ ...plan, condition: e.target.value })}
              >
                {l.conditions.map((c) => (
                  <option value={c} key={c}>
                    {conditions[c]}
                  </option>
                ))}
              </select>
            </label>
            <div className="segmented">
              {(["pre", "post"] as const).map((t) => (
                <button
                  key={t}
                  disabled={readonly || s.running}
                  className={plan.timing === t ? "selected" : ""}
                  onClick={() => edit({ ...plan, timing: t })}
                >
                  {t === "pre" ? "先判断，再执行" : "先执行，再判断"}
                </button>
              ))}
            </div>
            <div className="palette">
              {l.blocks.map((id) => (
                <button
                  key={id}
                  draggable={!readonly && !s.running}
                  onDragStart={(e) => e.dataTransfer.setData("text/plain", id)}
                  disabled={readonly || s.running || plan.body.length >= 8}
                  onClick={() => edit({ ...plan, body: [...plan.body, id] })}
                >
                  <Plus size={13} />
                  {blocks[id]}
                </button>
              ))}
            </div>
          </div>
          <Flow
            plan={plan}
            active={frame.active}
            onPlan={edit}
            readonly={readonly || !!s.running}
          />
          {answersOpen && (
            <div className="p-4 border-t">
              <Button
                size="sm"
                variant="secondary"
                disabled={readonly || s.running}
                onClick={() =>
                  onChange(
                    {
                      plan: structuredClone(l.answer),
                      frame: initialFrame(l),
                      hint: true,
                    },
                    "hint",
                    "填入教师公布的参考方案",
                  )
                }
              >
                填入讲评参考方案
              </Button>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
export function QuizView({
  snapshot: s,
  onChange = () => {},
  onSubmit = () => {},
  readonly = false,
  submitted = false,
  members = [],
}: {
  snapshot: Snapshot;
  onChange?: Change;
  onSubmit?: () => void;
  readonly?: boolean;
  submitted?: boolean;
  members?: any[];
}) {
  const q = quizzes.find((q) => q.id === s.activity);
  if (!q) return null;
  return (
    <div className="quiz-view">
      <div className="eyebrow">飞控顾问验收 / 每题 2 分</div>
      <h2>{q.title}</h2>
      <p className="text-muted-foreground mt-2">
        先独立完成，再用理由解释。提交后等待老师统一讲评。
      </p>
      <Card className="p-5 mt-6">
        <p className="leading-7">{q.description}</p>
      </Card>
      {members.length > 1 && (
        <label className="field-label mt-5">
          当前独立作答的同学
          <select
            disabled={readonly}
            value={s.selectedStudent || members[0].id}
            onChange={(e) =>
              onChange(
                {
                  selectedStudent: e.target.value,
                  answers: [-1, -1],
                  note: "",
                },
                "operator",
                "切换独立作答同学",
              )
            }
          >
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {q.questions.map((question, i) => (
        <div className="quiz-question" key={i}>
          <h3>
            <span>0{i + 1}</span>
            {question.text}
          </h3>
          <div className="space-y-2">
            {question.options.map((v, k) => (
              <button
                key={v}
                disabled={readonly || submitted}
                className={cn("quiz-option", s.answers?.[i] === k && "chosen")}
                onClick={() => {
                  const a = [...(s.answers || [-1, -1])];
                  a[i] = k;
                  onChange({ answers: a }, "answer", `选择第 ${i + 1} 小问`);
                }}
              >
                <span>{String.fromCharCode(65 + k)}</span>
                {v}
                {s.answers?.[i] === k && <Check className="ml-auto size-4" />}
              </button>
            ))}
          </div>
        </div>
      ))}
      <label className="field-label">
        补充理由（选填）
        <Textarea
          disabled={readonly || submitted}
          value={s.note || ""}
          maxLength={1000}
          placeholder="也可以用自己的话说明原因……"
          onChange={(e) =>
            onChange({ note: e.target.value }, "answer", "补充验收理由")
          }
        />
      </label>
      <Button
        className="mt-5"
        disabled={
          readonly || submitted || !s.answers || s.answers.some((v) => v < 0)
        }
        onClick={onSubmit}
      >
        {submitted ? <Check /> : <ChevronRight />}
        {submitted ? "已提交，等待讲评" : "提交本题"}
      </Button>
    </div>
  );
}
export function Challenge({
  snapshot: s,
  onChange = () => {},
  readonly = false,
}: {
  snapshot: Snapshot;
  onChange?: Change;
  readonly?: boolean;
}) {
  const c = s.challenge || { timing: "pre", initial: 100 };
  const rounds =
    c.timing === "pre"
      ? Math.ceil((100 - c.initial) / 25)
      : Math.max(1, Math.ceil((100 - c.initial) / 25));
  return (
    <div className="quiz-view">
      <div className="eyebrow">拓展任务 / 选做</div>
      <h2>充电站的两次测试</h2>
      <p className="my-4 text-muted-foreground">
        反复执行“充电一次 →
        读取电量”，直到电量充足。初始电量已满时，应就地待命。
      </p>
      <Card className="p-6 space-y-5">
        <div className="flow-block">
          充电一次（增加 25%）
          <ArrowDown />
          读取电量
        </div>
        <label className="field-label">
          停止条件
          <InputLike value="电量已达到 100%？" />
        </label>
        <label className="field-label">
          初始电量
          <select
            disabled={readonly}
            value={c.initial}
            onChange={(e) =>
              onChange(
                {
                  challenge: { ...c, initial: Number(e.target.value) },
                  result: undefined,
                },
                "edit",
                "修改充电初始电量",
              )
            }
          >
            <option value={100}>100% · 已充足</option>
            <option value={50}>50% · 不足</option>
          </select>
        </label>
        <div className="segmented">
          {(["pre", "post"] as const).map((t) => (
            <button
              disabled={readonly}
              key={t}
              className={c.timing === t ? "selected" : ""}
              onClick={() =>
                onChange(
                  { challenge: { ...c, timing: t }, result: undefined },
                  "edit",
                  "调整充电判断时机",
                )
              }
            >
              {t === "pre" ? "先判断，再执行" : "先执行，再判断"}
            </button>
          ))}
        </div>
        <Button
          disabled={readonly}
          onClick={() =>
            onChange(
              {
                result: `执行 ${rounds} 轮；最终电量 100%。${c.initial === 100 && c.timing === "post" ? "已满时仍充电一次，没有符合就地待命的要求。" : "符合本次任务要求。"}`,
              },
              "result",
              "运行充电对照实验",
            )
          }
        >
          <Play />
          测试这个方案
        </Button>
        {s.result && <div className="hint-panel">{s.result}</div>}
      </Card>
      <label className="field-label mt-5">
        两次测试说明了什么？
        <Textarea
          disabled={readonly}
          value={s.explanation || ""}
          maxLength={1000}
          onChange={(e) =>
            onChange(
              { explanation: e.target.value },
              "explain",
              "说明充电测试结论",
            )
          }
        />
      </label>
    </div>
  );
}
function InputLike({ value }: { value: string }) {
  return <div className="p-3 rounded-lg bg-secondary text-sm">{value}</div>;
}
export function Review({
  snapshot: s,
  onChange = () => {},
  readonly = false,
}: {
  snapshot: Snapshot;
  onChange?: Change;
  readonly?: boolean;
}) {
  const labels = [
    "我先预测，再运行",
    "我能用结果解释并修正方案",
    "我参与轮换合作，能说明本组方案",
    "我如实记录失败与未知",
  ];
  return (
    <div className="quiz-view">
      <div className="eyebrow">学习小结 / 过程表现 4 分</div>
      <h2>给这次巡视留下证据</h2>
      <p className="text-muted-foreground my-4">
        每项 1 分。请自评，再请同伴举证，最后由教师核定。
      </p>
      {labels.map((v, i) => (
        <label key={v} className="review-check">
          <input
            type="checkbox"
            disabled={readonly}
            checked={s.selfReview?.[i] || false}
            onChange={(e) => {
              const a = [...(s.selfReview || [false, false, false, false])];
              a[i] = e.target.checked;
              onChange({ selfReview: a }, "selfReview", "更新过程自评");
            }}
          />
          {v}
        </label>
      ))}
      <Textarea
        value={s.explanation || ""}
        disabled={readonly}
        maxLength={1000}
        className="mt-5"
        placeholder="我和同伴的证据是……"
        onChange={(e) =>
          onChange(
            { explanation: e.target.value },
            "explain",
            "补充合作与过程证据",
          )
        }
      />
    </div>
  );
}
export function Screen({
  snapshot,
  readonly = true,
  members = [],
}: {
  snapshot: Snapshot;
  readonly?: boolean;
  members?: any[];
}) {
  return (
    <div className="screen-rebuild">
      {snapshot.activity.startsWith("l") ? (
        <Exercise snapshot={snapshot} readonly={readonly} />
      ) : snapshot.activity.startsWith("q") ? (
        <QuizView snapshot={snapshot} readonly={readonly} members={members} />
      ) : snapshot.activity === "challenge" ? (
        <Challenge snapshot={snapshot} readonly={readonly} />
      ) : (
        <Review snapshot={snapshot} readonly={readonly} />
      )}{" "}
      {snapshot.pointer && (
        <div
          className={cn(
            "remote-pointer",
            snapshot.pointer.kind === "click" && "clicked",
          )}
          style={{
            left: `${snapshot.pointer.x * 100}%`,
            top: `${snapshot.pointer.y * 100}%`,
          }}
        >
          <MousePointer2 size={22} fill="currentColor" />
          <span>学生鼠标</span>
        </div>
      )}
    </div>
  );
}
