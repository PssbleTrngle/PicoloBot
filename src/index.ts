import "reflect-metadata";
import { Connection, ConnectionOptions, createConnection } from "typeorm";
import config from '../ormconfig';
import Bot from './bot';
import Config from './config';
import { print } from "./console";
import { importCards } from './database/models/Card';

async function setKeyContraints(enabled: boolean, c: Connection) {
    if (config.type === 'sqlite') {
        const mode = enabled ? 'ON' : 'OFF';
        await c.query(`PRAGMA foreign_keys = ${mode};`);
    }
}

createConnection(config as ConnectionOptions).then(async c => {

    if (config.sync) {
        await setKeyContraints(false, c);
        await c.synchronize()
        await setKeyContraints(true, c);
    }

    if (Config.debug) await importCards();

    await Bot.run();

}).catch((e: Error) => {

    print('error', e.message)
    if (e.stack) print('error', e.stack)

    process.exit(-1);

});