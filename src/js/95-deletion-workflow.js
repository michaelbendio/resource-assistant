// ============================================================
// DELETION REQUESTS AND MERGE REVIEW
// ============================================================
// A Delete action creates a request; it does not remove live data. An admin can
// review requests immediately after a package merge, print their consequences,
// and approve selected requests. Approved requests become compact tombstones so
// an older resource package cannot recreate deleted records later.

const DELETION_KINDS = new Set(["resource", "category", "type", "forGroup"]);

function deletionLabelKey(value){
  return String(value || "").trim().toLowerCase();
}

function buildDeletionKey(kind, targetId, categoryId, label){
  const cleanKind = String(kind || "");
  if(cleanKind === "resource" || cleanKind === "category"){
    const id = String(targetId || "").trim();
    return id ? `${cleanKind}:${id}` : "";
  }
  if(cleanKind === "type"){
    const catId = String(categoryId || "").trim();
    const labelKey = deletionLabelKey(label);
    return catId && labelKey ? `type:${catId}:${labelKey}` : "";
  }
  if(cleanKind === "forGroup"){
    const labelKey = deletionLabelKey(label);
    return labelKey ? `forGroup:${labelKey}` : "";
  }
  return "";
}

function normalizeDeletionRecord(record, timeField = "requestedAt"){
  if(!record || typeof record !== "object") return null;
  const kind = String(record.kind || "");
  if(!DELETION_KINDS.has(kind)) return null;
  const targetId = String(record.targetId || "").trim();
  const categoryId = String(record.categoryId || "").trim();
  const label = String(record.label || "").trim();
  const key = buildDeletionKey(kind, targetId, categoryId, label);
  if(!key) return null;
  const timestamp = Date.parse(String(record[timeField] || ""))
    ? String(record[timeField])
    : nowISO();
  const normalized = { key, kind, label, [timeField]:timestamp };
  if(targetId) normalized.targetId = targetId;
  if(categoryId) normalized.categoryId = categoryId;
  const description = String(record.description || "").trim();
  if(description) normalized.description = description;
  return normalized;
}

function mergeDeletionRecords(first, second, timeField = "requestedAt"){
  const byKey = new Map();
  [first, second].forEach(list => {
    (Array.isArray(list) ? list : []).forEach(record => {
      const normalized = normalizeDeletionRecord(record, timeField);
      if(!normalized) return;
      const current = byKey.get(normalized.key);
      const currentTime = current ? Date.parse(current[timeField]) : -1;
      const nextTime = Date.parse(normalized[timeField]);
      if(!current || nextTime >= currentTime) byKey.set(normalized.key, normalized);
    });
  });
  return Array.from(byKey.values());
}

function normalizeDeletionWorkflowData(packageData){
  if(!packageData || typeof packageData !== "object") return;
  packageData.deletions = mergeDeletionRecords([], packageData.deletions, "deletedAt");
  const deletedKeys = new Set(packageData.deletions.map(record => record.key));
  packageData.deletionRequests = mergeDeletionRecords([], packageData.deletionRequests, "requestedAt")
    .filter(record => !deletedKeys.has(record.key));
}

function markDeletionAffectedRecord(record, timestamp){
  if(!record || typeof record !== "object") return;
  const previous = Date.parse(String(record.lastModified || ""));
  const next = Date.parse(String(timestamp || ""));
  if(!Number.isFinite(previous) || (Number.isFinite(next) && next > previous)){
    record.lastModified = timestamp;
  }
}

