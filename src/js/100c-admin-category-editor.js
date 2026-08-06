/* ---------- Admin: Categories ---------- */
// Category admin owns category labels, category filters, deletion, and the
// helper list of resources assigned to the selected category.

function renderAdminCategories(container){
  // Category management view (alphabetical list, full-width editor, and filters).
  container.innerHTML += `
    <div class="admin-panel category-admin-panel">
      <div class="category-admin-layout">
        <div class="admin-box">
          <h3 class="admin-panel-title">Categories</h3>
          <div class="admin-action-row" style="margin-bottom:8px;">
            <button class="button" onclick="newCategory()">New</button>
            <button class="button danger" onclick="deleteCategory()">Delete</button>
          </div>
          <div id="catSelect" class="resource-button-listbox" role="listbox" tabindex="0" aria-label="Categories"></div>
        </div>
        <div class="admin-box" id="catEditor"></div>
      </div>
    </div>
  `;

  const sel = document.getElementById("catSelect");

  // Sort for display, but keep option value = real index.
  const pairs = getAlphabeticalCategoryPairs();

  populateCategoryBrowseOptions(sel, pairs);

  sel.addEventListener("click", event => {
    const btn = event.target.closest(".resource-listbox-option");
    if(!btn || !sel.contains(btn)) return;
    if(!commitPendingEditsIfChanged()) return;
    setCategoryBrowseSelection(sel, btn.dataset.categoryIndex || "");
    editCategory(parseInt(selectedCategoryIndex,10));
  });
  sel.addEventListener("dblclick", event => {
    if(!event.target.closest(".resource-listbox-option")) return;
    const labelInput = document.getElementById("cat_label");
    if(labelInput){
      labelInput.focus();
      labelInput.select();
    }
  });
  sel.onkeydown = (e) => {
    if(e.key === "Enter"){
      e.preventDefault();
      const labelInput = document.getElementById("cat_label");
      if(labelInput){
        labelInput.focus();
        labelInput.select();
      }
      return;
    }
    if(e.key === "Delete"){
      e.preventDefault();
      deleteCategory();
      return;
    }
    if(["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)){
      e.preventDefault();
      if(!commitPendingEditsIfChanged()) return;
      moveCategoryBrowseSelection(sel, e.key);
      editCategory(parseInt(selectedCategoryIndex,10));
    }
  };

  if(pairs.length && pairs.some(({i}) => String(i) === selectedCategoryIndex)){
    setCategoryBrowseSelection(sel, selectedCategoryIndex);
    editCategory(parseInt(selectedCategoryIndex,10));
  }else if(pairs.length){
    setCategoryBrowseSelection(sel, String(pairs[0].i));
    editCategory(parseInt(selectedCategoryIndex,10));
  }else{
    editing = null;
    editorSnapshot = "";
    selectedCategoryIndex = "";
    renderAdminCategoryResourceList("");
  }

}

function populateCategoryBrowseOptions(sel, pairs){
  if(!sel) return;
  sel.innerHTML = "";
  pairs.forEach(({c,i}) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "resource-listbox-option";
    btn.setAttribute("role", "option");
    btn.setAttribute("aria-selected", "false");
    btn.tabIndex = -1;
    btn.dataset.categoryIndex = String(i);
    btn.dataset.categoryId = String(c.id || "");
    const label = String(c && c.label || "").trim() || "(Unnamed category)";
    btn.textContent = hasDeletionRequest("category", { targetId:c.id })
      ? `${label} — tagged for deletion`
      : label;
    sel.appendChild(btn);
  });
}

function setCategoryBrowseSelection(sel, categoryIndex){
  const idx = categoryIndex == null ? "" : String(categoryIndex);
  selectedCategoryIndex = idx;
  if(!sel) return;
  sel.dataset.selectedCategoryIndex = idx;
  Array.from(sel.querySelectorAll(".resource-listbox-option")).forEach((btn, index) => {
    const selected = btn.dataset.categoryIndex === idx;
    btn.setAttribute("aria-selected", selected ? "true" : "false");
    if(!btn.id) btn.id = `catOption_${index}`;
    if(selected){
      sel.dataset.selectedCategoryId = btn.dataset.categoryId || "";
      sel.setAttribute("aria-activedescendant", btn.id);
      btn.scrollIntoView({ block:"nearest" });
    }
  });
}

