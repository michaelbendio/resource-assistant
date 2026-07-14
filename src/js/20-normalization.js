// ============================================================
// DATA NORMALIZATION
// ============================================================
// Data can come from three places: embedded seed JSON, localStorage, and imported
// resource package JSON files. These helpers convert older or partial records into
// the canonical shapes expected by rendering, admin editing, persistence, and
// package merging.

function normalizeResourceInformation(r){
  if(!r || typeof r !== "object") return false;
  if(typeof r.informationText !== "string" || !r.informationText.trim()){
    r.informationText = typeof r.servicesText === "string" ? r.servicesText : "";
  }
  if("servicesText" in r) delete r.servicesText;
  return false;
}

function normalizeResourceVerifiedOn(r){
  // Canonical: verifiedOn in MM/YY (or null). Legacy aliases are consumed then removed.
  if(!r || typeof r !== "object") return;
  const preferred = coerceVerifiedOnToMMYY(r.verifiedOn);
  if(preferred){
    r.verifiedOn = preferred;
  }else{
    const legacyReviewed = coerceVerifiedOnToMMYY(r.reviewedOn);
    const legacyVerifiedDate = coerceVerifiedOnToMMYY(r.verifiedDate);
    r.verifiedOn = legacyReviewed || legacyVerifiedDate || null;
  }
  if("reviewedOn" in r) delete r.reviewedOn;
  if("verifiedDate" in r) delete r.verifiedDate;
}

function normalizeDataInformationShape(data){
  if(!data.resources) return;
  data.resources.forEach(normalizeResourceInformation);
}

function normalizeLegacyPackageShape(nextData){
  if(!nextData || typeof nextData !== "object") return;
  if("version" in nextData) delete nextData.version;
  if("tags" in nextData) delete nextData.tags;
  if(Array.isArray(nextData.categories)){
    nextData.categories.forEach(category => {
      if(!category || typeof category !== "object") return;
      if("displayOrder" in category) delete category.displayOrder;
      if("icon" in category) delete category.icon;
    });
  }
  if(Array.isArray(nextData.resources)){
    nextData.resources.forEach(resource => {
      if(!resource || typeof resource !== "object") return;
      ["displayOrder", "evaluation", "favorite", "verifiedBy", "tags"].forEach(key => {
        if(key in resource) delete resource[key];
      });
    });
  }
}

function normalizeDataVerifiedOnShape(nextData){
  if(!nextData || !Array.isArray(nextData.resources)) return;
  nextData.resources.forEach(normalizeResourceVerifiedOn);
}

function normalizeResourcePDFs(r){
  // Canonical: pdfs array of { id, name, path }. Legacy pdf path is preserved.
  if(!r || typeof r !== "object") return;
  const attachments = [];
  const seenPaths = new Set();

  if(Array.isArray(r.pdfs)){
    r.pdfs.forEach((pdf, index) => {
      if(!pdf || typeof pdf !== "object") return;
      const path = typeof pdf.path === "string" ? pdf.path.trim() : "";
      if(!path || seenPaths.has(path)) return;
      seenPaths.add(path);
      const id = String(pdf.id || "").trim() || stablePDFIdFromPath(`${path}:${index}`);
      attachments.push({
        id,
        name: String(pdf.name || pdfNameFromPath(path)).trim() || "PDF",
        path
      });
    });
  }

  const legacyPath = typeof r.pdf === "string" ? r.pdf.trim() : "";
  if(legacyPath && !seenPaths.has(legacyPath)){
    attachments.push({
      id: stablePDFIdFromPath(legacyPath),
      name: pdfNameFromPath(legacyPath),
      path: legacyPath
    });
  }

  r.pdfs = attachments;
  if(typeof r.pdf !== "string" && "pdf" in r) delete r.pdf;
}

function normalizeDataPDFShape(nextData){
  if(!nextData || !Array.isArray(nextData.resources)) return;
  nextData.resources.forEach(normalizeResourcePDFs);
}

function getResourcePDFs(resource){
  normalizeResourcePDFs(resource);
  return Array.isArray(resource && resource.pdfs) ? resource.pdfs : [];
}

