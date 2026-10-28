import type { DeviceRow, ProviderInfo } from '@a-bot/shared';
import { isDeviceOnline } from '@a-bot/shared';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ChevronsUpDown, LogOut, MessageSquare, Monitor, Plus, Server, SquareTerminal } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { botState, relativeSeen } from '../lib/format';
import { BotAvatar } from './BotAvatar';
import { Brand } from './GateSide';

export type View = 'chat' | 'desktop' | 'terminal' | 'devices';

interface Props {
  db: SupabaseClient;
  email: string;
  devices: DeviceRow[];
  device?: DeviceRow;
  online: boolean;
  now: number;
  bot?: ProviderInfo;
  busyBots: Set<string>;
  view: View;
  canUseWorker: boolean;
  onSelectView: (view: View) => void;
  onSelectDevice: (id: string) => void;
  onSelectBot: (id: string) => void;
  onShowDevices: () => void;
}

export function Rail(p: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [menuOpen]);

  return (
    <nav className="rail" aria-label="Boty i urządzenia">
      <div className="rail-top">
        <Brand />
        {p.device && (
          <div className="device-switch" ref={menuRef}>
            <button className="device-btn" aria-haspopup="menu" aria-expanded={menuOpen} onClick={() => setMenuOpen((o) => !o)} title={p.device.name}>
              <span className={`dot ${p.online ? 'on' : 'off'}`} aria-hidden />
              <span className="meta">
                <span className="name">{p.device.name}</span>
                <span className="sub">{p.online ? 'Online' : `Offline, widziany ${relativeSeen(p.device.last_seen, p.now)}`}</span>
              </span>
              <ChevronsUpDown size={14} aria-hidden />
            </button>
            {menuOpen && (
              <div className="menu" role="menu">
                {p.devices.map((d) => (
                  <button
                    key={d.id}
                    role="menuitemradio"
                    aria-checked={d.id === p.device?.id}
                    onClick={() => {
                      p.onSelectDevice(d.id);
                      setMenuOpen(false);
                    }}
                  >
                    <span className={`dot ${isDeviceOnline(d, p.now) ? 'on' : 'off'}`} aria-hidden />
                    {d.name}
                  </button>
                ))}
                <hr />
                <button
                  role="menuitem"
                  onClick={() => {
                    p.onShowDevices();
                    setMenuOpen(false);
                  }}
                >
                  <Plus size={15} aria-hidden /> Dodaj urządzenie
                </button>
              </div>
            )}
          </div>
        )}
        {p.device && p.canUseWorker && (
          <div className="view-tabs" role="group" aria-label="Widok urządzenia">
            {(
              [
                ['chat', 'Czat', MessageSquare],
                ['desktop', 'Pulpit', Monitor],
                ['terminal', 'Terminal', SquareTerminal],
              ] as const
            ).map(([v, label, Icon]) => (
              <button key={v} aria-pressed={p.view === v} onClick={() => p.onSelectView(v)} title={label}>
                <Icon size={14} aria-hidden />
                <span className="meta">{label}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {p.device && (
        <>
          <div className="rail-section">Boty</div>
          <ul className="bot-list">
            {p.device.providers.map((b) => {
              const state = botState(b);
              const working = p.busyBots.has(b.id);
              return (
                <li key={b.id}>
                  <button
                    className={`bot-item${state.tone === 'on' ? '' : ' unavailable'}`}
                    aria-current={p.view === 'chat' && p.bot?.id === b.id}
                    onClick={() => p.onSelectBot(b.id)}
                    title={`${b.name}: ${working ? 'pracuje' : state.label}`}
                  >
                    <BotAvatar bot={b} />
                    <span className="meta">
                      <span className="name">{b.name}</span>
                      <span className="sub">{working ? 'Pracuje…' : state.tone === 'on' ? (b.version ? `v${b.version}` : state.label) : state.label}</span>
                    </span>
                    {working ? <span className="working" aria-label="pracuje" /> : state.tone === 'warn' ? <span className="dot warn" aria-hidden /> : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <div className="rail-bottom">
        <button className="rail-link" aria-current={p.view === 'devices'} onClick={p.onShowDevices}>
          <Server size={16} aria-hidden />
          <span className="grow">Urządzenia</span>
        </button>
        <button className="rail-link" onClick={() => p.db.auth.signOut()} title={`Wyloguj ${p.email}`}>
          <LogOut size={16} aria-hidden />
          <span className="grow">{p.email}</span>
        </button>
      </div>
    </nav>
  );
}
