const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const ruleDisplay = document.getElementById('rule-display');
const scoreDisplay = document.getElementById('score-display');
const levelDisplay = document.getElementById('level-display');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayDesc = document.getElementById('overlay-desc');
const nameEntryScreen = document.getElementById('name-entry-screen');
const initialsInput = document.getElementById('initials-input');
const submitScoreBtn = document.getElementById('submit-score');
const leaderboardDisplay = document.getElementById('leaderboard-display');
const highScoreList = document.getElementById('high-score-list');
const bossWarning = document.getElementById('boss-warning');

let keys = {};
window.addEventListener('keydown', e => keys[e.code] = true);
window.addEventListener('keyup', e => keys[e.code] = false);

let audioCtx;
const sfx = {
    playTone: (freq, type, dur, vol=0.1, slide=null) => {
        if (!audioCtx) return; const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain();
        osc.type = type; osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
        if (slide) osc.frequency.exponentialRampToValueAtTime(slide, audioCtx.currentTime + dur);
        gain.gain.setValueAtTime(vol, audioCtx.currentTime); gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + dur);
        osc.connect(gain); gain.connect(audioCtx.destination); osc.start(); osc.stop(audioCtx.currentTime + dur);
    },
    rule: () => sfx.playTone(150, 'sawtooth', 0.4, 0.2, 50),
    lvl: () => { sfx.playTone(440, 'square', 0.1, 0.1); setTimeout(() => sfx.playTone(659, 'square', 0.3, 0.1), 100); },
    die: () => sfx.playTone(100, 'sawtooth', 0.8, 0.3, 20),
    pow: () => sfx.playTone(800, 'sine', 0.3, 0.2, 1200),
    smash: () => sfx.playTone(200, 'square', 0.2, 0.2, 50),
    bossLaser: () => sfx.playTone(900, 'sawtooth', 0.1, 0.05, 300)
};

let gameState = "START"; let frameCount = 0; let score = 0; let level = 1; let currentRule = "NORMAL";
let screenShake = 0; let invertColors = false; let isDarkness = false; let blackHoleActive = false;
let bossActive = false; let bossTimer = 0;

let friction = 0.85; let controlMultiplier = 1; let wrapEdges = false; let enemiesFrozen = false; 
let lavaZones = []; let floatingTexts = []; let projectiles = [];
let player = { x: 50, y: 50, size: 20, vx: 0, vy: 0, accel: 1.5, color: '#00ccff', invin: 0 };
let goal = { x: 700, y: 500, size: 40 };
let enemies = []; let particles = []; let powerups = [];
let boss = { x: 400, y: 300, size: 80, hp: 10, active: false };

let highScores = JSON.parse(localStorage.getItem('rngLeaderboard')) || [{ name: "RNG", score: 5000 }, { name: "CPU", score: 3000 }, { name: "BOT", score: 1000 }];
function updateLB() { highScoreList.innerHTML = ''; highScores.forEach(e => highScoreList.innerHTML += `<li><span>${e.name}</span> <span>${e.score}</span></li>`); }
function checkHS() {
    if (highScores.length < 5 || score > highScores[highScores.length - 1].score) {
        gameState = "HIGHSCORE_ENTRY"; overlay.classList.add('hidden'); nameEntryScreen.classList.remove('hidden');
        initialsInput.value = ''; setTimeout(() => initialsInput.focus(), 100);
    } else { showGameOver(); }
}
submitScoreBtn.addEventListener('click', saveScore);
initialsInput.addEventListener('keypress', (e) => { if(e.key === 'Enter') saveScore(); });
initialsInput.addEventListener('input', () => { sfx.playTone(600, 'square', 0.05, 0.1); initialsInput.value = initialsInput.value.toUpperCase(); });
function saveScore() {
    highScores.push({ name: initialsInput.value.trim().toUpperCase() || "???", score: score });
    highScores.sort((a, b) => b.score - a.score); highScores = highScores.slice(0, 5);
    localStorage.setItem('rngLeaderboard', JSON.stringify(highScores));
    nameEntryScreen.classList.add('hidden'); showGameOver();
}
function showGameOver() {
    gameState = "DEAD"; overlay.classList.remove('hidden'); overlayTitle.innerText = "GAME OVER";
    overlayTitle.style.color = "#ff0055"; overlayDesc.innerText = `Final Score: ${score}\nLevel: ${level}`;
    updateLB(); leaderboardDisplay.classList.remove('hidden'); canvas.classList.remove('spin-cycle');
}

