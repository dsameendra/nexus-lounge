"use client";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", background: "#000", color: "#fff", fontFamily: "-apple-system, system-ui, sans-serif", textAlign: "center", padding: 24 }}>
        <div>
          <h1>Something went wrong</h1>
          <button onClick={reset} style={{ height: 48, padding: "0 28px", border: 0, borderRadius: 12, background: "#0a84ff", color: "#fff", fontSize: 16, fontWeight: 600 }}>
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
