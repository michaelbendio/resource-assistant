// ============================================================
// PERSISTENCE
// ============================================================
// Storage split:
// - localStorage keeps the primary JSON snapshot.
// - IndexedDB keeps binary assets (PDF blobs) under namespaced string keys.
// - localStorage also keeps small UI state such as print selection, undo, and
//   seen update ids under separate keys.
// - Save Resource Package exports a ZIP with canonical JSON plus attached PDFs.
// - Merge Resources imports a package ZIP and resolves conflicts by
//   lastModified timestamps where possible.

let lastOpenedResourcePackageHandle = null;

function persist(){
  // Writes the canonical JSON snapshot used to restore app state on reload.
  if(DEBUG) assertInvariants("persist");
  data.appVersion = APP_VERSION;
  data.lastModified = nowISO();
  localStorage.setItem(DATA_STORAGE_KEY, JSON.stringify(data));
}

function openAssetsDB(){
  return new Promise((resolve, reject) => {
    if(typeof indexedDB === "undefined"){
      reject(new Error("Asset storage is unavailable in this browser."));
      return;
    }

    let settled = false;
    const timeoutId = setTimeout(() => {
      if(settled) return;
      settled = true;
      reject(new Error("Asset storage is unavailable right now. Reload the app and try again."));
    }, 4000);

    function finish(fn){
      return value => {
        if(settled) return;
        settled = true;
        clearTimeout(timeoutId);
        fn(value);
      };
    }

    let req;
    try{
      req = indexedDB.open(`${STORAGE_KEY_PREFIX}Assets`, 1);
    }catch(err){
      clearTimeout(timeoutId);
      reject(err);
      return;
    }

    req.onupgradeneeded = e => {
      const db = e.target.result;
      if(!db.objectStoreNames.contains("files")){
        db.createObjectStore("files");
      }
    };

    req.onsuccess = finish(() => resolve(req.result));
    req.onerror = finish(() => reject(req.error || new Error("Asset storage is unavailable in this browser.")));
    req.onblocked = finish(() => reject(new Error("Asset storage is blocked. Close other tabs and try again.")));
  });
}

async function saveAsset(key, blob){
  const db = await openAssetsDB();
  const tx = db.transaction("files", "readwrite");
  tx.objectStore("files").put(blob, key);

  return new Promise((resolve, reject) => {
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
    tx.onabort = () => {
      db.close();
      reject(tx.error);
    };
  });
}

async function loadAsset(key){
  const db = await openAssetsDB();
  const tx = db.transaction("files", "readonly");
  const req = tx.objectStore("files").get(key);

  return new Promise((resolve, reject) => {
    req.onsuccess = () => {
      db.close();
      resolve(req.result);
    };
    req.onerror = () => {
      db.close();
      reject(req.error);
    };
  });
}

function ensurePDFBlob(value){
  if(value instanceof Blob){
    return value.type === "application/pdf"
      ? value
      : new Blob([value], { type: "application/pdf" });
  }
  return new Blob([value], { type: "application/pdf" });
}

async function savePDF(key, blob){
  return saveAsset(key, ensurePDFBlob(blob));
}

async function getPDF(key){
  return loadAsset(key);
}

async function deleteAsset(key){
  const db = await openAssetsDB();
  const tx = db.transaction("files", "readwrite");
  tx.objectStore("files").delete(key);

  return new Promise((resolve, reject) => {
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
    tx.onabort = () => {
      db.close();
      reject(tx.error);
    };
  });
}

async function deletePDF(key){
  return deleteAsset(key);
}

async function openPDF(path){
  const pdfWindow = window.open("", "_blank");
  if(!pdfWindow){
    alert("Unable to open PDF window. Allow pop-ups and try again.");
    return;
  }
  pdfWindow.document.title = "Loading PDF...";
  pdfWindow.document.body.textContent = "Loading PDF...";
  try{
    const stored = await getPDF(path);
    if(!stored){
      pdfWindow.close();
      alert("PDF not found.");
      return;
    }
    const pdfBlob = ensurePDFBlob(stored);
    const url = URL.createObjectURL(pdfBlob);
    pdfWindow.location = url;
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }catch(err){
    pdfWindow.close();
    alert("Unable to open PDF: " + err.message);
  }
}

function cloneDataObject(value){
  return JSON.parse(JSON.stringify(value || {}));
}

function getValidTimestamp(value){
  const timestamp = Date.parse(String(value || ""));
  return Number.isFinite(timestamp) ? timestamp : null;
}

function objectsDiffer(a, b){
  return JSON.stringify(a || {}) !== JSON.stringify(b || {});
}

function getSeenUpdateIds(){
  try{
    const parsed = JSON.parse(localStorage.getItem(UPDATE_SEEN_STORAGE_KEY) || "[]");
    return new Set(Array.isArray(parsed) ? parsed.map(String) : []);
  }catch(_err){
    return new Set();
  }
}