const rules = [
    { name: "NORMAL", apply: () => { friction = 0.85; controlMultiplier = 1; wrapEdges = false; enemiesFrozen = false; invertColors = false; isDarkness = false; blackHoleActive = false; canvas.classList.remove('spin-cycle'); } },
    { name: "ICE FLOOR", apply: () => { friction = 0.99; controlMultiplier = 0.3; } },
    { name: "INVERTED WORLD", apply: () => { friction = 0.85; controlMultiplier = -1; } },
    { name: "HYPER SPEED", apply: () => { friction = 0.92; controlMultiplier = 3; player.size = 15; } },
    { name: "ZA WARUDO", apply: () => { enemiesFrozen = true; invertColors = true; } },
    { name: "LIGHTS OUT", apply: () => { isDarkness = true; } },
    { name: "EVENT HORIZON", apply: () => { blackHoleActive = true; } },
    { name: "CSS BARREL ROLL", apply: () => { canvas.classList.add('spin-cycle'); } },
    { name: "THE FLOOR IS LAVA", apply: () => { for(let i=0; 3>i; i++) lavaZones.push({ x: Math.random()*600, y: Math.random()*400, w: 150+Math.random()*100, h: 150+Math.random()*100 }); }}
];

overlay.addEventListener('click', () => {
    if (gameState === "HIGHSCORE_ENTRY") return; 
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    if (gameState !== "PLAYING") {
        gameState = "PLAYING"; overlay.classList.add('hidden'); leaderboardDisplay.classList.add('hidden');
        score = 0; level = 1; enemies = []; particles = []; powerups = []; lavaZones = []; projectiles = []; floatingTexts = [];
        player.x = 400; player.y = 300; player.vx = 0; player.vy = 0; player.invin = 0; boss.active = false; bossWarning.classList.add('hidden');
        scoreDisplay.innerText = `Score: 0`; levelDisplay.innerText = `Level: 1`;
        currentRule = "NORMAL"; rules[0].apply(); ruleDisplay.innerText = `Rule: NORMAL`;
        goal.x = Math.random() * 740; goal.y = Math.random() * 540;
    }
});

function spawnParticles(x, y, color, amount, speed=15) { for(let i=0; amount>i; i++) particles.push({ x, y, vx: (Math.random()-0.5)*speed, vy: (Math.random()-0.5)*speed, life: 1.0, color, size: Math.random()*6+2 }); }
function addText(x, y, text, color) { floatingTexts.push({ x, y, text, life: 1.0, color }); }

function changeRule() {
    if (boss.active) return; // Don't change rules during boss fights, that's too mean
    lavaZones = []; rules[0].apply(); // Reset baselines
    let newRule; do { newRule = rules[Math.floor(Math.random() * rules.length)]; } while (newRule.name === currentRule);
    currentRule = newRule.name; ruleDisplay.innerText = `Rule: ${currentRule}`;
    screenShake = 20; sfx.rule(); newRule.apply();
}

function spawnEnemy() {
    let ex, ey; do { ex = Math.random() * 760; ey = Math.random() * 560; } while (Math.hypot(player.x - ex, player.y - ey) < 250); 
    enemies.push({ x: ex, y: ey, size: 18, vx: 0, vy: 0, accel: 0.6 + (level * 0.1), color: '#ff0055' });
}

function startBossFight() {
    boss.active = true; bossWarning.classList.remove('hidden'); setTimeout(() => bossWarning.classList.add('hidden'), 3000);
    boss.x = 400 - boss.size/2; boss.y = 300 - boss.size/2; boss.hp = 5 + Math.floor(level/2);
    enemies = []; currentRule = "BOSS ANOMALY"; ruleDisplay.innerText = "Rule: SURVIVE THE CUBE";
    rules[0].apply(); // Normalize physics
}

function levelUp() {
    score += 100 * level; level++; scoreDisplay.innerText = `Score: ${score}`; levelDisplay.innerText = `Level: ${level}`;
    screenShake = 15; sfx.lvl(); addText(goal.x, goal.y, "LEVEL UP!", "#00ff96");
    spawnParticles(goal.x + goal.size/2, goal.y + goal.size/2, '#00ff96', 50);
    goal.x = Math.random() * 740; goal.y = Math.random() * 540;
    
    if (boss.active) {
        boss.active = false; score += 2000; addText(boss.x, boss.y, "+2000 BOSS DEFEATED", "#ffd700");
        spawnParticles(boss.x, boss.y, '#ff0055', 200, 30);
    }

    if (level % 5 === 0) { startBossFight(); } else { spawnEnemy(); if (Math.random() > 0.7) powerups.push({ x: Math.random() * 700, y: Math.random() * 500, size: 15 }); }
}

function die() {
    gameState = "CHECKING_SCORE"; screenShake = 40; sfx.die();
    spawnParticles(player.x, player.y, player.color, 150, 25);
    setTimeout(() => checkHS(), 1000);
}

function checkCol(r1, r2) { let r2w = r2.w || r2.size; let r2h = r2.h || r2.size; return (r1.x < r2.x + r2w && r1.x + r1.size > r2.x && r1.y < r2.y + r2h && r1.y + r1.size > r2.y); }

