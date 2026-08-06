// ============================================================
// DELETION REQUESTS AND MERGE REVIEW
// ============================================================
// A Delete action creates a request; it does not remove live data. An admin can
// review requests immediately after a package merge, print their consequences,
// and approve selected requests. Approved requests become compact tombstones so
// an older resource package cannot recreate deleted records later.

function createDeletionRequest(kind, options = {}){
  return normalizeDeletionRecord({
    kind,
    targetId:options.targetId,
    categoryId:options.categoryId,
    label:options.label,
    description:options.description,
    requestedAt:options.requestedAt || nowISO()
  }, "requestedAt");
}

function hasDeletionRequest(kind, options = {}){
  const key = buildDeletionKey(kind, options.targetId, options.categoryId, options.label);
  return !!key && (Array.isArray(data.deletionRequests) ? data.deletionRequests : [])
    .some(request => request && request.key === key);
}

function tagDeletionRequests(requests, undoMessage){
  const normalized = mergeDeletionRecords([], requests, "requestedAt");
  if(!normalized.length) return false;
  const existingKeys = new Set((Array.isArray(data.deletionRequests) ? data.deletionRequests : []).map(item => item.key));
  const additions = normalized.filter(item => !existingKeys.has(item.key));
  if(!additions.length){
    showToast("Already tagged for deletion.");
    return false;
  }
  setUndoSnapshot(undoMessage || "deletion tag");
  data.deletionRequests = mergeDeletionRecords(data.deletionRequests, additions, "requestedAt");
  normalizeDeletionWorkflowData(data);
  persist();
  showToast(additions.length === 1 ? "Tagged for deletion." : `${additions.length} items tagged for deletion.`);
  safeRender();
  return true;
}

function getDeletionImpact(request, sourceData = data){
  const resources = Array.isArray(sourceData && sourceData.resources) ? sourceData.resources : [];
  const categories = Array.isArray(sourceData && sourceData.categories) ? sourceData.categories : [];
  let targetName = String(request && request.label || "").trim() || "(Unnamed)";
  let affected = [];
  if(request.kind === "resource"){
    const resource = resources.find(item => String(item && item.id || "") === request.targetId);
    if(resource) targetName = resource.name || targetName;
    affected = resource ? [resource] : [];
  }else if(request.kind === "category"){
    const category = categories.find(item => String(item && item.id || "") === request.targetId);
    if(category) targetName = category.label || targetName;
    affected = resources.filter(resource =>
      (Array.isArray(resource && resource.categories) && resource.categories.some(id => String(id) === request.targetId))
      || !!(resource && resource.categoryFilters && Object.prototype.hasOwnProperty.call(resource.categoryFilters, request.targetId))
    );
  }else if(request.kind === "type"){
    affected = resources.filter(resource => {
      const values = resource && resource.categoryFilters && resource.categoryFilters[request.categoryId];
      return normalizeCategoryFilters(values).some(value => deletionLabelKey(value) === deletionLabelKey(request.label));
    });
  }else if(request.kind === "forGroup"){
    affected = resources.filter(resource =>
      normalizeTaxonomyLabels(resource && resource.forGroups)
        .some(group => deletionLabelKey(group) === deletionLabelKey(request.label))
    );
  }
  return {
    targetName,
    affectedResources:affected
      .slice()
      .sort((a,b) => String(a && a.name || "").localeCompare(String(b && b.name || ""), undefined, { sensitivity:"base" }))
  };
}

function getDeletionKindLabel(kind){
  return ({ resource:"Resource", category:"Category", type:"Type", forGroup:"For group" })[kind] || "Item";
}

const RECOVERY_POINT_SCHEMA_VERSION = 2;
const RECOVERY_POINT_LIMIT = 5;

function normalizeRecoveryPoint(point){
  if(!point || typeof point !== "object" || Array.isArray(point)) return null;
  if(!point.dataSnapshot || typeof point.dataSnapshot !== "object" || Array.isArray(point.dataSnapshot)) return null;
  const savedAt = Date.parse(String(point.savedAt || "")) ? String(point.savedAt) : nowISO();
  const fileName = String(point.fileName || "resource package").trim() || "resource package";
  return {
    id:String(point.id || stablePDFIdFromPath(`${savedAt}:${fileName}`, "recovery")),
    dataSnapshot:cloneDataObject(point.dataSnapshot),
    fileName,
    savedAt,
    packageVersion:normalizePackageVersionValue(
      point.packageVersion != null ? point.packageVersion : point.dataSnapshot.packageVersion
    )
  };
}

