"use client";

type MfaCodeFieldProps = {
  id: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  label?: string;
  hint?: string;
};

export function MfaCodeField({
  id,
  value,
  onChange,
  disabled = false,
  label = "Authenticator code",
  hint = "Enter the current six-digit code from your authenticator app.",
}: MfaCodeFieldProps) {
  return (
    <label htmlFor={id} style={{ display: "grid", gap: "0.45rem" }}>
      <span className="text-secondary" style={{ fontSize: "0.82rem" }}>{label}</span>
      <input
        id={id}
        className="apple-glass-input"
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]{6}"
        maxLength={6}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value.replace(/\D/g, "").slice(0, 6))}
        placeholder="123456"
        aria-describedby={`${id}-hint`}
        style={{ width: "10rem", letterSpacing: "0.18em", fontVariantNumeric: "tabular-nums" }}
      />
      <span id={`${id}-hint`} className="text-secondary" style={{ fontSize: "0.75rem" }}>
        {hint}
      </span>
    </label>
  );
}
