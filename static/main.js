const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

let S = { sid: null };
let _jobs = [];
let _selectedIds = new Set();
let _sources = [];

const SOURCES_LIST = [
  { id: 'Naukri.com', icon: '🇮🇳' }, { id: 'LinkedIn', icon: '🔗' },
  { id: 'Indeed', icon: '🏷' }, { id: 'Hirist', icon: '💼' },
  { id: 'Glassdoor', icon: '🚪' }, { id: 'Cutshort', icon: '⚡' },
  { id: 'Wellfound', icon: '🚀' }, { id: 'Apna', icon: '📱' },
  { id: 'WorkIndia', icon: '🪪' }, { id: 'Career site', icon: '🏢' }
];

function toast(msg, type = 'info') {
  const c = $('toastContainer');
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = msg;
  c.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, 3500);
}

function switchTab(tabId) {
  ['profile', 'search', 'applied'].forEach(t => {
    const view = $(`view-${t}`);
    const tab = $(`tab-${t}`);
    if (view) view.classList.add('hidden');
    if (tab) tab.className = 'tab-inactive pb-4 px-1 text-sm focus:outline-none transition-colors';
  });

  const activeView = $(`view-${tabId}`);
  const activeTab = $(`tab-${tabId}`);

  if (activeView) activeView.classList.remove('hidden');
  if (activeTab) activeTab.className = 'tab-active pb-4 px-1 text-sm focus:outline-none transition-colors';

  // Hide navigation tabs when in profile view
  const navTabs = $('navTabs');
  if (navTabs) {
    if (tabId === 'profile') navTabs.classList.add('hidden');
    else navTabs.classList.remove('hidden');
  }
}

function initTheme() {
  const isDark = document.documentElement.classList.contains('dark');
  if ($('themeIconDark')) $('themeIconDark').classList.toggle('hidden', isDark);
  if ($('themeIconLight')) $('themeIconLight').classList.toggle('hidden', !isDark);
}

function toggleTheme() {
  const isDark = document.documentElement.classList.toggle('dark');
  localStorage.theme = isDark ? 'dark' : 'light';
  initTheme();
}

async function initSession() {
  let sid = sessionStorage.getItem('jha_sid');
  if (!sid) {
    const res = await fetch('/api/session/new', { method: 'POST' });
    const data = await res.json();
    sid = data.session_id;
    sessionStorage.setItem('jha_sid', sid);
  }
  S.sid = sid;

  if ($('sessionBadge')) $('sessionBadge').textContent = `Session: ${sid.slice(0, 8)}`;
  loadProfile();
  renderSourcesGrid();
}

async function loadProfile() {
  try {
    const res = await fetch(`/api/session/${S.sid}`);
    if (!res.ok) throw new Error("Could not load profile");
    const data = await res.json();

    const fields = ['fullName', 'email', 'phone', 'yearsExp', 'linkedinUrl', 'portfolioUrl', 'baseRole', 'metroRegion'];
    const dbFields = ['full_name', 'email', 'phone', 'years_experience', 'linkedin_url', 'portfolio_url', 'base_job_role', 'target_metro_region'];

    fields.forEach((f, i) => { if ($(f) && data[dbFields[i]]) $(f).value = data[dbFields[i]]; });

    _sources = data.target_sources || [];
    updateSourcesUI();

    if ($('geminiChip')) {
      $('geminiChip').textContent = data.gemini_key_set ? 'Gemini: Set' : 'Gemini: Missing';
      $('geminiChip').className = data.gemini_key_set
        ? 'text-xs font-medium px-3 py-1 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200'
        : 'text-xs font-medium px-3 py-1 rounded-full bg-red-100 text-red-700 border border-red-200';
    }

    if (data.resume_filename) {
      $('resumeStatus').textContent = `✅ ${data.resume_filename} processed`;
      $('resumeStatus').classList.remove('hidden');
    }

    loadLog();
  } catch (e) {
    console.warn("Error loading profile:", e);
  }
}

async function saveGeminiKey() {
  const key = $('geminiKey').value;
  if (!key) return;
  const form = new FormData(); form.append('gemini_key', key);
  try {
    await fetch(`/api/keys/${S.sid}`, { method: 'POST', body: form });
    toast('✅ API Key saved', 'success');
    loadProfile();
  } catch (e) { toast('❌ Error saving key', 'error'); }
}

