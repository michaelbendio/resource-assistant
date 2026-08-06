/* =========================
   Admin UI
========================= */
// The functions below support both user search and admin-only "referenced by"
// inspection. A resource can be referenced by long list-style resources, so
// matching uses normalized token phrases instead of raw substring checks.

function getReferenceCategoryEntries(resource){
  const categoryIds = Array.isArray(resource && resource.categories)
    ? resource.categories.map(id => String(id || "")).filter(Boolean)
    : [];
  const categoryIdSet = new Set(categoryIds);
  const entries = [];
  const seen = new Set();

  (Array.isArray(data.categories) ? data.categories : [])
    .slice()
    .sort(compareCategoriesByLabel)
    .forEach((cat, index) => {
      const id = String(cat && cat.id || "");
      if(!categoryIdSet.has(id)) return;
      const label = String(cat && cat.label || id || "Uncategorized");
      const key = label.toLowerCase();
      if(seen.has(key)) return;
      seen.add(key);
      entries.push({ label, order:index });
    });

  categoryIds.forEach(id => {
    if(entries.some(entry => entry.label === id)) return;
    if((data.categories || []).some(cat => String(cat && cat.id || "") === id)) return;
    const key = id.toLowerCase();
    if(seen.has(key)) return;
    seen.add(key);
    entries.push({ label:id, order:9999 });
  });

  if(!entries.length){
    entries.push({ label:"Uncategorized", order:9999 });
  }

  return entries;
}