function update() {
    if (gameState !== "PLAYING") {
        particles.forEach(p => { p.x += p.vx; p.y += p.vy; p.life -= 0.02; }); particles = particles.filter(p => p.life > 0);
        return;
    }

    // Input
    if (keys['ArrowUp'] || keys['KeyW']) player.vy -= player.accel * controlMultiplier;
    if (keys['ArrowDown'] || keys['KeyS']) player.vy += player.accel * controlMultiplier;
    if (keys['ArrowLeft'] || keys['KeyA']) player.vx -= player.accel * controlMultiplier;
    if (keys['ArrowRight'] || keys['KeyD']) player.vx += player.accel * controlMultiplier;

    // Black Hole Gravity
    if (blackHoleActive) {
        let bhX = 400; let bhY = 300;
        let pDx = bhX - (player.x + player.size/2); let pDy = bhY - (player.y + player.size/2); let pDist = Math.hypot(pDx, pDy);
        if (pDist > 10) { player.vx += (pDx/pDist) * 1.5; player.vy += (pDy/pDist) * 1.5; }
        if (pDist < 20 && player.invin === 0) die(); // Spaghettification
        
        enemies.forEach(e => {
            let eDx = bhX - (e.x + e.size/2); let eDy = bhY - (e.y + e.size/2); let eDist = Math.hypot(eDx, eDy);
            if (eDist > 10) { e.vx += (eDx/eDist) * 2; e.vy += (eDy/eDist) * 2; }
        });
    }

    player.vx *= friction; player.vy *= friction; player.x += player.vx; player.y += player.vy;
    
    // Edges
    if (wrapEdges) {
        if (player.x > canvas.width) player.x = 0; if (0 > player.x) player.x = canvas.width;
        if (player.y > canvas.height) player.y = 0; if (0 > player.y) player.y = canvas.height;
    } else {
        if (0 > player.x) { player.x = 0; player.vx *= -1; } if (player.x + player.size > canvas.width) { player.x = canvas.width - player.size; player.vx *= -1; }
        if (0 > player.y) { player.y = 0; player.vy *= -1; } if (player.y + player.size > canvas.height) { player.y = canvas.height - player.size; player.vy *= -1; }
    }

    if (player.invin > 0) player.invin--;
    player.color = player.invin > 0 ? (frameCount % 10 > 5 ? '#ffd700' : '#fff') : '#00ccff';

    if (checkCol(player, goal)) levelUp();

    for (let i = powerups.length - 1; i >= 0; i--) {
        if (checkCol(player, powerups[i])) {
            player.invin = 300; score += 500; scoreDisplay.innerText = `Score: ${score}`;
            sfx.pow(); spawnParticles(powerups[i].x, powerups[i].y, '#ffd700', 30); addText(player.x, player.y, "INVINCIBLE", "#ffd700");
            powerups.splice(i, 1);
        }
    }

    lavaZones.forEach(lava => { if (checkCol(player, lava) && player.invin === 0) die(); });

    // Enemy Logic
    for (let i = enemies.length - 1; i >= 0; i--) {
        let enemy = enemies[i];
        if (!enemiesFrozen) {
            let dx = player.x - enemy.x; let dy = player.y - enemy.y; let dist = Math.hypot(dx, dy);
            if (dist > 0) { let dir = controlMultiplier > 0 ? 1 : -1; enemy.vx += (dx / dist) * enemy.accel * dir; enemy.vy += (dy / dist) * enemy.accel * dir; }
        }
        enemy.vx *= friction; enemy.vy *= friction; enemy.x += enemy.vx; enemy.y += enemy.vy;
        if (0 > enemy.x || enemy.x > canvas.width || 0 > enemy.y || enemy.y > canvas.height) { enemy.x = 400; enemy.y = 300; }

        if (checkCol(player, enemy)) {
            if (player.invin > 0) {
                sfx.smash(); spawnParticles(enemy.x, enemy.y, '#ff0055', 40);
                score += 200; scoreDisplay.innerText = `Score: ${score}`; addText(enemy.x, enemy.y, "+200", "#fff");
                enemies.splice(i, 1);
            } else { die(); }
        }
    }

    // Boss Logic
    if (boss.active) {
        bossTimer++;
        // Teleport and shoot
        if (bossTimer % 90 === 0) {
            boss.x = Math.random() * 600 + 100; boss.y = Math.random() * 400 + 100;
            sfx.bossLaser(); screenShake = 10;
            // 8-way shot
            for(let a=0; a<Math.PI*2; a+=Math.PI/4) {
                projectiles.push({ x: boss.x+boss.size/2, y: boss.y+boss.size/2, vx: Math.cos(a)*5, vy: Math.sin(a)*5, size: 10 });
            }
        }
        if (checkCol(player, boss)) {
            if (player.invin > 0 && bossTimer % 15 === 0) {
                boss.hp--; sfx.smash(); spawnParticles(boss.x, boss.y, '#fff', 30); addText(boss.x, boss.y, "SMASH!", "#ff0055");
                if (boss.hp <= 0) levelUp(); // Kill boss directly
            } else if (player.invin === 0) { die(); }
        }
    }

    // Projectiles
    for (let i = projectiles.length - 1; i >= 0; i--) {
        let p = projectiles[i]; p.x += p.vx; p.y += p.vy;
        if (checkCol(player, p) && player.invin === 0) die();
        if (p.x < 0 || p.x > canvas.width || p.y < 0 || p.y > canvas.height) projectiles.splice(i, 1);
    }

    particles.forEach(p => { p.x += p.vx; p.y += p.vy; p.life -= 0.02; p.vx *= 0.95; p.vy *= 0.95; }); particles = particles.filter(p => p.life > 0);
    floatingTexts.forEach(t => { t.y -= 1; t.life -= 0.02; }); floatingTexts = floatingTexts.filter(t => t.life > 0);

    frameCount++;
    if (frameCount % 300 === 0 && !boss.active) changeRule(); 
    if (screenShake > 0) screenShake *= 0.8;
}

