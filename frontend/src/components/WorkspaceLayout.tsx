import { useState, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  Truck,
  LayoutDashboard,
  Package,
  RotateCcw,
  LogOut,
  Menu,
  X,
  Clock,
  User as UserIcon,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";

interface Props {
  children: ReactNode;
  pageTitle: string;
  pageSubtitle?: string;
  pageEyebrow?: string;
  headerActions?: ReactNode;
  refreshedAt?: string;
}

export default function WorkspaceLayout({
  children,
  pageTitle,
  pageSubtitle,
  pageEyebrow,
  headerActions,
  refreshedAt,
}: Props) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await logout();
      window.location.replace("/");
    } catch {
      setLoggingOut(false);
    }
  }

  if (!user) return null;

  const role = user.role;
  const currentPath = location.pathname;

  // Role-based navigation items
  const navItems = [];
  if (role === "shipper") {
    navItems.push(
      {
        label: "Overview",
        path: "/dashboard/shipper",
        icon: LayoutDashboard,
        exactMatch: true,
      },
      {
        label: "Shipments",
        path: "/shipments",
        icon: Package,
        exactMatch: false,
      }
    );
  } else if (role === "dispatcher") {
    navItems.push(
      {
        label: "Overview",
        path: "/dashboard/dispatcher",
        icon: LayoutDashboard,
        exactMatch: true,
      },
      {
        label: "Recovery Workspace",
        path: "/dispatcher/recovery",
        icon: RotateCcw,
        exactMatch: false,
      }
    );
  } else if (role === "carrier") {
    navItems.push({
      label: "Operations",
      path: "/dashboard/carrier",
      icon: Truck,
      exactMatch: true,
    });
  }

  const isNavActive = (path: string, exact: boolean) => {
    if (exact) {
      return (
        currentPath === path ||
        (path.startsWith("/dashboard/") && currentPath === "/dashboard")
      );
    }
    return currentPath === path || currentPath.startsWith(path + "/");
  };

  const roleBadgeText =
    role === "shipper"
      ? "Shipper"
      : role === "dispatcher"
        ? "Dispatcher"
        : "Carrier";

  return (
    <div className="workspace-app">
      {/* Mobile Drawer Backdrop */}
      {mobileMenuOpen && (
        <div
          className="workspace-backdrop"
          onClick={() => setMobileMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar Navigation (Desktop + Mobile Drawer) */}
      <aside
        className={`workspace-sidebar ${mobileMenuOpen ? "is-open" : ""}`}
        aria-label="Workspace navigation"
      >
        <div className="workspace-sidebar-top">
          <div className="workspace-brand-row">
            <Link
              to={role === "shipper" ? "/dashboard/shipper" : role === "dispatcher" ? "/dashboard/dispatcher" : "/dashboard/carrier"}
              className="workspace-brand"
              onClick={() => setMobileMenuOpen(false)}
            >
              <span className="workspace-brand-icon">
                <Truck size={20} />
              </span>
              <span className="workspace-brand-text">SwiftChain</span>
            </Link>

            <button
              type="button"
              className="workspace-mobile-close"
              onClick={() => setMobileMenuOpen(false)}
              aria-label="Close navigation"
            >
              <X size={20} />
            </button>
          </div>

          <div className="workspace-role-pill">
            <span className="workspace-role-dot" />
            <span className="workspace-role-name">{roleBadgeText} Workspace</span>
          </div>
        </div>

        <nav className="workspace-nav">
          <div className="workspace-nav-section-title">Navigation</div>
          <ul className="workspace-nav-list">
            {navItems.map((item) => {
              const active = isNavActive(item.path, item.exactMatch);
              const Icon = item.icon;
              return (
                <li key={item.path}>
                  <Link
                    to={item.path}
                    className={`workspace-nav-link ${active ? "is-active" : ""}`}
                    onClick={() => setMobileMenuOpen(false)}
                    aria-current={active ? "page" : undefined}
                  >
                    <Icon size={18} className="workspace-nav-icon" />
                    <span>{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="workspace-sidebar-footer">
          <div className="workspace-user-card">
            <div className="workspace-user-avatar">
              <UserIcon size={16} />
            </div>
            <div className="workspace-user-info">
              <span className="workspace-user-name">{user.fullName}</span>
              <span className="workspace-user-org">
                {user.organizationName || user.email}
              </span>
            </div>
          </div>

          <button
            type="button"
            className="workspace-logout-btn"
            onClick={handleLogout}
            disabled={loggingOut}
            title="Log out of SwiftChain"
          >
            <LogOut size={16} />
            <span>{loggingOut ? "Signing out..." : "Sign out"}</span>
          </button>
        </div>
      </aside>

      {/* Main Layout Area */}
      <div className="workspace-shell">
        {/* Top Header */}
        <header className="workspace-header">
          <div className="workspace-header-left">
            <button
              type="button"
              className="workspace-mobile-toggle"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open navigation menu"
            >
              <Menu size={20} />
            </button>

            <div className="workspace-header-titles">
              {pageEyebrow && (
                <span className="workspace-eyebrow">{pageEyebrow}</span>
              )}
              <h1 className="workspace-title">{pageTitle}</h1>
              {pageSubtitle && (
                <p className="workspace-subtitle">{pageSubtitle}</p>
              )}
            </div>
          </div>

          <div className="workspace-header-right">
            {refreshedAt && (
              <div
                className="workspace-refresh-badge"
                title={`Last updated: ${new Date(refreshedAt).toLocaleTimeString("en-IN")}`}
              >
                <Clock size={13} />
                <span>
                  Refreshed{" "}
                  {new Date(refreshedAt).toLocaleTimeString("en-IN", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
            )}

            <div className="workspace-status-badge">
              <span className="workspace-status-dot" />
              <span>Operational</span>
            </div>

            {headerActions && (
              <div className="workspace-header-actions">{headerActions}</div>
            )}
          </div>
        </header>

        {/* Content Body */}
        <main className="workspace-body">{children}</main>
      </div>
    </div>
  );
}
