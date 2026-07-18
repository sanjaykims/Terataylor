import { SCHEDULE, BOOKS, HOLIDAY, kstToday } from '../data/syllabus';
import Icon from './Icon';

// All date logic on 'YYYY-MM-DD' strings compared in the academy's timezone
// (KST), so it is correct regardless of the viewing device's timezone. Day
// counts parse both sides as explicit UTC midnight (consistent → exact days).
const utcDays = (s: string) => Math.round(Date.parse(`${s}T00:00:00Z`) / 86_400_000);
function daysDiff(a: string, b: string) { return utcDays(b) - utcDays(a); }
function fmtDate(s: string) {
  const [, m, d] = s.split('-');
  return `${Number(m)}/${Number(d)} (수)`;
}

export default function LessonScheduleWidget() {
  const today = kstToday();

  const pastLessons  = SCHEDULE.filter(l => l.date <= today);
  const futureLessons = SCHEDULE.filter(l => l.date > today);
  const current  = pastLessons.at(-1) ?? null;
  const next     = futureLessons[0] ?? null;
  const isToday  = (s: string) => s === today;
  const isHolidayToday = HOLIDAY.date === today;
  const termEnded = pastLessons.length === SCHEDULE.length && !next;

  const daysUntil = next ? daysDiff(today, next.date) : null;
  const dTag = daysUntil === 0 ? 'TODAY!' : daysUntil === 1 ? 'D-1' : daysUntil != null ? `D-${daysUntil}` : null;

  const done  = pastLessons.length;
  const total = SCHEDULE.length;
  const pct   = Math.round((done / total) * 100);

  return (
    <div className="surface p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="font-semibold text-sm text-gray-900 flex items-center gap-1.5">
          <Icon name="calendar" className="h-4 w-4" style={{ color: 'var(--accent)' }} />
          V1 Tera 수업 일정
          <span className="eyebrow" style={{ fontSize: '0.6rem' }}>여름학기 2026</span>
        </div>
        <span className="text-xs text-muted">총 12회 수업</span>
      </div>

      {termEnded ? (
        <div className="text-center py-3 font-bold text-emerald-600 text-lg flex items-center justify-center gap-2">
          <Icon name="check" className="h-5 w-5" />
          여름학기 수업 완료!
        </div>
      ) : isHolidayToday ? (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm font-semibold text-amber-700">
          {HOLIDAY.note}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {/* Current lesson */}
          {current && (
            <div className="surface-soft p-3">
              <div className="text-xs text-muted font-semibold mb-1 flex items-center gap-1.5">
                <span className={`inline-block w-2 h-2 rounded-full ${isToday(current.date) ? 'bg-emerald-500' : 'bg-gray-300'}`} />
                {isToday(current.date) ? '오늘 수업' : '지난 수업'}
              </div>
              <div className="font-bold text-sm text-gray-900">Lesson {String(current.lesson).padStart(2,'0')}</div>
              <div className="text-xs text-gray-600 mt-0.5">{BOOKS[current.book].shortTitle}</div>
              <div className="text-xs font-semibold text-gray-900 mt-1">{current.pages}</div>
              <div className="text-xs text-muted mt-0.5">{fmtDate(current.date)}</div>
            </div>
          )}

          {/* Next lesson */}
          {next && (
            <div className="surface-soft p-3">
              <div className="flex items-center justify-between mb-1">
                <div className="text-xs text-muted font-semibold flex items-center gap-1.5">
                  <Icon name="pin" className="h-3.5 w-3.5" /> 다음 수업
                </div>
                {dTag && (
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full text-white ${
                    daysUntil === 0 ? 'bg-red-500' : daysUntil! <= 3 ? 'bg-amber-500' : 'bg-gray-400'
                  }`}>{dTag}</span>
                )}
              </div>
              <div className="font-bold text-sm text-gray-900">Lesson {String(next.lesson).padStart(2,'0')}</div>
              <div className="text-xs text-gray-600 mt-0.5">{BOOKS[next.book].shortTitle}</div>
              <div className="text-xs font-semibold text-gray-900 mt-1">{next.pages}</div>
              <div className="text-xs text-muted mt-0.5">{fmtDate(next.date)}</div>
            </div>
          )}

          {!current && next && (
            <div className="surface-soft p-3">
              <div className="text-xs text-muted font-semibold mb-1 flex items-center gap-1.5">
                <Icon name="book" className="h-3.5 w-3.5" /> 첫 수업
              </div>
              <div className="text-xs text-gray-600">June 3 — 준비하세요!</div>
            </div>
          )}
        </div>
      )}

      {/* Homework */}
      {current && !isToday(current.date) && (
        <div className="surface-soft px-3 py-2 flex items-start gap-2">
          <Icon name="document" className="h-4 w-4 shrink-0 mt-0.5" style={{ color: 'var(--accent)' }} />
          <div>
            <div className="text-xs font-bold text-muted">이번 주 숙제</div>
            <div className="text-sm text-gray-900 mt-0.5">{current.homework}</div>
          </div>
        </div>
      )}

      {/* Progress bar */}
      <div>
        <div className="flex justify-between text-xs text-muted mb-1">
          <span>학기 진도</span>
          <span className="font-semibold text-gray-700">{done} / {total} 완료 ({pct}%)</span>
        </div>
        <div className="w-full rounded-full h-2.5 overflow-hidden" style={{ background: 'var(--paper-3)' }}>
          <div className="progress-fill h-full transition-[width] duration-700" style={{ width: `${pct}%` }} />
        </div>
        <div className="flex mt-1 gap-0.5">
          {SCHEDULE.map(l => {
            const past = l.date <= today;
            const isCur = current?.lesson === l.lesson;
            return (
              <div key={l.lesson} title={`Lesson ${l.lesson} (${l.book === 'edward' ? 'ET' : 'CL'})`}
                className="flex-1 h-1.5 rounded-full transition-colors"
                style={{
                  background: isCur ? 'var(--accent)'
                    : past ? (l.book === 'edward' ? 'var(--info)' : 'var(--accent-strong)')
                    : 'var(--paper-3)',
                }} />
            );
          })}
        </div>
      </div>
    </div>
  );
}
