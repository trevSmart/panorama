import { handleOAuthCallback, ensureAuthenticated, beginLogin, isOAuthCallbackPath, getOAuthCallbackError, getOAuthSession, logout, initOAuthSessionStorage } from './auth/salesforce-oauth.js';
import { buildPhotoProxyParams } from './data/agent-photos.js';
import { installDataLayer, loadAppConfig } from './install-data.js';

function showBodyMessage(title, message, hint = '') {
  document.body.replaceChildren();
  const pre = document.createElement('pre');
  pre.style.cssText = 'padding:24px;font-family:monospace;white-space:pre-wrap';
  pre.textContent = `${title}: ${message}${hint}`;
  document.body.appendChild(pre);
}

function showOAuthError(message) {
  const hint = message.includes('admin approved') || message.includes('OAUTH_APP_ACCESS_DENIED')
    ? `\n\nFix in Salesforce Setup:\n1. External Client App → Panorama → Policies\n2. OAuth Policies → Permitted Users → "Admin approved users are pre-authorized"\n3. App Policies → add Permission Set "Panorama External User"\n4. Setup → Permission Sets → Panorama External User → Assign to your user`
    : '\n\nCheck ECA callback URL, CORS, and Permission Set policies.';
  showBodyMessage('OAuth failed', message, hint);
}

await initOAuthSessionStorage();
const runtimeConfig = await loadAppConfig();

if (isOAuthCallbackPath()) {
  const oauthError = getOAuthCallbackError();
  if (oauthError) {
    showOAuthError(oauthError);
  } else {
    try {
      await handleOAuthCallback(runtimeConfig);
      globalThis.location.replace('/');
    } catch (err) {
      console.error('[Panorama] OAuth callback failed', err);
      if (/mismatched state|missing.*state/i.test(err.message || '')) {
        logout();
        console.info('[Panorama] Restarting OAuth login after stale callback.');
        await beginLogin(runtimeConfig);
      } else {
        showOAuthError(err.message);
      }
    }
  }
} else {
  if (runtimeConfig.dataSource === 'salesforce') {
    await ensureAuthenticated(runtimeConfig);
  }

  let provider;
  try {
    provider = await installDataLayer(runtimeConfig);
  } catch (err) {
    console.error('[Panorama] Failed to load Salesforce data', err);
    const authError = /401|INVALID_SESSION|Not authenticated|invalid_grant/i.test(err.message || '');
    if (runtimeConfig.dataSource === 'salesforce' && authError) {
      logout();
      await ensureAuthenticated(runtimeConfig);
    } else {
      showBodyMessage('Failed to load Salesforce data', err.message);
      throw err;
    }
  }
  globalThis.__panoramaRuntimeConfig = runtimeConfig;
  await import('./app-main.js');

  if (provider.startSimulation) {
    provider.startSimulation({
      isView: (v) => globalThis.Panorama?.activeViewType?.() === v,
      updateOverviewMetrics: () => globalThis.updateOverviewMetrics?.(),
      updateAgents: () => globalThis.updateAgents?.(),
      updateRoomPanel: () => globalThis.updateRoomPanel?.(),
      Scene3D: globalThis.Scene3D,
      activePanelEl: () => globalThis.Panorama?.activePanelEl?.(),
      queueCard: (q) => globalThis.queueCard?.(q),
    });
  }

  if (provider.subscribe) {
    provider.subscribe(() => {
      const view = globalThis.Panorama?.activeViewType?.();
      if (view === 'operations') {
        globalThis.updateOverviewMetrics?.();
        globalThis.updateAgents?.();
        globalThis.updateRoomPanel?.();
      }
      globalThis.refreshFloors?.();
    });
  }

  function tickClock() {
    const el = document.getElementById('clock');
    if (el) el.textContent = new Date().toLocaleTimeString('en-GB', { hour12: false });
  }
  tickClock();
  setInterval(tickClock, 1000);

  initUserMenu(runtimeConfig);

  console.info(`[Panorama] data source: ${provider.source}`);
}

