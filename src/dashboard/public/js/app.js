(() => {
  const retryLink = document.querySelector('[data-discord-retry-at]');
  if (retryLink) {
    const retryAt = Number(retryLink.dataset.discordRetryAt);
    const updateRetry = () => {
      const seconds = Math.max(0, Math.ceil((retryAt - Date.now()) / 1000));
      retryLink.setAttribute('aria-disabled', String(seconds > 0));
      retryLink.textContent = seconds ? `Thử lại sau ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}` : 'Tải lại danh sách →';
      if (seconds) setTimeout(updateRetry, 1000);
    };
    retryLink.addEventListener('click', event => { if (Date.now() < retryAt) event.preventDefault(); });
    updateRetry();
  }
  const root = document.querySelector('[data-settings-guild]');
  if (!root) return;
  const form = document.querySelector('#settings-form');
  const endpoint = `/api/guilds/${root.dataset.settingsGuild}`;
  const csrf = document.querySelector('meta[name=csrf-token]').content;
  const toast = document.querySelector('#toast');
  const status = document.querySelector('#save-status');
  const saveBar = document.querySelector('#settings-save-bar');
  const saveButton = document.querySelector('#save-settings');
  const discardButton = document.querySelector('#discard-settings');
  let current, roles = [], gameRoleOptions = [], timer, dirty = false, saving = false, savedSnapshot = '', saveError = '';
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
  function formSnapshot() {
    return JSON.stringify({
      fields: [...form.elements].filter(input => input.name).map(input => [input.name,
        input.type === 'checkbox' ? input.checked : input.multiple ? [...input.selectedOptions].map(item => item.value) : input.value]),
      rewards: [...form.querySelectorAll('.role-row')].map(row => [row.querySelector('[data-reward-level]').value, row.querySelector('[data-reward-role]').value]),
      games: [...form.querySelectorAll('.game-role-row')].map(row => [row.querySelector('[data-game-label]').value, row.querySelector('[data-game-role]').value]),
    });
  }
  function renderSaveState() {
    saveBar.hidden = !dirty && !saving;
    document.body.classList.toggle('has-unsaved-settings', !saveBar.hidden);
    saveBar.setAttribute('aria-busy', String(saving));
    status.textContent = saving ? 'Đang lưu thay đổi…' : saveError || (dirty ? 'Bạn có thay đổi chưa lưu.' : 'Tất cả thay đổi đã được lưu.');
    saveButton.disabled = saving || !dirty;
    discardButton.disabled = saving;
  }
  function markDirty() {
    dirty = formSnapshot() !== savedSnapshot;
    saveError = '';
    renderSaveState();
  }
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
    settings.gameRoles ||= { enabled: false, mode: 'multiple', roles: [] };
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
    document.querySelector('#game-roles').replaceChildren();
    settings.gameRoles.roles.forEach(gameRoleRow);
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
    savedSnapshot = formSnapshot(); dirty = false; saveError = '';
    renderSaveState();
    updatePreview();
  }
  let leaderboardPage = 1, leaderboardTotalPages = 1, leaderboardLoading = false;
  const leaderboardPeriod = document.querySelector('#leaderboard-period');
  const leaderboardSeason = document.querySelector('#leaderboard-season');
  const pagination = document.querySelector('#leaderboard-pagination');
  const previousPage = document.querySelector('#leaderboard-prev');
  const nextPage = document.querySelector('#leaderboard-next');
  const refreshLeaderboard = document.querySelector('#refresh-leaderboard');
  function updatePageButtons() {
    previousPage.disabled = leaderboardLoading || leaderboardPage <= 1;
    nextPage.disabled = leaderboardLoading || leaderboardPage >= leaderboardTotalPages;
    refreshLeaderboard.disabled = leaderboardLoading;
    leaderboardPeriod.disabled = leaderboardLoading;
    leaderboardSeason.disabled = leaderboardLoading;
    for (const button of document.querySelectorAll('#leaderboard-pages button')) button.disabled = leaderboardLoading;
  }
  function renderPageNumbers() {
    const list = document.querySelector('#leaderboard-pages');
    const restoreFocus = list.contains(document.activeElement); list.replaceChildren();
    const pages = leaderboardTotalPages <= 5
      ? Array.from({ length: leaderboardTotalPages }, (_, index) => index + 1)
      : [...new Set([1, leaderboardPage - 1, leaderboardPage, leaderboardPage + 1, leaderboardTotalPages])]
        .filter(page => page >= 1 && page <= leaderboardTotalPages).sort((a, b) => a - b);
    let previous = 0;
    for (const page of pages) {
      if (previous && page - previous > 1) {
        const gap = document.createElement('span'); gap.className = 'pagination-gap'; gap.textContent = '…'; gap.setAttribute('aria-hidden', 'true'); list.append(gap);
      }
      const button = document.createElement('button'); button.type = 'button'; button.className = 'button secondary page-number';
      button.textContent = page; button.setAttribute('aria-label', `Trang ${page}`);
      if (page === leaderboardPage) button.setAttribute('aria-current', 'page');
      button.addEventListener('click', () => { if (page !== leaderboardPage) void leaderboard(page); }); list.append(button); previous = page;
    }
    if (restoreFocus) list.querySelector('[aria-current="page"]')?.focus({ preventScroll: true });
  }
  async function leaderboard(requestedPage = leaderboardPage) {
    if (leaderboardLoading) return;
    leaderboardLoading = true; updatePageButtons();
    const container = document.querySelector('#leaderboard');
    if (!container.querySelector('table')) container.textContent = 'Đang tải…';
    container.setAttribute('aria-busy', 'true');
    try {
      const period = leaderboardPeriod.value;
      const query = new URLSearchParams({ page: requestedPage, period });
      if (leaderboardSeason.value && period !== 'all') query.set('season', leaderboardSeason.value);
      const { entries, memberCount, page, pageSize, totalPages, season } = await request(`/leaderboard?${query}`);
      leaderboardPage = page; leaderboardTotalPages = totalPages;
      container.replaceChildren();
      if (!entries.length) { pagination.hidden = true; container.textContent = 'Chưa có dữ liệu hoạt động. Cùng bắt đầu trò chuyện nhé!'; return; }
      const table = document.createElement('table');
      const head = document.createElement('thead'); const header = document.createElement('tr');
      for (const label of period === 'all' ? ['Hạng', 'Thành viên', 'Level', 'XP'] : ['Hạng', 'Thành viên', 'XP mùa']) { const th = document.createElement('th'); th.textContent = label; header.append(th); }
      head.append(header); const body = document.createElement('tbody');
      for (const entry of entries) {
        const row = document.createElement('tr');
        const values = period === 'all' ? [`#${entry.rank}`, entry.username, entry.level, entry.xp.toLocaleString('vi-VN')]
          : [`#${entry.rank}`, entry.username, entry.xp.toLocaleString('vi-VN')];
        for (const [index, value] of values.entries()) {
          const cell = document.createElement('td'); cell.textContent = value;
          if (index === 1 && entry.roleName) { const role = document.createElement('small'); role.className = 'leaderboard-role'; role.textContent = entry.roleName; cell.append(role); }
          row.append(cell);
        }
        body.append(row);
      }
      const summary = document.createElement('p'); summary.className = 'field-help';
      summary.textContent = period === 'all' ? 'Xếp theo vai trò từ cao xuống thấp, sau đó theo XP trong cùng bậc'
        : `Mùa ${season.date} · ${season.closedAt ? 'Đã chốt' : 'Đang ghi nhận / chờ chốt'} · Giờ Việt Nam. Chỉ tính XP kiếm được trong kỳ; XP tổng giữ nguyên.`;
      table.append(head, body); container.append(summary, table);
      document.querySelector('#leaderboard-range').textContent = `${(page - 1) * pageSize + 1}–${(page - 1) * pageSize + entries.length} / ${memberCount} thành viên`;
      document.querySelector('#leaderboard-page').textContent = `Trang ${page} / ${totalPages}`;
      renderPageNumbers();
      pagination.hidden = false;
    } catch (error) {
      if (container.querySelector('table')) notify(error.message, true);
      else { pagination.hidden = true; container.textContent = error.message; }
    }
    finally { leaderboardLoading = false; container.setAttribute('aria-busy', 'false'); updatePageButtons(); }
  }
  const tabs = [...document.querySelectorAll('[data-tab]')];
  function selectTab(tab) {
    for (const button of tabs) { const selected = button === tab; button.setAttribute('aria-selected', String(selected)); button.tabIndex = selected ? 0 : -1; }
    for (const panel of document.querySelectorAll('.tab-panel')) panel.hidden = panel.id !== `panel-${tab.dataset.tab}`;
    if (tab.dataset.tab === 'leaderboard') void leaderboard();
    if (tab.dataset.tab === 'achievements') void achievements();
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
  const configChanged = event => {
    if (!event.target.name && !event.target.closest('.role-row, .game-role-row')) return;
    markDirty(); updatePreview();
  };
  form.addEventListener('input', configChanged);
  form.addEventListener('change', configChanged);
  document.querySelector('#add-role').addEventListener('click', () => { roleRow(); markDirty(); });
  function gameRoleRow(game = { roleId: '', label: '' }) {
    const row = document.createElement('div'); row.className = 'game-role-row';
    const nameLabel = document.createElement('label'); nameLabel.textContent = 'Tên game';
    const name = document.createElement('input'); name.dataset.gameLabel = ''; name.maxLength = 80; name.required = true; name.value = game.label; name.placeholder = 'Ví dụ: Genshin Impact'; nameLabel.append(name);
    const roleLabel = document.createElement('label'); roleLabel.textContent = 'Vai trò tương ứng';
    const select = document.createElement('select'); select.dataset.gameRole = ''; select.required = true; select.append(option('', 'Chọn role game'));
    for (const role of gameRoleOptions) select.append(option(role.id, role.name));
    if (game.roleId && !gameRoleOptions.some(role => role.id === game.roleId)) select.append(option(game.roleId, `${game.label} (kiểm tra lại quyền role)`));
    select.value = game.roleId; roleLabel.append(select);
    const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'remove-role'; remove.textContent = 'Xóa'; remove.setAttribute('aria-label', 'Xóa game');
    remove.addEventListener('click', () => { row.remove(); markDirty(); });
    row.append(nameLabel, roleLabel, remove); document.querySelector('#game-roles').append(row);
  }
  document.querySelector('#add-game-role').addEventListener('click', () => {
    if (document.querySelectorAll('.game-role-row').length >= 25) return notify('Tối đa 25 game trong một bảng chọn.', true);
    gameRoleRow(); markDirty();
  });
  async function achievements() {
    const container = document.querySelector('#achievement-catalog'); container.textContent = 'Đang tải huy hiệu…';
    try {
      const result = await request('/achievements'); container.replaceChildren();
      for (const badge of result.achievements) {
        const article = document.createElement('article');
        const title = document.createElement('h3'); title.textContent = `${badge.icon} ${badge.name}`;
        const description = document.createElement('p'); description.textContent = badge.description;
        const count = document.createElement('small'); count.className = 'muted'; count.textContent = `${badge.count.toLocaleString('vi-VN')} thành viên đã mở huy hiệu`;
        article.append(title, description, count); container.append(article);
      }
    } catch (error) { container.textContent = error.message; }
  }
  leaderboardPeriod.addEventListener('change', async () => {
    leaderboardSeason.replaceChildren(option('', 'Mùa hiện tại'));
    document.querySelector('#leaderboard-season-label').hidden = leaderboardPeriod.value === 'all';
    if (leaderboardPeriod.value !== 'all') {
      leaderboardLoading = true; updatePageButtons();
      try {
        const { seasons } = await request(`/seasons?period=${leaderboardPeriod.value}`);
        for (const season of seasons) leaderboardSeason.append(option(season.key.slice(season.period.length + 1), `${season.key.slice(season.period.length + 1)} · Đã chốt`));
      } catch (error) { notify(error.message, true); }
      finally { leaderboardLoading = false; updatePageButtons(); }
    }
    void leaderboard(1);
  });
  leaderboardSeason.addEventListener('change', () => leaderboard(1));
  document.querySelector('#publish-game-panel').addEventListener('click', async () => {
    if (dirty) return notify('Lưu thay đổi trước khi đăng bảng chọn game.', true);
    const channelId = document.querySelector('#game-panel-channel').value;
    if (!channelId) return notify('Chọn kênh đăng bảng chọn.', true);
    const button = document.querySelector('#publish-game-panel'); button.disabled = true;
    const result = document.querySelector('#game-panel-status'); result.textContent = 'Đang đăng bảng chọn…';
    try {
      const { url } = await request('/game-roles/panel', { method: 'POST', body: JSON.stringify({ channelId }) });
      const link = document.createElement('a'); link.href = url; link.textContent = 'Mở bảng chọn trong Discord ↗'; link.target = '_blank'; link.rel = 'noopener noreferrer'; result.replaceChildren(link);
    } catch (error) { result.textContent = error.message; }
    finally { button.disabled = false; }
  });
  for (const button of document.querySelectorAll('[data-insert-token]')) {
    button.addEventListener('click', () => {
      const message = field(button.dataset.messageTarget);
      message.setRangeText(`{${button.dataset.insertToken}}`, message.selectionStart, message.selectionEnd, 'end');
      message.focus(); markDirty(); updatePreview();
    });
  }
  refreshLeaderboard.addEventListener('click', () => leaderboard());
  previousPage.addEventListener('click', () => leaderboard(leaderboardPage - 1));
  nextPage.addEventListener('click', () => leaderboard(leaderboardPage + 1));
  discardButton.addEventListener('click', () => {
    if (saving) return;
    populate(structuredClone(current));
    notify('Đã hoàn tác các thay đổi chưa lưu.');
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (saving || !dirty) return;
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
    settings.gameRoles.roles = [...document.querySelectorAll('.game-role-row')].map(row => ({
      label: row.querySelector('[data-game-label]').value, roleId: row.querySelector('[data-game-role]').value,
    }));
    const submittedSnapshot = formSnapshot();
    saving = true; saveError = ''; renderSaveState();
    try {
      const saved = (await request('/settings', { method: 'POST', body: JSON.stringify({ settings, revision: current.revision }) })).settings;
      if (formSnapshot() === submittedSnapshot) populate(saved);
      else { current = saved; savedSnapshot = submittedSnapshot; markDirty(); }
      notify('Đã lưu cấu hình server.');
    }
    catch (error) { saveError = 'Chưa lưu được. Thay đổi của bạn vẫn được giữ.'; notify(error.message, true); }
    finally { saving = false; renderSaveState(); }
  });
  document.querySelector('#reset-settings').addEventListener('click', async () => {
    if (!confirm('Đặt lại toàn bộ cấu hình server? XP và role đã cấp vẫn được giữ.')) return;
    const button = document.querySelector('#reset-settings'); button.disabled = true;
    try { populate((await request('/reset', { method: 'POST', body: JSON.stringify({ confirm: true, revision: current.revision }) })).settings); notify('Đã khôi phục cấu hình mặc định.'); }
    catch (error) { notify(error.message, true); }
    finally { button.disabled = false; }
  });
  window.addEventListener('beforeunload', event => { if (dirty) { event.preventDefault(); event.returnValue = ''; } });
  request('/settings').then(({ settings, channels, roles: availableRoles, excludedRoleOptions, gameRoleOptions: availableGames }) => {
    roles = availableRoles;
    gameRoleOptions = availableGames || [];
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
