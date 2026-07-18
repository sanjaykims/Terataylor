// One cohesive, hand-built SVG icon set — the app's canonical iconography,
// replacing the scattered OS emoji that used to stand in for real icons.
// Every glyph is drawn on a 24×24 grid, inherits `currentColor`, and is
// decorative-by-default (aria-hidden); pass `label` to give it an accessible
// name. Line icons share strokeWidth 2 + round caps/joins to read as one set;
// a few (play/stop/moon) are solid where a filled mark reads clearer.

import type { SVGProps } from 'react';

export type IconName =
  | 'play' | 'pause' | 'stop' | 'prev' | 'next' | 'replay'
  | 'trash' | 'copy' | 'refresh'
  | 'headphones' | 'book' | 'chart'
  | 'moon' | 'camera' | 'document' | 'globe' | 'mic' | 'repeat' | 'target'
  | 'calendar' | 'pin' | 'check';

const STROKE: SVGProps<SVGSVGElement> = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
};
const SOLID: SVGProps<SVGSVGElement> = { fill: 'currentColor', stroke: 'none' };

const PATHS: Record<IconName, { solid?: boolean; el: React.ReactNode }> = {
  play:   { solid: true, el: <path d="M8 5.5v13a1 1 0 0 0 1.5.87l11-6.5a1 1 0 0 0 0-1.74l-11-6.5A1 1 0 0 0 8 5.5Z" /> },
  pause:  { el: <><path d="M9 5v14" /><path d="M15 5v14" /></> },
  stop:   { solid: true, el: <rect x="6" y="6" width="12" height="12" rx="2.5" /> },
  prev:   { el: <><path d="M7 5v14" /><path d="M19 6.2v11.6a1 1 0 0 1-1.5.86l-9-5.8a1 1 0 0 1 0-1.72l9-5.8a1 1 0 0 1 1.5.86Z" fill="currentColor" stroke="currentColor" /></> },
  next:   { el: <><path d="M17 5v14" /><path d="M5 6.2v11.6a1 1 0 0 0 1.5.86l9-5.8a1 1 0 0 0 0-1.72l-9-5.8A1 1 0 0 0 5 6.2Z" fill="currentColor" stroke="currentColor" /></> },
  replay: { el: <><path d="M4.5 12a7.5 7.5 0 1 0 2.4-5.5" /><path d="M3.5 4.5 5 8.5l4-1" /></> },
  trash:  { el: <><path d="M4 7h16" /><path d="M9 7V5.2A1.2 1.2 0 0 1 10.2 4h3.6A1.2 1.2 0 0 1 15 5.2V7" /><path d="M6.5 7l.8 12a1.2 1.2 0 0 0 1.2 1.1h7a1.2 1.2 0 0 0 1.2-1.1l.8-12" /><path d="M10 11v6M14 11v6" /></> },
  copy:   { el: <><rect x="9" y="9" width="11" height="11" rx="2.2" /><path d="M5 15.5A1.5 1.5 0 0 1 3.5 14V5.5A1.5 1.5 0 0 1 5 4h8.5A1.5 1.5 0 0 1 15 5.5" /></> },
  refresh:{ el: <><path d="M20 11a8 8 0 0 0-14-4.7L3.5 8" /><path d="M3.5 3.5V8H8" /><path d="M4 13a8 8 0 0 0 14 4.7l2.5-1.7" /><path d="M20.5 20.5V16H16" /></> },
  headphones: { el: <><path d="M4 13.5v-1a8 8 0 0 1 16 0v1" /><rect x="2.5" y="13" width="4" height="7" rx="2" /><rect x="17.5" y="13" width="4" height="7" rx="2" /></> },
  book:   { el: <><path d="M12 6.5C10 5 6.8 4.6 4.2 5.4A1 1 0 0 0 3.5 6.4v11.3a1 1 0 0 0 1.3 1c2.3-.7 5.2-.3 7.2 1 2-1.3 4.9-1.7 7.2-1a1 1 0 0 0 1.3-1V6.4a1 1 0 0 0-.7-1C17.2 4.6 14 5 12 6.5Z" /><path d="M12 6.5v13" /></> },
  chart:  { el: <><path d="M4 20h16" /><path d="M7.5 20v-5M12 20V9.5M16.5 20v-8" /><path d="m6 11 4-4 3 2 5-5" /></> },
  moon:   { solid: true, el: <path d="M20.5 14.8A8 8 0 1 1 10.4 4a6.3 6.3 0 0 0 10.1 10.8Z" /> },
  camera: { el: <><path d="M4 8.5h2.6L8 6.4a1 1 0 0 1 .84-.4h6.32a1 1 0 0 1 .84.4l1.4 2.1H20a1 1 0 0 1 1 1v8.5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5a1 1 0 0 1 1-1Z" /><circle cx="12" cy="13.5" r="3.4" /></> },
  document:{ el: <><path d="M14 3.5H7a1.2 1.2 0 0 0-1.2 1.2v14.6A1.2 1.2 0 0 0 7 20.5h10a1.2 1.2 0 0 0 1.2-1.2V7.7Z" /><path d="M14 3.5V8h4.2" /><path d="M9 13h6M9 16.5h4" /></> },
  globe:  { el: <><circle cx="12" cy="12" r="8.3" /><path d="M3.7 12h16.6" /><path d="M12 3.7c2.4 2.3 2.4 14 0 16.6M12 3.7c-2.4 2.3-2.4 14 0 16.6" /></> },
  mic:    { el: <><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M6 11a6 6 0 0 0 12 0" /><path d="M12 17v3.5M9 20.5h6" /></> },
  repeat: { el: <><path d="m17 2.5 3.5 3.5L17 9.5" /><path d="M3.5 11.5V10A3.5 3.5 0 0 1 7 6.5h13.5" /><path d="M7 21.5 3.5 18 7 14.5" /><path d="M20.5 12.5V14a3.5 3.5 0 0 1-3.5 3.5H3.5" /></> },
  target: { el: <><circle cx="12" cy="12" r="8.3" /><circle cx="12" cy="12" r="4.4" /><circle cx="12" cy="12" r="1.1" fill="currentColor" /></> },
  calendar:{ el: <><rect x="4" y="5.5" width="16" height="15" rx="2.2" /><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" /></> },
  pin:    { el: <><path d="M12 21s6.5-5.8 6.5-11a6.5 6.5 0 1 0-13 0C5.5 15.2 12 21 12 21Z" /><circle cx="12" cy="10" r="2.4" /></> },
  check:  { el: <path d="m5 12.5 4.5 4.5L19 7" /> },
};

export default function Icon({
  name,
  label,
  className = 'h-5 w-5',
  ...rest
}: { name: IconName; label?: string; className?: string } & Omit<SVGProps<SVGSVGElement>, 'name'>) {
  const spec = PATHS[name];
  const base = spec.solid ? SOLID : STROKE;
  const a11y = label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true };
  return (
    <svg viewBox="0 0 24 24" className={className} {...base} {...a11y} {...rest}>
      {spec.el}
    </svg>
  );
}
