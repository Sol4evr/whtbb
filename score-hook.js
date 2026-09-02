(() => {
  // Preservation-safe bridge: use the original movie's own diagnostic traces to
  // detect the final stable result without modifying the checksum-verified SWF.
  let resultScreenSeen = false;
  let lastCurScore = null;
  let settleTimer = null;
  let lastTraceAt = 0;

  if (typeof captureCandidateScore !== "function" || typeof scheduleAutoPrompt !== "function") {
    console.warn("WHTBB score bridge: host score hooks unavailable");
    return;
  }

  const baseCapture = captureCandidateScore;

  function armStableScore(delay = 1400) {
    if (!resultScreenSeen || !Number.isInteger(lastCurScore) || lastCurScore <= 0) return;
    if (settleTimer) clearTimeout(settleTimer);
    settleTimer = setTimeout(() => {
      // Score counting emits repeated curScore traces. Only accept the value once
      // traces have gone quiet long enough to represent the completed result.
      if (Date.now() - lastTraceAt < 900) {
        armStableScore(900);
        return;
      }
      detectedFinalScore = lastCurScore;
      detectedScorePriority = Math.max(detectedScorePriority || 0, 5);
      scheduleAutoPrompt(150);
      resultScreenSeen = false;
      lastCurScore = null;
    }, delay);
  }

  captureCandidateScore = function whtbbCaptureFinalScore(message) {
    const text = String(message ?? "");
    baseCapture(message);

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
        // Some builds start score counting before the ResultScreen marker reaches
        // the observer; seeing curScore is itself a strong result-screen signal.
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

    if (/--SummaryScreen\.uploadScore\(\)--|ScoreUploading|STATE_POST_SCORE_COUNTING/i.test(text)) {
      resultScreenSeen = true;
      lastTraceAt = Date.now() - 1000;
      armStableScore(250);
    }
  };

  console.info("WHTBB result-screen score bridge ready");
})();
