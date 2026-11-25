import {
  PRESENCE_STATES,
  type Presence,
  selectorStateArguments,
  WRITTEN_SELECTOR_STATES,
} from "../../../../sparkle-style-transformer/src/utils/sparkleSelector";

export const KNOWN_SELECTOR_STATES: ReadonlySet<string> = WRITTEN_SELECTOR_STATES;

export const isKnownSelectorState = (name: string): boolean => KNOWN_SELECTOR_STATES.has(name);

export { PRESENCE_STATES, selectorStateArguments, type Presence };
