import { test, expect, type Page } from "@playwright/test";

async function capture(page: Page, path: string) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path, fullPage: true });
}

async function dragBetween(
  page: Page,
  a: { x: number; y: number },
  b: { x: number; y: number },
) {
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 12 });
  await page.mouse.up();
}

async function addNode(page: Page, label: string) {
  const palette = page
    .locator(".flow-node-palette")
    .getByRole("button", { name: label, exact: true });
  const count = await page.locator("[data-node]").count();
  const x =
    label === "左转 90°" ||
    label === "右转 90°" ||
    label === "结束" ||
    count > 5
      ? 700
      : 340;
  const y = label.includes("转 90°")
    ? 460
    : label === "结束"
      ? 90
      : 90 + Math.min(count, 3) * 130;
  await page
    .locator(".flow-builder")
    .evaluate((e) => e.scrollIntoView({ block: "start" }));
  await palette.scrollIntoViewIfNeeded();
  const box = (await palette.boundingBox())!;
  const canvas = page.locator(".flow-builder-canvas");
  const rect = (await canvas.boundingBox())!;
  const scale =
    rect.width /
    Number(
      await canvas.evaluate((e) =>
        (e as HTMLElement).style.width.replace("px", ""),
      ),
    );
  await dragBetween(
    page,
    { x: box.x + box.width / 2, y: box.y + box.height / 2 },
    { x: rect.x + x * scale, y: rect.y + y * scale },
  );
  await expect(page.locator("[data-node]")).toHaveCount(count + 1);
}

async function linkNode(
  page: Page,
  source: string,
  output: string,
  target: string,
) {
  const fromAnchor =
    output === "是 →" ? "right" : output === "回到判断 →" ? "left" : "bottom";
  const toAnchor = output === "回到判断 →" ? "left" : "top";
  const sourceElement = page.locator(
    `[data-node="${source}"] [data-anchor="${fromAnchor}"]`,
  );
  const targetElement = page.locator(
    `[data-node="${target}"] [data-anchor="${toAnchor}"]`,
  );
  await sourceElement.scrollIntoViewIfNeeded();
  await targetElement.scrollIntoViewIfNeeded();
  const a = (await sourceElement.boundingBox())!,
    b = (await targetElement.boundingBox())!;
  await dragBetween(
    page,
    { x: a.x + a.width / 2, y: a.y + a.height / 2 },
    { x: b.x + b.width / 2, y: b.y + b.height / 2 },
  );
}

async function selectEdge(page: Page, selector: string) {
  const path = page.locator(`${selector} .flow-edge-hit`).first();
  await path.scrollIntoViewIfNeeded();
  const point = await path.evaluate((e) => {
    const path = e as SVGPathElement,
      p = path.getPointAtLength(path.getTotalLength() / 2);
    return new DOMPoint(p.x, p.y)
      .matrixTransform(path.getScreenCTM()!)
      .toJSON();
  });
  await page.mouse.click(point.x, point.y);
  await expect(
    page.locator(".flow-builder-canvas .flow-edge-editor"),
  ).toBeVisible();
}

async function buildL1(page: Page) {
  await addNode(page, "开始");
  await addNode(page, "到达中继塔？");
  await addNode(page, "前进 1 格");
  await addNode(page, "发送位置脉冲");
  await addNode(page, "结束");
  await linkNode(page, "start", "下一步 →", "condition-tower");
  await linkNode(page, "condition-tower", "是 →", "end");
  await linkNode(page, "condition-tower", "否 →", "fwd-1");
  await linkNode(page, "fwd-1", "下一步 →", "pulse-1");
  await linkNode(page, "pulse-1", "回到判断 →", "condition-tower");
}

async function buildL2(page: Page, wrongOrder = false) {
  await addNode(page, "开始");
  await addNode(page, "到达营地？");
  await addNode(page, "前方危险？");
  await addNode(page, "左转 90°");
  await addNode(page, "前进 1 格");
  await addNode(page, "结束");
  await linkNode(page, "start", "下一步 →", "condition-camp");
  await linkNode(page, "condition-camp", "是 →", "end");
  await linkNode(
    page,
    "condition-camp",
    "否 →",
    wrongOrder ? "fwd-1" : "hazard-1",
  );
  if (wrongOrder) await linkNode(page, "fwd-1", "下一步 →", "hazard-1");
  await linkNode(page, "hazard-1", "是 →", "left-1");
  await linkNode(
    page,
    "hazard-1",
    "否 →",
    wrongOrder ? "condition-camp" : "fwd-1",
  );
  await linkNode(
    page,
    "left-1",
    wrongOrder ? "回到判断 →" : "下一步 →",
    wrongOrder ? "condition-camp" : "fwd-1",
  );
  if (!wrongOrder)
    await linkNode(page, "fwd-1", "回到判断 →", "condition-camp");
}

