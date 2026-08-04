// ============================================================
// GUIDED SHAREPOINT PUBLISHING
// ============================================================
// The office app runs from a local file, so SharePoint authentication and the
// final replacement stay in Edge. After the admin authorizes one local folder,
// this workflow watches for the completed SharePoint download, merges it with
// the prepared local data, and writes the canonical ZIP name for upload.

const SHAREPOINT_PUBLISHING_TARGETS = Object.freeze({
  provo: Object.freeze({
    officeName:"Provo",
    packageFileName:"provo-resource-package.zip",
    packageViewUrl:"https://churchofjesuschrist.sharepoint.com/sites/WSR_TSO/Provo%20TSO/Forms/AllItems.aspx?id=%2Fsites%2FWSR_TSO%2FProvo%20TSO%2Fprovo-resource-package.zip&parent=%2Fsites%2FWSR_TSO%2FProvo%20TSO",
    libraryUrl:"https://churchofjesuschrist.sharepoint.com/sites/WSR_TSO/Provo%20TSO/Forms/AllItems.aspx"
  })
});
const SHAREPOINT_PUBLISHING_DIRECTORY_KEY = "__sharePointPublishingDirectoryHandle__";
const SHAREPOINT_PUBLISHING_POLL_MS = 1000;
const SHAREPOINT_PUBLISHING_TIMEOUT_MS = 15 * 60 * 1000;
let sharePointPublishRun = null;

function getSharePointPublishingTarget(storageId = STORAGE_KEY_PREFIX){
  return SHAREPOINT_PUBLISHING_TARGETS[normalizeStorageId(storageId)] || null;
}

function isSharePointPublishingAvailable(){
  return !!getSharePointPublishingTarget();
}

