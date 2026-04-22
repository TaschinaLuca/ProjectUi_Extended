const express = require('express');
const cors = require('cors');
const http = require('http'); 
const WebSocket = require('ws'); 

const app = express();
const PORT = 3000;

app.use(cors()); 
app.use(express.json());

// Create the HTTP server and attach Express to it
const server = http.createServer(app);

// Create the WebSocket Server attached to the HTTP server
const wss = new WebSocket.Server({ server });

// Create a global broadcast function so our routes can push data to clients
app.locals.broadcast = (data) => {
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(data));
        }
    });
};

wss.on('connection', (ws) => {
    console.log('> NEW WEBSOCKET CLIENT CONNECTED');
    ws.on('close', () => console.log('> WEBSOCKET CLIENT DISCONNECTED'));
});

// Import and Connect Routers
const userRouter = require('./router');
app.use('/', userRouter);

// The Heartbeat ping endpoint for your React Offline Hook
app.get('/system/status', (req, res) => {
    res.status(200).json({ status: "ONLINE", message: "ProjectUi Backend Core is fully operational." });
});

// Start the server using `server.listen` instead of `app.listen`
server.listen(PORT, () => {
    console.log(`\n> SYSTEM BOOT SEQUENCE INITIATED...`);
    console.log(`> HTTP & WEBSOCKET SERVER LISTENING ON PORT [${PORT}]`);
    console.log(`> READY FOR CONNECTIONS AT: http://localhost:${PORT}\n`);
});