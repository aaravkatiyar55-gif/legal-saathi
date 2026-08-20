import { NextFunction, Request, Response } from "express";
import { getRequestSession } from "../services/local/authSessions.service";

export type VerifiedUserIdentity = {
  email: string;
  displayName: string;
  avatarUrl: string;
  provider: "google" | "development" | "supabase";
  subject?: string;
};

export class IdentityConfigurationError extends Error {}
export class IdentityAuthenticationError extends Error {}

export async function authenticateRequest(request: Request): Promise<VerifiedUserIdentity> {
  const session = await getRequestSession(request);
  if (session) {
    return {
      email: session.email,
      displayName: session.displayName,
      avatarUrl: session.avatarUrl,
      provider: session.provider,
      subject: session.subject,
    };
  }

  throw new IdentityAuthenticationError("A secure app session is required");
}

export async function requireVerifiedUser(request: Request, response: Response, next: NextFunction) {
  try {
    response.locals.authUser = await authenticateRequest(request);
    next();
  } catch (error) {
    const status = error instanceof IdentityConfigurationError ? 503 : 401;
    response.status(status).json({
      ok: false,
      error: status === 503 ? "AUTH_NOT_CONFIGURED" : "AUTH_REQUIRED",
      message: error instanceof Error ? error.message : "Authentication failed",
    });
  }
}

export function getVerifiedUser(response: Response): VerifiedUserIdentity {
  return response.locals.authUser as VerifiedUserIdentity;
}
