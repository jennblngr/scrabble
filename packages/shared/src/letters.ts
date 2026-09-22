export const BLANK: "" = "";

/** Standard French Scrabble distribution & letter values — 102 tiles total. */
export const LETTER_DATA: { letter: string; count: number; value: number }[] = [
  { letter: "A", count: 9, value: 1 },
  { letter: "B", count: 2, value: 3 },
  { letter: "C", count: 2, value: 3 },
  { letter: "D", count: 3, value: 2 },
  { letter: "E", count: 15, value: 1 },
  { letter: "F", count: 2, value: 4 },
  { letter: "G", count: 2, value: 2 },
  { letter: "H", count: 2, value: 4 },
  { letter: "I", count: 8, value: 1 },
  { letter: "J", count: 1, value: 8 },
  { letter: "K", count: 1, value: 10 },
  { letter: "L", count: 5, value: 1 },
  { letter: "M", count: 3, value: 2 },
  { letter: "N", count: 6, value: 1 },
  { letter: "O", count: 6, value: 1 },
  { letter: "P", count: 2, value: 3 },
  { letter: "Q", count: 1, value: 8 },
  { letter: "R", count: 6, value: 1 },
  { letter: "S", count: 6, value: 1 },
  { letter: "T", count: 6, value: 1 },
  { letter: "U", count: 6, value: 1 },
  { letter: "V", count: 2, value: 4 },
  { letter: "W", count: 1, value: 10 },
  { letter: "X", count: 1, value: 10 },
  { letter: "Y", count: 1, value: 10 },
  { letter: "Z", count: 1, value: 10 },
  { letter: BLANK, count: 2, value: 0 },
];

export const LETTER_VALUES: Record<string, number> = Object.fromEntries(
  LETTER_DATA.map((l) => [l.letter, l.value])
);

export const RACK_SIZE = 7;
