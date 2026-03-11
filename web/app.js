// ── League definitions ──────────────────────────────────────
const LEAGUES = [
    // Basketball
    { id: "nba", emoji: "🏀", label: "NBA", sport: "basketball", espnLeague: "nba", hasTeams: true },
    { id: "betclic-elite", emoji: "🏀", label: "Betclic Élite", sport: "basketball", espnLeague: "fra.1", hasTeams: true },
    // American Football
    { id: "nfl", emoji: "🏈", label: "NFL", sport: "football", espnLeague: "nfl", hasTeams: true },
    { id: "ncaaf", emoji: "🏈", label: "NCAA Football", detail: "College", sport: "football", espnLeague: "college-football", hasTeams: true, hasApRanked: true },
    // College Basketball
    { id: "ncaam", emoji: "🏀", label: "NCAA Basketball", detail: "College", sport: "basketball", espnLeague: "mens-college-basketball", hasTeams: true, hasApRanked: true },
    // Soccer
    { id: "ligue-1", emoji: "⚽", label: "Ligue 1", detail: "France", sport: "soccer", espnLeague: "fra.1", hasTeams: true },
    { id: "ligue-2", emoji: "⚽", label: "Ligue 2", detail: "France", sport: "soccer", espnLeague: "fra.2", hasTeams: true },
    { id: "champions-league", emoji: "⚽", label: "Ligue des Champions", detail: "UEFA", sport: "soccer", espnLeague: "uefa.champions", hasTeams: true, hasPhases: true },
    { id: "europa-league", emoji: "⚽", label: "Europa League", detail: "UEFA", sport: "soccer", espnLeague: "uefa.europa", hasTeams: true, hasPhases: true },
    { id: "conference-league", emoji: "⚽", label: "Conference League", detail: "UEFA", sport: "soccer", espnLeague: "uefa.europa.conf", hasTeams: true, hasPhases: true },
    { id: "coupe-de-france", emoji: "⚽", label: "Coupe de France", sport: "soccer", espnLeague: "fra.coupe_de_france", hasTeams: true },
    { id: "nations-league", emoji: "⚽", label: "Ligue des Nations", detail: "UEFA", sport: "soccer", espnLeague: "uefa.nations", hasTeams: true },
    { id: "world-cup-qual", emoji: "⚽", label: "Qualif. Coupe du Monde", sport: "soccer", espnLeague: "fifa.worldq.uefa", hasTeams: true },
    { id: "euro", emoji: "⚽", label: "Euro", sport: "soccer", espnLeague: "uefa.euro", hasTeams: true },
    { id: "equipe-de-france-foot", emoji: "⚽", label: "Équipe de France", detail: "Matchs amicaux", sport: "soccer", espnLeague: "fifa.friendly", hasTeams: true },
    { id: "world-cup", emoji: "⚽", label: "Coupe du Monde", sport: "soccer", espnLeague: "fifa.world", hasTeams: true, hasPhases: true },
    // Olympics
    { id: "jo-basket-m", emoji: "🏅", label: "JO Basketball", detail: "Hommes", sport: "basketball", espnLeague: "mens-olympics-basketball", hasTeams: true, hasPhases: true },
    { id: "jo-basket-w", emoji: "🏅", label: "JO Basketball", detail: "Femmes", sport: "basketball", espnLeague: "womens-olympics-basketball", hasTeams: true, hasPhases: true },
    { id: "jo-foot", emoji: "🏅", label: "JO Football", detail: "Hommes", sport: "soccer", espnLeague: "fifa.olympics", hasTeams: true, hasPhases: true },
    // Rugby
    { id: "top-14", emoji: "🏉", label: "Top 14", detail: "France", sport: "rugby", espnLeague: "270559", hasTeams: true },
    { id: "champions-cup-rugby", emoji: "🏉", label: "Champions Cup", detail: "Rugby", sport: "rugby", espnLeague: "271937", hasTeams: true },
    { id: "challenge-cup-rugby", emoji: "🏉", label: "Challenge Cup", detail: "Rugby", sport: "rugby", espnLeague: "272073", hasTeams: true },
    { id: "six-nations", emoji: "🏉", label: "Six Nations", sport: "rugby", espnLeague: "180659", hasTeams: true },
    { id: "rugby-world-cup", emoji: "🏉", label: "Coupe du Monde", detail: "Rugby", sport: "rugby", espnLeague: "164205", hasTeams: true, hasPhases: true },
    // Tennis
    { id: "australian-open", emoji: "🎾", label: "Open d'Australie", hasTeams: false, hasRounds: true },
    { id: "roland-garros", emoji: "🎾", label: "Roland-Garros", hasTeams: false, hasRounds: true },
    { id: "wimbledon", emoji: "🎾", label: "Wimbledon", hasTeams: false, hasRounds: true },
    { id: "us-open", emoji: "🎾", label: "US Open", hasTeams: false, hasRounds: true },
    // Cycling
    { id: "cycling-road", emoji: "🚴", label: "Cyclisme Route", hasTeams: false },
    { id: "cycling-mtb-dh", emoji: "🚵", label: "VTT Descente", detail: "Coupe du Monde", hasTeams: false },
    { id: "cycling-mtb-enduro", emoji: "🚵", label: "VTT Enduro", detail: "Coupe du Monde", hasTeams: false },
];

