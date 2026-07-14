/* =========================
   Admin UI
========================= */
// The functions below support both user search and admin-only "referenced by"
// inspection. A resource can be referenced by long list-style resources, so
// matching uses normalized token phrases instead of raw substring checks.

function getReferenceCategoryEntries(resource){
  const categoryIds = Array.isArray(resource && resource.categories)
    ? resource.categories.map(id => String(id || "")).filter(Boolean)
    : [];
  const categoryIdSet = new Set(categoryIds);
  const entries = [];
  const seen = new Set();

  (Array.isArray(data.categories) ? data.categories : [])
    .slice()
    .sort(compareCategoriesByLabel)
    .forEach((cat, index) => {
      const id = String(cat && cat.id || "");
      if(!categoryIdSet.has(id)) return;
      const label = String(cat && cat.label || id || "Uncategorized");
      const key = label.toLowerCase();
      if(seen.has(key)) return;
      seen.add(key);
      entries.push({ label, order:index });
    });

  categoryIds.forEach(id => {
    if(entries.some(entry => entry.label === id)) return;
    if((data.categories || []).some(cat => String(cat && cat.id || "") === id)) return;
    const key = id.toLowerCase();
    if(seen.has(key)) return;
    seen.add(key);
    entries.push({ label:id, order:9999 });
  });

  if(!entries.length){
    entries.push({ label:"Uncategorized", order:9999 });
  }

  return entries;
}

