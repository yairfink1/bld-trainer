// ============================================================
//  LETTER SETS
// ============================================================
const EDGE_LETTERS   = ['A','B','C','D','E','F','G','H','I','J','L','M','N','O','P','Q','R','S','T','V','W','X'];
const CORNER_LETTERS = ['B','C','D','F','G','H','I','J','K','L','M','N','O','P','Q','S','T','U','V','W','X'];

// ============================================================
//  DATA
// ============================================================
let appData = {
    edgeAlgorithms:    {},
    edgeTimes:         {},
    edgeActive:        {},
    edgeHistory:       [],
    cornerAlgorithms:  {},
    cornerTimes:       {},
    cornerActive:      {},
    cornerHistory:     [],
    fullEdgeTimes:     [],
    fullEdgeExecTimes: [],
    fullCornerTimes:   [],
    fullCornerExecTimes: [],
    fullBldTimes:      [],
    fullBldExecTimes:  [],
    fullRegularTimes:  [],
    fullOhTimes:       [],
    deletedIds:        []  // tombstones — IDs of deleted/reset entries
};

function initDefaults(letters, timesObj, activeObj) {
    letters.forEach(l => {
        if (!timesObj[l]) timesObj[l] = [];
        if (activeObj[l] === undefined) activeObj[l] = true;
    });
}

function loadData() {
    const saved = localStorage.getItem('bldTrainerData');
    if (saved) {
        const p = JSON.parse(saved);
        appData.edgeAlgorithms   = p.edgeAlgorithms   || {};
        appData.edgeTimes        = p.edgeTimes         || {};
        appData.edgeActive       = p.edgeActive        || {};
        appData.edgeHistory      = p.edgeHistory       || [];
        appData.cornerAlgorithms = p.cornerAlgorithms  || {};
        appData.cornerTimes      = p.cornerTimes       || {};
        appData.cornerActive     = p.cornerActive      || {};
        appData.cornerHistory    = p.cornerHistory     || [];
        appData.fullEdgeTimes    = p.fullEdgeTimes     || [];
        appData.fullEdgeExecTimes= p.fullEdgeExecTimes || [];
        appData.fullCornerTimes  = p.fullCornerTimes   || [];
        appData.fullCornerExecTimes= p.fullCornerExecTimes || [];
        appData.fullBldTimes     = p.fullBldTimes      || [];
        appData.fullBldExecTimes = p.fullBldExecTimes  || [];
        appData.fullRegularTimes = p.fullRegularTimes  || [];
        appData.fullOhTimes      = p.fullOhTimes       || [];
        appData.deletedIds       = p.deletedIds        || [];
    }
    // Migration for the new mode naming if needed
    if (localStorage.getItem('bldTrainerData')) {
        const p = JSON.parse(localStorage.getItem('bldTrainerData'));
        // If they had bld-full or bld-exec data under old names, it's already there
    }
    // Migration: if old execTimes exists, put it in fullBldExecTimes
    if (localStorage.getItem('bldTrainerData')) {
        const p = JSON.parse(localStorage.getItem('bldTrainerData'));
        if (p.execTimes && !appData.fullBldExecTimes.length) {
            appData.fullBldExecTimes = p.execTimes;
        }
    }
    // Migrate old data if present
    const old = localStorage.getItem('m2TrainerData');
    if (old && !saved) {
        const o = JSON.parse(old);
        appData.edgeAlgorithms = o.algorithms || {};
        appData.edgeTimes      = o.times      || {};
        appData.edgeActive     = o.activeLetters || {};
        appData.edgeHistory    = o.history     || [];
        appData.fullEdgeTimes  = o.fsTimes     || [];
    }
    initDefaults(EDGE_LETTERS, appData.edgeTimes, appData.edgeActive);
    initDefaults(CORNER_LETTERS, appData.cornerTimes, appData.cornerActive);
    migrateIds(); // Ensure all entries have unique IDs (backwards compatible)
}

// ============================================================
//  ID HELPERS
// ============================================================
function makeId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// Ensure every entry in a plain-number array gets an id (migration)
function ensureIds(arr) {
    return arr.map(e => {
        if (typeof e === 'number') return { t: e, id: makeId() };
        if (typeof e === 'object' && !e.id) return { ...e, id: makeId() };
        return e;
    });
}

// Migrate all time arrays after loading
function migrateIds() {
    // Alg times: edgeTimes/cornerTimes are objects of arrays of numbers
    EDGE_LETTERS.forEach(l => {
        if (appData.edgeTimes[l]) {
            appData.edgeTimes[l] = ensureIds(appData.edgeTimes[l]);
        }
    });
    CORNER_LETTERS.forEach(l => {
        if (appData.cornerTimes[l]) {
            appData.cornerTimes[l] = ensureIds(appData.cornerTimes[l]);
        }
    });
    // History arrays
    appData.edgeHistory   = ensureIds(appData.edgeHistory);
    appData.cornerHistory = ensureIds(appData.cornerHistory);
    // Full solve arrays (already objects, just need id)
    const fullArrays = [
        'fullEdgeTimes','fullEdgeExecTimes','fullCornerTimes','fullCornerExecTimes',
        'fullBldTimes','fullBldExecTimes','fullRegularTimes','fullOhTimes'
    ];
    fullArrays.forEach(k => {
        appData[k] = ensureIds(appData[k]);
    });
}

function saveData() {
    localStorage.setItem('bldTrainerData', JSON.stringify(appData));
    renderAll();
    // Trigger debounced sync push
    if (typeof pushToGist === 'function') pushToGist(appData);
}

// Save locally only — used after merging remote data to avoid push loop
function saveDataLocal() {
    localStorage.setItem('bldTrainerData', JSON.stringify(appData));
    renderAll();
}

// ============================================================
//  MERGE REMOTE DATA
// ============================================================

// Helper: add IDs from an array to the tombstone list
function tombstone(arr) {
    if (!arr) return;
    arr.forEach(e => { if (e && e.id) appData.deletedIds.push(e.id); });
}

function mergeArr(local, remote) {
    const deleted = new Set(appData.deletedIds);
    // Filter out any local entries that have been tombstoned remotely
    const filteredLocal = local.filter(e => !deleted.has(e.id));
    const localIds = new Set(filteredLocal.map(e => e.id));
    const merged = [...filteredLocal];
    remote.forEach(e => {
        // Only add remote entry if it's not tombstoned and not already present
        if (!deleted.has(e.id) && !localIds.has(e.id)) merged.push(e);
    });
    merged.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    return merged;
}

function mergeRemoteData(remote) {
    // Merge tombstones first so they take effect during array merges
    if (remote.deletedIds?.length) {
        const existing = new Set(appData.deletedIds);
        remote.deletedIds.forEach(id => { if (!existing.has(id)) appData.deletedIds.push(id); });
    }
    // Alg times
    EDGE_LETTERS.forEach(l => {
        if (remote.edgeTimes?.[l]) {
            const rem = ensureIds(remote.edgeTimes[l]);
            appData.edgeTimes[l] = mergeArr(appData.edgeTimes[l] || [], rem);
        }
    });
    CORNER_LETTERS.forEach(l => {
        if (remote.cornerTimes?.[l]) {
            const rem = ensureIds(remote.cornerTimes[l]);
            appData.cornerTimes[l] = mergeArr(appData.cornerTimes[l] || [], rem);
        }
    });
    // Algorithms & active (remote wins if local is empty string / default)
    EDGE_LETTERS.forEach(l => {
        if (!appData.edgeAlgorithms[l] && remote.edgeAlgorithms?.[l])
            appData.edgeAlgorithms[l] = remote.edgeAlgorithms[l];
    });
    CORNER_LETTERS.forEach(l => {
        if (!appData.cornerAlgorithms[l] && remote.cornerAlgorithms?.[l])
            appData.cornerAlgorithms[l] = remote.cornerAlgorithms[l];
    });
    // History
    if (remote.edgeHistory)   appData.edgeHistory   = mergeArr(appData.edgeHistory,   ensureIds(remote.edgeHistory));
    if (remote.cornerHistory) appData.cornerHistory = mergeArr(appData.cornerHistory, ensureIds(remote.cornerHistory));
    // Full solve arrays
    const fullArrays = [
        'fullEdgeTimes','fullEdgeExecTimes','fullCornerTimes','fullCornerExecTimes',
        'fullBldTimes','fullBldExecTimes','fullRegularTimes','fullOhTimes'
    ];
    fullArrays.forEach(k => {
        if (remote[k]) appData[k] = mergeArr(appData[k] || [], ensureIds(remote[k]));
    });
}

