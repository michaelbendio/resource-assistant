// Validate optional administrative data before it can replace an office package.
function resourceQuestionErrors(questions){
  if(questions === undefined) return [];
  if(!Array.isArray(questions)) return ["openQuestions must be an array."];
  const errors = [], ids = new Set();
  const text = value => typeof value === "string" && value.trim();
  const decision = value => value && typeof value === "object" && !Array.isArray(value)
    && ["open", "resolved"].includes(value.status) && typeof value.resolution === "string"
    && (value.status !== "resolved" || text(value.resolution));
  questions.forEach((q, index) => {
    if(!q || typeof q !== "object" || Array.isArray(q)){
      errors.push(`Question ${index + 1} must be an object.`); return;
    }
    if(!text(q.id) || !text(q.question) || !text(q.explanation) || !decision(q))
      errors.push(`Question ${index + 1} needs an id, question, explanation, valid status and resolution note.`);
    if(ids.has(q.id)) errors.push(`Duplicate question id '${q.id}'.`);
    ids.add(q.id);
    if(q.history !== undefined && (!Array.isArray(q.history) || q.history.some(h => !decision(h) || !text(h.changedAt) || !Number.isFinite(Date.parse(h.changedAt)))))
      errors.push(`Question ${index + 1} has invalid decision history.`);
    if(q.resolutionConflict !== undefined && typeof q.resolutionConflict !== "boolean")
      errors.push(`Question ${index + 1} has an invalid conflict flag.`);
    if(q.decisionAlternatives !== undefined && (!Array.isArray(q.decisionAlternatives) || q.decisionAlternatives.some(h => !decision(h))))
      errors.push(`Question ${index + 1} has invalid competing decisions.`);
    if(q.resolutionConflict && (q.status !== "open" || !Array.isArray(q.decisionAlternatives) || q.decisionAlternatives.length < 2))
      errors.push(`Question ${index + 1} must keep competing decisions open for the curator.`);
  });
  return errors;
}

function questionDecisionKey(q){ return JSON.stringify([q.status, q.resolution]); }
function questionHistoryKey(h){ return JSON.stringify([h.changedAt, h.status, h.resolution]); }
function mergeResourceQuestions(local, incoming){
  if(local === undefined && incoming === undefined) return undefined;
  const result = JSON.parse(JSON.stringify(local || []));
  for(const q of incoming || []){
    const index = result.findIndex(old => old.id === q.id);
    if(index < 0){ result.push(JSON.parse(JSON.stringify(q))); continue; }
    const old = result[index];
    if(old.question !== q.question || old.explanation !== q.explanation)
      throw new Error(`Question '${q.id}' has different text in these packages. Keep both original packages and settle its identity before merging.`);
    const a = new Set((old.history || []).map(questionHistoryKey));
    const b = new Set((q.history || []).map(questionHistoryKey));
    const descendant = (x, y) => x.size > y.size && [...y].every(key => x.has(key));
    // Decision ancestry is independent of a resource's unrelated lastModified.
    let chosen = descendant(a, b) ? old : descendant(b, a) ? q : null;
    if(!chosen && !old.resolutionConflict && !q.resolutionConflict && questionDecisionKey(old) === questionDecisionKey(q)) chosen = old;
    const history = [...new Map([...(old.history || []), ...(q.history || [])].map(h => [questionHistoryKey(h), h])).values()]
      .sort((x, y) => questionHistoryKey(x).localeCompare(questionHistoryKey(y)));
    const merged = {...q, ...old};
    if(old.history !== undefined || q.history !== undefined) merged.history = history;
    if(chosen){
      merged.status = chosen.status; merged.resolution = chosen.resolution;
      delete merged.resolutionConflict; delete merged.decisionAlternatives;
      if(chosen.resolutionConflict){ merged.resolutionConflict = true; merged.decisionAlternatives = chosen.decisionAlternatives; }
    }else{
      merged.status = "open"; merged.resolution = ""; merged.resolutionConflict = true;
      const alternatives = value => value.resolutionConflict ? value.decisionAlternatives : [{status:value.status, resolution:value.resolution}];
      merged.decisionAlternatives = [...new Map([...alternatives(old), ...alternatives(q)].map(h => [questionDecisionKey(h), h])).values()];
    }
    result[index] = JSON.parse(JSON.stringify(merged));
  }
  return result;
}

