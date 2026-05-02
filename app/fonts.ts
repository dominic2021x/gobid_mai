import { Inter } from "next/font/google";

/** Google Fonts via next/font: self-hosted at build, no external CSS, no layout shift. */
export const fontInter = Inter({
  subsets: ["latin"],
  display: "swap",
  preload: true,
  variable: "--font-inter",
});