function applyDeletionTombstones(packageData, records = null){
  if(!packageData || typeof packageData !== "object") return packageData;
  if(!Array.isArray(packageData.categories)) packageData.categories = [];
  if(!Array.isArray(packageData.resources)) packageData.resources = [];
  if(!Array.isArray(packageData.forGroups)) packageData.forGroups = [];
  const tombstones = mergeDeletionRecords([], records == null ? packageData.deletions : records, "deletedAt");

  tombstones.forEach(tombstone => {
    const modifiedAt = tombstone.deletedAt;
    if(tombstone.kind === "resource"){
      packageData.resources = packageData.resources.filter(resource =>
        String(resource && resource.id || "") !== tombstone.targetId
      );
      return;
    }

    if(tombstone.kind === "category"){
      packageData.categories = packageData.categories.filter(category =>
        String(category && category.id || "") !== tombstone.targetId
      );
      packageData.resources.forEach(resource => {
        const categories = Array.isArray(resource && resource.categories) ? resource.categories : [];
        const hadCategory = categories.some(id => String(id) === tombstone.targetId);
        const hadFilters = !!(resource && resource.categoryFilters
          && Object.prototype.hasOwnProperty.call(resource.categoryFilters, tombstone.targetId));
        if(!hadCategory && !hadFilters) return;
        resource.categories = categories.filter(id => String(id) !== tombstone.targetId);
        if(resource.categoryFilters && typeof resource.categoryFilters === "object"){
          delete resource.categoryFilters[tombstone.targetId];
        }
        markDeletionAffectedRecord(resource, modifiedAt);
      });
      return;
    }

    if(tombstone.kind === "type"){
      const typeKey = deletionLabelKey(tombstone.label);
      const category = packageData.categories.find(item =>
        String(item && item.id || "") === tombstone.categoryId
      );
      if(category){
        category.filters = normalizeCategoryFilters(category.filters)
          .filter(filter => deletionLabelKey(filter) !== typeKey);
        markDeletionAffectedRecord(category, modifiedAt);
      }
      packageData.resources.forEach(resource => {
        if(!resource || !resource.categoryFilters || typeof resource.categoryFilters !== "object") return;
        const current = normalizeCategoryFilters(resource.categoryFilters[tombstone.categoryId]);
        const next = current.filter(filter => deletionLabelKey(filter) !== typeKey);
        if(next.length === current.length) return;
        resource.categoryFilters[tombstone.categoryId] = next;
        markDeletionAffectedRecord(resource, modifiedAt);
      });
      return;
    }

    if(tombstone.kind === "forGroup"){
      const groupKey = deletionLabelKey(tombstone.label);
      packageData.forGroups = normalizeTaxonomyLabels(packageData.forGroups)
        .filter(group => deletionLabelKey(group) !== groupKey);
      packageData.resources.forEach(resource => {
        const current = normalizeTaxonomyLabels(resource && resource.forGroups);
        const next = current.filter(group => deletionLabelKey(group) !== groupKey);
        if(next.length === current.length) return;
        resource.forGroups = next;
        markDeletionAffectedRecord(resource, modifiedAt);
      });
    }
  });
  return packageData;
}

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

function savePreMergeSnapshot(fileName){
  try{
    localStorage.setItem(PRE_MERGE_STORAGE_KEY, JSON.stringify({
      dataSnapshot:cloneDataObject(data),
      fileName:String(fileName || "resource package"),
      savedAt:nowISO()
    }));
    return true;
  }catch(_err){
    alert("The merge cannot begin because the pre-merge restore point could not be saved. Free browser storage and try again.");
    return false;
  }
}

function getPreMergeSnapshot(){
  try{
    const parsed = JSON.parse(localStorage.getItem(PRE_MERGE_STORAGE_KEY) || "null");
    return parsed && parsed.dataSnapshot && typeof parsed.dataSnapshot === "object" ? parsed : null;
  }catch(_err){
    return null;
  }
}

function restorePreMergeState(){
  const snapshot = getPreMergeSnapshot();
  if(!snapshot) return;
  if(!confirm(`Return to the state before merging ${snapshot.fileName}?\n\nEdits made after that merge will also be discarded.`)) return;
  data = normalizePackageData(cloneDataObject(snapshot.dataSnapshot));
  localStorage.removeItem(PRE_MERGE_STORAGE_KEY);
  localStorage.removeItem(DELETION_REVIEW_STORAGE_KEY);
  clearUndoSnapshot();
  sanitizePrintSelection();
  persist();
  closeDeletionReview();
  showToast("Returned to the pre-merge state.");
  safeRender();
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
