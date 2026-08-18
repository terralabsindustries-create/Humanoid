import { chromium } from "playwright";

const OUT = "/private/tmp/claude-501/-Users-macbookpro-Humanoid/ad849438-0b06-423c-8804-e3a4d04f34f2/scratchpad";
const BASE = process.env.BASE ?? "http://localhost:3100";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

const problems = [];
page.on("console", (m) => {
  if (m.type() === "error" && !m.text().includes("401")) {
    problems.push(`console: ${m.text()}`);
  }
});
page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));

const scroller = () =>
  page.evaluate(() => {
    const candidates = [...document.querySelectorAll("*")].filter(
      (el) => el.scrollHeight > el.clientHeight + 40 && el.clientHeight > 400,
    );
    const el = candidates[candidates.length - 1];
    if (el) el.scrollTop = el.scrollHeight;
    return el ? el.className : "none";
  });

for (const [name, url, scroll] of [
  ["queue", `${BASE}/review`, false],
  ["issue-top", `${BASE}/review/iss_412`, false],
  ["issue-bottom", `${BASE}/review/iss_412`, true],
  ["issue-autonomy", `${BASE}/review/iss_397`, true],
  ["issue-missing", `${BASE}/review/nope_404`, false],
  ["queue-narrow", `${BASE}/review`, false],
]) {
  if (name === "queue-narrow") await page.setViewportSize({ width: 900, height: 1000 });
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  if (scroll) {
    await scroller();
    await page.waitForTimeout(400);
  }
  await page.screenshot({ path: `${OUT}/${name}.png` });
}

console.log(problems.length ? problems.join("\n") : "no console errors");
await browser.close();
