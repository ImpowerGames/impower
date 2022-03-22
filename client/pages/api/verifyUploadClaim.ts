import { VercelRequest, VercelResponse } from "@vercel/node";
import { getServerDay } from "../../lib/getServerDay";
import { initAdminApp } from "../../lib/initAdminApp";
import { getUuid } from "../../modules/impower-core";

const DAILY_UPLOAD_LIMIT = 1000;

export const verifyUploadClaim = async (
  req: VercelRequest,
  res: VercelResponse
): Promise<VercelResponse> => {
  const { body, method } = req;

  const { token } = body as {
    token: string;
  };

  if (method === "POST") {
    // If token is missing return an error
    if (!token) {
      return res.status(422).json({
        message: "unauthenticated",
      });
    }
    try {
      const adminApp = await initAdminApp();
      const decodedToken = await adminApp.auth().verifyIdToken(token, true);
      const { uid } = decodedToken;

      const serverTime = Date.now();
      const day = getServerDay(serverTime);

      const path = `users/${uid}/agg/my_uploads/data/${day}`;
      const ref = adminApp.database().ref(path);
      const unauthorizedMessage =
        "unauthorized: reached max daily file upload limit";
      try {
        let errorMessage = "";
        await ref.transaction(
          (v) => {
            if (v > DAILY_UPLOAD_LIMIT) {
              throw new Error(unauthorizedMessage);
            }
            return (v || 0) + 1;
          },
          (error) => {
            errorMessage = error?.message;
          }
        );
        if (errorMessage) {
          return res.status(403).json({
            message: errorMessage,
          });
        }
        const id = getUuid();
        const storageKey = `users/${uid}/${id}`;
        const user = await adminApp.auth().getUser(uid);
        const claims = user.customClaims || {};
        const newClaims = {
          ...claims,
          storage: {
            [id]: day,
          },
        };
        Object.entries(claims?.storage || {}).forEach(([k, v]) => {
          if (v === day) {
            newClaims.storage[k] = v;
          }
        });
        try {
          await adminApp.auth().setCustomUserClaims(uid, newClaims);
        } catch {
          // Not enough space, remove storage old claims
          let oldestClaim = "";
          Object.entries(claims?.storage || {}).forEach(([k, v]) => {
            if (k !== id) {
              if (!oldestClaim || v !== day) {
                delete newClaims.storage[k];
              }
              oldestClaim = k;
            }
          });
          await adminApp.auth().setCustomUserClaims(uid, newClaims);
        }
        return res.status(200).json({
          storageKey,
          claims: newClaims,
        });
      } catch (e) {
        return res.status(403).json({
          message: e.message,
        });
      }
    } catch (error) {
      console.error(error);
      return res.status(403).json(error);
    }
  }
  // Return 404 if someone pings the API with a method other than POST
  return res.status(404).json({ message: `${method} not found` });
};

export default verifyUploadClaim;
