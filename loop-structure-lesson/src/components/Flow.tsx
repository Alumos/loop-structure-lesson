import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  Grip,
  AlignCenter,
  Maximize2,
  Minimize2,
  Link2,
  RotateCcw,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import {
  blocks,
  conditions,
  validateFlow,
  type FlowAnchor,
  type FlowEdge,
  type FlowNode,
  type Frame,
  type Level,
  type Plan,
} from "../../shared/engine";
import { cn } from "../lib/utils";
import { snapPoint, arrangeFlow } from "../lib/flow-layout";

type Point = { x: number; y: number };
type Position = Point & { node: FlowNode; width: number; height: number };
type Gesture = { pointerId: number; start: Point; current: Point } & (
  | { type: "palette"; paletteId: string }
  | { type: "move"; nodeId: string; origin: Point }
  | { type: "edge"; nodeId: string; anchor: FlowAnchor }
);
const anchors: FlowAnchor[] = ["top", "right", "bottom", "left"];
const anchorNames = { top: "上", right: "右", bottom: "下", left: "左" };
const vectors: Record<FlowAnchor, Point> = {
  top: { x: 0, y: -1 },
  right: { x: 1, y: 0 },
  bottom: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
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

function anchorPoint(p: Position, anchor: FlowAnchor): Point {
  const v = vectors[anchor];
  return { x: p.x + (v.x * p.width) / 2, y: p.y + (v.y * p.height) / 2 };
}
function edgeRoute(e: FlowEdge, positions: Position[]) {
  const a = positions.find((p) => p.node.id === e.from),
    b = positions.find((p) => p.node.id === e.to);
  if (!a || !b) return null;
  const from =
    e.fromAnchor ||
    (e.kind === "return" ? "left" : e.label === "yes" ? "right" : "bottom");
  const to = e.toAnchor || (e.kind === "return" ? "left" : "top");
  const s = anchorPoint(a, from),
    t = anchorPoint(b, to),
    v = vectors[from],
    w = vectors[to];
  const u = { x: s.x + v.x * 28, y: s.y + v.y * 28 },
    z = { x: t.x + w.x * 28, y: t.y + w.y * 28 };
  if (
    e.kind !== "return" &&
    from === "bottom" &&
    to === "top" &&
    Math.abs(s.x - t.x) < 1 &&
    t.y > s.y
  ) {
    return {
      d: `M ${s.x} ${s.y} L ${t.x} ${t.y}`,
      x: s.x + 10,
      y: (s.y + t.y) / 2,
      text: e.label === "yes" ? "是" : e.label === "no" ? "否" : "",
    };
  }
  let middle: string;
  const returnLane = Math.max(
    12,
    Math.min(...positions.map((p) => p.x - p.width / 2)) - 38,
  );
  if (e.kind !== "return" && b.node.kind === "end" && e.label === "yes") {
    // Keep the stop branch outside the body so it cannot look like it enters an action.
    const lane = Math.max(...positions.map((p) => p.x + p.width / 2)) + 38;
    middle = `L ${lane} ${u.y} L ${lane} ${z.y}`;
  } else if (e.kind === "return") {
    const lane = Math.max(
      12,
      Math.min(...positions.map((p) => p.x - p.width / 2)) - 38,
    );
    middle = `L ${lane} ${u.y} L ${lane} ${z.y}`;
  } else if (v.x && w.x) {
    const x = (u.x + z.x) / 2;
    middle = `L ${x} ${u.y} L ${x} ${z.y}`;
  } else if (v.y && w.y) {
    // Route around the nodes when their vertical outlets face away from each other.
    if (u.y > z.y && from === "bottom" && to === "top") {
      const x = Math.max(a.x + a.width / 2, b.x + b.width / 2) + 38;
      middle = `L ${x} ${u.y} L ${x} ${z.y}`;
    } else {
      const y = (u.y + z.y) / 2;
      middle = `L ${u.x} ${y} L ${z.x} ${y}`;
    }
  } else middle = v.x ? `L ${z.x} ${u.y}` : `L ${u.x} ${z.y}`;
  return {
    d: `M ${s.x} ${s.y} L ${u.x} ${u.y} ${middle} L ${z.x} ${z.y} L ${t.x} ${t.y}`,
    x: e.kind === "return" ? returnLane + 8 : u.x + 7,
    y: e.kind === "return" ? (u.y + z.y) / 2 : u.y - 7,
    text: [
      e.label === "yes" ? "是" : e.label === "no" ? "否" : "",
      e.kind === "return" ? "返回" : "",
    ]
      .filter(Boolean)
      .join(" · "),
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
    locked = readonly || disabled;
  const [history, setHistory] = useState<Plan[]>([]),
    [gesture, setGesture] = useState<Gesture | null>(null),
    [selected, setSelected] = useState<string | null>(null),
    [selectedEdge, setSelectedEdge] = useState<string | null>(null),
    [viewportWidth, setViewportWidth] = useState(600),
    [zoom, setZoom] = useState(1),
    [expanded, setExpanded] = useState(false),
    [snapEnabled, setSnapEnabled] = useState(true),
    [edgeMenu, setEdgeMenu] = useState<Point | null>(null);
  const viewport = useRef<HTMLDivElement>(null),
    canvas = useRef<HTMLDivElement>(null),
    gestureRef = useRef<Gesture | null>(null);
  const marker = useId().replace(/:/g, ""),
    validation = useMemo(() => validateFlow(level, plan), [level, plan]);
  const scale = Math.min(1, Math.max(0.65, viewportWidth / 900)) * zoom;
  const legacy = positionsFor(nodes, plan.timing, 900);
  const storedPositions = legacy.positions.map((p) => ({
    ...p,
    x: p.node.x ?? p.x,
    y: p.node.y ?? p.y,
  }));
  const align = (point: Point, id?: string) =>
    snapEnabled
      ? snapPoint(
          point,
          storedPositions.map((p) => ({ id: p.node.id, x: p.x, y: p.y })),
          id,
          10 / scale,
        )
      : { ...point, guideX: undefined, guideY: undefined };
  const moving =
    gesture?.type === "move"
      ? align(
          {
            x: gesture.origin.x + (gesture.current.x - gesture.start.x) / scale,
            y: gesture.origin.y + (gesture.current.y - gesture.start.y) / scale,
          },
          gesture.nodeId,
        )
      : null;
  const positions = storedPositions.map((p) =>
    gesture?.type === "move" && gesture.nodeId === p.node.id && moving
      ? {
          ...p,
          x: Math.max(p.width / 2 + 24, Math.min(3900, moving.x)),
          y: Math.max(p.height / 2 + 24, Math.min(3900, moving.y)),
        }
      : p,
  );
  const width = Math.max(
    900,
    viewportWidth / scale,
    ...positions.map((p) => p.x + p.width / 2 + 60),
  );
  const height = Math.max(
    1000,
    ...positions.map((p) => p.y + p.height / 2 + 100),
  );
  const activeNode =
    frame.nodeId ||
    (frame.active === "condition"
      ? nodes.find((n) => n.role === "loop-condition")?.id
      : validation.steps[typeof frame.active === "number" ? frame.active : -1]
          ?.nodeId);
  const palette = level.palette.map((n) =>
    n.role === "loop-condition"
      ? {
          ...n,
          id: `condition-${plan.condition}`,
          label: conditions[plan.condition],
          condition: plan.condition,
        }
      : n,
  );
  const cancel = () => {
    gestureRef.current = null;
    setGesture(null);
  };
  useEffect(() => {
    const resize = () => setViewportWidth(viewport.current?.clientWidth || 600);
    resize();
    const observer =
      typeof ResizeObserver === "function" ? new ResizeObserver(resize) : null;
    if (viewport.current) observer?.observe(viewport.current);
    window.addEventListener("resize", resize);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", resize);
    };
  }, []);
  useEffect(() => {
    cancel();
  }, [locked, plan]);
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
    cancel();
  };
  const addNode = (paletteId: string, point: Point) => {
    const item = palette.find((n) => n.id === paletteId);
    if (!item || nodes.length >= 30) return;
    let id = item.id,
      number = 1;
    if (
      item.kind === "action" ||
      item.role === "body-condition" ||
      nodes.some((n) => n.id === id)
    ) {
      while (nodes.some((n) => n.id === `${item.id}-${number}`)) number++;
      id = `${item.id}-${number}`;
    }
    point = align(point);
    const halfWidth =
      item.kind === "decision" ? 122 : item.kind === "action" ? 98 : 58;
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
          x: Math.max(halfWidth + 24, Math.min(3900, Math.round(point.x))),
          y: Math.max(76, Math.min(3900, Math.round(point.y))),
        },
      ],
    });
    setSelected(id);
    setSelectedEdge(null);
  };
  const removeNode = (id: string) => {
    apply({
      ...plan,
      nodes: nodes.filter((n) => n.id !== id),
      edges: edges.filter((e) => e.from !== id && e.to !== id),
    });
    setSelected(null);
  };
  const connect = (
    g: Extract<Gesture, { type: "edge" }>,
    target: string,
    toAnchor: FlowAnchor,
  ) => {
    if (target === g.nodeId || edges.length >= 50) return;
    const source = nodes.find((n) => n.id === g.nodeId)!;
    const label =
      source.kind === "decision"
        ? g.anchor === "right" || g.anchor === "top"
          ? "yes"
          : "no"
        : undefined;
    // The student draws the cycle; classify its closing arrow for execution evidence.
    const seen = new Set<string>();
    const reaches = (id: string): boolean => {
      if (id === source.id) return true;
      if (seen.has(id)) return false;
      seen.add(id);
      return edges
        .filter(
          (e) => e.from === id && e.from !== source.id && e.kind !== "return",
        )
        .some((e) => reaches(e.to));
    };
    const isReturn =
      plan.timing === "post"
        ? source.role === "loop-condition" && label === "no"
        : source.kind === "action" &&
          (nodes.find((n) => n.id === target)?.role === "loop-condition" ||
            reaches(target));
    const edge: FlowEdge = {
      id: `edge-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      from: source.id,
      to: target,
      fromAnchor: g.anchor,
      toAnchor,
      label,
      kind: isReturn ? "return" : "normal",
    };
    apply({
      ...plan,
      edges: [
        ...edges.filter(
          (e) => !(e.from === edge.from && e.label === edge.label),
        ),
        edge,
      ],
    });
    setSelectedEdge(null);
    setEdgeMenu(null);
    setSelected(null);
  };
  const begin = (
    e: ReactPointerEvent,
    details:
      | Omit<
          Extract<Gesture, { type: "palette" }>,
          "pointerId" | "start" | "current"
        >
      | Omit<
          Extract<Gesture, { type: "move" }>,
          "pointerId" | "start" | "current"
        >
      | Omit<
          Extract<Gesture, { type: "edge" }>,
          "pointerId" | "start" | "current"
        >,
  ) => {
    if (locked || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const point = { x: e.clientX, y: e.clientY },
      next = {
        ...details,
        pointerId: e.pointerId,
        start: point,
        current: point,
      } as Gesture;
    gestureRef.current = next;
    setGesture(next);
    if (details.type !== "palette") setSelected(details.nodeId);
  };
  // Use document hit testing so mouse, pen and captured touch pointers share one drop path.
  useEffect(() => {
    if (!gesture || locked) return;
    const move = (e: PointerEvent) => {
      const g = gestureRef.current;
      if (!g || g.pointerId !== e.pointerId) return;
      e.preventDefault();
      const next = { ...g, current: { x: e.clientX, y: e.clientY } };
      gestureRef.current = next;
      setGesture(next);
    };
    const up = (e: PointerEvent) => {
      const g = gestureRef.current;
      if (!g || e.pointerId !== g.pointerId || !canvas.current) return;
      const moved =
        Math.hypot(e.clientX - g.start.x, e.clientY - g.start.y) > 4;
      const rect = canvas.current.getBoundingClientRect(),
        point = {
          x: (e.clientX - rect.left) / scale,
          y: (e.clientY - rect.top) / scale,
        };
      const hit = document.elementFromPoint(e.clientX, e.clientY);
      if (
        g.type === "palette" &&
        moved &&
        e.clientX >= rect.left && e.clientX <= rect.right &&
        e.clientY >= rect.top && e.clientY <= rect.bottom
      )
        addNode(g.paletteId, point);
      if (g.type === "move" && moved) {
        const p = positions.find((p) => p.node.id === g.nodeId)!;
        const snapped = align(
          {
            x: g.origin.x + (e.clientX - g.start.x) / scale,
            y: g.origin.y + (e.clientY - g.start.y) / scale,
          },
          g.nodeId,
        );
        apply({
          ...plan,
          nodes: nodes.map((n) =>
            n.id === g.nodeId
              ? {
                  ...n,
                  x: Math.round(
                    Math.max(p.width / 2 + 24, Math.min(3900, snapped.x)),
                  ),
                  y: Math.round(
                    Math.max(p.height / 2 + 24, Math.min(3900, snapped.y)),
                  ),
                }
              : n,
          ),
        });
      }
      if (g.type === "edge" && moved) {
        const target = hit?.closest<HTMLElement>("[data-anchor]");
        if (target && canvas.current.contains(target))
          connect(
            g,
            target.dataset.nodeId!,
            target.dataset.anchor as FlowAnchor,
          );
      }
      cancel();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") cancel();
    };
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("blur", cancel);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("blur", cancel);
      window.removeEventListener("keydown", key);
    };
  }, [!!gesture, locked, plan, scale]);
  const deleteEdge = () => {
    if (selectedEdge && !locked) {
      apply({ ...plan, edges: edges.filter((e) => e.id !== selectedEdge) });
      setSelectedEdge(null);
    }
  };
  const editEdge = edges.find((e) => e.id === selectedEdge);
  const patchEdge = (patch: Partial<FlowEdge>) =>
    apply({
      ...plan,
      edges: edges.map((e) => (e.id === selectedEdge ? { ...e, ...patch } : e)),
    });
  const selectedRoute = editEdge && edgeRoute(editEdge, positions);
  const menuPoint =
    edgeMenu ||
    (selectedRoute
      ? { x: selectedRoute.x + 12, y: selectedRoute.y + 18 }
      : { x: 50, y: 50 });
  return (
    <div
      className={cn("flow-builder", expanded && "flow-builder-expanded")}
      onKeyDown={(e) => {
        if (
          !locked &&
          selectedEdge &&
          (e.key === "Delete" || e.key === "Backspace") &&
          !(e.target as HTMLElement).closest("input,select,textarea")
        ) {
          e.preventDefault();
          deleteEdge();
        }
      }}
    >
      <div className="flow-builder-toolbar">
        <div>
          <strong>自由搭建流程图</strong>
          <p>拖入方块，自由摆放；从图形边缘拉出箭头，接到另一个图形的边缘。</p>
        </div>
        <div className="flow-toolbar-actions">
          <button
            type="button"
            aria-label={expanded ? "收起画布" : "展开画布"}
            title={expanded ? "收起画布" : "展开画布"}
            onClick={() => {
              cancel();
              setExpanded((v) => !v);
            }}
          >
            {expanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
          {!readonly && (
            <>
              <button
                type="button"
                className="flow-arrange-button"
                aria-label="一键整理"
                title="一键整理：对齐节点和箭头，保留连接关系"
                disabled={locked || nodes.length < 2}
                onClick={() => {
                  apply(arrangeFlow(plan));
                  setSelectedEdge(null);
                }}
              >
                <AlignCenter size={16} />
                整理
              </button>
              <button
                type="button"
                aria-label="撤销上一步"
                title="撤销上一步"
                disabled={locked || !history.length}
                onClick={() => {
                  const previous = history[history.length - 1];
                  if (previous) {
                    setHistory((v) => v.slice(0, -1));
                    onPlan(previous);
                    setSelectedEdge(null);
                  }
                }}
              >
                <Undo2 size={16} />
              </button>
              <button
                type="button"
                aria-label="清空流程图"
                title="清空流程图"
                disabled={locked || !nodes.length}
                onClick={() =>
                  apply({ ...plan, body: [], nodes: [], edges: [] })
                }
              >
                <RotateCcw size={16} />
              </button>
            </>
          )}
        </div>
      </div>
      {!readonly && (
        <>
          <div className="flow-node-palette" aria-label="流程图节点区">
            {palette.map((item) => (
              <button
                type="button"
                key={item.id}
                data-palette-id={item.id}
                disabled={locked || nodes.length >= 30}
                onPointerDown={(e) =>
                  begin(e, { type: "palette", paletteId: item.id })
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    addNode(item.id, {
                      x: 250 + (nodes.length % 2) * 300,
                      y: 100 + Math.floor(nodes.length / 2) * 130,
                    });
                  }
                }}
              >
                <Grip size={14} />
                {item.label}
              </button>
            ))}
          </div>
          <p className="flow-help">
            每种方块都可以重复拖入。拖住方块中间移动；拖住菱形的“是 /
            否”一侧连分支。连错了可以重连或撤销。
          </p>
        </>
      )}
      <div className="flow-zoom">
        {!readonly && (
          <label className="flow-snap-toggle">
            <input
              type="checkbox"
              checked={snapEnabled}
              disabled={locked}
              onChange={(e) => setSnapEnabled(e.target.checked)}
            />
            自动对齐
          </label>
        )}
        <span>
          {nodes.length} 个节点
          {nodes.length >= 30 ? "（画布已满，请删除多余节点）" : ""}
        </span>
        <button
          type="button"
          aria-label="缩小画布"
          disabled={zoom <= 0.6}
          onClick={() => setZoom((v) => Math.max(0.6, v - 0.2))}
        >
          −
        </button>
        <button type="button" onClick={() => setZoom(1)} title="适合宽度">
          {Math.round(scale * 100)}%
        </button>
        <button
          type="button"
          aria-label="放大画布"
          disabled={zoom >= 2}
          onClick={() => setZoom((v) => Math.min(2, v + 0.2))}
        >
          ＋
        </button>
      </div>
      <div className="flow-canvas-viewport" ref={viewport}>
        <div style={{ width: width * scale, height: height * scale }}>
          <div
            ref={canvas}
            className={cn(
              "flow-builder-canvas",
              gesture?.type === "edge" && "connecting",
              locked && "locked",
            )}
            style={{
              width,
              height,
              transform: `scale(${scale})`,
              transformOrigin: "top left",
            }}
            aria-label="流程图搭建区"
            tabIndex={0}
            onPointerDown={() => {
              setSelected(null);
              setSelectedEdge(null);
            }}
          >
            <svg
              className="flow-builder-edges"
              viewBox={`0 0 ${width} ${height}`}
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
                  <path d="M0 0 L8 4 L0 8 Z" fill="context-stroke" />
                </marker>
              </defs>
              {edges.map((e) => {
                const path = edgeRoute(e, positions);
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
                        selectedEdge === e.id && "selected",
                      )}
                    >
                      <path d={path.d} markerEnd={`url(#${marker})`} />
                      <path
                        className="flow-edge-hit"
                        d={path.d}
                        onPointerDown={(event) => {
                          if (!locked) {
                            event.stopPropagation();
                            setSelectedEdge(e.id);
                            const rect =
                              canvas.current!.getBoundingClientRect();
                            setEdgeMenu({
                              x: (event.clientX - rect.left) / scale + 16,
                              y: (event.clientY - rect.top) / scale + 16,
                            });
                            canvas.current?.focus({ preventScroll: true });
                            setSelected(null);
                          }
                        }}
                      />
                      {path.text && (
                        <text x={path.x} y={path.y}>
                          {path.text}
                        </text>
                      )}
                    </g>
                  )
                );
              })}
              {gesture?.type === "edge" &&
                (() => {
                  const p = positions.find((p) => p.node.id === gesture.nodeId);
                  if (!p || !canvas.current) return null;
                  const a = anchorPoint(p, gesture.anchor),
                    rect = canvas.current.getBoundingClientRect();
                  return (
                    <path
                      className="flow-edge-preview"
                      d={`M ${a.x} ${a.y} L ${(gesture.current.x - rect.left) / scale} ${(gesture.current.y - rect.top) / scale}`}
                      markerEnd={`url(#${marker})`}
                    />
                  );
                })()}
              {moving?.guideX !== undefined && (
                <line
                  className="flow-alignment-guide"
                  x1={moving.guideX}
                  y1={0}
                  x2={moving.guideX}
                  y2={height}
                />
              )}
              {moving?.guideY !== undefined && (
                <line
                  className="flow-alignment-guide"
                  x1={0}
                  y1={moving.guideY}
                  x2={width}
                  y2={moving.guideY}
                />
              )}
              {positions.map(({ node: n, x, y, width: w, height: h }) => (
                <g
                  key={n.id}
                  className={cn(
                    "flow-node-shape",
                    n.role === "body-condition" && "inner",
                    activeNode === n.id && "executing",
                    selected === n.id && "selected",
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
            {positions.map(({ node: n, x, y, width: w, height: h }) => (
              <div
                key={n.id}
                data-node={n.id}
                data-x={x}
                data-y={y}
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
                  selected === n.id && "selected",
                )}
                style={{ left: x - w / 2, top: y - h / 2, width: w, height: h }}
              >
                <div
                  className="flow-node-content"
                  tabIndex={readonly ? undefined : 0}
                  role="group"
                  aria-label={`移动${nodeText(n)}`}
                  onPointerDown={(e) =>
                    begin(e, { type: "move", nodeId: n.id, origin: { x, y } })
                  }
                  onKeyDown={(e) => {
                    if (locked) return;
                    const delta: Record<string, Point> = {
                      ArrowLeft: { x: -10, y: 0 },
                      ArrowRight: { x: 10, y: 0 },
                      ArrowUp: { x: 0, y: -10 },
                      ArrowDown: { x: 0, y: 10 },
                    };
                    if (delta[e.key]) {
                      e.preventDefault();
                      apply({
                        ...plan,
                        nodes: nodes.map((v) =>
                          v.id === n.id
                            ? {
                                ...v,
                                x: Math.min(
                                  3900,
                                  Math.max(w / 2 + 24, x + delta[e.key].x),
                                ),
                                y: Math.min(
                                  3900,
                                  Math.max(h / 2 + 24, y + delta[e.key].y),
                                ),
                              }
                            : v,
                        ),
                      });
                    }
                    if (e.key === "Delete" || e.key === "Backspace") {
                      e.preventDefault();
                      removeNode(n.id);
                    }
                  }}
                >
                  <strong>{nodeText(n)}</strong>
                  {n.role === "loop-condition" && <small>循环判断</small>}
                </div>
                {!readonly && (
                  <>
                    {anchors.map((anchor) => (
                      <span
                        key={anchor}
                        data-anchor={anchor}
                        data-node-id={n.id}
                        className={`flow-vertex vertex-${anchor}`}
                        title={`从${anchorNames[anchor]}侧拖出箭头，或把箭头接到这里`}
                        onPointerDown={(e) =>
                          begin(e, { type: "edge", nodeId: n.id, anchor })
                        }
                      />
                    ))}
                    {n.kind === "decision" && (
                      <>
                        {!edges.some(
                          (e) => e.from === n.id && e.label === "yes",
                        ) && (
                          <span className="flow-branch-label branch-yes">
                            是
                          </span>
                        )}
                        {!edges.some(
                          (e) => e.from === n.id && e.label === "no",
                        ) && (
                          <span className="flow-branch-label branch-no">
                            否
                          </span>
                        )}
                      </>
                    )}
                    {selected === n.id && !gesture && (
                      <div className="flow-node-edit">
                        <button
                          type="button"
                          title="删除节点"
                          aria-label={`删除${nodeText(n)}`}
                          disabled={locked}
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={() => removeNode(n.id)}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            ))}
            {!readonly && editEdge && !gesture && (
              <div
                className="flow-edge-editor"
                style={{
                  left: Math.max(8, Math.min(width - 260 / scale, menuPoint.x)),
                  top: Math.max(8, Math.min(height - 105 / scale, menuPoint.y)),
                  transform: `scale(${1 / scale})`,
                  transformOrigin: "top left",
                }}
                onPointerDown={(e) => e.stopPropagation()}
              >
                <span>
                  {nodeText(nodes.find((n) => n.id === editEdge.from))} →{" "}
                  {nodeText(nodes.find((n) => n.id === editEdge.to))}
                </span>
                {nodes.find((n) => n.id === editEdge.from)?.kind ===
                  "decision" && (
                  <label>
                    分支{" "}
                    <select
                      aria-label="箭头分支"
                      disabled={locked}
                      value={editEdge.label}
                      onChange={(e) =>
                        patchEdge({ label: e.target.value as "yes" | "no" })
                      }
                    >
                      <option value="yes">是</option>
                      <option value="no">否</option>
                    </select>
                  </label>
                )}
                <label>
                  <input
                    type="checkbox"
                    aria-label="作为返回箭头"
                    disabled={locked}
                    checked={editEdge.kind === "return"}
                    onChange={(e) =>
                      patchEdge({
                        kind: e.target.checked ? "return" : "normal",
                      })
                    }
                  />{" "}
                  返回箭头
                </label>
                <button
                  type="button"
                  disabled={locked}
                  aria-label="删除选中箭头"
                  onClick={deleteEdge}
                >
                  <Trash2 size={14} />
                  删除
                </button>
              </div>
            )}
            {!nodes.length && (
              <div className="flow-builder-empty">
                把上方的方块拖到这里
                <br />
                位置由你安排，箭头由你连接
              </div>
            )}
          </div>
        </div>
      </div>
      {gesture?.type === "palette" && (
        <div
          className="flow-drag-ghost"
          style={{ left: gesture.current.x + 12, top: gesture.current.y + 12 }}
        >
          {palette.find((p) => p.id === gesture.paletteId)?.label}
        </div>
      )}
      {gesture?.type === "edge" && (
        <div className="flow-connection-note" role="status">
          拖到目标图形的上、下、左或右边缘后松手；按 Esc 取消。
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
                <span>{validation.errors[0]}。可以运行看看会停在哪里。</span>
          </>
        )}
      </div>
    </div>
  );
}
