import { useEffect, useRef, useState } from 'react';
import { extractVocabulary } from '../utils/textUtils';
import { trackGameScore } from '../lib/tracker';
import type { VocabItem } from '../lib/types';

const CW = 480, CH = 500;
const SHIP_Y = CH - 65;
const BULLET_SPD = 500;
const LIVES0 = 3;
const ALIEN_COLS = ['#ff6b6b','#ffa94d','#ffd43b','#a9e34b','#74c0fc','#da77f2'];
const WAVES = [
  { n: 6, spd: 40, gap: 3.5 },
  { n: 8, spd: 62, gap: 2.8 },
  { n: 10, spd: 82, gap: 2.1 },
];
const DEFAULT_WORDS = [
  'elephant','ancient','freedom','courage','creature','discover',
  'journey','mystery','protect','believe','imagine','triumph',
  'explore','inspire','adventure','champion','brilliant','fantastic',
];

let _uid = 0;
const nid = () => ++_uid;

let _actx: AudioContext | null = null;
const actx = () => { try { if (!_actx) _actx = new AudioContext(); return _actx; } catch { return null; } };
const playLaser = () => {
  const c = actx(); if (!c) return;
  const o = c.createOscillator(), g = c.createGain();
  o.connect(g); g.connect(c.destination);
  const t = c.currentTime;
  o.frequency.setValueAtTime(880, t); o.frequency.exponentialRampToValueAtTime(220, t + 0.1);
  g.gain.setValueAtTime(0.15, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
  o.start(t); o.stop(t + 0.1);
};
const playBoom = () => {
  const c = actx(); if (!c) return;
  const buf = c.createBuffer(1, Math.floor(c.sampleRate * 0.18), c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random()*2-1)*(1 - i/d.length);
  const s = c.createBufferSource(), g = c.createGain();
  s.buffer = buf; s.connect(g); g.connect(c.destination);
  g.gain.setValueAtTime(0.4, c.currentTime); s.start(c.currentTime);
};
const playDeath = () => {
  const c = actx(); if (!c) return;
  const o = c.createOscillator(), g = c.createGain();
  o.connect(g); g.connect(c.destination); o.type = 'sawtooth';
  const t = c.currentTime;
  o.frequency.setValueAtTime(440, t); o.frequency.exponentialRampToValueAtTime(55, t+0.45);
  g.gain.setValueAtTime(0.2, t); g.gain.exponentialRampToValueAtTime(0.001, t+0.45);
  o.start(t); o.stop(t+0.45);
};

interface Alien  { id:number; word:string; display:string; x:number; y:number; spd:number; col:string; }
interface Bullet { id:number; x:number; y:number; tx:number; ty:number; did:number; }
interface Spark  { x:number; y:number; vx:number; vy:number; t:number; col:string; r:number; }
interface GStar  { x:number; y:number; spd:number; r:number; }

type Phase = 'start'|'play'|'wave_done'|'over'|'win';

function rrect(ctx: CanvasRenderingContext2D, x:number, y:number, w:number, h:number, r:number) {
  ctx.beginPath();
  ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y); ctx.quadraticCurveTo(x+w,y,x+w,y+r);
  ctx.lineTo(x+w,y+h-r); ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
  ctx.lineTo(x+r,y+h); ctx.quadraticCurveTo(x,y+h,x,y+h-r);
  ctx.lineTo(x,y+r); ctx.quadraticCurveTo(x,y,x+r,y);
  ctx.closePath();
}

