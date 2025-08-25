// // client/script.js
// const ws = new WebSocket('ws://localhost:8080');

// let playerId = null;
// let canClick = true;
// const COOLDOWN_BASE = 500; // Base cooldown in ms

// // ---------------------------
// // Predefined taunts
// // ---------------------------
// const taunts = [
//   "Is that all you got?",
//   "Try harder, champ!",
//   "Can't catch up, huh?",
//   "You're making it easy!",
//   "Top spot is mine!",
//   "Keep clicking, weakling!",
//   "Oh no, someone is winning!",
//   "Pathetic! Try again!"
// ];

// // ---------------------------
// // DOM elements
// // ---------------------------
// const loginDiv = document.getElementById('login');
// const gameDiv = document.getElementById('game');
// const usernameInput = document.getElementById('username');
// const joinBtn = document.getElementById('joinBtn');
// const totalCounterEl = document.getElementById('total');
// const incrementBtn = document.getElementById('incrementBtn');
// const leaderboardEl = document.getElementById('leaderboard');
// const rateLimitEl = document.getElementById('rateLimit');
// const progressBar = document.getElementById('progressBar');
// const tauntEl = document.getElementById('taunt');

// // ---------------------------
// // Heat button logic
// // ---------------------------
// let heatLevel = 0;          // 0 to 100
// let lastClickTime = 0;
// const HEAT_INCREMENT = 10;  // per click
// const HEAT_DECAY = 2;       // per decay interval
// const DECAY_DELAY = 500;    // ms before decay starts

// function updateButtonHeat() {
//   incrementBtn.style.background = `linear-gradient(to right, orange ${heatLevel}%, #fff ${heatLevel}%)`;
// }

// // Decay interval
// setInterval(() => {
//   const now = Date.now();
//   if (heatLevel > 0 && now - lastClickTime > DECAY_DELAY) {
//     heatLevel = Math.max(0, heatLevel - HEAT_DECAY);
//     updateButtonHeat();
//   }
// }, 100);

// // ---------------------------
// // Animate counter
// // ---------------------------
// function animateCounter(el, newValue) {
//   const current = parseInt(el.textContent);
//   const step = Math.max(1, Math.floor((newValue - current) / 10));
//   let count = current;

//   const interval = setInterval(() => {
//     count += step;
//     if (count >= newValue) {
//       count = newValue;
//       clearInterval(interval);
//     }
//     el.textContent = count;
//   }, 30);
// }

// // ---------------------------
// // Show taunt
// // ---------------------------
// function showTaunt(message) {
//   tauntEl.textContent = message;
//   tauntEl.style.opacity = 1;
//   setTimeout(() => tauntEl.style.opacity = 0, 3000);
// }

// // ---------------------------
// // Handle server messages
// // ---------------------------
// ws.onmessage = (event) => {
//   try {
//     const data = JSON.parse(event.data);

//     switch (data.type) {
//       case 'assignId':
//         playerId = data.playerId;
//         break;

//       case 'totalCounter':
//         animateCounter(totalCounterEl, data.total);
//         const progress = Math.min(100, (data.total / 1000) * 100);
//         progressBar.style.width = progress + '%';
//         break;

//       case 'leaderboard':
//         leaderboardEl.innerHTML = '';
//         data.leaderboard.forEach((p, idx) => {
//           const li = document.createElement('li');
//           li.textContent = `${p.username}: ${p.score}`;
//           if (idx === 0) li.classList.add('top');
//           leaderboardEl.appendChild(li);
//         });
//         break;

//       case 'taunt':
//         showTaunt(data.message);
//         break;

//       case 'rateLimited':
//         rateLimitEl.style.display = 'block';
//         setTimeout(() => rateLimitEl.style.display = 'none', 1000);
//         break;

//       default:
//         console.warn('Unknown message type:', data.type);
//     }
//   } catch (err) {
//     console.error('Error parsing message:', err);
//   }
// };

// // ---------------------------
// // Join game
// // ---------------------------
// joinBtn.addEventListener('click', () => {
//   const username = usernameInput.value.trim();
//   if (!username) return alert('Please enter a username');

//   ws.send(JSON.stringify({ type: 'register', username }));

//   loginDiv.style.display = 'none';
//   gameDiv.style.display = 'block';
// });

// // ---------------------------
// // Increment button click
// // ---------------------------
// incrementBtn.addEventListener('click', () => {
//   if (!canClick) return;

//   ws.send(JSON.stringify({ type: 'increment' }));
//   lastClickTime = Date.now();

//   // Increase heat level
//   heatLevel = Math.min(100, heatLevel + HEAT_INCREMENT);
//   updateButtonHeat();

//   // Cooldown
//   canClick = false;
//   incrementBtn.style.transform = 'scale(0.95)';
//   setTimeout(() => {
//     canClick = true;
//     incrementBtn.style.transform = 'scale(1)';
//   }, COOLDOWN_BASE);
// });






