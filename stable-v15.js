(() => {
  const RELEASE = "v15.1.0";
  const LOCAL_KEY = "whtbb.localLeaderboard.v15";
  const DELETE_QUEUE_KEY = "whtbb.deleteQueue.v15";
  const RESET_KEY = "whtbb.storageReset.v15";
  const METRICS = [
    {key:"score",label:"Total",icon:"🏆"},
    {key:"analysis",label:"Analysis",icon:"🔎"},
    {key:"calculation",label:"Calculation",icon:"🧮"},
    {key:"memory",label:"Memory",icon:"🧠"},
    {key:"visual",label:"Visual",icon:"👁️"}
  ];

  let activeMetric="score";
  let captured=null;
  let activeApi=null;
  let syncLock=null;
  let openSwipe=null;

  function resetLegacyStorage(){
    try{
      if(localStorage.getItem(RESET_KEY))return;
      ["whtbb.localLeaderboard.v1","whtbb.localLeaderboard.v2","whtbb.cloudResync.v11","whtbb.trace.tail.v14","whtbb.trace.score.v14","whtbb.trace.summary.v14"].forEach(k=>localStorage.removeItem(k));
      localStorage.setItem(LOCAL_KEY,"[]");
      localStorage.setItem(DELETE_QUEUE_KEY,"[]");
      localStorage.setItem(RESET_KEY,new Date().toISOString());
    }catch(_){ }
  }
  resetLegacyStorage();

  readScores=function(){try{const x=JSON.parse(localStorage.getItem(LOCAL_KEY)||"[]");return Array.isArray(x)?x:[]}catch(_){return[]}};
  writeScores=function(rows){try{localStorage.setItem(LOCAL_KEY,JSON.stringify((rows||[]).slice(0,300)))}catch(_){}};
  function readDeleteQueue(){try{const x=JSON.parse(localStorage.getItem(DELETE_QUEUE_KEY)||"[]");return Array.isArray(x)?x:[]}catch(_){return[]}}
  function writeDeleteQueue(rows){try{localStorage.setItem(DELETE_QUEUE_KEY,JSON.stringify((rows||[]).slice(-100)))}catch(_){}}

  function validCategoryRecord(s){
    const total=validScore(s?.score),a=validScore(s?.analysis??s?.analysis_score),c=validScore(s?.calculation??s?.calculation_score),m=validScore(s?.memory??s?.memory_score),v=validScore(s?.visual??s?.visual_score);
    if([total,a,c,m,v].some(x=>x===null))return null;
    if(a+c+m+v!==total)return null;
    return {score:total,analysis:a,calculation:c,memory:m,visual:v};
  }

  function mergedV15(){
    const local=readScores();const localMap=new Map(local.map(r=>[r.client_id,r]));const map=new Map();
    for(const raw of [...cloudScores,...local]){
      const nums=validCategoryRecord(raw);if(!nums)continue;
      const localCopy=localMap.get(raw.client_id);
      const row={name:String(raw.name||raw.player_name||"Player").slice(0,30),...nums,date:raw.date||raw.played_at||new Date().toISOString(),client_id:raw.client_id,source:"automatic",delete_token:localCopy?.delete_token||raw.delete_token||null,synced:localCopy?.synced??true};
      const key=row.client_id||`${row.name}|${row.score}|${row.date}`;
      if(!map.has(key))map.set(key,row);else if(row.delete_token)map.set(key,{...map.get(key),delete_token:row.delete_token});
    }
    return [...map.values()];
  }
  mergedScores=mergedV15;

  const css=document.createElement("style");
  css.textContent=`
    .v15-filters{display:flex;gap:7px;overflow-x:auto;padding:1px 0 12px;scrollbar-width:none}.v15-filters::-webkit-scrollbar{display:none}
    .v15-filter{flex:0 0 auto;background:#252e55;color:#dce3ff;border:1px solid #394677;min-height:36px;padding:7px 11px;border-radius:999px;font-size:12px}.v15-filter.active{background:var(--accent);color:#171300;border-color:var(--accent)}
    .v15-swipe{position:relative;overflow:hidden;border-radius:13px}.v15-swipe .score-row{position:relative;z-index:2;transition:transform .18s ease;touch-action:pan-y}.v15-swipe.open .score-row{transform:translateX(-88px)}
    .v15-delete-under{position:absolute;z-index:1;right:0;top:0;bottom:0;width:88px;border-radius:0 13px 13px 0;background:#8f3039;color:#fff;padding:0;font-size:12px}.v15-delete-under:disabled{opacity:.35}
    .v15-cats{display:flex;gap:5px;flex-wrap:wrap;margin-top:6px}.v15-cat{font-size:10px;padding:3px 6px;border-radius:7px;background:#111831;color:#dbe2ff;white-space:nowrap}
    .v15-value-wrap{display:flex;align-items:center;justify-content:flex-end;gap:4px}.v15-value{font-size:20px;font-weight:900;white-space:nowrap}.v15-metric{display:block;color:var(--muted);font-size:10px;text-align:right;margin-top:2px}.v15-trash{background:transparent;color:#ffb6bd;border:0;min-height:34px;padding:5px 6px;font-size:16px}.v15-trash-disabled{opacity:.28}
    #scoreForm.v15-auto{grid-template-columns:1.25fr repeat(5,minmax(88px,1fr)) auto}.v15-score-field{min-width:80px}
    .v15-version{position:fixed;bottom:max(env(safe-area-inset-bottom),5px);left:50%;transform:translateX(-50%);z-index:8;color:rgba(214,221,246,.46);font-size:10px;letter-spacing:.04em;pointer-events:none;white-space:nowrap;text-shadow:0 1px 2px #000}
    @media(max-width:900px){#scoreForm.v15-auto{grid-template-columns:1fr 1fr}#scoreForm.v15-auto button[type=submit]{grid-column:1/-1}.v15-trash{display:none}.v15-version{font-size:9px}}
  `;
  document.head.appendChild(css);

  function ensureFooter(){let x=document.getElementById("releaseVersion");if(!x){x=document.createElement("div");x.id="releaseVersion";x.className="v15-version";document.body.appendChild(x)}x.textContent=`WHTBB · ${RELEASE}`}
  ensureFooter();

  function ensureFilters(){
    let f=document.getElementById("scoreFilters");if(f)return f;
    f=document.createElement("div");f.id="scoreFilters";f.className="v15-filters";
    f.innerHTML=METRICS.map(x=>`<button type="button" class="v15-filter${x.key===activeMetric?" active":""}" data-metric="${x.key}">${x.icon} ${x.label}</button>`).join("");
    scoreList.parentNode.insertBefore(f,scoreList);
    f.addEventListener("click",e=>{const b=e.target.closest("[data-metric]");if(!b)return;activeMetric=b.dataset.metric;f.querySelectorAll("[data-metric]").forEach(x=>x.classList.toggle("active",x.dataset.metric===activeMetric));renderScores()});
    return f;
  }

  function closeSwipe(){if(openSwipe){openSwipe.classList.remove("open");openSwipe=null}}
  function pills(s){return `<div class="v15-cats"><span class="v15-cat">🔎 ${s.analysis.toLocaleString()}</span><span class="v15-cat">🧮 ${s.calculation.toLocaleString()}</span><span class="v15-cat">🧠 ${s.memory.toLocaleString()}</span><span class="v15-cat">👁️ ${s.visual.toLocaleString()}</span><span class="v15-cat">🏆 ${s.score.toLocaleString()}</span></div>`}

  renderScores=function(){
    ensureFilters();const metric=METRICS.find(x=>x.key===activeMetric)||METRICS[0];
    const rows=mergedV15().sort((a,b)=>(b[activeMetric]-a[activeMetric])||(b.score-a.score)||String(b.date).localeCompare(String(a.date)));
    if(!rows.length){scoreList.innerHTML='<div class="empty">No scores yet. Complete a full game and all five scores will be captured automatically.</div>';return}
    scoreList.innerHTML=rows.slice(0,100).map((s,i)=>{const canDelete=Boolean(s.delete_token);return `<div class="v15-swipe" data-client="${esc(s.client_id)}"><button type="button" class="v15-delete-under" data-delete="${esc(s.client_id)}" ${canDelete?"":"disabled"}>Delete</button><div class="score-row"><div class="rank">${i<3?["🏆","🥈","🥉"][i]:`#${i+1}`}</div><div class="who"><strong>${esc(s.name)}</strong><small>${new Date(s.date).toLocaleString()}</small>${pills(s)}</div><div class="v15-value-wrap"><div><div class="v15-value">${metric.icon} ${Number(s[activeMetric]).toLocaleString()}</div><span class="v15-metric">${metric.label}</span></div>${canDelete?`<button type="button" class="v15-trash" data-delete="${esc(s.client_id)}" title="Delete score">🗑️</button>`:`<span class="v15-trash v15-trash-disabled" title="Saved on another device">🗑️</span>`}</div></div></div>`}).join("");
    bindSwipe();
  };

  function bindSwipe(){
    scoreList.querySelectorAll(".v15-swipe").forEach(shell=>{const row=shell.querySelector(".score-row");let sx=0,sy=0,dx=0,tracking=false;
      row.addEventListener("touchstart",e=>{if(e.touches.length!==1)return;closeSwipe();sx=e.touches[0].clientX;sy=e.touches[0].clientY;dx=0;tracking=true},{passive:true});
      row.addEventListener("touchmove",e=>{if(!tracking)return;const x=e.touches[0].clientX-sx,y=e.touches[0].clientY-sy;if(Math.abs(y)>Math.abs(x)){tracking=false;row.style.transform="";return}dx=Math.max(-100,Math.min(0,x));row.style.transform=`translateX(${dx}px)`},{passive:true});
      row.addEventListener("touchend",()=>{row.style.transform="";if(!tracking)return;tracking=false;if(dx<-42){shell.classList.add("open");openSwipe=shell}else shell.classList.remove("open")},{passive:true});
    })
  }

  async function sha256Hex(text){if(!crypto?.subtle)throw new Error("Secure browser cryptography unavailable");const buf=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(text));return [...new Uint8Array(buf)].map(b=>b.toString(16).padStart(2,"0")).join("")}
  function randomToken(){const bytes=new Uint8Array(32);crypto.getRandomValues(bytes);return [...bytes].map(b=>b.toString(16).padStart(2,"0")).join("")}

  loadCloudScores=async function(){
    const rows=await api("scores?select=player_name,score,analysis_score,calculation_score,memory_score,visual_score,played_at,client_id,source&order=played_at.desc&limit=200");
    cloudScores=(rows||[]).map(r=>({name:r.player_name,score:r.score,analysis:r.analysis_score,calculation:r.calculation_score,memory:r.memory_score,visual:r.visual_score,date:r.played_at,client_id:r.client_id,source:r.source})).filter(validCategoryRecord);renderScores();return true
  };

  uploadRecord=async function(r){
    const nums=validCategoryRecord(r);if(!nums||!r.delete_token)return false;const deleteHash=await sha256Hex(r.delete_token);
    await api("scores?on_conflict=client_id",{method:"POST",headers:{Prefer:"resolution=ignore-duplicates,return=minimal"},body:JSON.stringify({player_name:r.name,...nums,played_at:r.date,client_id:r.client_id,source:"automatic",delete_token_hash:deleteHash})});return true
  };

  async function flushDeletes(){const q=readDeleteQueue();if(!q.length)return;const keep=[];for(const d of q){try{await api(`scores?client_id=eq.${encodeURIComponent(d.client_id)}`,{method:"DELETE",headers:{"x-score-delete-token":d.delete_token,Prefer:"return=minimal"}})}catch(_){keep.push(d)}}writeDeleteQueue(keep)}

  syncScores=async function(){if(syncLock)return syncLock;syncLock=(async()=>{await flushDeletes();const local=readScores();let changed=false;for(const r of local){if(r.synced)continue;try{if(await uploadRecord(r)){r.synced=true;changed=true}}catch(e){console.warn("Score upload deferred",e)}}if(changed)writeScores(local);try{await loadCloudScores();setStatus(navigator.onLine?"Online · cloud synced":"Offline · queued");return true}catch(e){console.warn("Cloud leaderboard unavailable",e);renderScores();return false}})();try{return await syncLock}finally{syncLock=null}};

  saveScore=async function(name,score,source){
    if(source!=="automatic"||!captured)throw new Error("Only complete automatic scores can be saved");const nums=validCategoryRecord(captured);if(!nums)throw new Error("Score integrity check failed");
    const row={name:String(name).trim().slice(0,30),...nums,date:new Date().toISOString(),client_id:uid(),source:"automatic",delete_token:randomToken(),synced:false};const local=readScores();local.push(row);writeScores(local);renderScores();
    try{if(await uploadRecord(row)){row.synced=true;writeScores(readScores().map(x=>x.client_id===row.client_id?row:x));await loadCloudScores()}}catch(e){console.warn("Saved locally; cloud sync deferred",e)}return row
  };

  async function deleteScore(clientId){const local=readScores();const row=local.find(x=>x.client_id===clientId&&x.delete_token);if(!row){alert("This score was saved on another device. For security, delete it from the device that originally saved it.");return}if(!confirm(`Delete ${row.name}'s ${row.score.toLocaleString()} score?`))return;writeScores(local.filter(x=>x.client_id!==clientId));cloudScores=cloudScores.filter(x=>x.client_id!==clientId);const q=readDeleteQueue();q.push({client_id:clientId,delete_token:row.delete_token});writeDeleteQueue(q);renderScores();await syncScores();setStatus("Score deleted")}
  scoreList.addEventListener("click",e=>{const b=e.target.closest("[data-delete]");if(!b||b.disabled)return;deleteScore(b.dataset.delete)});

  function ensureAutoFields(){const form=document.getElementById("scoreForm"),submit=form?.querySelector('button[type="submit"]');if(!form||!submit)return;form.classList.add("v15-auto");for(const [id,label] of [["analysisScore","🔎 Analysis"],["calculationScore","🧮 Calculation"],["memoryScore","🧠 Memory"],["visualScore","👁️ Visual"]]){if(document.getElementById(id))continue;const input=document.createElement("input");input.id=id;input.type="number";input.readOnly=true;input.className="v15-score-field";input.placeholder=label;input.setAttribute("aria-label",label);form.insertBefore(input,submit)}}
  function fillAutoFields(){if(!captured)return;ensureAutoFields();const vals={brainScore:captured.score,analysisScore:captured.analysis,calculationScore:captured.calculation,memoryScore:captured.memory,visualScore:captured.visual};for(const [id,v] of Object.entries(vals)){const el=document.getElementById(id);if(el){el.value=String(v);el.readOnly=true}}}

  function openLeaderboard(auto=false){
    ensureFilters();const form=document.getElementById("scoreForm"),name=document.getElementById("playerName");autoEntryMode=Boolean(auto&&captured);
    if(autoEntryMode){form.hidden=false;ensureAutoFields();fillAutoFields();name.value=localStorage.getItem(NAME_KEY)||"";scoreTitle.textContent="Save your score";scoreSub.innerHTML=`Captured automatically · 🏆 <strong>${captured.score.toLocaleString()}</strong> · 🔎 ${captured.analysis.toLocaleString()} · 🧮 ${captured.calculation.toLocaleString()} · 🧠 ${captured.memory.toLocaleString()} · 👁️ ${captured.visual.toLocaleString()}. Enter your name to save.`}
    else{form.hidden=true;scoreTitle.textContent="Shared Leaderboard";scoreSub.textContent="Rank by total score or any of the four brain categories."}
    renderScores();modal.hidden=false;syncScores();if(autoEntryMode)setTimeout(()=>{name.focus();if(name.value)name.select()},50)
  }
  openScores=(prefillScore=null,isAuto=false)=>openLeaderboard(Boolean(isAuto));
  closeScores=()=>{modal.hidden=true;autoEntryMode=false;document.getElementById("scoreForm").hidden=false;document.getElementById("brainScore").readOnly=false;closeSwipe()};

  const scoresButton=document.getElementById("scores"),closeButton=document.getElementById("closeScores"),form=document.getElementById("scoreForm");
  scoresButton.addEventListener("click",e=>{e.preventDefault();e.stopImmediatePropagation();openLeaderboard(false)},true);
  closeButton.addEventListener("click",e=>{e.preventDefault();e.stopImmediatePropagation();closeScores()},true);
  modal.addEventListener("click",e=>{if(e.target===modal){e.preventDefault();e.stopImmediatePropagation();closeScores()}},true);
  form.addEventListener("submit",async e=>{e.preventDefault();e.stopImmediatePropagation();if(!autoEntryMode||!captured)return;const name=document.getElementById("playerName").value.trim();if(!name)return;const btn=e.submitter||form.querySelector('button[type="submit"]');btn.disabled=true;try{localStorage.setItem(NAME_KEY,name);await saveScore(name,captured.score,"automatic");setStatus(`Saved ${captured.score.toLocaleString()} for ${name}`);captured=null;window.detectedCategoryScores=null;setTimeout(closeScores,400)}catch(err){console.error(err);alert("The score could not be saved. Please try again.")}finally{btn.disabled=false}},true);

  captureCandidateScore=function(message){const text=String(message??"").trim();const m=text.match(/^WHTBB_SCORES=(-?\d+),(-?\d+),(-?\d+),(-?\d+),(-?\d+)$/i);if(!m)return;const [score,analysis,calculation,memory,visual]=m.slice(1).map(Number);const row={score,analysis,calculation,memory,visual};if(!validCategoryRecord(row)){console.error("WHTBB atomic score failed integrity validation",row);return}captured=row;window.detectedCategoryScores={analysis,calculation,memory,visual};detectedFinalScore=score;detectedScorePriority=100;openLeaderboard(true)};

  function attachObserver(apiObj){if(!apiObj)return false;try{apiObj.traceObserver=msg=>captureCandidateScore(msg);activeApi=apiObj;return true}catch(e){console.warn("Score observer unavailable",e);return false}}
  function reattach(){if(activeApi)attachObserver(activeApi)}
  async function safeOffline(){if(!("serviceWorker" in navigator))return;try{await registerSW()}catch(_){}try{await warmOfflineCache()}catch(_){}}

  const originalStartGame=startGame;playBtn.removeEventListener("click",originalStartGame);
  startGame=async function(){playBtn.disabled=true;setStatus("Loading game…");captured=null;try{await loadScript(RUFFLE_PATH);await safeOffline();if(!window.RufflePlayer?.newest)throw new Error("Ruffle runtime did not initialise");const player=window.RufflePlayer.newest().createPlayer();document.getElementById("player").replaceChildren(player);player.style.width="100%";player.style.height="100%";const apiObj=player.ruffle();if(!apiObj||typeof apiObj.load!=="function")throw new Error("Ruffle player API unavailable");await apiObj.load(SWF_PATH);attachObserver(apiObj);setTimeout(reattach,250);setTimeout(reattach,1500);setTimeout(reattach,5000);startScreen.hidden=true;setStatus("Playing · automatic score capture ready");syncScores()}catch(e){console.error("WHTBB startup failed",e);setStatus(`Could not start · ${e?.message||e}`,true);playBtn.disabled=false;alert(`The game could not start.\n\n${e?.message||e}`)}};
  playBtn.addEventListener("click",startGame);
  document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible"){reattach();syncScores()}});window.addEventListener("online",syncScores);window.addEventListener("pageshow",syncScores);

  ensureFilters();renderScores();syncScores();console.info(`WHTBB stable ${RELEASE} ready`);
})();
