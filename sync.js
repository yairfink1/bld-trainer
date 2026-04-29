// ============================================================
//  GITHUB GIST SYNC ENGINE
//  Provides: isSyncEnabled, setupSync, pushToGist,
//            pullFromGist, disconnectSync, updateSyncIndicator
// ============================================================

const GIST_FILENAME = 'bld_trainer_data.json';
const LS_TOKEN  = 'bldSync_token';
const LS_GISTID = 'bldSync_gistId';
const API_BASE  = 'https://api.github.com';

// ---- Debounce state ----
let _pushTimer = null;
const PUSH_DEBOUNCE_MS = 15000; // 15 seconds (to avoid GitHub 300/hr limit)
let _isDirty = false;
let _lastAppData = null;

// ---- Indicator state ----
function updateSyncIndicator(state, extra = '') {
    const dot = document.getElementById('sync-indicator');
    if (!dot) return;
    dot.className = 'sync-dot ' + (state || '');
    const labels = {
        '':        'Sync disabled',
        synced:    'Synced ✓',
        syncing:   'Syncing…',
        pending:   'Changes pending sync...',
        error:     'Sync error ' + extra + ' — check connection or rate limits',
        conflict:  'Merge conflict resolved',
    };
    dot.title = labels[state] || state;
}

// ---- Public helpers ----
function isSyncEnabled() {
    return !!localStorage.getItem(LS_TOKEN);
}

function getSyncGistId() {
    return localStorage.getItem(LS_GISTID);
}

// ---- Setup / connect ----
async function setupSync(token) {
    token = token.trim();
    if (!token) return { success: false, error: 'Token cannot be empty.' };

    // Validate token with a simple API call
    let userResp;
    try {
        userResp = await fetch(`${API_BASE}/user`, {
            headers: { Authorization: `token ${token}` }
        });
    } catch (e) {
        return { success: false, error: 'Network error. Are you online?' };
    }
    if (!userResp.ok) {
        return { success: false, error: 'Invalid token (status ' + userResp.status + '). Make sure it has gist scope.' };
    }

    // Look for an existing BLD Trainer gist
    let existingId = null;
    try {
        let page = 1;
        outer: while (true) {
            const r = await fetch(`${API_BASE}/gists?per_page=100&page=${page}`, {
                headers: { Authorization: `token ${token}` }
            });
            if (!r.ok) break;
            const gists = await r.json();
            if (!gists.length) break;
            for (const g of gists) {
                if (g.files && g.files[GIST_FILENAME]) {
                    existingId = g.id;
                    break outer;
                }
            }
            if (gists.length < 100) break;
            page++;
        }
    } catch (e) { /* ignore, will create new */ }

    if (existingId) {
        localStorage.setItem(LS_TOKEN, token);
        localStorage.setItem(LS_GISTID, existingId);
        return { success: true, gistId: existingId, created: false };
    }

    // No existing gist — create one using current appData
    try {
        const body = {
            description: 'BLD Trainer sync data — do not edit manually',
            public: false,
            files: {
                [GIST_FILENAME]: {
                    content: JSON.stringify(window.getAppData ? window.getAppData() : {}, null, 2)
                }
            }
        };
        const r = await fetch(`${API_BASE}/gists`, {
            method: 'POST',
            headers: {
                Authorization: `token ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });
        if (!r.ok) return { success: false, error: 'Could not create gist (status ' + r.status + ').' };
        const created = await r.json();
        localStorage.setItem(LS_TOKEN, token);
        localStorage.setItem(LS_GISTID, created.id);
        return { success: true, gistId: created.id, created: true };
    } catch (e) {
        return { success: false, error: 'Network error creating gist.' };
    }
}

// ---- Push ----
function pushToGist(appData) {
    if (!isSyncEnabled()) return;
    _isDirty = true;
    _lastAppData = appData;
    clearTimeout(_pushTimer);
    updateSyncIndicator('pending'); // yellow dot showing a save is queued
    _pushTimer = setTimeout(() => _doPush(appData), PUSH_DEBOUNCE_MS);
}

// Push immediately if they switch tabs, minimize, or close the app
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && _isDirty && _lastAppData) {
        clearTimeout(_pushTimer);
        _doPush(_lastAppData, true); // true = use keepalive
    }
});

async function _doPush(appData, isUnloading = false) {
    const token  = localStorage.getItem(LS_TOKEN);
    const gistId = localStorage.getItem(LS_GISTID);
    if (!token || !gistId) return;

    if (!isUnloading) updateSyncIndicator('syncing');
    try {
        const r = await fetch(`${API_BASE}/gists/${gistId}`, {
            method: 'PATCH',
            headers: {
                Authorization: `token ${token}`,
                'Content-Type': 'application/json'
            },
            keepalive: isUnloading, // Allows request to outlive the page closing
            body: JSON.stringify({
                files: {
                    [GIST_FILENAME]: { content: JSON.stringify(appData, null, 2) }
                }
            })
        });
        if (r.ok) {
            _isDirty = false;
            if (!isUnloading) updateSyncIndicator('synced');
        } else {
            if (!isUnloading) updateSyncIndicator('error', `(${r.status})`);
        }
    } catch (e) {
        if (!isUnloading) updateSyncIndicator('error', '(Network)');
    }
}

// ---- Pull ----
async function pullFromGist() {
    const token  = localStorage.getItem(LS_TOKEN);
    const gistId = localStorage.getItem(LS_GISTID);
    if (!token || !gistId) return null;

    updateSyncIndicator('syncing');
    try {
        const r = await fetch(`${API_BASE}/gists/${gistId}`, {
            headers: { Authorization: `token ${token}` }
        });
        if (!r.ok) { updateSyncIndicator('error'); return null; }
        const data = await r.json();
        const fileContent = data.files?.[GIST_FILENAME]?.content;
        if (!fileContent) { updateSyncIndicator('error'); return null; }
        return JSON.parse(fileContent);
    } catch (e) {
        updateSyncIndicator('error');
        return null;
    }
}

// ---- Force push: overwrite cloud with local ----
async function forcePushToGist(appData) {
    clearTimeout(_pushTimer);
    await _doPush(appData);
}

// ---- Force pull: overwrite local with cloud ----
async function forcePullFromGist() {
    const remote = await pullFromGist();
    if (remote && window.applyRemoteData) {
        window.applyRemoteData(remote);
        updateSyncIndicator('synced');
    }
}

// ---- Disconnect ----
function disconnectSync() {
    localStorage.removeItem(LS_TOKEN);
    localStorage.removeItem(LS_GISTID);
    updateSyncIndicator('');
}
