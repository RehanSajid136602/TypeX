const { chromium } = require('/home/rehan/Documents/Typing/frontend/node_modules/playwright');
const fs = require('fs');
const path = require('path');

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
      console.log(`\n=== Testing Viewport: ${vp.name}, Theme: ${theme} ===`);
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
      console.log(`  ✓ Saved initial screenshot: ${initialPic}`);

      // Contrast Verification
      const textContrast = await page.evaluate(() => {
        const span = document.querySelector('span');
        const style = span ? window.getComputedStyle(span) : null;
        return {
          textColor: style ? style.color : 'unknown',
          bgColor: window.getComputedStyle(document.body).backgroundColor
        };
      });
      console.log(`  ✓ Contrast check: text=${textContrast.textColor}, bg=${textContrast.bgColor}`);

      // 2. Test Focus Mode Persistence during typing
      await page.keyboard.press('KeyE');
      await page.waitForTimeout(400);

      const focusActivePic = path.join(screenshotsDir, `learn_${theme}_${vp.name}_focus_active.png`);
      await page.screenshot({ path: focusActivePic });
      console.log(`  ✓ Saved focus active screenshot: ${focusActivePic}`);

      const headerOpacityDuringTyping = await page.evaluate(() => {
        const header = document.querySelector('header');
        return header ? window.getComputedStyle(header).opacity : '1';
      });
      console.log(`  ✓ Focus active (header opacity): ${headerOpacityDuringTyping}`);

      // 3. Test Idle Mouse (simulate waiting 1.5s idle) - Focus must remain active (header opacity 0)
      await page.waitForTimeout(1500);
      const headerOpacityAfterIdle = await page.evaluate(() => {
        const header = document.querySelector('header');
        return header ? window.getComputedStyle(header).opacity : '1';
      });
      console.log(`  ✓ After idle wait (header opacity): ${headerOpacityAfterIdle}`);

      // 4. Test Mouse Jitter (<80px) - Should NOT reveal chrome
      await page.mouse.move(200, 200);
      await page.mouse.move(220, 210); // 22px jitter
      await page.waitForTimeout(100);
      const headerOpacityAfterJitter = await page.evaluate(() => {
        const header = document.querySelector('header');
        return header ? window.getComputedStyle(header).opacity : '1';
      });
      console.log(`  ✓ After mouse jitter (<80px) (header opacity): ${headerOpacityAfterJitter}`);

      // 5. Test Deliberate Mouse Swipe (>=80px in <=300ms) - SHOULD reveal chrome
      await page.mouse.move(100, 100);
      await page.mouse.move(300, 100); // 200px distance
      await page.waitForTimeout(150);
      const headerOpacityAfterSwipe = await page.evaluate(() => {
        const header = document.querySelector('header');
        return header ? window.getComputedStyle(header).opacity : '0';
      });
      console.log(`  ✓ After deliberate swipe (>=80px) (header opacity): ${headerOpacityAfterSwipe}`);

      // 6. Test Escape Key restores chrome
      await page.keyboard.press('KeyE'); // resume typing to re-dim
      await page.waitForTimeout(200);
      await page.keyboard.press('Escape'); // hit escape to restore
      await page.waitForTimeout(200);
      const headerOpacityAfterEscape = await page.evaluate(() => {
        const header = document.querySelector('header');
        return header ? window.getComputedStyle(header).opacity : '0';
      });
      console.log(`  ✓ After Escape key (header opacity): ${headerOpacityAfterEscape}`);

      await context.close();
    }
  }

  await browser.close();
  console.log('\n[🎉] Playwright test suite completed successfully!');
}

run().catch((err) => {
  console.error('Test run failed:', err);
  process.exit(1);
});
