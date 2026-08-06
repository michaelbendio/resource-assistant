/* ---------- Admin: Resources ---------- */
// Resource admin owns the large resource editor. It normalizes For groups, categories,
// verification dates, and structured information text before saving.

function renderAdminResources(container){
  // Resource management view (browse list, edit mode, and For groups).
  if(adminResourceEditMode && !selectedResourceId && data.resources[0] && data.resources[0].id){
    selectedResourceId = data.resources[0].id;
  }

  if(!adminResourceEditMode){
    container.innerHTML += `
      <div class="admin-panel">
        <div class="admin-box">
          <h3 class="admin-panel-title">Resources</h3>
      <div class="resource-browse-wrap">
        <label class="admin-option-row" style="display:block;">
          <input type="checkbox" id="resSortShowVerified">
          Show verified dates
        </label>
            <div class="resource-browse-actions admin-action-row" style="margin-top:12px;">
              <button class="button" onclick="newResource()">New</button>
              <button class="button danger" onclick="deleteResource()">Delete</button>
              <span class="spacer"></span>
              <button class="button primary" onclick="openResourceEditor()">Edit</button>
            </div>
        <div id="resSelect" class="resource-button-listbox" role="listbox" tabindex="0" aria-label="Resources"></div>
          </div>
        </div>
      </div>
    `;

    const sel = document.getElementById("resSelect");
    const sortToggle = document.getElementById("resSortShowVerified");
    if(sortToggle){
      sortToggle.checked = adminShowVerifiedDates;
      sortToggle.onchange = () => {
        adminShowVerifiedDates = !!sortToggle.checked;
        populateResourceBrowseOptions(sel, selectedResourceId);
      };
    }

    populateResourceBrowseOptions(sel, selectedResourceId);
    sel.addEventListener("click", event => handleAdminResourceBrowseClick(event, sel));
    sel.addEventListener("dblclick", event => {
      if(!event.target.closest(".resource-listbox-option")) return;
      openResourceEditor();
    });
    sel.onkeydown = (e) => {
      if(e.key === "Enter"){
        e.preventDefault();
        openResourceEditor();
        return;
      }
      if(e.key === "Delete"){
        e.preventDefault();
        deleteResource();
        return;
      }
      if(["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)){
        e.preventDefault();
        moveResourceBrowseSelection(sel, e.key);
      }
    };

    editing = null;
    editorSnapshot = "";
    return;
  }

  const idx = getResourceIndexById(selectedResourceId);
  if(idx === -1){
    adminResourceEditMode = false;
    safeRenderAdmin();
    return;
  }

  container.innerHTML += `
    <div class="admin-panel">
      <div class="admin-box">
        <h3 style="margin:0;">Edit Resource</h3>
        <div id="resEditor" style="margin-top:12px;"></div>
      </div>
    </div>
  `;

  editResource(idx);
}

function populateResourceBrowseOptions(sel, preferredResourceId){
  if(!sel) return;
  const prev = preferredResourceId || selectedResourceId || sel.dataset.selectedResourceId || "";
  sel.innerHTML = "";

  const resources = getAdminResourceBrowseList();
  resources.forEach((r) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "resource-listbox-option";
    btn.setAttribute("role", "option");
    btn.setAttribute("aria-selected", "false");
    btn.tabIndex = -1;
    btn.dataset.resourceId = String(r.id || "");
    const verifiedLabel = isValidMMYY(r.verifiedOn)
      ? `${r.name || ""} \u2014 ${formatVerifiedOnForDisplay(r.verifiedOn)}`
      : (r.name || "");
    const baseLabel = adminShowVerifiedDates ? verifiedLabel : (r.name || "");
    btn.textContent = hasDeletionRequest("resource", { targetId:r.id })
      ? `${baseLabel} — tagged for deletion`
      : baseLabel;
    sel.appendChild(btn);
  });

  if(prev && resources.some(resource => String(resource.id || "") === prev)){
    setResourceBrowseSelection(sel, prev);
  }else if(resources.length){
    setResourceBrowseSelection(sel, String(resources[0].id || ""));
  }else{
    sel.dataset.selectedResourceId = "";
    sel.removeAttribute("aria-activedescendant");
    selectedResourceId = "";
  }
}

