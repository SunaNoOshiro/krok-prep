export type VisualAidType =
  | 'shoulder-muscle'
  | 'foot-nerve'
  | 'ashworth-scale'
  | 'gait-belt'
  | 'sit-upright'
  | 'elbow-angle'
  | 'hip-angle'
  | 'dorsal-column'
  | 'erb-palsy'
  | 'ulnar-hand'
  | 'median-hand'
  | 'stairs-guard'
  | 'three-point-gait'
  | 'hip-abduction'
  | 'postural-drainage'
  | 'fowler'
  | 'spirometry'
  | 'radial-nerve'
  | 'tug'
  | 'schober'
  | 'biceps-tendon'
  | 'lachman'
  | 'prone'
  | 'asia'
  | 'bronchospasm'
  | 's1-root'
  | 'pleuritis-side'
  | 'orthopnea'
  | 'position-change'
  | 'pneumothorax'
  | 'chest-form'
  | 'chest-vibration'
  | 'hydrothorax'
  | 'massage-sequence'
  | 'pediatrics-pdf';

export interface VisualAid {
  type: VisualAidType;
  title: string;
  labels: string[];
  note?: string;
  images?: Array<{
    url: string;
    alt: string;
  }>;
  video?: {
    title: string;
    embedUrl: string;
    sourceUrl: string;
    resourceUrl?: string;
    resourceLabel?: string;
  };
}

interface VisualAidCardProps {
  visual?: VisualAid;
}

type VisualCategory = 'anatomy' | 'position' | 'test' | 'respiratory';

const anatomyTypes = new Set<VisualAidType>([
  'shoulder-muscle',
  'foot-nerve',
  'dorsal-column',
  'erb-palsy',
  'ulnar-hand',
  'median-hand',
  'radial-nerve',
  's1-root',
  'biceps-tendon',
]);

const positionTypes = new Set<VisualAidType>([
  'pleuritis-side',
  'orthopnea',
  'fowler',
  'position-change',
  'sit-upright',
  'hip-angle',
  'hip-abduction',
  'prone',
  'postural-drainage',
  'stairs-guard',
  'gait-belt',
  'three-point-gait',
]);

const respiratoryTypes = new Set<VisualAidType>([
  'pneumothorax',
  'chest-form',
  'chest-vibration',
  'hydrothorax',
  'bronchospasm',
]);

function getCategory(type: VisualAidType): VisualCategory {
  if (anatomyTypes.has(type)) return 'anatomy';
  if (positionTypes.has(type)) return 'position';
  if (respiratoryTypes.has(type)) return 'respiratory';
  return 'test';
}

const categoryStyles: Record<VisualCategory, {
  label: string;
  badge: string;
  panel: string;
  node: string;
  number: string;
  connector: string;
}> = {
  anatomy: {
    label: 'Анатомічний ключ',
    badge: 'bg-indigo-100 text-indigo-700',
    panel: 'bg-indigo-50/70 border-indigo-100',
    node: 'bg-white border-indigo-200',
    number: 'bg-indigo-600 text-white',
    connector: 'bg-indigo-300',
  },
  position: {
    label: 'Положення / дія',
    badge: 'bg-emerald-100 text-emerald-700',
    panel: 'bg-emerald-50/70 border-emerald-100',
    node: 'bg-white border-emerald-200',
    number: 'bg-emerald-600 text-white',
    connector: 'bg-emerald-300',
  },
  test: {
    label: 'Тестова ознака',
    badge: 'bg-violet-100 text-violet-700',
    panel: 'bg-violet-50/70 border-violet-100',
    node: 'bg-white border-violet-200',
    number: 'bg-violet-600 text-white',
    connector: 'bg-violet-300',
  },
  respiratory: {
    label: 'Дихальна логіка',
    badge: 'bg-cyan-100 text-cyan-700',
    panel: 'bg-cyan-50/70 border-cyan-100',
    node: 'bg-white border-cyan-200',
    number: 'bg-cyan-600 text-white',
    connector: 'bg-cyan-300',
  },
};

