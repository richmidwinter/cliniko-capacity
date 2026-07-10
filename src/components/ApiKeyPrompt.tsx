import { useState } from "react";

interface Props {
  error?: string;
  onSubmit: (key: string) => void;
}

/** Modal asking the user for their Cliniko API key (stored only in localStorage). */
export function ApiKeyPrompt({ error, onSubmit }: Props) {
  const [value, setValue] = useState("");
  const trimmed = value.trim();

  return (
    <div className="modal-backdrop">
      <form
        className="modal"
        onSubmit={(e) => {
          e.preventDefault();
          if (trimmed) onSubmit(trimmed);
        }}
      >
        <h2>Cliniko API key</h2>
        <p className="hint">
          Paste your Cliniko API key (Cliniko → My Info → Manage API keys). It’s stored only in this
          browser’s local storage and sent directly to Cliniko via the local proxy — never saved on a server.
        </p>
        <input
          type="password"
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="MS0x…-uk2"
          aria-label="Cliniko API key"
        />
        {error && <div className="error">{error}</div>}
        <div className="modal-actions">
          <button type="submit" disabled={!trimmed}>Save &amp; load</button>
        </div>
      </form>
    </div>
  );
}
