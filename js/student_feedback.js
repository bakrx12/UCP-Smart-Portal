chrome.storage.local.get('toggle_power', async (result) => {
    if (!result?.toggle_power) return;

    /* ------------------ Helpers ------------------ */
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    const parseHTML = (html) => new DOMParser().parseFromString(html, 'text/html');

    async function submitSurvey(surveyId, userId, params) {
        const res = await fetch(
            `https://horizon.ucp.edu.pk/survey/submit/${surveyId}/${userId}`,
            {
                method: "POST",
                credentials: "include",
                headers: {
                    "Content-Type": "application/json",
                    "Accept": "application/json"
                },
                body: JSON.stringify({
                    id: 1,
                    jsonrpc: "2.0",
                    method: "call",
                    params
                })
            }
        );
        if (!res.ok) throw new Error(`Submit failed ${res.status}`);
        return res.json();
    }

    /* ------------------ CSRF (page) ------------------ */
    const script = document.querySelector('#web\\.layout\\.odooscript');
    const csrfMatch = script?.textContent.match(/csrf_token:\s*"([^"]+)"/);
    if (!csrfMatch) return;
    const pageCsrf = csrfMatch[1];

    /* ------------------ UI insert ------------------ */
    const container = document.querySelector('#page_content_inner');
    if (!container) return;

    container.insertAdjacentHTML('beforeBegin', `
        <div id="survey-overlay">
            <div class="overlay-backdrop"></div>
            <div class="overlay-center">
                <div class="overlay-title">
                    🚀 JUST WANT TO GO TO YOUR PORTAL?.<br>
                    Ab aap surveys skip kar sakte hain!.
                </div>
                <div class="overlay-sub">
                    Powered by &nbsp; <span style="background: crimson; padding: 3px; border-radius: 4px">UCP Smart Portal</span>
                </div>
            </div>
            <div class="overlay-spotlight"></div>
        </div>

        <div id="skip-survey-wrapper" class="tooltip-hidden">
            <button id="skip-surveys-btn" disabled>
                <span class="material-icons btn-icon" style="color:#fff !important;">skip_next</span>
                <span class="btn-text">Preparing <span id="processed-surveys">0</span>/<span id="total-surveys">0</span>…</span>
                <span class="btn-loader" aria-hidden="true"></span>
            </button>

            <div id="survey-tooltip" role="dialog" aria-label="Feedback selector">
                <div class="tooltip-title">Your Feedback:</div>
                <label><input type="radio" name="feedback" value="bad"> Bad</label>
                <label><input type="radio" name="feedback" value="average" checked> Average</label>
                <label><input type="radio" name="feedback" value="good"> Good</label>
            </div>
        </div>
    `);


    const overlay = document.getElementById('survey-overlay')
    const wrapper = document.getElementById('skip-survey-wrapper');
    const btn = document.getElementById('skip-surveys-btn');
    const tooltip = document.getElementById('survey-tooltip');
    const btnText = btn.querySelector('.btn-text');
    const loader = btn.querySelector('.btn-loader');

    overlay.addEventListener('click', () => overlay.remove(), { once: true });

    /* ------------------ Tooltip (robust) ------------------ */
    /* ------------------ Tooltip (robust) ------------------ */
    let tooltipTimeout;

    const showTooltip = () => {
        clearTimeout(tooltipTimeout); // Cancel any pending hide
        wrapper.classList.remove('tooltip-hidden');
        wrapper.classList.add('tooltip-visible');
    };

    const hideTooltip = () => {
        // Add a small delay so moving from button to tooltip doesn't flicker
        tooltipTimeout = setTimeout(() => {
            wrapper.classList.remove('tooltip-visible');
            wrapper.classList.add('tooltip-hidden');
        }, 120);
    };

    // Events for the Button
    btn.addEventListener('mouseenter', showTooltip);
    btn.addEventListener('mouseleave', hideTooltip);
    btn.addEventListener('focus', showTooltip);
    btn.addEventListener('blur', hideTooltip);

    // Events for the Tooltip itself (so it stays open when you hover the options)
    tooltip.addEventListener('mouseenter', showTooltip);
    tooltip.addEventListener('mouseleave', hideTooltip);
    tooltip.addEventListener('focusin', showTooltip);
    tooltip.addEventListener('focusout', hideTooltip);

    /* ------------------ Overlay positioning helper ------------------ */
    function showOverlay(target) {
        const overlay = document.querySelector('#survey-overlay');
        if (!overlay) return;
        // the overlay is dismissed only by clicking it (per requirement)
        overlay.addEventListener('click', () => overlay.remove(), { once: true });
    }

    /* ------------------ Survey links discovery ------------------ */
    const processedSurveys = [];
    const surveyLinks = document.querySelectorAll('#tabs_anim1 li:nth-child(1) .uk-grid .md-list li a');

    /* ------------------ Core: start via /survey/begin then fetch questions ------------------ */
    async function beginSurveyAndFetchQuestions(href, surveyId, userId, timeoutMs = 15000) {
        const beginUrl = new URL(`/survey/begin/${surveyId}/${userId}`, location.origin).toString();
        const deadline = Date.now() + timeoutMs;

        // initial GET
        let res = await fetch(href, { credentials: 'include' });
        if (!res.ok) throw new Error(`Failed to GET ${href}: ${res.status}`);
        let html = await res.text();
        let doc = parseHTML(html);

        // If questions already present, return doc
        if (doc.querySelector('.js_question-wrapper')) return doc;

        // If there's a start-screen form or start button, call /survey/begin
        const startForm = doc.querySelector('form[data-is-start-screen="True"]');
        const startButton = doc.querySelector('button[type="submit"][value="start"], button.btn-primary, button');

        if (startForm || startButton) {
            // send the JSON-RPC begin POST (as your browser did)
            try {
                await fetch(beginUrl, {
                    method: 'POST',
                    credentials: 'include',
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': '*/*'
                    },
                    body: JSON.stringify({ id: 0, jsonrpc: '2.0', method: 'call', params: {} }),
                });
            } catch (e) {
                // still proceed and retry GETs because server might respond differently
                //console.warn('begin POST failed (continuing to retry GET):', e);
            }

            // loop refetching until questions appear or timeout
            while (Date.now() < deadline) {
                await sleep(500);
                const r2 = await fetch(href, { credentials: 'include' });
                if (!r2.ok) continue;
                const html2 = await r2.text();
                const doc2 = parseHTML(html2);
                if (doc2.querySelector('.js_question-wrapper')) return doc2;
            }
            throw new Error('Timed out waiting for questions after begin POST');
        }

        // No start button/form and no questions -> we can't proceed
        return null;
    }

    // Preparing total survey count
    document.querySelector('span#total-surveys').textContent = surveyLinks.length;

    /* ------------------ Processing all surveys ------------------ */
    for (const link of surveyLinks) {
        const href = link.getAttribute('href');
        if (!href) continue;

        const parts = href.split('/');
        const surveyId = parts[2] || '';
        const userId = parts[3] || '';

        let doc = null;
        try {
            doc = await beginSurveyAndFetchQuestions(href, surveyId, userId);
        } catch (e) {
            //console.warn('Failed to load/start survey for', href, e);
            continue;
        }
        if (!doc) continue;

        // parse question wrappers and collect possible answer values
        const params = {};
        const wrappers = doc.querySelectorAll('.js_question-wrapper');
        for (const q of wrappers) {
            const table = q.querySelector('table[data-sub-questions]');
            const simpleRadio = q.querySelector('div[data-question-type="simple_choice_radio"]');
            const textBox = q.querySelector('textarea[data-question-type="text_box"]');

            if (!q.id) continue;

            if (!table) {
                // q is a simple radio button instead of table
                if (simpleRadio) {
                    const firstRadio = simpleRadio.querySelectorAll('input')[0].value ?? undefined
                    if (firstRadio) {
                        params[q.id] = `${firstRadio}`;
                    }
                    continue;

                } else if (textBox) {
                    // q is a text box
                    params[q.id] = 'None';
                    continue;
                } else {
                    continue;
                }
            }

            let subQuestionsRaw = table.getAttribute('data-sub-questions') || table.dataset.subQuestions;
            if (!subQuestionsRaw) continue;

            let subIds;
            try {
                subIds = JSON.parse(subQuestionsRaw);
            } catch (e) {
                continue;
            }

            const answersMap = {};
            for (const subId of subIds) {
                const inputs = doc.querySelectorAll(`input[data-row-id="${subId}"]`);
                if (!inputs.length) continue;
                const values = Array.from(inputs).map(i => i.value).filter(v => v !== undefined && v !== null);
                if (values.length) answersMap[subId] = values;
            }

            if (Object.keys(answersMap).length) {
                params[q.id] = answersMap;
            }
        }

        if (Object.keys(params).length) {
            // attach tokens needed for submit later
            params.csrf_token = pageCsrf;   // page-level CSRF (taken from web.layout.odooscript)
            params.token = userId;          // answer token / user token
            processedSurveys.push({ surveyId, userId, params });

            document.querySelector('span#processed-surveys').textContent = `${processedSurveys.length}`;
        }
    }

    /* ------------------ No surveys case -> clear loading UI ------------------ */
    if (processedSurveys.length === 0) {
        btn.disabled = true;
        btn.classList.add('no-surveys');
        btnText.textContent = 'No Surveys Found';
        if (loader) loader.style.display = 'none';
        return;
    }

    /* ------------------ Enable button + show overlay ------------------ */
    btn.disabled = false;
    btnText.textContent = 'Skip Surveys';
    // ensure layout painted before positioning overlay
    requestAnimationFrame(() => requestAnimationFrame(() => showOverlay(btn)));

    /* ------------------ Click handler: build answers and submit sequentially ------------------ */
    btn.addEventListener('click', async () => {
        btn.disabled = true;
        btnText.textContent = 'Submitting…';

        const feedback = document.querySelector('input[name="feedback"]:checked')?.value || 0;

        try {

            for (const [index, s] of processedSurveys.entries()) {
                const postParams = {};

                for (const qid of Object.keys(s.params)) {
                    if (qid === 'csrf_token' || qid === 'token') continue;

                    const value = s.params[qid];

                    // ✅ If this is NOT a question object, copy as-is
                    if (
                        typeof value !== 'object' ||
                        value === null ||
                        Array.isArray(value)
                    ) {
                        postParams[qid] = value;
                        continue;
                    }

                    // Otherwise, it IS a question with sub-ids
                    postParams[qid] = {};

                    for (const subId of Object.keys(value)) {
                        const values = value[subId];

                        if (!Array.isArray(values) || values.length === 0) {
                            postParams[qid][subId] = null;
                            continue;
                        }

                        let chosen;
                        if (feedback === 'bad') {
                            chosen = values[0];
                        } else if (feedback === 'good') {
                            chosen = values[values.length - 1];
                        } else {
                            chosen = values[Math.floor(values.length / 2)];
                        }

                        postParams[qid][subId] = chosen;
                    }
                }

                // attach tokens expected by the server
                postParams.csrf_token = s.params.csrf_token;
                postParams.token = s.params.token;

                btnText.textContent = `Submitting ${index + 1}/${processedSurveys.length}...`;
                await submitSurvey(s.surveyId, s.userId, postParams);
            }


            // after all submits; redirect
            location.href = '/student/dashboard';
        } catch (e) {
            console.error('Submission failed:', e);
            btn.disabled = false;
            btnText.textContent = 'Skip Surveys';
        }
    });
});
