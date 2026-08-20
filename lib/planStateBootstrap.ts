export type PlanStateBootstrapInput<Catalog, Session, Usage> = {
  getExistingSession: () => Session | null;
  loadCatalog: () => Promise<Catalog>;
  restoreSession: () => Promise<Session | null>;
  loadUsage: () => Promise<Usage>;
};

export type PlanStateBootstrapResult<Catalog, Session, Usage> = {
  catalog: Catalog;
  session: Session | null;
  usage: Usage | null;
};

/**
 * Starts independent catalog and session work together. Usage remains
 * deliberately session-gated because the server must remain authoritative for
 * plan balances and tenant data.
 */
export async function loadPlanStateBootstrap<Catalog, Session, Usage>(
  input: PlanStateBootstrapInput<Catalog, Session, Usage>,
): Promise<PlanStateBootstrapResult<Catalog, Session, Usage>> {
  const catalogPromise = input.loadCatalog();
  const currentSession = input.getExistingSession();
  const sessionPromise = currentSession ? Promise.resolve(currentSession) : input.restoreSession();
  const [catalog, session] = await Promise.all([catalogPromise, sessionPromise]);
  const usage = session ? await input.loadUsage() : null;
  return { catalog, session, usage };
}