function getCategoryIndexFromBrowseSelection(sel){
  const selectedButton = sel ? sel.querySelector('.resource-listbox-option[aria-selected="true"]') : null;
  const selectedCategoryId = selectedButton && selectedButton.dataset.categoryId
    ? selectedButton.dataset.categoryId
    : (sel && sel.dataset.selectedCategoryId ? sel.dataset.selectedCategoryId : "");
  if(selectedCategoryId){
    const idxById = getCategoryIndexById(selectedCategoryId);
    if(idxById !== -1) return idxById;
  }
  const selectedIndex = selectedCategoryIndex !== ""
    ? selectedCategoryIndex
    : (sel && sel.dataset.selectedCategoryIndex != null ? sel.dataset.selectedCategoryIndex : "");
  if(selectedIndex === "") return -1;
  const idx = parseInt(selectedIndex, 10);
  return Number.isInteger(idx) ? idx : -1;
}

function moveCategoryBrowseSelection(sel, key){
  if(!sel) return;
  const options = Array.from(sel.querySelectorAll(".resource-listbox-option"));
  if(!options.length) return;
  const current = options.findIndex(btn => btn.dataset.categoryIndex === selectedCategoryIndex);
  let next = current === -1 ? 0 : current;
  if(key === "ArrowDown") next = Math.min(next + 1, options.length - 1);
  if(key === "ArrowUp") next = Math.max(next - 1, 0);
  if(key === "Home") next = 0;
  if(key === "End") next = options.length - 1;
  setCategoryBrowseSelection(sel, options[next].dataset.categoryIndex);
}

function newCategory(){
  if(!commitPendingEditsIfChanged()) return;
  const newIndex = data.categories.length;
  const categoryId = generateResourceId();

  data.categories.push({
    id: categoryId,
    label: "",
    active: true,
    lastModified: nowISO(),
    filters: []
  });

  newCategoryIds.add(categoryId);
  adminTab = "categories";
  selectedCategoryIndex = String(newIndex);
  safeRenderAdmin();
  const labelInput = document.getElementById("cat_label");
  if(labelInput) labelInput.focus();
}

function cancelCategoryEdit(){
  if(!editing || editing.kind !== "category") return;
  const cat = data.categories[editing.idx];
  if(cat && newCategoryIds.has(cat.id)){
    data.categories.splice(editing.idx, 1);
    newCategoryIds.delete(cat.id);
    delete selectedCategoryFilters[cat.id];
    selectedCategoryIndex = "";
    editing = null;
    persist();
    safeRenderAdmin();
    return;
  }
  editCategory(editing.idx);
}

function getCategoryDeleteChangeDescription(description){
  return String(description || "").trim() || "Deleted category.";
}

function closeCategoryDeletePrompt(){
  const modal = document.getElementById("categoryDeletePrompt");
  if(modal) modal.remove();
}

