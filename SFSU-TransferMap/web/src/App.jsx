import React, { useState } from 'react';
import { AlertTriangle, CheckCircle2, CircleAlert, FileText, Link2, Upload } from 'lucide-react';
import { analyze, share, API } from './api';

const statusLabel = { done: 'Completed', missing: 'Missing', review: 'Review', no_articulation: 'Take at SFSU' };

export default function App() {
  const [file, setFile] = useState(null);
  const [startTerm, setStartTerm] = useState('Fall 2027');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [shareUrl, setShareUrl] = useState('');

  async function submit(event) {
    event.preventDefault();
    if (!file) return setError('Choose a transcript PDF or photo first.');
    setLoading(true); setError(''); setShareUrl('');
    try { setResult(await analyze(file, startTerm)); }
    catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }

  async function createShareLink() {
    try {
      const response = await share(result);
      setShareUrl(`${API}/plans/${response.id}`);
    } catch (err) { setError(err.message); }
  }

  return <main>
    <header><div className="eyebrow">SFSU TransferMap</div><h1>Know what counts before you transfer.</h1><p>CCSF → San Francisco State University · Computer Science B.S.</p></header>
    <section className="card upload-card">
      <form onSubmit={submit}>
        <label className="dropzone"><Upload size={28}/><strong>{file ? file.name : 'Upload your transcript'}</strong><span>PDF or phone photo · 10 MB maximum</span><input type="file" accept="application/pdf,image/*" onChange={event => setFile(event.target.files?.[0] || null)}/></label>
        <div className="controls"><label>Planning start term<select value={startTerm} onChange={event => setStartTerm(event.target.value)}><option>Fall 2027</option><option>Spring 2028</option><option>Fall 2028</option></select></label><button disabled={loading || !file}>{loading ? 'Analyzing…' : 'Analyze transcript'}</button></div>
      </form>
      {error && <p className="error"><CircleAlert size={17}/> {error}</p>}
    </section>
    {result && <Results result={result} onShare={createShareLink} shareUrl={shareUrl}/>} 
    <footer><AlertTriangle size={16}/> Not official advising. Confirm your plan with an SFSU or CCSF counselor.</footer>
  </main>;
}

function Results({ result, onShare, shareUrl }) {
  return <section className="results">
    <div className="result-heading"><div><div className="eyebrow">Your pathway</div><h2>Transfer readiness</h2></div><button className="secondary" onClick={onShare}><Link2 size={16}/> Share with counselor</button></div>
    {shareUrl && <p className="share">Share link: <a href={shareUrl}>{shareUrl}</a></p>}
    <div className="stats">{[['Courses found', result.summary.courses_found], ['Completed', result.summary.done], ['Missing', result.summary.missing], ['Review', result.summary.review], ['Take at SFSU', result.summary.take_at_sfsu], ['Units at risk', result.summary.units_at_risk]].map(([label, value]) => <div className="stat" key={label}><strong>{value}</strong><span>{label}</span></div>)}</div>
    <div className="grid"><div className="card"><h3>Course requirements</h3><div className="requirements">{result.requirements.map(item => <div className="requirement" key={item.id}><div><strong>{item.sfsu_course}</strong><span>{item.sfsu_title}</span>{item.matched_with?.length > 0 && <small>Matched: {item.matched_with.join(', ')}</small>}{item.note && <small>{item.note}</small>}</div><span className={`badge ${item.status}`}>{item.status === 'done' ? <CheckCircle2 size={15}/> : <CircleAlert size={15}/>} {statusLabel[item.status]}</span></div>)}</div></div><div className="card"><h3>Plan from {result.plan[0]?.term || 'your start term'}</h3>{result.plan.length ? result.plan.map(term => <div className="term" key={term.term}><div className="term-title"><strong>{term.term}</strong><span>{term.units} units</span></div>{term.courses.map(course => <div className="planned" key={course.code}><strong>{course.code}</strong><span>{course.title}</span><small>{course.why}</small></div>)}</div>) : <p>No plan could be generated from the remaining requirements.</p>}</div></div>
    {result.warnings?.length > 0 && <div className="warnings"><h3>Important notes</h3>{result.warnings.map((warning, index) => <p key={index}><AlertTriangle size={16}/>{warning}</p>)}</div>}
  </section>;
}