function setResourceBrowseSelection(sel, resourceId){
  const id = String(resourceId || "");
  selectedResourceId = id;
  if(!sel) return;
  sel.dataset.selectedResourceId = id;
  Array.from(sel.querySelectorAll(".resource-listbox-option")).forEach((btn, index) => {
    const selected = btn.dataset.resourceId === id;
    btn.setAttribute("aria-selected", selected ? "true" : "false");
    if(!btn.id) btn.id = `resOption_${index}`;
    if(selected){
      sel.setAttribute("aria-activedescendant", btn.id);
      btn.scrollIntoView({ block:"nearest" });
    }
  });
}

function handleAdminResourceBrowseClick(event, sel){
  const btn = event.target.closest(".resource-listbox-option");
  if(!btn || !sel || !sel.contains(btn)) return;
  setResourceBrowseSelection(sel, btn.dataset.resourceId || "");
  handleAdminResourceReferenceClick(event, { value:selectedResourceId });
}

function moveResourceBrowseSelection(sel, key){
  if(!sel) return;
  const options = Array.from(sel.querySelectorAll(".resource-listbox-option"));
  if(!options.length) return;
  const current = options.findIndex(btn => btn.dataset.resourceId === selectedResourceId);
  let next = current === -1 ? 0 : current;
  if(key === "ArrowDown") next = Math.min(next + 1, options.length - 1);
  if(key === "ArrowUp") next = Math.max(next - 1, 0);
  if(key === "Home") next = 0;
  if(key === "End") next = options.length - 1;
  setResourceBrowseSelection(sel, options[next].dataset.resourceId || "");
}

function newResource(){
  if(!commitPendingEditsIfChanged()) return;
  const resourceId = generateResourceId();

  const resource = {
    id: resourceId,
    name: "",
    description: "",
    informationText: "",
    categories: [],
    categoryFilters: {},
    forGroups: [],
    pdfs: [],
    verifiedOn: null
  };
  data.resources.push(resource);

  persist();
  newResourceIds.add(resourceId);
  adminTab = "resources";
  selectedResourceId = resource.id;
  adminResourceEditMode = true;
  safeRenderAdmin();
  focusAndSelectResourceName();
}

function discardNewResourceDraft(resourceId){
  const draftId = String(resourceId || "");
  if(!draftId || !newResourceIds.has(draftId)) return false;

  const sortedIds = getAdminResourceBrowseList().map(r => String(r.id || ""));
  const selectedPos = sortedIds.indexOf(draftId);
  const idx = getResourceIndexById(draftId);
  if(idx === -1){
    newResourceIds.delete(draftId);
    return false;
  }

  data.resources.splice(idx, 1);
  newResourceIds.delete(draftId);

  const remainingIds = getAdminResourceBrowseList().map(r => String(r.id || ""));
  if(!remainingIds.length){
    selectedResourceId = "";
    adminResourceEditMode = false;
  }else{
    const nextPos = Math.min(Math.max(selectedPos, 0), remainingIds.length - 1);
    selectedResourceId = remainingIds[nextPos];
  }
  return true;
}

function isBlankResourceDraft(resource){
  if(!resource) return false;
  const hasText = ["name", "description", "phone", "address", "website", "hours", "informationText"]
    .some(key => String(resource[key] || "").trim());
  const hasLists = ["categories", "forGroups", "pdfs"]
    .some(key => Array.isArray(resource[key]) && resource[key].length);
  const hasCategoryFilters = resource.categoryFilters
    && typeof resource.categoryFilters === "object"
    && Object.keys(resource.categoryFilters).some(key => normalizeCategoryFilters(resource.categoryFilters[key]).length);
  return !hasText && !hasLists && !hasCategoryFilters;
}

function deleteResource(){
  if(!commitPendingEditsIfChanged()) return;
  if(!selectedResourceId) return;

  const idx = getResourceIndexById(selectedResourceId);
  const res = data.resources[idx];
  if(!res) return;

  const confirmDelete = confirm(buildAdminDeleteConfirmation("resource", res.name || "(unnamed)"));
  if(!confirmDelete) return;
  const updateDescription = prompt("Describe this update (optional):", "");
  if(updateDescription === null) return;
  tagDeletionRequests([createDeletionRequest("resource", {
    targetId:res.id,
    label:res.name || "(Unnamed resource)",
    description:updateDescription
  })], `tagged resource "${res.name}" for deletion`);
}

