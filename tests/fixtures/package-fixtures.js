// Representative resource-package fixtures for migration regression tests.
// These are included only in the debug build.
const PACKAGE_MIGRATION_FIXTURES = Object.freeze({
  unversionedStringForAndTypes: {
    version:2,
    packageVersion:"7",
    customPackageField:{ officeNote:"preserve me" },
    categories:[{
      id:"food",
      label:"Food",
      Types:"Pantry, Meals",
      displayOrder:10,
      customCategoryField:"category extension"
    }],
    For:"Veterans, Women, veterans",
    resources:[{
      id:"legacy-pantry",
      name:"Legacy Pantry",
      categories:["food"],
      For:["Veterans", "Women"],
      Types:{ food:"Pantry" },
      servicesText:"Legacy services",
      pdf:"pdfs/legacy-pantry.pdf",
      tags:["obsolete"],
      customResourceField:{ keep:true }
    }],
    changes:[]
  },
  schema2ArrayForGroups: {
    resourcePackageSchemaVersion:2,
    packageVersion:8,
    customPackageField:{ source:"historical Albuquerque shape" },
    categories:[{
      id:"food",
      label:"Food",
      filters:["Pantry"],
      customCategoryField:"keep"
    }],
    forGroups:["Veterans", "Families"],
    resources:[{
      id:"schema2-resource",
      name:"Schema 2 Resource",
      categories:["food"],
      forGroups:"Veterans, Families",
      categoryFilters:{ food:"Meals, Pantry" },
      informationText:"Current information",
      pdfs:[{
        id:"schema2-pdf",
        name:"Schema 2 PDF",
        path:"pdfs/schema2.pdf",
        checksum:"preserve-pdf-extension"
      }],
      customResourceField:"keep"
    }],
    changes:[]
  },
  schema3DeletionWorkflow: {
    resourcePackageSchemaVersion:3,
    packageVersion:"12",
    categories:[{
      id:"food",
      label:"Food",
      filters:["Pantry", "Meals"]
    }],
    forGroups:["Veterans", "Families"],
    resources:[
      {
        id:"keep",
        name:"Keep",
        categories:["food"],
        forGroups:["Veterans", "Families"],
        categoryFilters:{ food:["Pantry", "Meals"] }
      },
      {
        id:"remove",
        name:"Remove",
        categories:["food"],
        forGroups:[],
        categoryFilters:{ food:[] }
      }
    ],
    changes:[],
    deletionRequests:[
      {
        kind:"resource",
        targetId:"keep",
        label:"Keep",
        requestedAt:"2026-08-01T12:00:00.000Z"
      },
      {
        kind:"resource",
        targetId:"remove",
        label:"Remove",
        requestedAt:"2026-08-01T12:00:00.000Z"
      }
    ],
    deletions:[
      {
        kind:"resource",
        targetId:"remove",
        label:"Remove",
        deletedAt:"2026-08-02T12:00:00.000Z"
      },
      {
        kind:"type",
        categoryId:"food",
        label:"Pantry",
        deletedAt:"2026-08-02T12:00:00.000Z"
      },
      {
        kind:"forGroup",
        label:"Veterans",
        deletedAt:"2026-08-02T12:00:00.000Z"
      }
    ]
  },
  malformedContainers: {
    resourcePackageSchemaVersion:3,
    packageVersion:1,
    categories:{ food:{ id:"food", label:"Food" } },
    resources:[]
  },
  malformedDeletion: {
    resourcePackageSchemaVersion:3,
    packageVersion:1,
    categories:[],
    resources:[],
    deletionRequests:[{ kind:"mystery", label:"Unknown" }],
    deletions:[]
  },
  unsupportedSchema: {
    resourcePackageSchemaVersion:4,
    packageVersion:1,
    categories:[],
    resources:[]
  },
  invalidPackageVersion: {
    resourcePackageSchemaVersion:3,
    packageVersion:"draft seven",
    categories:[],
    resources:[]
  }
});

const MALFORMED_RESOURCE_PACKAGE_JSON = '{"categories":[';
