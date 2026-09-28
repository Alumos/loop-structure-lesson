import { test } from "node:test";
import assert from "node:assert/strict";
import { levels, simulate, gradeQuiz, initialPlan } from "../shared/engine.js";
test("四关正确方案保留教案中的轮数、路线和判断结果", () => {
  const expected = [
    [6, 6],
    [5, 5],
    [8, 8],
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
  const r = simulate("l3", { ...levels[2].answer, timing: "pre" });
  assert.equal(r.stop, "noData");
  assert.equal(r.frames.at(-1)!.rounds, 0);
  const home = simulate("l4", { ...levels[3].answer, timing: "pre" });
  assert.equal(home.stop, "condition");
  assert.equal(home.frames.at(-1)!.rounds, 0);
  assert.notEqual(r.reason, home.reason);
});
test("水冰站停下，不能扫描基地或继续到第九站", () => {
  const r = simulate("l3", levels[2].answer),
    f = r.frames.at(-1)!;
  assert.equal(f.scans, 8);
  assert.deepEqual([f.x, f.y], [2, 1]);
  assert.equal(f.scanned.includes(8), false);
  assert.equal(
    simulate("l3", { ...levels[2].answer, body: ["scan", "advance"] }).stop,
    "notSample",
  );
});
test("第四关预填；空方案、非法积木与位置脉冲过早有明确结果", () => {
  assert.equal(initialPlan("l4").body.length, 3);
  assert.equal(simulate("l1", initialPlan("l1")).stop, "empty");
  assert.equal(
    simulate("l1", { ...levels[0].answer, body: ["pulse", "fwd"] }).stop,
    "badPulse",
  );
  assert.throws(() => simulate("l1", { ...levels[0].answer, body: ["scan"] }));
});
test("验收三题各 2 分，错误理由不会给满分", () => {
  assert.equal(gradeQuiz("q1", [1, 1]), 2);
  assert.equal(gradeQuiz("q2", [0, 1]), 2);
  assert.equal(gradeQuiz("q3", [1, 0]), 2);
  assert.equal(gradeQuiz("q3", [1, 1]), 1);
});
