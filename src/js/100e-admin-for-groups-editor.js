/* ---------- Admin: For ---------- */
// The For editor owns the governed cross-category people-served list. Resources
// reference these values through resource.forGroups.

function getResourcesUsingForGroup(group){
  const normalizedGroup = normalizeTaxonomyLabels([group])[0] || "";
  const groupKey = normalizedGroup.toLowerCase();
  if(!groupKey) return [];
  return (Array.isArray(data.resources) ? data.resources : [])
    .filter(resource => normalizeTaxonomyLabels(resource && resource.forGroups).some(resourceGroup => resourceGroup.toLowerCase() === groupKey))
    .sort((a,b)=>String(a && a.name || "").localeCompare(String(b && b.name || ""), undefined, { sensitivity:"base" }));
}

function formatResourceCount(count){
  return `${count} ${count === 1 ? "resource" : "resources"}`;
}

function forGroupsEditorDraft(){
  const groups = Array.from(document.querySelectorAll(".forGroupInput"))
    .map(input => input.value)
    .filter(value => String(value || "").trim());
  return { forGroups: normalizeTaxonomyLabels(groups) };
}

function snapshotForGroupsEditor(){
  const draft = forGroupsEditorDraft();
  return draft ? JSON.stringify(draft) : "";
}

function applyForGroupsDraft(draft){
  const previousGroups = normalizeTaxonomyLabels(data.forGroups);
  const nextGroups = normalizeTaxonomyLabels(draft && draft.forGroups);
  const nextKeys = new Set(nextGroups.map(group => group.toLowerCase()));
  const removedGroups = previousGroups.filter(group => !nextKeys.has(group.toLowerCase()));
  if(removedGroups.length){
    setUndoSnapshot(removedGroups.length === 1 ? "For group deletion tag" : "For group deletion tags");
    data.deletionRequests = mergeDeletionRecords(data.deletionRequests, removedGroups.map(group =>
      createDeletionRequest("forGroup", { label:group })
    ), "requestedAt");
  }
  data.forGroups = normalizeTaxonomyLabels([...nextGroups, ...removedGroups]);
}

function validateForGroupsDraft(draft){
  return { valid:!!draft, message:"" };
}

function cancelForGroupsEditor(){
  editing = null;
  editorSnapshot = "";
  safeRenderAdmin();
}

function closeForGroupsEditor(){
  if(!commitPendingEditsIfChanged()) return;
  editing = null;
  editorSnapshot = "";
  safeRenderAdmin();
}

function selectForGroupRow(index){
  const rows = Array.from(document.querySelectorAll(".for-group-row"));
  if(!rows.length){
    selectedForGroupIndex = 0;
    refreshForGroupDetails();
    return;
  }
  selectedForGroupIndex = Math.max(0, Math.min(Number(index) || 0, rows.length - 1));
  rows.forEach((row, rowIndex) => {
    const selected = rowIndex === selectedForGroupIndex;
    row.classList.toggle("selected", selected);
    row.setAttribute("aria-selected", selected ? "true" : "false");
  });
  refreshForGroupDetails();
}

function addForGroupRow(value){
  const list = document.getElementById("forGroupRows");
  if(!list) return;
  const index = list.querySelectorAll(".for-group-row").length;
  const row = document.createElement("div");
  row.className = "for-group-row";
  row.setAttribute("role", "option");
  row.tabIndex = 0;
  row.innerHTML = `
    <input type="text" class="forGroupInput" value="${escapeHTML(value || "")}" aria-label="For group">
  `;
  if(value && hasDeletionRequest("forGroup", { label:value })){
    const status = document.createElement("span");
    status.className = "deletion-tag-status";
    status.textContent = "tagged for deletion";
    row.appendChild(status);
  }
  const input = row.querySelector(".forGroupInput");
  if(input){
    input.addEventListener("input", () => {
      refreshForGroupDetails();
      updateForGroupsEditorActionBar();
    });
    input.addEventListener("focus", () => selectForGroupRow(index));
  }
  list.appendChild(row);
  row.addEventListener("click", () => selectForGroupRow(index));
  row.addEventListener("keydown", event => {
    if(event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    selectForGroupRow(index);
    if(input) input.focus();
  });
  if(index === selectedForGroupIndex) selectForGroupRow(index);
}

function refreshForGroupDetails(){
  const detail = document.getElementById("forGroupDetail");
  if(!detail) return;
  const rows = Array.from(document.querySelectorAll(".for-group-row"));
  const row = rows[selectedForGroupIndex] || null;
  const group = normalizeTaxonomyLabels([row && row.querySelector(".forGroupInput") ? row.querySelector(".forGroupInput").value : ""])[0] || "";
  const resources = group ? getResourcesUsingForGroup(group) : [];
  detail.innerHTML = group ? `
    <h3 style="margin-top:0;">${escapeHTML(group)}</h3>
    <p>This group is used by these ${formatResourceCount(resources.length)}:</p>
    ${resources.length ? `
      <ul class="admin-detail-list">
        ${resources.map(resource => `<li>${escapeHTML(resource.name || "(Unnamed resource)")}</li>`).join("")}
      </ul>
    ` : `<p class="admin-note">No resources currently use this group.</p>`}
  ` : `
    <h3 style="margin-top:0;">For Details</h3>
    <p>Select a group to see the resources that use it.</p>
  `;
}

function renderAdminForGroups(container){
  normalizeDataForGroupsShape(data);

  container.innerHTML += `
    <div class="admin-panel">
      <div class="admin-box">
        <h3 class="admin-panel-title">For</h3>
        <p class="admin-note">"For" allows the user to specify what group of people a resource is for, across categories.</p>
        <div class="admin-action-row" style="margin-bottom:8px;">
          <button class="button" type="button" id="forGroupNewBtn">New</button>
          <button class="button danger" type="button" id="forGroupDeleteBtn">Delete</button>
        </div>
        <div id="forGroupRows"></div>
      </div>
      <div class="admin-box" id="forGroupDetail">
      </div>
    </div>
  `;

  normalizeTaxonomyLabels(data.forGroups).forEach(group => addForGroupRow(group));
  editing = { kind:"forGroups" };
  editorSnapshot = snapshotForGroupsEditor();
  updateForGroupsEditorActionBar();
  selectForGroupRow(selectedForGroupIndex);

  const newBtn = document.getElementById("forGroupNewBtn");
  const deleteBtn = document.getElementById("forGroupDeleteBtn");
  if(newBtn){
    newBtn.onclick = () => {
      addForGroupRow("");
      const rows = Array.from(document.querySelectorAll(".forGroupInput"));
      selectedForGroupIndex = rows.length - 1;
      selectForGroupRow(selectedForGroupIndex);
      updateForGroupsEditorActionBar();
      const last = rows[rows.length - 1];
      if(last) last.focus();
    };
  }
  if(deleteBtn){
    deleteBtn.onclick = () => {
      const rows = Array.from(document.querySelectorAll(".for-group-row"));
      const row = rows[selectedForGroupIndex];
      const input = row ? row.querySelector(".forGroupInput") : null;
      const group = input ? input.value.trim() : "";
      if(!group) return;
      if(!commitPendingEditsIfChanged()) return;
      if(!confirm(`Tag the For group '${group}' for deletion?\n\nResources will remain unchanged until an admin reviews and approves the deletion after a package merge.`)) return;
      tagDeletionRequests([createDeletionRequest("forGroup", { label:group })], `tagged For group "${group}" for deletion`);
    };
  }
  refreshForGroupDetails();
}
