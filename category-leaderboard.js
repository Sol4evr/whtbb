(() => {
  // Extends the existing leaderboard without changing the preserved SWF or the
  // stable game loader. Category order is verified from MinigameDefines:
  // Analysis, Calculation, Memory, Visual (internally IDENTIFY).
  window.detectedCategoryScores = window.detectedCategoryScores || null;

  const style = document.createElement("style");
  style.textContent = `
    .category-breakdown{display:flex;gap:6px;flex-wrap:wrap;margin-top:5px}
    .category-pill{font-size:11px;line-height:1.2;padding:3px 6px;border-radius:7px;background:#111831;color:#dbe2ff;white-space:nowrap}
    .category-missing{font-size:11px;color:var(--muted);margin-top:4px}
    .auto-breakdown{display:block;margin-top:5px;color:#dbe2ff}
    @media (max-width:700px){.category-breakdown{gap:4px}.category-pill{font-size:10px;padding:3px 5px}}
  `;
  document.head.appendChild(style);

  function categoryObject(s) {
    const a = validScore(s.analysis ?? s.analysis_score);
    const c = validScore(s.calculation ?? s.calculation_score);
    const m = validScore(s.memory ?? s.memory_score);
    const v = validScore(s.visual ?? s.visual_score);
    if ([a,c,m,v].some(x => x === null)) return null;
    return {analysis:a, calculation:c, memory:m, visual:v};
  }

  function categoryText(cat) {
    if (!cat) return "";
    return `Analysis ${cat.analysis.toLocaleString()} · Calculation ${cat.calculation.toLocaleString()} · Memory ${cat.memory.toLocaleString()} · Visual ${cat.visual.toLocaleString()}`;
  }

  function categoryHtml(cat) {
    if (!cat) return '<div class="category-missing">Category split unavailable for this older score</div>';
    return `<div class="category-breakdown">
      <span class="category-pill">Analysis ${cat.analysis.toLocaleString()}</span>
      <span class="category-pill">Calculation ${cat.calculation.toLocaleString()}</span>
      <span class="category-pill">Memory ${cat.memory.toLocaleString()}</span>
      <span class="category-pill">Visual ${cat.visual.toLocaleString()}</span>
    </div>`;
  }

  mergedScores = function mergedCategoryScores() {
    const map = new Map();
    for (const s of [...cloudScores, ...readScores()]) {
      const cat = categoryObject(s);
      const item = {
        name:s.name||s.player_name||"Player",
        score:Number(s.score),
        date:s.date||s.played_at||new Date().toISOString(),
        client_id:s.client_id,
        source:s.source||"manual",
        ...(cat||{})
      };
      const key=item.client_id||`${item.name}|${item.score}|${item.date}`;
      if (!map.has(key)) map.set(key,item);
    }
    return [...map.values()].sort((a,b)=>b.score-a.score||String(b.date).localeCompare(String(a.date)));
  };

  renderScores = function renderCategoryScores() {
    const scores=mergedScores();
    if(!scores.length){
      scoreList.innerHTML='<div class="empty">No saved scores yet. Complete a full game and the final score should be detected automatically.</div>';
      return;
    }
    scoreList.innerHTML=scores.slice(0,50).map((s,i)=>{
      const cat=categoryObject(s);
      return `<div class="score-row"><div class="rank">#${i+1}</div><div class="who"><strong>${esc(s.name)}</strong><small>${new Date(s.date).toLocaleString()}</small>${categoryHtml(cat)}</div><div class="points">${s.score.toLocaleString()}</div></div>`;
    }).join("");
  };

  loadCloudScores = async function loadCategoryCloudScores() {
    try {
      const rows=await api("scores?select=player_name,score,analysis_score,calculation_score,memory_score,visual_score,played_at,client_id,source&order=score.desc,played_at.desc&limit=100");
      cloudScores=(rows||[]).map(r=>({
        name:r.player_name,
        score:Number(r.score),
        analysis:r.analysis_score,
        calculation:r.calculation_score,
        memory:r.memory_score,
        visual:r.visual_score,
        date:r.played_at,
        client_id:r.client_id,
        source:r.source
      }));
      renderScores();
      return true;
    } catch(e) {
      console.warn("Cloud leaderboard unavailable",e);
      renderScores();
      return false;
    }
  };

  uploadRecord = async function uploadCategoryRecord(r) {
    try {
      const cat=categoryObject(r);
      await api("scores?on_conflict=client_id",{
        method:"POST",
        headers:{Prefer:"resolution=ignore-duplicates,return=minimal"},
        body:JSON.stringify({
          player_name:r.name,
          score:r.score,
          analysis_score:cat?.analysis??null,
          calculation_score:cat?.calculation??null,
          memory_score:cat?.memory??null,
          visual_score:cat?.visual??null,
          played_at:r.date,
          client_id:r.client_id,
          source:r.source||"manual"
        })
      });
      return true;
    } catch(e) {
      console.warn("Score queued for later sync",e);
      return false;
    }
  };

  saveScore = async function saveCategoryScore(name,score,source) {
    const cat = source === "automatic" ? categoryObject(window.detectedCategoryScores||{}) : null;
    const record={
      name,score,date:new Date().toISOString(),source,client_id:uid(),synced:false,
      ...(cat||{})
    };
    const local=readScores();
    local.push(record);
    writeScores(local);
    renderScores();
    if(await uploadRecord(record)){
      record.synced=true;
      writeScores(readScores().map(r=>r.client_id===record.client_id?record:r));
      await loadCloudScores();
    }
    window.detectedCategoryScores=null;
  };

  const baseOpenScores = openScores;
  openScores = function openCategoryScores(prefillScore=null,isAuto=false) {
    baseOpenScores(prefillScore,isAuto);
    if (isAuto) {
      const cat=categoryObject(window.detectedCategoryScores||{});
      if (cat) {
        scoreSub.innerHTML=`Final score detected: <strong>${Number(prefillScore).toLocaleString()}</strong>. Enter your name to save it across all your devices.<span class="auto-breakdown">${esc(categoryText(cat))}</span>`;
      }
    }
  };

  // Preserve category values when restoring v4+ backups. This capture-phase
  // handler supersedes the older total-only restore listener in index.html.
  const restoreFile=document.getElementById("restoreFile");
  restoreFile.addEventListener("change",async e=>{
    const file=e.target.files?.[0];
    if(!file)return;
    e.stopImmediatePropagation();
    try{
      const data=JSON.parse(await file.text());
      if(!Array.isArray(data?.scores))throw new Error("Invalid backup");
      const local=readScores();
      for(const s of data.scores){
        const score=validScore(s.score);if(score===null)continue;
        const cat=categoryObject(s);
        local.push({name:String(s.name||"Player").slice(0,30),score,date:s.date||new Date().toISOString(),source:"imported",client_id:s.client_id||uid(),synced:false,...(cat||{})});
      }
      writeScores(local);
      if(typeof data.lastPlayer==="string")localStorage.setItem(NAME_KEY,data.lastPlayer);
      renderScores();
      await syncScores();
      alert("WHTBB score backup restored and synced.");
    }catch(_){
      alert("That file is not a valid WHTBB score backup.");
    }finally{
      e.target.value="";
    }
  },true);

  // Refresh once with the expanded cloud projection.
  loadCloudScores();
  console.info("WHTBB category leaderboard ready");
})();
