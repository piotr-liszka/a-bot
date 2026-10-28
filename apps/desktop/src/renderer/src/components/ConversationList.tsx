import type { BotRow, ConversationRow } from '@a-bot/shared';
import { Plus, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { groupLabel, shortTime } from '../lib/format';

interface Props {
  bot?: BotRow;
  conversations: ConversationRow[];
  loading: boolean;
  selectedId?: string;
  onSelect: (id: string) => void;
  onNew: () => void;
}

export function ConversationList({ bot, conversations, loading, selectedId, onSelect, onNew }: Props) {
  const [query, setQuery] = useState('');
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? conversations.filter((c) => c.title.toLowerCase().includes(q) || (c.last_message_preview ?? '').toLowerCase().includes(q))
      : conversations;
    const map = new Map<string, ConversationRow[]>();
    for (const c of filtered) {
      const label = groupLabel(c.updated_at);
      map.set(label, [...(map.get(label) ?? []), c]);
    }
    return [...map.entries()];
  }, [conversations, query]);

  return (
    <aside className="list" aria-label="Rozmowy">
      <div className="list-head">
        <div className="list-title">
          <h2>{bot?.name ?? 'Rozmowy'}</h2>
          <button className="btn btn-sm" onClick={onNew} disabled={!bot}>
            <Plus size={14} aria-hidden /> Nowa
          </button>
        </div>
        {conversations.length > 4 && (
          <div className="search">
            <Search size={14} aria-hidden />
            <input className="input" placeholder="Szukaj w rozmowach" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Szukaj w rozmowach" />
          </div>
        )}
      </div>
      <div className="conv-groups">
        {loading ? (
          <div style={{ display: 'grid', gap: 10, padding: '12px 10px' }}>
            {[70, 55, 80].map((w) => (
              <div key={w} className="skeleton" style={{ height: 34, width: `${w}%` }} />
            ))}
          </div>
        ) : conversations.length === 0 ? (
          <p className="list-empty">Tu pojawią się rozmowy z botem {bot?.name ?? ''}. Napisz pierwszą wiadomość obok.</p>
        ) : groups.length === 0 ? (
          <p className="list-empty">Nic nie pasuje do „{query}”.</p>
        ) : (
          groups.map(([label, items]) => (
            <section key={label} className="conv-group">
              <h3>{label}</h3>
              {items.map((c) => (
                <button key={c.id} className="conv-item" aria-current={c.id === selectedId} onClick={() => onSelect(c.id)}>
                  <span className="row">
                    <span className="title">{c.title}</span>
                    {c.busy ? <span className="working" aria-label="bot pracuje" /> : <span className="time tabular">{shortTime(c.updated_at)}</span>}
                  </span>
                  {c.last_message_preview && <span className="preview">{c.last_message_preview}</span>}
                </button>
              ))}
            </section>
          ))
        )}
      </div>
    </aside>
  );
}
