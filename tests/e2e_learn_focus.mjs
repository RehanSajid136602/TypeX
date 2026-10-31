import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

async function run() {
  console.log('[*] Launching Chromium browser for TypeX E2E suite...');
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const screenshotsDir = '/home/rehan/Documents/Typing/tests/screenshots';
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }

  const themes = ['obsidian', 'tokyo', 'nordic'];
  const viewports = [
    { name: '1366x768', width: 1366, height: 768 },
    { name: '1920x1080', width: 1920, height: 1080 }
  ];

  for (const vp of viewports) {
    for (const theme of themes) {
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height }
      });
      const page = await context.newPage();

      // Go to app
      await page.goto('http://127.0.0.1:3000');
      await page.waitForLoadState('networkidle');

      // Switch theme via localStorage
      await page.evaluate((t) => {
        localStorage.setItem('typex_theme', t);
        document.documentElement.setAttribute('data-theme', t);
      }, theme);
      await page.reload();
      await page.waitForLoadState('networkidle');

      // Click Learn Mode button
      const learnButton = page.locator('button:has-text("Learn")');
      if (await learnButton.isVisible()) {
        await learnButton.click();
        await page.waitForTimeout(500);
      }

      // 1. Initial State Screenshot
      const initialPic = path.join(screenshotsDir, `learn_${theme}_${vp.name}_initial.png`);
      await page.screenshot({ path: initialPic });
      console.log(`[✓] Saved initial screenshot: ${initialPic}`);

      // Verify Contrast of primary text in Arena
      const contrast = await page.evaluate(() => {
        const wordEl = document.querySelector('[data-theme] span') || document.body;
        const style = window.getComputedStyle(wordEl);
        return {
          color: style.color,
          bg: window.getComputedStyle(document.body).backgroundColor
        };
      });
      console.log(`[Contrast] Theme: ${theme}, Text Color: ${contrast.color}, BG: ${contrast.bg}`);

      // 2. Test Focus Mode Persistence during typing
      // Send a keystroke to activate typing and focus mode
      await page.keyboard.press('KeyE');
      await page.waitForTimeout(400);

      const focusActivePic = path.join(screenshotsDir, `learn_${theme}_${vp.name}_focus_active.png`);
      await page.screenshot({ path: focusActivePic });
      console.log(`[✓] Saved focus active screenshot: ${focusActivePic}`);

      // Verify Chrome is dimmed / hidden
      const headerOpacity = await page.evaluate(() => {
        const header = document.querySelector('header');
        if (!header) return null;
        return window.getComputedStyle(header).opacity;
      });
      console.log(`[Focus Mode] Header opacity during typing: ${headerOpacity}`);

      // 3. Test Idle Mouse (simulate waiting 1.5s idle) - Focus must remain active (chrome hidden)
      await page.waitForTimeout(1500);
      const afterIdleOpacity = await page.evaluate(() => {
        const header = document.querySelector('header');
        if (!header) return null;
        return window.getComputedStyle(header).opacity;
      });
      console.log(`[Focus Mode] Header opacity after idle wait: ${afterIdleOpacity}`);

      // 4. Test Mouse Jitter (<80px) - Should NOT reveal chrome
      await page.mouse.move(200, 200);
      await page.mouse.move(220, 210); // 22px distance
      await page.waitForTimeout(100);
      const afterJitterOpacity = await page.evaluate(() => {
        const header = document.querySelector('header');
        if (!header) return null;
        return window.getComputedStyle(header).opacity;
      });
      console.log(`[Focus Mode] Header opacity after mouse jitter (<80px): ${afterJitterOpacity}`);

      // 5. Test Deliberate Mouse Swipe (>=80px in <=300ms) - SHOULD reveal chrome
      await page.mouse.move(100, 100);
      await page.mouse.move(300, 100); // 200px distance
      await page.waitForTimeout(150);
      const afterSwipeOpacity = await page.evaluate(() => {
        const header = document.querySelector('header');
        if (!header) return null;
        return window.getComputedStyle(header).opacity;
      });
      console.log(`[Focus Mode] Header opacity after deliberate swipe (>=80px): ${afterSwipeOpacity}`);

      // 6. Test Escape Key restores focus mode / chrome
      await page.keyboard.press('KeyE'); // back in typing
      await page.waitForTimeout(200);
      await page.keyboard.press('Escape'); // deliberate escape
      await page.waitForTimeout(200);
      const afterEscapeOpacity = await page.evaluate(() => {
        const header = document.querySelector('header');
        if (!header) return null;
        return window.getComputedStyle(header).opacity;
      });
      console.log(`[Focus Mode] Header opacity after pressing Escape: ${afterEscapeOpacity}`);

      await context.close();
    }
  }

  await browser.close();
  console.log('[🎉] Playwright test run complete!');
}

run().catch((err) => {
  console.error('Test run failed:', err);
  process.exit(1);
});
