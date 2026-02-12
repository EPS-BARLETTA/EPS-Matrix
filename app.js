const STORE_KEY = "eps.matrix.v1";
if(typeof structuredClone !== "function"){ window.structuredClone = (obj)=>JSON.parse(JSON.stringify(obj)); }
const DEFAULT_CLASS_COLOR = "#1c5bff";
const LISTE_DEFAULT = ["Niels","Valentina","Camille","Lea","Cecilia","Koray","Myla","Julie","Olivia","Gaia","Daria","Gabrielle","Evan","Anika","Marc","Emma","Auguste","Ysé","Victoria","Kenji","Tao","Edgar","Rafael","Bruno","Constance","Charlotte"];
const LEARNING_FIELDS = [
  {id:"CA1", title:"CA1 – Produire une performance optimale", desc:"Produire une performance optimale, mesurable à une échéance donnée.", color:"#0ea5e9"},
  {id:"CA2", title:"CA2 – Adapter ses déplacements", desc:"Adapter ses déplacements à des environnements variés.", color:"#14b8a6"},
  {id:"CA3", title:"CA3 – S'exprimer par une prestation", desc:"S’exprimer devant les autres par une prestation artistique et/ou acrobatique.", color:"#f97316"},
  {id:"CA4", title:"CA4 – Conduire un affrontement", desc:"Conduire et maîtriser un affrontement collectif ou interindividuel.", color:"#6366f1"},
  {id:"CA5", title:"CA5 – Entretenir son activité physique", desc:"Réaliser et orienter son activité physique en vue du développement et de l’entretien de soi.", color:"#ec4899"},
  {id:"NOTE", title:"Bloc note", desc:"Notes libres, post-its et croquis au stylet.", color:"#94a3b8"}
];
const CRITERIA_TYPES = {
  apa:{label:"A/PA/NA", options:["","A","PA","NA"], top:"A"},
  numeric4:{label:"Niveaux 1-4", options:["","1","2","3","4"], top:"4"},
  letter4:{label:"Niveaux A-D", options:["","A","B","C","D"], top:"A"},
  engagement:{label:"Oui/Partiel/Non", options:["","Oui","Partiel","Non"], top:"Oui"},
  validation:{label:"Validé/Ajuster", options:["","Validé","À ajuster"], top:"Validé"},
  check:{label:"✅/❌", options:["","✅","❌"], top:"✅"},
  comment:{label:"Commentaire", options:[], isComment:true},
  menu:{label:"Menu perso", options:[], isCustom:true}
};
const BASE_FIELDS = [
  {id:"niveau", label:"Niveau", type:"text"},
  {id:"projet1", label:"Projet 1", type:"text"},
  {id:"projet2", label:"Projet 2", type:"text"},
  {id:"commentaire", label:"Observation", type:"textarea"}
];
const DEFAULT_BASE_FIELDS = [];
const DEFAULT_CRITERIA = [];
let storageWarningShown = false;

function loadState(){
  try{
    const raw = localStorage.getItem(STORE_KEY);
    if(!raw){
      const fallback = window.__EPS_FALLBACK_STATE;
      if(fallback) return structuredClone(fallback);
      return defaultState();
    }
    const parsed = JSON.parse(raw);
    parsed.classes = Array.isArray(parsed.classes) && parsed.classes.length ? parsed.classes : defaultState().classes;
    parsed.classes.forEach((cls)=>{
      cls.students = (cls.students||[]).map((s)=>({id:s.id||genId("stu"), name:s.name||""}));
      cls.evaluations = (cls.evaluations||[]).map((ev)=>normalizeEvaluation(ev, cls));
      cls.color = cls.color || DEFAULT_CLASS_COLOR;
      cls.notes = normalizeNotes(cls.notes, cls);
    });
    window.__EPS_FALLBACK_STATE = structuredClone(parsed);
    return parsed;
  }catch(e){
    console.warn("loadState fallback", e);
    if(window.__EPS_FALLBACK_STATE){
      return structuredClone(window.__EPS_FALLBACK_STATE);
    }
    return defaultState();
  }
}

function defaultState(){
  return {classes:[]};
}

