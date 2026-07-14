// ============================================================
// SELF TESTS
// ============================================================
// In-browser smoke tests for high-risk flows (create/delete/undo/For groups/
// information/import/export/sorting). Run with Ctrl+Shift+T while the page is
// open; use ?debug when you also want invariant checks before/after rendering.
// Tests temporarily replace global state and then restore it, so each test must
// save every global it mutates in a finally block.

function runSelfTests(){
  const tests = [];

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
        if(STARTUP_STATE_STORAGE_KEYS.includes(TSO_NAME_STORAGE_KEY)){
          throw new Error("startup reset should not clear the scoped TSO name");
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
      const previousSessionValue = sessionStorage.getItem("newSelfTestSessionValue");
      try{
        STARTUP_STATE_STORAGE_KEYS.forEach(key => localStorage.setItem(key, "stale"));
        localStorage.setItem(TSO_NAME_STORAGE_KEY, "Keep Name");
        localStorage.setItem(DATA_STORAGE_KEY, JSON.stringify({ resources:[{ id:"keep-resource" }] }));
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
      try{
        localStorage.setItem(DATA_STORAGE_KEY, JSON.stringify({ resources:[{ id:"stale-resource" }] }));
        localStorage.setItem(TSO_NAME_STORAGE_KEY, "Stale TSO");
        runStartupStateReset("new.html");
        if(localStorage.getItem(DATA_STORAGE_KEY) !== null){
          throw new Error("new.html startup should clear stale saved resources");
        }
        if(localStorage.getItem(TSO_NAME_STORAGE_KEY) !== null){
          throw new Error("new.html startup should clear stale TSO name");
        }
      }finally{
        if(previousDataValue === null) localStorage.removeItem(DATA_STORAGE_KEY);
        else localStorage.setItem(DATA_STORAGE_KEY, previousDataValue);
        if(previousTsoNameValue === null) localStorage.removeItem(TSO_NAME_STORAGE_KEY);
        else localStorage.setItem(TSO_NAME_STORAGE_KEY, previousTsoNameValue);
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
          changes: [" Added one ", "", "Added two"]
        }
      };
      normalizeLastLoadedPackageInfo(sample);
      if(!sample.lastLoadedPackageInfo) throw new Error("package info missing after normalize");
      if(sample.lastLoadedPackageInfo.packageVersion !== "Unknown") throw new Error("package version fallback failed");
      if(sample.lastLoadedPackageInfo.changes.length !== 2) throw new Error("package changes were not normalized");
      if(!Date.parse(sample.lastLoadedPackageInfo.loadedAt)) throw new Error("loadedAt was not normalized");
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
        packageVersion: 2,
        loadedAt: "2026-02-01T00:00:00.000Z",
        changes: ["two"]
      };
      normalizeLastLoadedPackageInfo(sample);
      if(sample.lastLoadedPackageInfo.packageVersion !== 2) throw new Error("package info did not replace");
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
    fn: () => {
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
        ["Save Resource Package", "Change TSO Name", "Help"].forEach(label => {
          if(!packageLabels.includes(label)) throw new Error(`${label} was not in the package bar`);
        });
        const modeLabels = Array.from(modeBar.querySelectorAll("button")).map(button => button.textContent.trim());
        ["Categories", "Resources", "For"].forEach(label => {
          if(!modeLabels.includes(label)) throw new Error(`${label} was not in the mode bar`);
        });
      }finally{
        data = previousData;
        view = previousView;
        adminTab = previousAdminTab;
        renderAdmin();
      }
    }
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
        if(!/App Changes — Last 14 Days:/.test(appView.textContent || "")){
          throw new Error("app change log heading was missing");
        }
        if(!APP_CHANGE_LOG.length || !appView.textContent.includes(APP_CHANGE_LOG[0].message)){
          throw new Error("app change log entries were missing");
        }
        if(!/No resource package updates loaded\./.test(appView.textContent || "")){
          throw new Error("missing no-package-loaded message");
        }
        data.lastLoadedPackageInfo = {
          packageVersion: 1,
          loadedAt: nowISO(),
          changes: ["Career Education - Formatted the services"]
        };
        render();
        if(!/Resource Package 1:/.test(appView.textContent || "")){
          throw new Error("missing package version heading");
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
    name: "CHANGE TSO NAME BUTTON IS TEMPLATE ONLY",
    fn: () => {
      if(!shouldShowChangeTsoNameButton(true)){
        throw new Error("new template should show Change TSO Name");
      }
      if(shouldShowChangeTsoNameButton(false)){
        throw new Error("renamed file should hide Change TSO Name");
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
        deleteCategory();
        const modal = document.getElementById("categoryDeletePrompt");
        if(!modal) throw new Error("category delete prompt did not render for index 0");
        const confirmBtn = document.getElementById("categoryDeleteConfirmBtn");
        if(!confirmBtn) throw new Error("category delete confirm button missing");
        confirmBtn.click();
        if(data.categories.some(category => category.id === "veterans-services")){
          throw new Error("index 0 category was not deleted");
        }
        if(data.resources[0].categories.includes("veterans-services")){
          throw new Error("deleted category remained on resource");
        }
        if(data.resources[0].categoryFilters["veterans-services"]){
          throw new Error("deleted category filters remained on resource");
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
        if(data.categories.some(category => category.id === "vxx")){
          throw new Error("last sorted category was not deleted");
        }
        if(data.resources[0].categories.includes("vxx")){
          throw new Error("deleted last sorted category remained on resource");
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
        if(data.categories.some(category => category.id === "vxx")){
          throw new Error("selected row category was not deleted when index was stale");
        }
        if(!data.categories.some(category => category.id === "alpha")){
          throw new Error("stale index category was deleted instead");
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
        selectors[0].checked = true;
        selectors[1].checked = true;
        const deleteBtn = document.getElementById("cat_filter_delete_btn");
        if(!deleteBtn) throw new Error("delete filter button was not rendered");
        deleteBtn.click();
        const remaining = Array.from(document.querySelectorAll(".catFilterInput")).map(input => input.value);
        if(remaining.length !== 1 || remaining[0] !== "SNAP"){
          throw new Error("checked category filters were not deleted");
        }
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
      try{
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
        const actionBar = document.getElementById("admin_editor_actions");
        const cancelBtn = document.getElementById("res_cancel_btn");
        const doneBtn = document.getElementById("res_done_btn");
        if(!actionBar || actionBar.hidden) throw new Error("new resource should show editor actions");
        if(!cancelBtn || cancelBtn.disabled) throw new Error("new resource Cancel should be enabled before valid");
        if(!doneBtn || !doneBtn.disabled) throw new Error("new resource Done should be disabled before valid");
        cancelBtn.click();
        if(data.resources.length !== 0) throw new Error("Cancel did not discard blank new resource");
      }finally{
        data = previousData;
        adminTab = previousAdminTab;
        editing = previousEditing;
        editorSnapshot = previousEditorSnapshot;
        adminResourceEditMode = previousAdminResourceEditMode;
        selectedResourceId = previousSelectedResourceId;
        newResourceIds = previousNewResourceIds;
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
    fn: () => {
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
    }
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
    fn: () => {
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
    }
  });

  tests.push({
    name: "NEW ADMIN SETUP BUTTON POINTS TO TSO NAME",
    fn: () => {
      const previousData = data;
      const previousView = view;
      const previousAdminVisible = isAdminVisible;
      const previousTsoName = localStorage.getItem(TSO_NAME_STORAGE_KEY);
      const previousPendingTraining = localStorage.getItem(NEW_ADMIN_TRAINING_PENDING_KEY);
      try{
        data = { categories:[{ id:"food", label:"Food" }], resources:[], changes:[] };
        view = "admin";
        isAdminVisible = true;
        localStorage.removeItem(TSO_NAME_STORAGE_KEY);
        localStorage.removeItem(NEW_ADMIN_TRAINING_PENDING_KEY);
        closeReferenceModal();
        render();
        const toolbarButtons = Array.from(document.querySelectorAll("#adminView .admin-toolbar-reference-actions button"));
        const setupButton = toolbarButtons.find(button => button.textContent.trim() === "Change TSO Name");
        if(!setupButton){
          throw new Error("new template should show Change TSO Name");
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
      }
    }
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
    fn: () => {
      const previousData = data;
      const previousView = view;
      const previousAdminTab = adminTab;
      const previousAdminVisible = isAdminVisible;
      const previousTsoName = localStorage.getItem(TSO_NAME_STORAGE_KEY);
      const previousPendingTraining = localStorage.getItem(NEW_ADMIN_TRAINING_PENDING_KEY);
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
        const saveBtn = document.getElementById("adminSetupSaveName");
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
        if(!modal || !(modal.textContent || "").includes("After the blue bar looks right, click Close.")){
          throw new Error("setup modal should tell admin to click Close after the blue bar looks right");
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
      }
    }
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
    name: "CATEGORY PRINT INSTRUCTION BANNER",
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
        if(!emptyBanner) throw new Error("category print instruction banner was not rendered");
        if(emptyBanner.textContent !== "Click ⬜ next to a resource to select it for printing."){
          throw new Error(`unexpected empty banner '${emptyBanner.textContent}'`);
        }

        printSelection = ["pantry"];
        render();
        const selectedBanner = appView.querySelector(".category-print-banner");
        if(!selectedBanner) throw new Error("category print instruction banner disappeared after selection");
        if(selectedBanner.textContent !== "Click 🖨️ (1) in the top bar to review and print selected resources."){
          throw new Error(`unexpected selected banner '${selectedBanner.textContent}'`);
        }
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
        categories:[{ id:"food", label:"Food", filters:["Pantries"] }],
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
        if(instruction.textContent !== "Click ⬜ next to a resource to include it in the printed handout."){
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
    name: "ADMIN FOR GROUP DELETE BULK UPDATE",
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
        if(adult.forGroups.includes("GED") || career.forGroups.some(group => group.toLowerCase() === "ged")){
          throw new Error("deleted For group remained on a matching resource");
        }
        if(!adult.forGroups.includes("List")) throw new Error("unrelated For group was removed");
        if(!food.forGroups.includes("Food")) throw new Error("non-matching resource was changed");
        if(adult.lastModified === "2026-01-01T00:00:00.000Z" || career.lastModified === "2026-01-01T00:00:00.000Z"){
          throw new Error("matching resources were not timestamped");
        }
        if(food.lastModified !== "2026-01-01T00:00:00.000Z"){
          throw new Error("non-matching resource timestamp changed");
        }
        if(data.changes.length !== 2) throw new Error("For group delete should create one change entry per changed resource");
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
        deleteBtn = document.getElementById("forGroupDeleteBtn");
        const womenInput = Array.from(document.querySelectorAll(".forGroupInput")).find(input => input.value === "Women");
        if(!womenInput) throw new Error("saved For group was not rendered for deletion");
        const row = womenInput.closest(".for-group-row");
        row.click();
        if(!row.classList.contains("selected")) throw new Error("clicking a For group row should select it");
        deleteBtn.click();
        doneBtn = document.getElementById("forGroupDoneBtn");
        if(!doneBtn) throw new Error("For editor Done should show after Delete");
        doneBtn.click();
        if(data.forGroups.includes("Women")) throw new Error("Delete plus Done did not remove For group");
      }finally{
        data = previousData;
        adminTab = previousAdminTab;
        editing = previousEditing;
        editorSnapshot = previousEditorSnapshot;
        if(previousStoredData === null) localStorage.removeItem(DATA_STORAGE_KEY);
        else localStorage.setItem(DATA_STORAGE_KEY, previousStoredData);
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
    name: "SEARCH NAME MATCH GROUPING",
    fn: () => {
      const previousData = data;
      try{
        data = {
          categories:[
            { id:"employment", label:"Employment" },
            { id:"health", label:"Health Care" }
          ],
          resources:[
            { id:"bio", name:"BioLife Plasma", categories:["employment","employment","health"], informationText:"" },
            { id:"talecris", name:"Talecris Plasma", categories:["employment"], informationText:"" }
          ]
        };
        const results = buildSearchResults("plasma");
        if(results.mode !== "results") throw new Error(`expected results mode, got ${results.mode}`);
        const employment = results.groups.find(group => group.categoryId === "employment");
        const health = results.groups.find(group => group.categoryId === "health");
        if(!employment || !health) throw new Error("expected category groups were missing");
        if(employment.items.length !== 2) throw new Error("employment group did not include both resources");
        if(health.items.length !== 1 || health.items[0].resourceId !== "bio") throw new Error("health group was incorrect");
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
        if(rentResults.groups[0].items.length !== 1 || rentResults.groups[0].items[0].resourceId !== "uca"){
          throw new Error("rent should match rental without matching parent");
        }
        const emergencyResults = buildSearchResults("emergency");
        if(emergencyResults.mode !== "results") throw new Error(`expected results mode, got ${emergencyResults.mode}`);
        if(emergencyResults.groups[0].items[0].resourceId !== "uca") throw new Error("information result resource was incorrect");
        if(!emergencyResults.groups[0].items[0].snippet) throw new Error("information result snippet was missing");

        data.resources.push({ id:"emergency-name", name:"Emergency Center", categories:["housing"], categoryFilters:{}, forGroups:[], informationText:"" });
        const nameResults = buildSearchResults("emergency");
        if(nameResults.mode !== "results") throw new Error("unified search did not return results mode");
        if(nameResults.groups[0].items.map(item => item.resourceId).join(",") !== "emergency-name,uca"){
          throw new Error("name match was not ranked ahead of the retained information match");
        }
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
            { id:"room", name:"Room Resource", categories:["housing"], categoryFilters:{ housing:["Shared Rooms"] }, forGroups:[], informationText:"" }
          ]
        };
        const categoryResults = buildSearchResults("housing");
        if(categoryResults.mode !== "results") throw new Error(`expected results mode, got ${categoryResults.mode}`);
        const housing = categoryResults.groups.find(group => group.categoryId === "housing");
        if(!housing || housing.items.length !== 3) throw new Error("category search did not include housing resources");

        const filterResults = buildSearchResults("career training");
        if(filterResults.mode !== "results") throw new Error("category filter search should return results");
        if(filterResults.groups[0].items[0].resourceId !== "training") throw new Error("category filter search returned wrong resource");
        if(!/Type: Career Training/.test(filterResults.groups[0].items[0].snippet)){
          throw new Error("category filter search snippet was missing");
        }

        const forResults = buildSearchResults("seniors");
        if(forResults.mode !== "results") throw new Error("For group search should return results");
        if(forResults.groups[0].items[0].resourceId !== "senior") throw new Error("For group search returned wrong resource");
        if(!/For: Seniors/.test(forResults.groups[0].items[0].snippet)){
          throw new Error("For group search snippet was missing");
        }
        const veteranResults = buildSearchResults("veterans");
        if(veteranResults.mode !== "results") throw new Error("Veterans For group search should return results");
        const veteranCategories = veteranResults.groups.map(group => group.categoryId).sort();
        if(veteranCategories.join(",") !== "employment,housing"){
          throw new Error("For group search did not include each resource category");
        }
        const forOnlyResults = buildSearchResults("shared rooms");
        if(forOnlyResults.mode !== "results") throw new Error("second category filter search should return results");
        if(forOnlyResults.groups.length !== 1 || forOnlyResults.groups[0].categoryId !== "housing" || forOnlyResults.groups[0].items[0].resourceId !== "room"){
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
          const item = results.groups[0] && results.groups[0].items[0];
          if(!item || item.resourceId !== "complete") throw new Error(`${expectedLabel} was not searchable`);
          if(!item.snippet.startsWith(`${expectedLabel}:`)) throw new Error(`${expectedLabel} match reason was missing`);
        });

        const crossField = buildSearchResults("support veterans housing");
        const crossFieldItem = crossField.groups[0] && crossField.groups[0].items[0];
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
      try{
        data = {
          categories:[{ id:"housing", label:"Housing" }],
          resources:[{ id:"uca", name:"Utah Community Action", categories:["housing"], categoryFilters:{}, forGroups:[], informationText:"" }]
        };
        selectedCategoryFilters = { housing:["Shelter"] };
        openSearchResult("housing", "uca");
        if(view !== "category") throw new Error("search result did not switch to category view");
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
        render();
        const landingInput = appView.querySelector(".landing-search-input");
        const landingButton = appView.querySelector(".landing-search .button.primary");
        const categoryButton = appView.querySelector(".category-card-open");
        if(!landingInput || !landingButton) throw new Error("landing search controls were not rendered");
        if(appView.querySelector(".landing-search-title")) throw new Error("landing search title should not be rendered");
        if((appView.textContent || "").includes("Browse by category")) throw new Error("removed category heading was rendered");
        if(document.getElementById("tabSearch")) throw new Error("top-bar search icon should not be rendered");
        if(!categoryButton || categoryButton.getAttribute("aria-label") !== "View Food resources"){
          throw new Error("category card did not expose its navigation cue");
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
            { id:"list", name:"Food Pantry List", categories:["food"], phone:"", website:"", hours:"", address:"123 Main", informationText:"" },
            { id:"phone", name:"Food Pantry Phone", categories:["food"], phone:"555-1212", website:"", hours:"", informationText:"" },
            { id:"site", name:"Food Pantry Site", categories:["food"], phone:"", website:"https://example.org", hours:"", informationText:"" },
            { id:"hours", name:"Food Pantry Hours", categories:["food"], phone:"", website:"", hours:"9-5", informationText:"" }
          ],
          changes:[]
        };
        if(!resourceMatchesListsHeuristic(data.resources[0])) throw new Error("address should not disqualify list resource");
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

        const results = buildSearchResults("lists");
        if(results.mode !== "results") throw new Error("Lists search should return results");
        const listsGroup = results.groups.find(group => group.categoryId === LISTS_CATEGORY_ID);
        if(!listsGroup || listsGroup.items[0].resourceId !== "list") throw new Error("Lists search returned wrong resources");
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

  const results = tests.map(test => {
    try{
      test.fn();
      return { ok:true, name:test.name, message:"" };
    }catch(err){
      return { ok:false, name:test.name, message:(err && err.message) ? err.message : String(err) };
    }
  });

  const panel = document.getElementById("selfTestPanel");
  const resultsEl = document.getElementById("selfTestResults");
  if(panel && resultsEl){
    resultsEl.innerHTML = "";
    results.forEach(result => {
      const row = document.createElement("div");
      row.textContent = result.ok
        ? `✔ PASS ${result.name}`
        : `✖ FAIL ${result.name}: ${result.message}`;
      resultsEl.appendChild(row);
    });
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
