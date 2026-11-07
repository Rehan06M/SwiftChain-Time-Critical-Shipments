import GoogleSignInButton from "../components/GoogleSignInButton";
import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { ArrowRight, Eye, EyeOff, LockKeyhole, Mail, Truck, Package, Route } from "lucide-react";
import { useAuth } from "../context/AuthContext";

export default function Login() {
  const { user, loading, login } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [selectedRole, setSelectedRole] = useState<"shipper" | "dispatcher" | "carrier">("shipper");
  const [selectedDemoRole, setSelectedDemoRole] = useState<
    "dispatcher" | "carrier" | null
  >(null);

  if (loading) {
    return <div className="loading-screen">Loading...</div>;
  }

  if (user) {
    return <Navigate to={`/dashboard/${user.role}`} replace />;
  }

  function handleSelectDemo(role: "dispatcher" | "carrier") {
    if (submitting) return;
    setSelectedRole(role);
    setSelectedDemoRole(role);
    setError("");
    setEmail(role === "dispatcher" ? "dispatcher@swiftchain.test" : "carrier@swiftchain.test");
    setPassword(""); // Never embed an account password in the browser bundle.
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

          <div className="auth-role-picker" role="group" aria-label="Sign-in workspace">
            {([
              { id: "shipper", label: "Shipper", Icon: Package },
              { id: "dispatcher", label: "Dispatcher", Icon: Route },
              { id: "carrier", label: "Carrier", Icon: Truck },
            ] as const).map(({ id, label, Icon }) => (
              <button type="button" key={id} aria-pressed={selectedRole === id}
                className={`auth-role-option ${selectedRole === id ? "is-selected" : ""}`}
                onClick={() => { setSelectedRole(id); setSelectedDemoRole(null); }}>
                <Icon size={19}/><span>{label}</span>
              </button>
            ))}
          </div>
          <p className="auth-role-hint">Your account's verified role determines the dashboard after login.</p>

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
                onChange={(e) => { setEmail(e.target.value); setSelectedDemoRole(null); }}
                autoComplete="email"
                required
              />
            </div>

            <label htmlFor="password">Password</label>
            <div className="input-wrap password-wrap">
              <LockKeyhole size={18} />
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                placeholder="Enter your password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setSelectedDemoRole(null); }}
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                className="password-toggle-btn"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                tabIndex={0}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>

            {/* Try a demo account area */}
            <div className="demo-credentials-area">
              <div className="demo-credentials-label">
                <span>Try a demo account</span>
              </div>
              <div className="demo-credentials-grid">
                <button
                  type="button"
                  className={`demo-credential-btn ${
                    selectedDemoRole === "dispatcher" ? "is-selected" : ""
                  }`}
                  onClick={() => handleSelectDemo("dispatcher")}
                  disabled={submitting}
                >
                  <span className="demo-role-tag">Demo Dispatcher</span>
                  <span className="demo-email-tag">dispatcher@swiftchain.test</span>
                </button>
                <button
                  type="button"
                  className={`demo-credential-btn ${
                    selectedDemoRole === "carrier" ? "is-selected" : ""
                  }`}
                  onClick={() => handleSelectDemo("carrier")}
                  disabled={submitting}
                >
                  <span className="demo-role-tag">Demo Carrier</span>
                  <span className="demo-email-tag">carrier@swiftchain.test</span>
                </button>
              </div>
              <p className="auth-demo-note">Choose an account, then enter its locally configured password.</p>
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
