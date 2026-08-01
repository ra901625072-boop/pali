/* ==========================================================================
   CBDC Ration Portal - Core JS Logic
   ========================================================================== */

// --- Backend API Client ---
const ApiClient = {
  BASE: '/api',
  token: null,

  setToken(token) {
    this.token = token;
    try { sessionStorage.setItem('cbdc_jwt', token); } catch (e) {}
  },

  clearToken() {
    this.token = null;
    try { sessionStorage.removeItem('cbdc_jwt'); } catch (e) {}
  },

  restoreToken() {
    try {
      const saved = sessionStorage.getItem('cbdc_jwt');
      if (saved) this.token = saved;
    } catch (e) {}
  },

  latestGetRequestId: {},

  async request(method, path, body) {
    const headers = { 'Content-Type': 'application/json' };
    if (this.token) headers['Authorization'] = `Bearer ${this.token}`;

    const opts = { method, headers };
    if (body && method !== 'GET') opts.body = JSON.stringify(body);

    const isGet = (method === 'GET');
    let currentGetId = 0;
    if (isGet) {
      if (!this.latestGetRequestId) this.latestGetRequestId = {};
      this.latestGetRequestId[path] = (this.latestGetRequestId[path] || 0) + 1;
      currentGetId = this.latestGetRequestId[path];
    }

    const res = await fetch(`${this.BASE}${path}`, opts);
    
    let data = {};
    const text = await res.text();
    if (text) {
      try {
        data = JSON.parse(text);
      } catch (e) {
        data = { error: text };
      }
    } else if (!res.ok) {
      data = { error: `HTTP error ${res.status}` };
    }

    if (!res.ok) {
      const err = new Error(data.error || `API error ${res.status}`);
      err.status = res.status;
      err.data = data;
      throw err;
    }

    if (isGet && currentGetId !== this.latestGetRequestId[path]) {
      const err = new Error("Request superseded");
      err.isSuperseded = true;
      throw err;
    }

    return data;
  },

  login(username, password) {
    return this.request('POST', '/auth/login', { username, password });
  },

  logout() {
    return this.request('POST', '/auth/logout');
  },

  getMe() {
    return this.request('GET', '/auth/me');
  },

  getBeneficiaries(status) {
    const qs = status ? `?status=${status}` : '';
    return this.request('GET', `/beneficiaries${qs}`);
  },

  getBeneficiary(srNo) {
    return this.request('GET', `/beneficiaries/${srNo}`);
  },

  updateOnboarding(srNo, field, status, version, remarks) {
    return this.request('PATCH', `/beneficiaries/${srNo}/onboarding`, {
      field, status, version, remarks: remarks || ''
    });
  },

  getDashboard() {
    return this.request('GET', '/dashboard');
  },

  getAudit(limit) {
    return this.request('GET', `/audit?limit=${limit || 20}`);
  },

  getSyncLatest() {
    return this.request('GET', '/sync/latest');
  }
};

// --- Global State ---
let appData = {
  metadata: {
    district: "મહેસાણા",
    taluka: "ઊંઝા",
    fps_area: "ભરતભાઈ હરગોવનજી બારોટ : 2310 (પળી : 14785 - હંગામી )",
    generated_on: ""
  },
  beneficiaries: [],
  households: []
};

let filterState = {
  query: "",
  selectedCategory: "ALL",
  filteredHouseholds: [],
  displayedCount: 15
};

let adminState = {
  isAuthenticated: false,
  username: "",
  searchQuery: "",
  filterStatus: "ALL",
  activeSubpage: "dashboard",
  sessionId: "",
  onboardingOverrides: {},
  versions: {}
};

let dataFromApi = false;
let autoRefreshInterval = null;
let adminSessionTimer = null;
let lastSyncTimestamp = null;
const _activeSkeletons = new Set();
let _initialDataLoaded = false;

// --- Session Manager (30 mins expiry) ---
function generateSessionToken() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let token = '';
  for (let i = 0; i < 8; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `SES-CBDC-${token}`;
}

function getJwtExpiry(token) {
  try {
    if (!token) return null;
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));
    const payload = JSON.parse(jsonPayload);
    return payload.exp ? payload.exp * 1000 : null;
  } catch (e) {
    return null;
  }
}

function createAdminSession(token, user) {
  const sessionId = generateSessionToken();
  const now = Date.now();
  const jwtExp = getJwtExpiry(token);
  const expiresAt = jwtExp || (now + (30 * 60 * 1000)); // 30 mins fallback

  ApiClient.setToken(token);

  const sessionData = {
    sessionId: sessionId,
    username: user.username || '',
    createdAt: now,
    expiresAt: expiresAt
  };

  try {
    sessionStorage.setItem('cbdc_admin_session', JSON.stringify(sessionData));
  } catch (e) {
    console.error("Error saving admin session:", e);
  }

  adminState.isAuthenticated = true;
  adminState.username = user.username || '';
  adminState.sessionId = sessionId;

  updateSessionBadgeUI();
  scheduleSessionExpiryTimer(expiresAt - now);
  startAutoRefresh();
  return sessionData;
}

async function checkAndRestoreAdminSession() {
  try {
    const raw = sessionStorage.getItem('cbdc_admin_session');
    if (!raw) return false;

    const sessionData = JSON.parse(raw);
    const now = Date.now();

    if (!sessionData || !sessionData.expiresAt || now >= sessionData.expiresAt) {
      destroyAdminSession('expired_on_load');
      return false;
    }

    ApiClient.restoreToken();
    if (!ApiClient.token) {
      destroyAdminSession('expired_on_load');
      return false;
    }

    const jwtExp = getJwtExpiry(ApiClient.token);
    if (!jwtExp || now >= jwtExp) {
      destroyAdminSession('expired_on_load');
      return false;
    }

    try {
      const user = await ApiClient.getMe();
      adminState.isAuthenticated = true;
      adminState.username = user.username || sessionData.username || '';
      adminState.sessionId = sessionData.sessionId;

      sessionData.username = user.username || sessionData.username || '';
      if (jwtExp) sessionData.expiresAt = jwtExp;
      sessionStorage.setItem('cbdc_admin_session', JSON.stringify(sessionData));

      updateSessionBadgeUI();
      scheduleSessionExpiryTimer(sessionData.expiresAt - now);
      startAutoRefresh();
      return true;
    } catch (apiErr) {
      console.warn('Session validation failed, clearing session:', apiErr.message);
      destroyAdminSession('expired_on_load');
      return false;
    }
  } catch (e) {
    console.error("Error restoring admin session:", e);
    destroyAdminSession('error');
    return false;
  }
}

function destroyAdminSession(reason) {
  if (adminSessionTimer) {
    clearTimeout(adminSessionTimer);
    adminSessionTimer = null;
  }
  stopAutoRefresh();

  const oldSession = adminState.sessionId;

  if (reason === 'user_logout' && ApiClient.token) {
    ApiClient.logout().catch(() => {});
  }

  ApiClient.clearToken();

  try {
    sessionStorage.removeItem('cbdc_admin_session');
  } catch (e) {}

  adminState.isAuthenticated = false;
  adminState.username = "";
  adminState.sessionId = "";
  dataFromApi = false;

  const authCard = document.getElementById('admin-auth-card');
  const dashWrapper = document.getElementById('admin-dashboard-wrapper');

  if (authCard) authCard.style.display = 'block';
  if (dashWrapper) dashWrapper.style.display = 'none';

  updateSessionBadgeUI();

  if (reason === 'user_logout') {
    showToast(`🔒 સેશન ${oldSession || ''} રદ થયું અને લોગઆઉટ થયા.`);
  } else if (reason === 'expired' || reason === 'expired_on_load') {
    showToast(`❌ ૩૦ મિનિટ પૂર્ણ થતાં સેશન સમાપ્ત થઈ ગયું છે. ફરી લોગિન કરો.`);
  }
  
  startAutoRefresh(); // Restart guest polling
}

function scheduleSessionExpiryTimer(msRemaining) {
  if (adminSessionTimer) clearTimeout(adminSessionTimer);
  if (msRemaining <= 0) {
    destroyAdminSession('expired');
    return;
  }
  adminSessionTimer = setTimeout(() => {
    destroyAdminSession('expired');
  }, msRemaining);
}

function startAutoRefresh() {
  stopAutoRefresh();
  autoRefreshInterval = setInterval(async () => {
    updateSessionBadgeUI();
    if (document.hidden) return;

    try {
      await loadDataFromAPI();
      groupHouseholds();
      renderStats();
      renderList();
      
      if (adminState.isAuthenticated && ApiClient.token) {
        renderAdminDashboard();
      }
    } catch (e) {
      if (e.isSuperseded) return;
      console.warn('Auto-refresh failed:', e.message);
    }
  }, 5000); // Poll every 5s in background
}

def_stopAutoRefresh = () => {
  if (autoRefreshInterval) {
    clearInterval(autoRefreshInterval);
    autoRefreshInterval = null;
  }
}
const stopAutoRefresh = def_stopAutoRefresh;

function updateSessionBadgeUI() {
  const badge = document.getElementById('admin-session-badge');
  if (!badge) return;

  if (adminState.isAuthenticated && adminState.sessionId) {
    try {
      const raw = sessionStorage.getItem('cbdc_admin_session');
      if (raw) {
        const s = JSON.parse(raw);
        const minsLeft = Math.max(0, Math.ceil((s.expiresAt - Date.now()) / (60 * 1000)));
        badge.textContent = `🔑 ${adminState.sessionId} (${minsLeft}મિ)`;
        return;
      }
    } catch (e) {}
    badge.textContent = `🔑 ${adminState.sessionId}`;
  } else {
    badge.textContent = `🔑 SES-CBDC-INIT`;
  }
}

// --- Manual Sync & Recent Activity Helpers ---
let _isSyncing = false;
async function triggerManualSync() {
  if (_isSyncing) return;
  _isSyncing = true;

  // Add spinning class to sync icons
  document.querySelectorAll('.sync-icon').forEach(icon => {
    icon.classList.add('spinning');
  });

  // Disable buttons
  document.querySelectorAll('.refresh-sync-btn, .btn-refresh').forEach(btn => {
    btn.disabled = true;
  });

  showToast("🔄 ડેટા સિંક થઈ રહ્યો છે...");

  const startTime = Date.now();
  let success = false;

  try {
    success = await loadDataFromAPI();
    await loadData();
    
    if (adminState.isAuthenticated && ApiClient.token) {
      renderAdminDashboard();
    }
  } catch (err) {
    if (err.isSuperseded) return;
    console.warn("Manual sync error:", err);
  }

  const elapsed = Date.now() - startTime;
  const delay = Math.max(0, 600 - elapsed);

  setTimeout(() => {
    _isSyncing = false;
    document.querySelectorAll('.sync-icon').forEach(icon => {
      icon.classList.remove('spinning');
    });
    document.querySelectorAll('.refresh-sync-btn, .btn-refresh').forEach(btn => {
      btn.disabled = false;
    });

    if (success) {
      showToast("🟢 ડેટા સફળતાપૂર્વક અપડેટ થયો!");
    } else {
      showToast("⚠️ ડેટા સિંક નિષ્ફળ ગયો. ઑફલાઇન મોડ ચાલુ છે.");
    }
  }, delay);
}
window.triggerManualSync = triggerManualSync;


