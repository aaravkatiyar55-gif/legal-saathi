export type GoogleIdentityScriptState = "" | "loading" | "loaded" | "failed";

export type GoogleIdApi = {
  initialize: (config: {
    client_id: string;
    callback: (response: { credential?: string }) => void;
    nonce?: string;
    auto_select?: boolean;
    use_fedcm_for_button?: boolean;
    button_auto_select?: boolean;
  }) => void;
  renderButton: (container: HTMLElement, options: { type: "standard"; theme: "outline"; size: "large"; text: "continue_with"; shape: "rectangular"; width: number }) => void;
};

export type GoogleIdentityNonce = {
  rawNonce: string;
  hashedNonce: string;
};

type GoogleCredentialReceiver = (credential: string, rawNonce: string) => void;

let initializedGoogleConfiguration: string | null = null;
let activeGoogleCredentialReceiver: GoogleCredentialReceiver | null = null;

export const googleIdentityInitializationOptions = {
  auto_select: false,
  use_fedcm_for_button: true,
  button_auto_select: false,
} as const;

function bytesToBase64Url(bytes: Uint8Array) {
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export async function hashGoogleIdentityNonce(rawNonce: string) {
  const encoded = new TextEncoder().encode(rawNonce);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function createGoogleIdentityNonce(): Promise<GoogleIdentityNonce> {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const rawNonce = bytesToBase64Url(bytes);
  return {
    rawNonce,
    hashedNonce: await hashGoogleIdentityNonce(rawNonce),
  };
}

/** GIS is page-global, so its credential callback must survive React effect cleanup. */
export function configureGoogleIdentity(
  api: GoogleIdApi,
  clientId: string,
  nonce: GoogleIdentityNonce,
  receiver: GoogleCredentialReceiver,
) {
  activeGoogleCredentialReceiver = receiver;
  const configuration = `${clientId}:${nonce.hashedNonce}`;
  if (initializedGoogleConfiguration === configuration) return false;

  let consumed = false;
  api.initialize({
    client_id: clientId,
    nonce: nonce.hashedNonce,
    ...googleIdentityInitializationOptions,
    callback: ({ credential }) => {
      if (
        credential
        && !consumed
        && initializedGoogleConfiguration === configuration
      ) {
        consumed = true;
        activeGoogleCredentialReceiver?.(credential, nonce.rawNonce);
      }
    },
  });
  initializedGoogleConfiguration = configuration;
  return true;
}

export function detachGoogleIdentityReceiver(receiver: GoogleCredentialReceiver) {
  if (activeGoogleCredentialReceiver === receiver) activeGoogleCredentialReceiver = null;
}

export function shouldReplaceGoogleIdentityScript(
  state: GoogleIdentityScriptState,
  apiAvailable: boolean,
) {
  return state === "failed" || (state === "loaded" && !apiAvailable);
}
