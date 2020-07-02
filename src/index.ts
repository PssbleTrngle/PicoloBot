import "reflect-metadata";
import { createConnection, ConnectionOptions } from "typeorm";
import config from '../ormconfig';
import Bot from './bot';
import Config from './config';
import { importCards } from './database/models/Card';
import Input from "./database/models/Input";
import { print } from "./console";

createConnection(config as ConnectionOptions).then(async () => {

    if(Config.debug) await importCards();

    await Bot.run();

}).catch((e: Error) => {

    print('error', e.message)
    if(e.stack) print('error', e.stack)

    process.exit(-1);

});