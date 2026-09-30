import { test } from "node:test";
import assert from "node:assert/strict";
import { snapPoint, arrangeFlow } from "../src/lib/flow-layout";
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