function collectPDFPathsFromResource(resource, { includeLegacy = true } = {}){
  if(!resource || typeof resource !== "object") return [];
  const paths = [];
  const seen = new Set();
  getResourcePDFs(resource).forEach(pdf => {
    const path = typeof pdf.path === "string" ? pdf.path.trim() : "";
    if(!path || seen.has(path)) return;
    seen.add(path);
    paths.push(path);
  });
  if(includeLegacy && typeof resource.pdf === "string"){
    const legacyPath = resource.pdf.trim();
    if(legacyPath && !seen.has(legacyPath)) paths.push(legacyPath);
  }
  return paths;
}

function collectPDFPathsFromResources(resources){
  const paths = [];
  const seen = new Set();
  (Array.isArray(resources) ? resources : []).forEach(resource => {
    collectPDFPathsFromResource(resource).forEach(path => {
      if(seen.has(path)) return;
      seen.add(path);
      paths.push(path);
    });
  });
  return paths;
}

function removePDFAttachmentFromResource(resource, pdfId){
  if(!resource || typeof resource !== "object") return null;
  normalizeResourcePDFs(resource);
  const removed = resource.pdfs.find(pdf => pdf.id === pdfId);
  if(!removed) return null;
  resource.pdfs = resource.pdfs.filter(pdf => pdf.id !== pdfId);
  if(typeof resource.pdf === "string" && resource.pdf.trim() === removed.path){
    delete resource.pdf;
  }
  return removed;
}

function isPDFPathReferencedInResources(resources, path){
  const key = String(path || "").trim();
  if(!key) return false;
  return (Array.isArray(resources) ? resources : []).some(resource => collectPDFPathsFromResource(resource).includes(key));
}

function isPDFPathReferenced(path){
  return isPDFPathReferencedInResources(data.resources || [], path);
}

function applyDefaultCategoryPreset(nextData){
  if(!nextData || typeof nextData !== "object") return false;
  if(nextData.categoryPresetVersion === 1) return false;
  nextData.categoryPresetVersion = 1;
  return true;
}

function formatMMYYFromDate(d){
  const mm = String(d.getMonth()+1).padStart(2,"0");
  const yy = String(d.getFullYear()).slice(-2);
  return `${mm}/${yy}`;
}

function formatDateOnly(isoString){
  if(!isoString) return "(none)";
  const date = new Date(isoString);
  if(Number.isNaN(date.getTime())) return String(isoString);
  return date.toLocaleDateString(undefined, { year:"numeric", month:"long", day:"numeric" });
}

function formatDateTimeUTC(isoString){
  if(!isoString) return "(none)";
  const date = new Date(isoString);
  if(Number.isNaN(date.getTime())) return String(isoString);
  const month = date.toLocaleString(undefined, { month:"long", timeZone:"UTC" });
  const day = date.getUTCDate();
  const year = date.getUTCFullYear();
  const hour = date.getUTCHours();
  const minute = String(date.getUTCMinutes()).padStart(2, "0");
  return `${month} ${day}, ${year}, ${hour}:${minute} UTC`;
}

function parseMMYYToMonthIndex(mmyy){
  const match = String(mmyy || "").trim().match(/^(0[1-9]|1[0-2])\/(\d{2})$/);
  if(!match) return null;
  const month = Number(match[1]);
  const yy = Number(match[2]);
  const year = 2000 + yy;
  return year * 12 + (month - 1);
}

function isValidMMYY(value){
  return parseMMYYToMonthIndex(value) !== null;
}

function formatVerifiedOnForDisplay(verifiedOn){
  return isValidMMYY(verifiedOn) ? String(verifiedOn).trim() : "----";
}

function parseLegacyVerifiedOnToMMYY(raw){
  const text = String(raw || "").trim();
  if(!text) return null;

  const mmyy = text.match(/^(\d{1,2})[\/\-](\d{2})$/);
  if(mmyy){
    const month = Number(mmyy[1]);
    const yy = Number(mmyy[2]);
    if(month >= 1 && month <= 12) return `${String(month).padStart(2,"0")}/${String(yy).padStart(2,"0")}`;
  }

  const withYear = text.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2}|\d{4})$/);
  if(withYear){
    const month = Number(withYear[1]);
    const yearRaw = withYear[3];
    if(month >= 1 && month <= 12){
      const yy = yearRaw.length === 4 ? Number(yearRaw.slice(-2)) : Number(yearRaw);
      return `${String(month).padStart(2,"0")}/${String(yy).padStart(2,"0")}`;
    }
  }

  const compact = text.match(/^(\d{2})(\d{2})(\d{2})$/);
  if(compact){
    const month = Number(compact[1]);
    const yy = Number(compact[3]);
    if(month >= 1 && month <= 12) return `${compact[1]}/${String(yy).padStart(2,"0")}`;
  }

  if(/^\d{4}-\d{2}-\d{2}$/.test(text)){
    const isoDate = new Date(`${text}T00:00:00`);
    if(!Number.isNaN(isoDate.getTime())) return formatMMYYFromDate(isoDate);
  }

  const parsed = new Date(text);
  if(!Number.isNaN(parsed.getTime())) return formatMMYYFromDate(parsed);
  return null;
}

