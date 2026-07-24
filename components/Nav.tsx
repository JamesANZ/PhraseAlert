import Link from "next/link";
import { auth, signOut } from "@/lib/auth";
import { MobileNav } from "@/components/MobileNav";

export async function Nav() {
  const session = await auth();
  const signedIn = Boolean(session?.user);

  async function handleSignOut() {
    "use server";
    await signOut({ redirectTo: "/" });
  }

  return (
    <header className="nav">
      <div className="nav-inner">
        <Link className="brand" href="/">
          <span className="brand-mark" aria-hidden="true" />
          PhraseAlert
        </Link>
        <div className="nav-end">
          <nav className="nav-links" aria-label="Main">
            <a href="/#examples">Examples</a>
            <a href="/#how">How it works</a>
            <a href="/#pricing">Pricing</a>
            {signedIn && <Link href="/watches">My alerts</Link>}
            {signedIn && <Link href="/billing">Billing</Link>}
          </nav>
          {signedIn ? (
            <div className="nav-actions">
              <Link className="btn btn-small btn-primary" href="/watches/new">
                New alert
              </Link>
              <form className="nav-signout-form" action={handleSignOut}>
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
          <MobileNav signedIn={signedIn} signOutAction={handleSignOut} />
        </div>
      </div>
    </header>
  );
}
