import { print } from './src/console';
import './src/config';
import fs from 'fs'
import path from 'path'

print('debug', 'Config Loaded');

const ts = __filename.endsWith('.ts');
const files = (folder: string) => [ts ? `src/database/${folder}/**/*.ts` : `build/src/database/${folder}/**/*.js`]

const flush = process.env.DB_FLUSH === 'true'
const storage = process.env.DB_STORAGE;

if (flush && storage) {
   print('info', `Flushing Database`)
   const f = path.resolve(__dirname, storage);
   if (fs.existsSync(f)) fs.unlinkSync(f)
}

export default {
   type: process.env.DB_DIALECT,
   database: storage || process.env.DB_NAME,
   synchronize: flush || process.env.DB_SYNC === 'true',
   logging: process.env.DB_LOGGING === 'true',
   entities: files('models'),
   migrations: files('migration'),
   subscribers: files('subscriber'),
   seeds: files('seeds'),
   factories: files('factories'),
   cli: {
      entitiesDir: 'src/database/models',
      migrationsDir: 'src/database/migration',
      subscribersDir: 'src/database/subscriber'
   }
};