// debug-server.js - Fixed version with proper latency measurement
const WebSocket = require('ws');

class ServerDebugger {
    constructor() {
        this.serverUrl = 'ws://localhost:8080';
        this.messageLog = [];
        this.latencyResults = [];
        this.pendingRequests = new Map(); // Track pending requests with timestamps
    }

    async debugLatencyIssue() {
        console.log('🔍 Debugging Server Latency Issue...\n');
        
        const ws = new WebSocket(this.serverUrl);
        let playerId = null;
        let isRegistered = false;
        let requestId = 0;
        
        ws.onopen = () => {
            console.log('✓ Connected to server');
            console.log('Waiting for player ID assignment...');
        };

        ws.onmessage = (event) => {
            const receiveTime = Date.now();
            const data = JSON.parse(event.data);
            
            console.log(`📥 [${new Date().toISOString()}] Received:`, data.type);
            
            switch (data.type) {
                case 'assignId':
                    playerId = data.playerId;
                    console.log(`✓ Assigned Player ID: ${playerId}`);
                    console.log('Sending registration...');
                    ws.send(JSON.stringify({ type: 'register', username: 'DebugUser' }));
                    break;
                    
                case 'leaderboard':
                    if (!isRegistered) {
                        console.log('✓ Registration confirmed');
                        isRegistered = true;
                        
                        // Start latency testing after registration
                        setTimeout(() => {
                            this.startLatencyTest(ws);
                        }, 100);
                    }
                    break;
                    
                case 'totalCounter':
                    // Find and measure latency for pending increment requests
                    for (let [reqId, timestamp] of this.pendingRequests.entries()) {
                        const latency = receiveTime - timestamp;
                        this.latencyResults.push(latency);
                        console.log(`✓ Request ${reqId} completed in ${latency}ms`);
                        this.pendingRequests.delete(reqId);
                        break; // Only process the oldest pending request
                    }
                    break;
                    
                case 'rateLimited':
                    console.log('⚠ Rate limited detected');
                    // Remove the pending request that was rate limited
                    if (this.pendingRequests.size > 0) {
                        const oldestReq = this.pendingRequests.keys().next().value;
                        this.pendingRequests.delete(oldestReq);
                    }
                    break;
                    
                default:
                    console.log(`📥 Other message: ${data.type}`);
            }
        };

        ws.onerror = (error) => {
            console.log('❌ WebSocket error:', error.message);
        };

        ws.onclose = (code, reason) => {
            console.log(`🔌 Connection closed: ${code}`);
            this.printLatencyStats();
        };

        // Timeout test
        setTimeout(() => {
            if (ws.readyState === WebSocket.OPEN) {
                console.log('\n⏰ Test timeout reached, closing connection');
                ws.close();
            }
        }, 15000);
    }

    startLatencyTest(ws) {
        console.log('\n🚀 Starting latency test...');
        let requestCount = 0;
        const maxRequests = 10;
        const requestInterval = 800; // Slightly above server cooldown
        
        const testInterval = setInterval(() => {
            if (requestCount >= maxRequests) {
                clearInterval(testInterval);
                console.log('\n✓ Latency test completed');
                
                // Close connection after a delay to ensure all responses are received
                setTimeout(() => {
                    if (ws.readyState === WebSocket.OPEN) {
                        ws.close();
                    }
                }, 2000);
                return;
            }
            
            requestCount++;
            const requestId = Date.now() + requestCount; // Unique request ID
            const sendTime = Date.now();
            
            console.log(`📤 Sending increment ${requestCount}/${maxRequests} (ID: ${requestId})`);
            
            // Store the request with its timestamp
            this.pendingRequests.set(requestId, sendTime);
            
            ws.send(JSON.stringify({ 
                type: 'increment',
                requestId: requestId // Include ID for tracking (optional)
            }));
            
        }, requestInterval);
    }

