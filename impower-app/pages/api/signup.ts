import { VercelRequest, VercelResponse } from "@vercel/node";
import { getAdminAuth, getAdminFirestore, initAdminApp } from "../../lib/admin";
import { getCurrentTimeInSeconds } from "../../lib/getCurrentTimeInSeconds";
import { getServerDay } from "../../lib/getServerDay";
import { isCaptchaValid } from "../../lib/isCaptchaValid";

const MIN_ALLOWED_AGE = 13;

const getAge = (dob: Date): number => {
  const monthDiff = Date.now() - dob.getTime();
  const ageDate = new Date(monthDiff);
  const year = ageDate.getUTCFullYear();
  return Math.abs(year - 1970);
};

export const signup = async (
  req: VercelRequest,
  res: VercelResponse
): Promise<VercelResponse> => {
  const { body, method } = req;

  const { email, password, username, captcha, dob } = body as {
    email: string;
    password: string;
    username: string;
    captcha: string;
    dob: string;
  };

  if (method === "POST") {
    if (!email) {
      return res.status(422).json({
        message: "Please provide email",
      });
    }
    if (!password) {
      return res.status(422).json({
        message: "Please provide password",
      });
    }
    if (!username) {
      return res.status(422).json({
        message: "Please provide username",
      });
    }
    if (!captcha) {
      return res.status(422).json({
        message: "Please provide captcha",
      });
    }
    if (!dob) {
      return res.status(422).json({
        message:
          "Please provide `dob` string field set to the user's date of birth",
      });
    }
    try {
      if (getAge(new Date(dob)) < MIN_ALLOWED_AGE) {
        return res.status(422).json({
          message: "unauthorized: must be at least 13 years old",
        });
      }
      const passedChallenge = isCaptchaValid(captcha);

      if (!passedChallenge) {
        return res.status(403).json({
          message: "captcha challenge failed",
        });
      }

      const serverTime = Date.now();
      const today = getServerDay(serverTime);
      const adminApp = await initAdminApp();
      const auth = await getAdminAuth(adminApp);
      const firestore = await getAdminFirestore(adminApp);
      const usernameSnap = await firestore
        .doc(`handles/${username.toLowerCase()}`)
        .get();

      if (usernameSnap.data()) {
        return res.status(403).json({
          message: "username already exists",
        });
      }

      const getRandomColor = (
        await import("../../modules/impower-core/utils/getRandomColor")
      ).default;
      const hex = getRandomColor();

      const userRecord = await auth.createUser({
        email,
        emailVerified: false,
        password,
        displayName: username,
        disabled: false,
      });

      const usernameRef = firestore.doc(`handles/${username.toLowerCase()}`);
      const userRef = firestore.doc(`users/${userRecord.uid}`);
      const submissionTypes = [
        "studios",
        "projects",
        "contributions",
        "comments",
        "notes",
        "phrases",
        "suggestions",
      ];
      const submissionsRefs = submissionTypes.map((type) =>
        firestore.doc(`users/${userRecord.uid}/submissions/${type}`)
      );
      const batch = firestore.batch();
      try {
        batch.create(usernameRef, {
          _documentType: "SlugDocument",
        });
        batch.set(
          userRef,
          {
            _documentType: "UserDocument",
            username,
            icon: {
              storageKey: "",
              fileUrl: "",
              fileType: "image/png,image/jpeg",
              fileExtension: null,
            },
            hex,
            _updates: {
              [`${today}`]: 1,
            },
          },
          { merge: true }
        );
        submissionsRefs.forEach((ref) => {
          batch.set(ref, {
            _documentType: "PathDocument",
            _createdBy: userRecord.uid,
            _updates: {
              [`${today}`]: 0,
            },
          });
        });
        await batch.commit();
      } catch {
        return res.status(403).json({
          message: "username already exists",
        });
      }

      const newClaims = {
        dob,
        captcha_time: getCurrentTimeInSeconds(),
        username,
        icon: null,
        hex,
        storage: {},
      };

      await auth.setCustomUserClaims(userRecord.uid, newClaims);

      return res.status(200).json(newClaims);
    } catch (error) {
      console.error(error);
      return res.status(403).json(error);
    }
  }
  // Return 404 if someone pings the API with a method other than POST
  return res.status(404).json({ message: `${method} not found` });
};

export default signup;
