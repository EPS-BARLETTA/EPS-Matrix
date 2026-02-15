(function(){
  const params = new URLSearchParams(window.location.search);
  const classId = params.get("class");
  if(!classId){ window.location.href = "classes.html"; return; }
  const state = window.EPSMatrix.loadState();
  const clsIndex = state.classes.findIndex((c)=>c.id === classId);
  if(clsIndex === -1){ window.location.href = "classes.html"; return; }
  const cls = state.classes[clsIndex];
  if(!cls){ window.location.href = "classes.html"; return; }
  if(cls.color){
    document.body.style.setProperty("--accent", cls.color);
  }
  const showArchived = Boolean(state.showArchived);
  const caGrid = document.getElementById("caGrid");
  const evalModal = document.getElementById("evalModal");
  const evalModalContent = document.getElementById("evalModalContent");
  const evalModalTitle = document.getElementById("evalModalTitle");
  const closeEvalModal = document.getElementById("closeEvalModal");
  const btnImportArchive = document.getElementById("btnImportArchive");
  const hiddenEvalImporter = document.getElementById("hiddenEvalImporter");

  closeEvalModal?.addEventListener("click", ()=>evalModal.classList.add("hidden"));
  evalModal?.addEventListener("click", (e)=>{ if(e.target === evalModal) evalModal.classList.add("hidden"); });
  document.getElementById("classTitle").textContent = cls.name;
  document.getElementById("classMeta").textContent = `Prof ${cls.teacher || "—"} • ${cls.students.length} élèves • Site ${cls.site || "—"}`;

  const btnNewEval = document.getElementById("btnNewEval");
  btnNewEval.addEventListener("click", ()=>{
    const input = prompt("Champ d'apprentissage ? (CA1, CA2, CA3, CA4, CA5 ou BLOC pour Bloc note)", "CA4");
    if(!input) return;
    const value = input.trim().toUpperCase();
    if(value.startsWith("BLOC") || value === "NOTE"){
      window.location.href = `notes.html?class=${cls.id}`;
      return;
    }
    const field = window.EPSMatrix.LEARNING_FIELDS.find((lf)=>lf.id === value);
    const chosen = field && field.id !== "NOTE" ? field.id : "CA4";
    window.location.href = `evaluation.html?class=${cls.id}&field=${chosen}`;
  });

  const btnDeleteClass = document.getElementById("btnDeleteClass");
  btnDeleteClass.addEventListener("click", ()=>{
    const message = `Supprimer définitivement ${cls.name} ainsi que toutes ses évaluations et notes ?`;
    if(confirm(message)){
      state.classes.splice(clsIndex,1);
      window.EPSMatrix.saveState(state);
      window.location.href = "classes.html";
    }
  });

  btnImportArchive?.addEventListener("click", ()=>{
    if(hiddenEvalImporter){
      hiddenEvalImporter.dataset.mode = "manual";
      hiddenEvalImporter.click();
    }
  });
  hiddenEvalImporter?.addEventListener("change", handleArchiveImport);

  render();

  function render(){
    caGrid.innerHTML = window.EPSMatrix.LEARNING_FIELDS.map((lf)=>{
      const color = lf.color || cls.color || "#1c5bff";
      const soft = withAlpha(color,"22");
      const normalizedId = lf.id;
      const evals = cls.evaluations.filter((ev)=>normalizeField(ev.learningField) === lf.id && (showArchived || ev.status !== "archived"));
      const count = evals.length;
      const primaryBtn = normalizedId === "NOTE"
        ? `<a class="btn primary" href="notes.html?class=${cls.id}">Ouvrir le bloc note</a>`
        : `<a class="btn primary" href="evaluation.html?class=${cls.id}&field=${lf.id}">Créer une évaluation</a>`;
      const secondaryBtn = normalizedId === "NOTE"
        ? `<button class="btn secondary" type="button" data-action="show" data-field="${lf.id}" ${count?"":"disabled"}>Évaluations (${count})</button>`
        : `<button class="btn secondary" type="button" data-action="show" data-field="${lf.id}" ${count?"":"disabled"}>Voir (${count})</button>`;
      return `<div class="folder" style="cursor:default;--folder-color:${color};--folder-soft:${soft};">
        <div class="folderIcon">📂</div>
        <div class="folderTitle">${lf.title}</div>
        <div class="folderMeta">${lf.desc}</div>
        <div class="folderActions" style="gap:8px;flex-wrap:wrap;">
          ${primaryBtn}
          ${secondaryBtn}
        </div>
      </div>`;
    }).join("");
    caGrid.querySelectorAll("button[data-action='show']").forEach((btn)=>{
      btn.addEventListener("click", ()=>{
        const fieldId = btn.dataset.field;
        openEvalModal(fieldId);
      });
    });
  }

  function openEvalModal(fieldId){
    const field = window.EPSMatrix.LEARNING_FIELDS.find((lf)=>lf.id === fieldId);
    if(!field || !evalModal) return;
    const evals = cls.evaluations.filter((ev)=>normalizeField(ev.learningField) === fieldId && (showArchived || ev.status !== "archived"));
    evalModalTitle.textContent = `${field.title} – ${evals.length} évaluation${evals.length>1?"s":""}`;
    if(!evals.length){
      evalModalContent.innerHTML = '<div class="caItem" style="justify-content:center;color:var(--muted)">Aucune évaluation</div>';
    }else{
      evalModalContent.innerHTML = evals.map((ev)=>{
        return `<div class="caItem" data-id="${ev.id}">
          <div>
            <strong>${ev.activity}</strong>
            <p class="muted" style="margin:4px 0 0;">${new Date(ev.createdAt).toLocaleDateString("fr-FR")}</p>
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;">
            <a class="btn secondary" style="padding:4px 10px;" href="evaluation.html?class=${cls.id}&eval=${ev.id}">Ouvrir</a>
            <button class="btn secondary" type="button" style="padding:4px 10px;" data-action="archive" data-id="${ev.id}">${ev.status==="archived"?"Restaurer":"Archiver"}</button>
            <button class="btn secondary" type="button" style="padding:4px 10px;" data-action="export" data-id="${ev.id}">Exporter</button>
            <button class="btn secondary danger" type="button" style="padding:4px 10px;" data-action="delete" data-id="${ev.id}">Supprimer</button>
          </div>
        </div>`;
      }).join("");
      evalModalContent.querySelectorAll("button[data-action='archive']").forEach((btn)=>{
        btn.addEventListener("click", ()=>{
          const evaluation = cls.evaluations.find((ev)=>ev.id === btn.dataset.id);
          if(!evaluation) return;
          handleArchiveToggle(evaluation, fieldId);
        });
      });
      evalModalContent.querySelectorAll("button[data-action='export']").forEach((btn)=>{
        btn.addEventListener("click", ()=>{
          const evaluation = cls.evaluations.find((ev)=>ev.id === btn.dataset.id);
          if(!evaluation) return;
          exportEvaluationArchive(cls, evaluation);
        });
      });
      evalModalContent.querySelectorAll("button[data-action='delete']").forEach((btn)=>{
        btn.addEventListener("click", ()=>{
          const evalId = btn.dataset.id;
          const idx = cls.evaluations.findIndex((ev)=>ev.id === evalId);
          if(idx === -1) return;
          if(confirm("Supprimer définitivement cette évaluation ?")){
            cls.evaluations.splice(idx,1);
            window.EPSMatrix.saveState(state);
            openEvalModal(fieldId);
            render();
          }
        });
      });
    }
    evalModal.classList.remove("hidden");
  }

  function handleArchiveToggle(evaluation, fieldId){
    if(evaluation.status === "archived"){
      evaluation.status = "active";
      evaluation.archivedAt = null;
      window.EPSMatrix.saveState(state);
      openEvalModal(fieldId);
      promptRestoreImport();
    }else{
      evaluation.status = "archived";
      evaluation.archivedAt = Date.now();
      window.EPSMatrix.saveState(state);
      openEvalModal(fieldId);
      promptArchiveExport(evaluation);
    }
  }

  function promptArchiveExport(evaluation){
    exportEvaluationArchive(cls, evaluation);
    alert("Archive exportée. Dépose l’archive (.epsarchive.json) et le CSV dans Fichiers pour une sauvegarde externe.");
  }

  function promptRestoreImport(){
    if(!hiddenEvalImporter) return;
    const wantsImport = confirm("Importer cette évaluation depuis un fichier sauvegardé (iCloud / Fichiers) ?");
    if(wantsImport){
      hiddenEvalImporter.dataset.mode = "restore";
      hiddenEvalImporter.click();
    }
  }

  function handleArchiveImport(event){
    const file = event.target.files?.[0];
    if(!file) return;
    const reader = new FileReader();
    reader.onload = ()=>{
      try{
        const payload = window.EPSMatrix.parseEvaluationArchive(reader.result);
        const result = window.EPSMatrix.importEvaluationArchive(state, payload);
        window.EPSMatrix.saveState(state);
        alert(`Évaluation importée dans ${result.cls.name}.`);
        render();
        if(result.evaluation?.learningField){
          openEvalModal(normalizeField(result.evaluation.learningField));
        }
      }catch(err){
        console.error(err);
        alert("Impossible de lire ce fichier d'archivage. Vérifie qu'il provient d'EPS Matrix.");
      }finally{
        event.target.value = "";
        delete event.target.dataset.mode;
      }
    };
    reader.readAsText(file, "utf-8");
  }

  function exportEvaluationArchive(cls, evaluation){
    const {serializeEvaluationArchive, buildEvaluationCsv, sanitizeFileName} = window.EPSMatrix;
    const archive = serializeEvaluationArchive(cls, evaluation);
    archive.csv = buildEvaluationCsv(evaluation);
    const day = new Date().toISOString().split("T")[0];
    const prefix = `${sanitizeFileName(cls.name)}-${sanitizeFileName(evaluation.activity)}-${day}`;
    downloadContent(`${prefix}.epsarchive.json`, JSON.stringify(archive, null, 2), "application/json");
    downloadContent(`${prefix}.csv`, archive.csv, "text/csv");
  }

  function downloadContent(filename, content, type){
    const blob = new Blob([content], {type});
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    setTimeout(()=>{ URL.revokeObjectURL(link.href); link.remove(); }, 0);
  }

  function withAlpha(color, alpha="22"){
    if(typeof color !== "string") return color;
    return /^#([0-9a-f]{6})$/i.test(color) ? `${color}${alpha}` : color;
  }

  function normalizeField(id){
    if(window.EPSMatrix.LEARNING_FIELDS.some((lf)=>lf.id === id)) return id;
    return "NOTE";
  }
})();
