// CoralineWorld — a full-screen, scroll-driven cinematic journey into Coraline's
// "Other World", built to make Taylor *want* to open the app every day.
// Five scenes (Arrival → Pink Palace → The Little Door → The Other World →
// Enter to Study) with scroll parallax, pointer-reactive depth, drifting fog,
// twinkling stars, fireflies, a glowing portal, and a swaying magic garden.
// All art is self-contained CSS/SVG (no external assets); motion is disabled
// under prefers-reduced-motion.

import { useEffect, useRef, useState } from 'react';
import { ambient } from '../lib/ambientAudio';
import { recordVisit, getStreak } from '../lib/streak';

export default function CoralineWorld({ onEnter }: { onEnter: () => void }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [soundOn, setSoundOn] = useState(false);
  // Log today's visit and read the streak once, when the journey opens.
  const [streak] = useState(() => { recordVisit(); return getStreak(); });

  const toggleSound = async () => {
    if (ambient.on) {
      ambient.stop(); setSoundOn(false);
      try { localStorage.setItem('taylor_sound', 'off'); } catch { /* ignore */ }
    } else {
      await ambient.start(); setSoundOn(true); ambient.chime(0);
      try { localStorage.setItem('taylor_sound', 'on'); } catch { /* ignore */ }
    }
  };

  // Enter the app with a "stepping through the door" flourish.
  const enterWithFx = () => { if (ambient.on) { ambient.whoosh(); ambient.chime(12); } onEnter(); };

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Scroll-reveal — and a soft chime as each scene arrives.
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); ambient.chime(); } }),
      { root, threshold: 0.18 },
    );
    root.querySelectorAll('.reveal').forEach((el) => io.observe(el));

    // If Taylor had sound on last time, resume it on his first gesture
    // (browsers require one before audio can play).
    let pref: string | null = null;
    try { pref = localStorage.getItem('taylor_sound'); } catch { /* ignore */ }
    if (pref === 'on') {
      const kick = () => {
        ambient.start().then(() => setSoundOn(true));
        window.removeEventListener('pointerdown', kick);
        root.removeEventListener('scroll', kick);
      };
      window.addEventListener('pointerdown', kick, { once: true });
      root.addEventListener('scroll', kick, { once: true });
    }

    if (reduce) return () => { io.disconnect(); ambient.stop(); };

    // Parallax: scroll (per-layer, based on distance from viewport centre) +
    // pointer (tilt of the arrival scene). Batched into one rAF loop.
    const layers = Array.from(root.querySelectorAll<HTMLElement>('[data-speed]'));
    const ptr = { x: 0, y: 0 };
    const cur = { x: 0, y: 0 };
    let raf = 0;

    const onPointer = (cx: number, cy: number) => {
      const w = root.clientWidth, h = root.clientHeight;
      ptr.x = (cx / w - 0.5) * 2;
      ptr.y = (cy / h - 0.5) * 2;
    };
    const mm = (e: MouseEvent) => onPointer(e.clientX, e.clientY);
    const tm = (e: TouchEvent) => { const t = e.touches[0]; if (t) onPointer(t.clientX, t.clientY); };
    root.addEventListener('mousemove', mm);
    root.addEventListener('touchmove', tm, { passive: true });

    const vh = () => root.clientHeight;
    const tick = () => {
      cur.x += (ptr.x - cur.x) * 0.06;
      cur.y += (ptr.y - cur.y) * 0.06;
      root.style.setProperty('--px', cur.x.toFixed(4));
      root.style.setProperty('--py', cur.y.toFixed(4));
      const h = vh();
      for (const el of layers) {
        const r = el.getBoundingClientRect();
        const centre = r.top + r.height / 2 - h / 2;
        const speed = parseFloat(el.dataset.speed || '0');
        el.style.transform = `translate3d(0, ${(centre * speed).toFixed(1)}px, 0)`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
      root.removeEventListener('mousemove', mm);
      root.removeEventListener('touchmove', tm);
      ambient.stop();
    };
  }, []);

  return (
    <div
      ref={rootRef}
      className="fixed inset-0 z-50 overflow-y-auto overflow-x-hidden text-white"
      style={{ ['--px']: 0, ['--py']: 0, scrollBehavior: 'smooth' } as React.CSSProperties}
    >
      {/* Sound toggle (top-left) — procedural ambient, off until Taylor opts in */}
      <button
        onClick={toggleSound}
        title={soundOn ? '소리 끄기' : '소리 켜기'}
        className={`glass-night fixed left-4 top-4 z-[60] flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold ring-1 ring-white/20 ${soundOn ? 'text-amber-200' : 'text-violet-100 hover:text-white'} ${soundOn ? '' : 'animate-pulse'}`}
      >
        <span className="text-sm">{soundOn ? '🔊' : '🔈'}</span>
        <span className="hidden sm:inline">{soundOn ? '소리 켜짐' : '소리 켜기'}</span>
      </button>

      {/* Skip / enter — always reachable */}
      <button
        onClick={onEnter}
        className="glass-night fixed right-4 top-4 z-[60] rounded-full px-4 py-2 text-xs font-bold text-violet-100 ring-1 ring-white/20 hover:text-white"
      >
        건너뛰기 · 바로 공부하기 →
      </button>

      {/* ══ SCENE 1 · ARRIVAL ══════════════════════════════════════════════ */}
      <section className="relative flex min-h-screen items-center justify-center overflow-hidden"
        style={{ background: 'radial-gradient(1200px 800px at 50% -10%, #2a1560 0%, transparent 60%), linear-gradient(180deg,#0b1030,#160a38 55%,#0a0718)' }}>
        <div className="w-stars absolute inset-0" data-speed="0.08" />
        {/* moon */}
        <div className="absolute right-[12%] top-[14%]" data-speed="0.22"
          style={{ transform: 'translate3d(calc(var(--px)*-18px), calc(var(--py)*-18px), 0)' }}>
          <div className="float-slow">
            <div className="w-glow absolute -inset-10 rounded-full blur-3xl"
              style={{ background: 'radial-gradient(circle, rgba(253,224,138,.5), transparent 65%)' }} />
            <svg width="92" height="92" viewBox="0 0 92 92" fill="none" className="relative">
              <path d="M66 10a36 36 0 1 0 14 46A42 42 0 0 1 66 10Z" fill="#fde68a" />
            </svg>
          </div>
        </div>
        {/* mist */}
        <div className="mist w-drift-a" style={{ width: 520, height: 520, left: '-8%', top: '30%', background: '#7c3aed', opacity: .4 }} />
        <div className="mist w-drift-b" style={{ width: 460, height: 460, right: '-6%', bottom: '8%', background: '#db2777', opacity: .34 }} />

        {/* title */}
        <div className="relative z-10 px-6 text-center" data-speed="-0.06">
          <div style={{ transform: 'translate3d(calc(var(--px)*10px), calc(var(--py)*10px), 0)' }}>
            <p className="mb-4 text-sm font-bold uppercase tracking-[0.35em] text-fuchsia-200/80">태윤이의 다른 세계</p>
            <h1 className="font-display text-6xl font-extrabold leading-none tracking-tight sm:text-8xl">
              <span className="text-shimmer">Coraline</span>
            </h1>
            <p className="mx-auto mt-6 max-w-md text-base leading-relaxed text-violet-100/80 sm:text-lg">
              단추 눈의 세계로 이어지는 문이 열렸어.<br />
              열쇠를 들고… 조금만 더 깊이 들어가 볼까?
            </p>
          </div>
        </div>

        {/* scroll cue */}
        <div className="scroll-cue absolute bottom-8 left-1/2 -translate-x-1/2 text-center text-violet-200/70">
          <div className="text-xs font-semibold tracking-widest">아래로 스크롤</div>
          <svg className="mx-auto mt-1" width="22" height="22" viewBox="0 0 24 24" fill="none">
            <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </section>

      {/* ══ SCENE 2 · THE PINK PALACE ═════════════════════════════════════ */}
      <section className="relative flex min-h-screen items-center overflow-hidden"
        style={{ background: 'linear-gradient(180deg,#0a0718,#1a0f2e 60%,#241035)' }}>
        <div className="w-stars absolute inset-0 opacity-70" data-speed="0.06" />
        {/* far hills */}
        <div className="absolute inset-x-0 bottom-0" data-speed="0.12">
          <svg viewBox="0 0 1440 300" className="h-[38vh] w-full" preserveAspectRatio="none">
            <path d="M0 300V150C260 90 480 180 720 140s520-120 720-40v250Z" fill="#160a2e" />
          </svg>
        </div>
        {/* the pink palace */}
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2" data-speed="-0.05">
          <svg width="360" height="440" viewBox="0 0 360 440" fill="none" className="drop-shadow-[0_20px_60px_rgba(219,39,119,.35)]">
            <defs>
              <linearGradient id="house" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#9d4d78" /><stop offset="1" stopColor="#5b2748" />
              </linearGradient>
            </defs>
            {/* body */}
            <path d="M40 440V150L180 60l140 90v290Z" fill="url(#house)" stroke="#c96f9e" strokeWidth="3" />
            {/* roof */}
            <path d="M24 156 180 52l156 104-16 24L180 84 40 180Z" fill="#3f1c34" />
            {/* gable window */}
            <circle cx="180" cy="130" r="16" className="w-window" fill="#fde68a" />
            {/* windows (warm, flickering) */}
            <g className="w-window">
              <rect x="70" y="200" width="42" height="56" rx="4" fill="#fde68a" />
              <rect x="150" y="200" width="42" height="56" rx="4" fill="#fcd34d" />
              <rect x="230" y="200" width="42" height="56" rx="4" fill="#fde68a" />
              <rect x="70" y="300" width="42" height="56" rx="4" fill="#fcd34d" />
              <rect x="230" y="300" width="42" height="56" rx="4" fill="#fde68a" />
            </g>
            {/* door */}
            <rect x="152" y="330" width="56" height="110" rx="8" fill="#2a1226" stroke="#c96f9e" strokeWidth="2" />
            <circle cx="198" cy="388" r="3" fill="#fde68a" />
          </svg>
        </div>
        {/* foreground fog */}
        <div className="mist w-drift-b" style={{ width: 700, height: 300, left: '-10%', bottom: '-6%', background: '#4c1d95', opacity: .5 }} />

        <div className="relative z-10 mx-auto max-w-xl px-8 text-center reveal">
          <p className="mb-3 text-xs font-bold uppercase tracking-[0.3em] text-fuchsia-200/70">Chapter One</p>
          <h2 className="font-display text-4xl font-extrabold sm:text-5xl">핑크 팰리스</h2>
          <p className="mt-4 text-base leading-relaxed text-violet-100/80">
            비 오는 밤, 태윤이는 오래된 분홍빛 저택으로 이사 왔어.<br />
            불 켜진 창문 너머, 무언가가 조용히 지켜보고 있었지…
          </p>
        </div>
      </section>

      {/* ══ SCENE 3 · THE LITTLE DOOR ═════════════════════════════════════ */}
      <section className="relative flex min-h-screen items-center justify-center overflow-hidden"
        style={{ background: 'radial-gradient(900px 700px at 50% 50%, #3b0f52 0%, transparent 62%), linear-gradient(180deg,#241035,#160a2e)' }}>
        {/* wallpaper stripes */}
        <div className="absolute inset-0 opacity-[.10]"
          style={{ backgroundImage: 'repeating-linear-gradient(90deg,#f0abfc 0 2px, transparent 2px 26px)' }} />
        {/* portal glow behind door */}
        <div className="w-portal absolute left-1/2 top-1/2 h-[380px] w-[380px] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-70 blur-2xl"
          style={{ background: 'conic-gradient(from 0deg, #7c3aed, #db2777, #f59e0b, #7c3aed)' }} data-speed="0.1" />

        <div className="relative z-10 flex flex-col items-center px-6 text-center" data-speed="-0.04">
          <div className="float-slow relative"
            style={{ transform: 'translate3d(calc(var(--px)*14px), calc(var(--py)*14px), 0)' }}>
            <svg width="180" height="240" viewBox="0 0 132 176" fill="none" className="drop-shadow-[0_16px_50px_rgba(124,58,237,.7)]">
              <defs>
                <linearGradient id="wdoor" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="#4c1d95" /><stop offset="1" stopColor="#2e1065" />
                </linearGradient>
                <radialGradient id="wtunnel" cx="50%" cy="50%" r="50%">
                  <stop offset="0" stopColor="#fef08a" /><stop offset=".5" stopColor="#db2777" /><stop offset="1" stopColor="#2e1065" />
                </radialGradient>
              </defs>
              <path d="M14 40C14 18 32 4 66 4s52 14 52 36v132H14V40Z" fill="#1e1b4b" stroke="#a78bfa" strokeWidth="3" />
              {/* the door leaf, ajar — a glowing tunnel spills out */}
              <path d="M24 44C24 26 38 14 66 14s42 12 42 30v122H24V44Z" fill="url(#wdoor)" stroke="#c4b5fd" strokeWidth="2" />
              <ellipse cx="66" cy="104" rx="30" ry="52" fill="url(#wtunnel)" className="w-glow" />
              <circle cx="66" cy="104" r="10" fill="#fff8e1" opacity=".9" />
            </svg>
            {/* floating key */}
            <div className="float-mid absolute -right-8 top-1/2 rotate-[20deg]">
              <svg width="70" height="30" viewBox="0 0 66 30" fill="none" className="drop-shadow-[0_4px_12px_rgba(253,224,71,.6)]">
                <circle cx="13" cy="15" r="10" fill="none" stroke="#fbbf24" strokeWidth="4" />
                <circle cx="13" cy="15" r="3.5" fill="#160a2e" />
                <rect x="21" y="12.5" width="42" height="5" rx="2.5" fill="#fbbf24" />
                <rect x="52" y="17" width="5" height="9" rx="2" fill="#fbbf24" />
                <rect x="60" y="17" width="5" height="7" rx="2" fill="#fbbf24" />
              </svg>
            </div>
          </div>

          <div className="reveal mt-8 max-w-lg">
            <p className="mb-3 text-xs font-bold uppercase tracking-[0.3em] text-fuchsia-200/70">Chapter Two</p>
            <h2 className="font-display text-4xl font-extrabold sm:text-5xl">벽 속의 작은 문</h2>
            <p className="mt-4 text-base leading-relaxed text-violet-100/80">
              벽지 뒤에 숨겨진 작은 문. 열쇠를 꽂자,<br />
              무지갯빛 터널이 <span className="font-bold text-white">다른 세계</span>로 이어졌어.
            </p>
          </div>
        </div>
      </section>

      {/* ══ SCENE 4 · THE OTHER WORLD ═════════════════════════════════════ */}
      <section className="relative flex min-h-screen items-center overflow-hidden"
        style={{ background: 'radial-gradient(1000px 700px at 50% 120%, #4a1d6e 0%, transparent 60%), linear-gradient(180deg,#160a2e,#25123f 70%,#1a0b30)' }}>
        <div className="w-stars absolute inset-0 opacity-60" data-speed="0.05" />
        {/* fireflies */}
        {[
          { l: '14%', t: '30%', d: '0s' }, { l: '26%', t: '62%', d: '1.2s' }, { l: '40%', t: '24%', d: '.6s' },
          { l: '58%', t: '54%', d: '2.1s' }, { l: '72%', t: '34%', d: '1.6s' }, { l: '84%', t: '60%', d: '.3s' },
          { l: '48%', t: '70%', d: '2.6s' }, { l: '66%', t: '20%', d: '1.9s' },
        ].map((f, i) => (
          <div key={i} className="firefly" style={{ left: f.l, top: f.t, animationDelay: f.d }} />
        ))}

        {/* glowing garden */}
        <div className="absolute inset-x-0 bottom-0" data-speed="-0.05">
          <div className="relative mx-auto flex max-w-5xl items-end justify-center gap-6 px-6 pb-2">
            {[
              { c: '#f0abfc', h: 150, s: 'sway' }, { c: '#a5f3fc', h: 210, s: 'sway-slow' },
              { c: '#fda4af', h: 130, s: 'sway-slow' }, { c: '#fcd34d', h: 190, s: 'sway' },
              { c: '#c4b5fd', h: 165, s: 'sway-slow' }, { c: '#5eead4', h: 200, s: 'sway' },
              { c: '#f9a8d4', h: 140, s: 'sway-slow' },
            ].map((fl, i) => (
              <div key={i} className={fl.s} style={{ height: fl.h }}>
                <svg width="46" height={fl.h} viewBox={`0 0 46 ${fl.h}`} fill="none">
                  <path d={`M23 ${fl.h} V44`} stroke="#3a6b4f" strokeWidth="4" strokeLinecap="round" />
                  <g className="w-glow" style={{ animationDelay: `${i * 0.4}s` }}>
                    <circle cx="23" cy="26" r="15" fill={fl.c} opacity=".95" />
                    <circle cx="23" cy="26" r="26" fill={fl.c} opacity=".18" />
                    <circle cx="23" cy="26" r="6" fill="#fff8e1" />
                  </g>
                </svg>
              </div>
            ))}
          </div>
        </div>

        {/* the black cat, watching */}
        <div className="absolute bottom-2 right-[8%]" data-speed="-0.02">
          <svg width="120" height="150" viewBox="0 0 120 150" fill="none" className="drop-shadow-[0_10px_20px_rgba(0,0,0,.5)]">
            <path d="M34 150c-8-40-16-58-10-86 4-19 18-32 36-32s32 13 36 32c6 28-2 46-10 86Z" fill="#0a0712" />
            <path d="M40 40 30 12l20 14Zm40 0 10-28-20 14Z" fill="#0a0712" />
            {/* button eyes — glowing */}
            <circle cx="50" cy="52" r="7" fill="#fde68a" className="w-glow" />
            <circle cx="70" cy="52" r="7" fill="#fde68a" className="w-glow" style={{ animationDelay: '.6s' }} />
            <path d="M47 49l6 6m0-6l-6 6M67 49l6 6m0-6l-6 6" stroke="#160a2e" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
        </div>

        <div className="relative z-10 mx-auto max-w-xl px-8 text-center reveal">
          <p className="mb-3 text-xs font-bold uppercase tracking-[0.3em] text-fuchsia-200/70">Chapter Three</p>
          <h2 className="font-display text-4xl font-extrabold sm:text-5xl">다른 세계의 정원</h2>
          <p className="mt-4 text-base leading-relaxed text-violet-100/80">
            이곳에선 모든 게 더 밝게 빛나고, 꽃들이 노래해.<br />
            검은 고양이가 속삭였어 — <span className="italic text-white">"여기 머물려면, 매일 배워야 해."</span>
          </p>
        </div>
      </section>

      {/* ══ SCENE 5 · ENTER TO STUDY ══════════════════════════════════════ */}
      <section className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6 text-center"
        style={{ background: 'radial-gradient(900px 700px at 50% 40%, #3b0f52 0%, transparent 60%), linear-gradient(180deg,#1a0b30,#0b1030)' }}>
        <div className="w-stars absolute inset-0" data-speed="0.06" />
        <div className="mist w-drift-a" style={{ width: 560, height: 560, left: '50%', top: '50%', transform: 'translate(-50%,-50%)', background: '#7c3aed', opacity: .34 }} />

        {/* button-eye pair, done large & unmistakable */}
        <div className="relative z-10 mb-8 flex items-center gap-6" data-speed="-0.03">
          {[0, 1].map((i) => (
            <div key={i} className="float-mid" style={{ animationDelay: i ? '.5s' : '0s' }}>
              <svg width="72" height="72" viewBox="0 0 24 24" fill="none" className="drop-shadow-[0_0_18px_rgba(167,139,250,.7)]">
                <defs>
                  <radialGradient id={`be${i}`} cx="38%" cy="30%" r="78%">
                    <stop offset="0" stopColor="#514a60" /><stop offset=".55" stopColor="#1a1622" /><stop offset="1" stopColor="#050409" />
                  </radialGradient>
                </defs>
                <circle cx="12" cy="12" r="11" fill={`url(#be${i})`} stroke="#e2e8f0" strokeOpacity=".4" />
                <ellipse cx="8.6" cy="7.8" rx="4.2" ry="2.6" fill="#fff" opacity=".16" />
                <path d="M8 8 16 16M16 8 8 16" stroke="#cbd5e1" strokeWidth="2.1" strokeLinecap="round" opacity=".92" />
                <circle cx="8" cy="8" r="1.7" fill="#050409" /><circle cx="16" cy="8" r="1.7" fill="#050409" />
                <circle cx="8" cy="16" r="1.7" fill="#050409" /><circle cx="16" cy="16" r="1.7" fill="#050409" />
              </svg>
            </div>
          ))}
        </div>

        <div className="reveal relative z-10 max-w-xl">
          {/* Daily study streak — rewards Taylor for coming back every day */}
          <div className="glass-night mx-auto mb-7 inline-flex flex-col items-center gap-2.5 rounded-2xl px-7 py-4">
            <div className="text-sm font-extrabold text-amber-200">
              {streak.count >= 2 ? `🔥 ${streak.count}일 연속 공부 중!`
                : streak.activeToday ? '🔥 오늘도 문을 열었구나!'
                : '🔥 오늘부터 불꽃을 켜볼까?'}
            </div>
            <div className="flex gap-1.5">
              {streak.last7.map((d, i) => (
                <div key={i} title={d.date}
                  className={`h-2.5 w-2.5 rounded-full transition-colors ${d.active ? 'bg-amber-400' : 'bg-white/15'} ${d.isToday ? 'ring-2 ring-amber-300/70' : ''}`} />
              ))}
            </div>
            <div className="text-[11px] text-violet-200/60">
              {streak.best >= 2 ? `최고 기록 ${streak.best}일 · 이어서 갱신해보자!` : '매일 들어오면 불꽃이 자라나요'}
            </div>
          </div>

          <h2 className="font-display text-4xl font-extrabold leading-tight sm:text-6xl">
            준비됐어, <span className="text-shimmer">태윤아?</span>
          </h2>
          <p className="mt-5 text-base leading-relaxed text-violet-100/85 sm:text-lg">
            다른 세계의 문은 매일 열려 있어.<br />
            오늘도 한 걸음, 영어의 마법을 배우러 들어가 볼까?
          </p>
          <button
            onClick={enterWithFx}
            className="group mt-9 inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-violet-500 via-fuchsia-500 to-indigo-600 px-8 py-4 text-lg font-extrabold text-white shadow-2xl shadow-fuchsia-500/40 ring-1 ring-white/25 hover:-translate-y-0.5 hover:shadow-fuchsia-500/60"
          >
            <span>✨ 공부하러 들어가기</span>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="transition-transform group-hover:translate-x-1">
              <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <p className="mt-5 text-xs text-violet-200/50">문을 열면 오늘의 수업이 기다리고 있어</p>
        </div>
      </section>
    </div>
  );
}
