'use strict';

const os = require('node:os');
const path = require('node:path');
const {randomBytes} = require('node:crypto');
const {createInterface} = require('node:readline');
process.env.TRANSFUR_WEB_NETWORK = 'regtest';
const {DEFAULT_PORT, NETWORK, parseAddress, startGateway} = require('./gateway.cjs');
const FullNode = require('hsd/lib/node/fullnode');
const Address = require('hsd/lib/primitives/address');

async function startRegtest({port = DEFAULT_PORT, distDir, onError = console.error} = {}) {
  // No hsd config/profile, no wallet plugin, no persistent database, and no network sync.
  const node = new FullNode({
    network: NETWORK,
    prefix: path.join(os.tmpdir(), 'transfur-web-in-memory'),
    memory: true,
    indexTX: true,
    indexAddress: true,
    listen: false,
    noDNS: true,
    workers: false,
    requireStandard: true
  });
  // FullNode otherwise opens its management HTTP service unconditionally.
  node.http.open = async () => {};
  node.http.close = async () => {};
  node.on('error', onError);
  node.on('abort', onError);

  let gateway;
  try {
    await node.open();
    gateway = await startGateway({node, port, distDir, onError});
  } catch (err) {
    if (node.opened)
      await node.close().catch(onError);
    throw err;
  }

  // Mine non-funding blocks to a random public hash with no corresponding private key.
  const sink = Address.fromHash(randomBytes(20), 0);
  let mining = Promise.resolve();
  let closing;

  function enqueueMine(work) {
    if (closing)
      return Promise.reject(new Error('Regtest is shutting down.'));
    const result = mining.then(work);
    mining = result.catch(() => {});
    return result;
  }

  async function addBlock(address) {
    const block = await node.miner.mineBlock(null, address);
    if (!await node.chain.add(block))
      throw new Error('Failed to add mined regtest block.');
  }

  async function fund(text) {
    const address = parseAddress(text);
    return enqueueMine(async () => {
      await addBlock(address);
      // hsd evaluates maturity at the next prospective block height.
      for (let i = 1; i < node.network.coinbaseMaturity; i++)
        await addBlock(sink);
      return {funded: address.toString(NETWORK), height: node.chain.height};
    });
  }

  function mine() {
    return enqueueMine(async () => {
      await addBlock(sink);
      return {height: node.chain.height};
    });
  }

  function close() {
    if (!closing) {
      closing = (async () => {
        try {
          await gateway.close();
        } finally {
          await mining;
          await node.close();
        }
      })();
    }
    return closing;
  }

  return {origin: gateway.origin, fund, mine, close};
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args.length === 1 && args[0] !== 'serve')) {
    throw new Error('Usage: node web/regtest.cjs [serve] (then use `fund <address>` or `mine` on stdin).');
  }
  const portText = process.env.TRANSFUR_WEB_PORT;
  if (portText !== undefined && (!portText || portText.length > 5 || /\D/.test(portText)))
    throw new Error('TRANSFUR_WEB_PORT must be an integer from 0 to 65535.');
  const port = portText === undefined ? DEFAULT_PORT : Number(portText);
  const service = await startRegtest({port});
  const input = createInterface({input: process.stdin, terminal: false});
  const print = value => process.stdout.write(`${JSON.stringify(value)}\n`);
  const shutdown = () => {
    input.close();
    process.stdin.pause();
    void service.close().catch(err => {
      console.error(err.message);
      process.exitCode = 1;
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  input.on('line', async line => {
    const [command, ...args] = line.trim().split(/\s+/);
    try {
      if (command === 'fund' && args.length === 1) {
        print(await service.fund(args[0]));
      } else if (command === 'mine' && args.length === 0) {
        print(await service.mine());
      } else if (command) {
        throw new Error('Use `fund <regtest-address>` or `mine`.');
      }
    } catch (err) {
      print({error: err.message});
    }
  });

  print({origin: service.origin, network: NETWORK});
  if (process.stdin.isTTY)
    console.error('Regtest stdin commands: fund <regtest-address>, mine. Ctrl+C to stop.');
}

if (require.main === module) {
  main().catch(err => {
    console.error(err.message);
    process.exitCode = 1;
  });
}

module.exports = {startRegtest};
