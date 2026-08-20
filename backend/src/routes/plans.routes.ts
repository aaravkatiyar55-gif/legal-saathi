import { Router } from "express";
import { getProductCatalog } from "../services/billing/planState.service";

export const plansRoutes = Router();

plansRoutes.get("/catalog", async (_request, response) => {
  response.json({ ok: true, catalog: await getProductCatalog() });
});
