// ============================================================
// RENDERING — GENERAL
// ============================================================
// Rendering is state-driven. Event handlers mutate the small set of runtime
// state variables above, then call safeRender() or safeRenderAdmin(). The main
// render() function below clears and rebuilds the active view from scratch.

function setView(nextView){
  if(nextView === "admin" && !isAdminVisible) return;
  if(view === "admin" && nextView !== "admin"){
    if(!commitPendingEditsIfChanged()) return;
  }
  if(nextView !== "category") expandedSearchResourceId = "";
  view = nextView;
  safeRender();
  if(nextView === "admin" && consumeRenamedAdminTrainingPending()){
    showAdminHelp({ expandTraining:true });
  }
}

function setAdminVisibility(visible){
  const nextVisible = !!visible;
  if(!nextVisible && view === "admin"){
    setView("categories");
    if(view === "admin") return;
  }
  isAdminVisible = nextVisible;
  tabAdmin.style.display = isAdminVisible ? "" : "none";
  if(!isAdminVisible){
    const adminSection = document.getElementById("adminView");
    if(adminSection) adminSection.classList.add("hidden");
  }
}

function flashAdminButton(){
  if(!tabAdmin) return;
  tabAdmin.classList.remove("admin-flash");
  void tabAdmin.offsetWidth;
  tabAdmin.classList.add("admin-flash");
  setTimeout(() => {
    tabAdmin.classList.remove("admin-flash");
  }, 900);
}

const tabPrintSelection = document.getElementById("tabPrintSelection");
const helpButton = document.getElementById("helpButton");
const tabSearch = document.getElementById("tabSearch");
tabCategories.onclick = ()=>{ setView("categories"); };
if(tabPrintSelection) tabPrintSelection.onclick = ()=>{ startPrintSelectionPreview(); };
if(helpButton) helpButton.onclick = ()=>{ showUserHelp(); };
tabAdmin.onclick = ()=>{ setView("admin"); };

function syncSearchPanel(){
  const panel = document.getElementById("searchPanel");
  const input = document.getElementById("searchInput");
  if(!panel) return;
  panel.classList.toggle("hidden", !isSearchOpen);
  if(input && isSearchOpen && document.activeElement !== input){
    input.value = searchQuery;
  }
}

function closeSearchPanel(){
  isSearchOpen = false;
  syncSearchPanel();
}

function toggleSearchPanel(){
  isSearchOpen = !isSearchOpen;
  syncSearchPanel();
  if(isSearchOpen){
    window.setTimeout(() => {
      const input = document.getElementById("searchInput");
      if(input){
        input.focus();
        input.select();
      }
    }, 0);
  }
}

function performSearch(query){
  if(view === "admin" && !commitPendingEditsIfChanged()) return;
  searchQuery = String(query || "").trim();
  searchResults = buildSearchResults(searchQuery);
  expandedSearchResourceId = "";
  view = "search-results";
  safeRender();
}

if(tabSearch) tabSearch.onclick = toggleSearchPanel;
const searchButton = document.getElementById("searchButton");
if(searchButton){
  searchButton.onclick = () => {
    const input = document.getElementById("searchInput");
    performSearch(input ? input.value : "");
  };
}
const searchCancelButton = document.getElementById("searchCancelButton");
if(searchCancelButton) searchCancelButton.onclick = closeSearchPanel;
const searchInput = document.getElementById("searchInput");
if(searchInput){
  searchInput.addEventListener("keydown", event => {
    if(event.key !== "Enter") return;
    event.preventDefault();
    performSearch(searchInput.value);
  });
}
const appTitle = document.getElementById("appTitle");
const topbar = document.querySelector(".topbar");
const TOPBAR_ADMIN_SWIPE_MIN_X = 80;
const TOPBAR_ADMIN_SWIPE_MAX_Y = 45;
const TOPBAR_ADMIN_SWIPE_MAX_MS = 1000;
let topbarAdminSwipeStart = null;
let topbarAdminSwipeHandled = false;

function updateStickyHeaderOffset(){
  const height = topbar ? topbar.getBoundingClientRect().height : 0;
  document.documentElement.style.setProperty("--topbar-sticky-offset", `${Math.ceil(height)}px`);
}

window.addEventListener("resize", updateStickyHeaderOffset);

function isTopbarAdminLeftSwipe(start, end){
  if(!start || !end) return false;
  const dx = start.x - end.x;
  const dy = Math.abs(end.y - start.y);
  const elapsed = Math.max(0, end.time - start.time);
  return dx >= TOPBAR_ADMIN_SWIPE_MIN_X
    && dy <= TOPBAR_ADMIN_SWIPE_MAX_Y
    && elapsed <= TOPBAR_ADMIN_SWIPE_MAX_MS;
}

