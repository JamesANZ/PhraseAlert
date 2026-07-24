"use client";

import Link from "next/link";
import { useState } from "react";

export function MobileNav({
  signedIn,
  signOutAction,
}: {
  signedIn: boolean;
  signOutAction?: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);

  function closeMenu() {
    setOpen(false);
  }

  return (
    <div className="mobile-nav">
      <button
        className="mobile-nav-toggle"
        type="button"
        aria-expanded={open}
        aria-controls="mobile-navigation"
        aria-label={open ? "Close navigation menu" : "Open navigation menu"}
        onClick={() => setOpen((current) => !current)}
      >
        <span />
        <span />
        <span />
      </button>
      {open && (
        <div id="mobile-navigation" className="mobile-nav-panel">
          <nav className="mobile-nav-links" aria-label="Mobile">
            <a href="/#examples" onClick={closeMenu}>
              Examples
            </a>
            <a href="/#how" onClick={closeMenu}>
              How it works
            </a>
            <a href="/#pricing" onClick={closeMenu}>
              Pricing
            </a>
            {signedIn && (
              <>
                <Link href="/watches" onClick={closeMenu}>
                  My alerts
                </Link>
                <Link href="/billing" onClick={closeMenu}>
                  Billing
                </Link>
              </>
            )}
          </nav>
          <div className="mobile-nav-actions">
            {signedIn ? (
              <>
                <Link
                  className="btn btn-primary"
                  href="/watches/new"
                  onClick={closeMenu}
                >
                  New alert
                </Link>
                {signOutAction && (
                  <form action={signOutAction}>
                    <button className="btn btn-ghost" type="submit">
                      Sign out
                    </button>
                  </form>
                )}
              </>
            ) : (
              <Link
                className="btn btn-primary"
                href="/login"
                onClick={closeMenu}
              >
                Sign in
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
