import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { setCookie, getCookie } from '../telemetry';
import PageTransition from './PageTransition';
import {useOfflineSync} from '../useOfflineSync'

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

export default function Workspace() {
  useEffect(() => {
      const history = getCookie('userActivityHistory') || [];
      history.push({ page: '/workspace', time: new Date().toISOString() });
      if (history.length > 10) history.shift();
      setCookie('userActivityHistory', history, 1);
  }, []);

  const navigate = useNavigate();
  const [currentUserEmail, setCurrentUserEmail] = useState('');
    
  // Master Data State
  const [projects, setProjects] = useState([]);
  const [tasks, setTasks] = useState([]);

  // --- NEW: INITIALIZE OFFLINE SYNC HOOK ---
  const { isOnline, queueAction, realtimePayload, isSimulatingOffline, setIsSimulatingOffline } = useOfflineSync(currentUserEmail);

  // --- NEW: WEBSOCKET LISTENER ---
  useEffect(() => {
    if (realtimePayload) {
      // 1. If the payload contains new Projects, append them!
      if (realtimePayload.projects && realtimePayload.projects.length > 0) {
        setProjects(prev => [...realtimePayload.projects, ...prev]);
      }
      
      // 2. If the payload contains new Tasks, append them!
      if (realtimePayload.tasks && realtimePayload.tasks.length > 0) {
        setTasks(prev => [...realtimePayload.tasks, ...prev]);
      }
    }
  }, [realtimePayload]);

  // --- NEW: PAGINATION STATE ---
  const [projectPage, setProjectPage] = useState(1);
  const [taskPage, setTaskPage] = useState(1);
  const ITEMS_PER_PAGE = 10;

  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [modalError, setModalError] = useState('');

  const initialProjectForm = { id: null, title: '', description: '', tags: '', associatedFiles: '', associatedEmails: '' };
  const initialTaskForm = { id: null, projectId: '', name: '', description: '', tags: '', begin: '', deadline: '', predicted: '', completed: false };
  
  const [projectForm, setProjectForm] = useState(initialProjectForm);
  const [taskForm, setTaskForm] = useState(initialTaskForm);
  const [isPredicting, setIsPredicting] = useState(false);

  const startGenerator = async () => {
    try { await fetch('http://localhost:3000/api/generate/start', { method: 'POST' }); } 
    catch (err) { console.error("Could not start generator."); }
  };

  const stopGenerator = async () => {
      try { await fetch('http://localhost:3000/api/generate/stop', { method: 'POST' }); } 
      catch (err) { console.error("Could not stop generator."); }
  };

  useEffect(() => {
    const email = localStorage.getItem('loggedInUserEmail');
    if (!email) {
      navigate('/login');
      return;
    }
    setCurrentUserEmail(email);
    fetchWorkspaceData(email);
  }, [navigate]);

  const fetchWorkspaceData = async (email) => {
    try {
      const projRes = await fetch(`http://localhost:3000/api/projects/${email}`);
      if (projRes.ok) {
        const projData = await projRes.json();
        setProjects(projData.data || []);
        localStorage.setItem('cachedProjects', JSON.stringify(projData.data || [])); // CACHE IT
      }
      const taskRes = await fetch(`http://localhost:3000/api/tasks/${email}`);
      if (taskRes.ok) {
        const taskData = await taskRes.json();
        setTasks(taskData.data || []);
        localStorage.setItem('cachedTasks', JSON.stringify(taskData.data || [])); // CACHE IT
      }
    } catch (error) {
      console.warn("> OFFLINE MODE: Loading cached workspace data.");
      // LOAD FROM CACHE IF FETCH FAILS
      setProjects(JSON.parse(localStorage.getItem('cachedProjects') || '[]'));
      setTasks(JSON.parse(localStorage.getItem('cachedTasks') || '[]'));
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('loggedInUserEmail');
    navigate('/login');
  };

  const openProjectModal = (project = null) => {
    setModalError('');
    if (project) {
      setProjectForm({
        id: project.id, title: project.title || '', description: project.description || '',
        tags: project.tags ? project.tags.join(' | ') : '',
        associatedFiles: project.associatedFiles ? project.associatedFiles.join(', ') : '',
        associatedEmails: project.associatedEmails ? project.associatedEmails.join(', ') : ''
      });
    } else {
      setProjectForm(initialProjectForm);
    }
    setIsProjectModalOpen(true);
  };

  // --- UPDATED: SAVE PROJECT WITH QUEUEING ---
  const saveProject = async () => {
    setModalError('');
    const isNew = !projectForm.id;
    
    const payload = {
      id: isNew ? Date.now() : projectForm.id, // Assign temporary ID if new
      title: projectForm.title, 
      description: projectForm.description, 
      creatorEmail: currentUserEmail,
      tags: projectForm.tags.split('|').map(s => s.trim()).filter(Boolean),
      associatedFiles: projectForm.associatedFiles.split(',').map(s => s.trim()).filter(Boolean),
      associatedEmails: projectForm.associatedEmails.split(',').map(s => s.trim()).filter(Boolean)
    };

    // 1. OPTIMISTIC UI UPDATE
    if (isNew) setProjects([...projects, payload]);
    else setProjects(projects.map(p => p.id === payload.id ? { ...p, ...payload } : p));
    setIsProjectModalOpen(false);

    // 2. OFFLINE CHECK
    if (!isOnline) {
      queueAction(isNew ? 'http://localhost:3000/api/projects' : `http://localhost:3000/api/projects/${payload.id}`, isNew ? 'POST' : 'PUT', payload);
      return;
    }

    // 3. ONLINE SYNC
    try {
      if (isNew) {
        await fetch('http://localhost:3000/api/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      } else {
        await fetch(`http://localhost:3000/api/projects/${payload.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      }
    } catch (err) {
      console.error("> SYSTEM ERROR saving project: ", err);
      // If the network drops exactly during the fetch attempt, catch it and queue it!
      queueAction(isNew ? 'http://localhost:3000/api/projects' : `http://localhost:3000/api/projects/${payload.id}`, isNew ? 'POST' : 'PUT', payload);
    }
  };


  // --- UPDATED: DELETE PROJECT WITH CASCADING QUEUEING ---
  const deleteProject = async (id) => {
    if (window.confirm("Remove Project? WARNING: This will cascade and delete all associated tasks locally!")) {
      
      // Identify tasks that belong to this project so we can delete them too
      const tasksToDelete = tasks.filter(t => t.projectId === id);

      // 1. OPTIMISTIC UI UPDATE (Remove project AND its tasks instantly)
      setProjects(projects.filter(p => p.id !== id));
      setTasks(tasks.filter(t => t.projectId !== id));

      // 2. OFFLINE CHECK
      if (!isOnline) {
        // Queue the project deletion
        queueAction(`http://localhost:3000/api/projects/${id}`, 'DELETE', {});
        // Queue all the cascading task deletions
        tasksToDelete.forEach(t => queueAction(`http://localhost:3000/api/tasks/${t.id}`, 'DELETE', {}));
        return;
      }

      // 3. ONLINE SYNC
      try {
        await fetch(`http://localhost:3000/api/projects/${id}`, { method: 'DELETE' });
        
        // Loop through and delete the associated tasks on the server
        for (const task of tasksToDelete) {
          await fetch(`http://localhost:3000/api/tasks/${task.id}`, { method: 'DELETE' });
        }
      } catch (err) { 
        console.error("> SYSTEM ERROR deleting project: ", err); 
        // If the fetch fails mid-flight, queue the remaining deletes
        queueAction(`http://localhost:3000/api/projects/${id}`, 'DELETE', {});
        tasksToDelete.forEach(t => queueAction(`http://localhost:3000/api/tasks/${t.id}`, 'DELETE', {}));
      }
    }
  };

  const openTaskModal = (task = null) => {
    setModalError('');
    if (task) {
      setTaskForm({
        id: task.id, projectId: task.projectId || '', name: task.title || task.name || '', description: task.description || task.desc || '',
        tags: task.tags ? task.tags.join(' | ') : '', begin: formatDateForInput(task.start), deadline: formatDateForInput(task.end),
        predicted: task.predicted || '', completed: task.completed || task.status === 'completed'
      });
    } else {
      setTaskForm({ ...initialTaskForm, predicted: '' });
    }
    setIsTaskModalOpen(true);
  };

  const handleAIPredict = async () => {
    const combinedData = `${taskForm.name} | ${taskForm.tags}`;
    if (!combinedData.trim() || combinedData === " | ") { alert("Please enter a Task Name and some Tags first!"); return; }
    setIsPredicting(true);
    try {
        const response = await fetch('http://localhost:5000/api/predict', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tags: combinedData }) });
        if (response.ok) {
            const data = await response.json();
            setTaskForm({ ...taskForm, predicted: data.estimated_hours });
        } else { alert("AI Microservice failed to respond. Is the Python server running?"); }
    } catch (error) {
        console.error("> AI PREDICTION ERROR:", error);
        alert("Could not connect to AI. Ensure 'ai_microservice.py' is running on port 5000.");
    } finally { setIsPredicting(false); }
  };

  // --- UPDATED: SAVE TASK WITH QUEUEING ---
  const saveTask = async () => {
    setModalError('');
    const isNew = !taskForm.id;
    const payload = {
      id: isNew ? Date.now() : taskForm.id, // Assign temporary ID if new
      projectId: parseInt(taskForm.projectId), title: taskForm.name, description: taskForm.description, creatorEmail: currentUserEmail,
      status: taskForm.completed ? 'completed' : 'pending', completed: taskForm.completed,
      tags: taskForm.tags.split('|').map(s => s.trim()).filter(Boolean), start: taskForm.begin, end: taskForm.deadline, predicted: parseFloat(taskForm.predicted) || 0
    };

    // 1. OPTIMISTIC UI UPDATE
    if (isNew) setTasks([...tasks, payload]);
    else setTasks(tasks.map(t => t.id === payload.id ? { ...t, ...payload } : t));
    setIsTaskModalOpen(false);

    // 2. OFFLINE CHECK
    if (!isOnline) {
      queueAction(isNew ? 'http://localhost:3000/api/tasks' : `http://localhost:3000/api/tasks/${payload.id}`, isNew ? 'POST' : 'PUT', payload);
      return;
    }

    // 3. ONLINE SYNC
    try {
      if (isNew) {
        await fetch('http://localhost:3000/api/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      } else {
        await fetch(`http://localhost:3000/api/tasks/${payload.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      }
    } catch (err) {
      console.error("> SYSTEM ERROR saving task: ", err);
      queueAction(isNew ? 'http://localhost:3000/api/tasks' : `http://localhost:3000/api/tasks/${payload.id}`, isNew ? 'POST' : 'PUT', payload);
    }
  };
   
  // --- UPDATED: DELETE TASK WITH QUEUEING ---
  const deleteTask = async (id) => {
    if (window.confirm("Remove Task?")) {
      // 1. OPTIMISTIC UI UPDATE
      setTasks(tasks.filter(t => t.id !== id));

      // 2. OFFLINE CHECK
      if (!isOnline) {
        queueAction(`http://localhost:3000/api/tasks/${id}`, 'DELETE', {});
        return;
      }

      // 3. ONLINE SYNC
      try {
        await fetch(`http://localhost:3000/api/tasks/${id}`, { method: 'DELETE' });
      } catch (err) { 
        console.error("> SYSTEM ERROR deleting task: ", err);
        queueAction(`http://localhost:3000/api/tasks/${id}`, 'DELETE', {});
      }
    }
  };


  // --- PAGINATION CALCULATIONS ---
  // Calculates boundaries safely and ensures we never land on an empty 'page 3' if we just deleted its only item
  const totalProjectPages = Math.max(1, Math.ceil(projects.length / ITEMS_PER_PAGE));
  const currentProjectPage = Math.min(projectPage, totalProjectPages);
  const currentProjects = projects.slice((currentProjectPage - 1) * ITEMS_PER_PAGE, currentProjectPage * ITEMS_PER_PAGE);

  const totalTaskPages = Math.max(1, Math.ceil(tasks.length / ITEMS_PER_PAGE));
  const currentTaskPage = Math.min(taskPage, totalTaskPages);
  const currentTasks = tasks.slice((currentTaskPage - 1) * ITEMS_PER_PAGE, currentTaskPage * ITEMS_PER_PAGE);


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
        
        {/* NEW: THE DISCONNECT BUTTON */}
        <button 
          onClick={() => setIsSimulatingOffline(!isSimulatingOffline)}
          style={{ 
            background: isSimulatingOffline ? '#00FF41' : '#ff3333', 
            color: '#000', 
            border: 'none', 
            padding: '5px 15px', 
            fontWeight: 'bold', 
            cursor: 'pointer',
            borderRadius: '3px'
          }}
        >
          {isSimulatingOffline ? "Reconnect App" : "Force Disconnect"}
        </button>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'clamp(10px, 2vw, 20px)' }}>
          <span onClick={() => navigate('/home')} style={{ color: 'var(--text-muted)', fontWeight: 'bold', cursor: 'pointer' }}>Home</span>
          <span style={{ color: 'var(--neon-green)', fontWeight: 'bold', cursor: 'pointer' }}>Workspace</span>
          <span onClick={() => navigate('/statistics')} style={{ color: 'var(--text-muted)', fontWeight: 'bold', cursor: 'pointer' }}>Statistics</span>
          <span onClick={() => navigate('/ghost')} style={{ color: 'var(--text-muted)', fontWeight: 'bold', cursor: 'pointer' }}>Ghost</span>
          <span onClick={handleLogout} style={{ color: 'var(--text-muted)', fontWeight: 'bold', cursor: 'pointer' }}>Logout</span>
        </div>
      </nav>

      <div style={{ display: 'flex', gap: '10px', marginBottom: '30px', background: 'var(--bg-panel)', padding: '15px', border: '1px solid var(--border-dark)' }}>
          <span style={{ color: 'var(--text-muted)', fontWeight: 'bold', alignSelf: 'center', marginRight: '15px' }}>
            SERVER DATA GENERATOR:
          </span>
          <button onClick={startGenerator} className="btn" style={{ background: '#00FF41', color: '#000', fontWeight: 'bold' }}>
            ▶ START
          </button>
          <button onClick={stopGenerator} className="btn btn-danger" style={{ fontWeight: 'bold' }}>
            ■ STOP
          </button>
      </div>

      <div style={{ color: '#fff', borderBottom: '1px dashed var(--border-dark)', padding: 'clamp(15px, 3vw, 20px) clamp(15px, 5vw, 30px)' }}>
        <h1 style={{ margin: 0, textShadow: '0 0 10px rgba(0, 255, 65, 0.2)', fontSize: 'clamp(24px, 5vw, 32px)' }}>&gt; Project<span style={{ color: 'var(--neon-green)' }}>Ui</span> Workspace</h1>
      </div>

      <div style={{ padding: 'clamp(15px, 5vw, 30px)', flex: 1, overflowX: 'hidden' }}>
        
        {/* RESPONSIVE PROJECTS TABLE */}
        <div style={{ marginBottom: '50px', background: 'var(--bg-panel)', padding: 'clamp(15px, 3vw, 30px)', border: '1px solid var(--border-dark)' }}>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', flexWrap: 'wrap', gap: '10px' }}>
            <h2 style={{ margin: 0 }}>User's Projects</h2>
            <button onClick={() => openProjectModal()} className="btn btn-sm">+ Add New Project</button>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', minWidth: '600px', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid var(--border-dark)', color: '#fff', background: '#111' }}>ID</th>
                  <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid var(--border-dark)', color: '#fff', background: '#111' }}>Title</th>
                  <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid var(--border-dark)', color: '#fff', background: '#111' }}>Tags</th>
                  <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid var(--border-dark)', color: '#fff', background: '#111' }}>Creator</th>
                  <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid var(--border-dark)', color: '#fff', background: '#111' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {currentProjects.length === 0 ? (
                  <tr><td colSpan="5" style={{ padding: '20px', textAlign: 'center', color: '#888' }}>No projects available.</td></tr>
                ) : (
                  currentProjects.map(p => (
                    <tr key={p.id}>
                      <td style={{ padding: '12px', borderBottom: '1px solid var(--border-dark)' }}>{p.id}</td>
                      <td style={{ padding: '12px', borderBottom: '1px solid var(--border-dark)' }}>{p.title}</td>
                      <td style={{ padding: '12px', borderBottom: '1px solid var(--border-dark)' }}>{p.tags ? p.tags.join(' | ') : ''}</td>
                      <td style={{ padding: '12px', borderBottom: '1px solid var(--border-dark)' }}>{p.creatorEmail}</td>
                      <td style={{ padding: '12px', borderBottom: '1px solid var(--border-dark)', display: 'flex', gap: '10px' }}>
                        <button onClick={() => openProjectModal(p)} className="btn btn-sm">Edit</button>
                        <button onClick={() => deleteProject(p.id)} className="btn btn-sm btn-danger">Remove</button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* PROJECT PAGINATION FOOTER */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '15px', paddingTop: '15px', borderTop: '1px dashed var(--border-dark)', flexWrap: 'wrap', gap: '10px' }}>
            <span style={{ color: 'var(--text-muted)', fontSize: '14px', fontWeight: 'bold', letterSpacing: '1px' }}>
              PAGE {currentProjectPage} / {totalProjectPages}
            </span>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button 
                onClick={() => setProjectPage(p => Math.max(1, p - 1))} 
                disabled={currentProjectPage === 1} 
                className="btn btn-sm" 
                style={{ opacity: currentProjectPage === 1 ? 0.3 : 1, cursor: currentProjectPage === 1 ? 'not-allowed' : 'pointer', padding: '5px 15px' }}
              >
                &lt; PREV
              </button>
              <button 
                onClick={() => setProjectPage(p => Math.min(totalProjectPages, p + 1))} 
                disabled={currentProjectPage === totalProjectPages} 
                className="btn btn-sm" 
                style={{ opacity: currentProjectPage === totalProjectPages ? 0.3 : 1, cursor: currentProjectPage === totalProjectPages ? 'not-allowed' : 'pointer', padding: '5px 15px' }}
              >
                NEXT &gt;
              </button>
            </div>
          </div>
        </div>

        {/* RESPONSIVE TASKS TABLE */}
        <div style={{ marginBottom: '50px', background: 'var(--bg-panel)', padding: 'clamp(15px, 3vw, 30px)', border: '1px solid var(--border-dark)' }}>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', flexWrap: 'wrap', gap: '10px' }}>
            <h2 style={{ margin: 0 }}>User's Tasks</h2>
            <button onClick={() => openTaskModal()} className="btn btn-sm">+ Add New Task</button>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', minWidth: '800px', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid var(--border-dark)', color: '#fff', background: '#111' }}>ID</th>
                  <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid var(--border-dark)', color: '#fff', background: '#111' }}>Project ID</th>
                  <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid var(--border-dark)', color: '#fff', background: '#111' }}>Task Name</th>
                  <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid var(--border-dark)', color: '#fff', background: '#111' }}>Tags</th>
                  <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid var(--border-dark)', color: '#fff', background: '#111' }}>Status</th>
                  <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid var(--border-dark)', color: '#fff', background: '#111' }}>AI Prediction</th>
                  <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid var(--border-dark)', color: '#fff', background: '#111' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {currentTasks.length === 0 ? (
                   <tr><td colSpan="7" style={{ padding: '20px', textAlign: 'center', color: '#888' }}>No tasks available.</td></tr>
                ) : (
                  currentTasks.map(t => (
                    <tr key={t.id}>
                      <td style={{ padding: '12px', borderBottom: '1px solid var(--border-dark)' }}>{t.id}</td>
                      <td style={{ padding: '12px', borderBottom: '1px solid var(--border-dark)' }}>[{t.projectId || 'N/A'}]</td>
                      <td style={{ padding: '12px', borderBottom: '1px solid var(--border-dark)' }}>{t.title || t.name}</td>
                      <td style={{ padding: '12px', borderBottom: '1px solid var(--border-dark)' }}>{t.tags ? t.tags.join(' | ') : ''}</td>
                      <td style={{ padding: '12px', borderBottom: '1px solid var(--border-dark)' }}>{t.completed || t.status === 'completed' ? 'DONE' : 'PENDING'}</td>
                      <td style={{ padding: '12px', borderBottom: '1px solid var(--border-dark)' }}>{t.predicted || 0}h</td>
                      <td style={{ padding: '12px', borderBottom: '1px solid var(--border-dark)', display: 'flex', gap: '10px' }}>
                        <button onClick={() => openTaskModal(t)} className="btn btn-sm">Edit</button>
                        <button onClick={() => deleteTask(t.id)} className="btn btn-sm btn-danger">Remove</button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* TASK PAGINATION FOOTER */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '15px', paddingTop: '15px', borderTop: '1px dashed var(--border-dark)', flexWrap: 'wrap', gap: '10px' }}>
            <span style={{ color: 'var(--text-muted)', fontSize: '14px', fontWeight: 'bold', letterSpacing: '1px' }}>
              PAGE {currentTaskPage} / {totalTaskPages}
            </span>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button 
                onClick={() => setTaskPage(p => Math.max(1, p - 1))} 
                disabled={currentTaskPage === 1} 
                className="btn btn-sm" 
                style={{ opacity: currentTaskPage === 1 ? 0.3 : 1, cursor: currentTaskPage === 1 ? 'not-allowed' : 'pointer', padding: '5px 15px' }}
              >
                &lt; PREV
              </button>
              <button 
                onClick={() => setTaskPage(p => Math.min(totalTaskPages, p + 1))} 
                disabled={currentTaskPage === totalTaskPages} 
                className="btn btn-sm" 
                style={{ opacity: currentTaskPage === totalTaskPages ? 0.3 : 1, cursor: currentTaskPage === totalTaskPages ? 'not-allowed' : 'pointer', padding: '5px 15px' }}
              >
                NEXT &gt;
              </button>
            </div>
          </div>
        </div>

      </div>

      {/* RESPONSIVE PROJECT MODAL WITH ERROR LOGGING */}
      {isProjectModalOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(5, 5, 5, 0.9)', zIndex: 1000, display: 'flex', justifyContent: 'center', alignItems: 'center', backdropFilter: 'blur(5px)', padding: '15px', boxSizing: 'border-box' }}>
          <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--neon-green)', padding: 'clamp(20px, 5vw, 30px)', width: '100%', maxWidth: '600px', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 0 30px rgba(0, 255, 65, 0.1)', boxSizing: 'border-box' }}>
            <h2 style={{ marginTop: 0, fontSize: 'clamp(18px, 4vw, 24px)' }}>{projectForm.id ? "Inspect Project Page (Edit)" : "Add New Project Popup"}</h2>
            
            {/* The Error Display! */}
            {modalError && <div style={{ color: 'var(--danger-red)', fontSize: '12px', marginBottom: '15px', textShadow: '0 0 5px rgba(255, 51, 51, 0.5)' }}>{modalError}</div>}

            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px', color: 'var(--text-muted)', fontSize: '14px' }}>Title</label>
              <input type="text" value={projectForm.title} onChange={e => setProjectForm({...projectForm, title: e.target.value})} style={{ width: '100%', padding: '10px', background: 'var(--bg-dark)', border: '1px solid var(--border-dark)', color: 'var(--neon-green)', boxSizing: 'border-box' }} />
            </div>
            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px', color: 'var(--text-muted)', fontSize: '14px' }}>Description</label>
              <textarea rows="4" value={projectForm.description} onChange={e => setProjectForm({...projectForm, description: e.target.value})} style={{ width: '100%', padding: '10px', background: 'var(--bg-dark)', border: '1px solid var(--border-dark)', color: 'var(--neon-green)', boxSizing: 'border-box' }}></textarea>
            </div>
            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px', color: 'var(--text-muted)', fontSize: '14px' }}>Tags (Pipe separated e.g., React|Node)</label>
              <input type="text" value={projectForm.tags} onChange={e => setProjectForm({...projectForm, tags: e.target.value})} style={{ width: '100%', padding: '10px', background: 'var(--bg-dark)', border: '1px solid var(--border-dark)', color: 'var(--neon-green)', boxSizing: 'border-box' }} />
            </div>
            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px', color: 'var(--text-muted)', fontSize: '14px' }}>Associated Files</label>
              <input type="text" value={projectForm.associatedFiles} onChange={e => setProjectForm({...projectForm, associatedFiles: e.target.value})} style={{ width: '100%', padding: '10px', background: 'var(--bg-dark)', border: '1px solid var(--border-dark)', color: 'var(--neon-green)', boxSizing: 'border-box' }} />
            </div>
            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px', color: 'var(--text-muted)', fontSize: '14px' }}>Associated Users</label>
              <input type="text" value={projectForm.associatedEmails} onChange={e => setProjectForm({...projectForm, associatedEmails: e.target.value})} style={{ width: '100%', padding: '10px', background: 'var(--bg-dark)', border: '1px solid var(--border-dark)', color: 'var(--neon-green)', boxSizing: 'border-box' }} />
            </div>
            
            <div style={{ display: 'flex', gap: '10px', marginTop: '20px', flexWrap: 'wrap' }}>
              <button onClick={saveProject} className="btn" style={{ flex: '1 1 auto' }}>Save Entity</button>
              <button onClick={() => setIsProjectModalOpen(false)} className="btn btn-danger" style={{ flex: '1 1 auto' }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* RESPONSIVE TASK MODAL WITH ERROR LOGGING */}
      {isTaskModalOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(5, 5, 5, 0.9)', zIndex: 1000, display: 'flex', justifyContent: 'center', alignItems: 'center', backdropFilter: 'blur(5px)', padding: '15px', boxSizing: 'border-box' }}>
          <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--neon-green)', padding: 'clamp(20px, 5vw, 30px)', width: '100%', maxWidth: '600px', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 0 30px rgba(0, 255, 65, 0.1)', boxSizing: 'border-box' }}>
            <h2 style={{ marginTop: 0, fontSize: 'clamp(18px, 4vw, 24px)' }}>{taskForm.id ? "Inspect Task Page (Edit)" : "Add New Task Popup"}</h2>
            
            {/* The Error Display! */}
            {modalError && <div style={{ color: 'var(--danger-red)', fontSize: '12px', marginBottom: '15px', textShadow: '0 0 5px rgba(255, 51, 51, 0.5)' }}>{modalError}</div>}

            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px', color: 'var(--text-muted)', fontSize: '14px' }}>Project ID</label>
              <input type="number" value={taskForm.projectId} onChange={e => setTaskForm({...taskForm, projectId: e.target.value})} style={{ width: '100%', padding: '10px', background: 'var(--bg-dark)', border: '1px solid var(--border-dark)', color: 'var(--neon-green)', boxSizing: 'border-box' }} />
            </div>
            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px', color: 'var(--text-muted)', fontSize: '14px' }}>Task Name</label>
              <input type="text" value={taskForm.name} onChange={e => setTaskForm({...taskForm, name: e.target.value})} style={{ width: '100%', padding: '10px', background: 'var(--bg-dark)', border: '1px solid var(--border-dark)', color: 'var(--neon-green)', boxSizing: 'border-box' }} />
            </div>
            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px', color: 'var(--text-muted)', fontSize: '14px' }}>Description</label>
              <textarea rows="3" value={taskForm.description} onChange={e => setTaskForm({...taskForm, description: e.target.value})} style={{ width: '100%', padding: '10px', background: 'var(--bg-dark)', border: '1px solid var(--border-dark)', color: 'var(--neon-green)', boxSizing: 'border-box' }}></textarea>
            </div>
            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px', color: 'var(--text-muted)', fontSize: '14px' }}>Tags (Pipe separated)</label>
              <input type="text" value={taskForm.tags} onChange={e => setTaskForm({...taskForm, tags: e.target.value})} placeholder="e.g., bug|frontend|urgent" style={{ width: '100%', padding: '10px', background: 'var(--bg-dark)', border: '1px solid var(--border-dark)', color: 'var(--neon-green)', boxSizing: 'border-box' }} />
            </div>
            
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '15px' }}>
              <div style={{ flex: '1 1 150px' }}>
                <label style={{ display: 'block', marginBottom: '5px', color: 'var(--text-muted)', fontSize: '14px' }}>Begin Date</label>
                <input type="date" value={taskForm.begin} readOnly style={{ width: '100%', padding: '10px', background: 'var(--bg-dark)', border: '1px solid var(--border-dark)', color: '#555', boxSizing: 'border-box' }} />
              </div>
              <div style={{ flex: '1 1 150px' }}>
                <label style={{ display: 'block', marginBottom: '5px', color: 'var(--text-muted)', fontSize: '14px' }}>Deadline</label>
                <input type="date" value={taskForm.deadline} onChange={e => setTaskForm({...taskForm, deadline: e.target.value})} style={{ width: '100%', padding: '10px', background: 'var(--bg-dark)', border: '1px solid var(--border-dark)', color: 'var(--neon-green)', boxSizing: 'border-box' }} />
              </div>
            </div>

            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px', color: 'var(--text-muted)', fontSize: '14px' }}>Predicted Hours (AI)</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                <input 
                  type="number" 
                  value={taskForm.predicted} 
                  onChange={e => setTaskForm({...taskForm, predicted: e.target.value})} 
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
              <input type="checkbox" checked={taskForm.completed} onChange={e => setTaskForm({...taskForm, completed: e.target.checked})} style={{ accentColor: 'var(--neon-green)', transform: 'scale(1.5)' }} />
              <label style={{ margin: 0, color: '#fff', fontSize: '14px' }}>Is Completed</label>
            </div>
            
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginTop: '20px' }}>
              <button onClick={saveTask} className="btn" style={{ flex: '1 1 auto' }}>Save Entity</button>
              <button onClick={() => setIsTaskModalOpen(false)} className="btn btn-danger" style={{ flex: '1 1 auto' }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

    </div>
    </PageTransition>
  );
}