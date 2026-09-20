/* ---------- For-group matching and explicit editor review ---------- */
// Approved relationships only. They apply when both labels exist in the office
// catalog; they never create a group or infer eligibility from descriptive text.
const FOR_GROUP_REVIEW_VERSION = 1;
const APPROVED_FOR_GROUP_RELATIONSHIPS = [
  ["Deaf & hard of hearing", "People with disabilities"],
  ["Blind & low vision", "People with disabilities"]
];
let forGroupMatchMode = "all";

function effectiveForGroups(values, catalog){
  const labels = normalizeTaxonomyLabels(values);
  const available = new Map(normalizeTaxonomyLabels(catalog).map(label => [label.toLowerCase(), label]));
  const found = new Map(labels.map(label => [label.toLowerCase(), available.get(label.toLowerCase()) || label]));
  APPROVED_FOR_GROUP_RELATIONSHIPS.forEach(([child, parent]) => {
    if(available.has(child.toLowerCase()) && available.has(parent.toLowerCase()) && found.has(child.toLowerCase())){
      found.set(parent.toLowerCase(), available.get(parent.toLowerCase()));
    }
  });
  return Array.from(found.values());
}

function matchesSelectedForGroupKeys(resource, keys){
  const selected = Array.from(keys || []);
  if(!selected.length) return true;
  const available = getResourceForGroupFilterKeys(resource);
  return forGroupMatchMode === "any"
    ? selected.some(key => available.has(key))
    : selected.every(key => available.has(key));
}

function renderForGroupMatchControl(container){
  const control = document.createElement("div");
  control.className = "for-group-match-control";
  control.style.cssText = "display:flex;flex-wrap:wrap;gap:8px 18px;margin:8px 0 12px;";
  control.setAttribute("role", "radiogroup");
  control.setAttribute("aria-label", "How to match selected groups");
  [["all", "Match all selected groups"], ["any", "Match any selected group"]].forEach(([value, text]) => {
    const label = document.createElement("label");
    const radio = document.createElement("input");
    radio.type = "radio";
    radio.name = "for-group-match-mode";
    radio.value = value;
    radio.checked = forGroupMatchMode === value;
    radio.onchange = () => {
      forGroupMatchMode = value;
      safeRender();
      document.querySelector(`input[name="for-group-match-mode"][value="${value}"]`)?.focus();
    };
    label.appendChild(radio);
    label.appendChild(document.createTextNode(` ${text}`));
    control.appendChild(label);
  });
  container.appendChild(control);
}

function forGroupReviewContentKey(resource, catalog, definitions = {}){
  // Synchronous change detector, not a signature or proof of human identity.
  const text = JSON.stringify({version:FOR_GROUP_REVIEW_VERSION,
    rules:APPROVED_FOR_GROUP_RELATIONSHIPS,
    catalog:normalizeTaxonomyLabels(catalog).map(x => [x.toLowerCase(), forGroupDefinition({forGroupDefinitions:definitions}, x)]).sort(),
    name:String(resource.name || "").trim(), description:String(resource.description || ""),
    informationText:String(resource.informationText || ""),
    categories:normalizeTaxonomyLabels(resource.categories).sort(),
    types:Object.entries(resource.categoryFilters || {}).map(([id, labels]) => [id, normalizeTaxonomyLabels(labels).sort()]).sort(),
    groups:effectiveForGroups(resource.forGroups, catalog).map(x => x.toLowerCase()).sort()
  });
  let hash = 14695981039346656037n;
  for(let i=0; i<text.length; i++){
    hash ^= BigInt(text.charCodeAt(i));
    hash = BigInt.asUintN(64, hash * 1099511628211n);
  }
  return hash.toString(16).padStart(16, "0");
}

function hasCurrentForGroupReview(resource, catalog, definitions = {}){
  const review = resource && resource.forGroupReview;
  return !!(review && review.version === FOR_GROUP_REVIEW_VERSION
    && ["groups", "none"].includes(review.decision)
    && review.decision === (normalizeTaxonomyLabels(resource.forGroups).length ? "groups" : "none")
    && typeof review.reviewedAt === "string" && Number.isFinite(Date.parse(review.reviewedAt))
    && review.contentKey === forGroupReviewContentKey(resource, catalog, definitions));
}

function recordForGroupReview(resource, catalog, definitions = {}){
  resource.forGroups = effectiveForGroups(resource.forGroups, catalog);
  resource.forGroupReview = {version:FOR_GROUP_REVIEW_VERSION,
    decision:resource.forGroups.length ? "groups" : "none",
    contentKey:forGroupReviewContentKey(resource, catalog, definitions), reviewedAt:nowISO()};
}

