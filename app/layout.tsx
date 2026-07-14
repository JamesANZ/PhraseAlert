import type { Metadata } from "next";
import { IBM_Plex_Mono, Newsreader, Nunito } from "next/font/google";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import "./globals.css";

const nunito = Nunito({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-nunito",
});

const newsreader = Newsreader({
  subsets: ["latin"],
  style: ["italic"],
  weight: ["400", "500"],
  variable: "--font-newsreader",
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-ibm-plex-mono",
});

export const metadata: Metadata = {
  title: "bellweather",
  description:
    "Write one sentence about what you want to know. Get alerted when it happens, not when a page mentions the topic.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${nunito.variable} ${newsreader.variable} ${ibmPlexMono.variable}`}
      >
        <Nav />
        {children}
        <Footer />
      </body>
    </html>
  );
}
