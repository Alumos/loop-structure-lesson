import type { FlowAnchor, FlowEdge, FlowNode } from "../../shared/engine";

type Point = { x: number; y: number };
export type Position = Point & {
  node: FlowNode;
  width: number;
  height: number;
};
const vectors: Record<FlowAnchor, Point> = {
  top: { x: 0, y: -1 },
  right: { x: 1, y: 0 },
  bottom: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
};
export function anchorPoint(p: Position, anchor: FlowAnchor): Point {
  const v = vectors[anchor];
  return { x: p.x + (v.x * p.width) / 2, y: p.y + (v.y * p.height) / 2 };
}
function simplify(points: Point[]): Point[] {
  const result: Point[] = [];
  for (const point of points) {
    const b = result[result.length - 1],
      a = result[result.length - 2];
    if (b && b.x === point.x && b.y === point.y) continue;
    if (
      a &&
      b &&
      ((a.x === b.x && b.x === point.x) || (a.y === b.y && b.y === point.y))
    ) {
      // A reversal is a visible hook; never collapse it into a different connection.
      if ((b.x - a.x) * (point.x - b.x) + (b.y - a.y) * (point.y - b.y) < 0)
        return [];
      result.pop();
    }
    result.push(point);
  }
  return result;
}
type Box = { left: number; right: number; top: number; bottom: number };
function clear(a: Point, b: Point, boxes: Box[]) {
  return !boxes.some((box) =>
    a.x === b.x
      ? a.x > box.left &&
        a.x < box.right &&
        Math.max(a.y, b.y) > box.top &&
        Math.min(a.y, b.y) < box.bottom
      : a.y > box.top &&
        a.y < box.bottom &&
        Math.max(a.x, b.x) > box.left &&
        Math.min(a.x, b.x) < box.right,
  );
}
const cost = (points: Point[]) =>
  points
    .slice(1)
    .reduce(
      (sum, p, i) =>
        sum + Math.abs(p.x - points[i].x) + Math.abs(p.y - points[i].y),
      0,
    ) +
  (points.length - 2) * 24;

