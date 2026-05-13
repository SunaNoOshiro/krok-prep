import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  BookOpen, 
  Award, 
  CheckCircle2, 
  XCircle, 
  RefreshCcw,
  GraduationCap,
  Play,
  RotateCcw,
  Lightbulb,
  Layers,
  ClipboardList,
  Target,
  ExternalLink,
  Trash2,
  ChevronRight,
  Sun,
  Moon,
  Palette
} from 'lucide-react';
import { api, Question, QuestionSource, UserStats } from './services/api';
import { VisualAidCard, type VisualAid } from './components/VisualAid';
import { ScaleReferenceCard } from './components/ScaleReference';
import { SpineLevelReferenceCard } from './components/SpineLevelReference';
import { ConceptReferenceCard } from './components/ConceptReference';
import { normalizeDisplayText } from './utils/text';

type ExamFamily = 'krok' | 'edki';
type Theme = 'light' | 'dark' | 'colorful';
type QuizMode = 'training' | 'exam';
type StartOptions = { limit?: number, variant?: number, source?: QuestionSource };

const MIXED_TOPIC = 'Змішаний режим';
const THEME_STORAGE_KEY = 'krok_theme_v1';
const STATS_STORAGE_KEYS: Record<ExamFamily, string> = {
  krok: 'krok_stats_v2',
  edki: 'edki_stats_v1',
};

const EXAM_CONFIGS: Record<ExamFamily, {
  title: string,
  subtitle: string,
  sourceText: string,
  sourceNote: string,
  sourceUrl?: string,
  defaultSource: QuestionSource,
  variantSource: QuestionSource,
  variantTitle: string,
  variantDescription: string,
  variantName: string,
  variantUnit: string,
}> = {
  krok: {
    title: 'КРОК 2',
    subtitle: 'Платформа підготовки до професійної сертифікації фізичних терапевтів',
    sourceText: 'Платформа підготовки до професійної сертифікації фізичних терапевтів',
    sourceNote: 'На основі офіційних тестових завдань Крок 2 2025 року',
    sourceUrl: 'https://dspace.zsmu.edu.ua/bitstream/123456789/22800/1/%D0%9A%D0%A0%D0%9E%D0%9A%202_%D1%82%D0%B5%D1%81%D1%82%D0%BE%D0%B2%D1%96%20%D0%B7%D0%B0%D0%B2%D0%B4%D0%B0%D0%BD%D0%BD%D1%8F_2025.pdf',
    defaultSource: 'quiz',
    variantSource: 'selfControl',
    variantTitle: 'Завдання для самоконтролю',
    variantDescription: 'Контрольні варіанти для перевірки готовності.',
    variantName: 'Варіант',
    variantUnit: 'ВАРІАНТ',
  },
  edki: {
    title: 'ЄДКІ',
    subtitle: 'Бакалаври "Фізична терапія, ерготерапія"',
    sourceText: 'ЄДКІ Бакалаври "Фізична терапія, ерготерапія"',
    sourceNote: 'Тестові завдання ЄДКІ від 2026 року; тема «Педіатрія» з файлу «крок 4 курс.pdf»',
    defaultSource: 'edki',
    variantSource: 'edki',
    variantTitle: 'ЄДКІ',
    variantDescription: 'Тестові завдання ЄДКІ 2026 року та педіатрія з «крок 4 курс.pdf».',
    variantName: 'ЄДКІ',
    variantUnit: 'ЄДКІ',
  },
};

