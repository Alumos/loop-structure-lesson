export type Timing = "pre" | "post";
export type FlowNodeKind = "start" | "end" | "action" | "decision";
export type FlowNodeRole =
  "loop-condition" | "body-condition" | "branch-action";
export type FlowAnchor = "top" | "right" | "bottom" | "left";
export type FlowNode = {
  id: string;
  kind: FlowNodeKind;
  block?: string;
  role?: FlowNodeRole;
  condition?: string;
  x?: number;
  y?: number;
};
export type FlowEdge = {
  id: string;
  from: string;
  to: string;
  fromAnchor?: FlowAnchor;
  toAnchor?: FlowAnchor;
  label?: "yes" | "no";
  kind?: "normal" | "return";
};
export type Plan = {
  timing: Timing;
  condition: string;
  body: string[];
  nodes?: FlowNode[];
  edges?: FlowEdge[];
};
export type TimingMode = "fixed-pre" | "compare";
export type PaletteNode = {
  id: string;
  label: string;
  kind: FlowNodeKind;
  block?: string;
  role?: FlowNodeRole;
  condition?: string;
};
export type FlowValidation = {
  valid: boolean;
  errors: string[];
  issues: { code: string; message: string; nodeId?: string }[];
  body: string[];
  steps: { block: string; nodeId: string; branchNodeId?: string }[];
};
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
  nodeId?: string;
  edgeId?: string;
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
  timingMode: TimingMode;
  palette: PaletteNode[];
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
  advance: "到下一样点",
  scan: "扫描当前样点",
};
export const conditions: Record<string, string> = {
  tower: "到达中继塔？",
  camp: "到达营地？",
  ice: "本轮扫描到水冰？",
  home: "位于出发点且朝向相同？",
  battery: "电量不足？",
};
const commonPalette = (
  condition: string,
  conditionLabel: string,
): PaletteNode[] => [
  { id: "start", label: "开始", kind: "start" },
  {
    id: `condition-${condition}`,
    label: conditionLabel,
    kind: "decision",
    role: "loop-condition",
    condition,
  },
  { id: "end", label: "结束", kind: "end" },
];
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
    timingMode: "fixed-pre",
    palette: [
      ...commonPalette("tower", conditions.tower),
      { id: "fwd", label: blocks.fwd, kind: "action", block: "fwd" },
      { id: "pulse", label: blocks.pulse, kind: "action", block: "pulse" },
    ],
    battery: 18,
    prediction: "到达中继塔，循环体会执行几轮？",
    options: ["6 轮", "12 轮", "其他"],
    hint: "检查：一轮里有几个动作？最后一个动作的箭头回到哪里？",
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
    timingMode: "fixed-pre",
    palette: [
      ...commonPalette("camp", conditions.camp),
      {
        id: "hazard",
        label: "前方危险？",
        kind: "decision",
        role: "body-condition",
        block: "if_left",
      },
      {
        id: "left",
        label: blocks.left,
        kind: "action",
        block: "left",
        role: "branch-action",
      },
      { id: "fwd", label: blocks.fwd, kind: "action", block: "fwd" },
    ],
    battery: 14,
    prediction: "“前进 → 检查危险”会在什么时候出错？",
    options: ["第 1 步", "第 2 步", "不会出错"],
    hint: "检查：两个判断分别管什么？危险判断的两条路在哪里汇合？",
    answer: { timing: "pre", condition: "camp", body: ["if_left", "fwd"] },
  },
  {
    id: "l3",
    title: "寻找水冰",
    brief: "未测，不等于没有信号",
    task: "基地不是样点。每轮到下一样点，再扫描当前样点。发现水冰就停止。用同一组动作比较两种判断时机。",
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
    blocks: ["advance", "scan"],
    conditions: ["ice", "battery"],
    timingMode: "compare",
    palette: [
      ...commonPalette("ice", conditions.ice),
      {
        id: "advance",
        label: blocks.advance,
        kind: "action",
        block: "advance",
      },
      { id: "scan", label: blocks.scan, kind: "action", block: "scan" },
    ],
    battery: 20,
    prediction: "首次扫描前，先判断“本轮发现水冰？”会怎样？",
    options: ["没有数据，无法判断", "没有水冰，继续走", "已经发现，停止"],
    hint: "检查：判断要用的数据，是哪一步得到的？判断前已经有数据了吗？",
    answer: { timing: "post", condition: "ice", body: ["advance", "scan"] },
  },
  {
    id: "l4",
    title: "绕坑一圈",
    brief: "起点条件已经成立",
    task: "自己拼出绕坑一圈的流程图，再切换判断时机，比较 0 轮与 4 轮的差异。",
    cols: 3,
    rows: 3,
    start: [0, 0, 0],
    craters: ["1,1"],
    blocks: ["fwd", "right", "left"],
    conditions: ["home", "battery"],
    timingMode: "compare",
    palette: [
      ...commonPalette("home", conditions.home),
      { id: "fwd", label: blocks.fwd, kind: "action", block: "fwd" },
      { id: "right", label: blocks.right, kind: "action", block: "right" },
    ],
    battery: 16,
    prediction: "出发前先判断是否位于起点，会执行几轮？",
    options: ["0 轮", "1 轮", "4 轮"],
    hint: "检查：出发前，停止条件成立了吗？换一个判断位置，结果会怎样？",
    answer: {
      timing: "post",
      condition: "home",
      body: ["fwd", "fwd", "right"],
    },
  },
];

