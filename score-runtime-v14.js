(() => {
  const RELEASE = "v14";
  const TRACE_KEY = "whtbb.trace.tail.v14";
  let traceTail = [];

  function rememberTrace(message) {
    const text = String(message ?? "");
    window.__whtbbTraceCount = (window.__whtbbTraceCount || 0) + 1;
    if (/SummaryScreen|MinigameScore|ResultScreen|ScoreUploading|STATE_POST_SCORE_COUNTING|curScore|combinedScore|totalScore/i.test(text)) {
      traceTail.push({ at: new Date().toISOString(), text: text.slice(0, 500) });
      traceTail = traceTail.slice(-80);
      try { localStorage.setItem(TRACE_KEY, JSON.stringify(traceTail)); } catch (_) {}
    }
    captureCandidateScore(text);
  }

  const originalStartGame = startGame;
  playBtn.removeEventListener("click", originalStartGame);

  startGame = async function startGameV14() {
    playBtn.disabled = true;
    setStatus("Loading game…");
    try {
      await registerSW();
      await loadScript(RUFFLE_PATH);
      await warmOfflineCache();

      const ruffle = window.RufflePlayer.newest();
      const player = ruffle.createPlayer();
      document.getElementById("player").replaceChildren(player);
      player.style.width = "100%";
      player.style.height = "100%";

      const api = player.ruffle();

      // Ruffle 0.3.0 forwards traceObserver only to an existing Flash instance.
      // Therefore the observer MUST be attached after load() has created it.
      await api.load(SWF_PATH);

      try {
        api.traceObserver = rememberTrace;
        window.__whtbbTraceObserverAttached = true;
      } catch (e) {
        window.__whtbbTraceObserverAttached = false;
        console.warn("Trace score hook unavailable after SWF load", e);
      }

      try {
        if (typeof api.addFSCommandHandler === "function") {
          api.addFSCommandHandler(parseFSCommand);
        }
      } catch (e) {
        console.warn("FSCommand score hook unavailable", e);
      }

      startScreen.hidden = true;
      setStatus(`Playing · score capture ${window.__whtbbTraceObserverAttached ? "ready" : "unavailable"}`);
      syncScores();
    } catch (e) {
      console.error(e);
      setStatus("Could not start", true);
      playBtn.disabled = false;
      alert("The game could not start. Check that the preserved SWF and local Ruffle files were included in this build.");
    }
  };

  playBtn.addEventListener("click", startGame);

  // Non-destructive parser self-test. It validates the real production bridge
  // logic without opening the modal or writing a leaderboard row.
  window.__whtbbPipelineSelfTest = function () {
    const sample = [
      "--SummaryScreen.uploadScore()--",
      "[MinigameScore: id=0 score=500 total=0]",
      "--SummaryScreen.uploadScore()--",
      "[MinigameScore: id=1 score=600 total=0]",
      "--SummaryScreen.uploadScore()--",
      "[MinigameScore: id=2 score=700 total=0]",
      "--SummaryScreen.uploadScore()--",
      "[MinigameScore: id=3 score=418 total=0]"
    ];
    const mini = sample.filter(x => /MinigameScore/i.test(x)).map(x => Number(x.match(/\bscore\s*=\s*(-?\d+)/i)?.[1]));
    return {
      release: RELEASE,
      observerLifecycle: "post-load",
      parserPass: mini.length === 4 && mini.every(Number.isInteger) && mini.reduce((a,b) => a+b, 0) === 2218,
      sampleTotal: mini.reduce((a,b) => a+b, 0),
      expectedTotal: 2218
    };
  };

  const selfTest = window.__whtbbPipelineSelfTest();
  if (!selfTest.parserPass) console.error("WHTBB score pipeline self-test failed", selfTest);
  else console.info("WHTBB score pipeline v14 self-test passed", selfTest);
})();