const CHANNELS = [
    "TF1", "France 2", "France 3", "France 4", "M6", "L'Équipe",
    "Canal+", "Canal+ Sport", "Canal+ Foot", "Canal+ Premier League",
    "beIN Sports 1", "beIN Sports 2", "beIN Sports 3",
    "Eurosport 1", "Eurosport 2",
    "DAZN", "RMC Sport", "Prime Video", "Red Bull TV",
];

// ── State ───────────────────────────────────────────────────
const state = {
    selectedLeagues: new Map(), // leagueId → { teams: [...], phases_only?: [...], rounds_only?: [...] }
    selectedChannels: new Set(),
    currentSearchLeague: null,
};

// ── Init ────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
    renderLeagues();
    renderChannels();
    loadFromLocalStorage();
    updateConfig();
});

// ── Leagues ─────────────────────────────────────────────────
function renderLeagues() {
    const grid = document.getElementById("leagues-grid");
    grid.innerHTML = LEAGUES.map(l => `
        <div class="league-card" data-id="${l.id}" onclick="toggleLeague('${l.id}')">
            <span class="emoji">${l.emoji}</span>
            <span class="label">
                ${l.label}
                ${l.detail ? `<small>${l.detail}</small>` : ""}
                ${l.hasApRanked ? `<small>AP Top 25</small>` : ""}
            </span>
        </div>
    `).join("");
}

function toggleLeague(id) {
    const card = document.querySelector(`.league-card[data-id="${id}"]`);
    if (state.selectedLeagues.has(id)) {
        state.selectedLeagues.delete(id);
        card.classList.remove("selected");
    } else {
        const league = LEAGUES.find(l => l.id === id);
        const entry = {};
        if (league.hasApRanked) entry.teams = "AP_RANKED";
        else if (league.hasTeams) entry.teams = [];
        if (league.hasPhases) entry.phases_only = ["QUARTERFINAL", "SEMIFINAL", "FINAL"];
        if (league.hasRounds) entry.rounds_only = ["SEMIFINAL", "FINAL"];
        state.selectedLeagues.set(id, entry);
        card.classList.add("selected");
        if (league.hasApRanked) {
            // AP Ranked leagues don't need team search — they auto-fetch Top 25
        } else if (league.hasTeams) {
            showTeamSearch(id);
        }
    }
    updateConfig();
    saveToLocalStorage();
}

// ── Team Search ─────────────────────────────────────────────
function showTeamSearch(leagueId) {
    const league = LEAGUES.find(l => l.id === leagueId);
    if (!league || !league.hasTeams) return;

    state.currentSearchLeague = leagueId;
    const panel = document.getElementById("team-search-panel");
    panel.classList.remove("hidden");
    document.getElementById("team-search-title").textContent =
        `Ajouter des équipes — ${league.emoji} ${league.label}`;
    document.getElementById("team-search-input").value = "";
    document.getElementById("team-results").innerHTML = "";
    renderSelectedTeams();
    document.getElementById("team-search-input").focus();
}