function escapeRegularExpression(value){
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isPublishingPackageFileName(fileName, canonicalFileName){
  const canonical = String(canonicalFileName || "");
  const stem = canonical.replace(/\.zip$/i, "");
  if(!stem || !/\.zip$/i.test(canonical)) return false;
  return new RegExp(`^${escapeRegularExpression(stem)}(?: \\(\\d+\\))?\\.zip$`, "i")
    .test(String(fileName || ""));
}

function clearSharePointPublishingTimer(){
  if(!sharePointPublishRun || !sharePointPublishRun.pollTimer) return;
  clearTimeout(sharePointPublishRun.pollTimer);
  sharePointPublishRun.pollTimer = null;
}

function setSharePointPublishingState(state, details = {}){
  if(!sharePointPublishRun) return;
  sharePointPublishRun.state = state;
  Object.assign(sharePointPublishRun, details);
  renderSharePointPublishingModal();
}

async function queryPublishingDirectoryPermission(handle){
  if(!handle) return "denied";
  if(typeof handle.queryPermission !== "function") return "granted";
  try{
    return await handle.queryPermission({ mode:"readwrite" });
  }catch(_err){
    return "denied";
  }
}

async function loadPublishingDirectoryHandle(){
  try{
    const handle = await loadAsset(SHAREPOINT_PUBLISHING_DIRECTORY_KEY);
    return handle && handle.kind === "directory" ? handle : null;
  }catch(_err){
    return null;
  }
}

async function rememberPublishingDirectoryHandle(handle){
  try{
    await saveAsset(SHAREPOINT_PUBLISHING_DIRECTORY_KEY, handle);
  }catch(_err){
    // The selected handle remains usable for this tab even if Edge declines to
    // persist it. The next publishing run will simply ask for the folder again.
  }
}

async function listPublishingPackageFiles(directoryHandle, target){
  const matches = [];
  if(!directoryHandle || typeof directoryHandle.entries !== "function") return matches;
  for await (const [name, handle] of directoryHandle.entries()){
    if(!handle || handle.kind !== "file") continue;
    if(!isPublishingPackageFileName(name, target.packageFileName)) continue;
    try{
      const file = await handle.getFile();
      matches.push({
        name,
        handle,
        file,
        lastModified:Number(file.lastModified || 0),
        size:Number(file.size || 0)
      });
    }catch(_err){}
  }
  return matches;
}

function publishingFileSnapshot(files){
  const snapshot = new Map();
  (Array.isArray(files) ? files : []).forEach(file => {
    snapshot.set(file.name, {
      lastModified:file.lastModified,
      size:file.size
    });
  });
  return snapshot;
}

function findNewPublishingDownload(files, baseline){
  const candidates = (Array.isArray(files) ? files : []).filter(file => {
    const previous = baseline instanceof Map ? baseline.get(file.name) : null;
    return !previous
      || previous.lastModified !== file.lastModified
      || previous.size !== file.size;
  });
  candidates.sort((a, b) => b.lastModified - a.lastModified || b.size - a.size);
  return candidates[0] || null;
}

async function preparePublishingDirectory(handle){
  if(!sharePointPublishRun) return;
  sharePointPublishRun.directoryHandle = handle;
  const files = await listPublishingPackageFiles(handle, sharePointPublishRun.target);
  sharePointPublishRun.baseline = publishingFileSnapshot(files);
  setSharePointPublishingState("ready", {
    directoryName:String(handle && handle.name || "publishing folder"),
    errorMessage:""
  });
}

async function chooseSharePointPublishingDirectory(){
  if(!sharePointPublishRun) return;
  if(typeof window.showDirectoryPicker !== "function"){
    setSharePointPublishingState("error", {
      errorMessage:"This version of Edge cannot monitor a publishing folder. Use Select downloaded package after downloading the ZIP."
    });
    return;
  }
  try{
    const handle = await window.showDirectoryPicker({
      id:"tso-sharepoint-publishing",
      startIn:"downloads",
      mode:"readwrite"
    });
    await rememberPublishingDirectoryHandle(handle);
    await preparePublishingDirectory(handle);
  }catch(err){
    if(err && err.name === "AbortError") return;
    setSharePointPublishingState("error", {
      errorMessage:`The publishing folder could not be opened: ${err && err.message ? err.message : err}`
    });
  }
}

async function allowSharePointPublishingDirectory(){
  if(!sharePointPublishRun || !sharePointPublishRun.directoryHandle) return;
  const handle = sharePointPublishRun.directoryHandle;
  try{
    const permission = typeof handle.requestPermission === "function"
      ? await handle.requestPermission({ mode:"readwrite" })
      : "granted";
    if(permission !== "granted"){
      setSharePointPublishingState("permission", {
        errorMessage:"Edge needs read and write access to this folder before publishing can continue."
      });
      return;
    }
    await preparePublishingDirectory(handle);
  }catch(err){
    setSharePointPublishingState("permission", {
      errorMessage:`Folder access was not granted: ${err && err.message ? err.message : err}`
    });
  }
}

function beginSharePointPackageDownload(){
  if(!sharePointPublishRun || !sharePointPublishRun.directoryHandle) return false;
  clearSharePointPublishingTimer();
  setSharePointPublishingState("waiting", {
    startedAt:Date.now(),
    errorMessage:""
  });
  pollForSharePointPackageDownload();
  return true;
}

async function pollForSharePointPackageDownload(){
  const run = sharePointPublishRun;
  if(!run || run.state !== "waiting") return;
  try{
    const files = await listPublishingPackageFiles(run.directoryHandle, run.target);
    const downloaded = findNewPublishingDownload(files, run.baseline);
    if(downloaded){
      await mergeAndSaveSharePointPackage(downloaded);
      return;
    }
  }catch(err){
    setSharePointPublishingState("error", {
      errorMessage:`The publishing folder could not be checked: ${err && err.message ? err.message : err}`
    });
    return;
  }

  if(Date.now() - run.startedAt >= SHAREPOINT_PUBLISHING_TIMEOUT_MS){
    setSharePointPublishingState("error", {
      errorMessage:"The downloaded package was not found. Confirm that Edge saved it in the selected publishing folder, or select the downloaded package manually."
    });
    return;
  }
  run.pollTimer = setTimeout(pollForSharePointPackageDownload, SHAREPOINT_PUBLISHING_POLL_MS);
}

async function mergeAndSaveSharePointPackage(downloaded){
  const run = sharePointPublishRun;
  if(!run || !downloaded || !downloaded.file) return;
  clearSharePointPublishingTimer();
  const preparedDataSnapshot = cloneDataObject(data);
  setSharePointPublishingState("merging", {
    downloadedFileName:downloaded.name,
    warnings:[]
  });

  try{
    const warnings = [];
    const merged = await mergeImportPackage({
      target: {
        files:[downloaded.file],
        value:"",
        remove(){}
      }
    }, {
      preservePreparedChanges:true,
      skipPreMergeSnapshot:true,
      skipDeletionReview:true,
      silent:true,
      onWarnings:blocks => warnings.push(...blocks)
    });
    if(!merged) throw new Error("The downloaded resource package could not be merged.");

    const outputHandle = run.directoryHandle && typeof run.directoryHandle.getFileHandle === "function"
      ? await run.directoryHandle.getFileHandle(run.target.packageFileName, { create:true })
      : null;
    const saveTarget = outputHandle
      ? {
          kind:"file-handle",
          handle:outputHandle,
          suggestedName:run.target.packageFileName
        }
      : {
          kind:"download",
          suggestedName:run.target.packageFileName
        };
    const saved = await saveCurrentResourcePackage(saveTarget, { showSuccessToast:false });
    if(!saved) throw new Error("Publishing was canceled before the merged package was saved.");

    if(outputHandle) lastOpenedResourcePackageHandle = outputHandle;
    setSharePointPublishingState("complete", {
      outputFileName:run.target.packageFileName,
      outputLocation:outputHandle
        ? String(run.directoryName || "publishing folder")
        : "your browser's Downloads folder",
      packageVersion:saved.packageVersion,
      resourceCount:saved.resourceCount,
      warnings
    });
  }catch(err){
    data = normalizePackageData(preparedDataSnapshot);
    persist();
    safeRender();
    setSharePointPublishingState("error", {
      errorMessage:`Publishing stopped before a package was saved: ${err && err.message ? err.message : err}`
    });
  }
}

async function chooseDownloadedPackageForPublishing(){
  if(!sharePointPublishRun || typeof window.showOpenFilePicker !== "function") return;
  try{
    const handles = await window.showOpenFilePicker({
      id:"tso-sharepoint-publishing-package",
      startIn:sharePointPublishRun.directoryHandle || "downloads",
      multiple:false
    });
    const handle = handles && handles[0];
    if(!handle) return;
    const file = await handle.getFile();
    await mergeAndSaveSharePointPackage({
      name:file.name,
      handle,
      file,
      lastModified:Number(file.lastModified || 0),
      size:Number(file.size || 0)
    });
  }catch(err){
    if(err && err.name === "AbortError") return;
    setSharePointPublishingState("error", {
      errorMessage:`The downloaded package could not be selected: ${err && err.message ? err.message : err}`
    });
  }
}

async function checkAgainForSharePointDownload(){
  if(!sharePointPublishRun) return;
  setSharePointPublishingState("waiting", {
    startedAt:Date.now(),
    errorMessage:""
  });
  await pollForSharePointPackageDownload();
}

function confirmSharePointPackageUploaded(){
  if(!sharePointPublishRun) return;
  localStorage.removeItem(PRE_MERGE_STORAGE_KEY);
  const undo = getUndoSnapshot();
  if(undo && /^approved deletion/i.test(String(undo.message || ""))){
    clearUndoSnapshot();
  }
  setSharePointPublishingState("uploaded");
  safeRenderAdmin();
}

function restartSharePointPublishing(){
  clearSharePointPublishingTimer();
  const target = getSharePointPublishingTarget();
  sharePointPublishRun = target ? {
    target,
    state:"loading",
    directoryHandle:null,
    directoryName:"",
    baseline:new Map(),
    pollTimer:null,
    startedAt:0,
    warnings:[],
    errorMessage:""
  } : null;
  renderSharePointPublishingModal();
  restoreSharePointPublishingDirectory();
}

async function restoreSharePointPublishingDirectory(){
  if(!sharePointPublishRun) return;
  const handle = await loadPublishingDirectoryHandle();
  if(!sharePointPublishRun) return;
  if(!handle){
    setSharePointPublishingState("setup");
    return;
  }
  sharePointPublishRun.directoryHandle = handle;
  sharePointPublishRun.directoryName = String(handle.name || "publishing folder");
  const permission = await queryPublishingDirectoryPermission(handle);
  if(permission !== "granted"){
    setSharePointPublishingState("permission");
    return;
  }
  await preparePublishingDirectory(handle);
}

function startSharePointPublishing(){
  const target = getSharePointPublishingTarget();
  if(!target){
    alert("SharePoint publishing is not configured for this TSO Resources file.");
    return;
  }
  if(!commitPendingEditsIfChanged()) return;
  if(getOutstandingDeletionReview()){
    alert("Review the tagged deletions before publishing to SharePoint.");
    showDeletionReview();
    return;
  }
  if(sharePointPublishRun){
    renderSharePointPublishingModal();
    return;
  }
  restartSharePointPublishing();
}

function sharePointPublishingBodyHTML(run){
  const target = run.target;
  const folderName = escapeHTML(run.directoryName || "publishing folder");
  const warningHTML = Array.isArray(run.warnings) && run.warnings.length
    ? `<div class="sharepoint-publish-warning"><strong>Review these package warnings:</strong>${run.warnings.map(message => `<p>${escapeHTML(message).replace(/\n/g, "<br>")}</p>`).join("")}</div>`
    : "";

  if(run.state === "loading"){
    return `<div class="sharepoint-publish-status" role="status">Preparing SharePoint publishing…</div>`;
  }
  if(run.state === "setup"){
    return `
      <p>Choose the folder where Edge saves downloaded files. TSO Resources will watch only this folder and save the merged package there.</p>
      <button class="button primary" type="button" onclick="chooseSharePointPublishingDirectory()">Choose publishing folder</button>
    `;
  }
  if(run.state === "permission"){
    return `
      <p>Edge needs read and write access to <strong>${folderName}</strong> before publishing can continue.</p>
      ${run.errorMessage ? `<p class="sharepoint-publish-error">${escapeHTML(run.errorMessage)}</p>` : ""}
      <button class="button primary" type="button" onclick="allowSharePointPublishingDirectory()">Allow publishing folder</button>
      <button class="button" type="button" onclick="chooseSharePointPublishingDirectory()">Choose a different folder</button>
    `;
  }
  if(run.state === "ready"){
    return `
      <p>Edge must save the current package in <strong>${folderName}</strong>.</p>
      <ol class="sharepoint-publish-steps">
        <li>Open the current SharePoint package.</li>
        <li>Click the <strong>Download</strong> arrow in SharePoint.</li>
        <li>Return here; merging and saving will continue automatically.</li>
      </ol>
      <a class="button primary" href="${escapeHTML(target.packageViewUrl)}" target="_blank" rel="noopener" onclick="beginSharePointPackageDownload()">Open current SharePoint package</a>
      <button class="button" type="button" onclick="chooseSharePointPublishingDirectory()">Change publishing folder</button>
    `;
  }
  if(run.state === "waiting"){
    return `
      <div class="sharepoint-publish-status" role="status"><span class="sharepoint-publish-spinner" aria-hidden="true"></span>Downloading the current resource package</div>
      <p>In SharePoint, click the Download arrow. TSO Resources is watching <strong>${folderName}</strong>.</p>
      <button class="button" type="button" onclick="chooseDownloadedPackageForPublishing()">Select downloaded package</button>
    `;
  }
  if(run.state === "merging"){
    return `
      <div class="sharepoint-publish-status" role="status"><span class="sharepoint-publish-spinner" aria-hidden="true"></span>Merging</div>
      <p>${escapeHTML(run.downloadedFileName || target.packageFileName)}</p>
    `;
  }
  if(run.state === "complete"){
    const outputLocation = escapeHTML(run.outputLocation || run.directoryName || "publishing folder");
    return `
      <div class="sharepoint-publish-status sharepoint-publish-success" role="status">Merge complete</div>
      <p><strong>${escapeHTML(run.outputFileName || target.packageFileName)}</strong> was saved in <strong>${outputLocation}</strong> as Resource Package ${escapeHTML(String(run.packageVersion))}.</p>
      ${warningHTML}
      <p>Upload that file to the Provo TSO library and choose <strong>Replace</strong> when SharePoint asks.</p>
      <a class="button primary" href="${escapeHTML(target.libraryUrl)}" target="_blank" rel="noopener">Upload to SharePoint</a>
      <button class="button" type="button" onclick="confirmSharePointPackageUploaded()">I replaced the SharePoint file</button>
    `;
  }
  if(run.state === "uploaded"){
    return `
      <div class="sharepoint-publish-status sharepoint-publish-success" role="status">Resource package uploaded</div>
      <p>The administrator confirmed that SharePoint replaced <strong>${escapeHTML(target.packageFileName)}</strong>.</p>
      <button class="button" type="button" onclick="restartSharePointPublishing()">Publish again</button>
    `;
  }
  return `
    <p class="sharepoint-publish-error">${escapeHTML(run.errorMessage || "Publishing could not continue.")}</p>
    <button class="button primary" type="button" onclick="checkAgainForSharePointDownload()">Check publishing folder again</button>
    <button class="button" type="button" onclick="chooseDownloadedPackageForPublishing()">Select downloaded package</button>
    <button class="button" type="button" onclick="chooseSharePointPublishingDirectory()">Change publishing folder</button>
  `;
}

function renderSharePointPublishingModal(){
  if(!sharePointPublishRun) return;
  const modal = getReferenceModal();
  modal.className = "reference-modal sharepoint-publish-modal";
  modal.innerHTML = `
    <div class="reference-modal-panel" role="dialog" aria-modal="true" aria-labelledby="sharePointPublishTitle">
      <div class="reference-modal-header">
        <div>
          <div id="sharePointPublishTitle" class="reference-modal-title">Publish to SharePoint</div>
          <div class="reference-modal-subtitle">${escapeHTML(sharePointPublishRun.target.officeName)} TSO</div>
        </div>
        <button class="button reference-modal-close" type="button">Close</button>
      </div>
      <div class="reference-modal-body sharepoint-publish-body">
        ${sharePointPublishingBodyHTML(sharePointPublishRun)}
      </div>
    </div>
  `;
  const closeBtn = modal.querySelector(".reference-modal-close");
  if(closeBtn) closeBtn.addEventListener("click", closeReferenceModal);
  modal.classList.remove("hidden");
}
