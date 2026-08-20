"use client";
import { useState, useEffect, useRef } from "react";
import { UserCircle2, LogOut, ChevronDown, Shield } from "lucide-react";

interface AuthUser {
  displayName: string;
  email: string;
  avatarColor: string;
}

interface UserProfileButtonProps {
  user: AuthUser | null;
  onLoginClick: () => void;
  onLogout: () => void;
  onAdminClick: () => void;
  isAdminEligible: boolean;
}

export default function UserProfileButton({ user, onLoginClick, onLogout, onAdminClick, isAdminEligible }: UserProfileButtonProps) {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    if (isDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isDropdownOpen]);

  const loginBtnStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    padding: "0.45rem 0.85rem",
    border: "1px solid #252525",
    borderRadius: "9999px",
    background: "transparent",
    color: "#a0a0a0",
    fontSize: "0.88rem",
    fontFamily: "'Source Sans 3', sans-serif",
    cursor: "pointer",
    transition: "all 150ms ease",
    whiteSpace: "nowrap"
  };

  const profileBtnStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "0.55rem",
    padding: "0.3rem 0.65rem 0.3rem 0.3rem",
    border: "1px solid transparent",
    borderRadius: "9999px",
    background: "transparent",
    color: "#fff",
    fontSize: "0.88rem",
    fontFamily: "'Source Sans 3', sans-serif",
    cursor: "pointer",
    transition: "all 150ms ease"
  };

  const avatarStyle: React.CSSProperties = {
    width: "30px",
    height: "30px",
    borderRadius: "50%",
    display: "grid",
    placeItems: "center",
    fontSize: "0.82rem",
    fontWeight: 700,
    color: "#fff",
    background: user?.avatarColor ?? "#6366f1",
    flexShrink: 0
  };

  const dropdownStyle: React.CSSProperties = {
    position: "absolute",
    top: "calc(100% + 6px)",
    right: 0,
    width: "220px",
    background: "rgba(17, 17, 17, 0.95)",
    border: "1px solid #252525",
    borderRadius: "8px",
    boxShadow: "0 12px 40px rgba(0, 0, 0, 0.5)",
    overflow: "hidden",
    zIndex: 100
  };

  const dropdownHeaderStyle: React.CSSProperties = {
    padding: "0.85rem 1rem",
    borderBottom: "1px solid #1a1a1a"
  };

  const dropdownNameStyle: React.CSSProperties = {
    fontSize: "0.9rem",
    fontWeight: 600,
    color: "#fff",
    marginBottom: "0.15rem"
  };

  const dropdownEmailStyle: React.CSSProperties = {
    fontSize: "0.78rem",
    color: "#888"
  };

  const logoutBtnStyle: React.CSSProperties = {
    width: "100%",
    display: "flex",
    alignItems: "center",
    gap: "0.6rem",
    padding: "0.7rem 1rem",
    border: "none",
    background: "transparent",
    color: "#a0a0a0",
    fontSize: "0.88rem",
    fontFamily: "'Source Sans 3', sans-serif",
    cursor: "pointer",
    transition: "all 150ms ease",
    textAlign: "left"
  };

  if (!user) {
    return (
      <button
        style={loginBtnStyle}
        onClick={onLoginClick}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = "#444";
          e.currentTarget.style.color = "#fff";
          e.currentTarget.style.background = "rgba(255,255,255,0.04)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = "#252525";
          e.currentTarget.style.color = "#a0a0a0";
          e.currentTarget.style.background = "transparent";
        }}
        id="login-button"
      >
        <UserCircle2 size={18} />
        Log in
      </button>
    );
  }

  const initials = user.displayName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <div ref={dropdownRef} style={{ position: "relative" }}>
      <button
        style={profileBtnStyle}
        onClick={() => setIsDropdownOpen(!isDropdownOpen)}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "rgba(255,255,255,0.05)";
          e.currentTarget.style.borderColor = "#252525";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "transparent";
          e.currentTarget.style.borderColor = "transparent";
        }}
        id="user-profile-button"
      >
        <span style={avatarStyle}>{initials}</span>
        <span style={{ maxWidth: "100px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {user.displayName}
        </span>
        <ChevronDown
          size={14}
          style={{
            color: "#666",
            transition: "transform 200ms",
            transform: isDropdownOpen ? "rotate(180deg)" : "rotate(0)"
          }}
        />
      </button>

      {isDropdownOpen && (
        <div className="auth-card" style={dropdownStyle}>
          <div style={dropdownHeaderStyle}>
            <div style={dropdownNameStyle}>{user.displayName}</div>
            <div style={dropdownEmailStyle}>{user.email}</div>
          </div>
          {isAdminEligible && (
            <button
              style={logoutBtnStyle}
              onClick={() => {
                setIsDropdownOpen(false);
                onAdminClick();
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "rgba(99, 102, 241, 0.12)";
                e.currentTarget.style.color = "#c7d2fe";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.color = "#a0a0a0";
              }}
            >
              <Shield size={16} />
              Owner access
            </button>
          )}
          <button
            style={logoutBtnStyle}
            onClick={() => {
              setIsDropdownOpen(false);
              onLogout();
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(239, 68, 68, 0.08)";
              e.currentTarget.style.color = "#f87171";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.color = "#a0a0a0";
            }}
            id="logout-button"
          >
            <LogOut size={16} />
            Log out
          </button>
        </div>
      )}
    </div>
  );
}
