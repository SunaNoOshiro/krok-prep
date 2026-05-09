import quizData from '../data/quizData.json';
import selfControlData from '../data/selfControlData.json';
import edkiData from '../data/edkiData.json';
import { applyEdkiTopic, sortKrokTopics } from '../data/edkiTopics';
import { normalizeDisplayText } from '../utils/text';

export interface Question {
  id: number;
  topic?: string;
  variant?: number;
  question: string;
  hint?: string;
  options: string[];
  correctAnswer: number;
  explanation: string;
  visual?: {
    type: string;
    title: string;
    labels: string[];
    note?: string;
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

export type QuestionSource = 'quiz' | 'selfControl' | 'edki';

const API_BASE = '';
const defaultStats: UserStats = {
  totalAnswers: 0,
  correctAnswers: 0,
  topicStats: {},
  streak: 0,
  lastSession: null,
};

const dataBySource: Record<QuestionSource, Question[]> = {
  quiz: quizData as Question[],
  selfControl: selfControlData as Question[],
  edki: (edkiData as Question[]).map(applyEdkiTopic),
};

function normalizeQuestion(question: Question): Question {
  return {
    ...question,
    question: normalizeDisplayText(question.question),
    hint: question.hint ? normalizeDisplayText(question.hint) : question.hint,
    options: question.options.map(normalizeDisplayText),
    explanation: normalizeDisplayText(question.explanation),
    visual: question.visual
      ? {
        ...question.visual,
        title: normalizeDisplayText(question.visual.title),
        labels: question.visual.labels.map(normalizeDisplayText),
        note: question.visual.note ? normalizeDisplayText(question.visual.note) : question.visual.note,
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
    const res = await fetch(`${API_BASE}${path}`);
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
    const params = new URLSearchParams();
    if (source) params.set('source', source);

    const topics = await fetchJsonWithFallback(`/api/getTopics?${params.toString()}`, () => {
      const sourceData = getSourceData(source);
      return sortKrokTopics(Array.from(new Set(sourceData.map((q) => q.topic).filter((topic): topic is string => Boolean(topic)))));
    });

    return sortKrokTopics(topics);
  },

  async getQuestions(topic?: string, variant?: number, source?: QuestionSource): Promise<Question[]> {
    const params = new URLSearchParams();
    if (topic) params.set('topic', topic);
    if (variant) params.set('variant', String(variant));
    if (source) params.set('source', source);

    const questions = await fetchJsonWithFallback(`/api/getQuestions?${params.toString()}`, () => {
      const sourceData = getSourceData(source);
      return sourceData.filter((q) => {
        if (topic && q.topic !== topic) return false;
        if (variant && (!('variant' in q) || q.variant !== variant)) return false;
        return true;
      });
    });

    return questions
      .map((question) => source === 'edki' ? applyEdkiTopic(question) : question)
      .map(normalizeQuestion);
  },

  async getVariants(source: QuestionSource = 'selfControl'): Promise<number[]> {
    const params = new URLSearchParams();
    params.set('source', source);

    return fetchJsonWithFallback(`/api/getVariants?${params.toString()}`, () => {
      const sourceData = getSourceData(source);
      const variants = Array.from(new Set(sourceData.map((q) => q.variant).filter((v): v is number => typeof v === 'number')));
      return variants.sort((a, b) => a - b);
    });
  },

  async submitAnswer(topic: string, isCorrect: boolean): Promise<UserStats> {
    try {
      const res = await fetch(`${API_BASE}/api/submitAnswer`, {
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
