import { LocateFixed } from 'lucide-react';
import type { Question } from '../services/api';
import { normalizeDisplayText } from '../utils/text';

type SpineRegion = 'C' | 'T' | 'L' | 'S';

interface SpineLevel {
  region: SpineRegion;
  number: number;
}

interface SpineReference {
  labels: string[];
  highlighted: Set<string>;
  note: string;
  sourceLabel: string;
}

interface SpineLevelReferenceCardProps {
  question?: Question;
}

const regionOrder: SpineRegion[] = ['C', 'T', 'L', 'S'];

const regionInfo: Record<SpineRegion, {
  name: string;
  display: string;
  range: string;
  count: number;
  color: string;
  highlight: string;
  figureColor: string;
}> = {
  C: {
    name: 'Шийний',
    display: 'C',
    range: 'C1-C8',
    count: 8,
    color: 'bg-sky-100 border-sky-200',
    highlight: 'bg-sky-500',
    figureColor: '#38bdf8',
  },
  T: {
    name: 'Грудний',
    display: 'Т',
    range: 'Т1-Т12',
    count: 12,
    color: 'bg-indigo-100 border-indigo-200',
    highlight: 'bg-indigo-600',
    figureColor: '#4f46e5',
  },
  L: {
    name: 'Поперековий',
    display: 'L',
    range: 'L1-L5',
    count: 5,
    color: 'bg-violet-100 border-violet-200',
    highlight: 'bg-violet-600',
    figureColor: '#7c3aed',
  },
  S: {
    name: 'Крижовий',
    display: 'S',
    range: 'S1-S5',
    count: 5,
    color: 'bg-rose-100 border-rose-200',
    highlight: 'bg-rose-500',
    figureColor: '#f43f5e',
  },
};

const figureYRange: Record<SpineRegion, { start: number; end: number }> = {
  C: { start: 60, end: 108 },
  T: { start: 112, end: 200 },
  L: { start: 204, end: 248 },
  S: { start: 252, end: 282 },
};

const regionOffsets: Record<SpineRegion, number> = {
  C: 0,
  T: 8,
  L: 20,
  S: 25,
};

function normalizeRegion(region: string): SpineRegion | null {
  const upper = region.toUpperCase();
  if (upper === 'C' || upper === 'С') return 'C';
  if (upper === 'T' || upper === 'Т') return 'T';
  if (upper === 'L') return 'L';
  if (upper === 'S') return 'S';
  return null;
}

function isValidLevel(level: SpineLevel): boolean {
  return level.number >= 1 && level.number <= regionInfo[level.region].count;
}

function levelKey(level: SpineLevel): string {
  return `${level.region}${level.number}`;
}

function levelOrdinal(level: SpineLevel): number {
  return regionOffsets[level.region] + level.number;
}

function displayLevel(level: SpineLevel): string {
  return `${regionInfo[level.region].display}${level.number}`;
}

function displayRange(start: SpineLevel, end: SpineLevel): string {
  if (levelKey(start) === levelKey(end)) return displayLevel(start);
  return `${displayLevel(start)}-${displayLevel(end)}`;
}

function figureY(level: SpineLevel): number {
  const range = figureYRange[level.region];
  const count = regionInfo[level.region].count;
  if (count <= 1) return (range.start + range.end) / 2;

  const padding = (range.end - range.start) / count / 2;
  const usable = (range.end - range.start) - padding * 2;
  return range.start + padding + ((level.number - 1) / (count - 1)) * usable;
}

const SPINE_X_CENTER = 110;
const SPINE_CURVE_TOP = 60;
const SPINE_CURVE_BOTTOM = 282;

function figureX(y: number): number {
  const t = (y - SPINE_CURVE_TOP) / (SPINE_CURVE_BOTTOM - SPINE_CURVE_TOP);
  // Lordotic-kyphotic S-curve: cervical lordosis, thoracic kyphosis, lumbar lordosis, sacral kyphosis.
  const curve = Math.sin(t * Math.PI * 2) * 6;
  return SPINE_X_CENTER + curve;
}

