import quizData from '../data/quizData.json';
import selfControlData from '../data/selfControlData.json';
import edkiData from '../data/edkiData.json';
import krokFile8Import from '../data/imports/krok-file-8.json';
import krokFile1Import from '../data/imports/krok-file-1.enriched.json';
import krokFile2Import from '../data/imports/krok-file-2.enriched.json';
import krokFile3Import from '../data/imports/krok-file-3.enriched.json';
import krokFile4Import from '../data/imports/krok-file-4.enriched.json';
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
  explanation?: string;
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

export type QuestionSource = 'quiz' | 'selfControl' | 'edki' | 'krokFile8' | 'krokFile1' | 'krokFile2' | 'krokFile3' | 'krokFile4' | 'combined';

function mapImportedQuestion(question: typeof krokFile8Import.blocks[number]['questions'][number]): Question {
  return {
    ...question,
    id: question.number,
  };
}

function mapKrokFile1Question(question: typeof krokFile1Import.blocks[number]['questions'][number]): Question {
  return {
    ...question,
    id: question.number,
  } as unknown as Question;
}

function mapKrokFile2Question(question: typeof krokFile2Import.blocks[number]['questions'][number]): Question {
  return {
    ...question,
    id: question.number,
  } as unknown as Question;
}

function mapKrokFile3Question(question: typeof krokFile3Import.blocks[number]['questions'][number]): Question {
  return {
    ...question,
    id: question.number,
  } as unknown as Question;
}

function mapKrokFile4Question(question: typeof krokFile4Import.blocks[number]['questions'][number]): Question {
  return {
    ...question,
    id: question.number,
  } as unknown as Question;
}

const krokFile8Questions = krokFile8Import.blocks.flatMap((block) => block.questions.map(mapImportedQuestion));
const krokFile1Questions = krokFile1Import.blocks.flatMap((block) => block.questions.map(mapKrokFile1Question));
const krokFile2Questions = krokFile2Import.blocks.flatMap((block) => block.questions.map(mapKrokFile2Question));
const krokFile3Questions = krokFile3Import.blocks.flatMap((block) => block.questions.map(mapKrokFile3Question));
const krokFile4Questions = krokFile4Import.blocks.flatMap((block) => block.questions.map(mapKrokFile4Question));
const edkiQuestions = (edkiData as Question[]).map(applyEdkiTopic);

const dataBySource: Record<QuestionSource, Question[]> = {
  quiz: quizData as Question[],
  selfControl: selfControlData as Question[],
  edki: edkiQuestions,
  krokFile8: krokFile8Questions,
  krokFile1: krokFile1Questions,
  krokFile2: krokFile2Questions,
  krokFile3: krokFile3Questions,
  krokFile4: krokFile4Questions,
  combined: [...edkiQuestions, ...krokFile8Questions, ...krokFile1Questions, ...krokFile2Questions, ...krokFile3Questions, ...krokFile4Questions],
};

function normalizeQuestion(question: Question): Question {
  return {
    ...question,
    question: normalizeDisplayText(question.question),
    source: question.source ? normalizeDisplayText(question.source) : question.source,
    hint: question.hint ? normalizeDisplayText(question.hint) : question.hint,
    options: question.options.map(normalizeDisplayText),
    explanation: question.explanation ? normalizeDisplayText(question.explanation) : question.explanation,
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

export const api = {
  async getTopics(source?: QuestionSource): Promise<string[]> {
    const sourceData = getSourceData(source);
    return sortKrokTopics(Array.from(new Set(sourceData.map((q) => q.topic).filter((topic): topic is string => Boolean(topic)))));
  },

  async getQuestions(topic?: string, variant?: number, source?: QuestionSource, sourceLabels?: string | string[]): Promise<Question[]> {
    const sourceData = getSourceData(source);
    const labelFilter = Array.isArray(sourceLabels)
      ? (sourceLabels.length > 0 ? new Set(sourceLabels) : null)
      : (sourceLabels ? new Set([sourceLabels]) : null);
    const questions = sourceData.filter((q) => {
      if (topic && q.topic !== topic) return false;
      if (variant && (!('variant' in q) || q.variant !== variant)) return false;
      if (labelFilter && !labelFilter.has(normalizeDisplayText(q.source ?? ''))) return false;
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
};
