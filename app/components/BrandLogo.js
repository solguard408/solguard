import Image from "next/image";

const SIZES = {
  header: {
    icon: 46,
    iconClass: "w-[46px] h-[46px] sm:w-[48px] sm:h-[48px]",
    text: "text-[19px] sm:text-[22px]",
    gap: "gap-3 sm:gap-3.5",
  },
  og: {
    icon: 56,
    iconClass: "w-14 h-14",
    text: "text-[28px]",
    gap: "gap-3.5",
  },
};

export default function BrandLogo({ variant = "header", showText = true, className = "" }) {
  const s = SIZES[variant] || SIZES.header;

  return (
    <span className={`inline-flex items-center ${s.gap} ${className}`}>
      <Image
        src="/logo.png"
        alt=""
        width={s.icon}
        height={s.icon}
        className={`${s.iconClass} flex-shrink-0 object-contain`}
        priority
      />
      {showText && (
        <span
          className={`font-brand font-bold ${s.text} tracking-[0.035em] text-trust-800 leading-none uppercase whitespace-nowrap`}
        >
          SolGuard AI
        </span>
      )}
    </span>
  );
}
