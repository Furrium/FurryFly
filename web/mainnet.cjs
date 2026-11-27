'use strict';

// Local mainnet preview. This process only serves the browser wallet API from a
// fully indexed mainnet node; it never opens the node's management HTTP service.
process.env.TRANSFUR_WEB_NETWORK = 'main';

const fs = require('node:fs');
const path = require('node:path');
const FullNode = require('hsd/lib/node/fullnode');
const {startGateway} = require('./gateway.cjs');

async function startMainnet({prefix, port = 18445, distDir} = {}) {
  if (!prefix) throw new Error('Set TRANSFUR_MAINNET_PREFIX to the mainnet node directory.');
  fs.mkdirSync(prefix, {recursive: true, mode: 0o700});
  for (const dir of ['blocks/index', 'chain', 'tree']) fs.mkdirSync(path.join(prefix, dir), {recursive: true, mode: 0o700});
  const node = new FullNode({
    network: 'main',
    prefix,
    memory: false,
    indexTX: true,
    indexAddress: true,
    listen: false,
    noDNS: true,
    workers: false,
    checkpoints: true,
  });
  // Keep management RPC inaccessible even on loopback.
  node.http.open = async () => {};
  node.http.close = async () => {};
  node.on('error', error => console.error(error.message));
  node.on('abort', error => console.error(error?.message || String(error)));

  await node.open();
  await node.connect();
  node.startSync();
  const gateway = await startGateway({node, port, distDir: distDir || path.join(__dirname, 'dist')});
  let closing;
  async function close() {
    if (closing) return closing;
    closing = (async () => {
      try {
        await gateway.close();
      } finally {
        await node.close();
      }
    })();
    return closing;
  }
  return {origin: gateway.origin, node, close};
}

async function main() {
  const portText = process.env.TRANSFUR_MAINNET_PORT;
  if (portText !== undefined && (!/^\d{4,5}$/.test(portText) || Number(portText) > 65535)) {
    throw new Error('TRANSFUR_MAINNET_PORT must be an integer from 1000 to 65535.');
  }
  const service = await startMainnet({
    prefix: process.env.TRANSFUR_MAINNET_PREFIX,
    port: portText === undefined ? 18445 : Number(portText),
    distDir: process.env.TRANSFUR_MAINNET_DIST,
  });
  console.log(JSON.stringify({origin: service.origin, network: 'main', height: service.node.chain.height}));
  await new Promise(resolve => {
    const shutdown = () => {
      void service.close().catch(error => {
        console.error(error.message);
        process.exitCode = 1;
      }).finally(resolve);
    };
    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);
  });
}

if (require.main === module) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = {startMainnet};
