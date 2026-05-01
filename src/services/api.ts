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

export const api = {
  async getTopics(): Promise<string[]> {
    const res = await fetch('/api/getTopics');
    return res.json();
  },

  async getQuestions(topic?: string, variant?: number, source?: 'quiz' | 'selfControl'): Promise<Question[]> {
    let url = '/api/getQuestions?';
    if (topic) url += `topic=${encodeURIComponent(topic)}&`;
    if (variant) url += `variant=${variant}&`;
    if (source) url += `source=${source}&`;
    const res = await fetch(url);
    return res.json();
  },

  async getVariants(): Promise<number[]> {
    const res = await fetch('/api/getVariants');
    return res.json();
  },

  async submitAnswer(topic: string, isCorrect: boolean): Promise<UserStats> {
    const res = await fetch('/api/submitAnswer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic, isCorrect })
    });
    const data = await res.json();
    return data.stats;
  },

  async getStats(): Promise<UserStats> {
    const res = await fetch('/api/getStats');
    return res.json();
  }
};
