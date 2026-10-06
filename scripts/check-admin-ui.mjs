import { chromium } from "@playwright/test";
import { mkdtemp, readFile, writeFile, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import { createApp } from "../dist/app.js";
import { loadConfig } from "../dist/config/env.js";

const dir = await mkdtemp(join(tmpdir(), "doubao-ui-"));
const cookie = "sessionid=fixture; sid_tt=fixture; uid_tt=fixture";
await writeFile(join(dir, "cookie.txt"), cookie);
const app = createApp(loadConfig({
  API_KEY: "ui-fixture-key", LOG_LEVEL: "silent", DOUBAO_COOKIE_FILE: join(dir, "cookie.txt"),
}), { fetcher: async () => Response.json({ code: 0 }) });
let browser;
try {
  const url = await app.listen({ port: 0, host: "127.0.0.1" });
  const password = (await readFile(join(dir, "admin", "initial-password.txt"), "utf8")).trim();
  browser = await chromium.launch({
    headless: true,
    ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}),
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(url + "/admin");
  await page.getByLabel("管理密码", { exact: true }).fill("incorrect-password");
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await page.getByRole("alert").filter({ hasText: "密码不正确" }).waitFor();
  await page.getByLabel("管理密码", { exact: true }).fill(password);
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await page.locator(".account-name").filter({ hasText: "本地 Cookie 文件" }).waitFor();
  const screenshots = join(process.cwd(), ".artifacts");
  await mkdir(screenshots, { recursive: true });
  for (const name of ["备用账号", "工作账号 · 长名称".repeat(4)]) {
    await page.getByRole("button", { name: "导入 Cookie", exact: true }).first().click();
    await page.getByLabel("账号名称", { exact: true }).fill(name);
    await page.getByLabel("Cookie", { exact: true }).fill(cookie);
    await page.getByRole("button", { name: "保存", exact: true }).click();
    await page.locator(".account-name").filter({ hasText: name }).waitFor();
    await page.locator(`[aria-label="检测 ${name}"]`).waitFor();
  }
  await page.locator('input[name="mode"][value="round-robin"]').check();
  await page.waitForFunction(() => document.getElementById("preferred-field").hidden);
  await page.reload();
  await page.locator('input[name="mode"][value="round-robin"]:checked').waitFor();
  const toggle = page.getByRole("checkbox", { name: "备用账号：启用", exact: true });
  await toggle.uncheck();
  await page.locator('.disabled-row .account-name').filter({ hasText: "备用账号" }).waitFor();
  await toggle.check();
  await page.locator('.account-row:not(.disabled-row) .account-name').filter({ hasText: "备用账号" }).waitFor();
  await page.getByRole("button", { name: "编辑 备用账号", exact: true }).click();
  await page.getByLabel("账号名称", { exact: true }).fill("已更新账号");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await page.locator(".account-name").filter({ hasText: "已更新账号" }).waitFor();
  await page.screenshot({ path: join(screenshots, "admin-desktop.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({ path: join(screenshots, "admin-mobile.png"), fullPage: true });
  await page.getByRole("button", { name: "导入 Cookie", exact: true }).first().click();
  await page.locator("#account-dialog").evaluate(async element => {
    await Promise.all(element.getAnimations().map(animation => animation.finished.catch(() => {})));
  });
  assert.equal(await page.locator("#account-dialog").evaluate(element => getComputedStyle(element).opacity), "1");
  await page.screenshot({ path: join(screenshots, "admin-import-mobile.png"), fullPage: true });
  await page.getByRole("button", { name: "关闭", exact: true }).first().click();
  await page.getByRole("button", { name: "删除 已更新账号", exact: true }).click();
  await page.getByRole("button", { name: "删除", exact: true }).click();
  await page.waitForFunction(() => !document.querySelector(".account-list").textContent.includes("已更新账号"));
  await page.getByRole("tab", { name: "安全设置", exact: true }).click();
  await page.getByLabel("当前密码", { exact: true }).fill(password);
  await page.getByRole("button", { name: "随机生成", exact: true }).click();
  const nextPassword = await page.getByLabel("新密码", { exact: true }).inputValue();
  assert.ok(nextPassword.length >= 32);
  await page.getByRole("button", { name: "保存密码", exact: true }).click();
  await page.getByRole("heading", { name: "管理登录", exact: true }).waitFor();
  await page.getByLabel("管理密码", { exact: true }).fill(nextPassword);
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await page.locator(".account-name").filter({ hasText: "本地 Cookie 文件" }).waitFor();
  await page.getByRole("button", { name: "退出登录", exact: true }).click();
  await page.getByRole("heading", { name: "管理登录", exact: true }).waitFor();
  await page.screenshot({ path: join(screenshots, "admin-login-mobile.png"), fullPage: true });
  assert.deepEqual(errors, []);
  console.log("Admin UI desktop/mobile workflows passed; screenshots in .artifacts.");
} finally {
  await browser?.close();
  await app.close();
  await rm(dir, { recursive: true, force: true });
}
