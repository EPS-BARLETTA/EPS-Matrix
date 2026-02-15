(function(){
  const {
    loadState,
    saveState,
    normalizeEvaluation,
    normalizeNotes,
    genId,
    migrateState,
    CURRENT_SCHEMA_VERSION
  } = window.EPSMatrix;
  const DEFAULT_COLOR = "#1c5bff";
  let state = loadState();
  const statsEl = document.getElementById("classesStats");
  const grid = document.getElementById("folderGrid");
  const chkArchived = document.getElementById("chkShowArchived");
  const btnImportArchive = document.getElementById("btnImportArchiveGlobal");
  const hiddenArchiveImporter = document.getElementById("hiddenArchiveImporter");
  const btnBackupAll = document.getElementById("btnBackupAllClasses");
  const btnRestoreApp = document.getElementById("btnRestoreAppBackup");
  const inputAppBackup = document.getElementById("inputAppBackup");

  chkArchived.checked = Boolean(state.showArchived);
  chkArchived.addEventListener("change", ()=>{
    state.showArchived = chkArchived.checked;
    saveState(state);
    render();
  });
  btnImportArchive?.addEventListener("click", ()=>{
    hiddenArchiveImporter?.click();
  });
  hiddenArchiveImporter?.addEventListener("change", handleArchiveImport);
  btnBackupAll?.addEventListener("click", exportAppBackup);
  btnRestoreApp?.addEventListener("click", ()=>{
    if(inputAppBackup) inputAppBackup.click();
  });
  inputAppBackup?.addEventListener("change", handleAppBackupImport);
  render();

  function render(){
    const stats = computeStats();
    statsEl.innerHTML = `
      <div class="statCard"><span>Classes</span><strong>${stats.classes}</strong></div>
      <div class="statCard"><span>Évaluations</span><strong>${stats.evals}</strong></div>
      <div class="statCard"><span>Archivées</span><strong>${stats.archived}</strong></div>`;
    if(!state.classes.length){ grid.innerHTML = '<div class="folder">Aucune classe</div>'; return; }
    grid.innerHTML = state.classes.map((cls)=>{
      const color = cls.color || DEFAULT_COLOR;
      const soft = withAlpha(color,"22");
      return `<div class="folder" draggable="true" data-id="${cls.id}" style="--folder-color:${color};--folder-soft:${soft}">
        <div class="folderIcon">📁</div>
        <div class="folderTitle">${cls.name}</div>
        <div class="folderMeta">${cls.students.length} élèves • ${cls.evaluations.length} évaluations</div>
      </div>`;
    }).join("");
    let dragged = null;
    grid.querySelectorAll(".folder").forEach((folder)=>{
      folder.addEventListener("click", ()=>{
        if(dragged) return;
        const id = folder.dataset.id;
        window.location.href = `class.html?class=${encodeURIComponent(id)}`;
      });
      folder.addEventListener("dragstart", ()=>{ dragged = folder.dataset.id; folder.classList.add("dragging"); });
      folder.addEventListener("dragend", ()=>{ folder.classList.remove("dragging"); dragged = null; });
      folder.addEventListener("dragover", (e)=>{ e.preventDefault(); folder.classList.add("dragover"); });
      folder.addEventListener("dragleave", ()=>folder.classList.remove("dragover"));
      folder.addEventListener("drop", (e)=>{
        e.preventDefault(); folder.classList.remove("dragover");
        const target = folder.dataset.id;
        if(!dragged || dragged===target) return;
        reorder(dragged, target);
      });
    });
  }

  function reorder(source, target){
    const list = state.classes;
    const fromIdx = list.findIndex((cls)=>cls.id === source);
    const toIdx = list.findIndex((cls)=>cls.id === target);
    const [item] = list.splice(fromIdx,1);
    list.splice(toIdx,0,item);
    saveState(state);
    render();
  }

  function computeStats(){
    const classes = state.classes.length;
    let evals = 0, archived = 0;
    state.classes.forEach((cls)=>{
      evals += cls.evaluations.length;
      archived += cls.evaluations.filter((ev)=>ev.archived).length;
    });
    return {classes, evals, archived};
  }

  function withAlpha(color, alpha="22"){
    if(typeof color !== "string") return color;
    return /^#([0-9a-f]{6})$/i.test(color) ? `${color}${alpha}` : color;
  }

  function handleArchiveImport(event){
    const file = event.target.files?.[0];
    if(!file) return;
    const reader = new FileReader();
    reader.onload = ()=>{
      try{
        const payload = window.EPSMatrix.parseEvaluationArchive(reader.result);
        const result = window.EPSMatrix.importEvaluationArchive(state, payload);
        saveState(state);
        alert(`Évaluation importée dans ${result.cls.name}.`);
        render();
      }catch(err){
        console.error(err);
        alert("Impossible de lire ce fichier d'archivage.");
      }finally{
        event.target.value = "";
      }
    };
    reader.readAsText(file, "utf-8");
  }

  function exportAppBackup(){
    try{
      const backup = {
        kind: "epsmatrix.appBackup",
        backupAt: new Date().toISOString(),
        schemaVersion: CURRENT_SCHEMA_VERSION,
        appState: structuredClone(state)
      };
      const filename = `EPSMatrix_Mes-classes_${formatTimestamp(new Date())}.epsbackup.json`;
      downloadFile(filename, JSON.stringify(backup, null, 2));
    }catch(err){
      console.error("Export backup impossible", err);
      alert("Impossible de créer la sauvegarde.");
    }
  }

  function handleAppBackupImport(event){
    const file = event.target.files?.[0];
    if(!file) return;
    const reader = new FileReader();
    reader.onload = ()=>{
      try{
        const payload = JSON.parse(reader.result);
        if(payload?.kind !== "epsmatrix.appBackup"){
          throw new Error("Fichier incompatible");
        }
        const incomingState = structuredClone(payload.appState || {});
        incomingState.schemaVersion = typeof payload.schemaVersion === "number" ? payload.schemaVersion : incomingState.schemaVersion;
        const imported = migrateState(incomingState);
        const suffix = formatRestoreLabel(payload.backupAt);
        const report = mergeAppBackup(imported, suffix);
        saveState(state);
        render();
        alert(report);
      }catch(err){
        console.error("Import backup impossible", err);
        alert("Impossible de restaurer cette sauvegarde.");
      }finally{
        event.target.value = "";
      }
    };
    reader.readAsText(file, "utf-8");
  }

  function mergeAppBackup(importedState, suffix){
    let classesAdded = 0;
    let classesDuplicated = 0;
    let evalsAdded = 0;
    let evalsDuplicated = 0;
    const existingIds = new Set(state.classes.map((cls)=>cls.id));
    (importedState.classes || []).forEach((rawClass)=>{
      const normalized = prepareClassPayload(rawClass);
      if(existingIds.has(normalized.id)){
        const duplicated = duplicateClassPayload(normalized, suffix);
        state.classes.push(duplicated);
        classesDuplicated++;
        evalsDuplicated += duplicated.evaluations.length;
      }else{
        state.classes.push(normalized);
        existingIds.add(normalized.id);
        classesAdded++;
        evalsAdded += normalized.evaluations.length;
      }
    });
    if(!classesAdded && !classesDuplicated){
      return "Aucune classe importée (tout est déjà présent).";
    }
    return [
      `${classesAdded} classe(s) ajoutée(s)`,
      `${classesDuplicated} classe(s) dupliquée(s)`,
      `${evalsAdded} évaluation(s) ajoutée(s)`,
      `${evalsDuplicated} évaluation(s) dupliquée(s)`
    ].join(" · ");
  }

  function prepareClassPayload(rawClass){
    const cls = structuredClone(rawClass || {});
    cls.id = cls.id || genId("cls");
    cls.name = cls.name || "Classe importée";
    cls.teacher = cls.teacher || "";
    cls.site = cls.site || "";
    cls.color = cls.color || DEFAULT_COLOR;
    cls.students = Array.isArray(cls.students) ? cls.students.map((stu)=>({
      id: stu?.id || genId("stu"),
      name: stu?.name || "",
      groupTag: stu?.groupTag || "",
      absent: Boolean(stu?.absent),
      dispense: Boolean(stu?.dispense),
      niveau: stu?.niveau || "",
      projet1: stu?.projet1 || "",
      projet2: stu?.projet2 || "",
      commentaire: stu?.commentaire || ""
    })) : [];
    cls.notes = normalizeNotes(cls.notes, cls);
    cls.evaluations = Array.isArray(cls.evaluations)
      ? cls.evaluations.map((evaluation)=>normalizeEvaluation(evaluation, cls))
      : [];
    return cls;
  }

  function duplicateClassPayload(classPayload, suffix){
    const duplicated = structuredClone(classPayload);
    duplicated.id = genId("cls");
    duplicated.name = `${duplicated.name || "Classe restaurée"} (restaurée ${suffix})`;
    duplicated.evaluations = duplicated.evaluations.map((evaluation)=>{
      const copy = structuredClone(evaluation);
      copy.id = genId("eval");
      copy.activity = `${copy.activity || "Évaluation"} (restaurée ${suffix})`;
      if(copy.data?.meta){
        copy.data.meta.activity = copy.activity;
      }
      copy.createdAt = Date.now();
      copy.archived = false;
      copy.status = "active";
      copy.archivedAt = null;
      return normalizeEvaluation(copy, duplicated);
    });
    duplicated.notes = normalizeNotes(duplicated.notes, duplicated);
    return duplicated;
  }

  function formatTimestamp(date){
    const year = date.getFullYear();
    const month = String(date.getMonth()+1).padStart(2,"0");
    const day = String(date.getDate()).padStart(2,"0");
    const hours = String(date.getHours()).padStart(2,"0");
    const minutes = String(date.getMinutes()).padStart(2,"0");
    return `${year}-${month}-${day}_${hours}-${minutes}`;
  }

  function formatRestoreLabel(value){
    const date = value ? new Date(value) : new Date();
    if(Number.isNaN(date.getTime())) return new Date().toLocaleDateString("fr-FR");
    return date.toLocaleDateString("fr-FR");
  }

  function downloadFile(filename, content){
    const blob = new Blob([content], {type:"application/json"});
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    setTimeout(()=>{ URL.revokeObjectURL(link.href); link.remove(); }, 0);
  }
})();
