import "./globals.css";
import Footer from "./components/Footer";
import { Inter, JetBrains_Mono, Orbitron } from "next/font/google";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

const orbitron = Orbitron({
  subsets: ["latin"],
  variable: "--font-brand",
  weight: ["400", "500", "600", "700", "800", "900"],
  display: "swap",
});

export const metadata = {
  title: "SolGuard AI | Autonomous Solana Threat Intelligence",
  description:
    "Real-time bundle detection, freeze authority audits, and LP lock verification for any Solana token.",
  icons: {
    icon: [{ url: "/logo.png", type: "image/png" }],
    apple: [{ url: "/logo.png", type: "image/png" }],
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable} ${orbitron.variable}`}>
      <body className="font-sans bg-surface-muted text-slate-800 antialiased min-h-screen flex flex-col">
        {children}
        <Footer />
      </body>
    </html>
  );
}
