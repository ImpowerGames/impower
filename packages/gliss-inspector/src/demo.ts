import { randomizeProperties } from "../../spark-engine/src/game/core/utils/randomizeProperties";
import { audioBuiltinDefinitions } from "../../spark-engine/src/game/modules/audio/audioBuiltinDefinitions";
import { audioRandomDefinitions } from "../../spark-engine/src/game/modules/audio/audioRandomDefinitions";
import { audioSchemaDefinitions } from "../../spark-engine/src/game/modules/audio/audioSchemaDefinitions";
import { MAJOR_ARPEGGIOS_UP } from "../../spark-engine/src/game/modules/audio/constants/ARPEGGIOS";
import { type Synth } from "../../spark-engine/src/game/modules/audio/types/Synth";
import { synthesizeSound } from "../../spark-engine/src/game/modules/audio/utils/synthesizeSound";
import "./demo.css";
import { Gliss, type GlissConfigItem } from "./gliss/gliss";
import { drawSoundWaveform } from "./utils/drawSoundWaveform";

const icons = {
  general:
    '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="21" x2="4" y2="14"></line><line x1="4" y1="10" x2="4" y2="3"></line><line x1="12" y1="21" x2="12" y2="12"></line><line x1="12" y1="8" x2="12" y2="3"></line><line x1="20" y1="21" x2="20" y2="16"></line><line x1="20" y1="12" x2="20" y2="3"></line><line x1="1" y1="14" x2="7" y2="14"></line><line x1="9" y1="8" x2="15" y2="8"></line><line x1="17" y1="16" x2="23" y2="16"></line></svg>',
  envelope:
    '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 20 L 7 5 L 12 12 H 18 L 21 20" /></svg>',
  pitch:
    '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg>',
  highpass:
    '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 20h18" /><path d="M3 4v16" /><path d="M5 16 c 5 0, 7 -10, 12 -10 h4" /></svg>',
  lowpass:
    '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 20h18" /><path d="M3 4v16" /><path d="M5 6 h 4 c 5 0, 7 10, 12 10" /></svg>',
  wahwah:
    '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 16 c 4 0, 5 -10, 9 -10 s 5 10, 9 10" /><path d="M8 20 h 8" /><path d="M10 18 l -2 2 l 2 2" /><path d="M14 18 l 2 2 l -2 2" /></svg>',
  distortion:
    '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12 l 2.5 -6 h 5.5 l 4 12 h 5.5 l 2.5 -6" /></svg>',
  arpeggio:
    '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4v-4h4v-4h4v-4h4" /></svg>',
  vibrato:
    '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12 q 3 -6, 6 0 t 5 0 t 4 0 t 3 0 t 2 0" /></svg>',
  tremolo:
    '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12 q 1.5 -2, 3 0 q 1.5 5, 3 0 q 1.5 -8, 3 0 q 1.5 10, 3 0 q 1.5 -8, 3 0 q 1.5 5, 3 0 q 1.5 -2, 3 0" /></svg>',
  harmony:
    '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12c2-8 6-8 8 0c2 8 6 8 8 0" /><path d="M6 12c2-8 6-8 8 0c2 8 6 8 8 0" /></svg>',
  reverb:
    '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="5" x2="3" y2="19" /><line x1="7" y1="7" x2="7" y2="17" /><line x1="10" y1="9" x2="10" y2="15" /><line x1="13" y1="10" x2="13" y2="14" /><line x1="16" y1="11" x2="16" y2="13" /><line x1="18" y1="11.5" x2="18" y2="12.5" /><line x1="20" y1="11.8" x2="20" y2="12.2" /></svg>',
  dice: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM7.5 18c-.83 0-1.5-.67-1.5-1.5S6.67 15 7.5 15s1.5.67 1.5 1.5S8.33 18 7.5 18zm0-9c-.83 0-1.5-.67-1.5-1.5S6.67 6 7.5 6s1.5.67 1.5 1.5S8.33 9 7.5 9zm4.5 4.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm4.5 4.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm0-9c-.83 0-1.5-.67-1.5-1.5S15.67 6 16.5 6s1.5.67 1.5 1.5S17.33 9 16.5 9z"/></svg>`,
  coin: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M17 3.34a10 10 0 1 1 -15 8.66l.005 -.324a10 10 0 0 1 14.995 -8.336zm-5 2.66a1 1 0 0 0 -1 1a3 3 0 1 0 0 6v2a1.024 1.024 0 0 1 -.866 -.398l-.068 -.101a1 1 0 0 0 -1.732 .998a3 3 0 0 0 2.505 1.5h.161a1 1 0 0 0 .883 .994l.117 .007a1 1 0 0 0 1 -1l.176 -.005a3 3 0 0 0 -.176 -5.995v-2c.358 -.012 .671 .14 .866 .398l.068 .101a1 1 0 0 0 1.732 -.998a3 3 0 0 0 -2.505 -1.501h-.161a1 1 0 0 0 -1 -1zm1 7a1 1 0 0 1 0 2v-2zm-2 -4v2a1 1 0 0 1 0 -2z" /></svg>`,
  jump: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M14.143 11.486a1 1 0 0 1 1.714 1.028c-1.502 2.505 -2.41 4.89 -2.87 7.65c-.16 .956 -1.448 1.15 -1.881 .283c-2.06 -4.12 -3.858 -4.976 -6.79 -3.998a1 1 0 1 1 -.632 -1.898c3.2 -1.067 5.656 -.373 7.803 2.623l.091 .13l.011 -.04c.522 -1.828 1.267 -3.55 2.273 -5.3l.28 -.478z" /><path d="M18 4a3 3 0 1 0 0 6a3 3 0 0 0 0 -6" /></svg>`,
  powerup: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M10 2c0 -.88 1.056 -1.331 1.692 -.722c1.958 1.876 3.096 5.995 1.75 9.12l-.08 .174l.012 .003c.625 .133 1.203 -.43 2.303 -2.173l.14 -.224a1 1 0 0 1 1.582 -.153c1.334 1.435 2.601 4.377 2.601 6.27c0 4.265 -3.591 7.705 -8 7.705s-8 -3.44 -8 -7.706c0 -2.252 1.022 -4.716 2.632 -6.301l.605 -.589c.241 -.236 .434 -.43 .618 -.624c1.43 -1.512 2.145 -2.924 2.145 -4.78" /></svg>`,
  lose: `<svg width="24" height="24" viewBox="0 0 640 640" fill="currentColor"><path d="M480 491.4c58.5-44 96-111.6 96-187.4c0-132.5-114.6-240-256-240S64 171.5 64 304c0 75.8 37.5 143.4 96 187.4V528c0 26.5 21.5 48 48 48h32v-40c0-13.3 10.7-24 24-24s24 10.7 24 24v40h64v-40c0-13.3 10.7-24 24-24s24 10.7 24 24v40h32c26.5 0 48-21.5 48-48zM160 320c0-35.3 28.7-64 64-64s64 28.7 64 64s-28.7 64-64 64s-64-28.7-64-64m256-64c35.3 0 64 28.7 64 64s-28.7 64-64 64s-64-28.7-64-64s28.7-64 64-64"/></svg>`,
  zap: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M13 2l.018 .001l.016 .001l.083 .005l.011 .002h.011l.038 .009l.052 .008l.016 .006l.011 .001l.029 .011l.052 .014l.019 .009l.015 .004l.028 .014l.04 .017l.021 .012l.022 .01l.023 .015l.031 .017l.034 .024l.018 .011l.013 .012l.024 .017l.038 .034l.022 .017l.008 .01l.014 .012l.036 .041l.026 .027l.006 .009c.12 .147 .196 .322 .218 .513l.001 .012l.002 .041l.004 .064v6h5a1 1 0 0 1 .868 1.497l-.06 .091l-8 11c-.568 .783 -1.808 .38 -1.808 -.588v-6h-5a1 1 0 0 1 -.868 -1.497l.06 -.091l8 -11l.01 -.013l.018 -.024l.033 -.038l.018 -.022l.009 -.008l.013 -.014l.04 -.036l.028 -.026l.008 -.006a1 1 0 0 1 .402 -.199l.011 -.001l.027 -.005l.074 -.013l.011 -.001l.041 -.002z" /></svg>`,
  hurt: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20.207 3.793a5.95 5.95 0 0 1 .179 8.228l-.179 .186l-8 8a5.95 5.95 0 0 1 -8.593 -8.228l.179 -.186l8 -8a5.95 5.95 0 0 1 8.414 0zm-8.207 9.207a1 1 0 0 0 -1 1l.007 .127a1 1 0 0 0 1.993 -.117l-.007 -.127a1 1 0 0 0 -.993 -.883zm2 -2a1 1 0 0 0 -1 1l.007 .127a1 1 0 0 0 1.993 -.117l-.007 -.127a1 1 0 0 0 -.993 -.883zm-4 0a1 1 0 0 0 -1 1l.007 .127a1 1 0 0 0 1.993 -.117l-.007 -.127a1 1 0 0 0 -.993 -.883zm2 -2a1 1 0 0 0 -1 1l.007 .127a1 1 0 0 0 1.993 -.117l-.007 -.127a1 1 0 0 0 -.993 -.883z" /></svg>`,
  boom: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7.514 3.836c.151 -.909 1.346 -1.147 1.834 -.366c2.294 3.67 4.275 4.048 5.758 1.083c.471 -.944 1.894 -.608 1.894 .447c0 2.448 1.552 4 4 4c.89 0 1.337 1.077 .707 1.707c-1.61 1.61 -1.61 2.975 0 4.581c.63 .63 .185 1.707 -.706 1.708c-2.448 .003 -3.001 .556 -3.001 3.004c0 .961 -1.223 1.369 -1.8 .6c-2.325 -3.1 -5.494 -2.856 -7.368 -.045c-.503 .754 -1.67 .504 -1.818 -.39c-.365 -2.188 -1.04 -2.656 -4.178 -3.179a1 1 0 0 1 -.543 -1.693c1.618 -1.618 1.618 -3.027 -.053 -4.981l-.009 -.013l-.013 -.014l-.044 -.062l-.01 -.011l-.006 -.013l-.038 -.066l-.017 -.028l-.001 -.004l-.027 -.066l-.019 -.041a1 1 0 0 1 -.051 -.233l-.002 -.045l-.003 -.068a1 1 0 0 1 .06 -.328l.009 -.023l.023 -.049l.011 -.029l.009 -.015l.007 -.016l.019 -.029l.02 -.035l.012 -.017l.013 -.022l.027 -.034l.011 -.016l.018 -.02l.02 -.025l.021 -.02l.015 -.017l.035 -.032l.02 -.019l.009 -.007l.018 -.015l.055 -.039l.018 -.015l.008 -.004l.01 -.007l.061 -.034l.028 -.016l.004 -.002l.063 -.026l.044 -.019a1 1 0 0 1 .115 -.032l.004 -.002l.267 -.063c2.39 -.613 3.934 -2.19 4.411 -4.523z" /></svg>`,
  push: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12.089 3.634a2 2 0 0 0 -1.089 1.78l-.001 2.585l-1.999 .001a1 1 0 0 0 -1 1v6l.007 .117a1 1 0 0 0 .993 .883l1.999 -.001l.001 2.587a2 2 0 0 0 3.414 1.414l6.586 -6.586a2 2 0 0 0 0 -2.828l-6.586 -6.586a2 2 0 0 0 -2.18 -.434l-.145 .068z" /><path d="M3 8a1 1 0 0 1 .993 .883l.007 .117v6a1 1 0 0 1 -1.993 .117l-.007 -.117v-6a1 1 0 0 1 1 -1z" /><path d="M6 8a1 1 0 0 1 .993 .883l.007 .117v6a1 1 0 0 1 -1.993 .117l-.007 -.117v-6a1 1 0 0 1 1 -1z" /></svg>`,
  blip: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M13.5 2c0 .444-.193.843-.5 1.118V5h5a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3h5V3.118A1.5 1.5 0 1 1 13.5 2M0 10h2v6H0zm24 0h-2v6h2zM9 14.5a1.5 1.5 0 1 0 0-3a1.5 1.5 0 0 0 0 3m7.5-1.5a1.5 1.5 0 1 0-3 0a1.5 1.5 0 0 0 3 0"/></svg>`,
  beep: `<svg viewBox="0 0 24 24" fill="currentColor"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 10v4m3-7v10m3-14v18m3-11v4m3-7v10m3-5"/></svg>`,
  tap: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M11.5 2A2.5 2.5 0 0 0 9 4.5v6.41l-1.495-.574a4.34 4.34 0 0 0-5.382 1.996a1.053 1.053 0 0 0 .512 1.463c5.662 2.456 7.454 4.673 8.19 6.29c.526 1.156 1.73 2.104 3.172 1.882l3.455-.533a2.75 2.75 0 0 0 2.25-2.054l1.153-4.633a4.75 4.75 0 0 0-3.872-5.839L14 8.44V4.5A2.5 2.5 0 0 0 11.5 2"/></svg>`,
  snap: `<svg width="24" height="24" viewBox="0 0 14 14" fill="currentColor"><path d="M3.722 1.684a.625.625 0 1 0 1.245-.112L4.904.864a.625.625 0 1 0-1.245.112zm3.678.73a.625.625 0 0 0-.941-.823l-.467.535a.625.625 0 0 0 .94.823zm-6.008-.113a.625.625 0 0 0 .25.848l.623.34a.625.625 0 1 0 .599-1.098l-.624-.34a.625.625 0 0 0-.848.25m1.24 4.963l2.898.776c-.857 3.66.784 5.06 2.474 5.513c.628.169 1.678.212 2.524.054c.547-.103.91-.571 1.054-1.11l1.034-3.858a2 2 0 0 0-.048-1.19l-.88-2.467a1.373 1.373 0 0 0-2.663.538l.05.882l-5.796-1.553a1.25 1.25 0 0 0-.647 2.415" clip-rule="evenodd"/></svg>`,
  clack: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 5a3 3 0 0 1 3 3v8a3 3 0 0 1 -3 3h-16a3 3 0 0 1 -3 -3v-8a3 3 0 0 1 3 -3zm-14 8a1 1 0 0 0 -1 1v.01a1 1 0 0 0 2 0v-.01a1 1 0 0 0 -1 -1m12 0a1 1 0 0 0 -1 1v.01a1 1 0 0 0 2 0v-.01a1 1 0 0 0 -1 -1m-7.998 0a1 1 0 0 0 -.004 2l4 .01a1 1 0 0 0 .005 -2zm-4.002 -4a1 1 0 0 0 -1 1v.01a1 1 0 0 0 2 0v-.01a1 1 0 0 0 -1 -1m4 0a1 1 0 0 0 -1 1v.01a1 1 0 0 0 2 0v-.01a1 1 0 0 0 -1 -1m4 0a1 1 0 0 0 -1 1v.01a1 1 0 0 0 2 0v-.01a1 1 0 0 0 -1 -1m4 0a1 1 0 0 0 -1 1v.01a1 1 0 0 0 2 0v-.01a1 1 0 0 0 -1 -1" /></svg>`,
};

