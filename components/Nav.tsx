import Link from "next/link";
import { auth, signOut } from "@/lib/auth";

export async function Nav() {
  const session = await auth();

  return (
    <header className="nav">
      <div className="nav-inner">
        <Link className="brand" href="/">
          <span className="brand-mark" aria-hidden="true" />
          Bellwether
        </Link>
        <nav className="nav-links" aria-label="Main">
          <a href="/#difference">Why it&apos;s different</a>
          <a href="/#how">How it works</a>
          <a href="/#pricing">Pricing</a>
          {session?.user ? (
            <Link href="/watches">Your watches</Link>
          ) : (
            <Link href="/login">Sign in</Link>
          )}
        </nav>
        {session?.user ? (
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <Link className="btn btn-small btn-primary" href="/watches/new">
              Create a watch
            </Link>
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/" });
              }}
            >
              <button className="btn btn-small btn-ghost" type="submit">
                Sign out
              </button>
            </form>
          </div>
        ) : (
          <Link className="btn btn-small btn-primary" href="/login">
            Sign in
          </Link>
        )}
      </div>
    </header>
  );
}
