/* ---------- Print Selection ---------- */
// Print selection replaced the older Favorites concept. The legacy key is still
// read once so existing browsers keep their selected resources after upgrading.

function loadPrintSelection(){
  let raw = localStorage.getItem(PRINT_SELECTION_STORAGE_KEY);
  if(raw === null){
    raw = localStorage.getItem(LEGACY_FAVORITES_STORAGE_KEY);
    if(raw !== null){
      localStorage.setItem(PRINT_SELECTION_STORAGE_KEY, raw);
      localStorage.removeItem(LEGACY_FAVORITES_STORAGE_KEY);
    }
  }
  let parsed = [];
  try{
    parsed = JSON.parse(raw || "[]");
  }catch(e){
    parsed = [];
  }
  return Array.isArray(parsed) ? parsed.map(id => String(id || "")).filter(Boolean) : [];
}

function savePrintSelection(){
  localStorage.setItem(PRINT_SELECTION_STORAGE_KEY, JSON.stringify(printSelection));
  localStorage.removeItem(LEGACY_FAVORITES_STORAGE_KEY);
}

function sanitizePrintSelection(){
  const resourceIds = new Set((data.resources || []).map(resource => String(resource && resource.id || "")));
  const filtered = printSelection.filter(id => resourceIds.has(String(id || "")));
  if(filtered.length !== printSelection.length){
    printSelection = filtered;
    savePrintSelection();
  }
}

function isSelectedForPrinting(id){
  return printSelection.includes(String(id || ""));
}

function getPrintSelectionIcon(id){
  return isSelectedForPrinting(id) ? "🖨️" : "⬜";
}

function getPrintSelectionResources(){
  const selectedIds = new Set(printSelection.map(id => String(id || "")));
  return data.resources.filter(resource => selectedIds.has(String(resource.id || "")));
}

function updatePrintSelectionIndicator(){
  if(tabPrintSelection) tabPrintSelection.textContent = `🖨️ (${printSelection.length})`;
}

function getCategoryPrintInstructionText(){
  const count = printSelection.length;
  return count
    ? `Click 🖨️ (${count}) in the top bar to review and print selected resources.`
    : "Click ⬜ next to a resource to select it for printing.";
}

function togglePrintSelection(id, { rerender = true } = {}){
  const cleanId = String(id || "");
  if(!cleanId) return;
  if(!data.resources.some(resource => String(resource && resource.id || "") === cleanId)) return;
  const set=new Set(printSelection);
  set.has(cleanId)?set.delete(cleanId):set.add(cleanId);
  printSelection=[...set];
  savePrintSelection();
  updatePrintSelectionIndicator();
  if(rerender) safeRender();
}

/* ---------- Print ---------- */

