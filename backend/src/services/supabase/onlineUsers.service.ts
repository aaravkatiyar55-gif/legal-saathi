import { getSupabaseClient } from "./supabaseClient";

export const allowedUserTiers = ["free", "plus", "pro", "advocate"] as const;
export type UserTier = (typeof allowedUserTiers)[number];
export type UserSessionEvent = "login" | "seen";

type UserProfileRow = {
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  provider: string | null;
  tier: UserTier;
  is_banned: boolean;
  ban_reason: string | null;
  banned_at: string | null;
  banned_by: string | null;
  created_at: string;
  last_seen_at: string;
  last_login_at: string;
  login_count: number;
};

export type OnlineUserProfile = {
  email: string;
  displayName: string;
  avatarUrl: string;
  provider: string;
  tier: UserTier;
  isBanned: boolean;
  banReason: string | null;
  bannedAt: string | null;
  bannedBy: string | null;
  createdAt: string;
  lastSeenAt: string;
  lastLoginAt: string;
  loginCount: number;
};

export class OnlineUserStoreError extends Error {
  constructor() {
    super("Online user storage request failed");
  }
}

export function normalizeUserEmail(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function isValidUserEmail(value: string) {
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function requireSupabase() {
  const supabase = getSupabaseClient();
  if (!supabase) throw new OnlineUserStoreError();
  return supabase;
}

function mapProfile(row: UserProfileRow): OnlineUserProfile {
  return {
    email: row.email,
    displayName: row.display_name ?? "",
    avatarUrl: row.avatar_url ?? "",
    provider: row.provider ?? "google",
    tier: allowedUserTiers.includes(row.tier) ? row.tier : "free",
    isBanned: Boolean(row.is_banned),
    banReason: row.ban_reason,
    bannedAt: row.banned_at,
    bannedBy: row.banned_by,
    createdAt: row.created_at,
    lastSeenAt: row.last_seen_at,
    lastLoginAt: row.last_login_at,
    loginCount: Number(row.login_count || 0),
  };
}

async function insertUserEvent(email: string, eventType: string, metadata: Record<string, unknown> = {}) {
  const result = await requireSupabase().from("user_events").insert({
    email,
    event_type: eventType,
    metadata,
  });
  if (result.error) throw new OnlineUserStoreError();
}

async function insertAdminAction(
  adminEmail: string,
  action: string,
  targetEmail: string,
  metadata: Record<string, unknown> = {},
) {
  const result = await requireSupabase().from("admin_actions").insert({
    admin_email: normalizeUserEmail(adminEmail) || null,
    action,
    target_email: targetEmail,
    metadata,
  });
  if (result.error) throw new OnlineUserStoreError();
}

async function ensureProfile(email: string) {
  const result = await requireSupabase()
    .from("user_profiles")
    .upsert({ email }, { onConflict: "email", ignoreDuplicates: true });
  if (result.error) throw new OnlineUserStoreError();
}

export async function recordUserSession(input: {
  email: string;
  displayName?: string;
  avatarUrl?: string;
  provider?: string;
  eventType?: UserSessionEvent;
}) {
  const supabase = requireSupabase();
  const email = normalizeUserEmail(input.email);
  const eventType: UserSessionEvent = input.eventType === "seen" ? "seen" : "login";
  const existingResult = await supabase.from("user_profiles").select("*").eq("email", email).maybeSingle<UserProfileRow>();
  if (existingResult.error) throw new OnlineUserStoreError();

  const now = new Date().toISOString();
  let profileResult;

  if (existingResult.data) {
    const updates: Record<string, unknown> = {
      display_name: input.displayName?.trim() || existingResult.data.display_name,
      avatar_url: input.avatarUrl?.trim() || existingResult.data.avatar_url,
      provider: input.provider?.trim() || existingResult.data.provider || "google",
      last_seen_at: now,
    };
    if (eventType === "login") {
      updates.last_login_at = now;
      updates.login_count = Number(existingResult.data.login_count || 0) + 1;
    }
    profileResult = await supabase.from("user_profiles").update(updates).eq("email", email).select("*").single<UserProfileRow>();
  } else {
    profileResult = await supabase
      .from("user_profiles")
      .insert({
        email,
        display_name: input.displayName?.trim() || null,
        avatar_url: input.avatarUrl?.trim() || null,
        provider: input.provider?.trim() || "google",
        last_seen_at: now,
        last_login_at: now,
        login_count: 1,
      })
      .select("*")
      .single<UserProfileRow>();
  }

  if (profileResult.error) throw new OnlineUserStoreError();
  await insertUserEvent(email, eventType, { provider: profileResult.data.provider ?? "google" });
  return mapProfile(profileResult.data);
}

export async function getUserProfile(emailValue: unknown, touchLastSeen = false) {
  const supabase = requireSupabase();
  const email = normalizeUserEmail(emailValue);
  const result = await supabase.from("user_profiles").select("*").eq("email", email).maybeSingle<UserProfileRow>();
  if (result.error) throw new OnlineUserStoreError();
  if (!result.data) return null;

  if (!touchLastSeen) return mapProfile(result.data);

  const now = new Date();
  const previousSeen = new Date(result.data.last_seen_at).getTime();
  const update = await supabase
    .from("user_profiles")
    .update({ last_seen_at: now.toISOString() })
    .eq("email", email)
    .select("*")
    .single<UserProfileRow>();
  if (update.error) throw new OnlineUserStoreError();

  if (!Number.isFinite(previousSeen) || now.getTime() - previousSeen >= 5 * 60 * 1000) {
    await insertUserEvent(email, "seen");
  }
  return mapProfile(update.data);
}

export async function listUserProfiles() {
  const result = await requireSupabase()
    .from("user_profiles")
    .select("*")
    .order("last_seen_at", { ascending: false })
    .limit(500);
  if (result.error) throw new OnlineUserStoreError();
  return (result.data as UserProfileRow[]).map(mapProfile);
}

export async function banUser(emailValue: unknown, reason: unknown, adminEmail: unknown) {
  const email = normalizeUserEmail(emailValue);
  await ensureProfile(email);
  const banReason = typeof reason === "string" && reason.trim() ? reason.trim().slice(0, 500) : "Restricted by Legal Saathi owner";
  const now = new Date().toISOString();
  const result = await requireSupabase()
    .from("user_profiles")
    .update({ is_banned: true, ban_reason: banReason, banned_at: now, banned_by: normalizeUserEmail(adminEmail) || "admin" })
    .eq("email", email)
    .select("*")
    .single<UserProfileRow>();
  if (result.error) throw new OnlineUserStoreError();
  await insertAdminAction(String(adminEmail ?? ""), "ban", email, { reason: banReason });
  return mapProfile(result.data);
}

export async function unbanUser(emailValue: unknown, adminEmail: unknown) {
  const email = normalizeUserEmail(emailValue);
  await ensureProfile(email);
  const result = await requireSupabase()
    .from("user_profiles")
    .update({ is_banned: false, ban_reason: null, banned_at: null, banned_by: null })
    .eq("email", email)
    .select("*")
    .single<UserProfileRow>();
  if (result.error) throw new OnlineUserStoreError();
  await insertAdminAction(String(adminEmail ?? ""), "unban", email);
  return mapProfile(result.data);
}

export async function setUserTier(emailValue: unknown, tierValue: unknown, adminEmail: unknown) {
  const email = normalizeUserEmail(emailValue);
  const tier = String(tierValue ?? "").trim().toLowerCase() as UserTier;
  if (!allowedUserTiers.includes(tier)) throw new Error("INVALID_TIER");
  await ensureProfile(email);
  const result = await requireSupabase()
    .from("user_profiles")
    .update({ tier })
    .eq("email", email)
    .select("*")
    .single<UserProfileRow>();
  if (result.error) throw new OnlineUserStoreError();
  await insertAdminAction(String(adminEmail ?? ""), "tier_update", email, { tier });
  return mapProfile(result.data);
}

export async function grantPaidTier(emailValue: unknown, tierValue: unknown, orderId: string) {
  const email = normalizeUserEmail(emailValue);
  const tier = String(tierValue ?? "").trim().toLowerCase() as UserTier;
  if (!isValidUserEmail(email) || !allowedUserTiers.includes(tier) || tier === "free") {
    throw new Error("INVALID_PAID_TIER");
  }
  await ensureProfile(email);
  const currentProfile = await getUserProfile(email);
  if (currentProfile?.tier === tier) return currentProfile;
  const result = await requireSupabase()
    .from("user_profiles")
    .update({ tier })
    .eq("email", email)
    .select("*")
    .single<UserProfileRow>();
  if (result.error) throw new OnlineUserStoreError();
  await insertAdminAction("", "payment_tier_grant", email, { tier, razorpayOrderId: orderId });
  return mapProfile(result.data);
}

export async function listRecentUserEvents() {
  const supabase = requireSupabase();
  const [userEvents, adminActions] = await Promise.all([
    supabase.from("user_events").select("id,email,event_type,metadata,created_at").order("created_at", { ascending: false }).limit(100),
    supabase.from("admin_actions").select("id,admin_email,action,target_email,metadata,created_at").order("created_at", { ascending: false }).limit(100),
  ]);
  if (userEvents.error || adminActions.error) throw new OnlineUserStoreError();
  return {
    userEvents: userEvents.data ?? [],
    adminActions: adminActions.data ?? [],
  };
}
