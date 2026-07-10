// ============================================================
// UTILITIES
// ============================================================

function nowISO(){ return new Date().toISOString(); }
function escapeHTML(str){ return (str||"").replace(/[&<>"']/g, m=>({ "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;" }[m])); }
function displayContactValue(value){
  const trimmed = typeof value === "string" ? value.trim() : "";
  return /^none$/i.test(trimmed) ? "" : trimmed;
}
function normalizeWebsiteURL(url){
  const trimmed = typeof url === "string" ? url.trim() : "";
  if(!trimmed) return "";
  if(/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}
function generateResourceId(){
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2,"0"))
    .join("");
}
function filenameFromPath(path){
  const clean = String(path || "").split(/[?#]/)[0];
  return clean.split("/").filter(Boolean).pop() || "";
}
function safePDFFileName(name){
  const fallback = "attachment.pdf";
  const base = filenameFromPath(name) || fallback;
  const safe = base.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || fallback;
  return /\.pdf$/i.test(safe) ? safe : `${safe}.pdf`;
}
function stablePDFIdFromPath(path, fallback = "pdf"){
  const text = String(path || fallback);
  let hash = 2166136261;
  for(let i = 0; i < text.length; i += 1){
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `pdf-${(hash >>> 0).toString(16)}`;
}
function pdfNameFromPath(path){
  return filenameFromPath(path) || "PDF";
}
function buildPDFStoragePath(resourceId, attachmentId, fileName){
  return `pdfs/${encodeURIComponent(resourceId || "resource")}/${attachmentId}-${safePDFFileName(fileName)}`;
}
function showToast(message, options = {}){
  let toast = document.getElementById("appToast");
  if(!toast){
    toast = document.createElement("div");
    toast.id = "appToast";
    toast.className = "app-toast hidden";
    toast.setAttribute("role", "status");
    toast.setAttribute("aria-live", "polite");
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.toggle("important", !!options.important);
  toast.classList.remove("hidden");
  if(showToast.timer) clearTimeout(showToast.timer);
  if(options.sticky){
    showToast.timer = null;
  }else{
    showToast.timer = setTimeout(() => {
      toast.classList.add("hidden");
      toast.classList.remove("important");
    }, 4500);
  }
}