function makeNode(
  id: string,
  kind: FlowNodeKind,
  label: PaletteNode,
): FlowNode {
  return {
    id,
    kind,
    block: label.block,
    role: label.role,
    condition: label.condition,
  };
}

function edge(
  id: string,
  from: string,
  to: string,
  options: Pick<FlowEdge, "label" | "kind"> = {},
): FlowEdge {
  return { id, from, to, ...options };
}

function paletteFor(l: Level, id: string): PaletteNode {
  const condition = id.replace(/^condition-/, "");
  if (id.startsWith("condition-") && l.conditions.includes(condition))
    return {
      id,
      label: conditions[condition],
      kind: "decision",
      role: "loop-condition",
      condition,
    };
  const item = l.palette.find((v) => v.id === id);
  return item || { id, label: blocks[id] || id, kind: "action", block: id };
}

function graphForBody(l: Level, p: Plan): Pick<Plan, "nodes" | "edges"> {
  const nodes: FlowNode[] = [
    makeNode("start", "start", paletteFor(l, "start")),
    makeNode(
      `condition-${p.condition}`,
      "decision",
      paletteFor(l, `condition-${p.condition}`),
    ),
    makeNode("end", "end", paletteFor(l, "end")),
  ];
  const edges: FlowEdge[] = [];
  const main: { entry: string; exit: string }[] = [];
  p.body.forEach((block, i) => {
    if (block === "if_left") {
      const hazard = `body-${i}-hazard`,
        left = `body-${i}-left`;
      nodes.push(
        makeNode(hazard, "decision", paletteFor(l, "hazard")),
        makeNode(left, "action", paletteFor(l, "left")),
      );
      edges.push(edge(`${hazard}-yes`, hazard, left, { label: "yes" }));
      main.push({ entry: hazard, exit: left });
    } else {
      const id = `body-${i}`;
      const paletteId = block === "left" ? "left" : block;
      nodes.push(makeNode(id, "action", paletteFor(l, paletteId)));
      main.push({ entry: id, exit: id });
    }
  });
  const conditionId = `condition-${p.condition}`;
  if (p.timing === "pre") {
    edges.push(
      edge("start-condition", "start", conditionId),
      edge("condition-end", conditionId, "end", { label: "yes" }),
    );
  } else {
    edges.push(edge("start-body", "start", main[0]?.entry || conditionId));
  }
  for (let i = 0; i < main.length; i++) {
    const current = main[i],
      next = main[i + 1]?.entry;
    if (i === 0 && p.timing === "pre")
      edges.push(
        edge("condition-body", conditionId, current.entry, { label: "no" }),
      );
    if (next) {
      edges.push(edge(`body-${i}-next`, current.exit, next));
      if (p.body[i] === "if_left")
        edges.push(edge(`body-${i}-no`, current.entry, next, { label: "no" }));
    } else {
      if (p.body[i] === "if_left")
        edges.push(
          edge(`body-${i}-no`, current.entry, conditionId, { label: "no" }),
        );
      edges.push(
        edge(
          p.timing === "pre" ? "body-return" : "body-condition",
          current.exit,
          conditionId,
        ),
      );
    }
  }
  if (p.timing === "pre") {
    const last = main[main.length - 1]?.exit;
    if (last) {
      const returnEdge = edges.find((v) => v.id === "body-return");
      if (returnEdge) returnEdge.kind = "return";
    }
  } else {
    edges.push(edge("condition-end", conditionId, "end", { label: "yes" }));
    edges.push(
      edge("condition-return", conditionId, main[0]?.entry || conditionId, {
        label: "no",
        kind: "return",
      }),
    );
  }
  return { nodes, edges };
}

