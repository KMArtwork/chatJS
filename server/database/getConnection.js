import { getUidFromSid } from "../utils/decodesid.js";


/**
 * @description a more lightweight version of getConnection to validate a session
 * @param {*} connection 
 * @param {*} sid 
 * @returns 
 */
export async function validateSession(connection, sid) {
    const uid = getUidFromSid(sid);
    const client = await connection;

    //Validate session
    const db = client.db(uid);
    const sbo = await db.collection('sessions');

    const sessionObj = await sbo.findOne({sid: sid});
    if (!sessionObj) return false;
    return true;
}


export async function getConnection(connection, sid, all = false) {
    try {
        if (!sid) return null;

        const uid = getUidFromSid(sid);
        const client = await connection;

        //Validate session
        const db = client.db(uid);
        const sbo = await db.collection('sessions');

        const sessionObj = await sbo.findOne({sid: sid});
        if (!sessionObj) return {type: 1, code: 0, op: 403};
        
        sbo.updateOne({sid: sid}, {$set: {lastAccessed: new Date()}});

        const dms = await db.collection('dm_keys');
        // const servers = await client.db(uid).collection('servers');
        // const nottoself = await dms.findOne({uid: getUidFromSid(sid)});
        const invites = await db.collection('social').find({type: 0}).toArray();

        const configs = await db.collection('configs').find().toArray();

        var obj;
        if (all) obj = {friends: await dms.find().toArray(), invites: invites};
        else obj = {dms: await dms.find({open: true}).toArray(), invites: invites, configs: configs};

        return obj;
    } catch (err) {
        console.error(err);
        return null;
    }
}