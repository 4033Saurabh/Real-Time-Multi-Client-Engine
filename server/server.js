// server/server.js
const WebSocket = require('ws');
const redis = require('redis');

// ---------------------------
// Redis setup
// ---------------------------
// const redisClient = redis.createClient();

const redisClient = redis.createClient({
  url: "redis://red-d2mb96ffte5s73d1ibq0:6379",
});


redisClient.on('error', (err) => console.error('Redis error:', err));

redisClient.connect().then(async () => {
    console.log("Connected to Redis, clearing old keys...");
    await redisClient.FLUSHDB(); // clear old game data
});

// ---------------------------
// WebSocket setup
// ---------------------------
const wss = new WebSocket.Server({ port: 8080 });

// ---------------------------
// Game state
// ---------------------------
let players = {};           // {playerId: {username, score, powerUps}}
let totalCounter = 0;       // Global counter
const playerCooldown = {};  // Track per-player cooldowns

// ---------------------------
// Predefined taunts
// ---------------------------
const taunts = [
  "Is that all you got?",
  "Try harder, champ!",
  "Can't catch up, huh?",
  "You're making it easy!",
  "Top spot is mine!",
  "Keep clicking, weakling!",
  "Oh no, someone is winning!",
  "Pathetic! Try again!",
  "Amateur hour over here!",
  "My grandma clicks faster!",
  "Are you even trying?",
  "Skill issue detected!",
  "Better luck next time!",
  "Git gud, noob!"
];

// ---------------------------
// Power-up definitions
// ---------------------------
const powerUpCosts = {
    doubleClick: 500,
    rapidFire: 750,
    shield: 300
};

// ---------------------------
// Broadcast helper
// ---------------------------
function broadcast(data) {
  const message = JSON.stringify(data);
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

// ---------------------------
// Broadcast leaderboard + taunt
// ---------------------------
function broadcastLeaderboard(withTaunt = false) {
  const leaderboard = Object.values(players)
    .sort((a, b) => b.score - a.score)
    .map(p => ({ username: p.username, score: p.score }));

  broadcast({ type: 'leaderboard', leaderboard });

  if (withTaunt && leaderboard.length > 0) {
    const topPlayer = leaderboard[0];
    const taunt = taunts[Math.floor(Math.random() * taunts.length)];
    
    // Send taunt to everyone except those with active shields
    Object.keys(players).forEach(id => {
      const player = players[id];
      if (!player.powerUps?.shield || Date.now() > player.powerUps.shield.endTime) {
        // Player doesn't have shield or it's expired
        const client = Array.from(wss.clients).find(c => c.playerId === id);
        if (client && client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({ 
            type: 'taunt', 
            message: `${topPlayer.username}: ${taunt}` 
          }));
        }
      }
    });
  }
}

// ---------------------------
// Check if player has active power-up
// ---------------------------
function hasActivePowerUp(playerId, powerUpType) {
  const player = players[playerId];
  if (!player || !player.powerUps || !player.powerUps[powerUpType]) return false;
  return Date.now() < player.powerUps[powerUpType].endTime;
}

