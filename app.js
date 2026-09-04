const normalizeBase = value => String(value || '').replace(/\/$/, '') || '/';
const API = normalizeBase(window.LINKFORTY_BASE);
const SHORTLINK_BASE = normalizeBase(window.LINKFORTY_BASE);
const LINK_TYPES = new Set(['h5', 'miniprogram', 'app']);
const APP_CONFIG = window.APP_OPEN_CONFIG || {};
const APP_OPEN_PAGE_PATH = new URL('./app-open.html', window.location.href).pathname;

let links = [];
let linkType = 'h5';
let editingLinkId = null;
const $ = selector => document.querySelector(selector);

function escapeHtml(value) {
  const div = document.createElement('div');
  div.textContent = String(value ?? '');
  return div.innerHTML;
}

function notice(message, error = false) {
  $('#notice').innerHTML = `<div class="notice ${error ? 'error' : ''}">${escapeHtml(message)}</div>`;
  setTimeout(() => $('#notice').replaceChildren(), 3500);
}

function showFieldError(inputSelector, errorSelector, message = '') {
  const input = $(inputSelector);
  const error = $(errorSelector);
  if (error) {
    error.textContent = message;
    error.hidden = !message;
  }
  if (input) {
    input.classList.toggle('input-error', Boolean(message));
    if (message) input.focus();
  }
}

class FormValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'FormValidationError';
  }
}

function throwFieldValidation(inputSelector, errorSelector, message) {
  showFieldError(inputSelector, errorSelector, message);
  throw new FormValidationError(message);
}

function throwGroupValidation(errorSelector, inputSelector, message) {
  showGroupError(errorSelector, message);
  const input = $(inputSelector);
  if (input) input.focus();
  throw new FormValidationError(message);
}

function showGroupError(errorSelector, message = '') {
  const error = $(errorSelector);
  if (error) {
    error.textContent = message;
    error.hidden = !message;
  }
}

function clearAppValidationErrors() {
  [
    ['#iosScheme', '#iosSchemeError'],
    ['#androidScheme', '#androidSchemeError'],
    ['#harmonyScheme', '#harmonySchemeError'],
    ['#appPayload', '#appPayloadError'],
    ['#targetUrl', '#targetUrlError'],
  ].forEach(([inputSelector, errorSelector]) => showFieldError(inputSelector, errorSelector));
  showGroupError('#schemeGroupError');
}

