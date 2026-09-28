export type Timing = "pre" | "post";
export type Plan = { timing: Timing; condition: string; body: string[] };
export type Frame = {
  x: number;
  y: number;
  d: number;
  rounds: number;
  steps: number;
  moves: number;
  turns: number;
  scans: number;
  pulses: number;
  battery: number;
  scanResult: boolean | null;
  visited: string[];
  scanned: number[];
  active: number | "condition" | null;
  text: string;
};
export type Simulation = {
  frames: Frame[];
  win: boolean;
  reason: string;
  stop: string;
};
export type Level = {
  id: string;
  title: string;
  brief: string;
  task: string;
  cols: number;
  rows: number;
  start: [number, number, number];
  target?: [number, number];
  craters: string[];
  samples?: [number, number][];
  blocks: string[];
  conditions: string[];
  battery: number;
  prediction: string;
  options: string[];
  hint: string;
  answer: Plan;
};
export const blocks: Record<string, string> = {
  fwd: "前进 1 格",
  pulse: "发送位置脉冲",
  left: "左转 90°",
  right: "右转 90°",
  if_left: "前方危险则左转",
  advance: "沿路线去下一站",
  scan: "扫描当前样点",
};
export const conditions: Record<string, string> = {
  tower: "到达中继塔？",
  camp: "到达营地？",
  ice: "本轮扫描到水冰？",
  home: "位于出发点且朝向相同？",
  battery: "电量不足？",
};
export const levels: Level[] = [
  {
    id: "l1",
    title: "建立中继通信",
    brief: "找出反复执行的一组动作",
    task: "每到一个新格子，发送一次位置脉冲。到达中继塔后停止。",
    cols: 7,
    rows: 1,
    start: [0, 0, 0],
    target: [6, 0],
    craters: [],
    blocks: ["fwd", "pulse", "right"],
    conditions: ["tower", "battery"],
    battery: 18,
    prediction: "到达中继塔，循环体会执行几轮？",
    options: ["6 轮", "12 轮", "其他"],
    hint: "前进和发送合起来才是一轮；先到新格子，再发送位置。",
    answer: { timing: "pre", condition: "tower", body: ["fwd", "pulse"] },
  },
  {
    id: "l2",
    title: "峡谷巡路",
    brief: "先观察，再决定怎样行动",
    task: "起点车头朝东，正对地图外。沿绿色通道安全到达营地。",
    cols: 4,
    rows: 3,
    start: [3, 2, 0],
    target: [0, 0],
    craters: ["0,1", "1,1", "2,1", "0,2", "1,2", "2,2"],
    blocks: ["fwd", "if_left"],
    conditions: ["camp", "battery"],
    battery: 14,
    prediction: "“前进 → 检查危险”会在什么时候出错？",
    options: ["第 1 步", "第 2 步", "不会出错"],
    hint: "检查危险控制本轮是否左转；到达营地控制整个循环是否停止。",
    answer: { timing: "pre", condition: "camp", body: ["if_left", "fwd"] },
  },
  {
    id: "l3",
    title: "寻找水冰",
    brief: "未测，不等于没有信号",
    task: "基地不是样点。每轮去下一站，再扫描。发现水冰后停在该站。保持动作不变，对照两种判断时机。",
    cols: 6,
    rows: 4,
    start: [0, 3, 0],
    craters: ["0,0", "2,0", "5,0", "0,2", "5,1", "1,2", "2,2", "5,3"],
    samples: [
      [1, 3],
      [2, 3],
      [3, 3],
      [4, 3],
      [4, 2],
      [4, 1],
      [3, 1],
      [2, 1],
      [1, 1],
      [0, 1],
    ],
    blocks: ["advance", "scan", "fwd"],
    conditions: ["ice", "battery"],
    battery: 20,
    prediction: "首次扫描前，先判断“本轮发现水冰？”会怎样？",
    options: ["没有数据，无法判断", "没有水冰，继续走", "已经发现，停止"],
    hint: "“未知”和“没有”不同。先到样点扫描，才有本轮的数据。",
    answer: { timing: "post", condition: "ice", body: ["advance", "scan"] },
  },
  {
    id: "l4",
    title: "绕坑一圈",
    brief: "起点条件已经成立",
    task: "循环体已经填好。只切换判断时机，比较 0 轮与 4 轮的差异。",
    cols: 3,
    rows: 3,
    start: [0, 0, 0],
    craters: ["1,1"],
    blocks: ["fwd", "right", "left"],
    conditions: ["home", "battery"],
    battery: 16,
    prediction: "出发前先判断是否位于起点，会执行几轮？",
    options: ["0 轮", "1 轮", "4 轮"],
    hint: "出发时已经在起点。先执行一次，才能开始这次巡逻。",
    answer: {
      timing: "post",
      condition: "home",
      body: ["fwd", "fwd", "right"],
    },
  },
];
export function initialPlan(id: string): Plan {
  const l = levels.find((l) => l.id === id)!;
  return {
    timing: "pre",
    condition: l.conditions[0],
    body: id === "l4" ? [...l.answer.body] : [],
  };
}
export function initialFrame(l: Level): Frame {
  return {
    x: l.start[0],
    y: l.start[1],
    d: l.start[2],
    rounds: 0,
    steps: 0,
    moves: 0,
    turns: 0,
    scans: 0,
    pulses: 0,
    battery: l.battery,
    scanResult: null,
    visited: [`${l.start[0]},${l.start[1]}`],
    scanned: [],
    active: null,
    text: "等待你的巡视方案",
  };
}
export function simulate(id: string, p: Plan): Simulation {
  const l = levels.find((l) => l.id === id);
  if (!l) throw new Error("未知关卡");
  if (
    !["pre", "post"].includes(p.timing) ||
    !l.conditions.includes(p.condition) ||
    p.body.length > 8 ||
    p.body.some((b) => !l.blocks.includes(b))
  )
    throw new Error("无效的巡视方案");
  const s = initialFrame(l),
    frames: Frame[] = [];
  const push = (text: string, active: Frame["active"] = null) => {
    s.text = text;
    s.active = active;
    frames.push(structuredClone(s));
  };
  const dirs = [
      [1, 0],
      [0, 1],
      [-1, 0],
      [0, -1],
    ],
    names = ["东", "南", "西", "北"];
  const inside = (x: number, y: number) =>
    x >= 0 && x < l.cols && y >= 0 && y < l.rows;
  const check = (): boolean | null => {
    let v: boolean | null = false;
    if (p.condition === "ice") v = s.scanResult;
    else if (p.condition === "home")
      v = s.x === l.start[0] && s.y === l.start[1] && s.d === l.start[2];
    else if (p.condition === "battery") v = s.battery < 2;
    else v = !!l.target && s.x === l.target[0] && s.y === l.target[1];
    push(
      `判断「${conditions[p.condition]}」：${v === null ? "未知，尚无扫描数据" : v ? "是，停止" : "否，继续"}`,
      "condition",
    );
    return v;
  };
  let stop = p.body.length ? "" : "empty";
  outer: while (!stop && s.rounds < 60) {
    if (p.timing === "pre") {
      const v = check();
      if (v === null) {
        stop = "noData";
        break;
      }
      if (v) {
        stop = "condition";
        break;
      }
    }
    s.rounds++;
    for (let i = 0; i < p.body.length; i++) {
      const b = p.body[i];
      if (s.battery <= 0) {
        stop = "noPower";
        push("电量耗尽", i);
        break outer;
      }
      s.battery--;
      s.steps++;
      if (b === "fwd") {
        const x = s.x + dirs[s.d][0],
          y = s.y + dirs[s.d][1];
        if (!inside(x, y)) {
          stop = "out";
          push(`第 ${s.rounds} 轮：向${names[s.d]}前进，越过地图边界`, i);
          break outer;
        }
        s.x = x;
        s.y = y;
        s.moves++;
        if (!s.visited.includes(`${x},${y}`)) s.visited.push(`${x},${y}`);
        push(`第 ${s.rounds} 轮：前进到第 ${x + 1} 列、第 ${y + 1} 行`, i);
        if (l.craters.includes(`${x},${y}`)) {
          stop = "crash";
          break outer;
        }
      } else if (b === "if_left") {
        const x = s.x + dirs[s.d][0],
          y = s.y + dirs[s.d][1],
          danger = !inside(x, y) || l.craters.includes(`${x},${y}`);
        if (danger) {
          s.d = (s.d + 3) % 4;
          s.turns++;
        }
        push(
          `第 ${s.rounds} 轮：${danger ? "前方危险，左转向" + names[s.d] : "前方安全，保持方向"}`,
          i,
        );
      } else if (b === "pulse") {
        s.pulses++;
        push(`第 ${s.rounds} 轮：发送当前位置脉冲`, i);
        if (!s.moves) {
          stop = "badPulse";
          break outer;
        }
      } else if (b === "scan") {
        const k =
          l.samples?.findIndex(([x, y]) => x === s.x && y === s.y) ?? -1;
        if (k < 0) {
          stop = "notSample";
          push("基地不是采样点", i);
          break outer;
        }
        s.scans++;
        s.scanResult = k === 7;
        if (!s.scanned.includes(k)) s.scanned.push(k);
        push(
          `扫描 ${k + 1} 号样点：${s.scanResult ? "发现水冰" : "无信号"}`,
          i,
        );
      } else if (b === "advance") {
        const k = l.samples!.findIndex(([x, y]) => x === s.x && y === s.y),
          next = l.samples![k + 1];
        if (!next || (k < 0 && (s.x !== l.start[0] || s.y !== l.start[1]))) {
          stop = "routeEnd";
          push("已到路线终点", i);
          break outer;
        }
        const d = dirs.findIndex(
          ([dx, dy]) => dx === next[0] - s.x && dy === next[1] - s.y,
        );
        if (d < 0) {
          stop = "routeEnd";
          break outer;
        }
        if (d !== s.d) {
          s.turns++;
          s.d = d;
        }
        s.x = next[0];
        s.y = next[1];
        s.moves++;
        if (!s.visited.includes(`${s.x},${s.y}`))
          s.visited.push(`${s.x},${s.y}`);
        push(`沿路线到达 ${k + 2} 号样点`, i);
      } else {
        s.d = (s.d + (b === "left" ? 3 : 1)) % 4;
        s.turns++;
        push(`第 ${s.rounds} 轮：${blocks[b]}，朝${names[s.d]}`, i);
      }
    }
    if (p.timing === "post") {
      const v = check();
      if (v === null) {
        stop = "noData";
        break;
      }
      if (v) {
        stop = "condition";
        break;
      }
    }
  }
  if (!stop) stop = "endless";
  let win = stop === "condition";
  if (id === "l1")
    win =
      win &&
      p.condition === "tower" &&
      s.moves === 6 &&
      s.pulses === 6 &&
      p.body.join(",") === "fwd,pulse";
  if (id === "l2")
    win =
      win &&
      p.condition === "camp" &&
      s.x === 0 &&
      s.y === 0 &&
      s.moves === 5 &&
      s.turns === 2;
  if (id === "l3")
    win =
      win &&
      p.condition === "ice" &&
      s.scanResult === true &&
      s.x === 2 &&
      s.y === 1 &&
      s.moves === 8 &&
      s.scans >= 8;
  if (id === "l4")
    win =
      win &&
      p.condition === "home" &&
      s.visited.length === 8 &&
      s.moves === 8 &&
      s.turns === 4 &&
      s.rounds === 4;
  const reasons: Record<string, string> = {
    empty: "循环体还没有动作",
    noData: "尚无扫描数据，无法判断",
    out: "越过地图边界",
    crash: "坠入陨石坑",
    badPulse: "位置脉冲发早了，请先前进",
    notSample: "基地不是待测样点",
    routeEnd: "已到路线终点",
    noPower: "电量耗尽",
    endless: "超过运行上限，请检查停止条件",
    condition:
      s.rounds === 0
        ? "条件已经成立，原地停止（0 轮）"
        : "循环停止，但没有完成任务",
  };
  const reason = win
    ? `任务完成：${s.rounds} 轮，${s.moves} 格${id === "l3" ? "，第 8 站发现水冰" : ""}`
    : reasons[stop];
  push(reason);
  return { frames, win, reason, stop };
}
export const quizzes = [
  {
    id: "q1",
    title: "机械臂采样",
    description:
      "取一个样本 → 放入样本盒 → 判断“盒中已有 3 个样本？”；否 → 返回取样，是 → 结束。",
    questions: [
      {
        text: "循环体是哪一组操作？",
        options: ["取一个样本", "取一个样本 ＋ 放入样本盒", "判断样本数"],
      },
      {
        text: "控制循环结束的条件是什么？",
        options: ["取到一个样本？", "盒中已有 3 个样本？", "机械臂已经启动？"],
      },
    ],
  },
  {
    id: "q2",
    title: "充电站待命",
    description:
      "开始 → 到达充电站？→ 是：结束；否：前进 1 格，再返回判断。开始时巡视器已在充电站。",
    questions: [
      {
        text: "执行方式与轮数是？",
        options: [
          "先判断再执行，0 轮",
          "先执行后判断，1 轮",
          "先判断再执行，1 轮",
        ],
      },
      {
        text: "为什么？",
        options: [
          "每个循环都至少做一次",
          "起初停止条件已成立，直接结束",
          "电量不足，不能移动",
        ],
      },
    ],
  },
  {
    id: "q3",
    title: "拍摄清晰照片",
    description:
      "还没有拍摄照片，需要拍到一张清晰照片为止。循环体为“拍一张照片”。",
    questions: [
      {
        text: "应该怎样执行？第一张就清晰时拍几张？",
        options: [
          "先判断再拍照，0 张",
          "先拍照再判断，1 张",
          "先拍照再判断，2 张",
        ],
      },
      {
        text: "为什么？",
        options: [
          "先拍才有可判断的照片，清晰即停",
          "照片越多越好",
          "循环一定要重复两次",
        ],
      },
    ],
  },
];
export function gradeQuiz(id: string, answers: number[]) {
  const key: Record<string, number[]> = { q1: [1, 1], q2: [0, 1], q3: [1, 0] };
  if (!key[id]) throw new Error("未知题目");
  return key[id].reduce((n, a, i) => n + Number(answers[i] === a), 0);
}
export type Snapshot = {
  activity: string;
  plan?: Plan;
  frame?: Frame;
  prediction?: string;
  explanation?: string;
  running?: boolean;
  result?: string;
  answers?: number[];
  note?: string;
  selectedStudent?: string;
  pointer?: { x: number; y: number; kind: string };
  hint?: boolean;
  operator?: string;
  challenge?: { timing: Timing; initial: number };
  selfReview?: boolean[];
};
export const activityNames: Record<string, string> = Object.fromEntries([
  ...levels.map((l) => [l.id, l.title]),
  ...quizzes.map((q) => [q.id, q.title]),
  ["challenge", "充电调试 · 选做"],
  ["review", "学习小结"],
]);