// ---------------------------
// WebSocket connection
// ---------------------------
wss.on('connection', ws => {
  const playerId = Math.random().toString(36).substr(2, 9);
  ws.playerId = playerId; // Store playerId on connection
  ws.send(JSON.stringify({ type: 'assignId', playerId }));

  ws.on('message', (msg) => {
    try {
      const data = JSON.parse(msg);

      // -----------------------
      // Player registration
      // -----------------------
      if (data.type === 'register') {
        players[playerId] = { 
          username: data.username, 
          score: 0,
          powerUps: {}
        };
        broadcastLeaderboard();
      }

      // -----------------------
      // Buy power-up
      // -----------------------
      if (data.type === 'buyPowerUp') {
        const player = players[playerId];
        const powerUpType = data.powerUp;
        const cost = powerUpCosts[powerUpType];

        if (player && player.score >= cost && !hasActivePowerUp(playerId, powerUpType)) {
          // Deduct cost
          player.score -= cost;

          // Activate power-up
          if (!player.powerUps) player.powerUps = {};
          
          let duration;
          switch (powerUpType) {
            case 'doubleClick':
              duration = 10000; // 10 seconds
              break;
            case 'rapidFire':
              duration = 5000;  // 5 seconds
              break;
            case 'shield':
              duration = 30000; // 30 seconds
              break;
            default:
              duration = 5000;
          }

          player.powerUps[powerUpType] = {
            endTime: Date.now() + duration
          };

          // Broadcast updated leaderboard
          broadcastLeaderboard();
          
          // Send confirmation to player
          ws.send(JSON.stringify({ 
            type: 'powerUpActivated', 
            powerUp: powerUpType,
            duration: duration
          }));
        } else {
          // Send error message
          ws.send(JSON.stringify({ 
            type: 'powerUpError', 
            message: 'Cannot purchase power-up' 
          }));
        }
      }

      // -----------------------
      // Increment counter
      // -----------------------
      if (data.type === 'increment') {
        const now = Date.now();
        const player = players[playerId];
        const isDemoMode = data.demoMode === true;

        if (!player) return;

        // Check cooldown (unless rapid fire is active or demo mode)
        const hasRapidFire = hasActivePowerUp(playerId, 'rapidFire');
        if (!hasRapidFire && !isDemoMode && playerCooldown[playerId] && now < playerCooldown[playerId]) {
          ws.send(JSON.stringify({ type: 'rateLimited' }));
          return;
        }

        // Calculate multiplier
        let multiplier = 1;
        
        // Base random multiplier (20% chance for 2x, 50% in demo mode)
        const randomChance = isDemoMode ? 0.5 : 0.2;
        if (Math.random() < randomChance) multiplier = 2;
        
        // Demo mode gets extra bonuses
        if (isDemoMode) {
          multiplier *= (1 + Math.random()); // Random 1x to 2x additional multiplier
        }
        
        // Double click power-up
        if (hasActivePowerUp(playerId, 'doubleClick')) {
          multiplier *= 2;
        }

        // Streak bonus (every 10 clicks in a row gives small bonus)
        if (!player.streak) player.streak = 0;
        if (now - (player.lastClick || 0) < 2000) {
          player.streak++;
        } else {
          player.streak = 1;
        }
        player.lastClick = now;

        // Small streak bonus (bigger in demo mode)
        if (player.streak >= 10 && player.streak % 10 === 0) {
          multiplier += isDemoMode ? 1 : 0.5;
        }

        // Apply increment
        const finalIncrement = Math.floor(multiplier);
        player.score += finalIncrement;
        totalCounter += finalIncrement;

        // Set cooldown (unless rapid fire is active or demo mode)
        if (!hasRapidFire && !isDemoMode) {
          const cooldown = multiplier > 1 ? 1000 : 500;
          playerCooldown[playerId] = now + cooldown;
        }

        // Broadcast updates
        broadcast({ type: 'totalCounter', total: totalCounter });
        broadcastLeaderboard(Math.random() < 0.3); // 30% chance for taunt

        // Send multiplier info to player
        if (finalIncrement > 1) {
          ws.send(JSON.stringify({ 
            type: 'multiplierGained', 
            multiplier: finalIncrement 
          }));
        }
      }

    } catch (err) {
      console.error('Error handling message:', err);
    }
  });

  ws.on('close', () => {
    delete players[playerId];
    delete playerCooldown[playerId];
    broadcastLeaderboard();
  });
});

// ---------------------------
// Cleanup expired power-ups periodically
// ---------------------------
setInterval(() => {
  const now = Date.now();
  Object.values(players).forEach(player => {
    if (player.powerUps) {
      Object.keys(player.powerUps).forEach(powerUpType => {
        if (now > player.powerUps[powerUpType].endTime) {
          delete player.powerUps[powerUpType];
        }
      });
    }
  });
}, 1000);

console.log("Enhanced WebSocket server running on ws://localhost:8080");
console.log("New features: Power-ups, Achievements, Enhanced UI");