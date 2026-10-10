'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

type Example = { ja: string; en: string; furigana?: string };
type RecordItem = { id: string; day: number; printedNumber: number; kanjiOrExpression: string | null; reading: string | null; meanings: string[]; examples: Example[]; studyReady: boolean };
type GrammarExample = { ja: string; furigana: string };
type GrammarEntry = { id: string; title: string; meaningJapanese: string; formation: string; similarGrammar: string[]; category: string; sourceDocument: string; sourcePage: number; sourceExamples: GrammarExample[] };
type Mode = 'study' | 'random' | 'exam' | 'grammar';
type ExamQuestion = { targetId: string; options: string[]; selected: string | null };

const shuffle = <T,>(items: T[]) => {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const other = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[other]] = [copy[other], copy[index]];
  }
  return copy;
};

export default function StudyDashboard({ records, grammarEntries, initialMode = 'study' }: { records: RecordItem[]; grammarEntries: GrammarEntry[]; initialMode?: Mode }) {
  const router = useRouter();
  const verified = useMemo(() => records.filter((record) => record.studyReady), [records]);
  const lessons = useMemo(() => Array.from(new Set(verified.map((record) => record.day))).sort((a, b) => a - b), [verified]);
  const [mode, setMode] = useState<Mode>(initialMode);
  const [lesson, setLesson] = useState(lessons[0] ?? 1);
  const [position, setPosition] = useState(0);
  const [randomId, setRandomId] = useState<string | null>(null);
  const [examQuestion, setExamQuestion] = useState<ExamQuestion | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMounted, setDrawerMounted] = useState(false);
  const drawerTimer = useRef<number | null>(null);
  const [showEnglish, setShowEnglish] = useState(true);
  const [showFurigana, setShowFurigana] = useState(true);
  const [showMeanings, setShowMeanings] = useState(true);
  const [knownIds, setKnownIds] = useState<string[]>([]);
  const [reviewIds, setReviewIds] = useState<string[]>([]);
  const known = useMemo(() => new Set(knownIds), [knownIds]);
  const review = useMemo(() => new Set(reviewIds), [reviewIds]);
  const grammarCategories = useMemo(() => [...new Set(grammarEntries.map((entry) => entry.category))], [grammarEntries]);
  const [grammarCategory, setGrammarCategory] = useState(grammarCategories[0] ?? '');
  const [grammarPosition, setGrammarPosition] = useState(0);
  const lessonWords = useMemo(() => verified.filter((record) => record.day === lesson).sort((a, b) => a.printedNumber - b.printedNumber), [verified, lesson]);
  const lessonCurrent = lessonWords[position] ?? lessonWords[0] ?? null;
  const randomCurrent = verified.find((record) => record.id === randomId) ?? lessonCurrent;
  const current = mode === 'random' ? randomCurrent : lessonCurrent;
  const examCurrent = verified.find((record) => record.id === examQuestion?.targetId) ?? null;
  const openDrawer = () => {
    if (drawerTimer.current) window.clearTimeout(drawerTimer.current);
    setDrawerMounted(true);
    window.requestAnimationFrame(() => setDrawerOpen(true));
  };
  const closeDrawer = () => {
    setDrawerOpen(false);
    if (drawerTimer.current) window.clearTimeout(drawerTimer.current);
    drawerTimer.current = window.setTimeout(() => setDrawerMounted(false), 240);
  };

  useEffect(() => setMode(initialMode), [initialMode]);
  useEffect(() => {
    try {
      setKnownIds(JSON.parse(window.localStorage.getItem('n1-known-ids') ?? '[]'));
      setReviewIds(JSON.parse(window.localStorage.getItem('n1-review-ids') ?? '[]'));
    } catch {
      window.localStorage.removeItem('n1-known-ids');
      window.localStorage.removeItem('n1-review-ids');
    }
  }, []);
  useEffect(() => { window.localStorage.setItem('n1-known-ids', JSON.stringify(knownIds)); }, [knownIds]);
  useEffect(() => { window.localStorage.setItem('n1-review-ids', JSON.stringify(reviewIds)); }, [reviewIds]);
  useEffect(() => {
    const navigate = (event: KeyboardEvent) => {
      if (mode !== 'study' || event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return;
      if (event.key === 'ArrowRight') setPosition((value) => Math.min(value + 1, lessonWords.length - 1));
      if (event.key === 'ArrowLeft') setPosition((value) => Math.max(value - 1, 0));
    };
    window.addEventListener('keydown', navigate);
    return () => window.removeEventListener('keydown', navigate);
  }, [lessonWords.length, mode]);
  useEffect(() => {
    if (!drawerOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') closeDrawer(); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [drawerOpen]);
  useEffect(() => () => { if (drawerTimer.current) window.clearTimeout(drawerTimer.current); }, []);

  const selectLesson = (value: number) => { setLesson(value); setPosition(0); setMode('study'); closeDrawer(); };
  const selectGrammarCategory = (value: string) => { setGrammarCategory(value); setGrammarPosition(0); };
  const chooseRandom = () => {
    if (!verified.length) return;
    const pool = verified.filter((record) => record.id !== randomId);
    const selectable = pool.length ? pool : verified;
    setRandomId(selectable[Math.floor(Math.random() * selectable.length)].id);
  };
  const newExamQuestion = () => {
    if (!verified.length) return;
    const pool = verified.filter((record) => record.id !== examQuestion?.targetId && record.meanings[0]);
    const selectable = pool.length ? pool : verified;
    const target = selectable[Math.floor(Math.random() * selectable.length)];
    const correct = target.meanings[0] ?? 'Meaning unavailable';
    const distractors = shuffle(verified.filter((record) => record.id !== target.id && record.meanings[0] && record.meanings[0] !== correct).map((record) => record.meanings[0]))
      .filter((meaning, index, all) => all.indexOf(meaning) === index).slice(0, 3);
    setExamQuestion({ targetId: target.id, options: shuffle([correct, ...distractors]), selected: null });
  };
  const changeMode = (next: Mode) => {
    closeDrawer();
    if (next === 'grammar') {
      router.push('/grammar');
      return;
    }
    if (mode === 'grammar') {
      router.push('/');
      return;
    }
    setMode(next);
    if (next === 'random' && !randomId) chooseRandom();
    if (next === 'exam' && !examQuestion) newExamQuestion();
  };
  const markCurrent = (status: 'known' | 'review') => {
    if (!current) return;
    if (status === 'known') {
      setKnownIds((ids) => [...new Set([...ids, current.id])]);
      setReviewIds((ids) => ids.filter((id) => id !== current.id));
    } else {
      setReviewIds((ids) => [...new Set([...ids, current.id])]);
      setKnownIds((ids) => ids.filter((id) => id !== current.id));
    }
  };
  const clearCurrentMark = () => {
    if (!current) return;
    setKnownIds((ids) => ids.filter((id) => id !== current.id));
    setReviewIds((ids) => ids.filter((id) => id !== current.id));
  };

  return <main className={`study-shell ${showFurigana ? '' : 'furigana-hidden'}`}>
    <header className="study-header"><div className="brand"><span className="brand-mark">森</span><div><p>JLPT N1</p><h1>Japanese practice</h1></div></div><div className="study-areas"><VocabularyModes mode={mode} onChange={changeMode} /><button className={mode === 'grammar' ? 'area-button active' : 'area-button'} onClick={() => changeMode('grammar')}>Grammar <span>{grammarEntries.length} points</span></button></div><button className="mobile-drawer-toggle" onClick={openDrawer} aria-expanded={drawerOpen} aria-controls="study-drawer">Study menu <span>☰</span></button></header>
    {drawerMounted && <div className={drawerOpen ? 'mobile-drawer open' : 'mobile-drawer'} id="study-drawer"><button className="drawer-backdrop" onClick={closeDrawer} aria-label="Close study menu" /><aside className="drawer-panel" aria-label="Study menu"><div className="drawer-heading"><div><p className="sidebar-label">Study menu</p><strong>{mode === 'grammar' ? 'Browse grammar' : 'Choose your focus'}</strong></div><button onClick={closeDrawer} aria-label="Close study menu">×</button></div><VocabularyModes mode={mode} onChange={changeMode} /><button className={mode === 'grammar' ? 'area-button active drawer-grammar' : 'area-button drawer-grammar'} onClick={() => changeMode('grammar')}>Grammar <span>{grammarEntries.length} points</span></button>{mode === 'grammar' ? <GrammarDrawer entries={grammarEntries} categories={grammarCategories} category={grammarCategory} position={grammarPosition} onCategory={selectGrammarCategory} onPosition={setGrammarPosition} onClose={closeDrawer} /> : <div className="drawer-lessons"><p className="sidebar-label">Lessons</p><div className="lesson-list"><LessonOptions lessons={lessons} verified={verified} known={known} lesson={lesson} onSelect={selectLesson} /></div><p className="sidebar-progress"><b>{known.size}</b> known<br /><span>{review.size} to review</span></p></div>}</aside></div>}
    <div className={`study-layout ${mode === 'study' ? '' : 'focused-mode'} ${mode === 'grammar' ? 'grammar-mode' : ''}`}>
      {mode === 'study' && <aside className="lesson-sidebar"><p className="sidebar-label">Lessons</p><div className="lesson-list"><LessonOptions lessons={lessons} verified={verified} known={known} lesson={lesson} onSelect={selectLesson} /></div><p className="sidebar-progress"><b>{known.size}</b> known<br /><span>{review.size} to review</span></p></aside>}
      <section className="study-stage">
        {(mode === 'study' || mode === 'random') && current && <><div className="stage-meta"><span>{mode === 'study' ? `Lesson ${String(lesson).padStart(2, '0')}` : 'Random review'}</span><span>{mode === 'study' ? `Word ${position + 1} of ${lessonWords.length}` : 'A fresh word from your full set'}</span></div><div className="word-panel"><p className="reading">{current.reading}</p><h2>{current.kanjiOrExpression}</h2><p className={showMeanings ? 'meaning' : 'meaning meaning-hidden'} aria-hidden={!showMeanings}>{current.meanings.slice(0, 4).join(' · ') || 'Meaning pending'}</p><button className="meaning-toggle" onClick={() => setShowMeanings((value) => !value)}>{showMeanings ? 'Hide meaning' : 'Show meaning'}</button></div><Usage examples={current.examples} showEnglish={showEnglish} setShowEnglish={setShowEnglish} showFurigana={showFurigana} setShowFurigana={setShowFurigana} id={current.id} /><RecallActions known={known.has(current.id)} review={review.has(current.id)} onMark={markCurrent} onClear={clearCurrentMark} />{mode === 'study' ? <nav className="word-navigation" aria-label="Vocabulary navigation"><button className="previous" onClick={() => setPosition((value) => Math.max(value - 1, 0))} disabled={position === 0}>← Previous</button><div className="word-dots"><span style={{ width: `${((position + 1) / lessonWords.length) * 100}%` }} /></div><button className="next" onClick={() => setPosition((value) => Math.min(value + 1, lessonWords.length - 1))} disabled={position === lessonWords.length - 1}>Next →</button></nav> : <button className="new-random" onClick={chooseRandom}>Pick another random word</button>}<p className="keyboard-help">{mode === 'study' ? 'Tip: use the left and right arrow keys to move through the lesson.' : 'Random mode keeps the same furigana and translation controls.'}</p></>}
        {mode === 'exam' && examCurrent && examQuestion && <Exam question={examQuestion} record={examCurrent} onSelect={(choice) => setExamQuestion((value) => value ? { ...value, selected: choice } : value)} onNext={newExamQuestion} />}
        {mode === 'grammar' && <GrammarStudy entries={grammarEntries} category={grammarCategory} position={grammarPosition} onCategory={setGrammarCategory} onPosition={setGrammarPosition} />}
      </section>
    </div>
  </main>;
}

function VocabularyModes({ mode, onChange }: { mode: Mode; onChange: (mode: Mode) => void }) {
  return <nav className="mode-switch" aria-label="Vocabulary study mode"><span className="area-label"><i>語彙</i></span><button onClick={() => onChange('study')} className={mode === 'study' ? 'active' : ''}>Lessons</button><button onClick={() => onChange('random')} className={mode === 'random' ? 'active' : ''}>Random</button><button onClick={() => onChange('exam')} className={mode === 'exam' ? 'active' : ''}>Quiz</button></nav>;
}

function LessonOptions({ lessons, verified, known, lesson, onSelect }: { lessons: number[]; verified: RecordItem[]; known: Set<string>; lesson: number; onSelect: (lesson: number) => void }) {
  return <>{lessons.map((item) => { const words = verified.filter((record) => record.day === item); const mastered = words.filter((record) => known.has(record.id)).length; return <button key={item} onClick={() => onSelect(item)} className={lesson === item ? 'lesson active' : 'lesson'}><span>Lesson {String(item).padStart(2, '0')}</span><small>{mastered}/{words.length}</small></button>; })}</>;
}

function GrammarStudy({ entries, category, position, onCategory, onPosition }: { entries: GrammarEntry[]; category: string; position: number; onCategory: (value: string) => void; onPosition: (value: number) => void }) {
  const categoryEntries = useMemo(() => entries.filter((entry) => entry.category === category), [entries, category]);
  const current = categoryEntries[position] ?? categoryEntries[0];
  if (!current) return null;
  return <section className="grammar-study"><div className="grammar-topline"><div><p className="sidebar-label">JLPT N1 grammar</p><h2>Learn the pattern, then notice its nuance.</h2></div><p>{entries.length} source-structured points</p></div><div className="grammar-layout"><aside className="grammar-list" aria-label="Grammar points">{categoryEntries.map((entry, index) => <button key={entry.id} className={index === position ? 'active' : ''} onClick={() => onPosition(index)}><small>{String(index + 1).padStart(2, '0')}</small><span>{entry.title}</span></button>)}</aside><article className="grammar-card"><div className="stage-meta"><span>{category}</span><span>Point {position + 1} of {categoryEntries.length}</span></div><h3>{current.title}</h3><section><p className="sidebar-label">意味</p><p>{current.meaningJapanese}</p></section><section><p className="sidebar-label">接続</p><code>{current.formation}</code></section><section><p className="sidebar-label">似ている文型</p><div className="similar-patterns">{current.similarGrammar.map((item) => <span key={item}>{item}</span>)}</div></section>{current.sourceExamples.length > 0 && <section className="source-examples"><p className="sidebar-label">Source examples</p><ol>{current.sourceExamples.map((example, index) => <li className="grammar-example" key={`${current.id}-${index}`} dangerouslySetInnerHTML={{ __html: example.furigana ?? example.ja }} />)}</ol></section>}<p className="grammar-source">Source: {current.sourceDocument} · Vision OCR text checked against the supplied grammar handout</p><nav className="word-navigation grammar-navigation" aria-label="Grammar navigation"><button className="previous" onClick={() => onPosition(Math.max(position - 1, 0))} disabled={position === 0}>← Previous</button><div className="word-dots"><span style={{ width: `${((position + 1) / categoryEntries.length) * 100}%` }} /></div><button className="next" onClick={() => onPosition(Math.min(position + 1, categoryEntries.length - 1))} disabled={position === categoryEntries.length - 1}>Next →</button></nav></article></div></section>;
}

function GrammarDrawer({ entries, categories, category, position, onCategory, onPosition, onClose }: { entries: GrammarEntry[]; categories: string[]; category: string; position: number; onCategory: (value: string) => void; onPosition: (value: number) => void; onClose: () => void }) {
  const categoryEntries = entries.filter((entry) => entry.category === category);
  return <div className="drawer-lessons grammar-drawer"><p className="sidebar-label">Grammar categories</p><div className="grammar-drawer-categories">{categories.map((item) => <button key={item} className={item === category ? 'active' : ''} onClick={() => onCategory(item)}>{item}<span>{entries.filter((entry) => entry.category === item).length}</span></button>)}</div><p className="sidebar-label">Grammar points</p><div className="lesson-list">{categoryEntries.map((entry, index) => <button key={entry.id} className={index === position ? 'lesson active' : 'lesson'} onClick={() => { onPosition(index); onClose(); }}><span>{entry.title}</span><small>{String(index + 1).padStart(2, '0')}</small></button>)}</div></div>;
}

function Usage({ examples, showEnglish, setShowEnglish, showFurigana, setShowFurigana, id }: { examples: Example[]; showEnglish: boolean; setShowEnglish: (value: boolean | ((value: boolean) => boolean)) => void; showFurigana: boolean; setShowFurigana: (value: boolean | ((value: boolean) => boolean)) => void; id: string }) {
  return <div className="usage-section"><div className="usage-heading"><div><p className="sidebar-label">Real usage</p><h3>Example sentences</h3></div><div className="display-toggles"><button className="translation-toggle" onClick={() => setShowFurigana((value) => !value)}>{showFurigana ? 'Hide furigana' : 'Show furigana'}</button><button className="translation-toggle" onClick={() => setShowEnglish((value) => !value)}>{showEnglish ? 'Hide translations' : 'Show translations'}</button></div></div><div className="examples">{examples.map((example, index) => <article className="example" key={`${id}-${index}`}><span>{index + 1}</span><div><p className="japanese" dangerouslySetInnerHTML={{ __html: example.furigana ?? example.ja }} /><p className={showEnglish ? 'english' : 'english translation-hidden'} aria-hidden={!showEnglish}>{example.en}</p></div></article>)}</div></div>;
}

function RecallActions({ known, review, onMark, onClear }: { known: boolean; review: boolean; onMark: (status: 'known' | 'review') => void; onClear: () => void }) {
  return <div className="recall-actions"><div><p className="sidebar-label">Your recall</p><strong>{known ? 'Marked known' : review ? 'Marked for review' : 'Not marked yet'}</strong></div><div className="recall-buttons"><button className="review-button" onClick={() => onMark('review')}>Review again</button><button className="know-button" onClick={() => onMark('known')}>I know this</button><button className={known || review ? 'clear-mark' : 'clear-mark clear-mark-hidden'} onClick={onClear} aria-hidden={!known && !review} tabIndex={known || review ? 0 : -1}>Clear</button></div></div>;
}

function Exam({ question, record, onSelect, onNext }: { question: ExamQuestion; record: RecordItem; onSelect: (choice: string) => void; onNext: () => void }) {
  const correct = record.meanings[0] ?? '';
  const answered = question.selected !== null;
  return <div className="exam-card">
    <div className="stage-meta"><span>Quiz</span><span>Multiple choice · 4 options</span></div>
    <p className="sidebar-label">Choose the closest meaning</p>
    <h2>{record.kanjiOrExpression}</h2>
    <p className="quiz-reference">From Lesson {String(record.day).padStart(2, '0')} · Word {record.printedNumber}</p>
    <div className="exam-options">{question.options.map((option, index) => {
      const selected = question.selected === option;
      const state = answered ? (option === correct ? 'correct' : selected ? 'incorrect' : '') : '';
      return <button key={option} className={state} disabled={answered} onClick={() => onSelect(option)}><span>{String.fromCharCode(65 + index)}</span>{option}</button>;
    })}</div>
    <div className={answered ? 'exam-result' : 'exam-result exam-result-hidden'} aria-live="polite"><strong>{question.selected === correct ? 'Correct' : `Answer: ${correct}`}</strong><p>{record.meanings.slice(0, 4).join(' · ')}</p><button className="new-random" onClick={onNext} tabIndex={answered ? 0 : -1}>Next question</button></div>
  </div>;
}
