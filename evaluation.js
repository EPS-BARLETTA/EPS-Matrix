(async function(){
  const params = new URLSearchParams(window.location.search);
  const classId = params.get("class");
  if(!classId){ window.location.href = "classes.html"; return; }
  const field = params.get("field");
  let evalId = params.get("eval");
  const state = window.EPSMatrix.loadState();
  const cls = state.classes.find((c)=>c.id === classId);
  if(!cls){ window.location.href = "classes.html"; return; }

  if(!evalId && field){
    const createdEvaluation = await createEvaluationFromField(field);
    if(!createdEvaluation){
      window.location.href = `class.html?class=${classId}`;
      return;
    }
    evalId = createdEvaluation.id;
  }

  const evaluation = cls.evaluations.find((ev)=>ev.id === evalId);
  if(!evaluation){ window.location.href = `class.html?class=${classId}`; return; }
  if(evaluation.learningField === "MISC"){ evaluation.learningField = "NOTE"; window.EPSMatrix.saveState(state); }
  if(!Array.isArray(evaluation.data.baseFields)){
    evaluation.data.baseFields = window.EPSMatrix.DEFAULT_BASE_FIELDS.slice();
    window.EPSMatrix.saveState(state);
  }
  if(typeof evaluation.data.showNote !== "boolean"){
    evaluation.data.showNote = false;
    window.EPSMatrix.saveState(state);
  }
  evaluation.data.students.forEach((stu)=>window.EPSMatrix.ensureTerrainStudentFields(stu));
  const hadTerrainMode = Boolean(evaluation.data.terrainMode);
  evaluation.data.terrainMode = window.EPSMatrix.normalizeTerrainMode(evaluation.data.terrainMode, evaluation.data.students);
  if(!hadTerrainMode){
    window.EPSMatrix.saveState(state);
  }

  const statsEl = document.getElementById("evalStats");
  const thead = document.getElementById("thead");
  const tbody = document.getElementById("tbody");
  const configModal = document.getElementById("configModal");
  const scoringModal = document.getElementById("scoringModal");
  const configList = document.getElementById("configList");
  const scoringList = document.getElementById("scoringList");
  const baseFieldOptions = document.getElementById("baseFieldOptions");
  const baseFieldCatalog = window.EPSMatrix.BASE_FIELDS;
  const chatgptModal = document.getElementById("chatgptModal");
  const chatgptPrompt = document.getElementById("chatgptPrompt");
  const btnCopyPrompt = document.getElementById("btnCopyPrompt");
  const btnOpenChatGPT = document.getElementById("btnOpenChatGPT");
  const btnToggleNote = document.getElementById("btnToggleNote");
  const terrainPanel = document.getElementById("terrainPanel");
  const terrainToggle = document.getElementById("toggleTerrainMode");
  const terrainCountInput = document.getElementById("terrainCountInput");
  const btnInitTerrains = document.getElementById("btnInitTerrains");
  const terrainGrid = document.getElementById("terrainGrid");
  const terrainDisabledHint = document.getElementById("terrainDisabledHint");
  const terrainMatchesList = document.getElementById("terrainMatchesList");
  const matchModal = document.getElementById("matchModal");
  const matchModalTitle = document.getElementById("matchModalTitle");
  const matchWinnerSelect = document.getElementById("matchWinnerSelect");
  const matchLoserSelect = document.getElementById("matchLoserSelect");
  const matchScoreInput = document.getElementById("matchScoreInput");
  const matchRefSelect = document.getElementById("matchRefSelect");
  const matchForfeitToggle = document.getElementById("matchForfeitToggle");
  const matchForfeitSelect = document.getElementById("matchForfeitSelect");
  const correctionStudentSelect = document.getElementById("correctionStudentSelect");
  const correctionTargetGroup = document.getElementById("correctionTargetGroup");
  const correctionRefSelect = document.getElementById("correctionRefSelect");
  const btnApplyMove = document.getElementById("btnApplyMove");
  const btnApplyRef = document.getElementById("btnApplyRef");
  const btnValidateMatch = document.getElementById("btnValidateMatch");
  const resultsPanel = document.getElementById("resultsPanel");
  const resultsBody = document.getElementById("resultsBody");
  const btnExportResultsCsv = document.getElementById("btnExportResultsCsv");
  const playerModal = document.getElementById("playerModal");
  const playerModalTitle = document.getElementById("playerModalTitle");
  const playerModalMeta = document.getElementById("playerModalMeta");
  const playerNoteInput = document.getElementById("playerNoteInput");
  const playerRoleSelect = document.getElementById("playerRoleSelect");
  const btnSavePlayer = document.getElementById("btnSavePlayer");
  const studentSummaryModal = document.getElementById("studentSummaryModal");
  const studentSummaryTitle = document.getElementById("studentSummaryTitle");
  const studentSummaryMeta = document.getElementById("studentSummaryMeta");
  const studentSummaryStats = document.getElementById("studentSummaryStats");
  const studentMatchesList = document.getElementById("studentMatchesList");
  let currentMatchGroupIndex = null;
  let editingPlayerId = null;
  let viewingStudentId = null;

  const evalTitleEl = document.getElementById("evalTitle");
  const evalMetaEl = document.getElementById("evalMeta");
  evalTitleEl?.setAttribute("title", "Cliquer pour renommer l'évaluation");
  renderHeader();
  evalTitleEl?.addEventListener("click", ()=>{ promptRenameEvaluation(); });

  function renderHeader(){
    const dateLabel = formatEvalDate(evaluation.createdAt);
    if(evalTitleEl){
      evalTitleEl.textContent = `${dateLabel} – ${evaluation.activity}`;
    }
    if(evalMetaEl){
      evalMetaEl.textContent = `${cls.name} • Prof ${cls.teacher || "—"} • ${evaluation.data.students.length} élèves`;
    }
  }

  function formatEvalDate(timestamp){
    const date = timestamp ? new Date(timestamp) : new Date();
    return date.toLocaleDateString("fr-FR", {weekday:"short", day:"2-digit", month:"2-digit", year:"numeric"});
  }

  async function promptRenameEvaluation(){
    const current = evaluation.activity || "";
    const next = await openTextPrompt({
      title:"Renommer l'évaluation",
      message:"Saisis le nouveau titre.",
      defaultValue: current,
      placeholder:"Évaluation escalade",
      allowEmpty:false,
      treatCancelAsEmpty:false
    });
    if(next === null) return;
    const trimmed = next.trim();
    if(!trimmed || trimmed === current) return;
    evaluation.activity = trimmed;
    if(evaluation.data?.meta){
      evaluation.data.meta.activity = trimmed;
    }
    persist();
    renderHeader();
  }
  document.getElementById("backClass").href = `class.html?class=${classId}`;

  const LEVEL_MAP = {
    apa:{A:"peak",PA:"warn",NA:"low"},
    numeric4:{"4":"peak","3":"mid","2":"warn","1":"low"},
    letter4:{A:"peak",B:"mid",C:"warn",D:"low"},
    engagement:{Oui:"mid",Partiel:"warn",Non:"low"},
    validation:{"Validé":"mid","À ajuster":"warn"},
    check:{"✅":"mid","❌":"warn"}
  };
  const GROUP_VALUES = ["","1","2","3","4","5","6","7","8","9","10","11","12","13","14","15","16","17","18","19","20"];
  const GROUP_COLORS = ["#e0f2fe","#fee2e2","#dcfce7","#fef9c3","#ede9fe","#fce7f3","#cffafe"];

  let criteriaDraft = [];
  let baseFieldDraft = [];
  let scoringDraft = {};
  let criterionMap = buildCriterionMap();

  const fieldMeta = window.EPSMatrix.LEARNING_FIELDS.find((lf)=>lf.id === evaluation.learningField);
  if(fieldMeta){
    document.body.style.setProperty("--accent", fieldMeta.color);
  }
  const classLevelLabel = describeClassLevel(cls.name);

  render();
  setupTerrainEvents();

  function render(){
    criterionMap = buildCriterionMap();
    renderTable();
    updateStats();
    updateNoteToggle();
    renderTerrainSection();
    renderResultsTable();
  }

  function renderTable(){
    const showNote = Boolean(evaluation.data.showNote);
    const baseFields = getActiveBaseFields();
    const headers = ["Prénom","Groupe", ...baseFields.map((field)=>field.label), ...evaluation.data.criteria.map((c)=>c.label||"Critère")];
    if(showNote){ headers.push("Note"); }
    headers.push("Statut");
    thead.innerHTML = headers.map((h)=>`<th>${h}</th>`).join("");
    const orderedStudents = sortStudentsForDisplay(evaluation.data.students);
    tbody.innerHTML = orderedStudents.map((stu)=>rowHTML(stu, baseFields, showNote)).join("");
    tbody.querySelectorAll("select[data-field]").forEach(decorateSelect);
    applyGroupingStyles();
  }

  function rowHTML(stu, baseFields, showNote){
    const criteriaCells = evaluation.data.criteria.map((crit)=>{
      const info = window.EPSMatrix.CRITERIA_TYPES[crit.type] || {};
      if(info.isComment){
        return `<td><textarea data-field="${crit.id}">${stu[crit.id]||""}</textarea></td>`;
      }
      const opts = getOptionsForCriterion(crit, info);
      const options = opts.map((opt)=>`<option value="${opt}" ${stu[crit.id]===opt?"selected":""}>${opt||"—"}</option>`).join("");
      return `<td><select class="levelSelect" data-field="${crit.id}">${options}</select></td>`;
    }).join("");
    const baseCells = baseFields.map((field)=>baseFieldCell(field, stu)).join("");
    const noteCell = showNote ? `<td data-cell="note"><strong>${computeScore(stu)}</strong></td>` : "";
    const rowClass = stu.absent ? "isAbsent" : (stu.dispense ? "isDispense" : "");
    const classAttr = rowClass ? ` class="${rowClass}"` : "";
    return `<tr${classAttr} data-id="${stu.id}" data-name="${stu.name}" data-group="${stu.groupTag||""}">
      <td>${nameCell(stu)}</td>
      <td>${groupCell(stu)}</td>
      ${baseCells}
      ${criteriaCells}
      ${noteCell}
      <td data-cell="status">${statusHTML(stu)}</td>
    </tr>`;
  }
  function nameCell(stu){
    const absentClass = stu.absent ? "active" : "";
    const dispClass = stu.dispense ? "active" : "";
    return `<div class="nameCell">
      <span class="studentName">${stu.name}</span>
      <div class="presenceBadges">
        <button type="button" class="presenceToggle abs ${absentClass}" data-presence="abs" title="Marquer absent">ABS</button>
        <button type="button" class="presenceToggle disp ${dispClass}" data-presence="disp" title="Marquer dispensé">DISP</button>
      </div>
    </div>`;
  }

  function groupCell(stu){
    const options = GROUP_VALUES.map((value)=>{
      const label = value ? `T${value}` : "—";
      return `<option value="${value}" ${value===stu.groupTag?"selected":""}>${label}</option>`;
    }).join("");
    return `<select class="groupPicker" data-field="groupTag">${options}</select>`;
  }

  function baseFieldCell(field, stu){
    const value = stu[field.id] || "";
    if(field.type === "textarea"){
      return `<td><textarea data-field="${field.id}">${value}</textarea></td>`;
    }
    return `<td><input type="text" data-field="${field.id}" value="${value}" /></td>`;
  }

  function getOptionsForCriterion(crit, info){
    let options = [];
    if(info.isCustom){
      options = Array.isArray(crit.options) ? crit.options.filter(Boolean) : [];
    }else if(Array.isArray(info.options)){
      options = info.options.slice();
    }
    if(!options.length || options[0] !== "") options.unshift("");
    return options;
  }

  function decorateSelect(select){
    const crit = criterionMap[select.dataset.field];
    if(!crit){ select.removeAttribute("data-level"); return; }
    const info = window.EPSMatrix.CRITERIA_TYPES[crit.type];
    if(info?.isComment){ select.removeAttribute("data-level"); return; }
    const level = computeLevel(crit.type, select.value);
    if(level){ select.dataset.level = level; }
    else{ select.removeAttribute("data-level"); }
  }

  function applyGroupingStyles(){
    const rows = Array.from(tbody.querySelectorAll("tr"));
    let prev = null;
    rows.forEach((row)=>{
      const group = row.dataset.group || "";
      const color = groupColor(group);
      row.style.setProperty("--group-bg", color || "transparent");
      row.style.setProperty("--group-sep", group ? "#f97316" : "transparent");
      row.classList.toggle("grouped", Boolean(group));
      if(group && group !== prev){
        row.classList.add("groupStart");
      }else{
        row.classList.remove("groupStart");
      }
      prev = group;
    });
  }

  function groupPriority(value){
    if(!value) return 999;
    const idx = GROUP_VALUES.indexOf(value);
    return idx === -1 ? 500 : idx;
  }

  function groupColor(value){
    if(!value) return "";
    const idx = GROUP_VALUES.indexOf(value);
    if(idx === -1) return GROUP_COLORS[Math.abs(hashCode(value)) % GROUP_COLORS.length];
    return GROUP_COLORS[idx % GROUP_COLORS.length];
  }

  function computeLevel(type, value){
    const map = LEVEL_MAP[type];
    if(map && map[value]) return map[value];
    if(value === "") return "";
    return "";
  }

  function sortStudentsForDisplay(list){
    return (list || []).map((stu, idx)=>({stu, idx})).sort((a, b)=>{
      const priorityA = studentDisplayPriority(a.stu);
      const priorityB = studentDisplayPriority(b.stu);
      if(priorityA !== priorityB) return priorityA - priorityB;
      if(priorityA === 0){
        const groupA = window.EPSMatrix.parseGroupIndex(a.stu.groupTag) || 999;
        const groupB = window.EPSMatrix.parseGroupIndex(b.stu.groupTag) || 999;
        if(groupA !== groupB) return groupA - groupB;
      }
      return a.idx - b.idx;
    }).map((entry)=>entry.stu);
  }

  function studentDisplayPriority(student){
    if(student?.absent) return 2;
    if(student?.dispense) return 1;
    return 0;
  }

  function computeScore(stu){
    return window.EPSMatrix.computeStudentNote(evaluation, stu);
  }

  function statusHTML(stu){
    if(stu.absent) return '<span class="status danger">Absent</span>';
    if(stu.dispense) return '<span class="status warning">Dispensé</span>';
    return isValidated(stu) ? '<span class="status success">Validé</span>' : '<span class="status warning">En cours</span>';
  }

  function isValidated(stu){
    if(!evaluation.data.criteria.length) return false;
    return evaluation.data.criteria.every((crit)=>{
      const info = window.EPSMatrix.CRITERIA_TYPES[crit.type];
      if(info?.isComment) return Boolean(stu[crit.id]);
      if(info?.top) return (stu[crit.id]||"") === info.top;
      return Boolean(stu[crit.id]);
    });
  }

  function updateStats(){
    const tracked = evaluation.data.students.filter((stu)=>!stu.absent);
    const stats = {
      count: tracked.length,
      validated: tracked.filter((stu)=>isValidated(stu)).length,
      saved: new Date(evaluation.data.savedAt||Date.now()).toLocaleTimeString("fr-FR")
    };
    statsEl.innerHTML = `
      <div class="statCard"><span>Élèves suivis</span><strong>${stats.count}</strong></div>
      <div class="statCard"><span>Validés</span><strong>${stats.validated}</strong></div>
      <div class="statCard"><span>Dernière sauvegarde</span><strong>${stats.saved}</strong></div>`;
  }

  tbody.addEventListener("input", handleFieldChange);
  tbody.addEventListener("change", handleFieldChange);
  tbody.addEventListener("click", handlePresenceClick);

  function handleFieldChange(event){
    const field = event.target.dataset.field;
    if(!field) return;
    const row = event.target.closest("tr");
    if(!row) return;
    const student = evaluation.data.students.find((stu)=>stu.id === row.dataset.id);
    if(!student) return;
    window.EPSMatrix.ensureTerrainStudentFields(student);
    const value = event.target.value;
    student[field] = value;
    evaluation.data.savedAt = Date.now();
    window.EPSMatrix.saveState(state);
    if(event.target.tagName === "SELECT" && field !== "groupTag"){
      decorateSelect(event.target);
    }
    if(field === "groupTag"){
      student.groupTag = window.EPSMatrix.formatGroupTag ? (window.EPSMatrix.formatGroupTag(value) || value) : value;
      if(student.role === "ref"){
        const groupIndex = window.EPSMatrix.parseGroupIndex(student.groupTag);
        if(groupIndex){
          enforceSingleRefForGroup(groupIndex, student.id);
        }
      }
      persist();
      render();
      return;
    }
    if(evaluation.data.showNote){
      const noteCell = row.querySelector('[data-cell="note"]');
      if(noteCell){ noteCell.innerHTML = `<strong>${computeScore(student)}</strong>`; }
    }
    row.querySelector('[data-cell="status"]').innerHTML = statusHTML(student);
    updateStats();
  }

  function handlePresenceClick(event){
    const btn = event.target.closest("[data-presence]");
    if(!btn) return;
    const row = btn.closest("tr");
    if(!row) return;
    const student = evaluation.data.students.find((stu)=>stu.id === row.dataset.id);
    if(!student) return;
    if(btn.dataset.presence === "abs"){
      student.absent = !student.absent;
      if(student.absent) student.dispense = false;
    }else if(btn.dataset.presence === "disp"){
      student.dispense = !student.dispense;
      if(student.dispense) student.absent = false;
    }
    persist();
    render();
  }


  document.getElementById("btnExportCsv")?.addEventListener("click", exportCSV);
  document.getElementById("inputImportCsv")?.addEventListener("change", handleImportCsv);
  document.getElementById("btnExportPdf")?.addEventListener("click", ()=>window.print());
  document.getElementById("btnTableOnly")?.addEventListener("click", ()=>{
    document.body.classList.toggle("table-only");
  });

  document.getElementById("btnConfigure")?.addEventListener("click", openConfigModal);
  document.getElementById("btnAddCriterion")?.addEventListener("click", ()=>{
    criteriaDraft.push(createEmptyCriterion());
    renderCriteriaDraft();
  });
  document.getElementById("btnSaveCriteria")?.addEventListener("click", saveCriteriaDraft);
  document.getElementById("btnScoring")?.addEventListener("click", openScoringModal);
  document.getElementById("btnSaveScoring")?.addEventListener("click", saveScoringDraft);
  btnToggleNote?.addEventListener("click", ()=>{
    evaluation.data.showNote = !evaluation.data.showNote;
    persist();
    render();
  });
  document.getElementById("btnChatGPT")?.addEventListener("click", ()=>{
    if(chatgptPrompt){
      chatgptPrompt.value = buildChatGPTPrompt();
    }
    chatgptModal?.classList.remove("hidden");
  });
  btnCopyPrompt?.addEventListener("click", ()=>{
    if(!chatgptPrompt) return;
    navigator.clipboard?.writeText(chatgptPrompt.value).then(()=>{
      btnCopyPrompt.textContent = "Copié !";
      setTimeout(()=>{ btnCopyPrompt.textContent = "Copier le prompt"; },1200);
    }).catch(()=>{
      alert("Copie impossible. Sélectionne le texte manuellement (⌘+C).");
    });
  });
  btnOpenChatGPT?.addEventListener("click", ()=>{
    window.open("https://chatgpt.com/", "_blank","noopener");
  });
  btnExportResultsCsv?.addEventListener("click", exportResultsCsv);
  resultsBody?.addEventListener("click", handleResultsClick);

  document.querySelectorAll("[data-close-modal]").forEach((btn)=>{
    btn.addEventListener("click", ()=>{
      const modal = btn.closest(".modal");
      if(modal){
        modal.classList.add("hidden");
        if(modal.id === "matchModal"){
          resetMatchModal();
        }else if(modal.id === "playerModal"){
          editingPlayerId = null;
        }else if(modal.id === "studentSummaryModal"){
          viewingStudentId = null;
          if(studentMatchesList) studentMatchesList.innerHTML = "";
          if(studentSummaryStats) studentSummaryStats.innerHTML = "";
        }
      }
    });
  });

  function openConfigModal(){
    criteriaDraft = evaluation.data.criteria.length ? structuredClone(evaluation.data.criteria) : [createEmptyCriterion()];
    baseFieldDraft = evaluation.data.baseFields && evaluation.data.baseFields.length ? evaluation.data.baseFields.slice() : [];
    renderBaseFieldOptions();
    renderCriteriaDraft();
    configModal.classList.remove("hidden");
  }

  function createEmptyCriterion(){
    return {id: window.EPSMatrix.genId("crit"), label:"", type:"apa", options:[]};
  }

  function renderCriteriaDraft(){
    if(!criteriaDraft.length){
      configList.innerHTML = '<p class="muted">Ajoute ton premier critère.</p>';
      return;
    }
    const typeOptions = (selected)=>Object.entries(window.EPSMatrix.CRITERIA_TYPES).map(([value, info])=>`<option value="${value}" ${value===selected?"selected":""}>${info.label}</option>`).join("");
    configList.innerHTML = criteriaDraft.map((crit)=>{
      const info = window.EPSMatrix.CRITERIA_TYPES[crit.type] || {};
      const customField = info.isCustom ? `<label>Options (séparées par une virgule)<textarea data-role="options">${(crit.options||[]).join(", ")}</textarea></label>` : "";
      return `<div class="criteriaCard" data-id="${crit.id}">
        <div class="criteriaHeader">
          <input type="text" data-role="label" placeholder="Nom du critère" value="${crit.label}" />
          <button class="iconButton" data-action="remove" title="Supprimer">×</button>
        </div>
        <label>Type<select data-role="type">${typeOptions(crit.type)}</select></label>
        ${customField}
      </div>`;
    }).join("");
    configList.querySelectorAll(".criteriaCard").forEach((card)=>{
      const id = card.dataset.id;
      const crit = criteriaDraft.find((c)=>c.id === id);
      const labelInput = card.querySelector('[data-role="label"]');
      const typeSelect = card.querySelector('[data-role="type"]');
      const removeBtn = card.querySelector('[data-action="remove"]');
      labelInput.addEventListener("input", ()=>{ crit.label = labelInput.value; });
      typeSelect.value = crit.type;
      typeSelect.addEventListener("change", ()=>{
        crit.type = typeSelect.value;
        if(window.EPSMatrix.CRITERIA_TYPES[crit.type]?.isCustom){
          if(!Array.isArray(crit.options)) crit.options = [];
        }else{
          delete crit.options;
        }
        renderCriteriaDraft();
      });
      if(removeBtn){
        removeBtn.addEventListener("click", ()=>{
          criteriaDraft = criteriaDraft.filter((c)=>c.id !== id);
          renderCriteriaDraft();
        });
      }
      const optionsField = card.querySelector('[data-role="options"]');
      if(optionsField){
        optionsField.addEventListener("input", ()=>{
          crit.options = optionsField.value.split(/[,\n]/).map((o)=>o.trim()).filter(Boolean);
        });
      }
    });
  }

  function saveCriteriaDraft(){
    const cleaned = criteriaDraft.filter((crit)=>crit.label.trim());
    const prevIds = new Set(evaluation.data.criteria.map((c)=>c.id));
    const nextIds = new Set(cleaned.map((c)=>c.id));
    evaluation.data.criteria = cleaned;
    evaluation.data.baseFields = baseFieldDraft.slice();
    evaluation.data.students.forEach((stu)=>{
      cleaned.forEach((crit)=>{ if(typeof stu[crit.id] === "undefined") stu[crit.id] = ""; });
      prevIds.forEach((id)=>{ if(!nextIds.has(id)) delete stu[id]; });
    });
    const nextScoring = {};
    cleaned.forEach((crit)=>{
      const info = window.EPSMatrix.CRITERIA_TYPES[crit.type] || {};
      if(info.isComment) return;
      const options = getOptionsForCriterion(crit, info).filter(Boolean);
      const previous = evaluation.data.scoring[crit.id] || {};
      nextScoring[crit.id] = {};
      options.forEach((opt)=>{
        if(Object.prototype.hasOwnProperty.call(previous, opt)){
          const parsed = Number(previous[opt]);
          nextScoring[crit.id][opt] = Number.isFinite(parsed) ? parsed : 0;
        }else{
          nextScoring[crit.id][opt] = 0;
        }
      });
    });
    evaluation.data.scoring = nextScoring;
    persist();
    render();
    configModal.classList.add("hidden");
  }

  function openScoringModal(){
    if(!evaluation.data.criteria.length){
      alert("Ajoute d'abord un critère.");
      return;
    }
    scoringDraft = structuredClone(evaluation.data.scoring || {});
    renderScoringDraft();
    scoringModal.classList.remove("hidden");
  }

  function renderScoringDraft(){
    const cards = evaluation.data.criteria.map((crit)=>{
      const info = window.EPSMatrix.CRITERIA_TYPES[crit.type] || {};
      if(info.isComment){
        return `<div class="criteriaCard" data-id="${crit.id}"><div class="criteriaHeader"><strong>${crit.label}</strong></div><p class="muted">Commentaire libre – pas de points.</p></div>`;
      }
      const options = getOptionsForCriterion(crit, info).filter(Boolean);
      const scoring = scoringDraft[crit.id] || {};
      const rows = options.map((opt)=>{
        const value = scoring[opt] ?? "";
        return `<div class="scoreRow"><span>${opt}</span><input type="number" step="0.5" value="${value}" data-option="${opt}" /></div>`;
      }).join("");
      return `<div class="criteriaCard" data-id="${crit.id}">
        <div class="criteriaHeader"><strong>${crit.label}</strong></div>
        ${rows || '<p class="muted">Aucune option.</p>'}
      </div>`;
    }).join("");
    scoringList.innerHTML = cards;
    scoringList.querySelectorAll(".criteriaCard").forEach((card)=>{
      const id = card.dataset.id;
      card.querySelectorAll("input[type='number']").forEach((input)=>{
        input.addEventListener("input", ()=>{
          if(!scoringDraft[id]) scoringDraft[id] = {};
          const val = Number(input.value);
          scoringDraft[id][input.dataset.option] = isNaN(val) ? 0 : val;
        });
      });
    });
  }

  function saveScoringDraft(){
    evaluation.data.scoring = scoringDraft;
    persist();
    scoringModal.classList.add("hidden");
    render();
  }

  function exportCSV(){
    const csv = window.EPSMatrix.buildEvaluationCsv(evaluation);
    const fileName = `${window.EPSMatrix.sanitizeFileName(cls.name)}-${window.EPSMatrix.sanitizeFileName(evaluation.activity)}.csv`;
    downloadFile(fileName, csv, "text/csv");
  }

  function handleImportCsv(event){
    const file = event.target.files?.[0];
    if(!file) return;
    const reader = new FileReader();
    reader.onload = ()=>{
      try{
        const report = applyImportedCsv(reader.result);
        alert(report);
      }catch(err){
        console.error(err);
        alert("Impossible de lire ce CSV. Vérifie qu'il provient de l'export EPS Matrix.");
      }
      event.target.value = "";
    };
    reader.readAsText(file, "utf-8");
  }

  function applyImportedCsv(text){
    if(!text) throw new Error("CSV vide");
    const lines = text.trim().split(/\r?\n/);
    if(lines.length < 2) throw new Error("Pas de données");
    const header = parseCsvLine(lines[0]);
    const baseFields = getActiveBaseFields();
    const criteria = evaluation.data.criteria;
    const headerMap = {};
    header.forEach((title, idx)=>{ headerMap[title.trim().toLowerCase()] = idx; });
    const prenomIdx = headerMap["prenom"];
    if(typeof prenomIdx === "undefined") throw new Error("Colonne prénom manquante");
    const groupIdx = headerMap["groupe"];
    const studentIdIdx = headerMap["student_id"];
    const absentIdx = headerMap["absent"];
    const dispenseIdx = headerMap["dispense"];
    const studentById = new Map();
    const nameBuckets = new Map();
    evaluation.data.students.forEach((stu)=>{
      if(stu.id){ studentById.set(String(stu.id), stu); }
      const key = window.EPSMatrix.normalizeStudentKey(stu.name);
      if(!key) return;
      if(!nameBuckets.has(key)){ nameBuckets.set(key, []); }
      nameBuckets.get(key).push(stu);
    });
    const report = {updated:0, unknownId:0, ambiguous:0, unknownName:0};
    lines.slice(1).forEach((line, rowIdx)=>{
      if(!line.trim()) return;
      const cells = parseCsvLine(line);
      const studentId = typeof studentIdIdx !== "undefined" ? (cells[studentIdIdx]||"").trim() : "";
      let student = null;
      if(studentId){
        student = studentById.get(studentId);
        if(!student){ report.unknownId++; }
      }
      const nameRaw = cells[prenomIdx] || "";
      if(!student){
        const normalized = window.EPSMatrix.normalizeStudentKey(nameRaw);
        if(normalized){
          const matches = nameBuckets.get(normalized) || [];
          if(matches.length === 1){
            student = matches[0];
          }else if(matches.length > 1){
            report.ambiguous++;
          }else if(nameRaw.trim()){
            report.unknownName++;
          }
        }else if(nameRaw.trim()){
          report.unknownName++;
        }
      }
      if(!student) return;
      if(groupIdx !== undefined){ student.groupTag = cells[groupIdx] || ""; }
      if(typeof absentIdx !== "undefined"){
        const isAbsent = parseBooleanCell(cells[absentIdx]);
        student.absent = isAbsent;
        if(isAbsent){ student.dispense = false; }
      }
      if(typeof dispenseIdx !== "undefined"){
        const isDisp = parseBooleanCell(cells[dispenseIdx]);
        student.dispense = isDisp;
        if(isDisp){ student.absent = false; }
      }
      baseFields.forEach((field)=>{
        const idx = header.indexOf(field.label);
        if(idx !== -1){ student[field.id] = cells[idx] || ""; }
      });
      criteria.forEach((crit)=>{
        const idx = header.indexOf(crit.label);
        if(idx !== -1){ student[crit.id] = cells[idx] || ""; }
      });
      report.updated++;
    });
    persist();
    render();
    return [
      `${report.updated} élève(s) mis à jour.`,
      report.unknownId ? `${report.unknownId} identifiant(s) non reconnus.` : "",
      report.ambiguous ? `${report.ambiguous} nom(s) ambigus (doublons).` : "",
      report.unknownName ? `${report.unknownName} nom(s) introuvables.` : ""
    ].filter(Boolean).join("\n") || "Import CSV terminé.";
  }

  function parseCsvLine(line){
    const result = [];
    let current = "";
    let inQuotes = false;
    for(let i=0;i<line.length;i++){
      const char = line[i];
      if(inQuotes){
        if(char === '"'){
          if(line[i+1] === '"'){ current += '"'; i++; }
          else{ inQuotes = false; }
        }else{
          current += char;
        }
      }else{
        if(char === '"'){ inQuotes = true; }
        else if(char === ","){
          result.push(current);
          current = "";
        }else{
          current += char;
        }
      }
    }
    result.push(current);
    return result;
  }

  function parseBooleanCell(value){
    const normalized = String(value || "").trim().toLowerCase();
    if(!normalized) return false;
    return normalized === "1" || normalized === "true" || normalized === "vrai" || normalized === "oui" || normalized === "yes" || normalized === "y" || normalized === "x";
  }

  function downloadFile(filename, content, type){
    const blob = new Blob([content], {type});
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    setTimeout(()=>{ URL.revokeObjectURL(link.href); link.remove(); }, 0);
  }

  function persist(){
    evaluation.data.savedAt = Date.now();
    window.EPSMatrix.saveState(state);
  }

  async function createEvaluationFromField(fieldId){
    const activityInput = await openTextPrompt({
      title:"Nom de l'évaluation",
      message:"Indique un titre pour cette évaluation.",
      defaultValue:"",
      placeholder:"Escalade 5e",
      allowEmpty:true,
      treatCancelAsEmpty:true
    });
    const label = (activityInput || "").trim() || `Évaluation ${new Date().toLocaleDateString("fr-FR")}`;
    const criteria = [];
    const evaluation = {
      id: window.EPSMatrix.genId("eval"),
      activity: label || "Évaluation",
      learningField: fieldId,
      status: "active",
      archived: false,
      createdAt: Date.now(),
      archivedAt: null,
      data:{
        meta:{
          classe:cls.name,
          activity:label||"Évaluation",
          enseignant:cls.teacher,
          site:cls.site,
          date:new Date().toLocaleDateString("fr-FR")
        },
        baseFields: window.EPSMatrix.DEFAULT_BASE_FIELDS.slice(),
        criteria,
        students: cls.students.map((stu)=>window.EPSMatrix.createEvalStudent(stu.name, criteria)),
        scoring: window.EPSMatrix.buildDefaultScoring(criteria),
        savedAt: Date.now(),
        showNote: false
      }
    };
    cls.evaluations.unshift(evaluation);
    window.EPSMatrix.saveState(state);
    return evaluation;
  }

  async function openTextPrompt(options){
    const modalOptions = {
      title: options?.title || "Saisie",
      message: options?.message || "",
      defaultValue: options?.defaultValue || "",
      placeholder: options?.placeholder || "",
      allowEmpty: Boolean(options?.allowEmpty)
    };
    if(window.EPSPrompt?.prompt){
      const result = await window.EPSPrompt.prompt(modalOptions);
      if(result === null && options?.treatCancelAsEmpty){
        return "";
      }
      return result;
    }
    console.warn("Module de saisie indisponible, fallback sur prompt natif.");
    const lines = [`${modalOptions.title} – modale indisponible.`];
    if(modalOptions.message){ lines.push(modalOptions.message); }
    const fallback = window.prompt(lines.join("\n"), modalOptions.defaultValue);
    if(fallback === null){
      return options?.treatCancelAsEmpty ? "" : null;
    }
    return fallback;
  }

  function getActiveBaseFields(){
    if(!Array.isArray(evaluation.data.baseFields)) return [];
    return evaluation.data.baseFields.map((id)=>baseFieldCatalog.find((field)=>field.id === id)).filter(Boolean);
  }
  function renderBaseFieldOptions(){
    if(!baseFieldOptions) return;
    const checklist = baseFieldCatalog.map((field)=>{
      const checked = baseFieldDraft.includes(field.id) ? "checked" : "";
      return `<label class="baseFieldItem">
        <input type="checkbox" value="${field.id}" ${checked}/>
        <span>${field.label}</span>
      </label>`;
    }).join("");
    const emptyHint = baseFieldDraft.length ? "" : '<p class="muted">Aucun champ sélectionné.</p>';
    baseFieldOptions.innerHTML = checklist + emptyHint;
    baseFieldOptions.querySelectorAll("input[type='checkbox']").forEach((input)=>{
      input.addEventListener("change", ()=>{
        syncBaseFieldDraft();
      });
    });
  }

  function syncBaseFieldDraft(){
    if(!baseFieldOptions) return;
    const selected = new Set(Array.from(baseFieldOptions.querySelectorAll("input[type='checkbox']"))
      .filter((input)=>input.checked)
      .map((input)=>input.value));
    baseFieldDraft = baseFieldCatalog.filter((field)=>selected.has(field.id)).map((field)=>field.id);
    renderBaseFieldOptions();
  }
  function buildCriterionMap(){
    const map = {};
    evaluation.data.criteria.forEach((crit)=>{ map[crit.id] = crit; });
    return map;
  }

  function hashCode(str){
    let hash = 0;
    for(let i=0;i<str.length;i++){
      hash = ((hash<<5) - hash) + str.charCodeAt(i);
      hash |= 0;
    }
    return hash;
  }

  function describeClassLevel(name=""){
    const lower = name.toLowerCase();
    const match = lower.match(/(\d)(?:e|eme|ème)?/);
    if(match){
      const digit = match[1];
      return `classe de ${digit}e (${name})`;
    }
    if(lower.includes("cm2")) return `classe de CM2 (${name})`;
    if(lower.includes("cm1")) return `classe de CM1 (${name})`;
    if(lower.includes("seconde")) return `classe de Seconde (${name})`;
    if(lower.includes("premiere")) return `classe de Première (${name})`;
    if(lower.includes("term")) return `classe de Terminale (${name})`;
    return `classe ${name}`;
  }

  function buildChatGPTPrompt(){
    const fieldLabel = fieldMeta ? `${fieldMeta.title} (${fieldMeta.desc})` : "champ d'apprentissage EPS";
    const activity = evaluation.activity || "Évaluation EPS";
    const total = cls.students.length;
    return [
      `Contexte : professeur d'EPS intervenant auprès d'une ${classLevelLabel} de ${total} élèves.`,
      `Activité évaluée : "${activity}". Champ d'apprentissage ciblé : ${fieldLabel}.`,
      `Objectif : proposer une grille d'évaluation critériée (3 à 5 items maximum) conforme au dernier BO EPS en vigueur.`,
      `Contraintes :`,
      `- Chaque critère doit préciser l'attendu sécuritaire ou technique prioritaire.`,
      `- Pour chaque critère, fournir des niveaux d'acquisition (A = acquis, PA = partiellement acquis, NA = non acquis) ET une équivalence niveaux 1 à 4 ou lettres A-D.`,
      `- Indiquer une pondération indicative sur 20 et des conseils d'observation pour l'enseignant.`,
      `- Mentionner comment intégrer un commentaire libre si nécessaire.`,
      `Format attendu : tableau Markdown clair (colonnes : Critère | Attendu | Niveaux A/PA/NA | Niveaux 1-4 | Pondération | Notes prof).`
    ].join("\n");
  }

  function updateNoteToggle(){
    if(!btnToggleNote) return;
    const active = Boolean(evaluation.data.showNote);
    btnToggleNote.textContent = active ? "Masquer la note" : "Afficher la note";
    btnToggleNote.classList.toggle("active", active);
  }

  function setupTerrainEvents(){
    if(!terrainPanel) return;
    if(terrainToggle){
      terrainToggle.checked = Boolean(evaluation.data.terrainMode.enabled);
      terrainToggle.addEventListener("change", ()=>{
        evaluation.data.terrainMode.enabled = terrainToggle.checked;
        if(terrainToggle.checked){
          enforceSingleRefEverywhere();
        }
        persist();
        renderTerrainSection();
        renderResultsTable();
      });
    }
    if(terrainCountInput){
      terrainCountInput.value = evaluation.data.terrainMode.terrainCount;
      terrainCountInput.addEventListener("change", ()=>{
        terrainCountInput.value = clampTerrainCountInput(terrainCountInput.value);
        evaluation.data.terrainMode.terrainCount = Number(terrainCountInput.value);
        persist();
      });
    }
    btnInitTerrains?.addEventListener("click", initializeTerrains);
    terrainGrid?.addEventListener("click", handleTerrainGridClick);
    matchForfeitToggle?.addEventListener("change", ()=>{
      if(matchForfeitSelect){
        matchForfeitSelect.disabled = !matchForfeitToggle.checked;
      }
    });
    btnApplyMove?.addEventListener("click", applyManualMove);
    btnApplyRef?.addEventListener("click", applyManualRef);
    btnValidateMatch?.addEventListener("click", handleMatchValidation);
    btnSavePlayer?.addEventListener("click", savePlayerModal);
  }

  function clampTerrainCountInput(value){
    return window.EPSMatrix.clampTerrainCount ? window.EPSMatrix.clampTerrainCount(value) : Math.min(MAX_TERRAINS, Math.max(1, Math.floor(Number(value)||1)));
  }

  function initializeTerrains(){
    const mode = evaluation.data.terrainMode;
    const count = clampTerrainCountInput(terrainCountInput?.value || mode.terrainCount);
    mode.terrainCount = count;
    assignGroupsRoundRobin(count);
    enforceSingleRefEverywhere();
    persist();
    render();
  }

  function assignGroupsRoundRobin(count){
    const present = evaluation.data.students.filter((stu)=>!stu.absent && !stu.dispense);
    present.forEach((stu, idx)=>{
      const target = (idx % count) + 1;
      setStudentGroup(stu, target);
      if(!stu.startGroupTag){
        stu.startGroupTag = String(target);
      }
      if(stu.role !== "ref"){
        stu.role = "player";
      }
    });
  }

  function setStudentGroup(student, groupIndex){
    const normalized = window.EPSMatrix.formatGroupTag ? window.EPSMatrix.formatGroupTag(groupIndex) : String(groupIndex);
    student.groupTag = normalized;
    if(!student.startGroupTag){
      student.startGroupTag = normalized;
    }
  }

  function enforceSingleRefForGroup(groupIndex, keepId){
    const targetIndex = window.EPSMatrix.parseGroupIndex(groupIndex);
    evaluation.data.students.forEach((stu)=>{
      const stuIndex = window.EPSMatrix.parseGroupIndex(stu.groupTag);
      if(stuIndex !== targetIndex) return;
      if(keepId && stu.id === keepId){
        stu.role = "ref";
        return;
      }
      if(stu.role === "ref"){
        if(!keepId){
          keepId = stu.id;
          return;
        }
        stu.role = "player";
      }
    });
  }

  function enforceSingleRefEverywhere(){
    const indexes = getAllGroupIndexes();
    indexes.forEach((idx)=>enforceSingleRefForGroup(idx));
  }

  function renderTerrainSection(){
    if(!terrainPanel || !terrainGrid) return;
    const mode = evaluation.data.terrainMode;
    if(terrainToggle){
      terrainToggle.checked = Boolean(mode.enabled);
    }
    if(terrainCountInput){
      terrainCountInput.value = mode.terrainCount;
      terrainCountInput.disabled = !mode.enabled;
    }
    if(btnInitTerrains){
      btnInitTerrains.disabled = !mode.enabled;
      btnInitTerrains.classList.toggle("disabled", !mode.enabled);
    }
    if(!mode.enabled){
      terrainGrid.innerHTML = "";
      terrainDisabledHint?.classList.remove("hidden");
      renderMatchesList([]);
      return;
    }
    terrainDisabledHint?.classList.add("hidden");
    const cards = [];
    const groups = buildTerrainGroups();
    groups.forEach((group)=>{ cards.push(buildTerrainCard(group)); });
    const ungrouped = evaluation.data.students.filter((stu)=>!stu.absent && !stu.dispense && !window.EPSMatrix.parseGroupIndex(stu.groupTag));
    if(ungrouped.length){
      cards.push(buildListCard("À affecter", ungrouped, "warning"));
    }
    const off = evaluation.data.students.filter((stu)=>stu.absent || stu.dispense);
    if(off.length){
      cards.push(buildListCard("Hors terrain (ABS/DISP)", off, "muted"));
    }
    terrainGrid.innerHTML = cards.join("");
    renderMatchesList(mode.matches || []);
  }

  function buildTerrainGroups(){
    const indexes = getAllGroupIndexes();
    return indexes.map((index)=>({
      index,
      label: formatGroupLabel(index),
      students: evaluation.data.students.filter((stu)=>{
        if(stu.absent || stu.dispense) return false;
        return window.EPSMatrix.parseGroupIndex(stu.groupTag) === index;
      })
    }));
  }

  function getAllGroupIndexes(){
    const set = new Set();
    evaluation.data.students.forEach((stu)=>{
      const parsed = window.EPSMatrix.parseGroupIndex(stu.groupTag);
      if(parsed) set.add(parsed);
    });
    if(!set.size){
      const fallback = evaluation.data.terrainMode?.terrainCount || DEFAULT_TERRAIN_COUNT;
      for(let i=1;i<=fallback;i++){ set.add(i); }
    }
    return Array.from(set).sort((a,b)=>a-b).slice(0, MAX_TERRAINS);
  }

  function getMaxGroupIndex(){
    const indexes = getAllGroupIndexes();
    return indexes.length ? indexes[indexes.length - 1] : evaluation.data.terrainMode?.terrainCount || 1;
  }

  function buildTerrainCard(group){
    const ref = group.students.find((stu)=>stu.role === "ref");
    const players = group.students.slice().sort((a,b)=>a.name.localeCompare(b.name,"fr"));
    const studentList = players.length ? players.map((stu)=>{
      const badges = [];
      if(stu.role === "ref"){ badges.push('<span class="badge ref">Arbitre</span>'); }
      const startInfo = formatStartBadge(stu.startGroupTag);
      const note = stu.freeNote ? `<span class="terrainNoteBadge" title="${escapeHtml(stu.freeNote)}">📝</span>` : "";
      return `<li class="terrainStudent" data-action="open-player" data-student="${stu.id}" data-group="${group.index}">
        <div>
          <strong>${escapeHtml(stu.name)}</strong> ${note}
          <span class="terrainStudentMeta">${startInfo}</span>
        </div>
        <div class="terrainStudentBadges">${badges.join("")}</div>
      </li>`;
    }).join("") : `<p class="muted smallText">Aucun joueur affecté.</p>`;
    const refBlock = ref ? `<p class="terrainLabel">Arbitre : <strong>${escapeHtml(ref.name)}</strong></p>` : `<p class="terrainLabel">Aucun arbitre</p>`;
    return `<article class="terrainCard" data-group="${group.index}">
      <header>
        <div>
          <h3>${group.label}</h3>
          <p class="terrainLabel">Joueurs : ${group.students.length}</p>
        </div>
        <button class="btn secondary" type="button" data-action="open-match" data-group="${group.index}">Match</button>
      </header>
      ${refBlock}
      <ul class="terrainStudentList">${studentList}</ul>
    </article>`;
  }

  function buildListCard(title, students, tone){
    const entries = students.map((stu)=>{
      const reason = stu.absent ? "ABS" : (stu.dispense ? "DISP" : "");
      return `<li>${escapeHtml(stu.name)} ${reason ? `<span class="badge ${tone||""}">${reason}</span>` : ""}</li>`;
    }).join("");
    return `<article class="terrainCard compact">
      <header><h3>${title}</h3></header>
      <ul class="terrainList">${entries || '<li class="muted">Aucun élève.</li>'}</ul>
    </article>`;
  }

  function formatGroupLabel(index){
    const parsed = window.EPSMatrix.parseGroupIndex ? window.EPSMatrix.parseGroupIndex(index) : Number(index) || 1;
    return `Terrain ${parsed || 1}`;
  }

  function formatStartBadge(tag){
    const idx = window.EPSMatrix.parseGroupIndex(tag);
    return idx ? `Départ : T${idx}` : "Départ : —";
  }

  function renderMatchesList(matches){
    if(!terrainMatchesList) return;
    if(!evaluation.data.terrainMode.enabled){
      terrainMatchesList.innerHTML = '<li class="muted">Active le mode terrain pour suivre les matches.</li>';
      return;
    }
    const recent = (matches||[]).slice(0,10);
    if(!recent.length){
      terrainMatchesList.innerHTML = '<li class="muted">Aucun match enregistré.</li>';
      return;
    }
    terrainMatchesList.innerHTML = recent.map((match)=>formatMatchEntry(match)).join("");
  }

  function formatMatchEntry(match){
    const winner = findStudentName(match.winnerId);
    const loser = findStudentName(match.loserId);
    const ref = findStudentName(match.refId);
    const score = match.scoreText ? ` • ${escapeHtml(match.scoreText)}` : "";
    const refLabel = match.refId ? ` – arbitre ${ref}` : "";
    const timeLabel = match.at ? new Date(match.at).toLocaleTimeString("fr-FR",{hour:"2-digit", minute:"2-digit"}) : "";
    const groupLabel = formatGroupLabel(match.groupIndex || 1);
    const abandon = match.forfeitId ? ` – abandon ${findStudentName(match.forfeitId)}` : "";
    return `<li><span class="muted">${groupLabel}</span> • <strong>${winner}</strong> bat ${loser}${score}${refLabel}${abandon}<span class="muted"> (${timeLabel})</span></li>`;
  }

  function findStudentName(id){
    if(!id) return "—";
    const student = evaluation.data.students.find((stu)=>stu.id === id);
    return student ? escapeHtml(student.name) : "—";
  }

  function handleTerrainGridClick(event){
    const action = event.target.dataset.action || event.target.closest("[data-action]")?.dataset.action;
    if(!action) return;
    const target = event.target.closest("[data-action]");
    if(action === "open-match"){
      const groupIndex = Number(target?.dataset.group || event.target.dataset.group);
      if(groupIndex) openMatchModal(groupIndex);
      return;
    }
    if(action === "open-player"){
      const studentId = target?.dataset.student;
      if(studentId) openPlayerModal(studentId);
    }
  }

  function openMatchModal(groupIndex){
    if(!matchModal) return;
    currentMatchGroupIndex = groupIndex;
    if(matchModalTitle){
      matchModalTitle.textContent = `Match – ${formatGroupLabel(groupIndex)}`;
    }
    populateMatchForm(groupIndex);
    matchModal.classList.remove("hidden");
  }

  function resetMatchModal(){
    currentMatchGroupIndex = null;
    matchWinnerSelect && (matchWinnerSelect.innerHTML = "");
    matchLoserSelect && (matchLoserSelect.innerHTML = "");
    matchRefSelect && (matchRefSelect.innerHTML = "");
    matchScoreInput && (matchScoreInput.value = "");
    matchForfeitToggle && (matchForfeitToggle.checked = false);
    matchForfeitSelect && (matchForfeitSelect.innerHTML = "", matchForfeitSelect.disabled = true);
    correctionStudentSelect && (correctionStudentSelect.innerHTML = "");
    correctionTargetGroup && (correctionTargetGroup.innerHTML = "");
    correctionRefSelect && (correctionRefSelect.innerHTML = "");
  }

  function populateMatchForm(groupIndex){
    const players = getGroupStudents(groupIndex);
    const options = players.map((stu)=>`<option value="${stu.id}">${escapeHtml(stu.name)}</option>`).join("");
    if(matchWinnerSelect) matchWinnerSelect.innerHTML = `<option value="">Sélectionner</option>${options}`;
    if(matchLoserSelect) matchLoserSelect.innerHTML = `<option value="">Sélectionner</option>${options}`;
    const refOptions = ['<option value="">Aucun</option>', ...players.map((stu)=>`<option value="${stu.id}" ${stu.role==="ref"?"selected":""}>${escapeHtml(stu.name)}</option>`)].join("");
    if(matchRefSelect) matchRefSelect.innerHTML = refOptions;
    if(matchScoreInput) matchScoreInput.value = "";
    if(matchForfeitSelect){
      matchForfeitSelect.innerHTML = `<option value="">—</option>${options}`;
      matchForfeitSelect.disabled = true;
    }
    if(correctionStudentSelect) correctionStudentSelect.innerHTML = `<option value="">Choisir</option>${options}`;
    const targetOptions = getAllGroupIndexes().map((idx)=>`<option value="${idx}">${formatGroupLabel(idx)}</option>`).join("");
    if(correctionTargetGroup) correctionTargetGroup.innerHTML = targetOptions;
    if(correctionRefSelect) correctionRefSelect.innerHTML = `<option value="">Choisir</option>${options}`;
    if(btnValidateMatch) btnValidateMatch.disabled = players.length < 2;
  }

  function getGroupStudents(index){
    return evaluation.data.students.filter((stu)=>{
      if(stu.absent || stu.dispense) return false;
      return window.EPSMatrix.parseGroupIndex(stu.groupTag) === index;
    });
  }

  function handleMatchValidation(){
    if(!currentMatchGroupIndex || !matchWinnerSelect || !matchLoserSelect) return;
    const winnerId = matchWinnerSelect.value;
    const loserId = matchLoserSelect.value;
    if(!winnerId || !loserId || winnerId === loserId){
      alert("Sélectionne un gagnant et un perdant différents.");
      return;
    }
    const winner = evaluation.data.students.find((stu)=>stu.id === winnerId);
    const loser = evaluation.data.students.find((stu)=>stu.id === loserId);
    if(!winner || !loser){
      alert("Élève introuvable.");
      return;
    }
    const refId = matchRefSelect?.value || null;
    const ref = refId ? evaluation.data.students.find((stu)=>stu.id === refId) : null;
    const scoreText = matchScoreInput?.value?.trim() || "";
    const forfeitId = matchForfeitToggle?.checked ? (matchForfeitSelect?.value || null) : null;
    recordMatchResult({groupIndex:currentMatchGroupIndex, winner, loser, ref, scoreText, forfeitId});
    resetMatchModal();
    matchModal?.classList.add("hidden");
  }

  function recordMatchResult(payload){
    const mode = evaluation.data.terrainMode;
    applyMatchResult(payload);
    mode.matches = Array.isArray(mode.matches) ? mode.matches : [];
    mode.matches.unshift({
      at: new Date().toISOString(),
      groupIndex: payload.groupIndex,
      winnerId: payload.winner.id,
      loserId: payload.loser.id,
      refId: payload.ref?.id || null,
      scoreText: payload.scoreText || "",
      forfeitId: payload.forfeitId || null
    });
    if(mode.matches.length > 200){
      mode.matches = mode.matches.slice(0,200);
    }
    persist();
    render();
  }

  function applyMatchResult({groupIndex, winner, loser, ref, scoreText, forfeitId}){
    const currentIndex = groupIndex || window.EPSMatrix.parseGroupIndex(winner.groupTag) || 1;
    const upIndex = currentIndex > 1 ? currentIndex - 1 : 1;
    const maxIndex = Math.max(getMaxGroupIndex(), evaluation.data.terrainMode?.terrainCount || currentIndex);
    let downIndex = currentIndex < maxIndex ? currentIndex + 1 : maxIndex;
    downIndex = Math.min(downIndex, MAX_TERRAINS);
    setStudentGroup(winner, upIndex);
    setStudentGroup(loser, downIndex);
    winner.role = "ref";
    loser.role = "player";
    if(ref){
      setStudentGroup(ref, currentIndex);
      ref.role = "player";
    }
    enforceSingleRefForGroup(upIndex, winner.id);
    enforceSingleRefForGroup(currentIndex);
    window.EPSMatrix.ensureTerrainStudentFields(winner);
    window.EPSMatrix.ensureTerrainStudentFields(loser);
  }

  function applyManualMove(){
    const studentId = correctionStudentSelect?.value;
    const targetGroup = Number(correctionTargetGroup?.value);
    if(!studentId || !targetGroup){
      alert("Sélectionne un élève et un terrain cible.");
      return;
    }
    const student = evaluation.data.students.find((stu)=>stu.id === studentId);
    if(!student){
      alert("Élève introuvable.");
      return;
    }
    setStudentGroup(student, targetGroup);
    if(student.role === "ref"){
      enforceSingleRefForGroup(targetGroup, student.id);
    }
    persist();
    render();
  }

  function applyManualRef(){
    const studentId = correctionRefSelect?.value;
    if(!studentId){
      alert("Choisis un élève à désigner comme arbitre.");
      return;
    }
    const student = evaluation.data.students.find((stu)=>stu.id === studentId);
    if(!student){
      alert("Élève introuvable.");
      return;
    }
    const groupIndex = window.EPSMatrix.parseGroupIndex(student.groupTag);
    if(!groupIndex){
      alert("Assigne ce joueur à un terrain avant d'en faire un arbitre.");
      return;
    }
    student.role = "ref";
    enforceSingleRefForGroup(groupIndex, student.id);
    persist();
    render();
  }

  function openPlayerModal(studentId){
    if(!playerModal) return;
    const student = evaluation.data.students.find((stu)=>stu.id === studentId);
    if(!student){
      alert("Élève introuvable.");
      return;
    }
    editingPlayerId = student.id;
    const currentIndex = window.EPSMatrix.parseGroupIndex(student.groupTag);
    if(playerModalTitle) playerModalTitle.textContent = student.name;
    if(playerModalMeta) playerModalMeta.textContent = `${formatGroupLabel(currentIndex || "—")} • ${formatStartBadge(student.startGroupTag)}`;
    if(playerNoteInput) playerNoteInput.value = student.freeNote || "";
    if(playerRoleSelect) playerRoleSelect.value = student.role || "player";
    playerModal.classList.remove("hidden");
  }

  function savePlayerModal(){
    if(!editingPlayerId) return;
    const student = evaluation.data.students.find((stu)=>stu.id === editingPlayerId);
    if(!student) return;
    if(playerNoteInput) student.freeNote = playerNoteInput.value || "";
    if(playerRoleSelect){
      const nextRole = playerRoleSelect.value === "ref" ? "ref" : "player";
      student.role = nextRole;
      if(nextRole === "ref"){
        const groupIndex = window.EPSMatrix.parseGroupIndex(student.groupTag);
        if(groupIndex){
          enforceSingleRefForGroup(groupIndex, student.id);
        }
      }
    }
    persist();
    playerModal?.classList.add("hidden");
    editingPlayerId = null;
    renderTerrainSection();
  }

  function escapeHtml(value=""){
    return String(value||"").replace(/[&<>"']/g, (char)=>{
      switch(char){
        case "&": return "&amp;";
        case "<": return "&lt;";
        case ">": return "&gt;";
        case '"': return "&quot;";
        case "'": return "&#39;";
        default: return char;
      }
    });
  }

  function renderResultsTable(){
    if(!resultsPanel || !resultsBody) return;
    const mode = evaluation.data.terrainMode;
    if(!mode?.enabled){
      resultsPanel.classList.add("hidden");
      resultsBody.innerHTML = "";
      return;
    }
    resultsPanel.classList.remove("hidden");
    const standings = window.EPSMatrix.computeStandingsFromMatches(mode.matches || [], evaluation.data.students);
    const {activeRows, offRows} = buildRankingRows(standings);
    const rows = activeRows.concat(offRows);
    resultsBody.innerHTML = rows.map((entry)=>{
      const rowClass = entry.rowClass ? ` class="${entry.rowClass}"` : "";
      return `<tr data-student="${entry.id}"${rowClass}>
        <td>${entry.rank ?? "—"}</td>
        <td>${escapeHtml(entry.name)}</td>
        <td>${entry.startLabel}</td>
        <td>${entry.currentLabel}</td>
        <td>${entry.stats.played}</td>
        <td>${entry.stats.wins}</td>
        <td>${entry.stats.losses}</td>
        <td>${entry.stats.points}</td>
      </tr>`;
    }).join("");
  }

  function buildRankingRows(standings){
    const active = [];
    const off = [];
    evaluation.data.students.forEach((stu)=>{
      window.EPSMatrix.ensureTerrainStudentFields(stu);
      const stats = standings.get(stu.id) || {played:0,wins:0,losses:0,points:0};
      const currentIndex = window.EPSMatrix.parseGroupIndex(stu.groupTag) || 999;
      const startIndex = window.EPSMatrix.parseGroupIndex(stu.startGroupTag);
      const row = {
        id: stu.id,
        name: stu.name,
        stats,
        currentIndex,
        startIndex,
        currentLabel: formatGroupDisplay(currentIndex, stu),
        startLabel: formatGroupDisplay(startIndex),
        rowClass: stu.absent ? "isAbsent" : (stu.dispense ? "isDispense" : "")
      };
      if(stu.absent || stu.dispense){
        off.push(row);
      }else{
        active.push(row);
      }
    });
    active.sort((a, b)=>{
      if(b.stats.points !== a.stats.points) return b.stats.points - a.stats.points;
      if(b.stats.wins !== a.stats.wins) return b.stats.wins - a.stats.wins;
      if(a.currentIndex !== b.currentIndex) return a.currentIndex - b.currentIndex;
      return a.name.localeCompare(b.name,"fr");
    });
    active.forEach((row, idx)=>{ row.rank = idx + 1; });
    off.forEach((row)=>{ row.rank = "—"; row.currentLabel = row.rowClass === "isAbsent" ? "ABS" : "DISP"; });
    return {activeRows: active, offRows: off};
  }

  function formatGroupDisplay(index, student){
    if(!index || index === 999){
      if(student?.absent) return "ABS";
      if(student?.dispense) return "DISP";
      return "—";
    }
    return `T${index}`;
  }

  function exportResultsCsv(){
    if(!evaluation.data.terrainMode?.enabled){
      alert("Active le mode terrain pour exporter les résultats.");
      return;
    }
    const standings = window.EPSMatrix.computeStandingsFromMatches(evaluation.data.terrainMode.matches || [], evaluation.data.students);
    const ranking = buildRankingRows(standings);
    const rows = ranking.activeRows.concat(ranking.offRows);
    const header = ["student_id","name","startTerrain","currentTerrain","played","wins","losses","points","rank"];
    const csvRows = rows.map((row)=>[
      row.id,
      row.name,
      row.startLabel,
      row.currentLabel,
      row.stats.played,
      row.stats.wins,
      row.stats.losses,
      row.stats.points,
      row.rank ?? ""
    ]);
    const csv = [header, ...csvRows].map((line)=>line.map((cell)=>`"${String(cell ?? "").replace(/"/g,'""')}"`).join(",")).join("\n");
    const filename = `EPSMatrix_resultats_${window.EPSMatrix.sanitizeFileName(evaluation.activity)}_${new Date().toISOString().slice(0,10)}.csv`;
    downloadFile(filename, csv, "text/csv");
  }

  function computeStudentRank(studentId){
    const standings = window.EPSMatrix.computeStandingsFromMatches(evaluation.data.terrainMode.matches || [], evaluation.data.students);
    const ranking = buildRankingRows(standings).activeRows;
    const foundIndex = ranking.findIndex((row)=>row.id === studentId);
    return foundIndex === -1 ? "" : (foundIndex + 1);
  }

  function openStudentSummary(studentId){
    if(!studentSummaryModal) return;
    const student = evaluation.data.students.find((stu)=>stu.id === studentId);
    if(!student){
      alert("Élève introuvable.");
      return;
    }
    viewingStudentId = student.id;
    const standings = window.EPSMatrix.computeStandingsFromMatches(evaluation.data.terrainMode.matches || [], evaluation.data.students);
    const stats = standings.get(student.id) || {played:0,wins:0,losses:0,points:0};
    const startLabel = formatGroupDisplay(window.EPSMatrix.parseGroupIndex(student.startGroupTag));
    const currentLabel = formatGroupDisplay(window.EPSMatrix.parseGroupIndex(student.groupTag), student);
    if(studentSummaryTitle) studentSummaryTitle.textContent = student.name;
    if(studentSummaryMeta) studentSummaryMeta.textContent = `Départ ${startLabel} • Terrain actuel ${currentLabel}`;
    if(studentSummaryStats){
      studentSummaryStats.innerHTML = `
        <div><span>Matchs</span><strong>${stats.played}</strong></div>
        <div><span>Gagnés</span><strong>${stats.wins}</strong></div>
        <div><span>Perdus</span><strong>${stats.losses}</strong></div>
        <div><span>Points</span><strong>${stats.points}</strong></div>
      `;
    }
    if(studentMatchesList){
      const list = buildStudentMatchHistory(student.id);
      studentMatchesList.innerHTML = list.length ? list.join("") : '<li class="muted">Aucun match enregistré.</li>';
    }
    studentSummaryModal.classList.remove("hidden");
  }

  function buildStudentMatchHistory(studentId){
    const matches = evaluation.data.terrainMode.matches || [];
    return matches.filter((match)=>match.winnerId === studentId || match.loserId === studentId).map((match)=>{
      const isWinner = match.winnerId === studentId;
      const opponentId = isWinner ? match.loserId : match.winnerId;
      const opponentName = findStudentName(opponentId);
      const label = isWinner ? "Victoire" : "Défaite";
      const resultClass = isWinner ? "resultTag win" : "resultTag loss";
      const scoreText = match.scoreText ? ` • Score ${escapeHtml(match.scoreText)}` : "";
      const refText = match.refId ? ` • Arbitre ${findStudentName(match.refId)}` : "";
      let abandonText = "";
      if(match.forfeitId){
        abandonText = match.forfeitId === studentId ? " • Abandon" : " • Abandon adverse";
      }
      const timeLabel = match.at ? new Date(match.at).toLocaleString("fr-FR",{day:"2-digit", month:"2-digit", hour:"2-digit", minute:"2-digit"}) : "";
      return `<li>
        <strong>${timeLabel}</strong> – ${formatGroupLabel(match.groupIndex || 1)} • vs ${opponentName}
        <span class="${resultClass}">${label}</span>${scoreText}${refText}${abandonText}
      </li>`;
    });
  }

  function handleResultsClick(event){
    const row = event.target.closest("tr[data-student]");
    if(!row || !evaluation.data.terrainMode?.enabled) return;
    const studentId = row.dataset.student;
    if(!studentId) return;
    openStudentSummary(studentId);
  }
})();
