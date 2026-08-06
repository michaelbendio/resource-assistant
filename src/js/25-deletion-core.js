// ============================================================
// DELETION RECORDS AND TOMBSTONES
// ============================================================
// These package-level helpers load before the resource-package pipeline. The
// Admin request/review UI remains in 95-deletion-workflow.js.

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