function saveSeenUpdateIds(seenSet){
  localStorage.setItem(UPDATE_SEEN_STORAGE_KEY, JSON.stringify(Array.from(seenSet)));
}

function normalizeChanges(packageData){
  if(!packageData || typeof packageData !== "object") return;
  const source = Array.isArray(packageData.changes) ? packageData.changes : [];
  const normalized = [];
  const seen = new Set();
  source.forEach((entry, index) => {
    if(!entry || typeof entry !== "object") return;
    const description = String(entry.description || "").trim();
    const type = entry.type === "category" ? "category" : "resource";
    const action = ["added", "updated", "removed"].includes(entry.action) ? entry.action : "updated";
    const timestamp = Date.parse(String(entry.timestamp || "")) ? String(entry.timestamp) : nowISO();
    const id = String(entry.id || `${type}:${entry.targetId || index}:${timestamp}`).trim();
    if(!id || seen.has(id)) return;
    seen.add(id);
    normalized.push({
      id,
      type,
      action,
      targetId: String(entry.targetId || ""),
      targetName: String(entry.targetName || "(Unnamed)").trim() || "(Unnamed)",
      description,
      timestamp,
      categoryIds: Array.isArray(entry.categoryIds) ? entry.categoryIds.map(String) : []
    });
  });
  packageData.changes = normalized;
}

function normalizePackageVersionValue(value){
  if(typeof value === "number" && Number.isFinite(value)) return value;
  if(typeof value === "string" && value.trim()){
    const asNumber = Number(value.trim());
    if(Number.isFinite(asNumber)) return asNumber;
  }
  return "Unknown";
}

function getNextPackageVersionValue(value){
  const normalized = normalizePackageVersionValue(value);
  if(typeof normalized === "number" && Number.isFinite(normalized)){
    return Math.max(1, Math.floor(normalized) + 1);
  }
  return 1;
}

function getLatestPackageVersionValue(...values){
  const numericVersions = values
    .map(normalizePackageVersionValue)
    .filter(value => typeof value === "number" && Number.isFinite(value));
  return numericVersions.length ? Math.max(...numericVersions) : "Unknown";
}

function normalizeLastLoadedPackageInfo(packageData){
  if(!packageData || typeof packageData !== "object") return;
  const source = packageData.lastLoadedPackageInfo;
  if(!source || typeof source !== "object"){
    packageData.lastLoadedPackageInfo = null;
    return;
  }
  const changes = Array.isArray(source.changes)
    ? source.changes
      .map(entry => String(entry || "").trim())
      .filter(Boolean)
    : [];
  packageData.lastLoadedPackageInfo = {
    sourcePackageVersion: normalizePackageVersionValue(
      source.sourcePackageVersion != null ? source.sourcePackageVersion : source.packageVersion
    ),
    loadedAt: Date.parse(String(source.loadedAt || "")) ? String(source.loadedAt) : nowISO(),
    changes
  };
}

function createChangeEntry(type, action, targetId, targetName, description, options = {}){
  const cleanDescription = String(description || "").trim();
  const timestamp = nowISO();
  return {
    id: `${type || "change"}:${targetId || "unknown"}:${timestamp}:${Math.random().toString(16).slice(2,8)}`,
    type: type === "category" ? "category" : "resource",
    action: ["added", "updated", "removed"].includes(action) ? action : "updated",
    targetId: String(targetId || ""),
    targetName: String(targetName || "(Unnamed)").trim() || "(Unnamed)",
    description: cleanDescription,
    timestamp,
    categoryIds: Array.isArray(options.categoryIds) ? options.categoryIds.map(String) : []
  };
}

function addChangeEntry(changeEntry){
  if(!changeEntry) return;
  normalizeChanges(data);
  data.changes.push(changeEntry);
}

function mergeChanges(localChanges, incomingChanges){
  const merged = [];
  const seen = new Set();
  [localChanges, incomingChanges].forEach(list => {
    (Array.isArray(list) ? list : []).forEach(entry => {
      const id = String(entry && entry.id || "");
      if(!id || seen.has(id)) return;
      seen.add(id);
      merged.push(cloneDataObject(entry));
    });
  });
  return merged;
}

function normalizeCategoryMigrations(packageData){
  if(!packageData || typeof packageData !== "object") return;
  const source = Array.isArray(packageData.categoryMigrations) ? packageData.categoryMigrations : [];
  const normalized = [];
  const indexByFromId = new Map();

  source.forEach(entry => {
    if(!entry || typeof entry !== "object") return;
    const fromId = String(entry.fromId || "").trim();
    const toId = String(entry.toId || "").trim();
    const toFilter = String(entry.toFilter || "").trim();
    if(!fromId || (toId && fromId === toId)) return;

    const migration = { fromId };
    if(toId) migration.toId = toId;
    if(toId && toFilter) migration.toFilter = toFilter;
    if(indexByFromId.has(fromId)){
      normalized[indexByFromId.get(fromId)] = migration;
    }else{
      indexByFromId.set(fromId, normalized.length);
      normalized.push(migration);
    }
  });

  packageData.categoryMigrations = normalized;
}