function normalizeEvaluation(ev, cls){
  const hasCriteria = Array.isArray(ev.data?.criteria);
  const criteria = hasCriteria ? ev.data.criteria : structuredClone(DEFAULT_CRITERIA);
  const baseFields = Array.isArray(ev.data?.baseFields) ? ev.data.baseFields : DEFAULT_BASE_FIELDS.slice();
  const students = (ev.data?.students && ev.data.students.length) ? ev.data.students : cls.students.map((stu)=>createEvalStudent(stu.name, criteria));
  students.forEach((stu)=>{
    if(!stu.id) stu.id = genId("stu");
    if(typeof stu.groupTag === "undefined") stu.groupTag = "";
    criteria.forEach((crit)=>{ if(typeof stu[crit.id] === "undefined") stu[crit.id] = ""; });
  });
  return {
    id: ev.id || genId("eval"),
    activity: ev.activity || ev.data?.meta?.activity || "Évaluation",
    learningField: ev.learningField || "CA4",
    status: ev.status === "archived" ? "archived" : "active",
    createdAt: ev.createdAt || Date.now(),
    archivedAt: ev.archivedAt || null,
    data:{
      meta:{classe:ev.data?.meta?.classe || cls.name, activity:ev.activity || ev.data?.meta?.activity || "Évaluation", enseignant:ev.data?.meta?.enseignant || cls.teacher || "", site:ev.data?.meta?.site || cls.site || "", date:ev.data?.meta?.date || ""},
      baseFields,
      criteria,
      students,
      scoring: ev.data?.scoring || buildDefaultScoring(criteria),
      savedAt: ev.data?.savedAt || Date.now(),
      showNote: ev.data?.showNote === true
    }
  };
}

function buildDefaultScoring(){
  return {};
}

function saveState(state){
  try{
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
    window.__EPS_FALLBACK_STATE = structuredClone(state);
  }catch(e){
    console.warn("saveState fallback", e);
    window.__EPS_FALLBACK_STATE = structuredClone(state);
    if(!storageWarningShown){
      alert("Sauvegarde locale impossible (mode privé ou stockage bloqué). Les données restent disponibles tant que l'onglet reste ouvert.");
      storageWarningShown = true;
    }
  }
}
function genId(prefix){ return `${prefix}_${Math.random().toString(36).slice(2,7)}${Date.now().toString(36).slice(-4)}`; }

function formatStudentName(raw){
  if(!raw) return "";
  const clean = raw.replace(/\s+/g," ").trim();
  if(!clean) return "";
  const parts = clean.split(" ");
  if(parts.length === 1) return capitalize(parts[0]);
  const first = capitalize(parts.at(-1));
  const initial = parts.slice(0,-1).map((p)=>p[0]?p[0].toUpperCase()+".":"").join("");
  return initial ? `${first} ${initial}` : first;
}
function capitalize(word){ return word ? word.charAt(0).toUpperCase()+word.slice(1).toLowerCase() : ""; }
function parseNames(text=""){ return text.split(/\r?\n|;|,|\t/).map(formatStudentName).filter(Boolean); }

window.EPSMatrix = {
  loadState,
  saveState,
  defaultState,
  LISTE_DEFAULT,
  LEARNING_FIELDS,
  CRITERIA_TYPES,
  BASE_FIELDS,
  DEFAULT_BASE_FIELDS,
  DEFAULT_CRITERIA,
  createEmptyNotes,
  buildDefaultScoring,
  createEvalStudent,
  parseNames,
  formatStudentName,
  genId
};

function createEvalStudent(name, criteria){
  const stu = {id:genId("stu"), name, groupTag:"", niveau:"", projet1:"", projet2:"", commentaire:"", absent:false, dispense:false};
  criteria.forEach((crit)=>{ stu[crit.id] = ""; });
  return stu;
}

function createEmptyNotes(){
  return {table:{}, stickies:[], sketch:null};
}

function normalizeNotes(notes, cls){
  const base = createEmptyNotes();
  const payload = Object.assign({}, base, notes||{});
  if(!payload.table) payload.table = {};
  cls.students.forEach((stu)=>{ if(typeof payload.table[stu.id] !== "string") payload.table[stu.id] = ""; });
  payload.stickies = Array.isArray(payload.stickies) ? payload.stickies.map((stick)=>({
    id: stick.id || genId("sticky"),
    text: typeof stick.text === "string" ? stick.text : "",
    color: stick.color || randomStickyColor(),
    x: typeof stick.x === "number" ? stick.x : 0,
    y: typeof stick.y === "number" ? stick.y : 0
  })) : [];
  payload.sketch = payload.sketch || null;
  return payload;
}

function randomStickyColor(){
  const palette = ["#fef9c3","#d9f99d","#bae6fd","#f5d0fe","#fed7aa","#fecdd3"];
  return palette[Math.floor(Math.random()*palette.length)];
}
