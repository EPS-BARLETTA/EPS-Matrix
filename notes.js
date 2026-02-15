(function(){
  try{
    initNotes();
  }catch(err){
    console.error("EPS Matrix – Bloc note", err);
    alert("Bloc note : une erreur empêche le fonctionnement ("+(err?.message||err)+"). Ouvre la console pour plus de détails.");
  }

  function initNotes(){
  const params = new URLSearchParams(window.location.search);
  const classId = params.get("class");
  if(!classId){ window.location.href = "classes.html"; return; }
  const state = window.EPSMatrix.loadState();
  const cls = state.classes.find((c)=>c.id === classId);
  if(!cls){ window.location.href = "classes.html"; return; }
  if(!cls.notes){ cls.notes = window.EPSMatrix.createEmptyNotes(); }
  const notes = cls.notes;
  if(!Array.isArray(notes.stickies)){ notes.stickies = []; }
  if(typeof notes.sketchColor !== "string"){ notes.sketchColor = "#0b2a6d"; }
  if(typeof notes.sketchWidth !== "number"){ notes.sketchWidth = 4; }
  if(typeof notes.sketchTool !== "string"){ notes.sketchTool = "pen"; }
  ensureSketchStructure();

  document.getElementById("notesTitle").textContent = `Bloc note – ${cls.name}`;
  document.getElementById("notesMeta").textContent = `Prof ${cls.teacher || "—"} • ${cls.students.length} élèves`;
  const backLink = document.getElementById("backClass");
  backLink.href = `class.html?class=${classId}`;

  const tbody = document.getElementById("notesBody");
  const stickiesBoard = document.getElementById("stickiesBoard");
  const addStickyBtn = document.getElementById("btnAddSticky");
  const clearStickyBtn = document.getElementById("btnClearStickies");
  const exportBtn = document.getElementById("btnExportNotes");
  const clearSketchBtn = document.getElementById("btnClearSketch");
  const btnExportSketch = document.getElementById("btnExportSketch");
  const btnFullscreenSketch = document.getElementById("btnFullscreenSketch");
  const btnAddSketchPage = document.getElementById("btnAddSketchPage");
  const btnDeleteSketchPage = document.getElementById("btnDeleteSketchPage");
  const btnRenameSketchPage = document.getElementById("btnRenameSketchPage");
  const sketchTabs = document.getElementById("sketchTabs");
  const sketchToolbar = document.querySelector(".sketchToolbar");
  const sketchOptions = document.querySelector(".sketchOptions");
  const sketchShell = document.getElementById("sketchShell");
  const canvas = document.getElementById("sketchCanvas");
  const ctx = canvas?.getContext("2d") || null;
  const hasCanvas = Boolean(canvas && ctx);
  const btnToolPen = document.getElementById("btnToolPen");
  const btnToolEraser = document.getElementById("btnToolEraser");
  const btnExitFullscreen = document.getElementById("btnExitFullscreen");
  const colorPalette = document.getElementById("sketchColorPalette");
  const sizePalette = document.getElementById("sketchSizePalette");
  const COLOR_PRESETS = ["#0b2a6d","#000000","#f97316","#ef4444","#16a34a","#0ea5e9","#a855f7","#fef08a"];
  const SIZE_PRESETS = [2,4,6,10,14];
  let currentColor = notes.sketchColor || "#0b2a6d";
  let currentWidth = notes.sketchWidth || 4;
  let currentTool = notes.sketchTool || "pen";
  let drawing = false;
  let fullscreen = false;
  if(hasCanvas){
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#0b2a6d";
    canvas.style.touchAction = "none";
  }else{
    console.warn("Canvas stylet indisponible (élément introuvable).");
  }

  renderTable();
  renderStickies();
  renderSketchTabs();
  renderColorPalette();
  renderSizePalette();
  updateToolButtons();
  updateExitButton();
  updateFloatingPanels();
  if(hasCanvas){
    applyStrokePrefs();
    fitCanvas();
    window.addEventListener("resize", ()=>{
      saveCurrentCanvas();
      fitCanvas();
    });
  }

  function renderTable(){
    if(!tbody) return;
    tbody.innerHTML = cls.students.map((stu)=>{
      if(typeof notes.table[stu.id] !== "string") notes.table[stu.id] = "";
      const value = notes.table[stu.id] || "";
      return `<tr><td>${stu.name}</td><td><textarea data-id="${stu.id}">${value}</textarea></td></tr>`;
    }).join("");
    tbody.querySelectorAll("textarea").forEach((textarea)=>{
      textarea.addEventListener("input", ()=>{
        notes.table[textarea.dataset.id] = textarea.value;
        persist();
      });
    });
  }

  if(addStickyBtn){
    addStickyBtn.addEventListener("click", ()=>{
      notes.stickies.push({id:window.EPSMatrix.genId("sticky"), text:"", color:randomStickyColor(), x:0, y:0});
      renderStickies();
      persist();
    });
  }
  if(clearStickyBtn){
    clearStickyBtn.addEventListener("click", ()=>{
      if(!notes.stickies.length) return;
      if(confirm("Effacer tous les post-it ?")){
        notes.stickies = [];
        renderStickies();
        persist();
      }
    });
  }
  if(exportBtn){
    exportBtn.addEventListener("click", ()=>{
      const payload = {classe:{name:cls.name, teacher:cls.teacher, site:cls.site}, notes};
      download(`Bloc-note-${cls.name}.json`, JSON.stringify(payload,null,2));
    });
  }
  btnAddSketchPage?.addEventListener("click", addSketchPage);
  btnRenameSketchPage?.addEventListener("click", renameSketchPage);
  btnDeleteSketchPage?.addEventListener("click", deleteSketchPage);
  btnFullscreenSketch?.addEventListener("click", toggleFullscreenSketch);
  btnExportSketch?.addEventListener("click", exportCurrentSketch);
  btnToolPen?.addEventListener("click", ()=>setTool("pen"));
  btnToolEraser?.addEventListener("click", ()=>setTool("eraser"));
  btnExitFullscreen?.addEventListener("click", ()=>{
    if(fullscreen){ toggleFullscreenSketch(); }
  });
  sketchTabs?.addEventListener("click", (event)=>{
    const tab = event.target.closest("button[data-page]");
    if(!tab) return;
    const pageId = tab.dataset.page;
    if(pageId === notes.activeSketchPageId) return;
    saveCurrentCanvas();
    notes.activeSketchPageId = pageId;
    persist();
    renderSketchTabs();
    restoreSketch();
  });

  function renderStickies(){
    if(!stickiesBoard) return;
    if(!notes.stickies.length){
      stickiesBoard.innerHTML = '<p class="muted">Ajoute ton premier post-it.</p>';
      return;
    }
    stickiesBoard.innerHTML = notes.stickies.map((sticky)=>{
      return `<div class="sticky" style="background:${sticky.color}">
        <textarea data-id="${sticky.id}">${sticky.text}</textarea>
        <div class="stickyActions">
          <button data-action="color" data-id="${sticky.id}">🎨</button>
          <button data-action="delete" data-id="${sticky.id}">×</button>
        </div>
      </div>`;
    }).join("");
    stickiesBoard.querySelectorAll("textarea").forEach((textarea)=>{
      textarea.addEventListener("input", ()=>{
        const sticky = notes.stickies.find((s)=>s.id === textarea.dataset.id);
        if(sticky){ sticky.text = textarea.value; persist(); }
      });
    });
    stickiesBoard.querySelectorAll("button[data-action='delete']").forEach((btn)=>{
      btn.addEventListener("click", ()=>{
        const id = btn.dataset.id;
        notes.stickies = notes.stickies.filter((s)=>s.id !== id);
        renderStickies();
        persist();
      });
    });
    stickiesBoard.querySelectorAll("button[data-action='color']").forEach((btn)=>{
      btn.addEventListener("click", ()=>{
        const sticky = notes.stickies.find((s)=>s.id === btn.dataset.id);
        if(sticky){ sticky.color = randomStickyColor(); renderStickies(); persist(); }
      });
    });
  }

  if(hasCanvas){
    canvas.addEventListener("pointerdown", (event)=>{
      drawing = true;
      applyStrokePrefs();
      const pos = pointerPos(event);
      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y);
      canvas.setPointerCapture(event.pointerId);
    });

    canvas.addEventListener("pointermove", (event)=>{
      if(!drawing) return;
      const pos = pointerPos(event);
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
    });

    canvas.addEventListener("pointerup", finishDraw);
    canvas.addEventListener("pointercancel", finishDraw);
  }

  function finishDraw(event){
    if(!hasCanvas) return;
    if(!drawing) return;
    drawing = false;
    if(event.pointerId) canvas.releasePointerCapture(event.pointerId);
    saveCurrentCanvas();
  }

  if(clearSketchBtn){
    clearSketchBtn.addEventListener("click", ()=>{
      if(!hasCanvas) return;
      ctx.clearRect(0,0,canvas.width,canvas.height);
      const page = getActiveSketchPage();
      if(page){
        page.data = null;
        page.updatedAt = Date.now();
      }
      persist();
    });
  }

  function pointerPos(event){
    if(!hasCanvas) return;
    const rect = canvas.getBoundingClientRect();
    return {x:event.clientX - rect.left, y:event.clientY - rect.top};
  }

  function fitCanvas(){
    if(!hasCanvas) return;
    const container = sketchShell || canvas.parentElement;
    const availableWidth = container ? container.clientWidth - 24 : canvas.width;
    const width = Math.max(availableWidth, 320);
    const height = fullscreen ? Math.max(window.innerHeight - 180, 360) : 360;
    canvas.width = width;
    canvas.height = height;
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#0b2a6d";
    ctx.clearRect(0,0,canvas.width,canvas.height);
    applyStrokePrefs();
    restoreSketch();
  }

  function restoreSketch(){
    if(!hasCanvas) return;
    const page = getActiveSketchPage();
    if(!page || !page.data) return;
    const img = new Image();
    img.onload = ()=>{
      ctx.clearRect(0,0,canvas.width,canvas.height);
      ctx.drawImage(img,0,0,canvas.width,canvas.height);
    };
    img.src = page.data;
  }

  function persist(){
    window.EPSMatrix.saveState(state);
  }

  function download(filename, content, type="application/json"){
    const blob = new Blob([content], {type});
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    setTimeout(()=>{ URL.revokeObjectURL(link.href); link.remove(); },0);
  }

  function ensureSketchStructure(){
    if(!Array.isArray(notes.sketchPages) || !notes.sketchPages.length){
      const first = makeSketchPage("Page 1");
      first.data = notes.sketch || null;
      notes.sketchPages = [first];
    }
    notes.sketch = null;
    if(!notes.activeSketchPageId || !notes.sketchPages.some((page)=>page.id === notes.activeSketchPageId)){
      notes.activeSketchPageId = notes.sketchPages[0].id;
    }
  }

  function getActiveSketchPage(){
    return (notes.sketchPages || []).find((page)=>page.id === notes.activeSketchPageId) || null;
  }

  function renderSketchTabs(){
    if(!sketchTabs) return;
    const pages = notes.sketchPages || [];
    if(!pages.length){
      sketchTabs.innerHTML = '<p class="muted">Ajoute ta première page stylet.</p>';
      return;
    }
    sketchTabs.innerHTML = pages.map((page, idx)=>{
      const title = page.title?.trim() || `Page ${idx+1}`;
      const activeClass = page.id === notes.activeSketchPageId ? "active" : "";
      return `<button class="sketchTab ${activeClass}" data-page="${page.id}" type="button">${title}</button>`;
    }).join("");
  }

  function addSketchPage(){
    saveCurrentCanvas();
    const title = `Page ${notes.sketchPages.length + 1}`;
    const page = makeSketchPage(title);
    notes.sketchPages.push(page);
    notes.activeSketchPageId = page.id;
    persist();
    renderSketchTabs();
    if(hasCanvas){
      ctx.clearRect(0,0,canvas.width,canvas.height);
    }
  }

  function renameSketchPage(){
    if(!hasCanvas) return;
    const page = getActiveSketchPage();
    if(!page) return;
    const name = prompt("Nom de la page stylet", page.title || "");
    if(name === null) return;
    const trimmed = name.trim();
    if(!trimmed || trimmed === page.title) return;
    page.title = trimmed;
    page.updatedAt = Date.now();
    persist();
    renderSketchTabs();
  }

  function deleteSketchPage(){
    if(!Array.isArray(notes.sketchPages) || notes.sketchPages.length <= 1){
      alert("Il faut garder au moins une page stylet.");
      return;
    }
    const page = getActiveSketchPage();
    if(!page) return;
    if(!confirm(`Supprimer ${page.title || "cette page"} ?`)) return;
    const idx = notes.sketchPages.findIndex((p)=>p.id === page.id);
    notes.sketchPages.splice(idx,1);
    const fallback = notes.sketchPages[idx] || notes.sketchPages[idx-1] || notes.sketchPages[0];
    notes.activeSketchPageId = fallback.id;
    persist();
    renderSketchTabs();
    restoreSketch();
  }

  function toggleFullscreenSketch(){
    if(!hasCanvas) return;
    fullscreen = !fullscreen;
    sketchShell?.classList.toggle("fullscreen", fullscreen);
    document.body.classList.toggle("sketch-fullscreen", fullscreen);
    if(btnFullscreenSketch){
      btnFullscreenSketch.textContent = fullscreen ? "Quitter plein écran" : "Plein écran";
    }
    updateExitButton();
    updateFloatingPanels();
    fitCanvas();
  }

  function exportCurrentSketch(){
    if(!hasCanvas) return;
    saveCurrentCanvas();
    const page = getActiveSketchPage();
    if(!page || !page.data){
      alert("Aucun tracé à exporter sur cette page.");
      return;
    }
    const name = `${window.EPSMatrix.sanitizeFileName(cls.name)}-${window.EPSMatrix.sanitizeFileName(page.title || "mode-stylet")}.png`;
    const link = document.createElement("a");
    link.href = page.data;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    setTimeout(()=>{ link.remove(); },0);
  }

  function saveCurrentCanvas(){
    if(!hasCanvas) return;
    const page = getActiveSketchPage();
    if(!page) return;
    try{
      page.data = canvas.toDataURL("image/png");
      page.updatedAt = Date.now();
      notes.activeSketchPageId = page.id;
      persist();
    }catch(err){
      console.warn("Impossible de sauvegarder le tracé", err);
    }
  }

  function randomStickyColor(){
    const palette = ["#fef9c3","#d9f99d","#bae6fd","#f5d0fe","#fed7aa","#fecdd3"];
    return palette[Math.floor(Math.random()*palette.length)];
  }

  function makeSketchPage(title){
    const factory = window.EPSMatrix && window.EPSMatrix.createSketchPage;
    if(typeof factory === "function") return factory(title);
    return {id:window.EPSMatrix.genId("sketch"), title:title || "Page stylet", data:null, createdAt:Date.now(), updatedAt:null};
  }

  function renderColorPalette(){
    if(!colorPalette) return;
    colorPalette.innerHTML = COLOR_PRESETS.map((color)=>`<button type="button" data-color="${color}" class="${color===currentColor?"active":""}" style="background:${color};"></button>`).join("");
    colorPalette.querySelectorAll("button").forEach((btn)=>{
      btn.addEventListener("click", ()=>{
        const color = btn.dataset.color;
        if(!color) return;
        setColor(color);
      });
    });
  }

  function renderSizePalette(){
    if(!sizePalette) return;
    sizePalette.innerHTML = SIZE_PRESETS.map((size)=>`<button type="button" data-size="${size}" class="${size===currentWidth?"active":""}">${size}px</button>`).join("");
    sizePalette.querySelectorAll("button").forEach((btn)=>{
      btn.addEventListener("click", ()=>{
        const size = Number(btn.dataset.size);
        if(!size) return;
        setStrokeWidth(size);
      });
    });
  }

  function setTool(tool){
    currentTool = tool;
    notes.sketchTool = tool;
    updateToolButtons();
    applyStrokePrefs();
    persist();
  }

  function setColor(color){
    currentColor = color;
    notes.sketchColor = color;
    if(currentTool !== "pen") setTool("pen");
    renderColorPalette();
    applyStrokePrefs();
    persist();
  }

  function setStrokeWidth(width){
    currentWidth = width;
    notes.sketchWidth = width;
    renderSizePalette();
    applyStrokePrefs();
    persist();
  }

  function updateToolButtons(){
    btnToolPen?.classList.toggle("active", currentTool === "pen");
    btnToolEraser?.classList.toggle("active", currentTool === "eraser");
  }

  function updateExitButton(){
    if(!btnExitFullscreen) return;
    btnExitFullscreen.classList.toggle("hidden", !fullscreen);
  }

  function updateFloatingPanels(){
    const floating = Boolean(fullscreen);
    sketchOptions?.classList.toggle("floating", floating);
    sketchToolbar?.classList.toggle("floating", floating);
  }

  function applyStrokePrefs(){
    if(!hasCanvas) return;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.globalCompositeOperation = currentTool === "eraser" ? "destination-out" : "source-over";
    ctx.lineWidth = currentTool === "eraser" ? Math.max(currentWidth * 1.6, currentWidth + 4) : currentWidth;
    ctx.strokeStyle = currentTool === "eraser" ? "#000" : currentColor;
  }
  }
})();