async function searchTeams() {
    const league = LEAGUES.find(l => l.id === state.currentSearchLeague);
    if (!league || !league.espnLeague) return;

    const query = document.getElementById("team-search-input").value.trim();
    const resultsDiv = document.getElementById("team-results");
    resultsDiv.innerHTML = '<span style="color:#888;">Recherche en cours...</span>';

    try {
        const url = `https://site.api.espn.com/apis/site/v2/sports/${league.sport}/${league.espnLeague}/teams?limit=200`;
        const resp = await fetch(url);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();

        const teams = [];
        const leagueData = (data.sports || [{}])[0]?.leagues || [{}];
        for (const lg of leagueData) {
            for (const t of (lg.teams || [])) {
                const team = t.team || t;
                const name = team.displayName || team.name || "";
                if (!query || name.toLowerCase().includes(query.toLowerCase())) {
                    teams.push(name);
                }
            }
        }

        if (teams.length === 0) {
            resultsDiv.innerHTML = '<span style="color:#888;">Aucun résultat. Essayez un autre terme, ou tapez le nom directement.</span>';
            // Allow manual entry
            if (query) {
                resultsDiv.innerHTML += `<div class="team-chip" onclick="addTeam('${escapeHtml(query)}')"
                    style="margin-top:8px;">+ Ajouter "${escapeHtml(query)}" manuellement</div>`;
            }
            return;
        }

        const currentTeams = state.selectedLeagues.get(state.currentSearchLeague)?.teams || [];
        resultsDiv.innerHTML = teams.map(name => {
            const added = currentTeams.some(t => t.toLowerCase() === name.toLowerCase());
            return `<div class="team-chip ${added ? 'added' : ''}"
                onclick="addTeam('${escapeHtml(name)}')">${name}</div>`;
        }).join("");
    } catch (err) {
        resultsDiv.innerHTML = `<span style="color:#ef5350;">Erreur: ${err.message}. Vous pouvez ajouter le nom manuellement.</span>`;
        const query2 = document.getElementById("team-search-input").value.trim();
        if (query2) {
            resultsDiv.innerHTML += `<div class="team-chip" onclick="addTeam('${escapeHtml(query2)}')"
                style="margin-top:8px;">+ Ajouter "${escapeHtml(query2)}"</div>`;
        }
    }
}

function addTeam(name) {
    const leagueId = state.currentSearchLeague;
    if (!leagueId || !state.selectedLeagues.has(leagueId)) return;

    const entry = state.selectedLeagues.get(leagueId);
    if (!entry.teams) entry.teams = [];
    // Use a short name for matching (first word or common name)
    const shortName = extractShortName(name);
    if (!entry.teams.some(t => t.toLowerCase() === shortName.toLowerCase())) {
        entry.teams.push(shortName);
    }
    renderSelectedTeams();
    updateConfig();
    saveToLocalStorage();
    // Update chip style
    document.querySelectorAll(".team-chip").forEach(chip => {
        if (chip.textContent.trim() === name) chip.classList.add("added");
    });
}

function removeTeam(leagueId, teamName) {
    const entry = state.selectedLeagues.get(leagueId);
    if (entry && entry.teams === "AP_RANKED" && teamName === "AP_RANKED") {
        // Removing AP_RANKED deselects the entire league
        state.selectedLeagues.delete(leagueId);
        const card = document.querySelector(`.league-card[data-id="${leagueId}"]`);
        if (card) card.classList.remove("selected");
    } else if (entry && Array.isArray(entry.teams)) {
        entry.teams = entry.teams.filter(t => t !== teamName);
    }
    renderSelectedTeams();
    updateConfig();
    saveToLocalStorage();
}

function extractShortName(fullName) {
    // "Los Angeles Lakers" → "Lakers", "Kansas City Chiefs" → "Chiefs"
    // Simple heuristic: use last word, unless it's too short
    const words = fullName.split(" ");
    if (words.length <= 2) return fullName;
    const last = words[words.length - 1];
    // For national teams, keep the country name
    const nationals = ["france", "england", "spain", "germany", "italy", "argentina", "brazil"];
    if (nationals.includes(fullName.toLowerCase())) return fullName;
    return last.length >= 3 ? last : fullName;
}

