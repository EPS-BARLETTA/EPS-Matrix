(function(){
  const params = new URLSearchParams(window.location.search);
  const classId = params.get("class");
  if(!classId){ window.location.href = "classes.html"; return; }
  const state = window.EPSMatrix.loadState();
  const cls = state.classes.find((c)=>c.id === classId);
  if(!cls){ window.location.href = "classes.html"; return; }
  if(!cls.notes){ cls.notes = window.EPSMatrix.createEmptyNotes(); }
  const notes = cls.notes;

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
  const canvas = document.getElementById("sketchCanvas");
  const ctx = canvas.getContext("2d");
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = 3;
  ctx.strokeStyle = "#0b2a6d";
  canvas.style.touchAction = "none";

  renderTable();
  renderStickies();
  fitCanvas();
  window.addEventListener("resize", fitCanvas);

  function renderTable(){
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

  addStickyBtn.addEventListener("click", ()=>{
    notes.stickies.push({id:window.EPSMatrix.genId("sticky"), text:"", color:randomStickyColor(), x:0, y:0});
    renderStickies();
    persist();
  });

  clearStickyBtn.addEventListener("click", ()=>{
    if(!notes.stickies.length) return;
    if(confirm("Effacer tous les post-it ?")){
      notes.stickies = [];
      renderStickies();
      persist();
    }
  });

  exportBtn.addEventListener("click", ()=>{
    const payload = {classe:{name:cls.name, teacher:cls.teacher, site:cls.site}, notes};
    download(`Bloc-note-${cls.name}.json`, JSON.stringify(payload,null,2));
  });

  function renderStickies(){
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

  let drawing = false;
  let offsetLeft = 0;
  let offsetTop = 0;

  canvas.addEventListener("pointerdown", (event)=>{
    drawing = true;
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

  function finishDraw(event){
    if(!drawing) return;
    drawing = false;
    if(event.pointerId) canvas.releasePointerCapture(event.pointerId);
    notes.sketch = canvas.toDataURL("image/png");
    persist();
  }

  clearSketchBtn.addEventListener("click", ()=>{
    ctx.clearRect(0,0,canvas.width,canvas.height);
    notes.sketch = null;
    persist();
  });

  function pointerPos(event){
    const rect = canvas.getBoundingClientRect();
    return {x:event.clientX - rect.left, y:event.clientY - rect.top};
  }

  function fitCanvas(){
    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = 360;
    canvas.style.width = rect.width + "px";
    canvas.style.height = "360px";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#0b2a6d";
    ctx.clearRect(0,0,canvas.width,canvas.height);
    if(notes.sketch){ restoreSketch(); }
  }

  function restoreSketch(){
    if(!notes.sketch) return;
    const img = new Image();
    img.onload = ()=>{ ctx.clearRect(0,0,canvas.width,canvas.height); ctx.drawImage(img,0,0,canvas.width,canvas.height); };
    img.src = notes.sketch;
  }

  function persist(){
    window.EPSMatrix.saveState(state);
  }

  function download(filename, content){
    const blob = new Blob([content], {type:"application/json"});
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    setTimeout(()=>{ URL.revokeObjectURL(link.href); link.remove(); },0);
  }

  function randomStickyColor(){
    const palette = ["#fef9c3","#d9f99d","#bae6fd","#f5d0fe","#fed7aa","#fecdd3"];
    return palette[Math.floor(Math.random()*palette.length)];
  }
})();
