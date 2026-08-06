// ============================================================
// RESOURCE PACKAGE MIGRATION PIPELINE
// ============================================================
// Every external package follows one explicit sequence:
// read -> migrate schema versions -> normalize -> apply tombstones -> validate.
// Keep schema-specific compatibility work in the migration functions below.

const UNVERSIONED_RESOURCE_PACKAGE_SCHEMA_VERSION = 1;
const LEGACY_RESOURCE_PACKAGE_SCHEMA_VERSION = 2;
const RESOURCE_PACKAGE_SCHEMA_VERSION = 3;
const RESOURCE_PACKAGE_PIPELINE_STAGES = Object.freeze([
  "read",
  "migrate",
  "normalize",
  "applyTombstones",
  "validate"
]);

class ResourcePackageError extends Error{
  constructor(message, details = []){
    super(message);
    this.name = "ResourcePackageError";
    this.details = Array.isArray(details) ? details.map(String) : [];
  }
}

function resourcePackageSourceName(options = {}){
  return String(options.sourceName || "Resource package").trim() || "Resource package";
}

function formatResourcePackageError(error){
  const message = error && error.message ? String(error.message) : String(error || "Unknown package error");
  const details = error && Array.isArray(error.details) ? error.details.filter(Boolean) : [];
  return details.length ? `${message}\n\n${details.join("\n")}` : message;
}

function readResourcePackageData(rawData, options = {}){
  const sourceName = resourcePackageSourceName(options);
  if(!rawData || typeof rawData !== "object" || Array.isArray(rawData)){
    throw new ResourcePackageError(`${sourceName} must contain one JSON object.`);
  }
  try{
    return cloneDataObject(rawData);
  }catch(_error){
    throw new ResourcePackageError(`${sourceName} contains data that cannot be read safely.`);
  }
}

function readResourcePackageJSON(jsonText, options = {}){
  const sourceName = resourcePackageSourceName(options);
  let parsed;
  try{
    parsed = JSON.parse(String(jsonText || ""));
  }catch(error){
    throw new ResourcePackageError(
      `${sourceName} contains invalid JSON.`,
      [error && error.message ? error.message : "The JSON could not be parsed."]
    );
  }
  return readResourcePackageData(parsed, options);
}

function getResourcePackageSchemaVersion(packageData, options = {}){
  const sourceName = resourcePackageSourceName(options);
  const declared = packageData && packageData.resourcePackageSchemaVersion;
  if(declared == null || declared === "") return UNVERSIONED_RESOURCE_PACKAGE_SCHEMA_VERSION;
  if(typeof declared !== "number" || !Number.isInteger(declared)){
    throw new ResourcePackageError(
      `${sourceName} has an invalid resource package schema version.`,
      ["resourcePackageSchemaVersion must be a whole number."]
    );
  }
  if(declared < UNVERSIONED_RESOURCE_PACKAGE_SCHEMA_VERSION
    || declared > RESOURCE_PACKAGE_SCHEMA_VERSION){
    throw new ResourcePackageError(
      `${sourceName} uses unsupported resource package schema ${declared}.`,
      [
        `This app supports schemas ${UNVERSIONED_RESOURCE_PACKAGE_SCHEMA_VERSION} through ${RESOURCE_PACKAGE_SCHEMA_VERSION}.`,
        declared > RESOURCE_PACKAGE_SCHEMA_VERSION
          ? "Open this package with a newer TSO Resources app."
          : "Use a package exported by a supported TSO Resources app."
      ]
    );
  }
  return declared;
}

function mergeLegacyTaxonomyValues(currentValue, legacyValue){
  return normalizeTaxonomyLabels([
    ...normalizeTaxonomyLabels(currentValue),
    ...normalizeTaxonomyLabels(legacyValue)
  ]);
}

function isMigratableTaxonomyValue(value){
  if(value == null || typeof value === "string" || typeof value === "number") return true;
  return Array.isArray(value) && value.every(item =>
    typeof item === "string" || typeof item === "number"
  );
}

function requireMigratableTaxonomyValue(value, description){
  if(isMigratableTaxonomyValue(value)) return;
  throw new ResourcePackageError(
    `Legacy resource package data cannot be migrated safely.`,
    [`${description} must be a string or an array of labels.`]
  );
}