/**
 * @param {import('./config.js').RuntimeConfig} runtimeConfig
 */
async function initUserMenu(runtimeConfig) {
  const avatar = document.getElementById('meAvatar');
  const menu = document.getElementById('userMenu');
  const nameEl = document.getElementById('userMenuName');
  const titleEl = document.getElementById('userMenuTitle');

  // Toggle menu
  avatar.addEventListener('click', () => {
    const isOpen = menu.classList.toggle('open');
    avatar.setAttribute('aria-expanded', String(isOpen));
  });
  avatar.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); avatar.click(); }
  });
  document.addEventListener('click', (e) => {
    if (!document.getElementById('meWidget').contains(e.target)) {
      menu.classList.remove('open');
      avatar.setAttribute('aria-expanded', 'false');
    }
  });

  // Menu actions
  document.getElementById('userMenuSettings').addEventListener('click', () => {
    menu.classList.remove('open');
    globalThis.Panorama?.openSettings?.();
  });
  document.getElementById('userMenuLogout').addEventListener('click', () => {
    logout();
    globalThis.location.reload();
  });

  const openSalesforceItem = document.getElementById('userMenuOpenSF');
  const openSalesforceSetupItem = document.getElementById('userMenuOpenSFSetup');

  // Load Salesforce user info
  if (runtimeConfig.dataSource !== 'salesforce') {
    openSalesforceItem.hidden = true;
    openSalesforceSetupItem.hidden = true;
    return;
  }

  try {
    const session = getOAuthSession();
    if (!session?.accessToken || !session?.instanceUrl) return;

    const res = await fetch(`${session.instanceUrl}/services/oauth2/userinfo`, {
      headers: { Authorization: `Bearer ${session.accessToken}` },
    });
    if (!res.ok) return;
    const info = await res.json();

    const displayName = info.name || info.display_name || '';
    const title = info.title || info.email || '';
    const photoUrl = info.photos?.thumbnail || info.picture || '';

    if (nameEl) nameEl.textContent = displayName || '—';
    if (titleEl) titleEl.textContent = title;

    // Update avatar
    if (avatar && photoUrl) {
      let photoParams;
      try {
        photoParams = buildPhotoProxyParams(photoUrl);
      } catch {
        photoParams = null;
      }
      const photoRes = photoParams
        ? await fetch(`/api/salesforce/photo?${photoParams}`, {
          headers: { Authorization: `Bearer ${session.accessToken}` },
        })
        : null;
      if (photoRes?.ok) {
        const blob = await photoRes.blob();
        const blobUrl = URL.createObjectURL(blob);
        avatar.innerHTML = `<img src="${blobUrl}" alt="${displayName}">`;
      }
    } else if (avatar && displayName) {
      const initials = displayName.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
      avatar.textContent = initials;
    }

    // Open Salesforce links use instanceUrl from the active OAuth session.
    openSalesforceItem.addEventListener('click', () => {
      menu.classList.remove('open');
      window.open(session.instanceUrl, '_blank', 'noopener');
    });
    openSalesforceSetupItem.addEventListener('click', () => {
      menu.classList.remove('open');
      window.open(`${session.instanceUrl}/lightning/setup/SetupOneHome/home`, '_blank', 'noopener');
    });
  } catch (err) {
    console.warn('[Panorama] user info fetch failed', err);
    // Fallback: still wire up Open Salesforce with whatever session we have
    const session = getOAuthSession();
    if (session?.instanceUrl) {
      openSalesforceItem.addEventListener('click', () => {
        menu.classList.remove('open');
        window.open(session.instanceUrl, '_blank', 'noopener');
      });
      openSalesforceSetupItem.addEventListener('click', () => {
        menu.classList.remove('open');
        window.open(`${session.instanceUrl}/lightning/setup/SetupOneHome/home`, '_blank', 'noopener');
      });
    }
  }
}