function normalizeReferenceSearchText(value){
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function getReferenceTokens(value){
  const normalized = normalizeReferenceSearchText(value);
  return normalized ? normalized.split(" ") : [];
}

function textContainsTokenPhrase(text, phrase){
  const needleTokens = getReferenceTokens(phrase);
  const haystackTokens = getReferenceTokens(text);
  if(!needleTokens.length || haystackTokens.length < needleTokens.length) return false;

  for(let i = 0; i <= haystackTokens.length - needleTokens.length; i += 1){
    let matched = true;
    for(let j = 0; j < needleTokens.length; j += 1){
      if(haystackTokens[i + j] !== needleTokens[j]){
        matched = false;
        break;
      }
    }
    if(matched) return true;
  }
  return false;
}

function getSearchTokenForms(value){
  const token = String(value || "");
  const forms = new Set(token ? [token] : []);
  if(!/^[a-z]+$/.test(token) || token.length < 4) return forms;

  if(token.endsWith("ies") && token.length > 4) forms.add(`${token.slice(0, -3)}y`);
  if(token.endsWith("s") && !token.endsWith("ss")) forms.add(token.slice(0, -1));
  if(/(?:ses|xes|zes|ches|shes)$/.test(token)) forms.add(token.slice(0, -2));
  if(token === "housing") forms.add("house");
  if(token === "rental" || token === "rentals") forms.add("rent");
  return forms;
}

function searchTokensMatch(left, right){
  const leftForms = getSearchTokenForms(left);
  const rightForms = getSearchTokenForms(right);
  return Array.from(leftForms).some(form => rightForms.has(form));
}

function searchTextMatchesAllTokens(text, queryTokens){
  const textTokens = getReferenceTokens(text);
  return queryTokens.every(queryToken => textTokens.some(textToken => searchTokensMatch(textToken, queryToken)));
}

function isReferenceNameSearchable(resourceName){
  const rawName = String(resourceName || "").trim();
  if(!rawName) return false;
  if(rawName.length >= 4) return true;
  if(/\s/.test(rawName)) return true;
  return /[A-Z]/.test(rawName) && rawName === rawName.toUpperCase();
}

function informationTextReferencesName(informationText, resourceName){
  if(!isReferenceNameSearchable(resourceName)) return false;
  return textContainsTokenPhrase(informationText, resourceName);
}

function getReferenceSnippet(informationText, resourceName){
  const text = String(informationText || "").replace(/\s+/g, " ").trim();
  if(!text) return "";

  const lowerText = text.toLowerCase();
  const lowerName = String(resourceName || "").toLowerCase();
  const directIndex = lowerName ? lowerText.indexOf(lowerName) : -1;
  const center = directIndex >= 0 ? directIndex : 0;
  const start = Math.max(0, center - 70);
  const end = Math.min(text.length, center + Math.max(lowerName.length, 1) + 90);
  const prefix = start > 0 ? "... " : "";
  const suffix = end < text.length ? " ..." : "";
  return `${prefix}${text.slice(start, end)}${suffix}`;
}

function getResourceCategoryEntriesForSearch(resource){
  const categoryIds = Array.isArray(resource && resource.categories)
    ? resource.categories.map(id => String(id || "")).filter(Boolean)
    : [];
  const categoryIdSet = new Set(categoryIds);
  const entries = [];
  const seen = new Set();

  (Array.isArray(data.categories) ? data.categories : [])
    .slice()
    .sort(compareCategoriesByLabel)
    .forEach((cat, index) => {
      const id = String(cat && cat.id || "");
      if(!categoryIdSet.has(id) || seen.has(id)) return;
      seen.add(id);
      entries.push({
        id,
        label:String(cat && cat.label || id || "Uncategorized"),
        order:index
      });
    });

  categoryIds.forEach(id => {
    if(seen.has(id)) return;
    seen.add(id);
    entries.push({ id, label:id, order:9999 });
  });

  if(resourceMatchesListsHeuristic(resource) && !seen.has(LISTS_CATEGORY_ID)){
    seen.add(LISTS_CATEGORY_ID);
    entries.push({ id:LISTS_CATEGORY_ID, label:"Lists", order:9998 });
  }

  return entries;
}

function addSearchResult(groupMap, groups, category, resource, options = {}){
  if(!category || !category.id || !resource) return;
  const groupKey = String(category.id);
  if(!groupMap.has(groupKey)){
    const group = { categoryId:category.id, categoryLabel:category.label, categoryOrder:category.order, items:[], seen:new Set() };
    groupMap.set(groupKey, group);
    groups.push(group);
  }
  const group = groupMap.get(groupKey);
  const resourceId = String(resource.id || "");
  if(group.seen.has(resourceId)) return;
  group.seen.add(resourceId);
  group.items.push({
    resourceId,
    resourceName:String(resource.name || "(Unnamed resource)"),
    snippet:String(options.snippet || ""),
    rank:Number.isFinite(options.rank) ? options.rank : 9999
  });
}

function getSearchFieldSnippet(field){
  if(field.kind === "name") return "Name match";
  if(field.kind === "category") return `Category: ${field.text}`;
  if(field.kind === "type") return `Type: ${field.text}`;
  if(field.kind === "for") return `For: ${field.text}`;
  if(field.kind === "list") return "Category: Lists";

  const text = String(field.text || "").replace(/\s+/g, " ").trim();
  const shortened = text.length > 170 ? `${text.slice(0, 167)}...` : text;
  return shortened ? `${field.label}: ${shortened}` : `${field.label} match`;
}

function getResourceSearchFields(resource){
  const fields = [{ kind:"name", label:"Name", text:String(resource && resource.name || ""), rank:0 }];
  const categoriesById = new Map((Array.isArray(data.categories) ? data.categories : [])
    .map(category => [String(category && category.id || ""), category]));

  (Array.isArray(resource && resource.categories) ? resource.categories : []).forEach(categoryId => {
    const id = String(categoryId || "");
    const category = categoriesById.get(id);
    fields.push({ kind:"category", label:"Category", text:String(category && category.label || id), rank:1 });
    normalizeCategoryFilters(resource && resource.categoryFilters && resource.categoryFilters[id]).forEach(filter => {
      fields.push({ kind:"type", label:"Type", text:filter, rank:1 });
    });
  });
  if(resourceMatchesListsHeuristic(resource)) fields.push({ kind:"list", label:"Category", text:"Lists", rank:1 });
  normalizeTaxonomyLabels(resource && resource.forGroups).forEach(group => {
    fields.push({ kind:"for", label:"For", text:group, rank:1 });
  });

  fields.push(
    { kind:"description", label:"Description", text:String(resource && resource.description || ""), rank:2 },
    { kind:"information", label:"Information", text:String(resource && resource.informationText || ""), rank:3 },
    { kind:"phone", label:"Phone", text:String(resource && resource.phone || ""), rank:4 },
    { kind:"address", label:"Address", text:String(resource && resource.address || ""), rank:4 },
    { kind:"website", label:"Website", text:String(resource && resource.website || ""), rank:4 },
    { kind:"hours", label:"Hours", text:String(resource && resource.hours || ""), rank:4 }
  );
  getResourcePDFs(resource).forEach(pdf => {
    fields.push({ kind:"pdf", label:"PDF", text:String(pdf && pdf.name || ""), rank:5 });
  });
  return fields.filter(field => getReferenceTokens(field.text).length);
}

function getResourceSearchMatch(resource, queryTokens){
  const fields = getResourceSearchFields(resource);
  const combinedText = fields.map(field => field.text).join(" ");
  if(!searchTextMatchesAllTokens(combinedText, queryTokens)) return null;

  const completeField = fields.find(field => searchTextMatchesAllTokens(field.text, queryTokens));
  if(completeField){
    return { rank:completeField.rank, snippet:getSearchFieldSnippet(completeField) };
  }

  const matchingFields = fields.filter(field =>
    queryTokens.some(queryToken => searchTextMatchesAllTokens(field.text, [queryToken]))
  );
  const labels = Array.from(new Set(matchingFields.map(field => field.label)));
  const bestRank = matchingFields.reduce((rank, field) => Math.min(rank, field.rank), 9);
  return { rank:10 + bestRank, snippet:`Matches across: ${labels.join(", ")}` };
}

function buildSearchResults(query){
  const cleanQuery = String(query || "").trim();
  const empty = { query:cleanQuery, mode:"none", groups:[] };
  const queryTokens = getReferenceTokens(cleanQuery);
  if(!queryTokens.length) return empty;

  const resources = Array.isArray(data.resources) ? data.resources : [];
  const groups = [];
  const groupMap = new Map();

  resources.forEach(resource => {
    const match = getResourceSearchMatch(resource, queryTokens);
    if(!match) return;
    getResourceCategoryEntriesForSearch(resource).forEach(category => {
      addSearchResult(groupMap, groups, category, resource, match);
    });
  });

  return { query:cleanQuery, mode:groups.length ? "results" : "none", groups:sortSearchResultGroups(groups) };
}

function sortSearchResultGroups(groups){
  return (Array.isArray(groups) ? groups : [])
    .map(group => ({
      ...group,
      items:group.items.slice().sort((a,b)=>{
        if(a.rank !== b.rank) return a.rank - b.rank;
        return a.resourceName.localeCompare(b.resourceName, undefined, { sensitivity:"base" });
      })
    }))
    .sort((a, b) => {
      if(a.categoryOrder !== b.categoryOrder) return a.categoryOrder - b.categoryOrder;
      return a.categoryLabel.localeCompare(b.categoryLabel, undefined, { sensitivity:"base" });
    });
}

function openSearchResult(categoryId, resourceId){
  const nextCategory = String(categoryId || "");
  const nextResource = String(resourceId || "");
  if(!nextCategory || !nextResource) return;
  currentCategory = nextCategory;
  setSelectedCategoryFilters(currentCategory, []);
  expandedSearchResourceId = nextResource;
  isSearchOpen = false;
  view = "category";
  safeRender();
}

function resourceIsListStyle(resource){
  return resourceMatchesListsHeuristic(resource);
}

function findReferencingLists(resourceOrName){
  const targetId = resourceOrName && typeof resourceOrName === "object"
    ? String(resourceOrName.id || "")
    : "";
  const resourceName = resourceOrName && typeof resourceOrName === "object"
    ? resourceOrName.name
    : resourceOrName;
  const needle = String(resourceName || "").trim();
  if(!isReferenceNameSearchable(needle)) return [];

  const matches = [];
  const seen = new Set();
  (Array.isArray(data.resources) ? data.resources : []).forEach(resource => {
    const resourceId = String(resource && resource.id || "");
    if(targetId && resourceId === targetId) return;
    if(!resourceIsListStyle(resource)) return;
    const informationText = String(resource && resource.informationText || "");
    if(!informationTextReferencesName(informationText, needle)) return;

    const listName = String(resource && resource.name || "(Unnamed list)");
    const key = String(resource && resource.id || listName).toLowerCase();
    if(seen.has(key)) return;
    seen.add(key);
    const categoryEntries = getReferenceCategoryEntries(resource);
    matches.push({
      categoryLabels: categoryEntries.map(category => category.label),
      categoryOrder: Math.min(...categoryEntries.map(category => category.order)),
      listName,
      snippet: getReferenceSnippet(informationText, needle)
    });
  });

  return matches.sort((a, b) => {
    if(a.categoryOrder !== b.categoryOrder) return a.categoryOrder - b.categoryOrder;
    return a.listName.localeCompare(b.listName, undefined, { sensitivity:"base" });
  });
}

function getReferenceModal(){
  let modal = document.getElementById("referenceModal");
  if(modal) return modal;

  modal = document.createElement("div");
  modal.id = "referenceModal";
  modal.className = "reference-modal hidden";
  modal.addEventListener("click", event => {
    if(event.target === modal) closeReferenceModal();
  });
  document.body.appendChild(modal);
  return modal;
}

function closeReferenceModal(){
  const modal = document.getElementById("referenceModal");
  if(modal) modal.classList.add("hidden");
}

function showReferenceModal(resourceName, matches){
  const modal = getReferenceModal();
  const matchItems = Array.isArray(matches) ? matches : [];
  const bodyHTML = matchItems.length
    ? matchItems.map(match => {
      const categoryLabels = Array.isArray(match && match.categoryLabels) && match.categoryLabels.length
        ? match.categoryLabels
        : ["Uncategorized"];
      return `
        <div class="reference-match">
          <div class="reference-match-name">${escapeHTML(match && match.listName || "(Unnamed list)")}</div>
          <div class="reference-match-categories">Categories: ${escapeHTML(categoryLabels.join(", "))}</div>
          ${match && match.snippet ? `<div class="reference-match-snippet">${escapeHTML(match.snippet)}</div>` : ""}
        </div>
      `;
    }).join("")
    : `<p class="reference-empty">No list resources reference this resource.</p>`;

  modal.innerHTML = `
    <div class="reference-modal-panel" role="dialog" aria-modal="true" aria-labelledby="referenceModalTitle" aria-describedby="referenceModalSubtitle">
      <div class="reference-modal-header">
        <div>
          <div id="referenceModalTitle" class="reference-modal-title">Referenced By Lists</div>
          <div id="referenceModalSubtitle" class="reference-modal-subtitle">${escapeHTML(resourceName)}</div>
        </div>
        <button class="button reference-modal-close" type="button">Close</button>
      </div>
      <div class="reference-modal-body">${bodyHTML}</div>
    </div>
  `;

  const closeBtn = modal.querySelector(".reference-modal-close");
  if(closeBtn) closeBtn.addEventListener("click", closeReferenceModal);
  modal.classList.remove("hidden");
  if(closeBtn) closeBtn.focus();
}

function handleAdminResourceReferenceClick(event, sel){
  if(!event.altKey) return;
  window.setTimeout(() => {
    if(!(view === "admin" && adminTab === "resources" && !adminResourceEditMode)) return;
    const resourceId = sel && sel.value ? String(sel.value) : "";
    const resource = (data.resources || []).find(res => String(res && res.id || "") === resourceId);
    const resourceName = String(resource && resource.name || "").trim();
    if(!resourceName) return;
    selectedResourceId = resourceId;
    showReferenceModal(resourceName, findReferencingLists(resource));
  }, 0);
}

function handleAdminListReferenceInspection(event, resource){
  if(!event.altKey || !isAdminVisible) return false;
  const resourceName = String(resource && resource.name || "").trim();
  if(!resourceName) return false;

  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  showReferenceModal(resourceName, findReferencingLists(resource));
  return true;
}

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
  cat.id = cat.id || draft.id || generateResourceId();
  cat.label = draft.label || cat.label;
  cat.filters = normalizeCategoryFilters(draft.filters);
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
    btn.textContent = c.label || "";
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

  persist();
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
          <div id="categoryDeletePromptTitle" class="reference-modal-title">Delete Category</div>
          <div id="categoryDeletePromptSubtitle" class="reference-modal-subtitle">${escapeHTML(cat.label || "(unnamed)")}</div>
        </div>
      </div>
      <div class="reference-modal-body">
        <label>Describe this update (optional)<br>
          <textarea id="category_delete_description" class="big" style="min-height:90px;"></textarea>
        </label>
        <div style="display:flex; gap:8px; justify-content:flex-end; margin-top:12px;">
          <button class="button" type="button" id="categoryDeleteCancelBtn">Cancel</button>
          <button class="button danger" type="button" id="categoryDeleteConfirmBtn">Delete</button>
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
  const changeDescription = getCategoryDeleteChangeDescription(updateDescription);
  setUndoSnapshot(`deleted category "${cat.label}"`);

  // remove category from resources too
  data.resources.forEach(r=>{
    if(Array.isArray(r.categories)){
      r.categories = r.categories.filter(id => id !== cat.id);
    }
    if(r.categoryFilters && typeof r.categoryFilters === "object"){
      delete r.categoryFilters[cat.id];
    }
  });

  data.categories.splice(idx,1);
  delete selectedCategoryFilters[cat.id];
  addChangeEntry(createChangeEntry("category", "removed", cat.id, cat.label || "(Unnamed category)", changeDescription));
  newCategoryIds.delete(cat.id);
  selectedCategoryIndex = "";
  persist();
  showChangeLog();
}

