import { chunkOfAddress } from "../../program/ProgramChunk";
import type { ProgramAddress } from "../types/ProgramAddress";

/**
 * A pin as a host keeps it: the line of an option in a script, counting
 * lines from 0, and which time the route is offered that option, from 1. A
 * pin names the k-th offer of an option rather than the k-th visit to a
 * menu, so it keeps its meaning when a thread adds options to the menu or
 * the menu is reached by different paths, and a hub is pinned meeting by
 * meeting.
 */
export interface RoutePin {
  uri: string;
  line: number;
  offer: number;
}

/** A program's options the pins name, matched at each compile
 *  (`pinnedOptionsOf`). */
export interface PinnedOptions {
  /** By option address (`Choice.sourcePath`), the offers pinned. */
  readonly offers: ReadonlyMap<string, ReadonlySet<number>>;
  /** The same options' addresses, by which a route search knows a pinned
   *  option's gate (the condition of `* if cond`) without making a string
   *  at every condition it meets. */
  readonly sites: ReadonlySet<ProgramAddress>;
  /** The pins whose line holds no option, which are ignored. */
  readonly unresolved: readonly RoutePin[];
  /** Names the pinned offers. A route planned with them carries it, and a
   *  route planned with others is not resumed or replayed. Empty with no
   *  pinned offer. */
  readonly key: string;
}

export const NO_PINS: PinnedOptions = {
  offers: new Map(),
  sites: new Set(),
  unresolved: [],
  key: "",
};

/** Match each pin to the option on its line, with `optionAt` reading a
 *  program (`ProgramRoot.optionAt`). */
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

/** How many times the menus `menus` offered each pinned option, which the
 *  route's next offer of it adds one to. */
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

/** Whether the next offer of the option `source`, offered `count` times
 *  before, is pinned. */
export const pinsNextOffer = (
  pinned: PinnedOptions,
  source: string,
  count: number,
): boolean => pinned.offers.get(source)?.has(count + 1) ?? false;

/** The indices of the options of a menu offering `sources` whose offer
 *  there is pinned, in the order the menu lists them: the first wins, and
 *  any other is not followed. */
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

/** The pinned options of the menu offering `sources` that it does not
 *  offer at a pinned offer: a once-only option the route already took, or a
 *  gated option whose gate the route left false. An option is the menu's own
 *  when it stands in the statement chunk of an option the menu offers, or
 *  is one of `offeredBefore`, the options the route met this menu offering
 *  before, among them those a thread (`<- name`) adds from another
 *  statement. */
export const pinnedNotOffered = (
  pinned: PinnedOptions,
  sources: readonly string[],
  counts: ReadonlyMap<string, number>,
  offeredBefore: ReadonlySet<string> = new Set(),
): { source: string; offer: number }[] => {
  const missing: { source: string; offer: number }[] = [];
  const first = sources[0];
  if (pinned.offers.size === 0 || first === undefined) {
    return missing;
  }
  const chunk = chunkOfAddress(Number(first));
  for (const [source, offers] of pinned.offers) {
    if (
      sources.includes(source) ||
      (chunkOfAddress(Number(source)) !== chunk && !offeredBefore.has(source))
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