// --- Router ---
const tabHashMapping = {
  '#home': 'home-tab',
  '#list': 'list-tab',
  '#process': 'process-tab',
  '#info': 'info-tab',
  '#admin': 'admin-tab'
};

function initRouter() {
  window.addEventListener('hashchange', handleRoute);
  
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
      const tabId = item.getAttribute('data-tab');
      if (tabId) switchTab(tabId);
    });
  });

  const initialHash = window.location.hash;
  if (!initialHash || !tabHashMapping[initialHash]) {
    switchTab('home-tab');
  } else {
    handleRoute();
  }
}

function handleRoute() {
  const hash = window.location.hash;
  const activeTabId = tabHashMapping[hash] || 'home-tab';
  switchTab(activeTabId);
}

function switchTab(tabId) {
  if (!tabId) return;

  document.querySelectorAll('.tab-content').forEach(tab => {
    tab.classList.toggle('active', tab.id === tabId);
  });

  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', item.getAttribute('data-tab') === tabId);
  });

  const targetHash = Object.keys(tabHashMapping).find(key => tabHashMapping[key] === tabId);
  if (targetHash && window.location.hash !== targetHash) {
    if (history.pushState) {
      history.pushState(null, null, targetHash);
    } else {
      window.location.hash = targetHash;
    }
  }

  if (tabId === 'admin-tab' && adminState.isAuthenticated) {
    switchTataliSubpage(adminState.activeSubpage || 'dashboard');
  }

  window.scrollTo({ top: 0, behavior: 'instant' });
}
window.switchTab = switchTab;

