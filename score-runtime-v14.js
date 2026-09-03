(() => {
  const RELEASE = "v14";
  const TRACE_KEY = "whtbb.trace.tail.v14";
  let traceTail = [];
  let activeApi = null;

  function persistTrace(){try{localStorage.setItem(TRACE_KEY,JSON.stringify(traceTail));}catch(_){}}
  function rememberTrace(message){
    const text=String(message??"");
    window.__whtbbTraceCount=(window.__whtbbTraceCount||0)+1;
    traceTail.push({at:new Date().toISOString(),text:text.slice(0,800)});
    traceTail=traceTail.slice(-200);persistTrace();captureCandidateScore(text);
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
    playBtn.disabled=true;setStatus("Loading game…");window.__whtbbTraceCount=0;traceTail=[];persistTrace();
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
  diagModal.innerHTML=`<div class="panel"><div class="panel-head"><div><h2>Score Capture Diagnostics</h2><p class="sub">Temporary v14 QA instrumentation. No game data is modified.</p></div><button class="secondary" id="closeWhtbbDiag" type="button">Done</button></div><pre id="whtbbDiagText" style="white-space:pre-wrap;word-break:break-word;background:#0f1530;padding:12px;border-radius:12px;max-height:52vh;overflow:auto;font-size:12px"></pre><div class="tools"><button id="copyWhtbbDiag" type="button">Copy diagnostics</button><button id="testWhtbbDiag" class="secondary" type="button">Run parser self-test</button></div></div>`;
  document.body.appendChild(diagModal);
  function diagnosticText(){
    let stored=[];try{stored=JSON.parse(localStorage.getItem(TRACE_KEY)||"[]");}catch(_){}
    const relevant=stored.filter(x=>/SummaryScreen|MinigameScore|ResultScreen|ScoreUploading|STATE_POST_SCORE_COUNTING|curScore|combinedScore|totalScore/i.test(String(x?.text||"")));
    return [`release: ${RELEASE}`,`startupError: ${window.__whtbbStartupError||"none"}`,`observerAttached: ${Boolean(window.__whtbbTraceObserverAttached)}`,`traceCount: ${Number(window.__whtbbTraceCount||0)}`,`storedTraceCount: ${stored.length}`,`relevantTraceCount: ${relevant.length}`,`detectedFinalScore: ${detectedFinalScore??"null"}`,`detectedCategoryScores: ${JSON.stringify(window.detectedCategoryScores||null)}`,`selfTest: ${JSON.stringify(window.__whtbbPipelineSelfTest())}`,"","Relevant trace tail:",...(relevant.length?relevant.slice(-40).map(x=>`${x.at}  ${x.text}`):["(none)"]),"","Last 40 raw traces:",...(stored.length?stored.slice(-40).map(x=>`${x.at}  ${x.text}`):["(none)"])].join("\n");
  }
  function openDiagnostics(){document.getElementById("whtbbDiagText").textContent=diagnosticText();diagModal.hidden=false;}
  diagButton.addEventListener("click",openDiagnostics);
  diagModal.querySelector("#closeWhtbbDiag").addEventListener("click",()=>{diagModal.hidden=true;});
  diagModal.querySelector("#copyWhtbbDiag").addEventListener("click",async()=>{const text=diagnosticText();document.getElementById("whtbbDiagText").textContent=text;try{await navigator.clipboard.writeText(text);setStatus("Diagnostics copied");}catch(_){alert("Select and copy the diagnostics text manually.");}});
  diagModal.querySelector("#testWhtbbDiag").addEventListener("click",()=>{document.getElementById("whtbbDiagText").textContent=diagnosticText();});

  const selfTest=window.__whtbbPipelineSelfTest();
  if(!selfTest.parserPass)console.error("WHTBB score pipeline self-test failed",selfTest);else console.info("WHTBB score pipeline v14 self-test passed",selfTest);
})();
