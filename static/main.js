const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

let S = { sid: null };
let _jobs = [];
let _selectedIds = new Set();
let _sources = [];

const SOURCES_LIST = [
  { id: 'Naukri', img: 'naukri.png' },
  { id: 'LinkedIn', img: 'liinkedin.png' },
  { id: 'Indeed', img: 'indeed.png' },
  { id: 'Hirist', img: 'hirest.png' },
  { id: 'Glassdoor', img: 'glassdoor.png' },
  { id: 'Cutshort', img: 'cutshort.png' },
  { id: 'Wellfound', img: 'wellfound.png' },
  { id: 'Apna', img: 'apna.png' },
  { id: 'WorkIndia', img: 'work india.png' },
  { id: 'Careersite', img: 'carrier_site.png' }
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
  ['profile', 'search', 'applied', 'suggest', 'analyzer'].forEach(t => {
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

const FIELDS = [
  'firstName', 'lastName', 'email', 'phone', 'city', 'state', 'country', 'zipCode',
  'linkedinUrl', 'portfolioUrl', 'githubUrl',
  'workAuth', 'visaSponsorship', 'backgroundCheck', 'age18',
  'educationLevel', 'university', 'degree', 'gradYear', 'yearsExp', 'salaryExp', 'noticePeriod', 'relocate',
  'eeoGender', 'eeoRace', 'eeoVeteran', 'prevEmployment', 'nonCompete', 'contactEmployer'
];

let expCount = 0;

function addExperienceBlock(data = null) {
  const container = $('experienceContainer');
  if (!container) return;

  expCount++;
  const id = expCount;

  const div = document.createElement('div');
  div.className = 'exp-block p-4 border border-gray-200 dark:border-gray-700 rounded-lg space-y-3 relative bg-white dark:bg-gray-800';
  div.innerHTML = `
        <button type="button" onclick="this.parentElement.remove()" class="absolute top-2 right-2 text-red-500 hover:text-red-700 text-sm font-bold">&times;</button>
        <div class="grid grid-cols-2 gap-3">
            <input type="text" class="exp-title block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm border px-3 py-2 sm:text-sm" placeholder="Job Title" value="${data && data.title ? data.title : ''}">
            <input type="text" class="exp-company block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm border px-3 py-2 sm:text-sm" placeholder="Company" value="${data && data.company ? data.company : ''}">
            <input type="text" class="exp-start block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm border px-3 py-2 sm:text-sm" placeholder="Start Date (MM/YYYY)" value="${data && data.start ? data.start : ''}">
            <input type="text" class="exp-end block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm border px-3 py-2 sm:text-sm" placeholder="End Date" value="${data && data.end ? data.end : ''}">
            <div class="col-span-2 flex items-center gap-2 mt-1">
                <input type="checkbox" class="exp-current rounded border-gray-300 text-primary focus:ring-primary h-4 w-4" id="curr_${id}" ${data && data.current ? 'checked' : ''}>
                <label for="curr_${id}" class="text-xs font-medium text-gray-600 dark:text-gray-400">I currently work here</label>
            </div>
            <textarea class="exp-desc col-span-2 block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm border px-3 py-2 sm:text-sm" placeholder="Description of role..." rows="2">${data && data.description ? data.description : ''}</textarea>
        </div>
    `;
  container.appendChild(div);
}

function getExperiences() {
  const blocks = document.querySelectorAll('.exp-block');
  const exps = [];
  blocks.forEach(b => {
    exps.push({
      title: b.querySelector('.exp-title').value,
      company: b.querySelector('.exp-company').value,
      start: b.querySelector('.exp-start').value,
      end: b.querySelector('.exp-end').value,
      current: b.querySelector('.exp-current').checked,
      description: b.querySelector('.exp-desc').value
    });
  });
  return exps;
}

async function loadProfile() {
  try {
    const res = await fetch(`/api/session/${S.sid}`);
    if (!res.ok) throw new Error("Could not load profile");
    const data = await res.json();

    FIELDS.forEach(f => {
      if ($(f) && data[f]) $(f).value = data[f];
    });

    if ($('baseRole') && data.base_job_role) $('baseRole').value = data.base_job_role;
    if ($('metroRegion') && data.target_metro_region) $('metroRegion').value = data.target_metro_region;

    const expContainer = $('experienceContainer');
    if (expContainer) {
      expContainer.innerHTML = '';
      if (data.experiences && Array.isArray(data.experiences)) {
        data.experiences.forEach(exp => addExperienceBlock(exp));
      }
    }

    _sources = data.target_sources || [];
    updateSourcesUI();



    if (data.resume_filename) {
      $('resumeStatus').textContent = `✅ ${data.resume_filename} processed`;
      $('resumeStatus').classList.remove('hidden');
    }

    loadLog();
  } catch (e) {
    console.warn("Error loading profile:", e);
  }
}



async function saveProfile(e) {
  e.preventDefault();
  const payload = {};
  FIELDS.forEach(f => {
    if ($(f)) payload[f] = $(f).value;
  });

  if ($('baseRole')) payload.base_job_role = $('baseRole').value;
  if ($('metroRegion')) payload.target_metro_region = $('metroRegion').value;

  payload.experiences = getExperiences();

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
            <div class="px-4 py-3 bg-white border border-gray-200 dark:bg-gray-800 dark:border-gray-700 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 peer-checked:border-primary peer-checked:bg-blue-50/50 dark:peer-checked:bg-blue-900/40 peer-checked:text-primary transition-all flex flex-col items-center gap-2 text-center h-full justify-center">
                <div class="bg-white p-1 rounded-md shadow-sm h-10 w-10 flex items-center justify-center">
                    <img src="/static/images/logos/${s.img}" class="h-8 w-auto object-contain max-w-[32px]" alt="${s.id} Logo" onerror="this.onerror=null; this.src='/static/logowithtext.png';">
                </div>
                <span class="mt-1">${s.id}</span>
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

  const roleInput = $('baseRole').value.trim();
  const regionInput = $('metroRegion').value.trim();

  if (!roleInput || !regionInput) {
    toast("Please enter a Target Job Role and Location in the Setup tab before searching!", "error");
    return;
  }

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

// ─────────────────────────────────────────────
// Role Suggestions
// ─────────────────────────────────────────────
const suggestFormWeb = $('suggestFormWeb');
if (suggestFormWeb) {
  suggestFormWeb.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (!S.sid) {
      toast("Session not ready.", 'error');
      return;
    }

    const fileInput = $('resumeFileWeb');
    if (!fileInput.files.length) return;

    const btn = $('suggestBtnWeb');
    const btnText = $('suggestBtnTextWeb');
    const originalText = btnText.textContent;
    const resultsContainer = $('suggestResultsWeb');
    const rolesList = $('rolesListWeb');

    try {
      const formData = new FormData();
      formData.append('file', fileInput.files[0]);

      // Pass the current search role as context if it exists
      const baseRoleInput = $('baseRole');
      if (baseRoleInput && baseRoleInput.value.trim()) {
        formData.append('target_role', baseRoleInput.value.trim());
      }

      const res = await fetch('/api/suggest-roles', {
        method: 'POST',
        body: formData
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Failed to fetch suggestions');
      }

      const data = await res.json();
      const roles = data.roles || [];

      if (roles.length === 0) {
        throw new Error("No roles could be identified.");
      }

      // Render Roles
      roles.forEach(role => {
        const pill = document.createElement('div');
        pill.className = 'px-4 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 border border-gray-200 dark:border-gray-600 rounded-full text-sm font-medium text-gray-800 dark:text-gray-200 cursor-pointer transition-colors';
        pill.textContent = role;
        pill.title = "Click to set as Base Role";
        pill.addEventListener('click', async () => {
          navigator.clipboard.writeText(role);
          toast(`Copied "${role}"`);

          // Auto-fill the search input
          if ($('baseRole')) {
            $('baseRole').value = role;
            // Save to session immediately
            const fd = new FormData();
            fd.append("base_job_role", role);
            await fetch(`/api/session/${S.sid}`, { method: "POST", body: fd });

            toast(`Set "${role}" as your Search Target.`, 'info');
          }
        });
        rolesList.appendChild(pill);
      });

      resultsContainer.classList.remove('hidden');
      toast('Roles successfully extracted!', 'success');

    } catch (err) {
      toast(err.message, 'error');
      console.error(err);
    } finally {
      btn.disabled = false;
      btnText.textContent = originalText;
      btn.classList.remove('opacity-75');
    }
  });
}

// ─────────────────────────────────────────────
//  Job Analyzer (Phase 14)
// ─────────────────────────────────────────────

async function runAnalyzer(type) {
  const jd = $('analyzerJd').value.trim();
  if (!jd) return toast('Please paste a job description first', 'error');

  const profile_data = {};
  FIELDS.forEach(f => {
    if ($(f)) profile_data[f] = $(f).value;
  });
  profile_data.experiences = getExperiences();

  if ($('skills')) profile_data.skills = $('skills').value;
  if ($('baseRole')) profile_data.base_job_role = $('baseRole').value;
  if ($('metroRegion')) profile_data.target_metro_region = $('metroRegion').value;

  const out = $('analyzerOutput');
  const spinner = $('analyzerSpinner');
  spinner.classList.remove('hidden');

  if (type === 'vibe') {
    out.innerHTML = `<div class="h-full flex items-center justify-center text-gray-500">Scanning JD for Red Flags and missing Skills...</div>`;
  } else {
    out.innerHTML = `<div class="h-full flex flex-col items-center justify-center text-gray-500 gap-2"><div class="animate-pulse">Gemini is thinking...</div><div class="text-xs max-w-sm text-center">Crafting hyper-personalized response based on your profile.</div></div>`;
  }

  try {
    if (type === 'vibe') {
      const res = await fetch(`/api/ai/analyze-job/${S.sid}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_description: jd.substring(0, 5000), profile_data })
      });
      const data = await res.json();

      let html = `
        <div class="mb-5 flex items-center justify-between bg-gray-100 dark:bg-gray-800 p-5 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
          <span class="font-bold text-gray-700 dark:text-gray-300">Match Score</span>
          <span class="text-4xl font-black tracking-tight ${data.match_score > 75 ? 'text-green-500' : data.match_score > 50 ? 'text-amber-500' : 'text-red-500'}">${data.match_score}%</span>
        </div>
      `;

      if (data.missing_keywords && data.missing_keywords.length > 0) {
        html += `
          <div class="mb-5">
            <h4 class="text-xs font-bold text-indigo-500 uppercase tracking-widest mb-3 flex items-center gap-2"><span class="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>Skill Gaps Identified</h4>
            <div class="flex flex-wrap gap-2">
              ${data.missing_keywords.map(kw => `<span class="bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800/50 px-3 py-1.5 rounded-lg text-xs font-semibold shadow-sm">${kw}</span>`).join('')}
            </div>
          </div>
        `;
      }
      if (data.red_flags && data.red_flags.length > 0) {
        html += `
          <div class="mt-6 border-t border-amber-200 dark:border-amber-900/50 pt-5">
            <h4 class="text-xs font-bold text-amber-600 uppercase tracking-widest mb-3 flex items-center gap-2">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
              Toxic Workplace Warnings
            </h4>
            <ul class="space-y-2">
              ${data.red_flags.map(f => `<li class="flex items-start gap-2 text-sm text-amber-800 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 p-3 rounded-lg border border-amber-100 dark:border-amber-800/30">
                <span class="text-amber-500 mt-0.5">•</span>
                <span class="leading-relaxed">${f}</span>
              </li>`).join('')}
            </ul>
          </div>
        `;
      }
      out.innerHTML = html;

    } else if (type === 'prep') {
      const res = await fetch(`/api/ai/interview-prep/${S.sid}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_description: jd.substring(0, 5000) })
      });
      const data = await res.json();

      out.innerHTML = `
        <h4 class="text-sm font-bold text-blue-600 dark:text-blue-400 mb-4 uppercase tracking-wider flex items-center gap-2">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"></path></svg>
          Highly Probable Technical Questions
        </h4>
        <div class="space-y-4">
          ${data.questions.map((q, i) => `
            <div class="bg-white dark:bg-gray-800 p-5 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm transition-all hover:shadow-md">
              <p class="font-bold text-gray-900 dark:text-white mb-3 text-sm leading-relaxed"><span class="text-blue-500 mr-2 border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 rounded text-xs">Q${i + 1}</span> ${q.question}</p>
              <div class="bg-gray-50 dark:bg-gray-900/50 p-3 rounded-lg border border-gray-100 dark:border-gray-800">
                <p class="text-xs font-semibold tracking-wider text-gray-500 uppercase mb-1">How to answer</p>
                <p class="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">${q.answer_guide}</p>
              </div>
            </div>
          `).join('')}
        </div>
      `;
    } else {
      const promptContext = type === 'cover' ? 'Cover Letter' : 'Recruiter DM';
      const color = type === 'cover' ? 'emerald' : 'purple';
      const res = await fetch(`/api/ai/generate-text/${S.sid}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt_context: promptContext, job_description: jd.substring(0, 5000), profile_data })
      });
      const data = await res.json();

      out.innerHTML = `
        <div class="flex items-center justify-between mb-4 border-b border-gray-200 dark:border-gray-700 pb-3">
          <h4 class="text-sm font-bold text-${color}-600 dark:text-${color}-400 uppercase tracking-widest flex items-center gap-2">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
            Generated ${promptContext}
          </h4>
          <button onclick="navigator.clipboard.writeText(this.parentElement.nextElementSibling.innerText); toast('Copied to clipboard!', 'success')" class="text-xs font-medium bg-${color}-50 hover:bg-${color}-100 dark:bg-${color}-900/20 dark:hover:bg-${color}-900/40 text-${color}-700 dark:text-${color}-300 px-3 py-1.5 rounded-lg transition-colors border border-${color}-200 dark:border-${color}-800/50 shadow-sm flex items-center gap-1">
            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"></path></svg>
            Copy
          </button>
        </div>
        <div class="bg-gray-100 dark:bg-[#0f172a] p-5 rounded-xl font-mono text-[13px] whitespace-pre-wrap leading-relaxed text-gray-800 dark:text-gray-300 border border-gray-200 dark:border-gray-700 shadow-inner">${data.text}</div>
      `;
    }
  } catch (err) {
    toast("Generation failed. Double check your Gemini API Key is saved in Profile.", "error");
    out.innerHTML = `<div class="h-full flex flex-col items-center justify-center text-red-500 gap-2">
      <svg class="w-10 h-10 mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
      <span class="font-bold">Error generating AI response.</span>
      <span class="text-xs text-red-400">Did you save your Gemini API Key?</span>
    </div>`;
  } finally {
    spinner.classList.add('hidden');
  }
}
