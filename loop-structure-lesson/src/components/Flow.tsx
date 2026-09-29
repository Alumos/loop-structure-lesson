import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  ArrowDown,
  ArrowUp,
  CornerUpLeft,
  Link2,
  Plus,
  RotateCcw,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import {
  blocks,
  conditions,
  validateFlow,
  type FlowEdge,
  type FlowNode,
  type Frame,
  type Level,
  type Plan,
} from "../../shared/engine";
import { cn } from "../lib/utils";

type Connection = {
  from: string;
  label?: FlowEdge["label"];
  kind: "normal" | "return";
};
type Position = {
  node: FlowNode;
  x: number;
  y: number;
  width: number;
  height: number;
};

function nodeText(n?: FlowNode) {
  if (!n) return "未连接节点";
  if (n.kind === "start") return "开始";
  if (n.kind === "end") return "结束";
  if (n.role === "loop-condition")
    return conditions[n.condition || ""] || "循环判断？";
  if (n.role === "body-condition") return "前方危险？";
  return blocks[n.block || ""] || "动作";
}

function unique(n: Pick<FlowNode, "kind" | "role">) {
  return n.kind === "start" || n.kind === "end" || !!n.role;
}

function positionsFor(
  nodes: FlowNode[],
  timing: Plan["timing"],
  width: number,
) {
  const main = nodes.filter(
      (n) =>
        (n.kind === "action" && n.role !== "branch-action") ||
        n.role === "body-condition",
    ),
    starts = nodes.filter((n) => n.kind === "start"),
    loops = nodes.filter((n) => n.role === "loop-condition"),
    ends = nodes.filter((n) => n.kind === "end"),
    branches = nodes.filter((n) => n.role === "branch-action"),
    order =
      timing === "pre"
        ? [...starts, ...loops, ...main, ...ends]
        : [...starts, ...main, ...loops, ...ends],
    x = branches.length ? width / 2 - 62 : width / 2,
    positions: Position[] = [];
  let y = 28;
  for (const n of order) {
    const height = n.kind === "decision" ? 104 : n.kind === "action" ? 54 : 42,
      nodeWidth = n.kind === "decision" ? 244 : n.kind === "action" ? 196 : 116;
    positions.push({ node: n, x, y: y + height / 2, width: nodeWidth, height });
    y += height + 48;
    if (n.role === "body-condition" && branches.length) {
      const branch = branches.shift()!;
      positions.push({
        node: branch,
        x: width - 110,
        y: y + 14,
        width: 132,
        height: 54,
      });
      y += 80;
    }
  }
  for (const branch of branches) {
    positions.push({ node: branch, x, y: y + 27, width: 132, height: 54 });
    y += 102;
  }
  return { positions, height: Math.max(250, y) };
}

function route(e: FlowEdge, positions: Position[], width: number) {
  const a = positions.find((v) => v.node.id === e.from),
    b = positions.find((v) => v.node.id === e.to);
  if (!a || !b) return null;
  const bottom = a.y + a.height / 2,
    top = b.y - b.height / 2 - 15;
  if (e.kind === "return") {
    const lane = 22;
    return {
      d: `M ${a.x - a.width / 2} ${a.y} H ${lane} V ${b.y} H ${b.x - b.width / 2 - (b.node.kind === "action" ? 15 : 0)}`,
      x: lane + 7,
      y: (a.y + b.y) / 2,
      text: e.label === "no" ? "否 · 返回" : "返回",
    };
  }
  if (a.node.kind === "decision" && e.label === "yes") {
    const lane = b.node.kind === "end" ? width - 18 : b.x;
    return {
      d: `M ${a.x + a.width / 2} ${a.y} H ${lane} V ${b.node.kind === "end" ? b.y : top}${b.node.kind === "end" ? ` H ${b.x + b.width / 2}` : ""}`,
      x: a.x + a.width / 2 + 8,
      y: a.y - 8,
      text: "是",
    };
  }
  if (a.x === b.x && top > bottom)
    return {
      d: `M ${a.x} ${bottom} V ${top}`,
      x: a.x + 8,
      y: bottom + 18,
      text: e.label === "no" ? "否" : "",
    };
  const lane = a.x !== b.x ? a.x : width - 32;
  return {
    d: `M ${a.x} ${bottom} V ${bottom + 18} H ${lane} V ${top - 18} H ${b.x} V ${top}`,
    x: a.x + 8,
    y: bottom + 17,
    text: e.label === "no" ? "否" : "",
  };
}

