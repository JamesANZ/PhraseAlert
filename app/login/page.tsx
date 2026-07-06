import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, signIn } from "@/lib/auth";

async function signInAction(formData: FormData) {
  "use server";

  const email = formData.get("email");
  const callbackUrl = formData.get("callbackUrl");

  if (typeof email !== "string" || !email.trim()) {
    redirect("/login?error=missing-email");
  }

  const redirectTo =
    typeof callbackUrl === "string" && callbackUrl.startsWith("/")
      ? callbackUrl
      : "/watches";

  await signIn("email", {
    email: email.trim(),
    redirectTo,
  });
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}) {
  const session = await auth();
  const params = await searchParams;

  if (session?.user) {
    redirect(params.callbackUrl ?? "/watches");
  }

  const callbackUrl = params.callbackUrl ?? "/watches";

  return (
    <main className="page-shell">
      <div className="clarify-panel">
        <div className="page-header">
          <h1>Sign in</h1>
          <p>We&apos;ll email you a magic link. No password needed.</p>
        </div>

        {params.error === "missing-email" && (
          <div className="error-banner">Enter your email address.</div>
        )}

        <form action={signInAction} className="watch-box">
          <input type="hidden" name="callbackUrl" value={callbackUrl} />
          <label className="visually-hidden" htmlFor="email">
            Email address
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="you@example.com"
            className="watch-input mono"
          />
          <div style={{ marginTop: 12 }}>
            <button className="btn btn-primary" type="submit">
              Email me a sign-in link
            </button>
          </div>
        </form>

        <p className="hero-note" style={{ marginTop: 16 }}>
          <Link href="/">Back to home</Link>
        </p>
      </div>
    </main>
  );
}
