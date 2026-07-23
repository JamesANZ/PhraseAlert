import Link from "next/link";
import { auth, signOut } from "@/lib/auth";

export async function Nav() {
  const session = await auth();

  return (
    <header className="nav">
      <div className="nav-inner">
        <Link className="brand" href="/">
          <span className="brand-mark" aria-hidden="true" />
          bellweather
        </Link>
        <div className="nav-end">
          <nav className="nav-links" aria-label="Main">
            <a href="/#examples">Examples</a>
            <a href="/#how">How it works</a>
            <a href="/#pricing">Pricing</a>
            {session?.user && <Link href="/watches">Your watches</Link>}
            {session?.user && <Link href="/billing">Billing</Link>}
          </nav>
          {session?.user ? (
            <div className="nav-actions">
              <Link className="btn btn-small btn-primary" href="/watches/new">
                New alert
              </Link>
              <form
                className="nav-signout-form"
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
      </div>
    </header>
  );
}