export function retimeFlow(l: Level, p: Plan, timing: Timing): Plan {
  if (l.timingMode === "fixed-pre" || timing === p.timing) return p;
  const check = validateFlow(l, p);
  // Only move the outer decision after the student has completed the graph.
  if (!check.valid) return { ...p, timing };
  const nodes = p.nodes || [],
    condition = nodes.find((v) => v.role === "loop-condition")!,
    start = nodes.find((v) => v.kind === "start")!,
    end = nodes.find((v) => v.kind === "end")!;
  const control = new Set([start.id, condition.id, end.id]),
    edges = (p.edges || []).filter(
      (e) => !control.has(e.from) && !control.has(e.to) && e.kind !== "return",
    ),
    first = check.steps[0].nodeId,
    last = check.steps[check.steps.length - 1].nodeId;
  if (timing === "pre") {
    edges.push(
      edge("start-condition", start.id, condition.id),
      edge("condition-end", condition.id, end.id, { label: "yes" }),
      edge("condition-body", condition.id, first, { label: "no" }),
      edge("body-return", last, condition.id, { kind: "return" }),
    );
  } else {
    edges.push(
      edge("start-body", start.id, first),
      edge("body-condition", last, condition.id),
      edge("condition-end", condition.id, end.id, { label: "yes" }),
      edge("condition-return", condition.id, first, {
        label: "no",
        kind: "return",
      }),
    );
  }
  return { ...p, timing, edges };
}

export function referencePlan(id: string, timing?: Timing): Plan {
  const l = levels.find((v) => v.id === id);
  if (!l) throw new Error("未知关卡");
  const base = { ...l.answer, timing: timing || l.answer.timing };
  return { ...base, ...graphForBody(l, base) };
}

export function planFromBody(
  id: string,
  p: Pick<Plan, "timing" | "condition" | "body">,
): Plan {
  const l = levels.find((v) => v.id === id);
  if (!l) throw new Error("未知关卡");
  const base: Plan = {
    timing: p.timing,
    condition: p.condition,
    body: [...p.body],
  };
  return { ...base, ...graphForBody(l, base) };
}

