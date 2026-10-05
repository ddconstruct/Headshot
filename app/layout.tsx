const SITE_URL = "https://headshot-five-neon.vercel.app";
const OG_IMAGE = `${SITE_URL}/og-image.jpg`;
const TAGLINE =
  "Professional AI headshots from everyday selfies. No studio visit, no $300 sitting fee. Packages from $29.";

export const metadata = {
  title: "Top Notch AI Headshots — Studio-quality headshots from your selfies",
  description: TAGLINE,
  manifest: "/manifest.json",
  themeColor: "#0a1120",
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  openGraph: {
    title: "Top Notch AI Headshots — Studio-quality headshots from your selfies",
    description:
      "Upload a few selfies, get studio-quality headshots back. Packages from $29 — no studio visit, no sitting fee.",
    url: SITE_URL,
    siteName: "Top Notch AI Headshots",
    type: "website",
    images: [
      {
        url: OG_IMAGE,
        width: 1200,
        height: 630,
        alt: "Professional studio headshot of a smiling businessman",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Top Notch AI Headshots — Studio-quality headshots from your selfies",
    description:
      "Upload a few selfies, get studio-quality headshots back. Packages from $29 — no studio visit, no sitting fee.",
    images: [OG_IMAGE],
  },
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