function migrateLegacyCategoryTypes(category){
  if(!category || typeof category !== "object") return;
  ["Types", "types"].forEach(key => {
    if(!(key in category)) return;
    requireMigratableTaxonomyValue(category[key], `Category '${category.id || "unknown"}' ${key}`);
    category.filters = mergeLegacyTaxonomyValues(category.filters, category[key]);
    delete category[key];
  });
}

function migrateLegacyResourceTaxonomy(resource){
  if(!resource || typeof resource !== "object") return;
  ["For", "for"].forEach(key => {
    if(!(key in resource)) return;
    requireMigratableTaxonomyValue(resource[key], `Resource '${resource.id || "unknown"}' ${key}`);
    resource.forGroups = mergeLegacyTaxonomyValues(resource.forGroups, resource[key]);
    delete resource[key];
  });

  ["Types", "typesByCategory"].forEach(key => {
    if(!(key in resource)) return;
    const legacy = resource[key];
    if(legacy && typeof legacy === "object" && !Array.isArray(legacy)){
      const current = resource.categoryFilters && typeof resource.categoryFilters === "object"
        && !Array.isArray(resource.categoryFilters)
        ? resource.categoryFilters
        : {};
      Object.keys(legacy).forEach(categoryId => {
        requireMigratableTaxonomyValue(
          legacy[categoryId],
          `Resource '${resource.id || "unknown"}' ${key}.${categoryId}`
        );
        current[categoryId] = mergeLegacyTaxonomyValues(current[categoryId], legacy[categoryId]);
      });
      resource.categoryFilters = current;
    }else if(legacy != null){
      throw new ResourcePackageError(
        "Legacy resource package data cannot be migrated safely.",
        [`Resource '${resource.id || "unknown"}' ${key} must map category IDs to labels.`]
      );
    }
    delete resource[key];
  });
}

function migrateResourcePackageSchema1To2(packageData){
  ["For", "for"].forEach(key => {
    if(!(key in packageData)) return;
    requireMigratableTaxonomyValue(packageData[key], `Top-level ${key}`);
    packageData.forGroups = mergeLegacyTaxonomyValues(packageData.forGroups, packageData[key]);
    delete packageData[key];
  });
  (Array.isArray(packageData.categories) ? packageData.categories : [])
    .forEach(migrateLegacyCategoryTypes);
  (Array.isArray(packageData.resources) ? packageData.resources : [])
    .forEach(migrateLegacyResourceTaxonomy);

  // These are known obsolete schema-1 fields. Unknown fields are deliberately
  // untouched so a round trip does not silently discard safe extension data.
  normalizeLegacyPackageShape(packageData);
  normalizeLegacyTagsShape(packageData);
  packageData.resourcePackageSchemaVersion = LEGACY_RESOURCE_PACKAGE_SCHEMA_VERSION;
  return packageData;
}

function migrateResourcePackageSchema2To3(packageData){
  if(packageData.deletionRequests == null) packageData.deletionRequests = [];
  if(packageData.deletions == null) packageData.deletions = [];
  packageData.resourcePackageSchemaVersion = RESOURCE_PACKAGE_SCHEMA_VERSION;
  return packageData;
}

const RESOURCE_PACKAGE_SCHEMA_MIGRATIONS = new Map([
  [UNVERSIONED_RESOURCE_PACKAGE_SCHEMA_VERSION, {
    toVersion:LEGACY_RESOURCE_PACKAGE_SCHEMA_VERSION,
    migrate:migrateResourcePackageSchema1To2
  }],
  [LEGACY_RESOURCE_PACKAGE_SCHEMA_VERSION, {
    toVersion:RESOURCE_PACKAGE_SCHEMA_VERSION,
    migrate:migrateResourcePackageSchema2To3
  }]
]);

function migrateResourcePackageData(packageData, options = {}){
  const sourceName = resourcePackageSourceName(options);
  const fromVersion = getResourcePackageSchemaVersion(packageData, options);
  let currentVersion = fromVersion;
  const appliedMigrations = [];

  while(currentVersion < RESOURCE_PACKAGE_SCHEMA_VERSION){
    const migration = RESOURCE_PACKAGE_SCHEMA_MIGRATIONS.get(currentVersion);
    if(!migration || typeof migration.migrate !== "function"){
      throw new ResourcePackageError(
        `${sourceName} cannot be migrated safely from schema ${currentVersion}.`
      );
    }
    migration.migrate(packageData);
    appliedMigrations.push(`${currentVersion}->${migration.toVersion}`);
    currentVersion = migration.toVersion;
  }
  packageData.resourcePackageSchemaVersion = RESOURCE_PACKAGE_SCHEMA_VERSION;
  return { data:packageData, fromVersion, appliedMigrations };
}

