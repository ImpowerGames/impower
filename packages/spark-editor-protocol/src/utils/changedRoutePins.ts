import type { ChangeRoutePinsParams } from "../protocols/preview/ChangeRoutePinsMessage";
import type { RoutePin } from "../protocols/preview/SetRoutePinsMessage";

export type RoutePinsByScript = Record<string, { line: number; offer: number }[]>;

const samePin = (
  a: { line: number; offer: number },
  uri: string,
  b: RoutePin,
) => uri === b.uri && a.line === b.line && a.offer === b.offer;

export const changedRoutePins = (
  byScript: RoutePinsByScript,
  change: ChangeRoutePinsParams,
): RoutePinsByScript => {
  const changed: RoutePinsByScript = {};
  if (!change.removeAll) {
    for (const [uri, pins] of Object.entries(byScript)) {
      changed[uri] = pins.filter(
        (pin) => !(change.remove ?? []).some((gone) => samePin(pin, uri, gone)),
      );
    }
  }
  for (const pin of change.add ?? []) {
    const pins = (changed[pin.uri] ??= []);
    if (!pins.some((at) => samePin(at, pin.uri, pin))) {
      pins.push({ line: pin.line, offer: pin.offer });
    }
  }
  for (const [uri, pins] of Object.entries(changed)) {
    if (pins.length === 0) {
      delete changed[uri];
    }
  }
  return changed;
};
