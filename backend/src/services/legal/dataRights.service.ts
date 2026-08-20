import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { env } from "../../config/env";
import { getSupabaseClient } from "../supabase/supabaseClient";

export type DataRightsRequestType = "export" | "deletion";
type DataRightsRequest = {
  id: string;
  ownerEmail: string;
  type: DataRightsRequestType;
  status: "pending";
  requestedAt: string;
};

const localPath = path.resolve(process.cwd(), ".local", "data-rights-requests.json");
let requestQueue: Promise<void> = Promise.resolve();

function withLock<T>(task: () => Promise<T>) {
  const run = requestQueue.then(task, task);
  requestQueue = run.then(() => undefined, () => undefined);
  return run;
}

async function saveLocalRequest(request: DataRightsRequest) {
  return withLock(async () => {
    let requests: DataRightsRequest[] = [];
    try {
      const parsed = JSON.parse(await fs.readFile(localPath, "utf8")) as { requests?: DataRightsRequest[] };
      requests = Array.isArray(parsed.requests) ? parsed.requests : [];
    } catch {
      requests = [];
    }
    requests.push(request);
    await fs.mkdir(path.dirname(localPath), { recursive: true });
    const temporaryPath = `${localPath}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(temporaryPath, `${JSON.stringify({ requests }, null, 2)}\n`, "utf8");
    await fs.rename(temporaryPath, localPath);
    return request;
  });
}

export async function createDataRightsRequest(ownerEmail: string, type: DataRightsRequestType) {
  const request: DataRightsRequest = { id: randomUUID(), ownerEmail, type, status: "pending", requestedAt: new Date().toISOString() };
  if (env.nodeEnv !== "production") return saveLocalRequest(request);
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("DATA_RIGHTS_STORE_NOT_CONFIGURED");
  const { error } = await supabase.from("legal_sathi_data_rights_requests").insert({
    id: request.id,
    owner_email: request.ownerEmail,
    request_type: request.type,
    status: request.status,
    requested_at: request.requestedAt,
  });
  if (error) throw new Error("DATA_RIGHTS_REQUEST_FAILED");
  return request;
}
