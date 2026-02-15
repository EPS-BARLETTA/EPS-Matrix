const STORE_KEY = "eps.matrix.v1";
if(typeof structuredClone !== "function"){ window.structuredClone = (obj)=>JSON.parse(JSON.stringify(obj)); }
const DEFAULT_CLASS_COLOR = "#1c5bff";
const LISTE_DEFAULT = ["Niels","Valentina","Camille","Lea","Cecilia","Koray","Myla","Julie","Olivia","Gaia","Daria","Gabrielle","Evan","Anika","Marc","Emma","Auguste","Ysé","Victoria","Kenji","Tao","Edgar","Rafael","Bruno","Constance","Charlotte"];
const ARCHIVE_VERSION = 1;
const LEGACY_SCHEMA_VERSION = 1;
const STUDENT_ID_SCHEMA_VERSION = 2;
const CURRENT_SCHEMA_VERSION = STUDENT_ID_SCHEMA_VERSION;
const SCHEMA_MIGRATIONS = {};
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
    const parsed = migrateState(JSON.parse(raw));
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
  return {schemaVersion: CURRENT_SCHEMA_VERSION, classes:[]};
}

/**
 * Migrate persisted state to CURRENT_SCHEMA_VERSION.
 * Versions:
 * 1 – legacy structure without explicit schemaVersion.
 */
function migrateState(state){
  if(!state || typeof state !== "object"){
    return defaultState();
  }
  const nextState = state;
  let version = Number.isInteger(nextState.schemaVersion) ? nextState.schemaVersion : LEGACY_SCHEMA_VERSION;
  if(version < LEGACY_SCHEMA_VERSION){
    version = LEGACY_SCHEMA_VERSION;
  }
  nextState.schemaVersion = version;
  if(!Array.isArray(nextState.classes)){ nextState.classes = []; }
  while(version < CURRENT_SCHEMA_VERSION){
    const migrator = SCHEMA_MIGRATIONS[version];
    if(typeof migrator === "function"){
      migrator(nextState);
      version += 1;
      nextState.schemaVersion = version;
    }else{
      console.warn("Migration manquante, passage forcé à la version courante.", version);
      version = CURRENT_SCHEMA_VERSION;
      nextState.schemaVersion = version;
    }
  }
  return nextState;
}

SCHEMA_MIGRATIONS[LEGACY_SCHEMA_VERSION] = migrateLegacyStudentsToV2;

function migrateLegacyStudentsToV2(state){
  if(!state || !Array.isArray(state.classes)) return;
  let ambiguousTotal = 0;
  let unmatchedTotal = 0;
  state.classes.forEach((cls)=>{
    if(!cls || typeof cls !== "object") return;
    if(!Array.isArray(cls.students)){ cls.students = []; }
    cls.students.forEach(ensureStudentHasId);
    const classStudentRefs = new Set(cls.students);
    const nameBuckets = buildStudentNameBuckets(cls.students);
    if(!Array.isArray(cls.evaluations)){ cls.evaluations = []; }
    cls.evaluations.forEach((evaluation)=>{
      const evalStudents = evaluation?.data?.students;
      if(!Array.isArray(evalStudents)) return;
      evalStudents.forEach((stu)=>{
        if(!stu || stu.id) return;
        if(classStudentRefs.has(stu)){
          ensureStudentHasId(stu);
          return;
        }
        const key = normalizeStudentKey(stu.name);
        const matches = key ? nameBuckets.get(key) : null;
        if(matches && matches.length === 1){
          stu.id = matches[0].id;
          return;
        }
        if(matches && matches.length > 1){
          ambiguousTotal++;
        }else{
          unmatchedTotal++;
        }
        stu.id = genId("stu");
        stu.migrationUnmatched = true;
      });
    });
  });
  if(ambiguousTotal || unmatchedTotal){
    console.warn(`Migration student_id : ${ambiguousTotal} élève(s) ambigu(s), ${unmatchedTotal} non apparié(s).`);
  }
}

function ensureStudentHasId(student){
  if(student && !student.id){
    student.id = genId("stu");
  }
}

function buildStudentNameBuckets(students){
  const buckets = new Map();
  if(!Array.isArray(students)) return buckets;
  students.forEach((student)=>{
    if(!student) return;
    const key = normalizeStudentKey(student.name);
    if(!key) return;
    if(!buckets.has(key)){
      buckets.set(key, []);
    }
    buckets.get(key).push(student);
  });
  return buckets;
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
      scoring: normalizeScoringForCriteria(criteria, ev.data?.scoring),
      savedAt: ev.data?.savedAt || Date.now(),
      showNote: ev.data?.showNote === true
    }
  };
}

function computeEvaluationScore(evaluation, stu){
  const note = computeStudentNote(evaluation, stu);
  return note === "—" ? "" : note;
}

function computeCriterionOptions(crit){
  const info = CRITERIA_TYPES[crit.type] || {};
  if(info.isComment) return [];
  if(info.isCustom){
    return Array.isArray(crit.options) ? crit.options.filter(Boolean) : [];
  }
  if(Array.isArray(info.options)){
    return info.options.filter((opt)=>opt !== "");
  }
  return [];
}

