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
  const terrainDetail = document.getElementById("terrainDetail");
  const btnTerrainBack = document.getElementById("btnTerrainBack");
  const btnTerrainPrev = document.getElementById("btnTerrainPrev");
  const btnTerrainNext = document.getElementById("btnTerrainNext");
  const terrainDetailTitle = document.getElementById("terrainDetailTitle");
  const terrainDetailRef = document.getElementById("terrainDetailRef");
  const terrainDetailPlayers = document.getElementById("terrainDetailPlayers");
  const terrainScoreInput = document.getElementById("terrainScoreInput");
  const terrainMatchesList = document.getElementById("terrainMatchesList");
  const btnValidateMatch = document.getElementById("btnValidateMatch");
  const resultsPanel = document.getElementById("resultsPanel");
  const resultsBody = document.getElementById("resultsBody");
  const btnExportResultsCsv = document.getElementById("btnExportResultsCsv");
  const terrainNoteModal = document.getElementById("terrainNoteModal");
  const terrainNoteInput = document.getElementById("terrainNoteInput");
  const btnSaveTerrainNote = document.getElementById("btnSaveTerrainNote");
  let terrainNoteStudentId = null;
  let currentTerrainId = null;
  let currentWinnerId = null;
  let currentLoserId = null;

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
  const GROUP_VALUES = ["","1","2","3","4","5","6","7","8","A","B","C","D","E","F"];
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
    const terrainModeEnabled = Boolean(evaluation.data.terrainMode?.enabled);
    const baseFields = getActiveBaseFields();
    const headers = ["Prénom","Groupe"];
    if(terrainModeEnabled){
      headers.push("Terrain","Rôle");
    }
    headers.push(...baseFields.map((field)=>field.label), ...evaluation.data.criteria.map((c)=>c.label||"Critère"));
    if(showNote){ headers.push("Note"); }
    headers.push("Statut");
    thead.innerHTML = headers.map((h)=>`<th>${h}</th>`).join("");
    const orderedStudents = sortStudentsForDisplay(evaluation.data.students);
    tbody.innerHTML = orderedStudents.map((stu)=>rowHTML(stu, baseFields, showNote, terrainModeEnabled)).join("");
    tbody.querySelectorAll("select[data-field]").forEach(decorateSelect);
    applyGroupingStyles();
  }

  function rowHTML(stu, baseFields, showNote, terrainModeEnabled){
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
    const terrainCells = terrainModeEnabled ? buildTerrainCells(stu) : "";
    return `<tr${classAttr} data-id="${stu.id}" data-name="${stu.name}" data-group="${stu.groupTag||""}">
      <td>${nameCell(stu)}</td>
      <td>${groupCell(stu)}</td>
      ${terrainCells}
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
      return `<option value="${value}" ${value===stu.groupTag?"selected":""}>${value||"—"}</option>`;
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

  function buildTerrainCells(stu){
    const terrainMode = evaluation.data.terrainMode;
    const terrains = Array.isArray(terrainMode?.terrains) ? terrainMode.terrains : [];
    const terrainOptions = ['<option value="">—</option>', ...terrains.map((terrain)=>`<option value="${terrain.id}" ${terrain.id===stu.terrainId?"selected":""}>${terrain.name}</option>`)].join("");
    const roleOptions = [
      `<option value="player" ${stu.role==="player"?"selected":""}>Joueur</option>`,
      `<option value="ref" ${stu.role==="ref"?"selected":""}>Arbitre</option>`
    ].join("");
    return `
      <td class="terrainCell">
        <select data-field="terrainId" class="terrainPicker">${terrainOptions}</select>
      </td>
      <td class="terrainCell terrainRoleCell">
        <select data-field="role" class="terrainPicker">${roleOptions}</select>
        <button type="button" class="terrainNoteButton" title="Note terrain" data-action="open-terrain-note">📝</button>
      </td>`;
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
  tbody.addEventListener("click", handleTerrainNoteClick);

  function handleFieldChange(event){
    const field = event.target.dataset.field;
    if(!field) return;
    const row = event.target.closest("tr");
    if(!row) return;
    const student = evaluation.data.students.find((stu)=>stu.id === row.dataset.id);
    if(!student) return;
    window.EPSMatrix.ensureTerrainStudentFields(student);
    const value = event.target.value;
    if(field === "terrainId"){
      student.terrainId = value;
      persist();
      render();
      return;
    }
    if(field === "role"){
      student.role = value || "player";
      enforceSingleRefPerTerrain(evaluation.data.terrainMode);
      persist();
      render();
      return;
    }
    student[field] = value;
    evaluation.data.savedAt = Date.now();
    window.EPSMatrix.saveState(state);
    if(event.target.tagName === "SELECT" && field !== "groupTag"){
      decorateSelect(event.target);
    }
    if(field === "groupTag"){
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

  function handleTerrainNoteClick(event){
    const noteBtn = event.target.closest("[data-action='open-terrain-note']");
    if(!noteBtn) return;
    const row = noteBtn.closest("tr");
    if(!row) return;
    const student = evaluation.data.students.find((stu)=>stu.id === row.dataset.id);
    if(!student) return;
    openTerrainNoteModal(student);
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
  btnSaveTerrainNote?.addEventListener("click", ()=>{
    if(!terrainNoteStudentId) return;
    const student = evaluation.data.students.find((stu)=>stu.id === terrainNoteStudentId);
    if(!student) return;
    student.freeNote = terrainNoteInput?.value || "";
    persist();
    closeTerrainNoteModal();
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
  terrainGrid?.addEventListener("click", handleTerrainCardClick);
  btnTerrainBack?.addEventListener("click", closeTerrainDetail);
  btnTerrainPrev?.addEventListener("click", ()=>navigateTerrain(-1));
  btnTerrainNext?.addEventListener("click", ()=>navigateTerrain(1));
  terrainDetailPlayers?.addEventListener("click", handleTerrainDetailClick);
  btnValidateMatch?.addEventListener("click", validateTerrainMatch);

  document.querySelectorAll("[data-close-modal]").forEach((btn)=>{
    btn.addEventListener("click", ()=>{
      const modal = btn.closest(".modal");
      if(modal){
        modal.classList.add("hidden");
        if(modal.id === "terrainNoteModal"){
          terrainNoteStudentId = null;
          if(terrainNoteInput) terrainNoteInput.value = "";
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
    if(!terrainPanel || !terrainGrid) return;
    if(terrainToggle){
      terrainToggle.checked = Boolean(evaluation.data.terrainMode.enabled);
      terrainToggle.addEventListener("change", ()=>{
        evaluation.data.terrainMode.enabled = terrainToggle.checked;
        persist();
        renderTerrainSection();
      });
    }
    if(terrainCountInput){
      terrainCountInput.value = evaluation.data.terrainMode.terrainCount;
      terrainCountInput.addEventListener("change", ()=>{
        const nextValue = clampTerrainCountInput(terrainCountInput.value);
        terrainCountInput.value = nextValue;
        evaluation.data.terrainMode.terrainCount = nextValue;
        persist();
      });
    }
    btnInitTerrains?.addEventListener("click", ()=>{
      initializeTerrains();
    });
  }

  function openTerrainNoteModal(student){
    if(!terrainNoteModal || !terrainNoteInput) return;
    terrainNoteStudentId = student.id;
    terrainNoteInput.value = student.freeNote || "";
    terrainNoteModal.classList.remove("hidden");
    setTimeout(()=>{ terrainNoteInput.focus(); }, 50);
  }

  function closeTerrainNoteModal(){
    if(!terrainNoteModal) return;
    terrainNoteStudentId = null;
    if(terrainNoteInput){ terrainNoteInput.value = ""; }
    terrainNoteModal.classList.add("hidden");
  }

  function clampTerrainCountInput(value){
    return window.EPSMatrix.clampTerrainCount ? window.EPSMatrix.clampTerrainCount(value) : Math.min(MAX_TERRAINS, Math.max(1, Math.floor(Number(value)||1)));
  }

  function initializeTerrains(){
    const mode = evaluation.data.terrainMode;
    const count = clampTerrainCountInput(terrainCountInput?.value || mode.terrainCount);
    mode.terrainCount = count;
    mode.terrains = buildTerrainList(count, mode.terrains);
    assignStudentsToTerrains(mode);
    enforceSingleRefPerTerrain(mode);
    persist();
    render();
  }

  function buildTerrainList(count, currentList){
    const terrains = [];
    const existing = Array.isArray(currentList) ? currentList : [];
    for(let index=1; index<=count; index++){
      const fallbackId = `t${index}`;
      const match = existing.find((terrain)=>terrain && (terrain.index === index || terrain.id === fallbackId));
      terrains.push({
        id: match?.id || fallbackId,
        name: match?.name || `Terrain ${index}`,
        index
      });
    }
    return terrains;
  }

  function assignStudentsToTerrains(mode){
    const terrainIds = mode.terrains.map((terrain)=>terrain.id);
    if(!terrainIds.length) return;
    const presentStudents = evaluation.data.students.filter((stu)=>!stu.absent && !stu.dispense);
    let cursor = 0;
    presentStudents.forEach((stu)=>{
      window.EPSMatrix.ensureTerrainStudentFields(stu);
      if(terrainIds.includes(stu.terrainId)){
        if(!stu.startTerrainId){
          stu.startTerrainId = stu.terrainId;
        }
        return;
      }
      const targetId = terrainIds[cursor % terrainIds.length];
      cursor++;
      stu.terrainId = targetId;
      if(!stu.startTerrainId){
        stu.startTerrainId = targetId;
      }
    });
  }

  function enforceSingleRefPerTerrain(mode){
    const validIds = new Set(mode.terrains.map((terrain)=>terrain.id));
    const refsByTerrain = new Map();
    evaluation.data.students.forEach((stu)=>{
      if(!stu.terrainId || !validIds.has(stu.terrainId) || stu.role !== "ref"){
        if(stu.role !== "ref"){
          stu.role = "player";
        }
        return;
      }
      if(!refsByTerrain.has(stu.terrainId)){
        refsByTerrain.set(stu.terrainId, stu.id);
        return;
      }
      stu.role = "player";
    });
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
      closeTerrainDetail();
      terrainGrid.innerHTML = "";
      terrainDisabledHint?.classList.remove("hidden");
      return;
    }
    terrainDisabledHint?.classList.add("hidden");
    const cards = [];
    const terrainIds = new Set(mode.terrains.map((terrain)=>terrain.id));
    const present = evaluation.data.students.filter((stu)=>!stu.absent && !stu.dispense);
    const horsTerrain = evaluation.data.students.filter((stu)=>stu.absent || stu.dispense);
    let unassigned = present.filter((stu)=>!terrainIds.has(stu.terrainId));
    if(unassigned.length && terrainIds.size){
      assignStudentsToTerrains(mode);
      persist();
      unassigned = present.filter((stu)=>!terrainIds.has(stu.terrainId));
    }
    mode.terrains.forEach((terrain)=>{
      cards.push(buildTerrainCard(terrain));
    });
    if(unassigned.length){
      cards.push(buildListCard("À affecter", unassigned, "warning"));
    }
    if(horsTerrain.length){
      cards.push(buildListCard("Hors terrain (ABS/DISP)", horsTerrain, "muted"));
    }
    terrainGrid.innerHTML = cards.join("");
    if(currentTerrainId){
      renderTerrainDetail();
    }
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
    const terrainIndexMap = new Map((mode.terrains||[]).map((terrain)=>[terrain.id, terrain.index]));
    const terrainNameMap = new Map((mode.terrains||[]).map((terrain)=>[terrain.id, terrain.name]));
    const active = evaluation.data.students.filter((stu)=>!stu.absent && !stu.dispense);
    const ranked = active.map((stu)=>{
      window.EPSMatrix.ensureTerrainStudentFields(stu);
      const currentIndex = terrainIndexMap.get(stu.terrainId) || 999;
      return {
        id: stu.id,
        name: stu.name,
        start: terrainNameMap.get(stu.startTerrainId) || "—",
        current: terrainNameMap.get(stu.terrainId) || "—",
        stats:{
          played: stu.stats?.played ?? 0,
          wins: stu.stats?.wins ?? 0,
          losses: stu.stats?.losses ?? 0,
          points: stu.stats?.points ?? 0
        },
        sortKey:{points:stu.stats.points, wins:stu.stats.wins, index:currentIndex}
      };
    }).sort((a,b)=>{
      if(b.sortKey.points !== a.sortKey.points) return b.sortKey.points - a.sortKey.points;
      if(b.sortKey.wins !== a.sortKey.wins) return b.sortKey.wins - a.sortKey.wins;
      if(a.sortKey.index !== b.sortKey.index) return a.sortKey.index - b.sortKey.index;
      return a.name.localeCompare(b.name,"fr");
    });
    ranked.forEach((entry, idx)=>{ entry.rank = idx + 1; });
    const off = evaluation.data.students.filter((stu)=>stu.absent || stu.dispense).map((stu)=>({
      id: stu.id,
      name: stu.name,
      start: terrainNameMap.get(stu.startTerrainId) || "—",
      current: stu.absent ? "ABS" : "DISP",
      stats: {played:stu.stats?.played||0,wins:stu.stats?.wins||0,losses:stu.stats?.losses||0,points:stu.stats?.points||0},
      rank: "—",
      rowClass: stu.absent ? "isAbsent" : "isDispense"
    }));
    const rows = ranked.concat(off);
    resultsBody.innerHTML = rows.map((entry)=>{
      const rowClass = entry.rowClass ? ` class="${entry.rowClass}"` : "";
      return `<tr${rowClass}>
        <td>${entry.rank ?? "—"}</td>
        <td>${escapeHtml(entry.name)}</td>
        <td>${escapeHtml(entry.start)}</td>
        <td>${escapeHtml(entry.current)}</td>
        <td>${entry.stats?.played ?? 0}</td>
        <td>${entry.stats?.wins ?? 0}</td>
        <td>${entry.stats?.losses ?? 0}</td>
        <td>${entry.stats?.points ?? 0}</td>
      </tr>`;
    }).join("");
  }

  function exportResultsCsv(){
    if(!evaluation.data.terrainMode?.enabled){
      alert("Active le mode terrain pour exporter les résultats.");
      return;
    }
    const terrainNameMap = new Map((evaluation.data.terrainMode.terrains||[]).map((terrain)=>[terrain.id, terrain.name]));
    const header = ["student_id","name","startTerrain","currentTerrain","played","wins","losses","points","rank"];
    const rows = evaluation.data.students.map((stu)=>{
      window.EPSMatrix.ensureTerrainStudentFields(stu);
      const rank = computeStudentRank(stu.id);
      return [
        stu.id || "",
        stu.name || "",
        terrainNameMap.get(stu.startTerrainId) || "",
        terrainNameMap.get(stu.terrainId) || (stu.absent?"ABS":stu.dispense?"DISP":""),
        stu.stats?.played || 0,
        stu.stats?.wins || 0,
        stu.stats?.losses || 0,
        stu.stats?.points || 0,
        rank || ""
      ];
    });
    const csv = [header, ...rows].map((line)=>line.map((cell)=>`"${String(cell ?? "").replace(/"/g,'""')}"`).join(",")).join("\n");
    const filename = `EPSMatrix_resultats_${window.EPSMatrix.sanitizeFileName(evaluation.activity)}_${new Date().toISOString().slice(0,10)}.csv`;
    downloadFile(filename, csv, "text/csv");
  }

  function computeStudentRank(studentId){
    const mode = evaluation.data.terrainMode;
    if(!mode?.enabled) return "";
    const terrainIndexMap = new Map((mode.terrains||[]).map((terrain)=>[terrain.id, terrain.index]));
    const active = evaluation.data.students.filter((stu)=>!stu.absent && !stu.dispense);
    const ranked = active.map((stu)=>{
      window.EPSMatrix.ensureTerrainStudentFields(stu);
      const currentIndex = terrainIndexMap.get(stu.terrainId) || 999;
      return {
        id: stu.id,
        points: stu.stats.points,
        wins: stu.stats.wins,
        index: currentIndex,
        name: stu.name
      };
    }).sort((a,b)=>{
      if(b.points !== a.points) return b.points - a.points;
      if(b.wins !== a.wins) return b.wins - a.wins;
      if(a.index !== b.index) return a.index - b.index;
      return a.name.localeCompare(b.name,"fr");
    });
    const foundIndex = ranked.findIndex((entry)=>entry.id === studentId);
    return foundIndex === -1 ? "" : (foundIndex + 1);
  }

  function buildTerrainCard(terrain){
    const students = evaluation.data.students.filter((stu)=>!stu.absent && !stu.dispense && stu.terrainId === terrain.id);
    const ref = students.find((stu)=>stu.role === "ref");
    const players = students.filter((stu)=>stu.role !== "ref");
    const refBlock = ref ? terrainChipMarkup(ref, "ref") : `<div class="terrainChip empty">Aucun arbitre</div>`;
    const playerList = players.length ? players.map((stu)=>terrainChipMarkup(stu)).join("") : `<p class="muted smallText">Aucun joueur assigné.</p>`;
    return `<article class="terrainCard" data-terrain="${terrain.id}">
      <header>
        <h3>${terrain.name}</h3>
        <span class="terrainIndex">#${terrain.index}</span>
      </header>
      <section>
        <p class="terrainLabel">Arbitre</p>
        ${refBlock}
      </section>
      <section>
        <p class="terrainLabel">Joueurs</p>
        <div class="terrainChipList">${playerList}</div>
      </section>
    </article>`;
  }

  function buildListCard(title, students, tone){
    if(!students.length){
      return `<article class="terrainCard compact"><header><h3>${title}</h3></header><p class="muted smallText">Aucun élève.</p></article>`;
    }
    const entries = students.map((stu)=>{
      const badges = [];
      if(stu.absent) badges.push("ABS");
      if(stu.dispense) badges.push("DISP");
      return `<li>${escapeHtml(stu.name)} ${badges.length ? `<span class="badge ${tone||""}">${badges.join("/")}</span>` : ""}</li>`;
    }).join("");
    return `<article class="terrainCard compact">
      <header><h3>${title}</h3></header>
      <ul class="terrainList">${entries}</ul>
    </article>`;
  }

  function terrainChipMarkup(stu, extraClass){
    const noteBadge = stu.freeNote ? `<span class="terrainNoteBadge" title="${escapeHtml(stu.freeNote)}">📝</span>` : "";
    const className = extraClass ? `terrainChip ${extraClass}` : "terrainChip";
    return `<div class="${className}">${escapeHtml(stu.name)}${noteBadge}</div>`;
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

  function handleTerrainCardClick(event){
    const card = event.target.closest(".terrainCard[data-terrain]");
    if(!card || !evaluation.data.terrainMode?.enabled) return;
    openTerrainDetail(card.dataset.terrain);
  }

  function openTerrainDetail(terrainId){
    if(!terrainDetail) return;
    currentTerrainId = terrainId;
    currentWinnerId = null;
    currentLoserId = null;
    if(terrainScoreInput){ terrainScoreInput.value = ""; }
    terrainDetail.classList.remove("hidden");
    terrainGrid?.classList.add("inset");
    renderTerrainDetail();
  }

  function closeTerrainDetail(){
    currentTerrainId = null;
    currentWinnerId = null;
    currentLoserId = null;
    terrainDetail?.classList.add("hidden");
    terrainGrid?.classList.remove("inset");
    if(terrainScoreInput){ terrainScoreInput.value = ""; }
  }

  function navigateTerrain(step){
    if(!currentTerrainId) return;
    const terrains = evaluation.data.terrainMode?.terrains || [];
    if(!terrains.length) return;
    let index = terrains.findIndex((terrain)=>terrain.id === currentTerrainId);
    if(index === -1) return;
    let nextIndex = index + step;
    if(nextIndex < 0) nextIndex = terrains.length - 1;
    if(nextIndex >= terrains.length) nextIndex = 0;
    openTerrainDetail(terrains[nextIndex].id);
  }

  function handleTerrainDetailClick(event){
    const action = event.target.dataset.action;
    if(!action) return;
    const row = event.target.closest("[data-student]");
    if(!row) return;
    const studentId = row.dataset.student;
    if(action === "pick-winner"){
      currentWinnerId = currentWinnerId === studentId ? null : studentId;
      if(currentWinnerId && currentWinnerId === currentLoserId){
        currentLoserId = null;
      }
      renderTerrainDetail();
      return;
    }
    if(action === "pick-loser"){
      currentLoserId = currentLoserId === studentId ? null : studentId;
      if(currentLoserId && currentLoserId === currentWinnerId){
        currentWinnerId = null;
      }
      renderTerrainDetail();
      return;
    }
    if(action === "open-terrain-note"){
      const student = evaluation.data.students.find((stu)=>stu.id === studentId);
      if(student){
        openTerrainNoteModal(student);
      }
    }
  }

  function renderTerrainDetail(){
    if(!terrainDetail) return;
    if(!currentTerrainId){
      terrainDetail.classList.add("hidden");
      terrainGrid?.classList.remove("inset");
      return;
    }
    const mode = evaluation.data.terrainMode;
    const terrain = mode?.terrains?.find((t)=>t.id === currentTerrainId);
    if(!terrain){
      closeTerrainDetail();
      return;
    }
    const scoreValue = terrainScoreInput?.value || "";
    const players = evaluation.data.students.filter((stu)=>!stu.absent && !stu.dispense && stu.terrainId === terrain.id);
    const ref = players.find((stu)=>stu.role === "ref");
    if(terrainDetailTitle) terrainDetailTitle.textContent = `${terrain.name} – ${players.length} joueur(s)`;
    if(terrainDetailRef) terrainDetailRef.textContent = ref ? `Arbitre actuel : ${ref.name}` : "Pas d'arbitre sur ce terrain.";
    if(terrainDetailPlayers){
      if(players.length < 2){
        terrainDetailPlayers.innerHTML = `<p class="muted">Ajoute au moins deux joueurs pour valider un match.</p>`;
      }else{
        terrainDetailPlayers.innerHTML = players.map((stu)=>terrainDetailRowMarkup(stu)).join("");
      }
    }
    const matches = Array.isArray(mode?.matches) ? mode.matches.filter((match)=>match.terrainId === terrain.id).slice(0,5) : [];
    if(terrainMatchesList){
      if(matches.length){
        terrainMatchesList.innerHTML = matches.map((match)=>formatMatchEntry(match)).join("");
      }else{
        terrainMatchesList.innerHTML = '<li class="muted">Aucun match enregistré.</li>';
      }
    }
    if(terrainScoreInput) terrainScoreInput.value = scoreValue;
    const hasEnoughPlayers = players.length >= 2;
    const ready = Boolean(currentWinnerId && currentLoserId && currentWinnerId !== currentLoserId);
    if(btnValidateMatch){
      btnValidateMatch.disabled = !hasEnoughPlayers || !ready;
    }
  }

  function terrainDetailRowMarkup(student){
    const winnerClass = currentWinnerId === student.id ? "active" : "";
    const loserClass = currentLoserId === student.id ? "active" : "";
    const noteBadge = student.freeNote ? `<span class="terrainNoteBadge" title="${escapeHtml(student.freeNote)}">📝</span>` : "";
    return `<div class="terrainDetailRow" data-student="${student.id}">
      <div>
        <strong>${escapeHtml(student.name)}</strong>
        ${noteBadge}
      </div>
      <div class="terrainDetailRowActions">
        <button type="button" data-action="pick-winner" class="${winnerClass}">Gagnant</button>
        <button type="button" data-action="pick-loser" class="${loserClass}">Perdant</button>
        <button type="button" class="terrainNoteButton" data-action="open-terrain-note" title="Note terrain">📝</button>
      </div>
    </div>`;
  }

  function formatMatchEntry(match){
    const winner = findStudentName(match.winnerId);
    const loser = findStudentName(match.loserId);
    const ref = findStudentName(match.refId);
    const score = match.scoreText ? ` • ${escapeHtml(match.scoreText)}` : "";
    const refLabel = ref ? ` – arbitre ${ref}` : "";
    const timeLabel = match.at ? new Date(match.at).toLocaleTimeString("fr-FR",{hour:"2-digit", minute:"2-digit"}) : "";
    return `<li><strong>${winner}</strong> bat ${loser}${score}${refLabel}<span class="muted"> (${timeLabel})</span></li>`;
  }

  function findStudentName(id){
    if(!id) return "—";
    const student = evaluation.data.students.find((stu)=>stu.id === id);
    return student ? escapeHtml(student.name) : "—";
  }

  function validateTerrainMatch(){
    if(!currentTerrainId) return;
    if(!currentWinnerId || !currentLoserId || currentWinnerId === currentLoserId){
      alert("Sélectionne un gagnant et un perdant différents.");
      return;
    }
    const mode = evaluation.data.terrainMode;
    const terrain = mode?.terrains?.find((t)=>t.id === currentTerrainId);
    if(!terrain){
      alert("Terrain introuvable.");
      return;
    }
    const winner = evaluation.data.students.find((stu)=>stu.id === currentWinnerId);
    const loser = evaluation.data.students.find((stu)=>stu.id === currentLoserId);
    if(!winner || !loser){
      alert("Élève introuvable.");
      return;
    }
    const ref = evaluation.data.students.find((stu)=>stu.terrainId === terrain.id && stu.role === "ref");
    applyMatchRotation(terrain, winner, loser, ref, terrainScoreInput?.value || "");
    currentWinnerId = null;
    currentLoserId = null;
    if(terrainScoreInput){ terrainScoreInput.value = ""; }
    render();
    renderTerrainDetail();
  }

  function applyMatchRotation(terrain, winner, loser, ref, scoreText){
    const mode = evaluation.data.terrainMode;
    const terrains = mode?.terrains || [];
    window.EPSMatrix.ensureTerrainStudentFields(winner);
    window.EPSMatrix.ensureTerrainStudentFields(loser);
    if(ref){
      window.EPSMatrix.ensureTerrainStudentFields(ref);
    }
    bumpStats(winner, "win");
    bumpStats(loser, "loss");
    const winnerIndex = terrain.index;
    const total = terrains.length;
    const winnerTargetIndex = winnerIndex > 1 ? winnerIndex - 1 : 1;
    const loserTargetIndex = winnerIndex < total ? winnerIndex + 1 : total;
    const winnerTarget = terrains[winnerTargetIndex - 1];
    const loserTarget = terrains[loserTargetIndex - 1];
    if(winnerTarget){
      winner.terrainId = winnerTarget.id;
    }
    if(loserTarget){
      loser.terrainId = loserTarget.id;
    }
    winner.role = "ref";
    loser.role = "player";
    if(ref){
      ref.role = "player";
      ref.terrainId = terrain.id;
    }
    evaluation.data.students.forEach((stu)=>{
      if(stu.id !== winner.id && stu.terrainId === winner.terrainId && stu.role === "ref"){
        stu.role = "player";
      }
    });
    mode.matches = Array.isArray(mode.matches) ? mode.matches : [];
    mode.matches.unshift({
      at: new Date().toISOString(),
      terrainId: terrain.id,
      winnerId: winner.id,
      loserId: loser.id,
      refId: ref?.id || null,
      scoreText: scoreText ? scoreText.trim() : ""
    });
    if(mode.matches.length > 200){
      mode.matches = mode.matches.slice(0,200);
    }
    enforceSingleRefPerTerrain(mode);
    persist();
  }

  function bumpStats(student, result){
    if(!student) return;
    window.EPSMatrix.ensureTerrainStudentFields(student);
    student.stats.played += 1;
    if(result === "win"){
      student.stats.wins += 1;
      student.stats.points += 3;
    }else if(result === "loss"){
      student.stats.losses += 1;
      student.stats.points += 1;
    }
  }
})();