function formatDateTime(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${day}/${month}/${year} ${hours}:${minutes}`;
  } catch (e) {
    return dateStr;
  }
}

// --- Data Loading & Merging ---
function loadOnboardingOverrides() {
  try {
    const saved = localStorage.getItem('cbdc_onboarding_overrides');
    if (saved) {
      adminState.onboardingOverrides = JSON.parse(saved);
      appData.beneficiaries.forEach(b => {
        const o = adminState.onboardingOverrides[b.sr_no];
        if (o && typeof o === 'object') {
          if (o.onboarded !== undefined) b.onboarded = o.onboarded;
          if (o.onboarded_date !== undefined) b.onboarded_date = o.onboarded_date;
          if (o.rc_onboarded !== undefined) b.rc_onboarded = o.rc_onboarded;
          if (o.rc_onboarded_date !== undefined) b.rc_onboarded_date = o.rc_onboarded_date;
          if (o.version !== undefined) b.version = o.version;
        } else if (o !== undefined) {
          b.onboarded = o;
        }
      });
    }
  } catch (e) {
    console.error("Error loading onboarding overrides:", e);
  }
}

async function loadDataFromAPI() {
  try {
    const apiData = await ApiClient.getBeneficiaries();
    appData.metadata = apiData.metadata || appData.metadata;
    appData.beneficiaries = apiData.beneficiaries || [];
    apiData.beneficiaries.forEach(b => {
      adminState.versions[b.sr_no] = b.version || 0;
    });
    dataFromApi = true;
    return true;
  } catch (e) {
    if (e.isSuperseded) throw e;
    console.warn('API data fetch failed:', e.message);
    return false;
  }
}

async function loadData() {
  let data = null;

  try {
    const apiLoaded = await loadDataFromAPI();
    if (apiLoaded) {
      data = { metadata: appData.metadata, beneficiaries: appData.beneficiaries };
    }
  } catch (e) {
    if (e.isSuperseded) throw e;
    console.warn("loadDataFromAPI failed:", e);
  }

  if (!data) {
    try {
      const response = await fetch('assets/data/data.json');
      if (response.ok) {
        data = await response.json();
      }
    } catch (e) {
      console.warn("fetch fallback failed:", e);
    }

    if (data) {
      appData.metadata = data.metadata;
      appData.beneficiaries = data.beneficiaries;
      if (!dataFromApi) {
        loadOnboardingOverrides();
      }
    }
  }

  groupHouseholds();

  const lastUpdatedBadge = document.getElementById('last-updated-badge');
  if (lastUpdatedBadge && appData.metadata && appData.metadata.generated_on) {
    lastUpdatedBadge.textContent = `માહિતી અપડેટ: ${appData.metadata.generated_on.split(' ')[0]}`;
  }
  
  filterState.filteredHouseholds = [...appData.households];

  if (!_initialDataLoaded) {
    _initialDataLoaded = true;
    hideHomeStatsSkeletons();
    hideSkeleton('beneficiaries-list', () => {
      renderStats();
      renderList();
    });
  } else {
    renderStats();
    renderList();
  }
}

function groupHouseholds() {
  const householdGroups = {};
  appData.beneficiaries.forEach(beneficiary => {
    const cardNo = beneficiary.ration_card;
    if (!householdGroups[cardNo]) {
      householdGroups[cardNo] = {
        ration_card: cardNo,
        clean_ration_card: beneficiary.clean_ration_card,
        members: []
      };
    }
    householdGroups[cardNo].members.push(beneficiary);
  });
  appData.households = Object.values(householdGroups);
}

// --- Search & Filtering ---
function performSearch(queryText, category) {
  if (queryText !== undefined) filterState.query = queryText.trim().toUpperCase();
  if (category !== undefined) filterState.selectedCategory = category;

  let result = appData.households;

  if (filterState.selectedCategory !== "ALL") {
    result = result.filter(h => {
      const type = h.members[0]?.card_type?.toUpperCase() || '';
      if (filterState.selectedCategory === "ONBOARDED") {
        return h.members.some(m => m.onboarded === "Yes");
      }
      return type === filterState.selectedCategory;
    });
  }

  const clearBtn = document.getElementById('search-clear-btn');
  if (filterState.query !== "") {
    if (clearBtn) clearBtn.style.display = 'block';
    const cleanQuery = filterState.query.replace(/\s+/g, '');
    result = result.filter(household => {
      const cardMatch = household.clean_ration_card.includes(cleanQuery) || household.ration_card.includes(filterState.query);
      const nameMatch = household.members.some(member => 
        member.name.toUpperCase().includes(filterState.query)
      );
      return cardMatch || nameMatch;
    });
  } else {
    if (clearBtn) clearBtn.style.display = 'none';
  }

  filterState.filteredHouseholds = result;
  filterState.displayedCount = 15;
  renderStats();
  renderList();
}

function renderStats() {
  const elResultsCount = document.getElementById('results-count');
  if (elResultsCount) elResultsCount.textContent = `કુલ રેશન કાર્ડ: ${filterState.filteredHouseholds.length}`;
  
  const homeBeneficiaries = document.getElementById('home-stat-beneficiaries');
  const homeHouseholds = document.getElementById('home-stat-households');
  const homeShop = document.getElementById('home-stat-shop');
  const homeDate = document.getElementById('home-stat-date');

  if (homeBeneficiaries && appData.beneficiaries.length > 0) homeBeneficiaries.textContent = appData.beneficiaries.length;
  if (homeHouseholds && appData.households.length > 0) homeHouseholds.textContent = appData.households.length;
  if (homeShop) homeShop.textContent = "ભરતભાઈ બારોટ";
  if (homeDate && appData.metadata && appData.metadata.generated_on) homeDate.textContent = appData.metadata.generated_on.split(' ')[0];
}

function highlightMatch(text, query) {
  if (!query) return text;
  const escapedText = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const escapedQuery = query.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
  const regex = new RegExp(`(${escapedQuery})`, 'gi');
  return escapedText.replace(regex, '<mark class="search-highlight">$1</mark>');
}

// --- Render Loop & UI Updates ---
function renderList() {
  const targetListContainer = document.getElementById('beneficiaries-list');
  const targetLoadMoreContainer = document.getElementById('load-more-container');
  if (!targetListContainer) return;

  targetListContainer.innerHTML = "";
  
  if (filterState.filteredHouseholds.length === 0) {
    targetListContainer.innerHTML = `
      <div class="empty-state">
        <span class="empty-state-icon">🔍</span>
        <h4>કોઈ પરિણામ મળ્યું નથી</h4>
        <p>"${filterState.query}" માટે કોઈ રેશન કાર્ડ મળ્યું નથી.</p>
      </div>
    `;
    if (targetLoadMoreContainer) targetLoadMoreContainer.style.display = 'none';
    return;
  }
  
  const displaySlice = filterState.filteredHouseholds.slice(0, filterState.displayedCount);
  
  displaySlice.forEach(household => {
    const cardEl = document.createElement('div');
    cardEl.className = 'household-card';
    
    const highlightedCard = highlightMatch(household.ration_card, filterState.query);
    
    let membersHtml = "";
    household.members.forEach((member, index) => {
      const highlightedName = highlightMatch(member.name, filterState.query);
      const onboardTag = member.onboarded === "Yes" 
        ? `<span class="onboarded-tag yes">✓ ઓનબોર્ડ</span>` 
        : `<span class="onboarded-tag no">⏳ પેન્ડિંગ</span>`;

      membersHtml += `
        <div class="member-row">
          <div class="member-left">
            <span class="member-bullet">${index + 1}.</span>
            <span class="member-name">${highlightedName}</span>
          </div>
          ${onboardTag}
        </div>
      `;
    });
    
    const cardType = household.members[0]?.card_type || '';
    const typeBadgeHtml = cardType ? `<span class="card-type-badge">${cardType}</span>` : '';
    
    cardEl.innerHTML = `
      <div class="household-header">
        <div class="card-num-label">
          🪪 રેશન કાર્ડ:
          <span class="card-num-val">${highlightedCard}</span>
        </div>
        <div class="header-badges">
          <span class="member-count-badge">👥 ${household.members.length}</span>
          ${typeBadgeHtml}
          <span class="status-badge">✓ પાત્ર</span>
        </div>
      </div>
      <div class="household-body">
        <div class="member-list-title">👥 સભ્યો</div>
        ${membersHtml}
      </div>
      <div class="card-footer-info">
        <span>🏪 ભરતભાઈ બારોટ (૨૩૧૦)</span>
        <span>📍 પળી (૧૪૭૮૫)</span>
      </div>
    `;
    targetListContainer.appendChild(cardEl);
  });
  
  if (targetLoadMoreContainer) {
    targetLoadMoreContainer.style.display = filterState.filteredHouseholds.length > filterState.displayedCount ? 'flex' : 'none';
  }
}

function initSearchListeners() {
  const elSearchInput = document.getElementById('beneficiary-search');
  const elClearBtn = document.getElementById('search-clear-btn');
  const elLoadMoreBtn = document.getElementById('load-more-btn');
  const elFilterPillsContainer = document.getElementById('filter-pills-container');

  if (elSearchInput) elSearchInput.addEventListener('input', (e) => { performSearch(e.target.value); });
  if (elClearBtn) elClearBtn.addEventListener('click', () => { 
    if (elSearchInput) elSearchInput.value = ""; 
    performSearch(""); 
  });
  if (elLoadMoreBtn) elLoadMoreBtn.addEventListener('click', () => { filterState.displayedCount += 15; renderList(); });

  if (elFilterPillsContainer) {
    elFilterPillsContainer.addEventListener('click', (e) => {
      const pill = e.target.closest('.filter-pill');
      if (!pill) return;
      document.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      performSearch(undefined, pill.getAttribute('data-filter'));
    });
  }
}

// --- Admin Section ---
function initAdminAuth() {
  const userInput = document.getElementById('admin-username-input');
  const passInput = document.getElementById('admin-password-input');
  const loginBtn = document.getElementById('admin-login-btn');
  const pinError = document.getElementById('admin-pin-error');
  const authCard = document.getElementById('admin-auth-card');
  const dashWrapper = document.getElementById('admin-dashboard-wrapper');
  const logoutBtn = document.getElementById('admin-logout-btn');
  const exportBtn = document.getElementById('admin-export-json-btn');

  const attemptLogin = async () => {
    const u = userInput ? userInput.value.trim() : '';
    const p = passInput ? passInput.value : '';

    if (!u || !p) {
      if (pinError) pinError.style.display = 'block';
      return;
    }

    if (loginBtn) { loginBtn.disabled = true; loginBtn.textContent = '⏳ લોડ થઈ રહ્યું...'; }
    if (pinError) pinError.style.display = 'none';

    try {
      const result = await ApiClient.login(u, p);
      const sess = createAdminSession(result.token, result.user);

      if (authCard) authCard.style.display = 'none';
      if (dashWrapper) dashWrapper.style.display = 'block';
      if (userInput) userInput.value = '';
      if (passInput) passInput.value = '';

      showToast(`🔓 સ્વાગત છે ${result.user.username}! લૉગિન સફળ થયું. (${sess.sessionId})`);
      showAdminSkeletons();
      await loadData();
      switchTataliSubpage(adminState.activeSubpage || 'dashboard');
    } catch (err) {
      console.error('Login failed:', err.message);
      if (pinError) {
        pinError.style.display = 'block';
        pinError.textContent = err.status === 401 ? '❌ ખોટો આઈડી/પાસવર્ડ' : '⚠️ સર્વર સમસ્યા. ફરી પ્રયત્ન કરો.';
      }
    } finally {
      if (loginBtn) { loginBtn.disabled = false; loginBtn.textContent = '➜ પ્રવેશ કરો'; }
    }
  };

  if (loginBtn) loginBtn.addEventListener('click', attemptLogin);
  if (userInput) userInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') attemptLogin(); });
  if (passInput) passInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') attemptLogin(); });

  if (logoutBtn) logoutBtn.addEventListener('click', () => { destroyAdminSession('user_logout'); });
  if (exportBtn) exportBtn.addEventListener('click', openExportModal);

  const subnavBar = document.getElementById('tatali-subnav-bar');
  if (subnavBar) {
    subnavBar.addEventListener('click', (e) => {
      const btn = e.target.closest('.tatali-subnav-btn');
      if (!btn) return;
      switchTataliSubpage(btn.getAttribute('data-tatali-page'));
    });
  }

  const adminPillsContainer = document.querySelector('.admin-filter-pills');
  if (adminPillsContainer) {
    adminPillsContainer.addEventListener('click', (e) => {
      const pill = e.target.closest('.admin-filter-pill');
      if (!pill) return;
      document.querySelectorAll('.admin-filter-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      adminState.filterStatus = pill.getAttribute('data-admin-filter');
      renderAdminTable();
    });
  }

  const adminSearchInput = document.getElementById('admin-search-input');
  if (adminSearchInput) {
    adminSearchInput.addEventListener('input', (e) => {
      adminState.searchQuery = e.target.value;
      renderAdminTable();
    });
  }

  const analyticsHeader = document.querySelector('.analytics-tabs-header');
  if (analyticsHeader) {
    analyticsHeader.addEventListener('click', (e) => {
      const tabBtn = e.target.closest('.analytics-tab-btn');
      if (!tabBtn) return;
      document.querySelectorAll('.analytics-tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.analytics-tab-content').forEach(c => c.classList.remove('active'));
      
      tabBtn.classList.add('active');
      const targetId = `analytics-${tabBtn.getAttribute('data-analytics')}-content`;
      const targetContent = document.getElementById(targetId);
      if (targetContent) targetContent.classList.add('active');
    });
  }
}

function switchTataliSubpage(subpageId) {
  adminState.activeSubpage = subpageId;

  document.querySelectorAll('.tatali-subnav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-tatali-page') === subpageId);
  });

  document.querySelectorAll('.tatali-subpage-section').forEach(sec => {
    sec.classList.toggle('active', sec.id === `tatali-subpage-${subpageId}`);
  });

  renderAdminDashboard();
}
window.switchTataliSubpage = switchTataliSubpage;

function renderAdminDashboard() {
  if (!adminState.isAuthenticated) return;

  hideAdminKpiSkeletons();
  _activeSkeletons.delete('admin-table-body');
  _activeSkeletons.delete('shared-mobiles-list');
  _activeSkeletons.delete('family-breakdown-grid');
  _activeSkeletons.delete('card-types-grid');

  const totalMembers = appData.beneficiaries.length;
  const totalCards = appData.households.length;
  const onboardedMembers = appData.beneficiaries.filter(b => b.onboarded === "Yes").length;
  const onboardedPercent = totalMembers > 0 ? ((onboardedMembers / totalMembers) * 100).toFixed(1) : 0;

  const kpiMembers = document.getElementById('kpi-total-members');
  const kpiCards = document.getElementById('kpi-total-cards');
  const kpiOnboarded = document.getElementById('kpi-onboarded-members');
  const kpiProgress = document.getElementById('kpi-onboarded-progress');
  const kpiPercent = document.getElementById('kpi-onboarded-percent');

  if (kpiMembers) kpiMembers.textContent = totalMembers;
  if (kpiCards) kpiCards.textContent = totalCards;
  if (kpiOnboarded) kpiOnboarded.textContent = onboardedMembers;
  if (kpiProgress) kpiProgress.style.width = `${onboardedPercent}%`;
  if (kpiPercent) kpiPercent.textContent = `${onboardedPercent}% પૂર્ણ થયું (${totalMembers - onboardedMembers} પેન્ડિંગ)`;

  const lastSyncBadge = document.getElementById('admin-last-sync');
  if (lastSyncBadge) {
    const timeStr = new Date().toLocaleTimeString('gu-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    lastSyncBadge.textContent = `🟢 લાઈવ (${timeStr})`;
  }

  renderSharedMobilesWidget();
  renderFamilyBreakdownWidget();
  renderCardTypesWidget();
  renderAdminTable();
}

function renderSharedMobilesWidget() {
  const container = document.getElementById('shared-mobiles-list');
  if (!container) return;

  const mobileGroups = {};
  appData.beneficiaries.forEach(b => {
    const mob = b.mobile ? String(b.mobile).trim() : '';
    if (mob) {
      if (!mobileGroups[mob]) mobileGroups[mob] = [];
      mobileGroups[mob].push(b);
    }
  });

  const sharedMobiles = Object.keys(mobileGroups)
    .filter(m => mobileGroups[m].length > 1)
    .sort((a, b) => mobileGroups[b].length - mobileGroups[a].length);

  const kpiSharedMob = document.getElementById('kpi-shared-mobiles');
  if (kpiSharedMob) kpiSharedMob.textContent = sharedMobiles.length;

  let html = "";
  sharedMobiles.forEach((mob) => {
    const members = mobileGroups[mob];
    let memberRows = "";
    members.forEach(m => {
      const statusClass = m.onboarded === "Yes" ? "yes" : "no";
      const statusText = m.onboarded === "Yes" ? "✓ ઓનબોર્ડ" : "⏳ પેન્ડિંગ";
      memberRows += `
        <div class="shared-member-row">
          <span>${m.name} (રેશન કાર્ડ: ${m.ration_card})</span>
          <span class="onboarded-tag ${statusClass}">${statusText}</span>
        </div>
      `;
    });

    html += `
      <div class="shared-mobile-item">
        <div class="shared-mobile-header" onclick="this.nextElementSibling.classList.toggle('open')">
          <span class="shared-mobile-num">📱 ${mob}</span>
          <span class="shared-count-tag">👥 ${members.length} સભ્યો ▼</span>
        </div>
        <div class="shared-members-body">
          ${memberRows}
        </div>
      </div>
    `;
  });

  container.innerHTML = html || `<p style="font-size:12px; color:var(--text-light);">કોઈ શેરિંગ મોબાઈલ નંબર મળેલ નથી.</p>`;
}

function renderFamilyBreakdownWidget() {
  const container = document.getElementById('family-breakdown-grid');
  if (!container) return;

  const sizeCounts = {};
  appData.households.forEach(h => {
    const size = h.members.length;
    sizeCounts[size] = (sizeCounts[size] || 0) + 1;
  });

  const multiMemberCards = appData.households.filter(h => h.members.length >= 2).length;
  const kpiSharedCards = document.getElementById('kpi-shared-cards');
  if (kpiSharedCards) kpiSharedCards.textContent = multiMemberCards;

  let html = "";
  Object.keys(sizeCounts).sort((a, b) => a - b).forEach(size => {
    html += `
      <div class="breakdown-card">
        <div class="breakdown-num">${sizeCounts[size]}</div>
        <div class="breakdown-label">${size} સભ્યો</div>
      </div>
    `;
  });
  container.innerHTML = html;
}

function renderCardTypesWidget() {
  const container = document.getElementById('card-types-grid');
  if (!container) return;

  const typeCounts = {};
  appData.beneficiaries.forEach(b => {
    const t = b.card_type ? b.card_type.toUpperCase() : 'અન્ય';
    typeCounts[t] = (typeCounts[t] || 0) + 1;
  });

  let html = "";
  Object.keys(typeCounts).forEach(type => {
    html += `
      <div class="breakdown-card">
        <div class="breakdown-num">${typeCounts[type]}</div>
        <div class="breakdown-label">${type}</div>
      </div>
    `;
  });
  container.innerHTML = html;
}

function renderAdminTable() {
  const tbody = document.getElementById('admin-table-body');
  if (!tbody) return;

  let list = appData.beneficiaries;

  if (adminState.filterStatus === "PENDING") {
    list = list.filter(b => b.onboarded !== "Yes");
  } else if (adminState.filterStatus === "ONBOARDED") {
    list = list.filter(b => b.onboarded === "Yes");
  }

  if (adminState.searchQuery) {
    const q = adminState.searchQuery.toUpperCase();
    const cleanQ = q.replace(/\s+/g, '');
    list = list.filter(b => 
      b.name.toUpperCase().includes(q) ||
      b.ration_card.includes(q) ||
      b.clean_ration_card.includes(cleanQ) ||
      (b.mobile && b.mobile.includes(q))
    );
  }

  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding: 20px; color: var(--text-light);">કોઈ પરિણામ મળ્યું નથી.</td></tr>`;
    return;
  }

  let html = "";
  list.forEach(b => {
    const isOnboarded = b.onboarded === "Yes";
    
    const onboardedDateStr = b.onboarded_date ? `<div class="status-date-sub">${formatDateTime(b.onboarded_date)}</div>` : '';
    const statusTag = isOnboarded 
      ? `<div class="status-cell-container"><span class="onboarded-tag yes">✓ ઓનબોર્ડેડ</span>${onboardedDateStr}</div>` 
      : `<span class="onboarded-tag no">⏳ પેન્ડિંગ</span>`;

    html += `
      <tr>
        <td><strong>#${b.sr_no}</strong></td>
        <td><strong>${b.name}</strong></td>
        <td><span class="card-num-val">${b.ration_card}</span></td>
        <td><span class="card-type-badge">${b.card_type || '-'}</span></td>
        <td><span class="shared-mobile-num">${b.mobile || '-'}</span></td>
        <td>${statusTag}</td>
        <td>
          <div class="status-toggle-wrapper">
            <label class="toggle-switch">
              <input type="checkbox" ${isOnboarded ? 'checked' : ''} onchange="toggleBeneficiaryStatus(${b.sr_no}, 'onboarded')">
              <span class="toggle-slider"></span>
            </label>
          </div>
        </td>
      </tr>
    `;
  });
  tbody.innerHTML = html;
}

