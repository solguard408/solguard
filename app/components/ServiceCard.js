"use client";

import { motion } from "framer-motion";
import {
  Shield, Lock, Wallet, MessageSquare, Coins, Layers, Users, Droplets,
  FileText, Sparkles, ShieldAlert, TrendingUp, Activity, Globe, UserCog, Bot, Fingerprint, KeyRound,
} from "lucide-react";

const ICONS = {
  Coins, Lock, Layers, Users, Droplets, FileText, Sparkles, ShieldAlert,
  TrendingUp, Activity, Globe, Wallet, UserCog, Shield, MessageSquare, Bot, Fingerprint, KeyRound,
};

function ServiceSparkline({ dailyBuckets = [], color = "#2563eb" }) {
  const points = dailyBuckets.length >= 2
    ? dailyBuckets
    : [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  const max = Math.max(1, ...points);
  const w = 120;
  const h = 28;
  const path = points
    .map((p, i) => {
      const x = (i / (points.length - 1)) * w;
      const y = h - (p / max) * (h - 4) - 2;
      return `${i === 0 ? "M" : "L"}${x},${y}`;
    })
    .join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-24 h-7 flex-shrink-0" preserveAspectRatio="none" aria-hidden>
      <path d={path} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function ServiceCard({ service, stats, onOpen }) {
  const Icon = ICONS[service.icon] || Shield;
  const count30d = stats?.count30d ?? 0;
  const dailyBuckets = stats?.dailyBuckets ?? [];

  return (
    <motion.button
      type="button"
      onClick={onOpen}
      whileHover={{ y: -2 }}
      transition={{ duration: 0.2 }}
      className="group text-left w-full rounded-xl bg-white border border-slate-100 shadow-sm hover:shadow-md hover:border-slate-200 transition-shadow flex flex-col p-5"
    >
      <div className="flex items-start justify-between">
        <div className="w-10 h-10 bg-[#0B2545] rounded-lg flex items-center justify-center flex-shrink-0">
          <Icon className="w-5 h-5 text-white" strokeWidth={2} />
        </div>
        <span className="px-2 py-0.5 text-xs rounded font-medium bg-slate-100 text-slate-600 border border-slate-200">
          {service.category}
        </span>
      </div>

      <h3 className="text-lg font-bold text-slate-900 mt-4 tracking-tight">{service.name}</h3>
      <p className="text-sm text-slate-500 mt-2 line-clamp-3 min-h-[4.5rem]">{service.description}</p>

      <div className="flex items-center gap-2 mt-4">
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-50 text-slate-600 border border-slate-200">
          <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full inline-block mr-1.5" aria-hidden />
          Solana
        </span>
      </div>

      <div className="flex items-center justify-between gap-2 mt-3 mb-4">
        <ServiceSparkline dailyBuckets={dailyBuckets} />
        <span className="text-xs text-slate-500 font-medium whitespace-nowrap tabular-nums">
          {count30d} · 30d
        </span>
      </div>

      <div className="flex items-end justify-between pt-4 border-t border-slate-100 mt-auto">
        <div>
          <div className="text-xl font-bold text-slate-900">${service.price.toFixed(2)}</div>
          <div className="text-xs text-slate-500 mt-0.5">per scan · {service.proTeaser || "$0.06 with Pro"}</div>
        </div>
        <span className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-sm font-medium text-slate-700 group-hover:border-trust-300 group-hover:bg-trust-50 group-hover:text-trust-700 transition-colors">
          {service.actionLabel}
        </span>
      </div>
    </motion.button>
  );
}