function openResourceEditor(){
  if(!selectedResourceId) return;
  adminResourceEditMode = true;
  safeRenderAdmin();
  focusAndSelectResourceName();
}

function focusAndSelectResourceName(){
  const nameInput = document.getElementById("res_name");
  if(!nameInput) return;
  nameInput.focus();
  nameInput.select();
}

function closeResourceEditor(){
  if(!commitPendingEditsIfChanged()) return;
  adminResourceEditMode = false;
  editing = null;
  editorSnapshot = "";
  safeRenderAdmin();
}

function cancelResourceEditor(){
  if(discardNewResourceDraft(selectedResourceId)){
    adminResourceEditMode = false;
    persist();
    safeRenderAdmin();
    return;
  }
  adminResourceEditMode = false;
  safeRenderAdmin();
}

function renderResourceForGroupChecks(res){
  const selectedForKeys = new Set(normalizeTaxonomyLabels(res.forGroups).map(group => group.toLowerCase()));
  return normalizeTaxonomyLabels(data.forGroups)
    .map(group => `
      <label style="display:block; margin:2px 0;">
        <input type="checkbox" class="resForGroup" value="${escapeHTML(group)}" ${selectedForKeys.has(group.toLowerCase()) ? "checked" : ""}>
        ${escapeHTML(group)}
      </label>
    `).join("");
}

function renderResourceCategoryChecks(res){
  return data.categories
    .slice()
    .sort(compareCategoriesByLabel)
    .map(c => {
      const checked = (res.categories || []).includes(c.id) ? "checked" : "";
      const categoryFilters = normalizeCategoryFilters(c.filters);
      const selectedFilters = normalizeCategoryFilters(res.categoryFilters && res.categoryFilters[c.id]);
      const selectedKeys = new Set(selectedFilters.map(filter => filter.toLowerCase()));
      const filterRows = categoryFilters.map(filter => `
        <label>
          <input type="checkbox" class="resCatFilter" data-category-id="${escapeHTML(c.id)}" value="${escapeHTML(filter)}" ${selectedKeys.has(filter.toLowerCase()) ? "checked" : ""}>
          ${escapeHTML(filter)}
        </label>
      `).join("");
      return `
        <div class="resource-category-option">
          <label>
            <input type="checkbox" class="resCat" value="${escapeHTML(c.id)}" ${checked}>
            ${escapeHTML(c.label)}
          </label>
          ${categoryFilters.length ? `
            <div class="resource-category-filter-list" data-category-filters-for="${escapeHTML(c.id)}" style="${checked ? "" : "display:none;"}">
              ${filterRows}
            </div>
          ` : ""}
        </div>
      `;
    }).join("");
}

function renderResourceBasicsSection(res, verifiedDisplay){
  return `
    <div>
      <label>Name<br>
        <input id="res_name" value="${escapeHTML(res.name || "")}">
      </label>
      <div id="res_name_warning" style="display:none; color:#aa0000; margin-top:4px;"></div>

      <div class="resource-editor-grid" style="margin-top:10px;">
        <label>Phone<br>
          <input id="res_phone" value="${escapeHTML(res.phone || "")}">
        </label>
        <label class="span-2">Address<br>
          <input id="res_address" value="${escapeHTML(res.address || "")}">
        </label>

        <label>Website<br>
          <input id="res_website" type="url" value="${escapeHTML(res.website || "")}">
        </label>
        <label>Hours<br>
          <input id="res_hours" value="${escapeHTML(res.hours || "")}">
        </label>
        <div>
          <strong>Verified</strong>
          <div class="verified-row" style="margin-top:4px;">
            <span id="res_verified_display" class="verified-value">${escapeHTML(verifiedDisplay)}</span>
            <button class="button" type="button" id="res_verified_btn">Update</button>
            <input id="res_verified_on" type="text" placeholder="MM/YY" value="${escapeHTML(res.verifiedOn || "")}" style="width:120px;">
          </div>
          <div id="res_verified_warning" class="verified-warning"></div>
        </div>
      </div>

      <label style="display:block; margin-top:8px;">Description<br>
        <textarea id="res_description" class="big">${escapeHTML(res.description || "")}</textarea>
      </label><br>
    </div>
  `;
}