function coerceVerifiedOnToMMYY(value){
  if(value == null) return null;
  const text = String(value).trim();
  if(!text) return null;
  if(isValidMMYY(text)) return text;
  const parsed = parseLegacyVerifiedOnToMMYY(text);
  return parsed && isValidMMYY(parsed) ? parsed : null;
}

function validateVerifiedOnInput(value){
  const text = String(value || "").trim();
  if(!text) return { valid:true, normalized:null, message:"" };
  if(!isValidMMYY(text)){
    return { valid:false, normalized:null, message:"Use MM/YY (MM 01-12)." };
  }
  return { valid:true, normalized:text, message:"" };
}

function compareResourcesByName(a, b){
  return String((a && a.name) || "").localeCompare(String((b && b.name) || ""), undefined, { sensitivity:"base" });
}

function getAdminResourceBrowseList(){
  const resources = data.resources.slice();
  if(!adminShowVerifiedDates){
    return resources.sort(compareResourcesByName);
  }
  return resources.sort((a, b) => {
    const aMonth = parseMMYYToMonthIndex(a.verifiedOn);
    const bMonth = parseMMYYToMonthIndex(b.verifiedOn);
    const aVerified = aMonth !== null;
    const bVerified = bMonth !== null;
    if(aVerified !== bVerified) return aVerified ? -1 : 1;
    if(aVerified && bVerified && aMonth !== bMonth) return aMonth - bMonth;
    return compareResourcesByName(a, b);
  });
}

function buildAdminDeleteConfirmation(kind, name){
  if(kind === "resource"){
    return [
      `Are you sure you want to delete the resource '${name}'?`,
      "",
      "This removes it from all categories and the print selection.",
      "Undo will be available in Admin to restore what you deleted."
    ].join("\n");
  }
  if(kind === "category"){
    return [
      `Are you sure you want to delete the category '${name}'?`,
      "",
      "Resources are not deleted, but they will no longer appear under this category.",
      "Undo will be available in Admin to restore what you deleted."
    ].join("\n");
  }
  return "Are you sure?";
}

function canonicalizeTaxonomyLabel(label){
  return String(label || "").trim();
}

function normalizeTaxonomyLabels(labels){
  const normalized = [];
  const seen = new Set();
  const source = Array.isArray(labels)
    ? labels
    : (typeof labels === "string" ? labels.split(/[,\n]/) : []);

  source.forEach(rawLabel => {
    if(typeof rawLabel !== "string" && typeof rawLabel !== "number") return;
    const label = canonicalizeTaxonomyLabel(rawLabel);
    if(!label) return;
    const key = label.toLowerCase();
    if(seen.has(key)) return;
    seen.add(key);
    normalized.push(label);
  });
  return normalized;
}

function normalizeLegacyTagsShape(nextData){
  if(!nextData || typeof nextData !== "object") return;
  if("tags" in nextData) delete nextData.tags;
  if(!Array.isArray(nextData.resources)) return;
  nextData.resources.forEach(r => {
    if(r && typeof r === "object" && "tags" in r) delete r.tags;
  });
}

function normalizeCategoryFilters(filters){
  return normalizeTaxonomyLabels(filters);
}

