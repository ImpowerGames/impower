import register from "preact-custom-element";
import SynthInspector from "./SynthInspector";

register(SynthInspector, "synth-inspector", ["value", "onInput", "onChange"], {
  shadow: false,
});
