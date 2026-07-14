// ============================================================
// UNDO SYSTEM
// ============================================================
// Undo is intentionally narrow: destructive admin deletes save one complete data
// snapshot in localStorage. Restoring that snapshot is simpler and safer than
// trying to reverse individual category, resource, or For-group mutations.

function getUndoSnapshot(){
  try{
    const raw = localStorage.getItem(UNDO_STORAGE_KEY);
    if(!raw) return null;
    const parsed = JSON.parse(raw);
    if(!parsed || typeof parsed !== "object") return null;
    if(!parsed.dataSnapshot || typeof parsed.message !== "string") return null;
    return parsed;
  }catch(_err){
    return null;
  }
}

function clearUndoSnapshot(){
  localStorage.removeItem(UNDO_STORAGE_KEY);
}

function setUndoSnapshot(message){
  localStorage.setItem(UNDO_STORAGE_KEY, JSON.stringify({
    dataSnapshot: JSON.parse(JSON.stringify(data)),
    message: String(message || "")
  }));
}

function undoLastDeletion(){
  const snapshot = getUndoSnapshot();
  if(!snapshot || !snapshot.dataSnapshot) return;
      data = snapshot.dataSnapshot;
      normalizeDataInformationShape(data);
      normalizeDataPDFShape(data);
      normalizeLegacyPackageShape(data);
      normalizeLegacyTagsShape(data);
      normalizeDataVerifiedOnShape(data);
      normalizeChanges(data);
  clearUndoSnapshot();
  persist();
  safeRender();
}

/* ---------- Render ---------- */

// Render helpers are grouped by public screen. They all append into appView and
// assume render() has already cleared it, except recent-updates which clears
// again because it can be opened from several flows.
function prepareRenderShell(){
  updatePrintSelectionIndicator();
  tabAdmin.style.display = isAdminVisible ? "" : "none";
  syncSearchPanel();
  appView.classList.toggle("hidden", view==="admin");
  adminView.classList.toggle("hidden", !isAdminVisible || view!=="admin");

  if(view !== "admin"){
    editing = null;
    editorSnapshot = "";
  }
}

function renderCategoryReminder(){
  const categoryMessage = document.createElement("p");
  categoryMessage.textContent = `${CATEGORY_REMINDER_TEXT} `;
  categoryMessage.style.margin = "0 0 12px";
  categoryMessage.style.color = "#555";
  categoryMessage.style.fontSize = "14px";
  categoryMessage.style.lineHeight = "1.35";
  appView.appendChild(categoryMessage);
}

function renderMergeResourcesButton(){
  const reloadWrap = document.createElement("div");
  reloadWrap.className = "reload-resources-wrap";
  const reloadBtn = document.createElement("button");
  reloadBtn.type = "button";
  reloadBtn.className = "button secondary";
  reloadBtn.textContent = "Merge Resources";
  reloadBtn.onclick = beginMergeImportPackage;
  reloadWrap.appendChild(reloadBtn);
  appView.appendChild(reloadWrap);
}

function renderCategoryTip(){
  const categoryTipId = getCategoryTipId();
  if(categoryTipId){
    const tip = categoryTipId === "newAdminWelcome"
      ? createNewAdminTip(categoryTipId)
      : createTip(categoryTipId);
    if(tip) appView.appendChild(tip);
  }
}

function renderPendingUpdatesNotice(){
  if(!pendingRecentUpdates.length) return;
  const note = document.createElement("div");
  note.className = "category-card";
  note.innerHTML = `<div>${pendingRecentUpdates.length} new updates loaded.</div><div>Click &lt;New&gt; TSO Resources at any time to review updates.</div>`;
  appView.appendChild(note);
}

function getCategoryCardsForRender(){
  // Lists is derived from resource shape, not stored as a real package category.
  return data.categories
    .map(cat => ({ id:cat.id, label:cat.label, source:cat }))
    .concat(getListsResources().length ? [{ id:LISTS_CATEGORY_ID, label:"Lists", source:null }] : [])
    .sort((a,b)=>String(a.label || "").localeCompare(String(b.label || ""), undefined, { sensitivity:"base" }));
}

function openRecentUpdates(entries, viewedKeys = null){
  // Opening a badge marks only those changes as viewed, then lets the
  // recent-updates screen render the details.
  recentUpdateDetail = entries;
  showUpdateInfo = false;
  showRecentChangeLog = true;
  markChangesViewed(Array.isArray(viewedKeys) ? viewedKeys : entries.map(entry => entry.id));
  view = "recent-updates";
  safeRender();
}