async function toggleBeneficiaryStatus(srNo, field = 'onboarded') {
  const beneficiary = appData.beneficiaries.find(b => b.sr_no === srNo);
  if (!beneficiary) return;

  const currentStatus = beneficiary[field];
  const newStatus = currentStatus === "Yes" ? "No" : "Yes";
  const currentVersion = adminState.versions[srNo] || 0;

  // Lock target row during network update
  const rows = document.querySelectorAll('#admin-table-body tr');
  let targetRow = null;
  rows.forEach(r => {
    if (r.cells[0]?.textContent?.includes(`#${srNo}`)) {
      targetRow = r;
    }
  });

  if (targetRow) {
    targetRow.classList.add('row-updating');
    const checkboxes = targetRow.querySelectorAll('input[type="checkbox"]');
    checkboxes.forEach(cb => cb.disabled = true);
  }

  const dateField = field + '_date';
  const oldDate = beneficiary[dateField];
  const newDate = newStatus === "Yes" ? new Date().toISOString() : null;

  // Optimistic update
  beneficiary[field] = newStatus;
  beneficiary[dateField] = newDate;
  groupHouseholds();
  renderStats();
  renderList();
  renderAdminDashboard();

  if (adminState.isAuthenticated && ApiClient.token) {
    try {
      const result = await ApiClient.updateOnboarding(srNo, field, newStatus, currentVersion);
      adminState.versions[srNo] = result.version;
      beneficiary.onboarded_date = result.onboarded_date;
      beneficiary.rc_onboarded_date = result.rc_onboarded_date;
      beneficiary.version = result.version;
      renderAdminDashboard();
      const label = field === 'rc_onboarded' ? 'RC ઓનબોર્ડિંગ' : 'ઓનબોર્ડિંગ';
      showToast(newStatus === "Yes" ? `✅ ${beneficiary.name} — ${label} સફળતાપૂર્વક અપડેટ થયું!` : `⏳ ${beneficiary.name} — ${label} પેન્ડિંગ સેટ થયું!`);
    } catch (err) {
      if (err.status === 409) {
        showToast(`⚠️ ${beneficiary.name} — બીજા સેશનથી અપડેટ થયું છે. પેજ રિફ્રેશ થઈ રહ્યું છે...`);
        await loadData();
        renderAdminDashboard();
      } else {
        // Revert
        beneficiary[field] = currentStatus;
        beneficiary[dateField] = oldDate;
        groupHouseholds();
        renderStats();
        renderList();
        renderAdminDashboard();
        showToast(`❌ અપડેટ અસફળ રહ્યું. સર્વર ભૂલ.`);
      }
    } finally {
      if (targetRow) {
        targetRow.classList.remove('row-updating');
        const checkboxes = targetRow.querySelectorAll('input[type="checkbox"]');
        checkboxes.forEach(cb => cb.disabled = false);
      }
    }
  } else {
    // Offline / Fallback mode
    if (!adminState.onboardingOverrides[srNo] || typeof adminState.onboardingOverrides[srNo] !== 'object') {
      const oldOnboarded = typeof adminState.onboardingOverrides[srNo] === 'string' ? adminState.onboardingOverrides[srNo] : beneficiary.onboarded;
      adminState.onboardingOverrides[srNo] = {
        onboarded: oldOnboarded,
        rc_onboarded: beneficiary.rc_onboarded,
        version: currentVersion
      };
    }
    
    adminState.onboardingOverrides[srNo][field] = newStatus;
    adminState.onboardingOverrides[srNo][dateField] = newDate;
    adminState.onboardingOverrides[srNo].version = currentVersion + 1;
    
    try {
      localStorage.setItem('cbdc_onboarding_overrides', JSON.stringify(adminState.onboardingOverrides));
    } catch (e) {}
    
    const label = field === 'rc_onboarded' ? 'RC ઓનબોર્ડિંગ' : 'ઓનબોર્ડિંગ';
    showToast(newStatus === "Yes" ? `✅ ${beneficiary.name} — ${label} સફળ ઓનબોર્ડ! (ઓફલાઇન)` : `⏳ ${beneficiary.name} — ${label} પેન્ડિંગ! (ઓફલાઇન)`);

    if (targetRow) {
      targetRow.classList.remove('row-updating');
      const checkboxes = targetRow.querySelectorAll('input[type="checkbox"]');
      checkboxes.forEach(cb => cb.disabled = false);
    }
  }
}
window.toggleBeneficiaryStatus = toggleBeneficiaryStatus;

// --- Export Center (New Implementation) ---

// --- Export Center ---
let currentExportFormat = 'PDF';
let activeExportTab = 'filters';

const COLUMN_HEADERS_GUJ = {
  "sr_no": "ક્રમ",
  "name": "લાભાર્થીનું નામ",
  "ration_card": "રેશન કાર્ડ નંબર",
  "card_type": "કાર્ડ પ્રકાર",
  "mobile": "મોબાઈલ નંબર",
  "member_id": "સભ્ય ID",
  "uid_masked": "આધાર નંબર",
  "onboarded": "ઓનબોર્ડિંગ સ્થિતિ",
  "onboarded_date": "ઓનબોર્ડિંગ તારીખ",
  "rc_onboarded": "RC વેરિફિકેશન",
  "rc_onboarded_date": "RC ઓનબોર્ડિંગ તારીખ",
  "shop_details": "રેશન દુકાન / વિસ્તાર"
};

const COLUMN_HEADERS_ENG = {
  "sr_no": "Sr No",
  "name": "Beneficiary Name",
  "ration_card": "Ration Card No",
  "card_type": "Card Type",
  "mobile": "Mobile Number",
  "member_id": "Member ID",
  "uid_masked": "Masked Aadhaar",
  "onboarded": "Onboarding Status",
  "onboarded_date": "Onboarding Date",
  "rc_onboarded": "RC Onboarded",
  "rc_onboarded_date": "RC Onboarding Date",
  "shop_details": "Shop / Location"
};

function switchExportTab(tabName) {
  activeExportTab = tabName;
  document.getElementById('export-tab-btn-filters')?.classList.toggle('active', tabName === 'filters');
  document.getElementById('export-tab-btn-columns')?.classList.toggle('active', tabName === 'columns');
  document.getElementById('export-tab-btn-styling')?.classList.toggle('active', tabName === 'styling');

  document.getElementById('export-tab-content-filters')?.classList.toggle('active', tabName === 'filters');
  document.getElementById('export-tab-content-columns')?.classList.toggle('active', tabName === 'columns');
  document.getElementById('export-tab-content-styling')?.classList.toggle('active', tabName === 'styling');
}
window.switchExportTab = switchExportTab;

function toggleAllExportColumns(isChecked) {
  const boxes = document.querySelectorAll('input[name="exportColumn"]');
  boxes.forEach(cb => cb.checked = isChecked);
  handleExportConfigChange();
}
window.toggleAllExportColumns = toggleAllExportColumns;

function handleExportWatermarkSelectChange() {
  const select = document.getElementById('export-watermark-select');
  const wrapper = document.getElementById('export-custom-watermark-wrapper');
  if (select && wrapper) {
    wrapper.style.display = select.value === 'CUSTOM' ? 'flex' : 'none';
  }
  handleExportConfigChange();
}
window.handleExportWatermarkSelectChange = handleExportWatermarkSelectChange;

function handleExportConfigChange() {
  updateExportModalPreview();
}
window.handleExportConfigChange = handleExportConfigChange;

function getSelectedExportColumns() {
  const checkedBoxes = document.querySelectorAll('input[name="exportColumn"]:checked');
  return Array.from(checkedBoxes).map(cb => cb.value);
}

function getActiveWatermarkText() {
  const select = document.getElementById('export-watermark-select');
  if (!select) return '';
  const val = select.value;
  if (val === 'NONE') return '';
  if (val === 'CONFIDENTIAL') return 'CONFIDENTIAL';
  if (val === 'PALI') return 'PALI GRAM PANCHAYAT';
  if (val === 'GOVT') return 'GOVERNMENT OF GUJARAT';
  if (val === 'CUSTOM') {
    const input = document.getElementById('export-custom-watermark-input');
    return input ? input.value.trim().toUpperCase() : '';
  }
  return '';
}

function getActiveThemeColor() {
  const checkedTheme = document.querySelector('input[name="exportTheme"]:checked');
  const val = checkedTheme ? checkedTheme.value : 'navy';
  if (val === 'saffron') return '#d97706';
  if (val === 'emerald') return '#059669';
  if (val === 'monochrome') return '#1e293b';
  return '#0b1a3a'; // navy
}

