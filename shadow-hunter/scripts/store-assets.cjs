/**
 * Renders the Google Play listing images into store/:
 *   icon-512.png, feature-1024x500.png and screenshot-1..5.png (1080x1920).
 *
 * Needs the dev server running (npm run dev) and Playwright with Chromium available
 * (`npm i -D playwright && npx playwright install chromium` if it isn't).
 * Usage: node scripts/store-assets.cjs [http://localhost:5173]
 */
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const BASE = process.argv[2] || "http://localhost:5173";
const OUT = path.join(__dirname, "..", "store");
fs.mkdirSync(OUT, { recursive: true });

const saveDataUrl = (file, url) => fs.writeFileSync(path.join(OUT, file), Buffer.from(url.split(",")[1], "base64"));

// Runs in the page: stop the live loop's simulation and expose a manual stepper,
// so each shot is set up deterministically.
const FREEZE = () => {
  const g = window.game;
  const step = Object.getPrototypeOf(g).update.bind(g);
  g.update = () => {};
  window.step = (sec) => {
    for (let i = 0; i < Math.round(sec * 60); i++) step(1 / 60);
  };
  window.freeSpotNear = (t, dist, base) => {
    for (const turn of [0, 0.4, -0.4, 0.8, -0.8, 1.2, -1.2, 1.6, -1.6, 2.2, -2.2, Math.PI]) {
      const a = base + turn;
      const x = t.x + Math.cos(a) * dist;
      const y = t.y + Math.sin(a) * dist;
      if (g.grid.circleFree(x, y, 10) && g.grid.lineOfSight(t, { x, y })) return { x, y };
    }
    return null;
  };
};

(async () => {
  const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });

  // ---- Icon and feature graphic ----
  {
    const page = await browser.newPage({ viewport: { width: 1100, height: 600 }, deviceScaleFactor: 1 });
    await page.goto(`${BASE}/store-assets.html`);
    await page.waitForFunction(() => window.storeAssets);
    saveDataUrl("icon-512.png", await page.evaluate(() => window.storeAssets.icon()));
    await page.evaluate(() => window.storeAssets.feature(document.getElementById("feature")));
    await page.waitForTimeout(300);
    await page.locator("#feature").screenshot({ path: path.join(OUT, "feature-1024x500.png") });
    await page.close();
  }

  // ---- Phone screenshots, 360x640 CSS px at 3x = 1080x1920 ----
  const phone = { viewport: { width: 360, height: 640 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true };
  const shot = async (page, n) => {
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(OUT, `screenshot-${n}.png`) });
  };
  const open = async (query, storage) => {
    const page = await browser.newPage(phone);
    await page.addInitScript((s) => {
      localStorage.clear();
      for (const [k, v] of Object.entries(s || {})) localStorage.setItem(k, v);
    }, storage);
    await page.goto(`${BASE}/${query}`);
    await page.addStyleTag({ content: "#hint{display:none!important}" });
    await page.waitForTimeout(1200);
    return page;
  };
  const start = async (page) => {
    await page.tap("#startBtn", { force: true });
    await page.waitForTimeout(500);
    await page.evaluate(FREEZE);
  };

  // 1. Title screen.
  {
    const page = await open("", { "shadowHunter.gems": "320" });
    await shot(page, 1);
    await page.close();
  }

  // 2. Sneaking up behind a patrolling guard.
  {
    const page = await open("?level=2");
    await start(page);
    await page.evaluate(() => {
      const g = window.game;
      const pl = g.player;
      const t = g.guards.reduce((a, b) => (Math.hypot(b.x - pl.x, b.y - pl.y) < Math.hypot(a.x - pl.x, a.y - pl.y) ? b : a));
      const spot = window.freeSpotNear(t, 58, t.angle + Math.PI);
      pl.x = spot.x;
      pl.y = spot.y;
      pl.angle = Math.atan2(t.y - pl.y, t.x - pl.x);
      pl.stride = 40;
    });
    await shot(page, 2);
    await page.close();
  }

  // 3. The kill: slash, blood and a burst of gems.
  {
    const page = await open("?level=3", { "shadowHunter.gems": "86" });
    await start(page);
    await page.evaluate(() => {
      const g = window.game;
      const pl = g.player;
      const t = g.guards.reduce((a, b) => (Math.hypot(b.x - pl.x, b.y - pl.y) < Math.hypot(a.x - pl.x, a.y - pl.y) ? b : a));
      const spot = window.freeSpotNear(t, 24, t.angle + Math.PI);
      pl.x = spot.x;
      pl.y = spot.y;
      window.step(0.12);
    });
    await shot(page, 3);
    await page.close();
  }

  // 4. Boss level: spotted by the boss, which opens fire.
  {
    const page = await open("?level=5", { "shadowHunter.gems": "412" });
    await start(page);
    await page.waitForTimeout(2600); // let the BOSS LEVEL banner finish
    await page.evaluate(() => {
      const g = window.game;
      const b = g.boss;
      const pl = g.player;
      const spot = window.freeSpotNear(b, 120, b.angle);
      pl.x = spot.x;
      pl.y = spot.y;
      pl.angle = Math.atan2(b.y - pl.y, b.x - pl.x) + 0.6;
      for (let i = 0; i < 120 && g.bullets.length < 3; i++) {
        pl.hp = pl.maxHp * 0.6;
        window.step(1 / 60);
      }
    });
    await shot(page, 4);
    await page.close();
  }

  // 5. The shop.
  {
    const page = await open("", {
      "shadowHunter.gems": "1240",
      "shadowHunter.owned": JSON.stringify(["shadow", "swift", "brute"]),
      "shadowHunter.hero": "brute",
    });
    await page.tap("#shopOpen", { force: true });
    await page.waitForTimeout(800);
    await shot(page, 5);
    await page.close();
  }

  await browser.close();
  console.log("wrote", fs.readdirSync(OUT).filter((f) => f.endsWith(".png")).join(", "));
})();