function renderResourceUpdateSection(){
  return `
    <div>
      <label style="display:block; margin-top:8px;">Describe this update (optional)<br>
        <textarea id="res_update_description" class="big" style="min-height:60px;"></textarea>
      </label><br>
    </div>
  `;
}

function renderResourceForGroupsSection(forGroupChecks){
  return `
    <div>
      <div style="margin-top:8px;">
        <strong>For</strong> <span class="admin-note">(Check only if this resource is specifically intended for this group.)</span>
        <div style="margin-top:4px;">
          ${forGroupChecks || `<p class="admin-note">No For groups have been created yet.</p>`}
        </div>
      </div>
      <br>
    </div>
  `;
}

function renderResourceCategoriesSection(catChecks){
  return `
    <div>
      <div>
        <strong>Categories</strong> <span class="admin-note">(Check applicable subcategories too.)</span><br>
        ${catChecks}
      </div>
    </div>
  `;
}

function renderResourceInformationSection(informationDraft){
  return `
    <div>
      <label style="display:block; font-weight:bold; margin-top:12px;">Information</label>
      <div class="information-control-block">
        <div class="information-control-header">
          <div class="information-preview-toggle">
            <button class="button primary" type="button" id="res_information_edit_btn">Edit</button>
            <button class="button" type="button" id="res_information_preview_btn">Preview</button>
          </div>
          <div class="information-hint resource-info-guidance">
            Formatting: use *[space] at the start of a line for bullets, **bold** for bold text, __underline__ for underline, and --- on its own line for a horizontal line.
          </div>
        </div>
        <div id="res_information_editor">
          <div class="resource-info-additional">
            <textarea id="res_info_additional" class="big resource-info-input" style="min-height:90px;">${escapeHTML(informationDraft.additional || "")}</textarea>
          </div>
        </div>
        <div id="res_information_preview" class="information-preview-box information-rendered resource-info-rendered hidden"></div>
      </div>
    </div><br>
  `;
}

function renderResourcePDFSection(res){
  const pdfs = getResourcePDFs(res);
  return `
    <div class="resource-pdf-editor" style="margin:12px 0;">
      <div><strong>PDF attachments</strong></div>
      <div class="pdf-attachments-list">
        ${pdfs.length ? pdfs.map(pdf => `
          <div class="pdf-attachment-row">
            <span>${escapeHTML(pdf.name || "PDF")}</span>
            <button class="button" type="button" data-remove-pdf-id="${escapeHTML(pdf.id)}">Remove PDF</button>
          </div>
        `).join("") : `<div>No PDFs attached.</div>`}
      </div>
      <input type="file" id="pdfPicker" accept="application/pdf" multiple style="display:none">
      <button class="button" type="button" id="attachPdfBtn">Attach PDF</button>
    </div>
  `;
}

function renderResourceEditorMarkup(res){
  // The Resource editor renders once, then setupResource* functions attach all
  // behavior. Keep IDs stable because draft capture and self-tests depend on them.
  const verifiedDisplay = formatVerifiedOnForDisplay(res.verifiedOn);
  const informationDraft = parseInformationText(res.informationText || "");
  return [
    renderResourceBasicsSection(res, verifiedDisplay),
    renderResourceUpdateSection(),
    renderResourceForGroupsSection(renderResourceForGroupChecks(res)),
    renderResourceCategoriesSection(renderResourceCategoryChecks(res)),
    renderResourcePDFSection(res),
    renderResourceInformationSection(informationDraft)
  ].join("");
}

function getResourceEditorElements(){
  return {
    editor:document.getElementById("resEditor"),
    verifiedBtn:document.getElementById("res_verified_btn"),
    verifiedInput:document.getElementById("res_verified_on"),
    verifiedDisplay:document.getElementById("res_verified_display"),
    verifiedWarning:document.getElementById("res_verified_warning"),
    updateInput:document.getElementById("res_update_description"),
    informationEditor:document.getElementById("res_information_editor"),
    informationEditBtn:document.getElementById("res_information_edit_btn"),
    informationPreviewBtn:document.getElementById("res_information_preview_btn"),
    informationPreviewBox:document.getElementById("res_information_preview")
  };
}