// Expose for sync.js
window.getAppData      = () => appData;
window.applyRemoteData  = (remote) => { mergeRemoteData(remote); saveDataLocal(); };
window.replaceRemoteData = (remote) => { 
    if (!remote) return;
    appData = remote; 
    appData.edgeAlgorithms    = appData.edgeAlgorithms || {};
    appData.edgeTimes         = appData.edgeTimes || {};
    appData.edgeActive        = appData.edgeActive || {};
    appData.cornerAlgorithms  = appData.cornerAlgorithms || {};
    appData.cornerTimes       = appData.cornerTimes || {};
    appData.cornerActive      = appData.cornerActive || {};
    appData.deletedIds        = appData.deletedIds || [];
    initDefaults(EDGE_LETTERS, appData.edgeTimes, appData.edgeActive);
    initDefaults(CORNER_LETTERS, appData.cornerTimes, appData.cornerActive);
    migrateIds(); // ensure any raw data is formatted
    saveDataLocal(); 
};

// ============================================================
//  HELPERS
// ============================================================
function fmt(ms) { return (ms / 1000).toFixed(2); }
// Extract numeric value from a time entry (supports both raw numbers and {t,id} objects)
function tv(e) { return typeof e === 'number' ? e : (e.t ?? e.time ?? 0); }
function calcBest(arr)  { return arr.length ? fmt(Math.min(...arr.map(tv))) : '—'; }
function calcMean(arr)  { return arr.length ? fmt(arr.map(tv).reduce((a,b)=>a+b,0)/arr.length) : '—'; }
function calcAoN(arr, n) {
    if (arr.length < n) return '—';
    const s = arr.slice(-n).map(tv).sort((a,b)=>a-b);
    const trimmed = s.slice(1, n-1);
    return fmt(trimmed.reduce((a,b)=>a+b,0)/trimmed.length);
}
function makeDelBtn(handler) {
    const b = document.createElement('button');
    b.className = 'btn-delete-time'; b.innerHTML = '&times;'; b.title = 'Delete';
    b.addEventListener('click', handler);
    return b;
}

// ============================================================
//  TIMER STATE
// ============================================================
const COOLDOWN = 300;
let timerState = 'IDLE';
let timerCooldown = false;
let startTime = 0, currentTime = 0, timerInterval;
let activeTab = 'edge-alg';

// Per-tab state
let edgeLetter = '', cornerLetter = '';
let lastEdgeAdded = null, lastCornerAdded = null;
let lastFsEdgeAdded = false, lastFsCornerAdded = false, lastFsBldAdded = false;
let lastFsEdgeExecAdded = false, lastFsCornerExecAdded = false; 
let lastFsBldFullAdded = false, lastFsBldExecAdded = false, lastFsRegularAdded = false, lastFsOhAdded = false;
let edgeScramble = [], cornerScramble = [], bldScramble = [];
let prevEdgeLetter = '', prevCornerLetter = '';
// Scramble history stacks — stores past scrambles so the user can go back multiple steps.
// Index 0 = oldest, last index = most recent. historyIndex points at what is currently shown
// (last index means showing the latest/current scramble).
const MAX_SCRAMBLE_HISTORY = 50;
let edgeScrambleHistory = [], cornerScrambleHistory = [], bldScrambleHistory = [];
let edgeHistoryIndex = -1, cornerHistoryIndex = -1, bldHistoryIndex = -1;
// showingPrevious is true whenever the history index is not at the end of the history.
let showingPrevious = false;
let scramblerReady = false;

function getTimerEl() {
    switch (activeTab) {
        case 'edge-alg':     return document.getElementById('timer-edge');
        case 'full-edges':   return document.getElementById('fs-timer-edge');
        case 'corner-alg':   return document.getElementById('timer-corner');
        case 'full-corners': return document.getElementById('fs-timer-corner');
        case 'full-bld':     return document.getElementById('fs-timer-bld');
    }
}

function updateTimerDisplay() { getTimerEl().textContent = fmt(currentTime); }

function setTimerColor(state) {
    const map = { idle: 'var(--timer-running)', primed: 'var(--timer-ready)', running: 'var(--timer-running)' };
    document.documentElement.style.setProperty('--timer-color', map[state]);
}

function stopTimer() {
    timerState = 'IDLE';
    timerCooldown = true;
    setTimeout(() => { timerCooldown = false; }, COOLDOWN);
    clearInterval(timerInterval);
    setTimerColor('idle');

    switch (activeTab) {
        case 'edge-alg':
            if (edgeLetter !== '?') {
                const entry = { t: currentTime, id: makeId() };
                appData.edgeTimes[edgeLetter].push(entry);
                appData.edgeHistory.push({ letter: edgeLetter, t: currentTime, id: makeId() });
                lastEdgeAdded = edgeLetter;
                saveData();
                nextEdgeTarget();
            }
            break;
        case 'corner-alg':
            if (cornerLetter !== '?') {
                const entry = { t: currentTime, id: makeId() };
                appData.cornerTimes[cornerLetter].push(entry);
                appData.cornerHistory.push({ letter: cornerLetter, t: currentTime, id: makeId() });
                lastCornerAdded = cornerLetter;
                saveData();
                nextCornerTarget();
            }
            break;
        case 'full-edges':
            const modeE = document.getElementById('mode-toggle-edge').value;
            if (modeE === 'full') {
                appData.fullEdgeTimes.push({ time: currentTime, sequence: edgeScramble.join(' '), id: makeId() });
                lastFsEdgeAdded = true;
            } else {
                appData.fullEdgeExecTimes.push({ time: currentTime, sequence: edgeScramble.join(' '), id: makeId() });
                lastFsEdgeExecAdded = true;
            }
            showFsSequence('edge');
            newEdgeScramble(true);
            saveData();
            break;
        case 'full-corners':
            const modeC = document.getElementById('mode-toggle-corner').value;
            if (modeC === 'full') {
                appData.fullCornerTimes.push({ time: currentTime, sequence: cornerScramble.join(' '), id: makeId() });
                lastFsCornerAdded = true;
            } else {
                appData.fullCornerExecTimes.push({ time: currentTime, sequence: cornerScramble.join(' '), id: makeId() });
                lastFsCornerExecAdded = true;
            }
            showFsSequence('corner');
            newCornerScramble(true);
            saveData();
            break;
        case 'full-bld':
            const modeB = document.getElementById('mode-toggle-bld').value;
            if (modeB === 'bld-full') {
                appData.fullBldTimes.push({ time: currentTime, sequence: bldScramble.join(' '), id: makeId() });
                lastFsBldFullAdded = true;
            } else if (modeB === 'bld-exec') {
                appData.fullBldExecTimes.push({ time: currentTime, sequence: bldScramble.join(' '), id: makeId() });
                lastFsBldExecAdded = true;
            } else if (modeB === 'regular') {
                appData.fullRegularTimes.push({ time: currentTime, sequence: bldScramble.join(' '), id: makeId() });
                lastFsRegularAdded = true;
            } else if (modeB === 'oh') {
                appData.fullOhTimes.push({ time: currentTime, sequence: bldScramble.join(' '), id: makeId() });
                lastFsOhAdded = true;
            }
            showFsSequence('bld');
            newBldScramble(true);
            saveData();
            break;
    }
    updateScrambleVisualizerVisibility();
}