// Rare complex arrangements use a sparse visibility grid. Ordinary links use the
// simpler candidates below, keeping dragging responsive even on larger diagrams.
function gridPath(
  start: Point,
  end: Point,
  boxes: Box[],
  from: Point,
  to: Point,
): Point[] {
  const xs = [
    ...new Set([
      start.x,
      end.x,
      12,
      ...boxes.flatMap((b) => [Math.max(12, b.left - 8), b.right + 8]),
    ]),
  ].sort((a, b) => a - b);
  const ys = [
    ...new Set([
      start.y,
      end.y,
      12,
      ...boxes.flatMap((b) => [Math.max(12, b.top - 8), b.bottom + 8]),
    ]),
  ].sort((a, b) => a - b);
  const key = (x: number, y: number, dir: number) => `${x},${y},${dir}`;
  const sx = xs.indexOf(start.x),
    sy = ys.indexOf(start.y);
  type State = {
    x: number;
    y: number;
    dir: number;
    distance: number;
    previous?: string;
  };
  const states = new Map<string, State>(),
    heap: { key: string; priority: number }[] = [];
  const put = (id: string, priority: number) => {
    heap.push({ key: id, priority });
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heap[p].priority <= priority) break;
      [heap[p], heap[i]] = [heap[i], heap[p]];
      i = p;
    }
  };
  const pop = () => {
    const head = heap[0],
      last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      let i = 0;
      while (true) {
        let n = i;
        for (const c of [2 * i + 1, 2 * i + 2])
          if (c < heap.length && heap[c].priority < heap[n].priority) n = c;
        if (n === i) break;
        [heap[n], heap[i]] = [heap[i], heap[n]];
        i = n;
      }
    }
    return head;
  };
  const first = key(sx, sy, 4);
  states.set(first, { x: sx, y: sy, dir: 4, distance: 0 });
  put(first, 0);
  const visited = new Set<string>(),
    dirs = [
      [1, 0],
      [0, 1],
      [-1, 0],
      [0, -1],
    ];
  while (heap.length) {
    const item = pop();
    if (visited.has(item.key)) continue;
    visited.add(item.key);
    const state = states.get(item.key)!,
      a = { x: xs[state.x], y: ys[state.y] };
    if (a.x === end.x && a.y === end.y) {
      const result: Point[] = [];
      let id: string | undefined = item.key;
      while (id) {
        const s: State = states.get(id)!;
        result.push({ x: xs[s.x], y: ys[s.y] });
        id = s.previous;
      }
      return result.reverse();
    }
    for (let dir = 0; dir < 4; dir++) {
      const [dx, dy] = dirs[dir],
        x = state.x + dx,
        y = state.y + dy;
      if (x < 0 || y < 0 || x >= xs.length || y >= ys.length) continue;
      if (state.dir === 4 && dx * from.x + dy * from.y < 0) continue;
      if (state.dir !== 4 && (state.dir + 2) % 4 === dir) continue;
      const b = { x: xs[x], y: ys[y] };
      if (b.x === end.x && b.y === end.y && dx * to.x + dy * to.y > 0) continue;
      if (!clear(a, b, boxes)) continue;
      const id = key(x, y, dir),
        distance =
          state.distance +
          Math.abs(b.x - a.x) +
          Math.abs(b.y - a.y) +
          (state.dir !== 4 && state.dir !== dir ? 24 : 0);
      if (distance >= (states.get(id)?.distance ?? Infinity)) continue;
      states.set(id, { x, y, dir, distance, previous: item.key });
      put(id, distance + Math.abs(end.x - b.x) + Math.abs(end.y - b.y));
    }
  }
  return [];
}
function roundedPath(points: Point[]) {
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const a = points[i - 1],
      b = points[i],
      c = points[i + 1];
    const before = Math.abs(b.x - a.x) + Math.abs(b.y - a.y),
      after = Math.abs(c.x - b.x) + Math.abs(c.y - b.y);
    const radius = Math.min(8, before / 2, after / 2);
    const p = {
      x: b.x + ((a.x - b.x) * radius) / before,
      y: b.y + ((a.y - b.y) * radius) / before,
    };
    const q = {
      x: b.x + ((c.x - b.x) * radius) / after,
      y: b.y + ((c.y - b.y) * radius) / after,
    };
    d += ` L ${p.x} ${p.y} Q ${b.x} ${b.y} ${q.x} ${q.y}`;
  }
  const end = points[points.length - 1];
  return d + ` L ${end.x} ${end.y}`;
}
export function edgeRoute(e: FlowEdge, positions: Position[]) {
  const a = positions.find((p) => p.node.id === e.from),
    b = positions.find((p) => p.node.id === e.to);
  if (!a || !b) return null;
  const from =
    e.kind === "return"
      ? "left"
      : e.fromAnchor || (e.label === "yes" ? "right" : "bottom");
  const to =
    e.kind === "return"
      ? "left"
      : e.toAnchor || (e.label === "yes" && b.x > a.x ? "left" : "top");
  const s = anchorPoint(a, from),
    t = anchorPoint(b, to),
    v = vectors[from],
    w = vectors[to];
  const gap = Math.abs(s.x - t.x) + Math.abs(s.y - t.y),
    stub = Math.min(20, Math.max(4, gap / 3));
  const u = { x: s.x + v.x * stub, y: s.y + v.y * stub },
    z = { x: t.x + w.x * stub, y: t.y + w.y * stub };
  const boxes = positions.map((p) => {
    const pad = p === a || p === b ? 0 : 12;
    return {
      left: p.x - p.width / 2 - pad,
      right: p.x + p.width / 2 + pad,
      top: p.y - p.height / 2 - pad,
      bottom: p.y + p.height / 2 + pad,
    };
  });
  const candidates: Point[][] = [];
  const returnLane = Math.max(
    12,
    Math.min(s.x, t.x, ...boxes.map((b) => b.left)) - 38,
  );
  if (e.kind === "return") {
    const lane = returnLane;
    candidates.push([s, { x: lane, y: s.y }, { x: lane, y: t.y }, t]);
  }
  if (from === "bottom" && to === "top" && t.y > s.y) {
    const mid = (s.y + t.y) / 2;
    candidates.push([s, { x: s.x, y: mid }, { x: t.x, y: mid }, t]);
  }
  candidates.push(
    [s, u, { x: z.x, y: u.y }, z, t],
    [s, u, { x: u.x, y: z.y }, z, t],
  );
  for (const x of [
    (u.x + z.x) / 2,
    ...boxes.flatMap((b) => [Math.max(12, b.left - 20), b.right + 20]),
  ])
    candidates.push([s, u, { x, y: u.y }, { x, y: z.y }, z, t]);
  for (const y of [
    (u.y + z.y) / 2,
    ...boxes.flatMap((b) => [Math.max(12, b.top - 20), b.bottom + 20]),
  ])
    candidates.push([s, u, { x: u.x, y }, { x: z.x, y }, z, t]);
  const routes = candidates
    .map(simplify)
    .filter(
      (p) => p.length >= 2 && p.slice(1).every((b, i) => clear(p[i], b, boxes)),
    );
  let points =
    e.kind === "return" && routes[0]?.[1]?.x === returnLane
      ? routes[0]
      : routes.sort((a, b) => cost(a) - cost(b))[0];
  if (!points) points = simplify([s, ...gridPath(u, z, boxes, v, w), t]);
  // Overlapping student nodes have no collision-free path. Keep the line compact
  // until the nodes are separated instead of drawing a distant detour.
  if (!points?.length) points = simplify([s, { x: t.x, y: s.y }, t]);
  if (!points?.length) points = [s, t];
  const text = e.label === "yes" ? "是" : e.label === "no" ? "否" : "";
  return {
    d: roundedPath(points),
    points,
    x: e.kind === "return" ? points[1].x + 8 : s.x + (v.x ? 12 : 10),
    y: e.kind === "return" ? (s.y + t.y) / 2 : s.y + (v.y ? 22 : -12),
    text: [text, e.kind === "return" ? "返回" : ""].filter(Boolean).join(" · "),
  };
}
