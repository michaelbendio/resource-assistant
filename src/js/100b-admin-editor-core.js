/* =========================
   Admin editor coordination
========================= */
// Shared drafts, validation, action bars, and commit coordination used by the
// focused category, resource, and For-group editor modules.

function switchAdminTab(nextTab){
  if(adminTab === nextTab) return;
  if(!["categories", "resources", "forGroups"].includes(nextTab)) return;
  if(!commitPendingEditsIfChanged()) return;
  if(nextTab !== "resources"){
    adminResourceEditMode = false;
  }
  adminTab = nextTab;
  safeRenderAdmin();
}

function categoryEditorDraft(){
  // Capture category editor form state as a plain draft object.
  const labelEl = document.getElementById("cat_label");
  const updateEl = document.getElementById("cat_update_description");
  if(!labelEl || !editing || editing.kind !== "category") return null;
  const cat = data.categories[editing.idx];
  if(!cat) return null;
  return {
    id: cat.id || generateResourceId(),
    label: labelEl.value.trim(),
    filters: Array.from(document.querySelectorAll(".catFilterInput"))
      .map(input => input.value)
      .filter(value => String(value || "").trim()),
    updateDescription: updateEl ? updateEl.value.trim() : ""
  };
}

function resourceEditorDraft(){
  // Capture resource editor form state as a plain draft object.
  const nameEl = document.getElementById("res_name");
  const phoneEl = document.getElementById("res_phone");
  const addressEl = document.getElementById("res_address");
  const websiteEl = document.getElementById("res_website");
  const hoursEl = document.getElementById("res_hours");
  const descEl = document.getElementById("res_description");
  const updateEl = document.getElementById("res_update_description");
  if(!nameEl || !phoneEl || !addressEl || !websiteEl || !hoursEl || !descEl) return null;
  const verifiedEl = document.getElementById("res_verified_on");
  const verifiedOn = verifiedEl ? verifiedEl.value.trim() : "";
  const forGroups = Array.from(document.querySelectorAll(".resForGroup"))
    .filter(cb=>cb.checked)
    .map(cb=>cb.value)
    .sort();
  const categories = Array.from(document.querySelectorAll(".resCat"))
    .filter(cb=>cb.checked)
    .map(cb=>cb.value)
    .sort();
  const categoryFilters = {};
  categories.forEach(categoryId => {
    const filters = Array.from(document.querySelectorAll(".resCatFilter"))
      .filter(cb => cb.dataset.categoryId === categoryId)
      .filter(cb => cb.checked)
      .map(cb => cb.value);
    const cleaned = normalizeCategoryFilters(filters);
    if(cleaned.length) categoryFilters[categoryId] = cleaned;
  });
  const additionalEl = document.getElementById("res_info_additional");
  const informationDraft = { additional:additionalEl ? additionalEl.value : "" };

  return {
    name: nameEl.value.trim(),
    phone: phoneEl.value.trim(),
    address: addressEl.value.trim(),
    website: websiteEl.value.trim(),
    hours: hoursEl.value.trim(),
    description: descEl.value,
    informationText: composeInformationText(informationDraft),
    verifiedOn,
    categories,
    categoryFilters,
    forGroups,
    updateDescription: updateEl ? updateEl.value.trim() : ""
  };
}

function getResourceIndexById(resourceId){
  if(!resourceId) return -1;
  return data.resources.findIndex(r => r && r.id === resourceId);
}

function getCategoryIndexById(categoryId){
  if(!categoryId) return -1;
  return data.categories.findIndex(category => category && category.id === categoryId);
}

function validateResourceName(draft, idx){
  // Prevent empty names and duplicates before applying/persisting resource edits.
  const name = String(draft && draft.name || "").trim();
  if(!name){
    return { valid:false, message:"Name is required." };
  }
  const lower = name.toLowerCase();
  const duplicate = data.resources.some((r, i) => i !== idx && String(r && r.name || "").trim().toLowerCase() === lower);
  if(duplicate){
    return { valid:false, message:"Another resource already uses this name." };
  }
  return { valid:true, message:"" };
}

