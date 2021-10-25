import Auth from "../../impower-auth/classes/auth";

export const getToken = async (): Promise<{
  readonly token: string;
  readonly expireTimeMillis: number;
}> => {
  const logInfo = (await import("../../impower-logger/utils/logInfo")).default;
  logInfo("API", "UPDATE APP CHECK TOKEN");
  try {
    const idToken = await Auth.instance.currentUser.getIdToken(true);
    const response = await fetch("/api/verifyAppCheck", {
      credentials: "include",
      method: "POST",
      body: JSON.stringify({
        token: idToken,
      }),
      headers: { "Content-Type": "application/json" },
    });
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.message);
    }
    return result;
  } catch (error) {
    console.error(error);
  }
  return undefined;
};