function renderSelectedTeams() {
    const div = document.getElementById("selected-teams");
    let html = "";
    for (const [leagueId, entry] of state.selectedLeagues) {
        const league = LEAGUES.find(l => l.id === leagueId);
        if (!league) continue;
        if (entry.teams === "AP_RANKED") {
            html += `<div class="selected-team">
                ${league.emoji} AP Top 25
                <span class="remove" onclick="removeTeam('${leagueId}','AP_RANKED')">✕</span>
            </div>`;
            continue;
        }
        if (!entry.teams || entry.teams.length === 0) continue;
        for (const team of entry.teams) {
            html += `<div class="selected-team">
                ${league.emoji} ${team}
                <span class="remove" onclick="removeTeam('${leagueId}','${escapeHtml(team)}')">✕</span>
            </div>`;
        }
    }
    div.innerHTML = html;
}

// ── Channels ────────────────────────────────────────────────
function renderChannels() {
    const grid = document.getElementById("channels-grid");
    grid.innerHTML = CHANNELS.map(ch => `
        <div class="channel-card" data-channel="${ch}" onclick="toggleChannel('${escapeHtml(ch)}')">${ch}</div>
    `).join("");
}

function toggleChannel(ch) {
    const card = document.querySelector(`.channel-card[data-channel="${ch}"]`);
    if (state.selectedChannels.has(ch)) {
        state.selectedChannels.delete(ch);
        card.classList.remove("selected");
    } else {
        state.selectedChannels.add(ch);
        card.classList.add("selected");
    }
    updateConfig();
    saveToLocalStorage();
}

// ── Config generation ───────────────────────────────────────
function updateConfig() {
    const config = {
        favorites: [],
        channels: [...state.selectedChannels],
    };

    for (const [leagueId, entry] of state.selectedLeagues) {
        const fav = { league: leagueId };
        if (entry.teams === "AP_RANKED") {
            fav.teams = "AP_RANKED";
        } else if (entry.teams && entry.teams.length > 0) {
            fav.teams = entry.teams;
        }
        if (entry.phases_only) fav.phases_only = entry.phases_only;
        if (entry.rounds_only) fav.rounds_only = entry.rounds_only;
        config.favorites.push(fav);
    }

    document.getElementById("config-output").value = JSON.stringify(config, null, 2);
}

function copyConfig() {
    const textarea = document.getElementById("config-output");
    navigator.clipboard.writeText(textarea.value).then(() => {
        const btn = document.querySelector(".export-buttons button");
        const orig = btn.textContent;
        btn.textContent = "✅ Copié !";
        setTimeout(() => btn.textContent = orig, 2000);
    });
}

function downloadConfig() {
    const content = document.getElementById("config-output").value;
    const blob = new Blob([content], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "favorites.json";
    a.click();
    URL.revokeObjectURL(url);
}

// ── Persistence ─────────────────────────────────────────────
function saveToLocalStorage() {
    const data = {
        leagues: Object.fromEntries(state.selectedLeagues),
        channels: [...state.selectedChannels],
    };
    localStorage.setItem("tele7sport_config", JSON.stringify(data));
}

function loadFromLocalStorage() {
    const raw = localStorage.getItem("tele7sport_config");
    if (!raw) return;
    try {
        const data = JSON.parse(raw);
        // Restore leagues
        if (data.leagues) {
            for (const [id, entry] of Object.entries(data.leagues)) {
                state.selectedLeagues.set(id, entry);
                const card = document.querySelector(`.league-card[data-id="${id}"]`);
                if (card) card.classList.add("selected");
            }
        }
        // Restore channels
        if (data.channels) {
            for (const ch of data.channels) {
                state.selectedChannels.add(ch);
                const card = document.querySelector(`.channel-card[data-channel="${ch}"]`);
                if (card) card.classList.add("selected");
            }
        }
        renderSelectedTeams();
        updateConfig();
    } catch (e) {
        console.warn("Failed to load saved config:", e);
    }
}

// ── Utilities ───────────────────────────────────────────────
function escapeHtml(str) {
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
              .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// Allow Enter key in search
document.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && document.activeElement?.id === "team-search-input") {
        searchTeams();
    }
});