function expandRange(start: SpineLevel, end: SpineLevel): SpineLevel[] {
  const [from, to] = levelOrdinal(start) <= levelOrdinal(end) ? [start, end] : [end, start];
  const fromOrdinal = levelOrdinal(from);
  const toOrdinal = levelOrdinal(to);
  const levels: SpineLevel[] = [];

  regionOrder.forEach((region) => {
    for (let number = 1; number <= regionInfo[region].count; number += 1) {
      const level = { region, number };
      const ordinal = levelOrdinal(level);
      if (ordinal >= fromOrdinal && ordinal <= toOrdinal) {
        levels.push(level);
      }
    }
  });

  return levels;
}

function getSpineNote(levels: SpineLevel[]): string {
  const regions = new Set(levels.map((level) => level.region));

  if (regions.has('T') && regions.has('L')) {
    return 'Це грудо-поперековий перехід: нижня частина грудного відділу переходить у поперековий.';
  }

  if (regions.has('L') && regions.has('S')) {
    return 'Це попереково-крижова зона, яку часто пов’язують із симптомами в нижній кінцівці.';
  }

  if (regions.has('C')) {
    return 'Шийні рівні розташовані у верхній частині хребта і особливо важливі для функції рук та дихання.';
  }

  if (regions.has('T')) {
    return 'Грудні рівні розташовані в ділянці грудної клітки і впливають на контроль тулуба.';
  }

  if (regions.has('L')) {
    return 'Поперекові рівні розташовані нижче грудного відділу і пов’язані з функцією нижніх кінцівок.';
  }

  return 'Крижові рівні розташовані в нижній частині хребта і часто важливі для рефлексів та чутливості стопи.';
}

function extractLevels(text: string): Omit<SpineReference, 'note' | 'sourceLabel'> | null {
  const regex = /([CСTТLS])\s*(\d{1,2})(?:\s*[-–]\s*([CСTТLS])\s*(\d{1,2}))?/gi;
  const labels = new Set<string>();
  const highlighted = new Set<string>();
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text))) {
    const startRegion = normalizeRegion(match[1]);
    const startNumber = Number(match[2]);
    const endRegion = match[3] ? normalizeRegion(match[3]) : startRegion;
    const endNumber = match[4] ? Number(match[4]) : startNumber;

    if (!startRegion || !endRegion) continue;

    const start = { region: startRegion, number: startNumber };
    const end = { region: endRegion, number: endNumber };
    if (!isValidLevel(start) || !isValidLevel(end)) continue;

    const expanded = expandRange(start, end);
    expanded.forEach((level) => highlighted.add(levelKey(level)));
    labels.add(displayRange(start, end));
  }

  if (highlighted.size === 0) return null;

  return {
    labels: Array.from(labels).slice(0, 5),
    highlighted,
  };
}

function getHighlightedLevels(highlighted: Set<string>): SpineLevel[] {
  const levels: SpineLevel[] = [];

  regionOrder.forEach((region) => {
    for (let number = 1; number <= regionInfo[region].count; number += 1) {
      const level = { region, number };
      if (highlighted.has(levelKey(level))) {
        levels.push(level);
      }
    }
  });

  return levels;
}

function buildReference(reference: Omit<SpineReference, 'note' | 'sourceLabel'>, sourceLabel: string): SpineReference {
  return {
    ...reference,
    sourceLabel,
    note: getSpineNote(getHighlightedLevels(reference.highlighted)),
  };
}

