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

function triggerEvents(el) {
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.style.backgroundColor = '#e0e7ff';
    el.style.boxShadow = '0 0 0 2px #4f46e5 inset';
}

function selectOptionByText(select, desiredVal) {
    if (!desiredVal) return false;
    const tgt = desiredVal.toLowerCase();
    for (let i = 0; i < select.options.length; i++) {
        const optText = select.options[i].text.toLowerCase();
        if (optText.includes(tgt) || tgt.includes(optText)) {
            select.selectedIndex = i;
            triggerEvents(select);
            return true;
        }
    }
    return false;
}

function autoFillForm(data) {
    let filledCount = 0;

    // Helper to click "Add Another" buttons if we need more blocks than are currently on the page
    async function ensureBlocksExist(blockSelector, buttonSelectors, targetCount) {
        while (true) {
            let currentBlocks = document.querySelectorAll(blockSelector).length;
            if (currentBlocks >= targetCount) break; // We have enough blocks

            let clicked = false;
            for (const selector of buttonSelectors) {
                const btn = document.querySelector(selector);
                if (btn) {
                    btn.click();
                    clicked = true;
                    // Wait 300ms for the DOM to render the new block
                    await new Promise(r => setTimeout(r, 300));
                    break;
                }
            }

            // If we couldn't find an add button anywhere, break so we don't infinite loop
            if (!clicked) break;
        }
    }

    // 1. Experience & Education Array Logic (Run FIRST before generic text inputs)
    // We wrap this inside an async IIFE so we can await the button clicks
    (async () => {
        if (data.experiences && data.experiences.length > 0) {
            const expBlockSel = '.experience-component, .job-history, [data-qa="experience"], [data-automation-id*="workExperience"], [data-automation-id*="Experience"]';
            const expAddBtns = ['button[data-automation-id="Add Another Work Experience"]', 'button[aria-label="Add Work Experience"]', '.add-experience-button', '[data-qa="add-experience"]'];

            await ensureBlocksExist(expBlockSel, expAddBtns, data.experiences.length);

            const expBlocks = document.querySelectorAll(expBlockSel);
            expBlocks.forEach((block, idx) => {
                const exp = data.experiences[idx];
                if (!exp) return;

                const titleInput = block.querySelector('input[name*="title"], input[id*="title"], [data-automation-id*="title"]');
                if (titleInput && !titleInput.value) { titleInput.value = exp.title; triggerEvents(titleInput); filledCount++; }

                const companyInput = block.querySelector('input[name*="company"], input[id*="company"], [data-automation-id*="company"]');
                if (companyInput && !companyInput.value) { companyInput.value = exp.company; triggerEvents(companyInput); filledCount++; }

                const locInput = block.querySelector('input[name*="location"], input[id*="location"], [data-automation-id*="location"]');
                if (locInput && !locInput.value && data.city) { locInput.value = data.city; triggerEvents(locInput); filledCount++; }

                const startInput = block.querySelector('input[name*="start"], input[id*="start"], [data-automation-id*="fromDate"]');
                if (startInput && !startInput.value) { startInput.value = exp.start; triggerEvents(startInput); filledCount++; }

                const endInput = block.querySelector('input[name*="end"], input[id*="end"], [data-automation-id*="toDate"]');
                if (endInput && !endInput.value) { endInput.value = exp.end; triggerEvents(endInput); filledCount++; }
            });
        }

        if (data.educations && data.educations.length > 0) {
            const eduBlockSel = '.education-component, .education-history, [data-qa="education"], [data-automation-id*="education"]';
            const eduAddBtns = ['button[data-automation-id="Add Another Education"]', 'button[aria-label="Add Education"]', '.add-education-button', '[data-qa="add-education"]'];

            await ensureBlocksExist(eduBlockSel, eduAddBtns, data.educations.length);

            const eduBlocks = document.querySelectorAll(eduBlockSel);
            eduBlocks.forEach((block, idx) => {
                const edu = data.educations[idx];
                if (!edu) return;

                const schoolInput = block.querySelector('input[name*="school"], input[name*="university"], input[id*="university"], [data-automation-id*="school"]');
                if (schoolInput && !schoolInput.value) { schoolInput.value = edu.university; triggerEvents(schoolInput); filledCount++; }

                const degreeInput = block.querySelector('input[name*="degree"], input[name*="major"], [data-automation-id*="degree"]');
                if (degreeInput && !degreeInput.value) { degreeInput.value = edu.degree; triggerEvents(degreeInput); filledCount++; }

                const yearInput = block.querySelector('input[name*="year"], input[name*="grad"], [data-automation-id*="year"]');
                if (yearInput && !yearInput.value) { yearInput.value = edu.year; triggerEvents(yearInput); filledCount++; }
            });
        }

        if (data.certifications && data.certifications.length > 0) {
            const certBlockSel = '.certification-component, .certification-history, [data-qa="certification"], [data-automation-id*="certification"]';
            const certAddBtns = ['button[data-automation-id="Add Another Certification"]', 'button[aria-label="Add Certification"]', '.add-certification-button', '[data-qa="add-certification"]'];

            await ensureBlocksExist(certBlockSel, certAddBtns, data.certifications.length);

            const certBlocks = document.querySelectorAll(certBlockSel);
            certBlocks.forEach((block, idx) => {
                const cert = data.certifications[idx];
                if (!cert) return;

                const nameInput = block.querySelector('input[name*="certification"], input[name*="cert"], input[id*="certification"], [data-automation-id*="certification"]');
                if (nameInput && !nameInput.value) { nameInput.value = cert.name; triggerEvents(nameInput); filledCount++; }

                const numInput = block.querySelector('input[name*="number"], input[name*="license"], input[id*="number"], [data-automation-id*="number"]');
                if (numInput && !numInput.value) { numInput.value = cert.number; triggerEvents(numInput); filledCount++; }

                const startInput = block.querySelector('input[name*="issue"], input[id*="issue"], [data-automation-id*="issue"]');
                if (startInput && !startInput.value) { startInput.value = cert.start; triggerEvents(startInput); filledCount++; }

                const endInput = block.querySelector('input[name*="expir"], input[name*="valid"], input[id*="expir"], [data-automation-id*="expir"]');
                if (endInput && !endInput.value) { endInput.value = cert.end; triggerEvents(endInput); filledCount++; }
            });
        }
    })();

    // 2. Advanced Field Mapping for generic Text Inputs
    const fieldMap = [
        { keys: ['first_name', 'fname', 'first name', 'given name'], exclude: ['local'], val: data.firstName || '' },
        { keys: ['last_name', 'lname', 'last name', 'family name', 'surname'], exclude: ['local'], val: data.lastName || '' },
        { keys: ['name', 'full name'], exclude: ['company', 'middle', 'local', 'first', 'last', 'given', 'family', 'user', 'manager', 'school', 'university', 'preferred'], val: (data.firstName && data.lastName) ? `${data.firstName} ${data.lastName}`.trim() : (data.fullName || '') },
        { keys: ['email', 'e-mail'], val: data.email || '' },
        { keys: ['phone', 'mobile', 'cell', 'telephone'], val: data.phone || '' },
        { keys: ['city', 'location'], val: data.city || '' },
        { keys: ['state', 'province'], val: data.state || '' },
        { keys: ['zip', 'postal'], val: data.zipCode || '' },
        { keys: ['country'], val: data.country || '' },
        { keys: ['linkedin'], val: data.linkedinUrl || '' },
        { keys: ['portfolio', 'website', 'url'], val: data.portfolioUrl || '' },
        { keys: ['github', 'gitlab', 'git'], val: data.githubUrl || '' },
        { keys: ['university', 'college', 'school'], val: data.university || '' },
        { keys: ['degree', 'major', 'concentration'], val: data.degree || '' },
        { keys: ['grad', 'year'], val: data.gradYear ? data.gradYear.toString() : '' },
        { keys: ['salary', 'compensation', 'expectation'], val: data.salaryExp ? data.salaryExp.toString() : '' },
        { keys: ['notice', 'start date', 'available'], val: data.noticePeriod ? data.noticePeriod.toString() : '' },
        { keys: ['experience'], val: data.yearsExp ? data.yearsExp.toString() : '' },
        { keys: ['skills', 'expertise'], val: data.skillsList || '' },
        { keys: ['title', 'role'], val: (data.experiences && data.experiences.length > 0) ? data.experiences[0].title : '' },
        { keys: ['company', 'employer'], val: (data.experiences && data.experiences.length > 0) ? data.experiences[0].company : '' }
    ];

    // Boolean / Dropdown mappings
    const boolMap = [
        { keys: ['sponsor', 'visa'], val: data.visaSponsorship },
        { keys: ['authorize', 'work auth', 'legally auth'], val: data.workAuth },
        { keys: ['background'], val: data.backgroundCheck },
        { keys: ['18', 'older', 'age'], val: data.age18 },
        { keys: ['relocat'], val: data.relocate },
        { keys: ['previous', 'employ'], val: data.prevEmployment },
        { keys: ['compete', 'agreement'], val: data.nonCompete },
        { keys: ['contact', 'employer'], val: data.contactEmployer },
        { keys: ['workday system'], val: data.wdSystem },
        { keys: ['government employee', 'united states government'], val: data.wdGovt },
        { keys: ['export control', 'sanctions', 'cuba', 'iran', 'syria'], val: data.wdExport },
        { keys: ['related to a current workday employee'], val: data.wdRelEmployee },
        { keys: ['related to an employee of a customer', 'government official'], val: data.wdRelGovt }
    ];

    // Evaluate Generic Text Inputs
    const textInputs = document.querySelectorAll('input[type="text"], input[type="email"], input[type="tel"], input[type="url"], input[type="number"], textarea');
    textInputs.forEach(input => {
        const name = (input.name || input.id || input.placeholder || input.getAttribute('aria-label') || '').toLowerCase();

        // Let block logic rule if it already filled this
        if (input.value) return;

        for (const map of fieldMap) {
            const hasMatch = map.keys.some(k => name.includes(k));
            const hasExclude = map.exclude ? map.exclude.some(e => name.includes(e)) : false;

            if (map.val && hasMatch && !hasExclude) {
                input.value = map.val;
                triggerEvents(input);
                filledCount++;
                break;
            }
        }
    });

    // Evaluate Selects / Radios (Knockout & EEO)
    const selects = document.querySelectorAll('select');
    selects.forEach(select => {
        if (select.value && select.value !== "0" && select.value !== "") return; // Skip if already filled

        const name = (select.name || select.id || select.getAttribute('aria-label') || '').toLowerCase();
        const id = select.id;
        let labelText = '';
        if (id) {
            const label = document.querySelector(`label[for="${id}"]`);
            if (label) labelText = label.textContent.toLowerCase();
        }
        const contextText = (name + " " + labelText).toLowerCase();

        let handled = false;
        for (const bm of boolMap) {
            if (bm.val && bm.keys.some(k => contextText.includes(k))) {
                for (let i = 0; i < select.options.length; i++) {
                    const optText = select.options[i].text.toLowerCase();
                    if ((bm.val === 'Yes' && (optText.includes('yes') || optText.includes('true'))) ||
                        (bm.val === 'No' && (optText.includes('no') || optText.includes('false')))) {
                        select.selectedIndex = i;
                        triggerEvents(select);
                        filledCount++;
                        handled = true;
                        break;
                    }
                }
                break;
            }
        }

        if (handled) return;

        // EEO special cases
        if (contextText.includes('gender') || contextText.includes('sex')) {
            if (selectOptionByText(select, data.eeoGender)) filledCount++;
        } else if (contextText.includes('race') || contextText.includes('ethnic')) {
            if (selectOptionByText(select, data.eeoRace)) filledCount++;
        } else if (contextText.includes('veteran')) {
            if (selectOptionByText(select, data.eeoVeteran)) filledCount++;
        } else if (contextText.includes('disability')) {
            if (selectOptionByText(select, data.eeoDisability)) filledCount++;
        } else if (contextText.includes('education') || contextText.includes('degree')) {
            if (selectOptionByText(select, data.educationLevel)) filledCount++;
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
