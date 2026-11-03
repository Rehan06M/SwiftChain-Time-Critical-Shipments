import GoogleSignInButton from "../components/GoogleSignInButton";
import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  Building2,
  LockKeyhole,
  Mail,
  Truck,
  UserRound,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";

export default function Register() {
  const { user, loading, register } = useAuth();
  const navigate = useNavigate();

  const [fullName, setFullName] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
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

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (password.length < 12 || password.length > 72) {
      setError("Use a password between 12 and 72 characters");
      return;
    }

    setSubmitting(true);

    try {
      await register({
        fullName,
        organizationName,
        email,
        password,
      });

      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Registration failed"
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
          <span className="section-eyebrow">
            SMARTER DELIVERY OPERATIONS
          </span>

          <h1>
            Move faster.
            <br />
            <span>Stay ahead.</span>
          </h1>

          <p>
            From urgent shipment creation to proactive
            delay prevention, SwiftChain helps your
            business keep critical deliveries on track.
          </p>

          <div className="aside-line" />

          <div className="aside-caption">
            CREATE. MONITOR. OPTIMIZE.
          </div>
        </div>
      </aside>

      <section className="auth-main">
        <div className="auth-panel">
          <span className="section-eyebrow eyebrow-dark">
            GET STARTED
          </span>

          <h2>Create your account</h2>

          <p className="auth-description">
            Set up your business logistics workspace.
          </p>

          <form onSubmit={handleSubmit}>
            {error && (
              <div className="form-alert" role="alert">
                {error}
              </div>
            )}

            <label htmlFor="fullName">Full name</label>
            <div className="input-wrap">
              <UserRound size={18} />
              <input
                id="fullName"
                type="text"
                placeholder="Your full name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                autoComplete="name"
                maxLength={120}
                required
              />
            </div>

            <label htmlFor="organizationName">
              Company / Organization
            </label>
            <div className="input-wrap">
              <Building2 size={18} />
              <input
                id="organizationName"
                type="text"
                placeholder="Company name"
                value={organizationName}
                onChange={(e) =>
                  setOrganizationName(e.target.value)
                }
                autoComplete="organization"
                maxLength={160}
                required
              />
            </div>

            <label htmlFor="email">Work email</label>
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
                placeholder="Minimum 12 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                minLength={12}
                maxLength={72}
                required
              />
            </div>

            <label htmlFor="confirmPassword">
              Confirm password
            </label>
            <div className="input-wrap">
              <LockKeyhole size={18} />
              <input
                id="confirmPassword"
                type="password"
                placeholder="Repeat your password"
                value={confirmPassword}
                onChange={(e) =>
                  setConfirmPassword(e.target.value)
                }
                autoComplete="new-password"
                required
              />
            </div>

            <button
              className="primary-button"
              type="submit"
              disabled={submitting}
            >
              {submitting ? "Creating account..." : "Create account"}
              <ArrowRight size={18} />
            </button>
          </form>

          <GoogleSignInButton onError={setError} />

          <p className="auth-switch">
            Already have an account?{" "}
            <Link to="/login">Sign in</Link>
          </p>
        </div>
      </section>
    </main>
  );
}
