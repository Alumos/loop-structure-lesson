const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const html = fs.readFileSync(path.join(__dirname, "月球巡逻大挑战.html"), "utf8");
const match = html.match(/<script>([\s\S]*?)<\/script>/);
assert.ok(match, "missing game script");
const source = match[1].replace(
  "if(!applyHash())openLevel(LEVELS[0]);",
  "window.__test={LEVELS,openLevel,set:(level,p)=>{cur=level;plan=p;comparison={pre:null,post:null};speed=0;},run:doRun,buildBoard,renderFlow,renderPalette,planBody:()=>plan.body.slice(),state:()=>({sim,comparison,trace:trace.slice()})};"
);
assert.notEqual(source, match[1], "test entry point not found");

function makeElement() {
  const listeners = new Map();
  let classes = new Set();
  let markup = "";
  const element = {
    style: { setProperty(name, value) { this[name] = value; } },
    dataset: {},
    classList: {
      add(...names) { names.forEach(name => { if (!name) throw new Error("empty class token"); classes.add(name); }); },
      remove(...names) { names.forEach(name => classes.delete(name)); },
      toggle(name, force) { if (force === undefined ? !classes.has(name) : force) { classes.add(name); return true; } classes.delete(name); return false; },
      contains(name) { return classes.has(name); }
    },
    children: [],
    appendChild(child) { this.children.push(child); },
    remove() {},
    cloneNode() { return makeElement(); },
    setPointerCapture() {},
    addEventListener(name, fn) { listeners.set(name, fn); },
    removeEventListener(name) { listeners.delete(name); },
    dispatch(name, event) { listeners.get(name)?.(event); },
    querySelector() { return makeElement(); },
    getBoundingClientRect() { return { left: 0, right: 100, top: 0, bottom: 100 }; },
    contains() { return false; },
    clientWidth: 480,
    textContent: ""
  };
  Object.defineProperties(element, {
    id: { get() { return this._id; }, set(value) { this._id = value; if (value) elements.set(value, this); } },
    className: { get() { return [...classes].join(" "); }, set(value) { classes = new Set(value.split(/\s+/).filter(Boolean)); } },
    innerHTML: { get() { return markup; }, set(value) { markup = value; this.children = []; } }
  });
  return element;
}

const elements = new Map();
const document = {
  body: makeElement(),
  addEventListener() {},
  createElement() { return makeElement(); },
  querySelectorAll(selector) {
    const groups = selector.split(",").map(part => part.split(".").filter(Boolean));
    return [...new Set(elements.values())].filter(element => groups.some(group => group.every(name => element.classList.contains(name))));
  },
  getElementById(id) {
    if (!elements.has(id)) elements.set(id, makeElement());
    return elements.get(id);
  }
};
const storage = new Map();
const localStorage = {
  getItem(key) { return storage.get(key) || null; },
  setItem(key, value) { storage.set(key, value); }
};
const context = { document, localStorage, window: {}, setTimeout: fn => fn() };
vm.runInNewContext(source, context, { filename: "月球巡逻大挑战.html" });
const game = context.window.__test;

async function check(levelId, cond, timing, body, expected, details) {
  const level = game.LEVELS.find(item => item.id === levelId);
  game.set(level, { cond, timing, body });
  await game.run();
  const state = game.state();
  const result = state.comparison[timing];
  assert.equal(result.win, expected, `${levelId} ${timing} ${body.join(",")}: ${result.text}`);
  for (const [key, value] of Object.entries(details)) assert.equal(state.sim[key], value);
  console.log(`${levelId} ${timing}: ${result.text}`);
}