// ============================================================
//  KEYBOARD
// ============================================================
window.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;

    if (timerState === 'RUNNING') {
        e.preventDefault();
        stopTimer();
        return;
    }

    if (e.code === 'Space') {
        e.preventDefault();
        if (timerState === 'IDLE' && !timerCooldown) {
            if (showingPrevious) navigateToCurrentScramble(); // revert to current before starting
            timerState = 'PRIMED';
            setTimerColor('primed');
            currentTime = 0;
            updateTimerDisplay();
            // Hide scramble if applicable
            if (activeTab === 'full-edges' && document.getElementById('hide-on-start-edge').checked)
                hideFsSequence('edge');
            if (activeTab === 'full-corners' && document.getElementById('hide-on-start-corner').checked)
                hideFsSequence('corner');
            if (activeTab === 'full-bld' && document.getElementById('hide-on-start-bld').checked)
                hideFsSequence('bld');
            updateScrambleVisualizerVisibility();
        }
    } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        navigateScrambleHistory(-1);
    } else if (e.code === 'ArrowRight') {
        if (activeTab === 'edge-alg') {
            if (edgeLetter !== '?') {
                const h = document.getElementById('hint-text-edge');
                h.textContent = appData.edgeAlgorithms[edgeLetter] || 'No algorithm set.';
                h.classList.remove('hidden');
            }
        } else if (activeTab === 'corner-alg') {
            if (cornerLetter !== '?') {
                const h = document.getElementById('hint-text-corner');
                h.textContent = appData.cornerAlgorithms[cornerLetter] || 'No algorithm set.';
                h.classList.remove('hidden');
            }
        } else {
            // Move forward in history, or generate a new scramble if already at the latest
            navigateScrambleHistory(+1);
        }
    } else if (e.code === 'KeyZ' && e.altKey) {
        deleteLast();
    }
});

window.addEventListener('keyup', e => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    if (e.code === 'Space' && timerState === 'PRIMED') {
        timerState = 'RUNNING';
        setTimerColor('running');
        updateScrambleVisualizerVisibility();
        startTime = performance.now();
        timerInterval = setInterval(() => {
            currentTime = performance.now() - startTime;
            updateTimerDisplay();
        }, 10);
    }
});

// ============================================================
//  SINGLE ALG: EDGES
// ============================================================
function getRawMean(times) {
    if (!times || !times.length) return 9e9; // Empty = infinitely slow
    const sum = times.reduce((acc, val) => acc + tv(val), 0);
    return sum / times.length;
}

// ============================================================
//  SINGLE ALG: EDGES
// ============================================================
function nextEdgeTarget() {
    const active = EDGE_LETTERS.filter(l => appData.edgeActive[l]);
    if (!active.length) { edgeLetter = '?'; document.getElementById('target-letter-edge').textContent = '?'; return; }
    
    prevEdgeLetter = edgeLetter; // save previous

    const mode = document.getElementById('practice-mode-edge').value;
    if (mode === 'slowest' || mode === 'fastest') {
        const sorted = [...active].sort((a, b) => {
            const mA = getRawMean(appData.edgeTimes[a]);
            const mB = getRawMean(appData.edgeTimes[b]);
            return mode === 'slowest' ? mB - mA : mA - mB;
        });
        // Pick from top 3 candidates to add some variety
        const pool = sorted.slice(0, Math.min(3, sorted.length));
        edgeLetter = pool[Math.floor(Math.random() * pool.length)];
    } else {
        edgeLetter = active[Math.floor(Math.random() * active.length)];
    }
    
    if (showingPrevious) {
        // Reset the previous-letter indicator when moving to a new target
        showingPrevious = false;
        document.getElementById('target-letter-edge').style.color = '';
    }
    document.getElementById('target-letter-edge').textContent = edgeLetter;
    document.getElementById('hint-text-edge').classList.add('hidden');
}

// ============================================================
//  SINGLE ALG: CORNERS
// ============================================================
function nextCornerTarget() {
    const active = CORNER_LETTERS.filter(l => appData.cornerActive[l]);
    if (!active.length) { cornerLetter = '?'; document.getElementById('target-letter-corner').textContent = '?'; return; }
    
    prevCornerLetter = cornerLetter; // save previous

    const mode = document.getElementById('practice-mode-corner').value;
    if (mode === 'slowest' || mode === 'fastest') {
        const sorted = [...active].sort((a, b) => {
            const mA = getRawMean(appData.cornerTimes[a]);
            const mB = getRawMean(appData.cornerTimes[b]);
            return mode === 'slowest' ? mB - mA : mA - mB;
        });
        const pool = sorted.slice(0, Math.min(3, sorted.length));
        cornerLetter = pool[Math.floor(Math.random() * pool.length)];
    } else {
        cornerLetter = active[Math.floor(Math.random() * active.length)];
    }
    
    if (showingPrevious) {
        showingPrevious = false;
        document.getElementById('target-letter-corner').style.color = '';
    }
    document.getElementById('target-letter-corner').textContent = cornerLetter;
    document.getElementById('hint-text-corner').classList.add('hidden');
}

// ============================================================
//  DELETE LAST
// ============================================================
function deleteLast() {
    switch (activeTab) {
        case 'edge-alg':
            if (lastEdgeAdded && appData.edgeTimes[lastEdgeAdded]?.length) {
                const removed = appData.edgeTimes[lastEdgeAdded].pop();
                if (removed?.id) appData.deletedIds.push(removed.id);
                if (appData.edgeHistory.length) {
                    const histRem = appData.edgeHistory.pop();
                    if (histRem?.id) appData.deletedIds.push(histRem.id);
                }
                lastEdgeAdded = null;
                saveData(); currentTime = 0; updateTimerDisplay();
            }
            break;
        case 'corner-alg':
            if (lastCornerAdded && appData.cornerTimes[lastCornerAdded]?.length) {
                const removed = appData.cornerTimes[lastCornerAdded].pop();
                if (removed?.id) appData.deletedIds.push(removed.id);
                if (appData.cornerHistory.length) {
                    const histRem = appData.cornerHistory.pop();
                    if (histRem?.id) appData.deletedIds.push(histRem.id);
                }
                lastCornerAdded = null;
                saveData(); currentTime = 0; updateTimerDisplay();
            }
            break;
        case 'full-edges':
            const modeE = document.getElementById('mode-toggle-edge').value;
            if (modeE === 'full' && lastFsEdgeAdded && appData.fullEdgeTimes.length) {
                const removed = appData.fullEdgeTimes.pop();
                if (removed?.id) appData.deletedIds.push(removed.id);
                lastFsEdgeAdded = false;
            } else if (modeE === 'exec' && lastFsEdgeExecAdded && appData.fullEdgeExecTimes.length) {
                const removed = appData.fullEdgeExecTimes.pop();
                if (removed?.id) appData.deletedIds.push(removed.id);
                lastFsEdgeExecAdded = false;
            }
            saveData(); currentTime = 0; updateTimerDisplay();
            break;
        case 'full-corners':
            const modeC = document.getElementById('mode-toggle-corner').value;
            if (modeC === 'full' && lastFsCornerAdded && appData.fullCornerTimes.length) {
                const removed = appData.fullCornerTimes.pop();
                if (removed?.id) appData.deletedIds.push(removed.id);
                lastFsCornerAdded = false;
            } else if (modeC === 'exec' && lastFsCornerExecAdded && appData.fullCornerExecTimes.length) {
                const removed = appData.fullCornerExecTimes.pop();
                if (removed?.id) appData.deletedIds.push(removed.id);
                lastFsCornerExecAdded = false;
            }
            saveData(); currentTime = 0; updateTimerDisplay();
            break;
        case 'full-bld':
            const modeB = document.getElementById('mode-toggle-bld').value;
            if (modeB === 'bld-full' && lastFsBldFullAdded && appData.fullBldTimes.length) {
                const removed = appData.fullBldTimes.pop();
                if (removed?.id) appData.deletedIds.push(removed.id);
                lastFsBldFullAdded = false;
            } else if (modeB === 'bld-exec' && lastFsBldExecAdded && appData.fullBldExecTimes.length) {
                const removed = appData.fullBldExecTimes.pop();
                if (removed?.id) appData.deletedIds.push(removed.id);
                lastFsBldExecAdded = false;
            } else if (modeB === 'regular' && lastFsRegularAdded && appData.fullRegularTimes.length) {
                const removed = appData.fullRegularTimes.pop();
                if (removed?.id) appData.deletedIds.push(removed.id);
                lastFsRegularAdded = false;
            } else if (modeB === 'oh' && lastFsOhAdded && appData.fullOhTimes.length) {
                const removed = appData.fullOhTimes.pop();
                if (removed?.id) appData.deletedIds.push(removed.id);
                lastFsOhAdded = false;
            }
            saveData(); currentTime = 0; updateTimerDisplay();
            break;
    }
}

