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
        runVibeCheck(data);
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

        // Phase 13: Dynamic Cover Letter Injection Trigger
        if (input.tagName === 'TEXTAREA' && (name.includes('cover') || name.includes('letter') || name.includes('message to hiring manager'))) {
            injectCoverLetterButton(input, data);
        }

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

            // Phase 13: Auto-Sync Tracker
            btn.addEventListener('click', () => {
                syncApplicationLog();
            });
        }
    });
}

function syncApplicationLog() {
    let company = "Unknown Company";
    let title = document.title.split('-')[0].trim() || "Applied Role";

    // Quick heuristic to grab company name if Lever/Greenhouse/Workday
    const header = document.querySelector('h1, h2, .company-name, [data-automation-id="companyName"]');
    if (header) company = header.innerText.trim();

    fetch('http://localhost:8000/api/sync-tracker', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            company: company,
            title: title,
            url: window.location.href,
            date: new Date().toISOString().split('T')[0]
        })
    }).catch(e => console.error("Sidekick Tracker Sync Failed", e));
}

async function runVibeCheck(profileData) {
    if (!profileData.gemini_key) {
        console.warn("Sidekick: No Gemini Key available for ATS Vibe Check.");
        return;
    }

    // Attempt to scrape job description text from common ATS container classes
    let jdText = "";
    const jdContainers = document.querySelectorAll('.job-description, .posting-requirements, [data-automation="jobDescription"]');
    if (jdContainers.length > 0) {
        jdContainers.forEach(c => jdText += c.innerText + " ");
    } else {
        // Fallback: just grab all body text and truncate it to avoid massive payload
        jdText = document.body.innerText.substring(0, 5000);
    }

    if (!jdText || jdText.length < 100) return;

    try {
        // We need the session_id to properly route the request to the proxy
        const result = await chrome.storage.local.get(["session_id"]);
        const sid = result.session_id || "demo-session";

        const response = await fetch(`http://localhost:8000/api/ai/analyze-job/${sid}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                job_description: jdText,
                profile_data: profileData
            })
        });

        if (response.ok) {
            const analysis = await response.json();
            injectVibeCheckWidget(analysis);
        }
    } catch (e) {
        console.error("Sidekick Vibe Check failed:", e);
    }
}

function injectVibeCheckWidget(analysis) {
    const defaultPic = chrome.runtime.getURL("icons/icon128.png");

    const widget = document.createElement('div');
    widget.style.position = 'fixed';
    widget.style.top = '20px';
    widget.style.right = '20px';
    widget.style.width = '300px';
    widget.style.backgroundColor = '#1e1b4b'; // indigo-950
    widget.style.color = 'white';
    widget.style.padding = '16px';
    widget.style.borderRadius = '12px';
    widget.style.zIndex = '999999';
    widget.style.boxShadow = '0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.1)';
    widget.style.border = '1px solid #3730a3';
    widget.style.fontFamily = 'system-ui, -apple-system, sans-serif';

    let missingHtml = '';
    if (analysis.missing_keywords && analysis.missing_keywords.length > 0) {
        missingHtml = `
            <div style="margin-top: 12px;">
                <p style="font-size: 11px; color: #a5b4fc; text-transform: uppercase; font-weight: bold; margin: 0 0 4px 0;">Missing Keywords</p>
                <div style="display: flex; flex-wrap: wrap; gap: 4px;">
                    ${analysis.missing_keywords.map(kw => `<span style="background: rgba(239, 68, 68, 0.2); color: #fca5a5; padding: 2px 6px; border-radius: 4px; font-size: 11px; border: 1px solid rgba(239, 68, 68, 0.3);">${kw}</span>`).join('')}
                </div>
            </div>
        `;
    }

    let warningHtml = '';
    if (analysis.red_flags && analysis.red_flags.length > 0) {
        warningHtml = `
            <div style="margin-top: 12px; border-top: 1px solid rgba(245, 158, 11, 0.3); padding-top: 8px;">
                <p style="font-size: 11px; color: #fbbf24; text-transform: uppercase; font-weight: bold; margin: 0 0 4px 0; display: flex; align-items: center; gap: 4px;">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
                    Red Flags Detected
                </p>
                <ul style="margin: 0; padding-left: 16px; font-size: 11px; color: #fde68a;">
                    ${analysis.red_flags.map(f => `<li>${f}</li>`).join('')}
                </ul>
            </div>
        `;
    }

    widget.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
            <div style="display: flex; align-items: center; gap: 8px;">
                <img src="${defaultPic}" width="20" height="20" style="border-radius: 4px;" alt="Sidekick">
                <span style="font-size: 14px; font-weight: 700; background: linear-gradient(to right, #818cf8, #c084fc); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">ATS Vibe Check</span>
            </div>
            <button onclick="this.parentElement.parentElement.remove()" style="background:none; border:none; color:#6366f1; cursor:pointer; padding:0; font-size:16px;">&times;</button>
        </div>
        
        <div style="display: flex; align-items: center; justify-content: space-between; background: rgba(0,0,0,0.2); padding: 8px; border-radius: 8px;">
            <span style="font-size: 13px; color: #cbd5e1;">Match Score</span>
            <span style="font-size: 20px; font-weight: 800; color: ${analysis.match_score > 75 ? '#34d399' : analysis.match_score > 50 ? '#fbbf24' : '#f87171'};">${analysis.match_score}%</span>
        </div>

        ${missingHtml}
        ${warningHtml}
        
        <div style="margin-top: 16px; display: flex; gap: 8px;">
            <button id="sk-prep-btn" style="flex: 1; background: #4f46e5; color: white; border: none; padding: 6px 12px; border-radius: 6px; font-size: 11px; font-weight: bold; cursor: pointer; transition: background 0.2s;">Prep Interview</button>
            <button id="sk-dm-btn" style="flex: 1; background: #475569; color: white; border: none; padding: 6px 12px; border-radius: 6px; font-size: 11px; font-weight: bold; cursor: pointer; transition: background 0.2s;">Generate DM</button>
        </div>
        <div id="sk-ai-output" style="margin-top: 12px; font-size: 11px; color: #cbd5e1; white-space: pre-wrap; display: none; background: rgba(0,0,0,0.3); padding: 8px; border-radius: 6px; max-height: 200px; overflow-y: auto;"></div>
    `;

    document.body.appendChild(widget);

    // Attach Event Listeners for the AI features
    document.getElementById('sk-prep-btn').addEventListener('click', async (e) => {
        e.target.innerText = "Loading...";
        const out = document.getElementById('sk-ai-output');
        out.style.display = 'block';
        out.innerText = "Generating 5 highly probable technical questions based on the JD...";

        try {
            const result = await chrome.storage.local.get(["session_id"]);
            const res = await fetch(`http://localhost:8000/api/ai/interview-prep/${result.session_id || "demo"}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ job_description: document.body.innerText.substring(0, 5000) })
            });
            const data = await res.json();
            out.innerHTML = data.questions.map((q, i) => `<strong style="color: #818cf8;">Q${i + 1}: ${q.question}</strong><br><span style="color:#94a3b8">${q.answer_guide}</span><br><br>`).join('');
            e.target.innerText = "Prep Interview";
        } catch (err) { out.innerText = "Error generating prep."; e.target.innerText = "Error"; }
    });

    document.getElementById('sk-dm-btn').addEventListener('click', async (e) => {
        generateTextFeature(e.target, 'Recruiter DM');
    });
}

function injectCoverLetterButton(textarea, profileData) {
    if (textarea.parentElement.querySelector('.sk-cl-btn')) return; // Already injected

    const btn = document.createElement('button');
    btn.className = 'sk-cl-btn';
    btn.innerText = "✨ Auto-Write Cover Letter ✨";
    btn.style.cssText = "display: block; margin-bottom: 8px; background: linear-gradient(to right, #6366f1, #a855f7); color: white; border: none; padding: 4px 12px; border-radius: 4px; font-size: 12px; font-weight: bold; cursor: pointer; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);";

    btn.addEventListener('click', async (e) => {
        e.preventDefault();
        btn.innerText = "Writing...";

        try {
            const result = await chrome.storage.local.get(["session_id"]);
            const res = await fetch(`http://localhost:8000/api/ai/generate-text/${result.session_id || "demo"}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    prompt_context: 'Cover Letter',
                    job_description: document.body.innerText.substring(0, 5000),
                    profile_data: profileData
                })
            });
            const data = await res.json();
            textarea.value = data.text;
            triggerEvents(textarea);
            btn.innerText = "✨ Written ✨";
            btn.style.background = "#10b981";
        } catch (err) { btn.innerText = "Error"; }
    });

    textarea.parentElement.insertBefore(btn, textarea);
}

async function generateTextFeature(buttonEl, contextType) {
    buttonEl.innerText = "Loading...";
    const out = document.getElementById('sk-ai-output');
    out.style.display = 'block';
    out.innerText = `Generating custom ${contextType}...`;

    try {
        const profileData = await chrome.storage.local.get(null);
        const result = await chrome.storage.local.get(["session_id"]);
        const res = await fetch(`http://localhost:8000/api/ai/generate-text/${result.session_id || "demo"}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                prompt_context: contextType,
                job_description: document.body.innerText.substring(0, 5000),
                profile_data: profileData
            })
        });
        const data = await res.json();
        out.innerText = data.text;
        buttonEl.innerText = `Generate ${contextType.split(' ')[1]}`;
    } catch (err) { out.innerText = "Error generating text."; buttonEl.innerText = "Error"; }
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