function collectUnsafePackageShapeErrors(packageData){
  const errors = [];
  if(!Array.isArray(packageData.categories)) errors.push("'categories' must be an array.");
  if(!Array.isArray(packageData.resources)) errors.push("'resources' must be an array.");
  ["categoryMigrations", "appChanges", "changes", "deletionRequests", "deletions"].forEach(key => {
    if(packageData[key] != null && !Array.isArray(packageData[key])){
      errors.push(`'${key}' must be an array when present.`);
    }
  });
  if(packageData.forGroups != null
    && !Array.isArray(packageData.forGroups)
    && typeof packageData.forGroups !== "string"){
    errors.push("'forGroups' must be a string or array when present.");
  }else if(!isMigratableTaxonomyValue(packageData.forGroups)){
    errors.push("'forGroups' contains a value that is not a label.");
  }

  (Array.isArray(packageData.categories) ? packageData.categories : []).forEach((category, index) => {
    if(!category || typeof category !== "object" || Array.isArray(category)){
      errors.push(`Category at index ${index} must be an object.`);
      return;
    }
    if(category.filters != null
      && !Array.isArray(category.filters)
      && typeof category.filters !== "string"){
      errors.push(`Category '${category.id || index}' filters must be a string or array.`);
    }else if(!isMigratableTaxonomyValue(category.filters)){
      errors.push(`Category '${category.id || index}' filters contain a value that is not a label.`);
    }
  });

  (Array.isArray(packageData.resources) ? packageData.resources : []).forEach((resource, index) => {
    if(!resource || typeof resource !== "object" || Array.isArray(resource)){
      errors.push(`Resource at index ${index} must be an object.`);
      return;
    }
    if(resource.categories != null && !Array.isArray(resource.categories)){
      errors.push(`Resource '${resource.id || index}' categories must be an array.`);
    }
    if(resource.forGroups != null
      && !Array.isArray(resource.forGroups)
      && typeof resource.forGroups !== "string"){
      errors.push(`Resource '${resource.id || index}' forGroups must be a string or array.`);
    }else if(!isMigratableTaxonomyValue(resource.forGroups)){
      errors.push(`Resource '${resource.id || index}' forGroups contain a value that is not a label.`);
    }
    if(resource.categoryFilters != null
      && (typeof resource.categoryFilters !== "object" || Array.isArray(resource.categoryFilters))){
      errors.push(`Resource '${resource.id || index}' categoryFilters must be an object.`);
    }else if(resource.categoryFilters){
      Object.keys(resource.categoryFilters).forEach(categoryId => {
        if(!isMigratableTaxonomyValue(resource.categoryFilters[categoryId])){
          errors.push(
            `Resource '${resource.id || index}' categoryFilters.${categoryId} must be a string or array.`
          );
        }
      });
    }
    if(resource.pdfs != null && !Array.isArray(resource.pdfs)){
      errors.push(`Resource '${resource.id || index}' pdfs must be an array.`);
    }else{
      (Array.isArray(resource.pdfs) ? resource.pdfs : []).forEach((pdf, pdfIndex) => {
        if(!pdf || typeof pdf !== "object" || Array.isArray(pdf)){
          errors.push(`Resource '${resource.id || index}' PDF ${pdfIndex} must be an object.`);
        }else if(!String(pdf.path || "").trim()){
          errors.push(`Resource '${resource.id || index}' PDF ${pdfIndex} is missing path.`);
        }
      });
    }
  });

  const migrationSources = new Set();
  (Array.isArray(packageData.categoryMigrations) ? packageData.categoryMigrations : [])
    .forEach((migration, index) => {
      if(!migration || typeof migration !== "object" || Array.isArray(migration)){
        errors.push(`categoryMigrations[${index}] must be an object.`);
        return;
      }
      const fromId = String(migration.fromId || "").trim();
      const toId = String(migration.toId || "").trim();
      const toFilter = String(migration.toFilter || "").trim();
      if(!fromId) errors.push(`categoryMigrations[${index}] is missing fromId.`);
      if(fromId && migrationSources.has(fromId)){
        errors.push(`categoryMigrations contains duplicate fromId '${fromId}'.`);
      }
      if(fromId) migrationSources.add(fromId);
      if(fromId && toId && fromId === toId){
        errors.push(`categoryMigrations '${fromId}' cannot target itself.`);
      }
      if(toFilter && !toId){
        errors.push(`categoryMigrations '${fromId || index}' has toFilter without toId.`);
      }
    });

  (Array.isArray(packageData.changes) ? packageData.changes : []).forEach((change, index) => {
    if(!change || typeof change !== "object" || Array.isArray(change)){
      errors.push(`changes[${index}] must be an object.`);
    }
  });

  [
    ["deletionRequests", "requestedAt"],
    ["deletions", "deletedAt"]
  ].forEach(([key, timeField]) => {
    (Array.isArray(packageData[key]) ? packageData[key] : []).forEach((record, index) => {
      if(!record || typeof record !== "object" || Array.isArray(record)){
        errors.push(`${key}[${index}] must be an object.`);
        return;
      }
      if(!DELETION_KINDS.has(String(record.kind || ""))){
        errors.push(`${key}[${index}] has unsupported kind '${String(record.kind || "")}'.`);
      }else if(!buildDeletionKey(record.kind, record.targetId, record.categoryId, record.label)){
        errors.push(`${key}[${index}] is missing the target needed for '${record.kind}'.`);
      }
      if(record[timeField] != null && !Number.isFinite(Date.parse(String(record[timeField])))){
        errors.push(`${key}[${index}] has invalid ${timeField}.`);
      }
    });
  });

  const packageVersion = packageData.packageVersion;
  if(packageVersion != null){
    const validNumber = typeof packageVersion === "number" && Number.isFinite(packageVersion);
    const validString = typeof packageVersion === "string" && (
      !packageVersion.trim()
      || packageVersion.trim() === "Unknown"
      || normalizePackageVersionValue(packageVersion) !== "Unknown"
    );
    if(!validNumber && !validString){
      errors.push("'packageVersion' must be a number, numeric string, 'Unknown', or blank.");
    }
  }
  return errors;
}