async function saveProfile(e) {
  e.preventDefault();
  const payload = {
    full_name: $('fullName').value,
    email: $('email').value,
    phone: $('phone').value,
    years_experience: parseInt($('yearsExp').value, 10),
    linkedin_url: $('linkedinUrl').value,
    portfolio_url: $('portfolioUrl').value
  };

  try {
    const res = await fetch(`/api/session/${S.sid}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail && err.detail[0] ? err.detail[0].msg : 'Validation error');
    }
    toast('✅ Profile saved persistently', 'success');
  } catch (err) {
    toast(`❌ ${err.message}`, 'error');
  }
}

async function handleResumeUpload(file) {
  if (!file) return;
  const form = new FormData(); form.append('file', file);
  try {
    const res = await fetch(`/api/resume/${S.sid}`, { method: 'POST', body: form });
    if (!res.ok) throw new Error("Upload failed");
    const data = await res.json();
    $('resumeStatus').textContent = `✅ ${data.filename} processed`;
    $('resumeStatus').classList.remove('hidden');
    toast('✅ Resume uploaded', 'success');
  } catch (e) { toast(`❌ ${e.message}`, 'error'); }
}

function renderSourcesGrid() {
  const grid = $('sourcesGrid');
  if (!grid) return;
  grid.innerHTML = SOURCES_LIST.map(s => `
        <label class="cursor-pointer">
            <input type="checkbox" value="${s.id}" class="peer sr-only" onchange="toggleSource(this)">
            <div class="px-4 py-3 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 peer-checked:border-primary peer-checked:bg-blue-50/50 peer-checked:text-primary transition-all flex flex-col items-center gap-1 text-center">
                <span class="text-xl">${s.icon}</span>
                <span>${s.id}</span>
            </div>
        </label>
    `).join('');
}

function updateSourcesUI() {
  document.querySelectorAll('#sourcesGrid input[type="checkbox"]').forEach(cb => {
    cb.checked = _sources.includes(cb.value);
  });
}

async function toggleSource(cb) {
  _sources = cb.checked ? [..._sources, cb.value] : _sources.filter(s => s !== cb.value);
  await fetch(`/api/session/${S.sid}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ target_sources: _sources })
  });
}

function renderJobCards() {
  const grid = $('jobCards');
  if (!_jobs.length) {
    grid.innerHTML = '<div class="col-span-full text-center text-gray-500 py-12 bg-gray-50 rounded-lg border border-gray-200">No jobs found. Try adjusting your search criteria.</div>';
    return;
  }

  grid.innerHTML = _jobs.map(j => `
        <div class="bg-white border rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow relative ${j.status === 'Applied' ? 'border-emerald-500 bg-emerald-50/10' : 'border-gray-200'}" onclick="toggleJob('${j.id}')">
            <div class="absolute top-5 right-5">
                <input type="checkbox" class="h-5 w-5 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer pointer-events-none" id="cb-${j.id}" ${j.status === 'Applied' ? 'disabled checked' : ''}>
            </div>
            <div class="pr-8">
                <h3 class="text-base font-bold text-gray-900 leading-snug">${esc(j.job_title)}</h3>
                <p class="text-sm font-medium text-gray-600 mt-1">${esc(j.company)} • ${esc(j.location)}</p>
                <div class="mt-3 flex flex-wrap gap-2">
                    <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">${esc(j.source)}</span>
                    <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">${esc(j.salary || 'Salary Undisclosed')}</span>
                    ${j.status === 'Applied' ? '<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-emerald-100 text-emerald-800">✅ Applied</span>' : ''}
                </div>
                <p class="mt-3 text-sm text-gray-500 line-clamp-2">${esc(j.description)}</p>
                <div class="mt-4 flex items-center justify-between">
                    <span class="text-xs text-gray-400">📅 ${esc(j.posted)}</span>
                    <a href="${esc(j.link)}" target="_blank" rel="noopener" class="text-sm font-medium text-primary hover:text-primaryHover" onclick="event.stopPropagation()">View Details →</a>
                </div>
            </div>
        </div>
    `).join('');
}

function updateSelectionBar() {
  const count = _selectedIds.size;
  $('applyBar').classList.toggle('hidden', count === 0);
  if (count) $('selectedCount').textContent = `${count} selected`;
}

function toggleJob(id) {
  const job = _jobs.find(j => j.id === id);
  if (!job || job.status === 'Applied') return;

  if (_selectedIds.has(id)) _selectedIds.delete(id);
  else _selectedIds.add(id);

  $(`cb-${id}`).checked = _selectedIds.has(id);
  updateSelectionBar();
}

