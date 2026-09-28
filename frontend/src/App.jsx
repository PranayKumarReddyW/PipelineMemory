import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Overview from './components/Overview';
import Timeline from './components/Timeline';
import RiskPredictor from './components/RiskPredictor';
import LearnedPatterns from './components/LearnedPatterns';
import ServiceGraph from './components/ServiceGraph';
import AskAgent from './components/AskAgent';

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Overview />} />
        <Route path="/timeline" element={<Timeline />} />
        <Route path="/predict" element={<RiskPredictor />} />
        <Route path="/patterns" element={<LearnedPatterns />} />
        <Route path="/graph" element={<ServiceGraph />} />
        <Route path="/ask" element={<AskAgent />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}