function normalizeResourcePackageData(packageData){
  packageData.resourcePackageSchemaVersion = RESOURCE_PACKAGE_SCHEMA_VERSION;
  normalizeDataInformationShape(packageData);
  normalizeDataPDFShape(packageData);
  normalizeDeletionWorkflowData(packageData);
  normalizeDataForGroupsShape(packageData);
  normalizeDataCategoryFilterShape(packageData);
  normalizeCategoryMigrations(packageData);
  normalizeDataVerifiedOnShape(packageData);
  normalizeChanges(packageData);
  packageData.packageVersion = normalizePackageVersionValue(packageData.packageVersion);
  normalizeLastLoadedPackageInfo(packageData);
  return packageData;
}

function validateResourcePackageData(packageData){
  const errors = [];
  const warnings = [];
  if(!packageData || typeof packageData !== "object" || Array.isArray(packageData)){
    return { ok:false, errors:["Package data must be one object."], warnings:[] };
  }
  if(packageData.resourcePackageSchemaVersion !== RESOURCE_PACKAGE_SCHEMA_VERSION){
    errors.push(`Package was not migrated to schema ${RESOURCE_PACKAGE_SCHEMA_VERSION}.`);
  }
  if(!Array.isArray(packageData.categories)) errors.push("Missing or invalid 'categories' array.");
  if(!Array.isArray(packageData.resources)) errors.push("Missing or invalid 'resources' array.");
  if(!Array.isArray(packageData.forGroups)) errors.push("Invalid normalized 'forGroups' array.");
  if(!Array.isArray(packageData.deletionRequests)) errors.push("Invalid normalized 'deletionRequests' array.");
  if(!Array.isArray(packageData.deletions)) errors.push("Invalid normalized 'deletions' array.");

  const categoryIds = new Set();
  (Array.isArray(packageData.categories) ? packageData.categories : []).forEach((category, index) => {
    const id = String(category && category.id || "").trim();
    if(!id) errors.push(`Category at index ${index} is missing id.`);
    if(!String(category && category.label || "").trim()){
      errors.push(`Category '${id || index}' is missing a label.`);
    }
    if(id && categoryIds.has(id)) errors.push(`Duplicate category id '${id}'.`);
    if(id) categoryIds.add(id);
  });

  const migratedCategoryIds = new Set();
  (Array.isArray(packageData.categoryMigrations) ? packageData.categoryMigrations : [])
    .forEach((migration, index) => {
      const fromId = String(migration && migration.fromId || "").trim();
      const toId = String(migration && migration.toId || "").trim();
      const toFilter = String(migration && migration.toFilter || "").trim();
      if(!fromId) errors.push(`Category migration at index ${index} is missing fromId.`);
      if(fromId && migratedCategoryIds.has(fromId)){
        errors.push(`Duplicate category migration from '${fromId}'.`);
      }
      if(fromId) migratedCategoryIds.add(fromId);
      if(toId && fromId === toId) errors.push(`Category migration '${fromId}' cannot target itself.`);
      if(toId && !categoryIds.has(toId)){
        errors.push(`Category migration '${fromId}' references unknown target '${toId}'.`);
      }
      if(toFilter && !toId) errors.push(`Category migration '${fromId}' has toFilter without toId.`);
    });

  const resourceIds = new Set();
  (Array.isArray(packageData.resources) ? packageData.resources : []).forEach((resource, index) => {
    const id = String(resource && resource.id || "").trim();
    if(!id) errors.push(`Resource at index ${index} is missing id.`);
    if(!String(resource && resource.name || "").trim()){
      warnings.push(`Resource '${id || index}' is missing name.`);
    }
    if(id && resourceIds.has(id)) errors.push(`Duplicate resource id '${id}'.`);
    if(id) resourceIds.add(id);
    (Array.isArray(resource && resource.categories) ? resource.categories : []).forEach(categoryId => {
      if(!categoryIds.has(String(categoryId))){
        warnings.push(`Resource '${id || index}' references unknown category '${categoryId}'.`);
      }
    });
    (Array.isArray(resource && resource.pdfs) ? resource.pdfs : []).forEach((pdf, pdfIndex) => {
      if(!pdf || typeof pdf !== "object"){
        errors.push(`Resource '${id || index}' PDF ${pdfIndex} must be an object.`);
      }else if(!pdf.path){
        errors.push(`Resource '${id || index}' PDF ${pdfIndex} is missing path.`);
      }
    });
  });
  return { ok:errors.length === 0, errors, warnings };
}

