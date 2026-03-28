const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// UI
const ruleDisplay = document.getElementById('rule-display');
const scoreDisplay = document.getElementById('score-display');
const levelDisplay = document.getElementById('level-display');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayDesc = document.getElementById('overlay-desc');

// Input
let keys = {};
window.addEventListener('keydown', e => keys[e.code] = true);
window.addEventListener('keyup', e => keys[e.code] = false);

// Audio Engine (Web Audio API)
let audioCtx;
const sfx = {
    playTone: (freq, type, duration, vol=0.1, slideFreq=null) => {
        if (!audioCtx) return;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
        if (slideFreq) osc.frequency.exponentialRampToValueAtTime(slideFreq, audioCtx.currentTime + duration);
        gain.gain.setValueAtTime(vol, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);
        osc.connect(gain); gain.connect(audioCtx.destination);
        osc.start(); osc.stop(audioCtx.currentTime + duration);
    },
    ruleChange: () => sfx.playTone(150, 'sawtooth', 0.4, 0.2, 50),
    levelUp: () => {
        sfx.playTone(440, 'square', 0.1, 0.1);
        setTimeout(() => sfx.playTone(554, 'square', 0.1, 0.1), 100);
        setTimeout(() => sfx.playTone(659, 'square', 0.3, 0.1), 200);
    },
    die: () => sfx.playTone(100, 'sawtooth', 0.8, 0.3, 20),
    powerup: () => sfx.playTone(800, 'sine', 0.3, 0.2, 1200),
    smash: () => sfx.playTone(200, 'square', 0.2, 0.2, 50)
};

// Global State
let gameState = "START"; 
let frameCount = 0;
let score = 0; let level = 1;
let currentRule = "NORMAL";
let screenShake = 0;
let invertColors = false;

// Physics & Modifiers
let friction = 0.85; let controlMultiplier = 1; let wrapEdges = false;
let enemiesFrozen = false; let lavaZones = [];

// Entities
let player = { x: 50, y: 50, size: 20, vx: 0, vy: 0, accel: 1.5, color: '#00ccff', invincibility: 0 };
let goal = { x: 700, y: 500, size: 40 };
let enemies = []; let particles = []; let powerups = [];

// Rules Dictionary
const rules = [
    { name: "NORMAL", apply: () => { friction = 0.85; controlMultiplier = 1; wrapEdges = false; enemiesFrozen = false; invertColors = false; lavaZones = []; } },
    { name: "ICE FLOOR", apply: () => { friction = 0.99; controlMultiplier = 0.3; } },
    { name: "INVERTED WORLD", apply: () => { friction = 0.85; controlMultiplier = -1; } },
    { name: "HYPER SPEED", apply: () => { friction = 0.92; controlMultiplier = 3; player.size = 15; } },
    { name: "PAC-MAN WORMHOLES", apply: () => { wrapEdges = true; } },
    { name: "ZA WARUDO", apply: () => { enemiesFrozen = true; invertColors = true; } },
    { name: "THE FLOOR IS LAVA", apply: () => { 
        for(let i=0; 3 > i; i++) {
            lavaZones.push({ x: Math.random() * 600, y: Math.random() * 400, w: 150 + Math.random()*100, h: 150 + Math.random()*100 });
        }
    }}
];

// Initialization / Restart
overlay.addEventListener('click', () => {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    
    if (gameState !== "PLAYING") {
        gameState = "PLAYING";
        overlay.classList.add('hidden');
        score = 0; level = 1; enemies = []; particles = []; powerups = []; lavaZones = [];
        player.x = canvas.width/2; player.y = canvas.height/2; player.vx = 0; player.vy = 0; player.invincibility = 0;
        scoreDisplay.innerText = `Score: 0`; levelDisplay.innerText = `Level: 1`;
        currentRule = "NORMAL"; rules[0].apply(); ruleDisplay.innerText = `Rule: NORMAL`;
        goal.x = Math.random() * (canvas.width - 60); goal.y = Math.random() * (canvas.height - 60);
    }
});

function triggerScreenShake(intensity) { screenShake = intensity; }

