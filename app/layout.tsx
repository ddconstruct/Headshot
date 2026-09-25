export const metadata = {
  title: "AI Headshots — Professional headshots from your selfies",
  description: "Upload 10–15 selfies, get studio-quality AI headshots.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={styles.body}>
        <main style={styles.main}>{children}</main>
        <style>{`
          * { box-sizing: border-box; }
          body { margin: 0; font-family: system-ui, -apple-system, sans-serif; }
        `}</style>
      </body>
    </html>
  );
}

const styles: Record<string, React.CSSProperties> = {
  body: { background: "#0f172a", color: "#f1f5f9", minHeight: "100vh" },
  main: { maxWidth: 640, margin: "0 auto", padding: "48px 20px" },
};