    printLatencyStats() {
        console.log('\n📊 LATENCY STATISTICS');
        console.log('=' .repeat(30));
        
        if (this.latencyResults.length === 0) {
            console.log('❌ No latency measurements recorded');
            console.log('Possible issues:');
            console.log('  - Server not responding to increments');
            console.log('  - Rate limiting blocking all requests');
            console.log('  - Connection issues');
            return;
        }

        const total = this.latencyResults.reduce((sum, lat) => sum + lat, 0);
        const average = total / this.latencyResults.length;
        const max = Math.max(...this.latencyResults);
        const min = Math.min(...this.latencyResults);
        const successRate = (this.latencyResults.length / 10) * 100; // Assuming 10 total requests

        console.log(`Measurements: ${this.latencyResults.length}`);
        console.log(`Average: ${average.toFixed(2)}ms`);
        console.log(`Min: ${min}ms`);
        console.log(`Max: ${max}ms`);
        console.log(`Success Rate: ${successRate.toFixed(1)}%`);
        console.log(`Raw data: [${this.latencyResults.join(', ')}]ms`);
        
        // Status assessment
        if (average < 100) {
            console.log('Status: ✅ EXCELLENT');
        } else if (average < 300) {
            console.log('Status: ✓ GOOD');
        } else if (average < 1000) {
            console.log('Status: ⚠ NEEDS IMPROVEMENT');
        } else {
            console.log('Status: ❌ POOR');
        }

        // Pending requests check
        if (this.pendingRequests.size > 0) {
            console.log(`\n⚠ Warning: ${this.pendingRequests.size} requests still pending`);
            console.log('This suggests server may be overloaded or not responding');
        }
    }

    async testServerHealth() {
        console.log('🏥 Testing Server Health...\n');
        
        // Test 1: Basic connection
        try {
            const ws = new WebSocket(this.serverUrl);
            await new Promise((resolve, reject) => {
                ws.onopen = resolve;
                ws.onerror = reject;
                setTimeout(() => reject(new Error('Connection timeout')), 5000);
            });
            ws.close();
            console.log('✓ Server is accepting connections');
        } catch (error) {
            console.log('❌ Server connection failed:', error.message);
            return;
        }

        // Test 2: Message handling
        const ws = new WebSocket(this.serverUrl);
        let messageReceived = false;
        let assignedId = false;
        let receivedLeaderboard = false;
        
        ws.onopen = () => {
            console.log('✓ Testing message handling...');
        };
        
        ws.onmessage = (event) => {
            messageReceived = true;
            const data = JSON.parse(event.data);
            
            if (data.type === 'assignId') {
                assignedId = true;
                console.log('✓ Server is assigning player IDs');
                ws.send(JSON.stringify({ type: 'register', username: 'HealthCheck' }));
            } else if (data.type === 'leaderboard') {
                receivedLeaderboard = true;
                console.log('✓ Server is broadcasting leaderboards');
                ws.close();
            }
        };
        
        setTimeout(() => {
            if (!messageReceived) {
                console.log('❌ No messages received from server');
            } else {
                if (!assignedId) console.log('⚠ No player ID assigned');
                if (!receivedLeaderboard) console.log('⚠ No leaderboard received');
            }
            
            if (ws.readyState === WebSocket.OPEN) {
                ws.close();
            }
        }, 3000);
    }

    async checkRedisConnection() {
        console.log('🔍 Checking Redis Connection...\n');
        
        try {
            const redis = require('redis');
            const client = redis.createClient();
            
            await client.connect();
            await client.ping();
            console.log('✓ Redis is responding to ping');
            
            // Test basic operations
            await client.set('test_key', 'test_value');
            const value = await client.get('test_key');
            console.log('✓ Redis read/write operations working');
            
            await client.del('test_key');
            await client.quit();
            
        } catch (error) {
            console.log('❌ Redis connection issue:', error.message);
            console.log('Make sure Redis is running: redis-server');
        }
    }

    async runFullDiagnostic() {
        console.log('🔧 FULL SERVER DIAGNOSTIC\n');
        console.log('='.repeat(50) + '\n');
        
        await this.checkRedisConnection();
        console.log('');
        await this.testServerHealth();
        console.log('');
        await this.debugLatencyIssue();
    }
}

// CLI usage
if (require.main === module) {
    const serverDebugger = new ServerDebugger();
    
    const command = process.argv[2] || 'full';
    
    switch (command) {
        case 'latency':
            serverDebugger.debugLatencyIssue();
            break;
        case 'health':
            serverDebugger.testServerHealth();
            break;
        case 'redis':
            serverDebugger.checkRedisConnection();
            break;
        case 'full':
        default:
            serverDebugger.runFullDiagnostic();
            break;
    }
}

module.exports = ServerDebugger;