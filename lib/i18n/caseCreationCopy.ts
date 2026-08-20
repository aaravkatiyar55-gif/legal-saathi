import type { AppLanguage } from "./types";

const english = {
  "limit.title": "Case-folder limit reached",
  "limit.description": "Your Free plan case-folder limit has been reached.",
  "action.viewExisting": "View existing cases",
  "action.deleteOrArchive": "Delete or archive an unused case",
  "action.upgrade": "Upgrade",
  "action.close": "Close",
  "title.create": "Create new case",
  "title.upload": "Upload case document",
  "field.caseName": "Case name *",
  "placeholder.caseName": "e.g. Sharma v. Verma",
  "field.clientName": "Client name",
  "placeholder.optional": "Optional",
  "field.caseType": "Case type",
  "field.description": "Description",
  "placeholder.notes": "Optional notes",
  "caseType.Litigation": "Litigation",
  "caseType.Corporate": "Corporate",
  "caseType.RealEstate": "Real estate",
  "caseType.IntellectualProperty": "Intellectual property",
  "caseType.Other": "Other",
  "action.cancel": "Cancel",
  "action.nextAddFile": "Next: add a file",
  "upload.headline": "Upload document",
  "upload.subtext": "The case folder is saved first. Document processing and AI preparation run separately.",
  "action.back": "Back",
  "action.skipCreateEmpty": "Skip & create empty",
  "action.browseFiles": "Browse files",
  "upload.fileAria": "Choose a case document",
  "upload.warning": "AI analysis is for informational purposes only. Always consult a qualified advocate for legal advice.",
} as const;

export type CaseCreationCopyKey = keyof typeof english;
type CaseCreationCatalog = { readonly [Key in CaseCreationCopyKey]: string };

const hindi: CaseCreationCatalog = {
  "limit.title": "केस-फोल्डर सीमा पूरी हो गई", "limit.description": "आपके Free प्लान की केस-फोल्डर सीमा पूरी हो गई है।", "action.viewExisting": "मौजूदा केस देखें", "action.deleteOrArchive": "अनुपयोगी केस हटाएँ या संग्रहित करें", "action.upgrade": "अपग्रेड करें", "action.close": "बंद करें",
  "title.create": "नया केस बनाएँ", "title.upload": "केस दस्तावेज़ अपलोड करें", "field.caseName": "केस का नाम *", "placeholder.caseName": "उदाहरण: शर्मा बनाम वर्मा", "field.clientName": "क्लाइंट का नाम", "placeholder.optional": "वैकल्पिक", "field.caseType": "केस का प्रकार", "field.description": "विवरण", "placeholder.notes": "वैकल्पिक नोट्स",
  "caseType.Litigation": "मुकदमेबाज़ी", "caseType.Corporate": "कॉर्पोरेट", "caseType.RealEstate": "रियल एस्टेट", "caseType.IntellectualProperty": "बौद्धिक संपदा", "caseType.Other": "अन्य",
  "action.cancel": "रद्द करें", "action.nextAddFile": "आगे: फ़ाइल जोड़ें", "upload.headline": "दस्तावेज़ अपलोड करें", "upload.subtext": "केस फोल्डर पहले सहेजा जाता है। दस्तावेज़ प्रोसेसिंग और AI तैयारी अलग-अलग चलती हैं।", "action.back": "वापस", "action.skipCreateEmpty": "छोड़ें और खाली केस बनाएँ", "action.browseFiles": "फ़ाइलें देखें", "upload.fileAria": "केस दस्तावेज़ चुनें", "upload.warning": "AI विश्लेषण केवल जानकारी के लिए है। कानूनी सलाह के लिए हमेशा योग्य अधिवक्ता से सलाह लें।",
};

const hinglish: CaseCreationCatalog = {
  "limit.title": "Case-folder limit poori ho gayi", "limit.description": "Aapke Free plan ki case-folder limit poori ho gayi hai.", "action.viewExisting": "Existing cases dekhein", "action.deleteOrArchive": "Unused case delete ya archive karein", "action.upgrade": "Upgrade karein", "action.close": "Band karein",
  "title.create": "Naya case banayein", "title.upload": "Case document upload karein", "field.caseName": "Case ka naam *", "placeholder.caseName": "e.g. Sharma v. Verma", "field.clientName": "Client name", "placeholder.optional": "Optional", "field.caseType": "Case type", "field.description": "Description", "placeholder.notes": "Optional notes",
  "caseType.Litigation": "Litigation", "caseType.Corporate": "Corporate", "caseType.RealEstate": "Real estate", "caseType.IntellectualProperty": "Intellectual property", "caseType.Other": "Other",
  "action.cancel": "Cancel karein", "action.nextAddFile": "Next: file add karein", "upload.headline": "Document upload karein", "upload.subtext": "Case folder pehle save hota hai. Document processing aur AI preparation alag-alag run hote hain.", "action.back": "Wapas", "action.skipCreateEmpty": "Skip karke empty case banayein", "action.browseFiles": "Files browse karein", "upload.fileAria": "Case document choose karein", "upload.warning": "AI analysis sirf informational purpose ke liye hai. Legal advice ke liye hamesha qualified advocate se consult karein.",
};

const catalogs: Record<AppLanguage, CaseCreationCatalog> = { en: english, hi: hindi, hinglish };

export const caseCreationCopyKeys = Object.freeze(Object.keys(english) as CaseCreationCopyKey[]);

export function caseCreationCopy(language: AppLanguage, key: CaseCreationCopyKey) {
  return catalogs[language][key];
}

export function formatCaseCreationCopy(language: AppLanguage, key: CaseCreationCopyKey, values: Readonly<Record<string, string | number>>) {
  return caseCreationCopy(language, key).replace(/\{([A-Za-z][A-Za-z0-9_]*)\}/g, (placeholder, name: string) => (
    Object.prototype.hasOwnProperty.call(values, name) ? String(values[name]) : placeholder
  ));
}

export const caseTypeCopyKeys = {
  Litigation: "caseType.Litigation",
  Corporate: "caseType.Corporate",
  "Real Estate": "caseType.RealEstate",
  "Intellectual Property": "caseType.IntellectualProperty",
  Other: "caseType.Other",
} as const satisfies Record<string, CaseCreationCopyKey>;
