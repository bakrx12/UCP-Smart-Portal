chrome.storage.local.get('toggle_power', (result) => {
    const enabled = result['toggle_power'];

    if (enabled) {

        function showToast(message, type = "info") {
            // Remove any existing toast first
            const oldToast = document.querySelector(".custom-toast");
            if (oldToast) oldToast.remove();

            const toast = document.createElement("div");
            toast.className = `custom-toast ${type}`;
            toast.textContent = message;
            document.body.appendChild(toast);

            // Animate in
            setTimeout(() => toast.classList.add("show"), 50);

            // Remove after 3 seconds
            setTimeout(() => {
                toast.classList.remove("show");
                setTimeout(() => toast.remove(), 300);
            }, 3000);
        }


        async function fetchSocietiesData() {
            const url = 'https://horizon.ucp.edu.pk/join/society';
            const loadingBar = document.getElementById('loadingBar');

            try {
                // Show loading bar
                if (loadingBar) loadingBar.style.display = 'block';

                // Fetch once
                const response = await fetch(url);
                if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);

                // Parse the HTML
                const htmlText = await response.text();
                const parser = new DOMParser();
                const doc = parser.parseFromString(htmlText, 'text/html');

                // ---------- Extract CSRF Token ----------
                let csrfToken = null;
                const scriptTag = doc.querySelector('script#web\\.layout\\.odooscript');
                if (scriptTag && scriptTag.textContent.includes('csrf_token')) {
                    const match = scriptTag.textContent.match(/csrf_token:\s*"([^"]+)"/);
                    if (match && match[1]) {
                        csrfToken = match[1];
                    }
                }

                // ---------- Extract All Societies (from <select>) ----------
                const selectElement = doc.querySelector('select');
                const allSocieties = selectElement
                    ? Array.from(selectElement.querySelectorAll('option'))
                        .filter(opt => opt.value && opt.value.trim() !== '')
                        .map(opt => ({
                            societyName: opt.textContent.trim(),
                            societyID: opt.value.trim(),
                        }))
                    : [];

                // ---------- Extract Joined Societies (from <table>) ----------
                const table = doc.querySelector('table');
                const joinedSocieties = [];

                if (table) {
                    const rows = table.querySelectorAll('tbody tr');
                    rows.forEach((row, index) => {
                        const cells = row.querySelectorAll('td');
                        if (cells.length < 5) return;

                        let societyName = cells[1].textContent.trim();
                        const societyCategory = cells[2].textContent.trim();
                        const vicePresident = cells[3].textContent.trim();
                        const president = cells[4].textContent.trim();

                        if (societyName.includes('-')) {
                            societyName = societyName.split('-').slice(1).join('-').trim();
                        }

                        joinedSocieties.push({
                            societyName,
                            societyID: `soc${(index + 1).toString().padStart(3, '0')}`,
                            societyCategory,
                            president,
                            vicePresident
                        });
                    });
                }

                // ---------- Return Combined Object ----------
                return { csrfToken, allSocieties, joinedSocieties };

            } catch (error) {
                console.error('Error fetching societies data:', error);
                return { csrfToken: null, allSocieties: [], joinedSocieties: [] };
            } finally {
                // Hide loading bar
                if (loadingBar) loadingBar.style.display = 'none';
            }
        }




        const parentContainer = document.querySelector('#page_content_inner');
        parentContainer.insertAdjacentHTML('beforebegin', `
 <div class="societies-container">
    <div id="loadingBar" class="loading-bar" style="display:none;">
      <div class="bar"></div>
    </div>

    <div class="glass-card">
      <h2>My Societies</h2>
      <div class="society-list" id="joinedSocieties"></div>

      <div class="join-section">
        <h3>Join a New Society</h3>
        <select id="availableSocieties" class="join-dropdown"></select>
        <button id="joinButton" class="join-button">Join</button>
      </div>
    </div>

    <div class="glass-card vote-card">
      <h2>Vote for Candidate</h2>
      <div class="vote-list" id="voteCandidates"></div>
      <button id="voteSubmit" class="submit-btn">Submit Vote</button>
    </div>

    <div class="glass-card apply-card">
      <h2>Apply for Candidate</h2>
      <div class="apply-list" id="applyCandidates"></div>
      <button id="applySubmit" class="submit-btn">Apply</button>
    </div>
  </div>
`);


        let allSocieties = [], joinedSocieties = []
        let csrf_token = null;

        fetchSocietiesData().then(data => {
            allSocieties = data.allSocieties
            joinedSocieties = data.joinedSocieties
            csrf_token = data.csrfToken;

            // Update DOM
            const joinedContainer = document.getElementById('joinedSocieties');
            joinedSocieties.forEach(s => {
                const div = document.createElement('div');
                div.className = 'society-item';

                div.innerHTML = `
            <div class="society-header" style="cursor: pointer; display: flex; align-items: center; gap: 8px;">
                <span class="material-icons">groups</span>
                <span class="society-name">${s.societyName}</span>
                <span class="material-icons toggle-icon" style="margin-left:auto;">expand_more</span>
            </div>
            <div class="society-details" style="display: none; margin-top: 8px; padding-left: 24px;">
                <p><strong>Category:</strong> ${s.societyCategory}</p>
                <p><strong>President:</strong> ${s.president}</p>
                <p><strong>Vice President:</strong> ${s.vicePresident}</p>
            </div>
        `;

                const header = div.querySelector('.society-header');
                const details = div.querySelector('.society-details');
                const icon = div.querySelector('.toggle-icon');

                header.addEventListener('click', () => {
                    const isVisible = details.style.display === 'block';
                    details.style.display = isVisible ? 'none' : 'block';
                    icon.textContent = isVisible ? 'expand_more' : 'expand_less';
                });

                joinedContainer.appendChild(div);
            });


            const dropdown = document.getElementById('availableSocieties');
            allSocieties.forEach(s => {
                const opt = document.createElement('option');
                opt.value = s.societyID;
                opt.textContent = s.societyName;
                dropdown.appendChild(opt);
            });


        });




        // --- Vote Section ---
        const voteContainer = document.getElementById('voteCandidates');
        const voteButton = document.getElementById('voteSubmit');
        let selectedVote = null;
        const voteCandidates = []; // currently empty

        if (voteCandidates.length === 0) {
            voteContainer.innerHTML = `
    <div class="fallback">
      <span class="material-icons">info</span>
      <p>No candidates available for voting at this time.</p>
    </div>`;
            voteButton.disabled = true;
        } else {
            voteCandidates.forEach(c => {
                const div = document.createElement('div');
                div.className = 'candidate';
                div.innerHTML = `<span class="material-icons">how_to_vote</span><p>${c}</p>`;
                div.addEventListener('click', () => {
                    document.querySelectorAll('.vote-list .candidate').forEach(x => x.classList.remove('selected'));
                    div.classList.add('selected');
                    selectedVote = c;
                });
                voteContainer.appendChild(div);
            });
        }

        voteButton.addEventListener('click', () => {
            if (selectedVote) {
                alert(`Voted for ${selectedVote}`);
            } else {
                alert('Please select a candidate to vote for.');
            }
        });

        // --- Apply Section ---
        const applyContainer = document.getElementById('applyCandidates');
        const applyButton = document.getElementById('applySubmit');
        let selectedApply = null;
        const applyCandidates = []; // currently empty

        if (applyCandidates.length === 0) {
            applyContainer.innerHTML = `
    <div class="fallback">
      <span class="material-icons">announcement</span>
      <p>No positions open for application right now.</p>
    </div>`;
            applyButton.disabled = true;
        } else {
            applyCandidates.forEach(pos => {
                const div = document.createElement('div');
                div.className = 'candidate';
                div.innerHTML = `<span class="material-icons">assignment_ind</span><p>${pos}</p>`;
                div.addEventListener('click', () => {
                    document.querySelectorAll('.apply-list .candidate').forEach(x => x.classList.remove('selected'));
                    div.classList.add('selected');
                    selectedApply = pos;
                });
                applyContainer.appendChild(div);
            });
        }

        applyButton.addEventListener('click', () => {
            if (selectedApply) {
                alert(`Applied for ${selectedApply}`);
            } else {
                alert('Please select a position to apply for.');
            }
        });

        // --- Join Button logic ---
        const joinButton = document.getElementById('joinButton');
        const availableSocietiesDropdown = document.getElementById('availableSocieties');

        joinButton.addEventListener('click', async () => {
            const selectedValue = availableSocietiesDropdown.value;
            const selectedText = availableSocietiesDropdown.options[availableSocietiesDropdown.selectedIndex]?.textContent;

            if (!selectedValue) {
                showToast("⚠️ Please select a society to join.", "warning");
                return;
            }

            console.log(`Joining society: ${selectedText} (ID: ${selectedValue})`);

            // Use FormData (like a real form submission)
            const formData = new FormData();
            formData.append("csrf_token", csrf_token);
            formData.append("society_id", selectedValue);

            try {
                const response = await fetch("https://horizon.ucp.edu.pk/join/society/", {
                    method: "POST",
                    mode: "cors",
                    credentials: "include",
                    body: formData,
                    headers: {
                        "X-Requested-With": "XMLHttpRequest" // mimic AJAX request
                    }
                });

                if (!response.ok) {
                    const text = await response.text();
                    console.error("Response text:", text);
                    throw new Error(`HTTP error! Status: ${response.status}`);
                }

                showToast(`✅ Successfully joined ${selectedText}!`, "success");
                setTimeout(() => location.reload(), 1200);

            } catch (error) {
                console.error("Error joining society:", error);
                showToast("❌ Failed to join the society. Please try again.", "error");
            }
        });

    }

})