function SpineSideFigure({ reference }: { reference: SpineReference }) {
  const highlightedLevels = getHighlightedLevels(reference.highlighted);
  const highlightedSet = reference.highlighted;
  const highlightedByRegion = new Set(highlightedLevels.map((level) => level.region));
  const label = reference.labels.join(', ');

  const allLevels: { level: SpineLevel; y: number; x: number }[] = [];
  regionOrder.forEach((region) => {
    for (let number = 1; number <= regionInfo[region].count; number += 1) {
      const level = { region, number };
      const y = figureY(level);
      allLevels.push({ level, y, x: figureX(y) });
    }
  });

  const labeledLevels = highlightedLevels
    .map((level) => {
      const y = figureY(level);
      return { level, y, x: figureX(y), label: displayLevel(level) };
    })
    .slice(0, 3);

  const vertebraWidth = 22;
  const vertebraHeight = 6;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-2">
      <svg viewBox="0 0 220 330" role="img" aria-label={`Бокова схема хребта: ${label}`} className="h-72 w-full sm:h-80">
        <defs>
          <linearGradient id="bodySideFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#f8fafc" />
            <stop offset="100%" stopColor="#e0f2fe" />
          </linearGradient>
          <linearGradient id="torsoFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#f0f9ff" />
            <stop offset="100%" stopColor="#f8fafc" />
          </linearGradient>
          <linearGradient id="discFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="100%" stopColor="#f1f5f9" />
          </linearGradient>
          <filter id="spineGlow" x="-40%" y="-40%" width="180%" height="180%">
            <feDropShadow dx="0" dy="1.5" stdDeviation="2.4" floodColor="#4f46e5" floodOpacity="0.28" />
          </filter>
          <filter id="vertebraShadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="0.6" stdDeviation="0.6" floodColor="#0f172a" floodOpacity="0.18" />
          </filter>
        </defs>

        {/* Body landmarks around the side-view spine */}
        <g>
          <ellipse cx="110" cy="40" rx="21" ry="23" fill="#f8fafc" stroke="#cbd5e1" strokeWidth="1.6" />
          <path
            d="M97 63 Q110 70 123 63 L120 80 Q110 86 100 80 Z"
            fill="#e0f2fe"
            stroke="#7dd3fc"
            strokeWidth="1.6"
          />
          <ellipse
            cx="106"
            cy="126"
            rx="34"
            ry="56"
            fill="#eef2ff"
            opacity="0.62"
            stroke="#818cf8"
            strokeWidth="1.4"
            strokeDasharray="4 5"
          />
          <path
            d="M85 80 Q78 120 83 168 Q86 206 94 235 Q100 254 104 292"
            fill="none"
            stroke="#94a3b8"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          <path
            d="M129 80 Q142 124 136 169 Q130 211 132 234 Q142 249 142 266 Q141 287 126 297"
            fill="none"
            stroke="#94a3b8"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          <path
            d="M90 219 Q111 210 132 221 Q145 229 145 244 Q143 257 128 264 Q111 271 96 262 Q86 253 86 239 Q86 228 90 219 Z"
            fill="#f8fafc"
            opacity="0.86"
            stroke="#cbd5e1"
            strokeWidth="1.4"
          />
          <path
            d="M108 224 Q119 238 113 263"
            fill="none"
            stroke="#fb7185"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          <path
            d="M88 80 Q108 72 130 80 Q139 128 132 174 Q125 204 128 232 Q111 240 94 232 Q84 195 82 158 Q78 116 88 80 Z"
            fill="url(#torsoFill)"
            opacity="0.36"
            stroke="#cbd5e1"
            strokeWidth="1.2"
          />
          <path
            d="M83 176 Q109 188 135 176"
            fill="none"
            stroke="#cbd5e1"
            strokeWidth="1"
            strokeDasharray="4 5"
          />
        </g>

        {/* Landmark callouts */}
        <g fontSize="8.5" fontWeight="900" letterSpacing="0.7">
          <line x1="124" y1="72" x2="176" y2="62" stroke="#0ea5e9" strokeWidth="1.2" />
          <text x="180" y="65" fill="#0284c7">ШИЯ</text>
          <line x1="132" y1="122" x2="176" y2="104" stroke="#4f46e5" strokeWidth="1.2" />
          <text x="180" y="107" fill="#4f46e5">ГРУДНА</text>
          <line x1="132" y1="187" x2="176" y2="182" stroke="#64748b" strokeWidth="1.2" />
          <text x="180" y="185" fill="#475569">ТУЛУБ</text>
          <line x1="120" y1="245" x2="176" y2="252" stroke="#f43f5e" strokeWidth="1.2" />
          <text x="180" y="255" fill="#e11d48">КРИЖІ/ТАЗ</text>
        </g>

        {/* Region color guides on the left rail */}
        {regionOrder.map((region) => {
          const yRange = figureYRange[region];
          const color = regionInfo[region].figureColor;
          const isDimmed = highlightedByRegion.size > 0 && !highlightedByRegion.has(region);
          return (
            <g key={`band-${region}`} opacity={isDimmed ? 0.25 : 1}>
              <rect
                x={50}
                y={yRange.start - 2}
                width={5}
                height={yRange.end - yRange.start + 4}
                rx={2.5}
                fill={color}
                opacity={highlightedByRegion.has(region) ? 0.95 : 0.55}
              />
              <text
                x={42}
                y={(yRange.start + yRange.end) / 2 + 4}
                fill={color}
                fontSize="11"
                fontWeight="900"
                textAnchor="end"
              >
                {regionInfo[region].display}
              </text>
            </g>
          );
        })}

        {/* Vertebrae stack with discs between */}
        {allLevels.map((entry, index) => {
          const { level, x, y } = entry;
          const isHighlighted = highlightedSet.has(levelKey(level));
          const isDimmed = highlightedByRegion.size > 0 && !highlightedByRegion.has(level.region);
          const color = regionInfo[level.region].figureColor;
          const next = allLevels[index + 1];

          return (
            <g key={levelKey(level)} opacity={isDimmed ? 0.32 : 1}>
              {next && next.level.region === level.region && (
                <line
                  x1={x}
                  y1={y + vertebraHeight / 2}
                  x2={next.x}
                  y2={next.y - vertebraHeight / 2}
                  stroke="#cbd5e1"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
              )}
              <rect
                x={x - vertebraWidth / 2}
                y={y - vertebraHeight / 2}
                width={vertebraWidth}
                height={vertebraHeight}
                rx={vertebraHeight / 2}
                fill={isHighlighted ? color : 'url(#discFill)'}
                stroke={isHighlighted ? color : '#cbd5e1'}
                strokeWidth={isHighlighted ? 1.8 : 1.2}
                filter={isHighlighted ? 'url(#spineGlow)' : 'url(#vertebraShadow)'}
              />
              {isHighlighted && (
                <circle
                  cx={x + vertebraWidth / 2 + 4}
                  cy={y}
                  r="2.4"
                  fill={color}
                  opacity="0.85"
                />
              )}
            </g>
          );
        })}

        {/* Callout labels for highlighted levels */}
        {labeledLevels.map((point, index) => {
          const color = regionInfo[point.level.region].figureColor;
          const labelX = 158;
          const labelY = point.y;
          return (
            <g key={`label-${levelKey(point.level)}-${index}`}>
              <line
                x1={point.x + vertebraWidth / 2 + 2}
                x2={labelX - 14}
                y1={point.y}
                y2={labelY}
                stroke={color}
                strokeWidth="1.4"
                strokeDasharray="2 3"
                opacity="0.9"
              />
              <rect
                x={labelX - 12}
                y={labelY - 9}
                width={32}
                height={18}
                rx={9}
                fill={color}
                opacity="0.96"
              />
              <text
                x={labelX + 4}
                y={labelY + 4}
                fill="#ffffff"
                fontSize="10.5"
                fontWeight="900"
                textAnchor="middle"
              >
                {point.label}
              </text>
            </g>
          );
        })}

        <text x="14" y="302" fill="#94a3b8" fontSize="9" fontWeight="800" letterSpacing="1.2">
          ВИГЛЯД ЗБОКУ
        </text>
      </svg>
      <div className="mt-1 flex flex-wrap justify-center gap-1.5 text-[9px] font-black uppercase tracking-[0.08em]">
        {regionOrder.map((region) => (
          <span key={region} className="spine-region-pill rounded-full bg-slate-100 px-2 py-1" style={{ color: regionInfo[region].figureColor }}>
            {regionInfo[region].display} {regionInfo[region].name}
          </span>
        ))}
      </div>
    </div>
  );
}

