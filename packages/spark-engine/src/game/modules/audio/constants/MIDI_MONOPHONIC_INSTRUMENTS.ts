import { clone } from "../../../core/utils/clone";
import { _synth } from "../specs/_synth";
import { SynthConfig } from "../types/Synth";

export const DEFAULT_MONOPHONIC_INSTRUMENT: SynthConfig = {
  shape: "triangle",
  envelope: {
    attack: 0.002,
    decay: 0.002,
    sustain: 0.05,
    release: 0.025,
  },
};

/** Each percussion instrument can only be played at one pitch */
const MIDI_MONOPHONIC_INSTRUMENT_MAP: Record<string, SynthConfig> = {
  /* 0-33 : None */
  "00": { name: "" },
  "01": { name: "" },
  "02": { name: "" },
  "03": { name: "" },
  "04": { name: "" },
  "05": { name: "" },
  "06": { name: "" },
  "07": { name: "" },
  "08": { name: "" },
  "09": { name: "" },
  "10": { name: "" },
  "11": { name: "" },
  "12": { name: "" },
  "13": { name: "" },
  "14": { name: "" },
  "15": { name: "" },
  "16": { name: "" },
  "17": { name: "" },
  "18": { name: "" },
  "19": { name: "" },
  "20": { name: "" },
  "21": { name: "" },
  "22": { name: "" },
  "23": { name: "" },
  "24": { name: "" },
  "25": { name: "" },
  "26": { name: "" },
  "27": { name: "" },
  "28": { name: "" },
  "29": { name: "" },
  "30": { name: "" },
  "31": { name: "" },
  "32": { name: "" },
  "33": { name: "" },

  /* 34-80 : Percussion */
  percussion_drum_bass_acoustic: { name: "Acoustic Bass Drum" },
  percussion_drum_bass_1: { name: "Bass Drum 1" },
  percussion_drum_stick: { name: "Side Stick" },
  percussion_snare_acoustic: { name: "Acoustic Snare" },
  percussion_clap: { name: "Hand Clap" },
  percussion_snare_electric: { name: "Electric Snare" },
  percussion_drum_tom_low_floor: { name: "Low Floor Tom" },
  percussion_hihat_closed: { name: "Closed Hi Hat" },
  percussion_drum_tom_high_floor: { name: "High Floor Tom" },
  percussion_hihat_pedal: { name: "Pedal Hi-Hat" },
  percussion_drum_tom_low: { name: "Low Tom" },
  percussion_highat_open: { name: "Open Hi-Hat" },
  percussion_drum_tom_low_mid: { name: "Low-Mid Tom" },
  percussion_drum_tom_high_mid: { name: "High-Mid Tom" },
  percussion_cymbal_crash_1: { name: "Crash Cymbal 1" },
  percussion_drum_tom_high: { name: "High Tom" },
  percussion_cymbal_ride_1: { name: "Ride Cymbal 1" },
  percussion_cymbal_china: { name: "Chinese Cymbal" },
  percussion_cymbal_ride_bell: { name: "Ride Bell" },
  percussion_tambourine: { name: "Tambourine" },
  percussion_cymbal_splash: { name: "Splash Cymbal" },
  percussion_cowbell: { name: "Cowbell" },
  percussion_cymbal_crash_2: { name: "Crash Cymbal 2" },
  percussion_vibraslap: { name: "Vibraslap" },
  percussion_cymbal_ride_2: { name: "Ride Cymbal 2" },
  percussion_drum_bongo_high: { name: "High Bongo" },
  percussion_drum_bongo_low: { name: "Low Bongo" },
  percussion_drum_conga_high_muted: { name: "Mute High Conga" },
  percussion_drum_conga_high_open: { name: "Open Hi Conga" },
  percussion_drum_conga_low: { name: "Low Conga" },
  percussion_drum_timbale_high: { name: "High Timbale" },
  percussion_drum_timbale_low: { name: "Low Timbale" },
  percussion_agogo_high: { name: "High Agogo" },
  percussion_agogo_low: { name: "Low Agogo" },
  percussion_cabasa: { name: "Cabasa" },
  percussion_maracas: { name: "Maracas" },
  percussion_whistle_short: { name: "Short Whistle" },
  percussion_whistle_long: { name: "Long Whistle" },
  percussion_guiro_short: { name: "Short Guiro" },
  percussion_guiro_long: { name: "Long Guiro" },
  percussion_claves: { name: "Claves" },
  percussion_woodblock_high: { name: "Hi Wood Block" },
  percussion_woodblock_low: { name: "Low Wood Block" },
  percussion_drum_cuica_muted: { name: "Mute Cuica" },
  percussion_drum_cuica_open: { name: "Open Cuica" },
  percussion_triangle_muted: { name: "Mute Triangle" },
  percussion_triangle_open: { name: "Open Triangle" },
} as const;

export const MIDI_MONOPHONIC_INSTRUMENTS = Object.values(
  MIDI_MONOPHONIC_INSTRUMENT_MAP
).map((value) =>
  clone(_synth(), { ...DEFAULT_MONOPHONIC_INSTRUMENT, ...value })
);
