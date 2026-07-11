import { SCHEDULE, BOOKS, HOLIDAY, kstToday } from '../data/syllabus';

// All date logic on 'YYYY-MM-DD' strings compared in the academy's timezone
// (KST), so it is correct regardless of the viewing device's timezone. Day
// counts parse both sides as explicit UTC midnight (consistent → exact days).
const utcDays = (s: string) => Math.round(Date.parse(`${s}T00:00:00Z`) / 86_400_000);
function daysDiff(a: string, b: string) { return utcDays(b) - utcDays(a); }
function fmtDate(s: string) {
  const [, m, d] = s.split('-');
  return `${Number(m)}/${Number(d)} (수)`;
}

// Light accents that read well on the dark "Other World" background.
const lessonText: Record<string, string> = { edward: 'text-sky-300', coraline: 'text-fuchsia-300' };

export default function LessonScheduleWidget() {
  const today = kstToday();

  // Most recent past lesson (or current if today == lesson date)
  const pastLessons  = SCHEDULE.filter(l => l.date <= today);
  const futureLessons = SCHEDULE.filter(l => l.date > today);
  const current  = pastLessons.at(-1) ?? null;
  const next     = futureLessons[0] ?? null;
  const isToday  = (s: string) => s === today;
  const isHolidayToday = HOLIDAY.date === today;
  const termEnded = pastLessons.length === SCHEDULE.length && !next;

  // Days until next class
  const daysUntil = next ? daysDiff(today, next.date) : null;
  const dTag = daysUntil === 0 ? 'TODAY!' : daysUntil === 1 ? 'D-1' : daysUntil != null ? `D-${daysUntil}` : null;

  // Semester progress
  const done  = pastLessons.length;
  const total = SCHEDULE.length;
  const pct   = Math.round((done / total) * 100);

  const currentBook = (current ?? next)?.book ?? 'edward';
  const bk = BOOKS[currentBook];

  return (
    <div className="glass-night rounded-2xl p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="font-bold text-sm text-violet-100 flex items-center gap-1.5">
          📅 V1 Tera 수업 일정
          <span className="text-xs font-normal text-violet-200/50">여름학기 2026</span>
        </div>
        <span className="text-xs text-violet-200/50">총 12회 수업</span>
      </div>

      {termEnded ? (
        <div className="text-center py-3 font-bold text-emerald-300 text-lg">
          🎉 여름학기 수업 완료!
        </div>
      ) : isHolidayToday ? (
        <div className="bg-amber-400/10 border border-amber-300/25 rounded-xl px-4 py-3 text-sm font-semibold text-amber-200">
          🏖️ {HOLIDAY.note}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {/* Current lesson */}
          {current && (
            <div className="bg-white/5 rounded-xl p-3 border border-white/10">
              <div className="text-xs text-violet-200/60 font-semibold mb-1">
                {isToday(current.date) ? '🟢 오늘 수업' : '✅ 지난 수업'}
              </div>
              <div className={`font-bold text-sm ${lessonText[current.book]}`}>Lesson {String(current.lesson).padStart(2,'0')}</div>
              <div className="text-xs text-violet-100/70 mt-0.5">{BOOKS[current.book].shortTitle}</div>
              <div className="text-xs font-semibold text-violet-50 mt-1">{current.pages}</div>
              <div className="text-xs text-violet-200/50 mt-0.5">{fmtDate(current.date)}</div>
            </div>
          )}

          {/* Next lesson */}
          {next && (
            <div className="bg-white/5 rounded-xl p-3 border border-white/10">
              <div className="flex items-center justify-between mb-1">
                <div className="text-xs text-violet-200/60 font-semibold">📌 다음 수업</div>
                {dTag && (
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full text-white ${
                    daysUntil === 0 ? 'bg-red-500' : daysUntil! <= 3 ? 'bg-orange-500' : 'bg-gray-400'
                  }`}>{dTag}</span>
                )}
              </div>
              <div className={`font-bold text-sm ${lessonText[next.book]}`}>Lesson {String(next.lesson).padStart(2,'0')}</div>
              <div className="text-xs text-violet-100/70 mt-0.5">{BOOKS[next.book].shortTitle}</div>
              <div className="text-xs font-semibold text-violet-50 mt-1">{next.pages}</div>
              <div className="text-xs text-violet-200/50 mt-0.5">{fmtDate(next.date)}</div>
            </div>
          )}

          {!current && next && (
            <div className="bg-white/5 rounded-xl p-3 border border-white/10">
              <div className="text-xs text-violet-200/60 font-semibold mb-1">📖 첫 수업</div>
              <div className="text-xs text-violet-100/70">June 3 — 준비하세요!</div>
            </div>
          )}
        </div>
      )}

      {/* Homework */}
      {current && !isToday(current.date) && (
        <div className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 flex items-start gap-2">
          <span className="text-base shrink-0">📝</span>
          <div>
            <div className="text-xs font-bold text-violet-200/70">이번 주 숙제</div>
            <div className="text-sm text-violet-50 mt-0.5">{current.homework}</div>
          </div>
        </div>
      )}

      {/* Progress bar */}
      <div>
        <div className="flex justify-between text-xs text-violet-200/60 mb-1">
          <span>학기 진도</span>
          <span className="font-semibold">{done} / {total} 완료 ({pct}%)</span>
        </div>
        <div className="w-full bg-white/10 rounded-full h-2.5 border border-white/10 overflow-hidden">
          <div className={`h-full rounded-full transition-all duration-700 ${bk.badge}`}
            style={{ width: `${pct}%` }} />
        </div>
        <div className="flex mt-1 gap-0.5">
          {SCHEDULE.map(l => {
            const past = l.date <= today;
            const isCur = current?.lesson === l.lesson;
            return (
              <div key={l.lesson} title={`Lesson ${l.lesson} (${l.book === 'edward' ? 'ET' : 'CL'})`}
                className={`flex-1 h-1.5 rounded-full transition-all ${
                  isCur ? bk.badge + ' opacity-100' :
                  past ? (l.book === 'edward' ? 'bg-sky-400' : 'bg-fuchsia-400') :
                  'bg-white/12'
                }`} />
            );
          })}
        </div>
      </div>
    </div>
  );
}
