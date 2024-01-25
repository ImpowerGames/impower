import { clone } from "../../../core/utils/clone";
import { SynthConfig } from "../specs/Synth";
import { _synth } from "../specs/defaults/_synth";

export const DEFAULT_POLYPHONIC_INSTRUMENT: SynthConfig = {
  shape: "triangle",
  envelope: {
    attack: 0.002,
    decay: 0.002,
    sustain: 0.05,
    release: 0.025,
  },
};

/** Each program instrument can be played in 128 different pitches */
const MIDI_POLYPHONIC_INSTRUMENT_MAP: Record<string, SynthConfig> = {
  /* 0-7 : Piano */
  piano_acoustic_grand: { name: "Acoustic Grand Piano" },
  piano_acoustic_bright: { name: "Bright Acoustic Piano" },
  piano_electric_grand: { name: "Electric Grand Piano" },
  piano_honky_tonk: { name: "Honky-tonk Piano" },
  piano_electric_1: { name: "Electric Piano 1" },
  piano_electric_2: { name: "Electric Piano 2" },
  piano_harpsichord: { name: "Harpsichord" },
  piano_clavinet: { name: "Clavinet" },

  /* 8-15 : Chromatic Percussion*/
  chromatic_celesta: { name: "Celesta" },
  chromatic_glockenspiel: { name: "Glockenspiel" },
  chromatic_music_box: { name: "Music Box" },
  chromatic_vibraphone: { name: "Vibraphone" },
  chromatic_marimba: { name: "Marimba" },
  chromatic_xylophone: { name: "Xylophone" },
  chromatic_tubular_bell: { name: "Tubular Bell" },
  chromatic_dulcimer: { name: "Dulcimer" },

  /* 16-23 : Organ */
  organ_drawbar: { name: "Drawbar Organ" },
  organ_percussive: { name: "Percussive Organ" },
  organ_rock: { name: "Rock Organ" },
  organ_church: { name: "Church Organ" },
  organ_reed: { name: "Reed Organ" },
  organ_accordion: { name: "Accordion" },
  organ_harmonica: { name: "Harmonica" },
  organ_bandoneon: { name: "Bandoneon" },

  /* 24-31 : Guitar */
  guitar_acoustic_nylon: { name: "Acoustic Guitar (nylon)" },
  guitar_acoustic_steel: { name: "Acoustic Guitar (steel)" },
  guitar_electric_jazz: { name: "Electric Guitar (jazz)" },
  guitar_electric_clean: { name: "Electric Guitar (clean)" },
  guitar_electric_muted: { name: "Electric Guitar (muted)" },
  guitar_electric_overdriven: { name: "Electric Guitar (overdriven)" },
  guitar_electric_distorted: { name: "Electric Guitar (distorted)" },
  guitar_electric_harmonic: { name: "Electric Guitar (harmonic)" },

  /* 32-39 : Bass */
  bass_acoustic: { name: "Acoustic Bass" },
  bass_electric_fingered: { name: "Electric Bass (fingered)" },
  bass_electric_picked: { name: "Electric Bass (picked)" },
  bass_fretless: { name: "Fretless Bass" },
  bass_slap_1: { name: "Slap Bass 1" },
  bass_slap_2: { name: "Slap Bass 2" },
  bass_synth_1: { name: "Synth Bass 1" },
  bass_synth_2: { name: "Synth Bass 2" },

  /* 40-47 : Strings */
  strings_violin: { name: "Violin" },
  strings_viola: { name: "Viola" },
  strings_cello: { name: "Cello" },
  strings_contrabass: { name: "Contrabass" },
  strings_tremolo: { name: "Tremolo Strings" },
  strings_pizzicato: { name: "Pizzicato Strings" },
  strings_harp: { name: "Orchestral Harp" },
  strings_timpani: { name: "Timpani" },

  /* 48-55 : Ensemble */
  ensemble_strings_1: { name: "String Ensemble 1" },
  ensemble_strings_2: { name: "String Ensemble 2" },
  ensemble_synth_1: { name: "Synth Strings 1" },
  ensemble_synth_2: { name: "Synth Strings 2" },
  ensemble_voice_aahs: { name: "Choir Aahs" },
  ensemble_voice_oohs: { name: "Voice Oohs" },
  ensemble_voice_synth: { name: "Synth Voice" },
  ensemble_orchestra_hit: { name: "Orchestra Hit" },

  /* 56-63 : Brass */
  brass_trumpet: { name: "Trumpet" },
  brass_trombone: { name: "Trombone" },
  brass_tuba: { name: "Tuba" },
  brass_trumpet_muted: { name: "Muted Trumpet" },
  brass_horn: { name: "French Horn" },
  brass_section: { name: "Brass Section" },
  brass_synth_1: { name: "Synth Brass 1" },
  brass_synth_2: { name: "Synth Brass 2" },

  /* 64-71 : Reed */
  reed_sax_soprano: { name: "Soprano Sax" },
  reed_sax_alto: { name: "Alto Sax" },
  reed_sax_tenor: { name: "Tenor Sax" },
  reed_sax_baritone: { name: "Baritone Sax" },
  reed_oboe: { name: "Oboe" },
  reed_oboe_alto: { name: "English Horn (Alto Oboe)" },
  reed_bassoon: { name: "Bassoon" },
  reed_clarinet: { name: "Clarinet" },

  /* 72-79 : Pipe */
  pipe_piccolo: { name: "Piccolo" },
  pipe_flute: { name: "Flute" },
  pipe_recorder: { name: "Recorder" },
  pipe_pan: { name: "Pan Flute" },
  pipe_bottle: { name: "Blown Bottle" },
  pipe_shakuhachi: { name: "Shakuhachi" },
  pipe_whistle: { name: "Whistle" },
  pipe_ocarina: { name: "Ocarina" },

  /* 80-87 : Synth Lead */
  lead_square: { name: "Lead 1 (square)" },
  lead_sawtooth: { name: "Lead 2 (sawtooth)" },
  lead_wind: { name: "Lead 3 (wind)" },
  lead_sine: { name: "Lead 4 (sine)" },
  lead_guitar: { name: "Lead 5 (guitar)" },
  lead_voice: { name: "Lead 6 (voice)" },
  lead_fifths: { name: "Lead 7 (fifths)" },
  lead_bass: { name: "Lead 8 (bass)" },

  /* 88-95 : Synth Pad */
  pad_bell: { name: "Pad 1 (bell)" },
  pad_warm: { name: "Pad 2 (warm)" },
  pad_poly: { name: "Pad 3 (poly)" },
  pad_choir: { name: "Pad 4 (choir)" },
  pad_glass: { name: "Pad 5 (glass)" },
  pad_metal: { name: "Pad 6 (metal)" },
  pad_halo: { name: "Pad 7 (halo)" },
  pad_sweep: { name: "Pad 8 (sweep)" },

  /* 96-103 : Synth Effects */
  fx_rain: { name: "FX 1 (rain)" },
  fx_soundtrack: { name: "FX 2 (soundtrack)" },
  fx_crystal: { name: "FX 3 (crystal)" },
  fx_atmosphere: { name: "FX 4 (atmosphere)" },
  fx_brightness: { name: "FX 5 (brightness)" },
  fx_goblins: { name: "FX 6 (goblins)" },
  fx_echoes: { name: "FX 7 (echoes)" },
  fx_scifi: { name: "FX 8 (sci-fi)" },

  /* 104-111 : Ethnic */
  ethnic_sitar: { name: "Sitar" },
  ethnic_banjo: { name: "Banjo" },
  ethnic_shamisen: { name: "Shamisen" },
  ethnic_koto: { name: "Koto" },
  ethnic_kalimba: { name: "Kalimba" },
  ethnic_bagpipe: { name: "Bagpipe" },
  ethnic_fiddle: { name: "Fiddle" },
  ethnic_shanai: { name: "Shanai" },

  /* 112-119 : Percussive */
  achromatic_bell_tinkle: { name: "Tinkle Bell" },
  achromatic_bell_agogo: { name: "Agogô" },
  achromatic_drum_steel: { name: "Steel Drums" },
  achromatic_woodblock: { name: "Woodblock" },
  achromatic_drum_taiko: { name: "Taiko Drum" },
  achromatic_drum_tom: { name: "Melodic Tom" },
  achromatic_drum_synth: { name: "Synth Drum" },
  achromatic_cymbal: { name: "Reverse Cymbal" },

  /* 120-127 : Sound Effects */
  sfx_fret: { name: "Guitar Fret Noise" },
  sfx_breath: { name: "Breath Noise" },
  sfx_seashore: { name: "Seashore" },
  sfx_bird: { name: "Bird Tweet" },
  sfx_telephone: { name: "Telephone Ring" },
  sfx_helicopter: { name: "Helicopter" },
  sfx_applause: { name: "Applause" },
  sfx_gunshot: { name: "Gunshot" },
} as const;

export const MIDI_POLYPHONIC_INSTRUMENTS = Object.values(
  MIDI_POLYPHONIC_INSTRUMENT_MAP
).map((value) =>
  clone(_synth(), { ...DEFAULT_POLYPHONIC_INSTRUMENT, ...value })
);