function computeCriterionMaxValue(crit, scoringMap){
  if(!crit) return 0;
  const options = computeCriterionOptions(crit);
  const map = scoringMap || {};
  if(options.length){
    let localMax = 0;
    options.forEach((opt)=>{
      const value = Number(map[opt]) || 0;
      if(value > localMax) localMax = value;
    });
    return localMax;
  }
  const values = Object.values(map).map((value)=>Number(value)||0);
  return values.length ? Math.max(...values) : 0;
}

function computeStudentRawScore(evaluation, student){
  const criteria = evaluation?.data?.criteria || [];
  if(!criteria.length){
    return {total:0, max:0};
  }
  const scoring = evaluation?.data?.scoring || {};
  let total = 0;
  let max = 0;
  criteria.forEach((crit)=>{
    const map = scoring[crit.id] || {};
    const criterionMax = computeCriterionMaxValue(crit, map);
    max += criterionMax;
    const value = Number(map[student?.[crit.id]] || 0);
    total += value;
  });
  return {total, max};
}

function computeStudentNote(evaluation, student){
  const {total, max} = computeStudentRawScore(evaluation, student);
  if(!max) return "—";
  return ((total/max)*20).toFixed(1);
}

function isStudentValidated(evaluation, stu){
  if(!evaluation?.data?.criteria?.length) return false;
  return evaluation.data.criteria.every((crit)=>{
    const info = CRITERIA_TYPES[crit.type];
    if(info?.isComment) return Boolean(stu?.[crit.id]);
    if(info?.top) return (stu?.[crit.id]||"") === info.top;
    return Boolean(stu?.[crit.id]);
  });
}

function studentStatus(evaluation, stu){
  if(stu?.absent) return "absent";
  if(stu?.dispense) return "dispense";
  return isStudentValidated(evaluation, stu) ? "valide" : "encours";
}

function buildEvaluationCsv(evaluation){
  if(!evaluation?.data) return "";
  const baseFields = (evaluation.data.baseFields||[])
    .map((id)=>BASE_FIELDS.find((field)=>field.id === id))
    .filter(Boolean);
  const criteria = evaluation.data.criteria || [];
  const header = ["student_id","prenom","groupe", ...baseFields.map((field)=>field.label), ...criteria.map((crit)=>crit.label || "Critère"), "note","statut"];
  const rows = (evaluation.data.students || []).map((stu)=>{
    const baseValues = baseFields.map((field)=>String(stu?.[field.id]||"").replace(/\n/g," "));
    const critValues = criteria.map((crit)=>String(stu?.[crit.id]||"").replace(/\n/g," "));
    return [
      stu?.id || "",
      stu?.name || "",
      stu?.groupTag || "",
      ...baseValues,
      ...critValues,
      computeEvaluationScore(evaluation, stu) || "",
      studentStatus(evaluation, stu)
    ];
  });
  return [header, ...rows].map((line)=>line.map((cell)=>`"${String(cell ?? "").replace(/"/g,'""')}"`).join(",")).join("\n");
}

function sanitizeFileName(value=""){
  if(typeof value !== "string") return "eps-matrix";
  try{
    value = value.normalize("NFD").replace(/[\u0300-\u036f]/g,"");
  }catch(_e){/* ignore */}
  const clean = value.replace(/[^a-z0-9]+/gi,"-").replace(/-+/g,"-").replace(/^-|-$/g,"");
  return clean || "eps-matrix";
}

function serializeEvaluationArchive(cls, evaluation){
  return {
    version: ARCHIVE_VERSION,
    exportedAt: Date.now(),
    classSnapshot:{
      id: cls.id,
      name: cls.name,
      teacher: cls.teacher || "",
      site: cls.site || "",
      color: cls.color || DEFAULT_CLASS_COLOR,
      students: (cls.students||[]).map((stu)=>({id:stu.id || genId("stu"), name:stu.name || ""}))
    },
    evaluation: structuredClone(evaluation)
  };
}

function parseEvaluationArchive(raw){
  const payload = typeof raw === "string" ? JSON.parse(raw) : raw;
  if(!payload || typeof payload !== "object") throw new Error("Archive invalide");
  if(!payload.version || payload.version > ARCHIVE_VERSION) throw new Error("Archive non compatible");
  if(!payload.evaluation) throw new Error("Archives sans données d'évaluation");
  return payload;
}

