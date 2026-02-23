// autofill.js
// Content script injected into Job Boards

console.log("Sidekick Auto-fill Script Injected.");

// Wait a tiny bit to ensure the DOM is ready (some SPA ATS forms load dynamically)
setTimeout(() => {
    chrome.storage.local.get(["profileData"], (result) => {
        const data = result.profileData;
        if (!data) return;

        console.log("Sidekick: Loaded Profile Data from local storage.");
        autoFillForm(data);
        injectHumanReviewBanner();
        enforceHardStop();
    });
}, 1000);

function autoFillForm(data) {
    // Basic mapping of common field names/ids to our data points
    // This handles many standard forms like Workday, Greenhouse, etc.
    const fieldMap = {
        'first_name': data.fullName ? data.fullName.split(' ')[0] : '',
        'last_name': data.fullName ? data.fullName.split(' ').slice(1).join(' ') : '',
        'name': data.fullName || '',
        'email': data.email || '',
        'phone': data.phone || '',
        'linkedin': data.linkedinUrl || '',
        'url': data.portfolioUrl || '',
        'website': data.portfolioUrl || '',
        'experience': data.yearsExp || ''
    };

    const inputs = document.querySelectorAll('input:not([type="hidden"]), textarea');
    let filledCount = 0;

    inputs.forEach(input => {
        const name = (input.name || input.id || input.placeholder || '').toLowerCase();

        // Find matching key
        for (const [key, val] of Object.entries(fieldMap)) {
            if (val && name.includes(key) && !input.value) {
                input.value = val;

                // Dispatch events to trigger SPA framework bindings (React, Angular)
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));

                // Visual cue
                input.style.backgroundColor = '#e0e7ff'; // light indigo

                filledCount++;
                break;
            }
        }
    });

    console.log(`Sidekick: Auto-filled ${filledCount} fields.`);
}

function enforceHardStop() {
    // Explicitly program the script to find Submit buttons to highlight them, 
    // but absolutely refuse to call .click()
    const submitKeywords = ['submit', 'apply', 'complete'];
    const buttons = document.querySelectorAll('button, input[type="submit"]');

    buttons.forEach(btn => {
        const text = (btn.textContent || btn.value || '').toLowerCase();
        if (submitKeywords.some(kw => text.includes(kw))) {
            // Highlight the button aggressively so the user knows where it is
            btn.style.boxShadow = '0 0 15px 4px #10b981'; // bright green glow
            btn.style.border = '2px solid #10b981';

            // Log the hard stop logic explicitly
            console.log("Sidekick [HARD STOP]: Identified submit button but actively refusing to click it. Human review required.");
        }
    });
}

function injectHumanReviewBanner() {
    const banner = document.createElement('div');
    banner.style.position = 'fixed';
    banner.style.bottom = '0';
    banner.style.left = '0';
    banner.style.width = '100%';
    banner.style.backgroundColor = '#312e81'; // indigo-900
    banner.style.color = 'white';
    banner.style.padding = '12px 24px';
    banner.style.textAlign = 'center';
    banner.style.fontFamily = 'system-ui, -apple-system, sans-serif';
    banner.style.fontWeight = '600';
    banner.style.zIndex = '999999';
    banner.style.boxShadow = '0 -4px 6px -1px rgba(0, 0, 0, 0.1)';
    banner.style.display = 'flex';
    banner.style.justifyContent = 'space-between';
    banner.style.alignItems = 'center';

    banner.innerHTML = `
        <div style="flex: 1; text-align: left;">
            <strong style="color: #818cf8;">🦸 Sidekick Assistant:</strong> 
            Form fields typed. <span style="color: #fca5a5;">Please human-review your data.</span>
        </div>
        <div style="font-size: 0.85em; opacity: 0.8;">
            We highlighted the Submit button for you. We will never click it automatically.
        </div>
        <button id="sk-dismiss-btn" style="background: transparent; border: 1px solid white; color: white; padding: 4px 12px; border-radius: 4px; cursor: pointer; margin-left: 20px;">
            Dismiss
        </button>
    `;

    document.body.appendChild(banner);

    document.getElementById('sk-dismiss-btn').addEventListener('click', () => {
        banner.remove();
    });
}
