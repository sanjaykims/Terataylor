import { SCHEDULE, BOOKS, HOLIDAY } from '../data/syllabus';

function today0() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}
function parseDate(s: string) {
  const d = new Date(s);
  d.setHours(0, 0, 0, 0);
  return d;
}
function daysDiff(a: Date, b: Date) {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}
function fmtDate(s: string) {
  const d = parseDate(s);
  return `${d.getMonth() + 1}/${d.getDate()} (수)`;
}

export default function LessonScheduleWidget() {
  const now    = today0();
  const holiday = parseDate(HOLIDAY.date);

  // Most recent past lesson (or current if today == lesson date)
  const pastLessons  = SCHEDULE.filter(l => parseDate(l.date) <= now);
  const futureLessons = SCHEDULE.filter(l => parseDate(l.date) > now);
  const current  = pastLessons.at(-1) ?? null;
  const next     = futureLessons[0] ?? null;
  const isToday  = (s: string) => parseDate(s).getTime() === now.getTime();
  const isHolidayToday = now.getTime() === holiday.getTime();
  const termEnded = pastLessons.length === SCHEDULE.length && !next;

  // Days until next class
  const daysUntil = next ? daysDiff(now, parseDate(next.date)) : null;
  const dTag = daysUntil === 0 ? 'TODAY!' : daysUntil === 1 ? 'D-1' : daysUntil != null ? `D-${daysUntil}` : null;

  // Semester progress
  const done  = pastLessons.length;
  const total = SCHEDULE.length;
  const pct   = Math.round((done / total) * 100);

  const currentBook = (current ?? next)?.book ?? 'edward';
  const bk = BOOKS[currentBook];

  return (
    <div className={`rounded-2xl shadow-sm border-2 ${bk.border} ${bk.bg} p-4 space-y-3`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className={`font-bold text-sm ${bk.color} flex items-center gap-1.5`}>
          📅 V1 Tera 수업 일정
          <span className="text-xs font-normal text-gray-400">여름학기 2026</span>
        </div>
        <span className="text-xs text-gray-400">총 12회 수업</span>
      </div>

      {termEnded ? (
        <div className="text-center py-3 font-bold text-emerald-600 text-lg">
          🎉 여름학기 수업 완료!
        </div>
      ) : isHolidayToday ? (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm font-semibold text-amber-700">
          🏖️ {HOLIDAY.note}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {/* Current lesson */}
          {current && (
            <div className="bg-white rounded-xl p-3 shadow-sm border border-gray-100">
              <div className="text-xs text-gray-400 font-semibold mb-1">
                {isToday(current.date) ? '🟢 오늘 수업' : '✅ 지난 수업'}
              </div>
              <div className={`font-bold text-sm ${bk.color}`}>Lesson {String(current.lesson).padStart(2,'0')}</div>
              <div className="text-xs text-gray-600 mt-0.5">{BOOKS[current.book].shortTitle}</div>
              <div className="text-xs font-semibold text-gray-700 mt-1">{current.pages}</div>
              <div className="text-xs text-gray-400 mt-0.5">{fmtDate(current.date)}</div>
            </div>
          )}

          {/* Next lesson */}
          {next && (
            <div className="bg-white rounded-xl p-3 shadow-sm border border-gray-100">
              <div className="flex items-center justify-between mb-1">
                <div className="text-xs text-gray-400 font-semibold">📌 다음 수업</div>
                {dTag && (
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full text-white ${
                    daysUntil === 0 ? 'bg-red-500' : daysUntil! <= 3 ? 'bg-orange-500' : 'bg-gray-400'
                  }`}>{dTag}</span>
                )}
              </div>
              <div className={`font-bold text-sm ${BOOKS[next.book].color}`}>Lesson {String(next.lesson).padStart(2,'0')}</div>
              <div className="text-xs text-gray-600 mt-0.5">{BOOKS[next.book].shortTitle}</div>
              <div className="text-xs font-semibold text-gray-700 mt-1">{next.pages}</div>
              <div className="text-xs text-gray-400 mt-0.5">{fmtDate(next.date)}</div>
            </div>
          )}

          {!current && next && (
            <div className="bg-white rounded-xl p-3 shadow-sm border border-gray-100">
              <div className="text-xs text-gray-400 font-semibold mb-1">📖 첫 수업</div>
              <div className="text-xs text-gray-600">June 3 — 준비하세요!</div>
            </div>
          )}
        </div>
      )}

      {/* Homework */}
      {current && !isToday(current.date) && (
        <div className="bg-white rounded-xl px-3 py-2 flex items-start gap-2">
          <span className="text-base shrink-0">📝</span>
          <div>
            <div className="text-xs font-bold text-gray-600">이번 주 숙제</div>
            <div className="text-xs text-gray-700 mt-0.5">{current.homework}</div>
          </div>
        </div>
      )}

      {/* Progress bar */}
      <div>
        <div className="flex justify-between text-xs text-gray-400 mb-1">
          <span>학기 진도</span>
          <span className="font-semibold">{done} / {total} 완료 ({pct}%)</span>
        </div>
        <div className="w-full bg-white rounded-full h-2.5 border border-gray-200 overflow-hidden">
          <div className={`h-full rounded-full transition-all duration-700 ${bk.badge}`}
            style={{ width: `${pct}%` }} />
        </div>
        <div className="flex mt-1 gap-0.5">
          {SCHEDULE.map(l => {
            const past = parseDate(l.date) <= now;
            const isCur = current?.lesson === l.lesson;
            return (
              <div key={l.lesson} title={`Lesson ${l.lesson} (${l.book === 'edward' ? 'ET' : 'CL'})`}
                className={`flex-1 h-1.5 rounded-full transition-all ${
                  isCur ? bk.badge + ' opacity-100' :
                  past ? (l.book === 'edward' ? 'bg-blue-400' : 'bg-purple-400') :
                  'bg-gray-200'
                }`} />
            );
          })}
        </div>
      </div>
    </div>
  );
}