function ensureClassFromSnapshot(state, snapshot){
  if(!snapshot) snapshot = {};
  let cls = snapshot.id ? state.classes.find((c)=>c.id === snapshot.id) : null;
  if(!cls){
    cls = {
      id: snapshot.id || genId("cls"),
      name: snapshot.name || "Classe importée",
      teacher: snapshot.teacher || "",
      site: snapshot.site || "",
      color: snapshot.color || DEFAULT_CLASS_COLOR,
      students: (snapshot.students||[]).map((stu)=>({id:stu.id || genId("stu"), name:stu.name || ""})),
      evaluations: [],
      notes: createEmptyNotes()
    };
    state.classes.push(cls);
  }else{
    cls.name = snapshot.name || cls.name;
    cls.teacher = snapshot.teacher || cls.teacher;
    cls.site = snapshot.site || cls.site;
    cls.color = snapshot.color || cls.color || DEFAULT_CLASS_COLOR;
    cls.students = Array.isArray(cls.students) ? cls.students : [];
    const existingById = new Map(cls.students.map((stu)=>[stu.id, stu]));
    (snapshot.students||[]).forEach((stu)=>{
      const id = stu.id || genId("stu");
      if(existingById.has(id)){
        const target = existingById.get(id);
        target.name = stu.name || target.name;
      }else{
        cls.students.push({id, name:stu.name || ""});
      }
    });
  }
  return cls;
}

function importEvaluationArchive(state, raw){
  const payload = parseEvaluationArchive(raw);
  const cls = ensureClassFromSnapshot(state, payload.classSnapshot);
  cls.evaluations = Array.isArray(cls.evaluations) ? cls.evaluations : [];
  const normalized = normalizeEvaluation(payload.evaluation, cls);
  normalized.status = payload.evaluation?.status === "archived" ? "archived" : "active";
  normalized.archivedAt = payload.evaluation?.archivedAt || (normalized.status === "archived" ? Date.now() : null);
  const existingIdx = cls.evaluations.findIndex((ev)=>ev.id === normalized.id);
  if(existingIdx === -1){
    cls.evaluations.unshift(normalized);
  }else{
    cls.evaluations[existingIdx] = normalized;
  }
  return {cls, evaluation: normalized};
}

function buildDefaultScoring(criteria){
  return normalizeScoringForCriteria(criteria, {});
}

function normalizeScoringForCriteria(criteria, sourceScoring){
  if(!Array.isArray(criteria) || !criteria.length) return {};
  const normalized = {};
  const base = (sourceScoring && typeof sourceScoring === "object") ? sourceScoring : {};
  criteria.forEach((crit)=>{
    const options = computeCriterionOptions(crit);
    if(!options.length) return;
    const existing = base[crit.id] || {};
    normalized[crit.id] = {};
    options.forEach((opt)=>{
      if(Object.prototype.hasOwnProperty.call(existing, opt)){
        const parsed = typeof existing[opt] === "number" ? existing[opt] : Number(existing[opt]);
        normalized[crit.id][opt] = Number.isFinite(parsed) ? parsed : 0;
      }else{
        normalized[crit.id][opt] = 0;
      }
    });
  });
  return normalized;
}

function saveState(state){
  try{
    if(state && typeof state === "object"){
      state.schemaVersion = CURRENT_SCHEMA_VERSION;
    }
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

function normalizeStudentKey(name=""){
  if(!name) return "";
  let normalized = name;
  try{
    normalized = normalized.normalize("NFD").replace(/[\u0300-\u036f]/g,"");
  }catch(_e){
    normalized = name;
  }
  return normalized.toLowerCase().replace(/\s+/g," ").trim();
}

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
  createSketchPage,
  buildDefaultScoring,
  createEvalStudent,
  parseNames,
  formatStudentName,
  normalizeStudentKey,
  genId,
  normalizeEvaluation,
  normalizeNotes,
  normalizeScoringForCriteria,
  computeEvaluationScore,
  isStudentValidated,
  buildEvaluationCsv,
  serializeEvaluationArchive,
  parseEvaluationArchive,
  importEvaluationArchive,
  computeCriterionOptions,
  computeCriterionMaxValue,
  computeStudentRawScore,
  computeStudentNote,
  sanitizeFileName,
  ARCHIVE_VERSION
};

function createEvalStudent(name, criteria){
  const stu = {id:genId("stu"), name, groupTag:"", niveau:"", projet1:"", projet2:"", commentaire:"", absent:false, dispense:false};
  criteria.forEach((crit)=>{ stu[crit.id] = ""; });
  return stu;
}

function createEmptyNotes(){
  return {table:{}, stickies:[], sketch:null, sketchPages:[createSketchPage("Page 1")], activeSketchPageId:null};
}

function createSketchPage(title="Page stylet"){
  return {id:genId("sketch"), title, data:null, createdAt:Date.now(), updatedAt:null};
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
  if(!Array.isArray(payload.sketchPages) || !payload.sketchPages.length){
    const first = createSketchPage("Page 1");
    first.data = payload.sketch || null;
    payload.sketchPages = [first];
  }
  if(payload.sketch && !payload.sketchPages[0].data){
    payload.sketchPages[0].data = payload.sketch;
  }
  if(!payload.activeSketchPageId || !payload.sketchPages.some((page)=>page.id === payload.activeSketchPageId)){
    payload.activeSketchPageId = payload.sketchPages[0].id;
  }
  payload.sketch = null;
  return payload;
}

function randomStickyColor(){
  const palette = ["#fef9c3","#d9f99d","#bae6fd","#f5d0fe","#fed7aa","#fecdd3"];
  return palette[Math.floor(Math.random()*palette.length)];
}
