"use client";

export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: "4rem 1rem", textAlign: "center" }}>
        <h1>The shop is having a moment</h1>
        <p>Something did not load. Your bag is saved in this browser.</p>
        <button onClick={() => reset()} style={{ padding: "0.75rem 1.5rem", marginTop: "1rem" }}>
          Try again
        </button>
      </body>
    </html>
  );
}
