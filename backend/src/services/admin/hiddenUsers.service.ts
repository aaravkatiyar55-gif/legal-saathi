import { promises as fs } from "node:fs";
import path from "node:path";

const storePath = path.resolve(process.cwd(), ".local", "hidden-users.json");

let hiddenUsersCache: Set<string> | null = null;

async function loadHiddenUsers(): Promise<Set<string>> {
  if (hiddenUsersCache) return hiddenUsersCache;
  try {
    const data = await fs.readFile(storePath, "utf8");
    hiddenUsersCache = new Set(JSON.parse(data));
  } catch {
    hiddenUsersCache = new Set();
  }
  return hiddenUsersCache;
}

async function saveHiddenUsers(users: Set<string>) {
  await fs.mkdir(path.dirname(storePath), { recursive: true });
  await fs.writeFile(storePath, JSON.stringify(Array.from(users)), "utf8");
}

export async function isUserHidden(email: string): Promise<boolean> {
  const users = await loadHiddenUsers();
  return users.has(email.toLowerCase());
}

export async function hideUser(email: string): Promise<void> {
  const users = await loadHiddenUsers();
  users.add(email.toLowerCase());
  await saveHiddenUsers(users);
}

export async function restoreUser(email: string): Promise<void> {
  const users = await loadHiddenUsers();
  users.delete(email.toLowerCase());
  await saveHiddenUsers(users);
}

export async function getHiddenUsers(): Promise<string[]> {
  const users = await loadHiddenUsers();
  return Array.from(users);
}
