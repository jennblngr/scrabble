import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const DICTIONARY_PATH = path.join(here, "..", "..", "data", "dictionary", "fr.txt");

function normalize(word: string): string {
  // French Scrabble tiles carry no accents, so lookups are done on the
  // unaccented, uppercased form (ÉCOLE -> ECOLE).
  return word
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase();
}

let words: Set<string> | null = null;

export function loadDictionary(): Set<string> {
  if (words) return words;
  const raw = readFileSync(DICTIONARY_PATH, "utf8");
  words = new Set(
    raw
      .split("\n")
      .map((w) => w.trim())
      .filter((w) => w.length > 0 && !w.startsWith("#"))
      .map(normalize)
  );
  return words;
}

export function isValidWord(word: string): boolean {
  const dict = loadDictionary();
  return dict.has(normalize(word));
}
