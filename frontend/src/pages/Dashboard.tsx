
import { useEffect, useState } from "react";
import {
  Link,
  Navigate,
  // useNavigate,
  useParams,
} from "react-router-dom";
import {
  ArrowRight,
  LogOut,
  Package,
  ShieldCheck,
  Truck,
} from "lucide-react";

import { useAuth } from "../context/AuthContext";
import { apiRequest } from "../lib/api";

const descriptions = {
  shipper:
    "Your shipment management workspace is ready. Shipment creation, quotes, and tracking will be added in the upcoming development steps.",
  dispatcher:
    "Your logistics control tower is ready. Risk monitoring, carrier assignments, and recovery actions will be added in the upcoming development steps.",
  carrier:
    "Your carrier workspace is ready. Assignments, milestone updates, and delivery confirmation will be added in the upcoming development steps.",
};

export default function Dashboard() {
  const { role } = useParams();
  const { user, logout } = useAuth();
  // const navigate = useNavigate();

  const [apiStatus, setApiStatus] = useState(
    "Verifying dashboard access..."
  );

  useEffect(() => {
    if (!user || role !== user.role) return;

    let active = true;

    apiRequest<{ message: string }>(
      `/dashboard/${role}`
    )
      .then((data) => {
        if (active) setApiStatus(data.message);
      })
      .catch((error) => {
        if (active) {
          setApiStatus(
            error instanceof Error
              ? error.message
              : "Access check failed"
          );
        }
      });

    return () => {
      active = false;
    };
  }, [user, role]);

  if (!user) return null;

  if (role !== user.role) {
    return (
      <Navigate to={`/dashboard/${user.role}`} replace />
    );
  }


  async function handleLogout() {
    try {
      await logout();

      window.location.replace("/");
    } catch {
      setApiStatus(
        "Unable to log out. Please try again."
      );
    }
  }


  return (
    <main className="dashboard-page">
      <header className="dashboard-header">
        <Link className="brand" to="/dashboard">
          <span className="brand-mark">
            <Truck size={20} />
          </span>
          SwiftChain
        </Link>

        <button
          className="logout-button"
          onClick={handleLogout}
        >
          <LogOut size={17} />
          Logout
        </button>
      </header>

      <div className="dashboard-container">
        <span className="section-eyebrow eyebrow-dark">
          SWIFTCHAIN WORKSPACE
        </span>

        <h1>Welcome, {user.fullName.split(" ")[0]}.</h1>

        <p className="dashboard-intro">
          You're signed in to your secure logistics workspace.
        </p>

        <div className="dashboard-grid">
          <div className="info-card">
            <Package size={25} className="card-icon" />
            <h2>Your workspace</h2>
            <p className="role-name">{user.role}</p>
            <p>{descriptions[user.role]}</p>
          </div>

          <div className="info-card">
            <ShieldCheck size={25} className="card-icon" />
            <h2>Account information</h2>
            <p><strong>Name:</strong> {user.fullName}</p>
            <p><strong>Email:</strong> {user.email}</p>
            <p>
              <strong>Organization:</strong>{" "}
              {user.organizationName ?? "Not provided"}
            </p>
          </div>
        </div>

        <div className="dashboard-message">
          <div>
            <strong>Backend authorization</strong>
            <p>{apiStatus}</p>
          </div>
          <ArrowRight size={22} />
        </div>
      </div>
    </main>
  );
}
