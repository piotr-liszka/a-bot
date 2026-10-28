import { isDeviceOnline, type ConversationRow, type DeviceRow } from '@a-bot/shared';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { useEffect, useMemo, useState } from 'react';
import { useConversations, useDevices, useNow } from '../lib/data';
import { Chat } from './Chat';
import { ConversationList } from './ConversationList';
import { DevicesPage } from './DevicesPage';
import { Rail } from './Rail';

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

  const [view, setView] = useState<'chat' | 'devices'>('chat');
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

  return (
    <div className={showDevices ? 'shell no-list' : 'shell'}>
      <Rail
        db={db}
        email={session.user.email ?? ''}
        devices={devices.rows}
        device={device}
        online={online}
        now={now}
        bot={view === 'chat' ? bot : undefined}
        busyBots={busyBots}
        view={showDevices ? 'devices' : 'chat'}
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
        <DevicesPage db={db} devices={devices.rows} loading={devices.loading} now={now} onPaired={(d) => {
          setDeviceId(d.id);
          setView('chat');
        }} />
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
