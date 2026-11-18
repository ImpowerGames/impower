import { chromium } from "playwright";

const launches = async () => {
  try {
    const browser = await chromium.launch();
    await browser.close();
    return true;
  } catch {
    return false;
  }
};

export const browserAvailable = process.env["CI"] ? true : await launches();
