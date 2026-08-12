const normalizeBase = value => String(value || '').replace(/\/$/, '') || '/';
const API = normalizeBase(window.LINKFORTY_API_BASE || window.LINKFORTY_PUBLIC_PREFIX);
const SHORTLINK_BASE = normalizeBase(window.LINKFORTY_SHORTLINK_BASE || window.LINKFORTY_PUBLIC_PREFIX);
const LINK_TYPES = new Set(['h5', 'miniprogram']);

let links = [];
let targets = [];
let filter = 'all';
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

function formatDate(value) {
  return value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '-';
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
  if (LINK_TYPES.has(value)) return { type: value, text: '' };
  try {
    const data = JSON.parse(value || '{}');
    if (LINK_TYPES.has(data.type)) return { type: data.type, text: String(data.text || '') };
  } catch {}
  return null;
}

function createDescription(type, text) {
  return JSON.stringify({ type, text: text.trim() });
}

function rebuildTargets() {
  const unique = new Map();
  links.forEach(link => {
    const key = `${link.linkType}\u0000${link.original_url}`;
    const current = unique.get(key);
    if (current) {
      current.linkCount += 1;
      return;
    }
    unique.set(key, {
      type: link.linkType,
      description: link.linkDescription,
      url: link.original_url,
      createdAt: link.created_at,
      linkCount: 1,
    });
  });
  targets = [...unique.values()];
}

async function loadData() {
  const rows = await api('/api/links');
  links = (Array.isArray(rows) ? rows : []).flatMap(link => {
    const parsed = parseDescription(link.description);
    return parsed ? [{ ...link, linkType: parsed.type, linkDescription: parsed.text }] : [];
  });
  rebuildTargets();
  render();
}

function render() {
  $('#allCount').textContent = targets.length;
  $('#h5Count').textContent = targets.filter(item => item.type === 'h5').length;
  $('#miniCount').textContent = targets.filter(item => item.type === 'miniprogram').length;
  const shown = filter === 'all' ? targets : targets.filter(item => item.type === filter);

  $('#targetRows').innerHTML = shown.length ? shown.map(target => `<tr>
    <td><span class="tag ${target.type}">${target.type === 'h5' ? 'H5' : '小程序'}</span></td>
    <td>${escapeHtml(target.description || '-')}</td>
    <td class="url">${escapeHtml(target.url)}</td>
    <td>${target.linkCount}</td>
    <td>${formatDate(target.createdAt)}</td>
  </tr>`).join('') : '<tr><td class="empty" colspan="5">暂无目标链接</td></tr>';

  $('#cardRows').innerHTML = links.length ? links.map(link => {
    const shortUrl = publicUrl(joinPath(SHORTLINK_BASE, encodeURIComponent(link.short_code)));
    return `<tr>
      <td>${escapeHtml(link.title || '未命名链接')}</td>
      <td><span class="tag ${link.linkType}">${link.linkType === 'h5' ? 'H5' : '小程序'}</span></td>
      <td>${escapeHtml(link.linkDescription || '-')}</td>
      <td><a href="${escapeHtml(shortUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(shortUrl)}</a></td>
      <td class="url">${escapeHtml(link.original_url)}</td>
      <td><a class="link" href="${escapeHtml(shortUrl)}" target="_blank" rel="noopener noreferrer">打开链接</a><button class="link" data-edit-link="${link.id}">修改</button><button class="link danger" data-delete-link="${link.id}">删除</button></td>
    </tr>`;
  }).join('') : '<tr><td class="empty" colspan="6">暂无短链接，请先添加</td></tr>';
}

function syncTypeButtons() {
  document.querySelectorAll('[data-link-type]').forEach(button => {
    const selected = button.dataset.linkType === linkType;
    button.classList.toggle('selected', selected);
    button.textContent = `${selected ? '◉' : '○'} ${button.dataset.linkType === 'h5' ? 'H5' : '小程序'}`;
  });
}

function closeDialogs() {
  document.querySelectorAll('dialog[open]').forEach(dialog => dialog.close());
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
  $('#targetUrl').value = '';
  $('#linkDialog').showModal();
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
document.querySelectorAll('[data-filter]').forEach(button => { button.onclick = () => {
  filter = button.dataset.filter;
  document.querySelectorAll('[data-filter]').forEach(item => item.classList.toggle('active', item === button));
  render();
}; });
document.querySelectorAll('[data-link-type]').forEach(button => { button.onclick = () => {
  linkType = button.dataset.linkType;
  syncTypeButtons();
}; });

$('#linkForm').onsubmit = async event => {
  event.preventDefault();
  const button = $('#saveLinkBtn');
  button.disabled = true;
  try {
    const body = {
      originalUrl: $('#targetUrl').value.trim(),
      title: $('#linkName').value.trim(),
      description: createDescription(linkType, $('#linkDescription').value),
    };
    if (editingLinkId) {
      await api(`/api/links/${encodeURIComponent(editingLinkId)}`, {
        method: 'PUT',
        body: JSON.stringify(body),
      });
      notice('目标地址已修改，原短链接保持不变');
    } else {
      const customCode = $('#customCode').value.trim();
      if (customCode && !/^[A-Za-z0-9_-]{8}$/.test(customCode)) {
        throw new Error('自定义短链接必须正好 8 位，只能使用字母、数字、- 和 _');
      }
      if (customCode && links.some(link => link.short_code === customCode)) {
        throw new Error('这个自定义短链接已经存在，请更换');
      }
      body.customCode = customCode || undefined;
      await api('/api/links', { method: 'POST', body: JSON.stringify(body) });
      notice(customCode ? '短链接已使用自定义短码创建' : '短链接已由 LinkForty 自动生成');
    }
    closeDialogs();
    await loadData();
  } catch (error) {
    notice(error.message, true);
  } finally {
    button.disabled = false;
  }
};

document.addEventListener('click', async event => {
  const edit = event.target.closest('[data-edit-link]');
  if (edit) {
    const link = links.find(item => item.id === edit.dataset.editLink);
    editingLinkId = link.id;
    linkType = link.linkType;
    syncTypeButtons();
    $('#linkDialogTitle').textContent = '修改短链接跳转';
    $('#linkDialogTip').textContent = '短码不会改变，只更新该记录当前指向的目标地址';
    $('#saveLinkBtn').textContent = '保存修改';
    $('#customCodeField').hidden = true;
    $('#shortUrlField').hidden = false;
    $('#shortUrl').value = publicUrl(joinPath(SHORTLINK_BASE, encodeURIComponent(link.short_code)));
    $('#linkName').value = link.title || '';
    $('#linkDescription').value = link.linkDescription || '';
    $('#targetUrl').value = link.original_url;
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

loadData().catch(error => notice(`数据加载失败：${error.message}`, true));
