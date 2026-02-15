(function(){
  let modalEl = null;
  let titleEl = null;
  let messageEl = null;
  let inputEl = null;
  let confirmBtn = null;
  let cancelBtn = null;
  let activeResolver = null;
  let modalOptions = null;
  let keyHandler = null;

  function ensureModal(){
    if(modalEl) return;
    modalEl = document.createElement("div");
    modalEl.className = "modal hidden";
    modalEl.innerHTML = `
      <div class="modalCard" style="max-width:420px;">
        <div class="modalHeader">
          <h2 id="promptModalTitle">Saisie</h2>
          <button class="iconButton" data-role="close" aria-label="Fermer">×</button>
        </div>
        <p class="muted" id="promptModalMessage"></p>
        <input type="text" id="promptModalInput" style="width:100%;margin:12px 0;padding:10px 12px;border-radius:14px;border:1px solid var(--line);font-size:1rem;font-family:inherit;" />
        <div class="actions" style="display:flex;justify-content:flex-end;gap:12px;flex-wrap:wrap;">
          <button class="btn secondary" type="button" data-role="cancel">Annuler</button>
          <button class="btn primary" type="button" data-role="confirm">Valider</button>
        </div>
      </div>`;
    document.body.appendChild(modalEl);
    titleEl = modalEl.querySelector("#promptModalTitle");
    messageEl = modalEl.querySelector("#promptModalMessage");
    inputEl = modalEl.querySelector("#promptModalInput");
    confirmBtn = modalEl.querySelector("[data-role='confirm']");
    cancelBtn = modalEl.querySelector("[data-role='cancel']");
    modalEl.querySelector("[data-role='close']").addEventListener("click", ()=>closeModal(null));
    cancelBtn.addEventListener("click", ()=>closeModal(null));
    confirmBtn.addEventListener("click", ()=>{
      const allowEmpty = Boolean(modalOptions?.allowEmpty);
      const value = inputEl.value.trim();
      if(!value && !allowEmpty){
        inputEl.focus();
        return;
      }
      closeModal(value);
    });
  }

  function closeModal(result){
    if(!modalEl || !activeResolver) return;
    modalEl.classList.add("hidden");
    document.removeEventListener("keydown", keyHandler);
    modalOptions = null;
    const resolver = activeResolver;
    activeResolver = null;
    resolver(result);
  }

  function openPrompt(options={}){
    ensureModal();
    if(activeResolver){
      return Promise.resolve(null);
    }
    return new Promise((resolve)=>{
      activeResolver = resolve;
      modalOptions = {allowEmpty: options.allowEmpty === true};
      titleEl.textContent = options.title || "Saisie";
      messageEl.textContent = options.message || "";
      inputEl.value = options.defaultValue || "";
      inputEl.placeholder = options.placeholder || "";
      modalEl.classList.remove("hidden");
      requestAnimationFrame(()=>inputEl.focus());
      keyHandler = (event)=>{
        if(event.key === "Escape"){
          event.preventDefault();
          closeModal(null);
        }else if(event.key === "Enter"){
          event.preventDefault();
          confirmBtn.click();
        }
      };
      document.addEventListener("keydown", keyHandler);
    });
  }

  window.EPSPrompt = {
    prompt: openPrompt
  };
})();