function getExportFilteredData(filterType) {
  let data = [...appData.beneficiaries];

  // 1. Basic dataset filters
  if (filterType === 'PENDING') {
    data = data.filter(b => b.onboarded !== 'Yes');
  } else if (filterType === 'ONBOARDED') {
    data = data.filter(b => b.onboarded === 'Yes');
  } else if (filterType === 'SHARED_MOBILE') {
    const mobGroup = {};
    appData.beneficiaries.forEach(b => {
      const mob = b.mobile;
      if (mob) mobGroup[mob] = (mobGroup[mob] || 0) + 1;
    });
    data = data.filter(b => b.mobile && mobGroup[b.mobile] > 1);
  } else if (filterType === 'SHARED_CARD') {
    const multiMemberCards = new Set();
    appData.households.forEach(h => {
      if (h.members.length >= 2) multiMemberCards.add(h.ration_card);
    });
    data = data.filter(b => multiMemberCards.has(b.ration_card));
  }

  // 2. Card type filter
  const cardTypeSelect = document.getElementById('export-filter-card-type');
  if (cardTypeSelect && cardTypeSelect.value !== 'ALL') {
    const targetType = cardTypeSelect.value;
    data = data.filter(b => b.card_type === targetType);
  }

  // 3. RC status filter
  const rcStatusSelect = document.getElementById('export-filter-rc-status');
  if (rcStatusSelect && rcStatusSelect.value !== 'ALL') {
    const targetRc = rcStatusSelect.value;
    data = data.filter(b => b.rc_onboarded === targetRc);
  }

  // 4. Custom date range filter
  const startDateInput = document.getElementById('export-filter-start-date');
  const endDateInput = document.getElementById('export-filter-end-date');
  if ((startDateInput && startDateInput.value) || (endDateInput && endDateInput.value)) {
    const startVal = startDateInput ? startDateInput.value : '';
    const endVal = endDateInput ? endDateInput.value : '';
    data = data.filter(b => {
      const dates = [];
      if (b.onboarded_date) dates.push(b.onboarded_date.slice(0, 10));
      if (b.rc_onboarded_date) dates.push(b.rc_onboarded_date.slice(0, 10));
      if (dates.length === 0) return false;
      return dates.some(d => {
        return (!startVal || d >= startVal) && (!endVal || d <= endVal);
      });
    });
  }

  // 5. Search text filter
  const searchInput = document.getElementById('export-search-input');
  if (searchInput && searchInput.value.trim() !== '') {
    const query = searchInput.value.trim().toLowerCase();
    data = data.filter(b => 
      b.name.toLowerCase().includes(query) || 
      b.ration_card.toLowerCase().includes(query)
    );
  }

  // 5. Sorting
  const sortFieldSelect = document.getElementById('export-sort-field');
  const sortOrderSelect = document.getElementById('export-sort-order');
  if (sortFieldSelect && sortOrderSelect) {
    const field = sortFieldSelect.value;
    const isAsc = sortOrderSelect.value === 'ASC';
    
    data.sort((a, b) => {
      let valA = a[field] || '';
      let valB = b[field] || '';
      
      if (field === 'sr_no') {
        return isAsc ? Number(valA) - Number(valB) : Number(valB) - Number(valA);
      }
      
      valA = String(valA).toLowerCase();
      valB = String(valB).toLowerCase();
      if (valA < valB) return isAsc ? -1 : 1;
      if (valA > valB) return isAsc ? 1 : -1;
      return 0;
    });
  }

  return data;
}

function drawMockQRCode(canvasId, text) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const size = canvas.width;
  ctx.clearRect(0, 0, size, size);
  
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);
  
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = text.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  const cells = 21;
  const cellSize = size / cells;
  
  ctx.fillStyle = '#000000';
  
  function drawFinderPattern(x, y) {
    ctx.fillRect(x, y, cellSize * 7, cellSize * 7);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x + cellSize, y + cellSize, cellSize * 5, cellSize * 5);
    ctx.fillStyle = '#000000';
    ctx.fillRect(x + cellSize * 2, y + cellSize * 2, cellSize * 3, cellSize * 3);
  }
  
  drawFinderPattern(0, 0);
  drawFinderPattern(size - cellSize * 7, 0);
  drawFinderPattern(0, size - cellSize * 7);
  
  for (let r = 0; r < cells; r++) {
    for (let c = 0; c < cells; c++) {
      if ((r < 8 && c < 8) || (r < 8 && c > cells - 9) || (r > cells - 9 && c < 8)) {
        continue;
      }
      const cellHash = Math.abs(Math.sin(hash + r * 13 + c * 37));
      if (cellHash > 0.5) {
        ctx.fillStyle = '#000000';
        ctx.fillRect(c * cellSize, r * cellSize, cellSize + 0.5, cellSize + 0.5);
      }
    }
  }
}

function updateExportModalPreview() {
  const checkedRadio = document.querySelector('input[name="exportDataFilter"]:checked');
  const filterVal = checkedRadio ? checkedRadio.value : 'ALL';
  const data = getExportFilteredData(filterVal);
  const previewBar = document.getElementById('export-preview-bar');
  const fmtName = currentExportFormat === 'PDF' ? 'PDF Document' : 'Excel / Google Sheet';

  if (previewBar) {
    previewBar.innerHTML = `📊 કુલ <strong>${data.length} સભ્યો</strong> ડાઉનલોડ કરવા માટે તૈયાર છે (${fmtName})`;
  }

  // Render the real-time mini document preview sheet on the right panel
  const previewPaper = document.getElementById('export-preview-sheet-paper');
  if (!previewPaper) return;

  const columns = getSelectedExportColumns();
  const themeColor = getActiveThemeColor();
  const watermarkText = getActiveWatermarkText();
  const titleVal = document.getElementById('export-title-input')?.value || "ઈ-રૂપિયો CBDC રેશન વિતરણ વ્હાઇટલિસ્ટ";
  const subtitleVal = document.getElementById('export-subtitle-input')?.value || "પળી, ઊંઝા, મહેસાણા - ૩૮૪૨૬૦";

  const showEmblem = document.getElementById('export-toggle-emblem')?.checked;
  const showQR = document.getElementById('export-toggle-qrcode')?.checked;
  const showStamp = document.getElementById('export-toggle-stamp')?.checked;

  let filterLabel = "બધા સભ્યો";
  if (filterVal === 'PENDING') filterLabel = "પેન્ડિંગ લાભાર્થીઓ";
  if (filterVal === 'ONBOARDED') filterLabel = "ઓનબોર્ડેડ લાભાર્થીઓ";
  if (filterVal === 'SHARED_MOBILE') filterLabel = "શેર્ડ મોબાઈલ";
  if (filterVal === 'SHARED_CARD') filterLabel = "SHEARD CARD";

  // Build table headers (no decorative emojis, thin borders)
  let tableHeadersHtml = "";
  columns.forEach(col => {
    let headerLabel = COLUMN_HEADERS_SIMPLE[col] || COLUMN_HEADERS_GUJ[col] || col;
    let align = (col === 'name' || col === 'shop_details') ? 'left' : 'center';
    tableHeadersHtml += `<th style="padding: 4px; font-size: 7.5px; text-align: ${align}; border: 1px solid #000000; background: #f1f5f9; color: #000000; font-weight: bold; font-family: 'Noto Sans Gujarati', monospace;">${headerLabel}</th>`;
  });

  // Build mock sample data rows (first 4 items)
  let tableRowsHtml = "";
  const sampleItems = data.slice(0, 4);
  sampleItems.forEach((b, idx) => {
    let cellsHtml = "";
    columns.forEach(col => {
      let val = "";
      let align = 'center';
      let fontStyle = "";
      if (col === 'sr_no') {
        val = idx + 1;
      } else if (col === 'onboarded' || col === 'rc_onboarded') {
        const isYes = b[col] === 'Yes';
        val = isYes ? '✓' : '✗';
        fontStyle = 'font-weight: bold; font-size: 8.5px; color: #000000;';
      } else if (col === 'onboarded_date' || col === 'rc_onboarded_date') {
        val = b[col] ? formatDateTime(b[col]) : '-';
      } else if (col === 'area_name') {
        val = b.area_name ? b.area_name.split(':').pop().trim() : 'પળી';
        align = 'center';
      } else if (col === 'shop_details') {
        val = "ભરતભાઈ બારોટ";
        align = 'left';
      } else {
        val = b[col] || '-';
        if (col === 'name') align = 'left';
      }
      cellsHtml += `<td style="padding: 4px; border: 0.5px solid #000000; text-align: ${align}; max-width: 80px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 7px; ${fontStyle}">${val}</td>`;
    });
    tableRowsHtml += `<tr style="background: #ffffff;">${cellsHtml}</tr>`;
  });

  if (data.length > 4) {
    tableRowsHtml += `<tr><td colspan="${columns.length}" style="padding: 4px; font-size: 7px; text-align: center; color: #64748b; background: #fafafa; font-style: italic; border: 0.5px solid #000000;">... અને અન્ય ${data.length - 4} સભ્યો ડાઉનલોડ થશે.</td></tr>`;
  }

  // Watermark layout
  let watermarkHtml = "";
  if (watermarkText) {
    watermarkHtml = `<div class="preview-watermark-overlay" style="font-size:18px; color:rgba(0, 0, 0, 0.02); font-family: 'Noto Sans Gujarati', monospace;">${watermarkText}</div>`;
  }

  // Emblem layout (positioned left)
  let emblemHtml = "";
  if (showEmblem) {
    emblemHtml = `
      <img src="assets/images/logo_web.png" style="width: 28px; height: 28px; object-fit: contain; display: block;" />
    `;
  }

  const totalCount = data.length;
  const onboardedCount = data.filter(b=>b.onboarded==='Yes').length;
  const pendingCount = totalCount - onboardedCount;

  // Counts block (always shown)
  let countsHtml = `
    <div style="font-size: 6.5px; line-height: 1.35; color: #000000; font-weight: bold;">
      <div>કુલ સભ્યો : <strong>${totalCount}</strong></div>
      <div>ઓનબોર્ડિંગ કરેલા : <strong>${onboardedCount}</strong></div>
      <div>બાકી : <strong>${pendingCount}</strong></div>
    </div>
  `;

  // Signature / Stamp Block
  let sigHtml = "";
  if (showStamp) {
    sigHtml = `
      <div style="text-align: center; color: #000000; flex-shrink: 0; width: 85px; line-height: 1.35;">
        <div style="border-top: 1px solid #000000; margin: 15px auto 4px auto; width: 70px;"></div>
        <strong style="font-size: 7.5px;">તલાટી કમ મંત્રી</strong>
        <div style="font-size: 6px;">(સહી / સિક્કો)</div>
      </div>
    `;
  }

  // Render preview document container
  previewPaper.innerHTML = `
    ${watermarkHtml}
    <div class="preview-sheet-paper-container" style="font-size: 7.5px; line-height: 1.35; padding: 8px; font-family: 'Noto Sans Gujarati', monospace; color: #000000; background: #ffffff;">
      <!-- Header Section: Logo Left, Title Center, Date Right enclosed in a box -->
      <div style="position: relative; padding: 6px; margin-bottom: 8px; border: 1.5px solid #000000; min-height: 32px;">
        <!-- Left corner: logo -->
        ${showEmblem ? `
        <div style="position: absolute; left: 6px; top: 6px;">
          ${emblemHtml}
        </div>
        ` : ''}
        
        <!-- Top Center text -->
        <div style="text-align: center; margin: 0 auto; ${showEmblem ? 'padding-left: 32px;' : ''} padding-bottom: 4px;">
          <h5 style="margin: 0; font-size: 9.5px; color: #000000; font-weight: bold;">ગ્રામ પંચાયત પળી</h5>
          <p style="margin: 1px 0 0 0; font-size: 6px; color: #000000; font-weight: bold;">${subtitleVal}</p>
          <p style="margin: 1px 0 0 0; font-size: 6.5px; color: #000000; font-weight: bold; text-decoration: underline;">${titleVal}</p>
        </div>
        
        <!-- Date info on the bottom edges of the box -->
        <div style="display: flex; justify-content: space-between; border-top: 1px solid #000000; padding-top: 3px; margin-top: 3px; font-size: 5.5px; font-weight: bold; color: #000000;">
          <div>તારીખ: ${new Date().toLocaleDateString('gu-IN')}</div>
          <div>રિપોર્ટ નં.: GP-PALI/CBDC/${totalCount}</div>
        </div>
      </div>

      <!-- Dynamic Data Table -->
      <table style="width: 100%; border-collapse: collapse; font-size: 7px; margin-bottom: 6px; border: 1px solid #000000; font-family: 'Noto Sans Gujarati', monospace;">
        <thead>
          <tr>${tableHeadersHtml}</tr>
        </thead>
        <tbody>
          ${tableRowsHtml}
        </tbody>
      </table>

      <!-- Notes Section (mini) -->
      <div style="font-family: 'Noto Sans Gujarati', monospace; font-size: 6px; line-height: 1.4; color: #000000;">
        <div style="border-top: 1px solid #000000; margin: 4px 0;"></div>
        <strong>નોંધ:</strong> આ યાદી પળી ગ્રામ પંચાયત હેઠળ વેરિફિકેશન પ્રક્રિયા હેઠળ પ્રમાણિત છે.
        <div style="border-top: 1px solid #000000; margin: 4px 0;"></div>
      </div>

      <!-- Bottom Layout Section -->
      <div style="display: flex; justify-content: space-between; align-items: flex-end; border-top: 1px solid #000000; margin-top: 10px; padding-top: 6px; font-size: 6px; font-family: 'Noto Sans Gujarati', monospace;">
        ${countsHtml}
        ${sigHtml}
      </div>
    </div>
  `;


}
window.updateExportModalPreview = updateExportModalPreview;

