export const MIDI_POLYPHONIC_OSCILLATORS: {
  g?: number;
  shape: string;
  volume?: number;
  envelope?: {
    attack?: number;
    decay?: number;
    sustain?: number;
    release?: number;
    level?: number;
  };
  pitch?: {
    frequency?: number;
  };
  tone?: number;
  pitchBend?: number;
  pitchBendRamp?: number;
  keyFactor?: number;
  b?: number;
  c?: number;
}[][] = [
  // 1-8 : Piano
  [
    { shape: "sine", volume: 0.4, envelope: { decay: 0.7, release: 0.1 } },
    {
      shape: "triangle",
      volume: 3,
      envelope: { attack: 0.01, decay: 0.7, level: 0.1 },
      keyFactor: -1.2,
      g: 1,
    },
  ],
  [
    {
      shape: "triangle",
      envelope: { decay: 0.7, release: 0.1 },
    },
    {
      shape: "triangle",
      volume: 4,
      envelope: { attack: 0.01, decay: 0.4, level: 0.1 },
      pitch: { frequency: 3 },
      keyFactor: -1,
      g: 1,
    },
  ],
  [
    {
      shape: "sine",
      envelope: { decay: 0.7, release: 0.1 },
    },
    {
      shape: "triangle",
      volume: 4,
      envelope: { decay: 0.5, level: 0.5 },
      tone: 2,
      keyFactor: -1,
      g: 1,
    },
  ],
  [
    {
      shape: "sine",
      volume: 0.2,
      envelope: { decay: 0.7 },
    },
    {
      shape: "triangle",
      volume: 4,
      envelope: { attack: 0.01, decay: 0.3, level: 0.5 },
      pitch: { frequency: 3 },
      tone: 2,
      keyFactor: -1,
      g: 1,
    },
  ],
  [
    {
      shape: "sine",
      volume: 0.35,
      envelope: { decay: 0.7 },
    },
    {
      shape: "sine",
      volume: 3,
      envelope: { decay: 1, level: 1 },
      pitch: { frequency: 7 },
      tone: 1,
      keyFactor: -0.7,
      g: 1,
    },
  ],
  [
    {
      shape: "sine",
      volume: 0.35,
      envelope: { decay: 0.7 },
    },
    {
      shape: "sine",
      volume: 8,
      envelope: { decay: 0.5, level: 1 },
      pitch: { frequency: 7 },
      tone: 1,
      keyFactor: -0.7,
      g: 1,
    },
  ],
  [
    {
      shape: "sawtooth",
      volume: 0.34,
      envelope: { decay: 2 },
    },
    {
      shape: "sine",
      volume: 8,
      envelope: { decay: 2, release: 2, level: 1 },
      tone: 0.1,
      g: 1,
    },
  ],
  [
    {
      shape: "triangle",
      volume: 0.34,
      envelope: { decay: 1.5 },
    },
    {
      shape: "square",
      volume: 6,
      envelope: { decay: 1.5, level: 0.5, release: 2 },
      tone: 0.1,
      g: 1,
    },
  ],
  /* 9-16 : Chromatic Perc*/
  [
    {
      shape: "sine",
      envelope: { decay: 0.3, release: 0.3 },
    },
    {
      shape: "sine",
      volume: 7,
      envelope: { decay: 0.03 },
      pitch: { frequency: 11 },
      g: 1,
    },
  ],
  [
    {
      shape: "sine",
      envelope: { decay: 0.3, release: 0.3 },
    },
    {
      shape: "sine",
      volume: 11,
      envelope: { decay: 0.2, level: 0.4 },
      pitch: { frequency: 6 },
      g: 1,
    },
  ],
  [
    {
      shape: "sine",
      volume: 0.2,
      envelope: { decay: 0.3, release: 0.3 },
    },
    {
      shape: "sine",
      volume: 11,
      envelope: { decay: 0.1, level: 0.4 },
      pitch: { frequency: 5 },
      g: 1,
    },
  ],
  [
    {
      shape: "sine",
      volume: 0.2,
      envelope: { decay: 0.6, release: 0.6 },
    },
    {
      shape: "triangle",
      volume: 11,
      envelope: { level: 0.5 },
      pitch: { frequency: 5 },
      tone: 1,
      g: 1,
    },
  ],
  [
    {
      shape: "sine",
      volume: 0.3,
      envelope: { decay: 0.2, release: 0.2 },
    },
    {
      shape: "sine",
      volume: 6,
      envelope: { decay: 0.02 },
      pitch: { frequency: 5 },
      g: 1,
    },
  ],
  [
    {
      shape: "sine",
      volume: 0.3,
      envelope: { decay: 0.2, release: 0.2 },
    },
    {
      shape: "sine",
      volume: 7,
      envelope: { decay: 0.03 },
      pitch: { frequency: 11 },
      g: 1,
    },
  ],
  [
    {
      shape: "sine",
      volume: 0.2,
      envelope: { decay: 1, release: 1 },
    },
    {
      shape: "sine",
      volume: 11,
      envelope: { decay: 1, release: 1 },
      pitch: { frequency: 3.5 },
      g: 1,
    },
  ],
  [
    {
      shape: "triangle",
      volume: 0.2,
      envelope: { decay: 0.5, release: 0.2 },
    },
    {
      shape: "sine",
      volume: 6,
      envelope: { decay: 0.2, release: 0.2, level: 0.1 },
      pitch: { frequency: 2.5 },
      g: 1,
    },
  ],
  /* 17-24 : Organ */
  [
    {
      shape: "jitter",
      volume: 0.22,
      envelope: { level: 0.9 },
    },
    {
      shape: "jitter",
      volume: 0.22,
      envelope: { level: 0.9 },
      pitch: { frequency: 2 },
      tone: 2,
    },
  ],
  [
    {
      shape: "jitter",
      volume: 0.2,
      envelope: { level: 1 },
    },
    {
      shape: "sine",
      volume: 11,
      envelope: {
        decay: 0.002,
        sustain: 0.006,
        release: 0.002,
        level: 0.1,
      },
      pitch: { frequency: 6 },
      tone: 2,
      g: 1,
    },
    {
      shape: "jitter",
      volume: 0.2,
      envelope: { sustain: 0, level: 1 },
      pitch: { frequency: 2 },
      tone: 1,
    },
  ],
  [
    {
      shape: "jitter",
      volume: 0.2,
      envelope: { decay: 0.1, level: 0.9 },
    },
    {
      shape: "jitter",
      volume: 0.25,
      envelope: { level: 0.5 },
      tone: 2,
      pitch: { frequency: 4 },
    },
  ],
  [
    {
      shape: "jitter",
      volume: 0.3,
      envelope: { attack: 0.04, level: 0.9 },
    },
    {
      shape: "jitter",
      volume: 0.2,
      envelope: { attack: 0.04, level: 0.9 },
      tone: 2,
      pitch: { frequency: 8 },
    },
  ],
  [
    {
      shape: "sine",
      volume: 0.2,
      envelope: { attack: 0.02, decay: 0.05, level: 1 },
    },
    {
      shape: "sine",
      volume: 6,
      envelope: { attack: 0.02, decay: 0.05, level: 1 },
      pitch: { frequency: 3 },
      tone: 1,
      g: 1,
    },
  ],
  [
    {
      shape: "triangle",
      volume: 0.2,
      envelope: { attack: 0.02, decay: 0.05, level: 0.8 },
    },
    {
      shape: "square",
      volume: 7,
      envelope: { decay: 0.05, level: 1.5 },
      pitch: { frequency: 3 },
      tone: 1,
      g: 1,
    },
  ],
  [
    {
      shape: "square",
      volume: 0.2,
      envelope: { attack: 0.02, decay: 0.2, level: 0.5 },
    },
    {
      shape: "square",
      volume: 1,
      envelope: { decay: 0.03, level: 2 },
      g: 1,
    },
  ],
  [
    {
      shape: "square",
      volume: 0.2,
      envelope: { attack: 0.02, decay: 0.1, level: 0.8 },
    },
    {
      shape: "square",
      volume: 1,
      envelope: { attack: 0.3, decay: 0.1, level: 2 },
      g: 1,
    },
  ],
  /* 25-32 : Guitar */
  [
    {
      shape: "sine",
      volume: 0.3,
      envelope: { decay: 0.5 },
      tone: 1,
    },
    {
      shape: "triangle",
      volume: 5,
      envelope: { decay: 1, level: 0.1 },
      pitch: { frequency: 3 },
      tone: -1,
      g: 1,
    },
  ],
  [
    {
      shape: "sine",
      volume: 0.4,
      envelope: { decay: 0.6 },
      tone: 1,
    },
    {
      shape: "triangle",
      volume: 12,
      envelope: { decay: 0.6, level: 0.1 },
      pitch: { frequency: 3 },
      tone: -1,
      g: 1,
    },
  ],
  [
    {
      shape: "triangle",
      volume: 0.3,
      envelope: { decay: 1 },
      tone: 1,
    },
    {
      shape: "triangle",
      volume: 6,
      envelope: { decay: 0.4, level: 0.5 },
      pitch: { frequency: 3 },
      tone: -1,
      g: 1,
    },
  ],
  [
    {
      shape: "sine",
      volume: 0.3,
      envelope: { decay: 1 },
      tone: -1,
    },
    {
      shape: "triangle",
      volume: 11,
      envelope: { decay: 0.4, level: 0.5 },
      pitch: { frequency: 3 },
      tone: 1,
      g: 1,
    },
  ],
  [
    {
      shape: "sine",
      volume: 0.4,
      envelope: { decay: 0.1, release: 0.01 },
    },
    {
      shape: "sine",
      volume: 7,
      envelope: {},
      g: 1,
    },
  ],
  [
    {
      shape: "triangle",
      volume: 0.4,
      envelope: { decay: 1 },
      tone: 1,
    },
    {
      shape: "square",
      volume: 4,
      envelope: { decay: 1, level: 0.7 },
      tone: -1,
      g: 1,
    },
  ], //[{w:"triangle",v:0.35,d:1,f:1,},{w:"square",v:7,f:-1,d:0.3,s:0.5,g:1,}],
  [
    {
      shape: "triangle",
      volume: 0.35,
      envelope: { decay: 1 },
      tone: 1,
    },
    {
      shape: "square",
      volume: 7,
      envelope: { decay: 0.3, level: 0.5 },
      tone: -1,
      g: 1,
    },
  ],
  [
    {
      shape: "sine",
      volume: 0.2,
      envelope: { attack: 0.005, sustain: 0.2, decay: 0.6 },
      pitch: { frequency: 1.5 },
    },
    {
      shape: "sine",
      volume: 11,
      envelope: { decay: 1, level: 0.5 },
      pitch: { frequency: 5 },
      tone: 2,
      g: 1,
    },
  ],
  /* 33-40 : Bass */
  [
    {
      shape: "sine",
      envelope: { decay: 0.3 },
    },
    {
      shape: "sine",
      volume: 4,
      envelope: { decay: 1, level: 1 },
      pitch: { frequency: 3 },
      g: 1,
    },
  ],
  [
    {
      shape: "sine",
      envelope: { decay: 0.3 },
    },
    {
      shape: "sine",
      volume: 4,
      envelope: { decay: 1, level: 1 },
      pitch: { frequency: 3 },
      g: 1,
    },
  ],
  [
    {
      shape: "jitter",
      volume: 0.7,
      envelope: { decay: 0.3, level: 0.5 },
    },
    {
      shape: "sawtooth",
      volume: 1.2,
      envelope: {
        decay: 0.02,
        sustain: 0,
        release: 0.02,
        level: 0.5,
      },
      g: 1,
    },
  ],
  [
    {
      shape: "sine",
      envelope: { decay: 0.3 },
    },
    {
      shape: "sine",
      volume: 4,
      envelope: { decay: 1, level: 1 },
      pitch: { frequency: 3 },
      g: 1,
    },
  ],
  [
    {
      shape: "triangle",
      volume: 0.3,
      envelope: { decay: 1 },
      pitch: { frequency: 2 },
    },
    {
      shape: "triangle",
      volume: 15,
      envelope: { decay: 0.04, level: 0.1 },
      pitch: { frequency: 2.5 },
      g: 1,
    },
  ],
  [
    {
      shape: "triangle",
      volume: 0.3,
      envelope: { decay: 1 },
      pitch: { frequency: 2 },
    },
    {
      shape: "triangle",
      volume: 15,
      envelope: { decay: 0.04, level: 0.1 },
      pitch: { frequency: 2.5 },
      g: 1,
    },
  ],
  [
    {
      shape: "triangle",
      envelope: { decay: 0.7 },
    },
    {
      shape: "square",
      volume: 0.4,
      envelope: { decay: 0.2, level: 10 },
      pitch: { frequency: 0.5 },
      tone: 1,
      g: 1,
    },
  ],
  [
    {
      shape: "triangle",
      envelope: { decay: 0.7 },
    },
    {
      shape: "square",
      volume: 0.4,
      envelope: { decay: 0.2, level: 10 },
      pitch: { frequency: 0.5 },
      tone: 1,
      g: 1,
    },
  ],
  /* 41-48 : Strings */
  [
    {
      shape: "sawtooth",
      volume: 0.4,
      envelope: { attack: 0.1, decay: 11 },
    },
    {
      shape: "sine",
      volume: 5,
      envelope: { decay: 11, level: 0.2 },
      g: 1,
    },
  ],
  [
    {
      shape: "sawtooth",
      volume: 0.4,
      envelope: { attack: 0.1, decay: 11 },
    },
    {
      shape: "sine",
      volume: 5,
      envelope: { decay: 11, level: 0.2 },
      g: 1,
    },
  ],
  [
    {
      shape: "sawtooth",
      volume: 0.4,
      envelope: { attack: 0.1, decay: 11 },
    },
    {
      shape: "sine",
      volume: 5,
      envelope: { decay: 11, level: 0.2 },
      pitch: { frequency: 0.5 },
      g: 1,
    },
  ],
  [
    {
      shape: "sawtooth",
      volume: 0.4,
      envelope: { attack: 0.1, decay: 11 },
    },
    {
      shape: "sine",
      volume: 5,
      envelope: { decay: 11, level: 0.2 },
      pitch: { frequency: 0.5 },
      g: 1,
    },
  ],
  [
    {
      shape: "sine",
      volume: 0.4,
      envelope: { attack: 0.1, decay: 11 },
    },
    {
      shape: "sine",
      volume: 6,
      envelope: { decay: 0.05, level: 1.1 },
      tone: 2.5,
      g: 1,
    },
  ],
  [
    {
      shape: "sine",
      volume: 0.3,
      envelope: { decay: 0.1, release: 0.1 },
    },
    {
      shape: "square",
      volume: 4,
      envelope: { decay: 1, level: 0.2 },
      pitch: { frequency: 3 },
      g: 1,
    },
  ],
  [
    {
      shape: "sine",
      volume: 0.3,
      envelope: { decay: 0.5, release: 0.5 },
    },
    {
      shape: "sine",
      volume: 7,
      envelope: { decay: 1, release: 1 },
      pitch: { frequency: 2 },
      tone: 2,
      g: 1,
    },
  ],
  [
    {
      shape: "triangle",
      volume: 0.6,
      envelope: { decay: 0.3, sustain: 0.03, release: 0.3 },
      pitch: { frequency: 0.5 },
    },
    {
      shape: "whitenoise",
      volume: 8,
      envelope: { decay: 0.08, release: 0.08 },
      pitch: { frequency: 1.5 },
      g: 1,
    },
  ],
  /* 49-56 : Ensamble */
  [
    {
      shape: "sawtooth",
      volume: 0.3,
      envelope: { attack: 0.03, level: 0.5 },
    },
    {
      shape: "sawtooth",
      volume: 0.2,
      envelope: { decay: 1, level: 2 },
      pitch: { frequency: 2 },
      tone: 2,
    },
  ],
  [
    {
      shape: "sawtooth",
      volume: 0.3,
      envelope: { attack: 0.03, level: 0.5 },
      tone: -2,
    },
    {
      shape: "sawtooth",
      volume: 0.2,
      envelope: { decay: 1, level: 2 },
      pitch: { frequency: 2 },
      tone: 2,
    },
  ],
  [
    {
      shape: "sawtooth",
      volume: 0.2,
      envelope: { attack: 0.02, level: 1 },
    },
    {
      shape: "sawtooth",
      volume: 0.2,
      envelope: { attack: 1, decay: 1, level: 1 },
      pitch: { frequency: 2 },
      tone: 2,
    },
  ],
  [
    {
      shape: "sawtooth",
      volume: 0.2,
      envelope: { attack: 0.02, level: 1 },
    },
    {
      shape: "sawtooth",
      volume: 0.2,
      envelope: { attack: 0.02, decay: 1, level: 1 },
      tone: 2,
    },
  ],
  [
    {
      shape: "triangle",
      volume: 0.3,
      envelope: { attack: 0.03, level: 1 },
    },
    {
      shape: "sine",
      volume: 3,
      envelope: { decay: 1, level: 1 },
      pitch: { frequency: 5 },
      tone: 1,
      g: 1,
    },
  ],
  [
    {
      shape: "sine",
      volume: 0.4,
      envelope: { attack: 0.03, level: 0.9 },
    },
    {
      shape: "sine",
      volume: 1,
      envelope: { decay: 0.03, level: 0.2 },
      pitch: { frequency: 2 },
      tone: 3,
      g: 1,
    },
  ],
  [
    {
      shape: "triangle",
      volume: 0.6,
      envelope: { attack: 0.05, level: 0.5 },
    },
    {
      shape: "sine",
      volume: 1,
      envelope: { decay: 0.2, level: 0.2 },
      tone: 0.8,
      g: 1,
    },
  ],
  [
    {
      shape: "square",
      volume: 0.15,
      envelope: {
        attack: 0.01,
        decay: 0.2,
        sustain: 0.03,
        release: 0.2,
      },
      pitch: { frequency: 0.5 },
    },
    {
      shape: "square",
      volume: 4,
      envelope: {
        attack: 0.01,
        decay: 0.2,
        sustain: 0.02,
        release: 11,
      },
      tone: 0.5,
      g: 1,
    },
    {
      shape: "square",
      volume: 0.15,
      envelope: {
        attack: 0.02,
        decay: 0.15,
        sustain: 0.03,
        release: 0.15,
      },
      pitch: { frequency: 4 },
      tone: 1,
    },
    {
      g: 3,
      shape: "square",
      volume: 4,
      envelope: {
        attack: 0.01,
        decay: 0.15,
        sustain: 0.02,
        release: 11,
      },
      tone: -0.5,
    },
  ],
  /* 57-64 : Brass */
  [
    {
      shape: "square",
      volume: 0.2,
      envelope: {
        attack: 0.01,
        decay: 1,
        release: 0.04,
        level: 0.6,
      },
    },
    {
      shape: "sine",
      volume: 1,
      envelope: { decay: 0.1, level: 4 },
      g: 1,
    },
  ],
  [
    {
      shape: "square",
      volume: 0.2,
      envelope: {
        attack: 0.02,
        decay: 1,
        release: 0.08,
        level: 0.5,
      },
    },
    {
      shape: "sine",
      volume: 1,
      envelope: { decay: 0.1, level: 4 },
      g: 1,
    },
  ],
  [
    {
      shape: "square",
      volume: 0.2,
      envelope: {
        attack: 0.04,
        decay: 1,
        release: 0.08,
        level: 0.4,
      },
    },
    {
      shape: "sine",
      volume: 1,
      envelope: { decay: 0.1, level: 4 },
      g: 1,
    },
  ],
  [
    {
      shape: "square",
      volume: 0.15,
      envelope: { attack: 0.04, level: 1 },
    },
    {
      shape: "sine",
      volume: 2,
      envelope: { decay: 0.1 },
      g: 1,
    },
  ],
  [
    {
      shape: "square",
      volume: 0.2,
      envelope: {
        attack: 0.02,
        decay: 1,
        release: 0.08,
        level: 0.5,
      },
    },
    {
      shape: "sine",
      volume: 1,
      envelope: { decay: 0.1, level: 4 },
      g: 1,
    },
  ],
  [
    {
      shape: "square",
      volume: 0.2,
      envelope: {
        attack: 0.02,
        decay: 1,
        release: 0.08,
        level: 0.6,
      },
    },
    {
      shape: "sine",
      volume: 1,
      envelope: { decay: 0.1, level: 4 },
      tone: 0.2,
      g: 1,
    },
  ],
  [
    {
      shape: "square",
      volume: 0.2,
      envelope: {
        attack: 0.02,
        decay: 0.5,
        level: 0.7,
        release: 0.08,
      },
    },
    {
      shape: "sine",
      volume: 1,
      envelope: { decay: 0.1, level: 4 },
      g: 1,
    },
  ],
  [
    {
      shape: "square",
      volume: 0.2,
      envelope: {
        attack: 0.02,
        decay: 1,
        level: 0.5,
        release: 0.08,
      },
    },
    {
      shape: "sine",
      volume: 1,
      envelope: { decay: 0.1, level: 4 },
      g: 1,
    },
  ],
  /* 65-72 : Reed */
  [
    {
      shape: "square",
      volume: 0.2,
      envelope: { attack: 0.02, decay: 2, level: 0.6 },
    },
    {
      shape: "sine",
      volume: 2,
      envelope: { decay: 1 },
      g: 1,
    },
  ],
  [
    {
      shape: "square",
      volume: 0.2,
      envelope: { attack: 0.02, decay: 2, level: 0.6 },
    },
    {
      shape: "sine",
      volume: 2,
      envelope: { decay: 1 },
      g: 1,
    },
  ],
  [
    {
      shape: "square",
      volume: 0.2,
      envelope: { attack: 0.02, decay: 1, level: 0.6 },
    },
    {
      shape: "sine",
      volume: 2,
      envelope: { decay: 1 },
      g: 1,
    },
  ],
  [
    {
      shape: "square",
      volume: 0.2,
      envelope: { attack: 0.02, decay: 1, level: 0.6 },
    },
    {
      shape: "sine",
      volume: 2,
      envelope: { decay: 1 },
      g: 1,
    },
  ],
  [
    {
      shape: "sine",
      volume: 0.4,
      envelope: { attack: 0.02, decay: 0.7, level: 0.5 },
    },
    {
      shape: "square",
      volume: 5,
      envelope: { decay: 0.2, level: 0.5 },
      pitch: { frequency: 2 },
      g: 1,
    },
  ],
  [
    {
      shape: "sine",
      volume: 0.3,
      envelope: { attack: 0.05, decay: 0.2, level: 0.8 },
    },
    {
      shape: "sawtooth",
      volume: 6,
      envelope: { decay: 0.1, level: 0.3 },
      tone: 0.1,
      g: 1,
    },
  ],
  [
    {
      shape: "sine",
      volume: 0.3,
      envelope: { attack: 0.03, decay: 0.2, level: 0.4 },
    },
    {
      shape: "square",
      volume: 7,
      envelope: { decay: 1, level: 0.1 },
      tone: 0.2,
      g: 1,
    },
  ],
  [
    {
      shape: "square",
      volume: 0.2,
      envelope: { attack: 0.05, decay: 0.1, level: 0.8 },
    },
    {
      shape: "square",
      volume: 4,
      envelope: { decay: 0.1, level: 1.1 },
      g: 1,
    },
  ],
  /* 73-80 : Pipe */
  [
    {
      shape: "sine",
      envelope: { attack: 0.02, decay: 2 },
    },
    {
      shape: "sine",
      volume: 6,
      envelope: { decay: 0.04 },
      pitch: { frequency: 2 },
      g: 1,
    },
  ],
  [
    {
      shape: "sine",
      volume: 0.7,
      envelope: { attack: 0.03, decay: 0.4, level: 0.4 },
    },
    {
      shape: "sine",
      volume: 4,
      envelope: { decay: 0.4 },
      pitch: { frequency: 2 },
      tone: 0.2,
      g: 1,
    },
  ],
  [
    {
      shape: "sine",
      volume: 0.7,
      envelope: { attack: 0.02, decay: 0.4, level: 0.6 },
    },
    {
      shape: "sine",
      volume: 3,
      envelope: { decay: 0, level: 1 },
      pitch: { frequency: 2 },
      g: 1,
    },
  ],
  [
    {
      shape: "sine",
      volume: 0.4,
      envelope: { attack: 0.06, decay: 0.3, level: 0.3 },
    },
    {
      shape: "sine",
      volume: 7,
      envelope: { decay: 0.2, level: 0.2 },
      pitch: { frequency: 2 },
      g: 1,
    },
  ],
  [
    {
      shape: "sine",
      envelope: { attack: 0.02, decay: 0.3, level: 0.3 },
    },
    {
      shape: "sawtooth",
      volume: 3,
      envelope: { decay: 0.3 },
      pitch: { frequency: 2 },
      g: 1,
    },
  ],
  [
    {
      shape: "sine",
      volume: 0.4,
      envelope: { attack: 0.02, decay: 2, level: 0.1 },
    },
    {
      shape: "sawtooth",
      volume: 8,
      envelope: { decay: 0.5 },
      pitch: { frequency: 2 },
      tone: 1,
      g: 1,
    },
  ],
  [
    {
      shape: "sine",
      volume: 0.7,
      envelope: { attack: 0.03, decay: 0.5, level: 0.3 },
    },
    {
      shape: "sine",
      volume: 0.003,
      envelope: { decay: 0.1, level: 0.002 },
      pitch: { frequency: 0 },
      tone: 4,
      g: 1,
    },
  ],
  [
    {
      shape: "sine",
      volume: 0.7,
      envelope: { attack: 0.02, decay: 2 },
    },
    {
      shape: "sine",
      volume: 1,
      envelope: { decay: 0.02 },
      pitch: { frequency: 2 },
      tone: 1,
      g: 1,
    },
  ],
  /* 81-88 : SynthLead */
  [
    {
      shape: "square",
      volume: 0.3,
      envelope: { decay: 1, level: 0.5 },
    },
    {
      shape: "square",
      volume: 1,
      envelope: { decay: 1, level: 0.5 },
      tone: 0.2,
      g: 1,
    },
  ],
  [
    {
      shape: "sawtooth",
      volume: 0.3,
      envelope: { decay: 2, level: 0.5 },
    },
    {
      shape: "square",
      volume: 2,
      envelope: { level: 0.5 },
      tone: 0.1,
      g: 1,
    },
  ],
  [
    {
      shape: "triangle",
      volume: 0.5,
      envelope: { attack: 0.05, decay: 2, level: 0.6 },
    },
    {
      shape: "sine",
      volume: 4,
      envelope: {},
      pitch: { frequency: 2 },
      g: 1,
    },
  ],
  [
    {
      shape: "triangle",
      volume: 0.3,
      envelope: { attack: 0.01, decay: 2, level: 0.3 },
    },
    {
      shape: "sine",
      volume: 22,
      envelope: { decay: 0.03, level: 0.2 },
      pitch: { frequency: 2 },
      tone: 1,
      g: 1,
    },
  ],
  [
    {
      shape: "sawtooth",
      volume: 0.3,
      envelope: { decay: 1, level: 0.5 },
    },
    {
      shape: "sine",
      volume: 11,
      envelope: { attack: 0.2, decay: 0.05, level: 0.3 },
      pitch: { frequency: 11 },
      g: 1,
    },
  ],
  [
    {
      shape: "sine",
      volume: 0.3,
      envelope: { attack: 0.06, decay: 1, level: 0.5 },
    },
    {
      shape: "sine",
      volume: 7,
      envelope: { decay: 1, level: 0.2 },
      tone: 1,
      g: 1,
    },
  ],
  [
    {
      shape: "sawtooth",
      volume: 0.3,
      envelope: {
        attack: 0.03,
        decay: 0.7,
        release: 0.2,
        level: 0.3,
      },
    },
    {
      shape: "sawtooth",
      volume: 0.3,
      envelope: {
        decay: 0.7,
        attack: 0.1,
        release: 0.2,
        level: 0.3,
      },
      pitch: { frequency: 0.75 },
    },
  ],
  [
    {
      shape: "triangle",
      volume: 0.3,
      envelope: { attack: 0.01, decay: 0.7, level: 0.5 },
    },
    {
      shape: "square",
      volume: 5,
      envelope: { decay: 0.7, level: 0.5 },
      pitch: { frequency: 0.5 },
      g: 1,
    },
  ],
  /* 89-96 : SynthPad */
  [
    {
      shape: "triangle",
      volume: 0.3,
      envelope: {
        attack: 0.02,
        decay: 0.3,
        release: 0.3,
        level: 0.3,
      },
    },
    {
      shape: "square",
      volume: 3,
      envelope: { attack: 0.02, decay: 0.1, level: 1 },
      pitch: { frequency: 4 },
      tone: 1,
      g: 1,
    },
    {
      shape: "triangle",
      volume: 0.08,
      envelope: {
        attack: 0.1,
        decay: 0.1,
        sustain: 0,
        release: 0.1,
        level: 0.5,
      },
      pitch: { frequency: 0.5 },
      b: 0,
      c: 0,
    },
  ],
  [
    {
      shape: "sine",
      volume: 0.3,
      envelope: {
        attack: 0.05,
        decay: 1,
        release: 0.3,
        level: 0.7,
      },
    },
    {
      shape: "sine",
      volume: 2,
      envelope: { decay: 0.3, level: 1 },
      tone: 1,
      g: 1,
    },
  ],
  [
    {
      shape: "square",
      volume: 0.3,
      envelope: {
        attack: 0.03,
        decay: 0.5,
        release: 0.1,
        level: 0.3,
      },
    },
    {
      shape: "square",
      volume: 4,
      envelope: { attack: 0.03, decay: 0.1 },
      tone: 1,
      g: 1,
    },
  ],
  [
    {
      shape: "triangle",
      volume: 0.3,
      envelope: {
        attack: 0.08,
        decay: 1,
        release: 0.1,
        level: 0.3,
      },
    },
    {
      shape: "square",
      volume: 2,
      envelope: { attack: 0.08, decay: 0.3, level: 0.3 },
      pitch: { frequency: 4 },
      tone: 1,
      g: 1,
    },
  ],
  [
    {
      shape: "sine",
      volume: 0.3,
      envelope: {
        attack: 0.05,
        decay: 1,
        release: 0.1,
        level: 0.3,
      },
    },
    {
      shape: "sine",
      volume: 0.1,
      envelope: { decay: 1, level: 50 },
      pitch: { frequency: 2.001 },
      tone: 1,
      g: 1,
    },
  ],
  [
    {
      shape: "triangle",
      volume: 0.3,
      envelope: {
        attack: 0.03,
        decay: 0.7,
        release: 0.2,
        level: 0.3,
      },
    },
    {
      shape: "sine",
      volume: 12,
      envelope: { decay: 0.5, level: 1.7 },
      pitch: { frequency: 7 },
      tone: 1,
      g: 1,
    },
  ],
  [
    {
      shape: "sine",
      volume: 0.3,
      envelope: {
        attack: 0.05,
        decay: 1,
        release: 0.1,
        level: 0.3,
      },
    },
    {
      shape: "sawtooth",
      volume: 22,
      envelope: { decay: 0.06, level: 0.3 },
      pitch: { frequency: 6 },
      g: 1,
    },
  ],
  [
    {
      shape: "triangle",
      volume: 0.3,
      envelope: { attack: 0.05, decay: 11, release: 0.3 },
    },
    {
      shape: "triangle",
      volume: 1,
      envelope: { decay: 1, level: 8 },
      g: 1,
    },
  ],
  /* 97-104 : FX */
  [
    {
      shape: "sawtooth",
      volume: 0.3,
      envelope: { decay: 4, level: 0.8, release: 0.1 },
    },
    {
      shape: "square",
      volume: 1,
      envelope: { attack: 1, decay: 1, level: 1, release: 0.1 },
      pitch: { frequency: 2 },
      tone: 8,
      g: 1,
    },
  ],
  [
    {
      shape: "triangle",
      volume: 0.3,
      envelope: { attack: 0.2, decay: 1, level: 0.5 },
      pitch: { frequency: 0.8 },
      pitchBend: 1.25,
      pitchBendRamp: 0.2,
    },
    {
      shape: "sawtooth",
      volume: 0.2,
      envelope: { attack: 0.2, decay: 0.3, level: 1 },
      pitch: { frequency: 1.2 },
      pitchBend: 1.25,
      pitchBendRamp: 0.2,
    },
  ],
  [
    {
      shape: "sine",
      volume: 0.3,
      envelope: { decay: 1, level: 0.3 },
    },
    {
      shape: "square",
      volume: 22,
      envelope: { decay: 0.5, level: 0.1 },
      pitch: { frequency: 11 },
      g: 1,
    },
  ],
  [
    {
      shape: "sawtooth",
      volume: 0.3,
      envelope: {
        attack: 0.04,
        decay: 1,
        release: 0.1,
        level: 0.8,
      },
    },
    {
      shape: "square",
      volume: 1,
      envelope: { decay: 1, level: 2 },
      pitch: { frequency: 0.5 },
      g: 1,
    },
  ],
  [
    {
      shape: "triangle",
      volume: 0.3,
      envelope: { decay: 1, level: 0.3 },
    },
    {
      shape: "sine",
      volume: 22,
      envelope: { decay: 0.6, level: 0.05 },
      pitch: { frequency: 6 },
      g: 1,
    },
  ],
  [
    {
      shape: "sine",
      volume: 0.6,
      envelope: { attack: 0.1, decay: 0.05, level: 0.4 },
    },
    {
      shape: "sine",
      volume: 5,
      envelope: { decay: 0.05, level: 0.3 },
      pitch: { frequency: 5 },
      tone: 1,
      g: 1,
    },
  ],
  [
    {
      shape: "sine",
      volume: 0.8,
      envelope: { attack: 0.1, decay: 0.05, level: 0.4 },
    },
    {
      shape: "sine",
      volume: 5,
      envelope: { decay: 0.05, level: 0.3 },
      pitch: { frequency: 5 },
      tone: 1,
      g: 1,
    },
  ],
  [
    {
      shape: "square",
      volume: 0.3,
      envelope: { attack: 0.1, decay: 0.1, level: 0.4 },
    },
    {
      shape: "square",
      volume: 1,
      envelope: { decay: 0.3, level: 0.1 },
      tone: 1,
      g: 1,
    },
  ],
  /* 105-112 : Ethnic */
  [
    {
      shape: "sawtooth",
      volume: 0.3,
      envelope: { decay: 0.5, release: 0.5 },
    },
    {
      shape: "sawtooth",
      volume: 11,
      envelope: { decay: 0.05 },
      pitch: { frequency: 5 },
      g: 1,
    },
  ],
  [
    {
      shape: "square",
      volume: 0.3,
      envelope: { decay: 0.2, release: 0.2 },
    },
    {
      shape: "square",
      volume: 7,
      envelope: { decay: 0.05 },
      pitch: { frequency: 3 },
      g: 1,
    },
  ],
  [
    {
      shape: "triangle",
      envelope: { decay: 0.2, release: 0.2 },
    },
    {
      shape: "square",
      volume: 9,
      envelope: { decay: 0.1, release: 0.1 },
      pitch: { frequency: 3 },
      g: 1,
    },
  ],
  [
    {
      shape: "triangle",
      envelope: { decay: 0.3, release: 0.3 },
    },
    {
      shape: "square",
      volume: 6,
      envelope: { decay: 1, release: 1 },
      pitch: { frequency: 3 },
      g: 1,
    },
  ],
  [
    {
      shape: "triangle",
      volume: 0.4,
      envelope: { decay: 0.2, release: 0.2 },
    },
    {
      shape: "square",
      volume: 22,
      envelope: { decay: 0.1, release: 0.1 },
      pitch: { frequency: 12 },
      g: 1,
    },
  ],
  [
    {
      shape: "sine",
      volume: 0.25,
      envelope: { attack: 0.02, decay: 0.05, level: 0.8 },
    },
    {
      shape: "square",
      volume: 1,
      envelope: { decay: 0.03, level: 11 },
      pitch: { frequency: 2 },
      g: 1,
    },
  ],
  [
    {
      shape: "sine",
      volume: 0.3,
      envelope: { attack: 0.05, decay: 11 },
    },
    {
      shape: "square",
      volume: 7,
      envelope: { level: 0.7 },
      pitch: { frequency: 3 },
      tone: 1,
      g: 1,
    },
  ],
  [
    {
      shape: "square",
      volume: 0.3,
      envelope: { attack: 0.05, decay: 0.1, level: 0.8 },
    },
    {
      shape: "square",
      volume: 4,
      envelope: { decay: 0.1, level: 1.1 },
      g: 1,
    },
  ],
  /* 113-120 : Percussive */
  [
    {
      shape: "sine",
      volume: 0.4,
      envelope: { decay: 0.3, release: 0.3 },
    },
    {
      shape: "sine",
      volume: 7,
      envelope: { decay: 0.1, release: 0.1 },
      pitch: { frequency: 9 },
      g: 1,
    },
  ],
  [
    {
      shape: "sine",
      volume: 0.7,
      envelope: { decay: 0.1, release: 0.1 },
    },
    {
      shape: "sine",
      volume: 22,
      envelope: { decay: 0.05 },
      pitch: { frequency: 7 },
      g: 1,
    },
  ],
  [
    {
      shape: "sine",
      volume: 0.6,
      envelope: { decay: 0.15, release: 0.15 },
    },
    {
      shape: "square",
      volume: 11,
      envelope: { decay: 0.1, release: 0.1 },
      pitch: { frequency: 3.2 },
      g: 1,
    },
  ],
  [
    {
      shape: "sine",
      volume: 0.8,
      envelope: { decay: 0.07, release: 0.07 },
    },
    {
      shape: "square",
      volume: 11,
      envelope: { release: 0.01 },
      pitch: { frequency: 7 },
      g: 1,
    },
  ],
  [
    {
      shape: "triangle",
      volume: 0.7,
      envelope: { decay: 0.2, release: 0.2 },
      pitch: { frequency: 0.5 },
      pitchBend: 0.95,
    },
    {
      shape: "whitenoise",
      volume: 9,
      envelope: { decay: 0.2, release: 0.2 },
      g: 1,
    },
  ],
  [
    {
      shape: "sine",
      volume: 0.7,
      envelope: { decay: 0.1, release: 0.1 },
      pitchBend: 0.9,
    },
    {
      shape: "square",
      volume: 14,
      envelope: { decay: 0.005, release: 0.005 },
      pitch: { frequency: 2 },
      g: 1,
    },
  ],
  [
    {
      shape: "square",
      envelope: { decay: 0.15, release: 0.15 },
      pitchBend: 0.5,
    },
    {
      shape: "square",
      volume: 4,
      envelope: { decay: 0.001, release: 0.001 },
      pitch: { frequency: 5 },
      g: 1,
    },
  ],
  [
    {
      shape: "pinknoise",
      volume: 0.3,
      envelope: { attack: 1, decay: 0.15, release: 0, level: 1 },
      pitch: { frequency: 0.5 },
    },
  ],
  /* 121-128 : SE */
  [
    {
      shape: "sine",
      volume: 0.3,
      pitch: { frequency: 12.5 },
      envelope: { decay: 0, sustain: 0.2, release: 0 },
      pitchBend: 0.5,
      pitchBendRamp: 0.5,
    },
    {
      shape: "sine",
      volume: 1,
      envelope: { decay: 0, release: 0, level: 1 },
      pitch: { frequency: 2 },
      g: 1,
    },
    {
      g: 1,
      shape: "whitenoise",
      volume: 0.2,
      envelope: {
        attack: 0.6,
        decay: 0.1,
        sustain: 0,
        release: 0.1,
      },
      pitch: { frequency: 2 },
      b: 0,
      c: 0,
    },
  ],
  [
    {
      shape: "whitenoise",
      volume: 0.2,
      envelope: {
        attack: 0.05,
        decay: 0.02,
        sustain: 0.02,
        release: 0.02,
      },
    },
  ],
  [
    {
      shape: "whitenoise",
      volume: 0.4,
      envelope: { attack: 1, decay: 1 },
      pitch: { frequency: 0.25 },
    },
  ],
  [
    {
      shape: "sine",
      volume: 0.3,
      envelope: { attack: 0.1, decay: 1, level: 0.5 },
    },
    {
      shape: "sine",
      volume: 4,
      envelope: { decay: 1, release: 0.1, level: 1 },
      pitch: { frequency: 0 },
      tone: 1.5,
      g: 1,
    },
    {
      g: 1,
      shape: "sine",
      volume: 4,
      envelope: {
        attack: 0.6,
        decay: 0.1,
        sustain: 0,
        release: 0.1,
        level: 1,
      },
      pitch: { frequency: 0 },
      tone: 2,
      b: 0,
      c: 0,
    },
  ],
  [
    {
      shape: "square",
      volume: 0.3,
      envelope: { decay: 11, level: 1 },
      pitch: { frequency: 0.25 },
    },
    {
      shape: "square",
      volume: 12,
      envelope: { decay: 1, release: 11, level: 1 },
      pitch: { frequency: 0 },
      tone: 8,
      g: 1,
    },
  ],
  [
    {
      shape: "whitenoise",
      volume: 0.4,
      envelope: { attack: 1, decay: 11, release: 0.5, level: 1 },
      pitch: { frequency: 0.5 },
    },
    {
      shape: "square",
      volume: 1,
      envelope: { decay: 1, release: 11, level: 1 },
      pitch: { frequency: 0 },
      tone: 14,
      g: 1,
    },
  ],
  [
    {
      shape: "sine",
      envelope: { attack: 0.2, decay: 1, release: 0.25, level: 1 },
      pitch: { frequency: 0 },
      tone: 1221,
    },
    {
      g: 1,
      shape: "whitenoise",
      volume: 3,
      envelope: { decay: 1, level: 1, release: 1 },
      pitch: { frequency: 0.5 },
    },
  ],
  [
    {
      shape: "sine",
      volume: 1,
      envelope: { decay: 0.4, release: 0.4 },
      pitch: { frequency: 2.5 },
      pitchBend: 0.1,
    },
    {
      shape: "whitenoise",
      volume: 12,
      envelope: { decay: 1, release: 1 },
      pitch: { frequency: 2 },
      g: 1,
    },
  ],
];
