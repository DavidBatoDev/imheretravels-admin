import {
  getApps,
  initializeApp,
  cert,
  applicationDefault,
} from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

function getFirebaseAdminAuth() {
  if (getApps().length === 0) {
    // ID tokens must be verified against the project they were ISSUED for —
    // i.e. the client project the user signed into. If the service-account
    // cert belongs to a different project (e.g. a dev service account while the
    // client points at prod), using that cert would reject the token on an
    // audience mismatch (a 401). Verifying an ID token needs only the project
    // id plus Google's public keys, not the private key — so when the cert
    // project doesn't match the client project, initialize with the client
    // project id alone.
    const clientProjectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    const certProjectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

    const verifyProjectId = clientProjectId || certProjectId;
    const certMatchesClient =
      !!certProjectId && (!clientProjectId || certProjectId === clientProjectId);

    if (certMatchesClient && certProjectId && clientEmail && privateKey) {
      initializeApp({
        credential: cert({ projectId: certProjectId, clientEmail, privateKey }),
      });
    } else if (verifyProjectId) {
      // Verification-only app for the client project (no privileged ops here).
      initializeApp({ projectId: verifyProjectId });
    } else {
      initializeApp({ credential: applicationDefault() });
    }
  }

  return getAuth();
}

function getBearerToken(authorizationHeader: string | null): string | null {
  if (!authorizationHeader) {
    return null;
  }

  const [scheme, token] = authorizationHeader.split(" ");
  if (scheme !== "Bearer" || !token) {
    return null;
  }

  return token;
}

export async function verifyRequestUserId(
  authorizationHeader: string | null,
): Promise<string | null> {
  const token = getBearerToken(authorizationHeader);
  if (!token) {
    return null;
  }

  try {
    const decoded = await getFirebaseAdminAuth().verifyIdToken(token);
    return decoded.uid;
  } catch {
    return null;
  }
}