function getInformationDraftFromResourceEditor(){
  const additionalEl = document.getElementById("res_info_additional");
  return { additional:additionalEl ? additionalEl.value : "" };
}

function refreshResourceInformationPreview(elements){
  if(!elements.informationPreviewBox) return;
  const informationText = composeInformationText(getInformationDraftFromResourceEditor());
  elements.informationPreviewBox.innerHTML = renderInformationHTML(informationText);
}

function fitResourceInformationTextareas(){
  Array.from(document.querySelectorAll(".resource-info-input")).forEach(field => {
    fitTextareaToText(field);
  });
}

function setResourceInformationEditorMode(elements, mode){
  if(!elements.informationEditor || !elements.informationPreviewBox || !elements.informationEditBtn || !elements.informationPreviewBtn) return;
  const previewMode = mode === "preview";
  elements.informationEditor.classList.toggle("hidden", previewMode);
  elements.informationPreviewBox.classList.toggle("hidden", !previewMode);
  elements.informationEditBtn.classList.toggle("primary", !previewMode);
  elements.informationPreviewBtn.classList.toggle("primary", previewMode);
  if(previewMode) refreshResourceInformationPreview(elements);
  else fitResourceInformationTextareas();
}

function syncResourceCategoryFilterVisibility(editor){
  editor.querySelectorAll(".resCat").forEach(cb => {
    const filterList = Array.from(editor.querySelectorAll("[data-category-filters-for]"))
      .find(list => list.dataset.categoryFiltersFor === cb.value);
    if(filterList) filterList.style.display = cb.checked ? "" : "none";
  });
}

function updateResourceVerifiedDisplayAndWarning(elements){
  if(!elements.verifiedInput || !elements.verifiedDisplay) return true;
  const validation = validateVerifiedOnInput(elements.verifiedInput.value);
  if(elements.verifiedWarning) elements.verifiedWarning.textContent = validation.message;
  elements.verifiedDisplay.textContent = validation.valid
    ? formatVerifiedOnForDisplay(validation.normalized)
    : "----";
  showResourceVerifiedWarning(validation.message);
  return validation.valid;
}

function validateResourceEditorState(idx){
  // Validation drives the sticky Done/Cancel buttons. Dirty-state visibility is
  // handled by updateResourceEditorActionBar(); this function only decides
  // whether Done must be disabled.
  const draft = resourceEditorDraft();
  if(!draft){
    showResourceNameWarning("");
    showResourceVerifiedWarning("");
    updateResourceEditorActionBar();
    const doneBtn = document.getElementById("res_done_btn");
    if(doneBtn) doneBtn.disabled = false;
    return;
  }

  const nameValidation = validateResourceName(draft, idx);
  const verifiedValidation = validateVerifiedOnInput(draft.verifiedOn);
  showResourceNameWarning(nameValidation.message);
  showResourceVerifiedWarning(verifiedValidation.message);
  const shouldDisableDone = !(nameValidation.valid && verifiedValidation.valid);
  updateResourceEditorActionBar(shouldDisableDone);
  const doneBtn = document.getElementById("res_done_btn");
  if(doneBtn) doneBtn.disabled = shouldDisableDone;
}

function setupResourceInformationControls(elements, validateEditorState){
  if(elements.informationEditBtn && elements.informationPreviewBtn){
    elements.informationEditBtn.onclick = () => setResourceInformationEditorMode(elements, "edit");
    elements.informationPreviewBtn.onclick = () => setResourceInformationEditorMode(elements, "preview");
    fitResourceInformationTextareas();
    setResourceInformationEditorMode(elements, "preview");
  }

  Array.from(document.querySelectorAll(".resource-info-input")).forEach(field => {
    fitTextareaToText(field);
    field.addEventListener("input", () => {
      fitTextareaToText(field);
      refreshResourceInformationPreview(elements);
      validateEditorState();
    });
  });
}

function setupResourceCategoryControls(editor, validateEditorState){
  editor.querySelectorAll(".resCat").forEach(cb => {
    cb.addEventListener("change", () => {
      syncResourceCategoryFilterVisibility(editor);
      validateEditorState();
    });
  });
  editor.querySelectorAll(".resCatFilter").forEach(cb => {
    cb.addEventListener("change", validateEditorState);
  });
  syncResourceCategoryFilterVisibility(editor);
}

