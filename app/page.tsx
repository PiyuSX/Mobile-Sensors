import Link from "next/link";

export default function Home() {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", gap: 24 }}>
      <h1>Mobile Sensors</h1>
      <p>Open the appropriate page for your device:</p>
      <div style={{ display: "flex", gap: 16 }}>
        <Link href="/pc" style={{ padding: "12px 32px", background: "#333", color: "#fff", borderRadius: 8, textDecoration: "none", fontSize: 18 }}>
          PC Game
        </Link>
        <Link href="/mobile" style={{ padding: "12px 32px", background: "#333", color: "#fff", borderRadius: 8, textDecoration: "none", fontSize: 18 }}>
          Mobile Controller
        </Link>
      </div>
    </div>
  );
}