function mergeCategoryMigrations(localMigrations, incomingMigrations){
  const holder = {
    categoryMigrations: [
      ...(Array.isArray(localMigrations) ? localMigrations : []),
      ...(Array.isArray(incomingMigrations) ? incomingMigrations : [])
    ]
  };
  normalizeCategoryMigrations(holder);
  return holder.categoryMigrations;
}

function applyCategoryMigrations(packageData, migrations){
  if(!packageData || typeof packageData !== "object") return;
  if(!Array.isArray(packageData.categories)) packageData.categories = [];
  if(!Array.isArray(packageData.resources)) packageData.resources = [];
  const holder = { categoryMigrations:Array.isArray(migrations) ? migrations : [] };
  normalizeCategoryMigrations(holder);

  holder.categoryMigrations.forEach(migration => {
    const fromId = migration.fromId;
    const toId = migration.toId || "";
    packageData.categories = packageData.categories.filter(category => String(category && category.id || "") !== fromId);

    packageData.resources.forEach(resource => {
      if(!resource || typeof resource !== "object") return;
      const categories = Array.isArray(resource.categories) ? resource.categories.map(String) : [];
      const filterMap = resource.categoryFilters && typeof resource.categoryFilters === "object" && !Array.isArray(resource.categoryFilters)
        ? resource.categoryFilters
        : {};
      const oldFilters = normalizeCategoryFilters(filterMap[fromId]);
      const affected = categories.includes(fromId) || oldFilters.length > 0;
      if(!affected) return;

      const nextCategories = categories.filter(categoryId => categoryId !== fromId);
      if(toId) nextCategories.push(toId);
      resource.categories = normalizeTaxonomyLabels(nextCategories);
      delete filterMap[fromId];

      if(toId){
        const nextFilters = normalizeCategoryFilters([
          ...normalizeCategoryFilters(filterMap[toId]),
          ...oldFilters,
          ...(migration.toFilter ? [migration.toFilter] : [])
        ]);
        if(nextFilters.length) filterMap[toId] = nextFilters;
      }
      resource.categoryFilters = filterMap;
    });
  });
}

function getRecentChanges(){
  normalizeChanges(data);
  return data.changes.slice().sort((a,b)=>String(b.timestamp||"").localeCompare(String(a.timestamp||"")));
}

function markChangesViewed(changeIds){
  const seen = getSeenUpdateIds();
  (Array.isArray(changeIds) ? changeIds : []).forEach(id => {
    if(id) seen.add(String(id));
  });
  saveSeenUpdateIds(seen);
}

function getCategoryChangeSeenKey(changeId, categoryId){
  return `${String(changeId || "")}@category:${String(categoryId || "")}`;
}

function getChangesForResource(resourceId, { unseenOnly = false } = {}){
  const seen = getSeenUpdateIds();
  return getRecentChanges().filter(entry => {
    return entry.type === "resource" &&
      String(entry.targetId || "") === String(resourceId || "") &&
      (!unseenOnly || !seen.has(String(entry.id)));
  });
}

function getCategoryIdsForChange(entry){
  if(!entry) return [];
  if(Array.isArray(entry.categoryIds) && entry.categoryIds.length) return entry.categoryIds.slice();
  if(entry.type === "category") return entry.targetId ? [String(entry.targetId)] : [];
  const res = data.resources.find(r => String(r && r.id || "") === String(entry.targetId || ""));
  return Array.isArray(res && res.categories) ? res.categories.slice() : [];
}

function formatChangeEntryHTML(entry){
  const dateText = formatDateOnly(entry && entry.timestamp);
  const detail = `${entry && entry.type ? entry.type : ""} ${entry && entry.action ? entry.action : ""}`.trim();
  const description = String(entry && entry.description || "").trim();
  return `<strong>${escapeHTML(entry.targetName || "(Unnamed)")}</strong><div>${escapeHTML(dateText)}: ${escapeHTML(detail)}</div><div>${escapeHTML(description || "No description provided")}</div>`;
}

function editChangeDescription(changeId){
  normalizeChanges(data);
  const entry = data.changes.find(change => String(change.id) === String(changeId));
  if(!entry) return;
  const description = prompt("Describe this update (optional):", entry.description || "");
  if(description === null) return false;
  entry.description = String(description).trim();
  persist();
  return true;
}

function formatPackageChangeSummary(entry){
  const targetName = String(entry && entry.targetName || "(Unnamed)").trim() || "(Unnamed)";
  const description = String(entry && entry.description || "").trim();
  const fallback = `${entry && entry.type ? entry.type : ""} ${entry && entry.action ? entry.action : ""}`.trim();
  return `${targetName} - ${description || fallback || "updated"}`;
}

