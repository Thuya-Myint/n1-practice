import studyData from '@/data/vocab-final-study.json';
import StudyDashboard from '@/components/StudyDashboard';

export default function Home() {
  return <StudyDashboard records={studyData.records} />;
}
