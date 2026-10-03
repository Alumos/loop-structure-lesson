import type { FlowEdge, FlowNode, Plan } from "../../shared/engine";

export function classifyFlowEdges(
  nodes: FlowNode[],
  edges: FlowEdge[],
): FlowEdge[] {
  const known = new Set(nodes.map((node) => node.id));
  const outgoing = new Map<string, FlowEdge[]>();
  for (const edge of edges) {
    const list = outgoing.get(edge.from) || [];
    list.push(edge);
    outgoing.set(edge.from, list);
  }
  const active = new Set<string>();
  const visited = new Set<string>();
  const returns = new Set<string>();
  const walk = (id: string) => {
    if (!known.has(id) || visited.has(id)) return;
    active.add(id);
    for (const edge of [...(outgoing.get(id) || [])].sort(
      (a, b) => Number(a.label === "yes") - Number(b.label === "yes"),
    )) {
      if (active.has(edge.to)) returns.add(edge.id);
      else walk(edge.to);
    }
    active.delete(id);
    visited.add(id);
  };
  nodes
    .filter((node) => node.kind === "start")
    .forEach((node) => walk(node.id));
  return edges.map((edge) => ({
    ...edge,
    kind: returns.has(edge.id) ? "return" : "normal",
  }));
}

export function snapPoint(
  point: { x: number; y: number },
  nodes: Pick<FlowNode, "id" | "x" | "y">[],
  exclude: string | undefined,
  tolerance: number,
) {
  const peers = nodes.filter((n) => n.id !== exclude);
  const closest = (axis: "x" | "y") =>
    peers
      .map((n) => n[axis])
      .filter(
        (n): n is number =>
          n !== undefined && Math.abs(n - point[axis]) <= tolerance,
      )
      .sort((a, b) => Math.abs(a - point[axis]) - Math.abs(b - point[axis]))[0];
  const guideX = closest("x"),
    guideY = closest("y");
  return {
    x: guideX ?? Math.round(point.x / 10) * 10,
    y: guideY ?? Math.round(point.y / 10) * 10,
    guideX,
    guideY,
  };
}

// Follow existing arrows to arrange the student's diagram. Never add, remove or repair a connection.
export function arrangeFlow(plan: Plan): Plan {
  const nodes = plan.nodes || [],
    edges = plan.edges || [],
    order: FlowNode[] = [],
    seen = new Set<string>();
  const branches = new Map<string, FlowNode[]>();
  for (const n of nodes.filter((n) => n.role === "body-condition")) {
    const targets = edges
      .filter((e) => e.from === n.id && e.label === "yes")
      .map((e) => nodes.find((n) => n.id === e.to))
      .filter((n): n is FlowNode => n?.role === "branch-action");
    branches.set(n.id, targets);
  }
  const branchIds = new Set([...branches.values()].flat().map((n) => n.id));
  const walk = (first?: FlowNode) => {
    let node = first;
    while (node && !seen.has(node.id)) {
      seen.add(node.id);
      if (node.kind !== "end" && !branchIds.has(node.id)) order.push(node);
      const next = edges.find(
        (e) =>
          e.from === node!.id &&
          e.kind !== "return" &&
          (node!.kind !== "decision" || e.label === "no"),
      );
      node = nodes.find((n) => n.id === next?.to);
    }
  };
  nodes.filter((n) => n.kind === "start").forEach(walk);
  nodes.filter((n) => n.kind !== "end" && !branchIds.has(n.id)).forEach(walk);
  order.push(...nodes.filter((n) => n.kind === "end"));
  const coordinates = new Map<string, { x: number; y: number }>();
  let y = 80;
  for (const node of order) {
    coordinates.set(node.id, { x: 340, y });
    const attached = branches.get(node.id) || [];
    for (const branch of attached) {
      coordinates.set(branch.id, { x: 660, y: y + 80 });
    }
    y += attached.length ? 240 : 140;
  }
  const maxY = Math.max(1, ...[...coordinates.values()].map((p) => p.y));
  if (maxY > 3800)
    for (const p of coordinates.values())
      p.y = Math.round((p.y * 3800) / maxY / 10) * 10;
  return {
    ...plan,
    nodes: nodes.map((n) => ({ ...n, ...coordinates.get(n.id) })),
    edges: edges.map((e) => {
      const from = nodes.find((n) => n.id === e.from),
        to = nodes.find((n) => n.id === e.to);
      if (e.kind === "return")
        return { ...e, fromAnchor: "left", toAnchor: "left" };
      if (from?.kind === "decision" && e.label === "yes")
        return {
          ...e,
          fromAnchor: "right",
          toAnchor: to?.kind === "end" ? "right" : "top",
        };
      if (from?.role === "branch-action")
        return { ...e, fromAnchor: "bottom", toAnchor: "right" };
      return { ...e, fromAnchor: "bottom", toAnchor: "top" };
    }),
  };
}