function normalizeCategoryName(name){
  return String(name || "").trim().toLowerCase();
}

function compareCategoriesByLabel(a, b){
  const labelA = String(a && a.label || "");
  const labelB = String(b && b.label || "");
  return labelA.localeCompare(labelB, undefined, { sensitivity:"base" });
}

function getAlphabeticalCategoryPairs(){
  return (Array.isArray(data.categories) ? data.categories : [])
    .map((c,i)=>({c,i}))
    .sort((a,b)=>{
      const labelCompare = compareCategoriesByLabel(a.c, b.c);
      return labelCompare || a.i - b.i;
    });
}

function categoryNameExists(name, excludeId){
  const normalizedName = normalizeCategoryName(name);
  if(!normalizedName) return false;
  return (Array.isArray(data.categories) ? data.categories : []).some(cat => {
    if(excludeId && String(cat && cat.id || "") === String(excludeId)) return false;
    return normalizeCategoryName(cat && cat.label) === normalizedName;
  });
}

function validateCategoryDraft(draft){
  if(!String(draft && draft.label || "").trim()){
    return { valid:false, message:"Category name is required." };
  }
  if(categoryNameExists(draft && draft.label, draft && draft.id)){
    return { valid:false, message:"Category already exists." };
  }
  return { valid:true, message:"" };
}

function showCategoryEditorWarning(message){
  const warning = document.getElementById("cat_editor_warning");
  if(!warning) return;
  warning.textContent = message || "";
  warning.style.display = message ? "block" : "none";
}

function showResourceNameWarning(message){
  const warning = document.getElementById("res_name_warning");
  if(!warning) return;
  warning.textContent = message || "";
  warning.style.display = message ? "block" : "none";
}

function showResourceVerifiedWarning(message){
  const warning = document.getElementById("res_verified_warning");
  if(!warning) return;
  warning.textContent = message || "";
}

function snapshotCategoryEditor(){
  // Snapshot string supports cheap "changed?" detection for category drafts.
  const draft = categoryEditorDraft();
  return draft ? JSON.stringify(draft) : "";
}

function snapshotResourceEditor(){
  // Snapshot string supports cheap "changed?" detection for resource drafts.
  const draft = resourceEditorDraft();
  return draft ? JSON.stringify(draft) : "";
}

function setAdminEditorActions(kind, visible, doneDisabled = false, cancelDisabled = false){
  const bar = document.getElementById("admin_editor_actions");
  if(!bar) return;
  if(!visible){
    bar.innerHTML = "";
    bar.hidden = true;
    return;
  }
  const buttonSets = {
    category: `
      <button class="button" type="button" id="cat_cancel_btn" onclick="cancelCategoryEdit()" ${cancelDisabled ? "disabled" : ""}>Cancel</button>
      <button class="button primary" type="button" id="cat_done_btn" onclick="closeCategoryEditor()" ${doneDisabled ? "disabled" : ""}>Done</button>
    `,
    resource: `
      <button id="res_cancel_btn" class="button" type="button" onclick="cancelResourceEditor()" ${cancelDisabled ? "disabled" : ""}>Cancel</button>
      <button id="res_done_btn" class="button primary" onclick="closeResourceEditor()" ${doneDisabled ? "disabled" : ""}>Done</button>
    `,
    forGroups: `
      <button class="button" type="button" id="forGroupCancelBtn" onclick="cancelForGroupsEditor()">Cancel</button>
      <button class="button primary" type="button" id="forGroupDoneBtn" onclick="closeForGroupsEditor()">Done</button>
    `
  };
  bar.innerHTML = buttonSets[kind] || "";
  bar.hidden = false;
}

function clearAdminEditorActions(){
  const bar = document.getElementById("admin_editor_actions");
  if(!bar) return;
  bar.innerHTML = "";
  bar.hidden = true;
}

