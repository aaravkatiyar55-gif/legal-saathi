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

  const avatarStyle: React.CSSProperties = {
    width: "30px",
    height: "30px",
    borderRadius: "50%",
    display: "grid",
    placeItems: "center",
    fontSize: "0.82rem",
    fontWeight: 700,
    color: "#fff",
    background: user?.avatarColor ?? "#557898",
    flexShrink: 0
  };

  if (!user) {
    return (
      <button
        type="button"
        className="account-login-trigger"
        onClick={onLoginClick}
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
    <div ref={dropdownRef} className="account-menu-wrap">
      <button
        type="button"
        className="account-menu-trigger"
        onClick={() => setIsDropdownOpen(!isDropdownOpen)}
        id="user-profile-button"
        aria-expanded={isDropdownOpen}
        aria-controls="account-menu-actions"
      >
        <span style={avatarStyle}>{initials}</span>
        <span className="account-menu-name">
          {user.displayName}
        </span>
        <ChevronDown
          size={14}
          className={isDropdownOpen ? "account-menu-chevron is-open" : "account-menu-chevron"}
        />
      </button>

      {isDropdownOpen && (
        <div id="account-menu-actions" className="account-menu" role="menu">
          <div className="account-menu-identity">
            <div className="account-menu-display-name">{user.displayName}</div>
            <div className="account-menu-email">{user.email}</div>
          </div>
          {isAdminEligible && (
            <button
              type="button"
              className="account-menu-action account-menu-owner-action"
              role="menuitem"
              onClick={() => {
                setIsDropdownOpen(false);
                onAdminClick();
              }}
            >
              <Shield size={16} />
              Owner access
            </button>
          )}
          {!isAdminEligible && <p className="account-menu-owner-note">Owner tools appear after an authorized Google sign-in.</p>}
          <button
            type="button"
            className="account-menu-action account-menu-logout-action"
            role="menuitem"
            onClick={() => {
              setIsDropdownOpen(false);
              onLogout();
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
