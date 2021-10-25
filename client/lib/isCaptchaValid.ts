export const isCaptchaValid = async (captcha: string): Promise<boolean> => {
  // Ping captcha siteverify API to verify the captcha code you received
  const response = await fetch(`https://hcaptcha.com/siteverify`, {
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=utf-8",
    },
    body: `response=${captcha}&secret=${process.env.CAPTCHA_SECRET_KEY}`,
    method: "POST",
  });
  const captchaValidation = await response.json();

  return captchaValidation.success;
};
