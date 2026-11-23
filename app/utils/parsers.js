import { MTX } from 'hsd/lib/primitives/mtx';

/**
 * Parse Transaction File
 * @param {string} data json string read from file
 * @returns {object} obj
 * @returns {MTX} obj.mtx MTX instance
 * @returns {string} obj.txHex tx hex string
 * @returns {object} obj.metadata metadata
 */
export function parseTxFile(data) {
  const json = JSON.parse(data);

  if (json.version !== 1) {
    const error = new Error('Incompatible version.');
    error.messageKey = 'txFileIncompatibleVersion';
    throw error;
  }

  if (!json.tx || typeof json.tx !== 'string') {
    const error = new Error('No transaction found in file.');
    error.messageKey = 'txFileNoTransaction';
    throw error;
  }

  const mtx = MTX.decode(Buffer.from(json.tx, 'hex'));
  // const tx = MTX.fromJSON(json.tx);

  if (json.metadata && typeof json.metadata !== 'object') {
    const error = new Error('Invalid metadata.');
    error.messageKey = 'txFileInvalidMetadata';
    throw error;
  }

  return {
    mtx,
    txHex: json.tx,
    metadata: json.metadata,
  };
}
