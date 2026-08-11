// ============================================================
// SELF TESTS
// ============================================================
// In-browser smoke tests for high-risk flows (create/delete/undo/For groups/
// information/import/export/sorting). Run with Ctrl+Shift+T while the page is
// open; use ?debug when you also want invariant checks before/after rendering.
// Tests temporarily replace global state and then restore it, so each test must
// save every global it mutates in a finally block.

async function runSelfTests(){
  const tests = [];

  function withSelfTestHtmlFileName(fileName, callback){
    const previousGetCurrentHtmlFileName = getCurrentHtmlFileName;
    try{
      getCurrentHtmlFileName = () => fileName;
      return callback();
    }finally{
      getCurrentHtmlFileName = previousGetCurrentHtmlFileName;
    }
  }

  tests.push({
    name: "CHANGE LOG NORMALIZATION",
    fn: () => {
      const sample = {};
      normalizeChanges(sample);
      if(!Array.isArray(sample.changes)) throw new Error("changes should normalize to array");
    }
  });

  tests.push({
    name: "CHANGE LOG DESCRIPTION FALLBACK",
    fn: () => {
      const html = formatChangeEntryHTML({
        targetName:"Shelter",
        type:"resource",
        action:"updated",
        timestamp:"2026-01-02T03:04:05.000Z",
        description:""
      });
      if(!html.includes("No description provided")){
        throw new Error("descriptionless change should show the fallback text");
      }
    }
  });

  tests.push({
    name: "CATEGORY UPDATE SEEN KEYS ARE SCOPED",
    fn: () => {
      const previousData = data;
      const previousSeen = localStorage.getItem(UPDATE_SEEN_STORAGE_KEY);
      try{
        data = {
          categories:[{ id:"housing", label:"Housing" }, { id:"food", label:"Food" }],
          resources:[{ id:"shared", name:"Shared", categories:["housing", "food"] }],
          changes:[{
            id:"change-1",
            type:"resource",
            action:"updated",
            targetId:"shared",
            targetName:"Shared",
            description:"",
            timestamp:"2026-01-02T03:04:05.000Z",
            categoryIds:["housing", "food"]
          }]
        };
        localStorage.removeItem(UPDATE_SEEN_STORAGE_KEY);
        let updates = getCategoryUpdateMap();
        if(!updates.has("housing") || !updates.has("food")){
          throw new Error("shared change should appear on both categories");
        }
        markChangesViewed([getCategoryChangeSeenKey("change-1", "housing")]);
        updates = getCategoryUpdateMap();
        if(updates.has("housing")) throw new Error("viewed category badge should be cleared");
        if(!updates.has("food")) throw new Error("viewing one category should not clear another category badge");
      }finally{
        data = previousData;
        if(previousSeen === null) localStorage.removeItem(UPDATE_SEEN_STORAGE_KEY);
        else localStorage.setItem(UPDATE_SEEN_STORAGE_KEY, previousSeen);
      }
    }
  });

  tests.push({
    name: "PACKAGE VERSION FALLBACK",
    fn: () => {
      if(normalizePackageVersionValue(undefined) !== "Unknown") throw new Error("missing packageVersion should fallback");
      if(normalizePackageVersionValue("") !== "Unknown") throw new Error("blank packageVersion should fallback");
      if(normalizePackageVersionValue(12) !== 12) throw new Error("numeric packageVersion should be preserved");
      if(normalizePackageVersionValue("13") !== 13) throw new Error("string numeric packageVersion should normalize to number");
    }
  });

  tests.push({
    name: "STORAGE KEYS USE META ID THEN HTML FILENAME",
    fn: () => {
      const meta = document.querySelector('meta[name="tso-storage-id"]');
      const previousContent = meta ? meta.getAttribute("content") : null;
      try{
        if(meta) meta.setAttribute("content", "");
        if(getStorageKeyPrefix("new.html") !== "new") throw new Error("new.html should use new storage prefix");
        if(getStorageKeyPrefix("albuquerque.html") !== "albuquerque") throw new Error("albuquerque.html should use albuquerque storage prefix");
        if(getStorageKeyPrefix("provo.html") !== "provo") throw new Error("provo.html should use provo storage prefix");
        if(getStorageKeyPrefix("boise-north.html") !== "boiseNorth") throw new Error("hyphenated filenames should use camel-case storage prefix");
        if(meta){
          meta.setAttribute("content", "provo");
          if(getStorageKeyPrefix("backup-copy.html") !== "provo") throw new Error("configured storage id should override filename");
          meta.setAttribute("content", "Boise North");
          if(getStorageKeyPrefix("backup-copy.html") !== "boiseNorth") throw new Error("configured storage id should normalize like filenames");
        }
        if(DATA_STORAGE_KEY !== `${STORAGE_KEY_PREFIX}Data`) throw new Error("data storage key should use current storage prefix");
        if(FAVORITE_RESOURCE_IDS_STORAGE_KEY !== `${STORAGE_KEY_PREFIX}FavoriteResourceIdsV1`){
          throw new Error("favorites storage key should use the current office prefix");
        }
        if(STARTUP_STATE_STORAGE_KEYS.includes(TSO_NAME_STORAGE_KEY)){
          throw new Error("startup reset should not clear the scoped TSO name");
        }
        if(STARTUP_STATE_STORAGE_KEYS.includes(FAVORITE_RESOURCE_IDS_STORAGE_KEY)){
          throw new Error("startup reset should preserve persistent favorites");
        }
      }finally{
        if(meta) meta.setAttribute("content", previousContent || "");
      }
    }
  });

  tests.push({
    name: "STARTUP RESET CLEARS UI STATE BUT KEEPS DATA AND NAME",
    fn: () => {
      const previousStartupValues = STARTUP_STATE_STORAGE_KEYS.map(key => [key, localStorage.getItem(key)]);
      const previousTsoNameValue = localStorage.getItem(TSO_NAME_STORAGE_KEY);
      const previousDataValue = localStorage.getItem(DATA_STORAGE_KEY);
      const previousRecoveryValue = localStorage.getItem(PRE_MERGE_STORAGE_KEY);
      const previousSessionValue = sessionStorage.getItem("newSelfTestSessionValue");
      try{
        STARTUP_STATE_STORAGE_KEYS.forEach(key => localStorage.setItem(key, "stale"));
        localStorage.setItem(TSO_NAME_STORAGE_KEY, "Keep Name");
        localStorage.setItem(DATA_STORAGE_KEY, JSON.stringify({ resources:[{ id:"keep-resource" }] }));
        localStorage.setItem(PRE_MERGE_STORAGE_KEY, "keep-recovery-history");
        sessionStorage.setItem("newSelfTestSessionValue", "stale");
        runStartupStateReset("provo.html");
        const unclearedKey = STARTUP_STATE_STORAGE_KEYS.find(key => localStorage.getItem(key) !== null);
        if(unclearedKey) throw new Error(`startup reset did not clear ${unclearedKey}`);
        if(localStorage.getItem(TSO_NAME_STORAGE_KEY) !== "Keep Name"){
          throw new Error("startup reset should keep TSO name");
        }
        if(!/keep-resource/.test(localStorage.getItem(DATA_STORAGE_KEY) || "")){
          throw new Error("startup reset should keep saved resources");
        }
        if(localStorage.getItem(PRE_MERGE_STORAGE_KEY) !== "keep-recovery-history"){
          throw new Error("office startup should retain recovery history");
        }
        if(sessionStorage.getItem("newSelfTestSessionValue") !== null){
          throw new Error("startup reset did not clear sessionStorage");
        }
      }finally{
        previousStartupValues.forEach(([key, value]) => {
          if(value === null) localStorage.removeItem(key);
          else localStorage.setItem(key, value);
        });
        if(previousTsoNameValue === null) localStorage.removeItem(TSO_NAME_STORAGE_KEY);
        else localStorage.setItem(TSO_NAME_STORAGE_KEY, previousTsoNameValue);
        if(previousDataValue === null) localStorage.removeItem(DATA_STORAGE_KEY);
        else localStorage.setItem(DATA_STORAGE_KEY, previousDataValue);
        if(previousRecoveryValue === null) localStorage.removeItem(PRE_MERGE_STORAGE_KEY);
        else localStorage.setItem(PRE_MERGE_STORAGE_KEY, previousRecoveryValue);
        if(previousSessionValue === null) sessionStorage.removeItem("newSelfTestSessionValue");
        else sessionStorage.setItem("newSelfTestSessionValue", previousSessionValue);
      }
    }
  });

  tests.push({
    name: "NEW TEMPLATE STARTUP CLEARS STALE DATA AND NAME",
    fn: () => {
      const previousDataValue = localStorage.getItem(DATA_STORAGE_KEY);
      const previousTsoNameValue = localStorage.getItem(TSO_NAME_STORAGE_KEY);
      const previousRecoveryValue = localStorage.getItem(PRE_MERGE_STORAGE_KEY);
      try{
        localStorage.setItem(DATA_STORAGE_KEY, JSON.stringify({ resources:[{ id:"stale-resource" }] }));
        localStorage.setItem(TSO_NAME_STORAGE_KEY, "Stale TSO");
        localStorage.setItem(PRE_MERGE_STORAGE_KEY, "stale recovery");
        runStartupStateReset("new.html");
        if(localStorage.getItem(DATA_STORAGE_KEY) !== null){
          throw new Error("new.html startup should clear stale saved resources");
        }
        if(localStorage.getItem(TSO_NAME_STORAGE_KEY) !== null){
          throw new Error("new.html startup should clear stale TSO name");
        }
        if(localStorage.getItem(PRE_MERGE_STORAGE_KEY) !== null){
          throw new Error("new.html startup should clear stale recovery history");
        }
      }finally{
        if(previousDataValue === null) localStorage.removeItem(DATA_STORAGE_KEY);
        else localStorage.setItem(DATA_STORAGE_KEY, previousDataValue);
        if(previousTsoNameValue === null) localStorage.removeItem(TSO_NAME_STORAGE_KEY);
        else localStorage.setItem(TSO_NAME_STORAGE_KEY, previousTsoNameValue);
        if(previousRecoveryValue === null) localStorage.removeItem(PRE_MERGE_STORAGE_KEY);
        else localStorage.setItem(PRE_MERGE_STORAGE_KEY, previousRecoveryValue);
      }
    }
  });

  tests.push({
    name: "LAST LOADED PACKAGE INFO NORMALIZATION",
    fn: () => {
      const sample = {
        lastLoadedPackageInfo: {
          packageVersion: "",
          loadedAt: "not-a-date",
          sourcePackageCreatedAt: "2026-01-02T03:04:05-07:00",
          changes: [" Added one ", "", "Added two"]
        }
      };
      normalizeLastLoadedPackageInfo(sample);
      if(!sample.lastLoadedPackageInfo) throw new Error("package info missing after normalize");
      if(sample.lastLoadedPackageInfo.sourcePackageVersion !== "Unknown") throw new Error("package version fallback failed");
      if(sample.lastLoadedPackageInfo.changes.length !== 2) throw new Error("package changes were not normalized");
      if(!Date.parse(sample.lastLoadedPackageInfo.loadedAt)) throw new Error("loadedAt was not normalized");
      if(sample.lastLoadedPackageInfo.sourcePackageCreatedAt !== "2026-01-02T10:04:05.000Z"){
        throw new Error("source package creation date was not normalized");
      }
    }
  });

  tests.push({
    name: "LAST LOADED PACKAGE INFO REPLACEMENT",
    fn: () => {
      const sample = {
        lastLoadedPackageInfo: {
          packageVersion: 1,
          loadedAt: "2026-01-01T00:00:00.000Z",
          changes: ["one"]
        }
      };
      sample.lastLoadedPackageInfo = {
        sourcePackageVersion: 2,
        loadedAt: "2026-02-01T00:00:00.000Z",
        changes: ["two"]
      };
      normalizeLastLoadedPackageInfo(sample);
      if(sample.lastLoadedPackageInfo.sourcePackageVersion !== 2) throw new Error("package info did not replace");
      if(sample.lastLoadedPackageInfo.changes.length !== 1 || sample.lastLoadedPackageInfo.changes[0] !== "two"){
        throw new Error("replacement changes were not preserved");
      }
    }
  });

  tests.push({
    name: "ADMIN PACKAGE ACTIONS ARE STICKY",
    fn: () => {
      const previousData = data;
      const previousView = view;
      const previousAdminTab = adminTab;
      try{
        data = {
          categories:[],
          resources:[],
          changes:[{ id:"change-1", targetType:"resource", action:"updated", targetName:"Shelter", createdAt:nowISO() }],
          lastModified:"2026-01-02T03:04:05.000Z"
        };
        view = "admin";
        adminTab = "categories";
        renderAdmin();
        const sticky = document.querySelector("#adminView .admin-sticky-bar");
        if(!sticky) throw new Error("Admin sticky bar was not rendered");
        const style = getComputedStyle(sticky);
        if(style.position !== "sticky") throw new Error(`Admin package bar should be sticky, got ${style.position}`);
        const buttons = Array.from(sticky.querySelectorAll("button")).map(button => button.textContent);
        if(!buttons.includes("Save Resource Package")) throw new Error("Save Resource Package button was missing");
        if(!buttons.includes("Show change log")) throw new Error("Show change log button was missing");
        if(!buttons.includes("Clear change log")) throw new Error("Clear change log button was missing");
        if(/Last Modified:/i.test(document.getElementById("adminView").textContent || "")){
          throw new Error("Admin page should not show Last Modified");
        }
      }finally{
        data = previousData;
        view = previousView;
        adminTab = previousAdminTab;
        renderAdmin();
      }
    }
  });

  tests.push({
    name: "ADMIN HAS TWO STICKY CONTROL BARS",
    fn: () => withSelfTestHtmlFileName("new.html", () => {
      const previousData = data;
      const previousView = view;
      const previousAdminTab = adminTab;
      try{
        data = { categories:[], resources:[], changes:[] };
        view = "admin";
        adminTab = "categories";
        renderAdmin();
        const packageBar = document.querySelector("#adminView .admin-sticky-bar");
        const modeBar = document.querySelector("#adminView .admin-mode-bar");
        if(!packageBar || !modeBar) throw new Error("Admin sticky control bars were not rendered");
        if(getComputedStyle(packageBar).position !== "sticky") throw new Error("package bar should be sticky");
        if(getComputedStyle(modeBar).position !== "sticky") throw new Error("mode bar should be sticky");
        const packageLabels = Array.from(packageBar.querySelectorAll("button")).map(button => button.textContent.trim());
        ["Save Resource Package", "Office Setup", "Admin Help"].forEach(label => {
          if(!packageLabels.includes(label)) throw new Error(`${label} was not in the package bar`);
        });
        const modeLabels = Array.from(modeBar.querySelectorAll("button")).map(button => button.textContent.trim());
        ["Categories", "Resources", "For"].forEach(label => {
          if(!modeLabels.includes(label)) throw new Error(`${label} was not in the mode bar`);
        });
        const buildInfo = modeBar.querySelector(".admin-build-info");
        if(!buildInfo) throw new Error("Admin build number was missing");
        if(buildInfo.textContent.trim() !== `Build ${APP_BUILD}`){
          throw new Error(`Admin build number was incorrect: ${buildInfo.textContent}`);
        }
        if(!buildInfo.title.startsWith("Commit ")) throw new Error("Admin build tooltip was missing");
        if(/\b[0-9a-f]{7}\b/i.test(buildInfo.textContent)){
          throw new Error("Commit hash should not be visible in Admin mode");
        }
      }finally{
        data = previousData;
        view = previousView;
        adminTab = previousAdminTab;
        renderAdmin();
      }
    })
  });

  tests.push({
    name: "ADMIN ENTRY HAS NO CLEAN EDITOR ACTIONS",
    fn: () => {
      const previousData = data;
      const previousView = view;
      const previousAdminTab = adminTab;
      const previousAdminVisible = isAdminVisible;
      const previousAdminResourceEditMode = adminResourceEditMode;
      const previousEditing = editing;
      const previousEditorSnapshot = editorSnapshot;
      try{
        data = {
          categories:[{ id:"food", label:"Food", filters:[] }],
          resources:[{ id:"resource", name:"Resource", categories:[], categoryFilters:{}, forGroups:[], informationText:"" }],
          changes:[]
        };
        view = "categories";
        adminTab = "categories";
        isAdminVisible = true;
        adminResourceEditMode = false;
        editing = null;
        editorSnapshot = "";
        setView("admin");
        const actions = document.getElementById("admin_editor_actions");
        if(!actions || !actions.hidden){
          throw new Error("Admin entry should not show Cancel and Done for a clean editor");
        }
        actions.hidden = false;
        actions.innerHTML = `<button>Cancel</button><button>Done</button>`;
        renderAdmin();
        const rerenderedActions = document.getElementById("admin_editor_actions");
        if(!rerenderedActions || !rerenderedActions.hidden || rerenderedActions.textContent.trim()){
          throw new Error("Admin render should clear stale editor actions");
        }
      }finally{
        data = previousData;
        view = previousView;
        adminTab = previousAdminTab;
        isAdminVisible = previousAdminVisible;
        adminResourceEditMode = previousAdminResourceEditMode;
        editing = previousEditing;
        editorSnapshot = previousEditorSnapshot;
        renderAdmin();
      }
    }
  });

  tests.push({
    name: "RECENT UPDATES PACKAGE SECTION RENDERING",
    fn: () => {
      const previousData = data;
      const previousView = view;
      const previousRecentUpdateDetail = recentUpdateDetail;
      const previousPendingRecentUpdates = pendingRecentUpdates;
      const previousShowUpdateInfo = showUpdateInfo;
      const previousShowRecentChangeLog = showRecentChangeLog;
      try{
        data = { appVersion:"1.4.1", lastModified:nowISO(), categories:[], resources:[], changes:[], lastLoadedPackageInfo:null };
        view = "recent-updates";
        showUpdateInfo = false;
        showRecentChangeLog = false;
        recentUpdateDetail = [];
        pendingRecentUpdates = [];
        render();
        if(/App version:/.test(appView.textContent || "")){
          throw new Error("package info should be hidden before title toggle");
        }
        if(/No recent updates\./.test(appView.textContent || "")){
          throw new Error("change log should be hidden before title toggle");
        }
        showUpdateInfo = true;
        showRecentChangeLog = true;
        recentUpdateDetail = [];
        pendingRecentUpdates = [];
        render();
        const appChangesHeading = Array.from(appView.querySelectorAll("strong"))
          .find(element => element.textContent.trim() === "App Changes");
        if(!appChangesHeading){
          throw new Error("app change log heading was missing");
        }
        const expectedAppChangeGroups = groupAppChangesByVersion(APP_CHANGE_LOG);
        const renderedAppChangeGroups = Array.from(appChangesHeading.parentElement.querySelectorAll(".app-change-group"));
        if(renderedAppChangeGroups.length !== expectedAppChangeGroups.length){
          throw new Error("app changes were not grouped by distinct version");
        }
        renderedAppChangeGroups.forEach((element, index) => {
          const expectedGroup = expectedAppChangeGroups[index];
          const versionHeading = element.querySelector(".app-change-version");
          const rows = Array.from(element.querySelectorAll(".app-change-rows li"));
          if(!versionHeading || versionHeading.textContent.trim() !== expectedGroup.version){
            throw new Error("app change version heading was missing or repeated incorrectly");
          }
          if(rows.length !== expectedGroup.changes.length){
            throw new Error(`app change rows were lost for version ${expectedGroup.version}`);
          }
          expectedGroup.changes.forEach((change, rowIndex) => {
            const expectedText = `${formatAppChangeDate(change.date)} — ${change.message}`;
            if(rows[rowIndex].textContent.trim() !== expectedText){
              throw new Error(`app change row was formatted incorrectly for version ${expectedGroup.version}`);
            }
          });
        });
        const groupedFixture = groupAppChangesByVersion([
          { version:"fixture-a", message:"First" },
          { version:"fixture-a", message:"Second" },
          { version:"fixture-b", message:"Third" }
        ]);
        if(groupedFixture.length !== 2 || groupedFixture[0].changes.length !== 2){
          throw new Error("multiple changes for one version were not retained under one heading");
        }
        if(/Resource data last modified:/.test(appView.textContent || "")){
          throw new Error("local merge time should not be presented as the package update date");
        }
        if(Array.from(appView.querySelectorAll("button")).some(button => button.textContent.trim() === "View Categories")){
          throw new Error("redundant View Categories button was rendered");
        }
        if(!APP_CHANGE_LOG.length || !appView.textContent.includes(APP_CHANGE_LOG[0].message)){
          throw new Error("app change log entries were missing");
        }
        if(!/No resource package updates loaded\./.test(appView.textContent || "")){
          throw new Error("missing no-package-loaded message");
        }
        data.packageVersion = 11;
        data.lastLoadedPackageInfo = {
          sourcePackageVersion: 11,
          loadedAt: nowISO(),
          sourcePackageCreatedAt: "2026-07-30T12:00:00.000Z",
          changes: ["Career Education - Formatted the services"]
        };
        render();
        if(!/Latest Resource Package 11:/.test(appView.textContent || "")){
          throw new Error("latest package heading did not preserve the working version");
        }
        if(!/Updates loaded from Resource Package 11:/.test(appView.textContent || "")){
          throw new Error("latest package update source was missing");
        }
        const expectedPackageDate = `Resource package created: ${formatDateOnly("2026-07-30T12:00:00.000Z")}`;
        if(!appView.textContent.includes(expectedPackageDate)){
          throw new Error("latest package update did not show the package creation date");
        }
        if(!/Career Education - Formatted the services/.test(appView.textContent || "")){
          throw new Error("missing package change text");
        }
      }finally{
        data = previousData;
        view = previousView;
        recentUpdateDetail = previousRecentUpdateDetail;
        pendingRecentUpdates = previousPendingRecentUpdates;
        showUpdateInfo = previousShowUpdateInfo;
        showRecentChangeLog = previousShowRecentChangeLog;
      }
    }
  });

  tests.push({
    name: "RENAMED FILE NAME DERIVES TSO NAME",
    fn: () => {
      if(getTsoNameFromHtmlFileName("provo.html") !== "Provo"){
        throw new Error("single-word filename did not derive TSO name");
      }
      if(getTsoNameFromHtmlFileName("salt-lake-city.html") !== "Salt Lake City"){
        throw new Error("hyphenated filename did not derive TSO name");
      }
    }
  });

  tests.push({
    name: "OFFICE SETUP EXPLAINS PUBLISHING AND LOCAL STATE",
    fn: () => {
      showOfficeSetup();
      const modal = getReferenceModal();
      const text = modal.textContent || "";
      [
        "Download the current package from SharePoint",
        "merge it with this computer’s updates",
        "upload the combined package",
        "Each computer separately authorizes its download folder",
        "keeps its own publishing history",
        "No guided publishing activity has been recorded on this computer."
      ].forEach(expected => {
        if(!text.includes(expected)) throw new Error(`Office Setup omitted '${expected}'`);
      });
      closeReferenceModal();
    }
  });

  tests.push({
    name: "OFFICE SETUP STATUS IS EXPLICIT",
    fn: () => {
      const incomplete = evaluateOfficeSetupStatus({
        storageId:"new",
        tsoName:"",
        expectedPackageFileName:"tso-resource-package.zip",
        target:null,
        directoryHandle:null,
        directoryPermission:"denied"
      });
      if(incomplete.complete || incomplete.issues.length < 4){
        throw new Error("incomplete office setup did not explain missing configuration");
      }
      const complete = evaluateOfficeSetupStatus({
        storageId:"mesa",
        tsoName:"Mesa",
        expectedPackageFileName:"mesa-resource-package.zip",
        target:{ packageFileName:"mesa-resource-package.zip" },
        directoryHandle:{ kind:"directory", name:"Downloads" },
        directoryPermission:"granted"
      });
      if(!complete.complete || complete.issues.length){
        throw new Error("valid office setup was not complete");
      }
    }
  });

  tests.push({
    name: "OFFICE HTML PROVIDES SHARED PUBLISHING SETTINGS",
    fn: () => {
      const storageMeta = document.querySelector('meta[name="tso-storage-id"]');
      const nameMeta = document.querySelector('meta[name="tso-office-name"]');
      const urlMeta = document.querySelector('meta[name="tso-sharepoint-package-url"]');
      const previousStorage = storageMeta && storageMeta.getAttribute("content");
      const previousName = nameMeta && nameMeta.getAttribute("content");
      const previousUrl = urlMeta && urlMeta.getAttribute("content");
      const previousStoredName = localStorage.getItem(TSO_NAME_STORAGE_KEY);
      const targetKey = getSharePointPublishingTargetStorageKey("provo");
      const previousStoredTarget = localStorage.getItem(targetKey);
      const provoUrl = "https://churchofjesuschrist.sharepoint.com/sites/WSR_TSO/Provo%20TSO/Forms/AllItems.aspx?id=%2Fsites%2FWSR_TSO%2FProvo%20TSO%2Fprovo-resource-package.zip&parent=%2Fsites%2FWSR_TSO%2FProvo%20TSO";
      try{
        if(!storageMeta || !nameMeta || !urlMeta) throw new Error("office configuration meta tags are missing");
        storageMeta.setAttribute("content", "provo");
        nameMeta.setAttribute("content", "Provo");
        urlMeta.setAttribute("content", provoUrl);
        localStorage.setItem(TSO_NAME_STORAGE_KEY, "Wrong Local Name");
        localStorage.setItem(targetKey, JSON.stringify({
          schemaVersion:SHAREPOINT_PUBLISHING_TARGET_SCHEMA_VERSION,
          packageViewUrl:"https://example.com/wrong"
        }));

        if(getTsoName() !== "Provo") throw new Error("embedded office name did not override local setup");
        const target = getSharePointPublishingTarget("provo");
        if(!target || target.packageFileName !== "provo-resource-package.zip"){
          throw new Error("embedded SharePoint destination did not override local setup");
        }
        if(canChangeSharePointPublishingDestination()){
          throw new Error("embedded SharePoint destination was still locally editable");
        }
      }finally{
        if(storageMeta) storageMeta.setAttribute("content", previousStorage || "");
        if(nameMeta) nameMeta.setAttribute("content", previousName || "");
        if(urlMeta) urlMeta.setAttribute("content", previousUrl || "");
        if(previousStoredName == null) localStorage.removeItem(TSO_NAME_STORAGE_KEY);
        else localStorage.setItem(TSO_NAME_STORAGE_KEY, previousStoredName);
        if(previousStoredTarget == null) localStorage.removeItem(targetKey);
        else localStorage.setItem(targetKey, previousStoredTarget);
      }
    }
  });

  tests.push({
    name: "SHAREPOINT DESTINATION URL VALIDATION",
    fn: () => {
      const provoUrl = "https://churchofjesuschrist.sharepoint.com/sites/WSR_TSO/Provo%20TSO/Forms/AllItems.aspx?id=%2Fsites%2FWSR_TSO%2FProvo%20TSO%2Fprovo-resource-package.zip&parent=%2Fsites%2FWSR_TSO%2FProvo%20TSO&share=tracking&CT=123";
      const target = parseSharePointPublishingUrl(provoUrl, "provo-resource-package.zip", "Provo");
      if(target.packageFileName !== "provo-resource-package.zip") throw new Error("canonical package filename changed");
      if(target.parentPath !== "/sites/WSR_TSO/Provo TSO") throw new Error("SharePoint parent path was not parsed");
      if(target.packageViewUrl.includes("share=") || target.packageViewUrl.includes("CT=")){
        throw new Error("SharePoint tracking parameters were retained");
      }
      if(!target.libraryUrl.includes("id=%2Fsites%2FWSR_TSO%2FProvo+TSO")){
        throw new Error("containing SharePoint folder URL was not derived");
      }

      const mesaUrl = "https://churchofjesuschrist.sharepoint.com/sites/WSR_TSO/Mesa%20TSO/Forms/AllItems.aspx?id=%2Fsites%2FWSR_TSO%2FMesa%20TSO%2Fmesa-resource-package.zip&parent=%2Fsites%2FWSR_TSO%2FMesa%20TSO";
      const mesaTarget = parseSharePointPublishingUrl(mesaUrl, "mesa-resource-package.zip", "Mesa");
      if(mesaTarget.officeName !== "Mesa" || mesaTarget.packageFileName !== "mesa-resource-package.zip"){
        throw new Error("Mesa destination was not accepted independently");
      }

      const rejected = [
        provoUrl.replace("churchofjesuschrist.sharepoint.com", "example.com"),
        provoUrl.replace("provo-resource-package.zip", "albuquerque-resource-package.zip"),
        "https://churchofjesuschrist.sharepoint.com/sites/WSR_TSO/SitePages/Home.aspx"
      ];
      rejected.forEach(url => {
        let failed = false;
        try{
          parseSharePointPublishingUrl(url, "provo-resource-package.zip", "Provo");
        }catch(_err){
          failed = true;
        }
        if(!failed) throw new Error(`unsafe SharePoint destination was accepted: ${url}`);
      });
    }
  });

  tests.push({
    name: "SHAREPOINT DESTINATIONS ARE OFFICE SCOPED",
    fn: () => {
      const provoKey = getSharePointPublishingTargetStorageKey("provo");
      const mesaKey = getSharePointPublishingTargetStorageKey("mesa");
      const previousProvo = localStorage.getItem(provoKey);
      const previousMesa = localStorage.getItem(mesaKey);
      try{
        localStorage.removeItem(provoKey);
        localStorage.removeItem(mesaKey);
        const provoTarget = parseSharePointPublishingUrl(
          "https://churchofjesuschrist.sharepoint.com/sites/WSR_TSO/Provo%20TSO/Forms/AllItems.aspx?id=%2Fsites%2FWSR_TSO%2FProvo%20TSO%2Fprovo-resource-package.zip&parent=%2Fsites%2FWSR_TSO%2FProvo%20TSO",
          "provo-resource-package.zip",
          "Provo"
        );
        saveSharePointPublishingTarget(provoTarget, "provo");
        if(!getSharePointPublishingTarget("provo")) throw new Error("Provo destination was not saved");
        if(getSharePointPublishingTarget("mesa")) throw new Error("Provo destination leaked into Mesa storage");
        if(provoKey === mesaKey) throw new Error("office destination keys were not scoped");
      }finally{
        if(previousProvo == null) localStorage.removeItem(provoKey);
        else localStorage.setItem(provoKey, previousProvo);
        if(previousMesa == null) localStorage.removeItem(mesaKey);
        else localStorage.setItem(mesaKey, previousMesa);
      }
    }
  });

  tests.push({
    name: "SHAREPOINT DOWNLOAD DETECTION",
    fn: () => {
      if(!isPublishingPackageFileName("provo-resource-package.zip", "provo-resource-package.zip")) throw new Error("canonical download name was rejected");
      if(!isPublishingPackageFileName("provo-resource-package (2).zip", "provo-resource-package.zip")) throw new Error("Edge duplicate download name was rejected");
      if(isPublishingPackageFileName("provo-resources.json", "provo-resource-package.zip")) throw new Error("non-ZIP filename was accepted");

      const baseline = publishingFileSnapshot([
        { name:"provo-resource-package.zip", lastModified:10, size:100 }
      ]);
      const unchanged = findNewPublishingDownload([
        { name:"provo-resource-package.zip", lastModified:10, size:100 }
      ], baseline);
      if(unchanged) throw new Error("unchanged staged package looked like a new download");
      const downloaded = findNewPublishingDownload([
        { name:"provo-resource-package.zip", lastModified:10, size:100 },
        { name:"provo-resource-package (1).zip", lastModified:20, size:120 }
      ], baseline);
      if(!downloaded || downloaded.name !== "provo-resource-package (1).zip"){
        throw new Error("newest completed Edge download was not selected");
      }
    }
  });

  tests.push({
    name: "SHAREPOINT PUBLISHING BUTTON AND PROGRESS COPY",
    fn: () => {
      const wrap = document.createElement("div");
      wrap.innerHTML = `${getSharePointPublishingButtonHTML(true)}<button>Admin Help</button>`;
      const labels = Array.from(wrap.querySelectorAll("button")).map(button => button.textContent.trim());
      if(labels.join("|") !== "Publish to SharePoint|Admin Help"){
        throw new Error("Publish to SharePoint was not immediately left of Admin Help");
      }
      if(getSharePointPublishingButtonHTML(false) !== "") throw new Error("template showed publishing button");
      if(!isSharePointPublishingAvailable("mesa") || isSharePointPublishingAvailable("new") || isSharePointPublishingAvailable("")){
        throw new Error("publishing availability did not distinguish office files from the template");
      }

      const target = parseSharePointPublishingUrl(
        "https://churchofjesuschrist.sharepoint.com/sites/WSR_TSO/Provo%20TSO/Forms/AllItems.aspx?id=%2Fsites%2FWSR_TSO%2FProvo%20TSO%2Fprovo-resource-package.zip&parent=%2Fsites%2FWSR_TSO%2FProvo%20TSO",
        "provo-resource-package.zip",
        "Provo"
      );
      const setupRun = { target:null, state:"destination-setup", destinationInput:"", errorMessage:"", warnings:[] };
      if(!sharePointPublishingBodyHTML(setupRun).includes("SharePoint resource-package URL")){
        throw new Error("first-use SharePoint destination setup was missing");
      }
      const run = { target, state:"waiting", directoryName:"Downloads", warnings:[] };
      if(!sharePointPublishingBodyHTML(run).includes("Downloading the current resource package")){
        throw new Error("download progress copy missing");
      }
      run.state = "merging";
      if(!sharePointPublishingBodyHTML(run).includes("Merging")) throw new Error("merge progress copy missing");
      run.state = "complete";
      run.outputFileName = target.packageFileName;
      run.packageVersion = 8;
      run.savedAt = "2026-08-06T12:00:00.000Z";
      run.resourcesAdded = 2;
      run.resourcesUpdated = 3;
      run.approvedDeletions = 1;
      if(!sharePointPublishingBodyHTML(run).includes("Merge complete")) throw new Error("merge completion copy missing");
      if(!sharePointPublishingBodyHTML(run).includes("Provo TSO")) throw new Error("office-neutral completion copy did not use the configured office");
      if(!sharePointPublishingBodyHTML(run).includes("Upload to SharePoint")) throw new Error("SharePoint upload prompt missing");
      const completionText = sharePointPublishingBodyHTML(run);
      ["Save time", "Resources added", "Resources updated", "Approved deletions", "SharePoint destination", "I replaced the package"]
        .forEach(label => {
          if(!completionText.includes(label)) throw new Error(`publication summary omitted ${label}`);
        });
      if(!completionText.includes("cannot independently verify")){
        throw new Error("manual SharePoint verification limitation was omitted");
      }
    }
  });

  tests.push({
    name: "PUBLICATION HISTORY IS OFFICE SCOPED AND MANUALLY CONFIRMED",
    fn: () => {
      const provoKey = getPublicationHistoryStorageKey("provo");
      const mesaKey = getPublicationHistoryStorageKey("mesa");
      const previousProvo = localStorage.getItem(provoKey);
      const previousMesa = localStorage.getItem(mesaKey);
      try{
        if(!officePublicationHistoryHTML([]).includes("No guided publishing activity has been recorded on this computer.")){
          throw new Error("empty publishing history did not explain its local scope");
        }
        localStorage.removeItem(provoKey);
        localStorage.removeItem(mesaKey);
        const record = PublicationHistoryStore.recordSaved({
          savedAt:"2026-08-06T12:00:00.000Z",
          packageVersion:14,
          fileName:"provo-resource-package.zip",
          resourceCount:20,
          resourcesAdded:2,
          resourcesUpdated:3,
          approvedDeletions:1,
          sharePointFolder:"/sites/WSR_TSO/Provo TSO"
        }, "provo");
        if(PublicationHistoryStore.load("mesa").length){
          throw new Error("Provo publishing history leaked into Mesa");
        }
        const confirmed = PublicationHistoryStore.confirmReplaced(
          record.id,
          "2026-08-06T12:10:00.000Z",
          "provo"
        );
        if(!confirmed || confirmed.replacedAt !== "2026-08-06T12:10:00.000Z"){
          throw new Error("manual package replacement was not recorded");
        }
        const html = officePublicationHistoryHTML(PublicationHistoryStore.load("provo"));
        if(!html.includes("Replacement recorded") || !html.includes("provo-resource-package.zip")){
          throw new Error("publication history did not render confirmation and filename");
        }
      }finally{
        if(previousProvo == null) localStorage.removeItem(provoKey);
        else localStorage.setItem(provoKey, previousProvo);
        if(previousMesa == null) localStorage.removeItem(mesaKey);
        else localStorage.setItem(mesaKey, previousMesa);
      }
    }
  });

  tests.push({
    name: "SHAREPOINT PUBLISHING MERGES CURRENT CANONICAL PACKAGE",
    fn: async () => {
      const previousData = data;
      const previousEditing = editing;
      const previousStoredData = localStorage.getItem(DATA_STORAGE_KEY);
      const previousUndo = localStorage.getItem(UNDO_STORAGE_KEY);
      const previousRecovery = localStorage.getItem(PRE_MERGE_STORAGE_KEY);
      const publicationHistoryKey = getPublicationHistoryStorageKey();
      const previousPublicationHistory = localStorage.getItem(publicationHistoryKey);
      const previousPublishRun = sharePointPublishRun;
      const previousLastOpenedHandle = lastOpenedResourcePackageHandle;
      const previousSafeRender = safeRender;
      const previousRenderPublishingModal = renderSharePointPublishingModal;
      const previousGetPDF = getPDF;
      const previousSavePDF = savePDF;
      const previousAlert = window.alert;
      try{
        const localPdfPath = "pdfs/prepared-local.pdf";
        const canonicalPdfPath = "pdfs/current-canonical.pdf";
        const assets = new Map([
          [localPdfPath, new Blob(["prepared PDF"], { type:"application/pdf" })]
        ]);
        getPDF = async path => assets.get(path) || null;
        savePDF = async (path, blob) => { assets.set(path, blob); };
        safeRender = () => {};
        renderSharePointPublishingModal = () => {};
        window.alert = message => { throw new Error(`unexpected alert: ${message}`); };
        localStorage.removeItem(UNDO_STORAGE_KEY);
        localStorage.removeItem(PRE_MERGE_STORAGE_KEY);
        localStorage.removeItem(publicationHistoryKey);
        editing = null;
        data = {
          packageVersion:11,
          categories:[{ id:"prepared", label:"Prepared", filters:[], lastModified:"2026-08-04T17:00:00.000Z" }],
          forGroups:["Families"],
          resources:[
            {
              id:"prepared-local",
              name:"Prepared Local Resource",
              categories:["prepared"],
              categoryFilters:{ prepared:[] },
              forGroups:["Families"],
              informationText:"Prepared by Admin A",
              pdfs:[{ name:"prepared-local.pdf", path:localPdfPath }],
              lastModified:"2026-08-04T17:00:00.000Z"
            },
            {
              id:"retired",
              name:"Retired Resource",
              categories:[],
              categoryFilters:{},
              forGroups:[],
              informationText:"",
              lastModified:"2026-08-01T12:00:00.000Z"
            }
          ],
          changes:[createChangeEntry(
            "resource",
            "added",
            "prepared-local",
            "Prepared Local Resource",
            "Prepared by Admin A"
          )],
          deletionRequests:[],
          deletions:[]
        };

        const canonicalData = {
          resourcePackageSchemaVersion:RESOURCE_PACKAGE_SCHEMA_VERSION,
          appVersion:APP_VERSION,
          packageVersion:12,
          categories:[{ id:"canonical", label:"Canonical", filters:[], lastModified:"2026-08-04T18:00:00.000Z" }],
          forGroups:["Veterans"],
          resources:[{
            id:"current-canonical",
            name:"Current Canonical Resource",
            categories:["canonical"],
            categoryFilters:{ canonical:[] },
            forGroups:["Veterans"],
            informationText:"Published by Admin B",
            pdfs:[{ name:"current-canonical.pdf", path:canonicalPdfPath }],
            lastModified:"2026-08-04T18:00:00.000Z"
          }],
          changes:[createChangeEntry(
            "resource",
            "added",
            "current-canonical",
            "Current Canonical Resource",
            "Published by Admin B"
          )],
          deletionRequests:[],
          deletions:[{
            kind:"resource",
            targetId:"retired",
            label:"Retired Resource",
            deletedAt:"2026-08-04T18:00:00.000Z"
          }]
        };
        const incomingZip = new JSZip();
        incomingZip.file("tso-resources.json", JSON.stringify(canonicalData));
        incomingZip.file(canonicalPdfPath, new Blob(["canonical PDF"], { type:"application/pdf" }));
        const incomingBlob = await incomingZip.generateAsync({ type:"blob" });
        const incomingFile = new File([incomingBlob], "provo-resource-package (1).zip", {
          type:"application/zip",
          lastModified:Date.now()
        });

        let savedBlob = null;
        const outputHandle = {
          kind:"file",
          name:"provo-resource-package.zip",
          async createWritable(){
            return {
              async write(blob){ savedBlob = blob; },
              async close(){},
              async abort(){}
            };
          }
        };
        const directoryHandle = {
          kind:"directory",
          name:"Downloads",
          async getFileHandle(name){
            if(name !== "provo-resource-package.zip") throw new Error(`unexpected output name ${name}`);
            return outputHandle;
          }
        };
        sharePointPublishRun = {
          state:"ready",
          target:{ packageFileName:"provo-resource-package.zip" },
          directoryHandle,
          directoryName:"Downloads",
          warnings:[]
        };

        await mergeAndSaveSharePointPackage({
          name:incomingFile.name,
          file:incomingFile,
          lastModified:incomingFile.lastModified,
          size:incomingFile.size
        });

        if(sharePointPublishRun.state !== "complete"){
          throw new Error(`publishing ended in '${sharePointPublishRun.state}' instead of complete`);
        }
        if(sharePointPublishRun.resourcesAdded !== 1 || sharePointPublishRun.resourcesUpdated !== 0
          || sharePointPublishRun.approvedDeletions !== 0 || !sharePointPublishRun.savedAt){
          throw new Error(
            `publishing summary was added=${sharePointPublishRun.resourcesAdded}, ` +
            `updated=${sharePointPublishRun.resourcesUpdated}, deletions=${sharePointPublishRun.approvedDeletions}, ` +
            `savedAt=${sharePointPublishRun.savedAt}`
          );
        }
        if(getRecoveryPoints().length !== 1){
          throw new Error("guided publishing did not retain a pre-merge recovery point");
        }
        if(PublicationHistoryStore.load().length !== 1 || !sharePointPublishRun.publicationId){
          throw new Error("saved publication was not recorded locally");
        }
        if(!savedBlob) throw new Error("merged canonical package was not written");
        const savedZip = await JSZip.loadAsync(savedBlob);
        const savedJsonFile = savedZip.file("tso-resources.json");
        if(!savedJsonFile) throw new Error("saved package omitted tso-resources.json");
        const savedData = JSON.parse(await savedJsonFile.async("string"));
        const savedIds = new Set(savedData.resources.map(resource => resource.id));
        if(savedData.packageVersion !== 13) throw new Error(`expected Package 13, got ${savedData.packageVersion}`);
        if(!savedIds.has("prepared-local") || !savedIds.has("current-canonical")){
          throw new Error("prepared or current canonical resource was lost");
        }
        if(savedIds.has("retired")) throw new Error("canonical tombstone did not remove the retired resource");
        if(!savedData.deletions.some(record => record.key === "resource:retired")){
          throw new Error("canonical tombstone was not retained");
        }
        if(savedData.changes.length !== 1 || savedData.changes[0].targetId !== "prepared-local"){
          throw new Error("prepared change log was not preserved for publication");
        }
        if(!savedZip.file(localPdfPath) || !savedZip.file(canonicalPdfPath)){
          throw new Error("prepared or canonical PDF was omitted from the saved package");
        }
        confirmSharePointPackageUploaded();
        const recorded = PublicationHistoryStore.load()[0];
        if(sharePointPublishRun.state !== "uploaded" || !recorded.replacedAt){
          throw new Error("manual SharePoint replacement confirmation was not recorded");
        }
        if(getRecoveryPoints().length !== 1){
          throw new Error("replacement confirmation removed recovery history");
        }
      }finally{
        window.alert = previousAlert;
        getPDF = previousGetPDF;
        savePDF = previousSavePDF;
        safeRender = previousSafeRender;
        renderSharePointPublishingModal = previousRenderPublishingModal;
        sharePointPublishRun = previousPublishRun;
        lastOpenedResourcePackageHandle = previousLastOpenedHandle;
        editing = previousEditing;
        data = previousData;
        if(previousStoredData == null) localStorage.removeItem(DATA_STORAGE_KEY);
        else localStorage.setItem(DATA_STORAGE_KEY, previousStoredData);
        if(previousUndo == null) localStorage.removeItem(UNDO_STORAGE_KEY);
        else localStorage.setItem(UNDO_STORAGE_KEY, previousUndo);
        if(previousRecovery == null) localStorage.removeItem(PRE_MERGE_STORAGE_KEY);
        else localStorage.setItem(PRE_MERGE_STORAGE_KEY, previousRecovery);
        if(previousPublicationHistory == null) localStorage.removeItem(publicationHistoryKey);
        else localStorage.setItem(publicationHistoryKey, previousPublicationHistory);
      }
    }
  });

  tests.push({
    name: "PACKAGE SAVE VERSION BUMP",
    fn: () => {
      if(getNextPackageVersionValue(undefined) !== 1) throw new Error("missing package version should start at 1");
      if(getNextPackageVersionValue("Unknown") !== 1) throw new Error("unknown package version should start at 1");
      if(getNextPackageVersionValue(1) !== 2) throw new Error("numeric package version should increment");
      if(getNextPackageVersionValue("7") !== 8) throw new Error("string numeric package version should increment");
      const summary = formatPackageChangeSummary(createChangeEntry("resource", "updated", "career-education", "Career Education", "Formatted the services"));
      if(summary !== "Career Education - Formatted the services"){
        throw new Error(`unexpected package change summary '${summary}'`);
      }
    }
  });

  tests.push({
    name: "PACKAGE SAVE REUSES OPENED FILE LOCATION",
    fn: () => {
      const previousHandle = lastOpenedResourcePackageHandle;
      const openedHandle = { kind:"file", name:"received-resource-package.zip" };
      let pickerOptions = null;
      const originalPicker = window.showSaveFilePicker;
      try{
        lastOpenedResourcePackageHandle = openedHandle;
        window.showSaveFilePicker = options => {
          pickerOptions = options;
          return Promise.reject(Object.assign(new Error("test complete"), { name:"AbortError" }));
        };
        beginResourcePackageSave().catch(() => {});
        if(!pickerOptions) throw new Error("save picker was not opened");
        if(pickerOptions.id !== "tso-resources") throw new Error("save picker did not reuse the resource package picker id");
        if(pickerOptions.startIn !== openedHandle) throw new Error("save picker did not start at the opened package location");
      }finally{
        lastOpenedResourcePackageHandle = previousHandle;
        if(originalPicker === undefined) delete window.showSaveFilePicker;
        else window.showSaveFilePicker = originalPicker;
      }
    }
  });

  tests.push({
    name: "PACKAGE SAVE DOWNLOAD FILENAME",
    fn: () => {
      const originalCreateObjectURL = URL.createObjectURL;
      const originalRevokeObjectURL = URL.revokeObjectURL;
      const originalClick = HTMLAnchorElement.prototype.click;
      let clicked = null;
      try{
        URL.createObjectURL = () => "blob:tso-test";
        URL.revokeObjectURL = () => {};
        HTMLAnchorElement.prototype.click = function(){
          clicked = {
            href: this.getAttribute("href"),
            download: this.getAttribute("download"),
            type: this.getAttribute("type")
          };
        };
        const expectedFileName = getResourcePackageFilename();
        downloadResourcePackageBlob(expectedFileName, new Blob(["{}"], { type:"application/json" }));
        if(!clicked) throw new Error("download link was not clicked");
        if(clicked.href !== "blob:tso-test") throw new Error("download link did not use object URL");
        if(clicked.download !== expectedFileName) throw new Error(`download filename was '${clicked.download}'`);
        if(clicked.type !== "application/json") throw new Error("download link should advertise JSON");
      }finally{
        URL.createObjectURL = originalCreateObjectURL;
        URL.revokeObjectURL = originalRevokeObjectURL;
        HTMLAnchorElement.prototype.click = originalClick;
      }
    }
  });

  tests.push({
    name: "RESOURCE PACKAGE FILENAME DERIVATION",
    fn: () => {
      const previousTsoName = localStorage.getItem(TSO_NAME_STORAGE_KEY);
      try{
        localStorage.removeItem(TSO_NAME_STORAGE_KEY);
        if(isNewTemplateFile() && getResourcePackageFilename() !== "tso-resources.json"){
          throw new Error(`new.html package filename was ${getResourcePackageFilename()}`);
        }
        if(isNewTemplateFile() && getResourcePackageZipFilename() !== "tso-resource-package.zip"){
          throw new Error(`new.html package zip filename was ${getResourcePackageZipFilename()}`);
        }
        localStorage.setItem(TSO_NAME_STORAGE_KEY, "Provo");
        if(getResourcePackageFilename() !== "provo-resources.json"){
          throw new Error(`Provo package filename was ${getResourcePackageFilename()}`);
        }
        if(getResourcePackageZipFilename() !== "provo-resource-package.zip"){
          throw new Error(`Provo package zip filename was ${getResourcePackageZipFilename()}`);
        }
      }finally{
        if(previousTsoName === null) localStorage.removeItem(TSO_NAME_STORAGE_KEY);
        else localStorage.setItem(TSO_NAME_STORAGE_KEY, previousTsoName);
      }
    }
  });

  tests.push({
    name: "PACKAGE MERGE SUMMARY FALLBACK",
    fn: () => {
      const local = {
        appVersion:"1.4.1",
        packageVersion:18,
        lastModified:"2026-01-01T00:00:00.000Z",
        categories:[],
        resources:[
          { id:"r1", name:"Resource One", description:"Old", informationText:"", lastModified:"2026-01-01T00:00:00.000Z" }
        ],
        changes:[]
      };
      const incoming = {
        appVersion:"1.4.1",
        packageVersion:19,
        lastModified:"2026-02-01T00:00:00.000Z",
        categories:[],
        resources:[
          { id:"r1", name:"Resource One", description:"New", informationText:"", lastModified:"2026-02-01T00:00:00.000Z" },
          { id:"r2", name:"Resource Two", description:"Added", informationText:"", lastModified:"2026-02-01T00:00:00.000Z" }
        ],
        changes:[]
      };
      const { summary } = mergeResourcePackages(local, incoming);
      const fallback = buildPackageMergeSummary(summary);
      if(!fallback.includes("Resource One - Resource updated")){
        throw new Error("missing updated resource fallback summary");
      }
      if(!fallback.includes("Resource Two - Resource added")){
        throw new Error("missing added resource fallback summary");
      }
    }
  });

  tests.push({
    name: "OLDER PACKAGE DOES NOT LOWER WORKING PACKAGE VERSION",
    fn: () => {
      const local = {
        packageVersion:11,
        categories:[],
        resources:[{
          id:"amelia-resource",
          name:"Amelia Resource",
          informationText:"",
          lastModified:"2026-07-22T18:00:00.000Z"
        }],
        changes:[]
      };
      const incoming = {
        packageVersion:6,
        categories:[],
        resources:[{
          id:"amelia-resource",
          name:"Amelia Resource",
          informationText:"",
          lastModified:"2026-07-22T17:00:00.000Z"
        }],
        changes:[]
      };
      const { mergedData, summary } = mergeResourcePackages(local, incoming);
      if(mergedData.packageVersion !== 11){
        throw new Error(`older package lowered working version to ${mergedData.packageVersion}`);
      }
      if(summary.resourcesAdded || summary.resourcesUpdated || summary.categoriesAdded || summary.categoriesUpdated){
        throw new Error("older duplicate package reported updates");
      }
    }
  });

  tests.push({
    name: "OLDER PACKAGE DOES NOT REPLACE LATEST PACKAGE UPDATE INFO",
    fn: () => {
      const latestInfo = {
        sourcePackageVersion:15,
        loadedAt:"2026-07-24T12:00:00.000Z",
        changes:["Current update"]
      };
      if(shouldReplaceLatestPackageInfo(latestInfo, 6)){
        throw new Error("older package replaced latest package update info");
      }
      if(!shouldReplaceLatestPackageInfo(latestInfo, 16)){
        throw new Error("later package did not replace latest package update info");
      }
      if(!shouldReplaceLatestPackageInfo({
        sourcePackageVersion:6,
        loadedAt:"2026-07-24T12:00:00.000Z",
        changes:[]
      }, 15)){
        throw new Error("newer package could not restore overwritten update info");
      }
    }
  });

  tests.push({
    name: "PACKAGE MERGE PRESERVES TAXONOMY SHAPE",
    fn: () => {
      const local = {
        resourcePackageSchemaVersion:RESOURCE_PACKAGE_SCHEMA_VERSION,
        packageVersion:20,
        categories:[
          { id:"housing", label:"Housing", filters:["Shared Rooms"], lastModified:"2026-02-01T00:00:00.000Z" }
        ],
        forGroups:["Veterans"],
        resources:[
          {
            id:"rooms",
            name:"Rooms",
            categories:["housing"],
            categoryFilters:{ housing:["Shared Rooms"] },
            forGroups:["Veterans"],
            informationText:"",
            lastModified:"2026-02-01T00:00:00.000Z"
          }
        ],
        changes:[]
      };
      const incoming = {
        resourcePackageSchemaVersion:RESOURCE_PACKAGE_SCHEMA_VERSION,
        packageVersion:21,
        categories:[
          { id:"housing", label:"Housing", filters:["Temporary"], lastModified:"2026-01-01T00:00:00.000Z" },
          { id:"food", label:"Food", filters:["Food Pantries"], lastModified:"2026-03-01T00:00:00.000Z" }
        ],
        forGroups:["Seniors"],
        resources:[
          {
            id:"rooms",
            name:"Rooms",
            categories:["housing"],
            categoryFilters:{ housing:["Temporary"] },
            forGroups:["Seniors"],
            informationText:"",
            lastModified:"2026-01-01T00:00:00.000Z"
          },
          {
            id:"pantry",
            name:"Pantry",
            categories:["food"],
            categoryFilters:{ food:["Food Pantries"] },
            forGroups:["Seniors"],
            informationText:"",
            lastModified:"2026-03-01T00:00:00.000Z"
          }
        ],
        changes:[]
      };
      const { mergedData } = mergeResourcePackages(local, incoming);
      const housing = mergedData.categories.find(category => category.id === "housing");
      const food = mergedData.categories.find(category => category.id === "food");
      const rooms = mergedData.resources.find(resource => resource.id === "rooms");
      const pantry = mergedData.resources.find(resource => resource.id === "pantry");
      if(JSON.stringify(housing.filters) !== JSON.stringify(["Shared Rooms"])){
        throw new Error("newer local category filters were not preserved");
      }
      if(!food || JSON.stringify(food.filters) !== JSON.stringify(["Food Pantries"])){
        throw new Error("incoming category filters were not added");
      }
      if(JSON.stringify(rooms.categoryFilters) !== JSON.stringify({ housing:["Shared Rooms"] })){
        throw new Error("newer local resource category filters were not preserved");
      }
      if(!pantry || JSON.stringify(pantry.categoryFilters) !== JSON.stringify({ food:["Food Pantries"] })){
        throw new Error("incoming resource category filters were not added");
      }
      if(JSON.stringify(mergedData.forGroups) !== JSON.stringify(["Seniors", "Veterans"])){
        throw new Error(`For groups were not merged, got ${JSON.stringify(mergedData.forGroups)}`);
      }
      if(mergedData.resourcePackageSchemaVersion !== RESOURCE_PACKAGE_SCHEMA_VERSION){
        throw new Error("merged package schema version was not preserved");
      }
    }
  });

  tests.push({
    name: "PACKAGE MERGE RESTORES INCOMING PDF ATTACHMENTS",
    fn: () => {
      const local = {
        categories:[],
        resources:[{
          id:"housing",
          name:"Housing",
          description:"Newer local text",
          pdfs:[],
          lastModified:"2026-03-01T00:00:00.000Z"
        }],
        changes:[]
      };
      const incoming = {
        categories:[],
        resources:[{
          id:"housing",
          name:"Housing",
          description:"Older package text",
          pdfs:[{ id:"guide", name:"Housing Guide", path:"pdfs/housing/guide.pdf" }],
          lastModified:"2026-02-01T00:00:00.000Z"
        }],
        changes:[]
      };
      const { mergedData } = mergeResourcePackages(local, incoming);
      const resource = mergedData.resources[0];
      if(resource.description !== "Newer local text"){
        throw new Error("newer local resource text was overwritten");
      }
      if(resource.pdfs.length !== 1 || resource.pdfs[0].path !== "pdfs/housing/guide.pdf"){
        throw new Error("incoming PDF attachment was not restored onto the newer local resource");
      }
    }
  });

  tests.push({
    name: "PACKAGE MERGE HONORS NEWER INCOMING PDF REMOVAL",
    fn: () => {
      const local = {
        categories:[],
        resources:[{
          id:"housing",
          name:"Housing",
          pdfs:[{ id:"old", name:"Old Guide", path:"pdfs/housing/old.pdf" }],
          lastModified:"2026-01-01T00:00:00.000Z"
        }],
        changes:[]
      };
      const incoming = {
        categories:[],
        resources:[{
          id:"housing",
          name:"Housing",
          pdfs:[],
          lastModified:"2026-02-01T00:00:00.000Z"
        }],
        changes:[]
      };
      const { mergedData } = mergeResourcePackages(local, incoming);
      if(mergedData.resources[0].pdfs.length){
        throw new Error("newer incoming PDF removal was not preserved");
      }
    }
  });

  tests.push({
    name: "CATEGORY MIGRATIONS CONSOLIDATE LEGACY DATA",
    fn: () => {
      const local = {
        resourcePackageSchemaVersion:RESOURCE_PACKAGE_SCHEMA_VERSION,
        packageVersion:19,
        categories:[
          { id:"immigration", label:"Immigration", filters:["Asylum"] },
          { id:"legal", label:"Legal", filters:["Pro bono", "Immigration"] }
        ],
        resources:[{
          id:"immigration-help",
          name:"Immigration Help",
          categories:["immigration", "legal"],
          categoryFilters:{ immigration:["Asylum"], legal:["Pro bono"] },
          forGroups:[],
          informationText:"",
          lastModified:"2026-03-01T00:00:00.000Z"
        }],
        changes:[]
      };
      const incoming = {
        resourcePackageSchemaVersion:RESOURCE_PACKAGE_SCHEMA_VERSION,
        packageVersion:20,
        categories:[{ id:"legal", label:"Legal", filters:["Pro bono", "Immigration"] }],
        categoryMigrations:[{ fromId:"immigration", toId:"legal", toFilter:"Immigration" }],
        resources:[],
        changes:[]
      };
      const { mergedData } = mergeResourcePackages(local, incoming);
      if(mergedData.categories.some(category => category.id === "immigration")){
        throw new Error("legacy category survived migration");
      }
      const resource = mergedData.resources.find(item => item.id === "immigration-help");
      if(!resource || JSON.stringify(resource.categories) !== JSON.stringify(["legal"])){
        throw new Error(`legacy category assignment was not consolidated: ${JSON.stringify(resource && resource.categories)}`);
      }
      const legalFilters = resource.categoryFilters.legal || [];
      if(!legalFilters.includes("Pro bono") || !legalFilters.includes("Asylum") || !legalFilters.includes("Immigration")){
        throw new Error(`legacy category types were not preserved: ${JSON.stringify(legalFilters)}`);
      }
      if(resource.categoryFilters.immigration){
        throw new Error("legacy category type key survived migration");
      }
      const legalCategory = mergedData.categories.find(category => category.id === "legal");
      if(!legalCategory.filters.includes("Asylum")){
        throw new Error("migrated resource type was not declared on the canonical category");
      }
      if(JSON.stringify(mergedData.categoryMigrations) !== JSON.stringify(incoming.categoryMigrations)){
        throw new Error("category migrations were not preserved for future exports");
      }
    }
  });

  tests.push({
    name: "CATEGORY MIGRATIONS REMOVE OBSOLETE EMPTY CATEGORY",
    fn: () => {
      const local = {
        categories:[{ id:"vxx", label:"vxx", filters:[] }],
        resources:[{ id:"old", name:"Old", categories:["vxx"], categoryFilters:{ vxx:["Temporary"] } }],
        changes:[]
      };
      const incoming = {
        categories:[],
        categoryMigrations:[{ fromId:"vxx" }],
        resources:[],
        changes:[]
      };
      const { mergedData } = mergeResourcePackages(local, incoming);
      if(mergedData.categories.length) throw new Error("obsolete category was not removed");
      if(mergedData.resources[0].categories.length) throw new Error("obsolete category assignment was not removed");
      if(Object.keys(mergedData.resources[0].categoryFilters).length){
        throw new Error("obsolete category types were not removed");
      }
    }
  });

  tests.push({
    name: "CATEGORY MIGRATION VALIDATION",
    fn: () => {
      const valid = validateImportData({
        categories:[{ id:"legal", label:"Legal" }],
        categoryMigrations:[{ fromId:"old-legal", toId:"legal" }],
        resources:[]
      });
      if(!valid.ok) throw new Error(`valid category migration was rejected: ${valid.errors.join(", ")}`);
      const invalid = validateImportData({
        categories:[{ id:"legal", label:"Legal" }],
        categoryMigrations:[{ fromId:"old-legal", toId:"missing" }],
        resources:[]
      });
      if(invalid.ok || !invalid.errors.some(error => error.includes("unknown target 'missing'"))){
        throw new Error("unknown category migration target was not rejected");
      }
    }
  });

  tests.push({
    name: "CATEGORY NAMES ARE REQUIRED",
    fn: () => {
      const draftValidation = validateCategoryDraft({ id:"blank", label:"   " });
      if(draftValidation.valid || draftValidation.message !== "Category name is required."){
        throw new Error("blank category draft was not rejected");
      }
      const importValidation = validateImportData({
        categories:[{ id:"blank", label:"   " }],
        resources:[{
          id:"uses-blank",
          name:"Uses Blank Category",
          categories:["blank"],
          categoryFilters:{ blank:[] },
          forGroups:[]
        }]
      });
      if(importValidation.ok || !importValidation.errors.some(error => error.includes("missing a label"))){
        throw new Error("package with blank category label was not rejected");
      }
    }
  });

  tests.push({
    name: "UNUSED LEGACY GHOST CATEGORY IS REMOVED SAFELY",
    fn: () => {
      const legacyPackage = {
        categories:[
          { id:"ghost", label:"" },
          { id:"food", label:"Food" }
        ],
        resources:[{ id:"pantry", name:"Pantry", categories:["food"], categoryFilters:{} }],
        changes:[{ id:"change", categoryIds:["ghost", "food"] }]
      };
      const removed = removeUnusedUnnamedCategories(legacyPackage);
      if(JSON.stringify(removed) !== JSON.stringify(["ghost"])){
        throw new Error(`unused ghost category was not removed: ${JSON.stringify(removed)}`);
      }
      if(legacyPackage.categories.some(category => category.id === "ghost")){
        throw new Error("unused ghost category remained in the package");
      }
      if(JSON.stringify(legacyPackage.changes[0].categoryIds) !== JSON.stringify(["food"])){
        throw new Error("removed ghost category remained in change metadata");
      }
      const report = validateImportData(legacyPackage);
      if(!report.ok) throw new Error(`cleaned legacy package was rejected: ${report.errors.join(", ")}`);
    }
  });

  tests.push({
    name: "REFERENCED UNNAMED CATEGORY IS NOT DISCARDED",
    fn: () => {
      const unsafePackage = {
        categories:[{ id:"ghost", label:"" }],
        resources:[{ id:"assigned", name:"Assigned", categories:["ghost"], categoryFilters:{} }]
      };
      const removed = removeUnusedUnnamedCategories(unsafePackage);
      if(removed.length) throw new Error("referenced unnamed category was discarded");
      const report = validateImportData(unsafePackage);
      if(report.ok || !report.errors.some(error => error.includes("missing a label"))){
        throw new Error("referenced unnamed category did not remain a blocking error");
      }
    }
  });

  tests.push({
    name: "UNNAMED CATEGORIES ARE HIDDEN PUBLICLY AND VISIBLE IN ADMIN",
    fn: () => {
      const previousData = data;
      try{
        data = {
          categories:[
            { id:"blank", label:"", filters:[] },
            { id:"food", label:"Food", filters:[] }
          ],
          resources:[],
          changes:[]
        };
        const cards = getCategoryCardsForRender();
        if(cards.some(category => category.id === "blank")){
          throw new Error("unnamed category rendered on the public category grid");
        }
        const selector = document.createElement("div");
        populateCategoryBrowseOptions(selector, getAlphabeticalCategoryPairs());
        const unnamedOption = selector.querySelector('[data-category-id="blank"]');
        if(!unnamedOption || unnamedOption.textContent !== "(Unnamed category)"){
          throw new Error("unnamed category was not exposed for repair in Admin");
        }
      }finally{
        data = previousData;
      }
    }
  });

  tests.push({
    name: "NEW CATEGORY DRAFT IS NOT PERSISTED BEFORE DONE",
    fn: () => {
      const previousData = data;
      const previousAdminTab = adminTab;
      const previousSelectedCategoryIndex = selectedCategoryIndex;
      const previousEditing = editing;
      const previousEditorSnapshot = editorSnapshot;
      const previousStoredData = localStorage.getItem(DATA_STORAGE_KEY);
      let draftId = "";
      try{
        data = { categories:[], resources:[], forGroups:[], changes:[] };
        adminTab = "categories";
        selectedCategoryIndex = "";
        editing = null;
        editorSnapshot = "";
        renderAdmin();
        newCategory();
        draftId = String(data.categories[0] && data.categories[0].id || "");
        if(!draftId) throw new Error("new category draft was not created");
        if(localStorage.getItem(DATA_STORAGE_KEY) !== previousStoredData){
          throw new Error("new category draft was persisted before Done");
        }
      }finally{
        if(draftId) newCategoryIds.delete(draftId);
        data = previousData;
        adminTab = previousAdminTab;
        selectedCategoryIndex = previousSelectedCategoryIndex;
        editing = previousEditing;
        editorSnapshot = previousEditorSnapshot;
        if(previousStoredData == null) localStorage.removeItem(DATA_STORAGE_KEY);
        else localStorage.setItem(DATA_STORAGE_KEY, previousStoredData);
      }
    }
  });

  tests.push({
    name: "TITLE UPDATE TOGGLE",
    fn: () => {
      const previousView = view;
      const previousShowUpdateInfo = showUpdateInfo;
      const previousShowRecentChangeLog = showRecentChangeLog;
      const previousRecentUpdateDetail = recentUpdateDetail;
      const previousPendingRecentUpdates = pendingRecentUpdates;
      try{
        view = "categories";
        showUpdateInfo = false;
        showRecentChangeLog = false;
        toggleUpdateInfoView();
        if(view !== "recent-updates" || !showUpdateInfo || !showRecentChangeLog){
          throw new Error("title click should show update info");
        }
        showRecentChangeLog = false;
        toggleUpdateInfoView();
        if(view !== "categories" || showUpdateInfo || showRecentChangeLog){
          throw new Error("second title click should return to categories");
        }
      }finally{
        view = previousView;
        showUpdateInfo = previousShowUpdateInfo;
        showRecentChangeLog = previousShowRecentChangeLog;
        recentUpdateDetail = previousRecentUpdateDetail;
        pendingRecentUpdates = previousPendingRecentUpdates;
      }
    }
  });

  tests.push({
    name: "TOP BAR LEFT SWIPE TOGGLES ADMIN",
    fn: () => {
      const previousAdminVisible = isAdminVisible;
      const previousView = view;
      const previousTabDisplay = tabAdmin ? tabAdmin.style.display : "";
      try{
        setAdminVisibility(false);
        view = "categories";
        if(!isTopbarAdminLeftSwipe(
          { x:130, y:20, time:1000 },
          { x:30, y:30, time:1300 }
        )){
          throw new Error("left swipe should meet admin toggle threshold");
        }
        if(isTopbarAdminLeftSwipe(
          { x:130, y:20, time:1000 },
          { x:30, y:90, time:1300 }
        )){
          throw new Error("vertical swipe should not toggle admin");
        }
        toggleAdminModeFromTopbarSwipe();
        if(!isAdminVisible){
          throw new Error("top bar swipe should show Admin when hidden");
        }
        toggleAdminModeFromTopbarSwipe();
        if(isAdminVisible){
          throw new Error("top bar swipe should hide Admin when visible");
        }
      }finally{
        isAdminVisible = previousAdminVisible;
        view = previousView;
        if(tabAdmin) tabAdmin.style.display = previousTabDisplay;
        safeRender();
      }
    }
  });

  tests.push({
    name: "ADMIN CHANGE ENTRY CREATION",
    fn: () => {
      const entry = createChangeEntry("resource", "updated", "r1", "Resource One", "  Updated phone  ");
      if(!entry) throw new Error("change entry was not created");
      if(entry.description !== "Updated phone") throw new Error("description was not trimmed");
      if(entry.type !== "resource" || entry.action !== "updated" || entry.targetId !== "r1") throw new Error("entry fields were not set");
      if(!Date.parse(entry.timestamp)) throw new Error("timestamp is not parseable");
      const blankEntry = createChangeEntry("resource", "updated", "r1", "Resource One", "   ");
      if(!blankEntry) throw new Error("blank descriptions should still create entries");
      if(blankEntry.description !== "") throw new Error("blank description should be preserved as blank");
      if(!/Resource One/.test(formatChangeEntryHTML(blankEntry))) throw new Error("blank-description entry should render target name");
      if(!/resource updated/.test(formatChangeEntryHTML(blankEntry))) throw new Error("blank-description entry should render change type");
      const sample = { changes:[blankEntry] };
      normalizeChanges(sample);
      if(sample.changes.length !== 1) throw new Error("blank-description entries should survive normalization");
    }
  });

  tests.push({
    name: "BLANK UPDATE DESCRIPTION PROMPT",
    fn: () => {
      const previousEditing = editing;
      try{
        editing = { kind:"resource", idx:0 };
        promptBlankUpdateDescription();
        const modal = document.getElementById("blankUpdateDescriptionPrompt");
        const describeBtn = document.getElementById("blankUpdateDescribeBtn");
        const saveBtn = document.getElementById("blankUpdateSaveAnywayBtn");
        if(!modal) throw new Error("blank update prompt was not rendered");
        if(!/Please describe the change\(s\) you made/.test(modal.textContent || "")){
          throw new Error("blank update prompt text was missing");
        }
        if(!describeBtn || describeBtn.textContent !== "Describe changes"){
          throw new Error("describe button label changed");
        }
        if(!saveBtn || saveBtn.textContent !== "Save without description"){
          throw new Error("non-compliance button label changed");
        }
      }finally{
        closeBlankUpdateDescriptionPrompt();
        editing = previousEditing;
      }
    }
  });

  tests.push({
    name: "CATEGORY DELETE CHANGE LOG ENTRY",
    fn: () => {
      const description = getCategoryDeleteChangeDescription("");
      if(description !== "Deleted category."){
        throw new Error(`unexpected fallback description '${description}'`);
      }
      const entry = createChangeEntry("category", "removed", "holiday-needs", "Holiday Needs", description);
      if(!entry) throw new Error("category deletion should create a change entry");
      if(entry.targetName !== "Holiday Needs" || entry.action !== "removed"){
        throw new Error("category deletion entry fields were not set");
      }
    }
  });

  tests.push({
    name: "CATEGORY DELETE ACCEPTS INDEX ZERO",
    fn: () => {
      const previousData = data;
      const previousAdminTab = adminTab;
      const previousSelectedCategoryIndex = selectedCategoryIndex;
      const previousEditing = editing;
      const previousEditorSnapshot = editorSnapshot;
      const previousView = view;
      const previousConfirm = window.confirm;
      const previousStoredData = localStorage.getItem(DATA_STORAGE_KEY);
      const previousUndo = localStorage.getItem(UNDO_STORAGE_KEY);
      try{
        data = {
          categories:[{ id:"veterans-services", label:"Veterans Services", filters:[] }],
          resources:[{ id:"vet", name:"Veterans Resource", categories:["veterans-services"], categoryFilters:{ "veterans-services":["Benefits"] }, forGroups:[], informationText:"" }],
          forGroups:[],
          changes:[]
        };
        adminTab = "categories";
        selectedCategoryIndex = "0";
        editing = null;
        editorSnapshot = "";
        window.confirm = () => true;
        renderAdmin();
        const sel = document.getElementById("catSelect");
        if(!sel) throw new Error("category selector was not rendered");
        setCategoryBrowseSelection(sel, "0");
        editCategory(0);
        const labelInput = document.getElementById("cat_label");
        const updateInput = document.getElementById("cat_update_description");
        labelInput.value = "Veterans Assistance";
        labelInput.dispatchEvent(new Event("input", { bubbles:true }));
        updateInput.value = "Renamed before tagging the category";
        updateInput.dispatchEvent(new Event("input", { bubbles:true }));
        deleteCategory();
        const modal = document.getElementById("categoryDeletePrompt");
        if(!modal) throw new Error("category delete prompt did not render for index 0");
        if(!modal.textContent.includes("Veterans Assistance")){
          throw new Error("category deletion tagging discarded another pending category edit");
        }
        const confirmBtn = document.getElementById("categoryDeleteConfirmBtn");
        if(!confirmBtn) throw new Error("category delete confirm button missing");
        confirmBtn.click();
        if(!data.categories.some(category => category.id === "veterans-services")){
          throw new Error("tagging removed the index 0 category before review");
        }
        if(!data.resources[0].categories.includes("veterans-services")){
          throw new Error("tagging changed the category assignment before review");
        }
        if(!data.deletionRequests.some(request => request.key === "category:veterans-services")){
          throw new Error("index 0 category was not tagged for deletion");
        }
      }finally{
        closeCategoryDeletePrompt();
        window.confirm = previousConfirm;
        data = previousData;
        adminTab = previousAdminTab;
        selectedCategoryIndex = previousSelectedCategoryIndex;
        editing = previousEditing;
        editorSnapshot = previousEditorSnapshot;
        view = previousView;
        if(previousStoredData == null) localStorage.removeItem(DATA_STORAGE_KEY);
        else localStorage.setItem(DATA_STORAGE_KEY, previousStoredData);
        if(previousUndo == null) localStorage.removeItem(UNDO_STORAGE_KEY);
        else localStorage.setItem(UNDO_STORAGE_KEY, previousUndo);
      }
    }
  });

  tests.push({
    name: "CATEGORY DELETE ACCEPTS LAST SORTED ROW",
    fn: () => {
      const previousData = data;
      const previousAdminTab = adminTab;
      const previousSelectedCategoryIndex = selectedCategoryIndex;
      const previousEditing = editing;
      const previousEditorSnapshot = editorSnapshot;
      const previousView = view;
      const previousConfirm = window.confirm;
      const previousStoredData = localStorage.getItem(DATA_STORAGE_KEY);
      const previousUndo = localStorage.getItem(UNDO_STORAGE_KEY);
      try{
        data = {
          categories:[
            { id:"alpha", label:"Alpha", filters:[] },
            { id:"middle", label:"Middle", filters:[] },
            { id:"vxx", label:"vxx", filters:[] }
          ],
          resources:[{ id:"vxx-resource", name:"Vxx Resource", categories:["vxx"], categoryFilters:{ vxx:["Temporary"] }, forGroups:[], informationText:"" }],
          forGroups:[],
          changes:[]
        };
        adminTab = "categories";
        selectedCategoryIndex = "";
        editing = null;
        editorSnapshot = "";
        window.confirm = () => true;
        renderAdmin();
        const sel = document.getElementById("catSelect");
        if(!sel) throw new Error("category selector was not rendered");
        const options = Array.from(sel.querySelectorAll(".resource-listbox-option"));
        const lastOption = options[options.length - 1];
        if(!lastOption || lastOption.textContent !== "vxx") throw new Error("vxx was not the last sorted row");
        lastOption.click();
        if(selectedCategoryIndex !== "2") throw new Error(`expected sorted last row to select real index 2, got ${selectedCategoryIndex}`);
        editCategory(parseInt(selectedCategoryIndex, 10));
        deleteCategory();
        const modal = document.getElementById("categoryDeletePrompt");
        if(!modal) throw new Error("category delete prompt did not render for last sorted row");
        const subtitle = document.getElementById("categoryDeletePromptSubtitle");
        if(!subtitle || subtitle.textContent !== "vxx") throw new Error("delete prompt targeted the wrong category");
        const confirmBtn = document.getElementById("categoryDeleteConfirmBtn");
        if(!confirmBtn) throw new Error("category delete confirm button missing");
        confirmBtn.click();
        if(!data.categories.some(category => category.id === "vxx")){
          throw new Error("tagging removed the last sorted category before review");
        }
        if(!data.resources[0].categories.includes("vxx")){
          throw new Error("tagging changed the last sorted category assignment before review");
        }
        if(!data.deletionRequests.some(request => request.key === "category:vxx")){
          throw new Error("last sorted category was not tagged for deletion");
        }
      }finally{
        closeCategoryDeletePrompt();
        window.confirm = previousConfirm;
        data = previousData;
        adminTab = previousAdminTab;
        selectedCategoryIndex = previousSelectedCategoryIndex;
        editing = previousEditing;
        editorSnapshot = previousEditorSnapshot;
        view = previousView;
        if(previousStoredData == null) localStorage.removeItem(DATA_STORAGE_KEY);
        else localStorage.setItem(DATA_STORAGE_KEY, previousStoredData);
        if(previousUndo == null) localStorage.removeItem(UNDO_STORAGE_KEY);
        else localStorage.setItem(UNDO_STORAGE_KEY, previousUndo);
      }
    }
  });

  tests.push({
    name: "CATEGORY DELETE USES SELECTED ROW ID OVER STALE INDEX",
    fn: () => {
      const previousData = data;
      const previousAdminTab = adminTab;
      const previousSelectedCategoryIndex = selectedCategoryIndex;
      const previousEditing = editing;
      const previousEditorSnapshot = editorSnapshot;
      const previousView = view;
      const previousConfirm = window.confirm;
      const previousStoredData = localStorage.getItem(DATA_STORAGE_KEY);
      const previousUndo = localStorage.getItem(UNDO_STORAGE_KEY);
      try{
        data = {
          categories:[
            { id:"alpha", label:"Alpha", filters:[] },
            { id:"middle", label:"Middle", filters:[] },
            { id:"vxx", label:"vxx", filters:[] }
          ],
          resources:[],
          forGroups:[],
          changes:[]
        };
        adminTab = "categories";
        selectedCategoryIndex = "";
        editing = null;
        editorSnapshot = "";
        window.confirm = () => true;
        renderAdmin();
        const sel = document.getElementById("catSelect");
        if(!sel) throw new Error("category selector was not rendered");
        const lastOption = Array.from(sel.querySelectorAll(".resource-listbox-option")).find(option => option.textContent === "vxx");
        if(!lastOption) throw new Error("vxx row missing");
        lastOption.click();
        selectedCategoryIndex = "0";
        deleteCategory();
        const modal = document.getElementById("categoryDeletePrompt");
        if(!modal) throw new Error("category delete prompt did not render with stale index");
        const subtitle = document.getElementById("categoryDeletePromptSubtitle");
        if(!subtitle || subtitle.textContent !== "vxx") throw new Error(`stale index targeted '${subtitle ? subtitle.textContent : ""}' instead of vxx`);
        const confirmBtn = document.getElementById("categoryDeleteConfirmBtn");
        if(!confirmBtn) throw new Error("category delete confirm button missing");
        confirmBtn.click();
        if(!data.categories.some(category => category.id === "vxx")){
          throw new Error("selected row category was removed before review when index was stale");
        }
        if(!data.categories.some(category => category.id === "alpha")){
          throw new Error("stale index category was removed instead");
        }
        if(!data.deletionRequests.some(request => request.key === "category:vxx")){
          throw new Error("selected row category was not tagged when index was stale");
        }
        if(data.deletionRequests.some(request => request.key === "category:alpha")){
          throw new Error("stale index category was tagged instead");
        }
      }finally{
        closeCategoryDeletePrompt();
        window.confirm = previousConfirm;
        data = previousData;
        adminTab = previousAdminTab;
        selectedCategoryIndex = previousSelectedCategoryIndex;
        editing = previousEditing;
        editorSnapshot = previousEditorSnapshot;
        view = previousView;
        if(previousStoredData == null) localStorage.removeItem(DATA_STORAGE_KEY);
        else localStorage.setItem(DATA_STORAGE_KEY, previousStoredData);
        if(previousUndo == null) localStorage.removeItem(UNDO_STORAGE_KEY);
        else localStorage.setItem(UNDO_STORAGE_KEY, previousUndo);
      }
    }
  });

  tests.push({
    name: "ADMIN CATEGORY LISTBOX RENDERING",
    fn: () => {
      const previousData = data;
      const previousAdminTab = adminTab;
      const previousSelectedCategoryIndex = selectedCategoryIndex;
      const previousEditing = editing;
      const previousEditorSnapshot = editorSnapshot;
      try{
        data = {
          categories:[
            { id:"food", label:"Food" },
            { id:"housing", label:"Apartments" }
          ],
          resources:[
            { id:"shelter", name:"Shelter Resource", categories:["housing"], informationText:"" }
          ],
          changes:[]
        };
        adminTab = "categories";
        selectedCategoryIndex = "";
        renderAdmin();
        const sel = document.getElementById("catSelect");
        if(!sel) throw new Error("category selector was not rendered");
        if(sel.tagName.toLowerCase() === "select") throw new Error("category selector should not use native select");
        if(sel.getAttribute("role") !== "listbox") throw new Error("category selector should expose listbox role");
        if(!sel.classList.contains("resource-button-listbox")) throw new Error("category selector should use custom listbox styling");
        const options = Array.from(sel.querySelectorAll(".resource-listbox-option"));
        if(options.length !== 2) throw new Error("category selector options were not populated");
        if(options[0].textContent !== "Apartments") throw new Error("category selector should sort alphabetically");
        if(selectedCategoryIndex !== "1") throw new Error("category selector should default to the first visible category");
        const resourceList = document.getElementById("adminCategoryResourceList");
        const editor = document.getElementById("catEditor");
        if(!resourceList || !editor || !editor.contains(resourceList)){
          throw new Error("category resource list should render inside the category editor");
        }
        if(!/Shelter Resource/.test(resourceList.textContent || "")){
          throw new Error("category resource list did not render the selected category resources");
        }
        sel.dispatchEvent(new KeyboardEvent("keydown", { key:"ArrowDown", bubbles:true }));
        if(selectedCategoryIndex !== "0") throw new Error("category selector keyboard navigation did not update selection");
      }finally{
        data = previousData;
        adminTab = previousAdminTab;
        selectedCategoryIndex = previousSelectedCategoryIndex;
        editing = previousEditing;
        editorSnapshot = previousEditorSnapshot;
      }
    }
  });

  tests.push({
    name: "CATEGORY FILTER EDITOR USES CHECKBOXES",
    fn: () => {
      const previousData = data;
      const previousAdminTab = adminTab;
      const previousSelectedCategoryIndex = selectedCategoryIndex;
      const previousEditing = editing;
      const previousEditorSnapshot = editorSnapshot;
      const previousConfirm = window.confirm;
      const previousStoredData = localStorage.getItem(DATA_STORAGE_KEY);
      const previousUndo = localStorage.getItem(UNDO_STORAGE_KEY);
      try{
        data = {
          categories:[
            { id:"food", label:"Food", filters:["Food Pantries", "Meals", "SNAP"] }
          ],
          resources:[],
          changes:[]
        };
        adminTab = "categories";
        selectedCategoryIndex = "0";
        renderAdmin();
        editCategory(0);
        const selectors = Array.from(document.querySelectorAll(".catFilterSelect"));
        if(selectors.length !== 3) throw new Error("category filter selectors were not rendered");
        if(selectors.some(selector => selector.type !== "checkbox")){
          throw new Error("category filter selectors should be checkboxes");
        }
        const labelInput = document.getElementById("cat_label");
        const updateInput = document.getElementById("cat_update_description");
        labelInput.value = "Food Assistance";
        labelInput.dispatchEvent(new Event("input", { bubbles:true }));
        updateInput.value = "Renamed before tagging Types";
        updateInput.dispatchEvent(new Event("input", { bubbles:true }));
        selectors[0].checked = true;
        selectors[1].checked = true;
        const deleteBtn = document.getElementById("cat_filter_delete_btn");
        if(!deleteBtn) throw new Error("delete filter button was not rendered");
        window.confirm = () => true;
        deleteBtn.click();
        const taggedKeys = new Set((data.deletionRequests || []).map(request => request.key));
        if(!taggedKeys.has("type:food:food pantries") || !taggedKeys.has("type:food:meals")){
          throw new Error("checked category filters were not tagged for deletion");
        }
        if(JSON.stringify(data.categories[0].filters) !== JSON.stringify(["Food Pantries", "Meals", "SNAP"])){
          throw new Error("tagging category filters should keep them active until merge review");
        }
        if(data.categories[0].label !== "Food Assistance"){
          throw new Error("Type deletion tagging discarded another pending category edit");
        }
      }finally{
        window.confirm = previousConfirm;
        data = previousData;
        adminTab = previousAdminTab;
        selectedCategoryIndex = previousSelectedCategoryIndex;
        editing = previousEditing;
        editorSnapshot = previousEditorSnapshot;
        if(previousStoredData == null) localStorage.removeItem(DATA_STORAGE_KEY);
        else localStorage.setItem(DATA_STORAGE_KEY, previousStoredData);
        if(previousUndo == null) localStorage.removeItem(UNDO_STORAGE_KEY);
        else localStorage.setItem(UNDO_STORAGE_KEY, previousUndo);
        renderAdmin();
      }
    }
  });

  tests.push({
    name: "CATEGORY EDITOR ACTION BAR IS STICKY AND DIRTY",
    fn: () => {
      const previousData = data;
      const previousAdminTab = adminTab;
      const previousSelectedCategoryIndex = selectedCategoryIndex;
      const previousEditing = editing;
      const previousEditorSnapshot = editorSnapshot;
      try{
        data = {
          categories:[{ id:"food", label:"Food", filters:[] }],
          resources:[],
          changes:[]
        };
        adminTab = "categories";
        selectedCategoryIndex = "0";
        renderAdmin();
        editCategory(0);
        const bar = document.getElementById("admin_editor_actions");
        const label = document.getElementById("cat_label");
        if(!bar || !label) throw new Error("category editor action bar was not rendered");
        if(!bar.hidden) throw new Error("category action bar should start hidden for unchanged existing category");
        if(document.getElementById("cat_done_btn")) throw new Error("category Done should not exist for unchanged existing category");
        label.value = "Food Help";
        label.dispatchEvent(new Event("input", { bubbles:true }));
        const doneBtn = document.getElementById("cat_done_btn");
        if(!doneBtn || !doneBtn.closest(".admin-sticky-editor-actions")) throw new Error("category Done should be in Admin sticky editor actions after edit");
        if(bar.hidden) throw new Error("category action bar should show after an edit");
      }finally{
        data = previousData;
        adminTab = previousAdminTab;
        selectedCategoryIndex = previousSelectedCategoryIndex;
        editing = previousEditing;
        editorSnapshot = previousEditorSnapshot;
        renderAdmin();
      }
    }
  });

  tests.push({
    name: "RESOURCE CATEGORY FILTER ASSIGNMENT",
    fn: () => {
      const previousData = data;
      const previousAdminTab = adminTab;
      const previousEditing = editing;
      const previousEditorSnapshot = editorSnapshot;
      const previousAdminResourceEditMode = adminResourceEditMode;
      const previousSelectedResourceId = selectedResourceId;
      try{
        data = {
          categories:[
            { id:"employment", label:"Employment", filters:["Career Training", "Temporary Employment"] }
          ],
          resources:[
            { id:"jobs", name:"Jobs Resource", categories:["employment"], categoryFilters:{ employment:["Temporary Employment"] }, informationText:"" }
          ],
          changes:[]
        };
        adminTab = "resources";
        adminResourceEditMode = true;
        selectedResourceId = "jobs";
        renderAdmin();
        editResource(0);
        const filterList = document.querySelector('[data-category-filters-for="employment"]');
        if(!filterList) throw new Error("resource editor did not render category filters");
        if(filterList.hidden) throw new Error("selected category filters should be visible");
        const filter = document.querySelector('.resCatFilter[value="Temporary Employment"]');
        if(!filter || !filter.checked) throw new Error("saved category filter was not checked");
        const draft = resourceEditorDraft();
        if(!draft.categoryFilters.employment || draft.categoryFilters.employment[0] !== "Temporary Employment"){
          throw new Error("resource draft did not capture category filter selection");
        }
      }finally{
        data = previousData;
        adminTab = previousAdminTab;
        editing = previousEditing;
        editorSnapshot = previousEditorSnapshot;
        adminResourceEditMode = previousAdminResourceEditMode;
        selectedResourceId = previousSelectedResourceId;
        renderAdmin();
      }
    }
  });

  tests.push({
    name: "RESOURCE EDITOR ACTION BAR IS STICKY AND CAN CANCEL CLEAN",
    fn: () => {
      const previousData = data;
      const previousAdminTab = adminTab;
      const previousEditing = editing;
      const previousEditorSnapshot = editorSnapshot;
      const previousAdminResourceEditMode = adminResourceEditMode;
      const previousSelectedResourceId = selectedResourceId;
      try{
        data = {
          categories:[],
          resources:[
            { id:"phone", name:"Phone Resource", phone:"", address:"", website:"", hours:"", description:"", categories:[], categoryFilters:{}, forGroups:[], informationText:"" }
          ],
          changes:[]
        };
        adminTab = "resources";
        adminResourceEditMode = true;
        selectedResourceId = "phone";
        renderAdmin();
        editResource(0);
        const bar = document.getElementById("admin_editor_actions");
        const phone = document.getElementById("res_phone");
        if(!bar || !phone) throw new Error("resource editor action bar was not rendered");
        if(bar.hidden) throw new Error("resource action bar should show for unchanged existing resource");
        const cleanCancelBtn = document.getElementById("res_cancel_btn");
        const cleanDoneBtn = document.getElementById("res_done_btn");
        if(!cleanCancelBtn || cleanCancelBtn.disabled) throw new Error("clean resource Cancel should be enabled");
        if(!cleanDoneBtn || cleanDoneBtn.disabled) throw new Error("clean resource Done should be enabled");
        cleanCancelBtn.click();
        if(adminResourceEditMode) throw new Error("clean resource Cancel should close the editor");
        adminResourceEditMode = true;
        selectedResourceId = "phone";
        renderAdmin();
        editResource(0);
        const updatedBar = document.getElementById("admin_editor_actions");
        const updatedPhone = document.getElementById("res_phone");
        if(!updatedBar || !updatedPhone) throw new Error("resource editor did not reopen");
        updatedPhone.value = "555-1212";
        updatedPhone.dispatchEvent(new Event("input", { bubbles:true }));
        const doneBtn = document.getElementById("res_done_btn");
        if(!doneBtn || !doneBtn.closest(".admin-sticky-editor-actions")) throw new Error("resource Done should be in Admin sticky editor actions after edit");
        if(updatedBar.hidden) throw new Error("resource action bar should show after an edit");
      }finally{
        data = previousData;
        adminTab = previousAdminTab;
        editing = previousEditing;
        editorSnapshot = previousEditorSnapshot;
        adminResourceEditMode = previousAdminResourceEditMode;
        selectedResourceId = previousSelectedResourceId;
        renderAdmin();
      }
    }
  });

  tests.push({
    name: "NEW RESOURCE CAN BE CANCELLED BEFORE VALID",
    fn: () => {
      const previousData = data;
      const previousAdminTab = adminTab;
      const previousEditing = editing;
      const previousEditorSnapshot = editorSnapshot;
      const previousAdminResourceEditMode = adminResourceEditMode;
      const previousSelectedResourceId = selectedResourceId;
      const previousNewResourceIds = newResourceIds;
      const previousPersist = persist;
      try{
        let persistCalls = 0;
        persist = () => { persistCalls += 1; };
        data = {
          categories:[],
          resources:[],
          changes:[]
        };
        adminTab = "resources";
        adminResourceEditMode = false;
        selectedResourceId = "";
        newResourceIds = new Set();
        renderAdmin();
        newResource();
        if(persistCalls !== 0) throw new Error("blank new resource was persisted before validation");
        const actionBar = document.getElementById("admin_editor_actions");
        const cancelBtn = document.getElementById("res_cancel_btn");
        const doneBtn = document.getElementById("res_done_btn");
        if(!actionBar || actionBar.hidden) throw new Error("new resource should show editor actions");
        if(!cancelBtn || cancelBtn.disabled) throw new Error("new resource Cancel should be enabled before valid");
        if(!doneBtn || !doneBtn.disabled) throw new Error("new resource Done should be disabled before valid");
        cancelBtn.click();
        if(data.resources.length !== 0) throw new Error("Cancel did not discard blank new resource");
        if(persistCalls !== 1) throw new Error("cancelled blank resource cleanup was not persisted");
      }finally{
        data = previousData;
        adminTab = previousAdminTab;
        editing = previousEditing;
        editorSnapshot = previousEditorSnapshot;
        adminResourceEditMode = previousAdminResourceEditMode;
        selectedResourceId = previousSelectedResourceId;
        newResourceIds = previousNewResourceIds;
        persist = previousPersist;
        renderAdmin();
      }
    }
  });

  tests.push({
    name: "RESOURCE INFORMATION PREVIEW IS DEFAULT",
    fn: () => {
      const previousData = data;
      const previousAdminTab = adminTab;
      const previousEditing = editing;
      const previousEditorSnapshot = editorSnapshot;
      const previousAdminResourceEditMode = adminResourceEditMode;
      const previousSelectedResourceId = selectedResourceId;
      try{
        data = {
          categories:[],
          resources:[
            { id:"info", name:"Info Resource", categories:[], informationText:"Preview text" }
          ],
          changes:[]
        };
        adminTab = "resources";
        adminResourceEditMode = true;
        selectedResourceId = "info";
        renderAdmin();
        editResource(0);
        const editor = document.getElementById("res_information_editor");
        const preview = document.getElementById("res_information_preview");
        const editBtn = document.getElementById("res_information_edit_btn");
        const previewBtn = document.getElementById("res_information_preview_btn");
        if(!editor || !preview || !editBtn || !previewBtn) throw new Error("information editor controls were not rendered");
        if(!editor.classList.contains("hidden")) throw new Error("information editor should be hidden on entry");
        if(preview.classList.contains("hidden")) throw new Error("information preview should be visible on entry");
        if(!previewBtn.classList.contains("primary") || editBtn.classList.contains("primary")){
          throw new Error("Preview button should be active on entry");
        }
        if(!/Preview text/.test(preview.textContent || "")){
          throw new Error("preview content was not rendered on entry");
        }
      }finally{
        data = previousData;
        adminTab = previousAdminTab;
        editing = previousEditing;
        editorSnapshot = previousEditorSnapshot;
        adminResourceEditMode = previousAdminResourceEditMode;
        selectedResourceId = previousSelectedResourceId;
        renderAdmin();
      }
    }
  });

  tests.push({
    name: "NEW ADMIN TIP IS PROMINENT",
    fn: () => withSelfTestHtmlFileName("new.html", () => {
      const previousData = data;
      const previousView = view;
      const previousTsoName = localStorage.getItem(TSO_NAME_STORAGE_KEY);
      try{
        data = {
          categories:[{ id:"food", label:"Food" }],
          resources:[],
          changes:[]
        };
        view = "categories";
        localStorage.setItem(TSO_NAME_STORAGE_KEY, "Test");
        render();
        const tip = appView.querySelector(".red-tip");
        if(!tip) throw new Error("new admin tip was not rendered");
        const tipText = tip.querySelector(".red-tip-text");
        if(!tipText || tipText.textContent !== TIP_TEXT.newAdminWelcome){
          throw new Error("new admin tip wording changed");
        }
        const style = getComputedStyle(tip);
        if(style.color !== "rgb(170, 0, 0)"){
          throw new Error(`new admin tip should be red, got ${style.color}`);
        }
        if(Number(style.fontWeight) < 700){
          throw new Error(`new admin tip should be bold, got ${style.fontWeight}`);
        }
      }finally{
        data = previousData;
        view = previousView;
        if(previousTsoName === null) localStorage.removeItem(TSO_NAME_STORAGE_KEY);
        else localStorage.setItem(TSO_NAME_STORAGE_KEY, previousTsoName);
      }
    })
  });

  tests.push({
    name: "RED TIPS CAN BE DISMISSED",
    fn: () => {
      const previousStoredTips = localStorage.getItem(DISMISSED_TIPS_STORAGE_KEY);
      const previousDismissedTips = dismissedTipIds;
      try{
        dismissedTipIds = new Set();
        localStorage.removeItem(DISMISSED_TIPS_STORAGE_KEY);
        const tip = createNewAdminTip("newAdminWelcome");
        if(!tip) throw new Error("dismissible tip was not created");
        const dismiss = tip.querySelector(".red-tip-dismiss");
        if(!dismiss || dismiss.getAttribute("aria-label") !== "Dismiss this tip"){
          throw new Error("dismissible tip did not include an accessible close button");
        }
        const host = document.createElement("div");
        host.appendChild(tip);
        dismiss.click();
        if(host.querySelector(".red-tip")) throw new Error("dismissed tip remained visible");
        if(!dismissedTipIds.has("newAdminWelcome")) throw new Error("dismissed tip was not remembered");
        if(createNewAdminTip("newAdminWelcome") !== null) throw new Error("dismissed tip rendered again");
      }finally{
        dismissedTipIds = previousDismissedTips;
        if(previousStoredTips === null) localStorage.removeItem(DISMISSED_TIPS_STORAGE_KEY);
        else localStorage.setItem(DISMISSED_TIPS_STORAGE_KEY, previousStoredTips);
      }
    }
  });

  tests.push({
    name: "USER TIP EXPLAINS FAVORITES AND ICON PRINTING",
    fn: () => {
      const wasDismissed = dismissedTipIds.has("user");
      try{
        dismissedTipIds.delete("user");
        const tip = createTip("user");
        if(!tip) throw new Error("user tip was not created");
        if((tip.textContent || "").includes("⬜")) throw new Error("user tip still shows the old print checkbox");
        if(!(tip.textContent || "").includes("Favorites")) throw new Error("user tip does not explain Favorites");
        if(!tip.querySelector('[data-icon="printer"]')) throw new Error("user tip does not show the printer icon");
        if(!tip.querySelector('[data-icon="star-outline"]')) throw new Error("user tip does not show the outline star");
        if(!tip.querySelector('[data-icon="star-filled"]')) throw new Error("user tip does not show the filled star");
      }finally{
        if(wasDismissed) dismissedTipIds.add("user");
        else dismissedTipIds.delete("user");
      }
    }
  });

  tests.push({
    name: "USER HELP BUTTON HAS NO OUTLINE BORDER",
    fn: () => {
      const help = document.getElementById("helpButton");
      if(!help) throw new Error("user Help button missing");
      const style = getComputedStyle(help);
      if(style.borderTopStyle !== "none" && style.borderTopWidth !== "0px"){
        throw new Error(`user Help button should not have an outline border, got ${style.borderTopStyle} ${style.borderTopWidth}`);
      }
      if(style.outlineStyle !== "none" && style.outlineWidth !== "0px"){
        throw new Error(`user Help button should not have an outline, got ${style.outlineStyle} ${style.outlineWidth}`);
      }
    }
  });

  tests.push({
    name: "NEW TEMPLATE SHOWS NEW ADMIN WELCOME TIP",
    fn: () => withSelfTestHtmlFileName("new.html", () => {
      const previousData = data;
      const previousView = view;
      const previousTsoName = localStorage.getItem(TSO_NAME_STORAGE_KEY);
      try{
        data = { categories:[{ id:"food", label:"Food" }], resources:[], changes:[] };
        view = "categories";
        localStorage.removeItem(TSO_NAME_STORAGE_KEY);
        render();
        const tip = appView.querySelector(".red-tip");
        if(!tip) throw new Error("new admin welcome tip was not rendered");
        const tipText = tip.querySelector(".red-tip-text");
        if(!tipText || tipText.textContent !== TIP_TEXT.newAdminWelcome){
          throw new Error("new admin welcome tip wording changed");
        }
        if(!tip.classList.contains("new-admin-tip")){
          throw new Error("new admin welcome tip should use larger styling");
        }
        const fontSize = parseFloat(getComputedStyle(tip).fontSize);
        if(!(fontSize > 11)){
          throw new Error(`new admin welcome tip should be larger than user tip, got ${fontSize}`);
        }
      }finally{
        data = previousData;
        view = previousView;
        if(previousTsoName === null) localStorage.removeItem(TSO_NAME_STORAGE_KEY);
        else localStorage.setItem(TSO_NAME_STORAGE_KEY, previousTsoName);
      }
    })
  });

  tests.push({
    name: "NEW ADMIN OFFICE SETUP BUTTON IS AVAILABLE",
    fn: () => withSelfTestHtmlFileName("new.html", () => {
      const previousData = data;
      const previousView = view;
      const previousAdminVisible = isAdminVisible;
      const previousTsoName = localStorage.getItem(TSO_NAME_STORAGE_KEY);
      const previousPendingTraining = localStorage.getItem(NEW_ADMIN_TRAINING_PENDING_KEY);
      const sharePointTargetKey = getSharePointPublishingTargetStorageKey();
      const previousSharePointTarget = localStorage.getItem(sharePointTargetKey);
      try{
        data = { categories:[{ id:"food", label:"Food" }], resources:[], changes:[] };
        view = "admin";
        isAdminVisible = true;
        localStorage.removeItem(TSO_NAME_STORAGE_KEY);
        localStorage.removeItem(NEW_ADMIN_TRAINING_PENDING_KEY);
        closeReferenceModal();
        render();
        const toolbarButtons = Array.from(document.querySelectorAll("#adminView .admin-toolbar-reference-actions button"));
        const setupButton = toolbarButtons.find(button => button.textContent.trim() === "Office Setup");
        if(!setupButton){
          throw new Error("new template should show Office Setup");
        }
        const tip = document.querySelector("#adminView .red-tip");
        if(!tip) throw new Error("new admin setup tip was not rendered");
        const tipText = tip.querySelector(".red-tip-text");
        if(!tipText || tipText.textContent !== TIP_TEXT.newAdminMode){
          throw new Error("new admin setup tip wording changed");
        }
        const modal = document.getElementById("referenceModal");
        if(modal && !modal.classList.contains("hidden")){
          throw new Error("new.html admin entry should show the red tip without opening Help");
        }
      }finally{
        data = previousData;
        view = previousView;
        isAdminVisible = previousAdminVisible;
        closeReferenceModal();
        if(previousTsoName === null) localStorage.removeItem(TSO_NAME_STORAGE_KEY);
        else localStorage.setItem(TSO_NAME_STORAGE_KEY, previousTsoName);
        if(previousPendingTraining === null) localStorage.removeItem(NEW_ADMIN_TRAINING_PENDING_KEY);
        else localStorage.setItem(NEW_ADMIN_TRAINING_PENDING_KEY, previousPendingTraining);
        if(previousSharePointTarget === null) localStorage.removeItem(sharePointTargetKey);
        else localStorage.setItem(sharePointTargetKey, previousSharePointTarget);
      }
    })
  });

  tests.push({
    name: "RENAMED ADMIN TRAINING OPENS ONCE",
    fn: () => {
      const previousPendingTraining = localStorage.getItem(NEW_ADMIN_TRAINING_PENDING_KEY);
      try{
        localStorage.removeItem(NEW_ADMIN_TRAINING_PENDING_KEY);
        markRenamedAdminTrainingPending("Provo");
        if(localStorage.getItem(NEW_ADMIN_TRAINING_PENDING_KEY) !== "provo"){
          throw new Error("renamed training flag should store normalized TSO name");
        }
        if(consumeRenamedAdminTrainingPending("new.html")){
          throw new Error("new.html should not consume the renamed training flag");
        }
        if(localStorage.getItem(NEW_ADMIN_TRAINING_PENDING_KEY) !== "provo"){
          throw new Error("new.html should leave the renamed training flag pending");
        }
        if(consumeRenamedAdminTrainingPending("other.html")){
          throw new Error("unmatched renamed file should not consume the training flag");
        }
        if(localStorage.getItem(NEW_ADMIN_TRAINING_PENDING_KEY) !== "provo"){
          throw new Error("unmatched renamed file should leave the training flag pending");
        }
        if(!consumeRenamedAdminTrainingPending("provo.html")){
          throw new Error("matching renamed file should consume the training flag");
        }
        if(localStorage.getItem(NEW_ADMIN_TRAINING_PENDING_KEY) !== null){
          throw new Error("renamed training flag should be removed after it is consumed");
        }
        if(consumeRenamedAdminTrainingPending("provo.html")){
          throw new Error("renamed training flag should only be consumed once");
        }
      }finally{
        if(previousPendingTraining === null) localStorage.removeItem(NEW_ADMIN_TRAINING_PENDING_KEY);
        else localStorage.setItem(NEW_ADMIN_TRAINING_PENDING_KEY, previousPendingTraining);
      }
    }
  });

  tests.push({
    name: "USER HELP MATCHES CURRENT RESOURCE WORKFLOW",
    fn: () => {
      const previousData = data;
      try{
        data = { categories:[{ id:"education", label:"Education", filters:["GED"] }], resources:[], changes:[] };
        showUserHelp();
        const modal = document.getElementById("referenceModal");
        const text = modal ? (modal.textContent || "").replace(/\s+/g, " ") : "";
        if(!text.includes("GED is a Type of educational resource")) throw new Error("Type example missing from User Help");
        if(!text.includes("It also searches the automatically generated Lists category")) throw new Error("Lists search guidance missing");
        if(!text.includes("words can appear in different parts of a resource")) throw new Error("cross-field search guidance missing");
        if(!text.includes("View in…")) throw new Error("search category action missing");
        if(!text.includes("find and select the resource package zip file you received")) throw new Error("resource package picker guidance missing");
        if(text.includes("⬜ Resource is not selected") || text.includes("🖨️ Resource is selected")){
          throw new Error("obsolete print-selection legend remained in User Help");
        }
        if(text.includes("Click a resource to display Information") || text.includes("Click the resource again")){
          throw new Error("obsolete resource expansion guidance remained in User Help");
        }
      }finally{
        data = previousData;
        closeReferenceModal();
      }
    }
  });

  tests.push({
    name: "ADMIN HELP HAS PRINT AND TRAINING",
    fn: () => {
      const previousData = data;
      const previousTsoName = localStorage.getItem(TSO_NAME_STORAGE_KEY);
      try{
        data = { categories:[{ id:"food", label:"Food" }], resources:[], changes:[] };
        localStorage.removeItem(TSO_NAME_STORAGE_KEY);
        showAdminHelp();
        const modal = document.getElementById("referenceModal");
        if(!modal || modal.classList.contains("hidden")) throw new Error("Admin Help did not open");
        if(!document.getElementById("adminHelpPrintButton")) throw new Error("Print button missing");
        if(!document.getElementById("adminTrainingPrintButton")) throw new Error("Training print button missing");
        if(!/First-Time Admin Training/.test(modal.textContent || "")) throw new Error("training section missing");
        const helpSectionLabels = Array.from(modal.querySelectorAll("details > summary"))
          .map(summary => summary.textContent.trim());
        const trainingIndex = helpSectionLabels.indexOf("First-Time Admin Training");
        if(helpSectionLabels[trainingIndex + 1] !== "Publish to SharePoint"){
          throw new Error("Publish to SharePoint did not immediately follow First-Time Admin Training");
        }
        if(helpSectionLabels[trainingIndex + 2] !== "Office Setup"){
          throw new Error("Office Setup did not immediately follow Publish to SharePoint");
        }
        if(helpSectionLabels[trainingIndex + 3] !== "Recovery Points"){
          throw new Error("Recovery Points did not immediately follow Office Setup");
        }
        const helpText = (modal.textContent || "").replace(/\s+/g, " ");
        [
          "automatic snapshots made before resource package merges",
          "The five newest are kept on this computer",
          "Restoring replaces current edits with the selected snapshot but keeps the recovery history"
        ].forEach(expected => {
          if(!helpText.includes(expected)) throw new Error(`Recovery Points omitted '${expected}'`);
        });
        if(!helpText.includes("Complete this setup step only if the blue bar says <New> TSO Resources")){
          throw new Error("conditional untitled-file setup guidance missing");
        }
        if(helpText.includes("Press Ctrl+Alt+A to enable admin mode") || helpText.includes("Enter admin mode.")){
          throw new Error("redundant admin-mode setup guidance remained");
        }
        if(!helpText.includes("No resources in this category")) throw new Error("empty Education training step missing");
        if(!helpText.includes("Resources in this category list on the right is empty")) throw new Error("empty category resource list guidance missing");
        if(!helpText.includes("Types are category-specific choices")) throw new Error("Types guidance missing");
        if(!helpText.includes("Users see the changes after they merge the resource package")) throw new Error("package sharing guidance missing");
        if(helpText.includes("Category filters are") || helpText.includes("category-specific filters")){
          throw new Error("obsolete category filter terminology remained in Admin Help");
        }
        if(helpText.includes("Click Delete or press Delete")) throw new Error("obsolete keyboard-delete guidance remained");
      }finally{
        data = previousData;
        closeReferenceModal();
        if(previousTsoName === null) localStorage.removeItem(TSO_NAME_STORAGE_KEY);
        else localStorage.setItem(TSO_NAME_STORAGE_KEY, previousTsoName);
      }
    }
  });

  tests.push({
    name: "ADMIN SETUP SAVES TSO NAME",
    fn: () => withSelfTestHtmlFileName("new.html", () => {
      const previousData = data;
      const previousView = view;
      const previousAdminTab = adminTab;
      const previousAdminVisible = isAdminVisible;
      const previousTsoName = localStorage.getItem(TSO_NAME_STORAGE_KEY);
      const previousPendingTraining = localStorage.getItem(NEW_ADMIN_TRAINING_PENDING_KEY);
      const sharePointTargetKey = getSharePointPublishingTargetStorageKey();
      const previousSharePointTarget = localStorage.getItem(sharePointTargetKey);
      try{
        data = { categories:[{ id:"food", label:"Food" }], resources:[], changes:[], lastModified:nowISO() };
        view = "admin";
        adminTab = "categories";
        isAdminVisible = true;
        localStorage.removeItem(TSO_NAME_STORAGE_KEY);
        localStorage.removeItem(NEW_ADMIN_TRAINING_PENDING_KEY);
        render();
        showAdminSetup();
        const nameInput = document.getElementById("adminSetupTsoName");
        const saveBtn = document.getElementById("officeSetupSave");
        nameInput.value = "Provo";
        saveBtn.click();
        if(getTsoName() !== "Provo") throw new Error("TSO name was not saved");
        if(document.title !== "Provo TSO Resources"){
          throw new Error("saving TSO name should refresh the page title");
        }
        if(localStorage.getItem(NEW_ADMIN_TRAINING_PENDING_KEY) !== "provo"){
          throw new Error("saving TSO name from new.html should queue one-time renamed training");
        }
        const modal = document.getElementById("referenceModal");
        const modalText = modal && modal.textContent || "";
        if(!modal || !modalText.includes("Storage ID") || !modalText.includes("Test Configuration")
          || !modalText.includes("Download-folder authorization")){
          throw new Error("office setup modal omitted required configuration fields");
        }
        modal.querySelector(".reference-modal-close").click();
        if(!modal.classList.contains("hidden")){
          throw new Error("setup modal should close");
        }
      }finally{
        data = previousData;
        view = previousView;
        adminTab = previousAdminTab;
        isAdminVisible = previousAdminVisible;
        closeReferenceModal();
        if(previousTsoName === null) localStorage.removeItem(TSO_NAME_STORAGE_KEY);
        else localStorage.setItem(TSO_NAME_STORAGE_KEY, previousTsoName);
        if(previousPendingTraining === null) localStorage.removeItem(NEW_ADMIN_TRAINING_PENDING_KEY);
        else localStorage.setItem(NEW_ADMIN_TRAINING_PENDING_KEY, previousPendingTraining);
        if(previousSharePointTarget === null) localStorage.removeItem(sharePointTargetKey);
        else localStorage.setItem(sharePointTargetKey, previousSharePointTarget);
      }
    })
  });

  tests.push({
    name: "ADMIN HELP PRINT EXPANDS AND RESTORES SECTIONS",
    fn: () => {
      const previousData = data;
      const previousTsoName = localStorage.getItem(TSO_NAME_STORAGE_KEY);
      const previousPrint = window.print;
      const previousSetTimeout = window.setTimeout;
      try{
        data = { categories:[{ id:"food", label:"Food" }], resources:[{ id:"r", name:"Resource" }], changes:[] };
        localStorage.setItem(TSO_NAME_STORAGE_KEY, "Test");
        showAdminHelp();
        const modal = document.getElementById("referenceModal");
        const training = modal.querySelector(".admin-training-section");
        const details = Array.from(modal.querySelectorAll(".admin-help-content details:not(.admin-training-section)"));
        if(!training) throw new Error("training section missing");
        if(details.length < 2) throw new Error("not enough printable Admin Help sections");
        training.open = false;
        details[0].open = false;
        details[1].open = true;
        let printCalled = false;
        window.print = () => { printCalled = true; };
        window.setTimeout = callback => { callback(); return 0; };
        printAdminHelp();
        if(!printCalled) throw new Error("Admin Help print did not call window.print");
        if(!document.body.classList.contains("admin-help-printing")) throw new Error("Admin Help print did not set print mode");
        if(details.some(detail => !detail.open)) throw new Error("Admin Help print did not expand all details");
        if(training.open) throw new Error("Admin Help print should not expand training section");
        restoreAdminHelpPrintState();
        if(document.body.classList.contains("admin-help-printing")) throw new Error("Admin Help print mode was not cleared");
        if(details[0].open !== false || details[1].open !== true){
          throw new Error("Admin Help print did not restore detail state");
        }
        printCalled = false;
        training.open = false;
        printAdminTraining();
        if(!printCalled) throw new Error("Training print did not call window.print");
        if(!document.body.classList.contains("admin-training-printing")) throw new Error("Training print did not set print mode");
        if(!training.open) throw new Error("Training print did not expand training section");
        if(details[0].open !== false || details[1].open !== true) throw new Error("Training print should not change Admin Help sections");
        restoreAdminHelpPrintState();
        if(document.body.classList.contains("admin-training-printing")) throw new Error("Training print mode was not cleared");
        if(training.open !== false) throw new Error("Training print did not restore training section state");
      }finally{
        data = previousData;
        document.body.classList.remove("admin-help-printing", "admin-training-printing");
        adminHelpPrintRestoreState = null;
        window.print = previousPrint;
        window.setTimeout = previousSetTimeout;
        closeReferenceModal();
        if(previousTsoName === null) localStorage.removeItem(TSO_NAME_STORAGE_KEY);
        else localStorage.setItem(TSO_NAME_STORAGE_KEY, previousTsoName);
      }
    }
  });

  tests.push({
    name: "MERGE RESOURCES AVAILABLE BELOW STARTUP CATEGORIES",
    fn: () => {
      const previousData = data;
      const previousView = view;
      try{
        data = {
          appVersion:APP_VERSION,
          lastModified:nowISO(),
          categories:seed.categories.map(category => ({ ...category })),
          resources:[],
          changes:[]
        };
        view = "categories";
        render();
        const grid = appView.querySelector(".grid");
        const buttons = Array.from(appView.querySelectorAll("button"));
        const mergeButtons = buttons.filter(button => button.textContent === "Merge Resources");
        if(mergeButtons.length !== 1) throw new Error(`expected one merge resources button, got ${mergeButtons.length}`);
        if(!grid) throw new Error("categories grid was not rendered");
        if(!(grid.compareDocumentPosition(mergeButtons[0]) & Node.DOCUMENT_POSITION_FOLLOWING)){
          throw new Error("merge resources button should appear below the category grid");
        }
      }finally{
        data = previousData;
        view = previousView;
      }
    }
  });

  tests.push({
    name: "CATEGORY VIEW OMITS PRINT INSTRUCTION",
    fn: () => {
      const previousData = data;
      const previousView = view;
      const previousCurrentCategory = currentCategory;
      const previousPrintSelection = printSelection.slice();
      const previousSelectedCategoryFilters = JSON.parse(JSON.stringify(selectedCategoryFilters));
      try{
        data = {
          categories:[{ id:"food", label:"Food" }],
          resources:[
            { id:"pantry", name:"Pantry Resource", categories:["food"], informationText:"" }
          ],
          changes:[]
        };
        selectedCategoryFilters = {};
        view = "category";
        currentCategory = "food";

        printSelection = [];
        render();
        const emptyBanner = appView.querySelector(".category-print-banner");
        if(emptyBanner) throw new Error("category showed a print instruction before any resource was selected");

        printSelection = ["pantry"];
        render();
        const selectedBanner = appView.querySelector(".category-print-banner");
        if(selectedBanner) throw new Error("category showed a print instruction after a resource was selected");
      }finally{
        data = previousData;
        view = previousView;
        currentCategory = previousCurrentCategory;
        printSelection = previousPrintSelection;
        selectedCategoryFilters = previousSelectedCategoryFilters;
        updatePrintSelectionIndicator();
      }
    }
  });

  tests.push({
    name: "FAVORITES ARE PERSISTENT AND INDEPENDENT FROM PRINTING",
    fn: () => {
      const previousData = data;
      const previousFavorites = favoriteResourceIds.slice();
      const previousPrintSelection = printSelection.slice();
      const previousStoredFavorites = localStorage.getItem(FAVORITE_RESOURCE_IDS_STORAGE_KEY);
      try{
        data = {
          categories:[],
          resources:[
            { id:"favorite-one", name:"Favorite One", categories:[], informationText:"" },
            { id:"favorite-two", name:"Favorite Two", categories:[], informationText:"" }
          ],
          changes:[]
        };
        favoriteResourceIds = [];
        printSelection = [];
        saveFavoriteResourceIds();

        toggleFavoriteResource("favorite-one", { rerender:false });
        if(!isFavoriteResource("favorite-one")) throw new Error("resource was not favorited");
        if(printSelection.length) throw new Error("favoriting a resource changed the print selection");
        if(JSON.stringify(loadFavoriteResourceIds()) !== JSON.stringify(["favorite-one"])){
          throw new Error("favorite resource id was not persisted");
        }

        togglePrintSelection("favorite-one", { rerender:false });
        if(!isFavoriteResource("favorite-one")) throw new Error("printing selection changed favorite state");

        data.resources = [data.resources[1]];
        sanitizeFavoriteResourceIds();
        if(favoriteResourceIds.length) throw new Error("missing resource id was not removed from Favorites");

        const packageData = buildResourcePackageData(data);
        if("favoriteResourceIds" in packageData || "favorites" in packageData){
          throw new Error("personal Favorites leaked into a resource package");
        }
      }finally{
        data = previousData;
        favoriteResourceIds = previousFavorites;
        printSelection = previousPrintSelection;
        if(previousStoredFavorites === null) localStorage.removeItem(FAVORITE_RESOURCE_IDS_STORAGE_KEY);
        else localStorage.setItem(FAVORITE_RESOURCE_IDS_STORAGE_KEY, previousStoredFavorites);
        updatePrintSelectionIndicator();
      }
    }
  });

  tests.push({
    name: "FAVORITES VIEW USES RESOURCE ICON BUTTONS",
    fn: () => {
      const previousData = data;
      const previousView = view;
      const previousFavorites = favoriteResourceIds.slice();
      const previousPrintSelection = printSelection.slice();
      const previousStoredFavorites = localStorage.getItem(FAVORITE_RESOURCE_IDS_STORAGE_KEY);
      try{
        data = {
          categories:[],
          resources:[
            { id:"favorite-alpha", name:"Alpha Favorite", categories:[], informationText:"" },
            { id:"favorite-beta", name:"Beta Favorite", categories:[], informationText:"" }
          ],
          changes:[]
        };
        favoriteResourceIds = ["favorite-beta"];
        printSelection = [];
        saveFavoriteResourceIds();
        view = "categories";
        render();

        tabFavorites.click();
        if(view !== "favorites") throw new Error("Favorites star did not show Favorites");
        if(tabFavorites.getAttribute("aria-current") !== "page") throw new Error("Favorites star did not show its active state");
        tabFavorites.click();
        if(view !== "categories") throw new Error("Favorites star did not return to Categories");
        if(tabFavorites.getAttribute("aria-current") === "page") throw new Error("Favorites star remained active after hiding Favorites");
        tabFavorites.click();

        const cards = Array.from(appView.querySelectorAll(".resource-card[data-resource-id]"));
        if(cards.length !== 1 || cards[0].dataset.resourceId !== "favorite-beta"){
          throw new Error("Favorites view did not show only favorited resources");
        }
        if(appView.querySelector(".category-print-banner")){
          throw new Error("Favorites view showed a print instruction before any resource was selected");
        }
        const star = cards[0].querySelector(".favorite-toggle");
        const printer = cards[0].querySelector(".print-selection-toggle");
        if(!star || star.getAttribute("aria-pressed") !== "true") throw new Error("favorite resource did not show a filled star button");
        if(!printer || printer.getAttribute("aria-pressed") !== "false") throw new Error("favorite resource did not show an inactive printer button");
        if(star.tagName !== "BUTTON" || printer.tagName !== "BUTTON") throw new Error("resource icons should use whole clickable buttons");
        if(getComputedStyle(printer).color !== "rgb(137, 148, 158)"){
          throw new Error(`inactive printer should be gray, got ${getComputedStyle(printer).color}`);
        }
        if(!star.querySelector('[data-icon="star-filled"]')) throw new Error("favorite button did not render the filled star icon");
        if(!printer.querySelector('[data-icon="printer"]')) throw new Error("print button did not render the printer icon");
        if(!tabFavorites.querySelector('[data-icon="star-outline"]')) throw new Error("Favorites navigation icon should remain an outline");
        if(tabCategories.nextElementSibling !== tabFavorites) throw new Error("Favorites button should be immediately right of Categories");
        if((tabFavorites.textContent || "").trim()) throw new Error("Favorites navigation should not show a badge or count");

        printer.click();
        const selectedPrinter = appView.querySelector(".resource-card[data-resource-id] .print-selection-toggle");
        if(!selectedPrinter || selectedPrinter.getAttribute("aria-pressed") !== "true"){
          throw new Error("printer button did not mark the favorite resource for printing");
        }
        if(appView.querySelector(".category-print-banner")){
          throw new Error("Favorites view showed a print instruction after a resource was selected");
        }
        const selectedStar = appView.querySelector(".resource-card[data-resource-id] .favorite-toggle");
        selectedStar.click();
        if(appView.querySelector(".resource-card[data-resource-id]")) throw new Error("removed favorite remained in Favorites view");
        if(!printSelection.includes("favorite-beta")) throw new Error("removing a Favorite changed its print selection");
        const emptyFavorites = appView.querySelector(".favorites-empty");
        if(!emptyFavorites || emptyFavorites.textContent !== "No favorite resources. Click the outline star next to a resource to add it to Favorites."){
          throw new Error("empty Favorites message was not rendered");
        }
        if(appView.querySelector(".category-print-banner")){
          throw new Error("empty Favorites view showed the print instruction");
        }
      }finally{
        data = previousData;
        view = previousView;
        favoriteResourceIds = previousFavorites;
        printSelection = previousPrintSelection;
        if(previousStoredFavorites === null) localStorage.removeItem(FAVORITE_RESOURCE_IDS_STORAGE_KEY);
        else localStorage.setItem(FAVORITE_RESOURCE_IDS_STORAGE_KEY, previousStoredFavorites);
        updatePrintSelectionIndicator();
      }
    }
  });

  tests.push({
    name: "FAVORITES SURVIVE MERGED DATA AND PRUNE REMOVED RESOURCES",
    fn: () => {
      const previousData = data;
      const previousView = view;
      const previousFavorites = favoriteResourceIds.slice();
      const previousPrintSelection = printSelection.slice();
      const previousStoredData = localStorage.getItem(DATA_STORAGE_KEY);
      const previousStoredFavorites = localStorage.getItem(FAVORITE_RESOURCE_IDS_STORAGE_KEY);
      try{
        data = {
          categories:[],
          resources:[
            { id:"merge-favorite-keep", name:"Keep Favorite", categories:[], informationText:"" },
            { id:"merge-favorite-remove", name:"Remove Favorite", categories:[], informationText:"" }
          ],
          changes:[]
        };
        favoriteResourceIds = ["merge-favorite-keep", "merge-favorite-remove"];
        printSelection = [];
        saveFavoriteResourceIds();
        view = "categories";

        applyMergedData({
          categories:[],
          resources:[
            { id:"merge-favorite-keep", name:"Updated Favorite", categories:[], informationText:"" }
          ],
          changes:[]
        });

        if(JSON.stringify(favoriteResourceIds) !== JSON.stringify(["merge-favorite-keep"])){
          throw new Error(`unexpected Favorites after merge ${JSON.stringify(favoriteResourceIds)}`);
        }
        if(!isFavoriteResource("merge-favorite-keep")) throw new Error("surviving resource lost its Favorite after merge");
        if(isFavoriteResource("merge-favorite-remove")) throw new Error("removed resource remained in Favorites after merge");
      }finally{
        data = previousData;
        view = previousView;
        favoriteResourceIds = previousFavorites;
        printSelection = previousPrintSelection;
        if(previousStoredData === null) localStorage.removeItem(DATA_STORAGE_KEY);
        else localStorage.setItem(DATA_STORAGE_KEY, previousStoredData);
        if(previousStoredFavorites === null) localStorage.removeItem(FAVORITE_RESOURCE_IDS_STORAGE_KEY);
        else localStorage.setItem(FAVORITE_RESOURCE_IDS_STORAGE_KEY, previousStoredFavorites);
        updatePrintSelectionIndicator();
      }
    }
  });

  tests.push({
    name: "SEARCH RESULTS SHOW FAVORITE AND PRINT BUTTONS",
    fn: () => {
      const previousData = data;
      const previousView = view;
      const previousSearchResults = searchResults;
      try{
        data = {
          categories:[],
          resources:[{ id:"search-actions", name:"Search Actions", categories:[], informationText:"" }],
          changes:[]
        };
        searchResults = {
          query:"actions",
          items:[{ resourceId:"search-actions", resourceName:"Search Actions", sectionLabel:"", snippet:"", categories:[] }]
        };
        view = "search-results";
        render();
        const row = appView.querySelector(".search-result-item");
        if(!row || !row.querySelector(".favorite-toggle") || !row.querySelector(".print-selection-toggle")){
          throw new Error("search result did not include both resource actions");
        }
      }finally{
        data = previousData;
        view = previousView;
        searchResults = previousSearchResults;
      }
    }
  });

  tests.push({
    name: "ADMIN RESOURCE BUTTON LISTBOX RENDERING",
    fn: () => {
      const previousData = data;
      const previousAdminTab = adminTab;
      const previousSelectedResourceId = selectedResourceId;
      const previousAdminResourceEditMode = adminResourceEditMode;
      const previousAdminShowVerifiedDates = adminShowVerifiedDates;
      const previousEditing = editing;
      const previousEditorSnapshot = editorSnapshot;
      try{
        data = {
          categories:[],
          resources:[
            { id:"zeta", name:"Zeta Resource", categories:[], informationText:"" },
            { id:"alpha", name:"Alpha Resource", categories:[], informationText:"" }
          ],
          changes:[]
        };
        adminTab = "resources";
        selectedResourceId = "";
        adminResourceEditMode = false;
        adminShowVerifiedDates = false;
        renderAdmin();
        const list = document.getElementById("resSelect");
        if(!list) throw new Error("resource browse list was not rendered");
        if(list.tagName.toLowerCase() === "select") throw new Error("resource browse list should not use native select");
        if(list.getAttribute("role") !== "listbox") throw new Error("resource browse list should expose listbox role");
        if(!list.classList.contains("resource-button-listbox")) throw new Error("resource browse list should use custom listbox styling");
        const options = Array.from(list.querySelectorAll(".resource-listbox-option"));
        if(options.length !== 2) throw new Error("resource browse options were not populated");
        if(options[0].textContent !== "Alpha Resource") throw new Error("resource browse list should sort alphabetically");
        if(selectedResourceId !== "alpha") throw new Error("resource browse selection should default to the first visible resource");
        list.dispatchEvent(new KeyboardEvent("keydown", { key:"ArrowDown", bubbles:true }));
        if(selectedResourceId !== "zeta") throw new Error("resource browse keyboard navigation did not update selection");
      }finally{
        data = previousData;
        adminTab = previousAdminTab;
        selectedResourceId = previousSelectedResourceId;
        adminResourceEditMode = previousAdminResourceEditMode;
        adminShowVerifiedDates = previousAdminShowVerifiedDates;
        editing = previousEditing;
        editorSnapshot = previousEditorSnapshot;
      }
    }
  });

  tests.push({
    name: "SEEN STATE STORAGE",
    fn: () => {
      const seen = new Set(["one","two"]);
      saveSeenUpdateIds(seen);
      const loaded = getSeenUpdateIds();
      if(!loaded.has("one") || !loaded.has("two")) throw new Error("seen ids were not persisted");
    }
  });

  tests.push({
    name: "DATA STRUCTURE",
    fn: () => {
      if(!Array.isArray(data.resources)) throw new Error("resources array missing");
      if(!Array.isArray(data.categories)) throw new Error("categories array missing");
      const ids = data.resources.map(r => String(r && r.id || ""));
      if(new Set(ids).size !== ids.length) throw new Error("resource ids are not unique");
    }
  });

  tests.push({
    name: "SEED DATA CATEGORIES",
    fn: () => {
      if(!Array.isArray(seed.categories) || !seed.categories.length) throw new Error("seed categories missing");
      const sample = { categories:seed.categories.map(category => ({ ...category })), resources:[] };
      const applied = applyDefaultCategoryPreset(sample);
      if(!applied) throw new Error("category preset was not applied");
      if(sample.categoryPresetVersion !== 1){
        throw new Error("category preset version was not recorded");
      }
      const removedLabel = sample.categories[0] && sample.categories[0].label;
      sample.categories = sample.categories.filter(category => category.label !== removedLabel);
      applyDefaultCategoryPreset(sample);
      if(sample.categories.some(category => category.label === removedLabel)){
        throw new Error("deleted seed category was recreated after version marker");
      }
    }
  });

  tests.push({
    name: "SEED DATA CATEGORY IDS ARE UNIQUE",
    fn: () => {
      const ids = seed.categories.map(category => String(category && category.id || ""));
      if(new Set(ids).size !== ids.length) throw new Error("seed category ids are not unique");
    }
  });

  tests.push({
    name: "RESOURCE PACKAGE SCHEMA VERSION",
    fn: () => {
      const packageData = buildResourcePackageData({
        packageVersion:7,
        categories:[
          { id:"ghost", label:"", filters:[] },
          { id:"food", label:"Food", filters:["Pantries"] }
        ],
        forGroups:["Veterans"],
        resources:[{ id:"pantry", name:"Pantry", categories:["food"], categoryFilters:{ food:["Pantries"] }, forGroups:["Veterans"], informationText:"" }],
        changes:[],
        lastLoadedPackageInfo:{ packageVersion:1 }
      });
      if(packageData.resourcePackageSchemaVersion !== RESOURCE_PACKAGE_SCHEMA_VERSION){
        throw new Error("resource package schema version was not exported");
      }
      if(JSON.stringify(packageData.appChanges) !== JSON.stringify(APP_CHANGE_LOG)){
        throw new Error("app change log was not exported");
      }
      if("lastLoadedPackageInfo" in packageData){
        throw new Error("local loaded-package state should not be exported");
      }
      if("tags" in packageData || packageData.resources.some(resource => "tags" in resource)){
        throw new Error("legacy tags should not be exported");
      }
      if(packageData.categories.some(category => category.id === "ghost")){
        throw new Error("unused unnamed category was exported");
      }
      if(!Array.isArray(packageData.deletionRequests) || !Array.isArray(packageData.deletions)){
        throw new Error("deletion workflow arrays were not exported");
      }
      if(!Number.isFinite(Date.parse(packageData.packageCreatedAt))){
        throw new Error("resource package creation timestamp was not exported");
      }
    }
  });

  tests.push({
    name: "RESOURCE PACKAGE PIPELINE ORDER",
    fn: () => {
      const processed = processResourcePackageData(
        PACKAGE_MIGRATION_FIXTURES.schema2ArrayForGroups,
        { sourceName:"schema-2-fixture.zip" }
      );
      const expected = ["read", "migrate", "normalize", "applyTombstones", "validate"];
      if(JSON.stringify(processed.stages) !== JSON.stringify(expected)){
        throw new Error(`unexpected package pipeline ${JSON.stringify(processed.stages)}`);
      }
      if(processed.fromVersion !== 2 || JSON.stringify(processed.appliedMigrations) !== JSON.stringify(["2->3"])){
        throw new Error("schema 2 migration was not explicit");
      }
    }
  });

  tests.push({
    name: "UNVERSIONED PACKAGE MIGRATES FOR TYPES AND SAFE FIELDS",
    fn: () => {
      const processed = processResourcePackageData(
        PACKAGE_MIGRATION_FIXTURES.unversionedStringForAndTypes,
        { sourceName:"legacy-fixture.json" }
      );
      const migrated = processed.data;
      if(processed.fromVersion !== 1
        || JSON.stringify(processed.appliedMigrations) !== JSON.stringify(["1->2", "2->3"])){
        throw new Error("unversioned package did not run both migrations");
      }
      if(migrated.resourcePackageSchemaVersion !== RESOURCE_PACKAGE_SCHEMA_VERSION){
        throw new Error("legacy package did not reach the current schema");
      }
      if(migrated.packageVersion !== 7) throw new Error("numeric-string package version was not normalized");
      if(JSON.stringify(migrated.forGroups) !== JSON.stringify(["Veterans", "Women"])){
        throw new Error(`legacy governed For groups changed: ${JSON.stringify(migrated.forGroups)}`);
      }
      const category = migrated.categories[0];
      const resource = migrated.resources[0];
      if(JSON.stringify(category.filters) !== JSON.stringify(["Pantry", "Meals"])){
        throw new Error("legacy category Types were not migrated");
      }
      if(JSON.stringify(resource.forGroups) !== JSON.stringify(["Veterans", "Women"])){
        throw new Error("legacy resource For groups were not migrated");
      }
      if(JSON.stringify(resource.categoryFilters.food) !== JSON.stringify(["Pantry"])){
        throw new Error("legacy resource Types were not migrated to categoryFilters");
      }
      if(resource.informationText !== "Legacy services" || !resource.pdfs.length){
        throw new Error("legacy content fields were not normalized after migration");
      }
      if(migrated.customPackageField.officeNote !== "preserve me"
        || category.customCategoryField !== "category extension"
        || !resource.customResourceField.keep){
        throw new Error("unknown safe fields were lost during migration");
      }
      if("version" in migrated || "Types" in category || "For" in resource || "tags" in resource){
        throw new Error("known consumed legacy fields remained after migration");
      }
    }
  });

  tests.push({
    name: "SCHEMA 2 ARRAY FOR GROUPS AND CATEGORY FILTERS MIGRATE",
    fn: () => {
      const migrated = processResourcePackageData(
        PACKAGE_MIGRATION_FIXTURES.schema2ArrayForGroups,
        { sourceName:"albuquerque-schema-2.json" }
      ).data;
      if(JSON.stringify(migrated.forGroups) !== JSON.stringify(["Families", "Veterans"])){
        throw new Error("schema 2 governed For array changed");
      }
      if(JSON.stringify(migrated.resources[0].forGroups) !== JSON.stringify(["Veterans", "Families"])){
        throw new Error("schema 2 resource For string was not normalized");
      }
      if(JSON.stringify(migrated.resources[0].categoryFilters.food) !== JSON.stringify(["Meals", "Pantry"])){
        throw new Error("schema 2 categoryFilters string was not normalized");
      }
      if(JSON.stringify(migrated.categories[0].filters) !== JSON.stringify(["Pantry", "Meals"])){
        throw new Error("resource Types were not retained on the category");
      }
      const exported = buildResourcePackageData(migrated);
      if(exported.customPackageField.source !== "historical Albuquerque shape"
        || exported.resources[0].customResourceField !== "keep"
        || exported.resources[0].pdfs[0].checksum !== "preserve-pdf-extension"){
        throw new Error("safe fields were lost during package re-export");
      }
      if("lastLoadedPackageInfo" in exported){
        throw new Error("local-only package state was exported");
      }
    }
  });

  tests.push({
    name: "PACKAGE TOMBSTONES APPLY AFTER NORMALIZATION",
    fn: () => {
      const migrated = processResourcePackageData(
        PACKAGE_MIGRATION_FIXTURES.schema3DeletionWorkflow,
        { sourceName:"deletion-fixture.zip" }
      ).data;
      const kept = migrated.resources.find(resource => resource.id === "keep");
      if(!kept || migrated.resources.some(resource => resource.id === "remove")){
        throw new Error("resource tombstone was not applied");
      }
      if(kept.forGroups.includes("Veterans") || migrated.forGroups.includes("Veterans")){
        throw new Error("For-group tombstone was not applied");
      }
      if(kept.categoryFilters.food.includes("Pantry") || migrated.categories[0].filters.includes("Pantry")){
        throw new Error("Type tombstone was not applied");
      }
      const pendingKeys = migrated.deletionRequests.map(record => record.key);
      if(!pendingKeys.includes("resource:keep") || pendingKeys.includes("resource:remove")){
        throw new Error("pending deletion requests were not reconciled with tombstones");
      }
      if(migrated.deletions.length !== 3) throw new Error("approved tombstones were not retained");
    }
  });

  tests.push({
    name: "PACKAGE VERSION MISSING STRING AND LATEST HANDLING",
    fn: () => {
      const missing = processResourcePackageData({ categories:[], resources:[] }).data;
      const numericString = processResourcePackageData({
        resourcePackageSchemaVersion:2,
        packageVersion:"13",
        categories:[],
        resources:[]
      }).data;
      if(missing.packageVersion !== "Unknown") throw new Error("missing package version changed");
      if(numericString.packageVersion !== 13) throw new Error("numeric-string package version changed");
      if(getLatestPackageVersionValue(missing.packageVersion, 12, numericString.packageVersion) !== 13){
        throw new Error("latest package version was not retained");
      }
      const dated = processResourcePackageData({
        resourcePackageSchemaVersion:RESOURCE_PACKAGE_SCHEMA_VERSION,
        packageCreatedAt:"2026-07-30T05:00:00-07:00",
        lastModified:"2026-07-29T12:00:00.000Z",
        categories:[],
        resources:[]
      }).data;
      if(dated.packageCreatedAt !== "2026-07-30T12:00:00.000Z"
        || getResourcePackageCreatedAt(dated) !== "2026-07-30T12:00:00.000Z"){
        throw new Error("explicit package creation date was not retained");
      }
      if(getResourcePackageCreatedAt({ lastModified:"2026-07-29T12:00:00.000Z" }) !== "2026-07-29T12:00:00.000Z"){
        throw new Error("legacy package date did not fall back to lastModified");
      }
    }
  });

  tests.push({
    name: "MALFORMED AND UNSUPPORTED PACKAGES EXPLAIN FAILURE",
    fn: () => {
      const cases = [
        [PACKAGE_MIGRATION_FIXTURES.malformedContainers, /cannot be migrated safely.*categories/is],
        [PACKAGE_MIGRATION_FIXTURES.malformedDeletion, /cannot be migrated safely.*unsupported kind/is],
        [PACKAGE_MIGRATION_FIXTURES.unsupportedSchema, /unsupported resource package schema 4/is],
        [PACKAGE_MIGRATION_FIXTURES.invalidPackageVersion, /cannot be migrated safely.*packageVersion/is],
        [{
          resourcePackageSchemaVersion:RESOURCE_PACKAGE_SCHEMA_VERSION,
          packageCreatedAt:"not-a-date",
          categories:[],
          resources:[]
        }, /cannot be migrated safely.*packageCreatedAt/is]
      ];
      cases.forEach(([fixture, expected]) => {
        let message = "";
        try{
          processResourcePackageData(fixture, { sourceName:"bad-package.zip" });
        }catch(error){
          message = formatResourcePackageError(error);
        }
        if(!expected.test(message)) throw new Error(`unclear package error: ${message}`);
      });

      let jsonMessage = "";
      try{
        processResourcePackageJSON(MALFORMED_RESOURCE_PACKAGE_JSON, { sourceName:"broken.json" });
      }catch(error){
        jsonMessage = formatResourcePackageError(error);
      }
      if(!/broken\.json contains invalid JSON/i.test(jsonMessage)){
        throw new Error(`malformed JSON error was unclear: ${jsonMessage}`);
      }
    }
  });

  tests.push({
    name: "LEGACY AND CURRENT DELETION SCHEMAS VALIDATE",
    fn: () => {
      const base = { categories:[], resources:[] };
      const legacy = validateImportData({ ...base, resourcePackageSchemaVersion:LEGACY_RESOURCE_PACKAGE_SCHEMA_VERSION });
      const current = validateImportData({ ...base, resourcePackageSchemaVersion:RESOURCE_PACKAGE_SCHEMA_VERSION, deletionRequests:[], deletions:[] });
      const future = validateImportData({ ...base, resourcePackageSchemaVersion:RESOURCE_PACKAGE_SCHEMA_VERSION + 1 });
      if(!legacy.ok) throw new Error(`schema 2 package was rejected: ${legacy.errors.join(", ")}`);
      if(!current.ok) throw new Error(`schema 3 package was rejected: ${current.errors.join(", ")}`);
      if(future.ok) throw new Error("unsupported future schema was accepted");
    }
  });

  tests.push({
    name: "DELETION REQUESTS MERGE WITHOUT APPLYING",
    fn: () => {
      const local = {
        categories:[{ id:"food", label:"Food", filters:["Pantries"] }],
        forGroups:[],
        resources:[{ id:"pantry", name:"Pantry", categories:["food"], categoryFilters:{ food:["Pantries"] }, forGroups:[] }],
        deletionRequests:[],
        deletions:[]
      };
      const incoming = {
        ...cloneDataObject(local),
        deletionRequests:[createDeletionRequest("resource", { targetId:"pantry", label:"Pantry", requestedAt:"2026-07-31T12:00:00.000Z" })]
      };
      const { mergedData } = mergeResourcePackages(local, incoming);
      if(!mergedData.resources.some(resource => resource.id === "pantry")){
        throw new Error("pending deletion removed a resource during merge");
      }
      if(!mergedData.deletionRequests.some(request => request.key === "resource:pantry")){
        throw new Error("incoming deletion request was not merged");
      }
    }
  });

  tests.push({
    name: "APPROVED TOMBSTONES APPLY KNOCK-ON EFFECTS",
    fn: () => {
      const sample = {
        categories:[
          { id:"food", label:"Food", filters:["Pantries", "Meals"] },
          { id:"housing", label:"Housing", filters:[] }
        ],
        forGroups:["Veterans", "Families"],
        resources:[
          { id:"pantry", name:"Pantry", categories:["food"], categoryFilters:{ food:["Pantries", "Meals"] }, forGroups:["Veterans"] },
          { id:"shelter", name:"Shelter", categories:["housing"], categoryFilters:{ housing:[] }, forGroups:["Families"] },
          { id:"remove-me", name:"Remove Me", categories:[], categoryFilters:{}, forGroups:[] }
        ],
        deletionRequests:[],
        deletions:[
          { kind:"type", categoryId:"food", label:"Pantries", deletedAt:"2026-07-31T12:00:00.000Z" },
          { kind:"forGroup", label:"Veterans", deletedAt:"2026-07-31T12:00:00.000Z" },
          { kind:"category", targetId:"housing", label:"Housing", deletedAt:"2026-07-31T12:00:00.000Z" },
          { kind:"resource", targetId:"remove-me", label:"Remove Me", deletedAt:"2026-07-31T12:00:00.000Z" }
        ]
      };
      normalizePackageData(sample);
      const pantry = sample.resources.find(resource => resource.id === "pantry");
      const shelter = sample.resources.find(resource => resource.id === "shelter");
      const food = sample.categories.find(category => category.id === "food");
      if(!pantry || pantry.categoryFilters.food.includes("Pantries")) throw new Error("approved Type deletion was not applied");
      if(pantry.forGroups.includes("Veterans")) throw new Error("approved For group deletion was not applied");
      if(food.filters.includes("Pantries")) throw new Error("approved Type remained on category");
      if(sample.forGroups.includes("Veterans")) throw new Error("approved For group remained in taxonomy");
      if(sample.categories.some(category => category.id === "housing")) throw new Error("approved category remained");
      if(shelter.categories.includes("housing") || shelter.categoryFilters.housing) throw new Error("category knock-on cleanup was not applied");
      if(sample.resources.some(resource => resource.id === "remove-me")) throw new Error("approved resource remained");
    }
  });

  tests.push({
    name: "TOMBSTONE PREVENTS OLDER PACKAGE RESURRECTION",
    fn: () => {
      const local = {
        categories:[], resources:[], forGroups:[], deletionRequests:[],
        deletions:[{ kind:"resource", targetId:"old", label:"Old Resource", deletedAt:"2026-07-31T12:00:00.000Z" }]
      };
      const incoming = {
        categories:[], forGroups:[], deletionRequests:[], deletions:[],
        resources:[{ id:"old", name:"Old Resource", categories:[], categoryFilters:{}, forGroups:[], lastModified:"2026-07-01T12:00:00.000Z" }]
      };
      const { mergedData } = mergeResourcePackages(local, incoming);
      if(mergedData.resources.some(resource => resource.id === "old")){
        throw new Error("older package resurrected a tombstoned resource");
      }
      if(!mergedData.deletions.some(record => record.key === "resource:old")){
        throw new Error("resource tombstone was lost during merge");
      }
    }
  });

  tests.push({
    name: "DELETION REVIEW PRINT APPROVE AND UNDO",
    fn: () => {
      const previousData = data;
      const previousEditing = editing;
      const previousStoredData = localStorage.getItem(DATA_STORAGE_KEY);
      const previousReview = localStorage.getItem(DELETION_REVIEW_STORAGE_KEY);
      const previousUndo = localStorage.getItem(UNDO_STORAGE_KEY);
      try{
        editing = null;
        data = {
          packageVersion:11,
          categories:[{ id:"food", label:"Food", filters:[] }],
          forGroups:[],
          resources:[{ id:"pantry", name:"Community Pantry", categories:["food"], categoryFilters:{ food:[] }, forGroups:[], informationText:"" }],
          changes:[],
          deletions:[],
          deletionRequests:[createDeletionRequest("category", {
            targetId:"food",
            label:"Food",
            description:"Outdated category",
            requestedAt:"2026-07-31T12:00:00.000Z"
          })]
        };
        saveDeletionReview("missionary-resource-package.zip", 11, data.deletionRequests);
        showDeletionReview();
        const modal = document.getElementById("deletionReviewModal");
        if(!modal || !(modal.textContent || "").includes("Community Pantry")){
          throw new Error("deletion review did not show the affected resource");
        }
        printProposedDeletions();
        const reportText = printContent.textContent || "";
        if(!reportText.includes("missionary-resource-package.zip") || !reportText.includes("☐ Approve") || !reportText.includes("Notes:")){
          throw new Error("printable proposed-deletions report is incomplete");
        }
        PrintWorkflow.close();
        approveSelectedDeletions();
        if(data.categories.some(category => category.id === "food")) throw new Error("approved category deletion was not applied");
        if(!data.deletions.some(record => record.key === "category:food")) throw new Error("approved deletion tombstone was not saved");
        undoLastDeletion();
        if(!data.categories.some(category => category.id === "food")) throw new Error("undo did not restore the approved deletion");
        if(!data.deletionRequests.some(record => record.key === "category:food")) throw new Error("undo did not restore the pending request");
      }finally{
        closeDeletionReview();
        PrintWorkflow.close();
        editing = previousEditing;
        data = previousData;
        if(previousStoredData == null) localStorage.removeItem(DATA_STORAGE_KEY);
        else localStorage.setItem(DATA_STORAGE_KEY, previousStoredData);
        if(previousReview == null) localStorage.removeItem(DELETION_REVIEW_STORAGE_KEY);
        else localStorage.setItem(DELETION_REVIEW_STORAGE_KEY, previousReview);
        if(previousUndo == null) localStorage.removeItem(UNDO_STORAGE_KEY);
        else localStorage.setItem(UNDO_STORAGE_KEY, previousUndo);
      }
    }
  });

  tests.push({
    name: "DELETION UNDO EXPIRES AFTER A NEWER SAVE",
    fn: () => {
      const previousData = data;
      const previousEditing = editing;
      const previousStoredData = localStorage.getItem(DATA_STORAGE_KEY);
      const previousUndo = localStorage.getItem(UNDO_STORAGE_KEY);
      try{
        editing = null;
        localStorage.removeItem(UNDO_STORAGE_KEY);
        data = {
          categories:[],
          forGroups:[],
          resources:[{
            id:"sample",
            name:"Sample Resource",
            categories:[],
            categoryFilters:{},
            forGroups:[],
            informationText:""
          }],
          changes:[],
          deletionRequests:[],
          deletions:[]
        };
        setUndoSnapshot("deletion tag");
        data.deletionRequests = [createDeletionRequest("resource", {
          targetId:"sample",
          label:"Sample Resource"
        })];
        persist();
        if(!getUndoSnapshot()) throw new Error("fresh deletion Undo was not retained");

        data.resources[0].name = "Newer Saved Name";
        persist();
        if(getUndoSnapshot()) throw new Error("deletion Undo remained after a newer saved edit");
      }finally{
        editing = previousEditing;
        data = previousData;
        if(previousStoredData == null) localStorage.removeItem(DATA_STORAGE_KEY);
        else localStorage.setItem(DATA_STORAGE_KEY, previousStoredData);
        if(previousUndo == null) localStorage.removeItem(UNDO_STORAGE_KEY);
        else localStorage.setItem(UNDO_STORAGE_KEY, previousUndo);
      }
    }
  });

  tests.push({
    name: "PRE-MERGE RECOVERY POINT IS RETAINED AFTER RESTORE",
    fn: () => {
      const previousData = data;
      const previousStoredData = localStorage.getItem(DATA_STORAGE_KEY);
      const previousSnapshot = localStorage.getItem(PRE_MERGE_STORAGE_KEY);
      const previousReview = localStorage.getItem(DELETION_REVIEW_STORAGE_KEY);
      const previousUndo = localStorage.getItem(UNDO_STORAGE_KEY);
      const previousConfirm = window.confirm;
      try{
        localStorage.removeItem(PRE_MERGE_STORAGE_KEY);
        data = {
          packageVersion:11,
          categories:[],
          forGroups:[],
          resources:[{ id:"before", name:"Before Merge", categories:[], categoryFilters:{}, forGroups:[], informationText:"" }],
          changes:[], deletionRequests:[], deletions:[]
        };
        if(!savePreMergeSnapshot("incoming.zip")) throw new Error("pre-merge snapshot was not saved");
        data.resources = [{ id:"after", name:"After Merge", categories:[], categoryFilters:{}, forGroups:[], informationText:"" }];
        window.confirm = () => true;
        restorePreMergeState();
        if(!data.resources.some(resource => resource.id === "before") || data.resources.some(resource => resource.id === "after")){
          throw new Error("pre-merge state was not restored");
        }
        if(getRecoveryPoints().length !== 1) throw new Error("restored recovery point should remain available");
      }finally{
        window.confirm = previousConfirm;
        data = previousData;
        if(previousStoredData == null) localStorage.removeItem(DATA_STORAGE_KEY);
        else localStorage.setItem(DATA_STORAGE_KEY, previousStoredData);
        if(previousSnapshot == null) localStorage.removeItem(PRE_MERGE_STORAGE_KEY);
        else localStorage.setItem(PRE_MERGE_STORAGE_KEY, previousSnapshot);
        if(previousReview == null) localStorage.removeItem(DELETION_REVIEW_STORAGE_KEY);
        else localStorage.setItem(DELETION_REVIEW_STORAGE_KEY, previousReview);
        if(previousUndo == null) localStorage.removeItem(UNDO_STORAGE_KEY);
        else localStorage.setItem(UNDO_STORAGE_KEY, previousUndo);
      }
    }
  });

  tests.push({
    name: "RECOVERY STORE RETAINS FIVE LABELED POINTS",
    fn: () => {
      const previousData = data;
      const previousStoredData = localStorage.getItem(DATA_STORAGE_KEY);
      const previousSnapshot = localStorage.getItem(PRE_MERGE_STORAGE_KEY);
      const previousReview = localStorage.getItem(DELETION_REVIEW_STORAGE_KEY);
      const previousUndo = localStorage.getItem(UNDO_STORAGE_KEY);
      const previousConfirm = window.confirm;
      try{
        localStorage.removeItem(PRE_MERGE_STORAGE_KEY);
        for(let index = 0; index < 6; index += 1){
          data = {
            packageVersion:index,
            categories:[],
            forGroups:[],
            resources:[{
              id:`snapshot-${index}`,
              name:`Snapshot ${index}`,
              categories:[],
              categoryFilters:{},
              forGroups:[],
              informationText:""
            }],
            changes:[], deletionRequests:[], deletions:[]
          };
          if(!savePreMergeSnapshot(`package-${index}.zip`)) throw new Error("recovery point save failed");
        }
        const points = getRecoveryPoints();
        if(points.length !== 5) throw new Error(`expected five recovery points, got ${points.length}`);
        if(points[0].fileName !== "package-5.zip" || points.some(point => !point.savedAt)){
          throw new Error("recovery points were not labeled newest first");
        }
        const selected = points.find(point => point.fileName === "package-2.zip");
        if(!selected) throw new Error("expected retained recovery point was missing");
        data.resources = [{ id:"current", name:"Current", categories:[], categoryFilters:{}, forGroups:[], informationText:"" }];
        window.confirm = () => true;
        restoreRecoveryPoint(selected.id);
        if(!data.resources.some(resource => resource.id === "snapshot-2")){
          throw new Error("selected recovery point was not restored");
        }
        if(getRecoveryPoints().length !== 5) throw new Error("restore removed recovery history");
        if(!recoveryPointLabel(selected).includes("package-2.zip")
          || !recoveryPointLabel(selected).includes("Resource Package 2")){
          throw new Error("recovery label omitted source filename or package version");
        }
      }finally{
        window.confirm = previousConfirm;
        data = previousData;
        if(previousStoredData == null) localStorage.removeItem(DATA_STORAGE_KEY);
        else localStorage.setItem(DATA_STORAGE_KEY, previousStoredData);
        if(previousSnapshot == null) localStorage.removeItem(PRE_MERGE_STORAGE_KEY);
        else localStorage.setItem(PRE_MERGE_STORAGE_KEY, previousSnapshot);
        if(previousReview == null) localStorage.removeItem(DELETION_REVIEW_STORAGE_KEY);
        else localStorage.setItem(DELETION_REVIEW_STORAGE_KEY, previousReview);
        if(previousUndo == null) localStorage.removeItem(UNDO_STORAGE_KEY);
        else localStorage.setItem(UNDO_STORAGE_KEY, previousUndo);
      }
    }
  });

  tests.push({
    name: "LEGACY SINGLE RECOVERY POINT REMAINS USABLE",
    fn: () => {
      const previousSnapshot = localStorage.getItem(PRE_MERGE_STORAGE_KEY);
      try{
        localStorage.setItem(PRE_MERGE_STORAGE_KEY, JSON.stringify({
          dataSnapshot:{
            packageVersion:9,
            categories:[],
            resources:[],
            forGroups:[],
            changes:[],
            deletionRequests:[],
            deletions:[]
          },
          fileName:"legacy-package.zip",
          savedAt:"2026-07-01T12:00:00.000Z"
        }));
        const first = getRecoveryPoints();
        const second = getRecoveryPoints();
        if(first.length !== 1 || first[0].fileName !== "legacy-package.zip" || first[0].packageVersion !== 9){
          throw new Error("legacy recovery point was not read");
        }
        if(first[0].id !== second[0].id){
          throw new Error("legacy recovery point did not receive a stable ID");
        }
      }finally{
        if(previousSnapshot == null) localStorage.removeItem(PRE_MERGE_STORAGE_KEY);
        else localStorage.setItem(PRE_MERGE_STORAGE_KEY, previousSnapshot);
      }
    }
  });

  tests.push({
    name: "UNSAFE RECOVERY POINT DOES NOT REPLACE CURRENT DATA",
    fn: () => {
      const previousData = data;
      const previousSnapshot = localStorage.getItem(PRE_MERGE_STORAGE_KEY);
      const previousConfirm = window.confirm;
      const previousAlert = window.alert;
      let alertText = "";
      try{
        data = {
          packageVersion:1,
          categories:[],
          resources:[{ id:"current", name:"Current", categories:[], categoryFilters:{}, forGroups:[], informationText:"" }],
          forGroups:[], changes:[], deletionRequests:[], deletions:[]
        };
        localStorage.setItem(PRE_MERGE_STORAGE_KEY, JSON.stringify({
          schemaVersion:RECOVERY_POINT_SCHEMA_VERSION,
          recoveryPoints:[{
            id:"unsafe-recovery",
            dataSnapshot:{ resourcePackageSchemaVersion:99, categories:[], resources:[] },
            fileName:"future-package.zip",
            savedAt:"2026-07-01T12:00:00.000Z",
            packageVersion:99
          }]
        }));
        window.confirm = () => true;
        window.alert = message => { alertText = String(message); };
        restoreRecoveryPoint("unsafe-recovery");
        if(!data.resources.some(resource => resource.id === "current")){
          throw new Error("unsafe recovery point replaced current data");
        }
        if(!alertText.includes("could not be restored safely") || !alertText.includes("unsupported")){
          throw new Error("unsafe recovery point did not explain the failure");
        }
      }finally{
        data = previousData;
        window.confirm = previousConfirm;
        window.alert = previousAlert;
        if(previousSnapshot == null) localStorage.removeItem(PRE_MERGE_STORAGE_KEY);
        else localStorage.setItem(PRE_MERGE_STORAGE_KEY, previousSnapshot);
      }
    }
  });
  tests.push({
    name: "BLANK RESOURCE CLEANUP DETECTION",
    fn: () => {
      const blank = { name:"", description:"", phone:"", address:"", website:"", hours:"", informationText:"", categories:[] };
      const named = { ...blank, name:"Named Resource" };
      const categorized = { ...blank, categories:["food"] };
      if(!isBlankResourceDraft(blank)) throw new Error("empty resource was not detected");
      if(isBlankResourceDraft(named)) throw new Error("named resource was treated as blank");
      if(isBlankResourceDraft(categorized)) throw new Error("categorized resource was treated as blank");
    }
  });

  tests.push({
    name: "NEW RESOURCE CANCEL CLEANUP",
    fn: () => {
      const previousData = data;
      const previousNewResourceIds = newResourceIds;
      const previousSelectedResourceId = selectedResourceId;
      const previousAdminResourceEditMode = adminResourceEditMode;
      try{
        data = {
          categories:[],
          resources:[
            { id:"existing", name:"Existing", categories:[], informationText:"" },
            { id:"draft", name:"", categories:[], informationText:"" }
          ]
        };
        newResourceIds = new Set(["draft"]);
        selectedResourceId = "draft";
        adminResourceEditMode = true;
        if(!discardNewResourceDraft("draft")) throw new Error("new resource draft was not discarded");
        if(data.resources.some(resource => resource.id === "draft")) throw new Error("draft resource remained in data");
        if(newResourceIds.has("draft")) throw new Error("draft id remained tracked");
        if(selectedResourceId !== "existing") throw new Error("selection did not move to existing resource");
      }finally{
        data = previousData;
        newResourceIds = previousNewResourceIds;
        selectedResourceId = previousSelectedResourceId;
        adminResourceEditMode = previousAdminResourceEditMode;
      }
    }
  });

  tests.push({
    name: "UTC LAST MODIFIED FORMAT",
    fn: () => {
      const formatted = formatDateTimeUTC("2026-05-09T05:16:20.130Z");
      if(formatted !== "May 9, 2026, 5:16 UTC"){
        throw new Error(`unexpected formatted date '${formatted}'`);
      }
    }
  });

  tests.push({
    name: "PRINT RESOURCE SEPARATORS",
    fn: () => {
      const container = document.createElement("div");
      PrintWorkflow.renderPrintableResourceCards(container, [
        { id:"print-one", name:"Print One", categories:[], informationText:"" },
        { id:"print-two", name:"Print Two", categories:[], informationText:"" },
        { id:"print-three", name:"Print Three", categories:[], informationText:"" }
      ]);
      if(container.querySelectorAll(".resource-card").length !== 3){
        throw new Error("print resource cards were not rendered");
      }
      if(container.querySelectorAll(".print-resource-separator").length !== 2){
        throw new Error("print resource separators were not inserted between cards");
      }
      if(container.firstElementChild && container.firstElementChild.classList.contains("print-resource-separator")){
        throw new Error("separator was inserted before the first resource");
      }
    }
  });

  tests.push({
    name: "PRINT OUTPUT INCLUDES DESCRIPTION AND INFORMATION",
    fn: () => {
      const container = document.createElement("div");
      PrintWorkflow.renderPrintableResourceCards(container, [{
        id:"print-fields-normal",
        name:"Normal Print Fields",
        description:"Normal description text",
        categories:[],
        informationText:"Normal information text"
      }]);
      if(!/Normal description text/.test(container.textContent || "")){
        throw new Error("normal print output omitted the Description field");
      }
      if(!/Normal information text/.test(container.textContent || "")){
        throw new Error("normal print output omitted the Information field");
      }

      const flyer = PrintWorkflow.buildListFlyer({
        id:"print-fields-list",
        name:"List Print Fields",
        description:"List description text",
        categories:[],
        informationText:"List information text"
      }, false);
      if(!/Description:\s*List description text/.test(flyer.textContent || "")){
        throw new Error("list print output omitted the Description field");
      }
      if(!/Information:\s*List information text/.test(flyer.textContent || "")){
        throw new Error("list print output omitted the Information field");
      }
    }
  });

  tests.push({
    name: "PRINT PREVIEW STARTS WITH RESOURCE CONTENT",
    fn: () => {
      PrintWorkflow.openPreview([
        { id:"print-start", name:"Print Start", categories:[], informationText:"" }
      ]);
      if(/Suggested Resources/.test(printContent.textContent || "")){
        throw new Error("print preview still includes Suggested Resources header");
      }
      if(!printContent.firstElementChild || !printContent.firstElementChild.classList.contains("resource-card")){
        throw new Error("print preview does not start with the first resource card");
      }

      PrintWorkflow.renderPrintSelectionPacket([], [
        { id:"print-list-start", name:"Print List Start", categories:[], informationText:"List information." }
      ]);
      if(/Suggested Resources/.test(printContent.textContent || "")){
        throw new Error("print packet still includes Suggested Resources header");
      }
      if(!printContent.firstElementChild || !printContent.firstElementChild.classList.contains("print-list-flyer")){
        throw new Error("print packet does not start with the first list resource");
      }
      PrintWorkflow.close();
    }
  });

  tests.push({
    name: "PRINT REVIEW STAYS ABOVE TITLE BAR",
    fn: () => {
      const topbar = document.querySelector(".topbar");
      if(!topbar) throw new Error("title bar missing");

      const modalZIndex = Number.parseInt(getComputedStyle(printModal).zIndex, 10);
      const topbarZIndex = Number.parseInt(getComputedStyle(topbar).zIndex, 10);
      if(!Number.isFinite(modalZIndex) || modalZIndex <= topbarZIndex){
        throw new Error(`print review z-index ${modalZIndex} does not clear title bar z-index ${topbarZIndex}`);
      }
      if(getComputedStyle(printContentWrapper).boxSizing !== "border-box"){
        throw new Error("print review size does not include its padding");
      }
    }
  });

  tests.push({
    name: "PRINT PREVIEW HAS NO PROGRESS MESSAGE",
    fn: () => {
      const previousQueue = PrintWorkflow.queue;
      const previousCurrentIndex = PrintWorkflow.currentIndex;
      try{
        PrintWorkflow.queue = [{
          label:"Print Selection",
          render: () => {}
        }];
        PrintWorkflow.currentIndex = 0;
        PrintWorkflow.updateUI();
        if((printProgress.textContent || "").trim()){
          throw new Error(`unexpected print progress '${printProgress.textContent}'`);
        }
      }finally{
        PrintWorkflow.queue = previousQueue;
        PrintWorkflow.currentIndex = previousCurrentIndex;
        PrintWorkflow.updateUI();
      }
    }
  });

  tests.push({
    name: "EMPTY PRINT SELECTION HIDES PRINT ACTION",
    fn: () => {
      const previousData = data;
      const previousPrintSelection = printSelection;
      try{
        data = {
          categories:[],
          resources:[{ id:"print-empty-source", name:"Print Empty Source", categories:[], informationText:"" }],
          changes:[]
        };
        printSelection = [];
        PrintWorkflow.startPrintSelection();
        if(!printActionBtn.classList.contains("hidden")){
          throw new Error("print button should be hidden when no resources are selected");
        }
        const instruction = printContent.querySelector(".print-empty-instruction");
        if(!instruction) throw new Error("empty print instruction was not rendered");
        if(instruction.textContent !== "Click the gray printer button next to a resource to include it in the printed handout."){
          throw new Error(`unexpected empty print instruction '${instruction.textContent}'`);
        }
        if(getComputedStyle(instruction).color !== "rgb(170, 0, 0)"){
          throw new Error(`empty print instruction should be red, got ${getComputedStyle(instruction).color}`);
        }
        PrintWorkflow.close();
      }finally{
        data = previousData;
        printSelection = previousPrintSelection;
      }
    }
  });

  tests.push({
    name: "PRINT SELECTION STATE",
    fn: () => {
      const previousData = data;
      const previousPrintSelection = printSelection;
      const container = document.createElement("div");
      try{
        data = {
          categories:[],
          resources:[
            { id:"normal", name:"Normal Resource", categories:[], phone:"555-1212", informationText:"" },
            { id:"list", name:"List Resource", categories:[], phone:"", website:"", hours:"", informationText:"" }
          ]
        };
        printSelection = ["normal", "list"];
        const groups = PrintWorkflow.getPrintSelectionGroups();
        if(groups.normalSelections.length !== 1) throw new Error("normal print selection missing");
        if(groups.listSelections.length !== 1) throw new Error("list print selection missing");
        printSelection = ["normal"];
        PrintWorkflow.renderPrintableResourceCards(container, data.resources);
        if(container.querySelectorAll(".resource-card").length !== 2){
          throw new Error("disabled preview row was removed");
        }
        const disabled = container.querySelector(".resource-card.print-disabled");
        if(!disabled || !/List Resource/.test(disabled.textContent || "")){
          throw new Error("disabled preview row was not marked");
        }
      }finally{
        data = previousData;
        printSelection = previousPrintSelection;
        container.remove();
      }
    }
  });

  tests.push({
    name: "FOR GROUP TRIM AND DEDUPE",
    fn: () => {
      const sample = { resources:[{ forGroups:[" Veterans ", "veterans", "Women"] }], forGroups:[" Children ", "children"] };
      normalizeDataForGroupsShape(sample);
      if(JSON.stringify(sample.resources[0].forGroups) !== JSON.stringify(["Veterans", "Women"])){
        throw new Error(`unexpected resource forGroups ${JSON.stringify(sample.resources[0].forGroups)}`);
      }
      if(JSON.stringify(sample.forGroups) !== JSON.stringify(["Children"])){
        throw new Error(`unexpected governed forGroups ${JSON.stringify(sample.forGroups)}`);
      }
      const legacy = { tags:["ignored"], resources:[{ tags:["ignored"] }] };
      normalizeLegacyTagsShape(legacy);
      if("tags" in legacy || "tags" in legacy.resources[0]){
        throw new Error("legacy tags should be removed");
      }
    }
  });

  tests.push({
    name: "LEGACY RESOURCE PACKAGE FIELDS NORMALIZE",
    fn: () => {
      const legacyPackage = {
        categories:[{ id:"food", label:"Food", displayOrder:10 }],
        resources:[{ id:"pantry", name:"Pantry", categories:["food"], tags:["List"], servicesText:"Legacy services", pdf:"assets/old.pdf" }],
        tags:["List"],
        version:2
      };
      const report = validateImportData(legacyPackage);
      if(!report.ok) throw new Error("legacy package fields should be accepted for normalization");
      const normalized = normalizePackageData(legacyPackage);
      if("tags" in normalized || "version" in normalized) throw new Error("legacy top-level fields were not removed");
      if("displayOrder" in normalized.categories[0]) throw new Error("legacy category displayOrder was not removed");
      if("tags" in normalized.resources[0]) throw new Error("legacy resource tags were not removed");
      if(normalized.resources[0].informationText !== "Legacy services") throw new Error("legacy servicesText was not mapped");
      if(!normalized.resources[0].pdfs.length) throw new Error("legacy pdf was not normalized");
    }
  });

  tests.push({
    name: "LEGACY PDF NORMALIZATION",
    fn: () => {
      const resource = { id:"legacy-pdf", pdf:"assets/forms/intake.pdf" };
      normalizeResourcePDFs(resource);
      if(!Array.isArray(resource.pdfs) || resource.pdfs.length !== 1){
        throw new Error("legacy pdf was not migrated into pdfs[]");
      }
      if(resource.pdfs[0].path !== "assets/forms/intake.pdf"){
        throw new Error("legacy pdf path was not preserved");
      }
      if(resource.pdfs[0].name !== "intake.pdf"){
        throw new Error(`expected filename label, got '${resource.pdfs[0].name}'`);
      }
      const once = JSON.stringify(resource.pdfs);
      normalizeResourcePDFs(resource);
      if(JSON.stringify(resource.pdfs) !== once){
        throw new Error("PDF normalization is not idempotent");
      }
    }
  });

  tests.push({
    name: "MULTIPLE PDF EXPORT KEYS",
    fn: () => {
      const keys = collectPDFPathsFromResources([{
        id:"multi-pdf",
        pdf:"assets/legacy.pdf",
        pdfs:[
          { id:"a", name:"A", path:"pdfs/multi/a-a.pdf" },
          { id:"b", name:"B", path:"pdfs/multi/b-b.pdf" },
          { id:"dup", name:"Dup", path:"assets/legacy.pdf" }
        ]
      }]);
      const expected = ["pdfs/multi/a-a.pdf", "pdfs/multi/b-b.pdf", "assets/legacy.pdf"];
      if(JSON.stringify(keys) !== JSON.stringify(expected)){
        throw new Error(`unexpected PDF keys ${JSON.stringify(keys)}`);
      }
    }
  });

  tests.push({
    name: "MULTIPLE PDF BUTTON RENDERING",
    fn: () => {
      const card = buildResourceCard({
        id:"render-pdfs",
        name:"Render PDFs",
        pdfs:[
          { id:"one", name:"First form", path:"pdfs/render/one.pdf" },
          { id:"two", name:"Second form", path:"pdfs/render/two.pdf" }
        ]
      }, { expanded:true, showPrintToggle:false });
      const buttons = card.querySelectorAll(".resource-pdf-button");
      if(buttons.length !== 2) throw new Error(`expected 2 PDF buttons, got ${buttons.length}`);
      if(buttons[0].textContent !== "First form" || buttons[1].textContent !== "Second form"){
        throw new Error("PDF button labels were not rendered from attachment names");
      }
    }
  });

  tests.push({
    name: "RESOURCE CARD RENDERS HOURS",
    fn: () => {
      const card = buildResourceCard({
        id:"render-hours",
        name:"Render Hours",
        phone:"555-1212",
        address:"123 Main",
        website:"example.org",
        hours:"Monday-Friday 9-5",
        informationText:""
      }, { expanded:true, showPrintToggle:false });
      const text = card.textContent || "";
      if(!text.includes("Phone:") || !text.includes("Address:") || !text.includes("Website:")){
        throw new Error("resource card did not render basic contact details");
      }
      if(!text.includes("Hours:") || !text.includes("Monday-Friday 9-5")){
        throw new Error("resource card did not render hours");
      }
    }
  });

  tests.push({
    name: "RESOURCE CARD HIDES NONE CONTACT VALUES",
    fn: () => {
      const card = buildResourceCard({
        id:"hide-none-contact",
        name:"Hide None Contact",
        phone:"none",
        address:"None",
        website:"NONE",
        hours:" none ",
        informationText:""
      }, { expanded:true, showPrintToggle:false });
      const text = card.textContent || "";
      if(text.includes("Phone:") || text.includes("Address:") || text.includes("Website:") || text.includes("Hours:")){
        throw new Error("resource card rendered contact fields whose value was none");
      }
    }
  });

  tests.push({
    name: "ADMIN FOR GROUP DELETE CREATES TAG",
    fn: () => {
      const previousData = data;
      const previousAdminTab = adminTab;
      const previousStoredData = localStorage.getItem(DATA_STORAGE_KEY);
      try{
        data = {
          categories:[{ id:"education", label:"Education" }],
          forGroups:["GED", "List", "Food"],
          resources:[
            { id:"adult-ed", name:"Adult Education", categories:["education"], forGroups:["GED", "List"], lastModified:"2026-01-01T00:00:00.000Z" },
            { id:"career-ed", name:"Career Education", categories:["education"], forGroups:["ged"], lastModified:"2026-01-01T00:00:00.000Z" },
            { id:"food", name:"Food Pantry", categories:[], forGroups:["Food"], lastModified:"2026-01-01T00:00:00.000Z" }
          ],
          changes:[]
        };
        adminTab = "forGroups";
        applyForGroupsDraft({ forGroups:["List", "Food"] });
        const adult = data.resources.find(resource => resource.id === "adult-ed");
        const career = data.resources.find(resource => resource.id === "career-ed");
        const food = data.resources.find(resource => resource.id === "food");
        if(!adult.forGroups.includes("GED") || !career.forGroups.some(group => group.toLowerCase() === "ged")){
          throw new Error("tagging a For group changed matching resources before review");
        }
        if(!adult.forGroups.includes("List")) throw new Error("unrelated For group was removed");
        if(!food.forGroups.includes("Food")) throw new Error("non-matching resource was changed");
        if(adult.lastModified !== "2026-01-01T00:00:00.000Z" || career.lastModified !== "2026-01-01T00:00:00.000Z"){
          throw new Error("tagging changed matching resource timestamps before review");
        }
        if(food.lastModified !== "2026-01-01T00:00:00.000Z"){
          throw new Error("non-matching resource timestamp changed");
        }
        if(data.changes.length !== 0) throw new Error("tagging should not add applied-deletion change entries");
        if(!data.forGroups.includes("GED")) throw new Error("tagged For group was removed before review");
        if(!data.deletionRequests.some(request => request.key === "forGroup:ged")){
          throw new Error("removed For group was not tagged for deletion");
        }
      }finally{
        data = previousData;
        adminTab = previousAdminTab;
        if(previousStoredData === null) localStorage.removeItem(DATA_STORAGE_KEY);
        else localStorage.setItem(DATA_STORAGE_KEY, previousStoredData);
      }
    }
  });

  tests.push({
    name: "DEFENSIVE FOR GROUP NORMALIZATION",
    fn: () => {
      const sample = {
        unknownField: true,
        categories:[{ id:"housing", label:"Housing" }],
        forGroups:"Veterans, Women, veterans",
        resources:[
          { id:"old", name:"Old", categories:["housing"] },
          { id:"string", name:"String Groups", categories:["housing"], forGroups:"Veterans, Women" },
          { id:"bad", name:"Bad Groups", categories:["housing"], forGroups:null }
        ]
      };
      normalizePackageData(sample);
      if(sample.unknownField !== true) throw new Error("unknown package field was not preserved");
      if(!Array.isArray(sample.changes) || sample.changes.length !== 0) throw new Error("missing changes should normalize to []");
      if(JSON.stringify(sample.forGroups) !== JSON.stringify(["Veterans", "Women"])) throw new Error("string governed groups were not split");
      if(JSON.stringify(sample.resources[0].forGroups) !== JSON.stringify([])) throw new Error("missing forGroups should normalize to []");
      if(JSON.stringify(sample.resources[1].forGroups) !== JSON.stringify(["Veterans", "Women"])) throw new Error("string resource groups were not split");
      if(JSON.stringify(sample.resources[2].forGroups) !== JSON.stringify([])) throw new Error("null resource groups should normalize to []");
      if("tags" in sample) throw new Error("top-level tags should not be preserved");
    }
  });

  tests.push({
    name: "ADMIN FOR GROUP EDITOR CONTROLS",
    fn: () => {
      const previousData = data;
      const previousAdminTab = adminTab;
      const previousEditing = editing;
      const previousEditorSnapshot = editorSnapshot;
      const previousStoredData = localStorage.getItem(DATA_STORAGE_KEY);
      const previousConfirm = window.confirm;
      const previousUndo = localStorage.getItem(UNDO_STORAGE_KEY);
      try{
        data = {
          categories:[],
          forGroups:["Veterans"],
          resources:[{ id:"vet", name:"Veterans Resource", categories:[], forGroups:["Veterans"], informationText:"" }],
          changes:[]
        };
        adminTab = "forGroups";
        renderAdmin();
        let newBtn = document.getElementById("forGroupNewBtn");
        let deleteBtn = document.getElementById("forGroupDeleteBtn");
        let actionBar = document.getElementById("admin_editor_actions");
        if(!newBtn || !deleteBtn || !actionBar) throw new Error("For editor controls were not rendered");
        if(!actionBar.hidden) throw new Error("For editor action bar should start hidden until dirty");
        const firstRow = document.querySelector(".for-group-row");
        if(!firstRow || firstRow.getAttribute("role") !== "option"){
          throw new Error("For editor rows should be selectable options");
        }

        newBtn.click();
        let cancelBtn = document.getElementById("forGroupCancelBtn");
        let doneBtn = document.getElementById("forGroupDoneBtn");
        if(actionBar.hidden || !cancelBtn || !doneBtn) throw new Error("For editor action bar should show after New");
        if(!doneBtn.closest(".admin-sticky-editor-actions")) throw new Error("Done should be in Admin sticky editor actions");
        let inputs = Array.from(document.querySelectorAll(".forGroupInput"));
        inputs[inputs.length - 1].value = "Women";
        inputs[inputs.length - 1].dispatchEvent(new Event("input", { bubbles:true }));
        doneBtn.click();
        if(!data.forGroups.includes("Women")) throw new Error("Done did not save new For group");

        renderAdmin();
        newBtn = document.getElementById("forGroupNewBtn");
        actionBar = document.getElementById("admin_editor_actions");
        if(!actionBar.hidden) throw new Error("For editor action bar should hide again after saving");
        newBtn.click();
        cancelBtn = document.getElementById("forGroupCancelBtn");
        inputs = Array.from(document.querySelectorAll(".forGroupInput"));
        inputs[inputs.length - 1].value = "Seniors";
        inputs[inputs.length - 1].dispatchEvent(new Event("input", { bubbles:true }));
        cancelBtn.click();
        if(data.forGroups.includes("Seniors")) throw new Error("Cancel saved a draft For group");

        renderAdmin();
        newBtn = document.getElementById("forGroupNewBtn");
        newBtn.click();
        inputs = Array.from(document.querySelectorAll(".forGroupInput"));
        inputs[inputs.length - 1].value = "Caregivers";
        inputs[inputs.length - 1].dispatchEvent(new Event("input", { bubbles:true }));
        deleteBtn = document.getElementById("forGroupDeleteBtn");
        const womenInput = Array.from(document.querySelectorAll(".forGroupInput")).find(input => input.value === "Women");
        if(!womenInput) throw new Error("saved For group was not rendered for deletion");
        const row = womenInput.closest(".for-group-row");
        row.click();
        if(!row.classList.contains("selected")) throw new Error("clicking a For group row should select it");
        window.confirm = () => true;
        deleteBtn.click();
        if(!data.forGroups.includes("Women")) throw new Error("tagging a For group should keep it active until merge review");
        if(!(data.deletionRequests || []).some(request => request.key === "forGroup:women")){
          throw new Error("selected For group was not tagged for deletion");
        }
        if(!data.forGroups.includes("Caregivers")){
          throw new Error("For group deletion tagging discarded another pending group");
        }
        renderAdmin();
        const taggedWomenInput = Array.from(document.querySelectorAll(".forGroupInput")).find(input => input.value === "Women");
        const status = taggedWomenInput && taggedWomenInput.closest(".for-group-row").querySelector(".deletion-tag-status");
        if(!status || status.textContent.trim() !== "tagged for deletion"){
          throw new Error("tagged For group status was not rendered");
        }
      }finally{
        window.confirm = previousConfirm;
        data = previousData;
        adminTab = previousAdminTab;
        editing = previousEditing;
        editorSnapshot = previousEditorSnapshot;
        if(previousStoredData === null) localStorage.removeItem(DATA_STORAGE_KEY);
        else localStorage.setItem(DATA_STORAGE_KEY, previousStoredData);
        if(previousUndo === null) localStorage.removeItem(UNDO_STORAGE_KEY);
        else localStorage.setItem(UNDO_STORAGE_KEY, previousUndo);
      }
    }
  });

  tests.push({
    name: "CATEGORY FILTER OR LOGIC",
    fn: () => {
      const resources = [
        { name:"Women Only", forGroups:["Women"] },
        { name:"Shelter Only", categoryFilters:{ housing:["Shelter"] } },
        { name:"Both", forGroups:["Women"], categoryFilters:{ housing:["Shelter"] } },
        { name:"Neither", forGroups:["Food"] }
      ];
      const matching = filterResourcesBySelectedCategoryFilters(resources, "housing", [
        makeForGroupFilterKey("Women"),
        makeCategorySpecificFilterKey("Shelter")
      ]).map(r => r.name);
      ["Women Only", "Shelter Only", "Both"].forEach(name => {
        if(!matching.includes(name)) throw new Error(`${name} was excluded`);
      });
      if(matching.includes("Neither")) throw new Error("resource without selected filters was included");
    }
  });

  tests.push({
    name: "LIST REFERENCE DETECTION",
    fn: () => {
      const previousData = data;
      try{
        const longText = `${"Long resource directory. ".repeat(30)} GED preparation and earn a GED. Captain Your Story - My Story Matters.`;
        data = {
          categories:[
            { id:"housing", label:"Housing" },
            { id:"food", label:"Food" },
            { id:"education", label:"Education" }
          ],
          resources:[
            { id:"target", name:"Community Action", categories:["food"], phone:"555-0000", informationText:"Community Action" },
            { id:"list-food", name:"Food Pantries", categories:["food"], phone:"", website:"", hours:"", informationText:"Community-Action\ncommunity action" },
            { id:"list-housing", name:"Housing Lists", categories:["housing","food"], phone:"", website:"", hours:"", informationText:"community action" },
            { id:"not-list", name:"Caseworker Note", categories:["food"], phone:"555-1111", informationText:"Community Action" },
            { id:"ged", name:"GED", categories:["education"], phone:"555-2222", informationText:"" },
            { id:"can", name:"CAN", categories:["education"], phone:"555-3333", informationText:"" },
            { id:"ican", name:"ICAN", categories:["education"], phone:"555-4444", informationText:"" },
            { id:"aid", name:"Aid", categories:["education"], phone:"555-5555", informationText:"" },
            { id:"story", name:"My Story Matters", categories:["education"], phone:"555-6666", informationText:"" },
            { id:"list-education", name:"Education Lists", categories:["education"], phone:"", website:"", hours:"", informationText:"GED preparation, earn a GED, abridged notes, American Fork resources, vacancy listings, Captain Your Story - My Story Matters, GED." },
            { id:"long-directory", name:"Long Education Directory", categories:["education"], phone:"", website:"", hours:"", informationText:longText },
            { id:"short-directory", name:"Short Education Note", categories:["education"], phone:"555-7777", informationText:"GED preparation and My Story Matters" }
          ]
        };

        const matches = findReferencingLists({ id:"target", name:"COMMUNITY ACTION" });
        const names = matches.map(match => match.listName);
        const housingMatch = matches.find(match => match.listName === "Housing Lists");
        if(!names.includes("Food Pantries")) throw new Error("food list reference was not found");
        if(!housingMatch) throw new Error("housing list reference was not found");
        if(!housingMatch.categoryLabels.includes("Housing") || !housingMatch.categoryLabels.includes("Food")) throw new Error("multi-category list labels were not found");
        if(names.includes("Community Action")) throw new Error("clicked resource was included as a self-match");
        if(names.includes("Caseworker Note")) throw new Error("non-list resource was included");
        if(names.filter(name => name === "Food Pantries").length !== 1) throw new Error("duplicate mention produced duplicate match");
        if(names[0] !== "Food Pantries") throw new Error("list references should sort alphabetically by category");

        const gedMatches = findReferencingLists({ id:"ged", name:"GED" }).map(match => match.listName);
        if(!gedMatches.includes("Education Lists")) throw new Error("GED list reference was not found");
        if(!gedMatches.includes("Long Education Directory")) throw new Error("long list-style resource was not included");
        if(gedMatches.includes("Short Education Note")) throw new Error("short non-list resource was included");
        if(gedMatches.filter(name => name === "Education Lists").length !== 1) throw new Error("duplicate GED references were not deduplicated");

        if(findReferencingLists({ id:"can", name:"CAN" }).length) throw new Error("CAN matched inside vacancy");
        if(findReferencingLists({ id:"ican", name:"ICAN" }).length) throw new Error("ICAN matched inside American");
        if(findReferencingLists({ id:"aid", name:"Aid" }).length) throw new Error("short non-acronym name should be ignored");
        const storyMatches = findReferencingLists({ id:"story", name:"My Story Matters" }).map(match => match.listName);
        if(!storyMatches.includes("Education Lists")) throw new Error("multi-word list reference was not found");
        if(!storyMatches.includes("Long Education Directory")) throw new Error("multi-word long list-style reference was not found");
      }finally{
        data = previousData;
      }
    }
  });

  tests.push({
    name: "SEARCH TOKEN AND WORD-FORM MATCHING",
    fn: () => {
      if(!textContainsTokenPhrase("GED preparation", "ged")) throw new Error("case-insensitive GED match failed");
      if(!textContainsTokenPhrase("BioLife Plasma", "plasma")) throw new Error("whole-word plasma match failed");
      if(textContainsTokenPhrase("parent support", "rent")) throw new Error("rent matched inside parent");
      if(textContainsTokenPhrase("paid utility help", "aid")) throw new Error("aid matched inside paid");
      if(!textContainsTokenPhrase("Captain Your Story - My Story Matters", "My Story Matters")) throw new Error("multi-word search failed");
      if(!searchTextMatchesAllTokens("rental assistance", getReferenceTokens("rent"))) throw new Error("rent did not match rental");
      if(!searchTextMatchesAllTokens("housing resources", getReferenceTokens("house resource"))) throw new Error("word-form matching failed");
      if(searchTextMatchesAllTokens("parent support", getReferenceTokens("rent"))) throw new Error("word-form search matched inside parent");
      if(searchTextMatchesAllTokens("paid utility help", getReferenceTokens("aid"))) throw new Error("word-form search matched inside paid");
    }
  });

  tests.push({
    name: "SEARCH RESULTS ARE UNIQUE WITH CATEGORY METADATA",
    fn: () => {
      const previousData = data;
      try{
        data = {
          categories:[
            { id:"employment", label:"Employment" },
            { id:"health", label:"Health Care" }
          ],
          resources:[
            { id:"bio", name:"BioLife Plasma", categories:["employment","employment","health"], phone:"555-0100", informationText:"" },
            { id:"talecris", name:"Talecris Plasma", categories:["employment"], phone:"555-0101", informationText:"" }
          ]
        };
        const results = buildSearchResults("plasma");
        if(results.mode !== "results") throw new Error(`expected results mode, got ${results.mode}`);
        if(results.items.length !== 2) throw new Error("resources were duplicated across categories");
        const bio = results.items.find(item => item.resourceId === "bio");
        if(!bio) throw new Error("multi-category resource was missing");
        if(bio.categories.map(category => category.id).join(",") !== "employment,health"){
          throw new Error("result category metadata was incorrect or duplicated");
        }
      }finally{
        data = previousData;
      }
    }
  });

  tests.push({
    name: "SEARCH INFORMATION MATCHES REMAIN VISIBLE",
    fn: () => {
      const previousData = data;
      try{
        data = {
          categories:[{ id:"housing", label:"Housing" }],
          resources:[
            { id:"parent", name:"Parent Support", categories:["housing"], categoryFilters:{}, forGroups:[], informationText:"paid utility help" },
            { id:"uca", name:"Utah Community Action", categories:["housing"], categoryFilters:{}, forGroups:[], informationText:"Emergency rental assistance and deposit help" }
          ]
        };
        const rentResults = buildSearchResults("rent");
        if(rentResults.mode !== "results") throw new Error("rent should match rental");
        if(rentResults.items.length !== 1 || rentResults.items[0].resourceId !== "uca"){
          throw new Error("rent should match rental without matching parent");
        }
        const emergencyResults = buildSearchResults("emergency");
        if(emergencyResults.mode !== "results") throw new Error(`expected results mode, got ${emergencyResults.mode}`);
        if(emergencyResults.items[0].resourceId !== "uca") throw new Error("information result resource was incorrect");
        if(!emergencyResults.items[0].snippet) throw new Error("information result snippet was missing");

        data.resources.push({ id:"emergency-name", name:"Emergency Center", categories:["housing"], categoryFilters:{}, forGroups:[], informationText:"" });
        const nameResults = buildSearchResults("emergency");
        if(nameResults.mode !== "results") throw new Error("unified search did not return results mode");
        if(nameResults.items.map(item => item.resourceId).join(",") !== "emergency-name,uca"){
          throw new Error("name match was not ranked ahead of the retained information match");
        }
      }finally{
        data = previousData;
      }
    }
  });

  tests.push({
    name: "SEARCH INFORMATION CONTEXT IDENTIFIES LIST SUBSECTION",
    fn: () => {
      const previousData = data;
      try{
        data = {
          categories:[{ id:"disability", label:"Disability" }, { id:"legal", label:"Legal" }],
          resources:[{
            id:"legal-list",
            name:"Legal Resources",
            categories:["disability", "legal"],
            categoryFilters:{},
            forGroups:[],
            phone:"",
            website:"",
            hours:"",
            informationText:"**Timpanogos Legal Center**\nPhone: 801-649-8895\n\n**Utah Legal Services**\n* Housing Eviction Basics\n* Tenant help"
          }]
        };
        const results = buildSearchResults("eviction");
        const item = results.items[0];
        if(!item || item.resourceId !== "legal-list") throw new Error("list-style information match was missing");
        if(item.sectionLabel !== "Utah Legal Services") throw new Error("nearest list subsection was not identified");
        if(!/eviction/i.test(item.snippet)) throw new Error("snippet was not centered on the matching word");
        if(/Timpanogos/.test(item.snippet)) throw new Error("snippet still started at the beginning of the list");
      }finally{
        data = previousData;
      }
    }
  });

  tests.push({
    name: "SEARCH TAXONOMY MATCHES",
    fn: () => {
      const previousData = data;
      try{
        data = {
          categories:[
            { id:"employment", label:"Employment", filters:["Career Training"] },
            { id:"housing", label:"Housing", filters:["Shared Rooms"] }
          ],
          forGroups:["Veterans", "Seniors"],
          resources:[
            { id:"training", name:"Training Resource", categories:["employment"], categoryFilters:{ employment:["Career Training"] }, forGroups:[], informationText:"" },
            { id:"vets", name:"Service Resource", categories:["employment","housing"], categoryFilters:{}, forGroups:["Veterans"], phone:"555-1212", informationText:"" },
            { id:"senior", name:"Community Help", categories:["housing"], categoryFilters:{}, forGroups:["Seniors"], informationText:"" },
            { id:"room", name:"Room Resource", categories:["housing"], categoryFilters:{ housing:["Shared Rooms"] }, forGroups:[], phone:"555-0000", informationText:"" }
          ]
        };
        const categoryResults = buildSearchResults("housing");
        if(categoryResults.mode !== "results") throw new Error(`expected results mode, got ${categoryResults.mode}`);
        if(categoryResults.items.length !== 3) throw new Error("category search did not include housing resources");

        const filterResults = buildSearchResults("career training");
        if(filterResults.mode !== "results") throw new Error("category filter search should return results");
        if(filterResults.items[0].resourceId !== "training") throw new Error("category filter search returned wrong resource");
        if(!/Type: Career Training/.test(filterResults.items[0].snippet)){
          throw new Error("category filter search snippet was missing");
        }

        const forResults = buildSearchResults("seniors");
        if(forResults.mode !== "results") throw new Error("For group search should return results");
        if(forResults.items[0].resourceId !== "senior") throw new Error("For group search returned wrong resource");
        if(!/For: Seniors/.test(forResults.items[0].snippet)){
          throw new Error("For group search snippet was missing");
        }
        const veteranResults = buildSearchResults("veterans");
        if(veteranResults.mode !== "results") throw new Error("Veterans For group search should return results");
        const veteranCategories = veteranResults.items[0].categories.map(category => category.id).sort();
        if(veteranCategories.join(",") !== "employment,housing"){
          throw new Error("For group search did not include each resource category");
        }
        const forOnlyResults = buildSearchResults("shared rooms");
        if(forOnlyResults.mode !== "results") throw new Error("second category filter search should return results");
        if(forOnlyResults.items.length !== 1 || forOnlyResults.items[0].resourceId !== "room"){
          throw new Error("category filter search returned resources without the selected filter");
        }
      }finally{
        data = previousData;
      }
    }
  });

  tests.push({
    name: "SEARCH ALL RESOURCE FIELDS AND CROSS-FIELD TERMS",
    fn: () => {
      const previousData = data;
      try{
        data = {
          categories:[{ id:"housing", label:"Housing", filters:["Emergency Shelter"] }],
          forGroups:["Veterans"],
          resources:[
            {
              id:"complete",
              name:"Community Resource",
              description:"Long-term support",
              categories:["housing"],
              categoryFilters:{ housing:["Emergency Shelter"] },
              forGroups:["Veterans"],
              phone:"801-342-2600",
              address:"675 Garden Drive",
              website:"https://example.org/services",
              hours:"Open weekends",
              informationText:"Eviction prevention counseling",
              pdfs:[{ id:"guide", name:"Tenant Handbook", path:"tenant-handbook.pdf" }]
            }
          ]
        };

        [
          ["long-term", "Description"],
          ["801 342 2600", "Phone"],
          ["garden drive", "Address"],
          ["example org", "Website"],
          ["weekends", "Hours"],
          ["tenant handbook", "PDF"],
          ["prevention eviction", "Information"]
        ].forEach(([query, expectedLabel]) => {
          const results = buildSearchResults(query);
          const item = results.items[0];
          if(!item || item.resourceId !== "complete") throw new Error(`${expectedLabel} was not searchable`);
          if(!item.snippet.startsWith(`${expectedLabel}:`)) throw new Error(`${expectedLabel} match reason was missing`);
        });

        const crossField = buildSearchResults("support veterans housing");
        const crossFieldItem = crossField.items[0];
        if(!crossFieldItem || !/^Matches across:/.test(crossFieldItem.snippet)){
          throw new Error("query terms did not match across resource fields");
        }
      }finally{
        data = previousData;
      }
    }
  });

  tests.push({
    name: "SEARCH RESULT NAVIGATION",
    fn: () => {
      const previousData = data;
      const previousView = view;
      const previousCategory = currentCategory;
      const previousExpanded = expandedSearchResourceId;
      const previousFilters = selectedCategoryFilters;
      const previousSearchOpen = isSearchOpen;
      const previousSearchQuery = searchQuery;
      const previousSearchResults = searchResults;
      const previousSearchDetail = searchDetailResourceId;
      const previousReturnResource = searchResultReturnResourceId;
      try{
        data = {
          categories:[{ id:"housing", label:"Housing" }, { id:"employment", label:"Employment" }],
          resources:[{
            id:"uca",
            name:"Utah Community Action",
            categories:["housing", "employment"],
            categoryFilters:{},
            forGroups:[],
            informationText:"Eviction mediation"
          }],
          changes:[]
        };
        searchQuery = "eviction";
        searchResults = buildSearchResults(searchQuery);
        selectedCategoryFilters = { housing:["Shelter"] };
        openSearchResult("uca");
        if(view !== "search-detail") throw new Error("search result did not open its detail view");
        if(searchDetailResourceId !== "uca") throw new Error("search detail resource was not selected");
        if(!appView.querySelector(".search-detail-card")) throw new Error("expanded search detail card was not rendered");
        if(!appView.querySelector(".search-match-highlight")) throw new Error("matching information was not highlighted");
        const categoryButtons = Array.from(appView.querySelectorAll(".search-detail-category")).map(button => button.textContent);
        if(!categoryButtons.includes("View in Housing") || !categoryButtons.includes("View in Employment")){
          throw new Error("search detail category actions were missing");
        }

        openSearchResultInCategory("housing", "uca");
        if(view !== "category") throw new Error("category action did not switch to category view");
        if(currentCategory !== "housing") throw new Error("search result did not set category");
        if(expandedSearchResourceId !== "uca") throw new Error("search result did not mark resource for expansion");
        if(getSelectedCategoryFilters("housing").length) throw new Error("category filters were not cleared");
      }finally{
        data = previousData;
        view = previousView;
        currentCategory = previousCategory;
        expandedSearchResourceId = previousExpanded;
        selectedCategoryFilters = previousFilters;
        isSearchOpen = previousSearchOpen;
        searchQuery = previousSearchQuery;
        searchResults = previousSearchResults;
        searchDetailResourceId = previousSearchDetail;
        searchResultReturnResourceId = previousReturnResource;
      }
    }
  });

  tests.push({
    name: "CATEGORY FILTER BUTTON GROUPS RENDER",
    fn: () => {
      const previousData = data;
      const previousView = view;
      const previousCategory = currentCategory;
      const previousFilters = selectedCategoryFilters;
      try{
        data = {
          categories:[{ id:"employment", label:"Employment", filters:["Career Training", "Unused Filter"] }],
          forGroups:["Veterans", "Unused Group"],
          resources:[
            { id:"training", name:"Training Resource", categories:["employment"], categoryFilters:{ employment:["Career Training"] }, forGroups:[], informationText:"" },
            { id:"vets", name:"Veterans Resource", categories:["employment"], categoryFilters:{}, forGroups:["Veterans"], informationText:"" }
          ],
          changes:[]
        };
        view = "category";
        currentCategory = "employment";
        selectedCategoryFilters = {};
        render();
        const text = appView.textContent || "";
        if(!text.includes("Type")) throw new Error("Type heading was not rendered");
        if(!text.includes("For")) throw new Error("For heading was not rendered");
        const buttons = Array.from(appView.querySelectorAll("button")).map(button => button.textContent);
        if(!buttons.includes("Career Training")) throw new Error("category filter button was missing");
        if(!buttons.includes("Veterans")) throw new Error("For group button was missing");
        if(buttons.includes("Unused Filter")) throw new Error("unused category filter button should not render");
        if(buttons.includes("Unused Group")) throw new Error("unused For group button should not render");
        if(buttons.some(label => label === "For: Veterans")) throw new Error("For button label should not include prefix");
        if(/\bresult(s)?\b/.test(text)) throw new Error("category filter area should not show result counts");
      }finally{
        data = previousData;
        view = previousView;
        currentCategory = previousCategory;
        selectedCategoryFilters = previousFilters;
      }
    }
  });

  tests.push({
    name: "LANDING SEARCH AND CARD INTERACTION CUES",
    fn: () => {
      const previousData = data;
      const previousView = view;
      const previousCategory = currentCategory;
      const previousSearchQuery = searchQuery;
      const previousSearchResults = searchResults;
      const previousDismissedTipIds = new Set(dismissedTipIds);
      try{
        data = {
          categories:[{ id:"food", label:"Food" }],
          forGroups:[],
          resources:[{
            id:"pantry",
            name:"Community Pantry",
            description:"Food assistance",
            categories:["food"],
            categoryFilters:{},
            forGroups:[],
            informationText:"Pantry details"
          }],
          changes:[]
        };

        view = "categories";
        currentCategory = null;
        dismissedTipIds.delete(getCategoryTipId());
        render();
        const landingInput = appView.querySelector(".landing-search-input");
        const landingButton = appView.querySelector(".landing-search .button.primary");
        const categoryButton = appView.querySelector(".category-card-open");
        const categoryTip = appView.querySelector(".red-tip");
        const categoryReminder = appView.querySelector(".category-reminder");
        const landingSearch = appView.querySelector(".landing-search");
        if(!landingInput || !landingButton) throw new Error("landing search controls were not rendered");
        if(appView.querySelector(".landing-search-title")) throw new Error("landing search title should not be rendered");
        if((appView.textContent || "").includes("Browse by category")) throw new Error("removed category heading was rendered");
        if(document.getElementById("tabSearch")) throw new Error("top-bar search icon should not be rendered");
        if(!categoryButton || categoryButton.getAttribute("aria-label") !== "View Food resources"){
          throw new Error("category card did not expose its navigation cue");
        }
        if(categoryButton.querySelector(".category-card-chevron") || categoryButton.textContent.includes("›")){
          throw new Error("category card rendered a disclosure chevron");
        }
        const landingChildren = Array.from(appView.children);
        if(!categoryTip || !categoryReminder || !landingSearch
          || landingChildren.indexOf(categoryTip) >= landingChildren.indexOf(categoryReminder)
          || landingChildren.indexOf(categoryReminder) >= landingChildren.indexOf(landingSearch)){
          throw new Error("bug-report reminder was not between the category tip and search field");
        }

        landingInput.value = "pantry";
        landingButton.click();
        if(view !== "search-results" || searchQuery !== "pantry"){
          throw new Error("landing search did not open search results");
        }

        view = "category";
        currentCategory = "food";
        render();
        const expandButton = appView.querySelector(".resource-expand-toggle");
        if(!expandButton || expandButton.getAttribute("aria-expanded") !== "false"){
          throw new Error("resource expansion cue was not rendered collapsed");
        }
        expandButton.click();
        if(expandButton.getAttribute("aria-expanded") !== "true"){
          throw new Error("resource expansion cue did not update");
        }
      }finally{
        data = previousData;
        view = previousView;
        currentCategory = previousCategory;
        searchQuery = previousSearchQuery;
        searchResults = previousSearchResults;
        dismissedTipIds.clear();
        previousDismissedTipIds.forEach(tipId => dismissedTipIds.add(tipId));
      }
    }
  });

  tests.push({
    name: "DERIVED LISTS CATEGORY",
    fn: () => {
      const previousData = data;
      const previousView = view;
      const previousCategory = currentCategory;
      const previousFilters = selectedCategoryFilters;
      try{
        data = {
          categories:[{ id:"food", label:"Food" }],
          forGroups:[],
          resources:[
            { id:"list", name:"Food Pantry List", categories:["food"], phone:"", website:"", hours:"", address:"123 Main", informationText:"Apply at https://example.org/pantry.\n* Updates: www.example.org/news" },
            { id:"blank", name:"", categories:[], phone:"", website:"", hours:"", informationText:"" },
            { id:"unnamed-info", name:"", categories:["food"], phone:"", website:"", hours:"", informationText:"Information that needs an Admin name" },
            { id:"phone", name:"Food Pantry Phone", categories:["food"], phone:"555-1212", website:"", hours:"", informationText:"" },
            { id:"site", name:"Food Pantry Site", categories:["food"], phone:"", website:"https://example.org", hours:"", informationText:"" },
            { id:"hours", name:"Food Pantry Hours", categories:["food"], phone:"", website:"", hours:"9-5", informationText:"" }
          ],
          changes:[]
        };
        if(!resourceMatchesListsHeuristic(data.resources[0])) throw new Error("address should not disqualify list resource");
        if(resourceMatchesListsHeuristic(data.resources[1]) || resourceMatchesListsHeuristic(data.resources[2])){
          throw new Error("unnamed resources should not qualify for the public Lists category");
        }
        if(getListsResources().map(resource => resource.id).join(",") !== "list"){
          throw new Error("Lists heuristic returned wrong resources");
        }

        view = "categories";
        currentCategory = null;
        render();
        const categoryButtons = Array.from(appView.querySelectorAll(".category-card strong")).map(node => node.textContent);
        if(!categoryButtons.includes("Lists")) throw new Error("Lists card was not rendered");

        view = "category";
        currentCategory = LISTS_CATEGORY_ID;
        selectedCategoryFilters = {};
        render();
        const text = appView.textContent || "";
        if(!text.includes("Lists")) throw new Error("Lists category title was not rendered");
        if(!text.includes("Food Pantry List")) throw new Error("Lists category did not show list resource");
        if(text.includes("Food Pantry Phone") || text.includes("Food Pantry Site") || text.includes("Food Pantry Hours")){
          throw new Error("Lists category included non-list resource");
        }
        if(appView.querySelectorAll(".resource-card").length !== 1){
          throw new Error("Lists category rendered an empty card for an unnamed resource");
        }
        const links = Array.from(appView.querySelectorAll(".resource-info-rendered a"));
        if(links.length !== 2
          || links[0].getAttribute("href") !== "https://example.org/pantry"
          || links[0].textContent !== "https://example.org/pantry"
          || links[1].getAttribute("href") !== "https://www.example.org/news"){
          throw new Error("URLs in the generated Lists category were not rendered as safe links");
        }
        if(links.some(link => link.getAttribute("target") !== "_blank" || link.getAttribute("rel") !== "noopener noreferrer")){
          throw new Error("Resource Information links were missing safe new-window attributes");
        }

        const results = buildSearchResults("lists");
        if(results.mode !== "results") throw new Error("Lists search should return results");
        const listResult = results.items.find(item => item.resourceId === "list");
        if(!listResult || !listResult.categories.some(category => category.id === LISTS_CATEGORY_ID)){
          throw new Error("Lists search returned wrong resources");
        }
      }finally{
        data = previousData;
        view = previousView;
        currentCategory = previousCategory;
        selectedCategoryFilters = previousFilters;
      }
    }
  });

  tests.push({
    name: "CATEGORY FILTERS AND FOR GROUPS ARE RESOURCE OWNED",
    fn: () => {
      const previousData = data;
      try{
        data = {
          categories:[
            { id:"employment", label:"Employment", filters:["Career Training"] },
            { id:"education", label:"Education", filters:["GED"] }
          ],
          forGroups:["Veterans"],
          resources:[
            { id:"shared", name:"Shared Training", categories:["employment","education"], categoryFilters:{ employment:["Career Training"] }, forGroups:["Veterans"] },
            { id:"ged", name:"GED", categories:["education"], categoryFilters:{ education:["GED"] }, forGroups:[] }
          ]
        };
        const employmentOptions = getCategoryFilterOptions("employment").map(option => option.label);
        const educationOptions = getCategoryFilterOptions("education").map(option => option.label);
        if(!employmentOptions.includes("Career Training") || !employmentOptions.includes("Veterans")){
          throw new Error("employment category did not include category and For filters");
        }
        if(!educationOptions.includes("GED") || !educationOptions.includes("Veterans")){
          throw new Error("education category did not include category and For filters");
        }
        const matching = filterResourcesBySelectedCategoryFilters(getCategoryResources("education"), "education", [
          makeForGroupFilterKey("Veterans"),
          makeCategorySpecificFilterKey("GED")
        ]).map(r => r.id);
        if(!matching.includes("shared") || !matching.includes("ged")){
          throw new Error("OR category filtering missed expected education resources");
        }
      }finally{
        data = previousData;
      }
    }
  });

  tests.push({
    name: "VERIFIED DATE VALIDATION",
    fn: () => {
      data.resources.forEach(resource => {
        const value = resource.verifiedOn;
        if(value != null && !isValidMMYY(value)){
          throw new Error(`invalid verifiedOn '${value}' on resource '${resource.id}'`);
        }
      });
    }
  });

  tests.push({
    name: "RESOURCE SORTING",
    fn: () => {
      const sorted = data.resources.slice().sort((a, b) => {
        const aMonth = parseMMYYToMonthIndex(a.verifiedOn);
        const bMonth = parseMMYYToMonthIndex(b.verifiedOn);
        const aVerified = aMonth !== null;
        const bVerified = bMonth !== null;
        if(aVerified !== bVerified) return aVerified ? -1 : 1;
        if(aVerified && bVerified && aMonth !== bMonth) return aMonth - bMonth;
        return compareResourcesByName(a, b);
      });
      for(let i = 1; i < sorted.length; i += 1){
        const prev = sorted[i - 1];
        const curr = sorted[i];
        const prevMonth = parseMMYYToMonthIndex(prev.verifiedOn);
        const currMonth = parseMMYYToMonthIndex(curr.verifiedOn);
        if(prevMonth === null && currMonth !== null){
          throw new Error("unverified resource appears before verified resource");
        }
      }
    }
  });

  tests.push({
    name: "INFORMATION RENDERER",
    fn: () => {
      const html = renderInformationHTML("One\n\n* bullet\n---\n**bold**");
      if(typeof html !== "string" || !html.length) throw new Error("renderer returned empty output");
      const host = document.createElement("div");
      try{
        host.className = "information-rendered";
        host.innerHTML = html;
        document.body.appendChild(host);
        const ul = host.querySelector("ul");
        if(!ul) throw new Error("renderer did not create a list");
        const style = getComputedStyle(ul);
        if(style.marginLeft !== "0px") throw new Error(`list margin should be flush, got ${style.marginLeft}`);
      }finally{
        host.remove();
      }
    }
  });

  tests.push({
    name: "INFORMATION TEXT PRESERVATION",
    fn: () => {
      const resource = { informationText:"**bold**\n* bullet\n---" };
      normalizeResourceInformation(resource);
      if(resource.informationText !== "**bold**\n* bullet\n---"){
        throw new Error("informationText was not preserved");
      }
    }
  });

  tests.push({
    name: "INFORMATION TEXTAREA AUTO FIT",
    fn: () => {
      const textarea = document.createElement("textarea");
      try{
        textarea.className = "big resource-info-input";
        textarea.style.width = "240px";
        textarea.value = Array(12).fill("Line of resource information").join("\n");
        document.body.appendChild(textarea);
        fitTextareaToText(textarea);
        if(textarea.clientHeight < textarea.scrollHeight){
          throw new Error("textarea did not expand to fit content");
        }
      }finally{
        textarea.remove();
      }
    }
  });

  tests.push({
    name: "MISSING INFORMATION TEXT IS CANONICAL",
    fn: () => {
      const resource = {};
      normalizeResourceInformation(resource);
      if(resource.informationText !== ""){
        throw new Error("missing informationText was not normalized to empty string");
      }
    }
  });

  tests.push({
    name: "LEGACY VERIFIED DATE MIGRATION",
    fn: () => {
      const resource = { reviewedOn:"03/25", verifiedDate:"2025-02-14" };
      normalizeResourceVerifiedOn(resource);
      if(resource.verifiedOn !== "03/25"){
        throw new Error(`expected 03/25 from reviewedOn, got '${resource.verifiedOn}'`);
      }
      if("reviewedOn" in resource){
        throw new Error("legacy reviewedOn key was not removed after migration");
      }
      if("verifiedDate" in resource){
        throw new Error("legacy verifiedDate key was not removed after migration");
      }
      const legacyDateResource = { verifiedOn:null, verifiedDate:"2025-02-14" };
      normalizeResourceVerifiedOn(legacyDateResource);
      if(legacyDateResource.verifiedOn !== "02/25"){
        throw new Error(`expected 02/25 from verifiedDate, got '${legacyDateResource.verifiedOn}'`);
      }
      const canonicalResource = { verifiedOn:"04/25", reviewedOn:"03/25" };
      normalizeResourceVerifiedOn(canonicalResource);
      if(canonicalResource.verifiedOn !== "04/25"){
        throw new Error(`expected canonical verifiedOn to win, got '${canonicalResource.verifiedOn}'`);
      }
    }
  });

  const panel = document.getElementById("selfTestPanel");
  const resultsEl = document.getElementById("selfTestResults");
  if(resultsEl){
    resultsEl.innerHTML = "";
    resultsEl.dataset.selfTestsComplete = "false";
    delete resultsEl.dataset.selfTestCount;
  }

  const results = [];
  for(const test of tests){
    try{
      await test.fn();
      results.push({ ok:true, name:test.name, message:"" });
    }catch(err){
      results.push({ ok:false, name:test.name, message:(err && err.message) ? err.message : String(err) });
    }
  }

  if(panel && resultsEl){
    results.forEach(result => {
      const row = document.createElement("div");
      row.textContent = result.ok
        ? `✔ PASS ${result.name}`
        : `✖ FAIL ${result.name}: ${result.message}`;
      resultsEl.appendChild(row);
    });
    resultsEl.dataset.selfTestCount = String(results.length);
    resultsEl.dataset.selfTestsComplete = "true";
    panel.style.display = "block";
  }

  return results;
}

const selfTestCloseBtn = document.getElementById("selfTestClose");
if(selfTestCloseBtn){
  selfTestCloseBtn.onclick = () => {
    const panel = document.getElementById("selfTestPanel");
    if(panel) panel.style.display = "none";
  };
}


window.addEventListener("keydown", (e) => {
  const isSelfTestShortcut = e.ctrlKey && e.shiftKey && (e.key === "T" || e.key === "t");
  if(!isSelfTestShortcut) return;
  e.preventDefault();
  e.stopPropagation();
  safeCall("runSelfTests", () => runSelfTests());
}, true);

if(new URLSearchParams(location.search).get("self-tests") === "1"){
  setTimeout(() => safeCall("runSelfTests", () => runSelfTests()), 0);
}