function draw() {
    ctx.save();
    if (screenShake > 0.5) ctx.translate((Math.random()-0.5)*screenShake, (Math.random()-0.5)*screenShake);
    
    ctx.fillStyle = invertColors ? '#eee' : '#111'; ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (gameState === "PLAYING" || gameState === "CHECKING_SCORE") {
        if (blackHoleActive) {
            ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(400, 300, 20 + Math.sin(frameCount*0.2)*5, 0, Math.PI*2); ctx.fill();
            ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
        }

        ctx.fillStyle = invertColors ? '#00ffff' : 'rgba(255, 50, 0, 0.4)';
        for (let lava of lavaZones) ctx.fillRect(lava.x, lava.y, lava.w, lava.h);

        ctx.fillStyle = invertColors ? '#ff0069' : `rgba(0, 255, 150, ${0.4 + Math.abs(Math.sin(frameCount * 0.1)) * 0.6})`;
        ctx.fillRect(goal.x, goal.y, goal.size, goal.size);

        ctx.fillStyle = '#ffd700'; for (let p of powerups) { ctx.beginPath(); ctx.arc(p.x + p.size/2, p.y + p.size/2, p.size/2 + Math.sin(frameCount*0.2)*3, 0, Math.PI*2); ctx.fill(); }
        ctx.fillStyle = enemiesFrozen ? '#555' : (invertColors ? '#00ffaa' : '#ff0055'); for (let enemy of enemies) ctx.fillRect(enemy.x, enemy.y, enemy.size, enemy.size);

        if (boss.active) {
            ctx.fillStyle = `hsl(${frameCount % 360}, 100%, 50%)`; // Disco glitch cube
            ctx.fillRect(boss.x + (Math.random()-0.5)*10, boss.y + (Math.random()-0.5)*10, boss.size, boss.size);
        }
        ctx.fillStyle = '#ff0055'; for (let p of projectiles) { ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI*2); ctx.fill(); }

        ctx.fillStyle = player.color; ctx.shadowBlur = player.invin > 0 ? 20 : 0; ctx.shadowColor = '#ffd700';
        ctx.fillRect(player.x, player.y, player.size, player.size); ctx.shadowBlur = 0;
    }

    particles.forEach(p => { ctx.fillStyle = p.color; ctx.globalAlpha = p.life; ctx.fillRect(p.x, p.y, p.size, p.size); ctx.globalAlpha = 1.0; });
    ctx.restore();

    // The Lights Out Mask (Drawn over everything except UI)
    if (isDarkness && (gameState === "PLAYING" || gameState === "CHECKING_SCORE")) {
        ctx.save(); ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = '#000'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.globalCompositeOperation = 'destination-out';
        let g = ctx.createRadialGradient(player.x+player.size/2, player.y+player.size/2, 20, player.x+player.size/2, player.y+player.size/2, 150);
        g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(player.x+player.size/2, player.y+player.size/2, 150, 0, Math.PI*2); ctx.fill();
        ctx.restore();
    }

    // Floating text is drawn last so it pops over darkness
    ctx.font = "20px 'Courier New'"; ctx.textAlign = "center";
    floatingTexts.forEach(t => { ctx.fillStyle = t.color; ctx.globalAlpha = t.life; ctx.fillText(t.text, t.x, t.y); });
    ctx.globalAlpha = 1.0;
}

function loop() { update(); draw(); requestAnimationFrame(loop); }
updateLB(); loop();