async function buildL4(page: Page) {
  await addNode(page, "开始");
  await addNode(page, "位于出发点且朝向相同？");
  await addNode(page, "前进 1 格");
  await addNode(page, "前进 1 格");
  await addNode(page, "右转 90°");
  await addNode(page, "结束");
  await linkNode(page, "start", "下一步 →", "condition-home");
  await linkNode(page, "condition-home", "是 →", "end");
  await linkNode(page, "condition-home", "否 →", "fwd-1");
  await linkNode(page, "fwd-1", "下一步 →", "fwd-2");
  await linkNode(page, "fwd-2", "下一步 →", "right-1");
  await linkNode(page, "right-1", "回到判断 →", "condition-home");
}
test("教师开课、学生闯关、实时画面、独立验收、回放和清理", async ({
  browser,
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/teacher");
  await page.getByLabel("密码", { exact: true }).fill("browser-test-password");
  await page.getByRole("button", { name: "进入飞控中心" }).click();
  await expect(
    page.getByRole("heading", { name: "每一次尝试，都看得见。" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "开启新课堂" }).first().click();
  await page
    .getByRole("dialog")
    .getByRole("combobox", { name: "班级", exact: true })
    .selectOption("demo-5");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "开启课堂", exact: true })
    .click();
  await expect(page.getByText("课堂进行中", { exact: true })).toBeVisible();
  const studentContext = await browser.newContext({
      viewport: { width: 1440, height: 1050 },
    }),
    student = await studentContext.newPage();
  student.on("pageerror", (e) => errors.push(e.message));
  await student.goto("/");
  await student.getByLabel("你的班级").selectOption("demo-5");
  await student.getByRole("button", { name: "演示学生甲 001" }).click();
  await student.getByRole("button", { name: "演示学生乙 002" }).click();
  await student.getByRole("button", { name: "进入巡视课堂" }).click();
  await expect(
    student.getByRole("heading", { name: "建立中继通信" }),
  ).toBeVisible();
  await student.getByRole("button", { name: "6 轮", exact: true }).click();
  await buildL1(student);
  await expect(student.locator(".flow-validation")).toContainText("流程图完整");
  await expect(
    student.getByRole("button", { name: "先执行，再判断", exact: true }),
  ).toHaveCount(0);
  await selectEdge(student, '[data-edge-kind="return"]');
  await student.getByRole("button", { name: "删除选中箭头" }).click();
  await expect(student.locator(".flow-validation")).toContainText(
    "还不能重复执行",
  );
  await student.getByRole("button", { name: "开始模拟", exact: true }).click();
  await expect(student.locator(".run-status")).toContainText(
    "没有唯一的下一条箭头",
    { timeout: 25000 },
  );
  await expect(
    page.getByRole("row").filter({ hasText: "演示学生甲 / 演示学生乙" }),
  ).toBeVisible();
  await page
    .getByRole("row")
    .filter({ hasText: "演示学生甲 / 演示学生乙" })
    .click();
  await expect(
    page.getByRole("heading", { name: "演示学生甲 / 演示学生乙" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "显示标准答案" }).click();
  await expect(
    page.locator(".teacher-flow-tools [data-edge-kind='return']"),
  ).toHaveCount(1);
  await expect(student.locator("[data-edge-kind='return']")).toHaveCount(0);
  await page.getByRole("button", { name: "收起标准答案" }).click();
  await page.getByRole("button", { name: "修正流程图" }).click();
  await linkNode(page, "pulse-1", "回到判断 →", "condition-tower");
  await expect(student.locator("[data-edge-kind='return']")).toHaveCount(1);
  await page.getByRole("button", { name: "完成修正" }).click();
  await expect(student.locator(".flow-validation")).toContainText("流程图完整");
  await capture(student, "artifacts/student-exercise.png");
  await expect(page.locator(".monitor-frame [data-block-index]")).toHaveCount(
    2,
  );
  await student.getByRole("button", { name: "开始模拟", exact: true }).click();
  await expect(student.locator(".run-status")).toContainText("任务完成", {
    timeout: 25000,
  });
  await expect(page.locator(".monitor-frame .run-status")).toContainText(
    "任务完成",
    { timeout: 7000 },
  );
  await capture(page, "artifacts/teacher-monitor.png");
  await page.getByRole("button", { name: "全班概览" }).click();
  await expect(
    page
      .getByRole("row")
      .filter({ hasText: "演示学生甲 / 演示学生乙" })
      .locator(".result-dot.done"),
  ).toHaveCount(1);
  await page.getByRole("button", { name: "开放综合验收" }).click();
  await expect(
    student.getByRole("button", { name: "1 机械臂采样" }),
  ).toBeEnabled();
  await student.getByRole("button", { name: "1 机械臂采样" }).click();
  await student
    .getByRole("button", { name: /取一个样本 ＋ 放入样本盒/ })
    .click();
  await student.getByRole("button", { name: /否回到取样/ }).click();
  await student.getByRole("button", { name: "提交本题" }).click();
  await expect(
    student.getByRole("button", { name: "已提交，等待讲评" }),
  ).toBeVisible();
  await student.getByLabel("当前独立作答的同学").selectOption("002");
  await expect(student.locator(".quiz-option.chosen")).toHaveCount(0);
  await expect(
    student.getByRole("button", { name: "提交本题" }),
  ).toBeDisabled();
  await student
    .getByRole("button", { name: /取一个样本 ＋ 放入样本盒/ })
    .click();
  await student.getByRole("button", { name: /否回到取样/ }).click();
  await student.getByRole("button", { name: "提交本题" }).click();
  await expect(
    page.getByRole("row").filter({ hasText: "演示学生甲 / 演示学生乙" }),
  ).toContainText("演示学生乙：1/3 题 · 2/6 分", { timeout: 7000 });
  await capture(page, "artifacts/teacher-overview.png");
  // A failed attempt made offline must arrive once after reconnection.
  await studentContext.setOffline(true);
  await student.getByRole("button", { name: /02 峡谷巡路/ }).click();
  await student.getByRole("button", { name: "第 1 步", exact: true }).click();
  await buildL2(student, true);
  await student.getByRole("button", { name: "开始模拟", exact: true }).click();
  await expect(student.locator(".run-status")).toContainText("越过地图边界");
  await expect(student.getByText(/条待同步/)).toBeVisible();
  await studentContext.setOffline(false);
  await expect(
    page
      .getByRole("row")
      .filter({ hasText: "演示学生甲 / 演示学生乙" })
      .locator(".result-dot.trying"),
  ).toHaveCount(1, { timeout: 20000 });

  await page
    .getByRole("row")
    .filter({ hasText: "演示学生甲 / 演示学生乙" })
    .click();
  await page.getByRole("button", { name: "方案记录" }).click();
  await expect(page.getByLabel("回放时间轴")).toBeVisible();
  await expect(page.getByRole("button", { name: "播放回放" })).toBeEnabled();
  await page.getByRole("button", { name: "播放回放" }).click();
  await expect(page.getByRole("button", { name: "暂停回放" })).toBeVisible();
  await page.getByRole("button", { name: "记录与存储" }).click();
  await page.getByLabel("课堂范围").selectOption({ index: 1 });
  await page.getByLabel("清理内容").selectOption("all");
  await page.getByRole("button", { name: "预览清理范围" }).click();
  await expect(page.getByRole("dialog")).toContainText("2 名学生");
  await page.getByLabel("输入“清理”确认").fill("清理");
  await page.getByRole("button", { name: "确认清理", exact: true }).click();
  await expect(
    student.getByRole("heading", { name: "你好，飞控顾问" }),
  ).toBeVisible();
  await expect(student.getByRole("alert")).toContainText("记录已清理");
  await expect(
    page.getByText("记录已清理，数据库空闲空间已回收。"),
  ).toBeVisible();
  expect(errors).toEqual([]);
  await studentContext.close();
});

test("规范流程图保留分支、时机切换和节点编辑", async ({ page }) => {
  await page.request.post("/api/teacher/login", {
    data: { username: "Alumos", password: "browser-test-password" },
  });
  const created = await page.request.post("/api/teacher/classrooms", {
    data: { classId: "demo-5", name: "流程图检查课堂" },
  });
  const room = await created.json();
  await page.request.post("/api/student/join", {
    data: { classroomId: room.id, studentIds: ["003"] },
  });
  await page.goto("/");
  await page.getByRole("button", { name: /02 峡谷巡路/ }).click();
  await buildL2(page);
  await expect(page.locator('[data-node="hazard-1"]')).toContainText(
    "前方危险？",
  );
  await expect(page.locator('[data-node="left-1"]')).toContainText("左转 90°");
  await expect(page.locator('[data-node="end"]')).toContainText("结束");
  await expect(page.locator(".flow-validation")).toContainText("流程图完整");
  expect(
    await page
      .locator(".flow-canvas-viewport")
      .evaluate((e) => e.scrollWidth <= e.clientWidth + 1),
  ).toBe(true);
  await capture(page, "artifacts/flowchart-branch-pre.png");
  const hazard = page.locator('[data-node="hazard-1"]');
  const before = {
    x: Number(await hazard.getAttribute("data-x")),
    y: Number(await hazard.getAttribute("data-y")),
  };
  const movable = hazard.locator(".flow-node-content");
  await movable.scrollIntoViewIfNeeded();
  const box = (await movable.boundingBox())!;
  await dragBetween(
    page,
    { x: box.x + box.width / 2, y: box.y + box.height / 2 },
    { x: box.x + box.width / 2 + 45, y: box.y + box.height / 2 + 25 },
  );
  expect(Number(await hazard.getAttribute("data-x"))).toBeGreaterThan(
    before.x + 40,
  );
  expect(Number(await hazard.getAttribute("data-y"))).toBeGreaterThan(
    before.y + 20,
  );
  await expect(page.locator(".flow-validation")).toContainText("流程图完整");
  const savedX = await hazard.getAttribute("data-x"),
    savedY = await hazard.getAttribute("data-y");
  await expect(hazard.locator(".flow-node-edit")).toBeVisible();
  await page.reload();
  await expect(hazard).toHaveAttribute("data-x", savedX!);
  await expect(hazard).toHaveAttribute("data-y", savedY!);
  await addNode(page, "前方危险？");
  await expect(page.locator('[data-node="hazard-2"]')).toHaveCount(1);
  await page.getByRole("button", { name: "撤销上一步" }).click();
  await expect(page.locator('[data-node="hazard-2"]')).toHaveCount(0);
  await expect(page.locator(".flow-port")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^上移|^下移/ })).toHaveCount(
    0,
  );
  await expect(page.getByText("本关统一使用：先判断，再执行")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "先执行，再判断", exact: true }),
  ).toHaveCount(0);
  await capture(page, "artifacts/flowchart-branch-reordered.png");
  await page.locator('[data-node="left-1"] .flow-node-content').click();
  await page
    .locator('[data-node="left-1"]')
    .getByRole("button", { name: "删除左转 90°" })
    .click();
  await expect(page.locator('[data-node="left-1"]')).toHaveCount(0);
  await expect(page.locator(".flow-validation")).not.toContainText(
    "流程图完整",
  );
  await page.getByRole("button", { name: /03 绕坑一圈/ }).click();
  await expect(page.locator("[data-node]")).toHaveCount(0);
  await buildL4(page);
  await page.getByRole("button", { name: "0 轮", exact: true }).click();
  await page.getByRole("button", { name: "开始模拟", exact: true }).click();
  await expect(page.locator(".run-status")).toContainText("原地停止（0 轮）");
  await page
    .getByRole("button", { name: "先执行，再判断", exact: true })
    .click();
  await capture(page, "artifacts/flowchart-loop-post.png");
  await page.getByRole("button", { name: "开始模拟", exact: true }).click();
  await expect(page.locator(".run-status")).toContainText(
    "任务完成：4 轮，8 格",
    { timeout: 20000 },
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await capture(page, "artifacts/student-mobile.png");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("第三关空图可运行，补齐流程后比较判断位置", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.request.post("/api/teacher/login", {
    data: { username: "Alumos", password: "browser-test-password" },
  });
  const created = await page.request.post("/api/teacher/classrooms", {
    data: { classId: "demo-5", name: "绕坑时机对照课堂" },
  });
  const room = await created.json();
  await page.request.post("/api/student/join", {
    data: { classroomId: room.id, studentIds: ["001"] },
  });
  await page.goto("/");
  await page.getByRole("button", { name: /03 绕坑一圈/ }).click();
  await expect(page.locator("[data-node]")).toHaveCount(0);
  await page.getByRole("button", { name: "开始模拟", exact: true }).click();
  await expect(page.locator(".run-status")).toContainText("没有“开始”节点");
  await page.getByRole("button", { name: "复位" }).click();
  await buildL4(page);
  await capture(page, "artifacts/flowchart-loop-pre.png");
  await page.getByRole("button", { name: "开始模拟", exact: true }).click();
  await expect(page.locator(".run-status")).toContainText("原地停止（0 轮）");
  await page
    .getByRole("button", { name: "先执行，再判断", exact: true })
    .click();
  await expect(page.locator('[data-edge-kind="return"]')).toHaveCount(1);
  await page.getByRole("button", { name: "开始模拟", exact: true }).click();
  await expect(page.locator('[data-node="fwd-1"].executing')).toBeVisible();
  await expect(page.locator(".run-status")).toContainText(
    "任务完成：4 轮，8 格",
    { timeout: 20000 },
  );
  await capture(page, "artifacts/flowchart-loop-post.png");
  expect(errors).toEqual([]);
});

