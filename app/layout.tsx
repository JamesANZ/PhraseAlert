import type { Metadata } from "next";
import { DM_Sans, IBM_Plex_Mono, Lora } from "next/font/google";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import "./globals.css";

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-dm-sans",
});

const lora = Lora({
  subsets: ["latin"],
  style: ["italic"],
  weight: ["400", "500"],
  variable: "--font-lora",
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-ibm-plex-mono",
});

export const metadata: Metadata = {
  title: "PhraseAlert | Get alerted on anything",
  description:
    "Get alerted on anything. Write what you want to know in plain English. PhraseAlert watches the web and notifies you when it happens.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${dmSans.variable} ${lora.variable} ${ibmPlexMono.variable}`}
    >
      <body className={dmSans.className}>
        <Nav />
        {children}
        <Footer />
      </body>
    </html>
  );
}
