// Coraline "Other World" hero — the home-screen showpiece. Pure CSS/SVG, no deps.
// Dark-glass panel with drifting mist, a glowing ornate door + floating key,
// stitched button-eyes, and a shimmering title. Decorative only (aria-hidden art).

export default function CoralineHero() {
  return (
    <section className="glass-night animate-rise relative overflow-hidden rounded-3xl px-6 py-7 sm:px-9 sm:py-9">
      {/* Drifting violet/fuchsia mist */}
      <div className="mist mist-a" style={{ width: 320, height: 320, left: -60, top: -80, background: '#7c3aed' }} />
      <div className="mist mist-b" style={{ width: 300, height: 300, right: -70, bottom: -90, background: '#db2777' }} />

      <div className="relative flex flex-col items-start gap-6 sm:flex-row sm:items-center sm:justify-between">
        {/* ── Copy ─────────────────────────────────────────────────────────── */}
        <div className="max-w-lg">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-fuchsia-300/30 bg-fuchsia-500/15 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-fuchsia-200">
            🔑 다음 여정 · Next Journey
          </span>

          <h1 className="font-display mt-3 text-5xl font-extrabold leading-none tracking-tight sm:text-6xl">
            <span className="text-shimmer">Coraline</span>
          </h1>

          <p className="mt-3 text-sm leading-relaxed text-violet-100/85 sm:text-base">
            태윤아, 단추 눈의 <span className="font-bold text-white">‘다른 세계’</span>가 문을 열었어.
            <br className="hidden sm:block" />
            열쇠를 들고 살며시 들어가 볼까? ✨
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-2">
            <span className="rounded-xl bg-white/10 px-3 py-1.5 text-xs font-bold text-violet-100 ring-1 ring-white/15">
              📖 Ch. 1~2
            </span>
            <span className="rounded-xl bg-white/10 px-3 py-1.5 text-xs font-bold text-violet-100 ring-1 ring-white/15">
              ✍️ Neil Gaiman
            </span>
            <span className="rounded-xl bg-gradient-to-r from-violet-500/80 to-fuchsia-500/80 px-3 py-1.5 text-xs font-extrabold text-white shadow-lg shadow-fuchsia-500/30">
              7/15 (수) 첫 수업
            </span>
          </div>
        </div>

        {/* ── The glowing door scene ───────────────────────────────────────── */}
        <div aria-hidden className="relative h-44 w-44 shrink-0 sm:h-52 sm:w-52">
          {/* halo */}
          <div className="absolute inset-0 rounded-full blur-2xl"
               style={{ background: 'radial-gradient(circle, rgba(217,70,239,.45), transparent 65%)' }} />

          {/* drifting sparkles to balance the scene */}
          <svg className="float-mid absolute -left-2 top-10" width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M10 1l1.6 6.4L18 9l-6.4 1.6L10 17l-1.6-6.4L2 9l6.4-1.6L10 1Z" fill="#e9d5ff" opacity=".85"/>
          </svg>
          <svg className="float-slow absolute left-2 bottom-8" width="13" height="13" viewBox="0 0 20 20" fill="none">
            <path d="M10 1l1.6 6.4L18 9l-6.4 1.6L10 17l-1.6-6.4L2 9l6.4-1.6L10 1Z" fill="#f0abfc" opacity=".7"/>
          </svg>

          {/* crescent moon */}
          <div className="float-slow absolute -right-1 top-0">
            <svg width="34" height="34" viewBox="0 0 34 34" fill="none">
              <path d="M25 4a13 13 0 1 0 5 17A15 15 0 0 1 25 4Z" fill="#fde68a" opacity=".9"/>
            </svg>
          </div>

          {/* the door */}
          <div className="float-slow absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            <svg width="132" height="176" viewBox="0 0 132 176" fill="none" className="drop-shadow-[0_10px_30px_rgba(124,58,237,.55)]">
              <defs>
                <linearGradient id="door" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="#4c1d95"/><stop offset="1" stopColor="#2e1065"/>
                </linearGradient>
                <radialGradient id="keyglow" cx="50%" cy="50%" r="50%">
                  <stop offset="0" stopColor="#fef08a"/><stop offset="1" stopColor="#f59e0b" stopOpacity="0"/>
                </radialGradient>
              </defs>
              {/* frame */}
              <path d="M14 40C14 18 32 4 66 4s52 14 52 36v132H14V40Z" fill="#1e1b4b" stroke="#a78bfa" strokeWidth="3"/>
              {/* door leaf */}
              <path d="M24 44C24 26 38 14 66 14s42 12 42 30v122H24V44Z" fill="url(#door)" stroke="#c4b5fd" strokeWidth="2"/>
              {/* panels */}
              <rect x="36" y="44" width="60" height="46" rx="8" fill="#0f0a2e" opacity=".55" stroke="#7c3aed" strokeWidth="1.5"/>
              <rect x="36" y="100" width="60" height="52" rx="8" fill="#0f0a2e" opacity=".55" stroke="#7c3aed" strokeWidth="1.5"/>
              {/* keyhole glow + shape */}
              <circle cx="88" cy="112" r="16" fill="url(#keyglow)"/>
              <circle cx="88" cy="108" r="5.5" fill="#fde68a"/>
              <path d="M85 111h6l2 12h-10l2-12Z" fill="#fde68a"/>
            </svg>
          </div>

          {/* floating skeleton key */}
          <div className="float-mid absolute -bottom-1 right-2 rotate-[18deg]">
            <svg width="66" height="30" viewBox="0 0 66 30" fill="none" className="drop-shadow-[0_4px_10px_rgba(253,224,71,.5)]">
              <circle cx="13" cy="15" r="10" fill="none" stroke="#fbbf24" strokeWidth="4"/>
              <circle cx="13" cy="15" r="3.5" fill="#0b1030"/>
              <rect x="21" y="12.5" width="42" height="5" rx="2.5" fill="#fbbf24"/>
              <rect x="52" y="17" width="5" height="9" rx="2" fill="#fbbf24"/>
              <rect x="60" y="17" width="5" height="7" rx="2" fill="#fbbf24"/>
            </svg>
          </div>
        </div>
      </div>
    </section>
  );
}
