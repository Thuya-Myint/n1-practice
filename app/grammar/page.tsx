import studyData from '@/data/vocab-final-study.json';
import grammarData from '@/data/grammar-study.json';
import StudyDashboard from '@/components/StudyDashboard';

export default function GrammarPage() {
  return <StudyDashboard records={studyData.records} grammarEntries={grammarData.entries} initialMode="grammar" />;
}
