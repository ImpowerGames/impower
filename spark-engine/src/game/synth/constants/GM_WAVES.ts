/*!
 * webaudio-tinysynth <https://github.com/g200kg/webaudio-tinysynth>
 *
 * Copyright (c) 2004 g200kg
 * Released under the Apache-2.0 license.
 */

import { Tuple } from "../types/Tuple";
import { Wave } from "../types/Wave";

export interface GeneralMidiWaves {
  program: Tuple<Wave[], 129>;
  percussion: Tuple<Wave[], 82>;
}

export const GM_WAVES: GeneralMidiWaves = {
  program: [
    /* 0 : None */
    [],
    /* 1-8 : Piano */
    [{ w: "triangle", v: 0.5, d: 0.7 }],
    [{ w: "triangle", v: 0.5, d: 0.7 }],
    [{ w: "triangle", v: 0.5, d: 0.7 }],
    [{ w: "triangle", v: 0.5, d: 0.7 }],
    [{ w: "triangle", v: 0.5, d: 0.7 }],
    [{ w: "triangle", v: 0.5, d: 0.7 }],
    [{ w: "sawtooth", v: 0.3, d: 0.7 }],
    [{ w: "sawtooth", v: 0.3, d: 0.7 }],
    /* 9-16 : Chromatic Percussion*/
    [{ w: "sine", v: 0.5, d: 0.3, r: 0.3 }],
    [{ w: "triangle", v: 0.5, d: 0.3, r: 0.3 }],
    [{ w: "square", v: 0.2, d: 0.3, r: 0.3 }],
    [{ w: "square", v: 0.2, d: 0.3, r: 0.3 }],
    [{ w: "sine", v: 0.5, d: 0.1, r: 0.1 }],
    [{ w: "sine", v: 0.5, d: 0.1, r: 0.1 }],
    [{ w: "square", v: 0.2, d: 1, r: 1 }],
    [{ w: "sawtooth", v: 0.3, d: 0.7, r: 0.7 }],
    /* 17-24 : Organ */
    [{ w: "sine", v: 0.5, a: 0.01, s: 1 }],
    [{ w: "sine", v: 0.7, d: 0.02, s: 0.7 }],
    [{ w: "square", v: 0.2, s: 1 }],
    [{ w: "triangle", v: 0.5, a: 0.01, s: 1 }],
    [{ w: "square", v: 0.2, a: 0.02, s: 1 }],
    [{ w: "square", v: 0.2, a: 0.02, s: 1 }],
    [{ w: "square", v: 0.2, a: 0.02, s: 1 }],
    [{ w: "square", v: 0.2, a: 0.05, s: 1 }],
    /* 25-32 : Guitar */
    [{ w: "triangle", v: 0.5, d: 0.5 }],
    [{ w: "square", v: 0.2, d: 0.6 }],
    [{ w: "square", v: 0.2, d: 0.6 }],
    [{ w: "triangle", v: 0.8, d: 0.6 }],
    [{ w: "triangle", v: 0.4, d: 0.05 }],
    [{ w: "square", v: 0.2, d: 1 }],
    [{ w: "square", v: 0.2, d: 1 }],
    [{ w: "sine", v: 0.4, d: 0.6 }],
    /* 33-40 : Bass */
    [{ w: "triangle", v: 0.7, d: 0.4 }],
    [{ w: "triangle", v: 0.7, d: 0.7 }],
    [{ w: "triangle", v: 0.7, d: 0.7 }],
    [{ w: "triangle", v: 0.7, d: 0.7 }],
    [{ w: "square", v: 0.3, d: 0.2 }],
    [{ w: "square", v: 0.3, d: 0.2 }],
    [{ w: "square", v: 0.3, d: 0.1, s: 0.2 }],
    [{ w: "sawtooth", v: 0.4, d: 0.1, s: 0.2 }],
    /* 41-48 : Strings */
    [{ w: "sawtooth", v: 0.2, a: 0.02, s: 1 }],
    [{ w: "sawtooth", v: 0.2, a: 0.02, s: 1 }],
    [{ w: "sawtooth", v: 0.2, a: 0.02, s: 1 }],
    [{ w: "sawtooth", v: 0.2, a: 0.02, s: 1 }],
    [{ w: "sawtooth", v: 0.2, a: 0.02, s: 1 }],
    [{ w: "sawtooth", v: 0.3, d: 0.1 }],
    [{ w: "sawtooth", v: 0.3, d: 0.5, r: 0.5 }],
    [{ w: "triangle", v: 0.6, d: 0.1, r: 0.1, h: 0.03, p: 0.8 }],
    /* 49-56 : Ensemble */
    [{ w: "sawtooth", v: 0.2, a: 0.02, s: 1 }],
    [{ w: "sawtooth", v: 0.2, a: 0.02, s: 1 }],
    [{ w: "sawtooth", v: 0.2, a: 0.02, s: 1 }],
    [{ w: "sawtooth", v: 0.2, a: 0.02, s: 1 }],
    [{ w: "triangle", v: 0.3, a: 0.03, s: 1 }],
    [{ w: "sine", v: 0.3, a: 0.03, s: 1 }],
    [{ w: "triangle", v: 0.3, a: 0.05, s: 1 }],
    [{ w: "sawtooth", v: 0.5, a: 0.01, d: 0.1 }],
    /* 57-64 : Brass */
    [{ w: "square", v: 0.3, a: 0.05, d: 0.2, s: 0.6 }],
    [{ w: "square", v: 0.3, a: 0.05, d: 0.2, s: 0.6 }],
    [{ w: "square", v: 0.3, a: 0.05, d: 0.2, s: 0.6 }],
    [{ w: "square", v: 0.2, a: 0.05, d: 0.01, s: 1 }],
    [{ w: "square", v: 0.3, a: 0.05, s: 1 }],
    [{ w: "square", v: 0.3, s: 0.7 }],
    [{ w: "square", v: 0.3, s: 0.7 }],
    [{ w: "square", v: 0.3, s: 0.7 }],
    /* 65-72 : Reed */
    [{ w: "square", v: 0.3, a: 0.02, d: 2 }],
    [{ w: "square", v: 0.3, a: 0.02, d: 2 }],
    [{ w: "square", v: 0.3, a: 0.03, d: 2 }],
    [{ w: "square", v: 0.3, a: 0.04, d: 2 }],
    [{ w: "square", v: 0.3, a: 0.02, d: 2 }],
    [{ w: "square", v: 0.3, a: 0.05, d: 2 }],
    [{ w: "square", v: 0.3, a: 0.03, d: 2 }],
    [{ w: "square", v: 0.3, a: 0.03, d: 2 }],
    /* 73-80 : Pipe */
    [{ w: "sine", v: 0.7, a: 0.02, d: 2 }],
    [{ w: "sine", v: 0.7, a: 0.02, d: 2 }],
    [{ w: "sine", v: 0.7, a: 0.02, d: 2 }],
    [{ w: "sine", v: 0.7, a: 0.02, d: 2 }],
    [{ w: "sine", v: 0.7, a: 0.02, d: 2 }],
    [{ w: "sine", v: 0.7, a: 0.02, d: 2 }],
    [{ w: "sine", v: 0.7, a: 0.02, d: 2 }],
    [{ w: "sine", v: 0.7, a: 0.02, d: 2 }],
    /* 81-88 : Synth Lead */
    [{ w: "square", v: 0.3, s: 0.7 }],
    [{ w: "sawtooth", v: 0.4, s: 0.7 }],
    [{ w: "triangle", v: 0.5, s: 0.7 }],
    [{ w: "sawtooth", v: 0.4, s: 0.7 }],
    [{ w: "sawtooth", v: 0.4, d: 12 }],
    [{ w: "sine", v: 0.4, a: 0.06, d: 12 }],
    [{ w: "sawtooth", v: 0.4, d: 12 }],
    [{ w: "sawtooth", v: 0.4, d: 12 }],
    /* 89-96 : Synth Pad */
    [{ w: "sawtooth", v: 0.3, d: 12 }],
    [{ w: "triangle", v: 0.5, d: 12 }],
    [{ w: "square", v: 0.3, d: 12 }],
    [{ w: "triangle", v: 0.5, a: 0.08, d: 11 }],
    [{ w: "sawtooth", v: 0.5, a: 0.05, d: 11 }],
    [{ w: "sawtooth", v: 0.5, d: 11 }],
    [{ w: "triangle", v: 0.5, d: 11 }],
    [{ w: "triangle", v: 0.5, d: 11 }],
    /* 97-104 : Synth Effects */
    [{ w: "triangle", v: 0.5, d: 11 }],
    [{ w: "triangle", v: 0.5, d: 11 }],
    [{ w: "square", v: 0.3, d: 11 }],
    [{ w: "sawtooth", v: 0.5, a: 0.04, d: 11 }],
    [{ w: "sawtooth", v: 0.5, d: 11 }],
    [{ w: "triangle", v: 0.5, a: 0.8, d: 11 }],
    [{ w: "triangle", v: 0.5, d: 11 }],
    [{ w: "square", v: 0.3, d: 11 }],
    /* 105-112 : Ethnic */
    [{ w: "sawtooth", v: 0.3, d: 1, r: 1 }],
    [{ w: "sawtooth", v: 0.5, d: 0.3 }],
    [{ w: "sawtooth", v: 0.5, d: 0.3, r: 0.3 }],
    [{ w: "sawtooth", v: 0.5, d: 0.3, r: 0.3 }],
    [{ w: "square", v: 0.3, d: 0.2, r: 0.2 }],
    [{ w: "square", v: 0.3, a: 0.02, d: 2 }],
    [{ w: "sawtooth", v: 0.2, a: 0.02, d: 0.7 }],
    [{ w: "triangle", v: 0.5, d: 1 }],
    /* 113-120 : Percussive */
    [{ w: "sawtooth", v: 0.3, d: 0.3, r: 0.3 }],
    [{ w: "sine", v: 0.8, d: 0.1, r: 0.1 }],
    [{ w: "square", v: 0.2, d: 0.1, r: 0.1, p: 1.05 }],
    [{ w: "sine", v: 0.8, d: 0.05, r: 0.05 }],
    [{ w: "triangle", v: 0.5, d: 0.1, r: 0.1, p: 0.96 }],
    [{ w: "triangle", v: 0.5, d: 0.1, r: 0.1, p: 0.97 }],
    [{ w: "square", v: 0.3, d: 0.1, r: 0.1 }],
    [{ w: "n1", v: 0.3, a: 1, s: 1, d: 0.15, r: 0, t: 0.5 }],
    /* 121-128 : Sound Effects */
    [{ w: "triangle", v: 0.5, d: 0.03, t: 0, f: 1332, r: 0.001, p: 1.1 }],
    [{ w: "n0", v: 0.2, t: 0.1, d: 0.02, a: 0.05, h: 0.02, r: 0.02 }],
    [{ w: "n0", v: 0.4, a: 1, d: 1, t: 0.25 }],
    [{ w: "sine", v: 0.3, a: 0.8, d: 1, t: 0, f: 1832 }],
    [{ w: "triangle", d: 0.5, t: 0, f: 444, s: 1 }],
    [{ w: "n0", v: 0.4, d: 1, t: 0, f: 22, s: 1 }],
    [{ w: "n0", v: 0.5, a: 0.2, d: 11, t: 0, f: 44 }],
    [{ w: "n0", v: 0.5, t: 0.25, d: 0.4, r: 0.4 }],
  ],

  percussion: [
    /* 0-34 : None */
    [],
    [],
    [],
    [],
    [],
    [],
    [],
    [],
    [],
    [],
    [],
    [],
    [],
    [],
    [],
    [],
    [],
    [],
    [],
    [],
    [],
    [],
    [],
    [],
    [],
    [],
    [],
    [],
    [],
    [],
    [],
    [],
    [],
    [],
    [],
    [{ w: "triangle", t: 0, f: 110, v: 1, d: 0.05, h: 0.02, p: 0.1 }],
    [
      {
        w: "triangle",
        t: 0,
        f: 150,
        v: 0.8,
        d: 0.1,
        p: 0.1,
        h: 0.02,
        r: 0.01,
      },
    ],
    [{ w: "n0", f: 392, v: 0.5, d: 0.01, p: 0, t: 0, r: 0.05 }],
    [{ w: "n0", f: 33, d: 0.05, t: 0 }],
    [{ w: "n0", f: 100, v: 0.7, d: 0.03, t: 0, r: 0.03, h: 0.02 }],
    [{ w: "n0", f: 44, v: 0.7, d: 0.02, p: 0.1, t: 0, h: 0.02 }],
    [{ w: "triangle", f: 240, v: 0.9, d: 0.1, h: 0.02, p: 0.1, t: 0 }],
    [{ w: "n0", f: 440, v: 0.2, r: 0.01, t: 0 }],
    [{ w: "triangle", f: 270, v: 0.9, d: 0.1, h: 0.02, p: 0.1, t: 0 }],
    [{ w: "n0", f: 440, v: 0.2, d: 0.04, r: 0.04, t: 0 }],
    [{ w: "triangle", f: 300, v: 0.9, d: 0.1, h: 0.02, p: 0.1, t: 0 }],
    [{ w: "n0", f: 440, v: 0.2, d: 0.1, r: 0.1, h: 0.02, t: 0 }],
    [{ w: "triangle", f: 320, v: 0.9, d: 0.1, h: 0.02, p: 0.1, t: 0 }],
    [{ w: "triangle", f: 360, v: 0.9, d: 0.1, h: 0.02, p: 0.1, t: 0 }],
    [{ w: "n0", f: 150, v: 0.2, d: 0.1, r: 0.1, h: 0.05, t: 0, p: 0.1 }],
    [{ w: "triangle", f: 400, v: 0.9, d: 0.1, h: 0.02, p: 0.1, t: 0 }],
    [{ w: "n0", f: 150, v: 0.2, d: 0.1, r: 0.01, h: 0.05, t: 0, p: 0.1 }],
    [{ w: "n0", f: 150, v: 0.2, d: 0.1, r: 0.01, h: 0.05, t: 0, p: 0.1 }],
    [{ w: "n0", f: 440, v: 0.3, d: 0.1, p: 0.9, t: 0, r: 0.1 }],
    [{ w: "n0", f: 200, v: 0.2, d: 0.05, p: 0.9, t: 0 }],
    [{ w: "n0", f: 440, v: 0.3, d: 0.12, p: 0.9, t: 0 }],
    [{ w: "sine", f: 800, v: 0.4, d: 0.06, t: 0 }],
    [{ w: "n0", f: 150, v: 0.2, d: 0.1, r: 0.01, h: 0.05, t: 0, p: 0.1 }],
    [{ w: "n0", f: 33, v: 0.3, d: 0.2, p: 0.9, t: 0 }],
    [{ w: "n0", f: 300, v: 0.3, d: 0.14, p: 0.9, t: 0 }],
    [{ w: "sine", f: 200, d: 0.06, t: 0 }],
    [{ w: "sine", f: 150, d: 0.06, t: 0 }],
    [{ w: "sine", f: 300, t: 0 }],
    [{ w: "sine", f: 300, d: 0.06, t: 0 }],
    [{ w: "sine", f: 250, d: 0.06, t: 0 }],
    [{ w: "square", f: 300, v: 0.3, d: 0.06, p: 0.8, t: 0 }],
    [{ w: "square", f: 260, v: 0.3, d: 0.06, p: 0.8, t: 0 }],
    [{ w: "sine", f: 850, v: 0.5, d: 0.07, t: 0 }],
    [{ w: "sine", f: 790, v: 0.5, d: 0.07, t: 0 }],
    [{ w: "n0", f: 440, v: 0.3, a: 0.05, t: 0 }],
    [{ w: "n0", f: 440, v: 0.3, a: 0.05, t: 0 }],
    [{ w: "triangle", f: 1800, v: 0.4, p: 0.9, t: 0, h: 0.03 }],
    [{ w: "triangle", f: 1800, v: 0.3, p: 0.9, t: 0, h: 0.13 }],
    [{ w: "n0", f: 330, v: 0.3, a: 0.02, t: 0, r: 0.01 }],
    [{ w: "n0", f: 330, v: 0.3, a: 0.02, t: 0, h: 0.04, r: 0.01 }],
    [{ w: "n0", f: 440, v: 0.3, t: 0 }],
    [{ w: "sine", f: 800, t: 0 }],
    [{ w: "sine", f: 700, t: 0 }],
    [{ w: "n0", f: 330, v: 0.3, t: 0 }],
    [{ w: "n0", f: 330, v: 0.3, t: 0, h: 0.1, r: 0.01, p: 0.7 }],
    [{ w: "sine", t: 0, f: 1200, v: 0.3, r: 0.01 }],
    [{ w: "sine", t: 0, f: 1200, v: 0.3, d: 0.2, r: 0.2 }],
  ],
};