test("向下连接附近的结束节点时不误判返回，也不绕线", async ({ page }) => {
  await page.request.post("/api/teacher/login", {
    data: { username: "Alumos", password: "browser-test-password" },
  });
  const room = await (
    await page.request.post("/api/teacher/classrooms", {
      data: { classId: "demo-5", name: "近距离连线课堂" },
    })
  ).json();
  await page.request.post("/api/student/join", {
    data: { classroomId: room.id, studentIds: ["003"] },
  });
  await page.goto("/");
  await addNode(page, "开始");
  await addNode(page, "到达中继塔？");
  await addNode(page, "结束");
  const end = page.locator('[data-node="end"] .flow-node-content');
  const endBox = (await end.boundingBox())!;
  const decision = page.locator('[data-node="condition-tower"]');
  const decisionBox = (await decision.boundingBox())!;
  await dragBetween(
    page,
    { x: endBox.x + endBox.width / 2, y: endBox.y + endBox.height / 2 },
    {
      x: decisionBox.x + decisionBox.width / 2,
      y: decisionBox.y + decisionBox.height + 68,
    },
  );
  await linkNode(page, "start", "下一步 →", "condition-tower");
  await linkNode(page, "condition-tower", "否 →", "end");
  const edge = page.locator('[data-edge-kind="normal"]').last();
  const path = await edge.locator("path:first-child").getAttribute("d");
  expect(path?.split(" L ")).toHaveLength(2);
  await expect(edge).toContainText("否");
  await expect(page.locator('[data-edge-kind="return"]')).toHaveCount(0);
  await capture(page, "artifacts/flowchart-short-link.png");
});

