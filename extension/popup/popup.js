// popup.js

const $ = id => document.getElementById(id);

// --- Theme Management ---
function initTheme() {
    // We enforce dark mode in the new premium UI
    document.documentElement.classList.add('dark');
}

// --- Tab Management ---
function switchTab(tabId) {
    ['apply', 'profile', 'suggest'].forEach(t => {
        const view = $(`view-${t}`);
        const tab = $(`tab-${t}`);
        if (view) view.classList.add('hidden');
        if (tab) tab.className = 'tab-inactive pb-2 text-sm focus:outline-none transition-colors';
    });

    const activeView = $(`view-${tabId}`);
    const activeTab = $(`tab-${tabId}`);

    if (activeView) activeView.classList.remove('hidden');
    if (activeTab) activeTab.className = 'tab-active pb-2 text-sm focus:outline-none transition-colors';
}

$('tab-apply')?.addEventListener('click', () => switchTab('apply'));
$('tab-profile')?.addEventListener('click', () => switchTab('profile'));

// --- Toast ---
function toast(msg, type = 'success') {
    const container = $('toastContainer');
    if (!container) return;

    const el = document.createElement('div');
    el.className = `toast toast-${type} show`;

    const icon = type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️';
    el.innerHTML = `<span>${icon}</span> <span>${msg}</span>`;

    container.appendChild(el);
    setTimeout(() => {
        el.classList.remove('show');
        setTimeout(() => el.remove(), 400); // Wait for transition
    }, 3000);
}

// --- Data Management (Strictly chrome.storage.local) ---
const FIELDS = [
    'firstName', 'lastName', 'email', 'phone', 'city', 'state', 'country', 'zipCode',
    'linkedinUrl', 'portfolioUrl', 'githubUrl',
    'workAuth', 'visaSponsorship', 'backgroundCheck', 'age18',
    'wdSystem', 'wdGovt', 'wdExport', 'wdRelEmployee', 'wdRelGovt',
    'yearsExp', 'salaryExp', 'noticePeriod', 'relocate', 'skillsList',
    'eeoGender', 'eeoRace', 'eeoVeteran', 'prevEmployment', 'nonCompete', 'contactEmployer'
];

let expCount = 0;
let eduCount = 0;
let certCount = 0;

