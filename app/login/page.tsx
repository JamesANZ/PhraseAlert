import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, signIn } from "@/lib/auth";

async function googleSignInAction(formData: FormData) {
  "use server";

  const callbackUrl = formData.get("callbackUrl");
  const redirectTo =
    typeof callbackUrl === "string" && callbackUrl.startsWith("/")
      ? callbackUrl
      : "/watches";

  await signIn("google", { redirectTo });
}

const errorMessages: Record<string, string> = {
  OAuthSignin: "Could not start Google sign-in. Try again.",
  OAuthCallback: "Google sign-in failed. Try again.",
  OAuthAccountNotLinked:
    "This Google account is already linked to another user.",
  AccessDenied: "Sign-in was cancelled.",
  Configuration: "Sign-in is not configured. Contact support.",
};

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
  const errorMessage = params.error ? errorMessages[params.error] : undefined;

  return (
    <main className="page-shell page-shell-app">
      <div className="app-page">
        <div className="clarify-panel">
          <div className="page-header">
            <h1>Sign in</h1>
            <p>
              Sign in with Google to save your watches. One account,
              plain-language alerts for anything you&apos;re waiting on.
            </p>
          </div>

          {errorMessage && <div className="error-banner">{errorMessage}</div>}

          <form action={googleSignInAction} className="watch-box">
            <input type="hidden" name="callbackUrl" value={callbackUrl} />
            <button className="btn btn-google" type="submit">
              <GoogleIcon />
              Continue with Google
            </button>
          </form>

          <p className="hero-note" style={{ marginTop: 16 }}>
            <Link href="/">Back to home</Link>
          </p>
        </div>
      </div>
    </main>
  );
}

function GoogleIcon() {
  return (
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 18 18">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c3.42-3.15 5.392-7.78 5.392-13.615z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.997 8.997 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"
      />
    </svg>
  );
}
