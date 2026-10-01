export const metadata = {
  title: "Top Notch AI Headshots — Studio-quality headshots from your selfies",
  description: "Professional AI headshots from everyday selfies. No studio visit, no $300 sitting fee. Packages from $29.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={styles.body}>
        <main>{children}</main>
        <style>{`
          * { box-sizing: border-box; }
          body { margin: 0; font-family: system-ui, -apple-system, sans-serif; }
        `}</style>
      </body>
    </html>
  );
}

const styles: Record<string, React.CSSProperties> = {
  body: { background: "#0a1120", color: "#f4f6fb", minHeight: "100vh" },
};
