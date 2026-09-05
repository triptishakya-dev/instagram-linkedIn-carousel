import type { Metadata } from "next";
import { Sora } from "next/font/google";
import "./globals.css";
import { RedsProvider } from "@/components/reds/store";
import { Shell } from "@/components/reds/Shell";

const sora = Sora({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-sora",
});

export const metadata: Metadata = {
  title: "REDS Content Ops",
  description:
    "Goal-driven carousel generation, review and scheduling for Instagram and LinkedIn.",
};

// Paint the stored theme before first paint so the page never flashes the
// wrong ground. Mirrors what the provider does on mount.
const THEME_BOOT = `
(function(){try{
  var p = JSON.parse(localStorage.getItem('reds:prefs')||'null');
  var t = (p && p.theme) || 'system';
  var dark = t === 'dark' || (t === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
}catch(e){}})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={sora.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
      </head>
      <body>
        <RedsProvider>
          <Shell>{children}</Shell>
        </RedsProvider>
      </body>
    </html>
  );
}