// PrintWorkflow is a small queue-based state machine for print preview/packet flow.
// Each queue entry has a label and render function so print steps stay data-driven.
// The queue currently has one visible step, but keeping this as a queue preserves
// the separation between normal resource cards and list-style flyer output.
const PrintWorkflow = {
  queue: [],
  currentIndex: -1,
  initiatedByButton: false,

  isListResource(res){
    return resourceMatchesListsHeuristic(res);
  },

  getPrintSelectionGroups(){
    // "List" resources are separated so print selection packet output can render flyers.
    const normalSelections = [];
    const listSelections = [];

    getPrintSelectionResources().forEach(res => {
      if(this.isListResource(res)){
        listSelections.push(res);
      }else{
        normalSelections.push(res);
      }
    });

    return { normalSelections, listSelections };
  },

  buildQueue(){
    const { normalSelections, listSelections } = this.getPrintSelectionGroups();
    if(!normalSelections.length && !listSelections.length) return [];
    if(!listSelections.length){
      return [{
        label:"Print Selection",
        render: () => this.renderPrintSelection(normalSelections)
      }];
    }
    return [{
      label:"Print Selection",
      render: () => this.renderPrintSelectionPacket(normalSelections, listSelections)
    }];
  },

  updateUI(){
    const active = this.queue.length > 0 && this.currentIndex >= 0 && this.currentIndex < this.queue.length;
    const isLastStep = active && this.currentIndex === this.queue.length - 1;
    printCloseBtn.classList.toggle("hidden", active && !isLastStep);
    printActionBtn.classList.toggle("hidden", !active);
    printNextBtn.classList.toggle("hidden", !active || isLastStep);
    if(!active){
      printProgress.textContent = "";
      return;
    }
    printProgress.textContent = "";
  },

  showStep(){
    const step = this.queue[this.currentIndex];
    if(!step || typeof step.render !== "function") return;
    step.render();
  },

  openPreviewContent(render){
    this.updateUI();
    printContent.innerHTML="";
    if(typeof render === "function") render(printContent);
    printModal.classList.remove("hidden");
  },

  openPreview(resources){
    this.openPreviewContent(container => {
      this.renderPrintableResourceCards(container, resources);
    });
  },

  renderPrintableResourceCards(container, resources){
    (Array.isArray(resources) ? resources : []).forEach((res, index)=>{
      if(index > 0){
        const separator = document.createElement("hr");
        separator.className = "print-resource-separator";
        separator.classList.toggle("print-disabled", !isSelectedForPrinting(res.id));
        container.appendChild(separator);
      }
      const card=buildResourceCard(res,{expanded:true});
      card.classList.toggle("print-disabled", !isSelectedForPrinting(res.id));
      const toggle = card.querySelector(".print-selection-toggle");
      if(toggle){
        toggle.onclick = e => {
          e.stopPropagation();
          togglePrintSelection(res.id, { rerender:false });
          this.showStep();
          safeRender();
        };
      }
      container.appendChild(card);
    });
  },

  renderPrintSelection(normalSelections){
    this.openPreview(normalSelections);
  },

  buildListFlyer(resource, shouldPageBreak){
    const flyer = document.createElement("section");
    flyer.className = "print-list-flyer" + (shouldPageBreak ? " print-list-flyer-page-break" : "");
    flyer.classList.toggle("print-disabled", !isSelectedForPrinting(resource.id));

    let html = `<button type="button" class="print-selection-toggle" style="position:static; margin-right:8px;">${getPrintSelectionIcon(resource.id)}</button><h2 style="display:inline;">${escapeHTML(resource.name || "")}</h2>`;
    if(resource.phone) html += `<div class="print-list-field"><strong>Phone:</strong> ${escapeHTML(resource.phone)}</div>`;
    if(resource.address) html += `<div class="print-list-field"><strong>Address:</strong> ${escapeHTML(resource.address)}</div>`;
    if(resource.website) html += `<div class="print-list-field"><strong>Website:</strong> ${escapeHTML(resource.website)}</div>`;
    if(resource.informationText){
      html += `<div class="print-list-field"><strong>Information:</strong><div class="information-rendered resource-info-rendered">${renderInformationHTML(resource.informationText)}</div></div>`;
    }
    flyer.innerHTML = html;
    const toggle = flyer.querySelector(".print-selection-toggle");
    if(toggle){
      toggle.onclick = e => {
        e.stopPropagation();
        togglePrintSelection(resource.id, { rerender:false });
        this.showStep();
        safeRender();
      };
    }
    return flyer;
  },

  renderPrintSelectionPacket(normalSelections, listSelections){
    this.openPreviewContent(container => {
      if(normalSelections.length){
        this.renderPrintableResourceCards(container, normalSelections);
      }

      listSelections.forEach((resource, index) => {
        container.appendChild(this.buildListFlyer(resource, normalSelections.length > 0 || index > 0));
      });
    });
  },

  renderSingleListResource(resourceId){
    const { listSelections } = this.getPrintSelectionGroups();
    const resource = listSelections.find(res => res.id === resourceId);
    if(!resource) return;
    this.openPreview([resource]);
  },

  startPrintSelection(){
    this.queue = this.buildQueue();
    if(!this.queue.length){
      this.openPreviewContent(container => {
        container.innerHTML = "<p>No resources are selected for printing.</p><p class=\"print-empty-instruction\">Click ⬜ next to a resource to include it in the printed handout.</p>";
      });
      return;
    }
    this.currentIndex = 0;
    this.showStep();
  },

  next(){
    if(this.currentIndex >= this.queue.length - 1) return this.close();
    this.currentIndex += 1;
    this.showStep();
  },

  close(){
    this.queue = [];
    this.currentIndex = -1;
    this.updateUI();
    printModal.classList.add("hidden");
  },

  doPrint(){
    this.initiatedByButton = true;
    const disabled = Array.from(printContent.querySelectorAll(".print-disabled"));
    disabled.forEach(el => el.setAttribute("data-print-hidden", "true"));
    window.print();
    clearAllCategoryFilters(false);
  },

  handleAfterPrint(){
    if(!this.initiatedByButton) return;
    this.initiatedByButton = false;
  }
};

function startPrintSelectionPreview(){ PrintWorkflow.startPrintSelection(); }
function nextPrintStep(){ PrintWorkflow.next(); }
function closePrintPreview(){ PrintWorkflow.close(); }
function doPrint(){ PrintWorkflow.doPrint(); }
