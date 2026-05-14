import quizData from '../data/quizData.json';
import selfControlData from '../data/selfControlData.json';
import edkiData from '../data/edkiData.json';
import krokFile8Import from '../data/imports/krok-file-8.json';
import { applyEdkiTopic, sortKrokTopics } from '../data/edkiTopics';
import { normalizeDisplayText } from '../utils/text';

export interface Question {
  id: number;
  blockId?: string;
  clinicalTopic?: string;
  topic?: string;
  variant?: number;
  source?: string;
  sourceQuestion?: string;
  question: string;
  hint?: string;
  options: string[];
  correctAnswer: number;
  correctAnswerKey?: string;
  correctAnswerText?: string;
  keys?: string[];
  explanation: string;
  answers?: Array<{
    key: string;
    text: string;
    isCorrect: boolean;
    why: string;
  }>;
  visual?: {
    type: string;
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
  };
}

export interface UserStats {
  totalAnswers: number;
  correctAnswers: number;
  topicStats: {
    [key: string]: { count: number, correct: number };
  };
  streak: number;
  lastSession: string | null;
}

export type QuestionSource = 'quiz' | 'selfControl' | 'edki' | 'krokFile8' | 'combined';

const defaultStats: UserStats = {
  totalAnswers: 0,
  correctAnswers: 0,
  topicStats: {},
  streak: 0,
  lastSession: null,
};

function mapImportedQuestion(question: typeof krokFile8Import.blocks[number]['questions'][number]): Question {
  return {
    ...question,
    id: question.number,
  };
}

const krokFile8Questions = krokFile8Import.blocks.flatMap((block) => block.questions.map(mapImportedQuestion));
const edkiQuestions = (edkiData as Question[]).map(applyEdkiTopic);

const dataBySource: Record<QuestionSource, Question[]> = {
  quiz: quizData as Question[],
  selfControl: selfControlData as Question[],
  edki: edkiQuestions,
  krokFile8: krokFile8Questions,
  combined: [...edkiQuestions, ...krokFile8Questions],
};

function normalizeQuestion(question: Question): Question {
  return {
    ...question,
    question: normalizeDisplayText(question.question),
    source: question.source ? normalizeDisplayText(question.source) : question.source,
    hint: question.hint ? normalizeDisplayText(question.hint) : question.hint,
    options: question.options.map(normalizeDisplayText),
    explanation: normalizeDisplayText(question.explanation),
    visual: question.visual
      ? {
        ...question.visual,
        title: normalizeDisplayText(question.visual.title),
        labels: question.visual.labels.map(normalizeDisplayText),
        note: question.visual.note ? normalizeDisplayText(question.visual.note) : question.visual.note,
        images: question.visual.images?.map((image) => {
          const url = image.url.startsWith('/')
            ? `${import.meta.env.BASE_URL.replace(/\/$/, '')}${image.url}`
            : image.url;
          return {
            ...image,
            url,
            alt: normalizeDisplayText(image.alt),
          };
        }),
        video: question.visual.video
          ? {
            ...question.visual.video,
            title: normalizeDisplayText(question.visual.video.title),
          }
          : question.visual.video,
      }
      : question.visual,
  };
}

function getSourceData(source?: QuestionSource): Question[] {
  return dataBySource[source ?? 'quiz'];
}

async function fetchJsonWithFallback<T>(path: string, fallback: () => T): Promise<T> {
  try {
    const res = await fetch(path);
    if (!res.ok) {
      return fallback();
    }
    return await res.json() as T;
  } catch {
    return fallback();
  }
}

export const api = {
  async getTopics(source?: QuestionSource): Promise<string[]> {
    const sourceData = getSourceData(source);
    return sortKrokTopics(Array.from(new Set(sourceData.map((q) => q.topic).filter((topic): topic is string => Boolean(topic)))));
  },

  async getQuestions(topic?: string, variant?: number, source?: QuestionSource, sourceLabel?: string): Promise<Question[]> {
    const sourceData = getSourceData(source);
    const questions = sourceData.filter((q) => {
      if (topic && q.topic !== topic) return false;
      if (variant && (!('variant' in q) || q.variant !== variant)) return false;
      if (sourceLabel && normalizeDisplayText(q.source ?? '') !== sourceLabel) return false;
      return true;
    });

    return questions
      .map((question) => source === 'edki' ? applyEdkiTopic(question) : question)
      .map(normalizeQuestion);
  },

  async getVariants(source: QuestionSource = 'selfControl'): Promise<number[]> {
    const sourceData = getSourceData(source);
    const variants = Array.from(new Set(sourceData.map((q) => q.variant).filter((v): v is number => typeof v === 'number')));
    return variants.sort((a, b) => a - b);
  },

  async getSources(source?: QuestionSource): Promise<Array<{ label: string, count: number }>> {
    const sourceData = getSourceData(source);
    const counts = new Map<string, number>();
    for (const q of sourceData) {
      if (!q.source) continue;
      const label = normalizeDisplayText(q.source);
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count);
  },

  async submitAnswer(topic: string, isCorrect: boolean): Promise<UserStats> {
    try {
      const res = await fetch('/api/submitAnswer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic, isCorrect })
      });
      if (!res.ok) {
        throw new Error('API unavailable');
      }
      const data = await res.json();
      return data.stats;
    } catch {
      return {
        ...defaultStats,
        topicStats: {
          [topic]: { count: 1, correct: isCorrect ? 1 : 0 },
        },
        totalAnswers: 1,
        correctAnswers: isCorrect ? 1 : 0,
        streak: isCorrect ? 1 : 0,
        lastSession: new Date().toISOString(),
      };
    }
  },

  async getStats(): Promise<UserStats> {
    return fetchJsonWithFallback('/api/getStats', () => defaultStats);
  }
};
