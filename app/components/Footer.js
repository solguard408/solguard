"use client";

import { X402FooterTagline } from "./X402Status";

const GITHUB_URL = "https://github.com/solguard408";
const X_URL = "https://x.com/SolGuard_";

function GitHubIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
    </svg>
  );
}

function XIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

const FOOTER_LINKS = [
  { label: "Privacy", href: "#" },
  { label: "Terms", href: "#" },
  { label: "Modern Slavery", href: "#" },
  { label: "Partner Programme", href: "#" },
];

function SocialLink({ href, label, children }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      className="inline-flex items-center justify-center w-9 h-9 rounded-lg border border-slate-200 bg-slate-50 text-slate-600 hover:text-slate-900 hover:border-slate-300 hover:bg-white transition-colors"
    >
      {children}
    </a>
  );
}

export default function Footer() {
  return (
    <footer className="mt-auto bg-white border-t border-slate-200">
      <div className="max-w-7xl mx-auto px-6 sm:px-8 py-10 sm:py-12">
        {/* Tagline — full width, readable */}
        <p className="text-xs sm:text-sm text-slate-500 leading-relaxed max-w-3xl">
          <X402FooterTagline />
        </p>

        {/* Links + social — aligned row, icons never wrap with text */}
        <div className="mt-8 flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <nav
            className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-slate-600"
            aria-label="Footer legal"
          >
            {FOOTER_LINKS.map(({ label, href }) => (
              <a key={label} href={href} className="hover:text-slate-900 transition-colors whitespace-nowrap">
                {label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-2 shrink-0" aria-label="Social links">
            <SocialLink href={GITHUB_URL} label="SolGuard on GitHub">
              <GitHubIcon className="w-[18px] h-[18px]" />
            </SocialLink>
            <SocialLink href={X_URL} label="SolGuard on X">
              <XIcon className="w-[16px] h-[16px]" />
            </SocialLink>
          </div>
        </div>

        {/* Copyright */}
        <div className="mt-8 pt-6 border-t border-slate-100">
          <p className="text-xs sm:text-sm text-slate-400">
            © 2026 SolGuard AI. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
