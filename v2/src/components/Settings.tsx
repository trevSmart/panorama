import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { loadPreferences, savePreferences, getRefreshConfig, applyPreferencesSideEffects } from '@core/settings/preferences.js';
import { getProvider } from '../store/panoramaStore';
import { consolePanel, isDevModeOn } from '../dev/devmode';

type Prefs = Record<string, string | boolean>;
type Section = 'connexio' | 'dades' | 'aparenca' | 'notificacions' | 'developer' | 'sobre';

interface RuntimeConfig { dataSource?: string; sfClientId?: string; sfLoginUrl?: string; }
function runtimeConfig(): RuntimeConfig {
  return (globalThis as unknown as { __panoramaRuntimeConfig?: RuntimeConfig }).__panoramaRuntimeConfig || {};
}

const ICONS: Record<Section, React.ReactNode> = {
  connexio: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></svg>,
  dades: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" /><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" /></svg>,
  aparenca: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>,
  notificacions: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>,
  sobre: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>,
  developer: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" /></svg>,
};

const NAV: { id: Section; label: string }[] = [
  { id: 'connexio', label: 'Connexió' },
  { id: 'dades', label: 'Dades' },
  { id: 'aparenca', label: 'Aparença' },
  { id: 'notificacions', label: 'Notificacions' },
  { id: 'sobre', label: 'Sobre' },
];

function Toggle({ id, checked, onChange }: { id: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="settings-toggle">
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="settings-toggle-track" />
    </label>
  );
}

function Row({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <div className="settings-row">
      <div className="settings-row-label"><strong>{title}</strong><span>{hint}</span></div>
      {children}
    </div>
  );
}