function openExportModal() {
  const modal = document.getElementById('export-options-modal');
  if (!modal) return;

  document.getElementById('exp-count-all').textContent = appData.beneficiaries.length;
  document.getElementById('exp-count-pending').textContent = appData.beneficiaries.filter(b => b.onboarded !== 'Yes').length;
  document.getElementById('exp-count-onboarded').textContent = appData.beneficiaries.filter(b => b.onboarded === 'Yes').length;

  const mobGroup = {};
  appData.beneficiaries.forEach(b => {
    const mob = b.mobile;
    if (mob) mobGroup[mob] = (mobGroup[mob] || 0) + 1;
  });
  document.getElementById('exp-count-shared-mob').textContent = appData.beneficiaries.filter(b => b.mobile && mobGroup[b.mobile] > 1).length;

  const multiMemberCards = new Set();
  appData.households.forEach(h => {
    if (h.members.length >= 2) multiMemberCards.add(h.ration_card);
  });
  document.getElementById('exp-count-shared-card').textContent = appData.beneficiaries.filter(b => multiMemberCards.has(b.ration_card)).length;

  const todayStr = new Date().toISOString().slice(0, 10);
  const startDateInput = document.getElementById('export-filter-start-date');
  const endDateInput = document.getElementById('export-filter-end-date');
  if (startDateInput) {
    startDateInput.value = '';
    startDateInput.max = todayStr;
    startDateInput.removeAttribute('min');
  }
  if (endDateInput) {
    endDateInput.value = '';
    endDateInput.max = todayStr;
    endDateInput.removeAttribute('min');
  }

  // Render the initial dynamically generated preview
  switchExportTab('filters');
  updateExportModalPreview();
  
  modal.classList.add('open');
}
window.openExportModal = openExportModal;

function closeExportModal() {
  const modal = document.getElementById('export-options-modal');
  if (modal) modal.classList.remove('open');
}
window.closeExportModal = closeExportModal;

function selectExportFormat(format) {
  currentExportFormat = format;
  document.getElementById('format-btn-pdf')?.classList.toggle('active', format === 'PDF');
  document.getElementById('format-btn-sheet')?.classList.toggle('active', format === 'SHEET');
  updateExportModalPreview();
}
window.selectExportFormat = selectExportFormat;

function executeExportDownload() {
  const checkedRadio = document.querySelector('input[name="exportDataFilter"]:checked');
  const filterVal = checkedRadio ? checkedRadio.value : 'ALL';
  const data = getExportFilteredData(filterVal);

  if (data.length === 0) {
    showToast("⚠️ આ કેટેગરીમાં કોઈ ડેટા નથી.");
    return;
  }

  if (currentExportFormat === 'PDF') {
    generatePDFExport(data, filterVal);
  } else {
    generateExcelExport(data, filterVal);
  }
  closeExportModal();
}
window.executeExportDownload = executeExportDownload;

function generateExcelExport(data, filterType) {
  const dateStr = new Date().toISOString().slice(0, 10);
  const fileName = `Pali_CBDC_${filterType}_${dateStr}.xlsx`;
  
  const columns = getSelectedExportColumns();
  const titleVal = document.getElementById('export-title-input')?.value || "RATION BENEFICIARY REPORT";
  const subtitleVal = document.getElementById('export-subtitle-input')?.value || "Office of Talati, Pali Gram Panchayat";
  
  const excelRows = data.map((b, idx) => {
    const rowObj = {};
    columns.forEach(col => {
      let headerName = COLUMN_HEADERS_GUJ[col] || col;
      if (col === 'sr_no') {
        rowObj[headerName] = idx + 1;
      } else if (col === 'onboarded') {
        rowObj[headerName] = b.onboarded === 'Yes' ? 'ઓનબોર્ડેડ' : 'પેન્ડિંગ';
      } else if (col === 'rc_onboarded') {
        rowObj[headerName] = b.rc_onboarded === 'Yes' ? 'ઓનબોર્ડેડ' : 'પેન્ડિંગ';
      } else if (col === 'onboarded_date' || col === 'rc_onboarded_date') {
        rowObj[headerName] = b[col] ? formatDateTime(b[col]) : '-';
      } else if (col === 'shop_details') {
        rowObj[headerName] = b.shop_name || 'પળી ગ્રામ પંચાયત';
      } else {
        rowObj[headerName] = b[col] || '-';
      }
    });
    return rowObj;
  });

  if (window.XLSX) {
    const worksheet = XLSX.utils.json_to_sheet([]);
    
    // Add professional metadata header rows
    XLSX.utils.sheet_add_aoa(worksheet, [
      [titleVal.toUpperCase()],
      [subtitleVal],
      [`Generated On: ${new Date().toLocaleString('gu-IN')} | Total Records: ${data.length}`],
      []
    ], { origin: "A1" });
    
    // Add json data starting at row 5
    XLSX.utils.sheet_add_json(worksheet, excelRows, { origin: "A5", skipHeader: false });
    
    // Auto-fit column widths
    const colWidths = [];
    columns.forEach((col, cIdx) => {
      let maxLen = (COLUMN_HEADERS_GUJ[col] || col).length + 4;
      data.forEach(row => {
        let val = String(row[col] || '');
        if (col === 'onboarded' || col === 'rc_onboarded') val = row[col] === 'Yes' ? 'ઓનબોર્ડેડ' : 'પેન્ડિંગ';
        if (val.length > maxLen) maxLen = val.length;
      });
      colWidths.push({ wch: Math.min(Math.max(maxLen, 8), 50) });
    });
    worksheet['!cols'] = colWidths;
    
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "CBDC Report");
    XLSX.writeFile(workbook, fileName);
    showToast(`📊 Excel અહેવાલ ડાઉનલોડ થયો! (${data.length} સભ્યો)`);
  } else {
    // CSV fallback
    let csv = `\uFEFF${titleVal}\n${subtitleVal}\nGenerated On: ${dateStr} | Records: ${data.length}\n\n`;
    csv += columns.map(col => `"${COLUMN_HEADERS_GUJ[col] || col}"`).join(",") + "\n";
    excelRows.forEach(r => {
      csv += columns.map(col => {
        const headerName = COLUMN_HEADERS_GUJ[col] || col;
        return `"${r[headerName] !== undefined ? r[headerName] : '-'}"`;
      }).join(",") + "\n";
    });
    
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `Pali_CBDC_${filterType}_${dateStr}.csv`;
    link.click();
    showToast(`📊 CSV અહેવાલ ડાઉનલોડ થયો! (${data.length} સભ્યો)`);
  }
}



const COLUMN_HEADERS_SIMPLE = {
  "sr_no": "ક્રમ",
  "name": "નામ",
  "ration_card": "રેશન કાર્ડ",
  "card_type": "કાર્ડ પ્રકાર",
  "mobile": "મોબાઇલ નંબર",
  "member_id": "સભ્ય ID",
  "uid_masked": "આધાર નંબર",
  "area_name": "ગામ",
  "onboarded": "સ્થિતિ",
  "onboarded_date": "ઓનબોર્ડ તારીખ",
  "rc_onboarded": "RC સ્થિતિ",
  "rc_onboarded_date": "RC ઓનબોર્ડ તારીખ",
  "shop_details": "રેશન દુકાન"
};

