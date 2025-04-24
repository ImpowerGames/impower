import { parseSSL, renderHTML } from "./parser";

export function runTest(input: string, state: Record<string, any>): string {
  const parsed = parseSSL(input);
  const ctx = {
    parsed,
    state,
    renderStyles: () => {},
    renderHTML: () => {},
  };
  return renderHTML(parsed, ctx);
}

export function runAssertion(
  input: string,
  state: Record<string, any>,
  expected: string,
  label: string = ""
) {
  const result = runTest(input, state).trim();
  const expectedTrimmed = expected.trim();
  const passed = result === expectedTrimmed;

  console.log(`Test: ${label || "(Unnamed)"}`);
  if (passed) {
    console.log("✅ Passed");
  } else {
    console.error("❌ Failed");
    console.log("Expected:" + expectedTrimmed);
    console.log("Received:" + result);
  }
}
