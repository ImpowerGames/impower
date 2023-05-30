import { VercelRequest, VercelResponse } from "@vercel/node";
import { getAdminAuth, getAdminFirestore, initAdminApp } from "../../lib/admin";

export const updateProfileClaims = async (
  req: VercelRequest,
  res: VercelResponse
): Promise<VercelResponse> => {
  const { body, method } = req;

  const { token } = body as { token: string; now: number };

  if (method === "POST") {
    // If token is missing return an error
    if (!token) {
      return res.status(422).json({
        message: "unauthenticated",
      });
    }
    try {
      const adminApp = await initAdminApp();
      const auth = await getAdminAuth(adminApp);
      const firestore = await getAdminFirestore(adminApp);
      const decodedToken = await auth.verifyIdToken(token, true);
      const { uid } = decodedToken;
      const user = await auth.getUser(uid);
      const userSnap = await firestore.collection("users").doc(uid).get();
      const userDoc = userSnap.data();
      const claims = user.customClaims;
      const username = userDoc?.username || claims.username || null;
      const icon = userDoc?.icon?.fileUrl || claims.icon || null;
      const hex = userDoc?.hex || claims.hex || null;
      const newClaims = {
        ...claims,
        username,
        icon,
        hex,
      };
      await auth.setCustomUserClaims(uid, newClaims);
      await auth.updateUser(uid, {
        ...(username ? { displayName: username } : {}),
        ...(icon ? { photoURL: icon } : {}),
      });
      return res.status(200).json({});
    } catch (error) {
      console.error(error);
      return res.status(403).json(error);
    }
  }
  // Return 404 if someone pings the API with a method other than POST
  return res.status(404).json({ message: `${method} not found` });
};

export default updateProfileClaims;