function toggleAdminModeFromTopbarSwipe(){
  const shouldShowAdmin = !isAdminVisible;
  setAdminVisibility(shouldShowAdmin);
  safeRender();
  if(shouldShowAdmin) flashAdminButton();
  return true;
}

function handleTopbarAdminSwipeStart(event){
  if(!event || !event.changedTouches || event.changedTouches.length !== 1) return;
  const touch = event.changedTouches[0];
  topbarAdminSwipeStart = {
    x: touch.clientX,
    y: touch.clientY,
    time: Date.now()
  };
}

function handleTopbarAdminSwipeEnd(event){
  if(!topbarAdminSwipeStart || !event || !event.changedTouches || event.changedTouches.length !== 1) return;
  const touch = event.changedTouches[0];
  const swipeEnd = {
    x: touch.clientX,
    y: touch.clientY,
    time: Date.now()
  };
  const shouldEnableAdmin = isTopbarAdminLeftSwipe(topbarAdminSwipeStart, swipeEnd);
  topbarAdminSwipeStart = null;
  if(!shouldEnableAdmin) return;
  topbarAdminSwipeHandled = true;
  window.setTimeout(() => {
    topbarAdminSwipeHandled = false;
  }, 700);
  event.preventDefault();
  event.stopPropagation();
  toggleAdminModeFromTopbarSwipe();
}

