import GoogleSignInButton from "../components/GoogleSignInButton";
import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { ArrowRight, LockKeyhole, Mail, Truck } from "lucide-react";
import { useAuth } from "../context/AuthContext";

export default function Login() {
  const { user, loading, login } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (loading) {
    return <div className="loading-screen">Loading...</div>;
  }

  if (user) {
    return <Navigate to={`/dashboard/${user.role}`} replace />;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      await login(email, password);
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Login failed"
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-layout">
      <aside className="auth-aside">
        <Link className="brand brand-light" to="/">
          <span className="brand-mark"><Truck size={22} /></span>
          SwiftChain
        </Link>

        <div className="aside-content">
          <span className="section-eyebrow">THE LOGISTICS CONTROL TOWER</span>
          <h1>
            Every second
            <br />
            <span>matters.</span>
          </h1>
          <p>
            Monitor critical shipments, spot delivery risks
            early, and make smarter decisions before
            deadlines are missed.
          </p>
          <div className="aside-line" />
          <div className="aside-caption">
            INTELLIGENT. PROACTIVE. CONNECTED.
          </div>
        </div>
      </aside>

      <section className="auth-main">
        <div className="auth-panel">
          <span className="section-eyebrow eyebrow-dark">
            WELCOME BACK
          </span>

          <h2>Sign in to SwiftChain</h2>

          <p className="auth-description">
            Access your logistics workspace.
          </p>

          <form onSubmit={handleSubmit}>
            {error && (
              <div className="form-alert" role="alert">{error}</div>
            )}

            <label htmlFor="email">Email address</label>
            <div className="input-wrap">
              <Mail size={18} />
              <input
                id="email"
                type="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
            </div>

            <label htmlFor="password">Password</label>
            <div className="input-wrap">
              <LockKeyhole size={18} />
              <input
                id="password"
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </div>

            <button
              className="primary-button"
              type="submit"
              disabled={submitting}
            >
              {submitting ? "Signing in..." : "Sign in"}
              <ArrowRight size={18} />
            </button>
          </form>

          <GoogleSignInButton onError={setError} />

          <p className="auth-switch">
            New to SwiftChain?{" "}
            <Link to="/register">Create an account</Link>
          </p>

          <Link to="/" className="back-link">
            Back to home
          </Link>
        </div>
      </section>
    </main>
  );
}