export function validateFlow(l: Level, p: Plan): FlowValidation {
  const nodes = p.nodes || [],
    edges = p.edges || [],
    issues: FlowValidation["issues"] = [],
    steps: FlowValidation["steps"] = [],
    byId = new Map(nodes.map((v) => [v.id, v]));
  const fail = (code: string, message: string, nodeId?: string) => {
    if (!issues.some((v) => v.code === code && v.nodeId === nodeId))
      issues.push({ code, message, nodeId });
  };
  const result = (): FlowValidation => ({
    valid: !issues.length,
    errors: issues.map((v) => v.message),
    issues,
    body: steps.map((v) => v.block),
    steps,
  });
  if (!nodes.length) {
    fail("EMPTY", "请先摆放节点，再连接箭头");
    return result();
  }
  if (byId.size !== nodes.length)
    fail("DUPLICATE_NODE", "节点编号重复，请删除后重新添加");
  if (!l.conditions.includes(p.condition))
    fail("CONDITION", "请选择本关的停止条件");
  if (l.timingMode === "fixed-pre" && p.timing !== "pre")
    fail("TIMING", "本关统一使用“先判断，再执行”");
  for (const n of nodes) {
    const allowed =
      n.role === "loop-condition"
        ? n.kind === "decision" && n.condition === p.condition && !n.block
        : l.palette.some(
            (v) =>
              v.kind === n.kind &&
              v.role === n.role &&
              v.block === n.block &&
              v.condition === n.condition,
          );
    if (!allowed)
      fail("NODE_NOT_ALLOWED", "这个节点不属于本关，请检查节点区", n.id);
  }
  const starts = nodes.filter((v) => v.kind === "start"),
    ends = nodes.filter((v) => v.kind === "end"),
    loops = nodes.filter((v) => v.role === "loop-condition");
  if (starts.length !== 1) fail("START", "流程图需要一个“开始”节点");
  if (ends.length !== 1) fail("END", "流程图需要一个“结束”节点");
  if (loops.length !== 1) fail("LOOP", "流程图需要一个外层循环判断");
  const start = starts[0],
    end = ends[0],
    loop = loops[0];
  if (
    l.id === "l2" &&
    (nodes.filter((n) => n.role === "body-condition").length < 1 ||
      nodes.filter((n) => n.role === "branch-action").length < 1)
  )
    fail("INNER_DECISION", "请补齐“前方危险？”和“左转 90°”两个节点");
  if (new Set(edges.map((e) => e.id)).size !== edges.length)
    fail("DUPLICATE_EDGE", "有重复的箭头，请删除后重新连接");
  for (const e of edges) {
    if (!byId.has(e.from) || !byId.has(e.to))
      fail("DANGLING_EDGE", "有箭头没有接到节点上");
    if (e.from === e.to) fail("SELF_EDGE", "箭头不能连回同一个节点", e.from);
  }
  const outgoing = (id: string, label?: FlowEdge["label"]) =>
    edges.filter((e) => e.from === id && e.label === label);
  const next = (id: string, label?: FlowEdge["label"]) =>
    outgoing(id, label)[0];
  const returns = edges.filter((e) => e.kind === "return");
  if (returns.length !== 1)
    fail("RETURN", "还不能重复执行：请补上一条返回箭头");
  else if (
    loop &&
    (p.timing === "pre"
      ? returns[0].to !== loop.id
      : returns[0].from !== loop.id || returns[0].label !== "no")
  )
    fail(
      "RETURN_TARGET",
      p.timing === "pre"
        ? "返回箭头要回到外层循环判断，不能回到动作或内部判断"
        : "先执行时，判断的“否”分支要用返回箭头回到第一个动作",
    );
  for (const n of nodes) {
    const all = edges.filter((e) => e.from === n.id);
    if (n.kind === "end") {
      if (all.length) fail("END_OUTPUT", "结束节点后面不用再连箭头", n.id);
    } else if (n.kind === "decision") {
      if (
        outgoing(n.id, "yes").length !== 1 ||
        outgoing(n.id, "no").length !== 1 ||
        all.length !== 2
      )
        fail("BRANCH", "判断的“是”和“否”都要各连一条箭头", n.id);
    } else if (all.length !== 1 || all[0].label)
      fail("OUTPUT", "每个开始或动作节点都要接一条向前的箭头", n.id);
  }
  if (
    !start ||
    !end ||
    !loop ||
    issues.some((v) =>
      [
        "DUPLICATE_NODE",
        "DANGLING_EDGE",
        "SELF_EDGE",
        "NODE_NOT_ALLOWED",
      ].includes(v.code),
    )
  )
    return result();
  if (edges.some((e) => e.to === start.id))
    fail("START_INPUT", "开始节点前面不用接箭头");
  const endEdge = next(loop.id, "yes");
  if (!endEdge || endEdge.to !== end.id || endEdge.kind === "return")
    fail("STOP_BRANCH", "外层判断的“是”分支要通向结束");
  const startEdge = next(start.id),
    repeatEdge = next(loop.id, "no");
  if (
    p.timing === "pre" &&
    (!startEdge || startEdge.to !== loop.id || startEdge.kind === "return")
  )
    fail("START_PATH", "先判断时，开始要先连到外层循环判断");
  if (
    p.timing === "post" &&
    (!startEdge ||
      startEdge.to !== repeatEdge?.to ||
      startEdge.kind === "return")
  )
    fail("START_PATH", "先执行时，开始和判断的“否”分支都要进入第一个动作");
  if (
    repeatEdge &&
    (p.timing === "pre"
      ? repeatEdge.kind === "return"
      : repeatEdge.kind !== "return")
  )
    fail(
      "REPEAT_BRANCH",
      p.timing === "pre"
        ? "先判断时，“否”分支用普通箭头进入循环体"
        : "先执行时，“否”分支要用返回箭头进入循环体",
    );
  // Parse the body by following arrows; visual row order never decides execution.
  const used = new Set([start.id, end.id, loop.id]);
  let cursor = p.timing === "pre" ? repeatEdge?.to : startEdge?.to;
  while (cursor && cursor !== loop.id) {
    if (used.has(cursor)) {
      fail("BODY_CYCLE", "循环体中有箭头绕回了动作，请把返回箭头接到循环判断");
      break;
    }
    const n = byId.get(cursor);
    if (!n) break;
    used.add(n.id);
    let exit: FlowEdge | undefined;
    if (n.role === "body-condition") {
      const yes = next(n.id, "yes"),
        no = next(n.id, "no"),
        left = byId.get(yes?.to || "");
      if (left?.role !== "branch-action" || left.block !== "left") {
        fail("TURN_BRANCH", "“前方危险？”的“是”分支要连到左转", n.id);
        break;
      }
      if (used.has(left.id)) {
        fail("BODY_CYCLE", "左转节点被重复经过，请检查箭头");
        break;
      }
      used.add(left.id);
      exit = next(left.id);
      if (!no || !exit || no.to !== exit.to)
        fail("MERGE", "“否”分支要绕过左转，与左转后的箭头汇合", n.id);
      steps.push({ block: "if_left", nodeId: n.id, branchNodeId: left.id });
    } else if (n.kind === "action" && n.role !== "branch-action" && n.block) {
      steps.push({ block: n.block, nodeId: n.id });
      exit = next(n.id);
    } else {
      fail("BODY_NODE", "循环体要接动作，不能提前接到结束或左转分支", n.id);
      break;
    }
    if (exit?.to === loop.id) {
      if (p.timing === "pre" && exit.kind !== "return")
        fail("RETURN", "这条路没有返回判断，所以还不能重复执行");
      if (p.timing === "post" && exit.kind === "return")
        fail(
          "RETURN_TARGET",
          "先执行时，动作结束后先判断；“否”分支才是返回箭头",
        );
    } else if (exit?.kind === "return")
      fail("RETURN_TARGET", "返回箭头接错了，请检查循环判断的位置");
    cursor = exit?.to;
  }
  if (cursor !== loop.id)
    fail("DISCONNECTED", "循环体中有断线，请把每一步连接起来");
  if (used.size !== nodes.length)
    fail("ISOLATED", "有节点没有接入流程，请接上箭头或删除多余节点");
  if (!steps.length) fail("EMPTY_BODY", "循环体至少需要一个动作");
  if (steps.length > 8)
    fail("BODY_LIMIT", "循环体最多放 8 个动作，请删去多余节点");
  if (l.id === "l2" && !steps.some((v) => v.block === "fwd"))
    fail("MOVE_REQUIRED", "循环体还需要前进动作");
  return result();
}

