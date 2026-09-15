"""Merge failures preserve both resource data and attachments in a disposable browser."""
from pathlib import Path
import shutil
import unittest

try:
    from playwright.sync_api import sync_playwright
except ImportError:
    sync_playwright = None

ROOT = Path(__file__).resolve().parents[1]


class MergeStorageTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if sync_playwright is None:
            raise unittest.SkipTest('Playwright is required')
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
        self.context = self.browser.new_context()
        self.addCleanup(self.context.close)
        self.page = self.context.new_page()
        self.page.goto((ROOT / 'new.html').as_uri())
        self.page.evaluate('''async () => {
          window.alerts = []; window.alert = message => alerts.push(message);
          data = processResourcePackageData({resourcePackageSchemaVersion:4,packageVersion:1,
            categories:[],forGroups:[],resources:[{id:'old',name:'Original',categories:[],
              informationText:'Original text',pdfs:[{id:'pdf',name:'Old',path:'old.pdf'}],
              lastModified:'2026-09-01T00:00:00Z'}]}, {sourceName:'fixture'}).data;
          favoriteResourceIds=['old']; printSelection=['old']; view='categories';
          persist(); saveFavoriteResourceIds(); savePrintSelection();
          savePreMergeSnapshot('earlier.zip'); setUndoSnapshot('Existing undo');
          localStorage.setItem(DELETION_REVIEW_STORAGE_KEY, JSON.stringify({fileName:'previous.zip',requests:[]}));
          await savePDF('old.pdf', new Blob(['Original PDF']));
          window.beforeData=JSON.stringify(data);
          window.beforeStorage=Object.fromEntries(Object.keys(localStorage).map(key=>[key,localStorage.getItem(key)]));
          const incoming=cloneDataObject(data); incoming.packageVersion=2;
          incoming.resources[0].name='Updated'; incoming.resources[0].lastModified='2026-09-15T00:00:00Z';
          incoming.resources.push({id:'new',name:'New',categories:[],informationText:'New text',
            pdfs:[{id:'newpdf',name:'New',path:'new.pdf'}]});
          const zip=new JSZip(); zip.file('tso-resources.json',JSON.stringify(incoming));
          zip.file('old.pdf','Replacement PDF'); zip.file('new.pdf','New PDF');
          window.incomingFile=new File([await zip.generateAsync({type:'blob'})],'incoming.zip');
        }''')

    def run_merge(self, failure='none'):
        return self.page.evaluate('''async failure => {
          const setItem=Storage.prototype.setItem, put=IDBObjectStore.prototype.put;
          const transaction=IDBDatabase.prototype.transaction;
          let activeTx, count=0, lateAborted=false;
          IDBDatabase.prototype.transaction=function(...args){
            const tx=transaction.apply(this,args); if(args[1]==='readwrite') activeTx=tx; return tx;
          };
          Storage.prototype.setItem=function(key,value){
            if((failure==='resources' && key===DATA_STORAGE_KEY) ||
               (failure==='recovery' && key===PRE_MERGE_STORAGE_KEY)){
              throw new DOMException('The quota has been exceeded.','QuotaExceededError');
            }
            const result=setItem.call(this,key,value);
            if(failure==='late-abort' && key===DATA_STORAGE_KEY && !lateAborted){lateAborted=true;activeTx.abort();}
            return result;
          };
          IDBObjectStore.prototype.put=function(...args){
            if(failure==='pdf' && ++count===2) throw new DOMException('Full','QuotaExceededError');
            return put.apply(this,args);
          };
          let result;
          try{result=await mergeImportPackage({target:{files:[incomingFile],value:'',remove(){}}},{silent:true});}
          finally{Storage.prototype.setItem=setItem;IDBObjectStore.prototype.put=put;IDBDatabase.prototype.transaction=transaction;}
          return {success:!!result,alerts,unchanged:JSON.stringify(data)===beforeData,
            storageUnchanged:JSON.stringify(Object.fromEntries(Object.keys(localStorage).sort().map(key=>[key,localStorage.getItem(key)])))===JSON.stringify(Object.fromEntries(Object.keys(beforeStorage).sort().map(key=>[key,beforeStorage[key]]))),
            oldPdf:await (await getPDF('old.pdf')).text(),newPdf:!!await getPDF('new.pdf'),
            favorites:favoriteResourceIds,selection:printSelection,
            saved:JSON.parse(localStorage.getItem(DATA_STORAGE_KEY)),current:JSON.parse(JSON.stringify(data))};
        }''', failure)

    def assert_preserved(self, result, area):
        self.assertFalse(result['success'])
        self.assertTrue(result['unchanged'])
        self.assertTrue(result['storageUnchanged'])
        self.assertEqual(result['oldPdf'], 'Original PDF')
        self.assertFalse(result['newPdf'])
        self.assertEqual(result['favorites'], ['old'])
        self.assertEqual(result['selection'], ['old'])
        self.assertIn(area, result['alerts'][0])
        self.assertIn('merge was not applied', result['alerts'][0])

    def test_resource_quota_restores_recovery_undo_review_and_pdfs(self):
        self.assert_preserved(self.run_merge('resources'), 'resources and merge settings')

    def test_recovery_quota_preserves_everything(self):
        self.assert_preserved(self.run_merge('recovery'), 'pre-merge recovery copies')

    def test_pdf_quota_aborts_prior_pdf_write(self):
        self.assert_preserved(self.run_merge('pdf'), 'PDF attachments')

    def test_late_pdf_abort_rolls_back_successful_resource_write(self):
        self.assert_preserved(self.run_merge('late-abort'), 'PDF attachments')

    def test_real_browser_quota_preserves_existing_data(self):
        self.page.evaluate("""async () => {
          const zip=await JSZip.loadAsync(incomingFile);
          const incoming=JSON.parse(await zip.file('tso-resources.json').async('string'));
          incoming.resources[0].informationText='x'.repeat(6*1024*1024);
          zip.file('tso-resources.json',JSON.stringify(incoming));
          incomingFile=new File([await zip.generateAsync({type:'blob'})],'large.zip');
        }""")
        self.assert_preserved(self.run_merge(), 'resources and merge settings')

    def test_merge_without_pdfs_still_rolls_back_resource_failure(self):
        self.page.evaluate("""async () => {
          const zip=await JSZip.loadAsync(incomingFile);
          const incoming=JSON.parse(await zip.file('tso-resources.json').async('string'));
          incoming.resources.forEach(resource=>{resource.pdfs=[];});
          zip.file('tso-resources.json',JSON.stringify(incoming));
          incomingFile=new File([await zip.generateAsync({type:'blob'})],'no-pdfs.zip');
        }""")
        self.assert_preserved(self.run_merge('resources'), 'resources and merge settings')

    def test_success_stores_final_metadata_and_all_pdfs(self):
        result=self.run_merge()
        self.assertTrue(result['success'])
        self.assertEqual(result['alerts'], [])
        self.assertEqual(result['oldPdf'], 'Replacement PDF')
        self.assertTrue(result['newPdf'])
        self.assertEqual(result['saved'], result['current'])
        self.assertEqual(result['saved']['lastLoadedPackageInfo']['sourcePackageVersion'], 2)
        self.assertEqual(result['saved']['changes'], [])
        self.assertEqual(result['favorites'], ['old'])
