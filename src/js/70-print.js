/* ---------- Favorites ---------- */
// Favorites are personal browser state. They are scoped by the office storage
// prefix and the signed-in Windows/Edge user, and never enter resource packages.

function normalizeStoredResourceIds(value){
  const seen = new Set();
  return (Array.isArray(value) ? value : [])
    .map(id => String(id || "").trim())
    .filter(id => {
      if(!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
}

function loadFavoriteResourceIds(){
  try{
    return normalizeStoredResourceIds(JSON.parse(localStorage.getItem(FAVORITE_RESOURCE_IDS_STORAGE_KEY) || "[]"));
  }catch(_err){
    return [];
  }
}

function saveFavoriteResourceIds(){
  localStorage.setItem(FAVORITE_RESOURCE_IDS_STORAGE_KEY, JSON.stringify(favoriteResourceIds));
}

function sanitizeFavoriteResourceIds(){
  const resourceIds = new Set((data.resources || []).map(resource => String(resource && resource.id || "")));
  const filtered = normalizeStoredResourceIds(favoriteResourceIds)
    .filter(id => resourceIds.has(id));
  if(JSON.stringify(filtered) !== JSON.stringify(favoriteResourceIds)){
    favoriteResourceIds = filtered;
    saveFavoriteResourceIds();
  }
}

function isFavoriteResource(id){
  return favoriteResourceIds.includes(String(id || ""));
}

function getFavoriteResources(){
  const selectedIds = new Set(favoriteResourceIds);
  return (Array.isArray(data.resources) ? data.resources : [])
    .filter(resource => selectedIds.has(String(resource && resource.id || "")));
}

function toggleFavoriteResource(id, { rerender = true } = {}){
  const cleanId = String(id || "");
  if(!cleanId) return;
  if(!data.resources.some(resource => String(resource && resource.id || "") === cleanId)) return;
  const selectedIds = new Set(favoriteResourceIds);
  selectedIds.has(cleanId) ? selectedIds.delete(cleanId) : selectedIds.add(cleanId);
  favoriteResourceIds = Array.from(selectedIds);
  saveFavoriteResourceIds();
  if(rerender) safeRender();
}

/* ---------- Print Selection ---------- */
// Read the transitional storage key once so earlier builds keep their selected
// resources after upgrading.

function loadPrintSelection(){
  let raw = localStorage.getItem(PRINT_SELECTION_STORAGE_KEY);
  if(raw === null){
    raw = localStorage.getItem(LEGACY_PRINT_SELECTION_STORAGE_KEY);
    if(raw !== null){
      localStorage.setItem(PRINT_SELECTION_STORAGE_KEY, raw);
      localStorage.removeItem(LEGACY_PRINT_SELECTION_STORAGE_KEY);
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
  localStorage.removeItem(LEGACY_PRINT_SELECTION_STORAGE_KEY);
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

function getPrintSelectionResources(){
  const selectedIds = new Set(printSelection.map(id => String(id || "")));
  return data.resources.filter(resource => selectedIds.has(String(resource.id || "")));
}

function updatePrintSelectionIndicator(){
  if(tabPrintSelection) tabPrintSelection.textContent = `🖨️ (${printSelection.length})`;
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

// PrintWorkflow owns the print preview. `step` renders what the preview shows, so a
// print toggle inside the preview can redraw it; it is null when nothing can print.
// Resource cards print first, then list-style resources as flyers.
const PrintWorkflow = {
  step: null,
  editorPreview: false,
  returnFocus: null,

  getPrintSelectionGroups(){
    // "List" resources are separated so print selection packet output can render flyers.
    const normalSelections = [];
    const listSelections = [];

    getPrintSelectionResources().forEach(res => {
      if(resourceMatchesListsHeuristic(res)){
        listSelections.push(res);
      }else{
        normalSelections.push(res);
      }
    });

    return { normalSelections, listSelections };
  },

  updateUI(){
    printActionBtn.classList.toggle("hidden", !this.step);
  },

  showStep(){
    if(typeof this.step === "function") this.step();
  },

  openPreviewContent(render){
    this.updateUI();
    printContent.innerHTML="";
    if(typeof render === "function") render(printContent);
    printModal.classList.remove("hidden");
  },

  renderPrintableResourceCards(container, resources){
    (Array.isArray(resources) ? resources : []).forEach((res, index)=>{
      if(index > 0){
        const separator = document.createElement("hr");
        separator.className = "print-resource-separator";
        separator.classList.toggle("print-disabled", !isSelectedForPrinting(res.id));
        container.appendChild(separator);
      }
      const card=buildResourceCard(res,{expanded:true,showDescription:true});
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

  buildListFlyer(resource, shouldPageBreak, { interactive = true } = {}){
    const flyer = document.createElement("section");
    flyer.className = "print-list-flyer" + (shouldPageBreak ? " print-list-flyer-page-break" : "");
    if(interactive) flyer.classList.toggle("print-disabled", !isSelectedForPrinting(resource.id));

    let html = `<div class="print-list-heading"><span class="print-list-actions-placeholder"></span><h2>${escapeHTML(resource.name || "")}</h2></div>`;
    if(resource.description) html += `<div class="print-list-field"><strong>Description:</strong> ${escapeHTML(resource.description)}</div>`;
    if(resource.phone) html += `<div class="print-list-field"><strong>Phone:</strong> ${escapeHTML(resource.phone)}</div>`;
    if(resource.address) html += `<div class="print-list-field"><strong>Address:</strong> ${escapeHTML(resource.address)}</div>`;
    if(resource.website) html += `<div class="print-list-field"><strong>Website:</strong> ${escapeHTML(resource.website)}</div>`;
    if(resource.informationText){
      html += `<div class="print-list-field"><strong>Information:</strong><div class="information-rendered resource-info-rendered">${renderInformationHTML(resource.informationText)}</div></div>`;
    }
    flyer.innerHTML = html;
    const placeholder = flyer.querySelector(".print-list-actions-placeholder");
    if(interactive){
      const actions = createResourceActionButtons(resource);
      actions.classList.add("print-list-actions");
      if(placeholder) placeholder.replaceWith(actions);
      const toggle = flyer.querySelector(".print-selection-toggle");
      if(toggle){
        toggle.onclick = e => {
          e.stopPropagation();
          togglePrintSelection(resource.id, { rerender:false });
          this.showStep();
          safeRender();
        };
      }
    }else if(placeholder){
      placeholder.remove();
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

  startPrintSelection(){
    this.editorPreview = false;
    const { normalSelections, listSelections } = this.getPrintSelectionGroups();
    if(!normalSelections.length && !listSelections.length){
      this.step = null;
      this.openPreviewContent(container => {
        container.innerHTML = "<p>No resources are selected for printing.</p><p class=\"print-empty-instruction\">Click the gray printer button next to a resource to include it in the printed handout.</p>";
      });
      return;
    }
    this.step = () => this.renderPrintSelectionPacket(normalSelections, listSelections);
    this.showStep();
  },

  previewSingleResource(resource){
    if(!resource) return;
    this.editorPreview = true;
    this.returnFocus = document.activeElement;
    this.step = () => this.openPreviewContent(container => {
        if(resourceMatchesListsHeuristic(resource)){
          container.appendChild(this.buildListFlyer(resource, false, { interactive:false }));
          return;
        }
        container.appendChild(buildResourceCard(resource, {
          expanded:true,
          showDescription:true,
          showPrintToggle:false,
          showFavoriteToggle:false
        }));
      });
    this.showStep();
  },

  close(){
    this.step = null;
    this.updateUI();
    printModal.classList.add("hidden");
    if(this.returnFocus && this.returnFocus.isConnected) this.returnFocus.focus();
    this.returnFocus = null;
    this.editorPreview = false;
  },

  doPrint(){
    const disabled = Array.from(printContent.querySelectorAll(".print-disabled"));
    disabled.forEach(el => el.setAttribute("data-print-hidden", "true"));
    window.print();
    if(!this.editorPreview) clearAllCategoryFilters();
  }
};

function startPrintSelectionPreview(){ PrintWorkflow.startPrintSelection(); }
function closePrintPreview(){ PrintWorkflow.close(); }
function doPrint(){ PrintWorkflow.doPrint(); }

function getCurrentResourcePrintPreviewData(){
  const idx = getResourceIndexById(selectedResourceId);
  const resource = idx >= 0 ? data.resources[idx] : null;
  if(!resource) return null;
  const draft = resourceEditorDraft();
  if(!draft) return cloneDataObject(resource);
  const preview = cloneDataObject(resource);
  Object.entries(draft).forEach(([key, value]) => {
    if(key !== "updateDescription") preview[key] = structuredClone(value);
  });
  return preview;
}

function printCurrentResource(){
  const resource = getCurrentResourcePrintPreviewData();
  if(!resource) return;
  PrintWorkflow.previewSingleResource(resource);
}
