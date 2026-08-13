export function AnimatedBlindMatchLogo() {
  return (
    <div
      className="bm-loading-logo relative mx-auto aspect-square w-[7.5rem] sm:w-[9rem]"
      role="img"
      aria-label="شعار التوافق الأعمى المتحرك"
    >
      <style>{`
        .bm-loading-logo {
          isolation: isolate;
          filter: drop-shadow(0 0 22px rgba(56, 189, 248, .18));
        }
        .bm-loading-logo-ring {
          position: absolute;
          inset: 1%;
          z-index: -1;
          border-radius: 9999px;
          background: conic-gradient(from 0deg, transparent 0 16%, rgba(192, 88, 255, .78) 27%, transparent 42% 58%, rgba(34, 211, 238, .85) 72%, transparent 88%);
          filter: blur(1px);
          opacity: .86;
          animation: bm-loading-ring 1.15s linear infinite;
          -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 3px), #000 0);
          mask: radial-gradient(farthest-side, transparent calc(100% - 3px), #000 0);
        }
        .bm-loading-logo-ring-two {
          inset: 6%;
          opacity: .28;
          animation-duration: 2.1s;
          animation-direction: reverse;
        }
        .bm-loading-logo-glow {
          position: absolute;
          inset: 18%;
          z-index: -2;
          border-radius: 9999px;
          background: linear-gradient(135deg, rgba(168, 85, 247, .32), rgba(34, 211, 238, .3));
          filter: blur(28px);
          animation: bm-loading-glow 1.7s ease-in-out infinite;
        }
        .bm-loading-logo-image {
          display: block;
          width: 100%;
          height: 100%;
          object-fit: contain;
          border-radius: 9999px;
          animation: bm-loading-mark 3s linear infinite;
          will-change: transform, filter;
        }
        @keyframes bm-loading-ring {
          to { transform: rotate(360deg); }
        }
        @keyframes bm-loading-glow {
          0%, 100% { opacity: .42; transform: scale(.9); }
          50% { opacity: .82; transform: scale(1.03); }
        }
        @keyframes bm-loading-mark {
          from { transform: rotate(0deg); filter: brightness(.96); }
          50% { filter: brightness(1.1); }
          to { transform: rotate(360deg); filter: brightness(.96); }
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
