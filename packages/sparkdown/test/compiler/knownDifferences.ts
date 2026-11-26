import { expect } from "vitest";

export interface KnownDifferencePin {
  ticket: string;
  subject: string;
  list: string;
}

export const STALE_PIN_TITLE = "Stale known-difference pin";

function workflowCommandData(text: string): string {
  return text.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
}

function stalePinMessage(pin: KnownDifferencePin, gone: readonly string[]): string {
  return `${STALE_PIN_TITLE} (${pin.ticket}): ${pin.subject} no longer shows ${gone.join(", ")}. Remove ${gone.length === 1 ? "it" : "them"} from ${pin.list} in the pull request that fixed ${gone.length === 1 ? "it" : "them"}.`;
}

export function reportStalePin(pin: KnownDifferencePin, gone: readonly string[]): void {
  const message = stalePinMessage(pin, gone);
  console.log(process.env["GITHUB_ACTIONS"] === "true" ? `::warning title=${STALE_PIN_TITLE}::${workflowCommandData(message)}` : message);
}

export function expectWithinPin(pin: KnownDifferencePin, pinned: readonly string[], observed: readonly string[]): void {
  const unpinned = observed.filter((difference) => !pinned.includes(difference));
  expect(
    unpinned,
    `${pin.subject}: new differences, not among those ${pin.list} pins for ${pin.ticket}. A pinned difference may shrink but not grow; fix the regression.`,
  ).toEqual([]);
  const gone = pinned.filter((difference) => !observed.includes(difference));
  if (gone.length > 0) reportStalePin(pin, gone);
}
