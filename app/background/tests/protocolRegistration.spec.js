import test from 'tape';

const {decideCompatAction, normalizeProgram} = require('../protocolRegistration');

const OUR_EXE = 'C:\\Program Files\\Transfur\\Transfur.exe';
const THEIR_EXE =
  'C:\\Users\\ZMX\\AppData\\Local\\Programs\\bob-wallet\\Bob LearnHNS.exe';

test('an unowned compatibility scheme is adopted', (t) => {
  t.equal(decideCompatAction(null, OUR_EXE), 'adopt', 'key absent');
  t.equal(decideCompatAction(undefined, OUR_EXE), 'adopt', 'owner undefined');
  t.equal(decideCompatAction('', OUR_EXE), 'adopt', 'key present without a command');
  t.end();
});

test('a scheme we already own is refreshed', (t) => {
  t.equal(decideCompatAction(OUR_EXE, OUR_EXE), 'refresh', 'same path');
  t.equal(
    decideCompatAction(OUR_EXE.toLowerCase(), OUR_EXE),
    'refresh',
    'path differs only in case',
  );
  t.equal(
    decideCompatAction(`"${OUR_EXE}" "%1"`, OUR_EXE),
    'refresh',
    'quoted command line',
  );
  t.end();
});

test('a scheme owned by another wallet is left alone', (t) => {
  t.equal(
    decideCompatAction(THEIR_EXE, OUR_EXE),
    'leave',
    'an installed Bob LearnHNS keeps bob-learnhns',
  );
  t.equal(
    decideCompatAction(`"${THEIR_EXE}" "%1"`, OUR_EXE),
    'leave',
    'quoted command line',
  );
  t.end();
});

test('program paths compare on normalized separators', (t) => {
  t.equal(
    normalizeProgram('C:/Apps/Transfur/Transfur.EXE'),
    normalizeProgram('C:\\Apps\\Transfur\\Transfur.exe'),
  );
  t.end();
});