document.getElementById('btn-delete-last').addEventListener('click', deleteLast);

// ============================================================
//  RESET BUTTONS
// ============================================================
document.querySelectorAll('[data-reset]').forEach(btn => {
    btn.addEventListener('click', () => {
        const type = btn.dataset.reset;
        const msg = {
            edge: 'Delete all edge alg times?',
            corner: 'Delete all corner alg times?',
            fullEdge: 'Delete all full edge solve times?',
            fullCorner: 'Delete all full corner solve times?',
            fullBld: 'Delete all times in this tab (BLD Full, Exec, Regular, OH)?'
        }[type];
        if (!confirm(msg)) return;
        switch (type) {
            case 'edge':
                EDGE_LETTERS.forEach(l => { tombstone(appData.edgeTimes[l]); appData.edgeTimes[l] = []; });
                tombstone(appData.edgeHistory); appData.edgeHistory = [];
                break;
            case 'corner':
                CORNER_LETTERS.forEach(l => { tombstone(appData.cornerTimes[l]); appData.cornerTimes[l] = []; });
                tombstone(appData.cornerHistory); appData.cornerHistory = [];
                break;
            case 'fullEdge':
                tombstone(appData.fullEdgeTimes); appData.fullEdgeTimes = [];
                tombstone(appData.fullEdgeExecTimes); appData.fullEdgeExecTimes = [];
                break;
            case 'fullCorner':
                tombstone(appData.fullCornerTimes); appData.fullCornerTimes = [];
                tombstone(appData.fullCornerExecTimes); appData.fullCornerExecTimes = [];
                break;
            case 'fullBld':
                tombstone(appData.fullBldTimes); appData.fullBldTimes = [];
                tombstone(appData.fullBldExecTimes); appData.fullBldExecTimes = [];
                tombstone(appData.fullRegularTimes); appData.fullRegularTimes = [];
                tombstone(appData.fullOhTimes); appData.fullOhTimes = [];
                break;
        }
        saveData();
    });
});

// ============================================================
//  RENDER ALG TABLE (shared for edge & corner)
// ============================================================
function renderAlgTable(letters, timesObj, activeObj, algObj, tbodyId) {
    const tbody = document.getElementById(tbodyId);
    tbody.innerHTML = '';

    // Calculate GLOBAL stats
    let allSolves = [];
    let allChecked = true;
    let anyChecked = false;
    letters.forEach(l => {
        if (activeObj[l]) anyChecked = true;
        else allChecked = false;
        
        const t = timesObj[l] || [];
        t.forEach(solve => {
            allSolves.push({ val: tv(solve), id: solve.id || "0" });
        });
    });
    
    allSolves.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    const flatTimes = allSolves.map(o => o.val);
    
    // Create ALL row
    const trAll = document.createElement('tr');
    trAll.style.backgroundColor = 'var(--panel-border)';
    trAll.style.fontWeight = 'bold';
    
    const tdAllCb = document.createElement('td');
    const cbAll = document.createElement('input');
    cbAll.type = 'checkbox'; 
    cbAll.checked = allChecked;
    cbAll.indeterminate = anyChecked && !allChecked;
    cbAll.addEventListener('change', () => {
        const state = cbAll.checked;
        letters.forEach(l => activeObj[l] = state);
        saveData();
    });
    tdAllCb.appendChild(cbAll);
    
    const tdAllL = document.createElement('td');
    tdAllL.className = 'letter-cell'; tdAllL.textContent = 'ALL';
    
    const tdAllA = document.createElement('td'); // empty alg cell
    
    const tdAllB = document.createElement('td'); tdAllB.className='stat-val'; tdAllB.textContent=calcBest(flatTimes);
    const tdAll5 = document.createElement('td'); tdAll5.className='stat-val'; tdAll5.textContent=calcAoN(flatTimes, 5);
    const tdAllM = document.createElement('td'); tdAllM.className='stat-val'; tdAllM.textContent=calcMean(flatTimes);
    const tdAllC = document.createElement('td'); tdAllC.className='stat-val'; tdAllC.textContent=flatTimes.length;
    
    [tdAllCb, tdAllL, tdAllA, tdAllB, tdAll5, tdAllM, tdAllC].forEach(td => trAll.appendChild(td));
    tbody.appendChild(trAll);

    letters.forEach(l => {
        const tr = document.createElement('tr');

        const tdCb = document.createElement('td');
        const cb = document.createElement('input');
        cb.type = 'checkbox'; cb.checked = activeObj[l];
        cb.addEventListener('change', () => { activeObj[l] = cb.checked; saveData(); });
        tdCb.appendChild(cb);

        const tdL = document.createElement('td');
        tdL.className = 'letter-cell'; tdL.textContent = l;

        const tdA = document.createElement('td');
        const inp = document.createElement('input');
        inp.type = 'text'; inp.className = 'alg-input'; inp.placeholder = 'Paste algorithm...';
        inp.value = algObj[l] || '';
        inp.addEventListener('change', () => { algObj[l] = inp.value; saveData(); });
        tdA.appendChild(inp);

        const t = timesObj[l] || [];
        const tdB = document.createElement('td'); tdB.className='stat-val'; tdB.textContent=calcBest(t);
        const td5 = document.createElement('td'); td5.className='stat-val'; td5.textContent=calcAoN(t,5);
        const tdM = document.createElement('td'); tdM.className='stat-val'; tdM.textContent=calcMean(t);
        const tdC = document.createElement('td'); tdC.className='stat-val'; tdC.textContent=t.length;

        [tdCb, tdL, tdA, tdB, td5, tdM, tdC].forEach(td => tr.appendChild(td));
        tbody.appendChild(tr);
    });
}

// ============================================================
//  FULL SOLVE: SCRAMBLE DISPLAY
// ============================================================
function showFsSequence(type) {
    document.getElementById('fs-sequence-' + type).classList.remove('view-hidden');
    document.getElementById('fs-hidden-' + type).classList.add('hidden');
    updateScrambleVisualizerVisibility();
}