function spawnParticles(x, y, color, amount, speed=15) {
    for(let i=0; amount > i; i++) particles.push({ x, y, vx: (Math.random()-0.5)*speed, vy: (Math.random()-0.5)*speed, life: 1.0, color, size: Math.random()*6+2 });
}

function changeRule() {
    let newRule;
    do { newRule = rules[Math.floor(Math.random() * rules.length)]; } while (newRule.name === currentRule);
    
    currentRule = newRule.name;
    ruleDisplay.innerText = `Rule: ${currentRule}`;
    triggerScreenShake(20);
    sfx.ruleChange();
    
    ruleDisplay.style.transform = `scale(1.5) rotate(${(Math.random() - 0.5) * 30}deg)`;
    setTimeout(() => ruleDisplay.style.transform = 'scale(1) rotate(0deg)', 150);
    
    rules[0].apply(); 
    newRule.apply();
}

function spawnEnemy() {
    let ex, ey;
    do {
        ex = Math.random() * (canvas.width - 40) + 20; ey = Math.random() * (canvas.height - 40) + 20;
    } while (Math.hypot(player.x - ex, player.y - ey) > -250 && Math.hypot(player.x - ex, player.y - ey) < 250); // safe spawn distance
    enemies.push({ x: ex, y: ey, size: 18, vx: 0, vy: 0, accel: 0.6 + (level * 0.1), color: '#ff0055' });
}

function levelUp() {
    score += 100 * level; level++;
    scoreDisplay.innerText = `Score: ${score}`; levelDisplay.innerText = `Level: ${level}`;
    triggerScreenShake(15); sfx.levelUp();
    spawnParticles(goal.x + goal.size/2, goal.y + goal.size/2, '#00ff96', 50);
    
    goal.x = Math.random() * (canvas.width - 60) + 10; goal.y = Math.random() * (canvas.height - 60) + 10;
    spawnEnemy();
    
    if (Math.random() > 0.8) powerups.push({ x: Math.random() * 700, y: Math.random() * 500, size: 15 });
}

function die() {
    gameState = "DEAD";
    triggerScreenShake(40); sfx.die();
    spawnParticles(player.x, player.y, player.color, 150, 25);
    setTimeout(() => {
        overlay.classList.remove('hidden');
        overlayTitle.innerText = "YOU DIED";
        overlayTitle.style.color = "#ff0055";
        overlayDesc.innerText = `Final Score: ${score}\nLevel Reached: ${level}\n\nClick to Restart`;
    }, 1000);
}

function checkCollision(r1, r2) {
    let r2w = r2.w || r2.size;
    let r2h = r2.h || r2.size;
    return (r1.x < r2.x + r2w && r1.x + r1.size > r2.x && r1.y < r2.y + r2h && r1.y + r1.size > r2.y);
}

