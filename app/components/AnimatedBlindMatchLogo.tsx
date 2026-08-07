export function AnimatedBlindMatchLogo() {
  return (
    <div className="relative mx-auto w-full max-w-[22rem] sm:max-w-[27rem]" aria-label="شعار التوافق الأعمى المتحرك">
      <svg
        viewBox="0 0 760 760"
        role="img"
        aria-labelledby="blindmatch-animated-logo-title"
        className="block h-auto w-full overflow-visible"
      >
        <title id="blindmatch-animated-logo-title">التوافق الأعمى</title>
        <defs>
          <linearGradient id="bm-brand-gradient" x1="0%" y1="25%" x2="100%" y2="75%">
            <stop offset="0%" stopColor="#c45cff" />
            <stop offset="48%" stopColor="#818cf8" />
            <stop offset="100%" stopColor="#22d3ee" />
          </linearGradient>
          <linearGradient id="bm-light-sweep" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="white" stopOpacity="0" />
            <stop offset="50%" stopColor="white" stopOpacity="0.8" />
            <stop offset="100%" stopColor="white" stopOpacity="0" />
          </linearGradient>
          <radialGradient id="bm-halo" cx="50%" cy="43%" r="55%">
            <stop offset="0%" stopColor="#60a5fa" stopOpacity="0.3" />
            <stop offset="48%" stopColor="#a855f7" stopOpacity="0.14" />
            <stop offset="100%" stopColor="#020617" stopOpacity="0" />
          </radialGradient>
          <filter id="bm-glow" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="7" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="bm-soft-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="16" />
          </filter>
          <clipPath id="bm-sweep-clip">
            <circle cx="380" cy="330" r="268" />
            <rect x="115" y="585" width="530" height="125" rx="28" />
          </clipPath>
        </defs>

        <style>{`
          .bm-logo-float { transform-origin: 380px 365px; animation: bm-float 3s ease-in-out infinite; }
          .bm-logo-halo { transform-origin: 380px 330px; animation: bm-halo 2.5s ease-in-out infinite; }
          .bm-logo-draw { stroke-dasharray: 1; stroke-dashoffset: 1; animation: bm-draw 1.15s cubic-bezier(.22,.75,.28,1) forwards; }
          .bm-logo-ring-two { animation-delay: .12s; }
          .bm-logo-face { animation-delay: .28s; }
          .bm-logo-bridge { animation-delay: .52s; }
          .bm-logo-dot { transform-box: fill-box; transform-origin: center; opacity: 0; animation: bm-dot 1.8s ease-in-out .78s infinite; }
          .bm-logo-dot-two { animation-delay: .92s; }
          .bm-logo-wordmark { opacity: 0; transform: translateY(14px); animation: bm-wordmark .72s cubic-bezier(.2,.8,.2,1) .68s forwards; }
          .bm-logo-rule { opacity: 0; animation: bm-rule .7s ease-out 1s forwards; }
          .bm-logo-sweep { animation: bm-sweep 2.7s cubic-bezier(.4,0,.2,1) .85s infinite; }

          @keyframes bm-draw { to { stroke-dashoffset: 0; } }
          @keyframes bm-wordmark { to { opacity: 1; transform: translateY(0); } }
          @keyframes bm-rule { to { opacity: .72; } }
          @keyframes bm-dot {
            0%, 100% { opacity: .72; transform: scale(.9); }
            50% { opacity: 1; transform: scale(1.16); }
          }
          @keyframes bm-halo {
            0%, 100% { opacity: .62; transform: scale(.97); }
            50% { opacity: 1; transform: scale(1.035); }
          }
          @keyframes bm-float {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(-5px); }
          }
          @keyframes bm-sweep {
            0% { transform: translateX(-310px) skewX(-12deg); opacity: 0; }
            18% { opacity: .24; }
            55% { opacity: .16; }
            78%, 100% { transform: translateX(840px) skewX(-12deg); opacity: 0; }
          }

          @media (prefers-reduced-motion: reduce) {
            .bm-logo-float, .bm-logo-halo, .bm-logo-dot, .bm-logo-sweep { animation: none; }
            .bm-logo-draw { animation: none; stroke-dashoffset: 0; }
            .bm-logo-wordmark, .bm-logo-rule { animation: none; opacity: 1; transform: none; }
          }
        `}</style>

        <g className="bm-logo-float">
          <circle className="bm-logo-halo" cx="380" cy="330" r="300" fill="url(#bm-halo)" />
          <circle cx="380" cy="330" r="254" fill="none" stroke="#38bdf8" strokeOpacity="0.1" strokeWidth="22" filter="url(#bm-soft-glow)" />

          <g fill="none" stroke="url(#bm-brand-gradient)" strokeLinecap="round" strokeLinejoin="round">
            <circle
              className="bm-logo-draw"
              pathLength="1"
              cx="380"
              cy="330"
              r="255"
              strokeWidth="4"
              filter="url(#bm-glow)"
            />
            <circle
              className="bm-logo-draw bm-logo-ring-two"
              pathLength="1"
              cx="380"
              cy="330"
              r="236"
              strokeWidth="1.5"
              strokeOpacity="0.8"
            />

            <path
              className="bm-logo-draw bm-logo-face"
              pathLength="1"
              d="M357 205 C307 190 255 204 221 236 C188 267 179 310 190 350 L171 383 C165 393 169 404 181 409 L199 416 C187 423 187 433 198 439 C188 447 191 457 203 463 L217 469 C210 487 220 506 244 513 L278 521 C306 528 320 552 322 586 C329 550 342 526 365 511"
              strokeWidth="4"
              filter="url(#bm-glow)"
            />
            <path
              className="bm-logo-draw bm-logo-face"
              pathLength="1"
              d="M403 205 C453 190 505 204 539 236 C572 267 581 310 570 350 L589 383 C595 393 591 404 579 409 L561 416 C573 423 573 433 562 439 C572 447 569 457 557 463 L543 469 C550 487 540 506 516 513 L482 521 C454 528 440 552 438 586 C431 550 418 526 395 511"
              strokeWidth="4"
              filter="url(#bm-glow)"
            />

            <path
              className="bm-logo-draw bm-logo-bridge"
              pathLength="1"
              d="M303 468 C324 420 354 405 380 405 C406 405 436 420 457 468"
              strokeWidth="5"
              filter="url(#bm-glow)"
            />
          </g>

          <circle className="bm-logo-dot" cx="300" cy="474" r="19" fill="url(#bm-brand-gradient)" filter="url(#bm-glow)" />
          <circle className="bm-logo-dot bm-logo-dot-two" cx="460" cy="474" r="19" fill="url(#bm-brand-gradient)" filter="url(#bm-glow)" />

          <g className="bm-logo-wordmark" filter="url(#bm-glow)">
            <text
              x="380"
              y="664"
              textAnchor="middle"
              direction="rtl"
              fill="url(#bm-brand-gradient)"
              fontFamily="Tajawal, Arial, sans-serif"
              fontSize="67"
              fontWeight="700"
              letterSpacing="-2"
            >
              التوافق الأعمى
            </text>
          </g>

          <g className="bm-logo-rule" fill="none" stroke="url(#bm-brand-gradient)" strokeLinecap="round">
            <path d="M230 710 H350" strokeWidth="2" />
            <path d="M410 710 H530" strokeWidth="2" />
            <circle cx="380" cy="710" r="7" fill="url(#bm-brand-gradient)" stroke="none" />
          </g>

          <g clipPath="url(#bm-sweep-clip)" pointerEvents="none">
            <rect className="bm-logo-sweep" x="-180" y="55" width="115" height="650" fill="url(#bm-light-sweep)" opacity="0" />
          </g>
        </g>
      </svg>
    </div>
  )
}
