import { afterEach, describe, expect, it, vi } from "vitest";

const sendServerRequest = vi.hoisted(() => vi.fn());
vi.mock(
  "../../src/modules/spark-editor/workspace/utils/sendServerRequest",
  () => ({ default: sendServerRequest }),
);
vi.mock("../../src/modules/spark-editor/utils/loadScript", () => ({
  default: vi.fn(async () => undefined),
}));

async function freshProvider() {
  vi.resetModules();
  const { default: GoogleDriveSyncProvider } = await import(
    "../../src/modules/spark-editor/workspace/providers/GoogleDriveSyncProvider"
  );
  return new GoogleDriveSyncProvider();
}

afterEach(() => {
  vi.unstubAllEnvs();
  sendServerRequest.mockReset();
});

describe("GoogleDriveSyncProvider account", () => {
  it("is signed out without asking the server when no OAuth client is configured", async () => {
    vi.stubEnv("BROWSER_GOOGLE_OAUTH_CLIENT_ID", "");
    const provider = await freshProvider();
    const account = await provider.getCurrentAccount();
    expect(sendServerRequest).not.toHaveBeenCalled();
    expect(account).toBeNull();
  });

  it("asks the server for the account when an OAuth client is configured", async () => {
    vi.stubEnv("BROWSER_GOOGLE_OAUTH_CLIENT_ID", "123-test.apps.googleusercontent.com");
    const account = { id: "a", displayName: "A", email: "a@example.com" };
    sendServerRequest.mockResolvedValue(account);
    const provider = await freshProvider();
    await expect(provider.getCurrentAccount()).resolves.toEqual(account);
    expect(sendServerRequest).toHaveBeenCalledWith(
      "GET",
      expect.stringMatching(/\/api\/auth\/account$/),
      "json",
      undefined,
      undefined,
    );
  });
});