function processResourcePackageData(rawData, options = {}){
  const sourceName = resourcePackageSourceName(options);
  const packageData = readResourcePackageData(rawData, options);
  const migration = migrateResourcePackageData(packageData, options);
  const unsafeErrors = collectUnsafePackageShapeErrors(migration.data);
  if(unsafeErrors.length){
    throw new ResourcePackageError(`${sourceName} cannot be migrated safely.`, unsafeErrors);
  }

  normalizeResourcePackageData(migration.data);
  const removedUnnamedCategoryIds = removeUnusedUnnamedCategories(migration.data);
  applyDeletionTombstones(migration.data);
  const report = validateResourcePackageData(migration.data);
  if(!report.ok){
    throw new ResourcePackageError(`${sourceName} is not a valid resource package.`, report.errors);
  }
  return {
    data:migration.data,
    fromVersion:migration.fromVersion,
    appliedMigrations:migration.appliedMigrations,
    removedUnnamedCategoryIds,
    warnings:report.warnings,
    stages:RESOURCE_PACKAGE_PIPELINE_STAGES.slice()
  };
}

function processResourcePackageJSON(jsonText, options = {}){
  return processResourcePackageData(readResourcePackageJSON(jsonText, options), options);
}

// Compatibility wrapper for internal callers that historically expected
// in-place normalization. The wrapper now executes the complete safe pipeline.
function normalizePackageData(nextData){
  const processed = processResourcePackageData(nextData, { sourceName:"Resource package data" });
  if(!nextData || typeof nextData !== "object" || Array.isArray(nextData)) return processed.data;
  Object.keys(nextData).forEach(key => delete nextData[key]);
  Object.assign(nextData, processed.data);
  return nextData;
}

function validateImportData(imported, options = {}){
  try{
    const processed = processResourcePackageData(imported, options);
    return { ok:true, errors:[], warnings:processed.warnings, data:processed.data };
  }catch(error){
    const details = error && Array.isArray(error.details) && error.details.length
      ? error.details
      : [error && error.message ? error.message : String(error)];
    return { ok:false, errors:details, warnings:[] };
  }
}
