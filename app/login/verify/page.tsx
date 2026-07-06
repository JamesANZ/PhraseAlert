import Link from "next/link";

export default function VerifyLoginPage() {
  return (
    <main className="page-shell">
      <div className="clarify-panel">
        <div className="page-header">
          <h1>Check your email</h1>
          <p>
            We sent you a sign-in link. Click it to continue to your watches.
          </p>
        </div>
        <p className="hero-note">
          In development, the link is printed in the server console.
        </p>
        <p className="hero-note" style={{ marginTop: 16 }}>
          <Link href="/login">Use a different email</Link>
        </p>
      </div>
    </main>
  );
}