function extractSpineReference(question?: Question): SpineReference | null {
  if (!question) return null;

  const correctAnswerText = normalizeDisplayText(question.options[question.correctAnswer] ?? '');
  const correctAnswerReference = extractLevels(correctAnswerText);
  if (correctAnswerReference) {
    return buildReference(correctAnswerReference, 'Підсвічено правильну відповідь');
  }

  const contextText = normalizeDisplayText([
    question.question,
    question.explanation,
  ].join(' '));
  const contextReference = extractLevels(contextText);
  if (contextReference) {
    return buildReference(contextReference, 'Підсвічено рівень з умови');
  }

  return null;
}

export function SpineLevelReferenceCard({ question }: SpineLevelReferenceCardProps) {
  const reference = extractSpineReference(question);

  if (!reference) return null;

  return (
    <section className="spine-reference-card rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm sm:p-4">
      <div className="flex items-start gap-2.5">
        <div className="rounded-xl bg-violet-100 p-1.5 text-violet-600">
          <LocateFixed className="h-4 w-4" />
        </div>
        <div>
          <p className="text-[9px] font-black uppercase tracking-[0.18em] text-violet-600">Рівень хребта</p>
          <h4 className="mt-0.5 text-lg font-black leading-tight text-slate-900">
            Де знаходиться {reference.labels.join(', ')}
          </h4>
          <p className="mt-0.5 text-xs font-semibold leading-relaxed text-slate-500">{reference.note}</p>
          <p className="mt-1 text-[11px] font-black uppercase tracking-[0.12em] text-violet-600">
            {reference.sourceLabel}: {reference.labels.join(', ')}
          </p>
        </div>
      </div>

      <div className="spine-reference-map mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-2.5">
        <div className="grid gap-3 lg:grid-cols-[13rem_1fr] lg:items-start">
          <SpineSideFigure reference={reference} />

          <div className="space-y-2">
            {regionOrder.map((region) => {
              const info = regionInfo[region];
              return (
                <div key={region} className="grid grid-cols-[4.8rem_1fr] items-center gap-2">
                  <div>
                    <p className="text-xs font-black leading-tight text-slate-900">{info.name}</p>
                    <p className="text-[10px] font-bold text-slate-500">{info.range}</p>
                  </div>
                  <div
                    className={`grid gap-0.5 rounded-xl border p-1.5 ${info.color}`}
                    style={{ gridTemplateColumns: `repeat(${info.count}, minmax(0, 1fr))` }}
                    aria-label={`${info.name} відділ`}
                  >
                    {Array.from({ length: info.count }, (_, index) => {
                      const number = index + 1;
                      const isHighlighted = reference.highlighted.has(`${region}${number}`);
                      return (
                        <div
                          key={`${region}${number}`}
                          className={`h-3.5 rounded-md ${isHighlighted ? info.highlight : 'bg-white/80'}`}
                          title={`${info.display}${number}`}
                        />
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {reference.labels.map((label) => (
            <span key={label} className="rounded-full bg-violet-100 px-2.5 py-1 text-[11px] font-black text-violet-700">
              {label}
            </span>
          ))}
        </div>
        <p className="mt-2 text-[11px] font-semibold leading-relaxed text-slate-500">
          Ключ: C - шийний, Т - грудний, L - поперековий, S - крижовий відділ.
        </p>
      </div>
    </section>
  );
}
