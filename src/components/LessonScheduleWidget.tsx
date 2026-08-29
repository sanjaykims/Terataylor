import { SCHEDULE, BOOKS, HOLIDAY, kstToday, activeBookIds, type BookId, type LessonEntry } from '../data/syllabus';
import Icon from './Icon';

// All date logic on 'YYYY-MM-DD' strings compared in the academy's timezone
// (KST), so it is correct regardless of the viewing device's timezone. Day
// counts parse both sides as explicit UTC midnight (consistent → exact days).
const utcDays = (s: string) => Math.round(Date.parse(`${s}T00:00:00Z`) / 86_400_000);
function daysDiff(a: string, b: string) { return utcDays(b) - utcDays(a); }
function fmtDate(s: string) {
  const [, m, d] = s.split('-');
  return `${Number(m)}/${Number(d)}`;
}

// A single current/next lesson card. Declared at module scope (not inside
// BookScheduleSection) — a component created during render loses its state
// every re-render.
function LessonCard({
  entry, kind, today, dTag, daysUntil,
}: {
  entry: LessonEntry;
  kind: 'current' | 'next';
  today: string;
  dTag: string | null;
  daysUntil: number | null;
}) {
  const isToday = entry.date === today;
  return (
    <div className="surface-soft p-3">
      <div className="flex items-center justify-between mb-1">
        <div className="text-xs text-muted font-semibold flex items-center gap-1.5">
          {kind === 'current' ? (
            <>
              <span className={`inline-block w-2 h-2 rounded-full ${isToday ? 'bg-emerald-500' : 'bg-gray-300'}`} />
              {isToday ? '오늘 수업' : '지난 수업'}
            </>
          ) : (
            <><Icon name="pin" className="h-3.5 w-3.5" /> 다음 수업</>
          )}
        </div>
        {kind === 'next' && dTag && (
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full text-white ${
            daysUntil === 0 ? 'bg-red-500' : daysUntil! <= 3 ? 'bg-amber-500' : 'bg-gray-400'
          }`}>{dTag}</span>
        )}
      </div>
      <div className="font-bold text-sm text-gray-900">Lesson {String(entry.lesson).padStart(2, '0')}</div>
      <div className="text-xs font-semibold text-gray-900 mt-1">{entry.topic ?? entry.pages}</div>
      <div className="text-xs text-muted mt-0.5">{fmtDate(entry.date)}</div>
    </div>
  );
}

// One book's own schedule section: its current/next lesson, homework, and
// progress bar — computed only from ITS OWN rows in SCHEDULE. Active books
// often run in parallel (e.g. Bridge C1 on Wednesdays, C2 on Fridays), so
// each gets its own independent "current/next," not one shared pair.
function BookScheduleSection({ bookId, today }: { bookId: BookId; today: string }) {
  const bookInfo = BOOKS[bookId];
  const lessons = SCHEDULE.filter(l => l.book === bookId);
  if (lessons.length === 0) return null;

  const pastLessons   = lessons.filter(l => l.date <= today);
  const futureLessons = lessons.filter(l => l.date > today);
  const current = pastLessons.at(-1) ?? null;
  const next    = futureLessons[0] ?? null;
  const isToday = (s: string) => s === today;
  const termEnded = pastLessons.length === lessons.length && !next;

  const daysUntil = next ? daysDiff(today, next.date) : null;
  const dTag = daysUntil === 0 ? 'TODAY!' : daysUntil === 1 ? 'D-1' : daysUntil != null ? `D-${daysUntil}` : null;

  const done  = pastLessons.length;
  const total = lessons.length;
  const pct   = Math.round((done / total) * 100);

  return (
    <div className="space-y-2">
      <div className="text-xs font-bold flex items-center gap-1.5" style={{ color: bookInfo?.scheduleColor }}>
        {bookInfo?.shortTitle ?? bookId}
        <span className="text-muted font-normal">{done} / {total} 완료 ({pct}%)</span>
      </div>

      {termEnded ? (
        <div className="text-center py-3 font-bold text-emerald-600 text-sm flex items-center justify-center gap-2">
          <Icon name="check" className="h-4 w-4" /> 학기 수업 완료!
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {current && <LessonCard entry={current} kind="current" today={today} dTag={null} daysUntil={null} />}
          {next && <LessonCard entry={next} kind="next" today={today} dTag={dTag} daysUntil={daysUntil} />}
          {!current && next && (
            <div className="surface-soft p-3">
              <div className="text-xs text-muted font-semibold mb-1 flex items-center gap-1.5">
                <Icon name="book" className="h-3.5 w-3.5" /> 첫 수업
              </div>
              <div className="text-xs text-gray-600">{fmtDate(next.date)} — 준비하세요!</div>
            </div>
          )}
        </div>
      )}

      {current && !isToday(current.date) && current.homework && (
        <div className="surface-soft px-3 py-2 flex items-start gap-2">
          <Icon name="document" className="h-4 w-4 shrink-0 mt-0.5" style={{ color: 'var(--accent)' }} />
          <div>
            <div className="text-xs font-bold text-muted">이번 주 숙제</div>
            <div className="text-sm text-gray-900 mt-0.5">{current.homework}</div>
          </div>
        </div>
      )}

      <div className="w-full rounded-full h-2 overflow-hidden" style={{ background: 'var(--paper-3)' }}>
        <div className="progress-fill h-full transition-[width] duration-700" style={{ width: `${pct}%` }} />
      </div>
      <div className="flex gap-0.5">
        {lessons.map(l => {
          const past = l.date <= today;
          const isCur = current?.lesson === l.lesson;
          return (
            <div key={l.lesson} title={`Lesson ${l.lesson}`}
              className="flex-1 h-1.5 rounded-full transition-colors"
              style={{
                background: isCur ? 'var(--accent)'
                  : past ? (bookInfo?.scheduleColor ?? 'var(--accent-strong)')
                  : 'var(--paper-3)',
              }} />
          );
        })}
      </div>
    </div>
  );
}

export default function LessonScheduleWidget() {
  const today = kstToday();
  const isHolidayToday = HOLIDAY.date === today;
  const books = activeBookIds();

  return (
    <div className="surface p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="font-semibold text-sm text-gray-900 flex items-center gap-1.5">
          <Icon name="calendar" className="h-4 w-4" style={{ color: 'var(--accent)' }} />
          수업 일정
        </div>
      </div>

      {isHolidayToday && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm font-semibold text-amber-700">
          {HOLIDAY.note}
        </div>
      )}

      {books.length === 0 ? (
        <div className="text-sm text-muted text-center py-3">진행 중인 수업이 없어요.</div>
      ) : (
        books.map((bookId, i) => (
          <div key={bookId} className={i > 0 ? 'pt-4 border-t' : ''} style={i > 0 ? { borderColor: 'var(--rule)' } : undefined}>
            <BookScheduleSection bookId={bookId} today={today} />
          </div>
        ))
      )}
    </div>
  );
}
