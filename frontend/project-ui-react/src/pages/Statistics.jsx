import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Chart as ChartJS, ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, Title } from 'chart.js';
import { Pie, Bar } from 'react-chartjs-2';
import { setCookie, getCookie } from '../telemetry'; 
import PageTransition from './PageTransition';
import { useOfflineSync } from '../useOfflineSync'

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, Title);
ChartJS.defaults.color = '#888';
ChartJS.defaults.font.family = "'Courier New', Courier, monospace";

const formatDateForInput = (rawDate) => {
  if (!rawDate) return '';
  if (typeof rawDate === 'string' && rawDate.match(/^\d{4}-\d{2}-\d{2}$/)) return rawDate;
  const d = new Date(rawDate);
  if (isNaN(d.getTime())) return '';
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export default function Statistics() { 
  const navigate = useNavigate();
  const [currentUserEmail, setCurrentUserEmail] = useState('');

  const [chartType, setChartType] = useState(() => getCookie('preferredChartType') || 'pie');
  const [tasks, setTasks] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const [isInspectorOpen, setIsInspectorOpen] = useState(false);
  const [isPredicting, setIsPredicting] = useState(false);
  const [inspectorData, setInspectorData] = useState({ 
    id: null, projectId: '', title: '', description: '', tags: '', begin: '', deadline: '', predicted: '', completed: false 
  });

  const { isOnline, queueAction, realtimePayload } = useOfflineSync(currentUserEmail);

  // --- NEW: WEBSOCKET LISTENER FOR AUTO-UPDATE ---
  useEffect(() => {
    if (realtimePayload) {
      // 1. FILTER: Only accept data that belongs to the currently logged-in user!
      const myProjects = (realtimePayload.projects || []).filter(p => p.creatorEmail === currentUserEmail);
      const myTasks = (realtimePayload.tasks || []).filter(t => t.creatorEmail === currentUserEmail);

      // 2. Append filtered Projects
      if (myProjects.length > 0 && typeof setProjects === 'function') {
        setProjects(prev => {
          const newProjects = myProjects.filter(np => !prev.some(p => p.id === np.id));
          return [...newProjects, ...prev];
        });
      }
      
      // 3. Append filtered Tasks
      if (myTasks.length > 0) {
        setTasks(prev => {
          const newTasks = myTasks.filter(nt => !prev.some(t => t.id === nt.id));
          return [...newTasks, ...prev];
        });
      }
    }
  }, [realtimePayload, currentUserEmail]); 

  useEffect(() => {
    const email = localStorage.getItem('loggedInUserEmail');
    if (!email) {
      navigate('/login');
      return;
    }
    setCurrentUserEmail(email);

    const history = getCookie('userActivityHistory') || [];
    history.push({ page: '/statistics', time: new Date().toISOString() });
    if (history.length > 10) history.shift();
    setCookie('userActivityHistory', history, 1);

    const fetchStats = async () => {
      try {
        const response = await fetch('http://localhost:3000/graphql', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: `
              query GetStatsTasks($email: String!) { 
                tasksByUser(email: $email) { 
                  id projectId title description tags status completed predicted start end 
                } 
              }
            `,
            variables: { email }
          })
        });
        const json = await response.json();
        
        if (json.errors) throw new Error(json.errors[0].message);
        
        if (json.data) { 
          setTasks(json.data.tasksByUser || []); 
        }
      } catch (error) { 
        console.error("> SYSTEM ERROR fetching stats:", error.message); 
      } finally { 
        setIsLoading(false); 
      }
    };
    fetchStats();
  }, [navigate]);

  const openInspector = (task = null) => {
    if (task) {
      setInspectorData({
        id: task.id, projectId: task.projectId || '', title: task.title || task.name || '', description: task.description || task.desc || '',
        tags: task.tags ? (Array.isArray(task.tags) ? task.tags.join(' | ') : task.tags) : '',
        begin: formatDateForInput(task.start), deadline: formatDateForInput(task.end),
        predicted: task.predicted || '', completed: task.completed || task.status === 'completed'
      });
    } else {
      setInspectorData({
        id: null, projectId: '', title: '', description: '', tags: '',
        begin: formatDateForInput(new Date()), deadline: formatDateForInput(new Date(Date.now() + 86400000)),
        predicted: '', completed: false
      });
    }
    setIsInspectorOpen(true);
  };

  const handleAIPredict = async () => {
    const combinedData = `${inspectorData.title} | ${inspectorData.tags}`;
    if (!combinedData.trim() || combinedData === " | ") { alert("Please enter a Task Name and some Tags first!"); return; }
    setIsPredicting(true);
    try {
        const response = await fetch('http://localhost:5000/api/predict', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tags: combinedData }) });
        if (response.ok) {
            const data = await response.json();
            setInspectorData({ ...inspectorData, predicted: data.estimated_hours });
        } else { alert("AI Microservice failed to respond."); }
    } catch (error) {
        console.error("> AI PREDICTION ERROR:", error);
        alert("Could not connect to AI. Ensure 'ai_microservice.py' is running on port 5000.");
    } finally { setIsPredicting(false); }
  };

  const handleSaveEntity = async () => {
    if (!inspectorData.title.trim()) { alert("Task name is required."); return; }
    const isNew = !inspectorData.id;
    
    const uiPayload = {
      id: isNew ? Date.now() : inspectorData.id, projectId: parseInt(inspectorData.projectId) || 0,
      title: inspectorData.title, description: inspectorData.description, creatorEmail: currentUserEmail,
      status: inspectorData.completed ? 'completed' : 'pending', completed: inspectorData.completed,
      tags: inspectorData.tags.split('|').map(s => s.trim()).filter(Boolean),
      start: inspectorData.begin, end: inspectorData.deadline, predicted: parseFloat(inspectorData.predicted) || 0
    };

    if (isNew) setTasks([...tasks, uiPayload]);
    else setTasks(tasks.map(t => t.id === uiPayload.id ? { ...t, ...uiPayload } : t));
    setIsInspectorOpen(false); 

    const gqlPayload = {
      query: isNew ? `
        mutation CreateTask($projectId: Int!, $title: String!, $description: String!, $creatorEmail: String!, $status: String!, $completed: Boolean!, $tags: [String!]!, $end: String!, $predicted: Float!) {
          createTask(projectId: $projectId, title: $title, description: $description, creatorEmail: $creatorEmail, status: $status, completed: $completed, tags: $tags, end: $end, predicted: $predicted) { id }
        }
      ` : `
        mutation UpdateTask($id: ID!, $projectId: Int, $title: String, $description: String, $status: String, $completed: Boolean, $tags: [String!], $end: String, $predicted: Float) {
          updateTask(id: $id, projectId: $projectId, title: $title, description: $description, status: $status, completed: $completed, tags: $tags, end: $end, predicted: $predicted) { id }
        }
      `,
      variables: { ...uiPayload, id: uiPayload.id.toString() }
    };

    try {
      await fetch('http://localhost:3000/graphql', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(gqlPayload) });
    } catch (err) { console.error("> ERROR saving via inspector:", err); }
  };

  const handleDeleteEntity = async () => {
    if (!inspectorData.id) return;
    if (window.confirm("Remove Task?")) {
      setTasks(tasks.filter(t => t.id !== inspectorData.id));
      setIsInspectorOpen(false);
      try { 
        await fetch('http://localhost:3000/graphql', { 
          method: 'POST', headers: { 'Content-Type': 'application/json' }, 
          body: JSON.stringify({
            query: `mutation DeleteTask($id: ID!) { deleteTask(id: $id) }`,
            variables: { id: inspectorData.id.toString() }
          }) 
        }); 
      } 
      catch (err) { console.error("> ERROR deleting task:", err); }
    }
  };

  const handleChartChange = (type) => {
    setChartType(type);
    setCookie('preferredChartType', type, 30);
  };

  const dateNow = new Date();
  const finishedTasks = tasks.filter(t => t.status === "completed" || t.completed === true).length;
  const pendingTasks = tasks.filter(t => (t.status === "pending" || !t.completed) && new Date(t.end) >= dateNow).length;
  const exceededTimeTasks = tasks.filter(t => (t.status === "pending" || !t.completed) && new Date(t.end) < dateNow).length;

  const chartData = {
    labels: ['Finished', 'Pending', 'Exceeded Deadline'],
    datasets: [{
      label: ' Tasks', data: [finishedTasks, pendingTasks, exceededTimeTasks],
      backgroundColor: ['rgba(0, 255, 65, 0.2)', 'rgba(136, 136, 136, 0.2)', 'rgba(255, 51, 51, 0.2)'],
      borderColor: ['#00FF41', '#888888', '#ff3333'], borderWidth: 2, 
      offset: chartType === 'pie' ? 10 : 0, hoverOffset: chartType === 'pie' ? 20 : 0 
    }]
  };

  if (isLoading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', backgroundColor: '#000', color: 'var(--neon-green)' }}>
        <h2>&gt; Loading parallel components..._</h2>
      </div>
    );
  }

  return (
    <PageTransition>
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      
      {/* RESPONSIVE NAV */}
      <nav style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', padding: 'clamp(10px, 3vw, 15px) clamp(15px, 5vw, 30px)', backgroundColor: 'var(--bg-panel)', borderBottom: '1px solid var(--border-dark)', gap: '15px' }}>
        <div style={{ fontWeight: 'bold', fontSize: '20px' }}>~/ProjectUi
          <div style={{ color: isOnline ? '#00FF41' : '#ff3333' }}>
             [{isOnline ? 'NETWORK: ONLINE' : 'NETWORK: OFFLINE'}]
          </div>
        </div>
        
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'clamp(10px, 2vw, 20px)' }}>
          <span onClick={() => navigate('/home')} style={{ color: 'var(--text-muted)', fontWeight: 'bold', cursor: 'pointer' }}>Home</span>
          <span onClick={() => navigate('/workspace')} style={{ color: 'var(--text-muted)', fontWeight: 'bold', cursor: 'pointer' }}>Workspace</span>
          <span style={{ color: 'var(--neon-green)', fontWeight: 'bold', cursor: 'pointer' }}>Statistics</span>
          <span onClick={() => navigate('/ghost')} style={{ color: 'var(--text-muted)', fontWeight: 'bold', cursor: 'pointer' }}>Ghost</span>
          <span onClick={() => { localStorage.removeItem('loggedInUserEmail'); navigate('/login'); }} style={{ color: 'var(--text-muted)', fontWeight: 'bold', cursor: 'pointer' }}>Logout</span>
        </div>
      </nav>

      <div style={{ padding: 'clamp(15px, 5vw, 40px)', margin: '0 auto', width: '100%', maxWidth: '1400px', boxSizing: 'border-box', flex: 1, overflowX: 'hidden' }}>
        <h1 style={{ color: '#fff', borderBottom: '1px dashed var(--border-dark)', paddingBottom: '10px', marginTop: 0, fontSize: 'clamp(24px, 5vw, 32px)' }}>
          &gt; Parallel Statistics <span style={{ color: 'var(--text-muted)' }}>[Master / Observer]</span>
        </h1>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '15px', marginBottom: '30px' }}>
          <button onClick={() => handleChartChange('pie')} className={`btn ${chartType === 'pie' ? '' : 'btn-danger'}`} style={{ background: chartType === 'pie' ? 'var(--neon-green)' : '#222', color: chartType === 'pie' ? '#000' : '#888', flex: '1 1 auto' }}>Pie Chart</button>
          <button onClick={() => handleChartChange('bar')} className={`btn ${chartType === 'bar' ? '' : 'btn-danger'}`} style={{ background: chartType === 'bar' ? 'var(--neon-green)' : '#222', color: chartType === 'bar' ? '#000' : '#888', flex: '1 1 auto' }}>Bar Chart</button>
        </div>

        {/* --- THE RESPONSIVE PARALLEL GRID --- */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 'clamp(20px, 4vw, 40px)', alignItems: 'start' }}>
          
          {/* LEFT: TABULAR VIEW (MASTER) */}
          <div style={{ background: 'var(--bg-panel)', padding: 'clamp(15px, 3vw, 25px)', border: '1px solid var(--border-dark)' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', gap: '10px' }}>
              <h2 style={{ color: 'var(--text-muted)', margin: 0, fontSize: '16px' }}>TABULAR VIEW (MASTER)</h2>
              <button onClick={() => openInspector()} className="btn btn-sm" style={{ flex: '0 0 auto' }}>+ Add New Task</button>
            </div>

            <div style={{ maxHeight: '400px', overflowY: 'auto', overflowX: 'auto' }}>
              <table style={{ width: '100%', minWidth: '400px', borderCollapse: 'collapse', color: '#fff' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', padding: '10px', borderBottom: '1px solid var(--border-dark)' }}>Title</th>
                    <th style={{ textAlign: 'left', padding: '10px', borderBottom: '1px solid var(--border-dark)' }}>Status</th>
                    <th style={{ textAlign: 'right', padding: '10px', borderBottom: '1px solid var(--border-dark)' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {tasks.map(t => {
                    const isExceeded = (t.status !== 'completed' && !t.completed) && new Date(t.end) < dateNow;
                    let displayStatus = t.status.toUpperCase();
                    let statusColor = '#888';

                    if (t.status === 'completed' || t.completed) {
                      statusColor = '#00FF41'; displayStatus = 'COMPLETED';
                    } else if (isExceeded) {
                      displayStatus = 'EXCEEDED'; statusColor = '#ff3333';
                    }

                    return (
                      <tr key={t.id} style={{ borderBottom: '1px solid #222' }}>
                        <td style={{ padding: '10px', color: (t.status === 'completed' || t.completed) ? '#555' : '#fff', textDecoration: (t.status === 'completed' || t.completed) ? 'line-through' : 'none' }}>
                          {t.title || t.name}
                        </td>
                        <td style={{ padding: '10px' }}>
                          <span style={{ color: statusColor, fontSize: '12px', fontWeight: isExceeded ? 'bold' : 'normal'}}>
                            {displayStatus}
                          </span>
                        </td>
                        <td style={{ padding: '10px', textAlign: 'right' }}>
                          <button onClick={() => openInspector(t)} className="btn btn-sm" style={{ background: '#333' }}>
                            Inspect Data
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {tasks.length === 0 && (
                    <tr><td colSpan="3" style={{ padding: '20px', textAlign: 'center', color: '#888' }}>No tasks found in database.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* RIGHT: CHART VIEW (OBSERVER) */}
          <div style={{ background: 'var(--bg-panel)', padding: 'clamp(15px, 3vw, 25px)', border: '1px solid var(--border-dark)', minHeight: '400px', display: 'flex', flexDirection: 'column' }}>
            <h2 style={{ color: 'var(--text-muted)', marginTop: 0, fontSize: '16px' }}>CHART VIEW (OBSERVER)</h2>
            <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', position: 'relative', minHeight: '300px' }}>
              {chartType === 'pie' ? (
                <Pie data={chartData} options={{ responsive: true, maintainAspectRatio: false }} />
              ) : (
                <Bar data={chartData} options={{ responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, ticks: { stepSize: 1, color: '#888' } }, x: { ticks: { color: '#888' } } } }} />
              )}
            </div>
          </div>

        </div>
      </div>

      {/* --- RESPONSIVE INSPECTOR MODAL --- */}
      {isInspectorOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(5, 5, 5, 0.9)', zIndex: 1000, display: 'flex', justifyContent: 'center', alignItems: 'center', backdropFilter: 'blur(5px)', padding: '15px', boxSizing: 'border-box' }}>
          <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--neon-green)', padding: 'clamp(20px, 5vw, 30px)', width: '100%', maxWidth: '600px', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 0 30px rgba(0, 255, 65, 0.1)', boxSizing: 'border-box' }}>
            <h2 style={{ marginTop: 0, fontSize: 'clamp(18px, 4vw, 24px)' }}>{inspectorData.id ? "Inspect Task Page (Edit)" : "Add New Task Popup"}</h2>
            
            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px', color: 'var(--text-muted)', fontSize: '14px' }}>Project ID</label>
              <input type="number" value={inspectorData.projectId} onChange={e => setInspectorData({...inspectorData, projectId: e.target.value})} style={{ width: '100%', padding: '10px', background: 'var(--bg-dark)', border: '1px solid var(--border-dark)', color: 'var(--neon-green)', boxSizing: 'border-box' }} />
            </div>
            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px', color: 'var(--text-muted)', fontSize: '14px' }}>Task Name</label>
              <input type="text" value={inspectorData.title} onChange={e => setInspectorData({...inspectorData, title: e.target.value})} style={{ width: '100%', padding: '10px', background: 'var(--bg-dark)', border: '1px solid var(--border-dark)', color: 'var(--neon-green)', boxSizing: 'border-box' }} />
            </div>
            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px', color: 'var(--text-muted)', fontSize: '14px' }}>Description</label>
              <textarea rows="3" value={inspectorData.description} onChange={e => setInspectorData({...inspectorData, description: e.target.value})} style={{ width: '100%', padding: '10px', background: 'var(--bg-dark)', border: '1px solid var(--border-dark)', color: 'var(--neon-green)', boxSizing: 'border-box' }}></textarea>
            </div>
            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px', color: 'var(--text-muted)', fontSize: '14px' }}>Tags (Pipe separated)</label>
              <input type="text" value={inspectorData.tags} onChange={e => setInspectorData({...inspectorData, tags: e.target.value})} placeholder="e.g., bug|frontend|urgent" style={{ width: '100%', padding: '10px', background: 'var(--bg-dark)', border: '1px solid var(--border-dark)', color: 'var(--neon-green)', boxSizing: 'border-box' }} />
            </div>
            
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '15px' }}>
              <div style={{ flex: '1 1 150px' }}>
                <label style={{ display: 'block', marginBottom: '5px', color: 'var(--text-muted)', fontSize: '14px' }}>Begin Date</label>
                <input type="date" value={inspectorData.begin} readOnly style={{ width: '100%', padding: '10px', background: 'var(--bg-dark)', border: '1px solid var(--border-dark)', color: '#555', boxSizing: 'border-box' }} />
              </div>
              <div style={{ flex: '1 1 150px' }}>
                <label style={{ display: 'block', marginBottom: '5px', color: 'var(--text-muted)', fontSize: '14px' }}>Deadline</label>
                <input type="date" value={inspectorData.deadline} onChange={e => setInspectorData({...inspectorData, deadline: e.target.value})} style={{ width: '100%', padding: '10px', background: 'var(--bg-dark)', border: '1px solid var(--border-dark)', color: 'var(--neon-green)', boxSizing: 'border-box' }} />
              </div>
            </div>

            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px', color: 'var(--text-muted)', fontSize: '14px' }}>Predicted Hours (AI)</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                <input 
                  type="number" 
                  value={inspectorData.predicted} 
                  onChange={e => setInspectorData({...inspectorData, predicted: e.target.value})} 
                  style={{ flex: '1 1 150px', padding: '10px', background: 'var(--bg-dark)', border: '1px solid var(--border-dark)', color: 'var(--neon-green)', boxSizing: 'border-box' }} 
                />
                <button 
                  onClick={handleAIPredict} 
                  disabled={isPredicting}
                  className="btn" 
                  style={{ flex: '1 1 120px', background: '#333', border: '1px solid var(--neon-green)', color: 'var(--neon-green)' }}
                >
                  {isPredicting ? "Thinking..." : "🧠 Ask AI"}
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '10px' }}>
              <input type="checkbox" checked={inspectorData.completed} onChange={e => setInspectorData({...inspectorData, completed: e.target.checked})} style={{ accentColor: 'var(--neon-green)', transform: 'scale(1.5)' }} />
              <label style={{ margin: 0, color: '#fff', fontSize: '14px' }}>Is Completed</label>
            </div>
            
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', marginTop: '20px', gap: '10px' }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', flex: '1 1 auto' }}>
                <button onClick={handleSaveEntity} className="btn" style={{ flex: '1 1 auto' }}>Save Entity</button>
                <button onClick={() => setIsInspectorOpen(false)} className="btn btn-danger" style={{ flex: '1 1 auto' }}>Cancel</button>
              </div>
              {inspectorData.id && (
                <button onClick={handleDeleteEntity} className="btn btn-danger" style={{ flex: '1 1 auto' }}>Wipe Data</button>
              )}
            </div>

          </div>
        </div>
      )}

    </div>
    </PageTransition>
  );
}