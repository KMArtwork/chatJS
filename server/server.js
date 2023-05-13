import { WebSocketServer } from 'ws';
import { MongoClient, ServerApiVersion, GridFSBucket, MongoGridFSChunkError } from 'mongodb';
import config from '../config.json' assert { type: 'json' };
import { resumeSesion, createSession } from './initializations.js';
import { getMessages } from './getMessgaes.js';
import { getUidFromSid } from './utils/decodesid.js';
import { handleMessage, newMessage } from './database/newMessage.js';
import { logout } from './database/logout.js';
import { handleSocials } from './socials.js';
import { wasabiManager } from './database/media/init.js';

import express from 'express';
import cors from 'cors';
import { validateSession } from './database/getConnection.js';
import { getPFP, uploadPFP } from './database/media/upload.js';
import bodyParser from 'body-parser';


//Stores clients by userId
const webSocketClients = new Map();


const client = new MongoClient(config.mongouri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });
client.on('error', (err) => { console.log(err); throw "N O" });
const mongoconnection = client.connect();

const port = 8080;
const wss = new WebSocketServer({ port: port });
const CDNManager = new wasabiManager(config.accessKeyID, config.accesskeySecret, mongoconnection);

//Recieve 
const app = express();
app.use(cors());
app.use(bodyParser.raw({type: 'application/octet-stream', limit: '10mb'}));


app.post('/updatepfp', async(request, response) => {
    const { headers } = request;
    const { sessionid, code, op, filename } = headers;

    if (!sessionid || !code || !op || !filename) return response.send({code: 400, message: 'missing parameters'});
    if (!validateSession(mongoconnection, sessionid)) return response.send({code: 404, message: 'session not found'});

    const imgBufRaw = request.body;
    const imgBuf = Buffer.from(imgBufRaw);

    const res = await uploadPFP(mongoconnection, CDNManager, sessionid, filename, imgBuf);
    
    if (res == true) response.sendStatus(201);
    else if (res == false) response.sendStatus(500);
    else response.send(res);
});


app.get('/getpfp', async (req, res) => {
    const{ headers } = req;
    const { sessionid } = headers;
    const isValidSession = await validateSession(mongoconnection, sessionid);
    if (!isValidSession) return res.send({type: 1, code: 404, message: "session id not found"});

    const pfpData = await getPFP(mongoconnection, CDNManager, sessionid);
    if (!pfpData) return res.send(null);

    const buffer = Buffer.concat([pfpData]);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.send(buffer);
});

app.listen(port + 1, () => console.log(`App listening on port ${port + 1}`));



wss.on('connection', async function connection(ws) {
    ws.on('error', console.error);

    ws.on('message', async (dataRaw) => {
        try {
            const data = JSON.parse(dataRaw);
            const code = data['code'];

            switch (code) {
                case 0:
                    const toSend = await createSession(ws, mongoconnection, data);
                    if (toSend.sid) webSocketClients.set(toSend.sid, ws);
                    ws.send(JSON.stringify(toSend));
                break;

                case 1:
                    const response = await resumeSesion(ws, mongoconnection, data, getUidFromSid(data.sid));
                    if (response) webSocketClients.set(data.sid, ws);
                break;

                case 2:
                    if (!data.data.sid) return ws.send(JSON.stringify({type: 1, code: 400}));
                    logout(webSocketClients, ws, mongoconnection, data.data.sid);
                break;
                
                case 3:
                    const messages = await getMessages(mongoconnection, data.sid, data.uid);
                    ws.send(JSON.stringify({code: 3, data: messages}));
                break;

                case 4:
                    handleSocials(ws, mongoconnection, data, webSocketClients);
                    webSocketClients.set(data.sid, ws);
                break;

                case 5:
                    handleMessage(mongoconnection, webSocketClients, data.data, data.op);
                    // ws.send(JSON.stringify({code: 5, data: {message: {author: 'OTHER', content: 'reply!', timestamp: new Date().toISOString()}}}));
                break;

                default: ws.send(403);

            }
        } catch (err) {
            console.log(err);
            ws.send(400);
        }
    });
});

