import { test, expect, type Page } from "@playwright/test";

async function capture(page: Page, path: string) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path, fullPage: true });
}

async function addNode(page: Page, label: string) {
  await page
    .locator(".flow-node-palette")
    .getByRole("button", { name: label, exact: true })
    .click();
}

async function linkNode(
  page: Page,
  source: string,
  output: string,
  target: string,
) {
  await page
    .locator(`[data-node="${source}"]`)
    .getByRole("button", { name: output, exact: true })
    .click();
  await page.locator(`[data-input="${target}"]`).click();
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
  await student.locator(".flow-edge-list summary").click();
  await student.getByRole("button", { name: "删除返回箭头" }).click();
  await expect(student.locator(".flow-validation")).toContainText(
    "还不能重复执行",
  );
  await expect(
    student.getByRole("button", { name: "开始模拟", exact: true }),
  ).toBeDisabled();
  await student
    .locator('[data-node="pulse-1"]')
    .getByRole("button", { name: "回到判断 →", exact: true })
    .focus();
  await student.keyboard.press("Enter");
  await student.locator('[data-input="condition-tower"]').focus();
  await student.keyboard.press("Enter");
  await expect(student.locator(".flow-validation")).toContainText("流程图完整");
  await capture(student, "artifacts/student-exercise.png");
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
  await student.getByRole("button", { name: /盒中已有 3 个样本？/ }).click();
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
  await student.getByRole("button", { name: /盒中已有 3 个样本？/ }).click();
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
  await page
    .locator('[data-node="hazard-1"]')
    .getByRole("button", { name: "下移前方危险？" })
    .click();
  await expect(page.locator('[data-node="hazard-1"]')).toHaveCount(1);
  await page
    .locator('[data-node="hazard-1"]')
    .getByRole("button", { name: "上移前方危险？" })
    .click();
  await expect(page.locator('[data-node="hazard-1"]')).toContainText(
    "前方危险？",
  );
  await expect(page.getByText("本关统一使用：先判断，再执行")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "先执行，再判断", exact: true }),
  ).toHaveCount(0);
  await capture(page, "artifacts/flowchart-branch-reordered.png");
  await page
    .locator('[data-node="left-1"]')
    .getByRole("button", { name: "删除左转 90°" })
    .click();
  await expect(page.locator('[data-node="left-1"]')).toHaveCount(0);
  await expect(page.locator(".flow-validation")).not.toContainText(
    "流程图完整",
  );
  await page.getByRole("button", { name: /04 绕坑一圈/ }).click();
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

test("第三关手工连接和拖线，先判断缺少数据，先执行第八样点停止", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.request.post("/api/teacher/login", {
    data: { username: "Alumos", password: "browser-test-password" },
  });
  const created = await page.request.post("/api/teacher/classrooms", {
    data: { classId: "demo-5", name: "水冰时机对照课堂" },
  });
  const room = await created.json();
  await page.request.post("/api/student/join", {
    data: { classroomId: room.id, studentIds: ["001"] },
  });
  await page.goto("/");
  await page.getByRole("button", { name: /03 寻找水冰/ }).click();
  await expect(page.locator("[data-node]")).toHaveCount(0);
  await expect(
    page
      .locator(".flow-node-palette")
      .getByRole("button", { name: "前进 1 格" }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "没有数据，无法判断", exact: true })
    .click();
  for (const label of [
    "开始",
    "本轮扫描到水冰？",
    "到下一样点",
    "扫描当前样点",
    "结束",
  ])
    await addNode(page, label);
  await page
    .getByRole("button", { name: "先执行，再判断", exact: true })
    .click();
  await expect(page.locator("[data-edge]")).toHaveCount(0);
  await page
    .getByRole("button", { name: "先判断，再执行", exact: true })
    .click();
  const source = page
      .locator('[data-node="start"]')
      .getByRole("button", { name: "下一步 →", exact: true }),
    target = page.locator('[data-input="condition-ice"]');
  await source.scrollIntoViewIfNeeded();
  await target.scrollIntoViewIfNeeded();
  const a = (await source.boundingBox())!,
    b = (await target.boundingBox())!;
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await expect(page.locator(".flow-connection-note")).toBeVisible();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect(page.locator("[data-edge]")).toHaveCount(1);
  await linkNode(page, "condition-ice", "是 →", "end");
  await linkNode(page, "condition-ice", "否 →", "advance-1");
  await linkNode(page, "advance-1", "下一步 →", "scan-1");
  await linkNode(page, "scan-1", "回到判断 →", "advance-1");
  await expect(page.locator(".flow-validation")).toContainText("不能回到动作");
  await expect(
    page.getByRole("button", { name: "开始模拟", exact: true }),
  ).toBeDisabled();
  await linkNode(page, "scan-1", "回到判断 →", "condition-ice");
  await expect(page.locator(".flow-validation")).toContainText("流程图完整");
  await capture(page, "artifacts/flowchart-scan-pre.png");
  await page.getByRole("button", { name: "开始模拟", exact: true }).click();
  await expect(page.locator(".run-status")).toContainText(
    "尚无扫描数据，无法判断",
  );
  await page
    .getByRole("button", { name: "先执行，再判断", exact: true })
    .click();
  await expect(page.locator('[data-edge-kind="return"]')).toHaveCount(1);
  await page.getByRole("button", { name: "开始模拟", exact: true }).click();
  await expect(page.locator('[data-node="advance-1"].executing')).toBeVisible();
  await expect(page.locator(".run-status")).toContainText(
    "任务完成：8 轮，8 格",
    { timeout: 20000 },
  );
  await expect(page.locator(".comparison")).toContainText("尚无扫描数据");
  await expect(page.locator(".comparison")).toContainText("第 3 列、第 2 行");
  await capture(page, "artifacts/flowchart-scan-post.png");
  expect(errors).toEqual([]);
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
