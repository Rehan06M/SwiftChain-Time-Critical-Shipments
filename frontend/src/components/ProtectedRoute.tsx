
import {
  Navigate,
  Outlet,
  useLocation,
} from "react-router-dom";

import { useAuth } from "../context/AuthContext";
import type { User } from "../lib/api";

interface Props {
  allowedRoles?: User["role"][];
}

export default function ProtectedRoute({
  allowedRoles,
}: Props) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="loading-screen" role="status">
        Verifying your session...
      </div>
    );
  }

  if (!user) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: location }}
      />
    );
  }

  if (
    allowedRoles &&
    !allowedRoles.includes(user.role)
  ) {
    return (
      <Navigate
        to={`/dashboard/${user.role}`}
        replace
      />
    );
  }

  return <Outlet />;
}
