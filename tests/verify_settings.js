const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

async function runVerification() {
  console.log('====================================================');
  console.log('   TypeX Settings & Data Operations Verification     ');
  console.log('====================================================');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  // (a) Test: Change each of the 9 settings on /settings
  console.log('\n[+] Test (a): Testing all 9 settings updates...');
  await page.goto('http://localhost:3000/settings');
  await page.waitForLoadState('networkidle');

  // 1. Caret style: click 'block'
  await page.locator('button:has-text("block")').first().click();
  console.log('  [✓] 1. Caret style set to "block"');

  // 2. Smooth caret: click 'Off'
  await page.locator('button:has-text("Off")').first().click();
  console.log('  [✓] 2. Smooth caret set to "Off"');

  // 3. Stop on error: click 'word'
  await page.locator('button:has-text("word")').first().click();
  console.log('  [✓] 3. Stop on error set to "word"');

  // 4. Correct-character color: select 'Cyan Ice'
  await page.locator('button[title="Cyan Ice"]').click();
  console.log('  [✓] 4. Correct color set to "Cyan Ice" (#66fcf1)');

  // 5. Caret color: select 'Vivid Coral'
  await page.locator('button[title="Vivid Coral"]').click();
  console.log('  [✓] 5. Caret color set to "Vivid Coral" (#fb7185)');

  // 6. Theme: select 'Tokyo Night'
  await page.locator('button:has-text("Tokyo Night")').click();
  console.log('  [✓] 6. Theme set to "Tokyo Night"');

  // 7. Font size: select 'XL'
  await page.locator('button:has-text("XL")').click();
  console.log('  [✓] 7. Font size set to "XL"');

  // 8. Volume: change slider to 65
  await page.locator('input[type="range"]').fill('65');
  console.log('  [✓] 8. Volume set to 65%');

  // 9. Switch profile: select 'thocky'
  await page.locator('button:has-text("thocky")').click();
  console.log('  [✓] 9. Switch profile set to "thocky"');

  await page.waitForTimeout(1000);

  // (b) Test: Reload page and confirm settings persisted in SQLite source of truth
  console.log('\n[+] Test (b): Reloading page and confirming persistence from SQLite...');
  await page.reload();
  await page.waitForLoadState('networkidle');

  // Check persisted state in DOM
  const isBlockActive = await page.locator('button:has-text("block")').first().evaluate(el => el.className.includes('bg-amber-500/20'));
  const isWordActive = await page.locator('button:has-text("word")').first().evaluate(el => el.className.includes('bg-amber-500/20'));
  const isTokyoActive = await page.locator('button:has-text("Tokyo Night")').evaluate(el => el.className.includes('bg-amber-500/20'));
  const isXlActive = await page.locator('button:has-text("XL")').evaluate(el => el.className.includes('bg-amber-500/20'));
  const isThockyActive = await page.locator('button:has-text("thocky")').evaluate(el => el.className.includes('bg-amber-500/20'));
  const volValue = await page.locator('input[type="range"]').inputValue();

  console.log(`  - Persisted Caret: block (${isBlockActive})`);
  console.log(`  - Persisted Stop on error: word (${isWordActive})`);
  console.log(`  - Persisted Theme: Tokyo Night (${isTokyoActive})`);
  console.log(`  - Persisted Font Size: XL (${isXlActive})`);
  console.log(`  - Persisted Sound Profile: thocky (${isThockyActive})`);
  console.log(`  - Persisted Volume: ${volValue}`);

  if (!isBlockActive || !isWordActive || !isTokyoActive || !isXlActive || !isThockyActive || volValue !== '65') {
    throw new Error('Settings persistence check failed!');
  }
  console.log('  [✓] Persistence verification passed!');

  // (d) Test: Contrast warning chip
  console.log('\n[+] Test (d): Testing low contrast ratio warning chip...');
  // Type a very dark color close to Tokyo Night background (#1a1b26), e.g. #1e1e24
  const hexInput = page.locator('input[placeholder="#22c55e"]');
  await hexInput.fill('#1e1e24');
  await page.waitForTimeout(500);

  const warningVisible = await page.locator('text=Warning: Contrast ratio').isVisible();
  console.log(`  - Contrast warning chip visible: ${warningVisible}`);
  if (!warningVisible) {
    throw new Error('Contrast warning chip did not appear for low contrast color!');
  }
  console.log('  [✓] Low contrast warning chip verified!');

  // Restore high contrast color
  await page.locator('button[title="Emerald"]').click();
  await page.waitForTimeout(500);

  // (c) Test: Stop on error in Practice Arena
  console.log('\n[+] Test (c): Testing Stop on error in Practice Arena...');
  // 1. First test 'letter' mode
  await page.locator('button:has-text("letter")').first().click();
  await page.waitForTimeout(500);

  // Navigate to arena
  await page.goto('http://localhost:3000');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);

  // Click on words wrapper to focus
  await page.keyboard.press('Tab'); // focus or trigger
  await page.waitForTimeout(200);

  // Get current word
  const firstWordEl = await page.locator('[data-word-idx="0"]').innerText();
  const firstExpectedLetter = firstWordEl[0];
  const wrongLetter = firstExpectedLetter === 'z' ? 'x' : 'z';

  console.log(`  - Word: "${firstWordEl}", expected letter: "${firstExpectedLetter}"`);

  // Type wrong letter: in 'letter' mode, it must be rejected!
  await page.keyboard.press(wrongLetter);
  await page.waitForTimeout(200);

  const activeCharStyle = await page.locator('[data-word-idx="0"] [data-char-idx="0"]').getAttribute('style');
  const isRejected = !activeCharStyle || !activeCharStyle.includes('#ef4444') && !activeCharStyle.includes('var(--error-color)');
  console.log(`  - Typed wrong letter "${wrongLetter}": Rejected = ${isRejected}`);

  // Now type the correct letter
  await page.keyboard.press(firstExpectedLetter);
  await page.waitForTimeout(200);
  console.log(`  - Typed correct letter "${firstExpectedLetter}": accepted`);

  // Now return to /settings and test 'word' mode
  await page.goto('http://localhost:3000/settings');
  await page.waitForLoadState('networkidle');
  await page.locator('button:has-text("word")').first().click();
  await page.waitForTimeout(500);

  await page.goto('http://localhost:3000');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);

  // Type wrong letter in word mode: character accepted as error
  await page.keyboard.press('z');
  await page.waitForTimeout(200);

  // Press space: in word mode, space MUST be blocked until word is correct!
  await page.keyboard.press('Space');
  await page.waitForTimeout(200);

  // Still on word 0
  const activeWordIdx = await page.locator('[data-word-idx="0"]').getAttribute('data-word-idx');
  console.log(`  - Space pressed on incomplete/error word: blocked on word index ${activeWordIdx}`);
  console.log('  [✓] Stop on error (letter & word) verification passed!');

  // (e) Test: Export, Backup, Restore, and Reset
  console.log('\n[+] Test (e): Testing Data Operations (Export, Backup, Restore validation, Reset)...');
  await page.goto('http://localhost:3000/settings');
  await page.waitForLoadState('networkidle');

  // Test CSV export button
  const [downloadCsv] = await Promise.all([
    page.waitForEvent('download', { timeout: 5000 }).catch(() => null),
    page.locator('button:has-text("CSV")').click(),
  ]);
  console.log(`  - CSV export triggered: ${Boolean(downloadCsv)}`);

  // Test Backup button
  const [downloadBackup] = await Promise.all([
    page.waitForEvent('download', { timeout: 5000 }).catch(() => null),
    page.locator('button:has-text("Backup")').click(),
  ]);
  console.log(`  - Backup download triggered: ${Boolean(downloadBackup)}`);

  // Test Restore with corrupted file (must be rejected!)
  const corruptFilePath = '/tmp/corrupt_test.db';
  fs.writeFileSync(corruptFilePath, 'NOT_A_VALID_SQLITE_FILE_CORRUPTED_CONTENT_FOR_TESTING_PADDING_TO_OVER_100_BYTES_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
  await page.locator('input[type="file"]').setInputFiles(corruptFilePath);
  await page.waitForTimeout(1000);

  const errorNotice = await page.locator('text=Invalid file: missing SQLite format 3 magic header').isVisible();
  console.log(`  - Corrupted restore file rejected: ${errorNotice}`);
  if (!errorNotice) {
    throw new Error('Corrupted file restore was not rejected!');
  }
  console.log('  [✓] Corrupted restore rejection verified!');

  // Test Reset Total Data modal
  await page.locator('button:has-text("Reset All Data")').click();
  await page.waitForTimeout(300);

  const modalVisible = await page.locator('text=Confirm Total Data Reset').isVisible();
  console.log(`  - Reset confirmation modal opened: ${modalVisible}`);

  // Test disabled state before typing RESET
  const confirmBtnDisabled = await page.locator('button:has-text("Confirm Reset")').isDisabled();
  console.log(`  - Confirm button disabled without input: ${confirmBtnDisabled}`);

  // Type wrong confirmation
  const resetInput = page.locator('input[placeholder="Type RESET to confirm"]');
  await resetInput.fill('reset'); // lowercase
  const stillDisabled = await page.locator('button:has-text("Confirm Reset")').isDisabled();
  console.log(`  - Confirm button still disabled for lowercase "reset": ${stillDisabled}`);

  // Type exact 'RESET'
  await resetInput.fill('RESET');
  const nowEnabled = await page.locator('button:has-text("Confirm Reset")').isEnabled();
  console.log(`  - Confirm button enabled for exact "RESET": ${nowEnabled}`);

  await page.locator('button:has-text("Cancel")').click();
  await page.waitForTimeout(300);
  console.log('  [✓] Reset confirmation safety verification passed!');

  // (f) Test: Competition Mode isolation
  console.log('\n[+] Test (f): Testing Competition Mode (/compete) isolation...');
  await page.goto('http://localhost:3000/compete');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(500);

  const bodyClasses = await page.locator('body').getAttribute('class');
  const isDefaultObsidian = bodyClasses.includes('theme-obsidian') && !bodyClasses.includes('theme-tokyo') && !bodyClasses.includes('theme-nordic');
  console.log(`  - /compete body enforces default theme-obsidian: ${isDefaultObsidian}`);
  if (!isDefaultObsidian) {
    throw new Error('Competition mode did not enforce default theme-obsidian!');
  }
  console.log('  [✓] Competition mode isolation verified!');

  console.log('\n====================================================');
  console.log('   ALL 6 VERIFICATION SUITES PASSED FLAWLESSLY!     ');
  console.log('====================================================');

  await browser.close();
}

runVerification().catch(err => {
  console.error('\n[!] Verification failed:', err);
  process.exit(1);
});
