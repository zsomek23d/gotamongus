// Vizuális teszt: elindít egy játékot Sárkánykőn 3 bottal, és képernyőképeket készít.
const puppeteer = require('puppeteer-core');
const path = require('path');

const SHOT_DIR = process.env.SHOT_DIR || '.';

(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    headless: 'new',
    args: ['--window-size=1500,900']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1500, height: 900 });
  await page.goto('http://localhost:3000');

  await page.type('#inp-name', 'Teszter');
  await page.click('#btn-create');
  await page.waitForSelector('#screen-lobby.active');
  for (let i = 0; i < 3; i++) {
    await page.click('#btn-addbot');
    await new Promise(r => setTimeout(r, 150));
  }
  await page.click('#btn-start');
  await page.waitForSelector('#screen-game.active', { timeout: 10000 });
  await new Promise(r => setTimeout(r, 1500));
  await page.screenshot({ path: path.join(SHOT_DIR, 'shot-role.png') });

  // várjuk a play fázist (spawn: Trónterem)
  await new Promise(r => setTimeout(r, 6000));
  await page.screenshot({ path: path.join(SHOT_DIR, 'shot-play.png') });

  // navigáció útvonalpontok mentén, a kliens pozícióját visszaolvasva
  const goTo = async (tx, ty) => {
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      const p = await page.evaluate(() => window.__pos());
      if (p.phase !== 'play') { await new Promise(r => setTimeout(r, 500)); continue; }
      const dx = tx - p.x, dy = ty - p.y;
      if (Math.hypot(dx, dy) < 40) break;
      const keys = [];
      if (Math.abs(dx) > 20) keys.push(dx > 0 ? 'd' : 'a');
      if (Math.abs(dy) > 20) keys.push(dy > 0 ? 's' : 'w');
      for (const k of keys) await page.keyboard.down(k);
      await new Promise(r => setTimeout(r, 130));
      for (const k of keys) await page.keyboard.up(k);
    }
  };

  const route = [
    [[1270, 320], [1270, 670], [1260, 950]],                    // Nagy Csarnok
    [[790, 930], [370, 930]],                                   // Aegon kertje
    [[370, 1210], [430, 1480]],                                 // Sárkányüreg
    [[915, 1470], [1240, 1470]],                                // Konyha
    [[1690, 1440], [2230, 1395]]                                // Kikötő
  ];
  const names = ['csarnok', 'kert', 'ureg', 'konyha', 'kikoto'];
  for (let i = 0; i < route.length; i++) {
    for (const [x, y] of route[i]) await goTo(x, y);
    await page.screenshot({ path: path.join(SHOT_DIR, `shot-${names[i]}.png`) });
  }

  const errors = await page.evaluate(() => window.__errors || []);
  console.log('console errors:', JSON.stringify(errors));
  await browser.close();
  console.log('screenshots done');
})().catch(e => { console.error(e); process.exit(1); });
