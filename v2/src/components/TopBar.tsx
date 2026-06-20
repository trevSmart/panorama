import { useEffect, useRef, useState } from 'react';
import { logout, getOAuthSession } from '@core/auth/salesforce-oauth.js';
import { buildPhotoProxyParams } from '@core/data/agent-photos.js';
import { getProvider, refreshData } from '../store/panoramaStore';
import { isDevModeOn, toggleDevMode } from '../dev/devmode';
import { GlobalSearch } from './GlobalSearch';
import { Settings } from './Settings';
import type { DetailTarget } from '../detail/DetailDrawer';

interface UserInfo { name: string; title: string; avatarUrl: string; }
const initialsOf = (name: string) => name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();

// Loads the authenticated Salesforce user (name, email, photo), mirroring v1's
// initUserMenu. In mock mode there is no session, so it stays empty and the menu
// falls back to generic labels.
function useUserInfo(source: string): UserInfo {
  const [info, setInfo] = useState<UserInfo>({ name: '', title: '', avatarUrl: '' });
  useEffect(() => {
    if (source !== 'salesforce') return;
    let cancelled = false;
    let objUrl = '';
    (async () => {
      const session = getOAuthSession?.();
      if (!session?.accessToken || !session?.instanceUrl) return;
      try {
        const res = await fetch(`${session.instanceUrl}/services/oauth2/userinfo`, { headers: { Authorization: `Bearer ${session.accessToken}` } });
        if (!res.ok || cancelled) return;
        const data = await res.json();
        const name = data.name || data.display_name || '';
        const title = data.email || data.title || '';
        if (!cancelled) setInfo((i) => ({ ...i, name, title }));
        const photoUrl = data.photos?.thumbnail || data.picture || '';
        if (photoUrl) {
          const params = buildPhotoProxyParams(photoUrl);
          const pr = await fetch(`/api/salesforce/photo?${params}`, { headers: { Authorization: `Bearer ${session.accessToken}` } });
          if (pr.ok && !cancelled) { objUrl = URL.createObjectURL(await pr.blob()); setInfo((i) => ({ ...i, avatarUrl: objUrl })); }
        }
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; if (objUrl) URL.revokeObjectURL(objUrl); };
  }, [source]);
  return info;
}

// Ticking 24h clock, mirroring v1's #clock (updated every second).
function Clock() {
  const [now, setNow] = useState(() => new Date().toLocaleTimeString('en-GB', { hour12: false }));
  useEffect(() => {
    const id = setInterval(() => setNow(new Date().toLocaleTimeString('en-GB', { hour12: false })), 1000);
    return () => clearInterval(id);
  }, []);
  return <span className="clock mono">{now}</span>;
}

// Topbar refresh button: re-polls the data source on demand and spins while a
// refresh is in flight. The store notifies subscribers, so views re-render.
function RefreshButton() {
  const [refreshing, setRefreshing] = useState(false);
  const onClick = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await refreshData();
    } catch (err) {
      console.warn('[Panorama] manual refresh failed', err);
    } finally {
      setRefreshing(false);
    }
  };
  return (
    <button
      type="button"
      className={`topbar-btn ${refreshing ? 'is-spinning' : ''}`}
      title="Refrescar dades"
      aria-label="Refrescar dades"
      disabled={refreshing}
      onClick={onClick}
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="23 4 23 10 17 10" />
        <polyline points="1 20 1 14 7 14" />
        <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
      </svg>
    </button>
  );
}

// The right side of the top bar: clock, global search and the user menu. Search
// queries agents/queues/skills live (see GlobalSearch); the menu's Logout is
// wired to the real auth layer.
export function TopBar({ onSearchPick }: { onSearchPick: (t: DetailTarget) => void }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [devMode, setDevMode] = useState(() => isDevModeOn());
  const meRef = useRef<HTMLDivElement>(null);
  const source = (() => {
    try { return getProvider().source; } catch { return ''; }
  })();
  const user = useUserInfo(source);
  // Show the Salesforce links whenever there's an authenticated session (more
  // robust than relying on the provider source string alone).
  const sfSession = (() => { try { return getOAuthSession?.(); } catch { return null; } })();
  const showSf = source === 'salesforce' || Boolean(sfSession?.instanceUrl);

  const openSf = (path = '') => {
    const session = getOAuthSession?.();
    if (session?.instanceUrl) window.open(`${session.instanceUrl}${path}`, '_blank', 'noopener');
  };

  useEffect(() => {
    if (!menuOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (meRef.current && !meRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, [menuOpen]);

  return (
    <>
    <div className="top-right">
      <Clock />
      <RefreshButton />
      <GlobalSearch onPick={onSearchPick} />
      <div className="me" ref={meRef}>
        <div
          className="av"
          role="button"
          aria-haspopup="true"
          aria-expanded={menuOpen}
          tabIndex={0}
          onClick={() => setMenuOpen((o) => !o)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setMenuOpen((o) => !o); } }}
        >
          {user.avatarUrl ? <img src={user.avatarUrl} alt={user.name} /> : (user.name ? initialsOf(user.name) : 'MR')}
        </div>
        <div className={`user-menu dropdown-panel ${menuOpen ? 'is-open' : ''}`} role="menu">
          <div className="user-menu-header">
            <div className="user-menu-name">{user.name || 'Panorama'}</div>
            <div className="user-menu-title">{user.title || `Font de dades: ${source || '—'}`}</div>
          </div>
          <button
            className="user-menu-item"
            role="menuitem"
            onClick={() => { setMenuOpen(false); setSettingsOpen(true); }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
            Panorama Settings
          </button>

          {showSf && (
            <>
              <div className="user-menu-sep" />
              <button className="user-menu-item" role="menuitem" onClick={() => { setMenuOpen(false); openSf(); }}>
                <svg width="14" height="14" viewBox="0 0 520 520" fill="currentColor" aria-hidden="true">
                  <use href="/docs/salesforce-lightning-design-system-icons/utility-sprite/svg/symbols.svg#salesforce1" />
                </svg>
                Open Salesforce
              </button>
              <button className="user-menu-item" role="menuitem" onClick={() => { setMenuOpen(false); openSf('/lightning/setup/SetupOneHome/home'); }}>
                <svg width="14" height="14" viewBox="0 0 520 520" fill="currentColor" aria-hidden="true">
                  <use href="/docs/salesforce-lightning-design-system-icons/utility-sprite/svg/symbols.svg#setup" />
                </svg>
                Open Salesforce Setup
              </button>
            </>
          )}

          <div className="user-menu-sep" />
          <button
            className="user-menu-item"
            role="menuitemcheckbox"
            aria-checked={devMode}
            onClick={() => setDevMode(toggleDevMode())}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="16 18 22 12 16 6" />
              <polyline points="8 6 2 12 8 18" />
            </svg>
            Developer mode
            <span className="user-menu-toggle" aria-hidden="true" />
          </button>

          <div className="user-menu-sep" />
          <button
            className="user-menu-item user-menu-item--danger"
            role="menuitem"
            onClick={() => { logout(); globalThis.location.reload(); }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            Logout
          </button>
        </div>
      </div>
    </div>
    {settingsOpen && <Settings onClose={() => setSettingsOpen(false)} />}
    </>
  );
}
