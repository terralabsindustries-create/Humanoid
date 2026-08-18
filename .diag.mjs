import { chromium } from "playwright";
const OUT = "/private/tmp/claude-501/-Users-macbookpro-Humanoid/e8576837-792f-43ad-b741-2965d6d6cb17/scratchpad";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 900, height: 1000 } });
const problems = [];
page.on("pageerror", (e) => problems.push(e.message));
await page.goto("http://localhost:3100/records", { waitUntil: "networkidle" });
await page.waitForTimeout(4000);
await page.locator("ul li button").first().click();
await page.waitForTimeout(1000);

for (let i = 0; i < 15; i++) {
  await page.mouse.wheel(0, 600);
  await page.waitForTimeout(150);
}
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/rec-6-narrow-detail.png` });
console.log(problems.length ? problems.join("\n") : "no page errors");
await browser.close();