function shuffleList<T>(items: T[]): T[] {
  const shuffled = [...items];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function hasSameOrder<T>(left: T[], right: T[], getKey: (item: T) => unknown): boolean {
  return left.every((item, index) => getKey(item) === getKey(right[index]));
}

function shuffleQuestionOptions(question: Question): Question {
  const optionsWithOriginalIndex = question.options.map((option, originalIndex) => ({
    option,
    originalIndex,
  }));
  let shuffledOptions = shuffleList(optionsWithOriginalIndex);

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const correctAnswerMoved = shuffledOptions.findIndex(({ originalIndex }) => originalIndex === question.correctAnswer) !== question.correctAnswer;
    const orderChanged = !hasSameOrder(optionsWithOriginalIndex, shuffledOptions, ({ originalIndex }) => originalIndex);
    if (correctAnswerMoved && orderChanged) break;

    shuffledOptions = shuffleList(optionsWithOriginalIndex);
  }

  const correctAnswerMoved = shuffledOptions.findIndex(({ originalIndex }) => originalIndex === question.correctAnswer) !== question.correctAnswer;
  if (!correctAnswerMoved && shuffledOptions.length > 1) {
    shuffledOptions = [
      ...optionsWithOriginalIndex.slice(1),
      optionsWithOriginalIndex[0],
    ];
  }

  return {
    ...question,
    options: shuffledOptions.map(({ option }) => option),
    correctAnswer: shuffledOptions.findIndex(({ originalIndex }) => originalIndex === question.correctAnswer),
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getLearningExplanation(question?: Question) {
  if (!question) {
    return { correctAnswerText: '', explanationText: '' };
  }

  const correctAnswerText = normalizeDisplayText(question.options[question.correctAnswer] ?? '');
  const rawExplanation = normalizeDisplayText(question.explanation?.trim() ?? '');
  const escapedAnswer = escapeRegExp(correctAnswerText);
  const exactAnswerPrefix = new RegExp(
    `^Правильна відповідь(?:\\s*-\\s*[A-E])?:\\s*«?${escapedAnswer}»?\\.?\\s*`,
    'i'
  );
  let explanationText = rawExplanation.replace(exactAnswerPrefix, '').trim();

  if (explanationText === rawExplanation) {
    explanationText = rawExplanation
      .replace(/^Правильна відповідь(?:\s*-\s*[A-E])?:\s*«[^»]+»\.?\s*/i, '')
      .trim();
  }

  return {
    correctAnswerText,
    explanationText: explanationText || rawExplanation,
  };
}

type ExplanationBlock =
  | { type: 'paragraph', text: string }
  | { type: 'heading', text: string }
  | { type: 'list', items: string[] };

function cleanupExplanationText(text: string): string {
  return normalizeDisplayText(text)
    .replace(/\s*⠀\s*/g, ' ')
    .replace(/\s+(Чому це правильно\??)/gi, '\n$1\n')
    .replace(/\s+(Чому\s+(?:не\s+інші\s+варіанти|інші\s+(?:не\s+правильні|варіанти(?:\s+не\s+є)?[^:.?]*|відповіді\s+неправильні))\??:?)/gi, '\n$1\n')
    .replace(/\s*([●•►])\s*/g, '\n$1 ')
    .replace(/\s+([1-9]\.)\s+/g, '\n$1 ')
    .trim();
}

function formatExplanationParts(text: string): { blocks: ExplanationBlock[], source: string } {
  const normalized = normalizeDisplayText(text);
  const sourceMatch = normalized.match(/Тести на основі файлу «крок 4 курс\.pdf», слайди? [^.]+\.?$/);
  const source = sourceMatch?.[0] ?? '';
  const body = cleanupExplanationText(source ? normalized.slice(0, sourceMatch?.index).trim() : normalized);
  const blocks: ExplanationBlock[] = [];
  let pendingList: string[] = [];

  const flushList = () => {
    if (pendingList.length === 0) return;
    blocks.push({ type: 'list', items: pendingList });
    pendingList = [];
  };

  body.split('\n').map((part) => part.trim()).filter(Boolean).forEach((part) => {
    if (/^(?:[●•►]|\d+\.)\s*/.test(part)) {
      pendingList.push(part.replace(/^(?:[●•►]|\d+\.)\s*/, '').trim());
      return;
    }

    flushList();

    if (
      /^Чому це правильно\??$/i.test(part)
      || /^Чому\s+(?:не\s+інші\s+варіанти|інші\s+(?:не\s+правильні|варіанти(?:\s+не\s+є)?[^:.?]*|відповіді\s+неправильні))\??:?$/i.test(part)
      || (part.length < 90 && /[:?]$/.test(part))
    ) {
      blocks.push({ type: 'heading', text: part.replace(/\?$/, '?') });
      return;
    }

    blocks.push({ type: 'paragraph', text: part });
  });

  flushList();

  return {
    blocks: blocks.length > 0 ? blocks : [{ type: 'paragraph', text: body }],
    source,
  };
}

function splitExplanationSections(text: string): { correct: string, incorrect: string, source: string } {
  const normalized = normalizeDisplayText(text);
  const sourceMatch = normalized.match(/Тести на основі файлу «крок 4 курс\.pdf», слайди? [^.]+\.?$/);
  const source = sourceMatch?.[0] ?? '';
  const body = source ? normalized.slice(0, sourceMatch?.index).trim() : normalized;
  const splitMatch = body.match(/Чому\s+(?:не\s+інші\s+варіанти|інші\s+(?:не\s+правильні|варіанти(?:\s+не\s+є)?[^:.?]*|відповіді\s+неправильні))\??:?/i);

  if (!splitMatch || splitMatch.index == null) {
    const fallbackListIndex = body.search(/[●•►]\s*(?:[A-EА-Еa-eа-е][.:]\s*)?[«"]?[^:•]{2,120}:/);
    if (fallbackListIndex >= 0) {
      return {
        correct: body
          .slice(0, fallbackListIndex)
          .replace(/^Чому це правильно\??:?\s*/i, '')
          .trim(),
        incorrect: body.slice(fallbackListIndex).trim(),
        source,
      };
    }

    return {
      correct: body.replace(/^Чому це правильно\??:?\s*/i, '').trim(),
      incorrect: '',
      source,
    };
  }

  return {
    correct: body
      .slice(0, splitMatch.index)
      .replace(/^Чому це правильно\??:?\s*/i, '')
      .trim(),
    incorrect: body
      .slice(splitMatch.index + splitMatch[0].length)
      .replace(/^[:\s-]+/, '')
      .trim(),
    source,
  };
}

function FormattedExplanation({ text, compact = false }: { text: string, compact?: boolean }) {
  const { blocks, source } = formatExplanationParts(text);

  return (
    <div className={compact ? 'space-y-2' : 'space-y-3'}>
      {blocks.map((block, index) => {
        if (block.type === 'heading') {
          return (
            <p key={`${block.text}-${index}`} className={compact ? 'font-black not-italic text-amber-950' : 'font-black text-slate-900'}>
              {block.text}
            </p>
          );
        }

        if (block.type === 'list') {
          return (
            <ul key={`list-${index}`} className={compact ? 'space-y-1.5' : 'space-y-2'}>
              {block.items.map((bullet, bulletIndex) => (
                <li key={`${bullet}-${bulletIndex}`} className="flex gap-2">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-current opacity-60" />
                  <span>{bullet}</span>
                </li>
              ))}
            </ul>
          );
        }

        return <p key={`${block.text}-${index}`}>{block.text}</p>;
      })}
      {source && (
        <p className={compact ? 'font-bold not-italic text-amber-950' : 'font-bold text-slate-700'}>
          {source}
        </p>
      )}
    </div>
  );
}

function getQuestionReferenceText(question?: Question): string {
  if (!question) return '';

  return normalizeDisplayText([
    question.question,
    question.hint ?? '',
    question.explanation,
    ...question.options,
  ].join(' '));
}

function hasScaleReference(question?: Question): boolean {
  return /Ашфорт|Ashworth|ASIA|AIS|ISNCSCI|mMRC|Medical Research Council|медичн[а-яіїєґ\s]+дослідницьк|Борг|BORG|Берга|Berg|BBS|Бартел|Barthel|\bFIM\b|функціональн[а-яіїєґ\s]+незалеж|\bNIPS\b|N[-\s]?PASS|\bNBAS\b|ВАШ|\bVAS\b|\bGMFCS\b|\bFMS\b|\bCFCS\b|\bMACS\b/i.test(getQuestionReferenceText(question));
}

function hasSpineReference(question?: Question): boolean {
  return /[CСTТLS]\s*\d{1,2}(?:\s*[-–]\s*[CСTТLS]\s*\d{1,2})?/i.test(getQuestionReferenceText(question));
}

function shouldShowVisualAid(question?: Question): boolean {
  if (!question?.visual) return false;
  if (question.visual.video) return true;

  const visualType = question.visual.type;

  if (visualType === 'pediatrics-pdf' && (!question.visual.images || question.visual.images.length === 0)) return false;
  if (visualType === 'median-hand') return false;
  if ((visualType === 'ashworth-scale' || visualType === 'asia') && hasScaleReference(question)) return false;
  if ((visualType === 's1-root' || visualType === 'sit-upright') && hasSpineReference(question)) return false;

  return true;
}

function ExplanationSections({ text, hideSource = false }: { text: string, hideSource?: boolean }) {
  const sections = splitExplanationSections(text);

  return (
    <div className="space-y-3">
      <div className="explanation-correct-panel rounded-3xl border border-indigo-100 bg-indigo-50/70 p-4 sm:p-5">
        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-indigo-600">
          <BookOpen className="w-4 h-4" /> Чому це правильно
        </div>
        <div className="mt-3 text-base sm:text-lg text-slate-800 leading-relaxed">
          <FormattedExplanation text={sections.correct || text} />
        </div>
      </div>

      {sections.incorrect && (
        <div className="explanation-incorrect-panel rounded-3xl border border-slate-200 bg-white p-4 sm:p-5">
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
            <XCircle className="w-4 h-4" /> Чому інші відповіді неправильні
          </div>
          <div className="mt-3 text-base sm:text-lg text-slate-800 leading-relaxed">
            <FormattedExplanation text={sections.incorrect} />
          </div>
        </div>
      )}

      {sections.source && !hideSource && (
        <p className="px-1 text-sm font-bold text-slate-500">
          {sections.source}
        </p>
      )}
    </div>
  );
}

function ThemeControls({ theme, setTheme, compact = false }: { theme: Theme, setTheme: (theme: Theme) => void, compact?: boolean }) {
  const buttonSize = compact ? 'h-8 w-8' : 'h-9 w-9';

  return (
    <div className={`theme-switcher flex items-center border border-slate-200 bg-white/95 shadow-sm ${compact ? 'gap-2 rounded-xl px-2 py-1.5' : 'gap-3 rounded-2xl px-3 py-2'}`}>
      <span className="theme-switcher-label text-[11px] font-black uppercase tracking-wider text-slate-500">Тема</span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setTheme('light')}
          title="Світла тема"
          aria-label="Світла тема"
          className={`${buttonSize} rounded-full border flex items-center justify-center transition-all ${theme === 'light' ? 'bg-amber-500 border-amber-500 text-white shadow-md shadow-amber-500/30' : 'bg-white text-slate-500 border-slate-200 hover:bg-amber-50 hover:text-amber-600 hover:border-amber-300'}`}
        >
          <Sun className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => setTheme('dark')}
          title="Темна тема"
          aria-label="Темна тема"
          className={`${buttonSize} rounded-full border flex items-center justify-center transition-all ${theme === 'dark' ? 'bg-indigo-600 border-indigo-600 text-white shadow-md shadow-indigo-600/30' : 'bg-white text-slate-500 border-slate-200 hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-300'}`}
        >
          <Moon className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => setTheme('colorful')}
          title="Кольорова тема"
          aria-label="Кольорова тема"
          className={`${buttonSize} rounded-full border flex items-center justify-center transition-all ${theme === 'colorful' ? 'bg-gradient-to-br from-fuchsia-500 via-indigo-500 to-cyan-500 border-indigo-500 text-white shadow-md shadow-indigo-600/30' : 'bg-white text-slate-500 border-slate-200 hover:bg-violet-50 hover:text-violet-700 hover:border-violet-300'}`}
        >
          <Palette className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// --- Dashboard/Home Component ---
const Dashboard = ({ 
  examFamily,
  topics, 
  topicCounts,
  topicSources,
  stats, 
  onSelectTopic,
  onSelectExamFamily,
  onClearStats,
  theme,
  setTheme
}: { 
  examFamily: ExamFamily,
  topics: string[], 
  topicCounts: Record<string, number>,
  topicSources: Record<string, string[]>,
  stats: UserStats | null, 
  onSelectTopic: (topic: string, mode: QuizMode, options?: StartOptions) => void,
  onSelectExamFamily: (examFamily: ExamFamily) => void,
  onClearStats: () => void,
  theme: Theme,
  setTheme: (theme: Theme) => void
}) => {
  const [mainMode, setMainMode] = useState<'root' | 'topics' | 'variants'>('root');
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [variants, setVariants] = useState<number[]>([]);
  const config = EXAM_CONFIGS[examFamily];
  const totalQuestionCount = Object.values(topicCounts).reduce((sum, count) => sum + count, 0);
  const pediatricsQuestionCount = examFamily === 'edki' ? topicCounts['Педіатрія'] ?? 0 : 0;
  const edkiCoreQuestionCount = examFamily === 'edki'
    ? Math.max(totalQuestionCount - pediatricsQuestionCount, 0)
    : 0;
  const edkiQuestionBankDescription = totalQuestionCount > 0
    ? `${totalQuestionCount} питань: ${edkiCoreQuestionCount} з тестових завдань ЄДКІ 2026 року та ${pediatricsQuestionCount} з «крок 4 курс.pdf» (Педіатрія).`
    : config.variantDescription;
  const sourceNote = examFamily === 'edki' ? edkiQuestionBankDescription : config.sourceNote;
  const variantDescription = examFamily === 'edki' ? edkiQuestionBankDescription : config.variantDescription;
  const mixedDescription = examFamily === 'edki'
    ? `Випадкова вибірка з усіх ${totalQuestionCount || 188} питань ЄДКІ, включно з педіатрією.`
    : 'Випадкова вибірка з усього банку Крок.';
  const topicsDescription = examFamily === 'edki'
    ? 'Теми включають базові питання ЄДКІ 2026 року і педіатрію з «крок 4 курс.pdf».'
    : 'Виберіть конкретний розділ для глибокого вивчення.';

  useEffect(() => {
    if (mainMode === 'variants') {
      api.getVariants(config.variantSource).then(setVariants);
    }
  }, [config.variantSource, mainMode]);

  const renderTopicCard = (topic: string, i: number) => {
    const total = topicCounts[topic] ?? 0;
    const sources = topicSources[topic] ?? [];
    const answered = stats?.topicStats?.[topic]?.count ?? 0;
    const correct = stats?.topicStats?.[topic]?.correct ?? 0;
    const accuracy = answered > 0 ? Math.round((correct / answered) * 100) : 0;

    return (
      <motion.div
        key={topic}
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: i * 0.05 }}
        onClick={() => setSelectedTopic(topic)}
        className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm hover:shadow-xl hover:border-indigo-500 transition-all cursor-pointer group"
      >
        <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-600 mb-4 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
          <BookOpen className="w-5 h-5" />
        </div>
        <h3 className="text-lg font-bold text-slate-900 leading-tight">{topic}</h3>
        <div className="mt-4 flex flex-wrap items-center gap-2 text-[10px] font-black uppercase tracking-wider text-slate-400">
          {total > 0 && <span>{total} питань</span>}
          {answered > 0 && <span>{accuracy}% точність</span>}
        </div>
        {sources.length > 0 && (
          <div className="mt-3 rounded-2xl bg-slate-50 px-3 py-2">
            <p className="text-[9px] font-black uppercase tracking-[0.18em] text-indigo-500">Джерело</p>
            <p className="mt-1 text-xs font-bold leading-snug text-slate-500">
              {sources.join(' · ')}
            </p>
          </div>
        )}
      </motion.div>
    );
  };

  const renderRootMenu = () => {
    if (examFamily === 'edki') {
      return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          <motion.div
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="group bg-gradient-to-br from-indigo-500 to-indigo-700 rounded-[2.5rem] p-10 shadow-xl cursor-pointer relative overflow-hidden min-h-80"
            onClick={() => setSelectedTopic(MIXED_TOPIC)}
          >
            <div className="absolute -right-4 -top-4 opacity-10 group-hover:rotate-12 transition-transform">
              <Layers className="w-40 h-40" />
            </div>
            <div className="relative z-10 flex flex-col h-full justify-between">
              <div className="w-16 h-16 bg-white/20 backdrop-blur-md rounded-3xl flex items-center justify-center text-white mb-6">
                <RefreshCcw className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-3xl font-black text-white mb-2 leading-tight uppercase">Змішані питання</h3>
                <p className="text-indigo-100 font-medium">{mixedDescription}</p>
              </div>
            </div>
          </motion.div>

          <motion.div
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="group bg-white rounded-[2.5rem] p-10 shadow-lg border border-slate-100 cursor-pointer relative overflow-hidden min-h-80 hover:shadow-xl hover:border-emerald-500 transition-all"
            onClick={() => setMainMode('topics')}
          >
            <div className="absolute -right-4 -top-4 opacity-5 group-hover:rotate-12 transition-transform text-slate-900">
              <Target className="w-40 h-40" />
            </div>
            <div className="relative z-10 flex flex-col h-full justify-between">
              <div className="w-16 h-16 bg-emerald-50 rounded-3xl flex items-center justify-center text-emerald-600 mb-6 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                <Target className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-3xl font-black text-slate-900 mb-2 leading-tight uppercase">По темах</h3>
                <p className="text-slate-500 font-medium">{topicsDescription}</p>
              </div>
            </div>
          </motion.div>

          <motion.div
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="group bg-white rounded-[2.5rem] p-10 shadow-lg border border-slate-100 cursor-pointer relative overflow-hidden min-h-80 hover:shadow-xl hover:border-indigo-500 transition-all"
            onClick={() => setSelectedTopic(config.variantName)}
          >
            <div className="absolute -right-4 -top-4 opacity-5 group-hover:rotate-12 transition-transform text-slate-900">
              <ClipboardList className="w-40 h-40" />
            </div>
            <div className="relative z-10 flex flex-col h-full justify-between">
              <div className="w-16 h-16 bg-amber-50 rounded-3xl flex items-center justify-center text-amber-600 mb-6 group-hover:bg-amber-600 group-hover:text-white transition-colors">
                <Play className="w-8 h-8 ml-1" />
              </div>
              <div>
                <h3 className="text-3xl font-black text-slate-900 mb-2 leading-tight uppercase">{config.variantName}</h3>
                <p className="text-slate-500 font-medium">{variantDescription}</p>
              </div>
            </div>
          </motion.div>
        </div>
      );
    }

    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
      {/* Mixed Mode Card */}
      <motion.div
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        className="group bg-gradient-to-br from-indigo-500 to-indigo-700 rounded-[2.5rem] p-10 shadow-xl cursor-pointer relative overflow-hidden"
        onClick={() => setSelectedTopic(MIXED_TOPIC)}
      >
        <div className="absolute -right-4 -top-4 opacity-10 group-hover:rotate-12 transition-transform">
          <Layers className="w-40 h-40" />
        </div>
        <div className="relative z-10 flex flex-col h-full justify-between">
          <div className="w-16 h-16 bg-white/20 backdrop-blur-md rounded-3xl flex items-center justify-center text-white mb-6">
            <RefreshCcw className="w-8 h-8" />
          </div>
          <div>
            <h3 className="text-3xl font-black text-white mb-2 leading-tight uppercase">Змішані питання</h3>
            <p className="text-indigo-100 font-medium">{mixedDescription}</p>
          </div>
        </div>
      </motion.div>

      {/* Topic Mode Card */}
      <motion.div
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        className="group bg-white rounded-[2.5rem] p-10 shadow-lg border border-slate-100 cursor-pointer relative overflow-hidden"
        onClick={() => setMainMode('topics')}
      >
        <div className="absolute -right-4 -top-4 opacity-5 group-hover:rotate-12 transition-transform text-slate-900">
          <Target className="w-40 h-40" />
        </div>
        <div className="relative z-10 flex flex-col h-full justify-between">
          <div className="w-16 h-16 bg-emerald-50 rounded-3xl flex items-center justify-center text-emerald-600 mb-6 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
            <Target className="w-8 h-8" />
          </div>
          <div>
            <h3 className="text-3xl font-black text-slate-900 mb-2 leading-tight uppercase">По темам</h3>
            <p className="text-slate-500 font-medium">{topicsDescription}</p>
          </div>
        </div>
      </motion.div>

      {/* Self-Control Mode Card */}
      <motion.div
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        className="group bg-white rounded-[2.5rem] p-10 shadow-lg border border-slate-100 cursor-pointer relative overflow-hidden"
        onClick={() => setMainMode('variants')}
      >
        <div className="absolute -right-4 -top-4 opacity-5 group-hover:rotate-12 transition-transform text-slate-900">
          <ClipboardList className="w-40 h-40" />
        </div>
        <div className="relative z-10 flex flex-col h-full justify-between">
          <div className="w-16 h-16 bg-amber-50 rounded-3xl flex items-center justify-center text-amber-600 mb-6 group-hover:bg-amber-600 group-hover:text-white transition-colors">
            <ClipboardList className="w-8 h-8" />
          </div>
          <div>
            <h3 className="text-3xl font-black text-slate-900 mb-2 leading-tight uppercase">{config.variantTitle}</h3>
            <p className="text-slate-500 font-medium">{variantDescription}</p>
          </div>
        </div>
      </motion.div>
    </div>
    );
  };

  return (
    <div id="dashboard" className="max-w-6xl mx-auto p-4 md:p-8 space-y-12">
      <header className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-4">
        <div className="md:min-h-40">
          <h1 className="text-4xl md:text-5xl font-sans font-black tracking-tighter text-slate-900 flex items-center gap-4">
            <div className="w-14 h-14 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-600/20">
              <GraduationCap className="w-8 h-8 text-white" />
            </div>
            <span className="flex min-w-0 flex-col leading-none">
              {config.title}
              <span className="text-sm md:text-base font-black leading-tight tracking-normal text-slate-400 mt-2">{config.subtitle}</span>
            </span>
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-3 md:justify-self-end md:self-start">
          <div className="exam-switcher flex items-center gap-2 bg-white/95 border border-slate-200 rounded-2xl px-3 py-2 shadow-sm">
            <span className="theme-switcher-label text-[11px] font-black uppercase tracking-wider text-slate-500">Іспит</span>
            <div className="flex items-center gap-1">
              {(['krok', 'edki'] as ExamFamily[]).map((family) => (
                <button
                  key={family}
                  onClick={() => onSelectExamFamily(family)}
                  className={`px-3 py-2 rounded-xl text-xs font-black uppercase transition-all ${examFamily === family ? 'bg-slate-900 text-white shadow-md' : 'bg-white text-slate-500 hover:bg-slate-100'}`}
                >
                  {family === 'krok' ? 'Крок 2' : 'ЄДКІ'}
                </button>
              ))}
            </div>
          </div>
          <ThemeControls theme={theme} setTheme={setTheme} />
        </div>
        <div className="md:col-start-1">
          <p className="text-slate-500 mt-2 text-lg font-medium leading-relaxed">
            {config.sourceUrl ? (
              <a 
                href={config.sourceUrl}
                target="_blank" 
                rel="noopener noreferrer"
                className="hover:text-indigo-600 transition-colors inline-flex items-center gap-2 group decoration-indigo-200 underline-offset-4 hover:underline"
              >
                {config.sourceText}
                <ExternalLink className="w-4 h-4 opacity-40 group-hover:opacity-100 transition-opacity" />
              </a>
            ) : (
              <span>{config.sourceText}</span>
            )}
          </p>
          <p className="text-slate-400 text-sm mt-1 font-medium italic">
            {sourceNote}
          </p>
        </div>
        {stats && (
          <div className="flex items-center gap-4 md:col-start-1">
            <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-100 flex items-center gap-8">
              <div className="flex flex-col items-center">
                <span className="text-3xl font-black text-indigo-600 leading-none">{stats.streak}</span>
                <span className="text-[10px] text-slate-400 uppercase tracking-[0.2em] font-black mt-2">ДНІ ПОСПІЛЬ</span>
              </div>
              <div className="w-px h-12 bg-slate-100" />
              <div className="flex flex-col items-center">
                <span className="text-3xl font-black text-slate-900 leading-none">
                  {stats.totalAnswers > 0 ? Math.round((stats.correctAnswers / stats.totalAnswers) * 100) : 0}%
                </span>
                <span className="text-[10px] text-slate-400 uppercase tracking-[0.2em] font-black mt-2">ТОЧНІСТЬ</span>
              </div>
            </div>
            <button 
              onClick={() => {
                if(window.confirm('Очистити всю статистику?')) onClearStats();
              }}
              className="p-4 bg-white hover:bg-rose-50 text-slate-300 hover:text-rose-500 rounded-3xl border border-slate-100 transition-all group"
              title="Очистити статистику"
            >
              <Trash2 className="w-6 h-6" />
            </button>
          </div>
        )}
      </header>

      <AnimatePresence mode="wait">
        {mainMode === 'root' && (
          <motion.div key="root" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
            {renderRootMenu()}
          </motion.div>
        )}

        {mainMode === 'topics' && (
          <motion.div key="topics" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-8">
            <div className="flex items-center gap-4">
              <button 
                onClick={() => setMainMode('root')}
                className="p-3 bg-white border border-slate-200 rounded-2xl hover:bg-slate-50 transition-colors"
                title="Назад"
              >
                <RotateCcw className="w-5 h-5" />
              </button>
              <h2 className="text-3xl font-black text-slate-900 uppercase">Оберіть тему</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {topics.map(renderTopicCard)}
            </div>
          </motion.div>
        )}

        {mainMode === 'variants' && (
          <motion.div key="variants" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-8">
            <div className="flex items-center gap-4">
              <button 
                onClick={() => setMainMode('root')}
                className="p-3 bg-white border border-slate-200 rounded-2xl hover:bg-slate-50 transition-colors"
              >
                <RotateCcw className="w-5 h-5" />
              </button>
              <h2 className="text-3xl font-black text-slate-900 uppercase">Оберіть варіант</h2>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              {variants.map((v, i) => (
                <motion.button
                  key={v}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: i * 0.05 }}
                  onClick={() => onSelectTopic(`${config.variantName} ${v}`, 'exam', { variant: v, source: config.variantSource })}
                  className="bg-white aspect-square rounded-[2rem] border border-slate-200 shadow-sm flex flex-col items-center justify-center gap-4 hover:border-amber-500 hover:bg-amber-50/30 hover:shadow-lg transition-all group"
                >
                  <span className="text-6xl font-black text-slate-300 group-hover:text-amber-500 transition-colors">{v}</span>
                  <span className="text-sm font-bold text-slate-500 group-hover:text-slate-900 uppercase tracking-widest">{config.variantUnit}</span>
                </motion.button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mode Selection Modal */}
      <AnimatePresence>
        {selectedTopic && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
              onClick={() => setSelectedTopic(null)}
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative bg-white rounded-[2.5rem] p-8 md:p-12 w-full max-w-2xl shadow-2xl overflow-hidden"
            >
              <div className="space-y-6 text-center">
                <div className="inline-flex items-center justify-center w-20 h-20 bg-indigo-50 rounded-[2rem] text-indigo-600 mb-4">
                  <Play className="w-10 h-10 ml-1" />
                </div>
                <div>
                  <h2 className="text-3xl font-bold text-slate-900">{selectedTopic}</h2>
                  <p className="text-slate-500 mt-2 text-lg">Оберіть режим навчання, щоб розпочати сесію.</p>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4">
                  {selectedTopic === MIXED_TOPIC ? (
                    <>
                      <button 
                        onClick={() => onSelectTopic(selectedTopic, 'exam', { limit: 25 })}
                        className="mode-choice group flex min-h-40 flex-col items-center justify-center p-6 bg-slate-50 rounded-[2rem] border-2 border-transparent hover:border-indigo-500 hover:bg-white transition-all text-left"
                      >
                        <span className="text-4xl font-black text-indigo-500 mb-2">25</span>
                        <span className="font-bold text-slate-900 text-lg">Випадкових питань</span>
                        <span className="text-sm text-slate-500 mt-1 text-center">Швидка перевірка знань.</span>
                      </button>

                      <button 
                        onClick={() => onSelectTopic(selectedTopic, 'exam', { limit: 50 })}
                        className="mode-choice group flex min-h-40 flex-col items-center justify-center p-6 bg-slate-50 rounded-[2rem] border-2 border-transparent hover:border-violet-500 hover:bg-white transition-all text-left"
                      >
                        <span className="text-4xl font-black text-violet-500 mb-2">50</span>
                        <span className="font-bold text-slate-900 text-lg">Випадкових питань</span>
                        <span className="text-sm text-slate-500 mt-1 text-center">Глибокий тест на витривалість.</span>
                      </button>
                    </>
                  ) : (
                    <>
                      <button 
                        onClick={() => onSelectTopic(selectedTopic, 'training')}
                        className="mode-choice group flex min-h-40 flex-col items-center justify-center p-6 bg-slate-50 rounded-[2rem] border-2 border-transparent hover:border-indigo-500 hover:bg-white transition-all text-left"
                      >
                        <BookOpen className="w-8 h-8 text-indigo-500 mb-3 group-hover:scale-110 transition-transform" />
                        <span className="font-bold text-slate-900 text-lg">Навчання</span>
                        <span className="text-sm text-slate-500 mt-1 text-center">Миттєвий зворотний зв'язок та детальні пояснення після кожного питання.</span>
                      </button>

                      <button 
                        onClick={() => onSelectTopic(selectedTopic, 'exam')}
                        className="mode-choice group flex min-h-40 flex-col items-center justify-center p-6 bg-slate-50 rounded-[2rem] border-2 border-transparent hover:border-violet-500 hover:bg-white transition-all text-left"
                      >
                        <Award className="w-8 h-8 text-violet-500 mb-3 group-hover:scale-110 transition-transform" />
                        <span className="font-bold text-slate-900 text-lg">Екзамен</span>
                        <span className="text-sm text-slate-500 mt-1 text-center">Симуляція тесту. Жодних відповідей до самого кінця.</span>
                      </button>
                    </>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

// --- Quiz Engine Component ---
const QuizView = ({ 
  topic, 
  mode, 
  variantName,
  showVariantTag,
  questions, 
  onComplete, 
  onQuit,
  onUpdateStats,
  theme,
  setTheme
}: { 
  topic: string, 
  mode: QuizMode,
  variantName: string,
  showVariantTag: boolean,
  questions: Question[], 
  onComplete: (results: { correct: number, total: number }) => void, 
  onQuit: () => void,
  onUpdateStats: (isCorrect: boolean) => void,
  theme: Theme,
  setTheme: (theme: Theme) => void
}) => {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [showExplanation, setShowExplanation] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [showQuestionReview, setShowQuestionReview] = useState(false);
  const [answers, setAnswers] = useState<(number | null)[]>(new Array(questions.length).fill(null));

  useEffect(() => {
    setShowHint(false);
    setShowQuestionReview(false);
  }, [currentIdx]);

  const question = questions[currentIdx];
  const learningExplanation = getLearningExplanation(question);
  const showVisualAid = shouldShowVisualAid(question);

  const handleNext = () => {
    if (currentIdx < questions.length - 1) {
      setCurrentIdx(currentIdx + 1);
      setSelectedIdx(null);
      setShowExplanation(false);
      setShowQuestionReview(false);
    } else {
      const correctCount = answers.filter((ans, idx) => ans === questions[idx].correctAnswer).length;
      onComplete({ correct: correctCount, total: questions.length });
    }
  };

  const handleSelect = (idx: number) => {
    if (mode === 'training' && selectedIdx !== null) return;
    
    const isCorrect = idx === question.correctAnswer;
    const newAnswers = [...answers];
    newAnswers[currentIdx] = idx;
    setAnswers(newAnswers);
    setSelectedIdx(idx);
    setShowQuestionReview(false);

    if (mode === 'training') {
      setShowExplanation(true);
      onUpdateStats(isCorrect);
    }
  };

  return (
    <div id="quiz-view" className="max-w-4xl mx-auto p-4 md:p-6 space-y-4">
      <nav className="flex flex-wrap justify-between items-center gap-3 mb-4">
        <button onClick={onQuit} className="text-slate-400 hover:text-slate-900 flex items-center gap-2 text-sm font-semibold">
          <RotateCcw className="w-4 h-4" />
          Вийти
        </button>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <div className="px-3 py-1 bg-slate-100 rounded-full text-[10px] font-bold text-slate-500 uppercase tracking-widest">
            {topic} • {mode === 'training' ? 'Навчання' : 'Екзамен'}
          </div>
          <ThemeControls theme={theme} setTheme={setTheme} compact />
        </div>
      </nav>

      {/* Progress Bar */}
      <div className="space-y-1.5">
        <div className="flex justify-between text-[10px] font-bold text-slate-400">
          <span>ПРОГРЕС {currentIdx + 1} З {questions.length}</span>
          <span>{Math.round(((currentIdx + 1) / questions.length) * 100)}% ЗАВЕРШЕНО</span>
        </div>
        <div className="w-full h-1 bg-slate-100 rounded-full overflow-hidden">
          <motion.div 
            className="h-full bg-indigo-600"
            initial={{ width: 0 }}
            animate={{ width: `${((currentIdx + 1) / questions.length) * 100}%` }}
          />
        </div>
      </div>

      <motion.div 
        key={currentIdx}
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        className="space-y-3"
      >
        <div className="space-y-1">
          {mode !== 'exam' && question?.id && (
            <div className="inline-flex mr-2 px-2 py-0.5 bg-slate-100 text-slate-500 rounded text-[9px] font-bold uppercase tracking-wider">
              Питання №{question.id}
            </div>
          )}
          {question?.source && (
            <div className="inline-flex mr-2 px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded text-[9px] font-bold uppercase tracking-wider">
              Джерело: {normalizeDisplayText(question.source)}
            </div>
          )}
          {topic === MIXED_TOPIC && question?.topic && (
            <div className="inline-flex px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded text-[9px] font-bold uppercase tracking-wider">
              {question.topic}
            </div>
          )}
          {showVariantTag && question?.variant && (
            <div className="inline-flex px-2 py-0.5 bg-amber-50 text-amber-600 rounded text-[9px] font-bold uppercase tracking-wider">
              {variantName} {question.variant}
            </div>
          )}
          <h2 className="text-lg md:text-xl font-bold text-slate-900 leading-tight">
            {question?.question ? normalizeDisplayText(question.question) : ''}
          </h2>
          {question?.hint && (
            <div className="flex flex-col gap-1">
              <button
                onClick={() => setShowHint(!showHint)}
                className={`hint-toggle inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-extrabold tracking-wide border transition-all ${showHint ? 'hint-toggle--open text-amber-900 bg-amber-100 border-amber-300 shadow-sm shadow-amber-500/10' : 'text-indigo-700 bg-indigo-50 border-indigo-200 hover:bg-indigo-100 hover:text-indigo-800'}`}
              >
                <Lightbulb className={`w-3.5 h-3.5 ${showHint ? 'fill-amber-500' : ''}`} />
                {showHint ? 'ПРИХОВАТИ ПІДКАЗКУ' : 'ПОКАЗАТИ ПІДКАЗКУ'}
              </button>
              <AnimatePresence>
                {showHint && (
                  <motion.div 
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="hint-panel bg-amber-50 border-l-2 border-amber-400 p-2 rounded-r-lg text-xs italic text-amber-900 leading-relaxed">
                      <FormattedExplanation text={question.hint} compact />
                      {question.visual?.images && question.visual.images.length > 0 && (
                        <div className="mt-2 grid gap-2">
                          {question.visual.images.map((image) => (
                            <img
                              key={image.url}
                              src={image.url}
                              alt={image.alt}
                              loading="lazy"
                              className="max-h-56 w-full rounded-lg border border-amber-200 bg-white object-contain"
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {question?.options.map((option, i) => {
            const isSelected = selectedIdx === i;
            const isCorrect = i === question.correctAnswer;
            const showResult = mode === 'training' && selectedIdx !== null;

            let bgColor = "bg-white";
            let borderColor = "border-slate-200";
            let textColor = "text-slate-700";

            if (showResult) {
              if (isCorrect) {
                bgColor = "bg-emerald-50";
                borderColor = "border-emerald-500";
                textColor = "text-emerald-900";
              } else if (isSelected && !isCorrect) {
                bgColor = "bg-rose-50";
                borderColor = "border-rose-500";
                textColor = "text-rose-900";
              }
            } else if (isSelected) {
              borderColor = "border-indigo-600";
              bgColor = "bg-indigo-50";
            }

            return (
              <button
                key={i}
                onClick={() => handleSelect(i)}
                className={`group w-full p-3 rounded-xl border-2 text-left transition-all flex items-start gap-2.5 ${bgColor} ${borderColor} ${textColor} ${!showResult && 'hover:border-indigo-600 hover:bg-indigo-50/50'}`}
              >
                <div className={`w-5 h-5 shrink-0 rounded-lg flex items-center justify-center font-bold text-[9px] transition-colors ${isSelected ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                  {String.fromCharCode(65 + i)}
                </div>
                <span className="flex-1 text-xs font-semibold leading-snug">{normalizeDisplayText(option)}</span>
                {showResult && isCorrect && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />}
                {showResult && isSelected && !isCorrect && <XCircle className="w-3.5 h-3.5 text-rose-500 shrink-0 mt-0.5" />}
              </button>
            );
          })}
        </div>

        <div className="flex justify-end pt-2">
          <button
            onClick={handleNext}
            disabled={selectedIdx === null && mode === 'training'}
            className={`px-6 py-2.5 rounded-xl flex items-center gap-2 text-sm font-bold transition-all shadow-md ${
              selectedIdx !== null || mode === 'exam' 
                ? 'bg-indigo-600 text-white shadow-indigo-600/20 hover:scale-105 active:scale-95' 
                : 'bg-slate-200 text-slate-400 cursor-not-allowed'
            }`}
          >
            {currentIdx === questions.length - 1 ? 'Завершити' : 'Наступне'}
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </motion.div>

      {/* Explanation Popup */}
      <AnimatePresence>
        {showExplanation && (
          <div className="fixed inset-0 z-50 overflow-y-auto p-2">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-slate-900/40 backdrop-blur-[2px]"
            />
            <div className="relative z-10 flex min-h-full items-center justify-center">
              <motion.div 
                initial={{ opacity: 0, scale: 0.9, y: 30 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 30 }}
                className="learning-result-modal relative w-full max-w-xl overflow-y-auto rounded-[2rem] border border-slate-100 bg-white p-4 shadow-2xl sm:p-5"
              >
                <div className="learning-result-content">
                  <div className="space-y-5">
                    <div className="flex items-center gap-4">
                      <div className={`p-3 rounded-2xl ${selectedIdx === question?.correctAnswer ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'}`}>
                        {selectedIdx === question?.correctAnswer ? <CheckCircle2 className="w-6 h-6" /> : <XCircle className="w-6 h-6" />}
                      </div>
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Результат</p>
                        <h3 className="text-2xl sm:text-3xl font-black text-slate-900 leading-tight">
                          {selectedIdx === question?.correctAnswer ? 'Правильно!' : 'Неправильно'}
                        </h3>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                      <button
                        type="button"
                        onClick={() => setShowQuestionReview((current) => !current)}
                        className="flex w-full items-center justify-between gap-3 text-left"
                      >
                        <span className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-indigo-700">
                          <ClipboardList className="h-4 w-4" />
                          {showQuestionReview ? 'Сховати питання' : 'Показати питання'}
                        </span>
                        <ChevronRight className={`h-4 w-4 text-indigo-600 transition-transform ${showQuestionReview ? 'rotate-90' : ''}`} />
                      </button>
                      <AnimatePresence initial={false}>
                        {showQuestionReview && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden"
                          >
                            <div className="mt-3 space-y-3 border-t border-slate-200 pt-3">
                              <p className="text-sm font-bold leading-relaxed text-slate-900">
                                {question?.question ? normalizeDisplayText(question.question) : ''}
                              </p>
                              <div className="grid gap-2">
                                {question?.options.map((option, index) => {
                                  const isCorrect = index === question.correctAnswer;
                                  const isSelected = index === selectedIdx;
                                  return (
                                    <div
                                      key={`${option}-${index}`}
                                      className={`rounded-xl border px-3 py-2 text-xs font-semibold leading-snug ${
                                        isCorrect
                                          ? 'border-emerald-300 bg-emerald-50 text-emerald-950'
                                          : isSelected
                                            ? 'border-rose-300 bg-rose-50 text-rose-950'
                                            : 'border-slate-200 bg-white text-slate-700'
                                      }`}>
                                      <div className="flex items-start gap-2">
                                        <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-lg text-[9px] font-black ${
                                          isCorrect
                                            ? 'bg-emerald-600 text-white'
                                            : isSelected
                                              ? 'bg-rose-600 text-white'
                                              : 'bg-slate-100 text-slate-500'
                                        }`}>
                                          {String.fromCharCode(65 + index)}
                                        </span>
                                        <span className="min-w-0 flex-1">{normalizeDisplayText(option)}</span>
                                        {isCorrect && <span className="shrink-0 text-[9px] font-black uppercase tracking-wide text-emerald-700">Правильна</span>}
                                        {isSelected && !isCorrect && <span className="shrink-0 text-[9px] font-black uppercase tracking-wide text-rose-700">Твоя</span>}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                    <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-4 sm:p-5">
                      <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-emerald-700">
                        <CheckCircle2 className="w-4 h-4" /> Правильна відповідь
                      </div>
                      <p className="mt-3 text-base sm:text-lg font-black text-emerald-950 leading-snug">
                        {learningExplanation.correctAnswerText}
                      </p>
                    </div>

                    {question?.source && (
                      <p className="px-1 text-sm font-bold text-slate-500">
                        Джерело: {normalizeDisplayText(question.source)}
                      </p>
                    )}

                    <ExplanationSections text={learningExplanation.explanationText} hideSource={showVisualAid} />

                    <SpineLevelReferenceCard question={question} />

                    <ScaleReferenceCard question={question} />

                    {showVisualAid && <VisualAidCard visual={question?.visual as VisualAid | undefined} />}

                    <ConceptReferenceCard question={question} selectedAnswerIndex={selectedIdx} />

                    <button
                      onClick={handleNext}
                      className="w-full rounded-2xl bg-slate-900 py-4 text-base font-bold text-white shadow-lg shadow-slate-900/15 transition-colors hover:bg-slate-800"
                    >
                      {currentIdx === questions.length - 1 ? 'Переглянути результати' : 'Наступне питання'}
                    </button>
                  </div>
                </div>
              </motion.div>
            </div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

// --- Main App Component ---
export default function App() {
  const [view, setView] = useState<'dashboard' | 'quiz' | 'results'>('dashboard');
  const [examFamily, setExamFamily] = useState<ExamFamily>(() => {
    return localStorage.getItem('exam_family_v1') === 'edki' ? 'edki' : 'krok';
  });
  const [topics, setTopics] = useState<string[]>([]);
  const [topicCounts, setTopicCounts] = useState<Record<string, number>>({});
  const [topicSources, setTopicSources] = useState<Record<string, string[]>>({});
  const [stats, setStats] = useState<UserStats | null>(null);
  const [currentQuiz, setCurrentQuiz] = useState<{ 
    examFamily: ExamFamily,
    topic: string,
    mode: QuizMode,
    questions: Question[],
    options: StartOptions,
  } | null>(null);
  const [lastResults, setLastResults] = useState<{ correct: number, total: number } | null>(null);
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === 'dark' || saved === 'colorful') return saved;
    return 'light';
  });

  const loadStats = (family: ExamFamily = examFamily): UserStats => {
    try {
      const saved = localStorage.getItem(STATS_STORAGE_KEYS[family]);
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.error('Failed to load stats', e);
    }
    return {
      totalAnswers: 0,
      correctAnswers: 0,
      topicStats: {},
      streak: 0,
      lastSession: null
    };
  };

  const saveStats = (newStats: UserStats, family: ExamFamily = examFamily) => {
    localStorage.setItem(STATS_STORAGE_KEYS[family], JSON.stringify(newStats));
    setStats({ ...newStats });
  };

  const updateDetailedStats = (currentStats: UserStats, topic: string, isCorrect: boolean): UserStats => {
    const updated = { ...currentStats };
    if (!updated.topicStats) updated.topicStats = {};
    if (!updated.topicStats[topic]) updated.topicStats[topic] = { count: 0, correct: 0 };
    
    updated.topicStats[topic].count += 1;
    if (isCorrect) updated.topicStats[topic].correct += 1;
    
    updated.totalAnswers += 1;
    if (isCorrect) updated.correctAnswers += 1;
    
    return updated;
  };

  const updateStreak = (currentStats: UserStats): UserStats => {
    const updated = { ...currentStats };
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    
    if (!updated.lastSession) {
      updated.streak = 1;
      updated.lastSession = today;
      return updated;
    }

    const lastDate = updated.lastSession.split('T')[0];
    if (lastDate === today) return updated;

    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    if (lastDate === yesterdayStr) {
      updated.streak += 1;
      updated.lastSession = today;
    } else {
      updated.streak = 1;
      updated.lastSession = today;
    }
    return updated;
  };

  useEffect(() => {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    const init = async () => {
      const source = EXAM_CONFIGS[examFamily].defaultSource;
      const [t, questions] = await Promise.all([
        api.getTopics(source),
        api.getQuestions(undefined, undefined, source),
      ]);
      const counts = questions.reduce<Record<string, number>>((acc, question) => {
        if (!question.topic) return acc;
        acc[question.topic] = (acc[question.topic] ?? 0) + 1;
        return acc;
      }, {});
      const sourceSets = questions.reduce<Record<string, Set<string>>>((acc, question) => {
        if (!question.topic || !question.source) return acc;
        if (!acc[question.topic]) acc[question.topic] = new Set<string>();
        acc[question.topic].add(question.source);
        return acc;
      }, {});
      const sources = Object.fromEntries(
        Object.entries(sourceSets).map(([topic, sourceSet]) => [topic, Array.from(sourceSet)])
      );
      setTopics(t);
      setTopicCounts(counts);
      setTopicSources(sources);
      setStats(loadStats(examFamily));
    };
    init();
  }, [examFamily]);

  useEffect(() => {
    localStorage.setItem('exam_family_v1', examFamily);
  }, [examFamily]);

  const handleSelectExamFamily = (family: ExamFamily) => {
    setExamFamily(family);
    setView('dashboard');
  };

  const handleClearStats = () => {
    const emptyStats: UserStats = {
      totalAnswers: 0,
      correctAnswers: 0,
      topicStats: {},
      streak: 0,
      lastSession: null
    };
    localStorage.removeItem(STATS_STORAGE_KEYS[examFamily]);
    setStats(emptyStats);
  };

  const handleStartQuiz = async (
    topic: string,
    mode: QuizMode,
    options: StartOptions = {},
    targetExamFamily: ExamFamily = examFamily
  ) => {
    const source = options.source ?? EXAM_CONFIGS[targetExamFamily].defaultSource;
    const normalizedOptions: StartOptions = { ...options, source };
    const isFullEdkiSet = targetExamFamily === 'edki' && topic === EXAM_CONFIGS.edki.variantName;
    const topicFilter = isFullEdkiSet || topic === MIXED_TOPIC || normalizedOptions.variant ? undefined : topic;
    let questions = await api.getQuestions(
      topicFilter,
      normalizedOptions.variant,
      source
    );
    
    const shouldShuffle = mode === 'exam' || mode === 'training' || topic === MIXED_TOPIC || (targetExamFamily === 'krok' && !normalizedOptions.variant);
    if (shouldShuffle) {
      questions = shuffleList(questions);
    } else {
      questions = [...questions].sort((a, b) => a.id - b.id);
    }
    
    if (normalizedOptions.limit) {
      questions = questions.slice(0, normalizedOptions.limit);
    }

    if (mode === 'exam' || mode === 'training') {
      questions = questions.map(shuffleQuestionOptions);
    }

    if (!questions.length) {
      window.alert('Для цього розділу поки немає питань.');
      return;
    }

    setCurrentQuiz({ examFamily: targetExamFamily, topic, mode, questions, options: normalizedOptions });
    setView('quiz');
  };

  const handleUpdateStats = (isCorrect: boolean) => {
    if (!currentQuiz) return;
    let s = loadStats(currentQuiz.examFamily);
    s = updateDetailedStats(s, currentQuiz.topic, isCorrect);
    s = updateStreak(s);
    saveStats(s, currentQuiz.examFamily);
  };

  const handleCompleteQuiz = async (results: { correct: number, total: number }) => {
    // Note: For training mode, stats are updated per question via handleUpdateStats.
    // For exam mode, we update stats at the end.
    if (currentQuiz?.mode === 'exam') {
      let s = loadStats(currentQuiz.examFamily);
      // Increment overall stats
      s.totalAnswers += results.total;
      s.correctAnswers += results.correct;
      
      // Increment per topic if not mixed
      if (currentQuiz.topic !== MIXED_TOPIC) {
        if (!s.topicStats) s.topicStats = {};
        if (!s.topicStats[currentQuiz.topic]) s.topicStats[currentQuiz.topic] = { count: 0, correct: 0 };
        s.topicStats[currentQuiz.topic].count += results.total;
        s.topicStats[currentQuiz.topic].correct += results.correct;
      }
      
      s = updateStreak(s);
      saveStats(s, currentQuiz.examFamily);
    }
    
    setLastResults(results);
    setView('results');
  };

  return (
    <div className={`min-h-screen bg-slate-50 font-sans text-slate-900 selection:bg-indigo-100 selection:text-indigo-900 theme-${theme}`}>
      <AnimatePresence mode="wait">
        {view === 'dashboard' && (
          <motion.div key={`dashboard-${examFamily}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <Dashboard 
              examFamily={examFamily}
              topics={topics} 
              topicCounts={topicCounts}
              topicSources={topicSources}
              stats={stats} 
              onSelectTopic={handleStartQuiz} 
              onSelectExamFamily={handleSelectExamFamily}
              onClearStats={handleClearStats}
              theme={theme}
              setTheme={setTheme}
            />
          </motion.div>
        )}

        {view === 'quiz' && currentQuiz && (
          <motion.div key="quiz" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <QuizView 
              topic={currentQuiz.topic} 
              mode={currentQuiz.mode}
              variantName={EXAM_CONFIGS[currentQuiz.examFamily].variantName}
              showVariantTag={currentQuiz.examFamily === 'krok'}
              questions={currentQuiz.questions} 
              onComplete={handleCompleteQuiz}
              onQuit={() => setView('dashboard')}
              onUpdateStats={handleUpdateStats}
              theme={theme}
              setTheme={setTheme}
            />
          </motion.div>
        )}

        {view === 'results' && currentQuiz && lastResults && (
          <motion.div 
            key="results" 
            initial={{ opacity: 0, scale: 0.95 }} 
            animate={{ opacity: 1, scale: 1 }} 
            exit={{ opacity: 0 }}
            className="max-w-xl mx-auto min-h-screen flex items-center justify-center p-6"
          >
            <div className="bg-white rounded-[3rem] p-10 w-full shadow-2xl border border-slate-100 text-center space-y-8">
              <div className="flex justify-center">
                <div className="w-24 h-24 bg-indigo-50 rounded-[2.5rem] flex items-center justify-center text-indigo-600">
                  <Award className="w-12 h-12" />
                </div>
              </div>
              
              <div className="space-y-2">
                <h2 className="text-4xl font-bold text-slate-900">Тест завершено!</h2>
                <p className="text-slate-500">Ви пройшли модуль <span className="font-bold text-slate-900">{currentQuiz.topic}</span>.</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="p-6 bg-slate-50 rounded-[2rem] space-y-1">
                  <span className="text-3xl font-bold text-slate-900">{lastResults.correct}/{lastResults.total}</span>
                  <span className="block text-xs font-bold text-slate-400 uppercase tracking-widest">Рахунок</span>
                </div>
                <div className="p-6 bg-slate-50 rounded-[2rem] space-y-1">
                  <span className="text-3xl font-bold text-indigo-600">
                    {Math.round((lastResults.correct / lastResults.total) * 100)}%
                  </span>
                  <span className="block text-xs font-bold text-slate-400 uppercase tracking-widest">Результат</span>
                </div>
              </div>

              <div className="space-y-4 pt-4">
                <button 
                  onClick={() => handleStartQuiz(currentQuiz.topic, currentQuiz.mode, currentQuiz.options, currentQuiz.examFamily)}
                  className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-indigo-700 transition-colors shadow-xl shadow-indigo-600/20"
                >
                  <RefreshCcw className="w-5 h-5" /> Пройти знову
                </button>
                <button 
                  onClick={() => setView('dashboard')}
                  className="w-full py-4 bg-slate-100 text-slate-600 rounded-2xl font-bold hover:bg-slate-200 transition-colors"
                >
                  Повернутися на головну
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
