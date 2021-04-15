import { ChainData } from './src/chainData';
import { DatabaseHandler } from './src/db/database';
import { Scheduler } from './src/scheduler';
const keys = require('./config/keys');

(async() => {
  try {
    const chainData = new ChainData('wss://kusama-rpc.polkadot.io');
    await chainData.connect();
    const db = new DatabaseHandler();
    await db.connect(keys.MONGO_ACCOUNT, keys.MONGO_PASSWORD, keys.MONGO_URL, keys.MONGO_PORT, keys.MONGO_DBNAME);
    const scheduler = new Scheduler(chainData, db);
    scheduler.start();
  } catch(err) {
    console.error(err);
  }
})();