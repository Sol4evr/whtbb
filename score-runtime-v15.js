(() => {
  const RELEASE = "v15.0.0";
  const LOCAL_KEY = "whtbb.localLeaderboard.v15";
  const DELETE_QUEUE_KEY = "whtbb.deleteQueue.v15";
  const RESET_KEY = "whtbb.storageReset.v15";
  const CATEGORY_DEFS = [
    {key:"score", label:"Total", icon:"🏆"},
    {key:"analysis", label:"Analysis", icon:"🔎"},
    {key:"calculation", label:"Calculation", icon:"🧮"},
    {key:"memory", label:"Memory", icon:"🧠"},
    {key:"visual", label:"Visual", icon:"👁️"}
  ];

  let activeMetric = "score";
  let capturedScores = null;
  let activeApi = null;
  let syncLock = null;
  let openedSwipe = null;

  function resetLegacyStorageOnce(){
    try{
      if(localStorage.getItem(RESET_KEY)) return;
      ["whtbb.localLeaderboard.v1","whtbb.localLeaderboard.v2","whtbb.cloudResync.v11","whtbb.trace.tail.v14","whtbb.trace.score.v14","whtbb.trace.summary.v14"].forEach(k=>localStorage.removeItem(k));
      localStorage.setItem(LOCAL_KEY,"[]");
      localStorage.setItem(DELETE_QUEUE_KEY,"[]");
      localStorage.setItem(RESET_KEY,new Date().toISOString());
    }catch(_){ }
  }
  resetLegacyStorageOnce();

  readScores = function readV15Scores(){
    try{
      const rows=JSON.parse(localStorage.getItem(LOCAL_KEY)||"[]");
      return Array.isArray(rows)?rows.filter(r=>r&&validScore(r.score)!==null):[];
    }catch(_){return[]}
  };
  writeScores = function writeV15Scores(rows){
    try{localStorage.setItem(LOCAL_KEY,JSON.stringify((rows||[]).slice(0,300)));}catch(_){ }
  };

  function readDeleteQueue(){try{const q=JSON.parse(localStorage.getItem(DELETE_QUEUE_KEY)||"[]");return Array.isArray(q)?q:[]}catch(_){return[]}}
  function writeDeleteQueue(q){try{localStorage.setItem(DELETE_QUEUE_KEY,JSON.stringify((q||[]).slice(-100)))}catch(_){}}

  function categoryObject(s){
    const vals=[s?.analysis,s?.calculation,s?.memory,s?.visual].map(validScore);
    if(vals.some(v=>v===null)) return null;
    return {analysis:vals[0],calculation:vals[1],memory:vals[2],visual:vals[3]};
  }
  function completeRecord(s){
    const total=validScore(s?.score), cat=categoryObject(s);
    return total!==null&&cat&&cat.analysis+cat.calculation+cat.memory+cat.visual===total;
  }
  function metricValue(s,key){return Number(key==="score"?s.score:s[key])||0}

  function mergedV15Scores(){
    const local=readScores();
    const localById=new Map(local.map(r=>[r.client_id,r]));
    const map=new Map();
    for(const s of [...cloudScores,...local]){
      const localCopy=localById.get(s.client_id);
      const item={
        name:s.name||s.player_name||"Player",score:Number(s.score),
        analysis:Number(s.analysis??s.analysis_score),calculation:Number(s.calculation??s.calculation_score),
        memory:Number(s.memory??s.memory_score),visual:Number(s.visual??s.visual_score),
        date:s.date||s.played_at||new Date().toISOString(),client_id:s.client_id,
        source:"automatic",delete_token:localCopy?.delete_token||s.delete_token||null
      };
      if(!completeRecord(item)) continue;
      const key=item.client_id||`${item.name}|${item.score}|${item.date}`;
      if(!map.has(key)) map.set(key,item);
      else if(item.delete_token) map.set(key,{...map.get(key),delete_token:item.delete_token});
    }
    return [...map.values()];
  }
  mergedScores = mergedV15Scores;

  const style=document.createElement("style");
  style.textContent=`
    .v15-filters{display:flex;gap:7px;overflow-x:auto;padding:2px 0 12px;scrollbar-width:none}.v15-filters::-webkit-scrollbar{display:none}
    .v15-filter{flex:0 0 auto;background:#252e55;color:#dce3ff;border:1px solid #394677;min-height:36px;padding:7px 11px;border-radius:999px;font-size:12px}
    .v15-filter.active{background:var(--accent);color:#171300;border-color:var(--accent)}
    .v15-swipe{position:relative;overflow:hidden;border-radius:13px}.v15-delete-under{position:absolute;right:0;top:0;bottom:0;width:88px;border-radius:0 13px 13px 0;background:#8d2f39;color:white;display:grid;place-items:center;padding:0;font-size:12px}
    .v15-swipe .score-row{position:relative;z-index:2;transition:transform .18s ease;touch-action:pan-y;background:var(--panel2)}
    .v15-swipe.open .score-row{transform:translateX(-88px)}
    .v15-rank-value{display:flex;align-items:center;gap:5px;font-weight:900;font-size:20px;white-space:nowrap}.v15-metric-label{display:block;color:var(--muted);font-size:10px;font-weight:700;text-align:right;margin-top:2px}
    .v15-cats{display:flex;gap:5px;flex-wrap:wrap;margin-top:6px}.v15-cat{font-size:10px;padding:3px 6px;border-radius:7px;background:#111831;color:#dbe2ff;white-space:nowrap}
    .v15-trash{background:transparent;color:#ffb4ba;border:0;min-height:34px;padding:5px 7px;font-size:16px;margin-left:4px}
    .v15-points-wrap{display:flex;align-items:center;justify-content:flex-end}.v15-no-delete{opacity:.35}
    #scoreForm.v15-auto-form{grid-template-columns:1.3fr repeat(5,minmax(88px,1fr)) auto}.v15-score-input{min-width:82px}
    .v15-version{position:fixed;bottom:max(env(safe-area-inset-bottom),5px);left:50%;transform:translateX(-50%);z-index:8;color:rgba(214,221,246,.5);font-size:10px;letter-spacing:.04em;pointer-events:none;white-space:nowrap;text-shadow:0 1px 2px #000}
    @media(max-width:900px){#scoreForm.v15-auto-form{grid-template-columns:1fr 1fr}#scoreForm.v15-auto-form button[type=submit]{grid-column:1/-1}.v15-trash{display:none}.v15-version{font-size:9px}}
  `;
  document.head.appendChild(style);

  function ensureVersionFooter(){
    let footer=document.getElementById("releaseVersion");
    if(!footer){footer=document.createElement("div");footer.id="releaseVersion";footer.className="v15-version";document.body.appendChild(footer)}
    footer.textContent=`WHTBB · ${RELEASE}`;
  }
  ensureVersionFooter();

  function ensureFilters(){
    let filters=document.getElementById("scoreFilters");
    if(filters) return filters;
    filters=document.createElement("div");filters.id="scoreFilters";filters.className="v15-filters";
    filters.innerHTML=CATEGORY_DEFS.map(d=>`<button type="button" class="v15-filter${d.key===activeMetric?" active":""}" data-metric="${d.key}">${d.icon} ${d.label}</button>`).join("");
    scoreList.parentElement.insertBefore(filters,scoreList);
    filters.addEventListener("click",e=>{
      const b=e.target.closest("[data-metric]");if(!b)return;
      activeMetric=b.dataset.metric;
      filters.querySelectorAll(".v15-filter").forEach(x=>x.classList.toggle("active",x.dataset.metric===activeMetric));
      renderScores();
    });
    return filters;
  }

  function rowCats(s){return `<div class="v15-cats"><span class="v15-cat">🔎 ${s.analysis.toLocaleString()}</span><span class="v15-cat">🧮 ${s.calculation.toLocaleString()}</span><span class="v15-cat">🧠 ${s.memory.toLocaleString()}</span><span class="v15-cat">👁️ ${s.visual.toLocaleString()}</span><span class="v15-cat">🏆 ${s.score.toLocaleString()}</span></div>`}
  function closeSwipe(){if(openedSwipe){openedSwipe.classList.remove("open");openedSwipe=null}}

  renderScores = function renderV15Scores(){
    ensureFilters();
    const metric=CATEGORY_DEFS.find(d=>d.key===activeMetric)||CATEGORY_DEFS[0];
    const rows=mergedV15Scores().sort((a,b)=>metricValue(b,activeMetric)-metricValue(a,activeMetric)||b.score-a.score||String(b.date).localeCompare(String(a.date)));
    if(!rows.length){scoreList.innerHTML='<div class="empty">No scores yet. Complete a full game and your total plus all four category scores will be captured automatically.</div>';return}
    scoreList.innerHTML=rows.slice(0,100).map((s,i)=>{
      const canDelete=Boolean(s.delete_token);
      const deleteButton=canDelete?`<button class="v15-trash" type="button" data-delete="${esc(s.client_id)}" title="Delete score">🗑️</button>`:`<span class="v15-trash v15-no-delete" title="Saved on another device">🗑️</span>`;
      return `<div class="v15-swipe" data-client="${esc(s.client_id)}"><button class="v15-delete-under" type="button" data-delete="${esc(s.client_id)}" ${canDelete?"":"disabled"}>Delete</button><div class="score-row"><div class="rank">${i<3?["🏆","🥈","🥉"][i]:`#${i+1}`}</div><div class="who"><strong>${esc(s.name)}</strong><small>${new Date(s.date).toLocaleString()}</small>${rowCats(s)}</div><div class="v15-points-wrap"><div><div class="v15-rank-value"><span>${metric.icon}</span><span>${metricValue(s,activeMetric).toLocaleString()}</span></div><span class="v15-metric-label">${metric.label}</span></div>${deleteButton}</div></div></div>`;
    }).join("");
    bindSwipeRows();
  };

  function bindSwipeRows(){
    scoreList.querySelectorAll(".v15-swipe").forEach(shell=>{
      const row=shell.querySelector(".score-row");let sx=0,sy=0,dx=0,tracking=false;
      row.addEventListener("touchstart",e=>{if(e.touches.length!==1)return;closeSwipe();sx=e.touches[0].clientX;sy=e.touches[0].clientY;dx=0;tracking=true;},{passive:true});
      row.addEventListener("touchmove",e=>{if(!tracking)return;const x=e.touches[0].clientX-sx,y=e.touches[0].clientY-sy;if(Math.abs(y)>Math.abs(x)){tracking=false;return}dx=Math.min(0,Math.max(-100,x));row.style.transform=`translateX(${dx}px)`;},{passive:true});
      row.addEventListener("touchend",()=>{if(!tracking){row.style.transform="";return}tracking=false;row.style.transform="";if(dx<-42){shell.classList.add("open");openedSwipe=shell}else shell.classList.remove("open")},{passive:true});
    });
  }

  async function sha256Hex(text){
    if(!globalThis.crypto?.subtle) throw new Error("Secure browser cryptography unavailable");
    const data=new TextEncoder().encode(text);const digest=await crypto.subtle.digest("SHA-256",data);
    return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,"0")).join("");
  }
  function randomToken(){
    const bytes=new Uint8Array(32);crypto.getRandomValues(bytes);return [...bytes].map(b=>b.toString(16).padStart(2,"0")).join("");
  }

  async function cloudFetch(){
    const rows=await api("scores?select=player_name,score,analysis_score,calculation_score,memory_score,visual_score,played_at,client_id,source&order=played_at.desc&limit=200");
    cloudScores=(rows||[]).map(r=>({name:r.player_name,score:Number(r.score),analysis:Number(r.analysis_score),calculation:Number(r.calculation_score),memory:Number(r.memory_score),visual:Number(r.visual_score),date:r.played_at,client_id:r.client_id,source:r.source})).filter(completeRecord);
    renderScores();return true;
  }
  loadCloudScores=cloudFetch;

  uploadRecord = async function uploadV15Record(r){
    if(!completeRecord(r)||!r.delete_token) return false;
    const deleteHash=await sha256Hex(r.delete_token);
    await api("scores?on_conflict=client_id",{method:"POST",headers:{Prefer:"resolution=ignore-duplicates,return=minimal"},body:JSON.stringify({player_name:r.name,score:r.score,analysis_score:r.analysis,calculation_score:r.calculation,memory_score:r.memory,visual_score:r.visual,played_at:r.date,client_id:r.client_id,source:"automatic",delete_token_hash:deleteHash})});
    return true;
  };

  async function flushDeleteQueue(){
    const q=readDeleteQueue();if(!q.length)return;
    const remaining=[];
    for(const item of q){
      try{await api(`scores?client_id=eq.${encodeURIComponent(item.client_id)}`,{method:"DELETE",headers:{"x-score-delete-token":item.delete_token,Prefer:"return=minimal"}})}catch(_){remaining.push(item)}
    }
    writeDeleteQueue(remaining);
  }

  syncScores = async function syncV15Scores(){
    if(syncLock)return syncLock;
    syncLock=(async()=>{
      await flushDeleteQueue();
      const local=readScores();let changed=false;
      for(const r of local){if(r.synced)continue;try{if(await uploadRecord(r)){r.synced=true;changed=true}}catch(e){console.warn("Score upload deferred",e)}}
      if(changed)writeScores(local);
      try{await cloudFetch();setStatus(navigator.onLine?"Online · cloud synced":"Offline · scores queued");return true}catch(e){console.warn("Leaderboard refresh failed",e);renderScores();return false}
    })();
    try{return await syncLock}finally{syncLock=null}
  };

  saveScore = async function saveV15Score(name,score,source){
    const cat=categoryObject(window.detectedCategoryScores||{});const total=validScore(score);
    if(source!=="automatic"||!cat||total===null||cat.analysis+cat.calculation+cat.memory+cat.visual!==total) throw new Error("Incomplete automatic score");
    const record={name:String(name).slice(0,30),score:total,...cat,date:new Date().toISOString(),source:"automatic",client_id:uid(),delete_token:randomToken(),synced:false};
    const local=readScores();local.push(record);writeScores(local);renderScores();
    try{if(await uploadRecord(record)){record.synced=true;writeScores(readScores().map(r=>r.client_id===record.client_id?record:r));await cloudFetch()}}catch(e){console.warn("Score saved locally; cloud sync deferred",e)}
    return record;
  };

  async function deleteRecord(clientId){
    const local=readScores();const owned=local.find(r=>r.client_id===clientId&&r.delete_token);
    if(!owned){alert("This score was saved on another device. For security, delete it from the device that originally saved it.");return}
    if(!confirm(`Delete ${owned.name}'s ${owned.score.toLocaleString()} score?`))return;
    writeScores(local.filter(r=>r.client_id!==clientId));
    cloudScores=cloudScores.filter(r=>r.client_id!==clientId);
    const q=readDeleteQueue();q.push({client_id:clientId,delete_token:owned.delete_token});writeDeleteQueue(q);renderScores();
    try{await flushDeleteQueue();await cloudFetch();setStatus("Score deleted")}catch(_){setStatus("Deleted locally · cloud deletion queued")}
  }
  scoreList.addEventListener("click",e=>{const b=e.target.closest("[data-delete]");if(!b||b.disabled)return;deleteRecord(b.dataset.delete)});

  function ensureAutoFields(){
    const form=document.getElementById("scoreForm"),button=form?.querySelector('button[type="submit"]');if(!form||!button)return;
    form.classList.add("v15-auto-form");
    const defs=[["analysisScore","🔎 Analysis"],["calculationScore","🧮 Calculation"],["memoryScore","🧠 Memory"],["visualScore","👁️ Visual"]];
    for(const [id,label] of defs){if(document.getElementById(id))continue;const input=document.createElement("input");input.id=id;input.type="number";input.readOnly=true;input.className="v15-score-input";input.placeholder=label;input.setAttribute("aria-label",label);form.insertBefore(input,button)}
  }
  function fillAutoFields(total,cat){
    ensureAutoFields();const values={brainScore:total,analysisScore:cat.analysis,calculationScore:cat.calculation,memoryScore:cat.memory,visualScore:cat.visual};
    for(const [id,val] of Object.entries(values)){const el=document.getElementById(id);if(el){el.value=String(val);el.readOnly=true}}
  }

  openScores = function openV15Scores(prefillScore=null,isAuto=false){
    ensureFilters();const form=document.getElementById("scoreForm");
    autoEntryMode=Boolean(isAuto&&capturedScores&&Number(prefillScore)===capturedScores.score);
    playerName.value=localStorage.getItem(NAME_KEY)||"";
    if(autoEntryMode){
      form.hidden=false;ensureAutoFields();fillAutoFields(capturedScores.score,capturedScores);
      scoreTitle.textContent="Save your score";
      scoreSub.innerHTML=`Captured automatically · 🏆 <strong>${capturedScores.score.toLocaleString()}</strong> · 🔎 ${capturedScores.analysis.toLocaleString()} · 🧮 ${capturedScores.calculation.toLocaleString()} · 🧠 ${capturedScores.memory.toLocaleString()} · 👁️ ${capturedScores.visual.toLocaleString()}. Enter your name to save.`;
    }else{
      form.hidden=true;scoreTitle.textContent="Shared Leaderboard";scoreSub.textContent="Rank by total score or any of the four brain categories.";
    }
    renderScores();modal.hidden=false;syncScores();
    if(autoEntryMode)setTimeout(()=>{playerName.focus();if(playerName.value)playerName.select()},50);
  };
  closeScores = function closeV15Scores(){modal.hidden=true;autoEntryMode=false;document.getElementById("scoreForm").hidden=false;brainScore.readOnly=false;closeSwipe()};

  // Replace the legacy submit handler without retaining its manual-entry path.
  const oldForm=document.getElementById("scoreForm");
  const newForm=oldForm.cloneNode(true);oldForm.replaceWith(newForm);
  newForm.addEventListener("submit",async e=>{
    e.preventDefault();if(!autoEntryMode||!capturedScores)return;
    const name=document.getElementById("playerName").value.trim();if(!name)return;
    const btn=e.submitter||newForm.querySelector('button[type="submit"]');btn.disabled=true;
    try{localStorage.setItem(NAME_KEY,name);await saveScore(name,capturedScores.score,"automatic");setStatus(`Saved ${capturedScores.score.toLocaleString()} for ${name}`);capturedScores=null;window.detectedCategoryScores=null;setTimeout(closeScores,450)}catch(err){console.error(err);alert("The score could not be saved. Please keep this screen open and try again.")}finally{btn.disabled=false}
  });

  // Rebind modal controls because the original close function is no longer authoritative.
  document.getElementById("closeScores").onclick=closeScores;
  document.getElementById("scores").onclick=()=>openScores();

  captureCandidateScore = function captureAtomicScore(message){
    const text=String(message??"").trim();
    const m=text.match(/^WHTBB_SCORES=(-?\d+),(-?\d+),(-?\d+),(-?\d+),(-?\d+)$/i);if(!m)return;
    const [score,analysis,calculation,memory,visual]=m.slice(1).map(Number);
    if([score,analysis,calculation,memory,visual].some(v=>!Number.isInteger(v)||v<0||v>999999999))return;
    if(analysis+calculation+memory+visual!==score){console.error("WHTBB score integrity mismatch",{score,analysis,calculation,memory,visual});return}
    capturedScores={score,analysis,calculation,memory,visual};
    window.detectedCategoryScores={analysis,calculation,memory,visual};detectedFinalScore=score;detectedScorePriority=100;
    openScores(score,true);
  };

  function attachObserver(api){if(!api)return false;try{api.traceObserver=msg=>captureCandidateScore(msg);activeApi=api;window.__whtbbTraceObserverAttached=true;return true}catch(e){console.warn("Score observer unavailable",e);window.__whtbbTraceObserverAttached=false;return false}}
  function reattachObserver(){if(activeApi)attachObserver(activeApi)}
  async function safeOfflineSetup(){if(!("serviceWorker" in navigator))return;try{await registerSW()}catch(_){}try{await warmOfflineCache()}catch(_){}}

  const originalStartGame=startGame;playBtn.removeEventListener("click",originalStartGame);
  startGame=async function startGameV15(){
    playBtn.disabled=true;setStatus("Loading game…");capturedScores=null;
    try{
      await loadScript(RUFFLE_PATH);await safeOfflineSetup();
      if(!window.RufflePlayer?.newest)throw new Error("Ruffle runtime did not initialise");
      const player=window.RufflePlayer.newest().createPlayer();document.getElementById("player").replaceChildren(player);player.style.width="100%";player.style.height="100%";
      const ruffleApi=player.ruffle();if(!ruffleApi||typeof ruffleApi.load!=="function")throw new Error("Ruffle player API unavailable");
      await ruffleApi.load(SWF_PATH);attachObserver(ruffleApi);setTimeout(reattachObserver,250);setTimeout(reattachObserver,1500);setTimeout(reattachObserver,5000);
      startScreen.hidden=true;setStatus("Playing · automatic score capture ready");syncScores();
    }catch(e){console.error("WHTBB v15 startup failed",e);setStatus(`Could not start · ${e?.message||e}`,true);playBtn.disabled=false;alert(`The game could not start.\n\n${e?.message||e}`)}
  };
  playBtn.addEventListener("click",startGame);
  document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible"){reattachObserver();syncScores()}});
  window.addEventListener("online",syncScores);window.addEventListener("pageshow",syncScores);

  ensureFilters();renderScores();syncScores();
  console.info(`WHTBB hardened runtime ${RELEASE} ready`);
})();
