import { Router } from "express";
import { requireCsrfForSession } from "../middleware/csrf.middleware";
import { authenticateRequest, getVerifiedUser } from "../middleware/identity.middleware";
import { incidentReportRateLimit, publicIncidentReportRateLimit } from "../middleware/rateLimit.middleware";
import { getIncidentStore, incidentReporterKey, incidentReportSchema } from "../services/incidents/incident.service";

export const incidentRoutes = Router();

incidentRoutes.use((_request, response, next) => {
  response.set("Cache-Control", "no-store");
  next();
});

function sendAcceptedIncident(response: import("express").Response, incident: { id: string; status: string; reportCount: number }) {
  response.status(202).json({
    ok: true,
    incident: { id: incident.id, status: incident.status, reportCount: incident.reportCount },
    requestId: response.locals.requestId,
  });
}

function sendIncidentStoreUnavailable(response: import("express").Response) {
  response.status(503).json({
    ok: false,
    error: "INCIDENT_STORE_UNAVAILABLE",
    message: "The sanitized report could not be stored.",
    requestId: response.locals.requestId,
  });
}

incidentRoutes.post("/report", incidentReportRateLimit, async (request, response, next) => {
  try {
    response.locals.authUser = await authenticateRequest(request);
    next();
  } catch {
    response.status(401).json({ ok: false, error: "AUTH_REQUIRED", message: "Sign in is required.", requestId: response.locals.requestId });
  }
}, requireCsrfForSession, async (request, response) => {
  const parsed = incidentReportSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ ok: false, error: "INVALID_INCIDENT_REPORT", message: "The diagnostic report was incomplete or unsafe.", requestId: response.locals.requestId });
    return;
  }
  try {
    const identity = getVerifiedUser(response);
    const incident = await getIncidentStore().report(incidentReporterKey(identity.email), parsed.data);
    sendAcceptedIncident(response, incident);
  } catch {
    sendIncidentStoreUnavailable(response);
  }
});

incidentRoutes.post("/public-report", publicIncidentReportRateLimit, async (request, response) => {
  const parsed = incidentReportSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ ok: false, error: "INVALID_INCIDENT_REPORT", message: "The diagnostic report was incomplete or unsafe.", requestId: response.locals.requestId });
    return;
  }
  try {
    const ip = request.ip || "unknown-ip";
    const incident = await getIncidentStore().report(incidentReporterKey(ip), parsed.data);
    sendAcceptedIncident(response, incident);
  } catch {
    sendIncidentStoreUnavailable(response);
  }
});
