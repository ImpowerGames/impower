import { VercelRequest, VercelResponse } from "@vercel/node";
import {
  getAdminAuth,
  getAdminDatabase,
  getAdminFirestore,
  initAdminApp,
} from "../../lib/admin";

export const verifyProjectClaim = async (
  req: VercelRequest,
  res: VercelResponse
): Promise<VercelResponse> => {
  const { body, method } = req;

  const { token, project } = body as {
    token: string;
    project: string;
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
      const auth = await getAdminAuth(adminApp);
      const firestore = await getAdminFirestore(adminApp);
      const database = await getAdminDatabase(adminApp);
      const decodedToken = await auth.verifyIdToken(token, true);
      const { uid } = decodedToken;

      const projectSnap = await firestore.doc(`projects/${project}`).get();
      const projectData = projectSnap?.data();
      const owners: string[] = projectData?.owners;
      const studio = projectData?.studio;
      const projectInfo = projectData
        ? {
            id: project,
            tags: projectData?.tags || [],
            n: projectData?.name || "",
            u: projectData?.slug || "",
            h: projectData?.hex || "",
            i: projectData?.icon?.fileUrl || "",
            t:
              (projectData?._updatedAt as { toDate: () => Date })
                ?.toDate?.()
                ?.getTime() || new Date().getTime(),
          }
        : undefined;
      const studioSnap = await firestore.doc(`studios/${studio}`).get();
      const studioData = studioSnap.data();
      const studioInfo = studioData
        ? {
            id: studio,
            tags: studioData?.tags || [],
            n: studioData?.name || "",
            u: studioData?.handle || "",
            h: studioData?.hex || "",
            i: studioData?.icon?.fileUrl || "",
            t:
              (studioData?._updatedAt as { toDate: () => Date })
                ?.toDate?.()
                ?.getTime() || new Date().getTime(),
          }
        : undefined;

      if (!owners?.includes(uid)) {
        return res.status(403).json({
          message: "unauthorized: is not an owner of this project",
        });
      }

      const user = await auth.getUser(uid);
      const claims = user.customClaims;
      const member = {
        a: {
          u: claims.username || null,
          h: claims.hex || null,
          i: claims.icon || null,
        },
        access: "owner",
        g: "projects",
        role: "",
        t: new Date().getTime(),
        ...(projectInfo ? { p: projectInfo } : {}),
        ...(studioInfo ? { s: studioInfo } : {}),
      };
      database.ref(`projects/${project}/members/data/${uid}`).update(member);

      return res.status(200).json({
        member,
      });
    } catch (error) {
      console.error(error);
      return res.status(403).json(error);
    }
  }
  // Return 404 if someone pings the API with a method other than POST
  return res.status(404).json({ message: `${method} not found` });
};

export default verifyProjectClaim;