function generatePDFExport(data, filterType) {
  const dateStr = new Date().toLocaleDateString('gu-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const timeStr = new Date().toLocaleTimeString('gu-IN', { hour: '2-digit', minute: '2-digit' });
  
  const columns = getSelectedExportColumns();
  const themeColor = getActiveThemeColor();
  const watermarkText = getActiveWatermarkText();
  
  const titleVal = document.getElementById('export-title-input')?.value || "ઈ-રૂપિયો CBDC રેશન વિતરણ વ્હાઇટલિસ્ટ";
  const subtitleVal = document.getElementById('export-subtitle-input')?.value || "પળી, ઊંઝા, મહેસાણા - ૩૮૪૨૬૦";
  
  const showEmblem = document.getElementById('export-toggle-emblem')?.checked;
  const showQR = document.getElementById('export-toggle-qrcode')?.checked;
  const showStamp = document.getElementById('export-toggle-stamp')?.checked;
  
  let filterLabel = "બધા લાભાર્થીઓ";
  if (filterType === 'PENDING') filterLabel = "પેન્ડિંગ લાભાર્થીઓ";
  if (filterType === 'ONBOARDED') filterLabel = "ઓનબોર્ડેડ લાભાર્થીઓ";
  if (filterType === 'SHARED_MOBILE') filterLabel = "શેર્ડ મોબાઈલ ધરાવતા સભ્યો";
  if (filterType === 'SHARED_CARD') filterLabel = "શેર્ડ રેશનકાર્ડ ધરાવતા સભ્યો";

  // Simple Table headers (plain black text, grid borders, f1f5f9 back, no colored themes or graphics)
  let tableHeadersHtml = "";
  columns.forEach(col => {
    let headerName = COLUMN_HEADERS_SIMPLE[col] || COLUMN_HEADERS_GUJ[col] || col;
    let align = (col === 'name' || col === 'shop_details') ? 'left' : 'center';
    tableHeadersHtml += `<th style="padding: 10px 8px; border: 1.5px solid #000000; font-weight: bold; text-align: ${align}; font-size: 11px; background-color: #f1f5f9; color: #000000; font-family: 'Noto Sans Gujarati', monospace;">${headerName}</th>`;
  });
  
  let tableRowsHtml = "";
  data.forEach((b, idx) => {
    let rowCells = "";
    columns.forEach(col => {
      let val = "";
      let align = 'center';
      let fontStyle = '';
      
      if (col === 'sr_no') {
        val = idx + 1;
      } else if (col === 'onboarded' || col === 'rc_onboarded') {
        const isYes = b[col] === 'Yes';
        val = isYes ? '✓' : '✗';
        fontStyle = isYes 
          ? 'color: #000000; font-weight: bold; font-size: 13px;' 
          : 'color: #000000; font-weight: bold; font-size: 13px;';
      } else if (col === 'onboarded_date' || col === 'rc_onboarded_date') {
        val = b[col] ? formatDateTime(b[col]) : '-';
      } else if (col === 'area_name') {
        val = b.area_name ? b.area_name.split(':').pop().trim() : 'પળી';
        align = 'center';
      } else if (col === 'shop_details') {
        val = b.shop_name || 'પળી ગ્રામ પંચાયત';
        align = 'left';
      } else {
        val = b[col] || '-';
        if (col === 'name') align = 'left';
        if (col === 'ration_card') fontStyle = 'font-family: monospace; font-size: 11px; font-weight: bold;';
        if (col === 'mobile') fontStyle = 'font-family: monospace; font-size: 11px;';
      }
      rowCells += `<td style="padding: 8px; border: 1px solid #000000; text-align: ${align}; ${fontStyle}">${val}</td>`;
    });
    
    tableRowsHtml += `
      <tr style="background-color: #ffffff;">
        ${rowCells}
      </tr>
    `;
  });
  
  let watermarkHtml = "";
  if (watermarkText) {
    watermarkHtml = `
      <div style="
        position: absolute; 
        top: 45%; 
        left: 50%; 
        transform: translate(-50%, -50%) rotate(-32deg); 
        font-size: 60px; 
        font-weight: bold; 
        color: rgba(0, 0, 0, 0.02); 
        pointer-events: none; 
        white-space: nowrap; 
        z-index: 0; 
        letter-spacing: 5px;
        text-transform: uppercase;
        font-family: 'Noto Sans Gujarati', monospace;
      ">${watermarkText}</div>
    `;
  }
  
  const totalCount = data.length;
  const onboardedCount = data.filter(b => b.onboarded === 'Yes').length;
  const pendingCount = totalCount - onboardedCount;
  
  let logoHtml = "";
  if (showEmblem) {
    logoHtml = `
      <img src="assets/images/logo_web.png" style="width: 65px; height: 65px; object-fit: contain; display: block;" />
    `;
  }
  
  let countsHtml = `
    <div style="font-weight: bold; color: #000000; font-family: 'Noto Sans Gujarati', monospace; line-height: 1.45;">
      <div>કુલ સભ્યો : <strong>${totalCount}</strong></div>
      <div>ઓનબોર્ડિંગ કરેલા : <strong>${onboardedCount}</strong></div>
      <div>બાકી : <strong>${pendingCount}</strong></div>
    </div>
  `;
  
  let sigHtml = "";
  if (showStamp) {
    sigHtml = `
      <div style="text-align: center; margin-top: 5px; flex-shrink: 0; width: 200px; font-family: 'Noto Sans Gujarati', monospace; line-height: 1.45;">
        <div style="border-top: 1px solid #000000; margin: 30px auto 6px auto; width: 160px;"></div>
        <div style="font-weight: bold; font-size: 14px; color: #000000;">તલાટી કમ મંત્રી</div>
        <div style="font-size: 12px; color: #000000;">(સહી / સિક્કો)</div>
      </div>
    `;
  }
  
  const pdfContainer = document.createElement('div');
  pdfContainer.style.padding = '40px';
  pdfContainer.style.position = 'relative';
  pdfContainer.style.fontFamily = "'Noto Sans Gujarati', monospace";
  pdfContainer.style.color = '#000000';
  pdfContainer.style.background = '#ffffff';
  pdfContainer.style.boxSizing = 'border-box';
  
  pdfContainer.innerHTML = `
    ${watermarkHtml}
    
    <!-- Top Header Box enclosing title, logo and date metadata -->
    <div style="border: 2px solid #000000; padding: 15px; margin-bottom: 20px; position: relative; font-family: 'Noto Sans Gujarati', monospace; z-index: 2;">
      <!-- Left side: logo emblem -->
      ${showEmblem ? `
      <div style="position: absolute; left: 15px; top: 15px;">
        ${logoHtml}
      </div>
      ` : ''}
      
      <!-- Top Center text -->
      <div style="text-align: center; margin: 0 auto; ${showEmblem ? 'padding-left: 65px;' : ''} padding-bottom: 10px;">
        <h1 style="margin: 0; font-size: 22px; font-weight: bold; color: #000000;">ગ્રામ પંચાયત પળી</h1>
        <p style="margin: 5px 0 0 0; font-size: 13px; color: #000000; font-weight: bold;">${subtitleVal}</p>
        <p style="margin: 4px 0 0 0; font-size: 14px; color: #000000; font-weight: bold; text-decoration: underline;">${titleVal} (${filterLabel})</p>
      </div>
      
      <!-- Date, Time and filter on the bottom edge of the box -->
      <div style="display: flex; justify-content: space-between; border-top: 1.5px solid #000000; padding-top: 8px; margin-top: 6px; font-size: 12px; font-weight: bold;">
        <div>તારીખ: ${dateStr}</div>
        <div>રિપોર્ટ નં.: GP-PALI/CBDC/${totalCount}</div>
      </div>
    </div>
    
    <!-- Table Grid divided by header line -->
    <div style="z-index: 2; position: relative; margin-bottom: 20px;">
      <table style="width: 100%; border-collapse: collapse; font-size: 11px; background: #ffffff; border: 1.5px solid #000000; font-family: 'Noto Sans Gujarati', monospace;">
        <thead>
          <tr style="background-color: #f1f5f9; color: #000000;">
            ${tableHeadersHtml}
          </tr>
        </thead>
        <tbody>
          ${tableRowsHtml}
        </tbody>
      </table>
    </div>
    
    <!-- Notes Section -->
    <div style="z-index: 2; position: relative; margin-top: 20px; font-family: 'Noto Sans Gujarati', monospace; font-size: 11.5px; line-height: 1.6;">
      <div style="border-top: 1.5px solid #000000; margin: 10px 0;"></div>
      <strong>નોંધ (Notes):</strong>
      <ul style="margin: 4px 0; padding-left: 18px; list-style-type: square; color: #000000;">
        <li>આ અહેવાલ પળી ગ્રામ પંચાયત રેશન વિતરણ વ્હાઇટલિસ્ટ ડેટા અનુસાર જનરેટ કરવામાં આવેલ છે.</li>
        <li>કોઈપણ પ્રશ્ન કે સુધારા માટે તલાટી કચેરી પળીનો સંપર્ક કરવો.</li>
      </ul>
      <div style="border-top: 1.5px solid #000000; margin: 10px 0;"></div>
    </div>
    <!-- Bottom counts and signature layout -->
    <div style="display: flex; justify-content: space-between; align-items: flex-end; border-top: 1.5px solid #000000; padding-top: 10px; margin-top: 15px; page-break-inside: avoid; z-index: 2; position: relative;">
      ${countsHtml}
      ${sigHtml}
    </div>
  `;
  
  document.body.appendChild(pdfContainer);
  


  if (window.html2pdf) {
    const opt = {
      margin:       [0.4, 0.4, 0.4, 0.4],
      filename:     `Pali_CBDC_${filterType}_${new Date().toISOString().slice(0, 10)}.pdf`,
      image:        { type: 'jpeg', quality: 0.98 },
      html2canvas:  { scale: 2, useCORS: true, logging: false },
      jsPDF:        { unit: 'in', format: 'letter', orientation: 'portrait' }
    };
    
    html2pdf().set(opt).from(pdfContainer).save().then(() => {
      document.body.removeChild(pdfContainer);
      showToast(`📄 સત્તાવાર PDF અહેવાલ ડાઉનલોડ થયો! (${data.length} સભ્યો)`);
    });
  } else {
    const printWin = window.open('', '_blank');
    printWin.document.write(`
      <html>
        <head>
          <title>${titleVal}</title>
          <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Gujarati:wght@400;500;600;700&display=swap" rel="stylesheet">
          <style>
            body { font-family: 'Noto Sans Gujarati', sans-serif; padding: 25px; color: #1e293b; }
            table { width: 100%; border-collapse: collapse; margin-top: 15px; }
            th { padding: 12px 10px; border-bottom: 2px solid #000000; background: #f1f5f9; color: black; font-weight: bold; font-size: 11px; }
            td { padding: 10px; border-bottom: 1px solid #000000; font-size: 11px; }
          </style>
        </head>
        <body>
          ${pdfContainer.innerHTML}
          <script>
            const originalCanvas = window.opener.document.getElementById('${qrCanvasId}');
            if (originalCanvas) {
              const printCanvas = document.getElementById('${qrCanvasId}');
              if (printCanvas) {
                const ctx = printCanvas.getContext('2d');
                ctx.drawImage(originalCanvas, 0, 0);
              }
            }
            window.onload = function() { window.print(); }
          </script>
        </body>
      </html>
    `);
    printWin.document.close();
    document.body.removeChild(pdfContainer);
  }
}

function showToast(msg) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = 'toast-item';
  toast.innerHTML = msg;
  container.appendChild(toast);
  setTimeout(() => { toast.remove(); }, 3000);
}

