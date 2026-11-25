import { useRef } from 'preact/hooks';

// The mark: a glass prism, a white beam going in and the spectrum coming out.
let logoN = 0;
export function Logo({ size = 28 }) {
  const id = useRef(null);
  if (!id.current) id.current = `pl${++logoN}`;
  const k = id.current;
  return (
    <svg class="logo" viewBox="0 0 34 32" width={size * 34 / 32} height={size} aria-hidden="true">
      <defs>
        <linearGradient id={`${k}e`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" /><stop offset=".5" stop-color="#cdeeff" /><stop offset="1" stop-color="#b9a4ff" /></linearGradient>
        <linearGradient id={`${k}g`} x1=".3" y1="0" x2=".7" y2="1"><stop offset="0" stop-color="#d8eeff" stop-opacity=".42" /><stop offset=".5" stop-color="#8a96ff" stop-opacity=".14" /><stop offset="1" stop-color="#0c0e1c" stop-opacity=".55" /></linearGradient>
        <linearGradient id={`${k}i`} x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0" /><stop offset=".6" stop-color="#fff" stop-opacity=".95" /><stop offset="1" stop-color="#fff" /></linearGradient>
        {['var(--accent)', 'var(--accent-2)', 'var(--accent-3)'].map((c, i) => (
          <linearGradient key={i} id={`${k}r${i}`} gradientUnits="userSpaceOnUse" x1="22" y1="0" x2="34" y2="0"><stop offset="0" stop-color={c} /><stop offset="1" stop-color={c} stop-opacity=".12" /></linearGradient>
        ))}
      </defs>
      <path d="M0 21.4 9.5 16.4 9.7 17.6 0 22.6Z" fill={`url(#${k}i)`} />
      <path d="M16 3.4 29.2 26.6H2.8Z" fill={`url(#${k}g)`} />
      <path d="M9.6 17 22 15.6" stroke="#fff" stroke-opacity=".5" stroke-width="1" />
      <path d="M22 15.4 34 9.4V13.6Z" fill={`url(#${k}r0)`} />
      <path d="M22 15.6 34 13.6V17.8Z" fill={`url(#${k}r1)`} />
      <path d="M22 15.8 34 17.8V22Z" fill={`url(#${k}r2)`} />
      <path d="M16 3.4 29.2 26.6H2.8Z" fill="none" stroke={`url(#${k}e)`} stroke-width="1.8" stroke-linejoin="round" />
      <path d="M15.4 7.8 7.4 22" stroke="#fff" stroke-opacity=".32" stroke-width=".9" stroke-linecap="round" />
    </svg>
  );
}
