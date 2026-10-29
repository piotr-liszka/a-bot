import type { ComponentType } from 'react';
import type { BotIconState, BotIconStyle } from '../lib/botIcon';
import './BotIcon.css';

// Drawn on a 32×32 grid. Colors come from --c (the bot's color) and tones mixed from it in BotIcon.css.

function Robot() {
  return (
    <svg viewBox="0 0 32 32" className="bi-robot">
      <g className="bi-body">
        <line x1="16" y1="8.5" x2="16" y2="4.8" stroke="var(--c-dk)" strokeWidth="1.6" strokeLinecap="round" />
        <circle className="bi-bulb" cx="16" cy="3.7" r="2.1" fill="var(--c-lt)" />
        <rect x="2.4" y="14" width="3.2" height="6.5" rx="1.6" fill="var(--c-dk)" />
        <rect x="26.4" y="14" width="3.2" height="6.5" rx="1.6" fill="var(--c-dk)" />
        <rect x="4.5" y="8" width="23" height="19.5" rx="6.5" fill="var(--c)" />
        <rect x="7" y="9.6" width="5" height="1.6" rx="0.8" fill="#fff" opacity="0.35" />
        <rect x="8" y="11.5" width="16" height="11.5" rx="4" fill="var(--screen)" />
        <g className="bi-look">
          <g className="bi-blink" fill="var(--glow)">
            <rect x="11" y="13.5" width="3" height="3.6" rx="1.5" />
            <rect x="18" y="13.5" width="3" height="3.6" rx="1.5" />
          </g>
        </g>
        <path className="bi-smile" d="M13.5 19.4q2.5 1.8 5 0" stroke="var(--glow)" strokeWidth="1.3" fill="none" strokeLinecap="round" />
        <g className="bi-eq" fill="var(--glow)">
          <rect x="13.4" y="18.8" width="1.5" height="2.4" rx="0.75" />
          <rect x="15.25" y="18.8" width="1.5" height="2.4" rx="0.75" />
          <rect x="17.1" y="18.8" width="1.5" height="2.4" rx="0.75" />
        </g>
      </g>
    </svg>
  );
}

function star(x: number, y: number, r: number) {
  return `M${x} ${y - r}Q${x} ${y} ${x + r} ${y}Q${x} ${y} ${x} ${y + r}Q${x} ${y} ${x - r} ${y}Q${x} ${y} ${x} ${y - r}Z`;
}

function Cloud() {
  return (
    <svg viewBox="0 0 32 32" className="bi-cloud">
      <g className="bi-body">
        <g className="bi-puff">
          <circle cx="11" cy="17" r="6.5" />
          <circle cx="18.5" cy="13" r="7.5" />
          <circle cx="24" cy="18.5" r="5.5" />
          <rect x="4.5" y="17" width="24.5" height="8.6" rx="4.3" />
        </g>
        <ellipse cx="15.5" cy="8.6" rx="2.6" ry="1.2" fill="#fff" opacity="0.35" />
        <g className="bi-look">
          <g className="bi-eyes">
            <g className="bi-blink" fill="var(--ink)">
              <ellipse cx="13.6" cy="18" rx="1.35" ry="1.75" />
              <ellipse cx="20.2" cy="18" rx="1.35" ry="1.75" />
            </g>
          </g>
          <g className="bi-happy" stroke="var(--ink)" strokeWidth="1.3" fill="none" strokeLinecap="round">
            <path d="M12.3 18.6l1.3-1.4 1.3 1.4" />
            <path d="M18.9 18.6l1.3-1.4 1.3 1.4" />
          </g>
        </g>
        <g fill="var(--cheek)">
          <ellipse cx="10.4" cy="21.2" rx="1.6" ry="1" />
          <ellipse cx="23.4" cy="21.2" rx="1.6" ry="1" />
        </g>
        <path d="M15.3 20.8q1.6 1.4 3.2 0" stroke="var(--ink)" strokeWidth="1.2" fill="none" strokeLinecap="round" />
      </g>
      <g className="bi-dots" fill="var(--c-lt)">
        <circle cx="25.2" cy="7.6" r="1" />
        <circle cx="27.6" cy="5" r="1.3" />
        <circle cx="30.4" cy="2.4" r="1.6" />
      </g>
      <path className="bi-spark" fill="var(--signal)" d={star(3.4, 9, 2.2)} />
      <path className="bi-spark" fill="var(--signal)" d={star(28.8, 9.5, 1.8)} />
      <path className="bi-spark" fill="var(--signal)" d={star(16, 29.5, 1.6)} />
    </svg>
  );
}

function Blob() {
  return (
    <svg viewBox="0 0 32 32" className="bi-blob">
      <ellipse className="bi-shadow" cx="16" cy="29.6" rx="8" ry="1.1" fill="#000" />
      <g className="bi-body">
        <path d="M16 5.5C23.5 5.5 28 13 28 20.5 28 25.8 23 28 16 28 9 28 4 25.8 4 20.5 4 13 8.5 5.5 16 5.5Z" fill="var(--c)" />
        <ellipse cx="10.6" cy="11.4" rx="2.3" ry="1.3" fill="#fff" opacity="0.4" transform="rotate(-35 10.6 11.4)" />
        <g className="bi-blink">
          <circle cx="12.3" cy="17.2" r="3.1" fill="#fff" />
          <circle cx="19.7" cy="17.2" r="3.1" fill="#fff" />
          <g className="bi-pupils" fill="var(--ink)">
            <circle cx="12.6" cy="17.6" r="1.6" />
            <circle cx="20" cy="17.6" r="1.6" />
          </g>
        </g>
        <g fill="var(--cheek)">
          <ellipse cx="8.6" cy="21.4" rx="1.5" ry="0.9" />
          <ellipse cx="23.4" cy="21.4" rx="1.5" ry="0.9" />
        </g>
        <path d="M14.3 22.4q1.7 1.4 3.4 0" stroke="var(--ink)" strokeWidth="1.2" fill="none" strokeLinecap="round" />
      </g>
    </svg>
  );
}

const DRAW: Record<BotIconStyle, ComponentType> = { robot: Robot, cloud: Cloud, blob: Blob };

/** The animated face of a bot. Sized and colored by its container (--c). */
export function BotIcon({ style, state = 'idle' }: { style: BotIconStyle; state?: BotIconState }) {
  const Draw = DRAW[style];
  return (
    <span className="bot-icon" data-state={state} aria-hidden>
      <Draw />
    </span>
  );
}
