// ============================================================
// STATE
// ============================================================
// Startup flow:
// 1) Read embedded seed.
// 2) Load saved snapshot from localStorage (or seed if missing).
// 3) Normalize startup data to canonical shapes.
// 4) Load persisted print selections, then initialize transient UI state.

const seed = JSON.parse(document.getElementById("seed-data").textContent);
const APP_RELEASE = JSON.parse(document.getElementById("app-release-data").textContent);
const APP_VERSION = String(APP_RELEASE.version || "Unknown");
const APP_CHANGE_LOG = Array.isArray(APP_RELEASE.changes) ? APP_RELEASE.changes : [];
const URL_PARAMS = new URLSearchParams(location.search);
const DEBUG = URL_PARAMS.has("debug");

function normalizeStorageId(value){
  const words = String(value || "")
    .trim()
    .split(/[^a-z0-9]+/i)
    .filter(Boolean);
  if(!words.length) return "new";
  return words.map((word, index) => {
    const lower = word.toLowerCase();
    return index === 0 ? lower : lower.charAt(0).toUpperCase() + lower.slice(1);
  }).join("");
}

function getConfiguredStorageId(){
  const meta = document.querySelector('meta[name="tso-storage-id"]');
  const configured = meta ? String(meta.getAttribute("content") || "").trim() : "";
  return configured ? normalizeStorageId(configured) : "";
}

function getStorageKeyPrefix(fileName = getCurrentHtmlFileName()){
  const configured = getConfiguredStorageId();
  if(configured) return configured;
  const baseName = String(fileName || "")
    .replace(/\.html?$/i, "")
    .trim();
  return normalizeStorageId(baseName);
}

function getStorageKey(suffix){
  return `${STORAGE_KEY_PREFIX}${suffix}`;
}

const STORAGE_KEY_PREFIX = getStorageKeyPrefix();
const DATA_STORAGE_KEY = getStorageKey("Data");
const UPDATE_SEEN_STORAGE_KEY = getStorageKey("RecentUpdatesSeen");
const PRINT_SELECTION_STORAGE_KEY = getStorageKey("PrintSelection");
const LEGACY_FAVORITES_STORAGE_KEY = getStorageKey("Favorites");
const TSO_NAME_STORAGE_KEY = getStorageKey("TsoName");
const UNDO_STORAGE_KEY = getStorageKey("Undo");
const DISMISSED_TIPS_STORAGE_KEY = getStorageKey("DismissedTips");
const NEW_ADMIN_TRAINING_PENDING_KEY = "tsoResourcesNewAdminTrainingPending";
const STARTUP_STATE_STORAGE_KEYS = [
  UPDATE_SEEN_STORAGE_KEY,
  PRINT_SELECTION_STORAGE_KEY,
  LEGACY_FAVORITES_STORAGE_KEY,
  UNDO_STORAGE_KEY
];

function shouldResetTemplateStorageOnStartup(fileName = getCurrentHtmlFileName()){
  return String(fileName || "").toLowerCase() === "new.html";
}

function runStartupStateReset(fileName = getCurrentHtmlFileName()){
  STARTUP_STATE_STORAGE_KEYS.forEach(key => localStorage.removeItem(key));
  if(shouldResetTemplateStorageOnStartup(fileName)){
    localStorage.removeItem(DATA_STORAGE_KEY);
    localStorage.removeItem(TSO_NAME_STORAGE_KEY);
  }
  sessionStorage.clear();
}
runStartupStateReset();

function clearTemporaryLocalState(){
  STARTUP_STATE_STORAGE_KEYS.forEach(key => localStorage.removeItem(key));
  sessionStorage.clear();
}

function clearCurrentLocalState(){
  clearTemporaryLocalState();
  localStorage.removeItem(DATA_STORAGE_KEY);
  localStorage.removeItem(TSO_NAME_STORAGE_KEY);
  localStorage.removeItem(DISMISSED_TIPS_STORAGE_KEY);
  localStorage.removeItem(NEW_ADMIN_TRAINING_PENDING_KEY);
}

function deleteCurrentAssetStorage(){
  if(typeof indexedDB === "undefined") return Promise.resolve();
  return new Promise(resolve => {
    const request = indexedDB.deleteDatabase(`${STORAGE_KEY_PREFIX}Assets`);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  });
}

function freshStartFromSeed(){
  const choice = prompt(
    "Choose local cleanup:\n\n" +
    "1. Refresh UI state only - keep resources and categories.\n" +
    "2. Reset to this file's starter data - delete local resources and categories.\n" +
    "3. Full local cleanup - delete local data and local PDF storage.\n\n" +
    "Type 1, 2, or 3."
  );
  const selected = String(choice || "").trim();
  if(!selected) return;
  if(selected === "1"){
    clearTemporaryLocalState();
    location.reload();
    return;
  }
  if(selected === "2"){
    const confirmed = confirm("Delete saved local resources/categories for this file and reload from the embedded starter data?");
    if(!confirmed) return;
    clearCurrentLocalState();
    location.reload();
    return;
  }
  if(selected === "3"){
    const confirmed = confirm("Delete saved local resources/categories and local PDF storage for this file?");
    if(!confirmed) return;
    clearCurrentLocalState();
    deleteCurrentAssetStorage().then(() => location.reload());
    return;
  }
  alert("No cleanup was run. Type 1, 2, or 3.");
}