function update() {
    if (gameState !== "PLAYING") {
        particles.forEach(p => { p.x += p.vx; p.y += p.vy; p.life -= 0.02; });
        particles = particles.filter(p => p.life > 0);
        return;
    }

    if (keys['ArrowUp'] || keys['KeyW']) player.vy -= player.accel * controlMultiplier;
    if (keys['ArrowDown'] || keys['KeyS']) player.vy += player.accel * controlMultiplier;
    if (keys['ArrowLeft'] || keys['KeyA']) player.vx -= player.accel * controlMultiplier;
    if (keys['ArrowRight'] || keys['KeyD']) player.vx += player.accel * controlMultiplier;

    player.vx *= friction; player.vy *= friction;
    player.x += player.vx; player.y += player.vy;
    
    if (wrapEdges) {
        if (player.x > canvas.width) player.x = 0; if (0 > player.x) player.x = canvas.width;
        if (player.y > canvas.height) player.y = 0; if (0 > player.y) player.y = canvas.height;
    } else {
        if (0 > player.x) { player.x = 0; player.vx *= -1; }
        if (player.x + player.size > canvas.width) { player.x = canvas.width - player.size; player.vx *= -1; }
        if (0 > player.y) { player.y = 0; player.vy *= -1; }
        if (player.y + player.size > canvas.height) { player.y = canvas.height - player.size; player.vy *= -1; }
    }

    if (player.invincibility > 0) player.invincibility--;
    player.color = player.invincibility > 0 ? (frameCount % 10 > 5 ? '#ffd700' : '#fff') : '#00ccff';

    if (checkCollision(player, goal)) levelUp();

    for (let i = powerups.length - 1; i >= 0; i--) {
        if (checkCollision(player, powerups[i])) {
            player.invincibility = 300; 
            score += 500; scoreDisplay.innerText = `Score: ${score}`;
            sfx.powerup(); spawnParticles(powerups[i].x, powerups[i].y, '#ffd700', 30);
            powerups.splice(i, 1);
        }
    }

    for (let lava of lavaZones) {
        if (checkCollision(player, lava) && player.invincibility === 0) die();
    }

    for (let i = enemies.length - 1; i >= 0; i--) {
        let enemy = enemies[i];
        if (!enemiesFrozen) {
            let dx = player.x - enemy.x; let dy = player.y - enemy.y; let dist = Math.hypot(dx, dy);
            if (dist > 0) {
                let dir = controlMultiplier > 0 ? 1 : -1; 
                enemy.vx += (dx / dist) * enemy.accel * dir;
                enemy.vy += (dy / dist) * enemy.accel * dir;
            }
        }
        enemy.vx *= friction; enemy.vy *= friction;
        enemy.x += enemy.vx; enemy.y += enemy.vy;
        
        if (0 > enemy.x || enemy.x > canvas.width || 0 > enemy.y || enemy.y > canvas.height) {
            enemy.x = canvas.width/2; enemy.y = canvas.height/2; 
        }

        if (checkCollision(player, enemy)) {
            if (player.invincibility > 0) {
                sfx.smash(); spawnParticles(enemy.x, enemy.y, '#ff0055', 40);
                score += 200; scoreDisplay.innerText = `Score: ${score}`;
                enemies.splice(i, 1);
            } else {
                die();
            }
        }
    }

    particles.forEach(p => { p.x += p.vx; p.y += p.vy; p.life -= 0.02; p.vx *= 0.95; p.vy *= 0.95; });
    particles = particles.filter(p => p.life > 0);

    frameCount++;
    if (frameCount % 300 === 0) changeRule(); 
    if (screenShake > 0) screenShake *= 0.8;
}

function draw() {
    ctx.save();
    if (screenShake > 0.5) ctx.translate((Math.random()-0.5)*screenShake, (Math.random()-0.5)*screenShake);
    
    ctx.fillStyle = invertColors ? '#eee' : '#111';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (gameState === "PLAYING") {
        ctx.fillStyle = invertColors ? '#00ffff' : 'rgba(255, 50, 0, 0.4)';
        for (let lava of lavaZones) ctx.fillRect(lava.x, lava.y, lava.w, lava.h);

        ctx.fillStyle = invertColors ? '#ff0069' : `rgba(0, 255, 150, ${0.4 + Math.abs(Math.sin(frameCount * 0.1)) * 0.6})`;
        ctx.fillRect(goal.x, goal.y, goal.size, goal.size);

        ctx.fillStyle = '#ffd700';
        for (let p of powerups) {
            ctx.beginPath(); ctx.arc(p.x + p.size/2, p.y + p.size/2, p.size/2 + Math.sin(frameCount*0.2)*3, 0, Math.PI*2); ctx.fill();
        }

        for (let enemy of enemies) {
            ctx.fillStyle = enemiesFrozen ? '#555' : (invertColors ? '#00ffaa' : '#ff0055');
            ctx.fillRect(enemy.x, enemy.y, enemy.size, enemy.size);
        }

        ctx.fillStyle = player.color;
        ctx.shadowBlur = player.invincibility > 0 ? 20 : 0;
        ctx.shadowColor = '#ffd700';
        ctx.fillRect(player.x, player.y, player.size, player.size);
        ctx.shadowBlur = 0;
    }

    particles.forEach(p => {
        ctx.fillStyle = p.color; ctx.globalAlpha = p.life;
        ctx.fillRect(p.x, p.y, p.size, p.size);
        ctx.globalAlpha = 1.0;
    });

    ctx.restore();
}

function loop() {
    update();
    draw();
    requestAnimationFrame(loop);
}

loop();
