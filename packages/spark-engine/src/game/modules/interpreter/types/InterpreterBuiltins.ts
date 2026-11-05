import type { Character } from "./Character";
import type { Inflection } from "./Inflection";
import type { Prosody } from "./Prosody";
import type { Typewriter } from "./Typewriter";

export interface InterpreterConfig {
  directives: Record<string, string>;
  fallbacks: {
    layer?: string;
    channel?: string;
  };
}

export interface InterpreterBuiltins {
  config: {
    interpreter: InterpreterConfig;
  };
  typewriter: Record<string, Typewriter>;
  character: Record<string, Character>;
  prosody: Record<string, Prosody>;
  inflection: Record<string, Inflection>;
}
