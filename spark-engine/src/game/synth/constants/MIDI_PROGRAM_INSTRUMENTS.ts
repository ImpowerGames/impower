/** Each program instrument can be played in 128 different pitches */
export const MIDI_PROGRAM_INSTRUMENTS = {
  /* 0 : None */
  none: "",

  /* 1-8 : Piano */
  piano_acoustic_grand: "Acoustic Grand Piano",
  piano_acoustic_bright: "Bright Acoustic Piano",
  piano_electric_grand: "Electric Grand Piano",
  piano_honky_tonk: "Honky-tonk Piano",
  piano_electric_1: "Electric Piano 1",
  piano_electric_2: "Electric Piano 2",
  piano_harpsichord: "Harpsichord",
  piano_clavinet: "Clavinet",

  /* 9-16 : Chromatic Percussion*/
  chromatic_celesta: "Celesta",
  chromatic_glockenspiel: "Glockenspiel",
  chromatic_music_box: "Music Box",
  chromatic_vibraphone: "Vibraphone",
  chromatic_marimba: "Marimba",
  chromatic_xylophone: "Xylophone",
  chromatic_tubular_bell: "Tubular Bell",
  chromatic_dulcimer: "Dulcimer",

  /* 17-24 : Organ */
  organ_drawbar: "Drawbar Organ",
  organ_percussive: "Percussive Organ",
  organ_rock: "Rock Organ",
  organ_church: "Church Organ",
  organ_reed: "Reed Organ",
  organ_accordion: "Accordion",
  organ_harmonica: "Harmonica",
  organ_bandoneon: "Bandoneon",

  /* 25-32 : Guitar */
  guitar_acoustic_nylon: "Acoustic Guitar (nylon)",
  guitar_acoustic_steel: "Acoustic Guitar (steel)",
  guitar_electric_jazz: "Electric Guitar (jazz)",
  guitar_electric_clean: "Electric Guitar (clean)",
  guitar_electric_muted: "Electric Guitar (muted)",
  guitar_electric_overdriven: "Electric Guitar (overdriven)",
  guitar_electric_distorted: "Electric Guitar (distorted)",
  guitar_electric_harmonic: "Electric Guitar (harmonic)",

  /* 33-40 : Bass */
  bass_acoustic: "Acoustic Bass",
  bass_electric_fingered: "Electric Bass (fingered)",
  bass_electric_picked: "Electric Bass (picked)",
  bass_fretless: "Fretless Bass",
  bass_slap_1: "Slap Bass 1",
  bass_slap_2: "Slap Bass 2",
  bass_synth_1: "Synth Bass 1",
  bass_synth_2: "Synth Bass 2",

  /* 41-48 : Strings */
  strings_violin: "Violin",
  strings_viola: "Viola",
  strings_cello: "Cello",
  strings_contrabass: "Contrabass",
  strings_tremolo: "Tremolo Strings",
  strings_pizzicato: "Pizzicato Strings",
  strings_harp: "Orchestral Harp",
  strings_timpani: "Timpani",

  /* 49-56 : Ensemble */
  ensemble_strings_1: "String Ensemble 1",
  ensemble_strings_2: "String Ensemble 2",
  ensemble_synth_1: "Synth Strings 1",
  ensemble_synth_2: "Synth Strings 2",
  ensemble_voice_aahs: "Choir Aahs",
  ensemble_voice_oohs: "Voice Oohs",
  ensemble_voice_synth: "Synth Voice",
  ensemble_orchestra_hit: "Orchestra Hit",

  /* 57-64 : Brass */
  brass_trumpet: "Trumpet",
  brass_trombone: "Trombone",
  brass_tuba: "Tuba",
  brass_trumpet_muted: "Muted Trumpet",
  brass_horn: "French Horn",
  brass_section: "Brass Section",
  brass_synth_1: "Synth Brass 1",
  brass_synth_2: "Synth Brass 2",

  /* 65-72 : Reed */
  reed_sax_soprano: "Soprano Sax",
  reed_sax_alto: "Alto Sax",
  reed_sax_tenor: "Tenor Sax",
  reed_sax_baritone: "Baritone Sax",
  reed_oboe: "Oboe",
  reed_oboe_alto: "English Horn (Alto Oboe)",
  reed_bassoon: "Bassoon",
  reed_clarinet: "Clarinet",

  /* 73-80 : Pipe */
  pipe_piccolo: "Piccolo",
  pipe_flute: "Flute",
  pipe_recorder: "Recorder",
  pipe_pan: "Pan Flute",
  pipe_bottle: "Blown Bottle",
  pipe_shakuhachi: "Shakuhachi",
  pipe_whistle: "Whistle",
  pipe_ocarina: "Ocarina",

  /* 81-88 : Synth Lead */
  lead_square: "Lead 1 (square)",
  lead_sawtooth: "Lead 2 (sawtooth)",
  lead_wind: "Lead 3 (wind)",
  lead_sine: "Lead 4 (sine)",
  lead_guitar: "Lead 5 (guitar)",
  lead_voice: "Lead 6 (voice)",
  lead_fifths: "Lead 7 (fifths)",
  lead_bass: "Lead 8 (bass)",

  /* 89-96 : Synth Pad */
  pad_bell: "Pad 1 (bell)",
  pad_warm: "Pad 2 (warm)",
  pad_poly: "Pad 3 (poly)",
  pad_choir: "Pad 4 (choir)",
  pad_glass: "Pad 5 (glass)",
  pad_metal: "Pad 6 (metal)",
  pad_halo: "Pad 7 (halo)",
  pad_sweep: "Pad 8 (sweep)",

  /* 97-104 : Synth Effects */
  fx_rain: "FX 1 (rain)",
  fx_soundtrack: "FX 2 (soundtrack)",
  fx_crystal: "FX 3 (crystal)",
  fx_atmosphere: "FX 4 (atmosphere)",
  fx_brightness: "FX 5 (brightness)",
  fx_goblins: "FX 6 (goblins)",
  fx_echoes: "FX 7 (echoes)",
  fx_scifi: "FX 8 (sci-fi)",

  /* 105-112 : Ethnic */
  ethnic_sitar: "Sitar",
  ethnic_banjo: "Banjo",
  ethnic_shamisen: "Shamisen",
  ethnic_koto: "Koto",
  ethnic_kalimba: "Kalimba",
  ethnic_bagpipe: "Bagpipe",
  ethnic_fiddle: "Fiddle",
  ethnic_shanai: "Shanai",

  /* 113-120 : Percussive */
  achromatic_bell_tinkle: "Tinkle Bell",
  achromatic_bell_agogo: "Agogô",
  achromatic_drum_steel: "Steel Drums",
  achromatic_woodblock: "Woodblock",
  achromatic_drum_taiko: "Taiko Drum",
  achromatic_drum_tom: "Melodic Tom",
  achromatic_drum_synth: "Synth Drum",
  achromatic_cymbal: "Reverse Cymbal",

  /* 121-128 : Sound Effects */
  sfx_fret: "Guitar Fret Noise",
  sfx_breath: "Breath Noise",
  sfx_seashore: "Seashore",
  sfx_bird: "Bird Tweet",
  sfx_telephone: "Telephone Ring",
  sfx_helicopter: "Helicopter",
  sfx_applause: "Applause",
  sfx_gunshot: "Gunshot",
} as const;
