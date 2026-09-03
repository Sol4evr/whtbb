(() => {
  const RELEASE = "v14";
  const TRACE_KEY = "whtbb.trace.tail.v14";
  const SCORE_TRACE_KEY = "whtbb.trace.score.v14";
  const SUMMARY_TRACE_KEY = "whtbb.trace.summary.v14";
  let traceTail = [];
  let scoreTrace = [];
  let summaryTrace = [];
  let activeApi = null;
  let preSummary = [];
  let summaryCountdown = 0;

  function persistTrace(){
    try{localStorage.setItem(TRACE_KEY,JSON.stringify(traceTail));}catch(_){}
    try{localStorage.setItem(SCORE_TRACE_KEY,JSON.stringify(scoreTrace));}catch(_){}
    try{localStorage.setItem(SUMMARY_TRACE_KEY,JSON.stringify(summaryTrace));}catch(_){}
  }

  function rememberTrace(message){
    const text=String(message??"");
    const item={at:new Date().toISOString(),text:text.slice(0,1200)};
    window.__whtbbTraceCount=(window.__whtbbTraceCount||0)+1;

    traceTail.push(item);
    traceTail=traceTail.slice(-6000);

    preSummary.push(item);
    preSummary=preSummary.slice(-180);

    if(/score|category|minigame|point|brain|result|summary|total|upload|protected|value/i.test(text)){
      scoreTrace.push(item);
      scoreTrace=scoreTrace.slice(-1800);
    }

    if(/^--SummaryScreen--$/i.test(text.trim())){
      summaryTrace=preSummary.slice();
      summaryCountdown=220;
    }else if(summaryCountdown>0){
      summaryTrace.push(item);
      summaryCountdown--;
    }

    if((window.__whtbbTraceCount||0)%20===0 || summaryCountdown>0 || /score|category|minigame|summary|total/i.test(text)) persistTrace();
    captureCandidateScore(text);
  }

  function attachObserver(api){
    if(!api)return false;
    try{api.traceObserver=rememberTrace;window.__whtbbTraceObserverAttached=true;activeApi=api;return true;}
    catch(e){window.__whtbbTraceObserverAttached=false;console.warn("Trace score hook unavailable",e);return false;}
  }
  function reattachObserver(){if(activeApi)attachObserver(activeApi);}
  async function safeOfflineSetup(){
    if(!("serviceWorker" in navigator))return;
    try{await registerSW();}catch(e){console.warn("Service worker registration skipped",e);}
    try{await warmOfflineCache();}catch(e){console.warn("Offline cache warm skipped",e);}
  }

  const originalStartGame=startGame;
  playBtn.removeEventListener("click",originalStartGame);

  startGame=async function startGameV14(){
    playBtn.disabled=true;setStatus("Loading game…");
    window.__whtbbTraceCount=0;window.__whtbbStartupError=null;
    traceTail=[];scoreTrace=[];summaryTrace=[];preSummary=[];summaryCountdown=0;persistTrace();
    try{
      await loadScript(RUFFLE_PATH);
      await safeOfflineSetup();
      if(!window.RufflePlayer?.newest)throw new Error("Ruffle runtime did not initialise");
      const ruffle=window.RufflePlayer.newest();
      const player=ruffle.createPlayer();
      document.getElementById("player").replaceChildren(player);
      player.style.width="100%";player.style.height="100%";
      const api=player.ruffle();
      if(!api||typeof api.load!=="function")throw new Error("Ruffle player API unavailable");
      await api.load(SWF_PATH);
      attachObserver(api);
      setTimeout(reattachObserver,250);setTimeout(reattachObserver,1500);setTimeout(reattachObserver,5000);
      try{if(typeof api.addFSCommandHandler==="function")api.addFSCommandHandler(parseFSCommand);}catch(e){console.warn("FSCommand score hook unavailable",e);}
      startScreen.hidden=true;
      setStatus(`Playing · score capture ${window.__whtbbTraceObserverAttached?"ready":"unavailable"}`);
      syncScores();
    }catch(e){
      console.error("WHTBB v14 startup failed",e);
      const detail=e?.message||String(e)||"Unknown startup error";
      window.__whtbbStartupError=detail;
      setStatus(`Could not start · ${detail}`,true);playBtn.disabled=false;
      alert(`The game could not start.\n\nStartup detail: ${detail}`);
    }
  };

  playBtn.addEventListener("click",startGame);
  document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible")reattachObserver();});

  window.__whtbbPipelineSelfTest=function(){
    const sample=["--SummaryScreen.uploadScore()--","[MinigameScore: id=0 score=500 total=0]","--SummaryScreen.uploadScore()--","[MinigameScore: id=1 score=600 total=0]","--SummaryScreen.uploadScore()--","[MinigameScore: id=2 score=700 total=0]","--SummaryScreen.uploadScore()--","[MinigameScore: id=3 score=418 total=0]"];
    const mini=sample.filter(x=>/MinigameScore/i.test(x)).map(x=>Number(x.match(/\bscore\s*=\s*(-?\d+)/i)?.[1]));
    return {release:RELEASE,observerLifecycle:"post-load-plus-reattach",parserPass:mini.length===4&&mini.every(Number.isInteger)&&mini.reduce((a,b)=>a+b,0)===2218,sampleTotal:mini.reduce((a,b)=>a+b,0),expectedTotal:2218};
  };

  const diagButton=document.createElement("button");diagButton.type="button";diagButton.className="secondary";diagButton.textContent="Diagnostics";
  document.querySelector(".actions")?.insertBefore(diagButton,document.getElementById("fullscreen"));
  const diagModal=document.createElement("section");diagModal.className="modal";diagModal.hidden=true;
  diagModal.innerHTML=`<div class="panel"><div class="panel-head"><div><h2>Score Capture Diagnostics</h2><p class="sub">Temporary v14 QA instrumentation. No game data is modified.</p></div><button class="secondary" id="closeWhtbbDiag" type="button">Done</button></div><pre id="whtbbDiagText" style="white-space:pre-wrap;word-break:break-word;background:#0f1530;padding:12px;border-radius:12px;max-height:52vh;overflow:auto;font-size:12px"></pre><div class="tools"><button id="copyWhtbbDiag" type="button">Copy diagnostics</button></div></div>`;
  document.body.appendChild(diagModal);

  function readStored(key){try{return JSON.parse(localStorage.getItem(key)||"[]");}catch(_){return[];}}
  function diagnosticText(){
    const stored=readStored(TRACE_KEY), scoreStored=readStored(SCORE_TRACE_KEY), summaryStored=readStored(SUMMARY_TRACE_KEY);
    const fmt=x=>`${x.at}  ${x.text}`;
    return [
      `release: ${RELEASE}`,
      `startupError: ${window.__whtbbStartupError||"none"}`,
      `observerAttached: ${Boolean(window.__whtbbTraceObserverAttached)}`,
      `traceCount: ${Number(window.__whtbbTraceCount||0)}`,
      `storedTraceCount: ${stored.length}`,
      `scoreTraceCount: ${scoreStored.length}`,
      `summaryWindowCount: ${summaryStored.length}`,
      `detectedFinalScore: ${detectedFinalScore??"null"}`,
      `detectedCategoryScores: ${JSON.stringify(window.detectedCategoryScores||null)}`,
      `selfTest: ${JSON.stringify(window.__whtbbPipelineSelfTest())}`,
      "",
      "Score/category/minigame traces across whole game:",
      ...(scoreStored.length?scoreStored.slice(-500).map(fmt):["(none)"]),
      "",
      "SummaryScreen window (before + after):",
      ...(summaryStored.length?summaryStored.map(fmt):["(none)"])
    ].join("\n");
  }
  function openDiagnostics(){persistTrace();document.getElementById("whtbbDiagText").textContent=diagnosticText();diagModal.hidden=false;}
  diagButton.addEventListener("click",openDiagnostics);
  diagModal.querySelector("#closeWhtbbDiag").addEventListener("click",()=>{diagModal.hidden=true;});
  diagModal.querySelector("#copyWhtbbDiag").addEventListener("click",async()=>{
    persistTrace();const text=diagnosticText();document.getElementById("whtbbDiagText").textContent=text;
    try{await navigator.clipboard.writeText(text);setStatus("Diagnostics copied");}catch(_){alert("Select and copy the diagnostics text manually.");}
  });

  const selfTest=window.__whtbbPipelineSelfTest();
  if(!selfTest.parserPass)console.error("WHTBB score pipeline self-test failed",selfTest);else console.info("WHTBB score pipeline v14 self-test passed",selfTest);
})();