function normalizeDataCategoryFilterShape(nextData){
  if(!nextData || typeof nextData !== "object") return;
  if(Array.isArray(nextData.categories)){
    nextData.categories.forEach(category => {
      if(!category || typeof category !== "object") return;
      category.filters = normalizeCategoryFilters(category.filters);
    });
  }
  if(!Array.isArray(nextData.resources)) return;
  nextData.resources.forEach(resource => {
    const source = resource && typeof resource.categoryFilters === "object" && !Array.isArray(resource.categoryFilters)
      ? resource.categoryFilters
      : {};
    const normalized = {};
    Object.keys(source).forEach(categoryId => {
      const filters = normalizeCategoryFilters(source[categoryId]);
      if(filters.length) normalized[categoryId] = filters;
    });
    resource.categoryFilters = normalized;
  });

  // A resource type must remain selectable after package import. Older packages
  // sometimes stored a categoryFilters value without declaring the same value
  // on the category, which made the assignment invisible in Admin and public
  // filtering. Preserve those active values in the category definition.
  const categoriesById = new Map(nextData.categories
    .filter(category => category && category.id)
    .map(category => [String(category.id), category]));
  nextData.resources.forEach(resource => {
    const filterMap = resource && resource.categoryFilters && typeof resource.categoryFilters === "object"
      ? resource.categoryFilters
      : {};
    Object.keys(filterMap).forEach(categoryId => {
      const category = categoriesById.get(String(categoryId));
      if(!category) return;
      category.filters = normalizeCategoryFilters([
        ...normalizeCategoryFilters(category.filters),
        ...normalizeCategoryFilters(filterMap[categoryId])
      ]);
    });
  });
}

function normalizeDataForGroupsShape(nextData){
  if(!nextData || typeof nextData !== "object") return;
  nextData.forGroups = normalizeTaxonomyLabels(nextData.forGroups)
    .sort((a,b)=>a.localeCompare(b, undefined, { sensitivity:"base" }));
  if(!Array.isArray(nextData.resources)) return;
  nextData.resources.forEach(resource => {
    if(!resource || typeof resource !== "object") return;
    resource.forGroups = normalizeTaxonomyLabels(resource.forGroups);
  });
}

const INFORMATION_ADDITIONAL_LABEL = "Additional text:";

// Resource Information is stored as plain text. Strip the old editor heading
// when a resource still has it so the saved text remains plain.
function trimOuterBlankLines(lines){
  const next = lines.slice();
  while(next.length && next[0].trim() === "") next.shift();
  while(next.length && next[next.length - 1].trim() === "") next.pop();
  return next;
}

function parseInformationText(text){
  const lines = String(text || "").replace(/\r\n?/g, "\n").split("\n");
  const stripped = lines.filter(line => line.trim() !== INFORMATION_ADDITIONAL_LABEL);
  return { additional:trimOuterBlankLines(stripped).join("\n") };
}

function composeInformationText(draft){
  return String(draft && draft.additional || "").trim();
}

function applyInformationMarkup(escapedText){
  return escapedText
    .replace(/__\*\*([^_\n][\s\S]*?)\*\*__/g, "<strong><u>$1</u></strong>")
    .replace(/\*\*__([^*\n][\s\S]*?)__\*\*/g, "<strong><u>$1</u></strong>")
    .replace(/\*\*([^*\n]+?)\*\*/g, "<strong>$1</strong>")
    .replace(/__([^_\n]+?)__/g, "<u>$1</u>");
}

function renderInformationMarkupHTML(text){
  const normalized = String(text || "").replace(/\r\n?/g, "\n");
  const lines = normalized.split("\n");
  const out = [];
  let listItems = [];

  function flushList(){
    if(!listItems.length) return;
    out.push(`<ul>${listItems.join("")}</ul>`);
    listItems = [];
  }

  lines.forEach(line => {
    const trimmed = line.trim();
    const isDivider = trimmed === "---";
    const bulletMatch = line.match(/^\s*(?:\*|-|•)\s+(.*)$/);

    if(isDivider){
      flushList();
      out.push("<hr>");
      return;
    }

    if(bulletMatch){
      const bulletText = applyInformationMarkup(escapeHTML(bulletMatch[1]));
      listItems.push(`<li>${bulletText}</li>`);
      return;
    }

    flushList();
    if(line === ""){
      out.push('<div class="information-line information-blank">&nbsp;</div>');
      return;
    }
    out.push(`<div class="information-line">${applyInformationMarkup(escapeHTML(line))}</div>`);
  });

  flushList();
  return out.join("");
}

function renderInformationHTML(text){
  return renderInformationMarkupHTML(composeInformationText(parseInformationText(text)));
}

function fitTextareaToText(textarea){
  if(!textarea) return;
  textarea.style.height = "auto";
  textarea.style.height = `${textarea.scrollHeight}px`;
}
