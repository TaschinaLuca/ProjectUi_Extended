import { useState, useEffect, useRef } from 'react';

export function useOfflineSync(userEmail) {
    const [isOnline, setIsOnline] = useState(false);
    const [realtimePayload, setRealtimePayload] = useState(null);
    
    // NEW: Manual override state
    const [isSimulatingOffline, setIsSimulatingOffline] = useState(false);
    
    const wasOffline = useRef(true); 

    useEffect(() => {
        let heartbeatInterval;
        let ws;

        // If the user manually toggled "Offline Mode", kill the connection immediately
        if (isSimulatingOffline) {
            setIsOnline(false);
            wasOffline.current = true;
            if (ws) ws.close();
            return; // Stop the heartbeat and websocket from setting up
        }

        // 1. THE HEARTBEAT
        const checkServerStatus = async () => {
            if (isSimulatingOffline) return; // Don't ping if simulating offline

            try {
                const res = await fetch('http://localhost:3000/system/status', { 
                    method: 'GET',
                    headers: { 'Cache-Control': 'no-cache' } 
                });
                
                if (res.ok) {
                    setIsOnline(true);
                    
                    if (wasOffline.current) {
                        console.log("> SERVER DETECTED: Triggering Sync...");
                        syncOfflineQueue();
                        wasOffline.current = false;
                    }
                } else {
                    setIsOnline(false);
                    wasOffline.current = true;
                }
            } catch (err) {
                setIsOnline(false);
                wasOffline.current = true;
            }
        };

        // 2. WEBSOCKET
        const setupWebSocket = () => {
            if (!userEmail || isSimulatingOffline) return;
            
            ws = new WebSocket('ws://localhost:3000');
            ws.onmessage = (event) => {
                const data = JSON.parse(event.data);
                if (data.type === 'NEW_BATCH') {
                    setRealtimePayload(data); 
                }
            };
        };

        checkServerStatus();
        setupWebSocket();

        heartbeatInterval = setInterval(checkServerStatus, 3000);

        return () => {
            clearInterval(heartbeatInterval);
            if (ws) ws.close();
        };
    }, [userEmail, isSimulatingOffline]); // Re-run effect if simulation state changes

    const queueAction = (endpoint, method, payload) => {
        const queue = JSON.parse(localStorage.getItem('offlineQueue') || '[]');
        queue.push({ endpoint, method, payload, timestamp: Date.now() });
        localStorage.setItem('offlineQueue', JSON.stringify(queue));
    };

    const syncOfflineQueue = async () => {
        const queue = JSON.parse(localStorage.getItem('offlineQueue') || '[]');
        if (queue.length === 0) return;

        console.log(`> SYNCING ${queue.length} OFFLINE ACTIONS TO SERVER...`);
        const failedQueue = [];

        for (const item of queue) {
            try {
                const res = await fetch(item.endpoint, {
                    method: item.method,
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(item.payload)
                });
                
                if (!res.ok) failedQueue.push(item); 
            } catch (err) {
                failedQueue.push(item);
            }
        }
        
        localStorage.setItem('offlineQueue', JSON.stringify(failedQueue));
    };

    // Export the toggle function and the current simulation status
    return { isOnline, queueAction, realtimePayload, isSimulatingOffline, setIsSimulatingOffline };
}