import { test, expect } from "@playwright/test";
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
  await student
    .locator(".palette")
    .getByRole("button", { name: "前进 1 格" })
    .click();
  await student
    .locator(".palette")
    .getByRole("button", { name: "发送位置脉冲" })
    .click();
  await student.screenshot({
    path: "artifacts/student-exercise.png",
    fullPage: true,
  });
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
  await expect(page.locator(".monitor-frame .flow-block")).toHaveCount(2);
  await student.getByRole("button", { name: "开始模拟", exact: true }).click();
  await expect(student.locator(".run-status")).toContainText("任务完成", {
    timeout: 25000,
  });
  await expect(page.locator(".monitor-frame .run-status")).toContainText(
    "任务完成",
    { timeout: 7000 },
  );
  await page.screenshot({
    path: "artifacts/teacher-monitor.png",
    fullPage: true,
  });
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
  await page.screenshot({
    path: "artifacts/teacher-overview.png",
    fullPage: true,
  });
  // A failed attempt made offline must arrive once after reconnection.
  await studentContext.setOffline(true);
  await student.getByRole("button", { name: /02 峡谷巡路/ }).click();
  await student.getByRole("button", { name: "第 1 步", exact: true }).click();
  await student
    .locator(".palette")
    .getByRole("button", { name: "前进 1 格" })
    .click();
  await student
    .locator(".palette")
    .getByRole("button", { name: "前方危险则左转" })
    .click();
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
  await page.getByRole("button", { name: "操作回放" }).click();
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