function deleteCategory(){
  const sel = document.getElementById("catSelect");
  if(!sel) return;

  const idx = getCategoryIndexFromBrowseSelection(sel);
  if(idx === -1) return;
  const cat = data.categories[idx];
  if(!cat) return;
  if((!editing || editing.kind !== "category" || editing.idx !== idx) && !commitPendingEditsIfChanged()) return;

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
      selected.forEach(checkbox => {
        const row = checkbox.closest(".category-filter-row");
        if(row) row.remove();
      });
      if(selected.length) validateCategoryEditorState();
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
    btn.textContent = adminShowVerifiedDates ? verifiedLabel : (r.name || "");
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

  const sortedIds = getAdminResourceBrowseList().map(r => String(r.id || ""));
  const selectedPos = sortedIds.indexOf(selectedResourceId);
  const idx = getResourceIndexById(selectedResourceId);
  const res = data.resources[idx];
  if(!res) return;

  const confirmDelete = confirm(buildAdminDeleteConfirmation("resource", res.name || "(unnamed)"));
  if(!confirmDelete) return;
  const updateDescription = prompt("Describe this update (optional):", "");
  if(updateDescription === null) return;
  setUndoSnapshot(`deleted resource "${res.name}"`);

  data.resources.splice(idx,1);
  addChangeEntry(createChangeEntry("resource", "removed", res.id, res.name || "(Unnamed resource)", updateDescription, { categoryIds:res.categories }));
  newResourceIds.delete(res.id);
  const remainingIds = getAdminResourceBrowseList().map(r => String(r.id || ""));
  if(!remainingIds.length){
    selectedResourceId = "";
    adminResourceEditMode = false;
  }else{
    const nextPos = Math.min(Math.max(selectedPos, 0), remainingIds.length - 1);
    selectedResourceId = remainingIds[nextPos];
  }

  persist();
  safeRenderAdmin();
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

/* ---------- Admin: For ---------- */
// The For editor owns the governed cross-category people-served list. Resources
// reference these values through resource.forGroups.

function getResourcesUsingForGroup(group){
  const normalizedGroup = normalizeTaxonomyLabels([group])[0] || "";
  const groupKey = normalizedGroup.toLowerCase();
  if(!groupKey) return [];
  return (Array.isArray(data.resources) ? data.resources : [])
    .filter(resource => normalizeTaxonomyLabels(resource && resource.forGroups).some(resourceGroup => resourceGroup.toLowerCase() === groupKey))
    .sort((a,b)=>String(a && a.name || "").localeCompare(String(b && b.name || ""), undefined, { sensitivity:"base" }));
}

function formatResourceCount(count){
  return `${count} ${count === 1 ? "resource" : "resources"}`;
}

function forGroupsEditorDraft(){
  const groups = Array.from(document.querySelectorAll(".forGroupInput"))
    .map(input => input.value)
    .filter(value => String(value || "").trim());
  return { forGroups: normalizeTaxonomyLabels(groups) };
}

function snapshotForGroupsEditor(){
  const draft = forGroupsEditorDraft();
  return draft ? JSON.stringify(draft) : "";
}

function applyForGroupsDraft(draft){
  const previousGroups = normalizeTaxonomyLabels(data.forGroups);
  const nextGroups = normalizeTaxonomyLabels(draft && draft.forGroups);
  const nextKeys = new Set(nextGroups.map(group => group.toLowerCase()));
  const removedGroups = previousGroups.filter(group => !nextKeys.has(group.toLowerCase()));
  const removedKeys = new Set(removedGroups.map(group => group.toLowerCase()));

  data.forGroups = nextGroups;
  if(removedKeys.size){
    const modifiedAt = nowISO();
    (Array.isArray(data.resources) ? data.resources : []).forEach(resource => {
      const current = normalizeTaxonomyLabels(resource && resource.forGroups);
      const next = current.filter(group => !removedKeys.has(group.toLowerCase()));
      if(next.length === current.length) return;
      resource.forGroups = next;
      resource.lastModified = modifiedAt;
      addChangeEntry(createChangeEntry(
        "resource",
        "updated",
        resource.id,
        resource.name || "(Unnamed resource)",
        `Removed For group${removedGroups.length === 1 ? "" : "s"}: ${removedGroups.join(", ")}.`,
        { categoryIds:resource.categories }
      ));
    });
  }
}

function validateForGroupsDraft(draft){
  return { valid:!!draft, message:"" };
}

function cancelForGroupsEditor(){
  editing = null;
  editorSnapshot = "";
  safeRenderAdmin();
}

function closeForGroupsEditor(){
  if(!commitPendingEditsIfChanged()) return;
  editing = null;
  editorSnapshot = "";
  safeRenderAdmin();
}

function selectForGroupRow(index){
  const rows = Array.from(document.querySelectorAll(".for-group-row"));
  if(!rows.length){
    selectedForGroupIndex = 0;
    refreshForGroupDetails();
    return;
  }
  selectedForGroupIndex = Math.max(0, Math.min(Number(index) || 0, rows.length - 1));
  rows.forEach((row, rowIndex) => {
    const selected = rowIndex === selectedForGroupIndex;
    row.classList.toggle("selected", selected);
    row.setAttribute("aria-selected", selected ? "true" : "false");
  });
  refreshForGroupDetails();
}

function addForGroupRow(value){
  const list = document.getElementById("forGroupRows");
  if(!list) return;
  const index = list.querySelectorAll(".for-group-row").length;
  const row = document.createElement("div");
  row.className = "for-group-row";
  row.setAttribute("role", "option");
  row.tabIndex = 0;
  row.innerHTML = `
    <input type="text" class="forGroupInput" value="${escapeHTML(value || "")}" aria-label="For group">
  `;
  const input = row.querySelector(".forGroupInput");
  if(input){
    input.addEventListener("input", () => {
      refreshForGroupDetails();
      updateForGroupsEditorActionBar();
    });
    input.addEventListener("focus", () => selectForGroupRow(index));
  }
  list.appendChild(row);
  row.addEventListener("click", () => selectForGroupRow(index));
  row.addEventListener("keydown", event => {
    if(event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    selectForGroupRow(index);
    if(input) input.focus();
  });
  if(index === selectedForGroupIndex) selectForGroupRow(index);
}

function refreshForGroupDetails(){
  const detail = document.getElementById("forGroupDetail");
  if(!detail) return;
  const rows = Array.from(document.querySelectorAll(".for-group-row"));
  const row = rows[selectedForGroupIndex] || null;
  const group = normalizeTaxonomyLabels([row && row.querySelector(".forGroupInput") ? row.querySelector(".forGroupInput").value : ""])[0] || "";
  const resources = group ? getResourcesUsingForGroup(group) : [];
  detail.innerHTML = group ? `
    <h3 style="margin-top:0;">${escapeHTML(group)}</h3>
    <p>This group is used by these ${formatResourceCount(resources.length)}:</p>
    ${resources.length ? `
      <ul class="admin-detail-list">
        ${resources.map(resource => `<li>${escapeHTML(resource.name || "(Unnamed resource)")}</li>`).join("")}
      </ul>
    ` : `<p class="admin-note">No resources currently use this group.</p>`}
  ` : `
    <h3 style="margin-top:0;">For Details</h3>
    <p>Select a group to see the resources that use it.</p>
  `;
}

function renderAdminForGroups(container){
  normalizeDataForGroupsShape(data);

  container.innerHTML += `
    <div class="admin-panel">
      <div class="admin-box">
        <h3 class="admin-panel-title">For</h3>
        <p class="admin-note">"For" allows the user to specify what group of people a resource is for, across categories.</p>
        <div class="admin-action-row" style="margin-bottom:8px;">
          <button class="button" type="button" id="forGroupNewBtn">New</button>
          <button class="button danger" type="button" id="forGroupDeleteBtn">Delete</button>
        </div>
        <div id="forGroupRows"></div>
      </div>
      <div class="admin-box" id="forGroupDetail">
      </div>
    </div>
  `;

  normalizeTaxonomyLabels(data.forGroups).forEach(group => addForGroupRow(group));
  editing = { kind:"forGroups" };
  editorSnapshot = snapshotForGroupsEditor();
  updateForGroupsEditorActionBar();
  selectForGroupRow(selectedForGroupIndex);

  const newBtn = document.getElementById("forGroupNewBtn");
  const deleteBtn = document.getElementById("forGroupDeleteBtn");
  if(newBtn){
    newBtn.onclick = () => {
      addForGroupRow("");
      const rows = Array.from(document.querySelectorAll(".forGroupInput"));
      selectedForGroupIndex = rows.length - 1;
      selectForGroupRow(selectedForGroupIndex);
      updateForGroupsEditorActionBar();
      const last = rows[rows.length - 1];
      if(last) last.focus();
    };
  }
  if(deleteBtn){
    deleteBtn.onclick = () => {
      const rows = Array.from(document.querySelectorAll(".for-group-row"));
      const row = rows[selectedForGroupIndex];
      if(row) row.remove();
      selectedForGroupIndex = Math.max(0, Math.min(selectedForGroupIndex, rows.length - 2));
      selectForGroupRow(selectedForGroupIndex);
      updateForGroupsEditorActionBar();
    };
  }
  refreshForGroupDetails();
}
