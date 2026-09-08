#!/usr/bin/env python3
"""Exercise open-question handoff in an isolated preview, never live office storage."""
import argparse
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

p=argparse.ArgumentParser();p.add_argument('html',type=Path);p.add_argument('--output',type=Path,required=True);args=p.parse_args()
args.output.mkdir(parents=True,exist_ok=True)
with sync_playwright() as pw:
    b=pw.chromium.launch(executable_path='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless=True)
    page=b.new_page(viewport={'width':768,'height':1024});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto(args.html.resolve().as_uri());page.wait_for_function('typeof resourceQuestions === "function"')
    page.evaluate('async()=>await window.scoutPreviewAssetsReady')
    before=page.evaluate("structuredClone(data.resources.find(r=>r.id==='provo-city-housing-authority'))")
    question=before['openQuestions'][0]['question']
    assert 'open question' not in page.locator('#appView').inner_text().lower()
    page.evaluate("()=>{setAdminVisibility(true);adminTab='resources';setView('admin');}")
    row=page.locator('[data-resource-id="provo-city-housing-authority"]')
    assert row.inner_text().endswith('2 open questions')
    assert row.locator('.resource-open-question-label').evaluate("e=>getComputedStyle(e).color")== 'rgb(176, 0, 32)'
    assert row.locator('.resource-open-question-label').evaluate("e=>getComputedStyle(e).fontWeight")== '700'
    row.scroll_into_view_if_needed();page.screenshot(path=str(args.output/'admin-list.png'))
    row.click();page.get_by_role('button',name='Edit',exact=True).click()
    assert page.locator('#res_open_questions').is_visible()
    for width in (390,768,1200):
        page.set_viewport_size({'width':width,'height':1024})
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'), ('question editor overflow',width)
    page.set_viewport_size({'width':768,'height':1024})
    assert 'Every resource still needs' not in page.locator('#res_open_questions').inner_text()
    assert 'What did you find out?' in page.locator('#res_open_questions').inner_text()
    assert 'Include how you checked and, if you contacted someone, when.' in page.locator('#res_open_questions').inner_text()
    assert page.locator('.resource-open-question-text').first.evaluate("e=>getComputedStyle(e).color")== 'rgb(176, 0, 32)'
    page.locator('[data-question-resolved]').first.check()
    assert page.locator('#res_done_btn').is_disabled()
    assert page.evaluate('commitPendingEditsIfChanged()') is False
    page.locator('[data-question-note]').first.fill('Synthetic QA decision, not a real provider call.')
    page.locator('#res_update_description').fill('Synthetic QA question resolution')
    page.locator('#res_open_questions').scroll_into_view_if_needed();page.screenshot(path=str(args.output/'editor.png'))
    page.locator('#res_cancel_btn').click()
    assert page.evaluate("data.resources.find(r=>r.id==='provo-city-housing-authority').openQuestions[0].status")=='open'
    page.get_by_role('button',name='Edit',exact=True).click()
    page.locator('[data-question-note]').first.fill('Synthetic partial research; answer is not settled.')
    page.locator('#res_update_description').fill('Synthetic QA progress note')
    page.locator('#res_done_btn').click()
    assert page.evaluate("data.resources.find(r=>r.id==='provo-city-housing-authority').openQuestions[0].status")=='open'
    page.get_by_role('button',name='Edit',exact=True).click()
    assert page.locator('[data-question-note]').first.input_value()=='Synthetic partial research; answer is not settled.'
    page.locator('[data-question-note]').first.fill('Synthetic QA decision, not a real provider call.')
    page.locator('[data-question-resolved]').first.check()
    page.locator('#res_update_description').fill('Synthetic QA question resolution')
    page.locator('#res_done_btn').click()
    assert page.locator('[data-resource-id="provo-city-housing-authority"]').inner_text().endswith('— open question')
    after=page.evaluate("data.resources.find(r=>r.id==='provo-city-housing-authority')")
    for key in ('description','informationText','verifiedOn','categories','categoryFilters','forGroups','pdfs'):
        if key in ('categories','forGroups'):assert sorted(before.get(key,[]))==sorted(after.get(key,[])),key
        else:assert before.get(key)==after.get(key),key
    assert after['openQuestions'][0]['history'][-1]['status']=='resolved'
    saved=page.evaluate('''async()=>{let blob;await saveCurrentResourcePackage({kind:'file-handle',handle:{createWritable:async()=>({write:async b=>blob=b,close:async()=>{},abort:async()=>{}})}},{showSuccessToast:false});const z=await JSZip.loadAsync(blob);return JSON.parse(await z.file('tso-resources.json').async('string'));}''')
    r=next(r for r in saved['resources'] if r['id']==before['id']);assert r['openQuestions']==after['openQuestions']
    # The older package cannot undo the saved resource's newer question resolution.
    page.evaluate('''old=>{const later=structuredClone(data);const earlier=structuredClone(data);earlier.resources=earlier.resources.map(r=>r.id===old.id?old:r);const merged=mergeResourcePackages(later,earlier);window.qaQuestionMerge=merged;}''',before)
    merged=page.evaluate('qaQuestionMerge')
    resources=merged['mergedData']['resources']
    assert next(r for r in resources if r['id']==before['id'])['openQuestions'][0]['status']=='resolved'
    # A newer legacy editor's phone edit must not erase the independently saved questions.
    legacy_merge=page.evaluate("""()=>{const local=structuredClone(data), incoming=structuredClone(data);const r=incoming.resources.find(r=>r.id==='provo-city-housing-authority');delete r.openQuestions;r.phone='Synthetic newer phone';r.lastModified='2099-01-01T00:00:00Z';return mergeResourcePackages(local,incoming).mergedData.resources.find(r=>r.id==='provo-city-housing-authority');}""")
    assert legacy_merge['phone']=='Synthetic newer phone'
    assert legacy_merge['openQuestions'][0]['status']=='resolved'
    handout=page.evaluate("()=>{const c=document.createElement('div');PrintWorkflow.renderPrintableResourceCards(c,[data.resources.find(r=>r.id==='provo-city-housing-authority')]);return c.textContent;}")
    assert question not in handout and 'Synthetic QA decision' not in handout
    page.get_by_role('button',name='Edit',exact=True).click()
    resolved=page.locator('[data-resolved-questions]')
    assert resolved.get_attribute('open') is None
    assert not resolved.locator('[data-question-note]').is_visible()
    resolved.locator(':scope > summary').click()
    assert resolved.locator('[data-question-note]').input_value()=='Synthetic QA decision, not a real provider call.'
    resolved.locator('[data-question-resolved]').uncheck();page.locator('#res_update_description').fill('Synthetic QA reopen');page.locator('#res_done_btn').click()
    assert page.locator('[data-resource-id="provo-city-housing-authority"]').inner_text().endswith('2 open questions')
    assert page.evaluate("data.resources.find(r=>r.id==='provo-city-housing-authority').openQuestions[0].history.length")==3
    for width in (390,768,1200):
        page.set_viewport_size({'width':width,'height':950});assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    assert not errors,errors
    (args.output/'verification.json').write_text(json.dumps({'label':True,'cancel':True,'resolutionNoteRequired':True,'resolutionAndReopenHistory':True,'packageRoundTrip':True,'olderPackageMergePreservesResolution':True,'newerLegacyPackagePreservesResolution':True,'patronHandoutExcludesQuestions':True,'serviceFieldsUnchanged':True,'pageErrors':errors},indent=2)+'\n')
    b.close()
print('Open-question browser QA passed')