function addExperienceBlock(data = null) {
    const container = $('experienceContainer');
    if (!container) return;

    expCount++;
    const id = expCount;

    const div = document.createElement('div');
    div.className = 'exp-block bg-slate-800/50 p-3 rounded-xl border border-slate-700/50 space-y-3 relative';
    div.innerHTML = `
        <button type="button" onclick="this.parentElement.remove()" class="absolute top-2 right-2 text-red-400 hover:text-red-300 text-sm font-bold">&times;</button>
        <div class="grid grid-cols-2 gap-2 mt-2">
            <input type="text" class="exp-title glass-input w-full rounded-lg py-2 px-3 text-xs" placeholder="Job Title" value="${data && data.title ? data.title : ''}">
            <input type="text" class="exp-company glass-input w-full rounded-lg py-2 px-3 text-xs" placeholder="Company" value="${data && data.company ? data.company : ''}">
            <input type="month" class="exp-start glass-input w-full rounded-lg py-2 px-3 text-xs" placeholder="Start Date" value="${data && data.start ? data.start : ''}">
            <input type="month" class="exp-end glass-input w-full rounded-lg py-2 px-3 text-xs" placeholder="End Date" value="${data && data.end ? data.end : ''}">
            <div class="col-span-2 flex items-center gap-2">
                <input type="checkbox" class="exp-current rounded border-slate-600 bg-slate-800 text-brand-500 h-3.5 w-3.5 focus:ring-brand-500" id="curr_${id}" ${data && data.current ? 'checked' : ''}>
                <label for="curr_${id}" class="text-[10px] text-slate-400">I currently work here</label>
            </div>
            <textarea class="exp-desc glass-input col-span-2 w-full rounded-lg py-2 px-3 text-xs" placeholder="Description of role..." rows="2">${data && data.description ? data.description : ''}</textarea>
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

function addEducationBlock(data = null) {
    const container = $('educationContainer');
    if (!container) return;

    eduCount++;
    const id = eduCount;

    const div = document.createElement('div');
    div.className = 'edu-block bg-slate-800/50 p-3 rounded-xl border border-slate-700/50 space-y-3 relative';
    div.innerHTML = `
        <button type="button" onclick="this.parentElement.remove()" class="absolute top-2 right-2 text-red-400 hover:text-red-300 text-sm font-bold">&times;</button>
        <div class="grid grid-cols-2 gap-2 mt-2">
            <select class="edu-level glass-input col-span-2 w-full rounded-lg py-2 px-3 text-xs bg-slate-800 text-white border-0">
                <option value="Bachelors" ${data && data.level === 'Bachelors' ? 'selected' : ''}>Bachelor's Degree</option>
                <option value="Masters" ${data && data.level === 'Masters' ? 'selected' : ''}>Master's Degree</option>
                <option value="PhD" ${data && data.level === 'PhD' ? 'selected' : ''}>PhD</option>
                <option value="High School" ${data && data.level === 'High School' ? 'selected' : ''}>High School</option>
            </select>
            <input type="text" class="edu-university glass-input col-span-2 w-full rounded-lg py-2 px-3 text-xs" placeholder="University / School" value="${data && data.university ? data.university : ''}">
            <input type="text" class="edu-degree glass-input w-full rounded-lg py-2 px-3 text-xs" placeholder="Degree / Major" value="${data && data.degree ? data.degree : ''}">
            <input type="number" class="edu-year glass-input w-full rounded-lg py-2 px-3 text-xs" placeholder="Grad Year" value="${data && data.year ? data.year : ''}">
        </div>
    `;
    container.appendChild(div);
}

function getEducations() {
    const blocks = document.querySelectorAll('.edu-block');
    const edus = [];
    blocks.forEach(b => {
        edus.push({
            level: b.querySelector('.edu-level').value,
            university: b.querySelector('.edu-university').value,
            degree: b.querySelector('.edu-degree').value,
            year: b.querySelector('.edu-year').value
        });
    });
    return edus;
}

function addCertBlock(data = null) {
    const container = $('certContainer');
    if (!container) return;

    certCount++;

    const div = document.createElement('div');
    div.className = 'cert-block bg-slate-800/50 p-3 rounded-xl border border-slate-700/50 space-y-3 relative';
    div.innerHTML = `
        <button type="button" onclick="this.parentElement.remove()" class="absolute top-2 right-2 text-red-400 hover:text-red-300 text-sm font-bold">&times;</button>
        <div class="grid grid-cols-2 gap-2 mt-2">
            <input type="text" class="cert-name glass-input col-span-2 w-full rounded-lg py-2 px-3 text-xs" placeholder="Certification Name" value="${data && data.name ? data.name : ''}">
            <input type="text" class="cert-number glass-input col-span-2 w-full rounded-lg py-2 px-3 text-xs" placeholder="Certification Number / ID" value="${data && data.number ? data.number : ''}">
            <input type="month" class="cert-start glass-input w-full rounded-lg py-2 px-3 text-xs" placeholder="Issued Date" value="${data && data.start ? data.start : ''}">
            <input type="month" class="cert-end glass-input w-full rounded-lg py-2 px-3 text-xs" placeholder="Expiration Date" value="${data && data.end ? data.end : ''}">
        </div>
    `;
    container.appendChild(div);
}

function getCerts() {
    const blocks = document.querySelectorAll('.cert-block');
    const certs = [];
    blocks.forEach(b => {
        certs.push({
            name: b.querySelector('.cert-name').value,
            number: b.querySelector('.cert-number').value,
            start: b.querySelector('.cert-start').value,
            end: b.querySelector('.cert-end').value
        });
    });
    return certs;
}

async function loadProfile() {
    try {
        const result = await chrome.storage.local.get(['profileData']);
        const data = result.profileData || {};
        FIELDS.forEach(f => {
            if ($(f) && data[f]) $(f).value = data[f];
        });

        const expContainer = $('experienceContainer');
        if (expContainer) {
            expContainer.innerHTML = '';
            if (data.experiences && Array.isArray(data.experiences)) {
                data.experiences.forEach(exp => addExperienceBlock(exp));
            }
        }

        const eduContainer = $('educationContainer');
        if (eduContainer) {
            eduContainer.innerHTML = '';
            if (data.educations && Array.isArray(data.educations)) {
                data.educations.forEach(edu => addEducationBlock(edu));
            }
        }

        const certContainer = $('certContainer');
        if (certContainer) {
            certContainer.innerHTML = '';
            if (data.certifications && Array.isArray(data.certifications)) {
                data.certifications.forEach(cert => addCertBlock(cert));
            }
        }
    } catch (e) {
        console.error("Failed to load local profile", e);
    }
}

$('profileForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
        const data = {};
        FIELDS.forEach(f => {
            if ($(f)) data[f] = $(f).value;
        });

        data.experiences = getExperiences();
        data.educations = getEducations();
        data.certifications = getCerts();

        const submitBtn = e.target.querySelector('button[type="submit"]');
        const originalHtml = submitBtn.innerHTML;
        submitBtn.innerHTML = '<span class="animate-pulse">Encrypting...</span>';

        await chrome.storage.local.set({ profileData: data });
        toast('Vault Encrypted & Saved', 'success');

        setTimeout(() => submitBtn.innerHTML = originalHtml, 500);
    } catch (err) {
        toast('❌ Failed to save', 'error');
    }
});

$('addExpBtn')?.addEventListener('click', () => addExperienceBlock());
$('addEduBtn')?.addEventListener('click', () => addEducationBlock());
$('addCertBtn')?.addEventListener('click', () => addCertBlock());


$('clearDataBtn')?.addEventListener('click', async () => {
    if (confirm("Are you sure you want to completely wipe your profile from memory?")) {
        await chrome.storage.local.remove(['profileData']);
        FIELDS.forEach(f => { if ($(f)) $(f).value = ''; });
        toast('🗑️ Data wiped successfully', 'info');
    }
});

// --- Content Script Injection ---
$('injectBtn')?.addEventListener('click', async () => {
    const btn = $('injectBtn');
    const btnText = $('injectBtnText');
    const originalText = btnText ? btnText.textContent : 'Inject Local Profile';

    try {
        // Trigger pulse animation
        btn.classList.add('injecting');
        if (btnText) btnText.textContent = 'Injecting...';

        // Get the active tab
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        if (!tab || !tab.url || tab.url.startsWith('chrome://')) {
            toast('Cannot run on internal Chrome pages.', 'error');
            resetBtn(btn, btnText, originalText);
            return;
        }

        // Programmatically execute the auto-fill script on the current page
        await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['content_scripts/autofill.js']
        });

        if (btnText) btnText.textContent = 'Injection Complete!';
        setTimeout(() => {
            resetBtn(btn, btnText, originalText);
        }, 1500);

    } catch (e) {
        console.error("Injection failed: ", e);
        toast('Failed to inject script into this tab.', 'error');
        resetBtn(btn, btnText, originalText);
    }
});

function resetBtn(btn, btnText, originalText) {
    btn.classList.remove('injecting');
    if (btnText) btnText.textContent = originalText;
}

// Initialization
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    loadProfile();
});

// --- Role Suggestions ---
$('suggestForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fileInput = $('resumeFile');
    if (!fileInput.files.length) return;

    const { profileData } = await chrome.storage.local.get(['profileData']);

    const btn = $('suggestBtn');
    const btnText = $('suggestBtnText');
    const originalText = btnText.textContent;
    const resultsContainer = $('suggestResults');
    const rolesList = $('rolesList');

    try {
        btn.disabled = true;
        btnText.textContent = 'Analyzing Resume...';
        btn.classList.add('opacity-75');

        resultsContainer.classList.add('hidden');
        rolesList.innerHTML = '';

        const formData = new FormData();
        formData.append('file', fileInput.files[0]);

        const res = await fetch('http://localhost:8000/api/suggest-roles', {
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
            pill.className = 'px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-full text-xs font-medium text-indigo-300 hover:bg-slate-700 hover:text-white cursor-pointer transition-colors';
            pill.textContent = role;
            pill.title = "Click to copy";
            pill.addEventListener('click', () => {
                navigator.clipboard.writeText(role);
                toast(`Copied "${role}"`);
            });
            rolesList.appendChild(pill);
        });

        resultsContainer.classList.remove('hidden');
        toast('Roles successfully extracted!');

    } catch (err) {
        toast(err.message, 'error');
        console.error(err);
    } finally {
        btn.disabled = false;
        btnText.textContent = originalText;
        btn.classList.remove('opacity-75');
    }
});