function resetAdminEditorStateForTab(tab){
  if(tab === "categories" && (!editing || editing.kind !== "category")){
    editing = null;
    editorSnapshot = "";
  }
  if(tab === "resources" && !adminResourceEditMode){
    editing = null;
    editorSnapshot = "";
  }
}

function isCurrentCategoryNewDraft(){
  if(!editing || editing.kind !== "category") return false;
  const cat = data.categories[editing.idx];
  return !!(cat && newCategoryIds.has(cat.id));
}

function isCurrentResourceNewDraft(){
  if(!editing || editing.kind !== "resource") return false;
  const resource = data.resources[editing.idx];
  return !!(resource && newResourceIds.has(resource.id));
}

function updateCategoryEditorActionBar(){
  const currentSnapshot = snapshotCategoryEditor();
  const validation = currentSnapshot ? validateCategoryDraft(JSON.parse(currentSnapshot)) : { valid:true };
  setAdminEditorActions(
    "category",
    isCurrentCategoryNewDraft() || (!!currentSnapshot && currentSnapshot !== editorSnapshot),
    !validation.valid
  );
}

function updateResourceEditorActionBar(validationDisabled = false){
  setAdminEditorActions(
    "resource",
    editing && editing.kind === "resource",
    validationDisabled
  );
}

function updateForGroupsEditorActionBar(){
  const currentSnapshot = snapshotForGroupsEditor();
  const baselineRows = editorSnapshot
    ? (JSON.parse(editorSnapshot).forGroups || [])
    : [];
  const currentRows = Array.from(document.querySelectorAll(".forGroupInput"))
    .map(input => input.value);
  const rowsChanged = JSON.stringify(currentRows) !== JSON.stringify(baselineRows);
  setAdminEditorActions("forGroups", rowsChanged || (!!currentSnapshot && currentSnapshot !== editorSnapshot));
}

function applyCategoryDraft(idx, draft){
  // Apply validated category draft into canonical data model.
  const cat = data.categories[idx];
  if(!cat) return;
  const previousFilters = normalizeCategoryFilters(cat.filters);
  const nextFilters = normalizeCategoryFilters(draft.filters);
  const nextKeys = new Set(nextFilters.map(deletionLabelKey));
  const removedFilters = previousFilters.filter(filter => !nextKeys.has(deletionLabelKey(filter)));
  if(removedFilters.length){
    setUndoSnapshot(removedFilters.length === 1 ? "Type deletion tag" : "Type deletion tags");
    const requests = removedFilters.map(filter => createDeletionRequest("type", {
      categoryId:cat.id,
      label:filter
    }));
    data.deletionRequests = mergeDeletionRecords(data.deletionRequests, requests, "requestedAt");
  }
  cat.id = cat.id || draft.id || generateResourceId();
  cat.label = draft.label || cat.label;
  cat.filters = normalizeCategoryFilters([...nextFilters, ...removedFilters]);
  cat.lastModified = nowISO();
}

function renderAdminCategoryResourceList(selectedCategoryId){
  const container = document.getElementById("adminCategoryResourceList");
  if(!container) return;

  const hasSelectedCategory = !!selectedCategoryId && data.categories.some(cat => cat && cat.id === selectedCategoryId);
  if(!hasSelectedCategory){
    container.innerHTML = "";
    container.style.display = "none";
    return;
  }

  const resources = data.resources
    .filter(r => r.categories?.includes(selectedCategoryId))
    .sort((a, b) => (a.name || "").localeCompare(b.name || ""));

  container.style.display = "block";
  container.innerHTML = `
    <div style="margin-top:12px;">
      <div style="font-weight:bold; margin-bottom:8px;">Resources in this category</div>
      <div id="adminCategoryResourceItems"></div>
    </div>
  `;

  const list = document.getElementById("adminCategoryResourceItems");
  if(!list) return;

  if(!resources.length){
    list.textContent = "No resources assigned to this category.";
    return;
  }

  resources.forEach(resource => {
    const row = document.createElement("div");
    const resourceId = String(resource.id || "");
    row.setAttribute("role", "button");
    row.tabIndex = 0;
    row.textContent = resource.name || "";
    row.addEventListener("click", () => openAdminCategoryResourceById(resourceId));
    row.addEventListener("keydown", event => {
      if(event.key === "Enter" || event.key === " "){
        event.preventDefault();
        openAdminCategoryResourceById(resourceId);
      }
    });
    list.appendChild(row);
  });
}

