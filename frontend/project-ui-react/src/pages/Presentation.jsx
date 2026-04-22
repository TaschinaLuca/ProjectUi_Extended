import { useNavigate } from 'react-router-dom';

export default function Presentation() {
  const navigate = useNavigate();

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '100vh',
      margin: 0,
      padding: '15px',
      boxSizing: 'border-box',
      overflow: 'hidden',
      backgroundColor: 'var(--bg-dark)',
      backgroundImage: `
        linear-gradient(rgba(0, 255, 65, 0.03) 1px, transparent 1px),
        linear-gradient(90deg, rgba(0, 255, 65, 0.03) 1px, transparent 1px)
      `,
      backgroundSize: '30px 30px'
    }}>
      
      <style>
        {`
          @keyframes blink {
            0%, 100% { opacity: 1; }
            50% { opacity: 0; }
          }
          .cursor {
            display: inline-block;
            width: clamp(6px, 1.5vw, 10px);
            height: clamp(14px, 3vw, 20px);
            background-color: var(--neon-green);
            vertical-align: text-bottom;
            margin-left: 5px;
            animation: blink 1s step-end infinite;
          }
          .btn-large:hover {
            background-color: var(--neon-green) !important;
            color: var(--bg-dark) !important;
            box-shadow: 0 0 25px rgba(0, 255, 65, 0.6) !important;
          }
        `}
      </style>

      {/* RESPONSIVE PRESENTATION CONTAINER */}
      <div style={{
        textAlign: 'center',
        width: '100%',
        maxWidth: '800px',
        padding: 'clamp(25px, 6vw, 50px)',
        backgroundColor: 'rgba(10, 10, 10, 0.85)',
        border: '1px solid var(--border-dark)',
        borderRadius: '8px',
        boxShadow: '0 0 30px rgba(0, 255, 65, 0.1)',
        backdropFilter: 'blur(5px)',
        boxSizing: 'border-box'
      }}>
        
        {/* RESPONSIVE SVG LOGO */}
        <div style={{ marginBottom: '20px', display: 'flex', justifyContent: 'center' }}>
          <svg width="100%" style={{ maxWidth: '260px', height: 'auto' }} viewBox="0 0 260 50" xmlns="http://www.w3.org/2000/svg">
            <text x="5" y="38" fill="#00FF41" fontFamily="'Courier New', monospace" fontSize="34px" fontWeight="bold" filter="drop-shadow(0px 0px 8px rgba(0, 255, 65, 0.5))">&lt;</text>
            <text x="35" y="36" fill="#ffffff" fontFamily="'Courier New', monospace" fontSize="30px" fontWeight="bold" letterSpacing="-1px">Project</text>
            <text x="165" y="36" fill="#00FF41" fontFamily="'Courier New', monospace" fontSize="30px" fontWeight="bold" filter="drop-shadow(0px 0px 8px rgba(0, 255, 65, 0.5))">Ui</text>
            <text x="210" y="38" fill="#00FF41" fontFamily="'Courier New', monospace" fontSize="34px" fontWeight="bold" filter="drop-shadow(0px 0px 8px rgba(0, 255, 65, 0.5))">/&gt;</text>
          </svg>
        </div>

        <h1 style={{
          fontSize: 'clamp(32px, 8vw, 48px)',
          fontWeight: 'bold',
          color: '#ffffff',
          margin: '0 0 10px 0',
          letterSpacing: '2px',
          textShadow: '0 0 15px rgba(255, 255, 255, 0.2)'
        }}>
          ProjectUi
        </h1>

        <h2 style={{
          fontSize: 'clamp(16px, 4vw, 20px)',
          color: 'var(--neon-green)',
          margin: '0 0 30px 0',
          fontWeight: 'normal',
          lineHeight: '1.4'
        }}>
          &gt; Predictive Project Management for Developers<span className="cursor"></span>
        </h2>

        <p style={{
          fontSize: 'clamp(14px, 3.5vw, 16px)',
          lineHeight: '1.6',
          color: 'var(--text-muted)',
          margin: '0 auto 40px auto',
          maxWidth: '600px'
        }}>
          A high-contrast, developer-first workspace designed to eliminate estimation anxiety. 
          Manage your CRUD operations, track task dependencies, and leverage our integrated AI module 
          to generate highly accurate, probabilistic time estimations based on your tech stack and experience level.
        </p>

        <button 
          className="btn-large"
          onClick={() => navigate('/home')}
          style={{
            padding: 'clamp(12px, 3vw, 15px) clamp(20px, 6vw, 40px)',
            backgroundColor: 'transparent',
            border: '2px solid var(--neon-green)',
            color: 'var(--neon-green)',
            fontFamily: "'Courier New', Courier, monospace",
            fontWeight: 'bold',
            fontSize: 'clamp(14px, 4vw, 18px)',
            cursor: 'pointer',
            transition: 'all 0.3s ease',
            textTransform: 'uppercase',
            letterSpacing: '2px',
            boxShadow: '0 0 10px rgba(0, 255, 65, 0.2)'
          }}
        >
          Enter Workspace
        </button>
      </div>

    </div>
  );
}