import { useId } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { blocks, conditions, type Frame, type Plan } from "../../shared/engine";
import { cn } from "../lib/utils";

type Node = {
  key: string;
  kind: "terminal" | "process" | "io" | "decision" | "placeholder";
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  active?: boolean;
  index?: number;
};
type Wire = {
  key: string;
  points: number[][];
  loop?: boolean;
  arrow?: boolean;
};

/** All paths terminate on a node boundary or a marked junction, as in the lesson's original flowchart. */
export function Flow({
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
  const marker = useId().replace(/:/g, "");
  const cx = 280,
    width = 640,
    returnX = 35,
    branchX = 494,
    endX = 559;
  const nodes: Node[] = [],
    wires: Wire[] = [],
    labels: { x: number; y: number; text: string }[] = [],
    junctions: { x: number; y: number }[] = [];
  const wire = (key: string, points: number[][], loop = false, arrow = true) =>
    wires.push({ key, points, loop, arrow });
  const terminal = (key: string, x: number, y: number, label: string) =>
    nodes.push({ key, kind: "terminal", x, y, w: 100, h: 42, label });
  terminal("start", cx, 18, "开始");
  const pre = plan.timing === "pre",
    conditionY = pre ? 104 : 0;
  const bodyTop = pre ? 264 : 136;
  let y = bodyTop,
    previousBottom: number | null = null;
  const actionNodes: { index: number; y: number }[] = [];
  if (!plan.body.length) {
    nodes.push({
      key: "empty",
      kind: "placeholder",
      x: cx,
      y,
      w: 228,
      h: 52,
      label: "请添加循环体动作",
    });
    previousBottom = y + 52;
    y += 52;
  }
  plan.body.forEach((id, index) => {
    if (previousBottom !== null)
      wire(`next-${index}`, [
        [cx, previousBottom],
        [cx, y],
      ]);
    const top = y;
    if (id === "if_left") {
      nodes.push({
        key: `block-${index}`,
        kind: "decision",
        x: cx,
        y: top,
        w: 222,
        h: 100,
        label: "前方危险？",
        active: active === index,
        index,
      });
      nodes.push({
        key: `turn-${index}`,
        kind: "process",
        x: branchX,
        y: top + 26,
        w: 116,
        h: 48,
        label: "左转 90°",
        active: active === index,
      });
      const joinY = top + 136;
      wire(`branch-yes-${index}`, [
        [cx + 111, top + 50],
        [branchX - 58, top + 50],
      ]);
      wire(
        `branch-no-${index}`,
        [
          [cx, top + 100],
          [cx, joinY],
        ],
        false,
        false,
      );
      wire(
        `branch-merge-${index}`,
        [
          [branchX, top + 74],
          [branchX, joinY],
          [cx, joinY],
        ],
        false,
        false,
      );
      labels.push(
        { x: 413, y: top + 37, text: "是" },
        { x: 294, y: top + 121, text: "否" },
      );
      junctions.push({ x: cx, y: joinY });
      previousBottom = joinY;
      y = joinY + 42;
      actionNodes.push({ index, y: top - 12 });
    } else {
      nodes.push({
        key: `block-${index}`,
        kind: ["pulse", "scan"].includes(id) ? "io" : "process",
        x: cx,
        y: top,
        w: 228,
        h: 52,
        label: blocks[id],
        active: active === index,
        index,
      });
      previousBottom = top + 52;
      y = previousBottom + 42;
      actionNodes.push({ index, y: top + 8 });
    }
  });
  const bottom = previousBottom!;
  const condY = pre ? conditionY : bottom + 64,
    condCy = condY + 50;
  nodes.push({
    key: "condition",
    kind: "decision",
    x: cx,
    y: condY,
    w: 236,
    h: 100,
    label: conditions[plan.condition],
    active: active === "condition",
  });
  terminal("end", endX, condCy - 21, "结束");
  wire("stop", [
    [cx + 118, condCy],
    [endX - 50, condCy],
  ]);
  labels.push({ x: 449, y: condCy - 12, text: "是" });
  if (pre) {
    wire("start", [
      [cx, 60],
      [cx, condY],
    ]);
    wire("continue", [
      [cx, condY + 100],
      [cx, bodyTop],
    ]);
    labels.push({ x: 295, y: condY + 126, text: "否" });
    wire(
      "return",
      [
        [cx, bottom],
        [cx, bottom + 44],
        [returnX, bottom + 44],
        [returnX, condCy],
        [cx - 118, condCy],
      ],
      true,
    );
  } else {
    const entryY = 102;
    wire(
      "start",
      [
        [cx, 60],
        [cx, entryY],
      ],
      false,
      false,
    );
    wire("entry", [
      [cx, entryY],
      [cx, bodyTop],
    ]);
    junctions.push({ x: cx, y: entryY });
    wire("check", [
      [cx, bottom],
      [cx, condY],
    ]);
    wire(
      "return",
      [
        [cx, condY + 100],
        [cx, condY + 142],
        [returnX, condY + 142],
        [returnX, entryY],
        [cx, entryY],
      ],
      true,
    );
    labels.push({ x: 295, y: condY + 125, text: "否" });
  }
  const height = Math.max(bottom + 68, condY + 166);
  function move(index: number, delta: number) {
    const body = [...plan.body],
      next = index + delta;
    if (readonly || next < 0 || next >= body.length) return;
    [body[index], body[next]] = [body[next], body[index]];
    onPlan({ ...plan, body });
  }
  return (
    <div className="standard-flow">
      <div
        className="flow-scroll"
        tabIndex={0}
        aria-label="循环结构流程图，可横向滚动"
      >
        <svg
          className="flow-canvas"
          viewBox={`0 0 ${width} ${height}`}
          aria-label={pre ? "先判断再执行流程图" : "先执行后判断流程图"}
        >
          <defs>
            <marker
              id={`${marker}-arrow`}
              markerWidth="9"
              markerHeight="8"
              refX="8"
              refY="4"
              orient="auto"
              markerUnits="userSpaceOnUse"
            >
              <path d="M0 0 L8 4 L0 8 Z" fill="#475569" />
            </marker>
            <marker
              id={`${marker}-loop`}
              markerWidth="9"
              markerHeight="8"
              refX="8"
              refY="4"
              orient="auto"
              markerUnits="userSpaceOnUse"
            >
              <path d="M0 0 L8 4 L0 8 Z" fill="#2563eb" />
            </marker>
          </defs>
          <rect
            className="diagram-body"
            x="90"
            y={bodyTop - 24}
            width="520"
            height={bottom - bodyTop + 45}
            rx="10"
          />
          <rect
            fill="#f8fbff"
            x="104"
            y={bodyTop - 34}
            width="67"
            height="23"
          />
          <text className="diagram-caption" x="112" y={bodyTop - 18}>
            循环体
          </text>
          <text className="diagram-caption" x={cx - 112} y={condY - 13}>
            循环判断条件
          </text>
          {wires.map((w) => (
            <path
              key={w.key}
              data-wire={w.key}
              className={cn("diagram-wire", w.loop && "return-wire")}
              d={`M${w.points.map((p) => p.join(" ")).join(" L")}`}
              markerEnd={
                w.arrow
                  ? `url(#${marker}-${w.loop ? "loop" : "arrow"})`
                  : undefined
              }
            />
          ))}
          {junctions.map((j, i) => (
            <circle
              key={i}
              className="diagram-junction"
              cx={j.x}
              cy={j.y}
              r="3"
            />
          ))}
          {labels.map((l, i) => (
            <text key={i} className="diagram-branch-label" x={l.x} y={l.y}>
              {l.text}
            </text>
          ))}
          <text
            className="diagram-return-label"
            transform={`translate(22 ${(bodyTop + bottom) / 2}) rotate(-90)`}
            textAnchor="middle"
          >
            返回箭头
          </text>
          {nodes.map((n) => {
            const x = n.x - n.w / 2;
            return (
              <g
                key={n.key}
                data-node={n.key}
                data-block-index={n.index}
                className={cn(
                  "diagram-node",
                  `diagram-${n.kind}`,
                  n.active && "executing",
                )}
              >
                {n.kind === "decision" ? (
                  <polygon
                    points={`${n.x},${n.y} ${x + n.w},${n.y + n.h / 2} ${n.x},${n.y + n.h} ${x},${n.y + n.h / 2}`}
                  />
                ) : n.kind === "io" ? (
                  <polygon
                    points={`${x + 16},${n.y} ${x + n.w},${n.y} ${x + n.w - 16},${n.y + n.h} ${x},${n.y + n.h}`}
                  />
                ) : (
                  <rect
                    x={x}
                    y={n.y}
                    width={n.w}
                    height={n.h}
                    rx={n.kind === "terminal" ? 21 : 0}
                  />
                )}
                <text
                  x={n.x}
                  y={n.y + n.h / 2}
                  dy=".35em"
                  textAnchor="middle"
                  className={n.label.length > 13 ? "long-label" : undefined}
                >
                  {n.label}
                </text>
              </g>
            );
          })}
          {actionNodes.map(({ index, y }) => (
            <foreignObject key={index} x="416" y={y} width="174" height="36">
              <div className="diagram-actions">
                <button
                  aria-label={`上移第${index + 1}块`}
                  title="上移"
                  disabled={readonly || index === 0}
                  onClick={() => move(index, -1)}
                >
                  <ArrowUp size={16} />
                </button>
                <button
                  aria-label={`下移第${index + 1}块`}
                  title="下移"
                  disabled={readonly || index === plan.body.length - 1}
                  onClick={() => move(index, 1)}
                >
                  <ArrowDown size={16} />
                </button>
                <button
                  aria-label={`删除第${index + 1}块`}
                  title="删除"
                  disabled={readonly}
                  onClick={() =>
                    onPlan({
                      ...plan,
                      body: plan.body.filter((_, i) => i !== index),
                    })
                  }
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </foreignObject>
          ))}
        </svg>
      </div>
      <div
        className="diagram-drop"
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
        点击上方积木，或拖到这里添加动作
      </div>
      <p className="diagram-legend">
        椭圆：开始 / 结束　矩形：处理　平行四边形：输入 / 输出　菱形：判断
      </p>
    </div>
  );
}
