"use client";
import { MessageSquare } from "lucide-react";
import { useState } from "react";

interface ChatBubbleProps {
  onClick: () => void;
}

export default function ChatBubble({ onClick }: ChatBubbleProps) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div 
      style={{ 
        position: "fixed", 
        bottom: "2rem", 
        right: "2rem", 
        display: "flex", 
        alignItems: "center", 
        gap: "1rem",
        zIndex: 90
      }}
    >
      {isHovered && (
        <div 
          className="fade-in" 
          style={{ 
            background: "var(--bg-elevated)", 
            padding: "0.5rem 1rem", 
            borderRadius: "var(--radius-md)",
            border: "1px solid var(--border-default)",
            boxShadow: "var(--shadow-glow)"
          }}
        >
          Ask AI about this document
        </div>
      )}
      
      <button 
        className="btn-primary"
        onClick={onClick}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        style={{ 
          width: "60px", 
          height: "60px", 
          borderRadius: "var(--radius-full)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          border: "none",
          cursor: "pointer",
          boxShadow: "var(--shadow-glow)",
          transition: "transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)",
          transform: isHovered ? "scale(1.1)" : "scale(1)"
        }}
      >
        <MessageSquare size={24} />
      </button>
    </div>
  );
}
