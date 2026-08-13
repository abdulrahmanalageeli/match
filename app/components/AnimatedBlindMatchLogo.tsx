export function AnimatedBlindMatchLogo() {
  return (
    <div
      className="bm-loading-logo relative mx-auto aspect-square w-full max-w-[18rem] sm:max-w-[22rem]"
      role="img"
      aria-label="شعار التوافق الأعمى المتحرك"
    >
      <style>{`
        .bm-loading-logo {
          isolation: isolate;
          filter: drop-shadow(0 0 34px rgba(56, 189, 248, .18));
        }
        .bm-loading-logo-ring {
          position: absolute;
          inset: 5%;
          z-index: -1;
          border-radius: 9999px;
          background: conic-gradient(from 0deg, transparent 0 16%, rgba(192, 88, 255, .78) 27%, transparent 42% 58%, rgba(34, 211, 238, .85) 72%, transparent 88%);
          filter: blur(1px);
          opacity: .72;
          animation: bm-loading-ring 5.5s linear infinite;
          -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 2px), #000 0);
          mask: radial-gradient(farthest-side, transparent calc(100% - 2px), #000 0);
        }
        .bm-loading-logo-ring-two {
          inset: 9%;
          opacity: .34;
          animation-duration: 8s;
          animation-direction: reverse;
        }
        .bm-loading-logo-glow {
          position: absolute;
          inset: 15%;
          z-index: -2;
          border-radius: 9999px;
          background: linear-gradient(135deg, rgba(168, 85, 247, .32), rgba(34, 211, 238, .3));
          filter: blur(38px);
          animation: bm-loading-glow 2.8s ease-in-out infinite;
        }
        .bm-loading-logo-image {
          display: block;
          width: 100%;
          height: 100%;
          object-fit: contain;
          animation: bm-loading-mark 4.2s cubic-bezier(.45, 0, .2, 1) infinite;
          will-change: transform, filter;
        }
        @keyframes bm-loading-ring {
          to { transform: rotate(360deg); }
        }
        @keyframes bm-loading-glow {
          0%, 100% { opacity: .46; transform: scale(.88); }
          50% { opacity: .95; transform: scale(1.08); }
        }
        @keyframes bm-loading-mark {
          0%, 100% { transform: translateY(0) rotate(-2deg) scale(.97); filter: brightness(.92); }
          45% { transform: translateY(-8px) rotate(2deg) scale(1.015); filter: brightness(1.1); }
          70% { transform: translateY(-3px) rotate(0deg) scale(1); filter: brightness(1.02); }
        }
        @media (prefers-reduced-motion: reduce) {
          .bm-loading-logo-ring,
          .bm-loading-logo-glow,
          .bm-loading-logo-image { animation: none; }
        }
      `}</style>

      <span className="bm-loading-logo-glow" aria-hidden="true" />
      <span className="bm-loading-logo-ring" aria-hidden="true" />
      <span className="bm-loading-logo-ring bm-loading-logo-ring-two" aria-hidden="true" />
      <img
        className="bm-loading-logo-image"
        src="/blindmatch-welcome-loading-logo.png"
        alt=""
        width={600}
        height={600}
        decoding="async"
      />
    </div>
  )
}
