import { isDeviceOnline, type BotRow, type ConversationRow, type DeviceRow } from '@a-bot/shared';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useBots, useConversations, useDevices, useNow } from '../lib/data';
import { bridge } from '../lib/desktopApi';
import { engineOf } from '../lib/format';
import { useAutoUpdate, useWorkers } from '../lib/workers';
import { BotEditor } from './BotEditor';
import { Chat } from './Chat';
import { DesktopView } from './DesktopView';
import { DevicesPage } from './DevicesPage';
import { NeedsWorker } from './NeedsWorker';
import { Rail, type View } from './Rail';
import { AccountPage, AccountsPage, SettingsNav, type SettingsSection } from './Settings';
import { TerminalView } from './TerminalView';

function remembered(key: string): string | undefined {
  try {
    return localStorage.getItem(`a-bot.${key}`) ?? undefined;
  } catch {
    return undefined;
  }
}
function remember(key: string, value: string | undefined) {
  try {
    if (value) localStorage.setItem(`a-bot.${key}`, value);
    else localStorage.removeItem(`a-bot.${key}`);
  } catch {
    // storage unavailable: selection just isn't remembered
  }
}

/** Keeps a view mounted while hidden, so the desktop and terminal sessions survive switching away. */
function Keep({ active, children }: { active: boolean; children: ReactNode }) {
  return (
    <div className="keep" hidden={!active}>
      {children}
    </div>
  );
}

interface Props {
  db: SupabaseClient;
  session: Session;
  onChangeBackend: () => void;
}