function joinPath(base, path) {
  const cleanPath = String(path).replace(/^\//, '');
  return base === '/' ? `/${cleanPath}` : `${base}/${cleanPath}`;
}

function publicUrl(path) {
  return new URL(path, window.location.origin).toString();
}

async function api(path, options = {}) {
  const response = await fetch(joinPath(API, path), {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || data.message || `LinkForty 请求失败 (${response.status})`);
  }
  return response.status === 204 ? null : response.json();
}

function parseDescription(value) {
  if (LINK_TYPES.has(value)) return { type: value, text: '', defaultPage: '' };
  try {
    const data = JSON.parse(value || '{}');
    if (LINK_TYPES.has(data.type)) {
      return {
        type: data.type,
        text: String(data.text || ''),
        defaultPage: String(data.defaultPage || data.webFallbackUrl || '').trim(),
      };
    }
  } catch {}
  return null;
}

function createDescription(type, text) {
  return JSON.stringify({ type, text: text.trim() });
}

function getTypeLabel(type) {
  return type === 'h5' ? 'H5' : type === 'miniprogram' ? '小程序' : 'App';
}

function normalizeScheme(value) {
  return String(value || '').trim().replace(/:\/+$|:$/g, '').replace(/\/+$/g, '');
}

function formatScheme(value) {
  const normalized = normalizeScheme(value);
  return normalized ? `${normalized}://` : '';
}

function isHttpUrl(value, requireHttps = false) {
  try {
    const url = new URL(value);
    return (requireHttps ? url.protocol === 'https:' : ['http:', 'https:'].includes(url.protocol));
  } catch {
    return false;
  }
}

function isAppOpenUrl(value) {
  try {
    return new URL(value).pathname === APP_OPEN_PAGE_PATH;
  } catch {
    return false;
  }
}

function createLegacyAppPayload(url) {
  const hasLegacyPayload = ['startType', 'menuId', 'injectParams'].some(key => url.searchParams.has(key));
  if (!hasLegacyPayload) return '';

  const startType = url.searchParams.get('startType') || 'PORTALINJECT';
  const menuId = url.searchParams.get('menuId') || 'conformity';
  const injectParams = url.searchParams.get('injectParams') || '';
  return [`startType=${startType}`, `menuId=${menuId}`, `injectParams=${injectParams}`].join('&');
}

function normalizeAppPayload(value) {
  return String(value || '').trim().replace(/^\/\//, '').trim().replace(/&+$/g, '');
}

const MAX_APP_PAYLOAD_LENGTH = 4096;

function isValidAppPayload(payload) {
  return Boolean(payload)
    && payload.length <= MAX_APP_PAYLOAD_LENGTH
    && !/[\u0000-\u001f\u007f]/.test(payload);
}

function parseAppOpenUrl(value) {
  if (!isAppOpenUrl(value)) return null;
  try {
    const url = new URL(value);
    const appPayload = normalizeAppPayload(url.searchParams.get('appPayload') || url.searchParams.get('payload') || createLegacyAppPayload(url));
    return {
      iosScheme: url.searchParams.get('iosScheme') || formatScheme(APP_CONFIG.iosScheme),
      androidScheme: url.searchParams.get('androidScheme') || formatScheme(APP_CONFIG.androidScheme),
      harmonyScheme: url.searchParams.get('harmonyScheme') || formatScheme(APP_CONFIG.harmonyScheme),
      appPayload,
      webFallbackUrl: url.searchParams.get('defaultPage') || url.searchParams.get('web') || APP_CONFIG.webFallbackUrl || '',
    };
  } catch {
    return null;
  }
}

function getDisplayTarget(link) {
  const metadata = parseDescription(link.description);
  if (metadata?.defaultPage) return metadata.defaultPage;
  if (link.web_fallback_url && !isAppOpenUrl(link.web_fallback_url)) return link.web_fallback_url;
  return parseAppOpenUrl(link.original_url)?.webFallbackUrl || link.original_url;
}

function buildBridgeUrl({ iosScheme, androidScheme, harmonyScheme, appPayload, linkId, defaultPage }) {
  const url = new URL('./app-open.html', window.location.href);
  url.searchParams.set('iosScheme', formatScheme(iosScheme));
  url.searchParams.set('androidScheme', formatScheme(androidScheme));
  url.searchParams.set('harmonyScheme', formatScheme(harmonyScheme));
  url.searchParams.set('appPayload', normalizeAppPayload(appPayload));
  url.searchParams.set('linkId', linkId || '__LINK_ID__');
  if (defaultPage) url.searchParams.set('defaultPage', defaultPage);
  return url.toString();
}

async function loadData() {
  const rows = await api('/api/links');
  links = (Array.isArray(rows) ? rows : []).flatMap(link => {
    const parsed = parseDescription(link.description);
    return parsed ? [{ ...link, linkType: parsed.type, linkDescription: parsed.text }] : [];
  });
  links = links.map(link => parseAppOpenUrl(link.original_url)
    ? { ...link, linkType: 'app' }
    : link);
  render();
}

function render() {
  $('#cardRows').innerHTML = links.length ? links.map(link => {
    const shortUrl = publicUrl(joinPath(SHORTLINK_BASE, encodeURIComponent(link.short_code)));
    const targetUrl = getDisplayTarget(link);
    return `<tr>
      <td>${escapeHtml(link.title || '未命名链接')}</td>
      <td><span class="tag ${link.linkType}">${getTypeLabel(link.linkType)}</span></td>
      <td>${escapeHtml(link.linkDescription || '-')}</td>
      <td><a href="${escapeHtml(shortUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(shortUrl)}</a></td>
      <td class="url">${escapeHtml(targetUrl)}</td>
      <td><a class="link" href="${escapeHtml(shortUrl)}" target="_blank" rel="noopener noreferrer">打开链接</a><button class="link" data-edit-link="${link.id}">修改</button><button class="link danger" data-delete-link="${link.id}">删除</button></td>
    </tr>`;
  }).join('') : '<tr><td class="empty" colspan="6">暂无短链接，请先添加</td></tr>';
}

function syncTypeButtons() {
  document.querySelectorAll('[data-link-type]').forEach(button => {
    const selected = button.dataset.linkType === linkType;
    button.classList.toggle('selected', selected);
    button.textContent = `${selected ? '◉' : '○'} ${getTypeLabel(button.dataset.linkType)}`;
  });
}

function syncTargetType() {
  const isApp = linkType === 'app';
  $('#appOpenFields').hidden = !isApp;
  $('#plainTargetField').hidden = isApp;
  $('#targetUrl').required = isApp;
  $('#plainTargetUrl').required = !isApp;
}

function closeDialogs() {
  document.querySelectorAll('dialog[open]').forEach(dialog => dialog.close());
}

function populateAppDefaults() {
  $('#iosScheme').value = formatScheme(APP_CONFIG.iosScheme);
  $('#androidScheme').value = formatScheme(APP_CONFIG.androidScheme);
  $('#harmonyScheme').value = formatScheme(APP_CONFIG.harmonyScheme);
  $('#appPayload').value = '';
  $('#targetUrl').value = APP_CONFIG.webFallbackUrl || '';
  $('#plainTargetUrl').value = '';
  clearAppValidationErrors();
  showFieldError('#plainTargetUrl', '#plainTargetUrlError', '');
  syncTargetType();
}

function openCreateDialog() {
  editingLinkId = null;
  linkType = 'h5';
  syncTypeButtons();
  $('#linkDialogTitle').textContent = '添加短链接';
  $('#linkDialogTip').textContent = '创建固定短码与目标地址的映射';
  $('#saveLinkBtn').textContent = '创建';
  $('#customCodeField').hidden = false;
  $('#customCode').value = '';
  $('#shortUrlField').hidden = true;
  $('#linkName').value = '';
  $('#linkDescription').value = '';
  populateAppDefaults();
  $('#linkDialog').showModal();
}

function validateAppFields() {
  const iosScheme = formatScheme($('#iosScheme').value);
  const androidScheme = formatScheme($('#androidScheme').value);
  const harmonyScheme = formatScheme($('#harmonyScheme').value);
  const appPayload = normalizeAppPayload($('#appPayload').value);
  const webFallbackUrl = $('#targetUrl').value.trim();

  clearAppValidationErrors();
  const schemes = [
    { value: iosScheme, input: '#iosScheme', error: '#iosSchemeError', label: 'iOS' },
    { value: androidScheme, input: '#androidScheme', error: '#androidSchemeError', label: 'Android' },
    { value: harmonyScheme, input: '#harmonyScheme', error: '#harmonySchemeError', label: '鸿蒙' },
  ];
  if (!schemes.some(({ value }) => value)) {
    throwGroupValidation('#schemeGroupError', '#iosScheme', '至少填写一个平台 Scheme');
  }
  schemes.forEach(({ value, input, error, label }) => {
    if (value && !/^[a-z][a-z0-9+.-]*:\/\/$/i.test(value)) {
      throwFieldValidation(input, error, `${label} Scheme 格式不正确，例如 com.example.app://`);
    }
  });
  if (!isValidAppPayload(appPayload)) {
    throwFieldValidation(
      '#appPayload',
      '#appPayloadError',
      `App 跳转参数不能为空，长度不能超过 ${MAX_APP_PAYLOAD_LENGTH} 个字符，且不能包含控制字符`,
    );
  }
  if (!isHttpUrl(webFallbackUrl, true)) {
    throwFieldValidation('#targetUrl', '#targetUrlError', 'H5 回退页必须是完整的 HTTPS 地址');
  }
  return { iosScheme, androidScheme, harmonyScheme, appPayload, webFallbackUrl };
}

function getPlainTarget() {
  return $('#plainTargetUrl').value.trim();
}

$('#addLinkBtn').onclick = openCreateDialog;
$('#refreshBtn').onclick = async () => {
  const button = $('#refreshBtn');
  button.disabled = true;
  try { await loadData(); notice('已刷新'); }
  catch (error) { notice(`刷新失败：${error.message}`, true); }
  finally { button.disabled = false; }
};

document.querySelectorAll('[data-close]').forEach(button => { button.onclick = closeDialogs; });
document.querySelectorAll('[data-link-type]').forEach(button => { button.onclick = () => {
  linkType = button.dataset.linkType;
  syncTypeButtons();
  syncTargetType();
}; });

$('#linkForm').onsubmit = async event => {
  event.preventDefault();
  const button = $('#saveLinkBtn');
  button.disabled = true;

  try {
    const isApp = linkType === 'app';
    const bridgeConfig = isApp ? validateAppFields() : null;
    const targetUrl = isApp ? bridgeConfig.webFallbackUrl : getPlainTarget();
    const currentLink = editingLinkId ? links.find(link => link.id === editingLinkId) : null;
    const originalUrl = bridgeConfig
      ? buildBridgeUrl({ ...bridgeConfig, linkId: currentLink?.id, defaultPage: targetUrl })
      : targetUrl;

    const description = createDescription(linkType, $('#linkDescription').value);
    const body = {
      originalUrl,
      title: $('#linkName').value.trim(),
      description,
      // Core prioritizes web_fallback_url during redirect. For App links it
      // must point to the bridge. The real default page is carried by the
      // bridge URL query and resolved by app-open.html.
      webFallbackUrl: bridgeConfig ? originalUrl : targetUrl,
    };

    if (editingLinkId) {
      await api(`/api/links/${encodeURIComponent(editingLinkId)}`, {
        method: 'PUT',
        body: JSON.stringify(body),
      });
      notice('链接配置已修改，原短链接保持不变');
    } else {
      const customCode = $('#customCode').value.trim();
      if (customCode && !/^[A-Za-z0-9_-]{8,20}$/.test(customCode)) {
        throw new Error('自定义短链接必须为 8～20 位，只能使用字母、数字、- 和 _');
      }
      if (customCode && links.some(link => link.short_code === customCode)) {
        throw new Error('这个自定义短链接已经存在，请更换');
      }
      body.customCode = customCode || undefined;
      const createdLink = await api('/api/links', { method: 'POST', body: JSON.stringify(body) });
      if (isApp) {
        if (!createdLink?.id) throw new Error('Core 未返回链接 ID，无法完成 App 桥接配置');
        const finalBridgeUrl = buildBridgeUrl({ ...bridgeConfig, linkId: createdLink.id, defaultPage: targetUrl });
        await api(`/api/links/${encodeURIComponent(createdLink.id)}`, {
          method: 'PUT',
          body: JSON.stringify({
            ...body,
            originalUrl: finalBridgeUrl,
            webFallbackUrl: finalBridgeUrl,
          }),
        });
      }
      notice(isApp ? 'App 拉起短链接已创建' : '普通短链接已创建');
    }
    closeDialogs();
    await loadData();
  } catch (error) {
    if (!(error instanceof FormValidationError)) notice(error.message, true);
  } finally {
    button.disabled = false;
  }
};

document.addEventListener('click', async event => {
  const edit = event.target.closest('[data-edit-link]');
  if (edit) {
    const link = links.find(item => item.id === edit.dataset.editLink);
    if (!link) return;

    const appConfig = parseAppOpenUrl(link.original_url);
    editingLinkId = link.id;
    linkType = link.linkType;
    syncTypeButtons();
    $('#linkDialogTitle').textContent = '修改短链接跳转';
    $('#linkDialogTip').textContent = '短码不会改变，只更新当前跳转配置';
    $('#saveLinkBtn').textContent = '保存修改';
    $('#customCodeField').hidden = true;
    $('#shortUrlField').hidden = false;
    $('#shortUrl').value = publicUrl(joinPath(SHORTLINK_BASE, encodeURIComponent(link.short_code)));
    $('#linkName').value = link.title || '';
    $('#linkDescription').value = link.linkDescription || '';

    if (linkType === 'app') {
      const metadata = parseDescription(link.description);
      $('#appPayload').value = appConfig?.appPayload || '';
      $('#iosScheme').value = appConfig?.iosScheme || formatScheme(APP_CONFIG.iosScheme);
      $('#androidScheme').value = appConfig?.androidScheme || formatScheme(APP_CONFIG.androidScheme);
      $('#harmonyScheme').value = appConfig?.harmonyScheme || formatScheme(APP_CONFIG.harmonyScheme);
      $('#targetUrl').value = appConfig?.webFallbackUrl
        || metadata?.defaultPage
        || (link.web_fallback_url && !isAppOpenUrl(link.web_fallback_url) ? link.web_fallback_url : '')
        || appConfig?.webFallbackUrl
        || APP_CONFIG.webFallbackUrl
        || '';
      $('#plainTargetUrl').value = '';
    } else {
      $('#iosScheme').value = formatScheme(APP_CONFIG.iosScheme);
      $('#androidScheme').value = formatScheme(APP_CONFIG.androidScheme);
      $('#harmonyScheme').value = formatScheme(APP_CONFIG.harmonyScheme);
      $('#plainTargetUrl').value = link.original_url || '';
      $('#targetUrl').value = APP_CONFIG.webFallbackUrl || '';
      $('#appPayload').value = '';
    }
    showFieldError('#plainTargetUrl', '#plainTargetUrlError', '');
    clearAppValidationErrors();
    syncTargetType();
    $('#linkDialog').showModal();
    return;
  }

  const remove = event.target.closest('[data-delete-link]');
  if (!remove) return;
  const link = links.find(item => item.id === remove.dataset.deleteLink);
  if (!confirm(`确定删除“${link?.title || '这条短链接'}”吗？删除后 NFC 中的短链接将无法访问。`)) return;
  remove.disabled = true;
  try {
    await api(`/api/links/${encodeURIComponent(remove.dataset.deleteLink)}`, { method: 'DELETE' });
    await loadData();
    notice('短链接已从 links 表删除');
  } catch (error) {
    remove.disabled = false;
    notice(`删除失败：${error.message}`, true);
  }
});

syncTargetType();
loadData().catch(error => notice(`数据加载失败：${error.message}`, true));