function hideFsSequence(type) {
    document.getElementById('fs-sequence-' + type).classList.add('view-hidden');
    document.getElementById('fs-hidden-' + type).classList.remove('hidden');
    updateScrambleVisualizerVisibility();
}

function renderScramble(moves, type, dontResetTimer = false) {
    const el = document.getElementById('fs-sequence-' + type);
    el.innerHTML = '';
    moves.forEach(m => {
        const span = document.createElement('span');
        span.className = 'move'; span.textContent = m;
        el.appendChild(span);
    });
    showFsSequence(type);
    if (!dontResetTimer) {
        document.getElementById('fs-timer-' + type).textContent = '0.00';
        currentTime = 0;
    }
    updateScrambleVisualizerVisibility();
}

// ============================================================
//  3x3 SCRAMBLE VISUALIZER SIMULATOR
// ============================================================
function rotateFaceClockwise(state, faceIndex) {
    var offset = faceIndex * 9;
    var temp = [state[offset + 0], state[offset + 1]];
    state[offset + 0] = state[offset + 6];
    state[offset + 1] = state[offset + 3];
    state[offset + 6] = state[offset + 8];
    state[offset + 3] = state[offset + 7];
    state[offset + 8] = state[offset + 2];
    state[offset + 7] = state[offset + 5];
    state[offset + 2] = temp[0];
    state[offset + 5] = temp[1];
}

function applyScrambleMove(state, move) {
    var face = move[0];
    var suffix = move.substring(1);
    var count = 1;
    if (suffix === "'") {
        count = 3;
    } else if (suffix === "2") {
        count = 2;
    }

    for (var step = 0; step < count; step++) {
        if (face === 'U') {
            rotateFaceClockwise(state, 0);
            var temp = [state[36], state[37], state[38]];
            state[36] = state[18]; state[37] = state[19]; state[38] = state[20];
            state[18] = state[9]; state[19] = state[10]; state[20] = state[11];
            state[9] = state[45]; state[10] = state[46]; state[11] = state[47];
            state[45] = temp[0]; state[46] = temp[1]; state[47] = temp[2];
        } else if (face === 'D') {
            rotateFaceClockwise(state, 3);
            var temp = [state[24], state[25], state[26]];
            state[24] = state[42]; state[25] = state[43]; state[26] = state[44];
            state[42] = state[51]; state[43] = state[52]; state[44] = state[53];
            state[51] = state[15]; state[52] = state[16]; state[53] = state[17];
            state[15] = temp[0]; state[16] = temp[1]; state[17] = temp[2];
        } else if (face === 'R') {
            rotateFaceClockwise(state, 1);
            var temp = [state[2], state[5], state[8]];
            state[2] = state[20]; state[5] = state[23]; state[8] = state[26];
            state[20] = state[29]; state[23] = state[32]; state[26] = state[35];
            state[29] = state[51]; state[32] = state[48]; state[35] = state[45];
            state[51] = temp[0]; state[48] = temp[1]; state[45] = temp[2];
        } else if (face === 'L') {
            rotateFaceClockwise(state, 4);
            var temp = [state[0], state[3], state[6]];
            state[0] = state[53]; state[3] = state[50]; state[6] = state[47];
            state[53] = state[27]; state[50] = state[30]; state[47] = state[33];
            state[27] = state[18]; state[30] = state[21]; state[33] = state[24];
            state[18] = temp[0]; state[21] = temp[1]; state[24] = temp[2];
        } else if (face === 'F') {
            rotateFaceClockwise(state, 2);
            var temp = [state[6], state[7], state[8]];
            state[6] = state[44]; state[7] = state[41]; state[8] = state[38];
            state[44] = state[29]; state[41] = state[28]; state[38] = state[27];
            state[29] = state[9]; state[28] = state[12]; state[27] = state[15];
            state[9] = temp[0]; state[12] = temp[1]; state[15] = temp[2];
        } else if (face === 'B') {
            rotateFaceClockwise(state, 5);
            var temp = [state[0], state[1], state[2]];
            state[0] = state[11]; state[1] = state[14]; state[2] = state[17];
            state[11] = state[35]; state[14] = state[34]; state[17] = state[33];
            state[35] = state[42]; state[34] = state[39]; state[33] = state[36];
            state[42] = temp[0]; state[39] = temp[1]; state[36] = temp[2];
        }
    }
}

function drawScramble(moves) {
    // Solve state: 6 faces x 9 stickers
    // Faces: 0=U, 1=R, 2=F, 3=D, 4=L, 5=B
    var state = [];
    var faceLetters = ['U', 'R', 'F', 'D', 'L', 'B'];
    for (var f = 0; f < 6; f++) {
        for (var i = 0; i < 9; i++) {
            state.push(faceLetters[f]);
        }
    }

    if (moves && moves.length) {
        moves.forEach(function(move) {
            if (move && move.length) {
                applyScrambleMove(state, move);
            }
        });
    }

    for (var i = 0; i < 9; i++) {
        var el = document.getElementById('sticker-' + i);
        if (el) {
            el.className = 'sticker';
            el.classList.add('color-' + state[i]);
        }
    }

    var container = document.getElementById('scramble-draw-view');
    if (container) {
        container.classList.remove('animate-pop');
        void container.offsetWidth;
        container.classList.add('animate-pop');
    }
}

function updateScrambleVisualizerVisibility() {
    const box = document.getElementById('scramble-draw-view');
    if (!box) return;

    const isFullTab = (activeTab === 'full-edges' || activeTab === 'full-corners' || activeTab === 'full-bld');
    let shouldHide = !isFullTab || (timerState === 'RUNNING' || timerState === 'PRIMED');

    if (isFullTab) {
        if (activeTab === 'full-edges' && document.getElementById('hide-on-start-edge')?.checked && document.getElementById('fs-sequence-edge')?.classList.contains('view-hidden')) {
            shouldHide = true;
        }
        if (activeTab === 'full-corners' && document.getElementById('hide-on-start-corner')?.checked && document.getElementById('fs-sequence-corner')?.classList.contains('view-hidden')) {
            shouldHide = true;
        }
        if (activeTab === 'full-bld' && document.getElementById('hide-on-start-bld')?.checked && document.getElementById('fs-sequence-bld')?.classList.contains('view-hidden')) {
            shouldHide = true;
        }
    }

    if (shouldHide) {
        box.classList.add('hidden');
    } else {
        box.classList.remove('hidden');
        // Always use the currently displayed scramble (edgeScramble etc. is kept in sync by navigateScrambleHistory)
        let moves = [];
        if (activeTab === 'full-edges') moves = edgeScramble;
        else if (activeTab === 'full-corners') moves = cornerScramble;
        else if (activeTab === 'full-bld') moves = bldScramble;
        
        drawScramble(moves);
    }
}

function newEdgeScramble(dontResetTimer = false) {
    if (timerState === 'RUNNING') return;
    if (!scramblerReady) return;
    const s = window.generateEdgesOnlyScramble();
    edgeScramble = s.split(' ').filter(m => m.length);
    // The new scramble becomes the head of history
    pushScrambleHistory('edge', edgeScramble);
    edgeHistoryIndex = edgeScrambleHistory.length - 1;
    showingPrevious = false;
    renderScramble(edgeScramble, 'edge', dontResetTimer);
    lastFsEdgeAdded = false;
}

function newCornerScramble(dontResetTimer = false) {
    if (timerState === 'RUNNING') return;
    if (!scramblerReady) return;
    const s = window.generateCornersOnlyScramble();
    cornerScramble = s.split(' ').filter(m => m.length);
    pushScrambleHistory('corner', cornerScramble);
    cornerHistoryIndex = cornerScrambleHistory.length - 1;
    showingPrevious = false;
    renderScramble(cornerScramble, 'corner', dontResetTimer);
    lastFsCornerAdded = false;
}

