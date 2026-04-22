import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { setCookie, getCookie } from '../telemetry';
import PageTransition from './PageTransition';
import { useOfflineSync } from '../useOfflineSync';

export default function Ghost() {
  const navigate = useNavigate();
  const [currentUserEmail, setCurrentUserEmail] = useState('');

  // --- STANDARD STATE ---
  const [projects, setProjects] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  // --- NEW: LIVE AI CALCULATION STATE ---
  const [liveGhostTasks, setLiveGhostTasks] = useState([]);
  const [isCalculatingAI, setIsCalculatingAI] = useState(false);

  const { isOnline, queueAction, realtimePayload } = useOfflineSync(currentUserEmail);

  // 1. BOOT SEQUENCE: FETCH ALL DATA FROM NODE.JS REST API
  useEffect(() => {
    const email = localStorage.getItem('loggedInUserEmail');
    if (!email) {
      navigate('/login');
      return;
    }
    setCurrentUserEmail(email);

    // Telemetry
    const history = getCookie('userActivityHistory') || [];
    history.push({ page: '/ghost', time: new Date().toISOString() });
    if (history.length > 10) history.shift();
    setCookie('userActivityHistory', history, 1);

    const fetchData = async () => {
      try {
        const response = await fetch('http://localhost:3000/graphql', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: `
              query GetGhostData($email: String!) {
                projectsByUser(email: $email) { id title }
                tasksByUser(email: $email) { id projectId title tags status completed predicted start end }
              }
            `,
            variables: { email }
          })
        });

        const json = await response.json();
        
        if (json.data) {
          const projData = json.data.projectsByUser || [];
          const taskData = json.data.tasksByUser || [];
          
          setProjects(projData);
          setTasks(taskData);
          
          if (projData.length > 0) {
            setSelectedProjectId(projData[0].id);
          }
        }
      } catch (error) {
        console.error("> SYSTEM ERROR:", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, [navigate]);

  // 2. LIVE AI BATCH PROCESSING: TRIGGERED WHEN PROJECT CHANGES
  useEffect(() => {
    const fetchLiveAIPredictions = async () => {
      if (!selectedProjectId || tasks.length === 0) {
        setLiveGhostTasks([]);
        return;
      }

      setIsCalculatingAI(true); // Turn on the "Thinking" UI

      // Filter tasks down to just the selected project
      const currentProjectTasks = tasks.filter(t => parseInt(t.projectId) === parseInt(selectedProjectId));

      if (currentProjectTasks.length === 0) {
        setLiveGhostTasks([]);
        setIsCalculatingAI(false);
        return;
      }

      // Send every task to the AI Microservice concurrently!
      const tasksWithLiveAI = await Promise.all(currentProjectTasks.map(async (task) => {
        const tagsString = Array.isArray(task.tags) ? task.tags.join('|') : (task.tags || '');
        const combinedData = `${task.title || task.name} | ${tagsString}`;
        
        let freshPrediction = parseFloat(task.predicted) || 0; // Fallback to DB if AI fails

        if (combinedData.trim() && combinedData !== " | ") {
          try {
            const aiResponse = await fetch('http://localhost:5000/api/predict', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ tags: combinedData })
            });
            
            if (aiResponse.ok) {
              const aiData = await aiResponse.json();
              freshPrediction = aiData.estimated_hours; // LIVE OVERRIDE!
            }
          } catch (error) {
            console.warn(`> AI Failed for task [${task.id}], using database fallback.`);
          }
        }

        return { ...task, livePredicted: freshPrediction };
      }));

      setLiveGhostTasks(tasksWithLiveAI);
      setIsCalculatingAI(false); // Turn off the "Thinking" UI
    };

    fetchLiveAIPredictions();
  }, [selectedProjectId, tasks]);

  // --- NEW AI-POWERED GHOST MATH ---
  let ghostPercentage = 0;
  let teamPercentage = 0;
  let aiEstimatedDays = 0;
  let elapsedDays = 0;
  
  let daysText = "0 / 0";
  let hoursText = "0 / 0";
  let hasAIPredictions = false;

  if (liveGhostTasks.length > 0 && !isCalculatingAI) {
    const totalPredictedHours = liveGhostTasks.reduce((sum, t) => sum + (parseFloat(t.livePredicted) || 0), 0);
    
    if (totalPredictedHours > 0) {
      hasAIPredictions = true;

      aiEstimatedDays = Math.max(1, Math.ceil(totalPredictedHours / 8));

      const completedHours = liveGhostTasks
        .filter(t => t.status === 'completed' || t.completed === true)
        .reduce((sum, t) => sum + (parseFloat(t.livePredicted) || 0), 0);
      
      teamPercentage = Math.round((completedHours / totalPredictedHours) * 100);
      hoursText = `${completedHours} / ${totalPredictedHours}`;

      const startDates = liveGhostTasks.map(t => new Date(t.start || t.createdAt || Date.now()).getTime());
      const minStart = Math.min(...startDates);
      const now = Date.now();

      if (now < minStart) {
        elapsedDays = 0;
      } else {
        elapsedDays = Math.floor((now - minStart) / (1000 * 60 * 60 * 24));
      }
      
      ghostPercentage = Math.round((elapsedDays / aiEstimatedDays) * 100);
      if (ghostPercentage > 100) ghostPercentage = 100; // Cap at 100%
      
      daysText = `${elapsedDays} / ${aiEstimatedDays}`;
    }
  }

  const isBehind = teamPercentage < ghostPercentage;
  const velocityDiff = Math.abs(ghostPercentage - teamPercentage);

  // --- RENDER BLOCK ---
  if (isLoading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', backgroundColor: '#050505', color: '#00FF41', fontFamily: "'Courier New', Courier, monospace" }}>
        <h2>&gt; Booting Master Database..._</h2>
      </div>
    );
  }

  return (
    <PageTransition>
      <div style={{ 
        minHeight: '100vh', 
        backgroundColor: '#050505', 
        color: '#00FF41', 
        fontFamily: "'Courier New', Courier, monospace",
        display: 'flex', 
        flexDirection: 'column',
        backgroundImage: 'linear-gradient(rgba(0, 255, 65, 0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(0, 255, 65, 0.02) 1px, transparent 1px)',
        backgroundSize: '40px 40px'
      }}>
        
        <style>{`
          @keyframes pulse { 0% { opacity: 0.6; } 50% { opacity: 1; border-right-color: #fff; } 100% { opacity: 0.6; } }
          
          /* Extra media query just to handle small font sizes on mobile if needed */
          @media (max-width: 600px) {
            .mobile-stack { flex-direction: column !important; align-items: flex-start !important; gap: 10px; }
            .mobile-text { font-size: 18px !important; }
          }
        `}</style>

        {/* --- RESPONSIVE NAVIGATION --- */}
        <nav style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', padding: 'clamp(10px, 3vw, 15px) clamp(15px, 5vw, 30px)', backgroundColor: '#0a0a0a', borderBottom: '1px solid #1f1f1f', gap: '15px' }}>
          <div style={{ fontWeight: 'bold', fontSize: '20px' }}>~/ProjectUi
            <div style={{ color: isOnline ? '#00FF41' : '#ff3333' }}>
             [{isOnline ? 'NETWORK: ONLINE' : 'NETWORK: OFFLINE'}]
            </div>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'clamp(10px, 2vw, 20px)' }}>
            <span onClick={() => navigate('/home')} style={{ color: '#888', fontWeight: 'bold', cursor: 'pointer' }}>Home</span>
            <span onClick={() => navigate('/workspace')} style={{ color: '#888', fontWeight: 'bold', cursor: 'pointer' }}>Workspace</span>
            <span onClick={() => navigate('/statistics')} style={{ color: '#888', fontWeight: 'bold', cursor: 'pointer' }}>Statistics</span>
            <span style={{ color: '#00FF41', fontWeight: 'bold', cursor: 'pointer' }}>Ghost</span>
            <span onClick={() => { localStorage.removeItem('loggedInUserEmail'); navigate('/login'); }} style={{ color: '#888', fontWeight: 'bold', cursor: 'pointer' }}>Logout</span>
          </div>
        </nav>

        {/* --- RESPONSIVE MAIN CONTAINER --- */}
        <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 'clamp(15px, 5vw, 40px)', boxSizing: 'border-box' }}>
          
          {/* --- RESPONSIVE CARD --- */}
          <div style={{ backgroundColor: '#0a0a0a', border: '1px solid #00FF41', width: '100%', maxWidth: '800px', padding: 'clamp(20px, 5vw, 40px)', boxShadow: '0 0 40px rgba(0, 255, 65, 0.1)' }}>
            
            <div className="mobile-stack" style={{ marginBottom: '20px', display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ color: '#888', fontSize: '14px' }}>TARGET_PROJECT:</span>
              <select 
                value={selectedProjectId || ''} 
                onChange={(e) => setSelectedProjectId(e.target.value)}
                style={{ background: '#050505', border: '1px solid #1f1f1f', color: '#00FF41', padding: '8px 10px', fontFamily: 'inherit', outline: 'none', maxWidth: '100%', boxSizing: 'border-box' }}
              >
                {projects.map(p => <option key={p.id} value={p.id}>[{p.id}] {p.title}</option>)}
              </select>
            </div>

            <div className="mobile-stack" style={{ borderBottom: '1px dashed #1f1f1f', paddingBottom: '20px', marginBottom: '30px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div>
                <h2 className="mobile-text" style={{ margin: 0, color: '#fff', fontSize: 'clamp(20px, 5vw, 24px)', textTransform: 'uppercase', letterSpacing: '1px' }}>AI Ghost Pacer</h2>
                <div style={{ color: '#888', fontSize: '14px', marginTop: '5px' }}>NEURAL VELOCITY TRACKING [LIVE]</div>
              </div>
            </div>

            {isCalculatingAI ? (
              <div style={{ color: '#00FF41', textAlign: 'center', padding: 'clamp(30px, 8vw, 60px) 20px', border: '1px dashed #00FF41', animation: 'pulse 1.5s infinite' }}>
                &gt; PINGING NEURAL NETWORK FOR LIVE PREDICTIONS...<br/>
                <span style={{ color: '#888', fontSize: '12px' }}>Fetching batch estimates from port 5000</span>
              </div>
            ) : liveGhostTasks.length === 0 ? (
              <div style={{ color: '#888', textAlign: 'center', padding: '40px 10px' }}>
                [NO TASKS FOUND FOR THIS PROJECT. INITIALIZE TASKS TO ACTIVATE GHOST.]
              </div>
            ) : !hasAIPredictions ? (
              <div style={{ color: '#ff3333', textAlign: 'center', padding: '40px 10px', border: '1px dashed #ff3333' }}>
                [AI RETURNED 0 HOURS. PLEASE ENSURE TASKS HAVE VALID TITLES OR TAGS.]
              </div>
            ) : (
              <>
                {/* --- RESPONSIVE AUTO-FIT GRID --- */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px', marginBottom: '40px' }}>
                  <div style={{ border: '1px solid #1f1f1f', padding: '15px', background: '#050505' }}>
                    <div style={{ color: '#888', fontSize: '12px', marginBottom: '5px' }}>AI EXPECTED TIMELINE (GHOST)</div>
                    <div style={{ fontSize: 'clamp(16px, 4vw, 20px)', fontWeight: 'bold', color: '#888' }}>DAY {daysText} ({ghostPercentage}%)</div>
                  </div>
                  <div style={{ border: '1px solid #1f1f1f', padding: '15px', background: '#050505' }}>
                    <div style={{ color: '#888', fontSize: '12px', marginBottom: '5px' }}>COMPLETED AI HOURS (TEAM)</div>
                    <div style={{ fontSize: 'clamp(16px, 4vw, 20px)', fontWeight: 'bold', color: '#00FF41' }}>{hoursText} HOURS ({teamPercentage}%)</div>
                  </div>
                </div>

                <div style={{ marginBottom: '30px' }}>
                  <div className="mobile-stack" style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', fontSize: '12px', marginBottom: '10px', color: '#888' }}>
                    <span>PROJECT INITIATION</span>
                    <span>AI LAUNCH DATE ({aiEstimatedDays} DAYS)</span>
                  </div>
                  
                  <div style={{ height: '40px', backgroundColor: '#050505', border: '1px solid #1f1f1f', position: 'relative', overflow: 'hidden' }}>
                    <div style={{ 
                      position: 'absolute', top: 0, left: 0, height: '100%', width: `${ghostPercentage}%`, 
                      borderRight: '3px dashed #00FF41', backgroundColor: 'rgba(0, 255, 65, 0.05)', 
                      zIndex: 1, animation: 'pulse 2s infinite', transition: 'width 1s ease-in-out'
                    }}></div>
                    
                    <div style={{ 
                      position: 'absolute', top: '5px', left: '5px', height: '30px', 
                      width: `calc(${teamPercentage}% - 10px)`, minWidth: '40px', backgroundColor: '#00FF41', 
                      boxShadow: '0 0 15px rgba(0, 255, 65, 0.4)', zIndex: 2, 
                      display: 'flex', alignItems: 'center', justifyContent: 'flex-end', 
                      paddingRight: '10px', color: '#050505', fontWeight: 'bold', fontSize: '12px', boxSizing: 'border-box',
                      transition: 'width 1s ease-in-out'
                    }}>
                      {teamPercentage}%
                    </div>
                  </div>
                </div>

                {isBehind ? (
                  <div style={{ fontSize: '14px', padding: '15px', background: 'rgba(255, 51, 51, 0.05)', borderLeft: '4px solid #ff3333', color: '#ff3333', marginBottom: '30px', textShadow: '0 0 5px rgba(255, 51, 51, 0.3)', lineHeight: 1.5 }}>
                    &gt; MACRO-LEVEL WARNING: VELOCITY IS {velocityDiff}% BEHIND LIVE AI PREDICTIONS.<br />
                    &gt; RECOMMENDATION: RE-ALLOCATE RESOURCES OR EXTEND DEADLINES.
                  </div>
                ) : (
                  <div style={{ fontSize: '14px', padding: '15px', background: 'rgba(0, 255, 65, 0.05)', borderLeft: '4px solid #00FF41', color: '#00FF41', marginBottom: '30px', lineHeight: 1.5 }}>
                    &gt; SYSTEM LOG: TEAM VELOCITY IS OPTIMAL.<br />
                    &gt; TEAM IS PACING {velocityDiff}% AHEAD OF THE AI GHOST.
                  </div>
                )}

                <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap' }}>
                  <button onClick={() => navigate('/workspace')} style={{ width: '100%', background: 'transparent', border: '1px solid #00FF41', color: '#00FF41', padding: '12px 20px', fontFamily: 'inherit', fontSize: '14px', cursor: 'pointer', textTransform: 'uppercase', transition: 'all 0.3s', fontWeight: 'bold', flex: 1, textAlign: 'center' }} onMouseOver={(e) => {e.target.style.background='#00FF41'; e.target.style.color='#050505'}} onMouseOut={(e) => {e.target.style.background='transparent'; e.target.style.color='#00FF41'}}>
                    Return to Workspace
                  </button>
                </div>
              </>
            )}

          </div>
        </div>
      </div>
    </PageTransition>
  );
}