import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Mobile Sensors",
  description: "Phone-to-PC sensor relay via WebSocket",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#111", color: "#eee" }}>
        {children}
      </body>
    </html>
  );
}
