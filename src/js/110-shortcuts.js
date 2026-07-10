/* ---------- Application Shortcuts ---------- */
window.addEventListener("keydown", (e) => {
  const isFreshStartShortcut = e.ctrlKey && e.altKey && (e.code === "KeyF" || e.key === "F" || e.key === "f");
  if(!isFreshStartShortcut) return;
  e.preventDefault();
  e.stopPropagation();
  freshStartFromSeed();
}, true);

window.addEventListener("keydown", (e) => {
  if(e.key !== "Escape") return;
  const modal = document.getElementById("referenceModal");
  if(!modal || modal.classList.contains("hidden")) return;
  e.preventDefault();
  e.stopPropagation();
  closeReferenceModal();
}, true);

window.addEventListener("keydown", (e) => {
  const isDoneShortcut = (e.ctrlKey || e.metaKey) && e.key === "Enter";
  if(!isDoneShortcut) return;
  if(!(view === "admin" && adminTab === "resources" && adminResourceEditMode)) return;
  e.preventDefault();
  e.stopPropagation();
  closeResourceEditor();
}, true);

window.addEventListener("keydown", (e) => {
  const activeTag = document.activeElement && document.activeElement.tagName
    ? document.activeElement.tagName.toUpperCase()
    : "";
  if(activeTag === "INPUT" || activeTag === "TEXTAREA") return;

  const isAdminToggleShortcut = e.ctrlKey && e.altKey && (e.code === "KeyA" || e.key === "A" || e.key === "a");
  if(!isAdminToggleShortcut) return;

  e.preventDefault();
  e.stopPropagation();
  const shouldShowAdmin = !isAdminVisible;
  setAdminVisibility(shouldShowAdmin);
  safeRender();
  if(shouldShowAdmin) flashAdminButton();
}, true);
