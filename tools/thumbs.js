// Saves every Cosmetics Library card picture to cosmetics/thumbs/ so the grid
// loads them as files instead of rendering each preview on every visit.
// Run from the repo root after changing previews:
//   python3 -m http.server 8765 &   then   node tools/thumbs.js [http://localhost:8765]
// Only cards whose preview changed are re-rendered unless you pass --all.
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path");
const base = process.argv.find((a) => a.startsWith("http")) || "http://localhost:8765";
const all = process.argv.includes("--all");
(async () => {
  const dir = path.join(__dirname, "..", "cosmetics", "thumbs");
  fs.mkdirSync(dir, { recursive: true });
  const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on("pageerror", (e) => console.error("page:", e.message));
  await page.goto(`${base}/cosmetics.html${all ? "?thumbs" : ""}`);
  await page.waitForFunction(() => window.__thumbsDone === true, null, { timeout: 0, polling: 1000 });
  const got = await page.evaluate(() => window.__thumbs || {});
  const idxFile = path.join(dir, "index.json");
  const index = all ? {} : JSON.parse(fs.existsSync(idxFile) ? fs.readFileSync(idxFile, "utf8") : "{}");
  for (const [id, { key, url }] of Object.entries(got)) {
    fs.writeFileSync(path.join(dir, id + ".webp"), Buffer.from(url.split(",")[1], "base64"));
    index[id] = key;
  }
  // Drop pictures of cards that no longer exist.
  const ids = new Set(await page.evaluate(() => window.__thumbIds));
  for (const id of Object.keys(index)) if (!ids.has(id)) { delete index[id]; fs.rmSync(path.join(dir, id + ".webp"), { force: true }); }
  fs.writeFileSync(idxFile, JSON.stringify(index, null, 0) + "\n");
  console.log(`saved ${Object.keys(got).length} pictures, ${Object.keys(index).length} in index`);
  await browser.close();
})();
