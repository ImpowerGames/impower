import type { DirectiveKind } from "../compiler/utils/readDirective";

export type DisplayWrites = "text" | "none" | "dynamic";

export interface DisplayFacts {
  character?: string;
  writes: DisplayWrites;
  pause: boolean;
  load: boolean;
  directives: readonly DirectiveKind[];
}

const factsOfCall = new WeakMap<object, DisplayFacts>();

export const recordDisplayFacts = <T extends object>(call: T, facts: DisplayFacts): T => {
  factsOfCall.set(call, facts);
  return call;
};

export const displayFactsOf = (call: object): DisplayFacts | undefined => factsOfCall.get(call);