(async () => {
  game.openLevel(game.LEVELS[0]);
  assert.equal(document.getElementById("condSelect").value, "camp");
  game.set(game.LEVELS[0], { cond: "camp", timing: "pre", body: ["fwd", "pulse"] });
  game.buildBoard();
  assert.equal(document.getElementById("board").children.filter(cell => cell.classList.contains("route")).length, 7);
  game.renderFlow();
  assert.ok(document.getElementById("flow").children.some(node => node.id === "fn0" && node.classList.contains("fnode")));
  assert.ok(document.getElementById("flow").children.some(node => node.id === "fn1" && node.classList.contains("fio")));
  await check("l1", "camp", "pre", ["fwd", "pulse"], true, { x: 6, iters: 6, moves: 6, pulses: 6, pulseAtStart: 0 });
  assert.equal(document.getElementById("c6_0").classList.contains("pulsed"), true);
  await check("l1", "camp", "pre", ["pulse", "fwd"], false, { x: 0, y: 0, iters: 1, moves: 0, pulses: 1, pulseAtStart: 1 });
  assert.match(game.state().comparison.pre.text, /位置脉冲发早/);
  assert.equal(document.getElementById("c0_0").classList.contains("pulse-error"), true);

  game.openLevel(game.LEVELS[1]);
  assert.equal(document.getElementById("tp_pre").classList.contains("on"), true);
  assert.equal(document.getElementById("condSelect").value, "camp");
  game.set(game.LEVELS[1], { cond: "camp", timing: "pre", body: ["if_left", "fwd"] });
  game.buildBoard();
  assert.equal(document.getElementById("board").children.filter(cell => cell.classList.contains("route")).length, 6);
  assert.equal(document.getElementById("c3_2").textContent, "起点");
  assert.equal(document.getElementById("c0_0").textContent, "营地");
  game.renderFlow();
  assert.equal(document.getElementById("flow").children.filter(node => node.classList.contains("fdec")).length, 2);
  await check("l2", "camp", "pre", ["if_left", "fwd"], true, { x: 0, y: 0, iters: 5, moves: 5, turns: 2 });
  assert.ok(game.state().trace.some(line => /第 1 轮：前方是地图边界，左转向北/.test(line)));
  assert.ok(game.state().trace.some(line => /第 3 轮：前方是地图边界，左转向西/.test(line)));
  await check("l2", "camp", "pre", ["fwd", "if_left"], false, { x: 3, y: 2, iters: 1, moves: 0, steps: 1 });
  assert.match(game.state().comparison.pre.text, /越过地图边界/);
  assert.equal(document.getElementById("c3_2").classList.contains("edge-hit"), true);
  assert.equal(document.getElementById("outsideMarker").classList.contains("hit"), true);
  assert.match(document.getElementById("mReason").innerHTML, /把“前方危险则左转”放在前进之前/);

  await check("l3", "ice", "pre", ["advance", "scan"], false, { x: 0, y: 3, iters: 0, scans: 0, scanResult: null });
  assert.match(game.state().comparison.pre.text, /尚无扫描数据/);
  game.set(game.LEVELS[2], { cond: "ice", timing: "post", body: ["advance", "scan"] });
  const route = [game.LEVELS[2].start, ...game.LEVELS[2].samples];
  for (let i = 1; i < route.length; i++) {
    assert.equal(Math.abs(route[i].x - route[i - 1].x) + Math.abs(route[i].y - route[i - 1].y), 1, `route gap at sample ${i}`);
  }
  const directions = route.slice(1).map((point, i) => `${point.x - route[i].x},${point.y - route[i].y}`);
  assert.equal(directions.slice(1).filter((direction, i) => direction !== directions[i]).length, 2);
  game.buildBoard();
  assert.equal(document.getElementById("board").children.filter(cell => cell.classList.contains("sample")).length, 10);
  assert.equal(document.getElementById("c0_3").textContent, "基地");
  game.renderFlow();
  assert.ok(document.getElementById("flow").children.some(node => node.id === "fn0" && node.classList.contains("fnode")));
  assert.ok(document.getElementById("flow").children.some(node => node.id === "fn1" && node.classList.contains("fio")));
  assert.equal(document.getElementById("flow").children.filter(node => node.classList.contains("fdec")).length, 1, "level 3 must have only one decision diamond");
  await check("l3", "ice", "post", ["advance", "scan"], true, { x: 2, y: 1, d: 2, iters: 8, moves: 8, turns: 2, scans: 8, scanResult: true });
  assert.equal(document.getElementById("c2_1").textContent, "8号水冰");
  assert.equal(document.getElementById("c1_3").textContent, "1号无信号");
  assert.equal(document.getElementById("c1_1").textContent, "9号待测");
  context.window.resetBoard();
  assert.equal(document.getElementById("c2_1").textContent, "8号待测");
  assert.equal(document.getElementById("c0_3").textContent, "基地");
  const earlyIce = { ...game.LEVELS[2], ice: { x: 1, y: 3 } };
  game.set(earlyIce, { cond: "ice", timing: "post", body: ["advance", "scan"] });
  game.buildBoard();
  await game.run();
  assert.equal(game.state().comparison.post.win, true, "first sample should stop before the next trip");
  assert.equal(game.state().sim.moves, 1);
  assert.equal(game.state().sim.scans, 1);
  game.set(game.LEVELS[2], { cond: "battery", timing: "pre", body: [] });
  await context.window.fillRun();
  assert.deepEqual(Array.from(game.planBody()), ["advance", "scan"]);
  assert.equal(game.state().comparison.post.win, true, "level 3 reference answer should run successfully");
  await check("l3", "ice", "post", ["scan", "advance"], false, { x: 0, y: 3, iters: 1, scans: 0, scanResult: null });
  assert.match(game.state().comparison.post.text, /不是待测样点/);
  await check("l3", "ice", "post", ["advance", "fwd"], false, { x: 2, y: 3, scans: 0 });
  await check("l4", "home", "pre", ["fwd", "fwd", "right"], false, { iters: 0 });
  await check("l4", "home", "post", ["fwd", "fwd", "right"], true, { x: 0, y: 0, d: 0, iters: 4, moves: 8, turns: 4 });
  game.set(game.LEVELS[0], { cond: "camp", timing: "pre", body: [] });
  game.renderPalette();
  const block = document.getElementById("paletteBlocks").children[0];
  block.onpointerdown({ button: 0, pointerId: 1, clientX: 10, clientY: 10, preventDefault() {} });
  block.dispatch("pointerup", { clientX: 50, clientY: 50 });
  assert.deepEqual(Array.from(game.planBody()), ["fwd"]);
  console.log("drag and drop: fwd added to loop body");
})().catch(error => { console.error(error); process.exitCode = 1; });
