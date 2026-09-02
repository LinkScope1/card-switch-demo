(function () {
  'use strict';

  const config = window.APP_OPEN_CONFIG || {};
  const MAX_APP_PAYLOAD_LENGTH = 4096;
  const query = new URLSearchParams(window.location.search);
  const apiBase = normalizeBase(window.LINKFORTY_BASE);
  const APP_OPEN_PAGE_PATH = new URL('./app-open.html', window.location.href).pathname;
  const linkId = query.get('linkId') || '';
  const iosScheme = query.get('iosScheme') || config.iosScheme || '';
  const androidScheme = query.get('androidScheme') || config.androidScheme || '';
  const harmonyScheme = query.get('harmonyScheme') || config.harmonyScheme || '';
  const hasLegacyPayload = ['startType', 'menuId', 'injectParams'].some(key => query.has(key));
  const legacyPayload = hasLegacyPayload ? [
    `startType=${query.get('startType') || 'PORTALINJECT'}`,
    `menuId=${query.get('menuId') || 'conformity'}`,
    `injectParams=${query.get('injectParams') || ''}`,
  ].join('&') : '';
  const appPayload = String(query.get('appPayload') || query.get('payload') || legacyPayload).trim().replace(/^\/\//, '').replace(/&+$/g, '');
  const legacyWebFallbackUrl = query.get('defaultPage') || query.get('web') || config.webFallbackUrl || '';
  let webFallbackUrl = legacyWebFallbackUrl;
  const spinner = document.getElementById('spinner');
  const hint = document.getElementById('hint');
  const openAppButton = document.getElementById('openAppButton');
  const webFallbackButton = document.getElementById('webFallbackButton');
  const APP_ATTEMPT_TIMEOUT = 6000;
  let appOpened = false;
  let appAttempted = false;
  let fallbackRedirected = false;
  let fallbackTimer = null;

  function normalizeBase(value) {
    return String(value || '').replace(/\/$/, '') || '/';
  }

  function joinPath(base, path) {
    const cleanPath = String(path).replace(/^\//, '');
    return base === '/' ? `/${cleanPath}` : `${base}/${cleanPath}`;
  }

  function isAppOpenUrl(value) {
    try {
      return new URL(value).pathname === APP_OPEN_PAGE_PATH;
    } catch {
      return false;
    }
  }

  function getDefaultPageFromBridge(value) {
    try {
      const url = new URL(value);
      if (url.pathname !== APP_OPEN_PAGE_PATH) return '';
      return String(url.searchParams.get('defaultPage') || url.searchParams.get('web') || '').trim();
    } catch {
      return '';
    }
  }

  function getDefaultPageFromDescription(value) {
    try {
      const data = JSON.parse(value || '{}');
      return String(data.defaultPage || data.webFallbackUrl || '').trim();
    } catch {
      return '';
    }
  }

  async function resolveDefaultPage() {
    if (!linkId) return legacyWebFallbackUrl;

    try {
      const response = await fetch(joinPath(apiBase, `/api/links/${encodeURIComponent(linkId)}`), {
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) return legacyWebFallbackUrl;
      const data = await response.json();
      const bridgeDefaultPage = getDefaultPageFromBridge(data.originalUrl || data.original_url)
        || getDefaultPageFromBridge(data.webFallbackUrl || data.web_fallback_url);
      if (bridgeDefaultPage) return bridgeDefaultPage;

      // Read legacy demo records once; new records no longer put the default
      // page in Core's description field.
      const defaultPage = getDefaultPageFromDescription(data.description);
      if (defaultPage) return defaultPage;

      // Backward compatibility for links created before the bridge fallback
      // change, where web_fallback_url still contains the actual default page.
      const legacyFallback = data.webFallbackUrl || data.web_fallback_url || '';
      return isAppOpenUrl(legacyFallback) ? legacyWebFallbackUrl : legacyFallback || legacyWebFallbackUrl;
    } catch {
      return legacyWebFallbackUrl;
    }
  }

  function normalizeScheme(value) {
    return String(value || '').trim().replace(/:\/+$/g, '').replace(/:$/g, '').replace(/\/+$/g, '');
  }

  function isHttpsUrl(value) {
    try {
      return new URL(value).protocol === 'https:';
    } catch {
      return false;
    }
  }

  function isValidAppPayload(payload) {
    return Boolean(payload)
      && payload.length <= MAX_APP_PAYLOAD_LENGTH
      && !/[\u0000-\u001f\u007f]/.test(payload);
  }

  function detectPlatform() {
    const ua = navigator.userAgent || '';
    const platform = navigator.userAgentData?.platform || navigator.platform || '';
    const isIOS = /iPhone|iPad|iPod/i.test(ua)
      || (/Macintosh/i.test(ua) && /MacIntel/i.test(platform) && navigator.maxTouchPoints > 1);
    if (isIOS) return 'ios';
    if (/HarmonyOS|OpenHarmony|OHOS|ArkWeb/i.test(ua) || /HarmonyOS|OpenHarmony|OHOS|ArkWeb/i.test(platform)) return 'harmony';
    if (/Android/i.test(ua) || /Android/i.test(platform)) return 'android';
    return 'web';
  }

  function buildAppUrl(platform) {
    const scheme = platform === 'ios'
      ? iosScheme
      : platform === 'harmony' ? harmonyScheme : androidScheme;
    const normalizedScheme = normalizeScheme(scheme);
    if (!normalizedScheme || !isValidAppPayload(appPayload)) return '';

    // Keep the target app's payload format opaque; the bridge only prefixes
    // the selected scheme and does not parse or append app-specific fields.
    return `${normalizedScheme}://${appPayload}`;
  }

  function clearFallbackTimer() {
    if (fallbackTimer) {
      window.clearTimeout(fallbackTimer);
      fallbackTimer = null;
    }
  }

  function showFallback() {
    if (appOpened) return;
    spinner.hidden = true;
    hint.textContent = '如果 App 没有打开，请点击“打开 App”或“访问网页”。';
  }

  function redirectToFallback() {
    if (!fallbackRedirected && webFallbackUrl && isHttpsUrl(webFallbackUrl)) {
      fallbackRedirected = true;
      window.location.replace(webFallbackUrl);
    }
  }

  function scheduleFallback() {
    clearFallbackTimer();
    fallbackTimer = window.setTimeout(() => {
      showFallback();
      redirectToFallback();
    }, APP_ATTEMPT_TIMEOUT);
  }

  async function start() {
    webFallbackUrl = await resolveDefaultPage();

    if (!webFallbackUrl || !isHttpsUrl(webFallbackUrl)) {
      showFallback();
      return;
    }

    webFallbackButton.href = webFallbackUrl;
    webFallbackButton.hidden = false;

    const platform = detectPlatform();
    if (platform === 'web') {
      showFallback();
      redirectToFallback();
      return;
    }

    const appUrl = buildAppUrl(platform);
    if (!appUrl) {
      showFallback();
      redirectToFallback();
      return;
    }

    appAttempted = true;
    openAppButton.href = appUrl;
    openAppButton.hidden = false;

    try {
      window.location.assign(appUrl);
    } catch {
      showFallback();
      scheduleFallback();
      return;
    }

    scheduleFallback();
  }

  openAppButton.addEventListener('click', () => {
    // A user click may be allowed by browsers that block the automatic attempt.
    // Give this second attempt a fresh 6-second window before falling back.
    appOpened = false;
    appAttempted = true;
    spinner.hidden = false;
    scheduleFallback();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && appAttempted) {
      appOpened = true;
      clearFallbackTimer();
      return;
    }
    if (!document.hidden && appOpened) {
      redirectToFallback();
    }
  });

  window.addEventListener('pagehide', () => {
    if (appAttempted) {
      appOpened = true;
      clearFallbackTimer();
    }
  });

  window.addEventListener('pageshow', () => {
    if (appOpened) {
      redirectToFallback();
    }
  });

  window.addEventListener('load', start);
}());
