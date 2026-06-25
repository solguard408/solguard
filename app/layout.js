import "./globals.css";

export const metadata = {
  title: "SolGuard AI | Autonomous Solana Threat Intelligence",
  description:
    "Real-time bundle detection, freeze authority audits, and LP lock verification for any Solana token.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="dark">
      <body className="bg-[#09090b] text-zinc-100 antialiased min-h-screen">{children}</body>
    </html>
  );
}
