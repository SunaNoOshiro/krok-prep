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
import { api, Question, UserStats } from './services/api';

// --- Dashboard/Home Component ---
const Dashboard = ({ 
  topics, 
  stats, 
  onSelectTopic,
  onClearStats,
  theme,
  setTheme
}: { 
  topics: string[], 
  stats: UserStats | null, 
  onSelectTopic: (topic: string, mode: 'training' | 'exam', options?: { limit?: number, variant?: number, source?: 'quiz' | 'selfControl' }) => void,
  onClearStats: () => void,
  theme: 'light' | 'dark' | 'colorful',
  setTheme: (theme: 'light' | 'dark' | 'colorful') => void
}) => {
  const [mainMode, setMainMode] = useState<'root' | 'topics' | 'variants'>('root');
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [variants, setVariants] = useState<number[]>([]);

  useEffect(() => {
    if (mainMode === 'variants') {
      api.getVariants().then(setVariants);
    }
  }, [mainMode]);

  const renderRootMenu = () => (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
      {/* Mixed Mode Card */}
      <motion.div
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        className="group bg-gradient-to-br from-indigo-500 to-indigo-700 rounded-[2.5rem] p-10 shadow-xl cursor-pointer relative overflow-hidden"
        onClick={() => setSelectedTopic("Змішаний режим")}
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
            <p className="text-indigo-100 font-medium">Випадкова вибірка з усього банку питань.</p>
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
            <p className="text-slate-500 font-medium">Виберіть конкретний розділ для глибокого вивчення.</p>
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
            <h3 className="text-3xl font-black text-slate-900 mb-2 leading-tight uppercase">Завдання для самоконтролю</h3>
            <p className="text-slate-500 font-medium">Контрольні варіанти для перевірки готовності.</p>
          </div>
        </div>
      </motion.div>
    </div>
  );

  return (
    <div id="dashboard" className="max-w-6xl mx-auto p-4 md:p-8 space-y-12">
      <header className="flex flex-col gap-4">
        <div className="w-full flex items-start justify-between gap-3">
          <h1 className="text-44xl md:text-5xl font-sans font-black tracking-tighter text-slate-900 flex items-center gap-4">
            <div className="w-14 h-14 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-600/20">
              <GraduationCap className="w-8 h-8 text-white" />
            </div>
            КРОК 2
          </h1>
          <div className="flex items-center gap-3 bg-white/95 border border-slate-200 rounded-2xl px-3 py-2 shadow-sm">
            <span className="text-[11px] font-black uppercase tracking-wider text-slate-500">Тема</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setTheme('light')}
                title="Світла тема"
                className={`w-9 h-9 rounded-full border flex items-center justify-center transition-all ${theme === 'light' ? 'bg-amber-500 border-amber-500 text-white shadow-md shadow-amber-500/30' : 'bg-white text-slate-500 border-slate-200 hover:bg-amber-50 hover:text-amber-600 hover:border-amber-300'}`}
              >
                <Sun className="w-4 h-4" />
              </button>
              <button
                onClick={() => setTheme('dark')}
                title="Темна тема"
                className={`w-9 h-9 rounded-full border flex items-center justify-center transition-all ${theme === 'dark' ? 'bg-indigo-600 border-indigo-600 text-white shadow-md shadow-indigo-600/30' : 'bg-white text-slate-500 border-slate-200 hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-300'}`}
              >
                <Moon className="w-4 h-4" />
              </button>
              <button
                onClick={() => setTheme('colorful')}
                title="Кольорова тема"
                className={`w-9 h-9 rounded-full border flex items-center justify-center transition-all ${theme === 'colorful' ? 'bg-gradient-to-br from-fuchsia-500 via-indigo-500 to-cyan-500 border-indigo-500 text-white shadow-md shadow-indigo-600/30' : 'bg-white text-slate-500 border-slate-200 hover:bg-violet-50 hover:text-violet-700 hover:border-violet-300'}`}
              >
                <Palette className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
        <div>
          <p className="text-slate-500 mt-2 text-lg font-medium leading-relaxed">
            <a 
              href="https://dspace.zsmu.edu.ua/bitstream/123456789/22800/1/%D0%9A%D0%A0%D0%9E%D0%9A%202_%D1%82%D0%B5%D1%81%D1%82%D0%BE%D0%B2%D1%96%20%D0%B7%D0%B0%D0%B2%D0%B4%D0%B0%D0%BD%D0%BD%D1%8F_2025.pdf" 
              target="_blank" 
              rel="noopener noreferrer"
              className="hover:text-indigo-600 transition-colors inline-flex items-center gap-2 group decoration-indigo-200 underline-offset-4 hover:underline"
            >
              Платформа підготовки до професійної сертифікації фізичних терапевтів
              <ExternalLink className="w-4 h-4 opacity-40 group-hover:opacity-100 transition-opacity" />
            </a>
          </p>
          <p className="text-slate-400 text-sm mt-1 font-medium italic">
            На основі офіційних тестових завдань 2025 року
          </p>
        </div>
        <div className="ml-auto flex items-center gap-3 bg-white/90 border border-slate-200 rounded-2xl px-3 py-2 shadow-sm">
          <span className="text-[11px] font-black uppercase tracking-wider text-slate-500">Тема</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setTheme('light')}
              title="Світла тема"
              className={`w-9 h-9 rounded-full border flex items-center justify-center transition-all ${theme === 'light' ? 'bg-amber-400 border-amber-500 text-white shadow-md shadow-amber-500/30' : 'bg-white text-slate-500 border-slate-200 hover:bg-amber-50 hover:text-amber-500'}`}
            >
              <Sun className="w-4 h-4" />
            </button>
            <button
              onClick={() => setTheme('dark')}
              title="Темна тема"
              className={`w-9 h-9 rounded-full border flex items-center justify-center transition-all ${theme === 'dark' ? 'bg-indigo-600 border-indigo-600 text-white shadow-md shadow-indigo-600/30' : 'bg-white text-slate-500 border-slate-200 hover:bg-indigo-50 hover:text-indigo-600'}`}
            >
              <Moon className="w-4 h-4" />
            </button>
            <button
              onClick={() => setTheme('colorful')}
              title="Кольорова тема"
              className={`w-9 h-9 rounded-full border flex items-center justify-center transition-all ${theme === 'colorful' ? 'bg-gradient-to-br from-fuchsia-500 via-indigo-500 to-cyan-500 border-indigo-500 text-white shadow-md shadow-indigo-600/30' : 'bg-white text-slate-500 border-slate-200 hover:bg-violet-50 hover:text-violet-600'}`}
            >
              <Palette className="w-4 h-4" />
            </button>
          </div>
        </div>
        {stats && (
          <div className="flex items-center gap-4">
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
              {topics.map((topic, i) => (
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
                </motion.div>
              ))}
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
                  onClick={() => onSelectTopic(`Варіант ${v}`, 'exam', { variant: v, source: 'selfControl' })}
                  className="bg-white aspect-square rounded-[2rem] border border-slate-100 shadow flex flex-col items-center justify-center gap-4 hover:border-amber-500 hover:shadow-lg transition-all group"
                >
                  <span className="text-6xl font-black text-slate-100 group-hover:text-amber-500 transition-colors">{v}</span>
                  <span className="text-sm font-bold text-slate-400 group-hover:text-slate-900 uppercase tracking-widest">ВАРІАНТ</span>
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
                  {selectedTopic === "Змішаний режим" ? (
                    <>
                      <button 
                        onClick={() => onSelectTopic(selectedTopic, 'exam', { limit: 25 })}
                        className="group flex flex-col items-center p-6 bg-slate-50 rounded-[2rem] border-2 border-transparent hover:border-indigo-500 hover:bg-white transition-all text-left"
                      >
                        <span className="text-4xl font-black text-indigo-500 mb-2">25</span>
                        <span className="font-bold text-slate-900 text-lg">Випадкових питань</span>
                        <span className="text-sm text-slate-500 mt-1 text-center">Швидка перевірка знань.</span>
                      </button>

                      <button 
                        onClick={() => onSelectTopic(selectedTopic, 'exam', { limit: 50 })}
                        className="group flex flex-col items-center p-6 bg-slate-50 rounded-[2rem] border-2 border-transparent hover:border-violet-500 hover:bg-white transition-all text-left"
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
                        className="group flex flex-col items-center p-6 bg-slate-50 rounded-[2rem] border-2 border-transparent hover:border-indigo-500 hover:bg-white transition-all text-left"
                      >
                        <BookOpen className="w-8 h-8 text-indigo-500 mb-3 group-hover:scale-110 transition-transform" />
                        <span className="font-bold text-slate-900 text-lg">Навчання</span>
                        <span className="text-sm text-slate-500 mt-1 text-center">Миттєвий зворотний зв'язок та детальні пояснення після кожного питання.</span>
                      </button>

                      <button 
                        onClick={() => onSelectTopic(selectedTopic, 'exam')}
                        className="group flex flex-col items-center p-6 bg-slate-50 rounded-[2rem] border-2 border-transparent hover:border-violet-500 hover:bg-white transition-all text-left"
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
  questions, 
  onComplete, 
  onQuit,
  onUpdateStats
}: { 
  topic: string, 
  mode: 'training' | 'exam', 
  questions: Question[], 
  onComplete: (results: { correct: number, total: number }) => void, 
  onQuit: () => void,
  onUpdateStats: (isCorrect: boolean) => void
}) => {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [showExplanation, setShowExplanation] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [answers, setAnswers] = useState<(number | null)[]>(new Array(questions.length).fill(null));

  useEffect(() => {
    setShowHint(false);
  }, [currentIdx]);

  const question = questions[currentIdx];

  const handleNext = () => {
    if (currentIdx < questions.length - 1) {
      setCurrentIdx(currentIdx + 1);
      setSelectedIdx(null);
      setShowExplanation(false);
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

    if (mode === 'training') {
      setShowExplanation(true);
      onUpdateStats(isCorrect);
    }
  };

  return (
    <div id="quiz-view" className="max-w-4xl mx-auto p-4 md:p-6 space-y-4">
      <nav className="flex justify-between items-center mb-4">
        <button onClick={onQuit} className="text-slate-400 hover:text-slate-900 flex items-center gap-2 text-sm font-semibold">
          <RotateCcw className="w-4 h-4" />
          Вийти
        </button>
        <div className="px-3 py-1 bg-slate-100 rounded-full text-[10px] font-bold text-slate-500 uppercase tracking-widest">
          {topic} • {mode === 'training' ? 'Навчання' : 'Екзамен'}
        </div>
      </nav>

      {/* Progress Bar */}
      <div className="space-y-1.5">
        <div className="flex justify-between text-[10px] font-bold text-slate-400">
          <span>ПИТАННЯ {currentIdx + 1} З {questions.length}</span>
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
          {topic === "Змішаний режим" && question?.topic && (
            <div className="inline-flex px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded text-[9px] font-bold uppercase tracking-wider">
              {question.topic}
            </div>
          )}
          {question?.variant && (
            <div className="inline-flex px-2 py-0.5 bg-amber-50 text-amber-600 rounded text-[9px] font-bold uppercase tracking-wider">
              Варіант {question.variant}
            </div>
          )}
          <h2 className="text-lg md:text-xl font-bold text-slate-900 leading-tight">
            {question?.question}
          </h2>
          {question?.hint && (
            <div className="flex flex-col gap-1">
              <button 
                onClick={() => setShowHint(!showHint)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-extrabold tracking-wide border transition-all ${showHint ? 'text-amber-100 bg-amber-500/20 border-amber-400/70 shadow-sm shadow-amber-500/20' : 'text-indigo-700 bg-indigo-50 border-indigo-200 hover:bg-indigo-100 hover:text-indigo-800'} theme-dark:text-indigo-200 theme-dark:bg-indigo-500/15 theme-dark:border-indigo-400/40 theme-dark:hover:bg-indigo-500/25 theme-dark:hover:text-indigo-100`}
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
                    <div className="bg-amber-50 border-l-2 border-amber-400 p-2 rounded-r-lg text-xs italic text-amber-900 leading-relaxed">
                      {question.hint}
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
                <span className="flex-1 text-xs font-semibold leading-snug">{option}</span>
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
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 30 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 30 }}
              className="relative bg-white rounded-[2rem] p-8 w-full max-w-lg shadow-2xl overflow-hidden border border-slate-100"
            >
              <div className="space-y-6">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-xl ${selectedIdx === question?.correctAnswer ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'}`}>
                    {selectedIdx === question?.correctAnswer ? <CheckCircle2 className="w-6 h-6" /> : <XCircle className="w-6 h-6" />}
                  </div>
                  <h3 className="text-xl font-bold text-slate-900">
                    {selectedIdx === question?.correctAnswer ? 'Правильно!' : 'Неправильно'}
                  </h3>
                </div>

                <div className="space-y-3">
                  <div className="text-xs font-bold text-indigo-500 uppercase tracking-widest flex items-center gap-2">
                    <BookOpen className="w-4 h-4" /> Пояснення
                  </div>
                  <p className="text-slate-600 leading-relaxed text-lg italic">
                    «{question?.explanation}»
                  </p>
                </div>

                <button 
                  onClick={handleNext}
                  className="w-full py-4 bg-slate-900 text-white rounded-2xl font-bold hover:bg-slate-800 transition-colors shadow-lg"
                >
                  {currentIdx === questions.length - 1 ? 'Переглянути результати' : 'Наступне питання'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

// --- Main App Component ---
export default function App() {
  const [view, setView] = useState<'dashboard' | 'quiz' | 'results'>('dashboard');
  const [topics, setTopics] = useState<string[]>([]);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [currentQuiz, setCurrentQuiz] = useState<{ 
    topic: string, 
    mode: 'training' | 'exam', 
    questions: Question[] 
  } | null>(null);
  const [lastResults, setLastResults] = useState<{ correct: number, total: number } | null>(null);
  const [theme, setTheme] = useState<'light' | 'dark' | 'colorful'>(() => {
    const saved = localStorage.getItem('krok_theme_v1');
    if (saved === 'dark' || saved === 'colorful') return saved;
    return 'light';
  });

  const loadStats = (): UserStats => {
    try {
      const saved = localStorage.getItem('krok_stats_v2');
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

  const saveStats = (newStats: UserStats) => {
    localStorage.setItem('krok_stats_v2', JSON.stringify(newStats));
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
    localStorage.setItem('krok_theme_v1', theme);
  }, [theme]);

  useEffect(() => {
    const init = async () => {
      const t = await api.getTopics();
      setTopics(t);
      setStats(loadStats());
    };
    init();
  }, []);

  const handleClearStats = () => {
    const emptyStats: UserStats = {
      totalAnswers: 0,
      correctAnswers: 0,
      topicStats: {},
      streak: 0,
      lastSession: null
    };
    localStorage.removeItem('krok_stats_v2');
    setStats(emptyStats);
  };

  const handleStartQuiz = async (topic: string, mode: 'training' | 'exam', options?: { limit?: number, variant?: number, source?: 'quiz' | 'selfControl' }) => {
    let questions = await api.getQuestions(
      topic === "Змішаний режим" ? undefined : (options?.source === 'selfControl' ? undefined : topic),
      options?.variant,
      options?.source
    );
    
    // Shuffle if it's not a specific variant or if it's a mixed mode
    if (topic === "Змішаний режим" || !options?.variant) {
      questions = [...questions].sort(() => Math.random() - 0.5);
    }
    
    // Limit if needed
    if (options?.limit) {
      questions = questions.slice(0, options.limit);
    }

    setCurrentQuiz({ topic, mode, questions });
    setView('quiz');
  };

  const handleUpdateStats = (isCorrect: boolean) => {
    if (!currentQuiz) return;
    let s = loadStats();
    s = updateDetailedStats(s, currentQuiz.topic, isCorrect);
    s = updateStreak(s);
    saveStats(s);
  };

  const handleCompleteQuiz = async (results: { correct: number, total: number }) => {
    // Note: For training mode, stats are updated per question via handleUpdateStats.
    // For exam mode, we update stats at the end.
    if (currentQuiz?.mode === 'exam') {
      let s = loadStats();
      // Increment overall stats
      s.totalAnswers += results.total;
      s.correctAnswers += results.correct;
      
      // Increment per topic if not mixed
      if (currentQuiz.topic !== "Змішаний режим") {
        if (!s.topicStats) s.topicStats = {};
        if (!s.topicStats[currentQuiz.topic]) s.topicStats[currentQuiz.topic] = { count: 0, correct: 0 };
        s.topicStats[currentQuiz.topic].count += results.total;
        s.topicStats[currentQuiz.topic].correct += results.correct;
      }
      
      s = updateStreak(s);
      saveStats(s);
    }
    
    setLastResults(results);
    setView('results');
  };

  return (
    <div className={`min-h-screen bg-slate-50 font-sans text-slate-900 selection:bg-indigo-100 selection:text-indigo-900 theme-${theme}`}>
      <AnimatePresence mode="wait">
        {view === 'dashboard' && (
          <motion.div key="dashboard" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <Dashboard 
              topics={topics} 
              stats={stats} 
              onSelectTopic={handleStartQuiz} 
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
              questions={currentQuiz.questions} 
              onComplete={handleCompleteQuiz} 
              onQuit={() => setView('dashboard')}
              onUpdateStats={handleUpdateStats}
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
                  onClick={() => handleStartQuiz(currentQuiz.topic, currentQuiz.mode)}
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
