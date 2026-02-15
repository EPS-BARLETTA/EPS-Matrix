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
  const btnBackupClass = document.getElementById("btnBackupClass");
  const btnRestoreClass = document.getElementById("btnRestoreClassBackup");
  const inputClassBackup = document.getElementById("inputClassBackup");
  const classTitleEl = document.getElementById("classTitle");
  const classMetaEl = document.getElementById("classMeta");

  closeEvalModal?.addEventListener("click", ()=>evalModal.classList.add("hidden"));
  evalModal?.addEventListener("click", (e)=>{ if(e.target === evalModal) evalModal.classList.add("hidden"); });
  updateClassHeader();

  const btnNewEval = document.getElementById("btnNewEval");
  btnNewEval.addEventListener("click", ()=>handleNewEvaluationRequest());

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
  btnBackupClass?.addEventListener("click", exportClassBackup);
  btnRestoreClass?.addEventListener("click", ()=>{
    if(inputClassBackup) inputClassBackup.click();
  });
  inputClassBackup?.addEventListener("change", handleClassBackupImport);

  render();

  function render(){
    caGrid.innerHTML = window.EPSMatrix.LEARNING_FIELDS.map((lf)=>{
      const color = lf.color || cls.color || "#1c5bff";
      const soft = withAlpha(color,"22");
      const normalizedId = lf.id;
      const evals = cls.evaluations.filter((ev)=>normalizeField(ev.learningField) === lf.id && (showArchived || !ev.archived));
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
    const evals = cls.evaluations.filter((ev)=>normalizeField(ev.learningField) === fieldId);
    const activeEvals = evals.filter((ev)=>!ev.archived);
    const archivedEvals = evals.filter((ev)=>ev.archived);
    evalModalTitle.textContent = `${field.title} – ${evals.length} évaluation${evals.length>1?"s":""}`;
    if(!evals.length){
      evalModalContent.innerHTML = '<div class="caItem" style="justify-content:center;color:var(--muted)">Aucune évaluation</div>';
    }else{
      const sections = [
        renderEvalGroup("Actives", activeEvals, false),
        archivedEvals.length ? renderEvalGroup("Archivées", archivedEvals, true) : ""
      ].filter(Boolean);
      evalModalContent.innerHTML = sections.join("");
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

  function renderEvalGroup(title, evaluations, archived){
    if(!evaluations.length){
      return `<div class="caSection ${archived?"archived":""}">
        <h3 style="margin-bottom:8px;">${title}</h3>
        <p class="muted" style="margin:0;">Aucune évaluation.</p>
      </div>`;
    }
    return `<div class="caSection ${archived?"archived":""}">
      <h3 style="margin-bottom:8px;">${title}</h3>
      ${evaluations.map(renderEvalCard).join("")}
    </div>`;
  }

  function renderEvalCard(ev){
    return `<div class="caItem" data-id="${ev.id}">
      <div>
        <strong>${ev.activity}</strong>
        <p class="muted" style="margin:4px 0 0;">${new Date(ev.createdAt).toLocaleDateString("fr-FR")}</p>
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;">
        <a class="btn secondary" style="padding:4px 10px;" href="evaluation.html?class=${cls.id}&eval=${ev.id}">Ouvrir</a>
        <button class="btn secondary" type="button" style="padding:4px 10px;" data-action="archive" data-id="${ev.id}">${ev.archived?"Désarchiver":"Archiver"}</button>
        <button class="btn secondary" type="button" style="padding:4px 10px;" data-action="export" data-id="${ev.id}">Exporter</button>
        <button class="btn secondary danger" type="button" style="padding:4px 10px;" data-action="delete" data-id="${ev.id}">Supprimer</button>
      </div>
    </div>`;
  }

  function handleArchiveToggle(evaluation, fieldId){
    if(evaluation.archived){
      evaluation.archived = false;
      evaluation.status = "active";
      evaluation.archivedAt = null;
      window.EPSMatrix.saveState(state);
      openEvalModal(fieldId);
      promptRestoreImport();
    }else{
      evaluation.archived = true;
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

  function updateClassHeader(){
    if(classTitleEl) classTitleEl.textContent = cls.name;
    if(classMetaEl){
      classMetaEl.textContent = `Prof ${cls.teacher || "—"} • ${cls.students.length} élèves • Site ${cls.site || "—"}`;
    }
  }

  function exportClassBackup(){
    try{
      const payload = {
        app: "EPS Matrix",
        formatVersion: 1,
        kind: "epsmatrix.classBackup",
        backupAt: new Date().toISOString(),
        schemaVersion: window.EPSMatrix.CURRENT_SCHEMA_VERSION,
        classPayload: structuredClone(cls)
      };
      const safeName = window.EPSMatrix.sanitizeFileName(cls.name || "Classe");
      const filename = `EPSMatrix_${safeName}_${formatTimestamp(new Date())}.epsbackup.json`;
      downloadContent(filename, JSON.stringify(payload, null, 2), "application/json");
    }catch(err){
      console.error("Export classe impossible", err);
      alert("Impossible de sauvegarder cette classe.");
    }
  }

  function handleClassBackupImport(event){
    const file = event.target.files?.[0];
    if(!file) return;
    const reader = new FileReader();
    reader.onload = ()=>{
      let payload;
      try{
        payload = JSON.parse(reader.result);
      }catch(err){
        console.error("Import classe impossible (JSON)", err);
        alert("Fichier illisible (JSON invalide)");
        event.target.value = "";
        return;
      }
      try{
        const envelope = normalizeClassBackupEnvelope(payload);
        const migratedClass = migrateClassPayload(envelope);
        const suffix = formatRestoreLabel(envelope.backupAt);
        const report = mergeClassBackup(migratedClass, suffix);
        window.EPSMatrix.saveState(state);
        updateClassHeader();
        render();
        alert(report);
      }catch(err){
        console.error("Import classe impossible", err);
        if(err.userMessage){
          alert(err.userMessage);
        }else{
          alert(`Restauration échouée: ${err.message || err}`);
        }
      }finally{
        event.target.value = "";
      }
    };
    reader.readAsText(file, "utf-8");
  }

  function migrateClassPayload(payload){
    const schemaVersion = Number.isFinite(payload?.schemaVersion) ? payload.schemaVersion : 1;
    const classPayload = (payload && payload.classPayload && typeof payload.classPayload === "object")
      ? payload.classPayload
      : {};
    try{
      const envelope = window.EPSMatrix.migrateState({
        schemaVersion,
        classes: [structuredClone(classPayload)]
      });
      if(!envelope.classes?.length){
        throw userError("Sauvegarde vide/incomplète.");
      }
      return envelope.classes[0];
    }catch(err){
      throw userError(`Migration impossible (${err.message || err})`);
    }
  }

  function mergeClassBackup(rawClass, suffix){
    if(!rawClass) return "Aucune donnée importée.";
    const imported = prepareClassPayload(rawClass);
    if(!Array.isArray(cls.students)) cls.students = [];
    if(!Array.isArray(cls.evaluations)) cls.evaluations = [];
    const existingStudents = new Set(cls.students.map((stu)=>stu.id));
    let studentsAdded = 0;
    imported.students.forEach((student)=>{
      if(!existingStudents.has(student.id)){
        cls.students.push(student);
        existingStudents.add(student.id);
        studentsAdded++;
      }
    });
    cls.notes = window.EPSMatrix.normalizeNotes(cls.notes || {}, cls);
    const existingEvalIds = new Set(cls.evaluations.map((ev)=>ev.id));
    let evalAdded = 0;
    let evalDuplicated = 0;
    imported.evaluations.forEach((evaluation)=>{
      if(existingEvalIds.has(evaluation.id)){
        const duplicated = duplicateEvaluationForClass(evaluation, suffix);
        cls.evaluations.unshift(duplicated);
        evalDuplicated++;
      }else{
        cls.evaluations.unshift(window.EPSMatrix.normalizeEvaluation(evaluation, cls));
        existingEvalIds.add(evaluation.id);
        evalAdded++;
      }
    });
    return `${evalAdded} évaluation(s) ajoutée(s), ${evalDuplicated} dupliquée(s), ${studentsAdded} élève(s) ajouté(s).`;
  }

  function prepareClassPayload(rawClass){
    const clone = structuredClone(rawClass || {});
    clone.id = clone.id || window.EPSMatrix.genId("cls");
    clone.students = Array.isArray(clone.students) ? clone.students.map((stu)=>({
      id: stu?.id || window.EPSMatrix.genId("stu"),
      name: stu?.name || "",
      groupTag: stu?.groupTag || "",
      absent: Boolean(stu?.absent),
      dispense: Boolean(stu?.dispense),
      niveau: stu?.niveau || "",
      projet1: stu?.projet1 || "",
      projet2: stu?.projet2 || "",
      commentaire: stu?.commentaire || ""
    })) : [];
    clone.notes = window.EPSMatrix.normalizeNotes(clone.notes || {}, clone);
    clone.evaluations = Array.isArray(clone.evaluations)
      ? clone.evaluations.map((evaluation)=>window.EPSMatrix.normalizeEvaluation(evaluation, clone))
      : [];
    return clone;
  }

  function duplicateEvaluationForClass(evaluation, suffix){
    const copy = structuredClone(evaluation || {});
    copy.id = window.EPSMatrix.genId("eval");
    copy.activity = `${copy.activity || "Évaluation"} (restaurée ${suffix})`;
    copy.createdAt = Date.now();
    copy.archived = false;
    copy.status = "active";
    copy.archivedAt = null;
    if(copy.data?.meta){
      copy.data.meta.activity = copy.activity;
    }
    return window.EPSMatrix.normalizeEvaluation(copy, cls);
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

  function normalizeClassBackupEnvelope(raw){
    if(!raw || typeof raw !== "object"){
      throw userError("Sauvegarde vide/incomplète.");
    }
    if(raw.kind === "epsmatrix.appBackup"){
      throw userError("Ceci est une sauvegarde globale (appBackup). À importer depuis Mes classes.");
    }
    if(typeof raw.version !== "undefined" && raw.evaluation){
      throw userError("Ceci est une archive d’évaluation (.epsarchive.json). Utilise Importer une archive.");
    }
    if(raw.kind && raw.kind !== "epsmatrix.classBackup"){
      throw userError(`Type de sauvegarde non pris en charge (${raw.kind}).`);
    }
    const classPayload = raw.classPayload;
    if(!classPayload || typeof classPayload !== "object"){
      throw userError("Sauvegarde vide/incomplète.");
    }
    return {
      schemaVersion: typeof raw.schemaVersion === "number" ? raw.schemaVersion : 1,
      backupAt: raw.backupAt,
      classPayload
    };
  }

  function userError(message){
    const err = new Error(message);
    err.userMessage = message;
    return err;
  }
  async function handleNewEvaluationRequest(){
    let input = null;
    if(window.EPSPrompt?.prompt){
      input = await window.EPSPrompt.prompt({
        title:"Champ d'apprentissage",
        message:"Entre CA1 à CA5 pour créer une évaluation ou NOTE pour ouvrir le bloc note.",
        defaultValue:"CA4",
        placeholder:"CA1, CA2, CA3...",
        allowEmpty:false
      });
    }else{
      console.warn("Module de saisie indisponible, fallback sur prompt natif.");
      input = window.prompt("Champ d'apprentissage (modale indisponible)", "CA4");
    }
    if(!input) return;
    const value = input.trim().toUpperCase();
    if(value.startsWith("BLOC") || value === "NOTE"){
      window.location.href = `notes.html?class=${cls.id}`;
      return;
    }
    const field = window.EPSMatrix.LEARNING_FIELDS.find((lf)=>lf.id === value);
    const chosen = field && field.id !== "NOTE" ? field.id : "CA4";
    window.location.href = `evaluation.html?class=${cls.id}&field=${chosen}`;
  }
})();