function openCategoryFromCard(categoryId){
  currentCategory = categoryId;
  expandedSearchResourceId = "";
  setSelectedCategoryFilters(currentCategory, []);
  view = "category";
  safeRender();
}

function renderLandingSearch(){
  const section = document.createElement("section");
  section.className = "landing-search";
  section.setAttribute("role", "search");
  section.setAttribute("aria-label", "Search resources");

  const controls = document.createElement("div");
  controls.className = "landing-search-controls";

  const input = document.createElement("input");
  input.type = "search";
  input.className = "landing-search-input";
  input.placeholder = "Search resources";
  input.setAttribute("aria-label", "Search resources");

  const search = document.createElement("button");
  search.type = "button";
  search.className = "button primary";
  search.textContent = "Search";

  const runSearch = () => performSearch(input.value);
  search.onclick = runSearch;
  input.addEventListener("keydown", event => {
    if(event.key !== "Enter") return;
    event.preventDefault();
    runSearch();
  });

  controls.appendChild(input);
  controls.appendChild(search);
  section.appendChild(controls);
  appView.appendChild(section);
}

function renderCategoriesGrid(){
  const grid = document.createElement("div");
  grid.className = "grid";
  const updatesByCategory = getCategoryUpdateMap();

  getCategoryCardsForRender().forEach(cat => {
    const card = document.createElement("div");
    card.className = "category-card category-card-interactive";
    const updates = cat.id === LISTS_CATEGORY_ID ? [] : (updatesByCategory.get(cat.id) || []);

    const openButton = document.createElement("button");
    openButton.type = "button";
    openButton.className = "category-card-open";
    openButton.setAttribute("aria-label", `View ${cat.label} resources`);

    const label = document.createElement("strong");
    label.textContent = cat.label;
    openButton.appendChild(label);

    const chevron = document.createElement("span");
    chevron.className = "category-card-chevron";
    chevron.setAttribute("aria-hidden", "true");
    chevron.textContent = "›";
    openButton.appendChild(chevron);
    openButton.onclick = () => openCategoryFromCard(cat.id);
    card.appendChild(openButton);

    if(updates.length){
      const updateWrap = document.createElement("div");
      const updateBadge = document.createElement("button");
      updateBadge.type = "button";
      updateBadge.className = "button secondary category-update-badge";
      updateBadge.textContent = `Updates: ${updates.length}`;
      updateWrap.appendChild(updateBadge);
      card.appendChild(updateWrap);
    }

    const updateBadge = card.querySelector(".category-update-badge");
    if(updateBadge){
      updateBadge.onclick = e => {
        e.stopPropagation();
        openRecentUpdates(updates, updates.map(entry => getCategoryChangeSeenKey(entry.id, cat.id)));
      };
    }
    grid.appendChild(card);
  });

  appView.appendChild(grid);
}

function renderCategoriesView(){
  // Main public landing screen: tip, update notice, category grid,
  // and resource-package merge entry point.
  renderCategoryTip();
  renderPendingUpdatesNotice();
  renderLandingSearch();
  renderCategoryReminder();
  renderCategoriesGrid();
  renderMergeResourcesButton();
}

function renderCategoryBackButton(){
  const controls = document.createElement("div");
  controls.style.display = "flex";
  controls.style.flexWrap = "wrap";
  controls.style.gap = "8px";
  controls.style.marginBottom = "8px";
  controls.style.alignItems = "center";

  const back = document.createElement("button");
  back.className = "button";
  back.textContent = "← Back";
  back.onclick = () => { view = "categories"; safeRender(); };
  controls.appendChild(back);
  appView.appendChild(controls);
}

function getCurrentCategoryForRender(){
  return isListsCategory(currentCategory)
    ? { id:LISTS_CATEGORY_ID, label:"Lists" }
    : data.categories.find(c => c.id === currentCategory);
}

function renderCategoryTitle(){
  const cat = getCurrentCategoryForRender();
  if(!cat) return;
  const title = document.createElement("div");
  title.textContent = cat.label;
  title.style.fontWeight = "bold";
  title.style.fontSize = "1.2em";
  title.style.marginBottom = "6px";
  appView.appendChild(title);
}

function getActiveCategoryFilters(categoryFilterOptions){
  const selectedFilters = getSelectedCategoryFilters(currentCategory);
  const activeFilters = selectedFilters.filter(filterKey =>
    categoryFilterOptions.some(option => option.key === filterKey)
  );
  if(activeFilters.length !== selectedFilters.length){
    setSelectedCategoryFilters(currentCategory, activeFilters);
  }
  return activeFilters;
}

