import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const Navbar = ({ onSearch }) => {
  const { user, logout, theme, updateTheme } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchVal, setSearchVal] = useState('');

  const handleSearch = (e) => {
    setSearchVal(e.target.value);
    if (onSearch) onSearch(e.target.value);
  };

  const handleSearchSubmit = (e) => {
    if (e.key === 'Enter') {
      navigate(`/?search=${searchVal}`);
      setMobileMenuOpen(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
    setMenuOpen(false);
    setMobileMenuOpen(false);
  };

  const toggleTheme = () => {
    updateTheme(theme === 'dark' ? 'light' : 'dark');
  };

  const closeMobileMenu = () => setMobileMenuOpen(false);

  return (
    <nav className="navbar">
      <div className="navbar-inner">
        <Link to="/" className="navbar-logo">
          🎬 <span className="hide-mobile">VideoStream</span>
        </Link>

        <div className="navbar-search">
          <span className="search-icon">🔍</span>
          <input
            className="form-control"
            placeholder="Search videos..."
            value={searchVal}
            onChange={handleSearch}
            onKeyDown={handleSearchSubmit}
          />
        </div>

        {/* Desktop actions - hidden on mobile via CSS */}
        <div className="navbar-actions navbar-actions-desktop">
          <button
            onClick={toggleTheme}
            className="btn btn-secondary btn-sm btn-icon"
            title="Toggle theme"
          >
            {theme === "dark" ? "☀️" : "🌙"}
          </button>

          {user ? (
            <>
              <Link to="/profile" className="btn btn-secondary btn-sm hide-mobile">
                👤 Profile
              </Link>
              <Link to="/upload" className="btn btn-primary btn-sm hide-mobile">
                📤 Upload
              </Link>
              <Link to="/downloads" className="btn btn-secondary btn-sm hide-mobile">
                ⬇️ Downloads
              </Link>
              <Link to="/subscription" className="btn btn-secondary btn-sm hide-mobile">
                ⭐ Subscription
              </Link>
              <Link to="/my-parties" className="btn btn-secondary btn-sm hide-mobile">
                🎉 Watch Parties
              </Link>

              <div style={{ position: "relative" }} className="hide-mobile">
                <button
                  className="avatar"
                  onClick={() => setMenuOpen((m) => !m)}
                  style={{ cursor: "pointer", border: "none" }}
                >
                  {user.avatar ? (
                    <img src={user.avatar} alt={user.username} />
                  ) : (
                    user.username[0].toUpperCase()
                  )}
                </button>

                {menuOpen && (
                  <div style={{
                    position: "absolute", right: 0, top: "110%",
                    background: "var(--bg-card)", border: "1px solid var(--border)",
                    borderRadius: "var(--radius-sm)", padding: "8px 0",
                    minWidth: "200px", zIndex: 200, boxShadow: "var(--shadow)",
                  }}>
                    <div style={{ padding: "8px 16px", fontSize: 13, color: "var(--text-secondary)" }}>
                      <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>{user.username}</div>
                      <span className={`badge badge-${user.plan}`} style={{ marginTop: 4 }}>
                        {user.plan.toUpperCase()}
                      </span>
                    </div>
                    <hr style={{ border: "none", borderTop: "1px solid var(--border)", margin: "4px 0" }} />
                    <button
                      onClick={handleLogout}
                      style={{
                        display: "block", width: "100%", textAlign: "left",
                        padding: "8px 16px", fontSize: 14, background: "none",
                        border: "none", color: "var(--danger)", cursor: "pointer",
                      }}
                    >
                      🚪 Logout
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <Link to="/login" className="btn btn-secondary btn-sm">Login</Link>
              <Link to="/register" className="btn btn-primary btn-sm">Sign Up</Link>
            </>
          )}
        </div>

        {/* Mobile hamburger - shown only on mobile via CSS */}
        <button
          className="navbar-hamburger"
          onClick={() => setMobileMenuOpen(o => !o)}
          aria-label="Open menu"
        >
          {mobileMenuOpen ? '✕' : '☰'}
        </button>
      </div>

      {/* Mobile dropdown menu */}
      {mobileMenuOpen && (
        <div className="navbar-mobile-menu">
          <button
            onClick={() => { toggleTheme(); }}
            className="navbar-mobile-link"
          >
            {theme === "dark" ? "☀️ Light Mode" : "🌙 Dark Mode"}
          </button>

          {user ? (
            <>
              <div className="navbar-mobile-user">
                <div className="avatar" style={{ width: 32, height: 32, fontSize: 13 }}>
                  {user.avatar ? <img src={user.avatar} alt={user.username} /> : user.username[0].toUpperCase()}
                </div>
                <div>
                  <div style={{ fontWeight: 600 }}>{user.username}</div>
                  <span className={`badge badge-${user.plan}`}>{user.plan.toUpperCase()}</span>
                </div>
              </div>
              <Link to="/profile" className="navbar-mobile-link" onClick={closeMobileMenu}>👤 Profile</Link>
              <Link to="/upload" className="navbar-mobile-link" onClick={closeMobileMenu}>📤 Upload</Link>
              <Link to="/downloads" className="navbar-mobile-link" onClick={closeMobileMenu}>⬇️ Downloads</Link>
              <Link to="/subscription" className="navbar-mobile-link" onClick={closeMobileMenu}>⭐ Subscription</Link>
              <Link to="/my-parties" className="navbar-mobile-link" onClick={closeMobileMenu}>🎉 Watch Parties</Link>
              <button onClick={handleLogout} className="navbar-mobile-link navbar-mobile-logout">
                🚪 Logout
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className="navbar-mobile-link" onClick={closeMobileMenu}>Login</Link>
              <Link to="/register" className="navbar-mobile-link" onClick={closeMobileMenu}>Sign Up</Link>
            </>
          )}
        </div>
      )}
    </nav>
  );
};

export default Navbar;
