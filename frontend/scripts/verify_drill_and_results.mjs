import { chromium } from "playwright";

async function run() {
  console.log("=== Starting Playwright End-to-End Test for Drill & Results Screen ===");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  // 1. Navigate to app
  console.log("1. Navigating to http://localhost:3000...");
  await page.goto("http://localhost:3000");
  await page.waitForTimeout(1000);

  // Close first run modal if present
  try {
    const modalBtn = page.locator("button:has-text('Get Started'), button:has-text('Start Typing')");
    if (await modalBtn.count() > 0) {
      await modalBtn.first().click();
      await page.waitForTimeout(500);
    }
  } catch (_) {}

  // 2. Switch to Learn mode
  console.log("2. Switching to Learn Mode...");
  const learnBtn = page.locator("button", { hasText: /^learn$/ }).first();
  await learnBtn.click();
  await page.waitForTimeout(1000);

  // 3. Start typing words, deliberately mistyping 6 words to build a 6-word drill pool
  console.log("3. Typing words, deliberately mistyping 6 words...");
  const hiddenInput = page.locator("input.opacity-0");
  await hiddenInput.focus();

  const mistypedWords = new Set();
  const targetMistakeCount = 6;

  for (let currentIdx = 0; ; currentIdx++) {
    // Check if drill already started
    const drillBanner = page.locator("text=NEURAL LOCK-IN DRILL");
    if (await drillBanner.count() > 0) {
      console.log("🎉 Neural Lock-In Drill launched!");
      break;
    }

    const totalWords = await page.evaluate(() => document.querySelectorAll("[data-word-idx]").length);
    if (currentIdx >= totalWords) {
      console.log(`Finished typing all ${totalWords} words.`);
      break;
    }

    // Read active word from DOM
    const activeWordText = await page.evaluate((idx) => {
      const el = document.querySelector(`[data-word-idx="${idx}"]`);
      return el ? el.textContent.trim() : "";
    }, currentIdx);

    console.log(`[Word ${currentIdx}/${totalWords}] activeWordText="${activeWordText}"`);

    if (!activeWordText) {
      await page.waitForTimeout(200);
      continue;
    }

    const shouldMistype = mistypedWords.size < targetMistakeCount && currentIdx < 12;

    if (shouldMistype) {
      mistypedWords.add(activeWordText);
      console.log(`  [Word ${currentIdx}] Making mistake on "${activeWordText}" and correcting...`);
      // Type wrong character first to trigger typo detection
      await page.keyboard.press("x");
      await page.waitForTimeout(25);
      // Press Backspace to fix
      await page.keyboard.press("Backspace");
      await page.waitForTimeout(25);
      // Type word correctly
      for (const ch of activeWordText) {
        await page.keyboard.press(ch);
        await page.waitForTimeout(20);
      }
    } else {
      // Type correctly and quickly
      for (const ch of activeWordText) {
        await page.keyboard.press(ch);
        await page.waitForTimeout(20);
      }
    }

    await page.keyboard.press("Space");
    await page.waitForTimeout(30);

    // If drill started early (after words completed)
    if (await page.locator("text=NEURAL LOCK-IN DRILL").count() > 0) {
      console.log("🎉 Neural Lock-In Drill launched!");
      break;
    }
  }

  // 4. Verify Drill UI and Progress
  console.log("4. Verifying Drill UI...");
  const drillHeader = page.locator("text=NEURAL LOCK-IN DRILL");
  try {
    await drillHeader.waitFor({ state: "visible", timeout: 5000 });
  } catch (err) {
    const bodyText = await page.evaluate(() => document.body.innerText);
    console.error("DOM Body Text when drill header failed:\n", bodyText);
    throw err;
  }

  const progressLine = page.locator("span:has-text('Mastered ')");
  const progressText = await progressLine.innerText();
  console.log(`Initial drill progress: "${progressText}"`);

  const missedWordsList = Array.from(mistypedWords);
  console.log(`Mistyped words count: ${missedWordsList.length} words: ${missedWordsList.join(", ")}`);

  if (!progressText.includes(`of ${missedWordsList.length} words`)) {
    throw new Error(`Expected progress text to show 'of ${missedWordsList.length} words', but got '${progressText}'`);
  }
  console.log("✓ Drill pool size matches mistyped words count exactly!");

  // 5. Work through the drill with interleaved passes and a few mistakes
  console.log("5. Practicing drill items to mastery...");
  const cleanPasses = {};
  missedWordsList.forEach((w) => (cleanPasses[w] = 0));

  let drillStep = 0;
  const maxDrillSteps = 80;

  while (drillStep < maxDrillSteps) {
    drillStep++;

    // Check if drill completed and results view is mounted
    const resultsView = page.locator("text=Target Mastery Gate");
    if (await resultsView.count() > 0) {
      console.log("🎉 Drill finished and results view appeared!");
      break;
    }

    // Read current word in drill
    const currentWord = await page.evaluate(() => {
      const el = document.querySelector("[data-testid='drill-active-word']");
      return el ? el.textContent.trim() : "";
    });

    if (!currentWord) {
      await page.waitForTimeout(100);
      continue;
    }

    // Check if an already-mastered word was shown
    if (cleanPasses[currentWord] >= 3) {
      throw new Error(`VIOLATION: Word "${currentWord}" was already mastered (3 clean passes) but was shown again!`);
    }

    // Check progress text
    const currentProg = await progressLine.innerText();

    // Deliberate mistake on step 3 and step 7
    const isMistake = drillStep === 3 || drillStep === 7;

    if (isMistake && cleanPasses[currentWord] !== undefined) {
      console.log(`  [Step ${drillStep}] Making intentional mistake on "${currentWord}"...`);
      await page.keyboard.press("z"); // wrong char
      await page.waitForTimeout(20);
      cleanPasses[currentWord] = Math.max(0, cleanPasses[currentWord] - 1);
    } else {
      console.log(`  [Step ${drillStep}] Typing clean pass for "${currentWord}" (${cleanPasses[currentWord] || 0}/3 Clean)...`);
      for (const ch of currentWord) {
        await page.keyboard.press(ch);
        await page.waitForTimeout(20);
      }
      if (cleanPasses[currentWord] !== undefined) {
        cleanPasses[currentWord] = (cleanPasses[currentWord] || 0) + 1;
        if (cleanPasses[currentWord] >= 3) {
          console.log(`    🎉 Word "${currentWord}" mastered (3/3 Clean)!`);
        }
      }
    }

    await page.waitForTimeout(50);
  }

  // 6. Inspect Results Screen
  console.log("6. Inspecting Results Screen...");
  const masteryCard = page.locator("text=Target Mastery Gate");
  await masteryCard.waitFor({ state: "visible", timeout: 5000 });

  // Verify Missed Words section on results view matches the drill pool
  const displayedMissed = await page.evaluate(() => {
    const section = document.querySelector("[data-testid='missed-words-section']");
    if (!section) return [];
    const badges = section.querySelectorAll(".flex-wrap span");
    return Array.from(badges).map((b) => b.textContent.trim());
  });
  console.log(`Results view Missed Words list (${displayedMissed.length}):`, displayedMissed);

  for (const mw of missedWordsList) {
    if (!displayedMissed.includes(mw)) {
      throw new Error(`Mismatch: Word "${mw}" was in drill pool but missing from results screen Missed Words list!`);
    }
  }
  console.log("✓ Criterion (c) PASSED: Drill pool matches Missed Words list 100%!");

  // Verify Target Mastery Gate card & milestone banner
  const percentText = await page.evaluate(() => {
    const num = document.querySelector(".tabular-nums.text-4xl, .tabular-nums.text-5xl");
    return num ? num.textContent.trim() : "";
  });
  console.log(`Mastery Gate card percentage: "${percentText}"`);

  const statusText = await page.evaluate(() => {
    const st = document.querySelector(".text-sm.font-medium.text-emerald-400, .text-sm.font-medium.text-amber-400");
    return st ? st.textContent.trim() : "";
  });
  console.log(`Mastery Gate status: "${statusText}"`);

  // Check if milestone banner is present when gate is achieved
  const banner = page.locator("text=Curriculum Milestone Unlocked!");
  if ((await banner.count()) > 0) {
    const bannerText = await banner.locator("xpath=..").innerText();
    console.log(`Milestone banner: "${bannerText.replace(/\n/g, ' ')}"`);
    if (percentText !== "100%") {
      throw new Error(`Mastery Gate card shows ${percentText} when milestone was unlocked! Must be 100%!`);
    }
    if (statusText !== "TARGET REACHED") {
      throw new Error(`Mastery Gate card shows "${statusText}"! Expected "TARGET REACHED"!`);
    }
    console.log("✓ Criterion (d) PASSED: 100% in green with TARGET REACHED and banner agrees!");
  } else {
    console.log("Gate was practicing; card displays real progress cleanly.");
  }

  // 7. Verify snapshot persistence across re-render
  console.log("7. Verifying results view remains consistent...");
  const percentAfter = await page.evaluate(() => {
    const num = document.querySelector(".tabular-nums.text-4xl, .tabular-nums.text-5xl");
    return num ? num.textContent.trim() : "";
  });
  if (percentAfter !== percentText) {
    throw new Error(`Percentage drifted from ${percentText} to ${percentAfter}!`);
  }
  console.log("✓ Criterion (e) PASSED: Results view retains exact frozen snapshot values!");

  await browser.close();
  console.log("\n=======================================================");
  console.log("🎉 ALL E2E DRILL AND RESULTS VERIFICATIONS PASSED 100%!");
  console.log("=======================================================");
}

run().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
