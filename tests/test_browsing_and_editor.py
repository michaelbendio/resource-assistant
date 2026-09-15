"""Regression checks in disposable browser profiles, never a live office session."""
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

try:
    from playwright.sync_api import sync_playwright
except ImportError:
    sync_playwright = None

ROOT = Path(__file__).resolve().parents[1]


class BrowsingAndEditorTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if sync_playwright is None:
            raise unittest.SkipTest('Playwright is required for UI regression checks')
        chrome = Path('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')
        executable = str(chrome) if chrome.exists() else shutil.which('chromium') or shutil.which('google-chrome')
        if not executable:
            raise unittest.SkipTest('Chrome or Chromium is required')
        cls.pw = sync_playwright().start()
        cls.browser = cls.pw.chromium.launch(executable_path=executable, headless=True)

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.pw.stop()

    def setUp(self):
        self.context = self.browser.new_context(viewport={'width': 390, 'height': 844})
        self.addCleanup(self.context.close)
        self.page = self.context.new_page()
        self.errors = []
        self.page.on('pageerror', lambda error: self.errors.append(str(error)))
        self.page.goto((ROOT / 'new.html').as_uri())
        self.page.evaluate('''() => {
          const base = {phone:'555-0100', website:'https://example.org', hours:'', address:'Main Street',
            description:'Original description', informationText:'**Services**\\nOriginal details',
            verifiedOn:'09/26', pdfs:[], lastModified:'2026-09-14T10:00:00Z'};
          data = processResourcePackageData({resourcePackageSchemaVersion:4, packageVersion:10,
            categories:[{id:'housing',label:'Housing',filters:['Rent','Shelter']},
              {id:'food',label:'Food',filters:['Pantry']}], forGroups:['Veterans','Families','Empty'],
            resources:[
              {...base,id:'both',name:'Shared Help',categories:['housing','food'],
                categoryFilters:{housing:['Rent'],food:['Pantry']},forGroups:['Veterans']},
              {...base,id:'family',name:'Family Shelter',categories:['housing'],
                categoryFilters:{housing:['Shelter']},forGroups:['Families']},
              {...base,id:'untagged',name:'General Help',categories:['housing'],forGroups:[]},
              {...base,id:'list',name:'Food List',phone:'',website:'',hours:'',categories:['food'],forGroups:['Families']}
            ]}, {sourceName:'Synthetic UI fixture'}).data;
          favoriteResourceIds = []; printSelection = []; selectedCategoryFilters = {};
          view='categories'; categoryBrowseMode='need'; selectedBrowseForGroups=[]; safeRender();
        }''')

    def open_editor(self, resource='both'):
        self.page.evaluate('''id => {
          setAdminVisibility(true); adminTab='resources'; selectedResourceId=id;
          adminResourceEditMode=true; setView('admin');
        }''', resource)
        self.page.locator('#res_description').wait_for()

    def test_group_browse_any_group_across_categories_and_back(self):
        self.page.get_by_role('radio', name='Find resources for', exact=True).check()
        self.page.get_by_role('button', name='Veterans', exact=True).click()
        self.assertEqual(self.page.locator('.group-browse-category').count(), 2)
        self.assertEqual(self.page.locator('.group-browse-results [data-resource-id="both"]').count(), 2)
        self.assertEqual(self.page.locator('.group-browse-results [data-resource-id="untagged"]').count(), 0)
        self.page.get_by_role('button', name='Families', exact=True).focus()
        self.page.keyboard.press('Space')
        self.assertEqual(self.page.evaluate('document.activeElement.textContent'), 'Families')
        self.assertEqual(self.page.locator('.group-browse-results [data-resource-id="family"]').count(), 1)
        self.assertEqual(self.page.locator('.group-browse-results [data-resource-id="list"]').count(), 1)
        self.assertEqual(self.page.locator('.group-browse-category-heading').count(), 2)
        self.page.get_by_role('button', name='Open Housing and narrow by Type').click()
        self.assertEqual(self.page.evaluate("getSelectedCategoryFilters('housing').length"), 2)
        self.page.get_by_role('button', name='← Back', exact=True).click()
        self.assertEqual(self.page.get_by_role('button', name='Veterans', exact=True).get_attribute('aria-pressed'), 'true')
        self.assertTrue(self.page.evaluate('document.documentElement.scrollWidth <= innerWidth'))
        self.page.get_by_role('button', name='Veterans', exact=True).click()
        self.page.get_by_role('button', name='Families', exact=True).click()
        self.page.get_by_role('button', name='Empty', exact=True).click()
        self.assertIn('No resources match', self.page.locator('.group-browse-summary').inner_text())
        self.assertEqual(self.errors, [])

    def test_existing_type_group_intersection_and_clear_survive(self):
        self.page.evaluate("() => {openCategoryFromCard('housing');setSelectedCategoryFilters('housing',['for:veterans','filter:shelter']);safeRender();}")
        self.assertEqual(self.page.locator('#appView .resource-card').count(), 0)
        self.page.get_by_role('button', name='Clear filters', exact=True).click()
        self.assertEqual(self.page.locator('#appView .resource-card').count(), 3)
        self.page.evaluate("() => {setSelectedCategoryFilters('housing',['for:veterans','filter:rent']);safeRender();}")
        self.assertEqual(self.page.locator('#appView .resource-card').count(), 1)
        self.assertEqual(self.errors, [])

    def test_editor_print_uses_unsaved_draft_without_saving_or_selection_changes(self):
        self.open_editor()
        before = self.page.evaluate('({data:JSON.stringify(data),selection:JSON.stringify(printSelection),favorites:JSON.stringify(favoriteResourceIds),snapshot:editorSnapshot})')
        self.page.locator('#res_description').fill('Unsaved handout wording')
        self.page.locator('#res_information_edit_btn').click()
        self.page.locator('#res_info_additional').fill('**New heading**\nUnsaved details')
        self.page.locator('#res_print_btn').click()
        self.assertIn('Unsaved handout wording', self.page.locator('#printContent').inner_text())
        self.assertIn('Unsaved details', self.page.locator('#printContent').inner_text())
        self.assertEqual(self.page.locator('#printContent .print-disabled').count(), 0)
        self.assertEqual(self.page.locator('#printContent .print-selection-toggle').count(), 0)
        self.page.evaluate('window.print = () => {}')
        self.page.locator('#printActionBtn').click()
        self.page.locator('#printCloseBtn').click()
        after = self.page.evaluate('({data:JSON.stringify(data),selection:JSON.stringify(printSelection),favorites:JSON.stringify(favoriteResourceIds),snapshot:editorSnapshot})')
        self.assertEqual(before, after)
        self.assertEqual(self.page.locator('#res_description').input_value(), 'Unsaved handout wording')
        self.assertEqual(self.page.evaluate('document.activeElement.id'), 'res_print_btn')
        self.page.locator('#res_cancel_btn').click()
        self.assertEqual(self.page.evaluate("data.resources.find(r => r.id==='both').description"), 'Original description')
        self.assertEqual(self.errors, [])

    def test_editor_list_print_is_printable_without_print_selection(self):
        self.open_editor('list')
        self.page.locator('#res_print_btn').click()
        self.assertEqual(self.page.locator('#printContent .print-list-flyer').count(), 1)
        self.assertEqual(self.page.locator('#printContent .print-disabled').count(), 0)
        self.page.keyboard.press('Escape')
        self.assertFalse(self.page.locator('#printModal').is_visible())
        self.assertEqual(self.errors, [])

    def test_website_link_follows_current_field_and_opens_separate_tab(self):
        self.open_editor()
        field = self.page.locator('#res_website')
        link = self.page.locator('#res_website_link')
        field.fill('example.org/edited')
        self.assertEqual(link.get_attribute('href'), 'https://example.org/edited')
        self.context.route('https://example.org/**', lambda route: route.fulfill(body='Synthetic website'))
        with self.context.expect_page() as popup:
            link.click()
        popup.value.wait_for_load_state()
        self.assertEqual(popup.value.url, 'https://example.org/edited')
        self.assertIsNone(popup.value.evaluate('window.opener'))
        self.assertEqual(self.page.locator('#res_website').input_value(), 'example.org/edited')
        self.assertEqual(self.page.evaluate("data.resources.find(r => r.id==='both').website"), 'https://example.org')
        for value in ('', 'javascript:alert(1)', 'not a valid website'):
            field.fill(value)
            self.assertFalse(link.is_visible())
        self.assertTrue(self.page.evaluate('document.documentElement.scrollWidth <= innerWidth'))
        self.assertEqual(self.errors, [])

    def test_printed_information_headings_stay_with_following_text(self):
        if not shutil.which('pdftotext'):
            self.skipTest('pdftotext is required for page-boundary checks')
        self.open_editor()
        paragraphs = []
        for number in range(1, 25):
            paragraphs += [f'**Section {number}**', f'First body {number}', 'More details for this section.', 'Another detail for this section.']
        self.page.locator('#res_information_edit_btn').click()
        self.page.locator('#res_info_additional').fill('\n'.join(paragraphs))
        self.page.locator('#res_print_btn').click()
        self.page.emulate_media(media='print')
        self.assertEqual(self.page.locator('.information-heading').first.evaluate('e => getComputedStyle(e).breakAfter'), 'avoid')
        with tempfile.TemporaryDirectory(prefix='tso-heading-qa-') as folder:
            pdf = Path(folder) / 'handout.pdf'
            self.page.pdf(path=str(pdf), format='Letter')
            text = subprocess.check_output(['pdftotext', '-layout', str(pdf), '-'], text=True)
        pages = [set(line.strip() for line in page.splitlines()) for page in text.split('\f') if page.strip()]
        self.assertGreater(len(pages), 1)
        for number in range(1, 25):
            containing = [page for page in pages if f'Section {number}' in page]
            self.assertEqual(len(containing), 1, f'Section {number} missing')
            self.assertIn(f'First body {number}', containing[0])
        self.assertEqual(self.errors, [])


if __name__ == '__main__':
    unittest.main()
