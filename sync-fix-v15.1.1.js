(() => {
  const RELEASE = "v15.1.1";

  uploadRecord = async function(r) {
    const nums = validCategoryRecord(r);
    if (!nums || !r.delete_token) return false;
    const deleteHash = await sha256Hex(r.delete_token);
    await api("scores?on_conflict=client_id", {
      method: "POST",
      headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
      body: JSON.stringify({
        player_name: r.name,
        score: nums.score,
        analysis_score: nums.analysis,
        calculation_score: nums.calculation,
        memory_score: nums.memory,
        visual_score: nums.visual,
        played_at: r.date,
        client_id: r.client_id,
        source: "automatic",
        delete_token_hash: deleteHash
      })
    });
    return true;
  };

  const version = document.getElementById("releaseVersion");
  if (version) version.textContent = `WHTBB · ${RELEASE}`;

  window.addEventListener("pageshow", () => syncScores());
  window.addEventListener("online", () => syncScores());
  setTimeout(() => syncScores(), 250);
  console.info(`WHTBB sync hotfix ${RELEASE} ready`);
})();
