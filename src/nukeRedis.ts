import { redis } from 'bun';

const keys = await redis.keys('*');
await Promise.all(keys.map(key => redis.del(key)));

console.log('done!');