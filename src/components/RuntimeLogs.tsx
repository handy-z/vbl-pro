import { useEffect, useRef, useState } from "react";
import type { LogEntry } from "../hooks/useRuntime";

type RuntimeLogsProps = {
  logs: LogEntry[];
  lastError: string | null;
  onClear: () => void;
};

export function RuntimeLogs({ logs, lastError, onClear }: RuntimeLogsProps) {
  const logListRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);

  useEffect(() => {
    if (logListRef.current && isAtBottom) {
      logListRef.current.scrollTop = logListRef.current.scrollHeight;
    }
  }, [isAtBottom, logs]);

  function handleScroll() {
    if (!logListRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = logListRef.current;
    setIsAtBottom(scrollHeight - scrollTop - clientHeight < 20);
  }

  function scrollToBottom() {
    if (logListRef.current) {
      logListRef.current.scrollTop = logListRef.current.scrollHeight;
    }
  }

  return (
    <section className="panel log-panel">
      <div className="log-panel-header">
        <h2>Runtime Log {logs.length > 0 && <span className="log-count">({logs.length})</span>}</h2>
        <div className="log-panel-actions">
          {!isAtBottom && (
            <button onClick={scrollToBottom}>Bottom</button>
          )}
          {lastError && <span className="log-last-error">{lastError}</span>}
          <button onClick={onClear} disabled={logs.length === 0}>Clear</button>
        </div>
      </div>
      <div className="log-list" ref={logListRef} onScroll={handleScroll}>
        {logs.length === 0
          ? <p className="empty">No logs yet.</p>
          : logs.map((entry) => (
            <div key={entry.id} className={`log-entry ${entry.kind}`}>
              <span className="log-ts">{entry.ts}</span>
              <span className="log-msg">{entry.message}</span>
            </div>
          ))}
      </div>
    </section>
  );
}