export const GM_WAVES_FM: GeneralMidiWaves = {
  program: [
    /* 0 : None */
    [],
    /* 1-8 : Piano */
    [
      { w: "sine", v: 0.4, d: 0.7, r: 0.1 },
      { w: "triangle", v: 3, d: 0.7, s: 0.1, g: 1, a: 0.01, k: -1.2 },
    ],
    [
      { w: "triangle", v: 0.4, d: 0.7, r: 0.1 },
      { w: "triangle", v: 4, t: 3, d: 0.4, s: 0.1, g: 1, k: -1, a: 0.01 },
    ],
    [
      { w: "sine", d: 0.7, r: 0.1 },
      { w: "triangle", v: 4, f: 2, d: 0.5, s: 0.5, g: 1, k: -1 },
    ],
    [
      { w: "sine", d: 0.7, v: 0.2 },
      {
        w: "triangle",
        v: 4,
        t: 3,
        f: 2,
        d: 0.3,
        g: 1,
        k: -1,
        a: 0.01,
        s: 0.5,
      },
    ],
    [
      { w: "sine", v: 0.35, d: 0.7 },
      { w: "sine", v: 3, t: 7, f: 1, d: 1, s: 1, g: 1, k: -0.7 },
    ],
    [
      { w: "sine", v: 0.35, d: 0.7 },
      { w: "sine", v: 8, t: 7, f: 1, d: 0.5, s: 1, g: 1, k: -0.7 },
    ],
    [
      { w: "sawtooth", v: 0.34, d: 2 },
      { w: "sine", v: 8, f: 0.1, d: 2, s: 1, r: 2, g: 1 },
    ],
    [
      { w: "triangle", v: 0.34, d: 1.5 },
      { w: "square", v: 6, f: 0.1, d: 1.5, s: 0.5, r: 2, g: 1 },
    ],
    /* 9-16 : Chromatic Percussion*/
    [
      { w: "sine", d: 0.3, r: 0.3 },
      { w: "sine", v: 7, t: 11, d: 0.03, g: 1 },
    ],
    [
      { w: "sine", d: 0.3, r: 0.3 },
      { w: "sine", v: 11, t: 6, d: 0.2, s: 0.4, g: 1 },
    ],
    [
      { w: "sine", v: 0.2, d: 0.3, r: 0.3 },
      { w: "sine", v: 11, t: 5, d: 0.1, s: 0.4, g: 1 },
    ],
    [
      { w: "sine", v: 0.2, d: 0.6, r: 0.6 },
      { w: "triangle", v: 11, t: 5, f: 1, s: 0.5, g: 1 },
    ],
    [
      { w: "sine", v: 0.3, d: 0.2, r: 0.2 },
      { w: "sine", v: 6, t: 5, d: 0.02, g: 1 },
    ],
    [
      { w: "sine", v: 0.3, d: 0.2, r: 0.2 },
      { w: "sine", v: 7, t: 11, d: 0.03, g: 1 },
    ],
    [
      { w: "sine", v: 0.2, d: 1, r: 1 },
      { w: "sine", v: 11, t: 3.5, d: 1, r: 1, g: 1 },
    ],
    [
      { w: "triangle", v: 0.2, d: 0.5, r: 0.2 },
      { w: "sine", v: 6, t: 2.5, d: 0.2, s: 0.1, r: 0.2, g: 1 },
    ],
    /* 17-24 : Organ */
    [
      { w: "w9999", v: 0.22, s: 0.9 },
      { w: "w9999", v: 0.22, t: 2, f: 2, s: 0.9 },
    ],
    [
      { w: "w9999", v: 0.2, s: 1 },
      {
        w: "sine",
        v: 11,
        t: 6,
        f: 2,
        s: 0.1,
        g: 1,
        h: 0.006,
        r: 0.002,
        d: 0.002,
      },
      { w: "w9999", v: 0.2, t: 2, f: 1, h: 0, s: 1 },
    ],
    [
      { w: "w9999", v: 0.2, d: 0.1, s: 0.9 },
      { w: "w9999", v: 0.25, t: 4, f: 2, s: 0.5 },
    ],
    [
      { w: "w9999", v: 0.3, a: 0.04, s: 0.9 },
      { w: "w9999", v: 0.2, t: 8, f: 2, a: 0.04, s: 0.9 },
    ],
    [
      { w: "sine", v: 0.2, a: 0.02, d: 0.05, s: 1 },
      { w: "sine", v: 6, t: 3, f: 1, a: 0.02, d: 0.05, s: 1, g: 1 },
    ],
    [
      { w: "triangle", v: 0.2, a: 0.02, d: 0.05, s: 0.8 },
      { w: "square", v: 7, t: 3, f: 1, d: 0.05, s: 1.5, g: 1 },
    ],
    [
      { w: "square", v: 0.2, a: 0.02, d: 0.2, s: 0.5 },
      { w: "square", v: 1, d: 0.03, s: 2, g: 1 },
    ],
    [
      { w: "square", v: 0.2, a: 0.02, d: 0.1, s: 0.8 },
      { w: "square", v: 1, a: 0.3, d: 0.1, s: 2, g: 1 },
    ],
    /* 25-32 : Guitar */
    [
      { w: "sine", v: 0.3, d: 0.5, f: 1 },
      { w: "triangle", v: 5, t: 3, f: -1, d: 1, s: 0.1, g: 1 },
    ],
    [
      { w: "sine", v: 0.4, d: 0.6, f: 1 },
      { w: "triangle", v: 12, t: 3, d: 0.6, s: 0.1, g: 1, f: -1 },
    ],
    [
      { w: "triangle", v: 0.3, d: 1, f: 1 },
      { w: "triangle", v: 6, f: -1, d: 0.4, s: 0.5, g: 1, t: 3 },
    ],
    [
      { w: "sine", v: 0.3, d: 1, f: -1 },
      { w: "triangle", v: 11, f: 1, d: 0.4, s: 0.5, g: 1, t: 3 },
    ],
    [
      { w: "sine", v: 0.4, d: 0.1, r: 0.01 },
      { w: "sine", v: 7, g: 1 },
    ],
    [
      { w: "triangle", v: 0.4, d: 1, f: 1 },
      { w: "square", v: 4, f: -1, d: 1, s: 0.7, g: 1 },
    ], //[{w:"triangle",v:0.35,d:1,f:1,},{w:"square",v:7,f:-1,d:0.3,s:0.5,g:1,}],
    [
      { w: "triangle", v: 0.35, d: 1, f: 1 },
      { w: "square", v: 7, f: -1, d: 0.3, s: 0.5, g: 1 },
    ], //[{w:"triangle",v:0.4,d:1,f:1,},{w:"square",v:4,f:-1,d:1,s:0.7,g:1,}],//[{w:"triangle",v:0.4,d:1,},{w:"square",v:4,f:2,d:1,s:0.7,g:1,}],
    [
      { w: "sine", v: 0.2, t: 1.5, a: 0.005, h: 0.2, d: 0.6 },
      { w: "sine", v: 11, t: 5, f: 2, d: 1, s: 0.5, g: 1 },
    ],
    /* 33-40 : Bass */
    [
      { w: "sine", d: 0.3 },
      { w: "sine", v: 4, t: 3, d: 1, s: 1, g: 1 },
    ],
    [
      { w: "sine", d: 0.3 },
      { w: "sine", v: 4, t: 3, d: 1, s: 1, g: 1 },
    ],
    [
      { w: "w9999", d: 0.3, v: 0.7, s: 0.5 },
      { w: "sawtooth", v: 1.2, d: 0.02, s: 0.5, g: 1, h: 0, r: 0.02 },
    ],
    [
      { w: "sine", d: 0.3 },
      { w: "sine", v: 4, t: 3, d: 1, s: 1, g: 1 },
    ],
    [
      { w: "triangle", v: 0.3, t: 2, d: 1 },
      { w: "triangle", v: 15, t: 2.5, d: 0.04, s: 0.1, g: 1 },
    ],
    [
      { w: "triangle", v: 0.3, t: 2, d: 1 },
      { w: "triangle", v: 15, t: 2.5, d: 0.04, s: 0.1, g: 1 },
    ],
    [
      { w: "triangle", d: 0.7 },
      { w: "square", v: 0.4, t: 0.5, f: 1, d: 0.2, s: 10, g: 1 },
    ],
    [
      { w: "triangle", d: 0.7 },
      { w: "square", v: 0.4, t: 0.5, f: 1, d: 0.2, s: 10, g: 1 },
    ],
    /* 41-48 : Strings */
    [
      { w: "sawtooth", v: 0.4, a: 0.1, d: 11 },
      { w: "sine", v: 5, d: 11, s: 0.2, g: 1 },
    ],
    [
      { w: "sawtooth", v: 0.4, a: 0.1, d: 11 },
      { w: "sine", v: 5, d: 11, s: 0.2, g: 1 },
    ],
    [
      { w: "sawtooth", v: 0.4, a: 0.1, d: 11 },
      { w: "sine", v: 5, t: 0.5, d: 11, s: 0.2, g: 1 },
    ],
    [
      { w: "sawtooth", v: 0.4, a: 0.1, d: 11 },
      { w: "sine", v: 5, t: 0.5, d: 11, s: 0.2, g: 1 },
    ],
    [
      { w: "sine", v: 0.4, a: 0.1, d: 11 },
      { w: "sine", v: 6, f: 2.5, d: 0.05, s: 1.1, g: 1 },
    ],
    [
      { w: "sine", v: 0.3, d: 0.1, r: 0.1 },
      { w: "square", v: 4, t: 3, d: 1, s: 0.2, g: 1 },
    ],
    [
      { w: "sine", v: 0.3, d: 0.5, r: 0.5 },
      { w: "sine", v: 7, t: 2, f: 2, d: 1, r: 1, g: 1 },
    ],
    [
      { w: "triangle", v: 0.6, h: 0.03, d: 0.3, r: 0.3, t: 0.5 },
      { w: "n0", v: 8, t: 1.5, d: 0.08, r: 0.08, g: 1 },
    ],
    /* 49-56 : Ensemble */
    [
      { w: "sawtooth", v: 0.3, a: 0.03, s: 0.5 },
      { w: "sawtooth", v: 0.2, t: 2, f: 2, d: 1, s: 2 },
    ],
    [
      { w: "sawtooth", v: 0.3, f: -2, a: 0.03, s: 0.5 },
      { w: "sawtooth", v: 0.2, t: 2, f: 2, d: 1, s: 2 },
    ],
    [
      { w: "sawtooth", v: 0.2, a: 0.02, s: 1 },
      { w: "sawtooth", v: 0.2, t: 2, f: 2, a: 1, d: 1, s: 1 },
    ],
    [
      { w: "sawtooth", v: 0.2, a: 0.02, s: 1 },
      { w: "sawtooth", v: 0.2, f: 2, a: 0.02, d: 1, s: 1 },
    ],
    [
      { w: "triangle", v: 0.3, a: 0.03, s: 1 },
      { w: "sine", v: 3, t: 5, f: 1, d: 1, s: 1, g: 1 },
    ],
    [
      { w: "sine", v: 0.4, a: 0.03, s: 0.9 },
      { w: "sine", v: 1, t: 2, f: 3, d: 0.03, s: 0.2, g: 1 },
    ],
    [
      { w: "triangle", v: 0.6, a: 0.05, s: 0.5 },
      { w: "sine", v: 1, f: 0.8, d: 0.2, s: 0.2, g: 1 },
    ],
    [
      { w: "square", v: 0.15, a: 0.01, d: 0.2, r: 0.2, t: 0.5, h: 0.03 },
      { w: "square", v: 4, f: 0.5, d: 0.2, r: 11, a: 0.01, g: 1, h: 0.02 },
      {
        w: "square",
        v: 0.15,
        t: 4,
        f: 1,
        a: 0.02,
        d: 0.15,
        r: 0.15,
        h: 0.03,
      },
      { g: 3, w: "square", v: 4, f: -0.5, a: 0.01, h: 0.02, d: 0.15, r: 11 },
    ],
    /* 57-64 : Brass */
    [
      { w: "square", v: 0.2, a: 0.01, d: 1, s: 0.6, r: 0.04 },
      { w: "sine", v: 1, d: 0.1, s: 4, g: 1 },
    ],
    [
      { w: "square", v: 0.2, a: 0.02, d: 1, s: 0.5, r: 0.08 },
      { w: "sine", v: 1, d: 0.1, s: 4, g: 1 },
    ],
    [
      { w: "square", v: 0.2, a: 0.04, d: 1, s: 0.4, r: 0.08 },
      { w: "sine", v: 1, d: 0.1, s: 4, g: 1 },
    ],
    [
      { w: "square", v: 0.15, a: 0.04, s: 1 },
      { w: "sine", v: 2, d: 0.1, g: 1 },
    ],
    [
      { w: "square", v: 0.2, a: 0.02, d: 1, s: 0.5, r: 0.08 },
      { w: "sine", v: 1, d: 0.1, s: 4, g: 1 },
    ],
    [
      { w: "square", v: 0.2, a: 0.02, d: 1, s: 0.6, r: 0.08 },
      { w: "sine", v: 1, f: 0.2, d: 0.1, s: 4, g: 1 },
    ],
    [
      { w: "square", v: 0.2, a: 0.02, d: 0.5, s: 0.7, r: 0.08 },
      { w: "sine", v: 1, d: 0.1, s: 4, g: 1 },
    ],
    [
      { w: "square", v: 0.2, a: 0.02, d: 1, s: 0.5, r: 0.08 },
      { w: "sine", v: 1, d: 0.1, s: 4, g: 1 },
    ],
    /* 65-72 : Reed */
    [
      { w: "square", v: 0.2, a: 0.02, d: 2, s: 0.6 },
      { w: "sine", v: 2, d: 1, g: 1 },
    ],
    [
      { w: "square", v: 0.2, a: 0.02, d: 2, s: 0.6 },
      { w: "sine", v: 2, d: 1, g: 1 },
    ],
    [
      { w: "square", v: 0.2, a: 0.02, d: 1, s: 0.6 },
      { w: "sine", v: 2, d: 1, g: 1 },
    ],
    [
      { w: "square", v: 0.2, a: 0.02, d: 1, s: 0.6 },
      { w: "sine", v: 2, d: 1, g: 1 },
    ],
    [
      { w: "sine", v: 0.4, a: 0.02, d: 0.7, s: 0.5 },
      { w: "square", v: 5, t: 2, d: 0.2, s: 0.5, g: 1 },
    ],
    [
      { w: "sine", v: 0.3, a: 0.05, d: 0.2, s: 0.8 },
      { w: "sawtooth", v: 6, f: 0.1, d: 0.1, s: 0.3, g: 1 },
    ],
    [
      { w: "sine", v: 0.3, a: 0.03, d: 0.2, s: 0.4 },
      { w: "square", v: 7, f: 0.2, d: 1, s: 0.1, g: 1 },
    ],
    [
      { w: "square", v: 0.2, a: 0.05, d: 0.1, s: 0.8 },
      { w: "square", v: 4, d: 0.1, s: 1.1, g: 1 },
    ],
    /* 73-80 : Pipe */
    [
      { w: "sine", a: 0.02, d: 2 },
      { w: "sine", v: 6, t: 2, d: 0.04, g: 1 },
    ],
    [
      { w: "sine", v: 0.7, a: 0.03, d: 0.4, s: 0.4 },
      { w: "sine", v: 4, t: 2, f: 0.2, d: 0.4, g: 1 },
    ],
    [
      { w: "sine", v: 0.7, a: 0.02, d: 0.4, s: 0.6 },
      { w: "sine", v: 3, t: 2, d: 0, s: 1, g: 1 },
    ],
    [
      { w: "sine", v: 0.4, a: 0.06, d: 0.3, s: 0.3 },
      { w: "sine", v: 7, t: 2, d: 0.2, s: 0.2, g: 1 },
    ],
    [
      { w: "sine", a: 0.02, d: 0.3, s: 0.3 },
      { w: "sawtooth", v: 3, t: 2, d: 0.3, g: 1 },
    ],
    [
      { w: "sine", v: 0.4, a: 0.02, d: 2, s: 0.1 },
      { w: "sawtooth", v: 8, t: 2, f: 1, d: 0.5, g: 1 },
    ],
    [
      { w: "sine", v: 0.7, a: 0.03, d: 0.5, s: 0.3 },
      { w: "sine", v: 0.003, t: 0, f: 4, d: 0.1, s: 0.002, g: 1 },
    ],
    [
      { w: "sine", v: 0.7, a: 0.02, d: 2 },
      { w: "sine", v: 1, t: 2, f: 1, d: 0.02, g: 1 },
    ],
    /* 81-88 : Synth Lead */
    [
      { w: "square", v: 0.3, d: 1, s: 0.5 },
      { w: "square", v: 1, f: 0.2, d: 1, s: 0.5, g: 1 },
    ],
    [
      { w: "sawtooth", v: 0.3, d: 2, s: 0.5 },
      { w: "square", v: 2, f: 0.1, s: 0.5, g: 1 },
    ],
    [
      { w: "triangle", v: 0.5, a: 0.05, d: 2, s: 0.6 },
      { w: "sine", v: 4, t: 2, g: 1 },
    ],
    [
      { w: "triangle", v: 0.3, a: 0.01, d: 2, s: 0.3 },
      { w: "sine", v: 22, t: 2, f: 1, d: 0.03, s: 0.2, g: 1 },
    ],
    [
      { w: "sawtooth", v: 0.3, d: 1, s: 0.5 },
      { w: "sine", v: 11, t: 11, a: 0.2, d: 0.05, s: 0.3, g: 1 },
    ],
    [
      { w: "sine", v: 0.3, a: 0.06, d: 1, s: 0.5 },
      { w: "sine", v: 7, f: 1, d: 1, s: 0.2, g: 1 },
    ],
    [
      { w: "sawtooth", v: 0.3, a: 0.03, d: 0.7, s: 0.3, r: 0.2 },
      { w: "sawtooth", v: 0.3, t: 0.75, d: 0.7, a: 0.1, s: 0.3, r: 0.2 },
    ],
    [
      { w: "triangle", v: 0.3, a: 0.01, d: 0.7, s: 0.5 },
      { w: "square", v: 5, t: 0.5, d: 0.7, s: 0.5, g: 1 },
    ],
    /* 89-96 : Synth Pad */
    [
      { w: "triangle", v: 0.3, a: 0.02, d: 0.3, s: 0.3, r: 0.3 },
      { w: "square", v: 3, t: 4, f: 1, a: 0.02, d: 0.1, s: 1, g: 1 },
      {
        w: "triangle",
        v: 0.08,
        t: 0.5,
        a: 0.1,
        h: 0,
        d: 0.1,
        s: 0.5,
        r: 0.1,
        b: 0,
        c: 0,
      },
    ],
    [
      { w: "sine", v: 0.3, a: 0.05, d: 1, s: 0.7, r: 0.3 },
      { w: "sine", v: 2, f: 1, d: 0.3, s: 1, g: 1 },
    ],
    [
      { w: "square", v: 0.3, a: 0.03, d: 0.5, s: 0.3, r: 0.1 },
      { w: "square", v: 4, f: 1, a: 0.03, d: 0.1, g: 1 },
    ],
    [
      { w: "triangle", v: 0.3, a: 0.08, d: 1, s: 0.3, r: 0.1 },
      { w: "square", v: 2, f: 1, d: 0.3, s: 0.3, g: 1, t: 4, a: 0.08 },
    ],
    [
      { w: "sine", v: 0.3, a: 0.05, d: 1, s: 0.3, r: 0.1 },
      { w: "sine", v: 0.1, t: 2.001, f: 1, d: 1, s: 50, g: 1 },
    ],
    [
      { w: "triangle", v: 0.3, a: 0.03, d: 0.7, s: 0.3, r: 0.2 },
      { w: "sine", v: 12, t: 7, f: 1, d: 0.5, s: 1.7, g: 1 },
    ],
    [
      { w: "sine", v: 0.3, a: 0.05, d: 1, s: 0.3, r: 0.1 },
      { w: "sawtooth", v: 22, t: 6, d: 0.06, s: 0.3, g: 1 },
    ],
    [
      { w: "triangle", v: 0.3, a: 0.05, d: 11, r: 0.3 },
      { w: "triangle", v: 1, d: 1, s: 8, g: 1 },
    ],
    /* 97-104 : Synth Effects */
    [
      { w: "sawtooth", v: 0.3, d: 4, s: 0.8, r: 0.1 },
      { w: "square", v: 1, t: 2, f: 8, a: 1, d: 1, s: 1, r: 0.1, g: 1 },
    ],
    [
      {
        w: "triangle",
        v: 0.3,
        d: 1,
        s: 0.5,
        t: 0.8,
        a: 0.2,
        p: 1.25,
        q: 0.2,
      },
      {
        w: "sawtooth",
        v: 0.2,
        a: 0.2,
        d: 0.3,
        s: 1,
        t: 1.2,
        p: 1.25,
        q: 0.2,
      },
    ],
    [
      { w: "sine", v: 0.3, d: 1, s: 0.3 },
      { w: "square", v: 22, t: 11, d: 0.5, s: 0.1, g: 1 },
    ],
    [
      { w: "sawtooth", v: 0.3, a: 0.04, d: 1, s: 0.8, r: 0.1 },
      { w: "square", v: 1, t: 0.5, d: 1, s: 2, g: 1 },
    ],
    [
      { w: "triangle", v: 0.3, d: 1, s: 0.3 },
      { w: "sine", v: 22, t: 6, d: 0.6, s: 0.05, g: 1 },
    ],
    [
      { w: "sine", v: 0.6, a: 0.1, d: 0.05, s: 0.4 },
      { w: "sine", v: 5, t: 5, f: 1, d: 0.05, s: 0.3, g: 1 },
    ],
    [
      { w: "sine", a: 0.1, d: 0.05, s: 0.4, v: 0.8 },
      { w: "sine", v: 5, t: 5, f: 1, d: 0.05, s: 0.3, g: 1 },
    ],
    [
      { w: "square", v: 0.3, a: 0.1, d: 0.1, s: 0.4 },
      { w: "square", v: 1, f: 1, d: 0.3, s: 0.1, g: 1 },
    ],
    /* 105-112 : Ethnic */
    [
      { w: "sawtooth", v: 0.3, d: 0.5, r: 0.5 },
      { w: "sawtooth", v: 11, t: 5, d: 0.05, g: 1 },
    ],
    [
      { w: "square", v: 0.3, d: 0.2, r: 0.2 },
      { w: "square", v: 7, t: 3, d: 0.05, g: 1 },
    ],
    [
      { w: "triangle", d: 0.2, r: 0.2 },
      { w: "square", v: 9, t: 3, d: 0.1, r: 0.1, g: 1 },
    ],
    [
      { w: "triangle", d: 0.3, r: 0.3 },
      { w: "square", v: 6, t: 3, d: 1, r: 1, g: 1 },
    ],
    [
      { w: "triangle", v: 0.4, d: 0.2, r: 0.2 },
      { w: "square", v: 22, t: 12, d: 0.1, r: 0.1, g: 1 },
    ],
    [
      { w: "sine", v: 0.25, a: 0.02, d: 0.05, s: 0.8 },
      { w: "square", v: 1, t: 2, d: 0.03, s: 11, g: 1 },
    ],
    [
      { w: "sine", v: 0.3, a: 0.05, d: 11 },
      { w: "square", v: 7, t: 3, f: 1, s: 0.7, g: 1 },
    ],
    [
      { w: "square", v: 0.3, a: 0.05, d: 0.1, s: 0.8 },
      { w: "square", v: 4, d: 0.1, s: 1.1, g: 1 },
    ],
    /* 113-120 : Percussive */
    [
      { w: "sine", v: 0.4, d: 0.3, r: 0.3 },
      { w: "sine", v: 7, t: 9, d: 0.1, r: 0.1, g: 1 },
    ],
    [
      { w: "sine", v: 0.7, d: 0.1, r: 0.1 },
      { w: "sine", v: 22, t: 7, d: 0.05, g: 1 },
    ],
    [
      { w: "sine", v: 0.6, d: 0.15, r: 0.15 },
      { w: "square", v: 11, t: 3.2, d: 0.1, r: 0.1, g: 1 },
    ],
    [
      { w: "sine", v: 0.8, d: 0.07, r: 0.07 },
      { w: "square", v: 11, t: 7, r: 0.01, g: 1 },
    ],
    [
      { w: "triangle", v: 0.7, t: 0.5, d: 0.2, r: 0.2, p: 0.95 },
      { w: "n0", v: 9, g: 1, d: 0.2, r: 0.2 },
    ],
    [
      { w: "sine", v: 0.7, d: 0.1, r: 0.1, p: 0.9 },
      { w: "square", v: 14, t: 2, d: 0.005, r: 0.005, g: 1 },
    ],
    [
      { w: "square", d: 0.15, r: 0.15, p: 0.5 },
      { w: "square", v: 4, t: 5, d: 0.001, r: 0.001, g: 1 },
    ],
    [{ w: "n1", v: 0.3, a: 1, s: 1, d: 0.15, r: 0, t: 0.5 }],
    /* 121-128 : Sound Effects */
    [
      { w: "sine", t: 12.5, d: 0, r: 0, p: 0.5, v: 0.3, h: 0.2, q: 0.5 },
      { g: 1, w: "sine", v: 1, t: 2, d: 0, r: 0, s: 1 },
      {
        g: 1,
        w: "n0",
        v: 0.2,
        t: 2,
        a: 0.6,
        h: 0,
        d: 0.1,
        r: 0.1,
        b: 0,
        c: 0,
      },
    ],
    [{ w: "n0", v: 0.2, a: 0.05, h: 0.02, d: 0.02, r: 0.02 }],
    [{ w: "n0", v: 0.4, a: 1, d: 1, t: 0.25 }],
    [
      { w: "sine", v: 0.3, a: 0.1, d: 1, s: 0.5 },
      { w: "sine", v: 4, t: 0, f: 1.5, d: 1, s: 1, r: 0.1, g: 1 },
      {
        g: 1,
        w: "sine",
        v: 4,
        t: 0,
        f: 2,
        a: 0.6,
        h: 0,
        d: 0.1,
        s: 1,
        r: 0.1,
        b: 0,
        c: 0,
      },
    ],
    [
      { w: "square", v: 0.3, t: 0.25, d: 11, s: 1 },
      { w: "square", v: 12, t: 0, f: 8, d: 1, s: 1, r: 11, g: 1 },
    ],
    [
      { w: "n0", v: 0.4, t: 0.5, a: 1, d: 11, s: 1, r: 0.5 },
      { w: "square", v: 1, t: 0, f: 14, d: 1, s: 1, r: 11, g: 1 },
    ],
    [
      { w: "sine", t: 0, f: 1221, a: 0.2, d: 1, r: 0.25, s: 1 },
      { g: 1, w: "n0", v: 3, t: 0.5, d: 1, s: 1, r: 1 },
    ],
    [
      { w: "sine", d: 0.4, r: 0.4, p: 0.1, t: 2.5, v: 1 },
      { w: "n0", v: 12, t: 2, d: 1, r: 1, g: 1 },
    ],
  ],

  percussion: [
    /* 0-34 : None */
    [],
    [],
    [],
    [],
    [],
    [],
    [],
    [],
    [],
    [],
    [],
    [],
    [],
    [],
    [],
    [],
    [],
    [],
    [],
    [],
    [],
    [],
    [],
    [],
    [],
    [],
    [],
    [],
    [],
    [],
    [],
    [],
    [],
    [],
    [],
    [
      { w: "triangle", t: 0, f: 70, v: 1, d: 0.05, h: 0.03, p: 0.9, q: 0.1 },
      { w: "n0", g: 1, t: 6, v: 17, r: 0.01, h: 0, p: 0 },
    ],
    [
      { w: "triangle", t: 0, f: 88, v: 1, d: 0.05, h: 0.03, p: 0.5, q: 0.1 },
      { w: "n0", g: 1, t: 5, v: 42, r: 0.01, h: 0, p: 0 },
    ],
    [{ w: "n0", f: 222, p: 0, t: 0, r: 0.01, h: 0 }],
    [
      {
        w: "triangle",
        v: 0.3,
        f: 180,
        d: 0.05,
        t: 0,
        h: 0.03,
        p: 0.9,
        q: 0.1,
      },
      { w: "n0", v: 0.6, t: 0, f: 70, h: 0.02, r: 0.01, p: 0 },
      { g: 1, w: "square", v: 2, t: 0, f: 360, r: 0.01, b: 0, c: 0 },
    ],
    [
      { w: "square", f: 1150, v: 0.34, t: 0, r: 0.03, h: 0.025, d: 0.03 },
      { g: 1, w: "n0", t: 0, f: 13, h: 0.025, d: 0.1, s: 1, r: 0.1, v: 1 },
    ],
    [
      { w: "triangle", f: 200, v: 1, d: 0.06, t: 0, r: 0.06 },
      { w: "n0", g: 1, t: 0, f: 400, v: 12, r: 0.02, d: 0.02 },
    ],
    [
      {
        w: "triangle",
        f: 100,
        v: 0.9,
        d: 0.12,
        h: 0.02,
        p: 0.5,
        t: 0,
        r: 0.12,
      },
      { g: 1, w: "n0", v: 5, t: 0.4, h: 0.015, d: 0.005, r: 0.005 },
    ],
    [{ w: "n1", f: 390, v: 0.25, r: 0.01, t: 0 }],
    [
      {
        w: "triangle",
        f: 120,
        v: 0.9,
        d: 0.12,
        h: 0.02,
        p: 0.5,
        t: 0,
        r: 0.12,
      },
      { g: 1, w: "n0", v: 5, t: 0.5, h: 0.015, d: 0.005, r: 0.005 },
    ],
    [{ w: "n1", v: 0.25, f: 390, r: 0.03, t: 0, h: 0.005, d: 0.03 }],
    [
      {
        w: "triangle",
        f: 140,
        v: 0.9,
        d: 0.12,
        h: 0.02,
        p: 0.5,
        t: 0,
        r: 0.12,
      },
      { g: 1, w: "n0", v: 5, t: 0.3, h: 0.015, d: 0.005, r: 0.005 },
    ],
    [
      { w: "n1", v: 0.25, f: 390, t: 0, d: 0.2, r: 0.2 },
      { w: "n0", v: 0.3, t: 0, c: 0, f: 440, h: 0.005, d: 0.05 },
    ],
    [
      {
        w: "triangle",
        f: 155,
        v: 0.9,
        d: 0.12,
        h: 0.02,
        p: 0.5,
        t: 0,
        r: 0.12,
      },
      { g: 1, w: "n0", v: 5, t: 0.3, h: 0.015, d: 0.005, r: 0.005 },
    ],
    [
      {
        w: "triangle",
        f: 180,
        v: 0.9,
        d: 0.12,
        h: 0.02,
        p: 0.5,
        t: 0,
        r: 0.12,
      },
      { g: 1, w: "n0", v: 5, t: 0.3, h: 0.015, d: 0.005, r: 0.005 },
    ],
    [
      { w: "n1", v: 0.3, f: 1200, d: 0.2, r: 0.2, h: 0.05, t: 0 },
      { w: "n1", t: 0, v: 1, d: 0.1, r: 0.1, p: 1.2, f: 440 },
    ],
    [
      {
        w: "triangle",
        f: 220,
        v: 0.9,
        d: 0.12,
        h: 0.02,
        p: 0.5,
        t: 0,
        r: 0.12,
      },
      { g: 1, w: "n0", v: 5, t: 0.3, h: 0.015, d: 0.005, r: 0.005 },
    ],
    [
      { w: "n1", f: 500, v: 0.15, d: 0.4, r: 0.4, h: 0, t: 0 },
      { w: "n0", v: 0.1, t: 0, r: 0.01, f: 440 },
    ],
    [
      { w: "n1", v: 0.3, f: 800, d: 0.2, r: 0.2, h: 0.05, t: 0 },
      { w: "square", t: 0, v: 1, d: 0.1, r: 0.1, p: 0.1, f: 220, g: 1 },
    ],
    [
      { w: "sine", f: 1651, v: 0.15, d: 0.2, r: 0.2, h: 0, t: 0 },
      { w: "sawtooth", g: 1, t: 1.21, v: 7.2, d: 0.1, r: 11, h: 1 },
      { g: 1, w: "n0", v: 3.1, t: 0.152, d: 0.002, r: 0.002 },
    ],
    /* 54 : Tambourine */
    GM_WAVES.percussion[54],
    [
      { w: "n1", v: 0.3, f: 1200, d: 0.2, r: 0.2, h: 0.05, t: 0 },
      { w: "n1", t: 0, v: 1, d: 0.1, r: 0.1, p: 1.2, f: 440 },
    ],
    /* 56 : Cowbell */
    GM_WAVES.percussion[56],
    [
      { w: "n1", v: 0.3, f: 555, d: 0.25, r: 0.25, h: 0.05, t: 0 },
      { w: "n1", t: 0, v: 1, d: 0.1, r: 0.1, f: 440, a: 0.005, h: 0.02 },
    ],
    [
      { w: "sawtooth", f: 776, v: 0.2, d: 0.3, t: 0, r: 0.3 },
      {
        g: 1,
        w: "n0",
        v: 2,
        t: 0,
        f: 776,
        a: 0.005,
        h: 0.02,
        d: 0.1,
        s: 1,
        r: 0.1,
        c: 0,
      },
      { g: 11, w: "sine", v: 0.1, t: 0, f: 22, d: 0.3, r: 0.3, b: 0, c: 0 },
    ],
    [
      { w: "n1", f: 440, v: 0.15, d: 0.4, r: 0.4, h: 0, t: 0 },
      { w: "n0", v: 0.4, t: 0, r: 0.01, f: 440 },
    ],
    /* 60 : High Bongo */
    GM_WAVES.percussion[60],
    /* 61 : Low Bongo */
    GM_WAVES.percussion[61],
    /* 62 : Mute High Conga */
    GM_WAVES.percussion[62],
    /* 63 : Open High Conga */
    GM_WAVES.percussion[63],
    /* 64 : Low Conga */
    GM_WAVES.percussion[64],
    /* 65 : High Timbale */
    GM_WAVES.percussion[65],
    /* 66 : Low Timbale */
    GM_WAVES.percussion[66],
    /* 67 : High Agogô */
    GM_WAVES.percussion[67],
    /* 68 : Low Agogô */
    GM_WAVES.percussion[68],
    /* 69 : Cabasa */
    GM_WAVES.percussion[69],
    /* 70 : Maracas */
    GM_WAVES.percussion[70],
    /* 71 : Short Whistle */
    GM_WAVES.percussion[71],
    /* 72 : Long Whistle */
    GM_WAVES.percussion[72],
    /* 73 : Short Guiro */
    GM_WAVES.percussion[73],
    /* 74 : Long Guiro */
    GM_WAVES.percussion[74],
    /* 75 : Claves */
    GM_WAVES.percussion[75],
    /* 76 : High Woodblock */
    GM_WAVES.percussion[76],
    /* 77 : Low Woodblock */
    GM_WAVES.percussion[77],
    /* 78 : Mute Cuica */
    GM_WAVES.percussion[78],
    /* 79 : Open Cuica */
    GM_WAVES.percussion[79],
    [
      { w: "sine", f: 1720, v: 0.3, d: 0.02, t: 0, r: 0.02 },
      { w: "square", g: 1, t: 0, f: 2876, v: 6, d: 0.2, s: 1, r: 0.2 },
    ],
    [
      { w: "sine", f: 1720, v: 0.3, d: 0.25, t: 0, r: 0.25 },
      { w: "square", g: 1, t: 0, f: 2876, v: 6, d: 0.2, s: 1, r: 0.2 },
    ],
  ],
};