function promptCategoryDeleteDescription(cat, onSubmit){
  closeCategoryDeletePrompt();
  const modal = document.createElement("div");
  modal.id = "categoryDeletePrompt";
  modal.className = "reference-modal";
  modal.innerHTML = `
    <div class="reference-modal-panel" role="dialog" aria-modal="true" aria-labelledby="categoryDeletePromptTitle" aria-describedby="categoryDeletePromptSubtitle">
      <div class="reference-modal-header">
        <div>
          <div id="categoryDeletePromptTitle" class="reference-modal-title">Tag Category for Deletion</div>
          <div id="categoryDeletePromptSubtitle" class="reference-modal-subtitle">${escapeHTML(cat.label || "(unnamed)")}</div>
        </div>
      </div>
      <div class="reference-modal-body">
        <label>Describe this update (optional)<br>
          <textarea id="category_delete_description" class="big" style="min-height:90px;"></textarea>
        </label>
        <div style="display:flex; gap:8px; justify-content:flex-end; margin-top:12px;">
          <button class="button" type="button" id="categoryDeleteCancelBtn">Cancel</button>
          <button class="button danger" type="button" id="categoryDeleteConfirmBtn">Tag for deletion</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  const input = document.getElementById("category_delete_description");
  const cancelBtn = document.getElementById("categoryDeleteCancelBtn");
  const confirmBtn = document.getElementById("categoryDeleteConfirmBtn");
  const submit = () => {
    const description = input ? input.value : "";
    closeCategoryDeletePrompt();
    onSubmit(description);
  };
  if(cancelBtn) cancelBtn.onclick = closeCategoryDeletePrompt;
  if(confirmBtn) confirmBtn.onclick = submit;
  modal.addEventListener("click", event => {
    if(event.target === modal) closeCategoryDeletePrompt();
  });
  modal.addEventListener("keydown", event => {
    if(event.key === "Escape"){
      event.preventDefault();
      closeCategoryDeletePrompt();
    }
    if((event.ctrlKey || event.metaKey) && event.key === "Enter"){
      event.preventDefault();
      submit();
    }
  });
  if(input) input.focus();
}

function completeCategoryDelete(categoryId, updateDescription){
  const idx = data.categories.findIndex(cat => String(cat && cat.id || "") === String(categoryId || ""));
  const cat = data.categories[idx];
  if(!cat) return;
  tagDeletionRequests([createDeletionRequest("category", {
    targetId:cat.id,
    label:cat.label || "(Unnamed category)",
    description:updateDescription
  })], `tagged category "${cat.label}" for deletion`);
}

function deleteCategory(){
  const sel = document.getElementById("catSelect");
  if(!sel) return;

  const idx = getCategoryIndexFromBrowseSelection(sel);
  if(idx === -1) return;
  const cat = data.categories[idx];
  if(!cat) return;
  if(!commitPendingEditsIfChanged()) return;

  const confirmDelete = confirm(buildAdminDeleteConfirmation("category", cat.label || "(unnamed)"));
  if(!confirmDelete) return;
  promptCategoryDeleteDescription(cat, description => {
    completeCategoryDelete(cat.id, description);
  });
}

function closeCategoryEditor(){
  if(!commitPendingEditsIfChanged()) return;
  safeRenderAdmin();
  const sel = document.getElementById("catSelect");
  if(sel) sel.focus();
}

function editCategory(idx){
  const cat = data.categories[idx];
  const editor = document.getElementById("catEditor");
  if(!cat || !editor) return;
  selectedCategoryIndex = String(idx);
  cat.filters = normalizeCategoryFilters(cat.filters);

  editor.innerHTML = `
    <h3>Edit Category</h3>

    <label>Label<br>
      <input id="cat_label" value="${escapeHTML(cat.label || "")}">
    </label>
    <div id="cat_editor_warning" style="display:none; color:#aa0000; margin-top:4px;"></div><br>

    <label>Describe this update (optional)<br>
      <textarea id="cat_update_description" class="big" style="min-height:60px;"></textarea>
    </label><br><br>
    <hr style="margin:18px 0 12px; border:0; border-top:1px solid #ddd;">
    <div class="category-editor-layout">
      <div>
        <h4 style="margin:0 0 8px;">Types</h4>
        <p class="admin-note">Add specific types for this category.</p>
        <div class="admin-action-row" style="margin-bottom:8px;">
          <button class="button" type="button" id="cat_filter_new_btn">New</button>
          <button class="button danger" type="button" id="cat_filter_delete_btn">Delete</button>
        </div>
        <div id="catFilterRows"></div>
      </div>
      <div id="adminCategoryResourceList" style="display:none;"></div>
    </div>
  `;
  renderAdminCategoryResourceList(cat && cat.id ? cat.id : "");
  renderCategoryFilterRows(cat.filters);

  editing = { kind: "category", idx };
  editorSnapshot = snapshotCategoryEditor();

  const labelInput = document.getElementById("cat_label");
  const updateInput = document.getElementById("cat_update_description");
  const newFilterBtn = document.getElementById("cat_filter_new_btn");
  const deleteFilterBtn = document.getElementById("cat_filter_delete_btn");
  function validateCategoryEditorState(){
    const draft = categoryEditorDraft();
    if(!draft){
      showCategoryEditorWarning("");
      updateCategoryEditorActionBar();
      const doneBtn = document.getElementById("cat_done_btn");
      if(doneBtn) doneBtn.disabled = false;
      return;
    }
    const validation = validateCategoryDraft(draft);
    showCategoryEditorWarning(validation.message);
    updateCategoryEditorActionBar();
    const doneBtn = document.getElementById("cat_done_btn");
    if(doneBtn) doneBtn.disabled = !validation.valid;
  }
  if(labelInput) labelInput.addEventListener("input", validateCategoryEditorState);
  if(updateInput) updateInput.addEventListener("input", validateCategoryEditorState);
  if(newFilterBtn){
    newFilterBtn.addEventListener("click", () => {
      addCategoryFilterRow("");
      validateCategoryEditorState();
      const rows = Array.from(document.querySelectorAll(".catFilterInput"));
      const last = rows[rows.length - 1];
      if(last) last.focus();
    });
  }
  if(deleteFilterBtn){
    deleteFilterBtn.addEventListener("click", () => {
      const selected = Array.from(document.querySelectorAll(".catFilterSelect:checked"));
      if(!selected.length) return;
      if(!commitPendingEditsIfChanged()) return;
      const category = data.categories[editing && editing.kind === "category" ? editing.idx : -1];
      if(!category) return;
      const labels = selected
        .map(checkbox => checkbox.closest(".category-filter-row"))
        .map(row => row && row.querySelector(".catFilterInput") ? row.querySelector(".catFilterInput").value.trim() : "")
        .filter(Boolean);
      if(!labels.length) return;
      if(!confirm(`Tag ${labels.length === 1 ? `the Type '${labels[0]}'` : `${labels.length} Types`} for deletion?\n\nResources will remain unchanged until an admin reviews and approves the deletion after a package merge.`)) return;
      tagDeletionRequests(labels.map(label => createDeletionRequest("type", {
        categoryId:category.id,
        label
      })), labels.length === 1 ? `tagged Type "${labels[0]}" for deletion` : "tagged Types for deletion");
    });
  }
  validateCategoryEditorState();
}

function addCategoryFilterRow(value){
  const list = document.getElementById("catFilterRows");
  if(!list) return;
  const row = document.createElement("div");
  row.className = "category-filter-row";
  row.innerHTML = `
    <input type="checkbox" class="catFilterSelect" aria-label="Select filter">
    <input type="text" class="catFilterInput" value="${escapeHTML(value || "")}" aria-label="Category filter">
  `;
  const category = editing && editing.kind === "category" ? data.categories[editing.idx] : null;
  if(category && value && hasDeletionRequest("type", { categoryId:category.id, label:value })){
    const status = document.createElement("span");
    status.className = "deletion-tag-status";
    status.textContent = "tagged for deletion";
    row.appendChild(status);
  }
  const input = row.querySelector(".catFilterInput");
  if(input){
    input.addEventListener("input", () => {
      const doneBtn = document.getElementById("cat_done_btn");
      const draft = categoryEditorDraft();
      if(doneBtn && draft) doneBtn.disabled = !validateCategoryDraft(draft).valid;
      updateCategoryEditorActionBar();
    });
  }
  list.appendChild(row);
}

function renderCategoryFilterRows(filters){
  const list = document.getElementById("catFilterRows");
  if(!list) return;
  list.innerHTML = "";
  normalizeCategoryFilters(filters).forEach(filter => addCategoryFilterRow(filter));
}
