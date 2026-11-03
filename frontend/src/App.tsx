
import { useEffect, useState } from "react";
import "./App.css";

interface BackendHealth {
  success: boolean;
  service: string;
  status: string;
  message: string;
}

function App() {
  const [backend, setBackend] =
    useState<BackendHealth | null>(null);

  const [error, setError] = useState("");

  useEffect(() => {
    async function checkConnection() {
      try {
        const response = await fetch(
          `${import.meta.env.VITE_API_URL}/health`
        );

        if (!response.ok) {
          throw new Error("Backend request failed");
        }

        const data: BackendHealth =
          await response.json();

        setBackend(data);
      } catch {
        setError("Cannot connect to backend");
      }
    }

    checkConnection();
  }, []);

  return (
    <main className="setup-page">
      <div className="setup-card">
        <div className="setup-logo">SC</div>

        <h1>SwiftChain</h1>

        <p className="subtitle">
          Intelligent Logistics Management Platform
        </p>

        <div className="connection-box">
          {backend ? (
            <>
              <span className="status-dot" />
              Backend connected successfully
            </>
          ) : error ? (
            <span className="error">{error}</span>
          ) : (
            "Connecting to backend..."
          )}
        </div>

        <p className="setup-note">
          {backend
            ? "Frontend and backend are communicating."
            : "Checking API connection..."}
        </p>

        <span className="setup-label">
          DEVELOPMENT ENVIRONMENT
        </span>
      </div>
    </main>
  );
}

export default App;
