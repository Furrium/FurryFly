import {validateManifest} from './foundation';
const BRAND = require('../constants/branding');

// Coordination examples only. These are validated but deliberately not added
// to builtInAddonRegistry and do not install routes, services, or remote code.
const EXAMPLE_ADDON_MANIFESTS = Object.freeze([
  validateManifest({
    schemaVersion: 1,
    id: 'bob-name-quest',
    name: 'Transfur\'s Name Quest',
    publisher: {
      name: 'Transfur Wallet website maintainers',
      url: `${BRAND.siteUrl}`,
    },
    version: '0.1.0-example',
    description: 'Proposed external game entry with no wallet or name capabilities.',
    entry: {kind: 'external-content', url: `${BRAND.siteUrl}/game/play`},
    capabilities: ['external.openUrl'],
    origins: [`${BRAND.siteUrl}`],
    networks: ['main'],
  }),
  validateManifest({
    schemaVersion: 1,
    id: 'bob-system-dns',
    name: 'Transfur System DNS',
    publisher: {name: 'Transfur Wallet maintainers'},
    version: '0.1.0-example',
    description: 'Proposed native resolver status and host-mediated system DNS controls.',
    entry: {kind: 'native-service', service: 'system-dns'},
    capabilities: [
      'resolver.readStatus',
      'resolver.requestSystemDnsControl',
    ],
    origins: [],
    networks: ['main'],
  }),
]);

export {EXAMPLE_ADDON_MANIFESTS};