function appendCategoryFilterGroup(filterArea, title, options, activeFilters){
  if(!options.length) return;
  const group = document.createElement("div");
  group.style.margin = "0 0 8px";

  const heading = document.createElement("div");
  heading.textContent = title;
  heading.style.fontWeight = "bold";
  heading.style.fontSize = "14px";
  heading.style.marginBottom = "4px";
  group.appendChild(heading);

  const buttons = document.createElement("div");
  buttons.style.display = "flex";
  buttons.style.flexWrap = "wrap";
  buttons.style.gap = "8px";
  buttons.style.alignItems = "center";

  options.forEach(option => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = activeFilters.includes(option.key) ? "button primary" : "button";
    btn.textContent = option.label;
    btn.onclick = () => {
      const selected = activeFilters.includes(option.key);
      const nextFilters = selected
        ? activeFilters.filter(active => active !== option.key)
        : [...activeFilters, option.key];
      setSelectedCategoryFilters(currentCategory, nextFilters);
      safeRender();
    };
    buttons.appendChild(btn);
  });

  group.appendChild(buttons);
  filterArea.appendChild(group);
}

function renderCategoryFilterControls(categoryFilterOptions, activeFilters){
  if(!categoryFilterOptions.length) return;
  const filterArea = document.createElement("div");
  filterArea.style.marginBottom = "12px";

  appendCategoryFilterGroup(filterArea, "Type", categoryFilterOptions.filter(option => option.kind === "filter"), activeFilters);
  appendCategoryFilterGroup(filterArea, "For", categoryFilterOptions.filter(option => option.kind === "for"), activeFilters);

  appView.appendChild(filterArea);
}

function renderCategoryPrintInstruction(){
  const printInstruction = document.createElement("div");
  printInstruction.className = "category-print-banner";
  printInstruction.textContent = getCategoryPrintInstructionText();
  appView.appendChild(printInstruction);
}

function renderCategoryResourceCard(res){
  let expanded = String(res && res.id || "") === String(expandedSearchResourceId || "");
  const card = buildResourceCard(res, { expanded, showDescription:true });
  card.classList.add("resource-card-interactive");
  card.dataset.resourceId = String(res && res.id || "");
  card.tabIndex = -1;

  const expandToggle = document.createElement("button");
  expandToggle.type = "button";
  expandToggle.className = "resource-expand-toggle";
  expandToggle.textContent = "⌄";
  expandToggle.setAttribute("aria-label", `${expanded ? "Hide" : "View"} details for ${res.name}`);
  expandToggle.setAttribute("aria-expanded", expanded ? "true" : "false");
  card.appendChild(expandToggle);
  const resourceUpdates = getChangesForResource(res.id, { unseenOnly:true });
  if(resourceUpdates.length){
    const badge = document.createElement("button");
    badge.className = "button secondary";
    badge.textContent = resourceUpdates.some(u => u.action === "added") ? "New" : "Updated";
    badge.onclick = e => {
      e.stopPropagation();
      openRecentUpdates(resourceUpdates);
    };
    card.prepend(badge);
  }
  const toggleExpanded = () => {
    expanded = !expanded;
    const details = card.querySelector(".resource-details");
    details.classList.toggle("collapsed", !expanded);
    details.classList.toggle("expanded", expanded);
    expandToggle.setAttribute("aria-expanded", expanded ? "true" : "false");
    expandToggle.setAttribute("aria-label", `${expanded ? "Hide" : "View"} details for ${res.name}`);
  };
  card.onclick = toggleExpanded;
  expandToggle.onclick = event => {
    event.stopPropagation();
    toggleExpanded();
  };
  appView.appendChild(card);
}

function renderCategoryResources(filtered, activeFilters){
  if(!filtered.length){
    const empty = document.createElement("p");
    empty.textContent = activeFilters.length ? "No matching resources" : "No resources in this category.";
    appView.appendChild(empty);
    return;
  }

  filtered.forEach(renderCategoryResourceCard);
}

function renderCategoryView(){
  // Public category detail screen. Category filters and For buttons are OR'd
  // together by filterResourcesBySelectedCategoryFilters().
  renderCategoryBackButton();
  renderCategoryTitle();
  const categoryFilterOptions = getCategoryFilterOptions(currentCategory);
  const activeFilters = getActiveCategoryFilters(categoryFilterOptions);
  const categoryResources = getCategoryResources(currentCategory);
  const filtered = filterResourcesBySelectedCategoryFilters(categoryResources, currentCategory, activeFilters);

  renderCategoryFilterControls(categoryFilterOptions, activeFilters);
  renderCategoryPrintInstruction();
  renderCategoryResources(filtered, activeFilters);
}

