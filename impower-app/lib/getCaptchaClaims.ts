import { getCurrentTimeInSeconds } from "./getCurrentTimeInSeconds";

export const getCaptchaClaims = (): { captcha_time: number } => {
  const captcha_time = getCurrentTimeInSeconds(); // get time in seconds so it can be easily compared to request.auth.token.auth_time
  const newClaims = {
    captcha_time,
  };
  return newClaims;
};
