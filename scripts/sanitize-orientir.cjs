#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const TARGETS = [
  'src/data/imports/krok-file-1.enriched.json',
  'src/data/imports/krok-file-2.enriched.json',
  'src/data/imports/krok-file-3.enriched.json',
  'src/data/imports/krok-file-8.json',
  'src/data/edkiData.json',
  'src/data/quizData.json',
  'src/data/selfControlData.json',
];

const PREFIX_RE = /Орієнтир:\s+/g;

function capitalizeFirstAlpha(s) {
  const m = s.match(/^(\s*)([\p{L}])/u);
  if (!m) return s;
  return s.slice(0, m[1].length) + m[2].toLocaleUpperCase('uk-UA') + s.slice(m[1].length + m[2].length);
}

function fixParagraph(para) {
  const matches = [...para.matchAll(PREFIX_RE)];
  if (matches.length < 2) return para;
  // Keep the first prefix, strip subsequent ones, capitalize what follows.
  let out = '';
  let cursor = 0;
  matches.forEach((m, i) => {
    out += para.slice(cursor, m.index);
    if (i === 0) {
      out += m[0]; // keep first prefix verbatim
    } else {
      // drop the prefix, capitalize the next character
      const tailStart = m.index + m[0].length;
      const tail = para.slice(tailStart);
      // Need to emit the capitalized tail but only up to next match (or end)
      const nextStart = (i + 1 < matches.length) ? matches[i + 1].index : para.length;
      const segment = para.slice(tailStart, nextStart);
      out += capitalizeFirstAlpha(segment);
      cursor = nextStart;
      return;
    }
    cursor = m.index + m[0].length;
  });
  // Append any remainder after the last handled match
  if (cursor < para.length) out += para.slice(cursor);
  return out;
}

function fixString(s) {
  // 1. Collapse literal adjacent duplicate prefix
  let result = s.replace(/Орієнтир:\s+Орієнтир:\s+/g, 'Орієнтир: ');
  // 2. Per-paragraph collapse for non-adjacent dual markers
  result = result
    .split(/(\n+)/) // keep separators
    .map((part) => (/^\n+$/.test(part) ? part : fixParagraph(part)))
    .join('');
  return result;
}

function walk(obj) {
  if (typeof obj === 'string') {
    const fixed = fixString(obj);
    return { value: fixed, changed: fixed !== obj };
  }
  if (Array.isArray(obj)) {
    let changed = false;
    const next = obj.map((v) => {
      const res = walk(v);
      if (res.changed) changed = true;
      return res.value;
    });
    return { value: next, changed };
  }
  if (obj && typeof obj === 'object') {
    let changed = false;
    const next = {};
    for (const k of Object.keys(obj)) {
      const res = walk(obj[k]);
      if (res.changed) changed = true;
      next[k] = res.value;
    }
    return { value: next, changed };
  }
  return { value: obj, changed: false };
}

let totalChanged = 0;
for (const rel of TARGETS) {
  const file = path.resolve(rel);
  if (!fs.existsSync(file)) {
    console.warn('skip (missing):', rel);
    continue;
  }
  const raw = fs.readFileSync(file, 'utf8');
  const data = JSON.parse(raw);
  const { value, changed } = walk(data);
  if (changed) {
    const indent = raw.includes('\n  ') ? 2 : 2;
    const trailingNl = raw.endsWith('\n') ? '\n' : '';
    fs.writeFileSync(file, JSON.stringify(value, null, indent) + trailingNl, 'utf8');
    console.log('updated:', rel);
    totalChanged += 1;
  } else {
    console.log('no change:', rel);
  }
}
console.log(`done. files updated: ${totalChanged}`);