const AdminRecoveryStore = Object.freeze({
  load(){
    try{
      const parsed = JSON.parse(localStorage.getItem(PRE_MERGE_STORAGE_KEY) || "null");
      const points = parsed && Array.isArray(parsed.recoveryPoints)
        ? parsed.recoveryPoints
        : (parsed && parsed.dataSnapshot ? [parsed] : []);
      return points
        .map(normalizeRecoveryPoint)
        .filter(Boolean)
        .sort((a, b) => String(b.savedAt).localeCompare(String(a.savedAt)))
        .slice(0, RECOVERY_POINT_LIMIT);
    }catch(_err){
      return [];
    }
  },

  save(points){
    const normalized = (Array.isArray(points) ? points : [])
      .map(normalizeRecoveryPoint)
      .filter(Boolean)
      .sort((a, b) => String(b.savedAt).localeCompare(String(a.savedAt)))
      .slice(0, RECOVERY_POINT_LIMIT);
    let candidates = normalized.slice();
    let lastError = null;
    while(candidates.length){
      try{
        localStorage.setItem(PRE_MERGE_STORAGE_KEY, JSON.stringify({
          schemaVersion:RECOVERY_POINT_SCHEMA_VERSION,
          recoveryPoints:candidates
        }));
        return candidates;
      }catch(err){
        lastError = err;
        if(candidates.length <= 3) break;
        candidates = candidates.slice(0, -1);
      }
    }
    if(!normalized.length){
      localStorage.removeItem(PRE_MERGE_STORAGE_KEY);
      return [];
    }
    throw lastError || new Error("Recovery points could not be saved.");
  },

  add(fileName, snapshot = data){
    const savedAt = nowISO();
    const point = normalizeRecoveryPoint({
      id:`recovery:${savedAt}:${Math.random().toString(16).slice(2, 10)}`,
      dataSnapshot:snapshot,
      fileName,
      savedAt,
      packageVersion:snapshot && snapshot.packageVersion
    });
    const existing = this.load().filter(item => item.id !== point.id);
    return this.save([point, ...existing])[0];
  },

  find(recoveryId){
    const id = String(recoveryId || "");
    return this.load().find(point => point.id === id) || null;
  }
});

function savePreMergeSnapshot(fileName){
  try{
    AdminRecoveryStore.add(String(fileName || "resource package"));
    return true;
  }catch(_err){
    alert("The merge cannot begin because at least three recovery points could not be retained. Free browser storage and try again.");
    return false;
  }
}

function getRecoveryPoints(){
  return AdminRecoveryStore.load();
}

function getPreMergeSnapshot(){
  return getRecoveryPoints()[0] || null;
}

function recoveryPointLabel(point){
  return `${formatLocalDateTime(point && point.savedAt)} · Resource Package ${String(point && point.packageVersion)} · ${String(point && point.fileName || "resource package")}`;
}

function restoreRecoveryPoint(recoveryId){
  const snapshot = AdminRecoveryStore.find(recoveryId);
  if(!snapshot) return;
  if(!confirm(
    `Restore this recovery point?\n\n${recoveryPointLabel(snapshot)}\n\n` +
    "Current edits made after this point will be discarded. The recovery history itself will be retained."
  )) return;
  let restoredData;
  try{
    restoredData = processResourcePackageData(cloneDataObject(snapshot.dataSnapshot), {
      sourceName:`Recovery point for ${snapshot.fileName}`
    }).data;
  }catch(err){
    alert(`This recovery point could not be restored safely:\n\n${formatResourcePackageError(err)}`);
    return;
  }
  data = restoredData;
  localStorage.removeItem(DELETION_REVIEW_STORAGE_KEY);
  clearUndoSnapshot();
  sanitizePrintSelection();
  persist();
  closeDeletionReview();
  closeReferenceModal();
  showToast("Recovery point restored.");
  safeRender();
}

function restorePreMergeState(){
  const latest = getPreMergeSnapshot();
  if(latest) restoreRecoveryPoint(latest.id);
}

