import quizData from '@/src/data/quizData.json';
import selfControlData from '@/src/data/selfControlData.json';

export interface Question {
  id: number;
  topic?: string;
  variant?: number;
  question: string;
  hint?: string;
  options: string[];
  correctAnswer: number;
  explanation: string;
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

const getQuizData = (): Question[] => quizData as Question[];
const getSelfControlData = (): Question[] => selfControlData as Question[];

const isApiAvailable = async (): Promise<boolean> => {
  try {
    const res = await fetch('/api/getStats');
    return res.ok;
  } catch {
    return false;
  }
};

export const api = {
  async getTopics(): Promise<string[]> {
    if (!(await isApiAvailable())) {
      return Array.from(new Set(getQuizData().map((q) => q.topic).filter(Boolean) as string[]));
    }

    const res = await fetch('/api/getTopics');
    return res.json();
  },

  async getQuestions(topic?: string, variant?: number, source?: 'quiz' | 'selfControl'): Promise<Question[]> {
    if (!(await isApiAvailable())) {
      const sourceData = source === 'selfControl' ? getSelfControlData() : getQuizData();
      return sourceData.filter((q) => {
        if (topic && q.topic !== topic) return false;
        if (variant && q.variant !== variant) return false;
        return true;
      });
    }

    let url = '/api/getQuestions?';
    if (topic) url += `topic=${encodeURIComponent(topic)}&`;
    if (variant) url += `variant=${variant}&`;
    if (source) url += `source=${source}&`;
    const res = await fetch(url);
    return res.json();
  },

  async getVariants(): Promise<number[]> {
    if (!(await isApiAvailable())) {
      return Array.from(new Set(getSelfControlData().map((q) => q.variant).filter((v): v is number => typeof v === 'number')))
        .sort((a, b) => a - b);
    }

    const res = await fetch('/api/getVariants');
    return res.json();
  },

  async submitAnswer(topic: string, isCorrect: boolean): Promise<UserStats> {
    if (!(await isApiAvailable())) {
      return {
        totalAnswers: 0,
        correctAnswers: 0,
        topicStats: {},
        streak: 0,
        lastSession: new Date().toISOString(),
      };
    }

    const res = await fetch('/api/submitAnswer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic, isCorrect })
    });
    const data = await res.json();
    return data.stats;
  },

  async getStats(): Promise<UserStats> {
    if (!(await isApiAvailable())) {
      return {
        totalAnswers: 0,
        correctAnswers: 0,
        topicStats: {},
        streak: 0,
        lastSession: null,
      };
    }

    const res = await fetch('/api/getStats');
    return res.json();
  }
};
