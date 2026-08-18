import { chromium } from "playwright";

const OUT = process.env.OUT;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });

const problems = [];
page.on("console", (m) => {
  if (m.type() === "error" && !m.text().includes("401")) {
    problems.push(`console: ${m.text()}`);
  }
});
page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));

const url = "http://localhost:3100/govern/channels";
const tag = process.argv[2] ?? "default";

await page.goto(url, { waitUntil: "networkidle" });
await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}/ch-${tag}-wide.png`, fullPage: true });

// Narrow: the rail must drop, not squeeze.
await page.setViewportSize({ width: 880, height: 1100 });
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/ch-${tag}-narrow.png`, fullPage: true });

const text = await page.evaluate(() => document.body.innerText);
console.log("=== TEXT ===");
console.log(text);
console.log("=== PROBLEMS ===");
console.log(problems.length ? problems.join("\n") : "none");

await browser.close();