function buildPackageMergeSummary(summary){
  if(!summary || typeof summary !== "object") return [];
  const entries = [];
  [
    { names:summary.resourceNamesAdded, label:"Resource added" },
    { names:summary.resourceNamesUpdated, label:"Resource updated" },
    { names:summary.categoryNamesAdded, label:"Category added" },
    { names:summary.categoryNamesUpdated, label:"Category updated" }
  ].forEach(group => {
    (Array.isArray(group.names) ? group.names : []).forEach(name => {
      const cleanName = String(name || "").trim();
      if(cleanName) entries.push(`${cleanName} - ${group.label}`);
    });
  });
  return entries;
}

function chooseMergeObject(localItem, incomingItem){
  // Package merging is conservative: keep local data unless the incoming item is
  // clearly newer, and fall back to incoming data only when no timestamps can
  // establish a winner.
  if(!localItem && incomingItem) return { item:incomingItem, changed:true };
  if(localItem && !incomingItem) return { item:localItem, changed:false };

  const localTime = getValidTimestamp(localItem.lastModified);
  const incomingTime = getValidTimestamp(incomingItem.lastModified);
  const differs = objectsDiffer(localItem, incomingItem);

  if(localTime !== null && incomingTime !== null){
    return incomingTime > localTime
      ? { item:incomingItem, changed:differs }
      : { item:localItem, changed:false };
  }
  if(localTime === null && incomingTime !== null) return { item:incomingItem, changed:differs };
  if(localTime !== null && incomingTime === null) return { item:localItem, changed:false };
  return differs
    ? { item:incomingItem, changed:true }
    : { item:localItem, changed:false };
}

function mergeItemsById(localItems, incomingItems, options = {}){
  // Categories and resources both merge by stable id. The counters/names returned
  // here are only for user-facing "what changed" summaries after import.
  const localList = Array.isArray(localItems) ? localItems : [];
  const incomingList = Array.isArray(incomingItems) ? incomingItems : [];
  const incomingById = new Map(incomingList.map(item => [String(item && item.id || ""), item]).filter(([id]) => id));
  const seen = new Set();
  const merged = [];
  const addedIds = [];
  const updatedIds = [];
  const addedNames = [];
  const updatedNames = [];
  let added = 0;
  let updated = 0;

  localList.forEach(localItem => {
    const id = String(localItem && localItem.id || "");
    if(!id) return;
    const incomingItem = incomingById.get(id);
    const choice = chooseMergeObject(localItem, incomingItem);
    merged.push(cloneDataObject(choice.item));
    seen.add(id);
    if(incomingItem && choice.item === incomingItem && choice.changed){
      updated += 1;
      updatedIds.push(id);
      updatedNames.push(String(incomingItem.name || incomingItem.title || id));
    }
  });

  incomingList.forEach(incomingItem => {
    const id = String(incomingItem && incomingItem.id || "");
    if(!id || seen.has(id)) return;
    merged.push(cloneDataObject(incomingItem));
    seen.add(id);
    added += 1;
    addedIds.push(id);
    addedNames.push(String(incomingItem.name || incomingItem.title || id));
  });

  return { merged, added, updated, addedIds, updatedIds, addedNames, updatedNames };
}

function mergeIncomingResourcePDFs(mergedResources, incomingResources){
  const incomingById = new Map((Array.isArray(incomingResources) ? incomingResources : [])
    .map(resource => [String(resource && resource.id || ""), resource])
    .filter(([id]) => id));

  (Array.isArray(mergedResources) ? mergedResources : []).forEach(resource => {
    const incomingResource = incomingById.get(String(resource && resource.id || ""));
    if(!incomingResource) return;
    const attachments = [];
    const seenPaths = new Set();
    [resource, incomingResource].forEach(source => {
      getResourcePDFs(source).forEach(pdf => {
        const path = String(pdf && pdf.path || "").trim();
        if(!path || seenPaths.has(path)) return;
        seenPaths.add(path);
        attachments.push(cloneDataObject(pdf));
      });
    });
    resource.pdfs = attachments;
  });
}

function normalizePackageData(nextData){
  if(!nextData || typeof nextData !== "object") nextData = {};
  nextData.resourcePackageSchemaVersion = RESOURCE_PACKAGE_SCHEMA_VERSION;
  if(!Array.isArray(nextData.categories)) nextData.categories = [];
  if(!Array.isArray(nextData.resources)) nextData.resources = [];
  normalizeDataInformationShape(nextData);
  normalizeDataPDFShape(nextData);
  normalizeLegacyPackageShape(nextData);
  normalizeLegacyTagsShape(nextData);
  normalizeDataForGroupsShape(nextData);
  normalizeDataCategoryFilterShape(nextData);
  normalizeCategoryMigrations(nextData);
  normalizeDataVerifiedOnShape(nextData);
  normalizeChanges(nextData);
  nextData.packageVersion = normalizePackageVersionValue(nextData.packageVersion);
  normalizeLastLoadedPackageInfo(nextData);
  return nextData;
}