function renderUpdateInfo(packageInfo, packageChanges){
  const resourcePackageVersion = packageInfo ? packageInfo.packageVersion : normalizePackageVersionValue(data && data.packageVersion);
  appView.innerHTML += `<div class="category-card"><div>App version: ${escapeHTML(data.appVersion || APP_VERSION)}</div><div>Last modified: ${escapeHTML(formatDateOnly(data.lastModified))}</div></div>`;
  appView.innerHTML += `<div class="category-card"><strong>App Changes — Last 14 Days:</strong>${APP_CHANGE_LOG.length ? `<ul>${APP_CHANGE_LOG.map(change => `<li>${escapeHTML(change.date)} — ${escapeHTML(change.message)}</li>`).join("")}</ul>` : `<div>No selected app changes in the last 14 days.</div>`}</div>`;
  appView.innerHTML += `<div class="category-card"><strong>Latest Resource Package ${escapeHTML(String(resourcePackageVersion))}:</strong>${packageChanges.length ? `<ul>${packageChanges.map(change => `<li>${escapeHTML(change)}</li>`).join("")}</ul>` : `<div>No resource package updates loaded.</div>`}</div>`;
  const backToCategories = document.createElement("button");
  backToCategories.type = "button";
  backToCategories.className = "button primary";
  backToCategories.textContent = "View Categories";
  backToCategories.onclick = () => {
    showUpdateInfo = false;
    showRecentChangeLog = false;
    recentUpdateDetail = null;
    pendingRecentUpdates = [];
    view = "categories";
    safeRender();
  };
  appView.appendChild(backToCategories);
}

function renderRecentChangeLog(entries){
  if(showRecentChangeLog && !entries.length){
    appView.innerHTML += `<p>No recent updates.</p>`;
    return;
  }
  if(!showRecentChangeLog) return;
  entries.forEach(entry => {
    const card = document.createElement("div");
    card.className = "resource-card";
    card.innerHTML = formatChangeEntryHTML(entry);
    if(isAdminVisible){
      const editDescription = document.createElement("button");
      editDescription.type = "button";
      editDescription.className = "button secondary";
      editDescription.textContent = entry.description ? "Edit description" : "Add description";
      editDescription.onclick = () => {
        if(!editChangeDescription(entry.id)) return;
        recentUpdateDetail = entries;
        safeRender();
      };
      card.appendChild(editDescription);
    }
    appView.appendChild(card);
  });
}

function renderRecentUpdatesView(){
  // Recent updates can be a full package-summary screen or a small detail list
  // opened from an update badge. Both modes share the same view state.
  const entries = Array.isArray(recentUpdateDetail) ? recentUpdateDetail : getRecentChanges();
  const packageInfo = (data && data.lastLoadedPackageInfo && typeof data.lastLoadedPackageInfo === "object")
    ? data.lastLoadedPackageInfo
    : null;
  const packageChanges = packageInfo && Array.isArray(packageInfo.changes) ? packageInfo.changes : [];
  appView.innerHTML = "";
  if(showUpdateInfo) renderUpdateInfo(packageInfo, packageChanges);
  renderRecentChangeLog(entries);
  recentUpdateDetail = null;
  pendingRecentUpdates = [];
}

function renderPrintSelectionView(){
  // This is only the review screen. The actual printable packet is owned by
  // PrintWorkflow so list-style resources can render differently.
  const { normalSelections, listSelections } = PrintWorkflow.getPrintSelectionGroups();
  const selections = [...normalSelections, ...listSelections];
  if(!selections.length){
    appView.innerHTML = "<p>No resources selected for printing.</p>";
    return;
  }

  const btn = document.createElement("button");
  btn.textContent = "Print Preview";
  btn.className = "button primary";
  btn.onclick = startPrintSelectionPreview;
  appView.appendChild(btn);

  selections.forEach(res => appView.appendChild(buildResourceCard(res, { expanded:true })));
}

function render(){
  // Main view router. Each branch delegates to the helper that owns that screen.
  // Admin mode is special because adminView has its own shell.
  prepareRenderShell();

  if(view==="admin"){
    appView.innerHTML = "";
    safeRenderAdmin();
    return;
  }

  appView.innerHTML="";

  if(view==="categories"){
    renderCategoriesView();
  }

  if(view==="category"){
    renderCategoryView();
  }

  if(view==="search-results"){
    renderSearchResultsView();
  }

  if(view==="search-detail"){
    renderSearchDetailView();
  }

  if(view==="recent-updates"){
    renderRecentUpdatesView();
  }

  if(view==="print-selection"){
    renderPrintSelectionView();
  }
}
