import { test } from "node:test";
import assert from "node:assert/strict";
import {
  snapPoint,
  arrangeFlow,
  classifyFlowEdges,
} from "../src/lib/flow-layout";
import { edgeRoute } from "../src/components/Flow";
import { referencePlan, levels, validateFlow } from "../shared/engine";

test("自动吸附优先贴近节点中心，否则贴合网格；排除正在拖动的节点", () => {
  const peers = [
    { id: "a", x: 340, y: 200 },
    { id: "b", x: 410, y: 500 },
  ];
  assert.deepEqual(snapPoint({ x: 348, y: 506 }, peers, "a", 12), {
    x: 350,
    y: 500,
    guideX: undefined,
    guideY: 500,
  });
  assert.equal(snapPoint({ x: 348, y: 350 }, peers, "b", 12).x, 340);
});
test("整理三关只改布局与连接边缘，保留学生原有的箭头、标签和执行顺序", () => {
  for (const level of levels) {
    const plan = referencePlan(level.id),
      arranged = arrangeFlow(plan);
    const relations = (p: typeof plan) =>
      p.edges!.map(({ fromAnchor, toAnchor, ...e }) => e);
    assert.deepEqual(relations(arranged), relations(plan));
    assert.deepEqual(
      validateFlow(level, arranged).body,
      validateFlow(level, plan).body,
    );
    const main = arranged.nodes!.filter((n) => n.role !== "branch-action");
    assert.ok(main.every((n) => n.x === 340));
    assert.equal(new Set(main.map((n) => n.y)).size, main.length);
  }
  const incomplete = referencePlan("l1");
  incomplete.edges = incomplete.edges!.filter((e) => e.kind !== "return");
  assert.equal(validateFlow(levels[0], arrangeFlow(incomplete)).valid, false);
  assert.equal(arrangeFlow(incomplete).edges!.length, incomplete.edges.length);
});

test("返回箭头只指向从开始到当前节点已经经过的步骤", () => {
  for (const level of levels) {
    const plan = referencePlan(level.id);
    const classified = classifyFlowEdges(
      plan.nodes!,
      plan.edges!.reverse().map((edge) => ({ ...edge, kind: "normal" })),
    );
    assert.equal(
      classified.filter((edge) => edge.kind === "return").length,
      1,
      level.id,
    );
    assert.equal(
      validateFlow(level, { ...plan, edges: classified }).valid,
      true,
      level.id,
    );
  }
  const plan = referencePlan("l4", "post");
  const conditionReturn = plan.edges!.find(
    (edge) => edge.id === "condition-return",
  )!;
  conditionReturn.to = "end";
  assert.equal(
    classifyFlowEdges(plan.nodes!, plan.edges!).find(
      (edge) => edge.id === conditionReturn.id,
    )?.kind,
    "normal",
  );
  const stray = [
    { id: "a", kind: "action" as const, block: "fwd" },
    { id: "b", kind: "action" as const, block: "fwd" },
  ];
  const disconnected = classifyFlowEdges(
    [{ id: "start", kind: "start" }, ...stray],
    [
      { id: "a-b", from: "a", to: "b" },
      { id: "b-a", from: "b", to: "a", kind: "return" },
    ],
  );
  assert.ok(disconnected.every((edge) => edge.kind === "normal"));
});

test("近距离向下连线不绕到图形外侧", () => {
  const decision = { id: "decision", kind: "decision" as const };
  const end = { id: "end", kind: "end" as const };
  const positions = [
    { node: decision, x: 340, y: 200, width: 244, height: 104 },
    { node: end, x: 340, y: 322, width: 116, height: 42 },
  ];
  const route = edgeRoute(
    {
      id: "no-end",
      from: "decision",
      to: "end",
      label: "no",
      kind: "normal",
      fromAnchor: "bottom",
      toAnchor: "top",
    },
    positions,
  )!;
  assert.equal(route.d, "M 340 252 L 340 301");
  const offset = edgeRoute(
    {
      id: "no-end",
      from: "decision",
      to: "end",
      label: "no",
      kind: "normal",
      fromAnchor: "bottom",
      toAnchor: "top",
    },
    [positions[0], { ...positions[1], x: 300 }],
  )!;
  assert.deepEqual(offset.points, [
    { x: 340, y: 252 },
    { x: 340, y: 276.5 },
    { x: 300, y: 276.5 },
    { x: 300, y: 301 },
  ]);
});

test("就近连接结束，不强制绕整图；绕开动作且没有回折", () => {
  const nearBorder = [
    {
      node: { id: "a", kind: "action" as const },
      x: 122,
      y: 400,
      width: 196,
      height: 54,
    },
    {
      node: { id: "b", kind: "action" as const },
      x: 122,
      y: 150,
      width: 196,
      height: 54,
    },
  ];
  const visibleReturn = edgeRoute(
    { id: "return", from: "a", to: "b", kind: "return" },
    nearBorder,
  )!;
  assert.ok(
    visibleReturn.points.every((point) => point.x >= 12),
    "靠左放置时返回箭头仍完整显示",
  );
  const positions = [
    {
      node: { id: "decision", kind: "decision" as const },
      x: 340,
      y: 200,
      width: 244,
      height: 104,
    },
    {
      node: { id: "end", kind: "end" as const },
      x: 700,
      y: 200,
      width: 116,
      height: 42,
    },
    {
      node: { id: "far", kind: "action" as const },
      x: 1100,
      y: 500,
      width: 196,
      height: 54,
    },
  ];
  const close = edgeRoute(
    {
      id: "yes",
      from: "decision",
      to: "end",
      label: "yes",
      fromAnchor: "right",
      toAnchor: "left",
    },
    positions,
  )!;
  assert.equal(close.d, "M 462 200 L 642 200");
  const facingAway = edgeRoute(
    {
      id: "end",
      from: "decision",
      to: "end",
      label: "yes",
      fromAnchor: "right",
      toAnchor: "right",
    },
    positions,
  )!;
  assert.ok(Math.max(...facingAway.points.map((p) => p.x)) < 900);
  const blocked = edgeRoute(
    {
      id: "line",
      from: "decision",
      to: "end",
      fromAnchor: "bottom",
      toAnchor: "top",
    },
    [
      positions[0],
      { ...positions[1], x: 340, y: 600 },
      { ...positions[2], x: 340, y: 400 },
    ],
  )!;
  for (let i = 1; i < blocked.points.length; i++) {
    const a = blocked.points[i - 1],
      b = blocked.points[i];
    assert.ok(a.x === b.x || a.y === b.y);
    if (a.x === b.x)
      assert.ok(
        a.x <= 230 ||
          a.x >= 450 ||
          Math.max(a.y, b.y) <= 361 ||
          Math.min(a.y, b.y) >= 439,
      );
  }
  for (const route of [close, facingAway, blocked]) {
    assert.ok(!route.d.includes("NaN"));
    for (let i = 2; i < route.points.length; i++) {
      const [a, b, c] = route.points.slice(i - 2, i + 1);
      assert.ok(
        (b.x - a.x) * (c.x - b.x) + (b.y - a.y) * (c.y - b.y) >= 0,
        "路径不能掉头形成钩子",
      );
    }
  }
});