function showRecoveryPoints(){
  const points = getRecoveryPoints();
  if(!points.length){
    showToast("There are no recovery points yet.");
    return;
  }
  const modal = getReferenceModal();
  modal.innerHTML = `
    <div class="reference-modal-panel recovery-points-panel" role="dialog" aria-modal="true" aria-labelledby="recoveryPointsTitle">
      <div class="reference-modal-header">
        <div>
          <div id="recoveryPointsTitle" class="reference-modal-title">Pre-merge recovery points</div>
          <div class="reference-modal-subtitle">Newest first · up to ${RECOVERY_POINT_LIMIT} retained</div>
        </div>
        <button class="button reference-modal-close" type="button">Close</button>
      </div>
      <div class="reference-modal-body">
        <p>Restoring replaces current resource data. Review the package version, source filename, and saved time before continuing.</p>
        <div class="recovery-points-list">
          ${points.map(point => `
            <div class="recovery-point-entry">
              <div>
                <strong>Resource Package ${escapeHTML(String(point.packageVersion))}</strong>
                <span>${escapeHTML(point.fileName)}</span>
                <span>${escapeHTML(formatLocalDateTime(point.savedAt))}</span>
              </div>
              <button class="button" type="button" onclick="restoreRecoveryPoint('${escapeHTML(point.id)}')">Restore</button>
            </div>
          `).join("")}
        </div>
      </div>
    </div>
  `;
  const closeBtn = modal.querySelector(".reference-modal-close");
  if(closeBtn) closeBtn.addEventListener("click", closeReferenceModal);
  modal.classList.remove("hidden");
}

function saveDeletionReview(fileName, packageVersion, incomingRequests){
  const requests = mergeDeletionRecords([], incomingRequests, "requestedAt");
  if(!requests.length){
    localStorage.removeItem(DELETION_REVIEW_STORAGE_KEY);
    return null;
  }
  const review = {
    fileName:String(fileName || "resource package"),
    packageVersion:normalizePackageVersionValue(packageVersion),
    mergedAt:nowISO(),
    requests
  };
  localStorage.setItem(DELETION_REVIEW_STORAGE_KEY, JSON.stringify(review));
  return review;
}

function getDeletionReview(){
  try{
    const parsed = JSON.parse(localStorage.getItem(DELETION_REVIEW_STORAGE_KEY) || "null");
    if(!parsed || typeof parsed !== "object") return null;
    parsed.requests = mergeDeletionRecords([], parsed.requests, "requestedAt");
    return parsed;
  }catch(_err){
    return null;
  }
}

function getOutstandingDeletionReview(){
  const review = getDeletionReview();
  if(!review) return null;
  const pendingKeys = new Set((Array.isArray(data.deletionRequests) ? data.deletionRequests : []).map(item => item.key));
  review.requests = review.requests.filter(request => pendingKeys.has(request.key));
  return review.requests.length ? review : null;
}

function closeDeletionReview(){
  const modal = document.getElementById("deletionReviewModal");
  if(modal) modal.remove();
}

function deletionImpactHTML(request){
  const impact = getDeletionImpact(request);
  const names = impact.affectedResources.map(resource => resource.name || "(Unnamed resource)");
  const consequence = request.kind === "resource"
    ? "The resource itself will be removed."
    : names.length
      ? `Affects ${names.length} ${names.length === 1 ? "resource" : "resources"}: ${names.join(", ")}`
      : "No resources are currently affected.";
  return `
    <div class="deletion-review-target"><strong>${escapeHTML(getDeletionKindLabel(request.kind))}:</strong> ${escapeHTML(impact.targetName)}</div>
    <div class="admin-note">${escapeHTML(consequence)}</div>
    ${request.description ? `<div class="admin-note"><strong>Submitted note:</strong> ${escapeHTML(request.description)}</div>` : ""}
  `;
}

