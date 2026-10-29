(() => {
  const root = document.querySelector('[data-settings-guild]');
  if (!root) return;
  const form = document.querySelector('#settings-form');
  const endpoint = `/api/guilds/${root.dataset.settingsGuild}`;
  const csrf = document.querySelector('meta[name=csrf-token]').content;
  const toast = document.querySelector('#toast');
  const status = document.querySelector('#save-status');
  let current, roles = [], timer, dirty = false;
  const field = name => form.elements.namedItem(name);
  function notify(message, error = false) {
    toast.textContent = message; toast.classList.toggle('error', error); toast.hidden = false;
    clearTimeout(timer); timer = setTimeout(() => { toast.hidden = true; }, 6000);
  }
  async function request(path, options = {}) {
    const response = await fetch(endpoint + path, {
      ...options, headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrf },
    });
    if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('Phiên đã hết hạn. Hãy đăng nhập lại.');
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || 'Không thể xử lý yêu cầu.');
    return body;
  }
  function option(value, text) { const item = document.createElement('option'); item.value = value; item.textContent = text; return item; }
  function getPath(object, path) { return path.split('.').reduce((value, key) => value?.[key], object); }
  function setPath(object, path, value) {
    const parts = path.split('.'); const key = parts.pop();
    parts.reduce((target, part) => target[part], object)[key] = value;
  }
  function markDirty() { dirty = true; status.textContent = 'Có thay đổi chưa lưu.'; }
  function renderPreviewText(element, text) {
    element.replaceChildren(...text.split(/(\*\*[\s\S]+?\*\*)/g).filter(Boolean).map(part => {
      if (!part.startsWith('**') || !part.endsWith('**')) return document.createTextNode(part);
      const strong = document.createElement('strong'); strong.textContent = part.slice(2, -2); return strong;
    }));
  }
  function updatePreview() {
    for (const key of ['welcome', 'goodbye']) {
      const variables = { user: '@Bạn mới', username: 'Bạn mới', server: document.querySelector('h1').textContent.replace(/\.$/, ''), memberCount: '128' };
      const preview = document.querySelector(`[data-preview=${key}]`);
      renderPreviewText(preview, field(`${key}.message`).value.replace(/\{(user|username|server|memberCount)\}/g, (_, token) => variables[token]));
      document.querySelector(`[data-preview-format=${key}]`).textContent = field(`${key}.useEmbed`).checked ? 'Khung nổi bật' : 'Tin nhắn thường';
    }
  }
  function roleRow(reward = { level: 0, roleId: '' }) {
    const row = document.createElement('div'); row.className = 'role-row';
    const levelLabel = document.createElement('label'); levelLabel.textContent = 'Cấp độ cần đạt';
    const level = document.createElement('input'); level.type = 'number'; level.min = 0; level.max = 100000; level.required = true; level.value = reward.level; level.dataset.rewardLevel = '';
    levelLabel.append(level);
    const roleLabel = document.createElement('label'); roleLabel.textContent = 'Vai trò nhận được';
    const select = document.createElement('select'); select.required = true; select.dataset.rewardRole = ''; select.append(option('', 'Chọn vai trò'));
    for (const role of roles) select.append(option(role.id, role.name));
    if (reward.roleId && !roles.some(role => role.id === reward.roleId)) select.append(option(reward.roleId, `${reward.roleName || reward.roleId} (không còn khả dụng)`));
    select.value = reward.roleId; roleLabel.append(select);
    const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = 'Xóa'; remove.className = 'remove-role'; remove.setAttribute('aria-label', 'Xóa phần thưởng');
    remove.addEventListener('click', () => { row.remove(); markDirty(); });
    row.append(levelLabel, roleLabel, remove); document.querySelector('#role-rewards').append(row);
  }
  function populate(settings) {
    current = settings;
    for (const input of form.elements) {
      if (!input.name) continue;
      const value = getPath(settings, input.name);
      if (input.type === 'checkbox') input.checked = Boolean(value);
      else if (input.multiple) {
        for (const item of input.options) item.selected = (value || []).includes(item.value);
      } else input.value = value ?? '';
    }
    document.querySelector('#role-rewards').replaceChildren();
    settings.roleRewards.forEach(roleRow);
    for (const list of document.querySelectorAll('[data-choice-list]')) {
      const select = field(list.dataset.choiceList); list.replaceChildren();
      if (!select.options.length) list.textContent = 'Chưa có mục nào để chọn.';
      for (const item of select.options) {
        const label = document.createElement('label'); label.className = 'choice-option';
        const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.checked = item.selected;
        checkbox.addEventListener('change', () => { item.selected = checkbox.checked; markDirty(); });
        const text = document.createElement('span'); text.textContent = item.textContent;
        label.append(checkbox, text); list.append(label);
      }
    }
    dirty = false; status.textContent = 'Tất cả thay đổi đã được lưu.';
    updatePreview();
  }
  async function leaderboard() {
    const container = document.querySelector('#leaderboard'); container.textContent = 'Đang tải…';
    try {
      const { entries } = await request('/leaderboard');
      container.replaceChildren();
      if (!entries.length) { container.textContent = 'Chưa có dữ liệu hoạt động. Cùng bắt đầu trò chuyện nhé!'; return; }
      const table = document.createElement('table');
      const head = document.createElement('thead'); const header = document.createElement('tr');
      for (const label of ['Hạng', 'Thành viên', 'Level', 'XP']) { const th = document.createElement('th'); th.textContent = label; header.append(th); }
      head.append(header); const body = document.createElement('tbody');
      for (const entry of entries) {
        const row = document.createElement('tr');
        for (const value of [`#${entry.rank}`, entry.username, entry.level, entry.xp.toLocaleString('vi-VN')]) { const cell = document.createElement('td'); cell.textContent = value; row.append(cell); }
        body.append(row);
      }
      table.append(head, body); container.append(table);
    } catch (error) { container.textContent = error.message; }
  }
  const tabs = [...document.querySelectorAll('[data-tab]')];
  function selectTab(tab) {
    for (const button of tabs) { const selected = button === tab; button.setAttribute('aria-selected', String(selected)); button.tabIndex = selected ? 0 : -1; }
    for (const panel of document.querySelectorAll('.tab-panel')) panel.hidden = panel.id !== `panel-${tab.dataset.tab}`;
    if (tab.dataset.tab === 'leaderboard') void leaderboard();
  }
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => selectTab(tab));
    tab.addEventListener('keydown', event => {
      let target;
      if (['ArrowDown', 'ArrowRight'].includes(event.key)) target = tabs[(index + 1) % tabs.length];
      if (['ArrowUp', 'ArrowLeft'].includes(event.key)) target = tabs[(index + tabs.length - 1) % tabs.length];
      if (event.key === 'Home') target = tabs[0];
      if (event.key === 'End') target = tabs.at(-1);
      if (target) { event.preventDefault(); target.focus(); selectTab(target); }
    });
  });
  form.addEventListener('input', () => { markDirty(); updatePreview(); });
  form.addEventListener('change', () => { markDirty(); updatePreview(); });
  document.querySelector('#add-role').addEventListener('click', () => { roleRow(); markDirty(); });
  for (const button of document.querySelectorAll('[data-insert-token]')) {
    button.addEventListener('click', () => {
      const message = field(button.dataset.messageTarget);
      message.setRangeText(`{${button.dataset.insertToken}}`, message.selectionStart, message.selectionEnd, 'end');
      message.focus(); markDirty(); updatePreview();
    });
  }
  document.querySelector('#refresh-leaderboard').addEventListener('click', leaderboard);
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const invalid = [...form.elements].find(input => input.willValidate && !input.validity.valid);
    if (invalid) {
      const panel = invalid.closest('.tab-panel'); selectTab(tabs.find(tab => `panel-${tab.dataset.tab}` === panel.id));
      invalid.reportValidity(); return;
    }
    const settings = structuredClone(current);
    for (const input of form.elements) {
      if (!input.name) continue;
      const value = input.type === 'checkbox' ? input.checked : input.multiple ? [...input.selectedOptions].map(o => o.value) : input.type === 'number' ? Number(input.value) : input.value || null;
      setPath(settings, input.name, value);
    }
    settings.roleRewards = [...document.querySelectorAll('.role-row')].map(row => ({
      level: Number(row.querySelector('[data-reward-level]').value), roleId: row.querySelector('[data-reward-role]').value,
    }));
    const saveButtons = [...form.querySelectorAll('button[type="submit"]')];
    saveButtons.forEach(button => { button.disabled = true; }); status.textContent = 'Đang lưu cấu hình…';
    try { populate((await request('/settings', { method: 'POST', body: JSON.stringify({ settings, revision: current.revision }) })).settings); notify('Đã lưu cấu hình server.'); }
    catch (error) { status.textContent = 'Chưa lưu được. Các thay đổi vẫn ở trên biểu mẫu.'; notify(error.message, true); }
    finally { saveButtons.forEach(button => { button.disabled = false; }); }
  });
  document.querySelector('#reset-settings').addEventListener('click', async () => {
    if (!confirm('Đặt lại toàn bộ cấu hình server? XP và role đã cấp vẫn được giữ.')) return;
    const button = document.querySelector('#reset-settings'); button.disabled = true;
    try { populate((await request('/reset', { method: 'POST', body: JSON.stringify({ confirm: true, revision: current.revision }) })).settings); notify('Đã khôi phục cấu hình mặc định.'); }
    catch (error) { notify(error.message, true); }
    finally { button.disabled = false; }
  });
  window.addEventListener('beforeunload', event => { if (dirty) { event.preventDefault(); event.returnValue = ''; } });
  request('/settings').then(({ settings, channels, roles: availableRoles, excludedRoleOptions }) => {
    roles = availableRoles;
    for (const select of document.querySelectorAll('[data-channel]')) {
      for (const channel of channels.filter(ch => select.dataset.channel === 'all' || [0, 5].includes(ch.type))) select.append(option(channel.id, `# ${channel.name}`));
      const selected = getPath(settings, select.name);
      if (!select.multiple && selected && ![...select.options].some(o => o.value === selected)) select.append(option(selected, `${selected} (không còn khả dụng)`));
    }
    // Role loại trừ bao gồm cả role không thể gán làm thưởng.
    for (const role of excludedRoleOptions) field('excludedRoles').append(option(role.id, role.name));
    for (const id of settings.excludedRoles) if (![...field('excludedRoles').options].some(o => o.value === id)) field('excludedRoles').append(option(id, id));
    populate(settings);
    document.querySelector('#load-status').hidden = true; document.querySelector('#settings-ui').hidden = false;
  }).catch(error => { const element = document.querySelector('#load-status'); element.textContent = error.message; element.className = 'error-text'; });
})();
