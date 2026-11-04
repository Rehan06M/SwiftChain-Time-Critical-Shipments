
import { useEffect } from "react";
import Shipments from "./pages/Shipments";
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
} from "react-router-dom";
import DispatcherRecovery from "./pages/DispatcherRecovery";

import { AuthProvider, useAuth } from "./context/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";

import Login from "./pages/Login";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";


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

function GuestOnly({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="loading-screen">
        Loading...
      </div>
    );
  }

  if (user) {
    return (
      <Navigate
        to={`/dashboard/${user.role}`}
        replace
      />
    );
  }

  return <>{children}</>;
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<LandingRedirect />} />

          <Route
            path="/login"
            element={
              <GuestOnly>
                <Login />
              </GuestOnly>
            }
          />

          <Route
            path="/register"
            element={
              <GuestOnly>
                <Register />
              </GuestOnly>
            }
          />

          <Route element={<ProtectedRoute />}>
            <Route
              path="/dashboard"
              element={<DashboardRedirect />}
            />


            <Route
              path="/dashboard/shipper"
              element={<Shipments />}
            />


            <Route
              path="/dashboard/:role"
              element={<Dashboard />}
            />
          </Route>

          <Route
            path="*"
            element={<Navigate to="/" replace />}
          />

          <Route
  element={<ProtectedRoute allowedRoles={["dispatcher"]} />}
>
  <Route
    path="/dispatcher/recovery"
    element={<DispatcherRecovery />}
  />
</Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