export default function SpaceGame({ text, bookVocab, selectedWords }: { text: string; bookVocab?: VocabItem[] | null; selectedWords?: string[] }) {
  const cvs  = useRef<HTMLCanvasElement>(null);
  const inp  = useRef<HTMLInputElement>(null);
  const raf  = useRef(0);
  const lt   = useRef(0);
  const live = useRef(''); // current typed value for use inside rAF

  const [phase, setPhase] = useState<Phase>('start');
  const [score, setScore] = useState(0);
  const [iv, setIv] = useState('');

  const gs = useRef({
    stars:   [] as GStar[],
    aliens:  [] as Alien[],
    bullets: [] as Bullet[],
    sparks:  [] as Spark[],
    lives: LIVES0, score: 0, wave: 0,
    pool: [] as { word: string; display: string }[],
    spawnT: 2,
  });

  // Build word pairs: display = Korean meaning shown on alien, word = English typed to shoot
  const vocabPairs = (() => {
    const koMap = new Map<string, string>();
    if (bookVocab?.length) {
      for (const v of bookVocab) {
        if (v.korean) koMap.set(v.word.toLowerCase(), v.korean);
      }
    }
    const toPair = (w: string) => ({ word: w, display: koMap.get(w.toLowerCase()) || w });

    if (selectedWords && selectedWords.length >= 3) return selectedWords.map(toPair);
    if (bookVocab && bookVocab.length >= 6) {
      return bookVocab.map(v => ({ word: v.word, display: v.korean || v.word }));
    }
    const w = extractVocabulary(text).map(v => v.word);
    return (w.length >= 6 ? w : DEFAULT_WORDS).map(toPair);
  })();

  const setupWave = (wi: number) => {
    const g = gs.current;
    g.wave = wi;
    g.aliens = []; g.bullets = [];
    const cfg = WAVES[Math.min(wi, WAVES.length-1)];
    g.pool = [...vocabPairs].sort(() => Math.random()-0.5).slice(0, cfg.n);
    g.spawnT = 1.5;
  };

  const startGame = () => {
    _uid = 0;
    const g = gs.current;
    g.stars = Array.from({length:65}, () => ({
      x: Math.random()*CW, y: Math.random()*CH,
      spd: 25+Math.random()*45, r: 0.5+Math.random()*1.5,
    }));
    g.sparks = []; g.lives = LIVES0; g.score = 0;
    setupWave(0);
    setScore(0); setIv(''); live.current = '';
    setPhase('play');
    setTimeout(() => inp.current?.focus(), 50);
  };

  // wave_done → next wave after 3 s
  useEffect(() => {
    if (phase !== 'wave_done') return;
    const t = setTimeout(() => {
      const next = gs.current.wave + 1;
      if (next >= WAVES.length) {
        trackGameScore('space', gs.current.score, { wave: WAVES.length, details: { result: 'victory' } });
        setPhase('win'); return;
      }
      setupWave(next);
      setPhase('play');
      setTimeout(() => inp.current?.focus(), 50);
    }, 3000);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const handleChange = (val: string) => {
    setIv(val);
    live.current = val.toLowerCase().trim();
    const match = gs.current.aliens.find(a => a.word.toLowerCase() === live.current);
    if (match) {
      playLaser();
      gs.current.bullets.push({ id:nid(), x:CW/2, y:SHIP_Y-22, tx:match.x, ty:match.y, did:match.id });
      setIv(''); live.current = '';
      setTimeout(() => inp.current?.focus(), 0);
    }
  };

  // Main game loop
  useEffect(() => {
    if (phase !== 'play') return;
    const canvas = cvs.current!;
    const ctx = canvas.getContext('2d')!;

    const tick = (now: number) => {
      const dt = Math.min((now - lt.current)/1000, 0.05);
      lt.current = now;
      const g = gs.current;
      const cfg = WAVES[Math.min(g.wave, WAVES.length-1)];

      // ── SPAWN ──
      if (g.pool.length > 0 && g.aliens.length < 5) {
        g.spawnT -= dt;
        if (g.spawnT <= 0) {
          const pair = g.pool.shift()!;
          g.aliens.push({
            id:nid(), word: pair.word, display: pair.display,
            x: 55 + Math.random()*(CW-110),
            y: -45, spd: cfg.spd + Math.random()*22,
            col: ALIEN_COLS[Math.floor(Math.random()*ALIEN_COLS.length)],
          });
          g.spawnT = cfg.gap + (Math.random()-0.5)*0.5;
        }
      }

      // ── MOVE ALIENS ──
      for (const a of g.aliens) a.y += a.spd * dt;

      // ── BULLETS ──
      for (let i = g.bullets.length-1; i >= 0; i--) {
        const b = g.bullets[i];
        const tgt = g.aliens.find(a => a.id === b.did);
        if (!tgt) { g.bullets.splice(i,1); continue; }
        b.tx = tgt.x; b.ty = tgt.y;
        const dx = b.tx-b.x, dy = b.ty-b.y;
        const dist = Math.hypot(dx,dy);
        if (dist < 10) {
          playBoom();
          for (let k=0; k<20; k++) {
            const a = Math.random()*Math.PI*2, s = 60+Math.random()*140;
            g.sparks.push({ x:tgt.x, y:tgt.y, vx:Math.cos(a)*s, vy:Math.sin(a)*s, t:0.7, col:tgt.col, r:2+Math.random()*4 });
          }
          g.score += 100 + g.wave*50;
          setScore(g.score);
          g.aliens.splice(g.aliens.indexOf(tgt),1);
          g.bullets.splice(i,1);
        } else {
          b.x += dx/dist * BULLET_SPD * dt;
          b.y += dy/dist * BULLET_SPD * dt;
        }
      }

      // ── ESCAPED ALIENS ──
      const esc = g.aliens.filter(a => a.y > CH+35);
      if (esc.length) {
        playDeath();
        g.lives = Math.max(0, g.lives - esc.length);
        g.aliens = g.aliens.filter(a => a.y <= CH+35);
        if (g.lives <= 0) {
          trackGameScore('space', g.score, { wave: g.wave + 1, details: { result: 'game_over' } });
          setPhase('over'); return;
        }
      }

      // ── WAVE CLEAR ──
      if (g.pool.length === 0 && g.aliens.length === 0 && g.bullets.length === 0) {
        setPhase('wave_done'); return;
      }

      // ── SPARKS ──
      for (const s of g.sparks) {
        s.x += s.vx*dt; s.y += s.vy*dt;
        s.vy += 200*dt; s.t -= dt;
      }
      g.sparks = g.sparks.filter(s => s.t > 0);

      // ── STARS ──
      for (const s of g.stars) {
        s.y += s.spd*dt;
        if (s.y > CH) { s.y = -2; s.x = Math.random()*CW; }
      }

      // ═══════════════════ RENDER ════════════════════════════════════════════
      ctx.fillStyle = '#050510'; ctx.fillRect(0,0,CW,CH);

      // Stars
      for (const s of g.stars) {
        ctx.fillStyle = `rgba(255,255,255,${0.2+s.r*0.18})`;
        ctx.beginPath(); ctx.arc(s.x,s.y,s.r,0,Math.PI*2); ctx.fill();
      }

      // Sparks
      for (const s of g.sparks) {
        ctx.globalAlpha = s.t/0.7;
        ctx.fillStyle = s.col;
        ctx.beginPath(); ctx.arc(s.x,s.y,s.r*(s.t/0.7)+0.5,0,Math.PI*2); ctx.fill();
      }
      ctx.globalAlpha = 1;

      // Bullets
      for (const b of g.bullets) {
        const dx=b.tx-b.x, dy=b.ty-b.y, dist=Math.max(Math.hypot(dx,dy),1), len=18;
        ctx.save();
        ctx.shadowColor='#a9e34b'; ctx.shadowBlur=10;
        ctx.strokeStyle='#a9e34b'; ctx.lineWidth=3;
        ctx.beginPath();
        ctx.moveTo(b.x,b.y);
        ctx.lineTo(b.x-dx/dist*len, b.y-dy/dist*len);
        ctx.stroke();
        ctx.fillStyle='#fff';
        ctx.beginPath(); ctx.arc(b.x,b.y,2.5,0,Math.PI*2); ctx.fill();
        ctx.restore();
      }

      // Aliens
      const cur = live.current;
      ctx.font = 'bold 13px monospace';
      for (const a of g.aliens) {
        const wl = a.word.toLowerCase();
        const isTarget = cur.length > 0 && wl.startsWith(cur);
        ctx.save(); ctx.translate(a.x, a.y);
        if (isTarget) { ctx.shadowColor='#fff'; ctx.shadowBlur=20; }

        // Body ellipse
        ctx.fillStyle = a.col;
        ctx.beginPath(); ctx.ellipse(0,8,35,17,0,0,Math.PI*2); ctx.fill();

        // Dome
        ctx.fillStyle = a.col+'bb';
        ctx.beginPath(); ctx.ellipse(0,0,22,16,0,Math.PI,0); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.beginPath(); ctx.ellipse(-5,-5,11,7,-0.3,Math.PI,0); ctx.fill();

        // Lights
        for (let li=-2; li<=2; li++) {
          ctx.fillStyle = li%2===0 ? '#ffe066' : '#ff6b6b';
          ctx.beginPath(); ctx.arc(li*10,17,3.5,0,Math.PI*2); ctx.fill();
        }
        ctx.shadowBlur=0;

        // ── Label box: Korean meaning (top) + English typing progress (bottom) ──
        const hasKorean = a.display !== a.word;

        // Korean line (or English word when no Korean available)
        ctx.font = hasKorean ? 'bold 12px sans-serif' : 'bold 13px monospace';
        const koW = ctx.measureText(a.display).width;

        // English typing progress line (only drawn when Korean is shown)
        const typed = isTarget ? cur : '';
        const rest  = a.word.slice(typed.length);
        ctx.font = 'bold 11px monospace';
        const tyW  = ctx.measureText(typed).width;
        const reW  = ctx.measureText(rest).width;
        const enW  = tyW + reW;

        const boxW  = Math.max(koW, enW) + 16;
        const boxH  = hasKorean ? (isTarget ? 38 : 24) : 22;
        const bx    = -boxW / 2;
        const by    = 25;

        ctx.fillStyle = 'rgba(0,0,0,0.85)';
        rrect(ctx, bx, by, boxW, boxH, 6); ctx.fill();

        ctx.textAlign = 'center'; ctx.textBaseline = 'top';

        // Korean / display label
        ctx.font = hasKorean ? 'bold 12px sans-serif' : 'bold 13px monospace';
        ctx.fillStyle = isTarget ? '#ffd43b' : (hasKorean ? '#a5d8ff' : '#ddd');
        ctx.fillText(a.display, 0, by + 4);

        // English typing progress (only when targeting and Korean is shown)
        if (hasKorean && isTarget) {
          ctx.font = 'bold 11px monospace';
          ctx.textAlign = 'left';
          const ex = -enW / 2;
          if (typed) { ctx.fillStyle = '#ffe066'; ctx.fillText(typed, ex, by + 20); }
          ctx.fillStyle = '#aaa';
          ctx.fillText(rest, ex + tyW, by + 20);
        }

        ctx.restore();
      }

      // Player ship
      ctx.save(); ctx.translate(CW/2, SHIP_Y);
      const eg = ctx.createRadialGradient(0,22,0,0,22,26);
      eg.addColorStop(0,'rgba(116,192,252,0.7)'); eg.addColorStop(1,'rgba(116,192,252,0)');
      ctx.fillStyle=eg; ctx.fillRect(-26,10,52,30);
      ctx.fillStyle='#4dabf7';
      ctx.beginPath(); ctx.moveTo(-5,6); ctx.lineTo(-28,22); ctx.lineTo(-18,6); ctx.fill();
      ctx.beginPath(); ctx.moveTo(5,6); ctx.lineTo(28,22); ctx.lineTo(18,6); ctx.fill();
      ctx.fillStyle='#74c0fc';
      ctx.beginPath(); ctx.moveTo(0,-24); ctx.lineTo(13,8); ctx.lineTo(9,20); ctx.lineTo(-9,20); ctx.lineTo(-13,8); ctx.closePath(); ctx.fill();
      ctx.fillStyle='#a5f3fc';
      ctx.beginPath(); ctx.ellipse(0,-8,6,9,0,0,Math.PI*2); ctx.fill();
      ctx.restore();

      // HUD
      ctx.fillStyle='rgba(5,5,16,0.88)'; ctx.fillRect(0,0,CW,38);
      ctx.font='bold 14px monospace'; ctx.textBaseline='middle';
      ctx.fillStyle='#ffe066'; ctx.textAlign='left';
      ctx.fillText(`⭐ ${g.score}`, 10, 19);
      ctx.fillStyle='#ff6b6b'; ctx.textAlign='center';
      ctx.fillText('♥ '.repeat(Math.max(g.lives,0)).trim()||'', CW/2, 19);
      ctx.fillStyle='#a9e34b'; ctx.textAlign='right';
      ctx.fillText(`WAVE ${g.wave+1}/${WAVES.length}`, CW-10, 19);

      raf.current = requestAnimationFrame(tick);
    };

    lt.current = performance.now();
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // Responsive scale
  const wrap = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const upd = () => { if (wrap.current) setScale(Math.min(1,(wrap.current.clientWidth-4)/CW)); };
    upd();
    const ob = new ResizeObserver(upd);
    if (wrap.current) ob.observe(wrap.current);
    return () => ob.disconnect();
  }, []);

  const Overlay = ({ children }: { children: React.ReactNode }) => (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 rounded-2xl"
         style={{ background:'rgba(5,5,20,0.93)' }}>
      {children}
    </div>
  );

  return (
    <div ref={wrap} className="space-y-3">
      <div style={{ width:CW*scale, height:CH*scale, position:'relative', margin:'0 auto' }}>
        <canvas ref={cvs} width={CW} height={CH}
          style={{ transform:`scale(${scale})`, transformOrigin:'top left', display:'block', borderRadius:16 }}
          onClick={() => phase==='play' && inp.current?.focus()}
        />

        {phase==='start' && <Overlay>
          <div style={{fontSize:56}}>🛸</div>
          <div className="text-white font-bold text-2xl tracking-wide">VOCAB INVADERS</div>
          <div className="text-gray-300 text-sm text-center px-8 leading-relaxed">
            외계인에 적힌 <span className="text-blue-300 font-bold">🇰🇷 한국어 뜻</span>을 보고<br/>
            <span className="text-yellow-300 font-bold">🇺🇸 영어 단어를 타이핑</span>하면 레이저 발사! ♥
          </div>
          <div className="text-gray-500 text-xs">
            {selectedWords?.length
              ? <><span className="text-yellow-300 font-bold">✓ 선택된 단어 {vocab.length}개</span> · 3 WAVES</>
              : vocab === DEFAULT_WORDS
              ? '샘플 단어 · 3 WAVES'
              : `교재 단어 ${vocab.length}개 · 3 WAVES`}
          </div>
          <button onClick={startGame}
            className="px-8 py-3 bg-indigo-600 text-white font-bold rounded-xl text-lg hover:bg-indigo-500 transition-all active:scale-95 shadow-lg">
            🚀 START
          </button>
        </Overlay>}

        {phase==='wave_done' && <Overlay>
          <div style={{fontSize:48}}>🎉</div>
          <div className="text-green-400 font-bold text-2xl">WAVE {gs.current.wave+1} CLEAR!</div>
          <div className="text-yellow-300 font-bold text-xl">⭐ {score}점</div>
          <div className="text-gray-400 text-sm">3초 후 다음 웨이브...</div>
        </Overlay>}

        {phase==='over' && <Overlay>
          <div style={{fontSize:48}}>💥</div>
          <div className="text-red-400 font-bold text-2xl">GAME OVER</div>
          <div className="text-yellow-300 text-2xl font-bold">{score}점</div>
          <div className="text-gray-300 text-sm">Taylor, 다시 도전! 💪</div>
          <button onClick={startGame}
            className="px-8 py-3 bg-red-600 text-white font-bold rounded-xl text-lg hover:bg-red-500 transition-all active:scale-95">
            🔄 RETRY
          </button>
        </Overlay>}

        {phase==='win' && <Overlay>
          <div style={{fontSize:48}}>🏆</div>
          <div className="text-yellow-300 font-bold text-2xl">MISSION COMPLETE!</div>
          <div className="text-white text-3xl font-bold">{score}점</div>
          <div className="text-green-400 text-sm">모든 외계인 격추! 최고야 Taylor! 🎊</div>
          <button onClick={startGame}
            className="px-8 py-3 bg-yellow-500 text-white font-bold rounded-xl text-lg hover:bg-yellow-400 transition-all active:scale-95">
            🚀 PLAY AGAIN
          </button>
        </Overlay>}
      </div>

      {(phase==='play'||phase==='wave_done') && (
        <div className="flex gap-2 items-center mx-auto" style={{width:CW*scale}}>
          <span className="text-xl">⌨️</span>
          <input ref={inp} type="text" value={iv}
            onChange={e => handleChange(e.target.value)}
            onKeyDown={e => { if(e.key==='Escape'){setIv('');live.current='';} }}
            placeholder="단어를 타이핑하면 레이저 발사!"
            className="flex-1 bg-gray-900 text-green-400 font-mono font-bold text-lg px-4 py-3 rounded-xl border-2 border-indigo-700 focus:border-indigo-400 focus:outline-none placeholder-gray-700"
            autoComplete="off" autoCorrect="off" autoCapitalize="none" spellCheck={false}
          />
        </div>
      )}
    </div>
  );
}