function normalizeReferenceSearchText(value){
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function getReferenceTokens(value){
  const normalized = normalizeReferenceSearchText(value);
  return normalized ? normalized.split(" ") : [];
}

function textContainsTokenPhrase(text, phrase){
  const needleTokens = getReferenceTokens(phrase);
  const haystackTokens = getReferenceTokens(text);
  if(!needleTokens.length || haystackTokens.length < needleTokens.length) return false;

  for(let i = 0; i <= haystackTokens.length - needleTokens.length; i += 1){
    let matched = true;
    for(let j = 0; j < needleTokens.length; j += 1){
      if(haystackTokens[i + j] !== needleTokens[j]){
        matched = false;
        break;
      }
    }
    if(matched) return true;
  }
  return false;
}

function getSearchTokenForms(value){
  const token = String(value || "");
  const forms = new Set(token ? [token] : []);
  if(!/^[a-z]+$/.test(token) || token.length < 4) return forms;

  if(token.endsWith("ies") && token.length > 4) forms.add(`${token.slice(0, -3)}y`);
  if(token.endsWith("s") && !token.endsWith("ss")) forms.add(token.slice(0, -1));
  if(/(?:ses|xes|zes|ches|shes)$/.test(token)) forms.add(token.slice(0, -2));
  if(token === "housing") forms.add("house");
  if(token === "rental" || token === "rentals") forms.add("rent");
  return forms;
}

function searchTokensMatch(left, right){
  const leftForms = getSearchTokenForms(left);
  const rightForms = getSearchTokenForms(right);
  return Array.from(leftForms).some(form => rightForms.has(form));
}

function searchTextMatchesAllTokens(text, queryTokens){
  const textTokens = getReferenceTokens(text);
  return queryTokens.every(queryToken => textTokens.some(textToken => searchTokensMatch(textToken, queryToken)));
}

function isReferenceNameSearchable(resourceName){
  const rawName = String(resourceName || "").trim();
  if(!rawName) return false;
  if(rawName.length >= 4) return true;
  if(/\s/.test(rawName)) return true;
  return /[A-Z]/.test(rawName) && rawName === rawName.toUpperCase();
}

function informationTextReferencesName(informationText, resourceName){
  if(!isReferenceNameSearchable(resourceName)) return false;
  return textContainsTokenPhrase(informationText, resourceName);
}

function getReferenceSnippet(informationText, resourceName){
  const text = String(informationText || "").replace(/\s+/g, " ").trim();
  if(!text) return "";

  const lowerText = text.toLowerCase();
  const lowerName = String(resourceName || "").toLowerCase();
  const directIndex = lowerName ? lowerText.indexOf(lowerName) : -1;
  const center = directIndex >= 0 ? directIndex : 0;
  const start = Math.max(0, center - 70);
  const end = Math.min(text.length, center + Math.max(lowerName.length, 1) + 90);
  const prefix = start > 0 ? "... " : "";
  const suffix = end < text.length ? " ..." : "";
  return `${prefix}${text.slice(start, end)}${suffix}`;
}

function getResourceCategoryEntriesForSearch(resource){
  const categoryIds = Array.isArray(resource && resource.categories)
    ? resource.categories.map(id => String(id || "")).filter(Boolean)
    : [];
  const categoryIdSet = new Set(categoryIds);
  const entries = [];
  const seen = new Set();

  (Array.isArray(data.categories) ? data.categories : [])
    .slice()
    .sort(compareCategoriesByLabel)
    .forEach((cat, index) => {
      const id = String(cat && cat.id || "");
      if(!categoryIdSet.has(id) || seen.has(id)) return;
      seen.add(id);
      entries.push({
        id,
        label:String(cat && cat.label || id || "Uncategorized"),
        order:index
      });
    });

  categoryIds.forEach(id => {
    if(seen.has(id)) return;
    seen.add(id);
    entries.push({ id, label:id, order:9999 });
  });

  if(resourceMatchesListsHeuristic(resource) && !seen.has(LISTS_CATEGORY_ID)){
    seen.add(LISTS_CATEGORY_ID);
    entries.push({ id:LISTS_CATEGORY_ID, label:"Lists", order:9998 });
  }

  return entries;
}

function getSearchTextTokenEntries(value){
  const text = String(value || "");
  const entries = [];
  const expression = /[A-Za-z0-9\u00c0-\u024f]+/g;
  let match;
  while((match = expression.exec(text))){
    const tokens = getReferenceTokens(match[0]);
    if(!tokens.length) continue;
    entries.push({ token:tokens[0], index:match.index, end:match.index + match[0].length });
  }
  return entries;
}

function findSearchTextMatch(text, queryTokens){
  const entries = getSearchTextTokenEntries(text);
  for(const queryToken of queryTokens){
    const entry = entries.find(candidate => searchTokensMatch(candidate.token, queryToken));
    if(entry) return entry;
  }
  return null;
}

function getCenteredSearchText(text, queryTokens){
  const compact = String(text || "").replace(/\s+/g, " ").trim();
  if(!compact) return "";
  const match = findSearchTextMatch(compact, queryTokens);
  if(!match) return compact.length > 190 ? `${compact.slice(0, 187)}...` : compact;

  let start = Math.max(0, match.index - 75);
  let end = Math.min(compact.length, match.end + 110);
  if(start > 0){
    const nextSpace = compact.indexOf(" ", start);
    if(nextSpace >= 0 && nextSpace < match.index) start = nextSpace + 1;
  }
  if(end < compact.length){
    const previousSpace = compact.lastIndexOf(" ", end);
    if(previousSpace > match.end) end = previousSpace;
  }
  return `${start > 0 ? "..." : ""}${compact.slice(start, end)}${end < compact.length ? "..." : ""}`;
}

function getInformationSearchSectionLabel(informationText, queryTokens){
  const text = String(informationText || "").replace(/\r\n?/g, "\n");
  const match = findSearchTextMatch(text, queryTokens);
  if(!match) return "";

  let offset = 0;
  let sectionLabel = "";
  for(const line of text.split("\n")){
    if(offset > match.index) break;
    const trimmed = line.trim();
    if(trimmed === "---"){
      sectionLabel = "";
    }else{
      const heading = trimmed.match(/^\*\*\s*(.*?)\s*\*\*$/);
      if(heading && heading[1]){
        const label = heading[1].trim();
        const normalizedLabel = normalizeReferenceSearchText(label);
        const structuralHeading = /^(eligibility|services?|services offered|population served|contact|hours|languages?|note)(\b|$)/.test(normalizedLabel);
        if(!structuralHeading) sectionLabel = label;
      }
    }
    offset += line.length + 1;
  }
  return sectionLabel;
}

function getSearchFieldSnippet(field, queryTokens){
  if(field.kind === "name") return "Name match";
  if(field.kind === "category") return `Category: ${field.text}`;
  if(field.kind === "type") return `Type: ${field.text}`;
  if(field.kind === "for") return `For: ${field.text}`;
  if(field.kind === "list") return "Category: Lists";

  const centered = getCenteredSearchText(field.text, queryTokens);
  return centered ? `${field.label}: ${centered}` : `${field.label} match`;
}

function getResourceSearchFields(resource){
  const fields = [{ kind:"name", label:"Name", text:String(resource && resource.name || ""), rank:0 }];
  const categoriesById = new Map((Array.isArray(data.categories) ? data.categories : [])
    .map(category => [String(category && category.id || ""), category]));

  (Array.isArray(resource && resource.categories) ? resource.categories : []).forEach(categoryId => {
    const id = String(categoryId || "");
    const category = categoriesById.get(id);
    fields.push({ kind:"category", label:"Category", text:String(category && category.label || id), rank:1 });
    normalizeCategoryFilters(resource && resource.categoryFilters && resource.categoryFilters[id]).forEach(filter => {
      fields.push({ kind:"type", label:"Type", text:filter, rank:1 });
    });
  });
  if(resourceMatchesListsHeuristic(resource)) fields.push({ kind:"list", label:"Category", text:"Lists", rank:1 });
  normalizeTaxonomyLabels(resource && resource.forGroups).forEach(group => {
    fields.push({ kind:"for", label:"For", text:group, rank:1 });
  });

  fields.push(
    { kind:"description", label:"Description", text:String(resource && resource.description || ""), rank:2 },
    { kind:"information", label:"Information", text:String(resource && resource.informationText || ""), rank:3 },
    { kind:"phone", label:"Phone", text:String(resource && resource.phone || ""), rank:4 },
    { kind:"address", label:"Address", text:String(resource && resource.address || ""), rank:4 },
    { kind:"website", label:"Website", text:String(resource && resource.website || ""), rank:4 },
    { kind:"hours", label:"Hours", text:String(resource && resource.hours || ""), rank:4 }
  );
  getResourcePDFs(resource).forEach(pdf => {
    fields.push({ kind:"pdf", label:"PDF", text:String(pdf && pdf.name || ""), rank:5 });
  });
  return fields.filter(field => getReferenceTokens(field.text).length);
}

function getResourceSearchMatch(resource, queryTokens){
  const fields = getResourceSearchFields(resource);
  const combinedText = fields.map(field => field.text).join(" ");
  if(!searchTextMatchesAllTokens(combinedText, queryTokens)) return null;

  const completeField = fields.find(field => searchTextMatchesAllTokens(field.text, queryTokens));
  if(completeField){
    const sectionLabel = completeField.kind === "information" && resourceMatchesListsHeuristic(resource)
      ? getInformationSearchSectionLabel(completeField.text, queryTokens)
      : "";
    return {
      rank:completeField.rank,
      snippet:getSearchFieldSnippet(completeField, queryTokens),
      sectionLabel,
      fieldLabel:completeField.label
    };
  }

  const matchingFields = fields.filter(field =>
    queryTokens.some(queryToken => searchTextMatchesAllTokens(field.text, [queryToken]))
  );
  const labels = Array.from(new Set(matchingFields.map(field => field.label)));
  const bestRank = matchingFields.reduce((rank, field) => Math.min(rank, field.rank), 9);
  return { rank:10 + bestRank, snippet:`Matches across: ${labels.join(", ")}`, sectionLabel:"", fieldLabel:"Multiple fields" };
}

function buildSearchResults(query){
  const cleanQuery = String(query || "").trim();
  const empty = { query:cleanQuery, mode:"none", items:[] };
  const queryTokens = getReferenceTokens(cleanQuery);
  if(!queryTokens.length) return empty;

  const resources = Array.isArray(data.resources) ? data.resources : [];
  const items = resources.map(resource => {
    const match = getResourceSearchMatch(resource, queryTokens);
    if(!match) return null;
    return {
      resourceId:String(resource && resource.id || ""),
      resourceName:String(resource && resource.name || "(Unnamed resource)"),
      categories:getResourceCategoryEntriesForSearch(resource),
      ...match
    };
  }).filter(Boolean).sort((a, b) => {
    if(a.rank !== b.rank) return a.rank - b.rank;
    return a.resourceName.localeCompare(b.resourceName, undefined, { sensitivity:"base" });
  });

  return { query:cleanQuery, mode:items.length ? "results" : "none", items };
}

function openSearchResult(resourceId){
  const nextResource = String(resourceId || "");
  if(!nextResource) return;
  searchDetailResourceId = nextResource;
  searchResultReturnResourceId = nextResource;
  isSearchOpen = false;
  view = "search-detail";
  safeRender();
}

function openSearchResultInCategory(categoryId, resourceId){
  const nextCategory = String(categoryId || "");
  const nextResource = String(resourceId || "");
  if(!nextCategory || !nextResource) return;
  currentCategory = nextCategory;
  setSelectedCategoryFilters(currentCategory, []);
  expandedSearchResourceId = nextResource;
  searchDetailResourceId = "";
  isSearchOpen = false;
  view = "category";
  safeRender();
  window.setTimeout(() => {
    const card = Array.from(document.querySelectorAll(".resource-card[data-resource-id]"))
      .find(candidate => candidate.dataset.resourceId === nextResource);
    if(!card) return;
    if(typeof card.scrollIntoView === "function") card.scrollIntoView({ block:"center" });
    if(typeof card.focus === "function") card.focus({ preventScroll:true });
  }, 0);
}

function resourceIsListStyle(resource){
  return resourceMatchesListsHeuristic(resource);
}

function findReferencingLists(resourceOrName){
  const targetId = resourceOrName && typeof resourceOrName === "object"
    ? String(resourceOrName.id || "")
    : "";
  const resourceName = resourceOrName && typeof resourceOrName === "object"
    ? resourceOrName.name
    : resourceOrName;
  const needle = String(resourceName || "").trim();
  if(!isReferenceNameSearchable(needle)) return [];

  const matches = [];
  const seen = new Set();
  (Array.isArray(data.resources) ? data.resources : []).forEach(resource => {
    const resourceId = String(resource && resource.id || "");
    if(targetId && resourceId === targetId) return;
    if(!resourceIsListStyle(resource)) return;
    const informationText = String(resource && resource.informationText || "");
    if(!informationTextReferencesName(informationText, needle)) return;

    const listName = String(resource && resource.name || "(Unnamed list)");
    const key = String(resource && resource.id || listName).toLowerCase();
    if(seen.has(key)) return;
    seen.add(key);
    const categoryEntries = getReferenceCategoryEntries(resource);
    matches.push({
      categoryLabels: categoryEntries.map(category => category.label),
      categoryOrder: Math.min(...categoryEntries.map(category => category.order)),
      listName,
      snippet: getReferenceSnippet(informationText, needle)
    });
  });

  return matches.sort((a, b) => {
    if(a.categoryOrder !== b.categoryOrder) return a.categoryOrder - b.categoryOrder;
    return a.listName.localeCompare(b.listName, undefined, { sensitivity:"base" });
  });
}

function getReferenceModal(){
  let modal = document.getElementById("referenceModal");
  if(modal) return modal;

  modal = document.createElement("div");
  modal.id = "referenceModal";
  modal.className = "reference-modal hidden";
  modal.addEventListener("click", event => {
    if(event.target === modal) closeReferenceModal();
  });
  document.body.appendChild(modal);
  return modal;
}

function closeReferenceModal(){
  const modal = document.getElementById("referenceModal");
  if(modal) modal.classList.add("hidden");
}

function showReferenceModal(resourceName, matches){
  const modal = getReferenceModal();
  const matchItems = Array.isArray(matches) ? matches : [];
  const bodyHTML = matchItems.length
    ? matchItems.map(match => {
      const categoryLabels = Array.isArray(match && match.categoryLabels) && match.categoryLabels.length
        ? match.categoryLabels
        : ["Uncategorized"];
      return `
        <div class="reference-match">
          <div class="reference-match-name">${escapeHTML(match && match.listName || "(Unnamed list)")}</div>
          <div class="reference-match-categories">Categories: ${escapeHTML(categoryLabels.join(", "))}</div>
          ${match && match.snippet ? `<div class="reference-match-snippet">${escapeHTML(match.snippet)}</div>` : ""}
        </div>
      `;
    }).join("")
    : `<p class="reference-empty">No list resources reference this resource.</p>`;

  modal.innerHTML = `
    <div class="reference-modal-panel" role="dialog" aria-modal="true" aria-labelledby="referenceModalTitle" aria-describedby="referenceModalSubtitle">
      <div class="reference-modal-header">
        <div>
          <div id="referenceModalTitle" class="reference-modal-title">Referenced By Lists</div>
          <div id="referenceModalSubtitle" class="reference-modal-subtitle">${escapeHTML(resourceName)}</div>
        </div>
        <button class="button reference-modal-close" type="button">Close</button>
      </div>
      <div class="reference-modal-body">${bodyHTML}</div>
    </div>
  `;

  const closeBtn = modal.querySelector(".reference-modal-close");
  if(closeBtn) closeBtn.addEventListener("click", closeReferenceModal);
  modal.classList.remove("hidden");
  if(closeBtn) closeBtn.focus();
}

function handleAdminResourceReferenceClick(event, sel){
  if(!event.altKey) return;
  window.setTimeout(() => {
    if(!(view === "admin" && adminTab === "resources" && !adminResourceEditMode)) return;
    const resourceId = sel && sel.value ? String(sel.value) : "";
    const resource = (data.resources || []).find(res => String(res && res.id || "") === resourceId);
    const resourceName = String(resource && resource.name || "").trim();
    if(!resourceName) return;
    selectedResourceId = resourceId;
    showReferenceModal(resourceName, findReferencingLists(resource));
  }, 0);
}

function handleAdminListReferenceInspection(event, resource){
  if(!event.altKey || !isAdminVisible) return false;
  const resourceName = String(resource && resource.name || "").trim();
  if(!resourceName) return false;

  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  showReferenceModal(resourceName, findReferencingLists(resource));
  return true;
}