export function Workspace({ db, session, onChangeBackend }: Props) {
  const uid = session.user.id;
  const devices = useDevices(db, uid);
  const bots = useBots(db, uid);
  const conversations = useConversations(db, uid);
  const now = useNow();

  const workers = useWorkers();
  const [view, setView] = useState<View>('chat');
  const [section, setSection] = useState<SettingsSection>('devices');
  const [editing, setEditing] = useState<string>('new');
  const [deviceId, setDeviceId] = useState<string | undefined>(() => remembered('device'));
  const [botId, setBotId] = useState<string | undefined>(() => remembered('bot'));
  const [visited, setVisited] = useState({ desktop: false, terminal: false });

  const device: DeviceRow | undefined = devices.rows.find((d) => d.id === deviceId) ?? devices.rows[0];
  const deviceBots = useMemo(() => bots.rows.filter((b) => b.device_id === device?.id), [bots.rows, device?.id]);
  const bot: BotRow | undefined = deviceBots.find((b) => b.id === botId) ?? deviceBots[0];

  useEffect(() => remember('device', device?.id), [device?.id]);
  useEffect(() => remember('bot', bot?.id), [bot?.id]);

  const botConversations = useMemo(() => conversations.rows.filter((c) => c.bot_id && c.bot_id === bot?.id), [conversations.rows, bot?.id]);
  const latest = useMemo(() => {
    const map = new Map<string, ConversationRow>();
    for (const c of conversations.rows) if (c.bot_id && !map.has(c.bot_id)) map.set(c.bot_id, c);
    return map;
  }, [conversations.rows]);
  const busyBots = useMemo(() => new Set(conversations.rows.filter((c) => c.busy && c.bot_id).map((c) => c.bot_id!)), [conversations.rows]);
  const busyDevices = useMemo(() => new Set(conversations.loading ? devices.rows.map((d) => d.id) : conversations.rows.filter((c) => c.busy).map((c) => c.device_id)), [conversations, devices.rows]);
  const updates = useAutoUpdate(workers.workers, busyDevices);
  // One bot, one chat: the newest conversation is the chat; clearing it starts a new one.
  const conversation: ConversationRow | undefined = botConversations[0];

  const online = device ? isDeviceOnline(device, now) : false;
  const worker = device ? workers.workers.find((w) => w.deviceId === device.id) : undefined;
  const noDevices = !devices.loading && devices.rows.length === 0;
  const effectiveView: View = noDevices ? 'settings' : view;
  const effectiveSection: SettingsSection = noDevices ? 'devices' : section;
  const needsFirstBot = effectiveView === 'chat' && !bots.loading && Boolean(device) && deviceBots.length === 0;

  const desktopActive = effectiveView === 'desktop';
  const terminalActive = effectiveView === 'settings' && effectiveSection === 'terminal';
  useEffect(() => {
    if (desktopActive || terminalActive) setVisited((v) => ({ desktop: v.desktop || desktopActive, terminal: v.terminal || terminalActive }));
  }, [desktopActive, terminalActive]);

  const openSettings = (s: SettingsSection) => {
    setSection(s);
    setView('settings');
  };
  const editBot = (id: string) => {
    setEditing(id);
    setView('bot');
  };

  const fullWidth = effectiveView !== 'settings';
  const editedBot = editing === 'new' ? undefined : bots.rows.find((b) => b.id === editing);

  let main: ReactNode = null;
  if (effectiveView === 'settings') {
    if (effectiveSection === 'devices')
      main = (
        <DevicesPage
          db={db}
          devices={devices.rows}
          loading={devices.loading}
          now={now}
          workers={workers.workers}
          onWorkersChanged={workers.reload}
          onDeleted={devices.drop}
          onPaired={(d) => {
            setDeviceId(d.id);
            setView('chat');
          }}
        />
      );
    else if (effectiveSection === 'accounts')
      main = <AccountsPage db={db} devices={devices.rows} now={now} workers={workers.workers} onOpenDevices={() => setSection('devices')} />;
    else if (effectiveSection === 'account') main = <AccountPage db={db} email={session.user.email ?? ''} onChangeBackend={onChangeBackend} />;
    else if (device && !worker) main = <NeedsWorker db={db} device={device} view="terminal" onLinked={workers.reload} />;
  } else if (effectiveView === 'desktop') {
    if (device && !worker) main = <NeedsWorker db={db} device={device} view="desktop" onLinked={workers.reload} />;
  } else if (device && (effectiveView === 'bot' || needsFirstBot)) {
    main = (
      <BotEditor
        key={needsFirstBot ? 'first' : editing}
        db={db}
        device={device}
        bot={needsFirstBot ? undefined : editedBot}
        first={needsFirstBot}
        onSaved={(b) => {
          setBotId(b.id);
          setView('chat');
        }}
        onDeleted={(id) => {
          bots.drop(id);
          setBotId(undefined);
          setView('chat');
        }}
        onCancel={needsFirstBot ? undefined : () => setView('chat')}
        onOpenAccounts={() => openSettings('accounts')}
      />
    );
  } else if (device && bot) {
    main = (
      <Chat
          key={bot.id}
          db={db}
          device={device}
          online={online}
          bot={bot}
          engine={engineOf(bot, device)}
          conversation={conversation}
          loading={conversations.loading}
          onCleared={conversations.drop}
          onEditBot={() => editBot(bot.id)}
          onOpenAccounts={() => openSettings('accounts')}
        />
    );
  }

  return (
    <div className={fullWidth ? 'shell no-list' : 'shell'}>
      <Rail
        email={session.user.email ?? ''}
        devices={devices.rows}
        device={device}
        online={online}
        update={device ? updates.get(device.id) : undefined}
        now={now}
        bots={deviceBots}
        latest={latest}
        botId={bot?.id}
        busyBots={busyBots}
        view={effectiveView}
        canUseWorker={Boolean(bridge())}
        onSelectView={(v) => setView(v)}
        onSelectDevice={(id) => {
          setDeviceId(id);
          setBotId(undefined);
          if (view !== 'desktop') setView('chat');
        }}
        onSelectBot={(id) => {
          setBotId(id);
          setView('chat');
        }}
        onNewBot={() => editBot('new')}
        onAddDevice={() => openSettings('devices')}
        onOpenSettings={() => openSettings(section)}
      />
      {effectiveView === 'settings' && <SettingsNav section={effectiveSection} onSelect={setSection} />}
      {main}
      {device && worker && visited.desktop && (
        <Keep active={desktopActive}>
          <DesktopView key={worker.id} device={device} worker={worker} />
        </Keep>
      )}
      {device && worker && visited.terminal && (
        <Keep active={terminalActive}>
          <TerminalView key={worker.id} device={device} worker={worker} />
        </Keep>
      )}
    </div>
  );
}
