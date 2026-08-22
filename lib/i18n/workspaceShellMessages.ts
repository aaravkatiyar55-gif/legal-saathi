import type { AppLanguage } from "./types";

const english = {
  "shell.language": "Language",
  "shell.navigation.close": "Close navigation",
  "shell.navigation.open": "Open navigation",
  "shell.navigation.openTitle": "Open navigation",
} as const;

type WorkspaceShellMessageKey = keyof typeof english;
type WorkspaceShellCatalog = Record<WorkspaceShellMessageKey, string>;

const catalogs: Record<AppLanguage, WorkspaceShellCatalog> = {
  en: english,
  hi: {
    "shell.language": "भाषा",
    "shell.navigation.close": "नेविगेशन बंद करें",
    "shell.navigation.open": "नेविगेशन खोलें",
    "shell.navigation.openTitle": "नेविगेशन खोलें",
  },
  hinglish: {
    "shell.language": "Bhasha",
    "shell.navigation.close": "Navigation band karein",
    "shell.navigation.open": "Navigation kholein",
    "shell.navigation.openTitle": "Navigation kholein",
  },
};

export type { WorkspaceShellMessageKey };

export function workspaceShellMessage(language: AppLanguage, key: WorkspaceShellMessageKey) {
  return catalogs[language][key];
}

export const workspaceShellMessageKeys = Object.freeze(Object.keys(english) as WorkspaceShellMessageKey[]);
