import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {useOfflineSync} from '../useOfflineSync';

export default function Login() {
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState('login');
  
  const [errors, setErrors] = useState({}); 
  const [generalError, setGeneralError] = useState(''); 
  const [successMsg, setSuccessMsg] = useState('');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [experience, setExperience] = useState('');

  const { isOnline } = useOfflineSync(null);

  const handleTabSwitch = (tabName) => {
    setActiveTab(tabName);
    setErrors({});
    setGeneralError('');
    setSuccessMsg('');
  };

  
  const handleLogin = async (e) => {
    e.preventDefault();
    setErrors({});
    setGeneralError('');
    setSuccessMsg('');

    // Lightweight client validation for instant UX
    let validationErrors = {};
    if (!email) validationErrors.email = '> ERROR: EMAIL IS REQUIRED.';
    if (!password) validationErrors.password = '> ERROR: PASSWORD IS REQUIRED.';
    
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    try {
      const response = await fetch('http://localhost:3000/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `
            mutation Login($email: String!, $password: String!) {
              login(email: $email, passwordHash: $password) {
                message
                data { email }
              }
            }
          `,
          variables: { email, password }
        })
      });
      
      const resData = await response.json();
      
      if (resData.errors) {
        setGeneralError(`> AUTH ERROR: ${resData.errors[0].message}`);
      } else {
        localStorage.setItem('loggedInUserEmail', resData.data.login.data.email);
        navigate('/presentation'); 
      }
    } catch (err) {
      console.error(err);
      setGeneralError('> SYSTEM ERROR: COULD NOT REACH AUTH SERVER.');
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setErrors({});
    setGeneralError('');
    setSuccessMsg('');

    // We leave password confirmation on the client, as the server only needs one hash
    if (password !== confirmPassword) {
      setErrors({ confirmPassword: '> ERROR: PASSWORDS DO NOT MATCH.' });
      return;
    }

    try {
      const response = await fetch('http://localhost:3000/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `
            mutation Register($username: String!, $email: String!, $password: String!, $experience: Int!) {
              register(username: $username, email: $email, passwordHash: $password, experienceYears: $experience) {
                message
              }
            }
          `,
          variables: { username, email, password, experience: parseInt(experience) || 0 }
        })
      });

      const resData = await response.json();

      if (resData.errors) {
        setGeneralError(`> SERVER REJECTED: ${resData.errors[0].message}`);
      } else {
        setSuccessMsg('> SYSTEM MESSAGE: USER INITIALIZED SUCCESSFULLY. PLEASE LOGIN.');
        setUsername(''); setConfirmPassword(''); setExperience(''); setPassword('');
        setActiveTab('login'); 
      }
    } catch(err){
      console.error(err);
      setGeneralError('> CRITICAL ERROR: COULD NOT REACH THE BACKEND.');
    }
  };
  

  return (
    // Outer container: added padding and box-sizing to protect edges on mobile screens
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', padding: '15px', boxSizing: 'border-box' }}>
      
      {/* Inner card: Width 100% allows it to shrink on small screens, maxWidth 400px stops it from growing too big */}
      <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--neon-green)', padding: 'clamp(20px, 6vw, 40px)', width: '100%', maxWidth: '400px', borderRadius: '4px', boxShadow: '0 0 20px rgba(0, 255, 65, 0.15)', boxSizing: 'border-box' }}>
        
        <div style={{ textAlign: 'center', fontSize: 'clamp(20px, 6vw, 24px)', fontWeight: 'bold', marginBottom: '30px', textShadow: '0 0 10px rgba(0, 255, 65, 0.5)' }}>
          ~/ProjectUi
        </div>

        {/* --- TABS --- */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border-dark)', marginBottom: '20px' }}>
          <div onClick={() => handleTabSwitch('login')} style={{ flex: 1, textAlign: 'center', padding: '10px', cursor: 'pointer', fontWeight: 'bold', transition: 'all 0.3s', color: activeTab === 'login' ? 'var(--neon-green)' : 'var(--text-muted)', borderBottom: activeTab === 'login' ? '2px solid var(--neon-green)' : 'none', fontSize: 'clamp(12px, 3.5vw, 16px)' }}>
            LOGIN
          </div>
          <div onClick={() => handleTabSwitch('register')} style={{ flex: 1, textAlign: 'center', padding: '10px', cursor: 'pointer', fontWeight: 'bold', transition: 'all 0.3s', color: activeTab === 'register' ? 'var(--neon-green)' : 'var(--text-muted)', borderBottom: activeTab === 'register' ? '2px solid var(--neon-green)' : 'none', fontSize: 'clamp(12px, 3.5vw, 16px)' }}>
            REGISTER
          </div>
        </div>

        {/* --- GENERAL MESSAGES (Server errors or success) --- */}
        {generalError && <div style={{ color: 'var(--danger-red)', fontSize: '12px', marginBottom: '15px', textShadow: '0 0 5px rgba(255, 51, 51, 0.5)' }}>{generalError}</div>}
        {successMsg && <div style={{ color: 'var(--neon-green)', fontSize: '12px', marginBottom: '15px', textShadow: '0 0 5px rgba(0, 255, 65, 0.5)' }}>{successMsg}</div>}

        {/* --- LOGIN FORM --- */}
        {activeTab === 'login' && (
          <form onSubmit={handleLogin} noValidate>
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '14px', marginBottom: '8px' }}>EMAIL ADDRESS</label>
              <input type="email" placeholder="user@gmail.com" value={email} onChange={(e) => setEmail(e.target.value)} required style={{ width: '100%', padding: '12px', background: 'var(--bg-dark)', border: '1px solid var(--border-dark)', color: 'var(--neon-green)', boxSizing: 'border-box', fontFamily: 'inherit' }} />
              {errors.email && <div style={{ color: 'var(--danger-red)', fontSize: '12px', marginTop: '5px', textShadow: '0 0 5px rgba(255, 51, 51, 0.5)' }}>{errors.email}</div>}
            </div>
            
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '14px', marginBottom: '8px' }}>PASSWORD</label>
              <input type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required style={{ width: '100%', padding: '12px', background: 'var(--bg-dark)', border: '1px solid var(--border-dark)', color: 'var(--neon-green)', boxSizing: 'border-box', fontFamily: 'inherit' }} />
              {errors.password && <div style={{ color: 'var(--danger-red)', fontSize: '12px', marginTop: '5px', textShadow: '0 0 5px rgba(255, 51, 51, 0.5)' }}>{errors.password}</div>}
            </div>

            <button type="submit" disabled={!isOnline} style={{ width: '100%', padding: '12px', background: 'transparent', border: '1px solid var(--neon-green)', color: 'var(--neon-green)', cursor: 'pointer', fontWeight: 'bold', textTransform: 'uppercase', marginTop: '10px', transition: 'all 0.3s' }}>
              Authenticate
            </button>

            {/* NEW: OFFLINE BANNER */}
            {!isOnline && (
              <div style={{ background: 'var(--danger-red)', color: '#fff', padding: '10px', textAlign: 'center', marginTop: '20px', fontWeight: 'bold' }}>
                &gt; CRITICAL: SYSTEM OFFLINE. AUTHENTICATION DISABLED.
              </div>
            )}
          </form>
        )}

        {/* --- REGISTER FORM --- */}
        {activeTab === 'register' && (
          <form onSubmit={handleRegister} noValidate>
            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', fontSize: '12px', marginBottom: '5px' }}>USERNAME</label>
              <input type="text" placeholder="Enter username (5-30 chars)" value={username} onChange={(e) => setUsername(e.target.value)} required style={{ width: '100%', padding: '10px', background: 'var(--bg-dark)', border: '1px solid var(--border-dark)', color: 'var(--neon-green)', boxSizing: 'border-box', fontFamily: 'inherit' }} />
              {errors.username && <div style={{ color: 'var(--danger-red)', fontSize: '12px', marginTop: '5px', textShadow: '0 0 5px rgba(255, 51, 51, 0.5)' }}>{errors.username}</div>}
            </div>

            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', fontSize: '12px', marginBottom: '5px' }}>EMAIL ADDRESS</label>
              <input type="email" placeholder="user@gmail.com" value={email} onChange={(e) => setEmail(e.target.value)} required style={{ width: '100%', padding: '10px', background: 'var(--bg-dark)', border: '1px solid var(--border-dark)', color: 'var(--neon-green)', boxSizing: 'border-box', fontFamily: 'inherit' }} />
              {errors.email && <div style={{ color: 'var(--danger-red)', fontSize: '12px', marginTop: '5px', textShadow: '0 0 5px rgba(255, 51, 51, 0.5)' }}>{errors.email}</div>}
            </div>

            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', fontSize: '12px', marginBottom: '5px' }}>PASSWORD</label>
              <input type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required style={{ width: '100%', padding: '10px', background: 'var(--bg-dark)', border: '1px solid var(--border-dark)', color: 'var(--neon-green)', boxSizing: 'border-box', fontFamily: 'inherit' }} />
              {errors.password && <div style={{ color: 'var(--danger-red)', fontSize: '12px', marginTop: '5px', textShadow: '0 0 5px rgba(255, 51, 51, 0.5)' }}>{errors.password}</div>}
            </div>

            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', fontSize: '12px', marginBottom: '5px' }}>CONFIRM PASSWORD</label>
              <input type="password" placeholder="••••••••" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required style={{ width: '100%', padding: '10px', background: 'var(--bg-dark)', border: '1px solid var(--border-dark)', color: 'var(--neon-green)', boxSizing: 'border-box', fontFamily: 'inherit' }} />
              {errors.confirmPassword && <div style={{ color: 'var(--danger-red)', fontSize: '12px', marginTop: '5px', textShadow: '0 0 5px rgba(255, 51, 51, 0.5)' }}>{errors.confirmPassword}</div>}
            </div>

            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', fontSize: '12px', marginBottom: '5px' }}>EXPERIENCE (YEARS)</label>
              <input type="number" placeholder="e.g., 3" min="0" value={experience} onChange={(e) => setExperience(e.target.value)} required style={{ width: '100%', padding: '10px', background: 'var(--bg-dark)', border: '1px solid var(--border-dark)', color: 'var(--neon-green)', boxSizing: 'border-box', fontFamily: 'inherit' }} />
              {errors.experience && <div style={{ color: 'var(--danger-red)', fontSize: '12px', marginTop: '5px', textShadow: '0 0 5px rgba(255, 51, 51, 0.5)' }}>{errors.experience}</div>}
            </div>

            <button type="submit" disabled={!isOnline} style={{ width: '100%', padding: '12px', background: 'transparent', border: '1px solid var(--neon-green)', color: 'var(--neon-green)', cursor: 'pointer', fontWeight: 'bold', textTransform: 'uppercase', marginTop: '10px', transition: 'all 0.3s' }}>
              Initialize User
            </button>

            {/* NEW: OFFLINE BANNER */}
            {!isOnline && (
              <div style={{ background: 'var(--danger-red)', color: '#fff', padding: '10px', textAlign: 'center', fontWeight: 'bold', marginTop: '20px' }}>
                &gt; CRITICAL: SYSTEM OFFLINE. REGISTRATION DISABLED.
              </div>
            )}
          </form>
        )}
      </div>
    </div>
  );
}