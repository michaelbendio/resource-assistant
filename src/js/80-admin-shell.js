// ============================================================
// EVENT HANDLERS
// ============================================================
// Top-level DOM events feed stateful subsystems, which then trigger render updates.

window.addEventListener("afterprint", () => {
  PrintWorkflow.handleAfterPrint();
  restoreAdminHelpPrintState();
});

// ============================================================
// ADMIN MODE
// ============================================================
// Admin mode is hidden behind a keyboard shortcut. It edits the same data object
// used by public views, but writes through commitPendingEditsIfChanged() so
// navigation does not silently discard form edits.

function renderAdmin(){
  // Admin shell plus tab routing; detailed panels render in dedicated helpers below.
  const container = document.getElementById("adminView");
  const undo = getUndoSnapshot();
  const undoButtonLabel = undo ? `Undo ${undo.message}` : "";
  const hasChangeLog = getRecentChanges().length > 0;

  container.innerHTML = `
    <div class="admin-sticky-bar">
      <div class="admin-sticky-package-actions">
        <button class="button primary" onclick="exportPackage()">Save Resource Package</button>
        ${hasChangeLog ? `
          <button class="button" onclick="showChangeLog()">Show change log</button>
          <button class="button" onclick="clearChangeLog()">Clear change log</button>
        ` : ""}
        ${undo ? `
          <button class="button" onclick="undoLastDeletion()">${escapeHTML(undoButtonLabel)}</button>
          <button class="button" onclick="clearUndoSnapshot(); safeRenderAdmin();">Clear undo</button>
        ` : ""}
      </div>
      <div class="admin-toolbar-reference-actions admin-sticky-reference-actions">
        ${shouldShowChangeTsoNameButton() ? `<button class="button" onclick="showAdminSetup()">Change TSO Name</button>` : ""}
        <button class="button admin-toolbar-help" onclick="showAdminHelp()">Admin Help</button>
      </div>
    </div>

    <div class="admin-mode-bar">
      <div class="admin-nav-tabs">
        <button class="button ${adminTab==='categories'?'primary':''}"
          onclick="switchAdminTab('categories')">
          Categories
        </button>

        <button class="button ${adminTab==='resources'?'primary':''}"
          onclick="switchAdminTab('resources')">
          Resources
        </button>

        <button class="button ${adminTab==='forGroups'?'primary':''}"
          onclick="switchAdminTab('forGroups')">
          For
        </button>
      </div>
      <div class="admin-sticky-editor-actions" id="admin_editor_actions" hidden></div>
    </div>
  `;

  clearAdminEditorActions();
  if(isNewTemplateFile()){
    const tip = createNewAdminTip("newAdminMode");
    if(tip) container.appendChild(tip);
  }
  resetAdminEditorStateForTab(adminTab);
  if(adminTab === "categories") renderAdminCategories(container);
  if(adminTab === "resources") renderAdminResources(container);
  if(adminTab === "forGroups") renderAdminForGroups(container);
}

function showChangeLog(){
  view = "recent-updates";
  showUpdateInfo = false;
  showRecentChangeLog = true;
  recentUpdateDetail = null;
  markChangesViewed(getRecentChanges().map(entry => entry.id));
  safeRender();
}

function clearChangeLog(){
  if(!confirm("Clear change log?")) return;
  data.changes = [];
  pendingRecentUpdates = [];
  recentUpdateDetail = null;
  localStorage.removeItem(UPDATE_SEEN_STORAGE_KEY);
  persist();
  showToast("Change log cleared");
  safeRender();
  safeRenderAdmin();
}
