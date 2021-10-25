import { VercelRequest, VercelResponse } from "@vercel/node";
import { getCaptchaClaims } from "../../lib/getCaptchaClaims";
import { initAdminApp } from "../../lib/initAdminApp";
import { isCaptchaValid } from "../../lib/isCaptchaValid";

export const verifyCaptchaClaim = async (
  req: VercelRequest,
  res: VercelResponse
): Promise<VercelResponse> => {
  const { body, method } = req;

  // Extract the token and captcha code from the request body
  const { token, captcha } = body;

  if (method === "POST") {
    // If token is missing return an error
    if (!token) {
      const message = "please provide token";
      console.error(message);
      return res.status(422).json({
        message,
      });
    }

    let uid: string;

    try {
      const adminApp = await initAdminApp();
      const decodedToken = await adminApp.auth().verifyIdToken(token, true);
      uid = decodedToken?.uid;

      const userRecord = await adminApp.auth().getUser(uid);
      const auth_time =
        new Date(userRecord.metadata.lastSignInTime).getTime() / 1000;
      const customClaims = userRecord?.customClaims;
      const captcha_time = customClaims?.captcha_time;
      const isCaptchaStillValid =
        auth_time && captcha_time && auth_time <= captcha_time;

      if (isCaptchaStillValid) {
        const newClaims = {
          ...(userRecord?.customClaims || {}),
          ...getCaptchaClaims(),
        };
        await adminApp.auth().setCustomUserClaims(uid, newClaims);
        return res.status(200).json(newClaims);
      }

      // If captcha is missing return an error
      if (!captcha) {
        const message = "please provide captcha";
        console.error(message);
        return res.status(422).json({
          message,
        });
      }

      const passedChallenge = await isCaptchaValid(captcha);

      if (!passedChallenge) {
        const message = "captcha challenge failed";
        console.error(message);
        return res.status(403).json({
          message,
        });
      }

      const newClaims = {
        ...(userRecord?.customClaims || {}),
        ...getCaptchaClaims(),
      };
      await adminApp.auth().setCustomUserClaims(uid, newClaims);

      return res.status(200).json(newClaims);
    } catch (error) {
      console.error(error);
      const message = JSON.stringify(error);
      return res.status(403).json({ message });
    }
  }
  const message = `${method} not found`;
  console.error(message);
  // Return 404 if someone pings the API with a method other than POST
  return res.status(404).json({ message });
};

export default verifyCaptchaClaim;
