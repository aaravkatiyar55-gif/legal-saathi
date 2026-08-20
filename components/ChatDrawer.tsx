"use client";
import { X, Send } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { DocumentData, ChatMessage } from "@/lib/types";

interface ChatDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  document: DocumentData;
  onUpdateChat: (docId: string, history: ChatMessage[]) => void;
}

export default function ChatDrawer({ isOpen, onClose, document, onUpdateChat }: ChatDrawerProps) {
  const [inputText, setInputText] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [document.chatHistory, isThinking]);

  const handleSend = () => {
    if (!inputText.trim() || isThinking) return;

    const newHistory: ChatMessage[] = [...document.chatHistory, { role: "user", text: inputText.trim() }];
    onUpdateChat(document.id, newHistory);
    setInputText("");
    setIsThinking(true);

    setTimeout(() => {
      onUpdateChat(document.id, [...newHistory, { 
        role: "assistant", 
        text: "Based on the legal document provided, I recommend carefully reviewing the governing law and liability clauses. They contain standard but potentially broad language." 
      }]);
      setIsThinking(false);
    }, 1500);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className={`chat-drawer ${isOpen ? "open" : ""}`}>
      <div style={{ padding: "1.5rem", borderBottom: "1px solid var(--border-default)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h3>Ask AI Assistant</h3>
        <button className="btn" onClick={onClose} style={{ padding: "0.5rem", border: "none", background: "transparent" }}>
          <X size={20} />
        </button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1.5rem" }}>
        {document.chatHistory.map((msg, idx) => (
          <div key={idx} style={{ 
            alignSelf: msg.role === "user" ? "flex-end" : "flex-start",
            background: msg.role === "user" ? "var(--bg-elevated)" : "var(--surface-card)",
            padding: "1rem",
            borderRadius: "var(--radius-lg)",
            border: "1px solid var(--border-default)",
            maxWidth: "85%"
          }}>
            <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{msg.text}</p>
          </div>
        ))}
        {isThinking && (
          <div style={{ alignSelf: "flex-start", background: "var(--surface-card)", padding: "1rem", borderRadius: "var(--radius-lg)", border: "1px solid var(--border-default)" }}>
            <div style={{ display: "flex", gap: "4px" }}>
              <div style={{ width: "6px", height: "6px", background: "var(--text-secondary)", borderRadius: "50%", animation: "typing-bounce 1.4s infinite ease-in-out both" }} />
              <div style={{ width: "6px", height: "6px", background: "var(--text-secondary)", borderRadius: "50%", animation: "typing-bounce 1.4s infinite ease-in-out both", animationDelay: "0.2s" }} />
              <div style={{ width: "6px", height: "6px", background: "var(--text-secondary)", borderRadius: "50%", animation: "typing-bounce 1.4s infinite ease-in-out both", animationDelay: "0.4s" }} />
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div style={{ padding: "1.5rem", borderTop: "1px solid var(--border-default)" }}>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <textarea 
            className="apple-glass-input"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask a question about the document..."
            style={{ resize: "none", height: "60px" }}
          />
          <button 
            className="btn btn-primary"
            disabled={!inputText.trim() || isThinking}
            onClick={handleSend}
            style={{ opacity: (!inputText.trim() || isThinking) ? 0.3 : 1, padding: "0 1rem" }}
          >
            <Send size={20} />
          </button>
        </div>
      </div>
    </div>
  );
}
