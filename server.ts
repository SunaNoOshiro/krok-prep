import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { applyEdkiTopic, sortKrokTopics } from './src/data/edkiTopics';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read quiz data from JSON files
const quizDataPath = path.join(__dirname, 'src', 'data', 'quizData.json');
const selfControlDataPath = path.join(__dirname, 'src', 'data', 'selfControlData.json');
const edkiDataPath = path.join(__dirname, 'src', 'data', 'edkiData.json');
const krokFile8DataPath = path.join(__dirname, 'src', 'data', 'imports', 'krok-file-8.json');

type QuestionSource = 'quiz' | 'selfControl' | 'edki' | 'krokFile8';

function readQuestionFile(filePath: string) {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

function readKrokFile8Questions() {
  const data = readQuestionFile(krokFile8DataPath);
  return data.blocks.flatMap((block: any) => block.questions.map((question: any) => ({
    ...question,
    id: question.number,
  })));
}

function getQuestionData(source: unknown) {
  if (source === 'selfControl') return readQuestionFile(selfControlDataPath);
  if (source === 'edki') return readQuestionFile(edkiDataPath).map(applyEdkiTopic);
  if (source === 'krokFile8') return readKrokFile8Questions();
  return readQuestionFile(quizDataPath);
}

// In-memory stats storage
let userStats = {
  totalAnswers: 0,
  correctAnswers: 0,
  topicStats: {} as Record<string, { count: number, correct: number }>,
  streak: 0,
  lastSession: null as string | null,
};

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Routes
  app.get('/api/getTopics', (req, res) => {
    const source = req.query.source as QuestionSource | undefined;
    const topics = Array.from(new Set(getQuestionData(source).map((q: any) => q.topic).filter(Boolean)));
    res.json(sortKrokTopics(topics as string[]));
  });

  app.get('/api/getVariants', (req, res) => {
    const source = req.query.source as QuestionSource | undefined;
    const dataSource = getQuestionData(source || 'selfControl');
    const variants = Array.from(new Set(dataSource.map((q: any) => q.variant).filter((variant: any) => typeof variant === 'number')));
    res.json(variants.sort((a: any, b: any) => a - b));
  });

  app.get('/api/getQuestions', (req, res) => {
    const topic = req.query.topic as string;
    const variant = req.query.variant ? parseInt(req.query.variant as string) : null;
    const dataSource = getQuestionData(req.query.source);

    let filtered = dataSource;
    if (topic) {
      filtered = filtered.filter((q: any) => q.topic === topic);
    }
    if (variant !== null) {
      filtered = filtered.filter((q: any) => q.variant === variant);
    }
    res.json(filtered);
  });

  app.post('/api/submitAnswer', (req, res) => {
    const { topic, isCorrect, batch, correctCount, totalCount } = req.body;
    
    if (batch && totalCount) {
      userStats.totalAnswers += totalCount;
      userStats.correctAnswers += correctCount;
      if (topic) {
        if (!userStats.topicStats[topic]) userStats.topicStats[topic] = { count: 0, correct: 0 };
        userStats.topicStats[topic].count += totalCount;
        userStats.topicStats[topic].correct += correctCount;
      }
    } else {
      userStats.totalAnswers++;
      if (isCorrect) {
        userStats.correctAnswers++;
        userStats.streak++;
      } else {
        userStats.streak = 0;
      }

      if (topic) {
        if (!userStats.topicStats[topic]) userStats.topicStats[topic] = { count: 0, correct: 0 };
        userStats.topicStats[topic].count++;
        if (isCorrect) {
          userStats.topicStats[topic].correct++;
        }
      }
    }

    userStats.lastSession = new Date().toISOString();
    res.json({ status: 'saved', stats: userStats });
  });

  app.get('/api/getStats', (req, res) => {
    res.json(userStats);
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
