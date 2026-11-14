import { chunkOfAddress } from "../../program/ProgramChunk";
import type { ProgramAddress } from "../types/ProgramAddress";

export interface RoutePin {
  uri: string;
  line: number;
  offer: number;
}

export interface PinnedOptions {
  readonly offers: ReadonlyMap<string, ReadonlySet<number>>;
  readonly sites: ReadonlySet<ProgramAddress>;
  readonly unresolved: readonly RoutePin[];
  readonly key: string;
}

export const NO_PINS: PinnedOptions = {
  offers: new Map(),
  sites: new Set(),
  unresolved: [],
  key: "",
};

export const pinnedOptionsOf = (
  pins: readonly RoutePin[],
  optionAt: (uri: string, line: number) => ProgramAddress | undefined,
): PinnedOptions => {
  if (pins.length === 0) {
    return NO_PINS;
  }
  const offers = new Map<string, Set<number>>();
  const sites = new Set<ProgramAddress>();
  const unresolved: RoutePin[] = [];
  for (const pin of pins) {
    const option = optionAt(pin.uri, pin.line);
    if (option === undefined || !(pin.offer >= 1)) {
      unresolved.push(pin);
      continue;
    }
    sites.add(option);
    const source = String(option);
    let pinned = offers.get(source);
    if (!pinned) {
      pinned = new Set();
      offers.set(source, pinned);
    }
    pinned.add(pin.offer);
  }
  const key = [...offers]
    .flatMap(([source, pinned]) =>
      [...pinned].map((offer) => `${source}:${offer}`),
    )
    .sort()
    .join(",");
  return { offers, sites, unresolved, key };
};

export const pinnedOfferCounts = (
  menus: Iterable<{ sources?: readonly string[] }>,
  pinned: PinnedOptions,
): Map<string, number> => {
  const counts = new Map<string, number>();
  if (pinned.offers.size === 0) {
    return counts;
  }
  for (const menu of menus) {
    for (const source of menu.sources ?? []) {
      if (pinned.offers.has(source)) {
        counts.set(source, (counts.get(source) ?? 0) + 1);
      }
    }
  }
  return counts;
};

export const pinsNextOffer = (
  pinned: PinnedOptions,
  source: string,
  count: number,
): boolean => pinned.offers.get(source)?.has(count + 1) ?? false;

export const pinnedOfferKey = (source: string, offer: number): string =>
  `${source}:${offer}`;

export const gateWinsMenu = (
  pinned: PinnedOptions,
  offered: readonly string[],
  counts: ReadonlyMap<string, number>,
): boolean =>
  !offered.some((source) =>
    pinsNextOffer(pinned, source, counts.get(source) ?? 0),
  );

export const pinnedAtMenu = (
  pinned: PinnedOptions,
  sources: readonly string[],
  counts: ReadonlyMap<string, number>,
): number[] => {
  const indices: number[] = [];
  if (pinned.offers.size === 0) {
    return indices;
  }
  sources.forEach((source, index) => {
    if (pinsNextOffer(pinned, source, counts.get(source) ?? 0)) {
      indices.push(index);
    }
  });
  return indices;
};

export const pinnedNotOffered = (
  pinned: PinnedOptions,
  sources: readonly string[],
  counts: ReadonlyMap<string, number>,
  offeredBefore: ReadonlySet<string> = new Set(),
): { source: string; offer: number }[] => {
  const missing: { source: string; offer: number }[] = [];
  if (pinned.offers.size === 0 || sources.length === 0) {
    return missing;
  }
  const chunks = new Set(sources.map((source) => chunkOfAddress(Number(source))));
  for (const [source, offers] of pinned.offers) {
    if (
      sources.includes(source) ||
      (!chunks.has(chunkOfAddress(Number(source))) && !offeredBefore.has(source))
    ) {
      continue;
    }
    const offer = (counts.get(source) ?? 0) + 1;
    if (offers.has(offer)) {
      missing.push({ source, offer });
    }
  }
  return missing;
};
