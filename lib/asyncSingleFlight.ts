export function createSingleFlight<T>() {
  let inFlight: Promise<T> | null = null;

  return (operation: () => Promise<T>) => {
    if (inFlight) return inFlight;

    const current = Promise.resolve().then(operation);
    inFlight = current;
    void current.then(
      () => { if (inFlight === current) inFlight = null; },
      () => { if (inFlight === current) inFlight = null; },
    );
    return current;
  };
}
