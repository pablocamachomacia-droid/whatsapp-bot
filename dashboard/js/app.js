(() => {
  const STORAGE_KEY = 'wa_dashboard_session';
  const REFRESH_INTERVAL_MS = 30000;

  const STATUS_LABELS = {
    new: 'Nuevo',
    contacted: 'Contactado',
    confirmed: 'Confirmado',
    cancelled: 'Cancelado',
  };

  // --- Referencias DOM (el script se carga al final del body, ya existen) ---
  const loginView = document.getElementById('login-view');
  const loginForm = document.getElementById('login-form');
  const businessIdInput = document.getElementById('business-id-input');
  const apiKeyInput = document.getElementById('api-key-input');
  const loginSubmitBtn = document.getElementById('login-submit');
  const loginError = document.getElementById('login-error');

  const dashboardView = document.getElementById('dashboard-view');
  const businessNameEl = document.getElementById('business-name');
  const botStatusEl = document.getElementById('bot-status');
  const botStatusTextEl = document.getElementById('bot-status-text');
  const foxSleepingEl = document.getElementById('fox-sleeping');
  const todayMessagesEl = document.getElementById('today-messages');
  const logoutBtn = document.getElementById('logout-btn');

  const metricTotalLeadsEl = document.getElementById('metric-total-leads');
  const metricConfirmedEl = document.getElementById('metric-confirmed');
  const foxConfirmedEl = document.getElementById('fox-confirmed');
  const metricPendingEl = document.getElementById('metric-pending');
  const metricConversionEl = document.getElementById('metric-conversion');

  const searchInput = document.getElementById('search-input');
  const statusFiltersEl = document.getElementById('status-filters');
  const leadsTbody = document.getElementById('leads-tbody');
  const sortableHeaders = document.querySelectorAll('#leads-table thead th[data-sort]');

  // --- Estado en memoria ---
  let session = null; // { businessId, apiKey }
  let refreshTimer = null;
  let currentLeads = [];
  let currentFilter = 'all';
  let currentSearch = '';
  let sortState = { column: 'preferredDate', direction: 'desc' };

  // --- Sesion (localStorage) ---
  function loadSession() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed.businessId || !parsed.apiKey) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  function saveSession(value) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  }

  function clearSession() {
    localStorage.removeItem(STORAGE_KEY);
  }

  // --- Vistas ---
  function showLogin(message) {
    dashboardView.hidden = true;
    loginView.hidden = false;
    if (message) {
      loginError.textContent = message;
      loginError.hidden = false;
    }
  }

  function showDashboard() {
    loginView.hidden = true;
    dashboardView.hidden = false;
  }

  // --- Llamadas a la API ---
  async function fetchDashboardData(businessId, apiKey) {
    const response = await fetch(`/api/dashboard/${encodeURIComponent(businessId)}`, {
      headers: { 'x-api-key': apiKey },
    });

    if (!response.ok) {
      throw new Error(response.status === 401 ? 'unauthorized' : 'request-failed');
    }

    return response.json();
  }

  async function updateLeadStatus(id, status) {
    const response = await fetch(`/leads/${encodeURIComponent(id)}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': session.apiKey },
      body: JSON.stringify({ status }),
    });

    if (!response.ok) {
      throw new Error('update-failed');
    }
  }

  // --- Ciclo de login / logout / auto-refresco ---
  async function handleLoginSubmit(event) {
    event.preventDefault();

    const businessId = businessIdInput.value.trim();
    const apiKey = apiKeyInput.value.trim();

    loginError.hidden = true;
    loginSubmitBtn.disabled = true;
    loginSubmitBtn.textContent = 'Entrando…';

    try {
      const data = await fetchDashboardData(businessId, apiKey);
      session = { businessId, apiKey };
      saveSession(session);
      renderData(data);
      showDashboard();
      startAutoRefresh();
    } catch (error) {
      loginError.textContent =
        error.message === 'unauthorized'
          ? 'Clave interna incorrecta.'
          : 'No se pudo conectar. Comprueba el ID del negocio.';
      loginError.hidden = false;
    } finally {
      loginSubmitBtn.disabled = false;
      loginSubmitBtn.textContent = 'Entrar';
    }
  }

  function handleLogout(message) {
    stopAutoRefresh();
    clearSession();
    session = null;
    loginForm.reset();
    showLogin(message);
  }

  async function refreshData() {
    if (!session) return;

    try {
      const data = await fetchDashboardData(session.businessId, session.apiKey);
      renderData(data);
    } catch (error) {
      if (error.message === 'unauthorized') {
        handleLogout('Tu sesión ha caducado. Vuelve a iniciar sesión.');
      }
      // otros errores de red: se reintenta en el proximo ciclo, sin interrumpir la vista
    }
  }

  function startAutoRefresh() {
    stopAutoRefresh();
    refreshTimer = setInterval(refreshData, REFRESH_INTERVAL_MS);
  }

  function stopAutoRefresh() {
    if (refreshTimer) {
      clearInterval(refreshTimer);
      refreshTimer = null;
    }
  }

  // --- Render ---
  function renderData(data) {
    businessNameEl.textContent = data.business.name;

    botStatusTextEl.textContent = data.business.isOpen ? 'Bot activo' : 'Fuera de horario';
    botStatusEl.classList.remove('status-unknown');
    botStatusEl.classList.toggle('status-open', data.business.isOpen);
    botStatusEl.classList.toggle('status-closed', !data.business.isOpen);
    foxSleepingEl.hidden = data.business.isOpen;

    todayMessagesEl.textContent = `Mensajes hoy: ${data.stats.todayMessages}`;

    metricTotalLeadsEl.textContent = data.stats.totalLeads;
    metricConfirmedEl.textContent = data.stats.confirmed;
    metricPendingEl.textContent = data.stats.pending;
    metricConversionEl.textContent = `${data.stats.conversionRate}%`;
    foxConfirmedEl.hidden = !(data.stats.confirmed > 0);

    currentLeads = data.leads || [];
    renderLeadsTable();
  }

  function getFilteredSortedLeads() {
    let leads = currentLeads;

    if (currentFilter !== 'all') {
      leads = leads.filter((lead) => lead.status === currentFilter);
    }

    if (currentSearch) {
      const query = currentSearch.toLowerCase();
      leads = leads.filter(
        (lead) => (lead.name || '').toLowerCase().includes(query) || (lead.phone || '').includes(query)
      );
    }

    const { column, direction } = sortState;
    return [...leads].sort((a, b) => {
      const valueA = (a[column] ?? '').toString().toLowerCase();
      const valueB = (b[column] ?? '').toString().toLowerCase();
      if (valueA < valueB) return direction === 'asc' ? -1 : 1;
      if (valueA > valueB) return direction === 'asc' ? 1 : -1;
      return 0;
    });
  }

  function makeCell(text) {
    const td = document.createElement('td');
    td.textContent = text;
    return td;
  }

  function buildStatusSelect(lead) {
    const select = document.createElement('select');
    select.className = `lead-status-select status-${lead.status}`;

    for (const value of Object.keys(STATUS_LABELS)) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = STATUS_LABELS[value];
      option.selected = value === lead.status;
      select.appendChild(option);
    }

    select.addEventListener('change', async () => {
      const newStatus = select.value;
      const previousStatus = lead.status;
      select.disabled = true;

      try {
        await updateLeadStatus(lead.id, newStatus);
        lead.status = newStatus;
        select.className = `lead-status-select status-${newStatus}`;
      } catch {
        select.value = previousStatus;
        window.alert('No se pudo actualizar el estado. Inténtalo de nuevo.');
      } finally {
        select.disabled = false;
      }
    });

    return select;
  }

  function renderLeadsTable() {
    const leads = getFilteredSortedLeads();
    leadsTbody.innerHTML = '';

    if (leads.length === 0) {
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      cell.colSpan = 6;
      cell.className = 'empty-row';

      if (currentLeads.length === 0) {
        cell.classList.add('empty-row-fox');

        const fox = document.createElement('img');
        fox.className = 'empty-fox';
        fox.src = 'img/fox-waiting.png';
        fox.alt = 'Zorro esperando el primer lead';
        fox.width = 80;
        fox.height = 80;
        fox.onerror = () => {
          fox.onerror = null;
          fox.src = 'img/fox-waiting.svg';
        };

        const text = document.createElement('p');
        text.className = 'empty-fox-text';
        text.textContent = 'El zorro está esperando el primer lead...';

        cell.appendChild(fox);
        cell.appendChild(text);
      } else {
        cell.textContent = 'No hay leads que coincidan con este filtro.';
      }

      row.appendChild(cell);
      leadsTbody.appendChild(row);
      updateSortArrows();
      return;
    }

    for (const lead of leads) {
      const row = document.createElement('tr');
      row.appendChild(makeCell(lead.name || '—'));
      row.appendChild(makeCell(lead.phone || '—'));
      row.appendChild(makeCell(lead.service || '—'));
      row.appendChild(makeCell(lead.preferredDate || '—'));
      row.appendChild(makeCell(lead.preferredTime || '—'));

      const statusCell = document.createElement('td');
      statusCell.appendChild(buildStatusSelect(lead));
      row.appendChild(statusCell);

      leadsTbody.appendChild(row);
    }

    updateSortArrows();
  }

  function updateSortArrows() {
    sortableHeaders.forEach((th) => {
      const arrow = th.querySelector('.sort-arrow');
      if (th.dataset.sort === sortState.column) {
        arrow.textContent = sortState.direction === 'asc' ? '▲' : '▼';
      } else {
        arrow.textContent = '';
      }
    });
  }

  // --- Listeners ---
  loginForm.addEventListener('submit', handleLoginSubmit);
  logoutBtn.addEventListener('click', () => handleLogout());

  searchInput.addEventListener('input', (event) => {
    currentSearch = event.target.value.trim();
    renderLeadsTable();
  });

  statusFiltersEl.querySelectorAll('.filter-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      statusFiltersEl.querySelectorAll('.filter-chip').forEach((c) => c.classList.remove('is-active'));
      chip.classList.add('is-active');
      currentFilter = chip.dataset.status;
      renderLeadsTable();
    });
  });

  sortableHeaders.forEach((th) => {
    th.addEventListener('click', () => {
      const column = th.dataset.sort;
      if (sortState.column === column) {
        sortState.direction = sortState.direction === 'asc' ? 'desc' : 'asc';
      } else {
        sortState = { column, direction: 'asc' };
      }
      renderLeadsTable();
    });
  });

  // --- Arranque ---
  const storedSession = loadSession();
  if (storedSession) {
    session = storedSession;
    showDashboard();
    refreshData();
    startAutoRefresh();
  } else {
    showLogin();
  }
})();
