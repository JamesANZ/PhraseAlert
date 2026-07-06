async function sendMagicLink(email: string, url: string): Promise<void> {
  if (process.env.RESEND_API_KEY) {
    const { Resend } = await import("resend");
    const resend = new Resend(process.env.RESEND_API_KEY);
    const from = process.env.EMAIL_FROM ?? "Bellwether <onboarding@resend.dev>";

    const { error } = await resend.emails.send({
      from,
      to: email,
      subject: "Sign in to Bellwether",
      html: `
        <p>Click the link below to sign in to Bellwether.</p>
        <p><a href="${url}">Sign in</a></p>
        <p>If you did not request this, you can ignore this email.</p>
      `,
    });

    if (error) {
      throw new Error(error.message);
    }
    return;
  }

  if (process.env.NODE_ENV === "development") {
    console.log(`\n[Bellwether] Magic link for ${email}:\n${url}\n`);
    return;
  }

  throw new Error(
    "Email is not configured. Set RESEND_API_KEY and EMAIL_FROM in production.",
  );
}

export { sendMagicLink };
