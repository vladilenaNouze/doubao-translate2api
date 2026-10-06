import { invalid } from "./errors.js";

export interface Segment { text: string; separator: string }
export function segmentText(text: string): Segment[] {
  if (!text.trim()) throw invalid("Translation input is empty.", "empty_translation_input");
  const segments: Segment[] = [];
  const parts = text.split(/((?:\r\n|\r|\n)+)/);
  for (let i = 0; i < parts.length; i += 2) {
    let rest = parts[i] ?? "";
    const separator = parts[i + 1] ?? "";
    if (!rest.trim()) {
      if (rest || separator) segments.push({ text: "", separator: rest + separator });
      continue;
    }
    while (rest.length > 9000) {
      const prefix = rest.slice(0, 9000);
      const boundaries = [...prefix.matchAll(/[.!?。！？](?:\s+|$)/g)];
      let end = boundaries.length ? boundaries.at(-1)!.index + boundaries.at(-1)![0].length : 9000;
      if (end < 4500) end = 9000;
      if (/[\uD800-\uDBFF]/.test(rest[end - 1] ?? "")) end--;
      const piece = rest.slice(0, end);
      const whitespace = piece.match(/[ \t]+$/)?.[0] ?? "";
      segments.push({ text: piece.slice(0, piece.length - whitespace.length), separator: whitespace });
      rest = rest.slice(end);
      if (segments.length > 10000) throw invalid("Too many translation segments.");
    }
    segments.push({ text: rest, separator });
    if (segments.length > 10000) throw invalid("Too many translation segments.");
  }
  if (segments.length > 10000) throw invalid("Too many translation segments.");
  return segments;
}

export function buildBatches(texts: string[]) {
  const batches: Array<{ indexes: number[]; texts: string[] }> = [];
  let batch = { indexes: [] as number[], texts: [] as string[] };
  let chars = 0;
  texts.forEach((text, index) => {
    if (!text) return;
    if (text.length > 10000) throw invalid("Segment exceeds batch limit.");
    if (batch.texts.length >= 50 || chars + text.length > 10000) {
      batches.push(batch); batch = { indexes: [], texts: [] }; chars = 0;
    }
    batch.texts.push(text); batch.indexes.push(index); chars += text.length;
  });
  if (batch.texts.length) batches.push(batch);
  return batches;
}