interface ToolParam extends GlissConfigItem {
  path?: string;
}

interface ToolConfig {
  name: string;
  icon: string;
  params: Record<string, ToolParam>;
}

const arpToneOpts = MAJOR_ARPEGGIOS_UP;

const defaultSynth = audioBuiltinDefinitions().synth?.$default;

const defaultState: Synth = {
  ...defaultSynth,
};

const synthSchema = audioSchemaDefinitions().synth.$schema;

const synthRandomizations: Record<string, any> = audioRandomDefinitions().synth;

const step = (
  schemaRange: [number, number, number, ...string[]] | undefined,
) => {
  return schemaRange?.[0];
};
const min = (
  schemaRange: [number, number, number, ...string[]] | undefined,
) => {
  return schemaRange?.[1];
};
const max = (
  schemaRange: [number, number, number, ...string[]] | undefined,
) => {
  return schemaRange?.[2];
};

const appConfig: Record<string, ToolConfig> = {
  general: {
    name: "General",
    icon: icons.general,
    params: {
      shape: { name: "Shape", path: "shape", options: synthSchema.shape },
      volume: {
        name: "Volume",
        path: "volume",
        min: min(synthSchema.volume),
        max: max(synthSchema.volume),
        step: step(synthSchema.volume),
      },
      compression: {
        name: "Compression",
        path: "compression",
        min: min(synthSchema.compression),
        max: max(synthSchema.compression),
        step: step(synthSchema.compression),
      },
    },
  },
  envelope: {
    name: "Envelope",
    icon: icons.envelope,
    params: {
      offset: {
        name: "Offset",
        min: min(synthSchema.envelope?.offset),
        max: max(synthSchema.envelope?.offset),
        step: step(synthSchema.envelope?.offset),
      },
      attack: {
        name: "Attack",
        min: min(synthSchema.envelope?.attack),
        max: max(synthSchema.envelope?.attack),
        step: step(synthSchema.envelope?.attack),
      },
      decay: {
        name: "Decay",
        min: min(synthSchema.envelope?.decay),
        max: max(synthSchema.envelope?.decay),
        step: step(synthSchema.envelope?.decay),
      },
      sustain: {
        name: "Sustain",
        min: min(synthSchema.envelope?.sustain),
        max: max(synthSchema.envelope?.sustain),
        step: step(synthSchema.envelope?.sustain),
      },
      release: {
        name: "Release",
        min: min(synthSchema.envelope?.release),
        max: max(synthSchema.envelope?.release),
        step: step(synthSchema.envelope?.release),
      },
      level: {
        name: "Level",
        min: min(synthSchema.envelope?.level),
        max: max(synthSchema.envelope?.level),
        step: step(synthSchema.envelope?.level),
      },
    },
  },
  pitch: {
    name: "Pitch",
    icon: icons.pitch,
    params: {
      frequency: {
        name: "Freq",
        min: min(synthSchema.pitch?.frequency),
        max: max(synthSchema.pitch?.frequency),
        step: step(synthSchema.pitch?.frequency),
      },
      frequency_ramp: {
        name: "Ramp",
        min: min(synthSchema.pitch?.frequency_ramp),
        max: max(synthSchema.pitch?.frequency_ramp),
        step: step(synthSchema.pitch?.frequency_ramp),
      },
      frequency_torque: {
        name: "Torque",
        min: min(synthSchema.pitch?.frequency_torque),
        max: max(synthSchema.pitch?.frequency_torque),
        step: step(synthSchema.pitch?.frequency_torque),
      },
      frequency_jerk: {
        name: "Jerk",
        min: min(synthSchema.pitch?.frequency_jerk),
        max: max(synthSchema.pitch?.frequency_jerk),
        step: step(synthSchema.pitch?.frequency_jerk),
      },
      phase: {
        name: "Phase",
        min: min(synthSchema.pitch?.phase),
        max: max(synthSchema.pitch?.phase),
        step: step(synthSchema.pitch?.phase),
      },
    },
  },
  highpass: {
    name: "Highpass",
    icon: icons.highpass,
    params: {
      cutoff: {
        name: "Cutoff",
        min: min(synthSchema.highpass?.cutoff),
        max: max(synthSchema.highpass?.cutoff),
        step: step(synthSchema.highpass?.cutoff),
      },
      cutoff_ramp: {
        name: "Ramp",
        min: min(synthSchema.highpass?.cutoff_ramp),
        max: max(synthSchema.highpass?.cutoff_ramp),
        step: step(synthSchema.highpass?.cutoff_ramp),
      },
    },
  },
  lowpass: {
    name: "Lowpass",
    icon: icons.lowpass,
    params: {
      cutoff: {
        name: "Cutoff",
        min: min(synthSchema.lowpass?.cutoff),
        max: max(synthSchema.lowpass?.cutoff),
        step: step(synthSchema.lowpass?.cutoff),
      },
      cutoff_ramp: {
        name: "Ramp",
        min: min(synthSchema.lowpass?.cutoff_ramp),
        max: max(synthSchema.lowpass?.cutoff_ramp),
        step: step(synthSchema.lowpass?.cutoff_ramp),
      },
      resonance: {
        name: "Resonance",
        min: min(synthSchema.lowpass?.resonance),
        max: max(synthSchema.lowpass?.resonance),
        step: step(synthSchema.lowpass?.resonance),
      },
    },
  },
  wahwah: {
    name: "Wah Wah",
    icon: icons.wahwah,
    params: {
      rate: {
        name: "Rate",
        initial: 600,
        min: min(synthSchema.wahwah?.rate),
        max: max(synthSchema.wahwah?.rate),
        step: step(synthSchema.wahwah?.rate),
      },
      rate_ramp: {
        name: "Rate Ramp",
        min: min(synthSchema.wahwah?.rate_ramp),
        max: max(synthSchema.wahwah?.rate_ramp),
        step: step(synthSchema.wahwah?.rate_ramp),
      },
      strength: {
        name: "Strength",
        min: min(synthSchema.wahwah?.strength),
        max: max(synthSchema.wahwah?.strength),
        step: step(synthSchema.wahwah?.strength),
      },
      strength_ramp: {
        name: "Strength Ramp",
        min: min(synthSchema.wahwah?.strength_ramp),
        max: max(synthSchema.wahwah?.strength_ramp),
        step: step(synthSchema.wahwah?.strength_ramp),
      },
      shape: { name: "Shape", options: synthSchema.wahwah?.shape },
    },
  },
  distortion: {
    name: "Distort",
    icon: icons.distortion,
    params: {
      edge: {
        name: "Edge",
        min: min(synthSchema.distortion?.edge),
        max: max(synthSchema.distortion?.edge),
        step: step(synthSchema.distortion?.edge),
      },
      edge_ramp: {
        name: "Edge Ramp",
        min: min(synthSchema.distortion?.edge_ramp),
        max: max(synthSchema.distortion?.edge_ramp),
        step: step(synthSchema.distortion?.edge_ramp),
      },
      grit: {
        name: "Grit",
        min: min(synthSchema.distortion?.grit),
        max: max(synthSchema.distortion?.grit),
        step: step(synthSchema.distortion?.grit),
      },
      grit_ramp: {
        name: "Grit Ramp",
        min: min(synthSchema.distortion?.grit_ramp),
        max: max(synthSchema.distortion?.grit_ramp),
        step: step(synthSchema.distortion?.grit_ramp),
      },
    },
  },
  arpeggio: {
    name: "Arpeggio",
    icon: icons.arpeggio,
    params: {
      rate: {
        name: "Rate",
        initial: 50,
        min: min(synthSchema.arpeggio?.rate),
        max: max(synthSchema.arpeggio?.rate),
        step: step(synthSchema.arpeggio?.rate),
      },
      rate_ramp: {
        name: "Rate Ramp",
        min: min(synthSchema.arpeggio?.rate_ramp),
        max: max(synthSchema.arpeggio?.rate_ramp),
        step: step(synthSchema.arpeggio?.rate_ramp),
      },
      max_octaves: {
        name: "Max Octaves",
        min: min(synthSchema.arpeggio?.max_octaves),
        max: max(synthSchema.arpeggio?.max_octaves),
        step: step(synthSchema.arpeggio?.max_octaves),
      },
      max_notes: {
        name: "Max Notes",
        min: min(synthSchema.arpeggio?.max_notes),
        max: max(synthSchema.arpeggio?.max_notes),
        step: step(synthSchema.arpeggio?.max_notes),
      },
      direction: {
        name: "Direction",
        options: synthSchema.arpeggio?.direction,
      },
      tones: { name: "Tones", initial: arpToneOpts[0], options: arpToneOpts },
    },
  },
  vibrato: {
    name: "Vibrato",
    icon: icons.vibrato,
    params: {
      rate: {
        name: "Rate",
        min: min(synthSchema.vibrato?.rate),
        max: max(synthSchema.vibrato?.rate),
        step: step(synthSchema.vibrato?.rate),
      },
      rate_ramp: {
        name: "Rate Ramp",
        min: min(synthSchema.vibrato?.rate_ramp),
        max: max(synthSchema.vibrato?.rate_ramp),
        step: step(synthSchema.vibrato?.rate_ramp),
      },
      strength: {
        name: "Strength",
        min: min(synthSchema.vibrato?.strength),
        max: max(synthSchema.vibrato?.strength),
        step: step(synthSchema.vibrato?.strength),
      },
      strength_ramp: {
        name: "Strength Ramp",
        min: min(synthSchema.vibrato?.strength_ramp),
        max: max(synthSchema.vibrato?.strength_ramp),
        step: step(synthSchema.vibrato?.strength_ramp),
      },
      shape: { name: "Shape", options: synthSchema.vibrato?.shape },
    },
  },
  tremolo: {
    name: "Tremolo",
    icon: icons.tremolo,
    params: {
      rate: {
        name: "Rate",
        initial: 50,
        min: min(synthSchema.tremolo?.rate),
        max: max(synthSchema.tremolo?.rate),
        step: step(synthSchema.tremolo?.rate),
      },
      rate_ramp: {
        name: "Rate Ramp",
        min: min(synthSchema.tremolo?.rate_ramp),
        max: max(synthSchema.tremolo?.rate_ramp),
        step: step(synthSchema.tremolo?.rate_ramp),
      },
      strength: {
        name: "Strength",
        min: min(synthSchema.tremolo?.strength),
        max: max(synthSchema.tremolo?.strength),
        step: step(synthSchema.tremolo?.strength),
      },
      strength_ramp: {
        name: "Strength Ramp",
        min: min(synthSchema.tremolo?.strength_ramp),
        max: max(synthSchema.tremolo?.strength_ramp),
        step: step(synthSchema.tremolo?.strength_ramp),
      },
      shape: { name: "Shape", options: synthSchema.tremolo?.shape },
    },
  },
  reverb: {
    name: "Reverb",
    icon: icons.reverb,
    params: {
      mix: {
        name: "Mix",
        min: min(synthSchema.reverb?.mix),
        max: max(synthSchema.reverb?.mix),
        step: step(synthSchema.reverb?.mix),
      },
      room_size: {
        name: "Room Size",
        min: min(synthSchema.reverb?.room_size),
        max: max(synthSchema.reverb?.room_size),
        step: step(synthSchema.reverb?.room_size),
      },
      damping: {
        name: "Damping",
        min: min(synthSchema.reverb?.damping),
        max: max(synthSchema.reverb?.damping),
        step: step(synthSchema.reverb?.damping),
      },
    },
  },
};