function removeUnusedUnnamedCategories(packageData){
  // Older app versions could persist a blank category as soon as Admin clicked
  // New. Remove only categories that have no resource/filter/migration target;
  // a referenced unnamed category remains invalid so data is never discarded.
  if(!packageData || typeof packageData !== "object" || !Array.isArray(packageData.categories)) return [];
  const resources = Array.isArray(packageData.resources) ? packageData.resources : [];
  const migrationTargets = new Set((Array.isArray(packageData.categoryMigrations) ? packageData.categoryMigrations : [])
    .map(migration => String(migration && migration.toId || ""))
    .filter(Boolean));
  const removableIds = new Set();

  packageData.categories.forEach(category => {
    const id = String(category && category.id || "");
    if(!id || String(category && category.label || "").trim()) return;
    const isReferenced = migrationTargets.has(id) || resources.some(resource => {
      const categories = Array.isArray(resource && resource.categories)
        ? resource.categories.map(String)
        : [];
      const categoryFilters = resource && resource.categoryFilters && typeof resource.categoryFilters === "object"
        ? resource.categoryFilters
        : {};
      return categories.includes(id) || Object.prototype.hasOwnProperty.call(categoryFilters, id);
    });
    if(!isReferenced) removableIds.add(id);
  });

  if(!removableIds.size) return [];
  packageData.categories = packageData.categories.filter(category =>
    !removableIds.has(String(category && category.id || ""))
  );
  if(Array.isArray(packageData.changes)){
    packageData.changes.forEach(entry => {
      if(!entry || !Array.isArray(entry.categoryIds)) return;
      entry.categoryIds = entry.categoryIds.filter(id => !removableIds.has(String(id)));
    });
  }
  return Array.from(removableIds);
}

function buildResourcePackageData(sourceData){
  // Resource packages are intentionally smaller than local app state. Do not add
  // UI-only fields such as lastLoadedPackageInfo, undo, or selected filters here.
  const source = normalizePackageData(cloneDataObject(sourceData || {}));
  removeUnusedUnnamedCategories(source);
  const referencedUnnamedCategory = source.categories.find(category =>
    !String(category && category.label || "").trim()
  );
  if(referencedUnnamedCategory){
    throw new Error(
      `Category '${String(referencedUnnamedCategory.id || "unknown")}' is missing a label. ` +
      "Name or delete it in Admin before saving the resource package."
    );
  }
  return {
    resourcePackageSchemaVersion: RESOURCE_PACKAGE_SCHEMA_VERSION,
    appVersion: APP_VERSION,
    appChanges: APP_CHANGE_LOG.map(change => ({ ...change })),
    packageVersion: source.packageVersion,
    lastModified: source.lastModified || nowISO(),
    categories: source.categories,
    categoryMigrations: source.categoryMigrations,
    forGroups: source.forGroups,
    resources: source.resources,
    changes: source.changes
  };
}

function collectLegacyPackageFieldErrors(packageData){
  // Legacy TSO packages are accepted and normalized during import. Keep this
  // hook for fields that cannot be translated safely in the future.
  const errors = [];
  if(!packageData || typeof packageData !== "object") return errors;
  return errors;
}

function mergeResourcePackages(localData, incomingData){
  // Merge into cloned normalized objects so a failed import cannot partially
  // mutate the user's current data.
  const local = normalizePackageData(cloneDataObject(localData));
  const incoming = normalizePackageData(cloneDataObject(incomingData));
  const categoryMigrations = mergeCategoryMigrations(local.categoryMigrations, incoming.categoryMigrations);
  applyCategoryMigrations(local, categoryMigrations);
  applyCategoryMigrations(incoming, categoryMigrations);
  const categoryMerge = mergeItemsById(local.categories, incoming.categories, { kind:"categories" });
  const resourceMerge = mergeItemsById(local.resources, incoming.resources, { kind:"resources" });
  // Resource text still follows the timestamp winner, but PDF attachments from
  // the incoming package are additive. This lets a package restore attachments
  // when the browser has an equal/newer copy of the resource with no PDF metadata.
  mergeIncomingResourcePDFs(resourceMerge.merged, incoming.resources);
  const mergedData = {
    ...local,
    ...incoming,
    packageVersion: getLatestPackageVersionValue(local.packageVersion, incoming.packageVersion),
    categories: categoryMerge.merged,
    categoryMigrations,
    resources: resourceMerge.merged,
    changes: mergeChanges(local.changes, incoming.changes),
    forGroups: normalizeTaxonomyLabels([...(local.forGroups || []), ...(incoming.forGroups || [])]),
    resourcePackageSchemaVersion: RESOURCE_PACKAGE_SCHEMA_VERSION
  };
  normalizePackageData(mergedData);
  return {
    mergedData,
    summary: {
      categoriesAdded: categoryMerge.added,
      categoriesUpdated: categoryMerge.updated,
      resourcesAdded: resourceMerge.added,
      resourcesUpdated: resourceMerge.updated,
      categoryIdsAdded: categoryMerge.addedIds,
      categoryIdsUpdated: categoryMerge.updatedIds,
      resourceIdsAdded: resourceMerge.addedIds,
      resourceIdsUpdated: resourceMerge.updatedIds,
      categoryNamesAdded: categoryMerge.addedNames,
      categoryNamesUpdated: categoryMerge.updatedNames,
      resourceNamesAdded: resourceMerge.addedNames,
      resourceNamesUpdated: resourceMerge.updatedNames
    }
  };
}

