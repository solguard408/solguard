import "./globals.css";
import Footer from "./components/Footer";
import { Orbitron } from "next/font/google";

const orbitron = Orbitron({
  subsets: ["latin"],
  variable: "--font-orbitron",
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
    <html lang="en" className={orbitron.variable}>
      <body className={`${orbitron.className} bg-surface-muted text-slate-800 antialiased min-h-screen flex flex-col font-sans`}>
        {children}
        <Footer />
      </body>
    </html>
  );
}