document.getElementById('btn-new-scramble-edge').addEventListener('click', () => navigateScrambleHistory(+1));
document.getElementById('btn-new-scramble-corner').addEventListener('click', () => navigateScrambleHistory(+1));

// ---- Full BLD scramble ----
function newBldScramble(dontResetTimer = false) {
    if (timerState === 'RUNNING') return;
    const len = parseInt(document.getElementById('scramble-length-bld').value) || 25;
    const s = window.generateFullScramble(len);
    bldScramble = s.split(' ').filter(m => m.length);
    pushScrambleHistory('bld', bldScramble);
    bldHistoryIndex = bldScrambleHistory.length - 1;
    showingPrevious = false;
    renderScramble(bldScramble, 'bld', dontResetTimer);
    lastFsBldAdded = false;
}

document.getElementById('btn-new-scramble-bld').addEventListener('click', () => navigateScrambleHistory(+1));
// Generate immediately (no solver needed)
newBldScramble();


// Toggle listeners
document.getElementById('mode-toggle-edge').addEventListener('change', renderAll);
document.getElementById('mode-toggle-corner').addEventListener('change', renderAll);
document.getElementById('mode-toggle-bld').addEventListener('change', renderAll);

// ============================================================
//  RENDER FULL SOLVE STATS (shared)
// ============================================================
function renderFsStats(timesArr, prefix, listId) {
    const times = timesArr.map(tv);
    document.getElementById(prefix + '-best').textContent  = calcBest(times);
    document.getElementById(prefix + '-ao5').textContent   = calcAoN(times, 5);
    document.getElementById(prefix + '-ao12').textContent  = calcAoN(times, 12);
    document.getElementById(prefix + '-mean').textContent  = calcMean(times);
    document.getElementById(prefix + '-count').textContent = times.length;

    const ul = document.getElementById(listId);
    ul.innerHTML = '';
    if (!timesArr.length) {
        const li = document.createElement('li');
        li.textContent = 'No solves yet.';
        li.style.color = 'var(--text-secondary)'; li.style.justifyContent = 'center';
        ul.appendChild(li);
        return;
    }
    [...timesArr].reverse().forEach((solve, revIdx) => {
        const realIdx = timesArr.length - 1 - revIdx;
        const li = document.createElement('li');

        const left = document.createElement('span');
        left.style.display = 'flex'; left.style.alignItems = 'center'; left.style.gap = '0.5rem';
        const ts = document.createElement('span'); ts.textContent = fmt(tv(solve));
        const meta = document.createElement('span');
        meta.className = 'solve-meta'; meta.textContent = solve.sequence || '';
        left.appendChild(ts); left.appendChild(meta);

        li.appendChild(left);
        li.appendChild(makeDelBtn(() => {
            if (solve.id) appData.deletedIds.push(solve.id);
            timesArr.splice(realIdx, 1);
            saveData();
        }));
        ul.appendChild(li);
    });
}

// ============================================================
//  RENDER ALL
// ============================================================
function renderAll() {
    renderAlgTable(EDGE_LETTERS, appData.edgeTimes, appData.edgeActive, appData.edgeAlgorithms, 'stats-body-edge');
    renderAlgTable(CORNER_LETTERS, appData.cornerTimes, appData.cornerActive, appData.cornerAlgorithms, 'stats-body-corner');
    
    // Edges
    const modeE = document.getElementById('mode-toggle-edge').value;
    renderFsStats(modeE === 'full' ? appData.fullEdgeTimes : appData.fullEdgeExecTimes, 'fse', 'fse-times-list');
    
    // Corners
    const modeC = document.getElementById('mode-toggle-corner').value;
    renderFsStats(modeC === 'full' ? appData.fullCornerTimes : appData.fullCornerExecTimes, 'fsc', 'fsc-times-list');
    
    // Full Tab (Multiple Modes)
    const modeB = document.getElementById('mode-toggle-bld').value;
    const bldMap = {
        'bld-full': { data: appData.fullBldTimes, label: 'BLD Full Times' },
        'bld-exec': { data: appData.fullBldExecTimes, label: 'BLD Execution Times' },
        'regular':  { data: appData.fullRegularTimes, label: 'Regular Solve Times' },
        'oh':       { data: appData.fullOhTimes, label: 'One Handed Times' }
    };
    const currentBld = bldMap[modeB];
    document.getElementById('full-stats-heading').textContent = currentBld.label;
    renderFsStats(currentBld.data, 'fsb', 'fsb-times-list');
}

// ============================================================
//  TABS
// ============================================================
const tabBtns = document.querySelectorAll('.tab-btn');
const tabViews = document.querySelectorAll('.tab-view');

function switchTab(tab) {
    if (timerState === 'RUNNING') stopTimer();
    activeTab = tab;

    tabBtns.forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    tabViews.forEach(v => v.classList.toggle('view-hidden', v.id !== 'view-' + tab));

    if (tab === 'full-edges'   && !edgeScramble.length   && scramblerReady) newEdgeScramble();
    if (tab === 'full-corners' && !cornerScramble.length && scramblerReady) newCornerScramble();
    if (tab === 'full-bld'     && !bldScramble.length)   newBldScramble();
    
    updateScrambleVisualizerVisibility();
}

tabBtns.forEach(b => b.addEventListener('click', () => switchTab(b.dataset.tab)));

// ============================================================
//  MANAGE TIMES MODAL
// ============================================================
const modal = document.getElementById('times-modal');
const modalTypeSelect = document.getElementById('modal-type-select');
const modalLetterSelect = document.getElementById('modal-letter-select');
const modalTimesList = document.getElementById('times-list');

function populateModalLetters() {
    modalLetterSelect.innerHTML = '';
    const type = modalTypeSelect.value;
    const letters = type === 'edge' ? EDGE_LETTERS : CORNER_LETTERS;

    const lastOpt = document.createElement('option');
    lastOpt.value = '__last__'; lastOpt.textContent = 'Last (All Recent)';
    modalLetterSelect.appendChild(lastOpt);

    letters.forEach(l => {
        const opt = document.createElement('option');
        opt.value = l; opt.textContent = l;
        modalLetterSelect.appendChild(opt);
    });
}

