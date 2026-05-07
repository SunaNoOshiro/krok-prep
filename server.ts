import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read quiz data from JSON files
const quizDataPath = path.join(__dirname, 'src', 'data', 'quizData.json');
const selfControlDataPath = path.join(__dirname, 'src', 'data', 'selfControlData.json');
const edkiDataPath = path.join(__dirname, 'src', 'data', 'edkiData.json');

const quizData = JSON.parse(fs.readFileSync(quizDataPath, 'utf-8'));
const selfControlData = JSON.parse(fs.readFileSync(selfControlDataPath, 'utf-8'));
const edkiData = JSON.parse(fs.readFileSync(edkiDataPath, 'utf-8'));

type QuestionSource = 'quiz' | 'selfControl' | 'edki';

function getQuestionData(source: unknown) {
  if (source === 'selfControl') return selfControlData;
  if (source === 'edki') return edkiData;
  return quizData;
}

// In-memory stats storage
let userStats = {
  totalAnswers: 0,
  correctAnswers: 0,
  topicStats: {
    "Обстеження": { count: 0, correct: 0 },
    "Аналіз даних, планування та прогнозування": { count: 0, correct: 0 },
    "Втручання": { count: 0, correct: 0 },
    "Загальні питання": { count: 0, correct: 0 }
  },
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
    res.json(topics);
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
      if (topic && userStats.topicStats[topic as keyof typeof userStats.topicStats]) {
        userStats.topicStats[topic as keyof typeof userStats.topicStats].count += totalCount;
        userStats.topicStats[topic as keyof typeof userStats.topicStats].correct += correctCount;
      }
    } else {
      userStats.totalAnswers++;
      if (isCorrect) {
        userStats.correctAnswers++;
        userStats.streak++;
      } else {
        userStats.streak = 0;
      }

      if (topic && userStats.topicStats[topic as keyof typeof userStats.topicStats]) {
        userStats.topicStats[topic as keyof typeof userStats.topicStats].count++;
        if (isCorrect) {
          userStats.topicStats[topic as keyof typeof userStats.topicStats].correct++;
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
