import { useEffect, type ReactNode } from "react";
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
} from "react-router-dom";

import { AuthProvider, useAuth } from "./context/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";

import Login from "./pages/Login";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";
import Shipments from "./pages/Shipments";
import DispatcherRecovery from "./pages/DispatcherRecovery";

function LandingRedirect() {
  useEffect(() => {
    window.location.replace("/landing.html");
  }, []);

  return (
    <div className="loading-screen">
      Opening SwiftChain...
    </div>
  );
}

function DashboardRedirect() {
  const { user } = useAuth();

  return (
    <Navigate
      to={`/dashboard/${user?.role ?? "shipper"}`}
      replace
    />
  );
}

function GuestOnly({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="loading-screen">Loading...</div>;
  }

  if (user) {
    return (
      <Navigate to={`/dashboard/${user.role}`} replace />
    );
  }

  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<LandingRedirect />} />

          <Route
            path="/login"
            element={<GuestOnly><Login /></GuestOnly>}
          />

          <Route
            path="/register"
            element={<GuestOnly><Register /></GuestOnly>}
          />

          <Route element={<ProtectedRoute />}>
            <Route
              path="/dashboard"
              element={<DashboardRedirect />}
            />
          </Route>

          <Route
            element={<ProtectedRoute allowedRoles={["shipper"]} />}
          >
            <Route
              path="/dashboard/shipper"
              element={<Dashboard />}
            />
            <Route path="/shipments" element={<Shipments />} />
          </Route>

          <Route
            element={<ProtectedRoute allowedRoles={["dispatcher"]} />}
          >
            <Route
              path="/dashboard/dispatcher"
              element={<Dashboard />}
            />
            <Route
              path="/dispatcher/recovery"
              element={<DispatcherRecovery />}
            />
          </Route>

          <Route
            element={<ProtectedRoute allowedRoles={["carrier"]} />}
          >
            <Route
              path="/dashboard/carrier"
              element={<Dashboard />}
            />
          </Route>

          <Route
            path="*"
            element={<Navigate to="/" replace />}
          />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}