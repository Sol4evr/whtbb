(() => {
  // Preservation-safe bridge: reconstruct the exact final score and four category
  // scores from traces the original SWF already emits. The SWF is not modified.
  let resultScreenSeen = false;
  let lastCurScore = null;
  let settleTimer = null;
  let lastTraceAt = 0;
  let uploadTraceArmed = false;
  let categoryScores = [];
  let categoryTimer = null;

  if (typeof captureCandidateScore !== "function" || typeof scheduleAutoPrompt !== "function") {
    console.warn("WHTBB score bridge: host score hooks unavailable");
    return;
  }

  const baseCapture = captureCandidateScore;

  function publishScore(score, delay = 150, categories = null) {
    const value = Number(score);
    if (!Number.isInteger(value) || value <= 0 || value > 999999999) return;
    detectedFinalScore = value;
    detectedScorePriority = Math.max(detectedScorePriority || 0, 10);
    if (Array.isArray(categories) && categories.length === 4) {
      detectedCategoryScores = {
        analysis: categories[0],
        calculation: categories[1],
        memory: categories[2],
        visual: categories[3]
      };
    }
    scheduleAutoPrompt(delay);
  }

  function resetCategoryCapture() {
    uploadTraceArmed = false;
    categoryScores = [];
    if (categoryTimer) clearTimeout(categoryTimer);
    categoryTimer = null;
  }

  function finishCategoryCapture() {
    if (categoryScores.length !== 4) return;
    const categories = categoryScores.slice();
    const total = categories.reduce((sum, value) => sum + value, 0);
    resetCategoryCapture();
    publishScore(total, 200, categories);
  }

  function armCategoryTimeout() {
    if (categoryTimer) clearTimeout(categoryTimer);
    categoryTimer = setTimeout(() => {
      if (categoryScores.length === 4) finishCategoryCapture();
      else resetCategoryCapture();
    }, 2500);
  }

  function armStableScore(delay = 1400) {
    if (!resultScreenSeen || !Number.isInteger(lastCurScore) || lastCurScore <= 0) return;
    if (settleTimer) clearTimeout(settleTimer);
    settleTimer = setTimeout(() => {
      if (Date.now() - lastTraceAt < 900) {
        armStableScore(900);
        return;
      }
      publishScore(lastCurScore, 150);
      resultScreenSeen = false;
      lastCurScore = null;
    }, delay);
  }

  captureCandidateScore = function whtbbCaptureFinalScore(message) {
    const text = String(message ?? "");
    baseCapture(message);

    // SummaryScreen.uploadScore() iterates category indexes 0..3 in the SWF's
    // authoritative order: Analysis, Calculation, Memory, Visual (Identify).
    if (/--SummaryScreen\.uploadScore\(\)--/i.test(text)) {
      if (!uploadTraceArmed) uploadTraceArmed = true;
      armCategoryTimeout();
      return;
    }

    if (uploadTraceArmed) {
      const mini = text.match(/\[MinigameScore:[^\]]*\bscore\s*=\s*(-?\d+)/i);
      if (mini) {
        const score = Number(mini[1]);
        if (Number.isInteger(score) && score >= 0 && score <= 999999999) {
          categoryScores.push(score);
          uploadTraceArmed = false;
          armCategoryTimeout();
          if (categoryScores.length === 4) finishCategoryCapture();
        } else {
          resetCategoryCapture();
        }
        return;
      }
    }

    // Fallbacks retain total-only detection if a different compatible build emits
    // result-state traces but not the four MinigameScore lines.
    if (/--ResultScreen--|showResultScreen/i.test(text)) {
      resultScreenSeen = true;
      lastTraceAt = Date.now();
      armStableScore(1800);
    }

    const cur = text.match(/\bcurScore\s*=\s*(\d+)/i);
    if (cur) {
      const value = Number(cur[1]);
      if (Number.isInteger(value) && value > 0 && value <= 999999999) {
        lastCurScore = value;
        lastTraceAt = Date.now();
        resultScreenSeen = true;
        armStableScore(1500);
      }
    }

    const total = text.match(/\b(?:_sumTotalScore|playerTotalScore|combinedScore|totalScore)\s*=\s*(\d+)/i);
    if (total) {
      const value = Number(total[1]);
      if (Number.isInteger(value) && value > 0 && value <= 999999999) {
        lastCurScore = value;
        lastTraceAt = Date.now();
        resultScreenSeen = true;
        armStableScore(800);
      }
    }

    if (/ScoreUploading|STATE_POST_SCORE_COUNTING/i.test(text)) {
      resultScreenSeen = true;
      lastTraceAt = Date.now() - 1000;
      armStableScore(250);
    }
  };

  console.info("WHTBB category-score bridge ready");
})();
