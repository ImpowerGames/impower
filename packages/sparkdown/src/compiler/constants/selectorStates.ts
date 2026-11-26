import {
  GAME_WIDE_STATES,
  isAtRuleState,
  PRESENCE_STATES,
  type Presence,
  selectorStateArguments,
  SHOWING_STATE,
  SPEAKER_STATE,
  VARIANT_STATE,
  WRITTEN_SELECTOR_STATES,
} from "../../../../sparkle-style-transformer/src/utils/sparkleSelector";

export const KNOWN_SELECTOR_STATES: ReadonlySet<string> = WRITTEN_SELECTOR_STATES;

export const isKnownSelectorState = (name: string): boolean => KNOWN_SELECTOR_STATES.has(name);

export {
  GAME_WIDE_STATES,
  isAtRuleState,
  PRESENCE_STATES,
  selectorStateArguments,
  SHOWING_STATE,
  SPEAKER_STATE,
  VARIANT_STATE,
  type Presence,
};
