const express = require('express');
const cors = require('cors');
const http = require('http'); 
const WebSocket = require('ws'); 
const { ApolloServer } = require('@apollo/server');
const { expressMiddleware } = require('@as-integrations/express4');

const Services = require('./services');
const { typeDefs, resolvers } = require('./schema');

const app = express();
const PORT = 3000;
const appServices = new Services(); // Instantiate your in-memory DB

app.use(cors()); 
app.use(express.json());

// 1. Create HTTP & WebSocket Servers
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const broadcast = (data) => {
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

// We keep this standard endpoint for your Offline Heartbeat check!
app.get('/system/status', (req, res) => {
    res.status(200).json({ status: "ONLINE", message: "ProjectUi Backend Core is fully operational." });
});

// 2. Initialize Apollo Server
const startServer = async () => {
    const apolloServer = new ApolloServer({
        typeDefs,
        resolvers,
    });

    await apolloServer.start();

    // 3. Mount GraphQL at exactly ONE endpoint: /graphql
    // We pass `appServices` and `broadcast` into the context so resolvers can access them
    app.use('/graphql', expressMiddleware(apolloServer, {
        context: async () => ({ appServices, broadcast }), 
    }));

    server.listen(PORT, () => {
        console.log(`\n> SYSTEM BOOT SEQUENCE INITIATED...`);
        console.log(`> GRAPHQL & WEBSOCKET SERVER LISTENING ON PORT [${PORT}]`);
        console.log(`> GRAPHQL PLAYGROUND AT: http://localhost:${PORT}/graphql\n`);
    });
};

startServer();