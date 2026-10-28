import { Check, Bot } from 'lucide-react';

export function Brand() {
  return (
    <div className="brand">
      <span className="brand-mark" aria-hidden>
        <Bot size={16} strokeWidth={2.2} />
      </span>
      <span>a-bot</span>
    </div>
  );
}

export function GateSide() {
  return (
    <aside className="gate-side">
      <Brand />
      <p>Rozmawiaj z Claude, Codex i lokalnymi modelami, które pracują na Twoim własnym serwerze, we wspólnym linuksowym środowisku.</p>
      <ul className="gate-points">
        <li>
          <Check size={16} />
          <span>Twoje subskrypcje, Twoje urządzenie. Aplikacja tylko przekazuje rozmowę.</span>
        </li>
        <li>
          <Check size={16} />
          <span>Jeden kontener dla wszystkich botów, z Twoim katalogiem pod /workspace i przeglądarką.</span>
        </li>
        <li>
          <Check size={16} />
          <span>Open source. Używaj hostowanego konta albo postaw wszystko u siebie.</span>
        </li>
      </ul>
    </aside>
  );
}