// --- Lightbox & Quick Search ---
function executeQuickSearch() {
  const inputEl = document.getElementById('quick-search-input');
  const mainSearchEl = document.getElementById('beneficiary-search');
  const query = inputEl ? inputEl.value : "";

  if (query.trim() !== "") {
    if (mainSearchEl) mainSearchEl.value = query;
    switchTab('list-tab');
    performSearch(query);
    if (inputEl) inputEl.value = "";
  } else {
    switchTab('list-tab');
  }
}

if (document.getElementById('quick-search-btn')) {
  document.getElementById('quick-search-btn').addEventListener('click', executeQuickSearch);
}
if (document.getElementById('quick-search-input')) {
  document.getElementById('quick-search-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') executeQuickSearch();
  });
}

function initLightbox() {
  const modal = document.getElementById('image-lightbox-modal');
  const lightboxImg = document.getElementById('lightbox-img');
  const caption = document.getElementById('lightbox-caption');
  const closeBtn = document.getElementById('lightbox-close-btn');
  const overlay = document.getElementById('lightbox-overlay');

  if (!modal) return;

  document.querySelectorAll('.process-step-card .step-image-container').forEach((card, idx) => {
    card.addEventListener('click', () => {
      const img = card.querySelector('img');
      if (img) {
        lightboxImg.src = img.src;
        caption.textContent = `સ્ટેપ ${idx + 1} વિગતવાર સ્ક્રીનશોટ`;
        modal.classList.add('open');
      }
    });
  });

  const closeModal = () => modal.classList.remove('open');
  if (closeBtn) closeBtn.addEventListener('click', closeModal);
  if (overlay) overlay.addEventListener('click', closeModal);
}

// --- Skeleton Loading Placeholders ---
function generateSkeletonHTML(type, count) {
  let items = '';
  for (let i = 0; i < count; i++) {
    switch (type) {
      case 'stat-card':
        items += `
          <div class="skeleton-stat-card">
            <div class="skeleton-bone skeleton-circle"></div>
            <div class="skeleton-info">
              <div class="skeleton-bone skeleton-text w-70"></div>
              <div class="skeleton-bone skeleton-text w-50"></div>
            </div>
          </div>`;
        break;
      case 'household-card':
        items += `
          <div class="skeleton-household-card">
            <div class="skeleton-hc-header">
              <div class="skeleton-bone skeleton-text w-50"></div>
              <div class="skeleton-bone skeleton-text w-30" style="height:20px;"></div>
            </div>
            <div class="skeleton-hc-body">
              <div class="skeleton-bone skeleton-text w-40" style="height:10px; margin-bottom:4px;"></div>
              <div class="skeleton-member-row">
                <div class="skeleton-member-left">
                  <div class="skeleton-bone" style="width:18px;height:18px;border-radius:50%;"></div>
                  <div class="skeleton-bone skeleton-text w-70"></div>
                </div>
                <div class="skeleton-bone skeleton-text" style="width:70px;"></div>
              </div>
            </div>
            <div class="skeleton-hc-footer">
              <div class="skeleton-bone skeleton-text w-40" style="height:10px;"></div>
              <div class="skeleton-bone skeleton-text w-30" style="height:10px;"></div>
            </div>
          </div>`;
        break;
      case 'kpi-card':
        items += `
          <div class="skeleton-kpi-card" style="padding:15px; border-radius:10px; background:rgba(255,255,255,0.05); margin-bottom:10px;">
            <div class="skeleton-bone skeleton-text w-60" style="height:14px; margin-bottom:8px;"></div>
            <div class="skeleton-bone skeleton-text w-40" style="height:24px; margin-bottom:8px;"></div>
            <div class="skeleton-bone skeleton-text w-50" style="height:12px;"></div>
          </div>`;
        break;
      case 'table-row':
        items += `
          <tr class="skeleton-table-row">
            <td><div class="skeleton-bone skeleton-text" style="width:30px;"></div></td>
            <td><div class="skeleton-bone skeleton-text" style="width:120px;"></div></td>
            <td><div class="skeleton-bone skeleton-text" style="width:90px;"></div></td>
            <td><div class="skeleton-bone skeleton-text" style="width:40px;"></div></td>
            <td><div class="skeleton-bone skeleton-text" style="width:85px;"></div></td>
            <td><div class="skeleton-bone skeleton-text" style="width:70px;height:20px;border-radius:10px;"></div></td>
            <td><div class="skeleton-bone" style="width:36px;height:18px;border-radius:9px;"></div></td>
            <td><div class="skeleton-bone skeleton-text" style="width:50px;height:20px;border-radius:10px;"></div></td>
            <td><div class="skeleton-bone" style="width:36px;height:18px;border-radius:9px;"></div></td>
          </tr>`;
        break;
      case 'shared-mobile':
        items += `
          <div class="skeleton-shared-mobile" style="padding:10px; margin-bottom:8px; background:rgba(255,255,255,0.02); border-radius:6px;">
            <div class="skeleton-bone skeleton-text w-40" style="height:14px; margin-bottom:6px;"></div>
            <div class="skeleton-bone skeleton-text w-70" style="height:10px;"></div>
          </div>`;
        break;
      case 'breakdown-card':
        items += `
          <div class="skeleton-breakdown-card" style="padding:12px; background:rgba(255,255,255,0.03); border-radius:8px; text-align:center;">
            <div class="skeleton-bone skeleton-text w-50" style="height:20px; margin:0 auto 8px auto;"></div>
            <div class="skeleton-bone skeleton-text w-70" style="height:12px; margin:0 auto;"></div>
          </div>`;
        break;
    }
  }
  return items;
}

function showSkeleton(containerId, type, count, wrapperClass) {
  const container = document.getElementById(containerId);
  if (!container) return;
  if (_activeSkeletons.has(containerId)) return;

  const html = generateSkeletonHTML(type, count);
  container.innerHTML = wrapperClass ? `<div class="skeleton-container ${wrapperClass}">${html}</div>` : `<div class="skeleton-container">${html}</div>`;
  _activeSkeletons.add(containerId);
}

function hideSkeleton(containerId, callback) {
  if (!_activeSkeletons.has(containerId)) {
    if (callback) callback();
    return;
  }
  const container = document.getElementById(containerId);
  if (!container) {
    _activeSkeletons.delete(containerId);
    if (callback) callback();
    return;
  }
  const wrapper = container.querySelector('.skeleton-container');
  if (wrapper) {
    wrapper.classList.add('hiding');
    setTimeout(() => {
      _activeSkeletons.delete(containerId);
      if (callback) callback();
    }, 300);
  } else {
    _activeSkeletons.delete(containerId);
    if (callback) callback();
  }
}

function showInitialSkeletons() {
  _activeSkeletons.add('beneficiaries-list');
}

function hideHomeStatsSkeletons() {
  // Stats grid uses inline shimmery skeleton spans directly in index.html to prevent layout shift.
  // Nothing to animate or hide here.
}

function showAdminSkeletons() {
  showSkeleton('admin-table-body', 'table-row', 8);
  showSkeleton('shared-mobiles-list', 'shared-mobile', 5);

  const familyGrid = document.getElementById('family-breakdown-grid');
  if (familyGrid) {
    familyGrid.innerHTML = `<div class="skeleton-container skeleton-breakdown-grid">${generateSkeletonHTML('breakdown-card', 4)}</div>`;
    _activeSkeletons.add('family-breakdown-grid');
  }

  const cardTypesGrid = document.getElementById('card-types-grid');
  if (cardTypesGrid) {
    cardTypesGrid.innerHTML = `<div class="skeleton-container skeleton-breakdown-grid">${generateSkeletonHTML('breakdown-card', 4)}</div>`;
    _activeSkeletons.add('card-types-grid');
  }
}

function hideAdminKpiSkeletons() {
  // Admin KPI grid uses inline shimmery skeleton spans directly in index.html to prevent layout shift.
  // Nothing to animate or hide here.
}

function initActionCards() {
  const elActionGoToList = document.getElementById('action-go-to-list');
  const elActionGoToProcess = document.getElementById('action-go-to-process');
  const elInfoBtnToProcess = document.getElementById('info-btn-to-process');

  if (elActionGoToList) {
    elActionGoToList.addEventListener('click', () => {
      switchTab('list-tab');
    });
  }

  if (elActionGoToProcess) {
    elActionGoToProcess.addEventListener('click', () => {
      switchTab('process-tab');
    });
  }

  if (elInfoBtnToProcess) {
    elInfoBtnToProcess.addEventListener('click', () => {
      switchTab('process-tab');
    });
  }
}

function initExportModalListeners() {
  const startDateInput = document.getElementById('export-filter-start-date');
  const endDateInput = document.getElementById('export-filter-end-date');
  
  if (startDateInput && endDateInput) {
    startDateInput.addEventListener('change', () => {
      const startVal = startDateInput.value;
      if (startVal) {
        endDateInput.min = startVal;
      } else {
        endDateInput.removeAttribute('min');
      }
    });
    
    endDateInput.addEventListener('change', () => {
      const endVal = endDateInput.value;
      const todayStr = new Date().toISOString().slice(0, 10);
      if (endVal) {
        startDateInput.max = endVal;
      } else {
        startDateInput.max = todayStr;
      }
    });
  }
}

// --- App Bootstrapping ---
document.addEventListener('DOMContentLoaded', async () => {
  initRouter();
  initSearchListeners();
  showInitialSkeletons();
  initAdminAuth();
  initLightbox();
  initActionCards();
  initExportModalListeners();

  const isRestored = await checkAndRestoreAdminSession();
  if (isRestored) {
    const authCard = document.getElementById('admin-auth-card');
    const dashWrapper = document.getElementById('admin-dashboard-wrapper');
    if (authCard) authCard.style.display = 'none';
    if (dashWrapper) dashWrapper.style.display = 'block';
    showAdminSkeletons();
  }

  await loadData();

  if (isRestored) {
    switchTataliSubpage(adminState.activeSubpage || 'dashboard');
  }
  
  startAutoRefresh(); // Start guest polling loop
});