function refreshAdminCategoryResourceList(){
  const idx = parseInt(selectedCategoryIndex, 10);
  const cat = Number.isInteger(idx) ? data.categories[idx] : null;
  renderAdminCategoryResourceList(cat && cat.id ? cat.id : "");
}

function openAdminCategoryResourceById(resourceId){
  if(!commitPendingEditsIfChanged()) return;
  const nextResourceId = String(resourceId || "");
  if(!nextResourceId) return;
  const idx = getResourceIndexById(nextResourceId);
  if(idx === -1) return;
  selectedResourceId = nextResourceId;
  adminTab = "resources";
  openResourceEditor();
}

function applyResourceDraft(idx, draft){
  // Apply validated resource draft into canonical data model. The editor stores
  // empty text fields as empty strings, but taxonomy fields are always arrays or
  // objects so package export stays predictable.
  const res = data.resources[idx];
  if(!res) return;
  res.name = draft.name || res.name;
  res.phone = draft.phone;
  res.address = draft.address;
  res.website = draft.website;
  res.hours = draft.hours;
  res.description = draft.description;
  res.informationText = draft.informationText;
  const verifiedValidation = validateVerifiedOnInput(draft.verifiedOn);
  res.verifiedOn = verifiedValidation.valid ? verifiedValidation.normalized : null;
  if("reviewedOn" in res) delete res.reviewedOn;
  if("verifiedDate" in res) delete res.verifiedDate;
  res.categories = draft.categories;
  res.categoryFilters = draft.categoryFilters || {};
  res.forGroups = normalizeTaxonomyLabels(draft.forGroups);
  res.lastModified = nowISO();
  refreshAdminCategoryResourceList();
}

function getUpdateDescriptionFieldId(){
  return editing && editing.kind === "category"
    ? "cat_update_description"
    : "res_update_description";
}

function focusUpdateDescriptionField(){
  const field = document.getElementById(getUpdateDescriptionFieldId());
  if(field) field.focus();
}

function closeBlankUpdateDescriptionPrompt(){
  const modal = document.getElementById("blankUpdateDescriptionPrompt");
  if(modal) modal.remove();
}

