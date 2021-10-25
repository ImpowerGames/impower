import { VercelRequest, VercelResponse } from "@vercel/node";
import { getServerDay } from "../../lib/getServerDay";
import { initAdminApp } from "../../lib/initAdminApp";

const DAILY_UPLOAD_LIMIT = 1000;

export const verifyUploadClaim = async (
  req: VercelRequest,
  res: VercelResponse
): Promise<VercelResponse> => {
  const { body, method } = req;

  const { token, now } = body as { token: string; now: number };

  if (method === "POST") {
    // If token is missing return an error
    if (!token) {
      return res.status(422).json({
        message: "unauthenticated",
      });
    }
    // If now is missing return an error
    if (!now) {
      return res.status(422).json({
        message:
          "please provide `now` field set to the current time in milliseconds since epoch (Date.now())",
      });
    }
    try {
      const adminApp = await initAdminApp();
      const decodedToken = await adminApp.auth().verifyIdToken(token, true);
      const { uid } = decodedToken;
      const user = await adminApp.auth().getUser(uid);
      const claims = user.customClaims;
      const storage = claims?.storage;
      const serverTime = Date.now();
      const day = getServerDay(serverTime);
      const uploads: number =
        storage.day === day ? (storage?.uploads || 0) + 1 : 1;
      if (uploads < 1) {
        return res.status(403).json({
          message: "unauthorized: invalid upload count",
        });
      }
      if (uploads > DAILY_UPLOAD_LIMIT) {
        return res.status(403).json({
          message: "unauthorized: reached max daily file upload limit",
        });
      }
      const maxFileIdLength = DAILY_UPLOAD_LIMIT.toString().length - 1;
      const id = String(uploads - 1).padStart(maxFileIdLength, "0");
      const key = `users/${uid}/${day}/${id}`;
      const newClaims = {
        ...claims,
        storage: {
          uploads,
          day,
          id,
          key,
        },
      };
      await adminApp.auth().setCustomUserClaims(uid, newClaims);
      return res.status(200).json({});
    } catch (error) {
      console.error(error);
      return res.status(403).json(error);
    }
  }
  // Return 404 if someone pings the API with a method other than POST
  return res.status(404).json({ message: `${method} not found` });
};

export default verifyUploadClaim;
