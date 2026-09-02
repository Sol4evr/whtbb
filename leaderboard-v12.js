(() => {
  const RELEASE="v12";
  let syncLock=null;

  const style=document.createElement("style");
  style.textContent=`
    .rank-medal{font-size:24px;line-height:1;display:block;text-align:center;filter:drop-shadow(0 2px 4px rgba(0,0,0,.25))}
    .score-row.podium-1{background:linear-gradient(135deg,rgba(255,215,0,.18),var(--panel2));border:1px solid rgba(255,215,0,.38)}
    .score-row.podium-2{background:linear-gradient(135deg,rgba(210,218,230,.16),var(--panel2));border:1px solid rgba(220,225,235,.3)}
    .score-row.podium-3{background:linear-gradient(135deg,rgba(205,127,50,.18),var(--panel2));border:1px solid rgba(205,127,50,.34)}
    .score-row.podium-1 .points{color:#ffe47a}
    .score-row.podium-2 .points{color:#e4e8ef}
    .score-row.podium-3 .points{color:#e2a46a}
  `;
  document.head.appendChild(style);

  function categoryObjectSafe(s){
    const raw=[s?.analysis??s?.analysis_score,s?.calculation??s?.calculation_score,s?.memory??s?.memory_score,s?.visual??s?.visual_score];
    if(raw.some(x=>x===null||x===undefined||x===""))return null;
    const vals=raw.map(validScore);if(vals.some(x=>x===null))return null;
    return {analysis:vals[0],calculation:vals[1],memory:vals[2],visual:vals[3]};
  }
  function catHtml(cat){
    if(!cat)return '<div class="category-missing">Category split unavailable for this older score</div>';
    return `<div class="category-breakdown"><span class="category-pill">Analysis ${cat.analysis.toLocaleString()}</span><span class="category-pill">Calculation ${cat.calculation.toLocaleString()}</span><span class="category-pill">Memory ${cat.memory.toLocaleString()}</span><span class="category-pill">Visual ${cat.visual.toLocaleString()}</span></div>`;
  }
  function rankHtml(i){
    if(i===0)return '<span class="rank-medal" title="1st place">🏆</span>';
    if(i===1)return '<span class="rank-medal" title="2nd place">🥈</span>';
    if(i===2)return '<span class="rank-medal" title="3rd place">🥉</span>';
    return `#${i+1}`;
  }

  renderScores=function renderV12Scores(){
    const scores=mergedScores();
    if(!scores.length){scoreList.innerHTML='<div class="empty">No saved scores yet. Complete a full game and the final score should be detected automatically.</div>';return;}
    scoreList.innerHTML=scores.slice(0,50).map((s,i)=>{
      const cat=categoryObjectSafe(s);const podium=i<3?` podium-${i+1}`:"";
      return `<div class="score-row${podium}"><div class="rank">${rankHtml(i)}</div><div class="who"><strong>${esc(s.name)}</strong><small>${new Date(s.date).toLocaleString()}</small>${catHtml(cat)}</div><div class="points">${s.score.toLocaleString()}</div></div>`;
    }).join("");
  };

  async function cloudFetch(){
    const rows=await api("scores?select=player_name,score,analysis_score,calculation_score,memory_score,visual_score,played_at,client_id,source&order=score.desc,played_at.desc&limit=100");
    cloudScores=(rows||[]).map(r=>({name:r.player_name,score:Number(r.score),analysis:r.analysis_score,calculation:r.calculation_score,memory:r.memory_score,visual:r.visual_score,date:r.played_at,client_id:r.client_id,source:r.source}));
    renderScores();
    return true;
  }

  const oldUpload=uploadRecord;
  uploadRecord=async function uploadV12Record(r){
    try{return await oldUpload(r)}catch(_){return false}
  };

  syncScores=async function serializedSync(){
    if(syncLock)return syncLock;
    syncLock=(async()=>{
      const local=readScores();let changed=false;
      for(const r of local){
        if(r.synced)continue;
        let ok=false;
        try{ok=await oldUpload(r)}catch(_){ok=false}
        if(!ok&&r.client_id){
          try{
            const found=await api(`scores?select=client_id&client_id=eq.${encodeURIComponent(r.client_id)}&limit=1`);
            ok=Array.isArray(found)&&found.length>0;
          }catch(_){ }
        }
        if(ok){r.synced=true;changed=true;}
      }
      if(changed)writeScores(local);
      try{await cloudFetch();return true}catch(e){console.warn("Cloud leaderboard refresh failed",e);renderScores();return false}
    })();
    try{return await syncLock}finally{syncLock=null}
  };

  const oldOpen=openScores;
  openScores=function openV12Scores(prefillScore=null,isAuto=false){
    oldOpen(prefillScore,isAuto);
    if(!isAuto){
      scoreTitle.innerHTML=`Shared Leaderboard <span class="sync-badge">${RELEASE} · checking…</span>`;
      scoreSub.textContent="Refreshing the shared leaderboard…";
      syncScores().then(ok=>{
        if(modal.hidden)return;
        if(ok){
          scoreTitle.innerHTML=`Shared Leaderboard <span class="sync-badge">${RELEASE} · cloud</span>`;
          scoreSub.textContent="Cloud-synced totals and category scores across iPad, iPhone and browser.";
        }else if(!navigator.onLine){
          scoreTitle.innerHTML=`Shared Leaderboard <span class="sync-badge">${RELEASE} · offline</span>`;
          scoreSub.textContent="This device is offline. Local scores are shown and will sync when you reconnect.";
        }else{
          scoreTitle.innerHTML=`Shared Leaderboard <span class="sync-badge">${RELEASE} · retrying</span>`;
          scoreSub.textContent="The cloud did not respond to this refresh. Local scores remain safe and another retry will run automatically.";
        }
      });
    }
  };

  window.addEventListener("online",()=>syncScores());
  window.addEventListener("pageshow",()=>syncScores());
  document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible")syncScores()});
  setTimeout(()=>syncScores(),300);
  console.info("WHTBB leaderboard v12 ready");
})();
