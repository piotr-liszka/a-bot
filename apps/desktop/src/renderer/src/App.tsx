import type { BackendConfig } from '@a-bot/shared';
import { useMemo, useState } from 'react';
import { AuthScreen } from './components/AuthScreen';
import { BackendSetup } from './components/BackendSetup';
import { Workspace } from './components/Workspace';
import { activeBackend, getClient, saveBackend } from './lib/backend';
import { useSession } from './lib/data';

export function App() {
  const [backend, setBackend] = useState<BackendConfig | undefined>(() => activeBackend());
  const [editingBackend, setEditingBackend] = useState(false);

  if (!backend || editingBackend) {
    return (
      <BackendSetup
        initial={backend}
        onCancel={backend ? () => setEditingBackend(false) : undefined}
        onDone={(cfg) => {
          saveBackend(cfg);
          setBackend(cfg);
          setEditingBackend(false);
        }}
      />
    );
  }
  return <Connected key={backend.url} backend={backend} onChangeBackend={() => setEditingBackend(true)} />;
}

function Connected({ backend, onChangeBackend }: { backend: BackendConfig; onChangeBackend: () => void }) {
  const db = useMemo(() => getClient(backend), [backend]);
  const session = useSession(db);
  if (session === undefined) return null;
  if (!session) return <AuthScreen db={db} backend={backend} onChangeBackend={onChangeBackend} />;
  return <Workspace db={db} session={session} onChangeBackend={onChangeBackend} />;
}
