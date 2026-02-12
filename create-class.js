(function(){
  const state = window.EPSMatrix.loadState();
  const form = document.getElementById("classForm");
  form.addEventListener("submit", (e)=>{
    e.preventDefault();
    const data = new FormData(form);
    const name = data.get("name").trim();
    if(!name){ alert("Nom obligatoire"); return; }
    const teacher = data.get("teacher").trim();
    const site = data.get("site").trim();
    const color = data.get("color") || "#1c5bff";
    const parsed = window.EPSMatrix.parseNames(data.get("students")||"");
    const students = parsed.map((n)=>({id:window.EPSMatrix.genId("stu"), name:n}));
    state.classes.push({
      id: window.EPSMatrix.genId("cls"),
      name,
      teacher,
      site,
      color,
      students,
      evaluations:[],
      notes: window.EPSMatrix.createEmptyNotes()
    });
    window.EPSMatrix.saveState(state);
    window.location.href = "classes.html";
  });
})();