function promptBlankUpdateDescription(){
  // Update descriptions are not required forever, but the first blank save asks
  // the admin to confirm so accidental silent edits are less likely.
  closeBlankUpdateDescriptionPrompt();
  const modal = document.createElement("div");
  modal.id = "blankUpdateDescriptionPrompt";
  modal.className = "reference-modal";
  modal.innerHTML = `
    <div class="reference-modal-panel" role="dialog" aria-modal="true" aria-labelledby="blankUpdateDescriptionTitle">
      <div class="reference-modal-header">
        <div id="blankUpdateDescriptionTitle" class="reference-modal-title">Please describe the change(s) you made</div>
      </div>
      <div class="reference-modal-body">
        <div style="display:flex; gap:8px; justify-content:flex-end; margin-top:4px;">
          <button class="button primary" type="button" id="blankUpdateDescribeBtn">Describe changes</button>
          <button class="button" type="button" id="blankUpdateSaveAnywayBtn">Save without description</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  const describeBtn = document.getElementById("blankUpdateDescribeBtn");
  const saveAnywayBtn = document.getElementById("blankUpdateSaveAnywayBtn");
  const describe = () => {
    closeBlankUpdateDescriptionPrompt();
    focusUpdateDescriptionField();
  };
  const saveAnyway = () => {
    const kind = editing && editing.kind;
    closeBlankUpdateDescriptionPrompt();
    allowBlankUpdateDescriptionOnce = true;
    if(kind === "category") closeCategoryEditor();
    if(kind === "resource") closeResourceEditor();
  };
  if(describeBtn) describeBtn.onclick = describe;
  if(saveAnywayBtn) saveAnywayBtn.onclick = saveAnyway;
  modal.addEventListener("keydown", event => {
    if(event.key === "Escape"){
      event.preventDefault();
      describe();
    }
  });
  if(describeBtn) describeBtn.focus();
}

function confirmBlankUpdateDescription(draft){
  if(String(draft && draft.updateDescription || "").trim()) return true;
  if(allowBlankUpdateDescriptionOnce){
    allowBlankUpdateDescriptionOnce = false;
    return true;
  }
  promptBlankUpdateDescription();
  return false;
}

function commitPendingEditsIfChanged(){
  // Editor commit pattern:
  // UI fields -> draft snapshot -> validation -> apply canonical update -> persist.
  // This runs before view/tab changes and before package save/import. Returning
  // false blocks navigation so the admin can correct invalid or undescribed edits.
  if(!editing) return true;

  let nextSnapshot = "";
  if(editing.kind === "category"){
    nextSnapshot = snapshotCategoryEditor();
    if(!nextSnapshot) return true;
    const draft = JSON.parse(nextSnapshot);
    const validation = validateCategoryDraft(draft);
    showCategoryEditorWarning(validation.message);
    if(!validation.valid){
      const labelInput = document.getElementById("cat_label");
      if(labelInput) labelInput.focus();
      return false;
    }
    if(nextSnapshot !== editorSnapshot){
      if(!confirmBlankUpdateDescription(draft)) return false;
      const action = newCategoryIds.has(draft.id) ? "added" : "updated";
      applyCategoryDraft(editing.idx, draft);
      addChangeEntry(createChangeEntry("category", action, draft.id, draft.label || "(Unnamed category)", draft.updateDescription));
      newCategoryIds.delete(draft.id);
      persist();
      editorSnapshot = nextSnapshot;
    }
    return true;
  }

  if(editing.kind === "resource"){
    nextSnapshot = snapshotResourceEditor();
    if(!nextSnapshot) return true;
    const draft = JSON.parse(nextSnapshot);
    const validation = validateResourceName(draft, editing.idx);
    const verifiedValidation = validateVerifiedOnInput(draft.verifiedOn);
    showResourceNameWarning(validation.message);
    showResourceVerifiedWarning(verifiedValidation.message);
    if(!validation.valid){
      const nameInput = document.getElementById("res_name");
      if(nameInput) nameInput.focus();
      return false;
    }
    if(!verifiedValidation.valid){
      const verifiedInput = document.getElementById("res_verified_on");
      if(verifiedInput) verifiedInput.focus();
      return false;
    }
    if(nextSnapshot !== editorSnapshot){
      if(!confirmBlankUpdateDescription(draft)) return false;
      const resource = data.resources[editing.idx];
      const resourceId = resource && resource.id ? resource.id : "";
      const action = newResourceIds.has(resourceId) ? "added" : "updated";
      applyResourceDraft(editing.idx, draft);
      const saved = data.resources[editing.idx];
      addChangeEntry(createChangeEntry("resource", action, saved && saved.id, draft.name || "(Unnamed resource)", draft.updateDescription, { categoryIds:draft.categories }));
      if(saved && saved.id) newResourceIds.delete(saved.id);
      persist();
      editorSnapshot = nextSnapshot;
      if(saved && saved.id) selectedResourceId = saved.id;
    }
    return true;
  }

  if(editing.kind === "forGroups"){
    nextSnapshot = snapshotForGroupsEditor();
    if(!nextSnapshot) return true;
    const draft = JSON.parse(nextSnapshot);
    const validation = validateForGroupsDraft(draft);
    if(!validation.valid) return false;
    if(nextSnapshot !== editorSnapshot){
      applyForGroupsDraft(draft);
      persist();
      editorSnapshot = nextSnapshot;
    }
    return true;
  }
  return true;
}