async function mergeZipAssets(zip, mergedData){
  const pdfKeys = collectPDFPathsFromResources(mergedData.resources);
  const missing = [];

  for(const key of pdfKeys){
    const entry = zip.file(key);
    if(entry && key.toLowerCase().endsWith(".pdf")){
      const blob = await entry.async("blob");
      await savePDF(key, blob);
    }else{
      let existing = null;
      try{
        existing = await getPDF(key);
      }catch(_err){}
      if(!existing) missing.push(key);
    }
  }
  return missing;
}

function applyMergedData(mergedData){
  normalizePackageData(mergedData);
  data = mergedData;
  persist();
  safeRender();
}

async function beginResourcePackageSave(){
  // Request a save target up front so browsers can honor the user gesture.
  const suggestedName = getResourcePackageZipFilename();
  if(typeof window.showSaveFilePicker === "function"){
    const handle = await window.showSaveFilePicker({
      id: "tso-resources",
      startIn: lastOpenedResourcePackageHandle || "downloads",
      suggestedName,
      types: [{
        description: "TSO resource package",
        accept: {
          "application/zip": [".zip"]
        }
      }]
    });
    return { kind:"file-handle", handle, suggestedName };
  }
  return { kind:"download", suggestedName };
}

function downloadResourcePackageBlob(fileName, blob){
  const cleanFileName = fileName || getResourcePackageZipFilename();
  const downloadBlob = blob.type === "application/octet-stream"
    ? blob
    : new Blob([blob], { type:"application/octet-stream" });
  const url = URL.createObjectURL(downloadBlob);
  const a = document.createElement("a");
  a.href = url;
  a.download = cleanFileName;
  a.type = "application/json";
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function saveResourcePackageBlob(target, blob){
  const fileName = target && target.suggestedName ? target.suggestedName : getResourcePackageZipFilename();
  if(target && target.kind === "file-handle" && target.handle){
    const writable = await target.handle.createWritable();
    try{
      await writable.write(blob);
      await writable.close();
    }catch(err){
      try{
        await writable.abort();
      }catch(_err){}
      throw err;
    }
    return;
  }

  downloadResourcePackageBlob(fileName, blob);
}

async function exportPackage(){
  // Exports package ZIP: tso-resources.json + any referenced PDF blobs.
  if(!commitPendingEditsIfChanged()) return;

  if(typeof JSZip === "undefined"){
    alert("ZIP support is unavailable. Reload the app and try again.");
    return;
  }

  let previousPackageVersion;
  let packageVersionBumped = false;
  try{
    const saveTarget = await beginResourcePackageSave();
    const zip = new JSZip();
    normalizePackageData(data);
    previousPackageVersion = data.packageVersion;
    data.packageVersion = getNextPackageVersionValue(data.packageVersion);
    packageVersionBumped = true;

    const packageData = buildResourcePackageData(data);
    const resourceCount = Array.isArray(packageData.resources) ? packageData.resources.length : 0;
    if(resourceCount === 0){
      const shouldSaveEmpty = confirm("This resource package has no resources. Save it anyway?");
      if(!shouldSaveEmpty){
        data.packageVersion = previousPackageVersion;
        packageVersionBumped = false;
        return;
      }
    }
    zip.file("tso-resources.json", JSON.stringify(packageData, null, 2));

    const pdfKeys = collectPDFPathsFromResources(packageData.resources);
    for(const key of pdfKeys){
      const blob = await getPDF(key);
      if(blob){
        zip.file(key, blob);
      }
    }

    const blob = await zip.generateAsync({
      type: "blob",
      compression: "DEFLATE",
      compressionOptions: { level: 6 }
    });
    await saveResourcePackageBlob(saveTarget, blob);
    persist();
    showToast(`Resource package saved (${resourceCount} ${resourceCount === 1 ? "resource" : "resources"})`);
  }catch(err){
    if(err && err.name === "AbortError") return;
    if(packageVersionBumped) data.packageVersion = previousPackageVersion;
    alert("Save failed: " + err.message);
  }
}

async function beginMergeImportPackage(){
  // Opens a package ZIP picker for merge-based resource reload.
  if(!commitPendingEditsIfChanged()) return;

  if(typeof window.showOpenFilePicker === "function"){
    try{
      const handles = await window.showOpenFilePicker({
        id: "tso-resources",
        startIn: lastOpenedResourcePackageHandle || "downloads",
        // Do not filter by extension here. Some valid ZIP packages are dimmed
        // by macOS pickers, so import-time validation remains authoritative.
        multiple: false
      });
      const handle = handles && handles[0];
      if(!handle) return;
      const file = await handle.getFile();
      const merged = await mergeImportPackage({
        target: {
          files: [file],
          value: "",
          remove(){}
        }
      });
      if(merged) lastOpenedResourcePackageHandle = handle;
    }catch(err){
      if(err && err.name === "AbortError") return;
      alert("Load failed: " + err.message);
    }
    return;
  }

  const input = document.createElement("input");
  input.type = "file";
  input.style.display = "none";
  input.onchange = mergeImportPackage;
  document.body.appendChild(input);
  input.value = "";
  input.click();
}

function validateImportData(imported){
  // Validates imported resource package JSON before merging current data.
  const errors = [];
  const warnings = [];

  if(!imported || typeof imported !== "object"){
    return { ok:false, errors:["File is not a valid JSON object"], warnings:[] };
  }

  if(!Array.isArray(imported.categories)){
    errors.push("Missing or invalid 'categories' array");
  }

  if(!Array.isArray(imported.resources)){
    errors.push("Missing or invalid 'resources' array");
  }

  if(imported.categoryMigrations != null && !Array.isArray(imported.categoryMigrations)){
    errors.push("Invalid 'categoryMigrations' array");
  }

  if(imported.appChanges != null && !Array.isArray(imported.appChanges)){
    errors.push("Invalid 'appChanges' array");
  }

  if(imported.resourcePackageSchemaVersion != null && imported.resourcePackageSchemaVersion !== RESOURCE_PACKAGE_SCHEMA_VERSION){
    errors.push(`Unsupported resource package schema. Expected ${RESOURCE_PACKAGE_SCHEMA_VERSION}.`);
  }

  collectLegacyPackageFieldErrors(imported).forEach(error => errors.push(error));

  const categoryIds = new Set();
  (Array.isArray(imported.categories) ? imported.categories : []).forEach((c, i) => {
    if(!c.id) errors.push(`Category at index ${i} is missing id`);
    if(!String(c && c.label || "").trim()) errors.push(`Category '${c && c.id || i}' is missing a label`);
    if(c.id){
      if(categoryIds.has(c.id)){
        errors.push(`Duplicate category id '${c.id}'`);
      }
      categoryIds.add(c.id);
    }
  });

  const migratedCategoryIds = new Set();
  (Array.isArray(imported.categoryMigrations) ? imported.categoryMigrations : []).forEach((migration, i) => {
    if(!migration || typeof migration !== "object"){
      errors.push(`Category migration at index ${i} must be an object`);
      return;
    }
    const fromId = String(migration.fromId || "").trim();
    const toId = String(migration.toId || "").trim();
    const toFilter = String(migration.toFilter || "").trim();
    if(!fromId) errors.push(`Category migration at index ${i} is missing fromId`);
    if(fromId && migratedCategoryIds.has(fromId)) errors.push(`Duplicate category migration from '${fromId}'`);
    if(fromId) migratedCategoryIds.add(fromId);
    if(toId && fromId === toId) errors.push(`Category migration '${fromId}' cannot target itself`);
    if(toId && !categoryIds.has(toId)) errors.push(`Category migration '${fromId}' references unknown target '${toId}'`);
    if(toFilter && !toId) errors.push(`Category migration '${fromId}' has toFilter without toId`);
  });

  const resourceIds = new Set();
  (Array.isArray(imported.resources) ? imported.resources : []).forEach((r, i) => {
    if(!r.id) errors.push(`Resource at index ${i} missing id`);
    if(!r.name) warnings.push(`Resource '${r.id || i}' missing name`);

    if(r.id){
      if(resourceIds.has(r.id)){
        errors.push(`Duplicate resource id '${r.id}'`);
      }
      resourceIds.add(r.id);
    }

    if(Array.isArray(r.categories)){
      r.categories.forEach(catId => {
        if(!categoryIds.has(catId)){
          warnings.push(`Resource '${r.id}' references unknown category '${catId}'`);
        }
      });
    }
    if("pdfs" in r && !Array.isArray(r.pdfs)){
      errors.push(`Resource '${r.id || i}' has invalid 'pdfs' value`);
    }
    (Array.isArray(r.pdfs) ? r.pdfs : []).forEach((pdf, pdfIndex) => {
      if(!pdf || typeof pdf !== "object"){
        errors.push(`Resource '${r.id || i}' PDF ${pdfIndex} must be an object`);
        return;
      }
      if(!pdf.path) errors.push(`Resource '${r.id || i}' PDF ${pdfIndex} is missing path`);
    });
  });

  return {
    ok: errors.length === 0,
    errors,
    warnings
  };
}

async function mergeImportPackage(event){
  // Imports package ZIP, validates JSON, merges data, then stores referenced PDFs.
  if(!commitPendingEditsIfChanged()){
    event.target.remove();
    return;
  }

  const file = event.target.files && event.target.files[0];
  if(!file){
    event.target.remove();
    return;
  }

  try{
    if(typeof JSZip === "undefined"){
      throw new Error("ZIP support is unavailable. Reload the app and try again.");
    }
    const zip = await JSZip.loadAsync(file);
    const jsonFile = zip.file("tso-resources.json");
    if(!jsonFile){
      alert("Package missing tso-resources.json");
      return;
    }

    const jsonText = await jsonFile.async("string");
    const imported = JSON.parse(jsonText);
    const removedUnnamedCategoryIds = removeUnusedUnnamedCategories(imported);

    const report = validateImportData(imported);
    if(!report.ok){
      alert(
        "Load failed due to errors:\n\n" +
        report.errors.join("\n")
      );
      return;
    }
    normalizePackageData(imported);
    const importedChangeIds = new Set((imported.changes || []).map(entry => String(entry && entry.id || "")).filter(Boolean));
    const importedPackageVersion = normalizePackageVersionValue(imported.packageVersion);

    const localResourcesWithPdf = ((data && data.resources) || [])
      .map(r => ({ resource:r, paths:collectPDFPathsFromResource(r) }))
      .filter(item => item.paths.length);
    const { mergedData, summary:mergeSummary } = mergeResourcePackages(data, imported);
    const mergedById = new Map((mergedData.resources || []).map(r => [String(r && r.id || ""), r]));
    const resourcesWithPdf = localResourcesWithPdf
      .filter(item => {
        const mergedResource = mergedById.get(String(item.resource && item.resource.id || ""));
        const mergedPaths = new Set(collectPDFPathsFromResource(mergedResource));
        return item.paths.some(path => !mergedPaths.has(path));
      })
      .map(item => item.resource.name);

    const missingPdfPaths = await mergeZipAssets(zip, mergedData);
    applyMergedData(mergedData);
    const mergedTargetKeys = new Set([
      ...(mergeSummary.resourceIdsAdded || []).map(id => `resource:${id}`),
      ...(mergeSummary.resourceIdsUpdated || []).map(id => `resource:${id}`),
      ...(mergeSummary.categoryIdsAdded || []).map(id => `category:${id}`),
      ...(mergeSummary.categoryIdsUpdated || []).map(id => `category:${id}`)
    ]);
    const loadedChanges = getRecentChanges().filter(entry => {
      const changeId = String(entry && entry.id || "");
      const targetKey = `${String(entry && entry.type || "")}:${String(entry && entry.targetId || "")}`;
      return importedChangeIds.has(changeId) && mergedTargetKeys.has(targetKey);
    });
    const loadedChangeSummaries = loadedChanges.length
      ? loadedChanges.map(formatPackageChangeSummary)
      : buildPackageMergeSummary(mergeSummary);
    data.lastLoadedPackageInfo = {
      sourcePackageVersion: importedPackageVersion,
      loadedAt: nowISO(),
      changes: loadedChangeSummaries
    };
    normalizeLastLoadedPackageInfo(data);
    data.changes = [];
    persist();
    if(loadedChangeSummaries.length){
      pendingRecentUpdates = [];
      recentUpdateDetail = null;
      showUpdateInfo = true;
      showRecentChangeLog = false;
      view = "recent-updates";
      safeRender();
    }
    const warningBlocks = [];
    if(removedUnnamedCategoryIds.length > 0){
      warningBlocks.push(
        "The package contained an unused unnamed category left by an older app. " +
        "It was removed automatically:\n\n" +
        removedUnnamedCategoryIds.map(id => `• ${id}`).join("\n")
      );
    }
    if(resourcesWithPdf.length > 0){
      warningBlocks.push(
        "The following PDFs were not preserved:\n\n" +
        resourcesWithPdf.map(name => `• ${name}`).join("\n")
      );
    }
    if(missingPdfPaths.length > 0){
      warningBlocks.push(
        "The package referenced PDF files that were not found in the zip:\n\n" +
        missingPdfPaths.map(path => `• ${path}`).join("\n")
      );
    }
    if(warningBlocks.length){
      alert(warningBlocks.join("\n\n"));
    }
    showToast("Resource package merged. You can delete the package zip when you are done.");
    return true;
  }catch(e){
    alert("Load failed: " + e.message);
  }finally{
    // allow re-import of same filename
    event.target.value = "";
    event.target.remove();
  }
}