test("缺少新浏览器 API 时仍可加载名单、登录、运行和保存记录", async ({
  browser,
  page,
}) => {
  const legacyBrowser = () => {
    Object.defineProperty(AbortSignal, "timeout", {
      value: undefined,
      configurable: true,
    });
    Object.defineProperty(globalThis, "structuredClone", {
      value: undefined,
      configurable: true,
    });
    Object.defineProperty(Array.prototype, "at", {
      value: undefined,
      configurable: true,
    });
    Object.defineProperty(crypto, "randomUUID", {
      value: undefined,
      configurable: true,
    });
  };
  await page.addInitScript(legacyBrowser);
  await page.goto("/teacher");
  await page.getByLabel("密码", { exact: true }).fill("browser-test-password");
  await page.getByRole("button", { name: "进入飞控中心" }).click();
  await expect(
    page.getByRole("heading", { name: "每一次尝试，都看得见。" }),
  ).toBeVisible();
  const created = await page.request.post("/api/teacher/classrooms", {
    data: { classId: "demo-5", name: "旧浏览器兼容课堂" },
  });
  const room = await created.json();
  await page.request.patch(`/api/teacher/classrooms/${room.id}`, {
    data: { settings: { quizOpen: true, answersOpen: true, openLevel: "all" } },
  });
  const context = await browser.newContext();
  try {
    await context.addInitScript(legacyBrowser);
    const student = await context.newPage();
    const errors: string[] = [];
    student.on("pageerror", (error) => errors.push(error.message));
    await student.goto("/");
    await student.getByLabel("你的班级").selectOption("demo-5");
    const classroomSelect = student.getByLabel("当前课堂", { exact: true });
    if (await classroomSelect.count())
      await classroomSelect.selectOption(room.id);
    await student.getByRole("button", { name: "演示学生甲 001" }).click();
    await student.getByRole("button", { name: "进入巡视课堂" }).click();
    await expect(
      student.getByRole("heading", { name: "建立中继通信" }),
    ).toBeVisible();
    await student.getByRole("button", { name: "6 轮", exact: true }).click();
    await student.getByRole("button", { name: "填入讲评参考方案" }).click();
    await student
      .getByRole("button", { name: "开始模拟", exact: true })
      .click();
    await expect(student.locator(".run-status")).toContainText("任务完成", {
      timeout: 25000,
    });
    await expect(student.locator(".attempt-row")).toHaveCount(0);
    await expect
      .poll(async () => {
        const response = await context.request.get("/api/student/me");
        return (await response.json()).attempts.length;
      })
      .toBe(1);
    await student.reload();
    await expect(
      student.getByRole("heading", { name: "建立中继通信" }),
    ).toBeVisible();
    await expect(student.locator(".attempt-row")).toHaveCount(0);
    await expect(student.locator(".flow-validation")).toContainText(
      "流程图完整",
    );
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});

test("触摸拖入、自由移动、边缘连线、展开缩放和取消拖动", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1050 },
    hasTouch: true,
  });
  const page = await context.newPage();
  await page.request.post("/api/teacher/login", {
    data: { username: "Alumos", password: "browser-test-password" },
  });
  const room = await (
    await page.request.post("/api/teacher/classrooms", {
      data: { classId: "demo-5", name: "触摸操作" },
    })
  ).json();
  await page.request.post("/api/student/join", {
    data: { classroomId: room.id, studentIds: ["003"] },
  });
  await page.goto("/");
  await page.getByRole("button", { name: "展开画布" }).click();
  const cdp = await context.newCDPSession(page);
  const touchDrag = async (
    a: { x: number; y: number },
    b: { x: number; y: number },
  ) => {
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: a.x, y: a.y }],
    });
    for (let i = 1; i <= 10; i++)
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [
          { x: a.x + ((b.x - a.x) * i) / 10, y: a.y + ((b.y - a.y) * i) / 10 },
        ],
      });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
  };
  const palette = page.locator('[data-palette-id="start"]');
  const p = (await palette.boundingBox())!,
    canvas = (await page.locator(".flow-builder-canvas").boundingBox())!;
  await touchDrag(
    { x: p.x + p.width / 2, y: p.y + p.height / 2 },
    { x: canvas.x + 340, y: canvas.y + 100 },
  );
  const start = page.locator('[data-node="start"]');
  await expect(start).toHaveCount(1);
  const node = (await start.boundingBox())!;
  await touchDrag(
    { x: node.x + node.width / 2, y: node.y + node.height / 2 },
    { x: node.x + node.width / 2 + 90, y: node.y + node.height / 2 + 60 },
  );
  await expect(start).toHaveAttribute("data-x", "430");
  await expect(start).toHaveAttribute("data-y", "160");
  const nearVertex = (await start.boundingBox())!;
  await dragBetween(
    page,
    {
      x: nearVertex.x + nearVertex.width / 2,
      y: nearVertex.y + nearVertex.height / 2 - 8,
    },
    {
      x: nearVertex.x + nearVertex.width / 2 + 60,
      y: nearVertex.y + nearVertex.height / 2 + 32,
    },
  );
  await expect(start).toHaveAttribute("data-x", "490");
  await addNode(page, "结束");
  await page.getByRole("button", { name: "放大画布" }).click();
  await linkNode(page, "start", "下一步 →", "end");
  await expect(page.locator("[data-edge]")).toHaveCount(1);
  // Reconnect from different vertices using touch at the enlarged scale.
  const from = (await start.locator('[data-anchor="right"]').boundingBox())!;
  const to = (await page
    .locator('[data-node="end"] [data-anchor="left"]')
    .boundingBox())!;
  await touchDrag(
    { x: from.x + from.width / 2, y: from.y + from.height / 2 },
    { x: to.x + to.width / 2, y: to.y + to.height / 2 },
  );
  await expect(page.locator("[data-edge]")).toHaveCount(1);
  await expect
    .poll(async () => {
      const data = await (await page.request.get("/api/student/me")).json();
      const edge = data.participant.state?.plan?.edges?.[0];
      return edge ? [edge.fromAnchor, edge.toAnchor] : [];
    })
    .toEqual(["right", "left"]);
  await page.getByRole("button", { name: "缩小画布" }).click();
  await addNode(page, "开始");
  await expect(page.locator('[data-node="start-1"]')).toHaveCount(1);
  await page.getByRole("button", { name: "撤销上一步" }).click();
  const box = (await palette.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 100, box.y + 150);
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect(page.locator(".flow-drag-ghost")).toHaveCount(0);
  await expect(page.locator("[data-node]")).toHaveCount(2);
  await capture(page, "artifacts/flowchart-free-canvas.png");
  await page.getByRole("button", { name: "收起画布" }).click();
  await expect(page.locator(".flow-builder-expanded")).toHaveCount(0);
  await context.close();
});

