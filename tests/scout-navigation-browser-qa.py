#!/usr/bin/env python3
"""Disposable Chromium touch/keyboard/ZIP/print QA. Requires Playwright.
Run against a built HTML file; never uses an existing browser profile.
"""
import argparse
import base64
import hashlib
import json
from pathlib import Path
import zipfile
from playwright.sync_api import sync_playwright


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('html', type=Path)
    parser.add_argument('--package', type=Path)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(executable_path='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless=True)
        context = browser.new_context(viewport={'width': 768, 'height': 1024}, has_touch=True, device_scale_factor=1)
        page = context.new_page()
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.on('dialog', lambda dialog: dialog.dismiss())
        page.goto(args.html.resolve().as_uri())
        page.wait_for_function('typeof renderCategoryView === "function"')
        original_count = page.evaluate('data.resources.length')
        if args.package:
            page.evaluate('async () => { await window.scoutPreviewAssetsReady; }')
            saved = page.evaluate('''async () => {
              let saved;
              await saveCurrentResourcePackage({kind:"file-handle",handle:{createWritable:async () => ({
                write:async blob => { saved=blob; }, close:async () => {}, abort:async () => {}
              })}}, {showSuccessToast:false});
              const zip = await JSZip.loadAsync(saved);
              const hashes = {};
              for(const path of Object.keys(zip.files).filter(path => path.endsWith(".pdf"))){
                const bytes = await zip.file(path).async("uint8array");
                hashes[path] = [...new Uint8Array(await crypto.subtle.digest("SHA-256",bytes))].map(n => n.toString(16).padStart(2,"0")).join("");
              }
              return {hashes, data:JSON.parse(await zip.file("tso-resources.json").async("string"))};
            }''')
            with zipfile.ZipFile(args.package) as original_zip:
                expected = {name:hashlib.sha256(original_zip.read(name)).hexdigest() for name in original_zip.namelist() if name.endswith('.pdf')}
                assert expected == saved['hashes'], 'Historical PDF bytes changed during ZIP export'
                original_data = json.loads(original_zip.read('tso-resources.json'))
            output_resources = {r['id']:r for r in saved['data']['resources']}
            for resource in original_data['resources']:
                for key in ('description','informationText','phone','website','hours','address'):
                    if key in resource:
                        assert resource[key] == output_resources[resource['id']].get(key), (resource['id'], key)
            (args.output/'historical-package-verification.json').write_text(json.dumps({'resources':len(output_resources),'pdfHashes':expected,'clientTextUnchanged':True},indent=2)+'\n')
        # Check real handout content is unchanged by navigation/filter operations.
        before = page.evaluate('''() => {
          const resource = data.resources.find(r => r.informationText && r.phone) || data.resources[0];
          if(!resource) return "";
          window.qaResource = structuredClone(resource);
          const container = document.createElement("div");
          PrintWorkflow.renderPrintableResourceCards(container, [resource]);
          return container.innerHTML;
        }''')
        page.evaluate('''() => {
          view = "category";
          currentCategory = data.categories.find(c => data.resources.some(r => r.categories.includes(c.id))).id;
          selectedCategoryFilters = {}; render();
        }''')
        page.screenshot(path=str(args.output / 'historical-provo-ipad.png'), full_page=True)
        after = page.evaluate('''() => {
          const container = document.createElement("div");
          PrintWorkflow.renderPrintableResourceCards(container, [data.resources.find(r => r.id === qaResource.id)]);
          return container.innerHTML;
        }''')
        assert before == after, 'Navigation changed printable content'
        if args.package:
            page.evaluate('''() => {
              const education = data.categories.find(category => category.label.toLowerCase() === "education");
              currentCategory=education.id; selectedCategoryFilters={};
              data.forGroupPreferences={prominent:["Spanish speaking", "Veterans"],lastModified:"2026-09-06T00:00:00Z"};
              render();
            }''')
            labels = page.locator('[data-filter-key^="for:"]').all_text_contents()
            assert sorted(labels) == ['Families with children (1)', 'Spanish speaking (3)', 'Veterans (1)'], labels
            assert page.locator('.all-groups').count() == 0
            page.screenshot(path=str(args.output/'education-simplified-ipad.png'),full_page=True)
        # Synthetic fixture separates dimensions and includes a one-member group.
        page.evaluate('''() => {
          data = processResourcePackageData({resourcePackageSchemaVersion:4, packageVersion:1,
            categories:[{id:"housing",label:"Housing",filters:["Shelter","Rent"]}, {id:"food",label:"Food"}],
            forGroups:["Veterans","Women","Rare group","Other category"],
            forGroupPreferences:{prominent:["Veterans"],lastModified:"2026-09-06T00:00:00Z"},
            resources:[
              {id:"both",name:"Shelter for veterans",phone:"555-0100",categories:["housing"],categoryFilters:{housing:["Shelter"]},forGroups:["Veterans"],informationText:"Bring ID. Call before visiting.",pdfs:[{id:"guide",name:"Guide",path:"pdfs/guide.pdf"}]},
              {id:"rent",name:"Rent for women",phone:"555-0101",categories:["housing"],categoryFilters:{housing:["Rent"]},forGroups:["Women"]},
              {id:"rare",name:"Specialist",phone:"555-0102",categories:["housing"],categoryFilters:{housing:["Shelter"]},forGroups:["Rare group"]},
              {id:"food",name:"Food",categories:["food"],forGroups:["Other category","Veterans"]}
            ]}).data;
          view="category"; currentCategory="housing"; selectedCategoryFilters={}; render();
        }''')
        assert page.locator('.category-filter-status').inner_text() == '3 resources shown.'
        assert page.locator('[data-filter-key="for:other category"]').count() == 0
        assert page.locator('.all-groups').count() == 0
        assert 'across office' not in page.locator('#appView').inner_text()
        page.locator('[data-filter-key="for:rare group"]').click()
        assert page.locator('.category-filter-status').inner_text() == '1 resource shown.'
        page.locator('[data-filter-key="filter:rent"]').click()
        assert page.locator('.category-filter-status').inner_text() == '0 resources shown.'
        assert page.locator('[data-filter-key="for:rare group"]').first.get_attribute('aria-pressed') == 'true'
        assert page.evaluate('getSelectedCategoryFilters("housing").length') == 2
        page.screenshot(path=str(args.output / 'selected-zero-ipad.png'), full_page=True)
        page.get_by_role('button', name='Clear filters', exact=True).click()
        type_button = page.locator('[data-filter-key="filter:shelter"]')
        type_button.focus()
        page.keyboard.press('Space')
        assert type_button.get_attribute('aria-pressed') == 'true'
        assert page.locator('[data-filter-key="for:women"]').count() == 0
        assert page.locator('[data-filter-key="for:rare group"]').count() == 1
        assert page.evaluate('document.activeElement.dataset.filterKey') == 'filter:shelter'
        page.locator('[data-filter-key="for:veterans"]').first.click()
        assert page.locator('.category-filter-status').inner_text() == '1 resource shown.'
        assert page.locator('.resource-card-interactive').count() == 1
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'iPad overflow'
        page.set_viewport_size({'width':390,'height':844})
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'narrow-screen overflow'
        page.screenshot(path=str(args.output / 'narrow-navigation.png'), full_page=True)
        page.emulate_media(media='print')
        assert page.locator('.category-filter-controls').evaluate('(el) => getComputedStyle(el).display') == 'none'
        page.emulate_media(media='screen')
        page.set_viewport_size({'width':768,'height':1024})
        page.evaluate('''() => {
          appView.innerHTML="";
          renderAdminForGroups(appView);
        }''')
        assert page.locator('.forGroupProminent').count() == 0
        assert 'Show prominently' not in page.locator('#appView').inner_text()
        page.screenshot(path=str(args.output / 'admin-groups-ipad.png'), full_page=True)
        result = page.evaluate('''async () => {
          const bytes = new TextEncoder().encode("%PDF-1.4 Synthetic QA asset; not a client handout");
          await savePDF("pdfs/guide.pdf", new Blob([bytes], {type:"application/pdf"}));
          let saved;
          await saveCurrentResourcePackage({kind:"file-handle",handle:{createWritable:async () => ({
            write:async blob => { saved=blob; }, close:async () => {}, abort:async () => {}
          })}}, {showSuccessToast:false});
          const zip = await JSZip.loadAsync(saved);
          const reloaded = processResourcePackageData(JSON.parse(await zip.file("tso-resources.json").async("string"))).data;
          const prior = structuredClone(reloaded); delete prior.forGroupPreferences; prior.resourcePackageSchemaVersion=3;
          const merged = mergeResourcePackages(reloaded, prior).mergedData;
          return {schema:reloaded.resourcePackageSchemaVersion,preferences:merged.forGroupPreferences,
            pdf:await zip.file("pdfs/guide.pdf").async("string"),
            bytes:btoa(String.fromCharCode(...new Uint8Array(await saved.arrayBuffer())))};
        }''')
        assert result['schema'] == 4 and result['preferences']['prominent'] == ['Veterans']
        assert result['pdf'] == '%PDF-1.4 Synthetic QA asset; not a client handout'
        (args.output/'synthetic-roundtrip.zip').write_bytes(base64.b64decode(result.pop('bytes')))
        assert not errors, errors
        result.update(historicalResources=original_count, printUnchanged=True, touchAndKeyboard=True, zeroSelectionPreserved=True, overflow=False, consoleErrors=errors)
        (args.output/'verification.json').write_text(json.dumps(result,indent=2)+'\n')
        print(json.dumps(result, indent=2))
        browser.close()


if __name__ == '__main__':
    main()