// Curator handoff travels with each resource; it never enters patron text.
function resourceQuestions(resource){
  return (Array.isArray(resource && resource.openQuestions) ? resource.openQuestions : [])
    .filter(q => q && typeof q.id === "string" && typeof q.question === "string" && q.question.trim());
}

function resourceOpenQuestionLabel(resource){
  const count = resourceQuestions(resource).filter(q => q.status !== "resolved").length;
  return count ? (count === 1 ? "open question" : `${count} open questions`) : "";
}

function renderResourceQuestionsSection(resource){
  const questions = resourceQuestions(resource);
  if(!questions.length) return "";
  const renderQuestion = q => `<div data-question-id="${escapeHTML(q.id)}" style="margin:16px 0;">
      <strong class="${q.status === "resolved" ? "" : "resource-open-question-text"}">${escapeHTML(q.question)}</strong>
      <p style="white-space:pre-wrap;">${escapeHTML(q.explanation || "")}</p>
      ${q.resolutionConflict ? `<p class="resource-open-question-text">Saved decisions disagree. Review both notes and record the decision to use.</p>${q.decisionAlternatives.map(h => `<p>${escapeHTML(h.status)}: ${escapeHTML(h.resolution || "No resolution note")}</p>`).join("")}` : ""}
      <label>What did you find out?<br><textarea data-question-note style="width:100%;min-height:60px;">${escapeHTML(q.resolution || "")}</textarea></label>
      <p>Include how you checked and, if you contacted someone, when. Update the resource’s information or categories if needed.</p>
      <label style="display:block;"><input type="checkbox" data-question-resolved ${q.status === "resolved" ? "checked" : ""}> Resolved</label>
      ${Array.isArray(q.history) && q.history.length ? `<details><summary>Earlier question decisions</summary>${q.history.map(h => `<p>${escapeHTML(h.changedAt || "")} · ${escapeHTML(h.status || "")}<br>${escapeHTML(h.resolution || "")}</p>`).join("")}</details>` : ""}
    </div>`;
  const open = questions.filter(q => q.status !== "resolved");
  const resolved = questions.filter(q => q.status === "resolved");
  return `<section id="res_open_questions" style="padding:14px;border:1px solid #b7791f;border-radius:8px;margin:12px 0;">
    <h3 style="margin-top:0;">Questions for the curator</h3>
    <p>Scout found specific questions it could not settle. These notes do not appear in patron handouts.</p>
    ${open.map(renderQuestion).join("")}
    ${resolved.length ? `<details data-resolved-questions><summary>Resolved questions (${resolved.length})</summary>${resolved.map(renderQuestion).join("")}</details>` : ""}
    <p id="res_question_warning" role="alert" style="color:#a00;"></p>
  </section>`;
}

function resourceQuestionDraft(){
  const resource = editing && editing.kind === "resource" ? data.resources[editing.idx] : null;
  if(!Array.isArray(resource && resource.openQuestions)) return undefined;
  const questions = JSON.parse(JSON.stringify(resource.openQuestions));
  document.querySelectorAll("#res_open_questions [data-question-id]").forEach(row => {
    const q = questions.find(q => q && q.id === row.dataset.questionId);
    if(q){
      q.status = row.querySelector("[data-question-resolved]").checked ? "resolved" : "open";
      q.resolution = row.querySelector("[data-question-note]").value.trim();
    }
  });
  return questions;
}

function validateResourceQuestions(draft){
  const invalid = (draft.openQuestions || []).some(q => q && q.status === "resolved" && !String(q.resolution || "").trim());
  const warning = document.getElementById("res_question_warning");
  if(warning) warning.textContent = invalid ? "Add a short resolution note before marking a question resolved." : "";
  return !invalid;
}

function applyResourceQuestions(resource, draft){
  if(!Array.isArray(draft.openQuestions)) return;
  const previous = Array.isArray(resource.openQuestions) ? resource.openQuestions : [];
  resource.openQuestions = draft.openQuestions.map(q => {
    if(!q || typeof q !== "object") return q;
    const old = previous.find(x => x && x.id === q.id);
    const next = JSON.parse(JSON.stringify(q));
    if(old && ((old.status || "open") !== (q.status || "open") || (old.resolution || "") !== (q.resolution || ""))){
      delete next.resolutionConflict; delete next.decisionAlternatives;
      next.history = [...(Array.isArray(old.history) ? old.history : []),
        {changedAt:nowISO(), status:q.status || "open", resolution:q.resolution || ""}];
    }
    return next;
  });
}
