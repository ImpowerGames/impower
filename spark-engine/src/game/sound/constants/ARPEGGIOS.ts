export const MAJOR_ARPEGGIOS_UP = [
  [0, 3, 9],
  [0, 4, 8],
  [0, 6, 10],
  [1, 4, 10],
  [1, 6, 9],
  [1, 7, 11],
  [2, 6, 11],
  [2, 7, 10],
  [2, 8, 12],
  [3, 7, 12],
  [3, 8, 11],
  [4, 9, 12],
];

export const MAJOR_ARPEGGIOS_DOWN = MAJOR_ARPEGGIOS_UP.map((arr) =>
  [...arr].reverse()
);