function setupResourceVerifiedControls(elements, validateEditorState){
  if(!elements.verifiedBtn || !elements.verifiedInput) return;
  elements.verifiedBtn.onclick = () => {
    elements.verifiedInput.value = formatMMYYFromDate(new Date());
    updateResourceVerifiedDisplayAndWarning(elements);
    validateEditorState();
    elements.verifiedInput.focus();
    elements.verifiedInput.select();
  };
  elements.verifiedInput.addEventListener("input", () => updateResourceVerifiedDisplayAndWarning(elements));
}

function setupResourceEditorValidation(editor, elements, validateEditorState){
  ["res_name", "res_phone", "res_address", "res_website", "res_hours", "res_description"].forEach(id => {
    const field = document.getElementById(id);
    if(field) field.addEventListener("input", validateEditorState);
  });
  editor.querySelectorAll(".resForGroup").forEach(cb => {
    cb.addEventListener("change", validateEditorState);
  });
  if(elements.updateInput) elements.updateInput.addEventListener("input", validateEditorState);
  if(elements.verifiedInput) elements.verifiedInput.addEventListener("input", validateEditorState);
}

function setupResourcePDFControls(idx){
  const picker = document.getElementById("pdfPicker");
  const attachPdfBtn = document.getElementById("attachPdfBtn");
  if(attachPdfBtn && picker) attachPdfBtn.onclick = () => picker.click();
  if(picker) picker.onchange = async e => {
    const files = Array.from((e.target.files || [])).filter(file => file && (/\.pdf$/i.test(file.name) || file.type === "application/pdf"));
    if(!files.length) return;
    if(!commitPendingEditsIfChanged()) return;

    const current = data.resources[idx];
    if(!current) return;
    normalizeResourcePDFs(current);
    try{
      for(const file of files){
        const id = generateResourceId();
        const key = buildPDFStoragePath(current.id, id, file.name);
        await savePDF(key, file);
        current.pdfs.push({ id, name:file.name || "PDF", path:key });
      }
      current.lastModified = nowISO();
      persist();
      editResource(idx);
    }catch(err){
      alert("Unable to attach PDF: " + err.message);
    }
  };

  document.querySelectorAll("[data-remove-pdf-id]").forEach(btn => {
    btn.onclick = async () => {
      if(!commitPendingEditsIfChanged()) return;
      const current = data.resources[idx];
      if(!current) return;
      const pdfId = btn.getAttribute("data-remove-pdf-id");
      const removed = removePDFAttachmentFromResource(current, pdfId);
      if(!removed) return;
      try{
        current.lastModified = nowISO();
        persist();
        if(!isPDFPathReferenced(removed.path)){
          await deletePDF(removed.path);
        }
        editResource(idx);
      }catch(err){
        alert("Unable to remove PDF: " + err.message);
      }
    };
  });
}

function normalizeResourceForEditor(res){
  // Normalize in place before rendering so older resources and imported records
  // use the same canonical shapes as newly-created resources.
  normalizeResourceInformation(res);
  normalizeResourcePDFs(res);
  normalizeResourceVerifiedOn(res);
  normalizeDataForGroupsShape(data);
  normalizeDataCategoryFilterShape(data);
  res.forGroups = normalizeTaxonomyLabels(res.forGroups);
}

function editResource(idx){
  // High-level Resource editor lifecycle:
  // normalize resource -> render markup -> wire controls -> snapshot baseline.
  const res = data.resources[idx];
  const editor = document.getElementById("resEditor");
  if(!res || !editor) return;

  selectedResourceId = res.id || selectedResourceId;
  editing = { kind:"resource", idx };
  normalizeResourceForEditor(res);
  editor.innerHTML = renderResourceEditorMarkup(res);

  const elements = getResourceEditorElements();
  const validateEditorState = () => validateResourceEditorState(idx);
  setupResourceInformationControls(elements, validateEditorState);
  setupResourceCategoryControls(editor, validateEditorState);
  setupResourceVerifiedControls(elements, validateEditorState);
  setupResourceEditorValidation(editor, elements, validateEditorState);
  setupResourcePDFControls(idx);

  editorSnapshot = snapshotResourceEditor();
  updateResourceVerifiedDisplayAndWarning(elements);
  validateEditorState();
  focusAndSelectResourceName();
}
