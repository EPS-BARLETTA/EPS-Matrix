(function(){
  const {loadState, saveState} = window.EPSMatrix;
  const DEFAULT_COLOR = "#1c5bff";
  let state = loadState();
  const statsEl = document.getElementById("classesStats");
  const grid = document.getElementById("folderGrid");
  const chkArchived = document.getElementById("chkShowArchived");
  const btnImportArchive = document.getElementById("btnImportArchiveGlobal");
  const hiddenArchiveImporter = document.getElementById("hiddenArchiveImporter");

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
      archived += cls.evaluations.filter((ev)=>ev.status==='archived').length;
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
})();