// Optimized client script with better latency handling
const ws = new WebSocket('ws://real-time-multi-client-engine.onrender.com:8080');

// Game state
let playerId = null;
let canClick = true;
let playerData = { score: 0, rank: 0 };
let clickTimes = [];
let streak = 0;
let lastClickTime = 0;
let achievements = new Set();
let powerUps = {
    doubleClick: { active: false, endTime: 0 },
    rapidFire: { active: false, endTime: 0 },
    shield: { active: false, endTime: 0 }
};

// Performance optimizations
let pendingRequests = new Map();
let lastLeaderboardHash = '';
let animationFrame = null;

// Demo hack
let isDemoMode = false;

// Heat system with optimized updates
let heatLevel = 0;
let lastHeatTime = 0;
const HEAT_INCREMENT = 15;
const HEAT_DECAY = 1;
const HEAT_DECAY_DELAY = 800;

// Latency tracking
let latencyHistory = [];
let currentLatency = 0;

// DOM elements (cached)
const loginDiv = document.getElementById('login');
const gameDiv = document.getElementById('game');
const usernameInput = document.getElementById('username');
const joinBtn = document.getElementById('joinBtn');
const totalCounterEl = document.getElementById('total');
const incrementBtn = document.getElementById('incrementBtn');
const leaderboardEl = document.getElementById('leaderboard');
const tauntEl = document.getElementById('taunt');
const progressBar = document.getElementById('progressBar');
const progressText = document.getElementById('progressText');
const playerScoreEl = document.getElementById('playerScore');
const playerRankEl = document.getElementById('playerRank');
const cpsEl = document.getElementById('clicksPerSecond');
const streakEl = document.getElementById('streak');
const multiplierDisplay = document.getElementById('multiplierDisplay');
const buttonText = document.getElementById('buttonText');
const heatOverlay = document.getElementById('heatOverlay');

// Optimized particle system with pooling
const particlePool = [];
const maxParticles = 50;

class Particle {
    constructor() {
        this.element = document.createElement('div');
        this.element.className = 'particle';
        this.reset();
    }
    
    reset() {
        this.x = 0;
        this.y = 0;
        this.vx = 0;
        this.vy = 0;
        this.life = 1.0;
        this.element.style.opacity = '1';
    }
    
    update() {
        this.x += this.vx * 0.016;
        this.y += this.vy * 0.016 + 0.5; // gravity
        this.life -= 0.02;
        
        this.element.style.left = this.x + 'px';
        this.element.style.top = this.y + 'px';
        this.element.style.opacity = this.life;
        
        return this.life > 0 && this.y < window.innerHeight;
    }
}

// Initialize particle pool
for (let i = 0; i < maxParticles; i++) {
    particlePool.push(new Particle());
}

function createParticleExplosion(x, y) {
    const particlesContainer = document.getElementById('particles');
    const particlesToUse = Math.min(10, particlePool.length); // Reduced particle count
    
    for (let i = 0; i < particlesToUse; i++) {
        const particle = particlePool.pop();
        if (!particle) break;
        
        particle.reset();
        particle.x = x;
        particle.y = y;
        
        const angle = (Math.PI * 2 * i) / particlesToUse;
        const velocity = 50 + Math.random() * 50; // Reduced velocity
        particle.vx = Math.cos(angle) * velocity;
        particle.vy = Math.sin(angle) * velocity;
        
        particlesContainer.appendChild(particle.element);
        
        const animateParticle = () => {
            if (particle.update()) {
                requestAnimationFrame(animateParticle);
            } else {
                particlesContainer.removeChild(particle.element);
                particlePool.push(particle); // Return to pool
            }
        };
        requestAnimationFrame(animateParticle);
    }
}

// Optimized leaderboard update with diffing
function updateLeaderboard(leaderboard) {
    const newHash = JSON.stringify(leaderboard);
    if (newHash === lastLeaderboardHash) return; // Skip if no changes
    lastLeaderboardHash = newHash;
    
    // Clear and rebuild (could be further optimized with virtual DOM)
    leaderboardEl.innerHTML = '';
    
    leaderboard.forEach((player, idx) => {
        const li = document.createElement('li');
        li.className = 'leaderboard-item';
        
        if (idx === 0) li.classList.add('top');
        else if (idx === 1) li.classList.add('second');
        else if (idx === 2) li.classList.add('third');

        if (player.username === usernameInput.value) {
            li.classList.add('current-player');
            // Update player data
            playerData.score = player.score;
            playerData.rank = idx + 1;
            playerScoreEl.textContent = player.score.toLocaleString();
            playerRankEl.textContent = `#${idx + 1}`;
            checkAchievements();
        }

        li.innerHTML = `
            <div style="display: flex; align-items: center; min-width: 0;">
                <div class="rank">${idx + 1}</div>
                <span class="player-name">${player.username}${player.username === usernameInput.value ? ' (You)' : ''}</span>
            </div>
            <span class="player-score">${player.score.toLocaleString()}</span>
        `;
        leaderboardEl.appendChild(li);
    });
    
    // Auto-scroll with throttling
    if (!animationFrame) {
        animationFrame = requestAnimationFrame(() => {
            scrollToPlayer();
            animationFrame = null;
        });
    }
}

