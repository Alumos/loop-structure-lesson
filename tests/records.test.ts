import { test } from "node:test";
import assert from "node:assert/strict";
import {
  compactSnapshot,
  editableSnapshot,
  restoreSnapshot,
} from "../shared/records.js";
import { levels, referencePlan } from "../shared/engine.js";

test("新记录保留学生的节点和箭头，丢弃运行动画", () => {
  const plan = referencePlan("l1");
  const saved = compactSnapshot({
    activity: "l1",
    plan,
    prediction: "6 轮",
    running: true,
    pointer: { x: 0, y: 0, kind: "move" },
  });
  assert.deepEqual(saved.plan, plan);
  assert.equal(saved.pointer, undefined);
  assert.equal(saved.running, undefined);
  assert.deepEqual(editableSnapshot(saved).plan, plan);
});
test("旧方案可以只读回放，重新编辑和进入旧草稿时从空图开始", () => {
  const old = { activity: "l1", plan: levels[0].answer, result: "任务完成" };
  assert.equal(restoreSnapshot(old).frame!.moves, 6);
  const editing = editableSnapshot(old);
  assert.deepEqual(editing.plan!.nodes, []);
  assert.deepEqual(editing.plan!.edges, []);
  assert.equal(editing.result, undefined);
  assert.equal(editing.frame!.moves, 0);
});
