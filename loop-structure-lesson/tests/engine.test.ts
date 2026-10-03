import { test } from "node:test";
import assert from "node:assert/strict";
import {
  levels,
  simulate,
  gradeQuiz,
  initialPlan,
  referencePlan,
  validateFlow,
  planFromBody,
  retimeFlow,
  getLevel,
  describeGraphPlan,
} from "../shared/engine.js";
test("课堂只显示三关，标准流程保留原有轮数和路线", () => {
  assert.deepEqual(
    levels.map((l) => l.id),
    ["l1", "l2", "l4"],
  );
  const expected = [
    [6, 6],
    [5, 5],
    [4, 8],
  ];
  levels.forEach((l, i) => {
    const r = simulate(l.id, l.answer),
      s = r.frames.at(-1)!;
    assert.equal(r.win, true, l.id);
    assert.equal(s.rounds, expected[i][0]);
    assert.equal(s.moves, expected[i][1]);
  });
});
test("错误动作顺序在第一步越界；更改后五格两转", () => {
  const r = simulate("l2", {
    timing: "pre",
    condition: "camp",
    body: ["fwd", "if_left"],
  });
  assert.equal(r.stop, "out");
  assert.equal(r.frames.at(-1)!.steps, 1);
  assert.equal(simulate("l2", levels[1].answer).frames.at(-1)!.turns, 2);
});
test("无扫描数据与条件已满足导致的零轮必须区分", () => {
  const r = simulate("l3", { ...getLevel("l3")!.answer, timing: "pre" });
  assert.equal(r.stop, "noData");
  assert.equal(r.frames.at(-1)!.rounds, 0);
  const home = simulate("l4", { ...getLevel("l4")!.answer, timing: "pre" });
  assert.equal(home.stop, "condition");
  assert.equal(home.frames.at(-1)!.rounds, 0);
  assert.notEqual(r.reason, home.reason);
});
test("水冰站停下，不能扫描基地或继续到第九站", () => {
  const r = simulate("l3", getLevel("l3")!.answer),
    f = r.frames.at(-1)!;
  assert.equal(f.scans, 8);
  assert.deepEqual([f.x, f.y], [2, 1]);
  assert.equal(f.scanned.includes(8), false);
  assert.equal(
    simulate("l3", { ...getLevel("l3")!.answer, body: ["scan", "advance"] })
      .stop,
    "notSample",
  );
});
test("三关参考流程图可验证；初始流程图为空", () => {
  levels.forEach((l) => {
    const p = referencePlan(l.id);
    assert.equal(validateFlow(l, p).valid, true, l.id);
    assert.equal(simulate(l.id, p).win, true, l.id);
  });
  assert.equal(initialPlan("l4").body.length, 0);
  assert.equal(validateFlow(getLevel("l4")!, initialPlan("l4")).valid, false);
  assert.equal(
    simulate("l1", { timing: "pre", condition: "tower", body: [] }).stop,
    "empty",
  );
  assert.equal(
    simulate("l1", { ...levels[0].answer, body: ["pulse", "fwd"] }).stop,
    "badPulse",
  );
  assert.throws(() => simulate("l1", { ...levels[0].answer, body: ["scan"] }));
});
test("缺少返回箭头也能运行，停在实际断线的动作", () => {
  const p = referencePlan("l1");
  p.edges = p.edges?.filter((e) => e.kind !== "return");
  assert.equal(validateFlow(levels[0], p).valid, false);
  const result = simulate("l1", p);
  assert.equal(result.stop, "broken");
  assert.equal(result.frames.at(-1)!.nodeId, "body-1");
  assert.equal(result.frames.at(-1)!.moves, 1);
  assert.throws(() =>
    simulate("l3", { ...getLevel("l3")!.answer, body: ["advance", "fwd"] }),
  );
});
test("判断时机和条件从实际箭头派生，隐藏字段不限制学生连图", () => {
  for (const level of levels) {
    for (const timing of ["pre", "post"] as const) {
      const plan = {
        ...referencePlan(level.id, timing),
        timing: timing === "pre" ? ("post" as const) : ("pre" as const),
        condition: "battery",
      };
      const described = describeGraphPlan(plan);
      assert.equal(described.timing, timing);
      assert.equal(described.condition, level.answer.condition);
      assert.equal(
        validateFlow(level, plan).valid,
        true,
        `${level.id}/${timing}`,
      );
      assert.equal(
        simulate(level.id, plan).win,
        level.id !== "l4" || timing === "post",
      );
    }
  }
  const battery = planFromBody("l1", {
    timing: "pre",
    condition: "battery",
    body: ["fwd", "pulse"],
  });
  assert.equal(
    describeGraphPlan({ ...battery, condition: "tower" }).condition,
    "battery",
  );
  assert.equal(simulate("l1", { ...battery, condition: "tower" }).win, false);
});
test("验收三题各 2 分，错误理由不会给满分", () => {
  assert.equal(gradeQuiz("q1", [1, 1]), 2);
  assert.equal(gradeQuiz("q1", [1, 0]), 1);
  assert.equal(gradeQuiz("q2", [0, 1]), 2);
  assert.equal(gradeQuiz("q3", [1, 0]), 2);
  assert.equal(gradeQuiz("q3", [1, 1]), 1);
});
test("箭头决定执行顺序：换显示位置不改顺序，断线后在当前动作停下", () => {
  const p = referencePlan("l1");
  p.nodes!.reverse();
  p.body = ["pulse", "fwd"];
  assert.deepEqual(validateFlow(levels[0], p).body, ["fwd", "pulse"]);
  assert.equal(simulate("l1", p).win, true);
  p.edges = p.edges!.filter((e) => e.id !== "body-0-next");
  assert.equal(validateFlow(levels[0], p).valid, false);
  assert.equal(simulate("l1", p).stop, "broken");
  assert.equal(simulate("l1", p).frames.at(-1)?.nodeId, "body-0");
});
test("返回箭头不能错连；内部判断必须完整并合流", () => {
  const p = referencePlan("l2");
  p.edges!.find((e) => e.kind === "return")!.to = "body-0-hazard";
  assert.equal(
    validateFlow(levels[1], p).issues.some((e) => e.code === "RETURN_TARGET"),
    true,
  );
  const missing = referencePlan("l2");
  missing.edges = missing.edges!.filter(
    (e) => e.label !== "no" || e.from === "condition-camp",
  );
  assert.equal(validateFlow(levels[1], missing).valid, false);
  const diverged = referencePlan("l2");
  diverged.edges!.find((e) => e.id === "body-0-no")!.to = "condition-camp";
  assert.equal(
    validateFlow(levels[1], diverged).issues.some((e) => e.code === "MERGE"),
    true,
  );
  const wrong = planFromBody("l2", {
    timing: "pre",
    condition: "camp",
    body: ["fwd", "if_left"],
  });
  assert.equal(validateFlow(levels[1], wrong).valid, true);
  assert.equal(simulate("l2", wrong).stop, "out");
});
test("旧水冰记录仍可回放；现第三关切换时机不替学生补箭头", () => {
  const wrong = planFromBody("l3", {
    timing: "post",
    condition: "ice",
    body: ["scan", "advance"],
  });
  assert.equal(validateFlow(getLevel("l3")!, wrong).valid, true);
  assert.equal(simulate("l3", wrong).stop, "notSample");
  const repeated = planFromBody("l3", {
    timing: "post",
    condition: "ice",
    body: ["advance", "scan", "scan"],
  });
  assert.equal(validateFlow(getLevel("l3")!, repeated).valid, true);
  assert.ok(simulate("l3", repeated).frames.at(-1)!.scans > 8);
  assert.equal(simulate("l3", repeated).win, false);
  const incomplete = referencePlan("l3", "pre");
  incomplete.edges = incomplete.edges!.filter((e) => e.kind !== "return");
  assert.deepEqual(
    retimeFlow(getLevel("l3")!, incomplete, "post").edges,
    incomplete.edges,
  );
  for (const l of levels.filter((l) => l.timingMode === "compare")) {
    const pre = referencePlan(l.id, "pre"),
      post = retimeFlow(l, pre, "post");
    assert.deepEqual(post.nodes, pre.nodes);
    assert.deepEqual(validateFlow(l, post).body, validateFlow(l, pre).body);
    assert.equal(simulate(l.id, pre).frames.at(-1)!.rounds, 0);
    assert.equal(simulate(l.id, post).win, true);
  }
});
test("运行帧高亮学生的节点和实际走过的分支箭头", () => {
  const p = referencePlan("l2"),
    frames = simulate("l2", p).frames;
  assert.equal(
    frames.some((f) => f.nodeId === "body-0-left"),
    true,
  );
  assert.equal(
    frames.some((f) => f.edgeId === "body-0-hazard-yes"),
    true,
  );
  assert.equal(
    frames.some((f) => f.edgeId === "body-0-no"),
    true,
  );
  assert.equal(
    frames.some((f) => f.edgeId === "body-return"),
    true,
  );
  assert.equal(frames.at(-1)!.nodeId, "end");
});