export function Flow({
  level,
  plan,
  frame,
  onPlan,
  readonly,
  disabled = false,
}: {
  level: Level;
  plan: Plan;
  frame: Frame;
  onPlan: (p: Plan) => void;
  readonly: boolean;
  disabled?: boolean;
}) {
  const nodes = plan.nodes || [],
    edges = plan.edges || [],
    locked = readonly || disabled,
    [connection, setConnection] = useState<Connection | null>(null),
    [history, setHistory] = useState<Plan[]>([]),
    [width, setWidth] = useState(560),
    [pointer, setPointer] = useState<{ x: number; y: number } | null>(null),
    viewport = useRef<HTMLDivElement>(null),
    canvas = useRef<HTMLDivElement>(null),
    drag = useRef<{ x: number; y: number; moved: boolean } | null>(null),
    marker = useId().replace(/:/g, ""),
    validation = useMemo(() => validateFlow(level, plan), [level, plan]),
    layout = positionsFor(nodes, plan.timing, width),
    main = nodes.filter(
      (n) =>
        (n.kind === "action" && n.role !== "branch-action") ||
        n.role === "body-condition",
    ),
    activeNode =
      frame.nodeId ||
      (frame.active === "condition"
        ? nodes.find((n) => n.role === "loop-condition")?.id
        : validation.steps[typeof frame.active === "number" ? frame.active : -1]
            ?.nodeId),
    palette = level.palette.map((n) =>
      n.role === "loop-condition"
        ? {
            ...n,
            id: `condition-${plan.condition}`,
            label: conditions[plan.condition],
            condition: plan.condition,
          }
        : n,
    );

  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const resize = () =>
      setWidth(Math.max(level.id === "l2" ? 480 : 340, element.clientWidth));
    resize();
    window.addEventListener("resize", resize);
    const observer =
      typeof ResizeObserver === "function" ? new ResizeObserver(resize) : null;
    observer?.observe(element);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", resize);
    };
  }, [level.id]);
  useEffect(() => {
    setConnection(null);
    setPointer(null);
  }, [plan, locked]);

  const apply = (next: Plan) => {
    if (locked) return;
    setHistory((v) => [...v.slice(-29), plan]);
    const check = validateFlow(level, next);
    onPlan({
      ...next,
      body: check.valid ? check.body : [],
      nodes: next.nodes || [],
      edges: next.edges || [],
    });
    setConnection(null);
    setPointer(null);
  };
  const addNode = (paletteId: string) => {
    const item = palette.find((n) => n.id === paletteId);
    if (
      !item ||
      nodes.length >= 12 ||
      (unique(item) &&
        nodes.some((n) => n.kind === item.kind && n.role === item.role))
    )
      return;
    let id = item.id;
    if (item.kind === "action" || item.role === "body-condition") {
      let number = 1;
      while (nodes.some((n) => n.id === `${item.id}-${number}`)) number++;
      id = `${item.id}-${number}`;
    }
    apply({
      ...plan,
      nodes: [
        ...nodes,
        {
          id,
          kind: item.kind,
          block: item.block,
          role: item.role,
          condition: item.condition,
        },
      ],
    });
  };
  const removeNode = (id: string) =>
    apply({
      ...plan,
      nodes: nodes.filter((n) => n.id !== id),
      edges: edges.filter((e) => e.from !== id && e.to !== id),
    });
  const move = (id: string, direction: number) => {
    const index = main.findIndex((n) => n.id === id),
      target = main[index + direction];
    if (!target) return;
    const reordered = [...nodes],
      from = nodes.findIndex((n) => n.id === id),
      to = nodes.findIndex((n) => n.id === target.id);
    [reordered[from], reordered[to]] = [reordered[to], reordered[from]];
    apply({ ...plan, nodes: reordered });
  };
  const connect = (target: string) => {
    if (
      !connection ||
      locked ||
      target === connection.from ||
      nodes.find((n) => n.id === target)?.kind === "start"
    )
      return;
    apply({
      ...plan,
      edges: [
        ...edges.filter(
          (e) => !(e.from === connection.from && e.label === connection.label),
        ),
        {
          id: `edge-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          ...connection,
          to: target,
        },
      ],
    });
  };
  const selectOutput = (selected: Connection) => {
    if (!locked) {
      setConnection(selected);
      setPointer(null);
    }
  };
  useEffect(() => {
    if (!connection || locked) return;
    const movePointer = (e: PointerEvent) => {
      if (!drag.current || !canvas.current) return;
      if (
        Math.hypot(e.clientX - drag.current.x, e.clientY - drag.current.y) > 5
      )
        drag.current.moved = true;
      if (drag.current.moved) {
        const rect = canvas.current.getBoundingClientRect();
        setPointer({ x: e.clientX - rect.left, y: e.clientY - rect.top });
      }
    };
    const release = (e: PointerEvent) => {
      if (!drag.current?.moved) {
        drag.current = null;
        return;
      }
      const target = (e.target as Element).closest<HTMLElement>("[data-input]");
      if (target) connect(target.dataset.input!);
      else {
        setConnection(null);
        setPointer(null);
      }
      drag.current = null;
    };
    window.addEventListener("pointermove", movePointer);
    window.addEventListener("pointerup", release);
    return () => {
      window.removeEventListener("pointermove", movePointer);
      window.removeEventListener("pointerup", release);
    };
  }, [connection, locked, plan]);

  return (
    <div
      className="flow-builder"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          setConnection(null);
          setPointer(null);
        }
      }}
    >
      <div className="flow-builder-toolbar">
        <strong>流程图</strong>
        {!readonly && (
          <div className="flow-toolbar-actions">
            <button
              type="button"
              title="撤销上一步"
              aria-label="撤销上一步"
              disabled={locked || !history.length}
              onClick={() => {
                const previous = history[history.length - 1];
                if (previous) {
                  setHistory((v) => v.slice(0, -1));
                  onPlan(previous);
                }
              }}
            >
              <Undo2 size={16} />
            </button>
            <button
              type="button"
              title="清空流程图"
              aria-label="清空流程图"
              disabled={locked || !nodes.length}
              onClick={() => apply({ ...plan, body: [], nodes: [], edges: [] })}
            >
              <RotateCcw size={16} />
            </button>
          </div>
        )}
      </div>
      {!readonly && (
        <div className="flow-node-palette" aria-label="流程图节点区">
          {palette.map((item) => (
            <button
              type="button"
              key={item.id}
              data-palette-id={item.id}
              disabled={
                locked ||
                nodes.length >= 12 ||
                (unique(item) &&
                  nodes.some(
                    (n) => n.kind === item.kind && n.role === item.role,
                  ))
              }
              onClick={() => addNode(item.id)}
            >
              <Plus size={13} />
              {item.label}
            </button>
          ))}
        </div>
      )}
      <div className="flow-canvas-viewport" ref={viewport}>
        <div
          ref={canvas}
          className="flow-builder-canvas"
          style={{ width, height: layout.height }}
          aria-label="流程图搭建区"
        >
          <svg
            className="flow-builder-edges"
            viewBox={`0 0 ${width} ${layout.height}`}
            aria-hidden="true"
          >
            <defs>
              <marker
                id={marker}
                markerWidth="8"
                markerHeight="8"
                refX="7"
                refY="4"
                orient="auto"
              >
                <path d="M0 0 L8 4 L0 8 Z" fill="#64748b" />
              </marker>
            </defs>
            {edges.map((e) => {
              const path = route(e, layout.positions, width);
              return (
                path && (
                  <g
                    key={e.id}
                    data-edge={e.id}
                    data-edge-kind={e.kind || "normal"}
                    className={cn(
                      "flow-edge",
                      e.kind === "return" && "flow-edge-return",
                      frame.edgeId === e.id && "executing",
                    )}
                  >
                    <path d={path.d} markerEnd={`url(#${marker})`} />
                    {path.text && (readonly || e.kind === "return") && (
                      <text x={path.x} y={path.y}>
                        {path.text}
                      </text>
                    )}
                  </g>
                )
              );
            })}
            {pointer &&
              connection &&
              (() => {
                const from = layout.positions.find(
                  (v) => v.node.id === connection.from,
                );
                return (
                  from && (
                    <path
                      className="flow-edge-preview"
                      d={`M ${from.x} ${from.y + from.height / 2} L ${pointer.x} ${pointer.y}`}
                    />
                  )
                );
              })()}
            {layout.positions.map(({ node: n, x, y, width: w, height: h }) => (
              <g
                key={n.id}
                className={cn(
                  "flow-node-shape",
                  n.role === "body-condition" && "inner",
                  activeNode === n.id && "executing",
                )}
              >
                {n.kind === "decision" ? (
                  <polygon
                    points={`${x},${y - h / 2} ${x + w / 2},${y} ${x},${y + h / 2} ${x - w / 2},${y}`}
                  />
                ) : (
                  <rect
                    x={x - w / 2}
                    y={y - h / 2}
                    width={w}
                    height={h}
                    rx={n.kind === "action" ? 5 : h / 2}
                  />
                )}
              </g>
            ))}
          </svg>
          {layout.positions.map(({ node: n, x, y, width: w, height: h }) => {
            const index = main.findIndex((v) => v.id === n.id),
              output = (
                label?: FlowEdge["label"],
                kind: Connection["kind"] = "normal",
              ) => {
                const selected = { from: n.id, label, kind };
                return {
                  onClick: () => selectOutput(selected),
                  onPointerDown: (e: ReactPointerEvent) => {
                    if (e.pointerType === "mouse") {
                      drag.current = {
                        x: e.clientX,
                        y: e.clientY,
                        moved: false,
                      };
                      selectOutput(selected);
                    }
                  },
                };
              };
            return (
              <div
                key={n.id}
                data-node={n.id}
                data-block-index={
                  n.kind === "action" || n.role === "body-condition"
                    ? nodes
                        .filter(
                          (v) =>
                            v.kind === "action" || v.role === "body-condition",
                        )
                        .indexOf(n)
                    : undefined
                }
                className={cn(
                  "flow-builder-node",
                  `flow-builder-node-${n.kind}`,
                  activeNode === n.id && "executing",
                )}
                style={{ left: x - w / 2, top: y - h / 2, width: w, height: h }}
              >
                <div className="flow-node-content">
                  <strong>{nodeText(n)}</strong>
                  {n.role === "loop-condition" && <small>循环判断</small>}
                </div>
                {!readonly && (
                  <>
                    {n.kind !== "start" && (
                      <button
                        type="button"
                        data-input={n.id}
                        className={cn("flow-port input", connection && "ready")}
                        title={`接入：${nodeText(n)}`}
                        aria-label={`连接到${nodeText(n)}`}
                        disabled={locked}
                        onClick={() => connect(n.id)}
                      >
                        <span />
                      </button>
                    )}
                    {n.kind === "decision" ? (
                      <>
                        <button
                          type="button"
                          className="flow-port output yes"
                          title="是分支"
                          aria-label="是 →"
                          disabled={locked}
                          {...output("yes")}
                        >
                          是
                        </button>
                        <button
                          type="button"
                          className={cn(
                            "flow-port output no",
                            n.role === "loop-condition" &&
                              plan.timing === "post" &&
                              "return post-return",
                          )}
                          title={
                            n.role === "loop-condition" &&
                            plan.timing === "post"
                              ? "否分支：返回循环体"
                              : "否分支"
                          }
                          aria-label="否 →"
                          disabled={locked}
                          {...output(
                            "no",
                            n.role === "loop-condition" &&
                              plan.timing === "post"
                              ? "return"
                              : "normal",
                          )}
                        >
                          否
                        </button>
                      </>
                    ) : (
                      n.kind !== "end" && (
                        <button
                          type="button"
                          className="flow-port output next"
                          title="连接下一步"
                          aria-label="下一步 →"
                          disabled={locked}
                          {...output()}
                        >
                          <ArrowDown size={14} />
                        </button>
                      )
                    )}
                    {n.kind === "action" && (
                      <button
                        type="button"
                        className="flow-port return"
                        title="连接返回箭头"
                        aria-label="回到判断 →"
                        disabled={locked}
                        {...output(undefined, "return")}
                      >
                        <CornerUpLeft size={14} />
                      </button>
                    )}
                    <div className="flow-node-edit">
                      {index >= 0 && (
                        <>
                          <button
                            type="button"
                            title="上移节点"
                            aria-label={`上移${nodeText(n)}`}
                            disabled={locked || index === 0}
                            onClick={() => move(n.id, -1)}
                          >
                            <ArrowUp size={13} />
                          </button>
                          <button
                            type="button"
                            title="下移节点"
                            aria-label={`下移${nodeText(n)}`}
                            disabled={locked || index === main.length - 1}
                            onClick={() => move(n.id, 1)}
                          >
                            <ArrowDown size={13} />
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        title="删除节点"
                        aria-label={`删除${nodeText(n)}`}
                        disabled={locked}
                        onClick={() => removeNode(n.id)}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </>
                )}
              </div>
            );
          })}
          {!nodes.length && (
            <div className="flow-builder-empty">尚未摆放节点</div>
          )}
        </div>
      </div>
      {connection && (
        <div className="flow-connection-note" role="status">
          <Link2 size={14} />
          <span>
            {connection.kind === "return"
              ? "返回箭头"
              : connection.label === "yes"
                ? "“是”分支"
                : connection.label === "no"
                  ? "“否”分支"
                  : "下一步"}
            ：选择接入端
          </span>
          <button
            type="button"
            title="取消连线"
            aria-label="取消连线"
            onClick={() => {
              setConnection(null);
              setPointer(null);
            }}
          >
            <X size={14} />
          </button>
        </div>
      )}
      <div
        className={cn("flow-validation", validation.valid && "valid")}
        role="status"
      >
        {validation.valid ? (
          <>
            <Link2 size={15} />
            流程图完整，可以开始模拟。
          </>
        ) : (
          <>
            <X size={15} />
            <span>{validation.errors[0]}</span>
          </>
        )}
      </div>
      {!!edges.length && !readonly && (
        <details className="flow-edge-list">
          <summary>已连箭头（{edges.length}）</summary>
          {edges.map((e) => (
            <div key={e.id}>
              <span>
                {nodeText(nodes.find((n) => n.id === e.from)!)} →{" "}
                {nodeText(nodes.find((n) => n.id === e.to)!)}
                {e.label && ` · ${e.label === "yes" ? "是" : "否"}`}
                {e.kind === "return" && " · 返回"}
              </span>
              <button
                type="button"
                title="删除箭头"
                disabled={locked}
                aria-label={
                  e.kind === "return" ? "删除返回箭头" : `删除箭头${e.id}`
                }
                onClick={() =>
                  apply({ ...plan, edges: edges.filter((v) => v.id !== e.id) })
                }
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </details>
      )}
    </div>
  );
}
