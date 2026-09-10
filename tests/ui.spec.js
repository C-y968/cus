import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
const screenshots = path.resolve("artifacts");
fs.mkdirSync(screenshots, { recursive: true });
test("电脑端与手机端完整工作流", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.getByText("暂无客户")).toBeVisible();
  await page.getByRole("button", { name: "体验虚构示例" }).click();
  await expect(
    page.getByRole("heading", { name: "林知远（示例）" }),
  ).toBeVisible();
  await expect(
    page.getByText("华东三个工厂设备数据整合，先做苏州工厂试点。"),
  ).toBeVisible();
  await page.getByRole("button", { name: "1 次交流佐证" }).first().click();
  await expect(
    page.getByText(
      "“我们在评估华东三个工厂的设备数据整合，第一阶段先做苏州工厂。”",
    ),
  ).toBeVisible();
  if (await page.getByRole("button", { name: "关闭提示" }).isVisible())
    await page.getByRole("button", { name: "关闭提示" }).click();
  await page.screenshot({
    path: path.join(screenshots, "desktop-profile.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "修订 沟通偏好" }).click();
  await page
    .getByLabel("修订后的内容")
    .fill("材料提前一天发送，工作日上午沟通。");
  await page.getByRole("button", { name: "保存修订" }).click();
  await expect(
    page.getByText("材料提前一天发送，工作日上午沟通。", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("人工修订 · 原话保留")).toBeVisible();
  await page
    .locator(".sidebar")
    .getByRole("button", { name: "工作台", exact: true })
    .click();
  await expect(page.getByText("最近联系的客户")).toBeVisible();
  if (await page.getByRole("button", { name: "关闭提示" }).isVisible())
    await page.getByRole("button", { name: "关闭提示" }).click();
  await page.screenshot({
    path: path.join(screenshots, "desktop-dashboard.png"),
    fullPage: true,
  });
  await page
    .locator(".sidebar")
    .getByRole("button", { name: "客户档案", exact: true })
    .click();
  await page.getByRole("button", { name: "新建客户", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("公司 *").fill("明川制造");
  await dialog.getByLabel("业务部门 *").fill("供应链部");
  await dialog.getByLabel("客户姓名 *").fill("陈经理");
  await dialog.getByLabel("职位 / 角色").fill("采购经理");
  await dialog.getByRole("button", { name: "保存客户" }).click();
  await expect(
    page.getByRole("heading", { name: "陈经理", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "添加事项" }).click();
  await page.getByLabel("跟进内容").fill("发送产品说明书");
  await page.getByLabel("计划日期（可选）").fill("2026-09-10");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "保存", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "完成 发送产品说明书" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "记录拜访", exact: true }).click();
  await page.getByRole("button", { name: "文字记录", exact: true }).click();
  await page
    .getByLabel("粘贴文字稿或会后记录")
    .fill("陈经理：我们想先了解产品的交付周期。销售：明天发送说明书。");
  await page.getByText("已获对方同意录音并整理客户档案").click();
  await page.getByRole("button", { name: "保存并更新客户档案" }).click();
  await expect(
    page.getByRole("heading", { name: "已保存", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "查看处理进度" }).click();
  await expect(
    page.getByRole("dialog").getByText("待配置提炼", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".transcript")).toContainText("陈经理：");
  await page.getByRole("button", { name: "关闭", exact: true }).last().click();
  await page
    .locator(".sidebar")
    .getByRole("button", { name: "设置", exact: true })
    .click();
  await expect(page.getByRole("heading", { name: "工作台设置" })).toBeVisible();
  await expect(page.getByAltText("手机录音入口二维码")).toBeVisible();
  if (await page.getByRole("button", { name: "关闭提示" }).isVisible())
    await page.getByRole("button", { name: "关闭提示" }).click();
  await page.screenshot({
    path: path.join(screenshots, "desktop-settings.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .locator(".mobile-nav")
    .getByRole("button", { name: "拜访记录" })
    .click();
  await page
    .getByLabel("选择客户", { exact: true })
    .selectOption({ label: "明川制造 / 供应链部 / 陈经理" });
  await page.getByText("已获对方同意录音并整理客户档案").click();
  if (await page.getByRole("button", { name: "关闭提示" }).isVisible())
    await page.getByRole("button", { name: "关闭提示" }).click();
  await page.screenshot({
    path: path.join(screenshots, "mobile-capture.png"),
    fullPage: true,
  });
  expect(
    await page
      .getByRole("button", { name: "开始录音", exact: true })
      .evaluate(
        (el) => el.getBoundingClientRect().bottom < window.innerHeight - 65,
      ),
  ).toBe(true);
  await page.getByRole("button", { name: "开始录音", exact: true }).click();
  await expect(page.getByRole("button", { name: "结束录音" })).toBeVisible();
  await expect(page.getByText("正在录音")).toBeVisible();
  await page.getByRole("button", { name: "暂停", exact: true }).click();
  await expect(page.getByText("已暂停")).toBeVisible();
  await page.getByRole("button", { name: "继续", exact: true }).click();
  await page.waitForTimeout(1200);
  await page.getByRole("button", { name: "结束录音" }).click();
  await expect(page.getByText("下载录音备份")).toBeVisible();
  await expect(page.locator("audio")).toHaveAttribute("src", /^blob:/);
  await page.reload();
  await expect(page.getByText(/已恢复本机草稿/)).toBeVisible();
  await page.getByText("已获对方同意录音并整理客户档案").click();
  await page.getByRole("button", { name: "保存并更新客户档案" }).click();
  await expect(
    page.getByRole("heading", { name: "已保存", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "查看处理进度" }).click();
  await expect(
    page.getByRole("dialog").getByText("待配置转写", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "关闭", exact: true }).last().click();
  await page
    .locator(".mobile-nav")
    .getByRole("button", { name: "客户档案" })
    .click();
  await page.getByLabel("搜索客户").fill("林知远");
  await page.locator(".table-row").click();
  await expect(
    page.getByRole("heading", { name: "林知远（示例）" }),
  ).toBeVisible();
  if (await page.getByRole("button", { name: "关闭提示" }).isVisible())
    await page.getByRole("button", { name: "关闭提示" }).click();
  await page.screenshot({
    path: path.join(screenshots, "mobile-profile.png"),
    fullPage: true,
  });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow).toBe(false);
  expect(errors).toEqual([]);
});
