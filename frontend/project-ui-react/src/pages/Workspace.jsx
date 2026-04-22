import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { setCookie, getCookie } from '../telemetry';
import PageTransition from './PageTransition';
import { useOfflineSync } from '../useOfflineSync';

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
    
  // --- MASTER DATA STATE ---
  const [projects, setProjects] = useState([]);
  const [tasks, setTasks] = useState([]);

  // --- INFINITE SCROLL / PAGINATION STATE ---
  const ITEMS_PER_PAGE = 10;
  
  const [taskOffset, setTaskOffset] = useState(0);
  const [hasMoreTasks, setHasMoreTasks] = useState(true);
  const [isFetchingTasks, setIsFetchingTasks] = useState(false);

  const [projectOffset, setProjectOffset] = useState(0);
  const [hasMoreProjects, setHasMoreProjects] = useState(true);
  const [isFetchingProjects, setIsFetchingProjects] = useState(false);

  const taskObserver = useRef();
  const projectObserver = useRef();

  // --- OFFLINE SYNC ---
  const { isOnline, queueAction, realtimePayload, isSimulatingOffline, setIsSimulatingOffline } = useOfflineSync(currentUserEmail);

  // --- WEBSOCKET LISTENER ---
  useEffect(() => {
    if (realtimePayload) {
      const myProjects = (realtimePayload.projects || []).filter(p => p.creatorEmail === currentUserEmail);
      const myTasks = (realtimePayload.tasks || []).filter(t => t.creatorEmail === currentUserEmail);

      if (myProjects.length > 0 && typeof setProjects === 'function') {
        setProjects(prev => {
          const newProjects = myProjects.filter(np => !prev.some(p => p.id === np.id));
          return [...newProjects, ...prev];
        });
      }
      
      if (myTasks.length > 0) {
        setTasks(prev => {
          const newTasks = myTasks.filter(nt => !prev.some(t => t.id === nt.id));
          return [...newTasks, ...prev];
        });
      }
    }
  }, [realtimePayload, currentUserEmail]); 

  // --- MODAL STATE ---
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [modalError, setModalError] = useState('');

  const initialProjectForm = { id: null, title: '', description: '', tags: '', associatedFiles: '', associatedEmails: '' };
  const initialTaskForm = { id: null, projectId: '', name: '', description: '', tags: '', begin: '', deadline: '', predicted: '', completed: false };
  
  const [projectForm, setProjectForm] = useState(initialProjectForm);
  const [taskForm, setTaskForm] = useState(initialTaskForm);
  const [isPredicting, setIsPredicting] = useState(false);

  // --- DATA FETCHING (PAGINATED) ---
  const fetchProjectsBatch = async (email, currentOffset) => {
    if (isFetchingProjects || !hasMoreProjects) return;
    setIsFetchingProjects(true);

    try {
      const response = await fetch('http://localhost:3000/graphql', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `query GetProjects($email: String!, $limit: Int, $offset: Int) {
            projectsByUser(email: $email, limit: $limit, offset: $offset) { id title description tags creatorEmail associatedFiles associatedEmails }
          }`,
          variables: { email, limit: ITEMS_PER_PAGE, offset: currentOffset }
        })
      });
      const json = await response.json();
      const newBatch = json.data?.projectsByUser || [];

      if (newBatch.length < ITEMS_PER_PAGE) setHasMoreProjects(false);
      
      setProjects(prev => {
        const filtered = newBatch.filter(nb => !prev.some(p => p.id === nb.id));
        return currentOffset === 0 ? newBatch : [...prev, ...filtered];
      });
      setProjectOffset(currentOffset + ITEMS_PER_PAGE);
    } catch (err) { console.error("> NETWORK ERROR", err); }
    finally { setIsFetchingProjects(false); }
  };

  const fetchTasksBatch = async (email, currentOffset) => {
    if (isFetchingTasks || !hasMoreTasks) return;
    setIsFetchingTasks(true);

    try {
      const response = await fetch('http://localhost:3000/graphql', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `query GetTasks($email: String!, $limit: Int, $offset: Int) {
            tasksByUser(email: $email, limit: $limit, offset: $offset) { id projectId title description tags status completed predicted start end }
          }`,
          variables: { email, limit: ITEMS_PER_PAGE, offset: currentOffset }
        })
      });
      const json = await response.json();
      const newBatch = json.data?.tasksByUser || [];

      if (newBatch.length < ITEMS_PER_PAGE) setHasMoreTasks(false);

      setTasks(prev => {
        const filtered = newBatch.filter(nb => !prev.some(t => t.id === nb.id));
        return currentOffset === 0 ? newBatch : [...prev, ...filtered];
      });
      setTaskOffset(currentOffset + ITEMS_PER_PAGE);
    } catch (err) { console.error("> NETWORK ERROR", err); }
    finally { setIsFetchingTasks(false); }
  };

  useEffect(() => {
    const email = localStorage.getItem('loggedInUserEmail');
    if (!email) { navigate('/login'); return; }
    setCurrentUserEmail(email);
    
    // Initial Load
    fetchProjectsBatch(email, 0);
    fetchTasksBatch(email, 0);
  }, []);

  // --- PREFETCHING OBSERVERS ---
  const lastTaskElementRef = useCallback(node => {
    if (isFetchingTasks) return;
    if (taskObserver.current) taskObserver.current.disconnect();
    
    taskObserver.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMoreTasks) {
        fetchTasksBatch(currentUserEmail, taskOffset);
      }
    }, { rootMargin: '400px' }); 
    
    if (node) taskObserver.current.observe(node);
  }, [isFetchingTasks, hasMoreTasks, taskOffset, currentUserEmail]);

  const lastProjectElementRef = useCallback(node => {
    if (isFetchingProjects) return;
    if (projectObserver.current) projectObserver.current.disconnect();
    
    projectObserver.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMoreProjects) {
        fetchProjectsBatch(currentUserEmail, projectOffset);
      }
    }, { rootMargin: '400px' });
    
    if (node) projectObserver.current.observe(node);
  }, [isFetchingProjects, hasMoreProjects, projectOffset, currentUserEmail]);

  // --- ACTIONS ---
  const startGenerator = async () => {
    try { 
      await fetch('http://localhost:3000/graphql', { 
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: `mutation StartGen($email: String!) { startGenerator(email: $email) }`, variables: { email: currentUserEmail } })
      }); 
    } catch (err) { console.error("Could not start generator."); }
  };

  const stopGenerator = async () => {
    try { 
      await fetch('http://localhost:3000/graphql', { 
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: `mutation { stopGenerator }` })
      }); 
    } catch (err) { console.error("Could not stop generator."); }
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

  const saveProject = async () => {
    setModalError('');
    const isNew = !projectForm.id;
    
    const uiPayload = {
      id: isNew ? Date.now() : projectForm.id,
      title: projectForm.title, description: projectForm.description, creatorEmail: currentUserEmail,
      tags: projectForm.tags.split('|').map(s => s.trim()).filter(Boolean),
      associatedFiles: projectForm.associatedFiles.split(',').map(s => s.trim()).filter(Boolean),
      associatedEmails: projectForm.associatedEmails.split(',').map(s => s.trim()).filter(Boolean)
    };

    if (isNew) setProjects([...projects, uiPayload]);
    else setProjects(projects.map(p => p.id === uiPayload.id ? { ...p, ...uiPayload } : p));
    setIsProjectModalOpen(false);

    const variables = isNew ? {
      title: uiPayload.title, description: uiPayload.description, creatorEmail: uiPayload.creatorEmail, tags: uiPayload.tags, associatedFiles: uiPayload.associatedFiles.join(','), associatedEmails: uiPayload.associatedEmails.join(',')
    } : {
      id: uiPayload.id.toString(), title: uiPayload.title, description: uiPayload.description, tags: uiPayload.tags, associatedFiles: uiPayload.associatedFiles.join(','), associatedEmails: uiPayload.associatedEmails.join(',')
    };

    const gqlPayload = {
      query: isNew ? `mutation CreateProject($title: String!, $description: String!, $creatorEmail: String!, $tags: [String!]!, $associatedFiles: String, $associatedEmails: String) { createProject(title: $title, description: $description, creatorEmail: $creatorEmail, tags: $tags, associatedFiles: $associatedFiles, associatedEmails: $associatedEmails) { id } }` 
      : `mutation UpdateProject($id: ID!, $title: String, $description: String, $tags: [String!], $associatedFiles: String, $associatedEmails: String) { updateProject(id: $id, title: $title, description: $description, tags: $tags, associatedFiles: $associatedFiles, associatedEmails: $associatedEmails) { id } }`,
      variables
    };

    if (!isOnline) {
      queueAction('http://localhost:3000/graphql', 'POST', gqlPayload);
      return;
    }

    try {
      const response = await fetch('http://localhost:3000/graphql', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(gqlPayload) });
      const json = await response.json();
      if (json.errors) throw new Error(json.errors[0].message);
    } catch (err) {
      console.error("> SYSTEM ERROR saving project: ", err.message);
      queueAction('http://localhost:3000/graphql', 'POST', gqlPayload);
    }
  };

  const deleteProject = async (id) => {
    if (window.confirm("Remove Project? WARNING: This will cascade and delete all associated tasks locally and on the server!")) {
      const targetId = parseInt(id);
      setProjects(projects.filter(p => parseInt(p.id) !== targetId));
      setTasks(tasks.filter(t => parseInt(t.projectId) !== targetId));

      const projectGqlPayload = { query: `mutation DeleteProject($id: ID!) { deleteProject(id: $id) }`, variables: { id: id.toString() } };

      if (!isOnline) { queueAction('http://localhost:3000/graphql', 'POST', projectGqlPayload); return; }

      try {
        const response = await fetch('http://localhost:3000/graphql', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(projectGqlPayload) });
        const json = await response.json();
        if (json.errors) throw new Error(json.errors[0].message);
      } catch (err) { 
        console.error("> SYSTEM ERROR deleting project: ", err.message); 
        queueAction('http://localhost:3000/graphql', 'POST', projectGqlPayload);
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

  const saveTask = async () => {
    setModalError('');
    const isNew = !taskForm.id;
    
    const uiPayload = {
      id: isNew ? Date.now() : taskForm.id, projectId: parseInt(taskForm.projectId), title: taskForm.name, description: taskForm.description, creatorEmail: currentUserEmail, status: taskForm.completed ? 'completed' : 'pending', completed: taskForm.completed, tags: taskForm.tags.split('|').map(s => s.trim()).filter(Boolean), start: taskForm.begin, end: taskForm.deadline, predicted: parseFloat(taskForm.predicted) || 0
    };

    if (isNew) setTasks([...tasks, uiPayload]);
    else setTasks(tasks.map(t => t.id === uiPayload.id ? { ...t, ...uiPayload } : t));
    setIsTaskModalOpen(false);

    const variables = isNew ? {
      projectId: uiPayload.projectId, title: uiPayload.title, description: uiPayload.description, creatorEmail: uiPayload.creatorEmail, status: uiPayload.status, completed: uiPayload.completed, tags: uiPayload.tags, end: uiPayload.end, predicted: uiPayload.predicted
    } : {
      id: uiPayload.id.toString(), projectId: uiPayload.projectId, title: uiPayload.title, description: uiPayload.description, status: uiPayload.status, completed: uiPayload.completed, tags: uiPayload.tags, end: uiPayload.end, predicted: uiPayload.predicted
    };

    const gqlPayload = {
      query: isNew ? `mutation CreateTask($projectId: Int!, $title: String!, $description: String!, $creatorEmail: String!, $status: String!, $completed: Boolean!, $tags: [String!]!, $end: String!, $predicted: Float!) { createTask(projectId: $projectId, title: $title, description: $description, creatorEmail: $creatorEmail, status: $status, completed: $completed, tags: $tags, end: $end, predicted: $predicted) { id } }` 
      : `mutation UpdateTask($id: ID!, $projectId: Int, $title: String, $description: String, $status: String, $completed: Boolean, $tags: [String!], $end: String, $predicted: Float) { updateTask(id: $id, projectId: $projectId, title: $title, description: $description, status: $status, completed: $completed, tags: $tags, end: $end, predicted: $predicted) { id } }`,
      variables
    };

    if (!isOnline) { queueAction('http://localhost:3000/graphql', 'POST', gqlPayload); return; }

    try {
      const response = await fetch('http://localhost:3000/graphql', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(gqlPayload) });
      const json = await response.json();
      if (json.errors) throw new Error(json.errors[0].message);
    } catch (err) {
      console.error("> SYSTEM ERROR saving task: ", err.message);
      queueAction('http://localhost:3000/graphql', 'POST', gqlPayload);
    }
  };
   
  const deleteTask = async (id) => {
    if (window.confirm("Remove Task?")) {
      setTasks(tasks.filter(t => t.id !== id));
      const gqlPayload = { query: `mutation DeleteTask($id: ID!) { deleteTask(id: $id) }`, variables: { id: id.toString() } };

      if (!isOnline) { queueAction('http://localhost:3000/graphql', 'POST', gqlPayload); return; }

      try {
        await fetch('http://localhost:3000/graphql', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(gqlPayload) });
      } catch (err) { queueAction('http://localhost:3000/graphql', 'POST', gqlPayload); }
    }
  };

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
        
        <button 
          onClick={() => setIsSimulatingOffline(!isSimulatingOffline)}
          style={{ background: isSimulatingOffline ? '#00FF41' : '#ff3333', color: '#000', border: 'none', padding: '5px 15px', fontWeight: 'bold', cursor: 'pointer', borderRadius: '3px' }}
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
          <span style={{ color: 'var(--text-muted)', fontWeight: 'bold', alignSelf: 'center', marginRight: '15px' }}>SERVER DATA GENERATOR:</span>
          <button onClick={startGenerator} className="btn" style={{ background: '#00FF41', color: '#000', fontWeight: 'bold' }}>▶ START</button>
          <button onClick={stopGenerator} className="btn btn-danger" style={{ fontWeight: 'bold' }}>■ STOP</button>
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

          <div style={{ overflowX: 'auto', maxHeight: '400px' }}>
            <table style={{ width: '100%', minWidth: '600px', borderCollapse: 'collapse' }}>
              <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                <tr>
                  <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid var(--border-dark)', color: '#fff', background: '#111' }}>ID</th>
                  <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid var(--border-dark)', color: '#fff', background: '#111' }}>Title</th>
                  <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid var(--border-dark)', color: '#fff', background: '#111' }}>Tags</th>
                  <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid var(--border-dark)', color: '#fff', background: '#111' }}>Creator</th>
                  <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid var(--border-dark)', color: '#fff', background: '#111' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {projects.length === 0 ? (
                  <tr><td colSpan="5" style={{ padding: '20px', textAlign: 'center', color: '#888' }}>No projects available.</td></tr>
                ) : (
                  projects.map((p, index) => {
                    const isLast = projects.length === index + 1;
                    return (
                      <tr key={p.id} ref={isLast ? lastProjectElementRef : null}>
                        <td style={{ padding: '12px', borderBottom: '1px solid var(--border-dark)' }}>{p.id}</td>
                        <td style={{ padding: '12px', borderBottom: '1px solid var(--border-dark)' }}>{p.title}</td>
                        <td style={{ padding: '12px', borderBottom: '1px solid var(--border-dark)' }}>{p.tags ? p.tags.join(' | ') : ''}</td>
                        <td style={{ padding: '12px', borderBottom: '1px solid var(--border-dark)' }}>{p.creatorEmail}</td>
                        <td style={{ padding: '12px', borderBottom: '1px solid var(--border-dark)', display: 'flex', gap: '10px' }}>
                          <button onClick={() => openProjectModal(p)} className="btn btn-sm">Edit</button>
                          <button onClick={() => deleteProject(p.id)} className="btn btn-sm btn-danger">Remove</button>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
            {isFetchingProjects && <div style={{ padding: '10px', textAlign: 'center', color: 'var(--neon-green)' }}>Loading more projects...</div>}
            {!hasMoreProjects && projects.length > 0 && <div style={{ padding: '10px', textAlign: 'center', color: '#888' }}>End of projects list.</div>}
          </div>
        </div>

        {/* RESPONSIVE TASKS TABLE */}
        <div style={{ marginBottom: '50px', background: 'var(--bg-panel)', padding: 'clamp(15px, 3vw, 30px)', border: '1px solid var(--border-dark)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', flexWrap: 'wrap', gap: '10px' }}>
            <h2 style={{ margin: 0 }}>User's Tasks</h2>
            <button onClick={() => openTaskModal()} className="btn btn-sm">+ Add New Task</button>
          </div>

          <div style={{ overflowX: 'auto', maxHeight: '500px' }}>
            <table style={{ width: '100%', minWidth: '800px', borderCollapse: 'collapse' }}>
              <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
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
                {tasks.length === 0 ? (
                   <tr><td colSpan="7" style={{ padding: '20px', textAlign: 'center', color: '#888' }}>No tasks available.</td></tr>
                ) : (
                  tasks.map((t, index) => {
                    const isLast = tasks.length === index + 1;
                    return (
                      <tr key={t.id} ref={isLast ? lastTaskElementRef : null}>
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
                    )
                  })
                )}
              </tbody>
            </table>
            {isFetchingTasks && <div style={{ padding: '10px', textAlign: 'center', color: 'var(--neon-green)' }}>Loading more tasks...</div>}
            {!hasMoreTasks && tasks.length > 0 && <div style={{ padding: '10px', textAlign: 'center', color: '#888' }}>End of tasks list.</div>}
          </div>
        </div>

      </div>

      {/* PROJECT MODAL */}
      {isProjectModalOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(5, 5, 5, 0.9)', zIndex: 1000, display: 'flex', justifyContent: 'center', alignItems: 'center', backdropFilter: 'blur(5px)', padding: '15px', boxSizing: 'border-box' }}>
          <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--neon-green)', padding: 'clamp(20px, 5vw, 30px)', width: '100%', maxWidth: '600px', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 0 30px rgba(0, 255, 65, 0.1)', boxSizing: 'border-box' }}>
            <h2 style={{ marginTop: 0, fontSize: 'clamp(18px, 4vw, 24px)' }}>{projectForm.id ? "Inspect Project Page (Edit)" : "Add New Project Popup"}</h2>
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

      {/* TASK MODAL */}
      {isTaskModalOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(5, 5, 5, 0.9)', zIndex: 1000, display: 'flex', justifyContent: 'center', alignItems: 'center', backdropFilter: 'blur(5px)', padding: '15px', boxSizing: 'border-box' }}>
          <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--neon-green)', padding: 'clamp(20px, 5vw, 30px)', width: '100%', maxWidth: '600px', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 0 30px rgba(0, 255, 65, 0.1)', boxSizing: 'border-box' }}>
            <h2 style={{ marginTop: 0, fontSize: 'clamp(18px, 4vw, 24px)' }}>{taskForm.id ? "Inspect Task Page (Edit)" : "Add New Task Popup"}</h2>
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
                <input type="number" value={taskForm.predicted} onChange={e => setTaskForm({...taskForm, predicted: e.target.value})} style={{ flex: '1 1 150px', padding: '10px', background: 'var(--bg-dark)', border: '1px solid var(--border-dark)', color: 'var(--neon-green)', boxSizing: 'border-box' }} />
                <button onClick={handleAIPredict} disabled={isPredicting} className="btn" style={{ flex: '1 1 120px', background: '#333', border: '1px solid var(--neon-green)', color: 'var(--neon-green)' }}>
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