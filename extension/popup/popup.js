// popup.js

const $ = id => document.getElementById(id);

// --- Theme Management ---
function initTheme() {
    // We enforce dark mode in the new premium UI
    document.documentElement.classList.add('dark');
}

// --- Tab Management ---
function switchTab(tabId) {
    ['apply', 'profile'].forEach(t => {
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
