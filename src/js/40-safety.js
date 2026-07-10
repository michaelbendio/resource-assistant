// ============================================================
// SAFETY HARNESS
// ============================================================
// Catch runtime errors and (when debug is enabled) enforce invariants to prevent
// silent corruption during edits, imports, and rendering.

function showAppError(context, err){
  const banner = document.getElementById("appErrorBanner");
  const details = document.getElementById("appErrorDetails");
  if(!banner || !details) return;

  const message = err && err.message ? String(err.message) : String(err || "Unknown error");
  const stack = err && err.stack ? String(err.stack) : "";
  const timestamp = new Date().toISOString();
  details.textContent = [
    `Context: ${context}`,
    `Message: ${message}`,
    `Timestamp: ${timestamp}`,
    stack ? `Stack:\n${stack}` : ""
  ].filter(Boolean).join("\n");
  banner.style.display = "block";
}

function safeCall(label, fn){
  try{
    return fn();
  }catch(err){
    showAppError(label, err);
    return undefined;
  }
}

function assertInvariants(context = "invariant check"){
  if(!data || !Array.isArray(data.resources)) throw new Error(`${context}: data.resources must be an array`);
  if(!Array.isArray(data.categories)) throw new Error(`${context}: data.categories must be an array`);
  if(!Array.isArray(printSelection)) throw new Error(`${context}: printSelection must be an array`);

  const ids = new Set();
  data.resources.forEach((resource, idx) => {
    const id = String(resource && resource.id || "");
    if(!id) throw new Error(`${context}: resource at index ${idx} is missing id`);
    if(ids.has(id)) throw new Error(`${context}: duplicate resource id '${id}'`);
    ids.add(id);

    if(!Array.isArray(resource.forGroups)) throw new Error(`${context}: resource '${id}' forGroups must be an array`);
    const resourceForGroupKeys = new Set();
    resource.forGroups.forEach(group => {
      if(typeof group !== "string" || group !== group.trim() || !group){
        throw new Error(`${context}: resource '${id}' has invalid For group '${group}'`);
      }
      const key = group.toLowerCase();
      if(resourceForGroupKeys.has(key)){
        throw new Error(`${context}: resource '${id}' has duplicate For group '${group}'`);
      }
      resourceForGroupKeys.add(key);
    });

    if(resource.verifiedOn != null && !isValidMMYY(resource.verifiedOn)){
      throw new Error(`${context}: resource '${id}' verifiedOn must be MM/YY or null`);
    }
  });

  const resourceIds = new Set(data.resources.map(r => String(r && r.id || "")));
  const badPrintSelection = printSelection.find(id => !resourceIds.has(String(id || "")));
  if(badPrintSelection) throw new Error(`${context}: print selection '${badPrintSelection}' does not reference a valid resource`);
}

function safeRender(label = "render"){
  return safeCall(label, () => {
    if(DEBUG) assertInvariants(`${label} pre`);
    const result = render();
    if(DEBUG) assertInvariants(`${label} post`);
    return result;
  });
}

function safeRenderAdmin(label = "renderAdmin"){
  return safeCall(label, () => {
    if(DEBUG) assertInvariants(`${label} pre`);
    const result = renderAdmin();
    if(DEBUG) assertInvariants(`${label} post`);
    return result;
  });
}

window.addEventListener("error", (event) => {
  showAppError("window.error", event.error || event.message || event);
});

window.addEventListener("unhandledrejection", (event) => {
  showAppError("window.unhandledrejection", event.reason || event);
});

const appErrorCopy = document.getElementById("appErrorCopy");
if(appErrorCopy){
  appErrorCopy.onclick = async () => {
    const details = document.getElementById("appErrorDetails");
    if(!details || !navigator.clipboard || !navigator.clipboard.writeText) return;
    try{
      await navigator.clipboard.writeText(details.textContent || "");
    }catch(_err){
      // ignore clipboard failures
    }
  };
}

const appErrorDismiss = document.getElementById("appErrorDismiss");
if(appErrorDismiss){
  appErrorDismiss.onclick = () => {
    const banner = document.getElementById("appErrorBanner");
    if(banner) banner.style.display = "none";
  };
}

/* SAFETY: critical anchors must exist */
(function checkCriticalAnchors(){
  const source = document.currentScript?.textContent || "";
  [
    "STATE",
    "UTILITIES",
    "PERSISTENCE",
    "UNDO SYSTEM",
    "RENDERING — RESOURCES",
    "ADMIN MODE",
    "EVENT HANDLERS",
    "PrintWorkflow"
  ].forEach(anchor => {
    if(!source.includes(anchor)){
      throw new Error("Safety harness: missing critical anchor: " + anchor);
    }
  });
})();
