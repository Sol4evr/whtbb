(() => {
  const statusEl=document.getElementById("status");
  const form=document.getElementById("scoreForm");
  const title=document.getElementById("scoreTitle");
  const sub=document.getElementById("scoreSub");
  if(!statusEl||!form||!title||!sub)return;

  function switchToLeaderboard(){
    form.hidden=true;
    form.classList.remove("v15-auto");
    for(const id of ["brainScore","analysisScore","calculationScore","memoryScore","visualScore"]){
      const el=document.getElementById(id);
      if(el) el.value="";
    }
    title.textContent="Shared Leaderboard";
    sub.textContent="Rank by total score or any of the four brain categories.";
    if(typeof renderScores==="function") renderScores();
  }

  new MutationObserver(()=>{
    if(/^Saved\s/.test(statusEl.textContent||"")) switchToLeaderboard();
  }).observe(statusEl,{childList:true,subtree:true,characterData:true});
})();
