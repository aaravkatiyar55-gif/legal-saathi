export async function runVerifiedLogout(options: {
  destroySession: () => Promise<void>;
  commitSignedOut: () => void;
}) {
  await options.destroySession();
  options.commitSignedOut();
}