const getValueByPath = (obj: any, path: string) =>
  path
    .split(".")
    .reduce((o, p) => (o && o[p] !== undefined ? o[p] : undefined), obj);

const setValueByPath = (obj: any, path: string, value: unknown) => {
  const parts = path.split(".");
  const last = parts.pop();
  const target = parts.reduce((o, p) => (o[p] = o[p] || {}), obj);
  if (last != null) {
    target[last] = value;
  }
};

const getRandomizationLabel = (schemaName: string) => {
  return schemaName === "$random"
    ? "random"
    : schemaName.split(":")[1] || schemaName;
};
const getRandomizationIcon = (schemaName: string) => {
  const key = schemaName.split(":")[1] || schemaName;
  return key === "$random" ? icons.dice : icons[key as keyof typeof icons];
};

document.addEventListener("DOMContentLoaded", () => {
  const container = document.getElementById("editor-container") as HTMLElement;
  const playCanvas = document.getElementById(
    "play-canvas",
  ) as HTMLCanvasElement;
  const canvasCtx = playCanvas.getContext("2d") as CanvasRenderingContext2D;
  const headerTitle = document.getElementById("header-title") as HTMLElement;
  const headerSubtitle = document.getElementById(
    "header-subtitle",
  ) as HTMLElement;
  const btnPower = document.getElementById("btn-power") as HTMLElement;

  let globalState = structuredClone(defaultState);
  let workingState: typeof defaultState | null = null;
  let isEditing: boolean = false;
  let activeToolId: string | null = null;
  let audioCtx: AudioContext | null = null;

  let visualBuffers: {
    sound: Float32Array<ArrayBuffer> | null;
    volume: Float32Array<ArrayBuffer> | null;
    pitch: Float32Array<ArrayBuffer> | null;
    range: [number, number];
  } = {
    sound: null,
    volume: null,
    pitch: null,
    range: [0, 0],
  };

  const resizeCanvas = () => {
    const rect = container.getBoundingClientRect();
    playCanvas.width = rect.width;
    playCanvas.height = rect.height;
    computeAndDraw();
  };

  const getSynthConfig = (useGlobalOnly: boolean = false) => {
    const state =
      isEditing && workingState && !useGlobalOnly ? workingState : globalState;

    return {
      ...state,
    };
  };

  const computeAndDraw = (useGlobalOnly: boolean = false) => {
    if (!audioCtx)
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const SAMPLE_RATE = audioCtx.sampleRate;

    const synthConfig = getSynthConfig(useGlobalOnly);

    let soundDuration =
      synthConfig.envelope.offset +
      synthConfig.envelope.attack +
      synthConfig.envelope.decay +
      synthConfig.envelope.sustain +
      synthConfig.envelope.release;

    let tailDuration = 0;

    if (synthConfig.reverb.on) {
      const room = synthConfig.reverb.room_size;
      const feedback = 0.7 + 0.28 * room;
      const longestDelaySamples = 1617 * (SAMPLE_RATE / 44100);
      const longestDelaySeconds = longestDelaySamples / SAMPLE_RATE;
      // Estimate decay to -60dB
      tailDuration =
        (longestDelaySeconds * -3) / Math.log10(Math.max(feedback, 0.001));
      // Safety cap to prevent infinity or massive buffers
      tailDuration = Math.min(tailDuration, 5.0);
    }

    const totalDuration = soundDuration + tailDuration;

    const BUFFER_LENGTH = totalDuration * SAMPLE_RATE;

    visualBuffers.sound = new Float32Array(BUFFER_LENGTH);
    visualBuffers.volume = new Float32Array(BUFFER_LENGTH);
    visualBuffers.pitch = new Float32Array(BUFFER_LENGTH);
    visualBuffers.range = [0, 0];

    console.log(synthConfig);

    synthesizeSound(
      synthConfig as any,
      false,
      false,
      SAMPLE_RATE,
      0,
      BUFFER_LENGTH,
      visualBuffers.sound,
      visualBuffers.volume,
      visualBuffers.pitch,
      visualBuffers.range,
      synthConfig.volume,
    );

    if (canvasCtx) {
      drawSoundWaveform(canvasCtx, {
        width: playCanvas.width,
        height: playCanvas.height,
        xAxisColor: "rgba(255, 255, 255, 0.1)",
        frequencyFillColor: "rgba(33, 150, 243, 0.1)",
        volumeFillColor: "rgba(33, 150, 243, 0.08)",
        waveColor: "#2196F3",
        maxZoomOffset: 100,
        maxScale: 1,
        xOffset: 0,
        zoomOffset: 0,
        soundBuffer: visualBuffers.sound,
        volumeBuffer: visualBuffers.volume,
        pitchBuffer: visualBuffers.pitch,
        pitchRange: visualBuffers.range,
      });
    }
  };

  const triggerSound = () => {
    if (!audioCtx)
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();
    if (!visualBuffers.sound) return;

    const audioBuffer = audioCtx.createBuffer(
      1,
      visualBuffers.sound.length,
      audioCtx.sampleRate,
    );
    audioBuffer.copyToChannel(visualBuffers.sound, 0);

    const source = audioCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioCtx.destination);
    source.start();
  };

  const updateTileStatus = () => {
    document.querySelectorAll<HTMLElement>(".tile-item").forEach((tile) => {
      const toolId = tile.dataset.toolId;
      if (!toolId || !appConfig[toolId]) return;

      let isOn = true;
      if (
        (globalState as any)[toolId] &&
        typeof (globalState as any)[toolId].on !== "undefined"
      ) {
        isOn = (globalState as any)[toolId].on;
      }

      if (isOn) {
        tile.classList.add("enabled");
      } else {
        tile.classList.remove("enabled");
      }
    });
  };

  const rootNode = container.getRootNode();
  const root =
    rootNode instanceof ShadowRoot
      ? rootNode
      : rootNode instanceof HTMLElement
        ? (rootNode.shadowRoot ?? document)
        : document;

  const sheet = new CSSStyleSheet();
  sheet.replaceSync(Gliss.css);
  root.adoptedStyleSheets.push(sheet);

  const editor = new Gliss(container, {
    onChange: (paramKey, newValue, currentToolState) => {
      if (activeToolId) {
        const path =
          appConfig[activeToolId].params[paramKey].path ||
          `${activeToolId}.${paramKey}`;
        setValueByPath(workingState, path, newValue);
      }
      computeAndDraw();
    },
    onInteractStart: () => {
      hideInstructions();
    },
    onInteractEnd: () => {
      triggerSound();
    },
    onTap: () => {
      triggerSound();
    },
  });

  // UI State Transitions
  const switchToMainMode = () => {
    isEditing = false;
    editor.setEnabled(false);
    workingState = null;
    activeToolId = null;

    (document.getElementById("toolbar-main") as HTMLElement).style.display =
      "flex";
    (document.getElementById("toolbar-edit") as HTMLElement).style.display =
      "none";
    btnPower.style.display = "none";
    hideInstructions();

    headerTitle.innerText = "GlissTone";
    headerSubtitle.innerText = "Tap canvas to play sound";

    updateTileStatus();
    computeAndDraw();
  };

  const closeDrawers = () => {
    document.getElementById("edit-drawer")?.classList.remove("active");
    document.getElementById("randomize-drawer")?.classList.remove("active");
  };

  const showInstructions = () => {
    const instructions = document.getElementById("instructions") as HTMLElement;
    instructions.classList.add("active");
  };

  const hideInstructions = () => {
    const instructions = document.getElementById("instructions") as HTMLElement;
    instructions.classList.remove("active");
  };

  const switchToEditMode = (toolId: string) => {
    isEditing = true;
    activeToolId = toolId;

    workingState = structuredClone(globalState);

    closeDrawers();

    // Auto-enable modulators when opening their tool view
    if (
      (workingState as any)[toolId] &&
      typeof (workingState as any)[toolId].on !== "undefined"
    ) {
      (workingState as any)[toolId].on = true;
      btnPower.style.display = "flex";
      btnPower.classList.add("active");
    } else {
      btnPower.style.display = "none";
    }

    let justTurnedOn = false;

    // Apply configured defaults if the tool was just enabled or hasn't been tweaked yet
    Object.keys(appConfig[toolId].params).forEach((key) => {
      const paramConfig = appConfig[toolId].params[key];
      if (paramConfig.initial !== undefined) {
        const path = paramConfig.path || `${toolId}.${key}`;
        const currentValue = getValueByPath(workingState, path);
        const defaultStateValue = getValueByPath(defaultState, path);

        if (
          justTurnedOn ||
          JSON.stringify(currentValue) === JSON.stringify(defaultStateValue)
        ) {
          setValueByPath(workingState, path, paramConfig.initial);
        }
      }
    });

    const editorValues: any = {};
    Object.keys(appConfig[toolId].params).forEach((key) => {
      const path = appConfig[toolId].params[key].path || `${toolId}.${key}`;
      editorValues[key] = getValueByPath(workingState, path);
    });

    editor.loadConfig(appConfig[toolId].params, editorValues);
    editor.setEnabled(true);

    const toolbarMainEl = document.getElementById("toolbar-main");
    const toolbarEditEl = document.getElementById("toolbar-edit");
    if (toolbarMainEl) {
      toolbarMainEl.style.display = "none";
    }
    if (toolbarEditEl) {
      toolbarEditEl.style.display = "flex";
    }
    showInstructions();

    headerTitle.innerText = appConfig[toolId].name;
    headerSubtitle.innerText =
      "Drag Vertically to Select • Horizontally to Adjust";

    computeAndDraw();
    triggerSound();
  };

  // Click preview to play sound
  playCanvas.addEventListener("click", (e) => {
    e.preventDefault();
    triggerSound();
  });

  // Modulator Toggle Logic (Snapseed top right power button)
  btnPower.addEventListener("click", (e) => {
    e.preventDefault();
    if (
      workingState &&
      activeToolId &&
      (workingState as any)[activeToolId] &&
      typeof (workingState as any)[activeToolId].on !== "undefined"
    ) {
      (workingState as any)[activeToolId].on = !(workingState as any)[
        activeToolId
      ].on;
      if ((workingState as any)[activeToolId].on) {
        btnPower.classList.add("active");
      } else {
        btnPower.classList.remove("active");
      }
      computeAndDraw();
      triggerSound();
    }
  });

  // Editor Toolbar Actions
  document.getElementById("btn-apply")?.addEventListener("click", () => {
    if (activeToolId && workingState) {
      globalState = workingState;
    }
    switchToMainMode();
  });
  document
    .getElementById("btn-cancel")
    ?.addEventListener("click", () => switchToMainMode());
  document
    .getElementById("btn-menu")
    ?.addEventListener("click", () => editor.toggleMenu());

  // Main Toolbar & Drawer Actions
  document.getElementById("btn-open-edit")?.addEventListener("click", (e) => {
    e.stopPropagation();
    const drawer = document.getElementById("edit-drawer");
    if (drawer) {
      if (drawer.classList.contains("active")) {
        drawer.classList.remove("active");
      } else {
        closeDrawers();
        drawer.classList.add("active");
      }
    }
  });

  document
    .getElementById("btn-open-randomize")
    ?.addEventListener("click", (e) => {
      e.stopPropagation();
      const drawer = document.getElementById("randomize-drawer");
      if (drawer) {
        if (drawer.classList.contains("active")) {
          drawer.classList.remove("active");
        } else {
          closeDrawers();
          drawer.classList.add("active");
        }
      }
    });

  // Tap outside to close
  container.addEventListener("mousedown", closeDrawers);
  container.addEventListener("touchstart", closeDrawers, { passive: true });

  // Initialize Tiles
  const tileGrid = document.getElementById("tile-grid");
  if (tileGrid) {
    Object.keys(appConfig).forEach((toolId) => {
      const tool = appConfig[toolId];
      const tile = document.createElement("div");
      tile.className = "tile-item";
      tile.dataset.toolId = toolId;
      tile.innerHTML = `<div class="tile-icon">${tool.icon}</div><div class="tile-label">${tool.name}</div>`;
      tile.addEventListener("click", () => switchToEditMode(toolId));
      tileGrid.appendChild(tile);
    });
  }

  // Initialize Randomize Tiles
  const randomizeGrid = document.getElementById("randomize-grid");
  if (randomizeGrid) {
    Object.keys(synthRandomizations).forEach((schemaName) => {
      const tile = document.createElement("div");
      tile.className = "tile-item";
      tile.dataset.randomId = schemaName;
      const schemaLabel = getRandomizationLabel(schemaName);
      const schemaIcon = getRandomizationIcon(schemaName);
      tile.innerHTML = `<div class="tile-icon">${schemaIcon}</div><div class="tile-label">${schemaLabel}</div>`;
      tile.addEventListener("click", () => {
        const newState = structuredClone(defaultState);
        randomizeProperties(
          newState,
          synthSchema as any,
          synthRandomizations[schemaName],
        );
        globalState = newState;

        document
          .querySelectorAll("#randomize-grid .tile-item")
          .forEach((t) => t.classList.remove("enabled"));
        tile.classList.add("enabled");

        updateTileStatus();
        computeAndDraw();
        triggerSound();
      });
      randomizeGrid.appendChild(tile);
    });
  }

  window.addEventListener("resize", resizeCanvas);
  resizeCanvas();
  switchToMainMode(); // Starts app in main state
});

declare global {
  interface Window {
    webkitAudioContext: typeof AudioContext;
  }
}
