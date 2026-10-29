import { Check, Bot } from 'lucide-react';
import { t } from '../lib/i18n';

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
      <p>{t('Your own AI bots, running on your own machine in a shared Linux box with a desktop and a browser.')}</p>
      <ul className="gate-points">
        <li>
          <Check size={16} />
          <span>{t('Your subscriptions, your device. The app only relays the conversation.')}</span>
        </li>
        <li>
          <Check size={16} />
          <span>{t('One container for all bots, with your folder at /workspace and a browser.')}</span>
        </li>
        <li>
          <Check size={16} />
          <span>{t('Open source. Use the hosted account or run everything yourself.')}</span>
        </li>
      </ul>
    </aside>
  );
}
