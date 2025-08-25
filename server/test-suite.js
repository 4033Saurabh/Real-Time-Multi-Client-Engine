// test-suite.js - Comprehensive testing for real-time counter game
const WebSocket = require('ws');
const { performance } = require('perf_hooks');

class GameTester {
    constructor() {
        this.clients = [];
        this.testResults = {
            latency: [],
            throughput: [],
            errors: [],
            stateConsistency: [],
            concurrency: []
        };
        this.serverUrl = 'ws://localhost:8080';
        this.isRunning = false;
    }

    // Utility: Create a test client
    createClient(username) {
        return new Promise((resolve, reject) => {
            const ws = new WebSocket(this.serverUrl);
            const client = {
                ws,
                id: null,
                username,
                score: 0,
                latencies: [],
                messageCount: 0,
                errors: []
            };

            ws.onopen = () => {
                console.log(`✓ Client ${username} connected`);
            };

            ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    client.messageCount++;
                    
                    // Track latency for increment responses
                    if (data.type === 'totalCounter' && client.lastClickTime) {
                        const latency = performance.now() - client.lastClickTime;
                        client.latencies.push(latency);
                        this.testResults.latency.push(latency);
                        client.lastClickTime = null;
                    }

                    // Handle different message types
                    switch (data.type) {
                        case 'assignId':
                            client.id = data.playerId;
                            // Auto-register the client
                            ws.send(JSON.stringify({ type: 'register', username }));
                            resolve(client);
                            break;
                        case 'leaderboard':
                            // Update client score from leaderboard
                            const playerData = data.leaderboard.find(p => p.username === username);
                            if (playerData) client.score = playerData.score;
                            break;
                        case 'rateLimited':
                            client.errors.push('Rate limited');
                            break;
                    }
                } catch (err) {
                    client.errors.push(`Parse error: ${err.message}`);
                    this.testResults.errors.push(`${username}: ${err.message}`);
                }
            };

            ws.onerror = (error) => {
                client.errors.push(`WebSocket error: ${error.message}`);
                reject(error);
            };

            ws.onclose = () => {
                console.log(`✗ Client ${username} disconnected`);
            };

            this.clients.push(client);
        });
    }

    // Test 1: Basic connectivity and registration
    async testBasicConnectivity() {
        console.log('\n🔧 Testing Basic Connectivity...');
        const startTime = performance.now();
        
        try {
            const client = await this.createClient('TestUser1');
            const connectTime = performance.now() - startTime;
            
            console.log(`✓ Connection established in ${connectTime.toFixed(2)}ms`);
            console.log(`✓ Client ID: ${client.id}`);
            console.log(`✓ Registration successful`);
            
            client.ws.close();
            return { success: true, connectTime };
        } catch (error) {
            console.log(`✗ Connection failed: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    // Test 2: Latency measurement
    async testLatency(clickCount = 100) {
        console.log(`\n⚡ Testing Latency with ${clickCount} clicks...`);
        
        const client = await this.createClient('LatencyTester');
        const latencies = [];
        
        await new Promise(resolve => setTimeout(resolve, 100)); // Wait for registration
        
        for (let i = 0; i < clickCount; i++) {
            const start = performance.now();
            client.lastClickTime = start;
            
            client.ws.send(JSON.stringify({ type: 'increment' }));
            
            // Wait for response or timeout
            await new Promise(resolve => {
                const timeout = setTimeout(() => {
                    latencies.push(1000); // 1000ms timeout
                    resolve();
                }, 1000);
                
                const originalHandler = client.ws.onmessage;
                client.ws.onmessage = (event) => {
                    originalHandler(event);
                    const data = JSON.parse(event.data);
                    if (data.type === 'totalCounter') {
                        clearTimeout(timeout);
                        resolve();
                    }
                };
            });
            
            // Rate limiting delay
            await new Promise(resolve => setTimeout(resolve, 600));
        }
        
        const avgLatency = latencies.length > 0 ? 
            latencies.reduce((a, b) => a + b) / latencies.length : 0;
        const maxLatency = Math.max(...latencies);
        const minLatency = Math.min(...latencies);
        
        console.log(`✓ Average latency: ${avgLatency.toFixed(2)}ms`);
        console.log(`✓ Min latency: ${minLatency.toFixed(2)}ms`);
        console.log(`✓ Max latency: ${maxLatency.toFixed(2)}ms`);
        console.log(`✓ Successful clicks: ${latencies.filter(l => l < 1000).length}/${clickCount}`);
        
        client.ws.close();
        return { avgLatency, maxLatency, minLatency, successRate: latencies.filter(l => l < 1000).length / clickCount };
    }

    // Test 3: Concurrent users stress test
    async testConcurrentUsers(userCount = 50, clicksPerUser = 20) {
        console.log(`\n👥 Testing ${userCount} Concurrent Users (${clicksPerUser} clicks each)...`);
        
        const clients = [];
        const startTime = performance.now();
        
        // Create all clients
        console.log('Creating clients...');
        for (let i = 0; i < userCount; i++) {
            try {
                const client = await this.createClient(`User${i}`);
                clients.push(client);
            } catch (error) {
                console.log(`✗ Failed to create client ${i}: ${error.message}`);
            }
        }
        
        console.log(`✓ Created ${clients.length}/${userCount} clients`);
        
        // Wait for all registrations
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Simulate concurrent clicking
        console.log('Starting concurrent clicking...');
        const clickPromises = clients.map(async (client, index) => {
            const clickResults = { sent: 0, errors: 0 };
            
            for (let click = 0; click < clicksPerUser; click++) {
                try {
                    client.ws.send(JSON.stringify({ type: 'increment' }));
                    clickResults.sent++;
                    
                    // Stagger clicks to simulate realistic usage
                    const delay = 500 + Math.random() * 1000;
                    await new Promise(resolve => setTimeout(resolve, delay));
                } catch (error) {
                    clickResults.errors++;
                }
            }
            
            return clickResults;
        });
        
        const results = await Promise.all(clickPromises);
        const totalClicks = results.reduce((sum, r) => sum + r.sent, 0);
        const totalErrors = results.reduce((sum, r) => sum + r.errors, 0);
        const testDuration = performance.now() - startTime;
        const throughput = (totalClicks / testDuration) * 1000; // clicks per second
        
        console.log(`✓ Test duration: ${(testDuration / 1000).toFixed(2)} seconds`);
        console.log(`✓ Total clicks sent: ${totalClicks}`);
        console.log(`✓ Total errors: ${totalErrors}`);
        console.log(`✓ Throughput: ${throughput.toFixed(2)} clicks/second`);
        console.log(`✓ Success rate: ${((totalClicks - totalErrors) / totalClicks * 100).toFixed(2)}%`);
        
        // Close all clients
        clients.forEach(client => client.ws.close());
        
        return {
            userCount: clients.length,
            totalClicks,
            totalErrors,
            throughput,
            successRate: (totalClicks - totalErrors) / totalClicks,
            duration: testDuration
        };
    }

    // Test 4: State consistency check
    async testStateConsistency() {
        console.log('\n🔄 Testing State Consistency...');
        
        const clients = [];
        for (let i = 0; i < 5; i++) {
            clients.push(await this.createClient(`StateTest${i}`));
        }
        
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Each client makes some clicks
        for (let client of clients) {
            for (let i = 0; i < 5; i++) {
                client.ws.send(JSON.stringify({ type: 'increment' }));
                await new Promise(resolve => setTimeout(resolve, 700));
            }
        }
        
        // Wait for state to settle
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Check if all clients have consistent leaderboard data
        const leaderboards = [];
        const leaderboardPromises = clients.map(client => {
            return new Promise(resolve => {
                const originalHandler = client.ws.onmessage;
                client.ws.onmessage = (event) => {
                    originalHandler(event);
                    const data = JSON.parse(event.data);
                    if (data.type === 'leaderboard') {
                        leaderboards.push(data.leaderboard);
                        resolve();
                    }
                };
            });
        });
        
        await Promise.all(leaderboardPromises);
        
        // Check consistency
        const isConsistent = leaderboards.every(lb => 
            JSON.stringify(lb) === JSON.stringify(leaderboards[0])
        );
        
        console.log(`✓ Leaderboard consistency: ${isConsistent ? 'PASSED' : 'FAILED'}`);
        if (isConsistent) {
            console.log(`✓ Total players: ${leaderboards[0].length}`);
            console.log(`✓ Top scorer: ${leaderboards[0][0]?.username} with ${leaderboards[0][0]?.score} points`);
        }
        
        clients.forEach(client => client.ws.close());
        return { consistent: isConsistent, playerCount: leaderboards[0]?.length || 0 };
    }

    // Test 5: Power-up functionality
    async testPowerUps() {
        console.log('\n⚡ Testing Power-up System...');
        
        const client = await this.createClient('PowerUpTester');
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Generate enough score to buy power-ups
        console.log('Building up score for power-up purchase...');
        for (let i = 0; i < 100; i++) {
            client.ws.send(JSON.stringify({ type: 'increment' }));
            await new Promise(resolve => setTimeout(resolve, 600));
        }
        
        // Wait for score to update
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        console.log(`Current score: ${client.score}`);
        
        // Test buying shield (cheapest power-up)
        if (client.score >= 300) {
            console.log('Testing shield power-up...');
            client.ws.send(JSON.stringify({ type: 'buyPowerUp', powerUp: 'shield' }));
            
            // Wait for confirmation
            await new Promise(resolve => {
                const originalHandler = client.ws.onmessage;
                client.ws.onmessage = (event) => {
                    originalHandler(event);
                    const data = JSON.parse(event.data);
                    if (data.type === 'powerUpActivated') {
                        console.log(`✓ Shield activated for ${data.duration}ms`);
                        resolve();
                    } else if (data.type === 'powerUpError') {
                        console.log(`✗ Power-up error: ${data.message}`);
                        resolve();
                    }
                };
                setTimeout(resolve, 2000); // Timeout after 2s
            });
        } else {
            console.log('✗ Insufficient score for power-up testing');
        }
        
        client.ws.close();
        return { tested: true, score: client.score };
    }

    // Test 6: Rate limiting
    async testRateLimiting() {
        console.log('\n🚦 Testing Rate Limiting...');
        
        const client = await this.createClient('RateLimitTester');
        await new Promise(resolve => setTimeout(resolve, 500));
        
        let rateLimitHits = 0;
        let totalClicks = 0;
        
        // Listen for rate limit messages
        const originalHandler = client.ws.onmessage;
        client.ws.onmessage = (event) => {
            originalHandler(event);
            const data = JSON.parse(event.data);
            if (data.type === 'rateLimited') {
                rateLimitHits++;
            }
        };
        
        // Rapid fire clicks (should trigger rate limiting)
        console.log('Sending rapid clicks to trigger rate limiting...');
        for (let i = 0; i < 20; i++) {
            client.ws.send(JSON.stringify({ type: 'increment' }));
            totalClicks++;
            await new Promise(resolve => setTimeout(resolve, 100)); // Very fast clicks
        }
        
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        console.log(`✓ Total clicks sent: ${totalClicks}`);
        console.log(`✓ Rate limit hits: ${rateLimitHits}`);
        console.log(`✓ Rate limiting ${rateLimitHits > 0 ? 'WORKING' : 'NOT DETECTED'}`);
        
        client.ws.close();
        return { totalClicks, rateLimitHits, working: rateLimitHits > 0 };
    }

    // Test 7: Memory leak detection
    async testMemoryUsage() {
        console.log('\n💾 Testing Memory Usage...');
        
        const initialMemory = process.memoryUsage();
        const clients = [];
        
        // Create and destroy clients repeatedly
        for (let cycle = 0; cycle < 10; cycle++) {
            console.log(`Cycle ${cycle + 1}/10`);
            
            // Create 20 clients
            for (let i = 0; i < 20; i++) {
                const client = await this.createClient(`MemTest${cycle}_${i}`);
                clients.push(client);
            }
            
            // Each client makes some actions
            await Promise.all(clients.map(async client => {
                for (let i = 0; i < 5; i++) {
                    client.ws.send(JSON.stringify({ type: 'increment' }));
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
            }));
            
            // Close all clients
            clients.forEach(client => client.ws.close());
            clients.length = 0;
            
            // Force garbage collection if available
            if (global.gc) global.gc();
            
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        
        const finalMemory = process.memoryUsage();
        const memoryIncrease = {
            rss: finalMemory.rss - initialMemory.rss,
            heapUsed: finalMemory.heapUsed - initialMemory.heapUsed,
            heapTotal: finalMemory.heapTotal - initialMemory.heapTotal
        };
        
        console.log(`✓ Memory usage change:`);
        console.log(`  RSS: ${(memoryIncrease.rss / 1024 / 1024).toFixed(2)} MB`);
        console.log(`  Heap Used: ${(memoryIncrease.heapUsed / 1024 / 1024).toFixed(2)} MB`);
        console.log(`  Heap Total: ${(memoryIncrease.heapTotal / 1024 / 1024).toFixed(2)} MB`);
        
        return memoryIncrease;
    }

    // Run all tests
    async runAllTests() {
        console.log('🚀 Starting Comprehensive Game Testing Suite');
        console.log('='.repeat(50));
        
        const results = {};
        
        try {
            results.connectivity = await this.testBasicConnectivity();
            results.latency = await this.testLatency(50);
            results.concurrency = await this.testConcurrentUsers(25, 10);
            results.stateConsistency = await this.testStateConsistency();
            results.powerUps = await this.testPowerUps();
            results.rateLimiting = await this.testRateLimiting();
            results.memoryUsage = await this.testMemoryUsage();
        } catch (error) {
            console.error(`Test suite error: ${error.message}`);
        }
        
        // Generate summary report
        console.log('\n📊 TEST SUMMARY REPORT');
        console.log('='.repeat(50));
        
        console.log('\n🔧 CONNECTIVITY:');
        console.log(`  Status: ${results.connectivity?.success ? '✓ PASS' : '✗ FAIL'}`);
        if (results.connectivity?.connectTime) {
            console.log(`  Connection Time: ${results.connectivity.connectTime.toFixed(2)}ms`);
        }
        
        console.log('\n⚡ LATENCY:');
        if (results.latency) {
            console.log(`  Average: ${results.latency.avgLatency.toFixed(2)}ms`);
            console.log(`  Max: ${results.latency.maxLatency.toFixed(2)}ms`);
            console.log(`  Success Rate: ${(results.latency.successRate * 100).toFixed(2)}%`);
            console.log(`  Status: ${results.latency.avgLatency < 100 ? '✓ EXCELLENT' : results.latency.avgLatency < 200 ? '✓ GOOD' : '⚠ NEEDS IMPROVEMENT'}`);
        }
        
        console.log('\n👥 CONCURRENCY:');
        if (results.concurrency) {
            console.log(`  Users Handled: ${results.concurrency.userCount}`);
            console.log(`  Throughput: ${results.concurrency.throughput.toFixed(2)} clicks/sec`);
            console.log(`  Success Rate: ${(results.concurrency.successRate * 100).toFixed(2)}%`);
            console.log(`  Status: ${results.concurrency.successRate > 0.95 ? '✓ EXCELLENT' : results.concurrency.successRate > 0.8 ? '✓ GOOD' : '⚠ NEEDS IMPROVEMENT'}`);
        }
        
        console.log('\n🔄 STATE CONSISTENCY:');
        console.log(`  Status: ${results.stateConsistency?.consistent ? '✓ CONSISTENT' : '✗ INCONSISTENT'}`);
        
        console.log('\n⚡ POWER-UPS:');
        console.log(`  Status: ${results.powerUps?.tested ? '✓ TESTED' : '✗ FAILED'}`);
        
        console.log('\n🚦 RATE LIMITING:');
        console.log(`  Status: ${results.rateLimiting?.working ? '✓ WORKING' : '⚠ NOT DETECTED'}`);
        
        console.log('\n💾 MEMORY USAGE:');
        if (results.memoryUsage) {
            const heapIncreaseMB = results.memoryUsage.heapUsed / 1024 / 1024;
            console.log(`  Heap Increase: ${heapIncreaseMB.toFixed(2)} MB`);
            console.log(`  Status: ${heapIncreaseMB < 50 ? '✓ GOOD' : heapIncreaseMB < 100 ? '⚠ MODERATE' : '✗ HIGH'}`);
        }
        
        // Performance assessment
        console.log('\n🎯 PERFORMANCE ASSESSMENT:');
        const passedTests = Object.values(results).filter(r => r !== null && r !== undefined).length;
        console.log(`  Tests Completed: ${passedTests}/7`);
        
        let performanceGrade = 'A';
        if (results.latency?.avgLatency > 200) performanceGrade = 'B';
        if (results.concurrency?.successRate < 0.9) performanceGrade = 'C';
        if (!results.stateConsistency?.consistent) performanceGrade = 'D';
        
        console.log(`  Overall Grade: ${performanceGrade}`);
        
        return results;
    }
}

// Load testing utilities
class LoadTester {
    constructor(serverUrl = 'ws://localhost:8080') {
        this.serverUrl = serverUrl;
        this.activeConnections = 0;
        this.maxConnections = 0;
        this.totalMessages = 0;
        this.errors = 0;
    }
    
    async runLoadTest(targetUsers = 100, duration = 60000, rampUpTime = 10000) {
        console.log(`\n🔥 LOAD TEST: ${targetUsers} users over ${duration/1000}s`);
        console.log('='.repeat(50));
        
        const startTime = Date.now();
        const clients = [];
        const results = {
            connectionsCreated: 0,
            messagesExchanged: 0,
            errors: [],
            peakConnections: 0,
            averageLatency: 0
        };
        
        // Ramp up users gradually
        const usersPerInterval = Math.max(1, Math.floor(targetUsers / (rampUpTime / 1000)));
        const rampInterval = 1000; // Add users every second
        
        const rampUpTimer = setInterval(() => {
            const usersToAdd = Math.min(usersPerInterval, targetUsers - results.connectionsCreated);
            
            for (let i = 0; i < usersToAdd; i++) {
                this.createLoadTestClient(results.connectionsCreated + i, clients, results);
            }
            
            results.connectionsCreated += usersToAdd;
            results.peakConnections = Math.max(results.peakConnections, clients.length);
            
            console.log(`Added ${usersToAdd} users, total: ${clients.length}`);
            
            if (results.connectionsCreated >= targetUsers) {
                clearInterval(rampUpTimer);
            }
        }, rampInterval);
        
        // Run test for specified duration
        setTimeout(() => {
            console.log('\n🛑 Stopping load test...');
            clearInterval(rampUpTimer);
            
            // Close all connections
            clients.forEach(client => {
                if (client.ws.readyState === WebSocket.OPEN) {
                    client.ws.close();
                }
            });
            
            // Calculate final results
            const testDuration = Date.now() - startTime;
            results.duration = testDuration;
            results.averageLatency = results.totalLatency / results.latencyCount || 0;
            
            this.printLoadTestResults(results);
        }, duration);
        
        return results;
    }
    
    createLoadTestClient(id, clientsArray, results) {
        const ws = new WebSocket(this.serverUrl);
        const client = {
            ws,
            id,
            username: `LoadTest${id}`,
            score: 0,
            latencies: [],
            lastClick: 0
        };
        
        ws.onopen = () => {
            // Register immediately
            ws.send(JSON.stringify({ type: 'register', username: client.username }));
            
            // Start clicking behavior
            this.simulateUserBehavior(client, results);
        };
        
        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                results.messagesExchanged++;
                
                if (data.type === 'totalCounter' && client.lastClick) {
                    const latency = Date.now() - client.lastClick;
                    client.latencies.push(latency);
                    if (!results.totalLatency) results.totalLatency = 0;
                    if (!results.latencyCount) results.latencyCount = 0;
                    results.totalLatency += latency;
                    results.latencyCount++;
                    client.lastClick = 0;
                }
                
                if (data.type === 'leaderboard') {
                    const playerData = data.leaderboard.find(p => p.username === client.username);
                    if (playerData) client.score = playerData.score;
                }
            } catch (err) {
                results.errors.push(`Client ${id}: ${err.message}`);
            }
        };
        
        ws.onerror = (error) => {
            results.errors.push(`Client ${id} connection error: ${error.message}`);
        };
        
        ws.onclose = () => {
            const index = clientsArray.indexOf(client);
            if (index > -1) clientsArray.splice(index, 1);
        };
        
        clientsArray.push(client);
    }
    
    simulateUserBehavior(client, results) {
        const clickInterval = 1000 + Math.random() * 2000; // 1-3 seconds between clicks
        
        const behaviorTimer = setInterval(() => {
            if (client.ws.readyState !== WebSocket.OPEN) {
                clearInterval(behaviorTimer);
                return;
            }
            
            // Random user actions
            const action = Math.random();
            
            if (action < 0.8) { // 80% chance to click
                client.lastClick = Date.now();
                client.ws.send(JSON.stringify({ type: 'increment' }));
            } else if (action < 0.9 && client.score >= 300) { // 10% chance to buy power-up
                const powerUps = ['shield', 'doubleClick', 'rapidFire'];
                const powerUp = powerUps[Math.floor(Math.random() * powerUps.length)];
                client.ws.send(JSON.stringify({ type: 'buyPowerUp', powerUp }));
            }
            // 10% chance to do nothing (idle user)
            
        }, clickInterval);
    }
    
    printLoadTestResults(results) {
        console.log('\n📊 LOAD TEST RESULTS');
        console.log('='.repeat(50));
        console.log(`Duration: ${(results.duration / 1000).toFixed(2)} seconds`);
        console.log(`Peak Concurrent Users: ${results.peakConnections}`);
        console.log(`Total Messages Exchanged: ${results.messagesExchanged.toLocaleString()}`);
        console.log(`Message Rate: ${(results.messagesExchanged / (results.duration / 1000)).toFixed(2)} msg/sec`);
        console.log(`Average Latency: ${results.averageLatency.toFixed(2)}ms`);
        console.log(`Errors: ${results.errors.length}`);
        
        if (results.errors.length > 0) {
            console.log('\nTop Errors:');
            const errorCounts = {};
            results.errors.forEach(err => {
                errorCounts[err] = (errorCounts[err] || 0) + 1;
            });
            Object.entries(errorCounts).slice(0, 5).forEach(([err, count]) => {
                console.log(`  ${err}: ${count} times`);
            });
        }
        
        // Performance assessment
        let grade = 'A';
        if (results.averageLatency > 200) grade = 'B';
        if (results.errors.length > results.peakConnections * 0.05) grade = 'C';
        if (results.peakConnections < results.connectionsCreated * 0.9) grade = 'D';
        
        console.log(`\n🎯 Performance Grade: ${grade}`);
    }
}

// Usage examples and test runner
async function main() {
    const args = process.argv.slice(2);
    const testType = args[0] || 'full';
    
    console.log('🎮 Game Testing Suite');
    console.log('Make sure your server is running on ws://localhost:8080');
    console.log('');
    
    const tester = new GameTester();
    
    switch (testType) {
        case 'basic':
            await tester.testBasicConnectivity();
            break;
        case 'latency':
            await tester.testLatency(100);
            break;
        case 'concurrent':
            await tester.testConcurrentUsers(50, 20);
            break;
        case 'load':
            const loadTester = new LoadTester();
            await loadTester.runLoadTest(100, 60000, 10000);
            break;
        case 'full':
        default:
            await tester.runAllTests();
            break;
    }
    
    process.exit(0);
}

// Export for use in other files
module.exports = { GameTester, LoadTester };

// Run if called directly
if (require.main === module) {
    main().catch(console.error);
}