function resourcesNeedingForGroupReview(source){
  return (source.resources || []).filter(resource => !hasCurrentForGroupReview(resource, source.forGroups, source.forGroupDefinitions));
}

function forGroupReviewSummaryHTML(){
  const count = resourcesNeedingForGroupReview(data).length;
  return count ? `<p id="for_group_review_summary" role="status">${count} ${count === 1 ? "resource needs" : "resources need"} a For-group review. Imported resources remain available.
    <button class="button" type="button" onclick="openNextForGroupReview()">Review next</button></p>` : "";
}

function openNextForGroupReview(){
  if(!commitPendingEditsIfChanged()) return;
  const resource = resourcesNeedingForGroupReview(data)[0];
  if(!resource) return;
  selectedResourceId = resource.id;
  adminTab = "resources";
  adminResourceEditMode = true;
  safeRenderAdmin();
}

function renderForGroupReviewSection(resource){
  const current = hasCurrentForGroupReview(resource, data.forGroups, data.forGroupDefinitions);
  return `<div class="for-group-review" style="margin:10px 0;">
    <p>Choose every applicable For group. Hearing and vision disability groups also include People with disabilities when that group is available. These checks do not determine a person's eligibility.</p>
    <label style="display:block;"><input type="checkbox" id="res_for_groups_reviewed"
      data-review-key="${current ? forGroupReviewContentKey(resource, data.forGroups, data.forGroupDefinitions) : ""}" ${current ? "checked" : ""}>
      <span id="res_for_groups_review_label">I reviewed all applicable For groups.</span></label>
    <p id="res_for_groups_review_status" role="status"></p>
  </div>`;
}

function syncApprovedForGroupSelections(){
  const boxes = Array.from(document.querySelectorAll(".resForGroup"));
  const selected = boxes.filter(box => box.checked).map(box => box.value);
  const effective = new Set(effectiveForGroups(selected, data.forGroups).map(x => x.toLowerCase()));
  boxes.forEach(box => { if(effective.has(box.value.toLowerCase())) box.checked = true; });
}

function readForGroupReviewConfirmation(draft){
  const checkbox = document.getElementById("res_for_groups_reviewed");
  if(!checkbox) return false;
  const key = forGroupReviewContentKey(draft, data.forGroups, data.forGroupDefinitions);
  if(checkbox.checked && checkbox.dataset.reviewKey !== key) checkbox.checked = false;
  const label = document.getElementById("res_for_groups_review_label");
  if(label) label.textContent = draft.forGroups.length
    ? "I reviewed all applicable For groups."
    : "I reviewed this resource: no specific For group applies.";
  const status = document.getElementById("res_for_groups_review_status");
  if(status) status.textContent = checkbox.checked
    ? "For-group review is current."
    : "Review the groups and confirm above before saving changes. Changes to the resource's services, eligibility, Categories or groups require another review.";
  return checkbox.checked;
}

function setupForGroupReviewControls(validateEditorState){
  const checkbox = document.getElementById("res_for_groups_reviewed");
  if(!checkbox) return;
  checkbox.addEventListener("change", () => {
    const checked = checkbox.checked;
    const draft = resourceEditorDraft();
    if(!draft) return;
    checkbox.dataset.reviewKey = checked ? forGroupReviewContentKey(draft, data.forGroups, data.forGroupDefinitions) : "";
    checkbox.checked = checked;
    validateEditorState();
  });
}

function requireDraftForGroupReview(draft){
  if(draft.forGroupReviewConfirmed) return true;
  const checkbox = document.getElementById("res_for_groups_reviewed");
  if(checkbox){ checkbox.scrollIntoView({block:"center"}); checkbox.focus(); }
  return false;
}

function forGroupDefinition(source, label){
  const key = Object.keys(source.forGroupDefinitions || {}).find(key => key.toLowerCase() === String(label).toLowerCase());
  return key ? String(source.forGroupDefinitions[key].description || "") : "";
}

function mergeForGroupDefinitions(local, incoming){
  const merged = new Map();
  for(const source of [local, incoming]){
    for(const [label, entry] of Object.entries(source.forGroupDefinitions || {})){
      const key = label.toLowerCase();
      const previous = merged.get(key);
      if(previous && entry.lastModified === previous.entry.lastModified && entry.description !== previous.entry.description){
        throw new Error(`Conflicting definitions for For group '${label}'. Edit its definition before merging these packages.`);
      }
      if(!previous || Date.parse(entry.lastModified) > Date.parse(previous.entry.lastModified)) merged.set(key, {label, entry});
    }
  }
  return Object.fromEntries(Array.from(merged.values()).map(({label,entry}) => [label, {...entry}]));
}