const abbreviationExplanations: Array<{ pattern: RegExp, term: string, explanation: string }> = [
  { pattern: /ПХЗ/i, term: 'ПХЗ', explanation: "передня хрестоподібна зв'язка колінного суглоба" },
  { pattern: /\bTUG\b/i, term: 'TUG', explanation: 'Timed Up and Go, тест "Встань та йди"' },
  { pattern: /ASIA\/ISNCSCI/i, term: 'ASIA/ISNCSCI', explanation: 'міжнародний стандарт оцінки ушкодження спинного мозку' },
  { pattern: /ASIA/i, term: 'ASIA', explanation: 'шкала/стандарт оцінки ушкодження спинного мозку' },
  { pattern: /\bISNCSCI\b/i, term: 'ISNCSCI', explanation: 'International Standards for Neurological Classification of Spinal Cord Injury' },
  { pattern: /ОФВ1/i, term: 'ОФВ1', explanation: "об'єм форсованого видиху за першу секунду" },
  { pattern: /\bSpO2\b/i, term: 'SpO2', explanation: 'сатурація кисню в крові за пульсоксиметром' },
  { pattern: /(?:^|[\s,.;:()])АТ(?:$|[\s,.;:()])/i, term: 'АТ', explanation: 'артеріальний тиск' },
  { pattern: /Т5/i, term: 'Т5', explanation: "п'ятий грудний рівень/сегмент спинного мозку" },
  { pattern: /Т6/i, term: 'Т6', explanation: "шостий грудний рівень/сегмент спинного мозку" },
  { pattern: /\bC5-C6\b/i, term: 'C5-C6', explanation: "п'ятий-шостий шийні сегменти" },
  { pattern: /\bS1\b/i, term: 'S1', explanation: 'перший крижовий корінець' },
  { pattern: /\bCOVID-19\b/i, term: 'COVID-19', explanation: 'коронавірусна хвороба 2019' },
  { pattern: /AP-розмір/i, term: 'AP-розмір', explanation: 'передньо-задній розмір грудної клітки' },
];

function getAbbreviationNotes(visual: VisualAid) {
  const text = [visual.title, ...visual.labels, visual.note ?? ''].join(' ');
  const seen = new Set<string>();

  return abbreviationExplanations.filter(({ pattern, term }) => {
    if (!pattern.test(text) || seen.has(term)) return false;
    seen.add(term);
    return true;
  });
}

function FowlerPositionIllustration() {
  return (
    <div className="visual-aid-illustration rounded-2xl border border-emerald-200 bg-white p-2.5 shadow-sm">
      <svg viewBox="0 0 360 190" role="img" aria-label="Положення Фаулера: тулуб піднятий приблизно на 45-60 градусів" className="h-48 w-full">
        <defs>
          <linearGradient id="fowlerBed" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor="#dbeafe" />
            <stop offset="100%" stopColor="#cffafe" />
          </linearGradient>
          <linearGradient id="fowlerBody" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor="#6366f1" />
            <stop offset="100%" stopColor="#10b981" />
          </linearGradient>
        </defs>

        <rect x="24" y="144" width="312" height="13" rx="6" fill="#cbd5e1" />
        <rect x="48" y="158" width="16" height="18" rx="4" fill="#94a3b8" />
        <rect x="300" y="158" width="16" height="18" rx="4" fill="#94a3b8" />

        <path d="M69 132 L144 66 Q151 60 157 68 L95 139 Q90 145 81 141 Z" fill="url(#fowlerBed)" stroke="#7dd3fc" strokeWidth="3" />
        <path d="M91 135 H271 Q282 135 291 128 L313 111 Q319 106 324 111 L301 144 H88 Z" fill="#eef2ff" stroke="#c7d2fe" strokeWidth="3" />
        <path d="M271 135 Q283 136 294 128 L316 110" fill="none" stroke="#818cf8" strokeWidth="7" strokeLinecap="round" opacity="0.45" />

        <circle cx="119" cy="78" r="15" fill="#f8fafc" stroke="#334155" strokeWidth="4" />
        <path d="M130 92 L174 126" fill="none" stroke="url(#fowlerBody)" strokeWidth="11" strokeLinecap="round" />
        <path d="M168 128 H232" fill="none" stroke="#334155" strokeWidth="10" strokeLinecap="round" />
        <path d="M231 128 L286 113" fill="none" stroke="#334155" strokeWidth="10" strokeLinecap="round" />
        <path d="M152 109 L134 127" fill="none" stroke="#334155" strokeWidth="7" strokeLinecap="round" />
        <path d="M157 113 L194 121" fill="none" stroke="#334155" strokeWidth="7" strokeLinecap="round" />

        <path d="M84 138 A58 58 0 0 1 126 83" fill="none" stroke="#10b981" strokeWidth="4" strokeLinecap="round" />
        <path d="M117 82 L132 83 L124 96 Z" fill="#10b981" />
        <line x1="84" y1="138" x2="143" y2="138" stroke="#64748b" strokeWidth="3" strokeLinecap="round" strokeDasharray="5 6" />
        <text x="51" y="113" fill="#059669" fontSize="18" fontWeight="900">45-60°</text>

        <g>
          <rect x="200" y="28" width="118" height="38" rx="19" fill="#d1fae5" />
          <text x="216" y="52" fill="#047857" fontSize="13" fontWeight="900">Фаулер</text>
        </g>
        <text x="197" y="86" fill="#475569" fontSize="12" fontWeight="800">спинка ліжка піднята</text>
        <text x="197" y="103" fill="#475569" fontSize="12" fontWeight="800">тулуб напівсидячи</text>
      </svg>
      <div className="grid gap-2 sm:grid-cols-3">
        <div className="rounded-xl bg-emerald-50 px-3 py-2">
          <p className="text-[9px] font-black uppercase tracking-[0.14em] text-emerald-700">Кут</p>
          <p className="text-sm font-black text-slate-900">45-60°</p>
        </div>
        <div className="rounded-xl bg-sky-50 px-3 py-2">
          <p className="text-[9px] font-black uppercase tracking-[0.14em] text-sky-700">Навіщо</p>
          <p className="text-sm font-black text-slate-900">перехід до сидіння</p>
        </div>
        <div className="rounded-xl bg-indigo-50 px-3 py-2">
          <p className="text-[9px] font-black uppercase tracking-[0.14em] text-indigo-700">Пам’ятай</p>
          <p className="text-sm font-black text-slate-900">поступово</p>
        </div>
      </div>
    </div>
  );
}