function getTsoNameFromHtmlFileName(fileName){
  return String(fileName || "")
    .replace(/\.html?$/i, "")
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getTsoName(){
  const storedName = String(localStorage.getItem(TSO_NAME_STORAGE_KEY) || "").trim();
  if(storedName) return storedName;
  if(isNewTemplateFile()) return "";
  return getTsoNameFromHtmlFileName(getCurrentHtmlFileName());
}

function slugifyFileStem(value, fallback){
  const cleaned = String(value || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned || fallback;
}

function getResourcePackageFilename(){
  const baseName = getTsoName() || (isNewTemplateFile() ? "tso" : getTsoNameFromHtmlFileName(getCurrentHtmlFileName()));
  const stem = slugifyFileStem(baseName, "tso");
  return stem === "tso" ? DEFAULT_RESOURCE_PACKAGE_FILENAME : `${stem}-resources.json`;
}

function getResourcePackageZipFilename(){
  const baseName = getTsoName() || (isNewTemplateFile() ? "tso" : getTsoNameFromHtmlFileName(getCurrentHtmlFileName()));
  const stem = slugifyFileStem(baseName, "tso");
  return `${stem}-resource-package.zip`;
}

function getAppTitleText(){
  const tsoName = getTsoName();
  return `${tsoName || "<New>"} TSO Resources`;
}

function refreshAppTitle(){
  const titleText = getAppTitleText();
  document.title = titleText;
  if(appTitle) appTitle.textContent = titleText;
  updateStickyHeaderOffset();
}

refreshAppTitle();

function createTip(tipId){
  return createRedTip(TIP_TEXT[tipId], tipId);
}

function createRedTip(tipText, tipId){
  if(!tipText || dismissedTipIds.has(String(tipId || ""))) return null;
  const tip = document.createElement("div");
  tip.className = "red-tip";

  const text = document.createElement("span");
  text.className = "red-tip-text";
  text.textContent = tipText;
  tip.appendChild(text);

  const dismiss = document.createElement("button");
  dismiss.type = "button";
  dismiss.className = "red-tip-dismiss";
  dismiss.setAttribute("aria-label", "Dismiss this tip");
  dismiss.textContent = "×";
  dismiss.onclick = () => {
    dismissTip(tipId);
    tip.remove();
  };
  tip.appendChild(dismiss);
  return tip;
}

function createNewAdminTip(tipId){
  const tip = createRedTip(TIP_TEXT[tipId], tipId);
  if(tip) tip.classList.add("new-admin-tip");
  return tip;
}

function getCategoryTipId(){
  if(isNewTemplateFile()) return "newAdminWelcome";
  return "user";
}

function shouldShowChangeTsoNameButton(isTemplateFile = isNewTemplateFile()){
  return !!isTemplateFile;
}

function printAdminHelp(){
  const modal = document.getElementById("referenceModal");
  if(!modal || modal.classList.contains("hidden")) return;
  const details = Array.from(modal.querySelectorAll(".admin-help-content details:not(.admin-training-section)"));
  adminHelpPrintRestoreState = {
    bodyClass:"admin-help-printing",
    details,
    states:details.map(detail => detail.open)
  };
  document.body.classList.add(adminHelpPrintRestoreState.bodyClass);
  details.forEach(detail => { detail.open = true; });
  window.setTimeout(() => window.print(), 0);
}

function printAdminTraining(){
  const modal = document.getElementById("referenceModal");
  if(!modal || modal.classList.contains("hidden")) return;
  const details = Array.from(modal.querySelectorAll(".admin-training-section"));
  adminHelpPrintRestoreState = {
    bodyClass:"admin-training-printing",
    details,
    states:details.map(detail => detail.open)
  };
  document.body.classList.add(adminHelpPrintRestoreState.bodyClass);
  details.forEach(detail => { detail.open = true; });
  window.setTimeout(() => window.print(), 0);
}

function restoreAdminHelpPrintState(){
  if(!adminHelpPrintRestoreState) return;
  const state = adminHelpPrintRestoreState;
  if(state.bodyClass) document.body.classList.remove(state.bodyClass);
  state.details.forEach((detail, index) => {
    detail.open = !!state.states[index];
  });
  adminHelpPrintRestoreState = null;
}

function toggleUpdateInfoView(){
  if(topbarAdminSwipeHandled){
    topbarAdminSwipeHandled = false;
    return;
  }
  if(view === "recent-updates" && showUpdateInfo){
    showUpdateInfo = false;
    showRecentChangeLog = false;
    recentUpdateDetail = null;
    pendingRecentUpdates = [];
    view = "categories";
    safeRender();
    return;
  }
  showUpdateInfo = true;
  showRecentChangeLog = true;
  view = "recent-updates";
  const seen = getSeenUpdateIds();
  getRecentChanges().forEach(entry => seen.add(String(entry.id)));
  saveSeenUpdateIds(seen);
  safeRender();
}
if(appTitle){
  appTitle.onclick = toggleUpdateInfoView;
}
if(topbar){
  topbar.addEventListener("touchstart", handleTopbarAdminSwipeStart, { passive:true });
  topbar.addEventListener("touchend", handleTopbarAdminSwipeEnd, { passive:false });
  topbar.addEventListener("touchcancel", () => {
    topbarAdminSwipeStart = null;
    topbarAdminSwipeHandled = false;
  }, { passive:true });
}

function showAdminSetup(){
  const modal = getReferenceModal();
  modal.innerHTML = `
    <div class="reference-modal-panel" role="dialog" aria-modal="true" aria-labelledby="adminSetupTitle">
      <div class="reference-modal-header">
        <div id="adminSetupTitle" class="reference-modal-title">Admin Setup</div>
        <button class="button reference-modal-close" type="button">Close</button>
      </div>
      <div class="reference-modal-body admin-setup-panel">
        <label for="adminSetupTsoName">What is the name of your TSO?
          <input id="adminSetupTsoName" type="text" value="${escapeHTML(getTsoName())}" placeholder="Example: Provo">
        </label>
        <p class="admin-setup-note">This name appears in the blue title bar. You can change it and save again until it looks right.</p>
        <div class="admin-setup-actions">
          <button class="button primary" type="button" id="adminSetupSaveName">Save TSO Name</button>
        </div>
        <p class="admin-setup-note">After the blue bar looks right, click Close.</p>
      </div>
    </div>
  `;

  const closeBtn = modal.querySelector(".reference-modal-close");
  const nameInput = document.getElementById("adminSetupTsoName");
  const saveBtn = document.getElementById("adminSetupSaveName");

  function saveName(){
    const nextName = String(nameInput ? nameInput.value : "").trim();
    if(nextName){
      localStorage.setItem(TSO_NAME_STORAGE_KEY, nextName);
      if(isNewTemplateFile()) markRenamedAdminTrainingPending(nextName);
    }else{
      localStorage.removeItem(TSO_NAME_STORAGE_KEY);
      if(isNewTemplateFile()) localStorage.removeItem(NEW_ADMIN_TRAINING_PENDING_KEY);
    }
    refreshAppTitle();
    safeRender();
    showToast("TSO name saved.");
  }

  if(closeBtn) closeBtn.addEventListener("click", () => {
    closeReferenceModal();
  });
  if(saveBtn) saveBtn.addEventListener("click", saveName);
  if(nameInput){
    nameInput.addEventListener("keydown", event => {
      if(event.key !== "Enter") return;
      event.preventDefault();
      saveName();
    });
  }
  modal.classList.remove("hidden");
  if(nameInput) nameInput.focus();
}

function showUserHelp(){
  const modal = getReferenceModal();
  const titleText = escapeHTML(getAppTitleText());
  modal.innerHTML = `
    <div class="reference-modal-panel" role="dialog" aria-modal="true" aria-labelledby="userHelpTitle">
      <div class="reference-modal-header">
        <div id="userHelpTitle" class="reference-modal-title">User Help</div>
        <button class="button reference-modal-close" type="button">Close</button>
      </div>
      <div class="reference-modal-body">
        <h3>Finding Resources</h3>
        <p>Select a category to view available resources.</p>
        <p>The <code>Lists</code> category appears automatically when a resource is a list rather than a normal service record.</p>
        <p>Some category pages include <code>Type</code> and <code>For</code> buttons that narrow the visible resources.</p>
        <p>Click a resource to display Information, phone numbers, addresses, websites, hours, and notes.</p>
        <p>Click the resource again to hide the additional information.</p>
        <h3>Search</h3>
        <p>Use Search to find resources by name, category filters, For groups, Lists, and text in the resource information.</p>
        <h3>Selecting Resources for Printing</h3>
        <p>⬜ Resource is not selected for printing.</p>
        <p>🖨️ Resource is selected for printing.</p>
        <h3>Print Preview and Printing</h3>
        <p>Click 🖨️ in the top bar to open Print Preview.</p>
        <p>Click 🖨️ to disable printing for a resource.</p>
        <p>Review the selected resources and print the handout.</p>
        <p>To save the handout as a PDF, choose Print, select Print to PDF as the printer, then click Print and choose where to save the file.</p>
        <h3>Application Information</h3>
        <p>Click ${titleText} to see the current version number and recent updates and changes.</p>
        <h3>Merging Resource Updates</h3>
        <p>Click Categories in the top bar. The Merge Resources button is below the categories on the right side.</p>
        <p>Use Merge Resources to import updated resource information when you are notified that updates are available.</p>
      </div>
    </div>
  `;
  const closeBtn = modal.querySelector(".reference-modal-close");
  if(closeBtn) closeBtn.addEventListener("click", closeReferenceModal);
  modal.classList.remove("hidden");
}

function showAdminHelp(options = {}){
  const expandTraining = !!(options && options.expandTraining);
  const modal = getReferenceModal();
  const adminEntryTipHTML = expandTraining && isNewTemplateFile()
    ? `<div class="red-tip new-admin-tip">${escapeHTML(TIP_TEXT.newAdminMode)}</div>`
    : "";
  modal.innerHTML = `
    <div class="reference-modal-panel" role="dialog" aria-modal="true" aria-labelledby="adminHelpTitle">
      <div class="reference-modal-header">
        <div id="adminHelpTitle" class="reference-modal-title">Admin Help</div>
        <div class="reference-modal-actions">
          <button class="button" type="button" id="adminHelpPrintButton">Print</button>
          <button class="button reference-modal-close" type="button">Close</button>
        </div>
      </div>
      <div class="reference-modal-body admin-help-content">
        ${adminEntryTipHTML}
        <p><strong>NOTE:</strong> The <code>Lists</code> category is generated automatically. It is not edited in <code>Categories</code>. A resource appears in <code>Lists</code> when it has no phone, website, or hours, which usually means it is a list such as food pantries, shelters, rooms, or temp agencies.</p>

        <details class="admin-training-section" ${expandTraining ? "open" : ""}>
          <summary>First-Time Admin Training</summary>
          <div class="admin-help-section-body">
            <div class="admin-training-actions">
              <button class="button" type="button" id="adminTrainingPrintButton">Print Training</button>
            </div>
            <p>This walkthrough will help you get up and running. You'll add a practice resource and then see how it looks to a user. You'll learn about the Category, Resource and For editors, types, For groups, the change log and how to share your newly-added resources with your users.</p>
            <ol>
              <li>Press <code>Ctrl+Alt+A</code> to enable admin mode. Click the <code>Admin</code> button in the top blue bar.</li>
              <li>Change the TSO name. Close the tab or window and rename <code>new.html</code> to <code>[your tso name].html</code> and open it.</li>
              <li>Click the <code>Education</code> category. It says, <code>No resources in this category</code>.</li>
              <li>Enter admin mode.</li>
              <li>We'll discuss <code>Save Resource Package</code> later. <code>Categories</code>, <code>Resources</code> and <code>For</code> are editors.</li>
              <li>On the left is a list of the standard categories. You can add <code>New</code> categories or <code>Delete</code> existing ones.</li>
              <li>On the right is the category editor. If you make a change you should describe it. Your description will appear in the change log and will inform the users of what has changed.</li>
              <li>Click <code>Education</code> in the list of categories.</li>
              <li>Types are like specific subcategories and they are different for each category. Education has types for <code>GED</code>, <code>Evening classes</code> and more. On the right, <code>Resources in this category</code> is empty.</li>
              <li>Click the <code>For</code> button above the list of categories. An Education resource, for example, might be for Spanish speakers.</li>
              <li>Click <code>Resources</code>. We'll create a practice resource that will tie all this together.</li>
              <li>Click <code>New</code>. Name the resource <code>Education Practice</code>. Fill in something for <code>Phone</code>, <code>Address</code>, <code>Website</code> and <code>Hours</code>.</li>
              <li>In <code>Description</code> enter <code>This is a practice resource for training purposes.</code></li>
              <li>In <code>Describe this update</code>, enter <code>new</code>.</li>
              <li>In <code>For</code>, click <code>Spanish speaking</code> and <code>Veterans</code>.</li>
              <li>In <code>Categories</code>, click <code>Education</code> and then click <code>GED</code> and <code>Evening classes</code>.</li>
              <li>In the <code>Information</code> section, click <code>Edit</code>.</li>
              <li>Type the following in the text area:
                <pre class="admin-training-sample"><code>**Practice formatting for this resource**
---
* here's a bullet
* __this text is underlined__</code></pre>
                Now click the <code>Preview</code> button.
              </li>
              <li>Click the blue <code>Done</code> button, then click the <code>Categories</code> button in the blue bar.</li>
              <li><code>Education</code> has an <code>Update</code> button. Click it. Then click <code>Categories</code> and click <code>Education</code> again.</li>
              <li>Click <code>GED</code> or <code>Evening classes</code> or both. They show the practice resource that is specifically GED or Evening classes.</li>
              <li>Click <code>Spanish speaking</code> or <code>Veterans</code> or both. This practice resource is for them.</li>
              <li>Enter admin mode again. Click <code>Show change log</code>. Click <code>Save Resource Package</code> and choose the location for the resource package. Remember where you put it.</li>
              <li>Click <code>Resources</code>, highlight <code>Practice</code> and delete it. Press <code>Ctrl+Alt+A</code> to exit admin mode.</li>
              <li>Under the category buttons, on the right side, click <code>Merge Resources</code>. Choose the resource package zip you saved. The Practice resource will be back in Education.</li>
              <li>In the Education category, click the gray square on the left of Practice resource. Use the printer icon in the blue bar to print the Practice resource.</li>
            </ol>
          </div>
        </details>

        <details>
          <summary>Before You Edit</summary>
          <div class="admin-help-section-body">
            <p>Always start by loading the latest resource package.</p>
            <ol>
              <li>Go to the Categories screen.</li>
              <li>Click <code>Merge Resources</code>.</li>
              <li>Choose the latest resource package zip.</li>
              <li>Wait for the merge to finish before making edits.</li>
            </ol>
            <p>This matters because resource packages are merged by <code>lastModified</code> timestamps. If you edit from an older package, a later merge can bring back old details, old groups, or old category assignments.</p>
          </div>
        </details>

        <details>
          <summary>How do I share my work?</summary>
          <div class="admin-help-section-body">
            <p>Admin edits are saved in your browser first. They are not shared with anyone else until you export a new resource package.</p>
            <p>After a batch of edits:</p>
            <ol>
              <li>Click <code>Show change log</code> and review the listed changes.</li>
              <li>Click <code>Save Resource Package</code>.</li>
              <li>Save the resource package zip.</li>
              <li>Share that resource package zip through the normal distribution process.</li>
            </ol>
            <p><code>Save Resource Package</code> commits any open editor changes, increases the package version, and exports the current data.</p>
          </div>
        </details>

        <details>
          <summary>Categories</summary>
          <div class="admin-help-section-body">
            <p>Use <code>Categories</code> to manage the sections users see on the main screen.</p>
            <p><code>New</code> creates a blank category. Enter the category label, add any filters for that category, describe the update, and click <code>Done</code>.</p>
            <p>Category filters are category-specific choices that answer: what specific kind of help does this resource offer inside this category?</p>
            <p><code>Delete</code> removes the selected category. It does not delete the resources in that category, but those resources will no longer appear there. The app asks for confirmation and gives you a chance to describe the deletion.</p>
            <p>Categories are shown alphabetically.</p>
            <p>The category editor also shows <code>Resources in this category</code>. Click a resource name there to open it in the resource editor.</p>
            <p>Category labels must be unique.</p>
          </div>
        </details>

        <details>
          <summary>Resources</summary>
          <div class="admin-help-section-body">
            <p>Use <code>Resources</code> to add, edit, delete, categorize, assign For groups, and verify resource records.</p>
            <p>In the resource list:</p>
            <ul>
              <li>Click a resource to select it.</li>
              <li>Click <code>Edit</code>, double-click the resource, or press <code>Enter</code> to edit it.</li>
              <li>Click <code>New</code> to create a resource.</li>
              <li>Click <code>Delete</code> or press <code>Delete</code> to remove the selected resource.</li>
              <li>Turn on <code>Show verified dates</code> to show and sort by verification date.</li>
            </ul>
            <p>In the resource editor:</p>
            <ul>
              <li><code>Name</code> is required and must be unique.</li>
              <li><code>Phone</code>, <code>Address</code>, <code>Website</code>, and <code>Hours</code> appear on the public resource card when filled in.</li>
              <li><code>Verified</code> stores a <code>MM/YY</code> date. Click <code>Update</code> to fill in the current month and year.</li>
              <li><code>Description</code> is the short public summary.</li>
              <li><code>Describe this update</code> is used in the change log and package update summary.</li>
              <li><code>For</code> identifies who the resource is for.</li>
              <li><code>Categories</code> controls where the resource appears and shows category-specific filters when available.</li>
              <li><code>Information</code> is the detailed public service text.</li>
            </ul>
            <p>If a resource is a list, leave <code>Phone</code>, <code>Website</code>, and <code>Hours</code> blank so the app can place it in the generated <code>Lists</code> category.</p>
            <p>Click <code>Done</code> to save the editor. If you leave <code>Describe this update</code> blank after changing a category or resource, the app asks whether you want to describe the change or save without a description.</p>
          </div>
        </details>

        <details>
          <summary>Information Text</summary>
          <div class="admin-help-section-body">
            <p>The resource <code>Information</code> editor contains the detailed public service text. Use <code>Preview</code> to check how the text will look.</p>
            <p>Supported formatting:</p>
            <ul>
              <li>Start a line with <code>*[space]</code> for a bullet.</li>
              <li>Use <code>**bold**</code> for bold text.</li>
              <li>Use <code>__underline__</code> for underlined text.</li>
              <li>Put <code>---</code> on its own line for a divider.</li>
            </ul>
          </div>
        </details>

        <details>
          <summary>For</summary>
          <div class="admin-help-section-body">
            <p><code>For</code> manages the governed list of groups a resource can be for.</p>
            <p>Use <code>For</code> for cross-category people-served groups, such as veterans or families with children. Use category filters for the specific service being offered.</p>
            <p>Select a group to see which resources use it. <code>Delete</code> removes that group from the list and from every resource that uses it.</p>
            <p>Before deleting groups, make sure you have loaded the latest package. If another admin later saves an older version of a resource, a merge can bring the deleted group back.</p>
          </div>
        </details>

        <details>
          <summary>Change Log</summary>
          <div class="admin-help-section-body">
            <p>The change log tracks local admin edits. Good update descriptions make package updates easier for other admins to review.</p>
            <p>Useful examples:</p>
            <ul>
              <li><code>Updated phone number</code></li>
              <li><code>Added eligibility details</code></li>
              <li><code>Renamed housing filter</code></li>
              <li><code>Deleted outdated resource</code></li>
            </ul>
            <p>After a package is merged successfully, the local change log is cleared.</p>
          </div>
        </details>

        <details>
          <summary>Undo</summary>
          <div class="admin-help-section-body">
            <p>Undo is available only for destructive deletions: category deletion, resource deletion, and For group deletion.</p>
            <p>Only the most recent deletion can be undone. Use <code>Undo ...</code> in Admin mode to restore the saved snapshot, or <code>Clear undo</code> to remove it.</p>
            <p>Normal edits are not undone this way. If you make a wrong normal edit, edit the item again and describe the correction.</p>
          </div>
        </details>
      </div>
    </div>
  `;
  const closeBtn = modal.querySelector(".reference-modal-close");
  const printBtn = document.getElementById("adminHelpPrintButton");
  const trainingPrintBtn = document.getElementById("adminTrainingPrintButton");
  if(closeBtn) closeBtn.addEventListener("click", closeReferenceModal);
  if(printBtn) printBtn.addEventListener("click", printAdminHelp);
  if(trainingPrintBtn) trainingPrintBtn.addEventListener("click", printAdminTraining);
  modal.classList.remove("hidden");
  if(closeBtn) closeBtn.focus();
}

function getUnseenUpdates(){
  const seen = getSeenUpdateIds();
  return getRecentChanges().filter(entry => !seen.has(String(entry.id)));
}

function getCategoryUpdateMap(){
  const map = new Map();
  const seen = getSeenUpdateIds();
  getRecentChanges().forEach(entry => {
    getCategoryIdsForChange(entry).forEach(catId => {
      if(seen.has(String(entry.id)) || seen.has(getCategoryChangeSeenKey(entry.id, catId))) return;
      if(!map.has(catId)) map.set(catId, []);
      map.get(catId).push(entry);
    });
  });
  return map;
}

// ============================================================
// RENDERING — RESOURCES
// ============================================================
// Resource cards are shared across category lists, print previews, and admin
// reference checks. Keep resource-card behavior here so all surfaces agree on
// print toggles, details expansion, and information formatting.

function buildResourceCard(res,{expanded=false,showDescription=false,showPrintToggle=true}={}){
  // Shared DOM builder used by category view, print-selection view, and print previews.
  normalizeResourceInformation(res);
  normalizeResourcePDFs(res);

  const card=document.createElement("div");
  card.className="resource-card";
  card.addEventListener("click", event => {
    handleAdminListReferenceInspection(event, res);
  }, true);

  if(showPrintToggle){
    const toggle=document.createElement("button");
    toggle.type = "button";
    toggle.className="print-selection-toggle";
    toggle.setAttribute("aria-label", isSelectedForPrinting(res.id) ? "Disable printing for this resource" : "Enable printing for this resource");
    toggle.textContent=getPrintSelectionIcon(res.id);
    toggle.onclick=e=>{e.stopPropagation(); togglePrintSelection(res.id);};
    card.appendChild(toggle);
  }

  const main=document.createElement("div");
  main.className="resource-main";
  main.innerHTML=`<strong>${res.name}</strong>`;
  if(showDescription && res.description) main.innerHTML+=`<div>${escapeHTML(res.description)}</div>`;

  const details=document.createElement("div");
  details.className="resource-details "+(expanded?"expanded":"collapsed");

  let html="";
  const pdfs = getResourcePDFs(res);
  const phone = displayContactValue(res.phone);
  const address = displayContactValue(res.address);
  const website = displayContactValue(res.website);
  const hours = displayContactValue(res.hours);
  const websiteURL = normalizeWebsiteURL(website);
  if(phone) html+=`<div><strong>Phone:</strong> <a href="tel:${escapeHTML(phone)}">${escapeHTML(phone)}</a></div>`;
  if(address) html+=`<div><strong>Address:</strong> ${escapeHTML(address)}</div>`;
  if(websiteURL) html+=`<div><strong>Website:</strong> <a href="${websiteURL}" target="_blank">${escapeHTML(website)}</a></div>`;
  if(hours) html+=`<div><strong>Hours:</strong> ${escapeHTML(hours)}</div>`;
  if(pdfs.length === 1){
    const label = pdfs[0].name && pdfs[0].name !== "PDF" ? pdfs[0].name : "Open PDF";
    html+=`<div><button type="button" class="button resource-pdf-button" data-pdf-index="0">${escapeHTML(label)}</button></div>`;
  }
  if(pdfs.length > 1){
    html+=`<div><strong>PDFs:</strong><div class="pdf-attachments-list">`;
    pdfs.forEach((pdf, index) => {
      html+=`<button type="button" class="button resource-pdf-button" data-pdf-index="${index}">${escapeHTML(pdf.name || "PDF")}</button>`;
    });
    html+=`</div></div>`;
  }
  if(res.informationText) html+=`<hr class="resource-info-separator"><div class="information-rendered resource-info-rendered">${renderInformationHTML(res.informationText)}</div>`;

  details.innerHTML=html;
  details.querySelectorAll(".resource-pdf-button").forEach(btn => {
    btn.onclick = async e => {
      e.stopPropagation();
      const index = Number(btn.dataset.pdfIndex);
      const pdf = pdfs[index];
      if(pdf && pdf.path) await openPDF(pdf.path);
    };
  });
  main.appendChild(details);
  card.appendChild(main);
  return card;
}

// ============================================================
// RENDERING — CATEGORIES
// ============================================================
// Category view helpers handle category filters and For-group filters within the selected category.
// Filters are transient UI state; they are not saved into the resource package.

function getSelectedCategoryFilters(categoryId){
  return Array.isArray(selectedCategoryFilters[categoryId]) ? selectedCategoryFilters[categoryId] : [];
}

function setSelectedCategoryFilters(categoryId, filterKeys){
  const cleaned = normalizeTaxonomyLabels(filterKeys);
  if(cleaned.length){
    selectedCategoryFilters[categoryId] = cleaned;
  }else{
    delete selectedCategoryFilters[categoryId];
  }
}

function clearAllCategoryFilters(shouldRender = true){
  selectedCategoryFilters = {};
  if(shouldRender && view === "category") safeRender();
}

function makeCategorySpecificFilterKey(filter){
  return `filter:${canonicalizeTaxonomyLabel(filter).toLowerCase()}`;
}

function makeForGroupFilterKey(group){
  return `for:${canonicalizeTaxonomyLabel(group).toLowerCase()}`;
}

function getCategoryFilterOptions(categoryId){
  const cat = (Array.isArray(data.categories) ? data.categories : []).find(category => category && category.id === categoryId);
  const options = [];
  const resources = getCategoryResources(categoryId);
  const usedCategoryFilterKeys = new Set();
  const usedForGroupKeys = new Set();

  resources.forEach(resource => {
    getResourceCategoryFilterKeys(resource, categoryId).forEach(key => usedCategoryFilterKeys.add(key));
    getResourceForGroupFilterKeys(resource).forEach(key => usedForGroupKeys.add(key));
  });

  normalizeCategoryFilters(cat && cat.filters).forEach(filter => {
    const key = makeCategorySpecificFilterKey(filter);
    if(usedCategoryFilterKeys.has(key)){
      options.push({ key, label:filter, kind:"filter" });
    }
  });
  normalizeTaxonomyLabels(data.forGroups).forEach(group => {
    const key = makeForGroupFilterKey(group);
    if(usedForGroupKeys.has(key)){
      options.push({ key, label:group, kind:"for" });
    }
  });
  return options;
}

function getResourceCategoryFilterKeys(resource, categoryId){
  return new Set(normalizeCategoryFilters(resource && resource.categoryFilters && resource.categoryFilters[categoryId])
    .map(makeCategorySpecificFilterKey));
}

function getResourceForGroupFilterKeys(resource){
  return new Set(normalizeTaxonomyLabels(resource && resource.forGroups).map(makeForGroupFilterKey));
}

function countSelectedCategoryFilterMatches(resource, categoryId, activeFilterKeys){
  if(!activeFilterKeys.size) return 0;
  const resourceKeys = new Set([
    ...getResourceCategoryFilterKeys(resource, categoryId),
    ...getResourceForGroupFilterKeys(resource)
  ]);
  let count = 0;
  activeFilterKeys.forEach(key => {
    if(resourceKeys.has(key)) count += 1;
  });
  return count;
}

function resourceMatchesSelectedCategoryFilters(resource, categoryId, selectedFilterKeys){
  const activeFilterKeys = new Set(normalizeTaxonomyLabels(selectedFilterKeys));
  return !activeFilterKeys.size || countSelectedCategoryFilterMatches(resource, categoryId, activeFilterKeys) > 0;
}

function filterResourcesBySelectedCategoryFilters(resources, categoryId, selectedFilterKeys){
  const activeFilterKeys = new Set(normalizeTaxonomyLabels(selectedFilterKeys));
  return (Array.isArray(resources) ? resources : [])
    .filter(resource => resourceMatchesSelectedCategoryFilters(resource, categoryId, selectedFilterKeys))
    .sort((a, b) => {
      if(activeFilterKeys.size){
        const matchDiff = countSelectedCategoryFilterMatches(b, categoryId, activeFilterKeys) - countSelectedCategoryFilterMatches(a, categoryId, activeFilterKeys);
        if(matchDiff) return matchDiff;
      }
      return compareResourcesByName(a, b);
    });
}

function resourceMatchesListsHeuristic(resource){
  return !String(resource && resource.phone || "").trim()
    && !String(resource && resource.website || "").trim()
    && !String(resource && resource.hours || "").trim();
}

function getListsResources(){
  return (Array.isArray(data.resources) ? data.resources : [])
    .filter(resourceMatchesListsHeuristic);
}

function isListsCategory(categoryId){
  return String(categoryId || "") === LISTS_CATEGORY_ID;
}

function getCategoryResources(categoryId){
  if(isListsCategory(categoryId)) return getListsResources();
  return (Array.isArray(data.resources) ? data.resources : [])
    .filter(r => Array.isArray(r.categories) && r.categories.includes(categoryId));
}

function renderSearchResultsView(){
  const results = searchResults || buildSearchResults(searchQuery);
  const title = document.createElement("div");
  title.className = "search-results-title";
  title.textContent = `Search results for: ${results.query || ""}`;
  appView.appendChild(title);

  if(!results.groups.length){
    const empty = document.createElement("p");
    empty.textContent = results.query ? "No matching resources." : "Enter a search term.";
    appView.appendChild(empty);
    return;
  }

  results.groups.forEach(group => {
    const section = document.createElement("div");
    section.className = "search-result-group";

    const heading = document.createElement("div");
    heading.className = "search-result-group-title";
    heading.textContent = group.categoryLabel;
    section.appendChild(heading);

    const list = document.createElement("ul");
    list.className = "search-result-list";
    group.items.forEach(item => {
      const row = document.createElement("li");
      row.className = "search-result-item";

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "search-result-button";
      btn.textContent = item.resourceName;
      btn.onclick = () => openSearchResult(group.categoryId, item.resourceId);
      row.appendChild(btn);

      if(item.snippet){
        const snippet = document.createElement("div");
        snippet.className = "search-result-snippet";
        snippet.textContent = item.snippet;
        row.appendChild(snippet);
      }

      list.appendChild(row);
    });
    section.appendChild(list);
    appView.appendChild(section);
  });
}