function selectAllJobs() {
  _selectedIds.clear();
  _jobs.filter(j => j.status !== 'Applied').forEach(j => { _selectedIds.add(j.id); $(`cb-${j.id}`).checked = true; });
  updateSelectionBar();
}

function clearSelection() {
  _selectedIds.clear();
  _jobs.forEach(j => { if (j.status !== 'Applied' && $(`cb-${j.id}`)) $(`cb-${j.id}`).checked = false; });
  updateSelectionBar();
}

async function runSearch(e) {
  if (e) e.preventDefault();
  const btn = $('startSearchBtn');
  btn.disabled = true;
  btn.innerHTML = '<svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Searching...';
  $('searchStatusText').textContent = 'Expanding roles and scraping active jobs...';

  // Save prefs before searching
  await fetch(`/api/session/${S.sid}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      base_job_role: $('baseRole').value,
      target_metro_region: $('metroRegion').value
    })
  });

  $('resultsContainer').classList.remove('hidden');
  $('jobCards').innerHTML = '<div class="col-span-full py-12 flex justify-center"><div class="animate-pulse flex flex-col items-center"><div class="h-8 w-8 bg-primary rounded-full mb-4"></div><div class="h-4 w-48 bg-gray-200 rounded"></div></div></div>';

  try {
    const res = await fetch(`/api/jobs/search/${S.sid}`, { method: 'POST' });
    if (!res.ok) throw new Error("Search failed");
    const data = await res.json();

    _jobs = data.jobs || [];
    _selectedIds.clear();
    updateSelectionBar();
    renderJobCards();

    $('searchStatusText').textContent = `Found ${_jobs.length} jobs.`;
    toast(`✅ ${_jobs.length} jobs retrieved`, 'success');
  } catch (err) {
    $('searchStatusText').textContent = 'Search failed.';
    toast(`❌ ${err.message}`, 'error');
    $('jobCards').innerHTML = '';
  } finally {
    btn.disabled = false;
    btn.innerHTML = 'Find Jobs';
  }
}

async function applySelected() {
  if (!_selectedIds.size) return;
  const btn = $('applyBtn');
  btn.disabled = true; btn.innerHTML = 'Applying...';

  try {
    const res = await fetch(`/api/jobs/apply/${S.sid}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ job_ids: [..._selectedIds] })
    });
    const data = await res.json();
    if (!res.ok) throw new Error("Apply failed");

    const applied = data.applied || [];
    applied.forEach(j => { if (j.link) window.open(j.link, '_blank', 'noopener'); });

    toast(`✅ ${data.applied_count} applications logged`, 'success');

    // Refresh state
    _selectedIds.forEach(id => {
      const j = _jobs.find(x => x.id === id);
      if (j) j.status = 'Applied';
    });
    _selectedIds.clear();
    updateSelectionBar();
    renderJobCards();
    loadLog();

  } catch (err) { toast(`❌ ${err.message}`, 'error'); }
  finally { btn.disabled = false; btn.innerHTML = '<span>🚀</span> Apply Now'; }
}

async function loadLog() {
  try {
    const res = await fetch(`/api/log/${S.sid}`);
    const rows = await res.json();

    const tbody = $('reportBody');
    if (!rows.length) {
      $('reportTable').classList.add('hidden');
      $('emptyReport').classList.remove('hidden');
      return;
    }

    $('reportTable').classList.remove('hidden');
    $('emptyReport').classList.add('hidden');

    tbody.innerHTML = rows.map(r => `
            <tr>
                <td class="px-6 py-4 whitespace-nowrap"><a href="${esc(r.link)}" target="_blank" class="text-primary hover:underline font-medium">${esc(r.job_title)}</a></td>
                <td class="px-6 py-4 whitespace-nowrap text-gray-500">${esc(r.company)}</td>
                <td class="px-6 py-4 whitespace-nowrap text-gray-500">${esc(r.source)}</td>
                <td class="px-6 py-4 whitespace-nowrap"><span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">Applied</span></td>
            </tr>
        `).join('');
  } catch (e) { console.error("Could not load logs"); }
}

async function clearLog() {
  await fetch(`/api/log/${S.sid}`, { method: 'DELETE' });
  loadLog();
  toast('History cleared', 'info');
}

window.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initSession();
});