function getVisualIllustration(visual: VisualAid) {
  if (visual.type === 'fowler') return <FowlerPositionIllustration />;
  return null;
}

export function VisualAidCard({ visual }: VisualAidCardProps) {
  if (!visual) return null;

  const isPdfVisual = visual.type === 'pediatrics-pdf';
  if (isPdfVisual && (!visual.images || visual.images.length === 0) && !visual.video) return null;

  const category = getCategory(visual.type);
  const styles = categoryStyles[category];
  const labels = visual.labels.slice(0, 4);
  const abbreviationNotes = isPdfVisual ? [] : getAbbreviationNotes(visual);
  const illustration = getVisualIllustration(visual);

  return (
    <section className="visual-aid-card rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm sm:p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[9px] font-black uppercase tracking-[0.18em] text-indigo-600">
            {isPdfVisual ? 'Зображення з презентації' : "Візуально запам'ятати"}
          </p>
          <h4 className="mt-0.5 text-lg font-black text-slate-900 leading-tight">{visual.title}</h4>
        </div>
        <span className={`w-fit rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.12em] ${styles.badge}`}>
          {isPdfVisual ? 'PDF' : styles.label}
        </span>
      </div>

      <div className={`visual-aid-scene mt-3 rounded-2xl border p-2.5 sm:p-3 ${styles.panel}`}>
        {illustration && <div className="mb-3">{illustration}</div>}
        {visual.images && visual.images.length > 0 && (
          <div className="mb-3 grid gap-2">
            {visual.images.map((image) => (
              <img
                key={image.url}
                src={image.url}
                alt={image.alt}
                loading="lazy"
                className="max-h-72 w-full rounded-xl border border-white/70 bg-white object-contain shadow-sm"
              />
            ))}
          </div>
        )}
        {!isPdfVisual && (
          <div className="visual-aid-sequence grid gap-2">
            {labels.map((label, index) => (
              <div key={`${label}-${index}`} className={`visual-aid-node min-w-0 rounded-xl border p-2.5 sm:p-3 ${styles.node}`}>
                <div className={`mb-2 flex h-7 w-7 items-center justify-center rounded-lg text-xs font-black ${styles.number}`}>
                  {index + 1}
                </div>
                <p className="visual-aid-step-label text-sm font-black leading-snug text-slate-900">{label}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {!isPdfVisual && (
        <p className="mt-2 text-xs font-semibold leading-relaxed text-slate-500">
          Запам'ятай як послідовність: {labels.join(' -> ')}.
        </p>
      )}
      {abbreviationNotes.length > 0 && (
        <div className="visual-aid-abbrev mt-2 rounded-xl border border-slate-200 bg-slate-50 p-2.5">
          <p className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-500">Скорочення</p>
          <div className="mt-2 space-y-1.5">
            {abbreviationNotes.map(({ term, explanation }) => (
              <p key={term} className="text-xs font-semibold leading-relaxed text-slate-700">
                <span className="font-black text-slate-950">{term}</span> - {explanation}
              </p>
            ))}
          </div>
        </div>
      )}
      {visual.video && (
        <div className="visual-aid-video mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-2.5 sm:p-3">
          <div className="mb-2 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[9px] font-black uppercase tracking-[0.16em] text-indigo-600">Відео-приклад</p>
              <p className="mt-0.5 text-sm font-black leading-tight text-slate-900">{visual.video.title}</p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <a
                href={visual.video.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="w-fit rounded-full bg-indigo-100 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.12em] text-indigo-700"
              >
                Відео
              </a>
              {visual.video.resourceUrl && (
                <a
                  href={visual.video.resourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="w-fit rounded-full bg-emerald-100 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.12em] text-emerald-700"
                >
                  {visual.video.resourceLabel ?? 'Корисно'}
                </a>
              )}
            </div>
          </div>
          <div className="aspect-video overflow-hidden rounded-xl bg-slate-950 shadow-inner">
            <iframe
              className="h-full w-full"
              src={visual.video.embedUrl}
              title={visual.video.title}
              loading="lazy"
              allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
            />
          </div>
        </div>
      )}
      {visual.note && (
        <p className="mt-2 text-xs font-semibold leading-relaxed text-slate-500">{visual.note}</p>
      )}
    </section>
  );
}