test("自动对齐参考线、一键整理和画布内删除箭头", async ({ page }) => {
  await page.request.post("/api/teacher/login", {
    data: { username: "Alumos", password: "browser-test-password" },
  });
  const room = await (
    await page.request.post("/api/teacher/classrooms", {
      data: { classId: "demo-5", name: "对齐与删除" },
    })
  ).json();
  await page.request.post("/api/student/join", {
    data: { classroomId: room.id, studentIds: ["003"] },
  });
  await page.goto("/");
  await page.getByRole("button", { name: "展开画布" }).click();
  await buildL1(page);
  const fwd = page.locator('[data-node="fwd-1"]');
  const box = (await fwd.locator(".flow-node-content").boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    box.x + box.width / 2 + 7,
    box.y + box.height / 2 + 25,
    { steps: 8 },
  );
  await expect(page.locator(".flow-alignment-guide")).toHaveCount(1);
  await page.mouse.up();
  await expect(fwd).toHaveAttribute("data-x", "340");
  await expect(page.locator(".flow-alignment-guide")).toHaveCount(0);
  await page.getByRole("checkbox", { name: "自动对齐" }).uncheck();
  const free = (await fwd.locator(".flow-node-content").boundingBox())!;
  await dragBetween(
    page,
    { x: free.x + free.width / 2, y: free.y + free.height / 2 },
    { x: free.x + free.width / 2 + 67, y: free.y + free.height / 2 },
  );
  await expect(fwd).toHaveAttribute("data-x", "407");
  const relations = await page
    .locator("[data-edge]")
    .evaluateAll((es) => es.map((e) => e.getAttribute("data-edge")));
  await page.getByRole("button", { name: "一键整理" }).click();
  await expect(fwd).toHaveAttribute("data-x", "340");
  await expect(page.locator(".flow-validation")).toContainText("流程图完整");
  expect(
    await page
      .locator("[data-edge]")
      .evaluateAll((es) => es.map((e) => e.getAttribute("data-edge"))),
  ).toEqual(relations);
  const straight = await page
    .locator('[data-edge-kind="normal"] > path:first-child')
    .evaluateAll((es) => es.map((e) => e.getAttribute("d")!));
  expect(
    straight.filter((d) => d.split("L").length === 2).length,
  ).toBeGreaterThanOrEqual(3);
  await selectEdge(page, '[data-edge-kind="return"]');
  await expect(
    page
      .locator(".flow-builder-canvas")
      .getByRole("button", { name: "删除选中箭头" }),
  ).toBeVisible();
  await capture(page, "artifacts/flowchart-aligned-delete.png");
  await page.getByRole("button", { name: "删除选中箭头" }).click();
  await expect(page.locator('[data-edge-kind="return"]')).toHaveCount(0);
  await expect(page.locator(".flow-validation")).toContainText(
    "请补上一条返回箭头",
  );
  await page.getByRole("button", { name: "撤销上一步" }).click();
  await selectEdge(page, '[data-edge-kind="return"]');
  await page.keyboard.press("Delete");
  await expect(page.locator('[data-edge-kind="return"]')).toHaveCount(0);
  await page.getByRole("button", { name: "撤销上一步" }).click();
  await expect(page.locator(".flow-validation")).toContainText("流程图完整");
  await expect(page.locator(".flow-edge-list")).toHaveCount(0);
  // Undo arrangement restores the freely chosen position, too.
  await page.getByRole("button", { name: "撤销上一步" }).click();
  await expect(fwd).toHaveAttribute("data-x", "407");
});
