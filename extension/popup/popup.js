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
$('tab-suggest')?.addEventListener('click', () => switchTab('suggest'));

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
const FIELDS = ['fullName', 'email', 'phone', 'linkedinUrl', 'portfolioUrl', 'yearsExp'];

async function loadProfile() {
    try {
        const result = await chrome.storage.local.get(['profileData']);
        const data = result.profileData || {};
        FIELDS.forEach(f => {
            if ($(f) && data[f]) $(f).value = data[f];
        });
    } catch (e) {
        console.error("Failed to load local profile", e);
    }
}

$('profileForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = {};
    FIELDS.forEach(f => {
        if ($(f)) data[f] = $(f).value;
    });

    try {
        await chrome.storage.local.set({ profileData: data });
        toast('✅ Saved safely to local browser storage', 'success');
        setTimeout(() => switchTab('apply'), 800);
    } catch (err) {
        toast('❌ Error saving data', 'error');
    }
});

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

    // Grab the user's gemini key from local storage if available. 
    // This allows the extension to query without needing a backend session.
    const { profileData } = await chrome.storage.local.get(['profileData']);
    const geminiKey = profileData?.geminiKey;

    // Quick prompt if not stored
    const finalKey = geminiKey || prompt("Please provide a Gemini API Key to use this feature:");
    if (!finalKey) {
        toast('Gemini SDK key is required.', 'error');
        return;
    }

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
        formData.append('gemini_key', finalKey);

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
