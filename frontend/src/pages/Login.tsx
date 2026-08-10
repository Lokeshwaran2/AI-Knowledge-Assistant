import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function Login() {
  const { login, register, isLoading } = useAuth();
  const navigate = useNavigate();
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      if (isRegisterMode) {
        await register(email, password);
      } else {
        await login(email, password);
      }
      navigate('/dashboard');
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        'Something went wrong. Please try again.';
      setError(msg);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        {/* Header */}
        <div className="login-header">
          <div className="login-logo">🧠</div>
          <h1 className="login-title">AI Knowledge Assistant</h1>
          <p className="login-subtitle">
            {isRegisterMode
              ? 'Create your account to get started'
              : 'Sign in to access your knowledge base'}
          </p>
        </div>

        {/* Form */}
        <form className="login-form" onSubmit={handleSubmit} id="auth-form">
          {error && <div className="form-error" role="alert">{error}</div>}

          <div className="form-group">
            <label htmlFor="email-input">Email address</label>
            <input
              id="email-input"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
            />
          </div>

          <div className="form-group">
            <label htmlFor="password-input">Password</label>
            <input
              id="password-input"
              type="password"
              placeholder={isRegisterMode ? 'At least 6 characters' : 'Your password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
            />
          </div>

          <button
            id="auth-submit-button"
            type="submit"
            className="btn-primary"
            disabled={isLoading}
          >
            {isLoading
              ? 'Please wait…'
              : isRegisterMode
              ? 'Create Account'
              : 'Sign In'}
          </button>
        </form>

        {/* Toggle */}
        <div className="login-toggle">
          <span>{isRegisterMode ? 'Already have an account?' : "Don't have an account?"}</span>
          <button
            id="auth-toggle-button"
            className="toggle-link"
            onClick={() => { setIsRegisterMode((m) => !m); setError(''); }}
          >
            {isRegisterMode ? 'Sign In' : 'Create Account'}
          </button>
        </div>
      </div>
    </div>
  );
}