export function initialPlan(id: string): Plan {
  const l = levels.find((l) => l.id === id)!;
  return {
    timing: "pre",
    condition: l.conditions[0],
    body: [],
    nodes: [],
    edges: [],
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
  const graphMode = p.nodes !== undefined || p.edges !== undefined,
    graph = graphMode
      ? validateFlow(l, p)
      : {
          valid: true,
          errors: [],
          body: p.body,
          steps: [] as FlowValidation["steps"],
        },
    body = graph.body;
  if (!graph.valid) throw new Error(graph.errors[0] || "巡视流程图还没有完成");
  if (
    !["pre", "post"].includes(p.timing) ||
    !l.conditions.includes(p.condition) ||
    body.length > 8 ||
    body.some((b) => !l.blocks.includes(b))
  )
    throw new Error("无效的巡视方案");
  const s = initialFrame(l),
    frames: Frame[] = [];
  const loopNode = p.nodes?.find((n) => n.role === "loop-condition"),
    endNode = p.nodes?.find((n) => n.kind === "end");
  let lastNodeId = p.nodes?.find((n) => n.kind === "start")?.id;
  const push = (
    text: string,
    active: Frame["active"] = null,
    nodeId?: string,
    edgeId?: string,
  ) => {
    const target =
      nodeId ||
      (active === "condition"
        ? loopNode?.id
        : typeof active === "number"
          ? graph.steps[active]?.nodeId
          : undefined);
    s.text = text;
    s.active = active;
    s.nodeId = target;
    s.edgeId =
      edgeId ||
      p.edges?.find((e) => e.from === lastNodeId && e.to === target)?.id;
    if (target) lastNodeId = target;
    frames.push({ ...s, visited: [...s.visited], scanned: [...s.scanned] });
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
  let stop = body.length ? "" : "empty";
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
    for (let i = 0; i < body.length; i++) {
      const b = body[i];
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
        push(
          `第 ${s.rounds} 轮：前方${danger ? "危险，需要左转" : "安全，直接前进"}`,
          i,
        );
        if (danger) {
          s.d = (s.d + 3) % 4;
          s.turns++;
          push(
            `第 ${s.rounds} 轮：左转 90°，朝${names[s.d]}`,
            i,
            graph.steps[i]?.branchNodeId,
          );
        }
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
      body.join(",") === "fwd,pulse";
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
  push(reason, null, stop === "condition" ? endNode?.id : lastNodeId);
  return { frames, win, reason, stop };
}
export const quizzes = [
  {
    id: "q1",
    title: "机械臂采样",
    description: "机械臂每次取一个样本并放入样本盒，盒中装够 3 个样本后停止。",
    questions: [
      {
        text: "循环体是哪一组操作？",
        options: ["取一个样本", "取一个样本 ＋ 放入样本盒", "判断样本数"],
      },
      {
        text: "判断条件和返回箭头应该怎样？",
        options: [
          "盒中已有 3 个样本？；否回到结束",
          "盒中已有 3 个样本？；否回到取样",
          "机械臂已经启动？；否回到放入样本盒",
        ],
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