export function Settings({ onClose }: { onClose: () => void }) {
  const cfg = runtimeConfig();
  const [prefs, setPrefs] = useState<Prefs>(() => loadPreferences());
  const [dataSource, setDataSource] = useState<string>(cfg.dataSource || 'mock');
  const [section, setSection] = useState<Section>('connexio');
  const [devMode] = useState<boolean>(() => isDevModeOn());
  const [show, setShow] = useState(false);
  useEffect(() => { const id = requestAnimationFrame(() => setShow(true)); return () => cancelAnimationFrame(id); }, []);

  // Play the exit transition before unmounting (matches the drawer behaviour).
  const requestClose = () => { setShow(false); setTimeout(onClose, 200); };

  const set = (k: string, v: string | boolean) => setPrefs((p) => ({ ...p, [k]: v }));

  const session = useMemo(() => {
    try { return JSON.parse(localStorage.getItem('panorama.oauthSession') || 'null'); } catch { return null; }
  }, []);

  const save = () => {
    savePreferences(prefs);
    try { applyPreferencesSideEffects(prefs, { consolePanel, isDevModeOn }); } catch { /* ignore */ }
    try { getProvider().setRefreshInterval?.(getRefreshConfig()); } catch { /* ignore */ }
    if (dataSource !== (cfg.dataSource || 'mock')) {
      try { localStorage.setItem('panorama.dataSource', dataSource); } catch { /* ignore */ }
      globalThis.location.href = `/?source=${dataSource === 'salesforce' ? 'sf' : 'mock'}`;
      return;
    }
    requestClose();
  };

  const clearStorage = () => {
    if (confirm("S'esborraran totes les dades locals (sessió, preferències i caché). Continuar?")) {
      localStorage.clear();
      globalThis.location.reload();
    }
  };

  const sfBadge = cfg.sfClientId ? `…${cfg.sfClientId.slice(-8)}` : 'No configurat';
  const navItems = devMode ? [...NAV, { id: 'developer' as Section, label: 'Developer mode' }] : NAV;

  // Portal to <body>: the modal is position:fixed, but .app-chrome's
  // backdrop-filter creates a containing block that would otherwise trap it.
  return createPortal(
    <div className={`settings-backdrop ${show ? 'open' : ''}`} role="dialog" aria-modal="true" onClick={requestClose}>
      <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="settings-head">
          <span className="settings-head-title">Configuració</span>
          <button className="settings-close" aria-label="Tancar configuració" onClick={requestClose}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="settings-body">
          <nav className="settings-nav">
            {navItems.map((n) => (
              <button key={n.id} className={`settings-nav-item ${section === n.id ? 'active' : ''}`} onClick={() => setSection(n.id)}>
                {ICONS[n.id]}
                {n.label}
              </button>
            ))}
          </nav>

          <div className="settings-content">
            {section === 'connexio' && (
              <div className="settings-section active">
                <div className="settings-group">
                  <div className="settings-group-label">Font de dades</div>
                  <Row title="Mode de dades" hint="Selecciona la font d'on s'obtenen les dades del centre">
                    <select className="settings-select" value={dataSource} onChange={(e) => setDataSource(e.target.value)}>
                      <option value="mock">Simulació (mock)</option>
                      <option value="salesforce">Salesforce</option>
                    </select>
                  </Row>
                  <Row title="Estat de la connexió" hint="Darrera comprovació en iniciar sessió">
                    <span className={`settings-badge ${cfg.dataSource === 'salesforce' ? 'ok' : 'watch'}`}>{cfg.dataSource === 'salesforce' ? 'Salesforce' : 'Simulació'}</span>
                  </Row>
                </div>
                <div className="settings-group">
                  <div className="settings-group-label">Salesforce OAuth</div>
                  <Row title="Client ID (Connected App)" hint="Configurat al fitxer .env del servidor">
                    <span className={`settings-badge ${cfg.sfClientId ? 'ok' : 'off'}`}>{sfBadge}</span>
                  </Row>
                  <Row title="Login URL" hint="Entorn de Salesforce (producció o sandbox)">
                    <span className="settings-badge off">{cfg.sfLoginUrl || '—'}</span>
                  </Row>
                  <Row title="Sessió activa" hint="Token d'accés OAuth emmagatzemat localment">
                    <span className={`settings-badge ${session?.accessToken ? 'ok' : 'off'}`}>{session?.accessToken ? 'Activa' : 'No autenticat'}</span>
                  </Row>
                  <Row title="Reconnectar" hint="Forçar nou flux d'autenticació OAuth">
                    <button className="settings-btn" onClick={() => { globalThis.location.href = '/?source=sf'; }}>Reconectar…</button>
                  </Row>
                </div>
              </div>
            )}

            {section === 'dades' && (
              <div className="settings-section active">
                <div className="settings-group">
                  <div className="settings-group-label">Actualització</div>
                  <Row title="Interval de refresc" hint="Amb quina freqüència s'actualitzen agents i cues">
                    <select className="settings-select" value={String(prefs.settingsRefreshInterval)} onChange={(e) => set('settingsRefreshInterval', e.target.value)}>
                      <option value="2">Cada 2 s</option>
                      <option value="10">Cada 10 s</option>
                      <option value="30">Cada 30 s</option>
                      <option value="60">Cada minut</option>
                      <option value="300">Cada 5 min</option>
                    </select>
                  </Row>
                  <Row title="Refresc automàtic" hint="Actualitzar dades en segon pla mentre la pestanya és activa">
                    <Toggle id="settingsAutoRefresh" checked={Boolean(prefs.settingsAutoRefresh)} onChange={(v) => set('settingsAutoRefresh', v)} />
                  </Row>
                </div>
                <div className="settings-group">
                  <div className="settings-group-label">Umbrals d'alerta (UMI)</div>
                  <Row title="Temps màxim d'espera" hint="Llindar per mostrar alerta de cua (segons)">
                    <input type="number" className="settings-input" min={30} max={3600} style={{ minWidth: 90, maxWidth: 90 }} value={String(prefs.settingsMaxWait)} onChange={(e) => set('settingsMaxWait', e.target.value)} />
                  </Row>
                  <Row title="SLA objectiu (%)" hint="Percentatge d'objectiu de nivell de servei">
                    <input type="number" className="settings-input" min={50} max={100} style={{ minWidth: 90, maxWidth: 90 }} value={String(prefs.settingsSlaTarget)} onChange={(e) => set('settingsSlaTarget', e.target.value)} />
                  </Row>
                  <Row title="Agents en alerta (%)" hint="Proporció d'agents en estat alert per activar avís global">
                    <input type="number" className="settings-input" min={5} max={100} style={{ minWidth: 90, maxWidth: 90 }} value={String(prefs.settingsAlertPct)} onChange={(e) => set('settingsAlertPct', e.target.value)} />
                  </Row>
                </div>
              </div>
            )}

            {section === 'aparenca' && (
              <div className="settings-section active">
                <div className="settings-group">
                  <div className="settings-group-label">Visualització</div>
                  <Row title="Vista de planta per defecte" hint="Mode de visualització de l'espai en iniciar">
                    <select className="settings-select" value={String(prefs.settingsDefaultFloorView)} onChange={(e) => set('settingsDefaultFloorView', e.target.value)}>
                      <option value="2d">2D (isomètric)</option>
                      <option value="3d">3D</option>
                    </select>
                  </Row>
                  <Row title="Mostrar avatars" hint="Imatges de perfil dels agents a la vista de planta">
                    <Toggle id="settingsShowAvatars" checked={Boolean(prefs.settingsShowAvatars)} onChange={(v) => set('settingsShowAvatars', v)} />
                  </Row>
                  <Row title="Animacions 3D" hint="Torres animades i beacons a la vista tridimensional">
                    <Toggle id="settingsAnimations" checked={Boolean(prefs.settingsAnimations)} onChange={(v) => set('settingsAnimations', v)} />
                  </Row>
                </div>
                <div className="settings-group">
                  <div className="settings-group-label">Idioma i format</div>
                  <Row title="Idioma de la interfície" hint="Llengua dels textos de l'aplicació">
                    <select className="settings-select" value={String(prefs.settingsLang)} onChange={(e) => set('settingsLang', e.target.value)}>
                      <option value="ca">Català</option>
                      <option value="es">Castellà</option>
                      <option value="en">English</option>
                    </select>
                  </Row>
                  <Row title="Format horari" hint="Com es mostren les hores a la interfície">
                    <select className="settings-select" value={String(prefs.settingsTimeFormat)} onChange={(e) => set('settingsTimeFormat', e.target.value)}>
                      <option value="24h">24 h</option>
                      <option value="12h">12 h (AM/PM)</option>
                    </select>
                  </Row>
                </div>
              </div>
            )}

            {section === 'notificacions' && (
              <div className="settings-section active">
                <div className="settings-group">
                  <div className="settings-group-label">Alertes del sistema</div>
                  <Row title="Notificacions del navegador" hint="Permetre notificacions push quan la pestanya no és visible">
                    <Toggle id="settingsBrowserNotifs" checked={Boolean(prefs.settingsBrowserNotifs)} onChange={(v) => set('settingsBrowserNotifs', v)} />
                  </Row>
                  <Row title="Alerta de cua crítica" hint="Notificar quan una cua supera el temps màxim d'espera">
                    <Toggle id="settingsQueueAlert" checked={Boolean(prefs.settingsQueueAlert)} onChange={(v) => set('settingsQueueAlert', v)} />
                  </Row>
                  <Row title="Alerta d'agent desconnectat" hint="Notificar quan un agent passa a estat offline inesperat">
                    <Toggle id="settingsAgentOfflineAlert" checked={Boolean(prefs.settingsAgentOfflineAlert)} onChange={(v) => set('settingsAgentOfflineAlert', v)} />
                  </Row>
                  <Row title="So d'alerta" hint="Reproduir un so quan es dispara una notificació crítica">
                    <Toggle id="settingsSoundAlert" checked={Boolean(prefs.settingsSoundAlert)} onChange={(v) => set('settingsSoundAlert', v)} />
                  </Row>
                </div>
              </div>
            )}

            {section === 'developer' && (
              <div className="settings-section active">
                <div className="settings-group">
                  <div className="settings-group-label">Developer mode</div>
                  <Row title="Show console" hint="Mostra un panell de consola a la part inferior amb l'activitat de l'app">
                    <Toggle id="settingsShowConsole" checked={Boolean(prefs.settingsShowConsole)} onChange={(v) => set('settingsShowConsole', v)} />
                  </Row>
                </div>
              </div>
            )}

            {section === 'sobre' && (
              <div className="settings-section active">
                <div className="settings-group">
                  <div className="settings-group-label">Panorama</div>
                  <div className="settings-info-block">
                    <strong>Panorama — Supervisor d'operacions</strong><br />
                    Plataforma de supervisió en temps real per a centres d'atenció i operacions de servei.<br /><br />
                    <strong>Versió:</strong> 0.1.0-alpha (v2 React)<br />
                    <strong>Entorn:</strong> {cfg.dataSource === 'salesforce' ? 'Salesforce' : 'Simulació (mock)'}
                  </div>
                </div>
                <div className="settings-group">
                  <div className="settings-group-label">Sessió</div>
                  <Row title="Esborrar dades locals" hint="Elimina preferències, sessió i caché del navegador">
                    <button className="settings-btn danger" onClick={clearStorage}>Esborrar tot…</button>
                  </Row>
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="settings-footer">
          <button className="settings-btn" onClick={requestClose}>Cancel·lar</button>
          <button className="settings-btn primary" onClick={save}>Desar canvis</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
