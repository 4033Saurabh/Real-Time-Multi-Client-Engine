
# Real-Time Multi-Client Engine

A scalable real-time engine built with **Node.js, WebSockets, and Redis** that can handle **150+ concurrent clients** with live leaderboards, interactive UI, and concurrency control.  
This project demonstrates how to build robust client–server architectures with low latency, stability, and resilience.

---

## 🚀 Features
- **Scalable Real-Time Engine**: Supports 150+ concurrent clients with smooth performance.
- **Low Latency**: Achieves ~17ms connection time and <5ms average message latency.
- **Robust Architecture**: WebSocket-based client–server communication with Redis for caching and broadcasting.
- **Concurrency Control**: Rate limiting, cooldowns, and hashed validation to prevent dirty writes.
- **Dynamic Leaderboard**: Real-time leaderboard handling ~150 events/second.
- **Interactive UI**: Heat-based button, progress bar, and taunts for gamified experience.
- **Fault-Tolerant**: Resilient synchronization of game state across clients.

---

## 🛠️ Tech Stack
- [Node.js](https://nodejs.org/)
- [WebSockets (ws)](https://www.npmjs.com/package/ws)
- [Redis](https://redis.io/)
- [UUID](https://www.npmjs.com/package/uuid)
- [HTML, CSS, JavaScript] (Frontend UI)

---

## 📂 Project Structure
```

├── server.js        # WebSocket + Redis server
├── script.js        # Client-side game logic
├── index.html       # Frontend UI
├── style.css        # Styling for the UI
├── package.json     # Node.js dependencies and scripts
└── package-lock.json

````

---

## ⚡ Getting Started

### Prerequisites
- Node.js (>= 18)
- Redis (>= 5.8)

### Installation
1. Clone the repository:
```bash
   git clone https://github.com/4033Saurabh/Real-Time-Multi-Client-Engine.git
   cd Real-Time-Multi-Client-Engine
````

2. Install dependencies:

   ```bash
   npm install
   ```
3. Start Redis (make sure it's running locally):

   ```bash
   redis-server
   ```
4. Start the WebSocket server:

   ```bash
   npm start
   ```

---

## 🎮 Usage

1. Open `index.html` in your browser.
2. Enter a username and join the game.
3. Click the **Increment** button to increase your score.
4. Watch the **leaderboard update in real-time** with taunts and progress bar.

---

## 📊 Outcomes

* Real-time synchronization of game states across clients.
* High throughput of \~150 events/sec with low latency.
* Fault-tolerant, resilient client–server system.

---

## 🤝 Contributing

Contributions are welcome!
To contribute:

1. Fork this repository.
2. Create your feature branch:

   ```bash
   git checkout -b feature/YourFeature
   ```
3. Commit your changes:

   ```bash
   git commit -m "Add new feature"
   ```
4. Push to the branch:

   ```bash
   git push origin feature/YourFeature
   ```
5. Open a Pull Request.

---