function showDeletionReview(){
  closeDeletionReview();
  const review = getOutstandingDeletionReview();
  if(!review){
    showToast("There are no tagged deletions to review.");
    safeRenderAdmin();
    return;
  }
  const modal = document.createElement("div");
  modal.id = "deletionReviewModal";
  modal.className = "reference-modal";
  modal.innerHTML = `
    <div class="reference-modal-panel deletion-review-panel" role="dialog" aria-modal="true" aria-labelledby="deletionReviewTitle">
      <div class="reference-modal-header">
        <div>
          <div id="deletionReviewTitle" class="reference-modal-title">Review tagged deletions</div>
          <div class="reference-modal-subtitle">${escapeHTML(review.fileName)} · Resource Package ${escapeHTML(String(review.packageVersion))}</div>
        </div>
        <button class="button" type="button" id="deletionReviewCloseBtn">Close</button>
      </div>
      <div class="reference-modal-body">
        <p>Review the consequences, then approve the deletions you want applied. Unchecked items will be kept.</p>
        <div class="deletion-review-list">
          ${review.requests.map(request => `
            <label class="deletion-review-item">
              <input type="checkbox" class="deletion-review-checkbox" data-deletion-key="${escapeHTML(request.key)}" checked>
              <span>${deletionImpactHTML(request)}</span>
            </label>
          `).join("")}
        </div>
        <div class="admin-action-row deletion-review-actions">
          <button class="button" type="button" id="deletionReviewPrintBtn">Print proposed deletions</button>
          <span class="spacer"></span>
          <button class="button primary" type="button" id="deletionReviewApproveBtn">Approve selected deletions</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  document.getElementById("deletionReviewCloseBtn").onclick = closeDeletionReview;
  document.getElementById("deletionReviewPrintBtn").onclick = printProposedDeletions;
  document.getElementById("deletionReviewApproveBtn").onclick = approveSelectedDeletions;
  modal.addEventListener("click", event => {
    if(event.target === modal) closeDeletionReview();
  });
}

function approveSelectedDeletions(){
  const review = getOutstandingDeletionReview();
  if(!review) return;
  const selectedKeys = new Set(Array.from(document.querySelectorAll(".deletion-review-checkbox:checked"))
    .map(input => input.dataset.deletionKey));
  const approved = review.requests.filter(request => selectedKeys.has(request.key));
  const reviewedKeys = new Set(review.requests.map(request => request.key));
  setUndoSnapshot(approved.length === 1 ? "approved deletion" : "approved deletions");
  data.deletionRequests = (Array.isArray(data.deletionRequests) ? data.deletionRequests : [])
    .filter(request => !reviewedKeys.has(request.key));
  const approvedAt = nowISO();
  const tombstones = approved.map(request => normalizeDeletionRecord({
    ...request,
    deletedAt:approvedAt
  }, "deletedAt")).filter(Boolean);
  data.deletions = mergeDeletionRecords(data.deletions, tombstones, "deletedAt");
  tombstones.forEach(tombstone => {
    const impact = getDeletionImpact(tombstone);
    if(tombstone.kind === "resource"){
      addChangeEntry(createChangeEntry("resource", "removed", tombstone.targetId, impact.targetName, "Approved tagged deletion."));
    }else if(tombstone.kind === "category"){
      addChangeEntry(createChangeEntry("category", "removed", tombstone.targetId, impact.targetName, "Approved tagged deletion."));
    }
  });
  applyDeletionTombstones(data, tombstones);
  normalizeDeletionWorkflowData(data);
  sanitizePrintSelection();
  persist();
  closeDeletionReview();
  showToast(approved.length
    ? `${approved.length} ${approved.length === 1 ? "deletion" : "deletions"} approved.`
    : "All proposed deletions were kept.");
  safeRender();
}

function printProposedDeletions(){
  const review = getOutstandingDeletionReview();
  if(!review) return;
  PrintWorkflow.queue = [];
  PrintWorkflow.currentIndex = -1;
  PrintWorkflow.openPreviewContent(container => {
    const heading = document.createElement("section");
    heading.className = "deletion-report";
    heading.innerHTML = `
      <h1>Proposed Deletions</h1>
      <p><strong>Submitted package:</strong> ${escapeHTML(review.fileName)}</p>
      <p><strong>Resource Package:</strong> ${escapeHTML(String(review.packageVersion))}</p>
      <p><strong>Printed:</strong> ${escapeHTML(new Date().toLocaleString())}</p>
    `;
    review.requests.forEach((request, index) => {
      const impact = getDeletionImpact(request);
      const section = document.createElement("section");
      section.className = "deletion-report-item";
      const affectedNames = impact.affectedResources.map(resource => resource.name || "(Unnamed resource)");
      section.innerHTML = `
        <h2>${index + 1}. ${escapeHTML(getDeletionKindLabel(request.kind))}: ${escapeHTML(impact.targetName)}</h2>
        <p><strong>Affected resources:</strong> ${affectedNames.length ? escapeHTML(affectedNames.join(", ")) : "None"}</p>
        ${request.description ? `<p><strong>Submitted note:</strong> ${escapeHTML(request.description)}</p>` : ""}
        <p class="deletion-report-decision">☐ Approve &nbsp;&nbsp;&nbsp; ☐ Keep</p>
        <p class="deletion-report-notes"><strong>Notes:</strong></p>
      `;
      heading.appendChild(section);
    });
    container.appendChild(heading);
  });
}
