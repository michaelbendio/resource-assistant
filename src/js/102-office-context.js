// ============================================================
// OFFICE CONTEXT, SETUP, AND LOCAL PUBLICATION HISTORY
// ============================================================
// This module describes only the office file currently open. It deliberately
// does not contain an office registry, and none of this state is package data.

const PUBLICATION_HISTORY_SCHEMA_VERSION = 1;
const PUBLICATION_HISTORY_LIMIT = 10;
let officeSetupDirectoryHandle = null;

function getPublicationHistoryStorageKey(storageId = STORAGE_KEY_PREFIX){
  return `${normalizeStorageId(storageId)}PublicationHistory`;
}

function normalizePublicationHistoryEntry(entry){
  if(!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
  const savedAt = Date.parse(String(entry.savedAt || "")) ? String(entry.savedAt) : "";
  const fileName = String(entry.fileName || "").trim();
  if(!savedAt || !fileName) return null;
  const id = String(entry.id || `publication:${savedAt}:${fileName}`).trim();
  const replacedAt = Date.parse(String(entry.replacedAt || "")) ? String(entry.replacedAt) : "";
  return {
    id,
    savedAt,
    replacedAt,
    packageVersion:normalizePackageVersionValue(entry.packageVersion),
    fileName,
    resourceCount:Number.isFinite(Number(entry.resourceCount)) ? Number(entry.resourceCount) : 0,
    resourcesAdded:Number.isFinite(Number(entry.resourcesAdded)) ? Number(entry.resourcesAdded) : 0,
    resourcesUpdated:Number.isFinite(Number(entry.resourcesUpdated)) ? Number(entry.resourcesUpdated) : 0,
    approvedDeletions:Number.isFinite(Number(entry.approvedDeletions)) ? Number(entry.approvedDeletions) : 0,
    sharePointFolder:String(entry.sharePointFolder || "").trim(),
    sharePointLibraryUrl:String(entry.sharePointLibraryUrl || "").trim()
  };
}

const PublicationHistoryStore = Object.freeze({
  load(storageId = STORAGE_KEY_PREFIX){
    try{
      const parsed = JSON.parse(localStorage.getItem(getPublicationHistoryStorageKey(storageId)) || "null");
      const entries = Array.isArray(parsed)
        ? parsed
        : (parsed && Array.isArray(parsed.entries) ? parsed.entries : []);
      return entries
        .map(normalizePublicationHistoryEntry)
        .filter(Boolean)
        .sort((a, b) => String(b.savedAt).localeCompare(String(a.savedAt)))
        .slice(0, PUBLICATION_HISTORY_LIMIT);
    }catch(_err){
      return [];
    }
  },

  save(entries, storageId = STORAGE_KEY_PREFIX){
    const normalized = (Array.isArray(entries) ? entries : [])
      .map(normalizePublicationHistoryEntry)
      .filter(Boolean)
      .sort((a, b) => String(b.savedAt).localeCompare(String(a.savedAt)))
      .slice(0, PUBLICATION_HISTORY_LIMIT);
    localStorage.setItem(getPublicationHistoryStorageKey(storageId), JSON.stringify({
      schemaVersion:PUBLICATION_HISTORY_SCHEMA_VERSION,
      entries:normalized
    }));
    return normalized;
  },

  recordSaved(summary, storageId = STORAGE_KEY_PREFIX){
    const savedAt = Date.parse(String(summary && summary.savedAt || ""))
      ? String(summary.savedAt)
      : nowISO();
    const entry = normalizePublicationHistoryEntry({
      ...summary,
      id:String(summary && summary.id || `publication:${savedAt}:${Math.random().toString(16).slice(2, 10)}`),
      savedAt,
      replacedAt:""
    });
    if(!entry) throw new Error("The local publication record is incomplete.");
    const entries = this.load(storageId).filter(item => item.id !== entry.id);
    this.save([entry, ...entries], storageId);
    return entry;
  },

  confirmReplaced(publicationId, confirmedAt = nowISO(), storageId = STORAGE_KEY_PREFIX){
    const id = String(publicationId || "");
    let confirmed = null;
    const entries = this.load(storageId).map(entry => {
      if(entry.id !== id) return entry;
      confirmed = normalizePublicationHistoryEntry({ ...entry, replacedAt:confirmedAt });
      return confirmed;
    });
    if(!confirmed) return null;
    this.save(entries, storageId);
    return confirmed;
  }
});

function evaluateOfficeSetupStatus(context){
  const storageId = String(context && context.storageId || "").trim();
  const tsoName = String(context && context.tsoName || "").trim();
  const expectedPackageFileName = String(context && context.expectedPackageFileName || "").trim();
  const target = context && context.target;
  const directoryHandle = context && context.directoryHandle;
  const directoryPermission = String(context && context.directoryPermission || "denied");
  const issues = [];
  if(!storageId || normalizeStorageId(storageId) === "new"){
    issues.push("Open an office-specific HTML file with a configured storage ID.");
  }
  if(!tsoName) issues.push("Enter the TSO name.");
  if(!expectedPackageFileName) issues.push("The expected resource-package filename could not be determined.");
  if(!target) issues.push("Save a valid SharePoint resource-package URL.");
  if(!directoryHandle) issues.push("Choose the folder where Edge saves the SharePoint package.");
  else if(directoryPermission !== "granted") issues.push("Authorize read and write access to the download folder.");
  return {
    complete:issues.length === 0,
    issues,
    storageId,
    tsoName,
    expectedPackageFileName,
    target:target || null,
    directoryHandle:directoryHandle || null,
    directoryName:String(directoryHandle && directoryHandle.name || ""),
    directoryPermission
  };
}

async function getOfficeSetupStatus(options = {}){
  const storageId = getConfiguredStorageId();
  const tsoName = getTsoName();
  const expectedPackageFileName = getExpectedSharePointPackageFileName();
  const target = getSharePointPublishingTarget();
  const directoryHandle = options.directoryHandle !== undefined
    ? options.directoryHandle
    : await loadPublishingDirectoryHandle();
  let directoryPermission = await queryPublishingDirectoryPermission(directoryHandle);
  if(options.requestPermission && directoryHandle && directoryPermission !== "granted"
    && typeof directoryHandle.requestPermission === "function"){
    try{
      directoryPermission = await directoryHandle.requestPermission({ mode:"readwrite" });
    }catch(_err){
      directoryPermission = "denied";
    }
  }
  return evaluateOfficeSetupStatus({
    storageId,
    tsoName,
    expectedPackageFileName,
    target,
    directoryHandle,
    directoryPermission
  });
}

const OfficeContext = Object.freeze({
  get storageId(){ return getConfiguredStorageId(); },
  get tsoName(){ return getTsoName(); },
  get expectedPackageFileName(){ return getExpectedSharePointPackageFileName(); },
  get sharePointTarget(){ return getSharePointPublishingTarget(); },
  inspect:getOfficeSetupStatus,
  get publicationHistory(){ return PublicationHistoryStore.load(); }
});

function formatLocalDateTime(value){
  const date = new Date(String(value || ""));
  return Number.isFinite(date.getTime()) ? date.toLocaleString() : "Unknown time";
}

function officePublicationHistoryHTML(entries = PublicationHistoryStore.load()){
  const history = Array.isArray(entries) ? entries : [];
  if(!history.length){
    return `<p class="admin-setup-note">No packages have been saved through guided publishing on this computer.</p>`;
  }
  return `
    <div class="office-publication-history">
      ${history.slice(0, 5).map(entry => `
        <div class="office-publication-entry">
          <strong>Resource Package ${escapeHTML(String(entry.packageVersion))}</strong>
          <span>${escapeHTML(entry.fileName)} · saved ${escapeHTML(formatLocalDateTime(entry.savedAt))}</span>
          <span>${entry.replacedAt
            ? `Replacement recorded ${escapeHTML(formatLocalDateTime(entry.replacedAt))}`
            : "SharePoint replacement not yet recorded"}</span>
        </div>
      `).join("")}
    </div>
  `;
}

function renderOfficeSetupStatus(status, message = ""){
  const statusBox = document.getElementById("officeSetupStatus");
  const folderStatus = document.getElementById("officeSetupFolderStatus");
  if(folderStatus){
    const folderName = status && status.directoryName ? `<strong>${escapeHTML(status.directoryName)}</strong>: ` : "";
    const permissionText = !status || !status.directoryHandle
      ? "No folder selected"
      : (status.directoryPermission === "granted" ? "Authorized" : "Authorization required");
    folderStatus.innerHTML = `${folderName}${escapeHTML(permissionText)}`;
  }
  if(!statusBox) return;
  if(!status){
    statusBox.className = "office-setup-status";
    statusBox.innerHTML = "Checking configuration…";
    return;
  }
  statusBox.className = `office-setup-status ${status.complete ? "complete" : "incomplete"}`;
  statusBox.innerHTML = `
    <strong>${status.complete ? "Setup complete" : "Setup incomplete"}</strong>
    ${message ? `<p>${escapeHTML(message)}</p>` : ""}
    ${status.issues.length ? `<ul>${status.issues.map(issue => `<li>${escapeHTML(issue)}</li>`).join("")}</ul>` : ""}
  `;
}

async function refreshOfficeSetupStatus(options = {}){
  renderOfficeSetupStatus(null);
  try{
    const status = await getOfficeSetupStatus({
      directoryHandle:officeSetupDirectoryHandle === null ? undefined : officeSetupDirectoryHandle,
      requestPermission:!!options.requestPermission
    });
    officeSetupDirectoryHandle = status.directoryHandle;
    renderOfficeSetupStatus(status, options.message || "");
    return status;
  }catch(err){
    renderOfficeSetupStatus(evaluateOfficeSetupStatus({
      storageId:getConfiguredStorageId(),
      tsoName:getTsoName(),
      expectedPackageFileName:getExpectedSharePointPackageFileName(),
      target:getSharePointPublishingTarget(),
      directoryHandle:null,
      directoryPermission:"denied"
    }), `Configuration could not be checked: ${err && err.message ? err.message : err}`);
    return null;
  }
}

function updateOfficeSetupExpectedFilename(){
  const nameInput = document.getElementById("adminSetupTsoName");
  const output = document.getElementById("officeSetupExpectedPackage");
  if(!output) return;
  const candidateName = String(nameInput && nameInput.value || "").trim();
  const stem = slugifyFileStem(candidateName || getSharePointPublishingOfficeName(), "tso");
  output.textContent = `${stem}-resource-package.zip`;
}

async function saveOfficeSetupFromModal(options = {}){
  const nameInput = document.getElementById("adminSetupTsoName");
  const urlInput = document.getElementById("officeSetupSharePointUrl");
  const nextName = String(nameInput && nameInput.value || "").trim();
  const destinationInput = String(urlInput && urlInput.value || "").trim();
  if(nextName){
    localStorage.setItem(TSO_NAME_STORAGE_KEY, nextName);
    if(isNewTemplateFile()) markRenamedAdminTrainingPending(nextName);
  }else{
    localStorage.removeItem(TSO_NAME_STORAGE_KEY);
    if(isNewTemplateFile()) localStorage.removeItem(NEW_ADMIN_TRAINING_PENDING_KEY);
  }
  refreshAppTitle();
  updateOfficeSetupExpectedFilename();

  try{
    if(destinationInput){
      const target = parseSharePointPublishingUrl(
        destinationInput,
        getExpectedSharePointPackageFileName(),
        getSharePointPublishingOfficeName()
      );
      saveSharePointPublishingTarget({ ...target, configuredAt:nowISO() });
    }else{
      localStorage.removeItem(getSharePointPublishingTargetStorageKey());
    }
  }catch(err){
    renderOfficeSetupStatus(evaluateOfficeSetupStatus({
      storageId:getConfiguredStorageId(),
      tsoName:getTsoName(),
      expectedPackageFileName:getExpectedSharePointPackageFileName(),
      target:null,
      directoryHandle:officeSetupDirectoryHandle,
      directoryPermission:await queryPublishingDirectoryPermission(officeSetupDirectoryHandle)
    }), err && err.message ? err.message : String(err));
    return false;
  }

  safeRender();
  const status = await refreshOfficeSetupStatus({
    requestPermission:!!options.requestPermission,
    message:options.testConfiguration ? "Configuration test completed." : "Office setup saved locally."
  });
  if(!options.silent) showToast(options.testConfiguration ? "Configuration tested." : "Office setup saved.");
  return !!status;
}

async function chooseOfficeSetupDirectory(){
  if(typeof window.showDirectoryPicker !== "function"){
    renderOfficeSetupStatus(await getOfficeSetupStatus(), "This browser cannot authorize a download folder. Use current Microsoft Edge.");
    return;
  }
  try{
    const handle = await window.showDirectoryPicker({
      id:"tso-sharepoint-publishing",
      startIn:"downloads",
      mode:"readwrite"
    });
    officeSetupDirectoryHandle = handle;
    await rememberPublishingDirectoryHandle(handle);
    await refreshOfficeSetupStatus({ requestPermission:true, message:"Download folder selected." });
  }catch(err){
    if(err && err.name === "AbortError") return;
    renderOfficeSetupStatus(await getOfficeSetupStatus(), `The download folder could not be opened: ${err && err.message ? err.message : err}`);
  }
}

function showOfficeSetup(){
  const modal = getReferenceModal();
  const target = OfficeContext.sharePointTarget;
  const storageId = OfficeContext.storageId;
  officeSetupDirectoryHandle = null;
  modal.innerHTML = `
    <div class="reference-modal-panel office-setup-panel" role="dialog" aria-modal="true" aria-labelledby="adminSetupTitle">
      <div class="reference-modal-header">
        <div>
          <div id="adminSetupTitle" class="reference-modal-title">Admin Office Setup</div>
          <div class="reference-modal-subtitle">Configuration for this HTML file on this computer</div>
        </div>
        <button class="button reference-modal-close" type="button">Close</button>
      </div>
      <div class="reference-modal-body admin-setup-panel">
        <div id="officeSetupStatus" class="office-setup-status">Checking configuration…</div>
        <label for="adminSetupTsoName">TSO name
          <input id="adminSetupTsoName" type="text" value="${escapeHTML(getTsoName())}" placeholder="Example: Provo">
        </label>
        <dl class="sharepoint-publish-destination office-setup-details">
          <div><dt>Storage ID</dt><dd><code>${escapeHTML(storageId || "Not configured")}</code></dd></div>
          <div><dt>Expected resource-package filename</dt><dd><code id="officeSetupExpectedPackage">${escapeHTML(OfficeContext.expectedPackageFileName)}</code></dd></div>
        </dl>
        <label for="officeSetupSharePointUrl">SharePoint package URL
          <textarea id="officeSetupSharePointUrl" class="sharepoint-publish-url" spellcheck="false" placeholder="https://${SHAREPOINT_PUBLISHING_ALLOWED_HOST}/sites/WSR_TSO/…">${escapeHTML(target && target.packageViewUrl || getStoredSharePointPublishingUrl())}</textarea>
        </label>
        <div class="office-setup-folder-row">
          <div><strong>Download-folder authorization</strong><div id="officeSetupFolderStatus">Checking…</div></div>
          <button class="button" type="button" id="officeSetupChooseFolder">Choose folder</button>
        </div>
        <p class="admin-setup-note">This setup belongs only to the office file currently open. It is stored on this computer and is never included in a resource package.</p>
        <div class="admin-setup-actions">
          <button class="button primary" type="button" id="officeSetupSave">Save Office Setup</button>
          <button class="button" type="button" id="officeSetupTest">Test Configuration</button>
        </div>
        <section class="office-publication-history-section">
          <h3>Publishing history on this computer</h3>
          <p class="admin-setup-note">“Replaced” means an administrator recorded the manual action. TSO Resources cannot independently verify a SharePoint upload.</p>
          ${officePublicationHistoryHTML(OfficeContext.publicationHistory)}
        </section>
      </div>
    </div>
  `;
  const closeBtn = modal.querySelector(".reference-modal-close");
  const nameInput = document.getElementById("adminSetupTsoName");
  const saveBtn = document.getElementById("officeSetupSave");
  const testBtn = document.getElementById("officeSetupTest");
  const folderBtn = document.getElementById("officeSetupChooseFolder");
  if(closeBtn) closeBtn.addEventListener("click", closeReferenceModal);
  if(nameInput) nameInput.addEventListener("input", updateOfficeSetupExpectedFilename);
  if(saveBtn) saveBtn.addEventListener("click", () => saveOfficeSetupFromModal());
  if(testBtn) testBtn.addEventListener("click", () => saveOfficeSetupFromModal({ testConfiguration:true, requestPermission:true }));
  if(folderBtn) folderBtn.addEventListener("click", chooseOfficeSetupDirectory);
  modal.classList.remove("hidden");
  refreshOfficeSetupStatus();
}