function renderModalTimes() {
    modalTimesList.innerHTML = '';
    const type = modalTypeSelect.value;
    const sel = modalLetterSelect.value;
    const timesObj = type === 'edge' ? appData.edgeTimes : appData.cornerTimes;
    const histArr = type === 'edge' ? appData.edgeHistory : appData.cornerHistory;

    if (sel === '__last__') {
        if (!histArr.length) {
            const li = document.createElement('li');
            li.textContent = 'No solves yet.'; li.style.color = 'var(--text-secondary)'; li.style.justifyContent = 'center';
            modalTimesList.appendChild(li);
            return;
        }
        [...histArr].reverse().forEach((entry, revIdx) => {
            const realIdx = histArr.length - 1 - revIdx;
            const li = document.createElement('li');
            const info = document.createElement('span');
            const badge = document.createElement('span');
            badge.textContent = entry.letter;
            badge.style.cssText = 'display:inline-block;background:rgba(59,130,246,0.2);color:var(--accent);border:1px solid rgba(59,130,246,0.4);border-radius:0.25rem;padding:0.1rem 0.45rem;margin-right:0.75rem;font-weight:700;font-size:1rem;';
            info.appendChild(badge);
            info.appendChild(document.createTextNode(fmt(tv(entry))));
            li.appendChild(info);
            li.appendChild(makeDelBtn(() => {
                if (entry.id) appData.deletedIds.push(entry.id);
                histArr.splice(realIdx, 1);
                const letterIdx = histArr.slice(0, realIdx).filter(e => e.letter === entry.letter).length;
                if (timesObj[entry.letter]?.[letterIdx] !== undefined) {
                    const removed = timesObj[entry.letter].splice(letterIdx, 1);
                    // Also tombstone the corresponding time entry
                    if (removed[0]?.id) appData.deletedIds.push(removed[0].id);
                }
                saveData(); renderModalTimes();
            }));
            modalTimesList.appendChild(li);
        });
        return;
    }

    const times = timesObj[sel] || [];
    if (!times.length) {
        const li = document.createElement('li');
        li.textContent = 'No times yet.'; li.style.color = 'var(--text-secondary)'; li.style.justifyContent = 'center';
        modalTimesList.appendChild(li);
        return;
    }
    [...times].reverse().forEach((t, revIdx) => {
        const realIdx = times.length - 1 - revIdx;
        const li = document.createElement('li');
        li.textContent = fmt(tv(t));
        li.appendChild(makeDelBtn(() => {
            if (t.id) appData.deletedIds.push(t.id);
            timesObj[sel].splice(realIdx, 1);
            let seen = 0;
            for (let i = 0; i < histArr.length; i++) {
                if (histArr[i].letter === sel) {
                    if (seen === realIdx) {
                        if (histArr[i].id) appData.deletedIds.push(histArr[i].id);
                        histArr.splice(i, 1);
                        break;
                    }
                    seen++;
                }
            }
            saveData(); renderModalTimes();
        }));
        modalTimesList.appendChild(li);
    });
}

document.getElementById('btn-manage-times').addEventListener('click', () => {
    populateModalLetters();
    modalLetterSelect.value = '__last__';
    renderModalTimes();
    modal.classList.remove('hidden');
});
document.getElementById('btn-close-modal').addEventListener('click', () => modal.classList.add('hidden'));
modalTypeSelect.addEventListener('change', () => { populateModalLetters(); renderModalTimes(); });
modalLetterSelect.addEventListener('change', renderModalTimes);

// ============================================================
//  SYNC MODAL UI
// ============================================================
const syncModal = document.getElementById('sync-modal');

function refreshSyncModal() {
    const connected = isSyncEnabled();
    document.getElementById('sync-setup').classList.toggle('hidden', connected);
    document.getElementById('sync-connected').classList.toggle('hidden', !connected);
    if (connected) {
        document.getElementById('sync-gist-id').textContent = getSyncGistId() || '—';
    }
}

document.getElementById('btn-sync-settings').addEventListener('click', () => {
    refreshSyncModal();
    syncModal.classList.remove('hidden');
});
document.getElementById('btn-close-sync').addEventListener('click', () => syncModal.classList.add('hidden'));

// Connect
document.getElementById('btn-connect-sync').addEventListener('click', async () => {
    const token = document.getElementById('sync-token-input').value;
    const errEl = document.getElementById('sync-error');
    const btn   = document.getElementById('btn-connect-sync');
    errEl.classList.add('hidden');
    btn.disabled = true; btn.textContent = 'Connecting…';
    const result = await setupSync(token);
    btn.disabled = false; btn.textContent = 'Connect & Sync';
    if (!result.success) {
        errEl.textContent = result.error;
        errEl.classList.remove('hidden');
        return;
    }
    // After connecting, pull remote and merge
    updateSyncIndicator('syncing');
    const remote = await pullFromGist();
    if (remote) { mergeRemoteData(remote); saveDataLocal(); }
    // Push local data up (in case remote was empty / new gist)
    await forcePushToGist(appData);
    updateSyncIndicator('synced');
    refreshSyncModal();
});

// Force push
document.getElementById('btn-force-push').addEventListener('click', async () => {
    const btn = document.getElementById('btn-force-push');
    btn.disabled = true; btn.textContent = 'Pushing…';
    await forcePushToGist(appData);
    btn.disabled = false; btn.textContent = '↑ Force Push (Local → Cloud)';
});

// Force pull
document.getElementById('btn-force-pull').addEventListener('click', async () => {
    if (!confirm('WARNING: This will DELETE your local data and replace it EXACTLY with what is in the cloud. Continue?')) return;
    const btn = document.getElementById('btn-force-pull');
    btn.disabled = true; btn.textContent = 'Overwriting…';
    const remote = await pullFromGist();
    if (remote) { 
        if (window.replaceRemoteData) window.replaceRemoteData(remote);
        else { mergeRemoteData(remote); saveDataLocal(); }
    }
    btn.disabled = false; btn.textContent = '↓ Force Pull (Cloud → Local)';
});

// Disconnect
document.getElementById('btn-disconnect-sync').addEventListener('click', () => {
    if (!confirm('Disconnect sync? Your local data will not be deleted.')) return;
    disconnectSync();
    refreshSyncModal();
});

// Hard reload (PWA cache clearer)
const btnHardReload = document.getElementById('btn-hard-reload');
if (btnHardReload) {
    btnHardReload.addEventListener('click', async () => {
        if ('serviceWorker' in navigator) {
            const regs = await navigator.serviceWorker.getRegistrations();
            for (let r of regs) await r.unregister();
        }
        window.location.href = window.location.href.split('?')[0] + '?update=' + Date.now();
    });
}

// ============================================================
//  INIT
// ============================================================
loadData();
renderAll();
nextEdgeTarget();
nextCornerTarget();

// Init sync indicator + pull on startup
if (typeof isSyncEnabled === 'function') {
    if (isSyncEnabled()) {
        updateSyncIndicator('syncing');
        pullFromGist().then(remote => {
            if (remote) {
                mergeRemoteData(remote);
                saveDataLocal();
            }
            updateSyncIndicator('synced');
        }).catch(() => updateSyncIndicator('error'));
    } else {
        updateSyncIndicator('');
    }
}

// Init scrambler
if (window.initScrambler) {
    window.initScrambler().then(() => {
        scramblerReady = true;
        document.getElementById('fs-loading-edge').style.display = 'none';
        document.getElementById('fs-loading-corner').style.display = 'none';
        if (activeTab === 'full-edges') newEdgeScramble();
        if (activeTab === 'full-corners') newCornerScramble();
    });
}

// ============================================================
//  TOUCH EVENTS (mobile timer)
// ============================================================
function getActiveTrainerArea() {
    const viewId = 'view-' + activeTab;
    const view = document.getElementById(viewId);
    if (!view) return null;
    return view.querySelector('.trainer-area');
}

// We attach touchstart/touchend to all trainer areas
document.querySelectorAll('.trainer-area').forEach(area => {
    area.addEventListener('touchstart', e => {
        // Don't interfere with buttons/selects/inputs inside the area
        if (e.target.tagName === 'BUTTON' || e.target.tagName === 'INPUT' ||
            e.target.tagName === 'SELECT' || e.target.tagName === 'A') return;

        if (timerState === 'RUNNING') {
            e.preventDefault();
            stopTimer();
            area.classList.remove('touch-primed');
            return;
        }

        if (timerState === 'IDLE' && !timerCooldown) {
            e.preventDefault();
            timerState = 'PRIMED';
            setTimerColor('primed');
            currentTime = 0;
            updateTimerDisplay();
            area.classList.add('touch-primed');

            // Hide scramble if applicable
            if (activeTab === 'full-edges' && document.getElementById('hide-on-start-edge').checked)
                hideFsSequence('edge');
            if (activeTab === 'full-corners' && document.getElementById('hide-on-start-corner').checked)
                hideFsSequence('corner');
            if (activeTab === 'full-bld' && document.getElementById('hide-on-start-bld').checked)
                hideFsSequence('bld');
            updateScrambleVisualizerVisibility();
        }
    }, { passive: false });

    document.getElementById('main-nav').addEventListener('click', e => {
        if (e.target.tagName === 'BUTTON') switchTab(e.target.dataset.tab);
    });
});

