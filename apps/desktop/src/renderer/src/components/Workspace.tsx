import { isDeviceOnline, type ConversationRow, type DeviceRow } from '@a-bot/shared';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { useEffect, useMemo, useState } from 'react';
import { useConversations, useDevices, useNow } from '../lib/data';
import { bridge } from '../lib/desktopApi';
import { useWorkers } from '../lib/workers';
import { Chat } from './Chat';
import { ConversationList } from './ConversationList';
import { DesktopView } from './DesktopView';
import { DevicesPage } from './DevicesPage';
import { NeedsWorker } from './NeedsWorker';
import { Rail, type View } from './Rail';
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

export function Workspace({ db, session }: { db: SupabaseClient; session: Session }) {
  const uid = session.user.id;
  const devices = useDevices(db, uid);
  const conversations = useConversations(db, uid);
  const now = useNow();

  const workers = useWorkers();
  const [view, setView] = useState<View>('chat');
  const [deviceId, setDeviceId] = useState<string | undefined>(() => remembered('device'));
  const [botId, setBotId] = useState<string | undefined>(() => remembered('bot'));
  const [conversationId, setConversationId] = useState<string | undefined>();

  const device: DeviceRow | undefined = devices.rows.find((d) => d.id === deviceId) ?? devices.rows[0];
  const bots = device?.providers ?? [];
  const bot = bots.find((b) => b.id === botId) ?? bots.find((b) => b.installed && b.authenticated) ?? bots[0];

  useEffect(() => remember('device', device?.id), [device?.id]);
  useEffect(() => remember('bot', bot?.id), [bot?.id]);

  const botConversations = useMemo(
    () => conversations.rows.filter((c) => c.device_id === device?.id && c.provider_id === bot?.id),
    [conversations.rows, device?.id, bot?.id],
  );
  const busyBots = useMemo(
    () => new Set(conversations.rows.filter((c) => c.busy && c.device_id === device?.id).map((c) => c.provider_id)),
    [conversations.rows, device?.id],
  );
  const conversation: ConversationRow | undefined = botConversations.find((c) => c.id === conversationId);

  const online = device ? isDeviceOnline(device, now) : false;
  const showDevices = view === 'devices' || (!devices.loading && devices.rows.length === 0);
  const worker = device ? workers.workers.find((w) => w.deviceId === device.id) : undefined;
  const fullWidth = showDevices || view === 'desktop' || view === 'terminal';

  return (
    <div className={fullWidth ? 'shell no-list' : 'shell'}>
      <Rail
        db={db}
        email={session.user.email ?? ''}
        devices={devices.rows}
        device={device}
        online={online}
        now={now}
        bot={view === 'chat' ? bot : undefined}
        busyBots={busyBots}
        view={showDevices ? 'devices' : view}
        canUseWorker={Boolean(bridge())}
        onSelectView={(v) => setView(v)}
        onSelectDevice={(id) => {
          setDeviceId(id);
          setConversationId(undefined);
          setView('chat');
        }}
        onSelectBot={(id) => {
          setBotId(id);
          setConversationId(undefined);
          setView('chat');
        }}
        onShowDevices={() => setView('devices')}
      />
      {showDevices ? (
        <DevicesPage
          db={db}
          devices={devices.rows}
          loading={devices.loading}
          now={now}
          workers={workers.workers}
          onWorkersChanged={workers.reload}
          onPaired={(d) => {
            setDeviceId(d.id);
            setView('chat');
          }}
        />
      ) : (view === 'desktop' || view === 'terminal') && device ? (
        worker ? (
          view === 'desktop' ? (
            <DesktopView key={worker.id} device={device} worker={worker} />
          ) : (
            <TerminalView key={worker.id} device={device} worker={worker} />
          )
        ) : (
          <NeedsWorker db={db} device={device} view={view} onLinked={workers.reload} />
        )
      ) : (
        <>
          <ConversationList
            bot={bot}
            conversations={botConversations}
            loading={conversations.loading}
            selectedId={conversation?.id}
            onSelect={setConversationId}
            onNew={() => setConversationId(undefined)}
          />
          {device && bot ? (
            <Chat
              key={`${device.id}:${bot.id}:${conversation?.id ?? 'new'}`}
              db={db}
              device={device}
              online={online}
              bot={bot}
              conversation={conversation}
              onCreated={setConversationId}
              onDeleted={() => setConversationId(undefined)}
            />
          ) : (
            <main className="chat">
              <div className="intro">
                <div className="intro-inner">
                  <h1>Czekam na listę botów</h1>
                  <p>Agent na urządzeniu „{device?.name}” jeszcze nie przysłał listy zainstalowanych botów. Upewnij się, że kontener działa.</p>
                </div>
              </div>
            </main>
          )}
        </>
      )}
    </div>
  );
}
