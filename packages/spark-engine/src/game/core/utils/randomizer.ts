/*
 * A port of an algorithm by Johannes Baagøe <baagoe@baagoe.com>, 2010
 * http://baagoe.com/en/RandomMusings/javascript
 * https://github.com/nquinlan/better-random-numbers-for-javascript-mirror
 *
 * Copyright (c) 2010 by Johannes Baagøe <baagoe@baagoe.org>
 * Released under the MIT License.
 */

import { uuid } from "./uuid";

const createMasher = (): ((data: string | number) => number) => {
  let n = 0xefc8249d;

  const func = (data: string | number) => {
    data = String(data);
    for (let i = 0; i < data.length; i++) {
      n += data.charCodeAt(i);
      let h = 0.02519603282416938 * n;
      n = h >>> 0;
      h -= n;
      h *= n;
      n = h >>> 0;
      h -= n;
      n += h * 0x100000000; // 2^32
    }
    return (n >>> 0) * 2.3283064365386963e-10; // 2^-32
  };

  return func;
};

export const randomizer = (seed?: string | number): (() => number) => {
  let s0 = 0;
  let s1 = 0;
  let s2 = 0;
  let c = 0;

  const masher = createMasher();

  // Apply the seeding algorithm from Baagoe.
  const validSeed = seed == null ? uuid() : seed;

  c = 1;
  s0 = masher(" ");
  s1 = masher(" ");
  s2 = masher(" ");
  s0 -= masher(validSeed);
  if (s0 < 0) {
    s0 += 1;
  }
  s1 -= masher(validSeed);
  if (s1 < 0) {
    s1 += 1;
  }
  s2 -= masher(validSeed);
  if (s2 < 0) {
    s2 += 1;
  }

  const next = () => {
    const t = 2091639 * s0 + c * 2.3283064365386963e-10; // 2^-32
    s0 = s1;
    s1 = s2;
    return (s2 = t - (c = t | 0));
  };

  return next;
};
