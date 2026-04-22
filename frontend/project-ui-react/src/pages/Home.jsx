import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { setCookie, getCookie } from '../telemetry';
import PageTransition from './PageTransition';
import { useOfflineSync } from '../useOfflineSync'

export default function Home() {
    useEffect(() => {
      // Fetch their history, or start a new array
      const history = getCookie('userActivityHistory') || [];
      
      // Add the current page and timestamp
      history.push({ 
          page: '/home',
          time: new Date().toISOString() 
      });
      
      // Keep only the last 10 visits so the cookie doesn't get too large
      if (history.length > 10) history.shift();
      
      setCookie('userActivityHistory', history, 1); // Save for 1 day
    }, []);
  
  const navigate = useNavigate();

  // --- STATE ---
  const [currentUserEmail, setCurrentUserEmail] = useState('');
  const [tasks, setTasks] = useState([]);
  const [projects, setProjects] = useState([]);
  
  const [selectedTask, setSelectedTask] = useState(null);
  const [selectedProject, setSelectedProject] = useState(null);

  // Tracks which task is currently waiting for the AI to respond
  const [predictingTaskId, setPredictingTaskId] = useState(null);

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

  // --- BOOT SEQUENCE ---
  useEffect(() => {
    const email = localStorage.getItem('loggedInUserEmail');
    if (!email) {
      navigate('/login');
      return;
    }
    setCurrentUserEmail(email);
    fetchDashboardData(email);
  }, [navigate]);

  const fetchDashboardData = async (email) => {
    try {
      // Fire both independent GraphQL queries simultaneously
      const [taskRes, projRes] = await Promise.all([
        fetch('http://localhost:3000/graphql', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: `query GetHomeTasks($email: String!) { tasksByUser(email: $email) { id projectId title description tags status completed predicted end } }`,
            variables: { email }
          })
        }),
        fetch('http://localhost:3000/graphql', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: `query GetHomeProjects($email: String!) { projectsByUser(email: $email) { id title description tags creatorEmail } }`,
            variables: { email }
          })
        })
      ]);

      const taskJson = await taskRes.json();
      const projJson = await projRes.json();

      // Catch and log silent GraphQL crashes so you know exactly what is corrupted
      if (taskJson.errors) console.error("> GRAPHQL TASK ERROR:", taskJson.errors[0].message);
      if (projJson.errors) console.error("> GRAPHQL PROJECT ERROR:", projJson.errors[0].message);

      // Independently set states so one failure doesn't wipe the whole dashboard
      if (taskJson.data) setTasks(taskJson.data.tasksByUser || []);
      if (projJson.data) setProjects(projJson.data.projectsByUser || []);

    } catch (error) { 
      console.error("> SYSTEM ERROR: Failed to fetch dashboard data.", error); 
    }
  };

  // --- ACTIONS ---
  const handleLogout = () => {
    localStorage.removeItem('loggedInUserEmail');
    navigate('/login');
  };

  const markTaskFinished = async (task) => {
    const actualHours = window.prompt("SYSTEM LOG: Task completed. Please enter actual hours spent for AI module training:");
    
    if (actualHours !== null && actualHours !== "") {
      const updatedTask = { 
        ...task, 
        status: 'completed', 
        completed: true, 
        actual: parseFloat(actualHours) 
      };

      try {
        const response = await fetch(`http://localhost:3000/api/tasks/${task.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updatedTask)
        });

        if (response.ok) {
          setTasks(tasks.map(t => t.id === task.id ? updatedTask : t));
        } else {
          alert("> ERROR: Failed to update task on the server.");
        }
      } catch (error) {
        console.error("> CRITICAL ERROR:", error);
      }
    }
  };

  // --- AI PREDICTION LOGIC ---
  const handleAIPredict = async (task) => {
    // Format tags correctly (fallback to empty string if no tags exist)
    const tagsString = task.tags ? task.tags.join(' | ') : '';
    const combinedData = `${task.title || task.name} | ${tagsString}`;
    
    if (!combinedData.trim() || combinedData === " | ") {
        alert("Task needs a name and tags for the AI to make a prediction!");
        return;
    }

    setPredictingTaskId(task.id);
    
    try {
        // 1. Get prediction from Python Microservice
        const aiResponse = await fetch('http://localhost:5000/api/predict', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tags: combinedData })
        });

        if (!aiResponse.ok) throw new Error("AI Microservice failed to respond.");
        
        const aiData = await aiResponse.json();
        const estimatedHours = aiData.estimated_hours;

        // 2. Save the new prediction to the Node.js Database
        const updatedTask = { ...task, predicted: estimatedHours };
        const dbResponse = await fetch('http://localhost:3000/graphql', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              query: `mutation UpdateAI($id: ID!, $predicted: Float!) { updateTask(id: $id, predicted: $predicted) { id } }`,
              variables: { id: task.id.toString(), predicted: estimatedHours }
            })
        });

        if (dbResponse.ok) {
            // 3. Update the UI locally
            setTasks(tasks.map(t => t.id === task.id ? updatedTask : t));
            
            if (selectedTask && selectedTask.id === task.id) {
                setSelectedTask(updatedTask);
            }
        } else {
            alert("> ERROR: AI succeeded, but failed to save prediction to the database.");
        }

    } catch (error) {
        console.error("> AI PREDICTION ERROR:", error);
        alert("Could not connect to AI. Ensure 'ai_microservice.py' is running on port 5000.");
    } finally {
        setPredictingTaskId(null);
    }
  };

  const activeTasks = tasks.filter(t => t.status !== 'completed' && t.completed !== true);

  // --- RENDER ---
  return (
    <PageTransition>
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      
      {/* RESPONSIVE TOP NAVIGATION */}
      <nav style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', padding: 'clamp(10px, 3vw, 15px) clamp(15px, 5vw, 30px)', backgroundColor: 'var(--bg-panel)', borderBottom: '1px solid var(--border-dark)', gap: '15px' }}>
        <div style={{ fontWeight: 'bold', fontSize: '20px' }}>~/ProjectUi
          <div style={{ color: isOnline ? '#00FF41' : '#ff3333' }}>
             [{isOnline ? 'NETWORK: ONLINE' : 'NETWORK: OFFLINE'}]
          </div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'clamp(10px, 2vw, 20px)' }}>
          <span style={{ color: 'var(--neon-green)', fontWeight: 'bold', cursor: 'pointer' }}>Home</span>
          <span onClick={() => navigate('/workspace')} style={{ color: 'var(--text-muted)', fontWeight: 'bold', cursor: 'pointer' }}>Workspace</span>
          <span onClick={() => navigate('/statistics')} style={{ color: 'var(--text-muted)', fontWeight: 'bold', cursor: 'pointer' }}>Statistics</span>
          <span onClick={() => navigate('/ghost')} style={{ color: 'var(--text-muted)', fontWeight: 'bold', cursor: 'pointer' }}>Ghost</span>
          <span onClick={handleLogout} style={{ color: 'var(--text-muted)', fontWeight: 'bold', cursor: 'pointer' }}>Logout</span>
        </div>
      </nav>

      {/* RESPONSIVE MAIN GRID */}
      {/* auto-fit will automatically stack these two columns on mobile! */}
      <div style={{ padding: 'clamp(15px, 5vw, 30px)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 'clamp(15px, 3vw, 30px)', alignItems: 'start', flex: 1 }}>
        
        {/* Active Tasks Column */}
        <div>
          <h2 style={{ color: '#fff', borderBottom: '1px dashed var(--border-dark)', paddingBottom: '10px', marginTop: 0 }}>&gt; Active Tasks Queue</h2>
          
          {activeTasks.length === 0 ? (
            <p style={{ color: 'var(--text-muted)' }}>No active tasks found. Queue is clear.</p>
          ) : (
            activeTasks.map(t => (
              <div key={t.id} style={{ backgroundColor: 'var(--bg-panel)', border: '1px solid var(--border-dark)', borderLeft: '4px solid var(--neon-green)', padding: 'clamp(15px, 3vw, 20px)', marginBottom: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-start', gap: '5px' }}>
                  <h3 style={{ margin: 0, color: '#fff', fontSize: '18px' }}>{t.title || t.name}</h3>
                  <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>Deadline: {t.end ? new Date(t.end).toLocaleDateString() : 'N/A'}</span>
                </div>
                <div style={{ color: 'var(--text-muted)', fontSize: '12px' }}>Project ID: [{t.projectId}] | Predicted: {t.predicted || 0}h</div>
                
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginTop: '10px' }}>
                  <button 
                    onClick={() => setSelectedTask(t)}
                    className="btn btn-sm"
                    style={{ flex: '1 1 auto', textAlign: 'center' }}
                  >
                    Inspect Data
                  </button>
                  
                  <button 
                    onClick={() => handleAIPredict(t)}
                    disabled={predictingTaskId === t.id}
                    className="btn btn-sm"
                    style={{ background: '#333', border: '1px solid var(--neon-green)', color: 'var(--neon-green)', flex: '1 1 auto', textAlign: 'center' }}
                  >
                    {predictingTaskId === t.id ? "Thinking..." : "🧠 AI Predict"}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Accessible Projects Column */}
        <div>
          <h2 style={{ color: '#fff', borderBottom: '1px dashed var(--border-dark)', paddingBottom: '10px', marginTop: 0 }}>&gt; Accessible Projects</h2>
          
          {projects.length === 0 ? (
            <p style={{ color: 'var(--text-muted)' }}>No active projects found.</p>
          ) : (
            projects.map(p => (
              <div key={p.id} style={{ backgroundColor: 'var(--bg-panel)', border: '1px solid var(--border-dark)', borderLeft: '4px solid var(--neon-green)', padding: 'clamp(15px, 3vw, 20px)', marginBottom: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-start', gap: '5px' }}>
                  <h3 style={{ margin: 0, color: '#fff', fontSize: '18px' }}>{p.title}</h3>
                  <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>ID: [{p.id}]</span>
                </div>
                
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {(p.tags || []).map((tag, idx) => (
                    <span key={idx} style={{ background: '#111', border: '1px solid var(--neon-green)', padding: '2px 6px', fontSize: '11px' }}>{tag}</span>
                  ))}
                </div>
                
                <button 
                  onClick={() => setSelectedProject(p)}
                  className="btn btn-sm"
                  style={{ marginTop: '10px', alignSelf: 'flex-start' }}
                >
                  Inspect Data (Read-Only)
                </button>
              </div>
            ))
          )}
        </div>

      </div>

      {/* --- RESPONSIVE TASK MODAL --- */}
      {selectedTask && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(5, 5, 5, 0.9)', zIndex: 1000, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '15px', boxSizing: 'border-box' }}>
          <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--neon-green)', padding: 'clamp(20px, 5vw, 30px)', width: '100%', maxWidth: '600px', maxHeight: '90vh', overflowY: 'auto', boxSizing: 'border-box' }}>
            <h2 style={{ color: 'var(--neon-green)', marginTop: 0 }}>[READ-ONLY] Task Inspection</h2>
            
            <div style={{ marginBottom: '15px' }}><div style={{ color: 'var(--text-muted)', fontSize: '12px', marginBottom: '4px' }}>TASK ID / PROJECT ID</div><div style={{ color: '#fff', fontSize: '16px', background: 'var(--bg-dark)', padding: '10px', border: '1px solid var(--border-dark)', wordBreak: 'break-all' }}>[{selectedTask.id}] / [{selectedTask.projectId}]</div></div>
            <div style={{ marginBottom: '15px' }}><div style={{ color: 'var(--text-muted)', fontSize: '12px', marginBottom: '4px' }}>TASK NAME</div><div style={{ color: '#fff', fontSize: '16px', background: 'var(--bg-dark)', padding: '10px', border: '1px solid var(--border-dark)', wordBreak: 'break-word' }}>{selectedTask.title || selectedTask.name}</div></div>
            <div style={{ marginBottom: '15px' }}><div style={{ color: 'var(--text-muted)', fontSize: '12px', marginBottom: '4px' }}>DESCRIPTION</div><div style={{ color: '#fff', fontSize: '14px', background: 'var(--bg-dark)', padding: '10px', border: '1px solid var(--border-dark)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{selectedTask.description || selectedTask.desc}</div></div>
            <div style={{ marginBottom: '15px' }}><div style={{ color: 'var(--text-muted)', fontSize: '12px', marginBottom: '4px' }}>DEADLINE</div><div style={{ color: '#fff', fontSize: '16px', background: 'var(--bg-dark)', padding: '10px', border: '1px solid var(--border-dark)' }}>{selectedTask.end ? new Date(selectedTask.end).toLocaleDateString() : 'N/A'}</div></div>
            <div style={{ marginBottom: '15px' }}><div style={{ color: 'var(--text-muted)', fontSize: '12px', marginBottom: '4px' }}>HOURS (ACTUAL / PREDICTED)</div><div style={{ color: '#fff', fontSize: '16px', background: 'var(--bg-dark)', padding: '10px', border: '1px solid var(--border-dark)' }}>{selectedTask.predicted || 0}h</div></div>
            
            <button onClick={() => setSelectedTask(null)} className="btn" style={{ marginTop: '20px', width: '100%' }}>Close Inspector</button>
          </div>
        </div>
      )}

      {/* --- RESPONSIVE PROJECT MODAL --- */}
      {selectedProject && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(5, 5, 5, 0.9)', zIndex: 1000, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '15px', boxSizing: 'border-box' }}>
          <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--neon-green)', padding: 'clamp(20px, 5vw, 30px)', width: '100%', maxWidth: '600px', maxHeight: '90vh', overflowY: 'auto', boxSizing: 'border-box' }}>
            <h2 style={{ color: 'var(--neon-green)', marginTop: 0 }}>[READ-ONLY] Project Inspection</h2>
            
            <div style={{ marginBottom: '15px' }}><div style={{ color: 'var(--text-muted)', fontSize: '12px', marginBottom: '4px' }}>PROJECT ID</div><div style={{ color: '#fff', fontSize: '16px', background: 'var(--bg-dark)', padding: '10px', border: '1px solid var(--border-dark)', wordBreak: 'break-all' }}>[{selectedProject.id}]</div></div>
            <div style={{ marginBottom: '15px' }}><div style={{ color: 'var(--text-muted)', fontSize: '12px', marginBottom: '4px' }}>TITLE</div><div style={{ color: '#fff', fontSize: '16px', background: 'var(--bg-dark)', padding: '10px', border: '1px solid var(--border-dark)', wordBreak: 'break-word' }}>{selectedProject.title}</div></div>
            <div style={{ marginBottom: '15px' }}><div style={{ color: 'var(--text-muted)', fontSize: '12px', marginBottom: '4px' }}>DESCRIPTION</div><div style={{ color: '#fff', fontSize: '14px', background: 'var(--bg-dark)', padding: '10px', border: '1px solid var(--border-dark)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{selectedProject.description || selectedProject.desc}</div></div>
            <div style={{ marginBottom: '15px' }}><div style={{ color: 'var(--text-muted)', fontSize: '12px', marginBottom: '4px' }}>CREATOR EMAIL</div><div style={{ color: '#fff', fontSize: '16px', background: 'var(--bg-dark)', padding: '10px', border: '1px solid var(--border-dark)', wordBreak: 'break-all' }}>{selectedProject.creatorEmail}</div></div>
            
            <button onClick={() => setSelectedProject(null)} className="btn" style={{ marginTop: '20px', width: '100%' }}>Close Inspector</button>
          </div>
        </div>
      )}

    </div>
    </PageTransition>
  );
}