import { chromium } from "playwright";
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 1000 } });
await p.goto("http://localhost:3000/review/iss_412", { waitUntil: "networkidle" });
await p.waitForTimeout(1200);
console.log("build links:", await p.locator('a[href^="/build"]').count());
console.log("conversations links:", await p.locator('a[href="/conversations"]').count());
console.log("h1:", await p.locator("h1").innerText());
await b.close();