// ============================================================
//  SCRAMBLE HISTORY NAVIGATION
// ============================================================

// Push a scramble into the given history stack, capping to MAX_SCRAMBLE_HISTORY.
function pushScrambleHistory(type, scramble) {
    if (type === 'edge') {
        edgeScrambleHistory.push(scramble.slice());
        if (edgeScrambleHistory.length > MAX_SCRAMBLE_HISTORY) edgeScrambleHistory.shift();
    } else if (type === 'corner') {
        cornerScrambleHistory.push(scramble.slice());
        if (cornerScrambleHistory.length > MAX_SCRAMBLE_HISTORY) cornerScrambleHistory.shift();
    } else if (type === 'bld') {
        bldScrambleHistory.push(scramble.slice());
        if (bldScrambleHistory.length > MAX_SCRAMBLE_HISTORY) bldScrambleHistory.shift();
    }
}

// Navigate through scramble history for the full-solve tabs.
// direction: -1 = go back (older), +1 = go forward (newer/generate new).
function navigateScrambleHistory(direction) {
    if (timerState === 'RUNNING') return;

    const applyBorder = (id, show) => document.getElementById(id).style.border = show ? '2px solid var(--warning)' : '';
    const applyColor  = (id, show) => document.getElementById(id).style.color  = show ? 'var(--warning)' : '';

    // For alg tabs, left/right have different semantics (letter navigation handled elsewhere).
    // For full-solve tabs, navigate or generate.
    if (activeTab === 'edge-alg') {
        // Show prev letter — keep existing single-step behavior
        if (direction === -1) {
            showingPrevious = !showingPrevious;
            document.getElementById('target-letter-edge').textContent = showingPrevious ? prevEdgeLetter || '?' : edgeLetter;
            applyColor('target-letter-edge', showingPrevious && prevEdgeLetter);
        }
        return;
    }
    if (activeTab === 'corner-alg') {
        if (direction === -1) {
            showingPrevious = !showingPrevious;
            document.getElementById('target-letter-corner').textContent = showingPrevious ? prevCornerLetter || '?' : cornerLetter;
            applyColor('target-letter-corner', showingPrevious && prevCornerLetter);
        }
        return;
    }

    // Full-solve tabs: navigate the history stack.
    let history, historyIndex, setIndex, type, currentScramble;
    if (activeTab === 'full-edges') {
        history = edgeScrambleHistory; historyIndex = edgeHistoryIndex; type = 'edge';
        setIndex = i => { edgeHistoryIndex = i; };
        currentScramble = edgeScramble;
    } else if (activeTab === 'full-corners') {
        history = cornerScrambleHistory; historyIndex = cornerHistoryIndex; type = 'corner';
        setIndex = i => { cornerHistoryIndex = i; };
        currentScramble = cornerScramble;
    } else if (activeTab === 'full-bld') {
        history = bldScrambleHistory; historyIndex = bldHistoryIndex; type = 'bld';
        setIndex = i => { bldHistoryIndex = i; };
        currentScramble = bldScramble;
    } else {
        return;
    }

    const newIndex = historyIndex + direction;

    if (direction === -1) {
        // Going backwards — show older scramble if available
        if (newIndex < 0 || history.length === 0) return; // Already at oldest
        setIndex(newIndex);
        const target = history[newIndex];
        // Update the active scramble variable so the visualizer stays in sync
        if (activeTab === 'full-edges')   edgeScramble   = target;
        else if (activeTab === 'full-corners') cornerScramble = target;
        else if (activeTab === 'full-bld')     bldScramble    = target;
        showingPrevious = (newIndex < history.length - 1);
        renderScramble(target, type, true);
        const seqId = 'fs-sequence-' + type;
        applyBorder(seqId, showingPrevious);
    } else {
        // Going forward
        if (newIndex < history.length) {
            // Still within recorded history — move forward
            setIndex(newIndex);
            const target = history[newIndex];
            if (activeTab === 'full-edges')   edgeScramble   = target;
            else if (activeTab === 'full-corners') cornerScramble = target;
            else if (activeTab === 'full-bld')     bldScramble    = target;
            showingPrevious = (newIndex < history.length - 1);
            renderScramble(target, type, true);
            applyBorder('fs-sequence-' + type, showingPrevious);
        } else {
            // Already at the newest — generate a new scramble
            if (type === 'edge')   newEdgeScramble(false);
            else if (type === 'corner') newCornerScramble(false);
            else if (type === 'bld')    newBldScramble(false);
        }
    }
    updateScrambleVisualizerVisibility();
}

// Jump directly to the latest (current) scramble without toggling.
function navigateToCurrentScramble() {
    if (timerState === 'RUNNING') return;
    if (!showingPrevious) return;
    const applyBorder = (id) => document.getElementById(id).style.border = '';
    if (activeTab === 'full-edges') {
        edgeHistoryIndex = edgeScrambleHistory.length - 1;
        edgeScramble = edgeScrambleHistory[edgeHistoryIndex] || edgeScramble;
        renderScramble(edgeScramble, 'edge', true);
        applyBorder('fs-sequence-edge');
    } else if (activeTab === 'full-corners') {
        cornerHistoryIndex = cornerScrambleHistory.length - 1;
        cornerScramble = cornerScrambleHistory[cornerHistoryIndex] || cornerScramble;
        renderScramble(cornerScramble, 'corner', true);
        applyBorder('fs-sequence-corner');
    } else if (activeTab === 'full-bld') {
        bldHistoryIndex = bldScrambleHistory.length - 1;
        bldScramble = bldScrambleHistory[bldHistoryIndex] || bldScramble;
        renderScramble(bldScramble, 'bld', true);
        applyBorder('fs-sequence-bld');
    }
    showingPrevious = false;
    updateScrambleVisualizerVisibility();
}

// Setup prev buttons — pressing Prev button goes back one step
document.querySelectorAll('.btn-prev-scramble').forEach(btn => {
    btn.addEventListener('click', () => navigateScrambleHistory(-1));
});

// Re-attach remaining part of original code
document.querySelectorAll('.trainer-area').forEach(area => {
    area.addEventListener('touchend', e => {
        if (e.target.tagName === 'BUTTON' || e.target.tagName === 'INPUT' ||
            e.target.tagName === 'SELECT' || e.target.tagName === 'A') return;

        if (timerState === 'PRIMED') {
            e.preventDefault();
            timerState = 'RUNNING';
            setTimerColor('running');
            updateScrambleVisualizerVisibility();
            area.classList.remove('touch-primed');
            startTime = performance.now();
            timerInterval = setInterval(() => {
                currentTime = performance.now() - startTime;
                updateTimerDisplay();
            }, 10);
        }
    }, { passive: false });

    // Prevent context menu on long-press
    area.addEventListener('contextmenu', e => e.preventDefault());
});

// ============================================================
//  MOBILE HINT BUTTONS
// ============================================================
document.getElementById('btn-hint-edge')?.addEventListener('click', () => {
    if (activeTab === 'edge-alg' && edgeLetter !== '?') {
        const h = document.getElementById('hint-text-edge');
        h.textContent = appData.edgeAlgorithms[edgeLetter] || 'No algorithm set.';
        h.classList.remove('hidden');
    }
});
document.getElementById('btn-hint-corner')?.addEventListener('click', () => {
    if (activeTab === 'corner-alg' && cornerLetter !== '?') {
        const h = document.getElementById('hint-text-corner');
        h.textContent = appData.cornerAlgorithms[cornerLetter] || 'No algorithm set.';
        h.classList.remove('hidden');
    }
});