// Main persisted app data snapshot (categories/resources + metadata).
let data = JSON.parse(localStorage.getItem(DATA_STORAGE_KEY) || "null");
const RESOURCE_PACKAGE_SCHEMA_VERSION = 2;
const TIP_TEXT = {
  user: "Click on a category to see its resources. Click a resource to see details. Click ⬜ to include it in the printed handout.",
  newAdminWelcome: "Welcome to you, new admin. Press Ctrl+Alt+A to enter admin mode",
  newAdminMode: "Click \"Change TSO Name\" to name this TSO Resources. Then close this tab or window and rename new.html to the changed name, keeping the .html extension. Open it and enter admin mode again."
};
const DEFAULT_RESOURCE_PACKAGE_FILENAME = "tso-resources.json";
const CATEGORY_REMINDER_TEXT = "Report bugs or request enhancments to Elder Bendio (michaelbendio@gmail.com)"

if(!data){
  data = seed;
}
const appliedCategoryPreset = applyDefaultCategoryPreset(data);
if(!localStorage.getItem(DATA_STORAGE_KEY) || appliedCategoryPreset){
  localStorage.setItem(DATA_STORAGE_KEY, JSON.stringify(data));
}

normalizeDataInformationShape(data);
normalizeDataPDFShape(data);
normalizeLegacyPackageShape(data);
normalizeLegacyTagsShape(data);
normalizeDataForGroupsShape(data);
normalizeDataCategoryFilterShape(data);
normalizeDataVerifiedOnShape(data);
normalizeChanges(data);
normalizeLastLoadedPackageInfo(data);
data.appVersion = APP_VERSION;
data.resourcePackageSchemaVersion = RESOURCE_PACKAGE_SCHEMA_VERSION;

let printSelection = loadPrintSelection();
sanitizePrintSelection();
if(DEBUG) assertInvariants("startup");
// Runtime UI state. These values describe what the current browser tab is doing:
// public view routing, selected rows, open editors, transient filters, and update
// review screens. Do not put package data here; package data belongs in `data`.
let view = "categories";
let currentCategory = null;
const LISTS_CATEGORY_ID = "__lists__";

// Public navigation/search state. The selected category filters are deliberately
// transient: they narrow the current view but are never exported in a package.
let isSearchOpen = false;
let searchQuery = "";
let searchResults = null;
let expandedSearchResourceId = "";
let searchDetailResourceId = "";
let searchResultReturnResourceId = "";
let selectedCategoryFilters = {}; // categoryId -> transient selected category/For filters
let dismissedTipIds = (() => {
  try{
    const stored = JSON.parse(localStorage.getItem(DISMISSED_TIPS_STORAGE_KEY) || "[]");
    return new Set(Array.isArray(stored) ? stored.map(value => String(value)) : []);
  }catch(_err){
    return new Set();
  }
})();

function dismissTip(tipId){
  const id = String(tipId || "");
  if(!id) return;
  dismissedTipIds.add(id);
  localStorage.setItem(DISMISSED_TIPS_STORAGE_KEY, JSON.stringify(Array.from(dismissedTipIds)));
}

// Admin navigation/editor state. `editing` and `editorSnapshot` are the dirty
// checking pair used by commitPendingEditsIfChanged().
let isAdminVisible = false;
let adminTab = "categories";
let adminShowVerifiedDates = false;
let adminResourceEditMode = false;
let selectedResourceId = "";
let selectedCategoryIndex = "";
let editing = null;
let editorSnapshot = "";
let selectedForGroupIndex = 0;

// Recent-update state. Package imports set these fields so the next public render
// can show what changed; the recent-updates view clears them after displaying.
let pendingRecentUpdates = [];
let recentUpdateDetail = null;
let showUpdateInfo = false;
let showRecentChangeLog = true;
function getCurrentHtmlFileName(){
  const path = String(location.pathname || "");
  const fileName = path.split("/").filter(Boolean).pop() || "";
  try{
    return decodeURIComponent(fileName);
  }catch(_err){
    return fileName;
  }
}

function isNewTemplateFile(){
  return getCurrentHtmlFileName().toLowerCase() === "new.html";
}

function getTrainingStorageIdFromName(value){
  return normalizeStorageId(value);
}

function markRenamedAdminTrainingPending(tsoName){
  const storageId = getTrainingStorageIdFromName(tsoName);
  if(storageId) localStorage.setItem(NEW_ADMIN_TRAINING_PENDING_KEY, storageId);
}

function consumeRenamedAdminTrainingPending(fileName = getCurrentHtmlFileName()){
  if(String(fileName || "").toLowerCase() === "new.html") return false;
  const pendingStorageId = localStorage.getItem(NEW_ADMIN_TRAINING_PENDING_KEY);
  if(!pendingStorageId) return false;
  if(pendingStorageId !== getStorageKeyPrefix(fileName)) return false;
  localStorage.removeItem(NEW_ADMIN_TRAINING_PENDING_KEY);
  return true;
}

let adminHelpPrintRestoreState = null;

// A new category/resource is inserted immediately so the normal editor can own
// it. These sets mark those temporary drafts so Cancel can remove them cleanly.
let allowBlankUpdateDescriptionOnce = false;
let newCategoryIds = new Set();
let newResourceIds = new Set();
