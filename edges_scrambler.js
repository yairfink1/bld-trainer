/**
 * edges_scrambler.js
 *
 * Generates proper 3x3 edges-only AND corners-only scrambles
 * using the min2phase solver, like csTimer.
 *
 * Exposes:
 *   window.generateEdgesOnlyScramble()
 *   window.generateCornersOnlyScramble()
 *   window.initScrambler()
 */

(function() {
    var cornerFacelet = [
        [8, 9, 20], [6, 18, 38], [0, 36, 47], [2, 45, 11],
        [29, 26, 15], [27, 44, 24], [33, 53, 42], [35, 17, 51]
    ];
    var edgeFacelet = [
        [5, 10], [7, 19], [3, 37], [1, 46],
        [32, 16], [28, 25], [30, 43], [34, 52],
        [23, 12], [21, 41], [50, 39], [48, 14]
    ];
    var faceColors = 'URFDLB';

    function shuffle(arr) {
        for (var i = arr.length - 1; i > 0; i--) {
            var j = Math.floor(Math.random() * (i + 1));
            var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
        }
        return arr;
    }

    function isEven(perm) {
        var visited = new Array(perm.length).fill(false);
        var parity = 0;
        for (var i = 0; i < perm.length; i++) {
            if (!visited[i]) {
                var cycleLen = 0;
                var j = i;
                while (!visited[j]) {
                    visited[j] = true;
                    j = perm[j];
                    cycleLen++;
                }
                if (cycleLen % 2 === 0) parity++;
            }
        }
        return parity % 2 === 0;
    }

    function toFaceletString(ca, ea) {
        var f = [];
        for (var i = 0; i < 54; i++) f[i] = faceColors[Math.floor(i / 9)];
        for (var c = 0; c < 8; c++) {
            var j = ca[c] & 0xf, ori = ca[c] >> 4;
            for (var n = 0; n < 3; n++)
                f[cornerFacelet[c][(n + ori) % 3]] = faceColors[Math.floor(cornerFacelet[j][n] / 9)];
        }
        for (var e = 0; e < 12; e++) {
            var j = ea[e] & 0xf, ori = ea[e] >> 4;
            for (var n = 0; n < 2; n++)
                f[edgeFacelet[e][(n + ori) % 2]] = faceColors[Math.floor(edgeFacelet[j][n] / 9)];
        }
        return f.join('');
    }

    function solveState(ca, ea) {
        var search = new min2phase.Search();
        var scramble = '';
        var attempts = 0;
        do {
            var facelet = toFaceletString(ca, ea);
            scramble = search.solution(facelet, 21, 1e9, 1, 2);
            attempts++;
        } while ((!scramble || scramble.startsWith('Error')) && attempts < 5);
        return scramble ? scramble.trim() : 'Error';
    }

    // ---- EDGES ONLY ----
    // Corners solved, edges randomised
    window.generateEdgesOnlyScramble = function() {
        var ep;
        do { ep = shuffle([0,1,2,3,4,5,6,7,8,9,10,11]); } while (!isEven(ep));

        var eo = [], sum = 0;
        for (var i = 0; i < 11; i++) { var o = Math.floor(Math.random() * 2); eo.push(o); sum ^= o; }
        eo.push(sum);

        var ea = [];
        for (var i = 0; i < 12; i++) ea.push((eo[i] << 4) | ep[i]);

        var ca = [];
        for (var i = 0; i < 8; i++) ca.push(i); // solved corners

        return solveState(ca, ea);
    };

    // ---- CORNERS ONLY ----
    // Edges solved, corners randomised
    window.generateCornersOnlyScramble = function() {
        var cp;
        do { cp = shuffle([0,1,2,3,4,5,6,7]); } while (!isEven(cp));

        var co = [], sum = 0;
        for (var i = 0; i < 7; i++) { var o = Math.floor(Math.random() * 3); co.push(o); sum += o; }
        co.push((3 - (sum % 3)) % 3);

        var ca = [];
        for (var i = 0; i < 8; i++) ca.push((co[i] << 4) | cp[i]);

        var ea = [];
        for (var i = 0; i < 12; i++) ea.push(i); // solved edges

        return solveState(ca, ea);
    };

    // ---- FULL WCA SCRAMBLE ----
    // Standard random-move scramble (R U F L D B variants), same axis never consecutive
    window.generateFullScramble = function(length) {
        length = length || 25;
        var faces    = ['R', 'U', 'F', 'L', 'D', 'B'];
        var suffixes = ['', "'", '2'];
        // axis groups: R/L=0, U/D=1, F/B=2
        var axis     = [0, 1, 2, 0, 1, 2];
        var moves = [], lastAxis = -1, secondLastAxis = -1;
        for (var i = 0; i < length; i++) {
            var faceIdx;
            do { faceIdx = Math.floor(Math.random() * 6); }
            // Never same axis as last move; also avoid opposite face same axis back-to-back
            while (axis[faceIdx] === lastAxis ||
                   (axis[faceIdx] === secondLastAxis && lastAxis !== -1));
            secondLastAxis = lastAxis;
            lastAxis = axis[faceIdx];
            moves.push(faces[faceIdx] + suffixes[Math.floor(Math.random() * 3)]);
        }
        return moves.join(' ');
    };

    // ---- INIT ----
    window.initScrambler = function() {
        return new Promise(function(resolve) {
            setTimeout(function() {
                var search = new min2phase.Search();
                var solved = 'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB';
                search.solution(solved, 21, 1, 0, 0);
                resolve();
            }, 0);
        });
    };
})();