// Optimized click handler with proper latency measurement
incrementBtn.addEventListener('click', (e) => {
    // Demo mode bypasses all restrictions
    if (!isDemoMode && (!canClick && !powerUps.rapidFire.active)) {
        return;
    }

    const requestId = Date.now() + Math.random();
    const sendTime = Date.now();
    
    // Store request for latency measurement
    pendingRequests.set(requestId, sendTime);

    // Send increment with request ID
    ws.send(JSON.stringify({ 
        type: 'increment',
        requestId: requestId,
        demoMode: isDemoMode 
    }));

    // Immediate UI feedback (optimistic updates)
    playClickSound();
    lastHeatTime = Date.now();
    heatLevel = Math.min(100, heatLevel + HEAT_INCREMENT);
    updateButtonHeat();

    // Particle explosion
    const rect = incrementBtn.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    createParticleExplosion(x, y);

    // Update local tracking
    clickTimes.push(Date.now());
    updateCPS();
    updateStreak();

    // Dynamic cooldown based on actual server response time
    if (!powerUps.rapidFire.active && !isDemoMode) {
        canClick = false;
        incrementBtn.style.transform = 'scale(0.9)';
        
        // Use adaptive cooldown based on recent latency
        const adaptiveCooldown = Math.max(200, Math.min(800, currentLatency * 2));
        
        setTimeout(() => {
            canClick = true;
            incrementBtn.style.transform = 'scale(1)';
        }, adaptiveCooldown);
    }

    // Clean up old pending requests (prevent memory leaks)
    setTimeout(() => {
        pendingRequests.delete(requestId);
    }, 5000);
});

// Enhanced WebSocket message handling with latency tracking
ws.onmessage = (event) => {
    const receiveTime = Date.now();
    
    try {
        const data = JSON.parse(event.data);

        // Track latency for increment responses
        if (data.type === 'totalCounter' && data.requestId) {
            const sendTime = pendingRequests.get(data.requestId);
            if (sendTime) {
                const latency = receiveTime - sendTime;
                latencyHistory.push(latency);
                
                // Keep only recent latency measurements
                if (latencyHistory.length > 10) {
                    latencyHistory.shift();
                }
                
                // Calculate average latency
                currentLatency = latencyHistory.reduce((a, b) => a + b, 0) / latencyHistory.length;
                
                pendingRequests.delete(data.requestId);
                
                // Display latency for debugging
                console.log(`Latency: ${latency}ms (avg: ${currentLatency.toFixed(1)}ms)`);
            }
        }

        switch (data.type) {
            case 'assignId':
                playerId = data.playerId;
                break;

            case 'totalCounter':
                animateCounter(totalCounterEl, data.total);
                const progress = Math.min(100, (data.total / 10000) * 100);
                progressBar.style.width = progress + '%';
                progressText.textContent = `${data.total.toLocaleString()} / 10,000`;
                break;

            case 'leaderboard':
                updateLeaderboard(data.leaderboard);
                break;

            case 'taunt':
                showTaunt(data.message);
                break;

            case 'rateLimited':
                // Visual feedback for rate limiting
                incrementBtn.style.background = 'linear-gradient(45deg, #ff4757, #ff3838)';
                setTimeout(() => {
                    incrementBtn.style.background = 'linear-gradient(45deg, #ff6b6b, #4ecdc4)';
                }, 1000);
                break;

            case 'powerUpActivated':
                playPowerUpSound();
                break;

            case 'multiplierGained':
                showMultiplierFeedback(data.multiplier);
                break;
        }
    } catch (err) {
        console.error('Error parsing message:', err);
    }
};

// Optimized game loop with single requestAnimationFrame
let lastUpdateTime = 0;
function gameLoop(currentTime) {
    if (currentTime - lastUpdateTime >= 100) { // 10 FPS for non-critical updates
        updateCPS();
        updatePowerUps();
        updateHeat();
        lastUpdateTime = currentTime;
    }
    
    requestAnimationFrame(gameLoop);
}

function updateHeat() {
    const now = Date.now();
    if (heatLevel > 0 && now - lastHeatTime > HEAT_DECAY_DELAY) {
        heatLevel = Math.max(0, heatLevel - HEAT_DECAY);
        updateButtonHeat();
    }
}

// Connection state monitoring
ws.addEventListener('open', () => {
    console.log('✅ Connected to server');
});

ws.addEventListener('close', () => {
    console.log('❌ Disconnected from server');
    // Could implement reconnection logic here
});

ws.addEventListener('error', (error) => {
    console.error('❌ WebSocket error:', error);
});

// Start optimized game loop
requestAnimationFrame(gameLoop);

// Rest of the functions remain the same but with optimizations...
// (Including updateButtonHeat, showTaunt, checkAchievements, etc.)