const qrcode = require('qrcode-generator');
const quiet = 4;

// The QR payload is the plain receive address, not a payment request or web URL.
function makeReceiveQR(address) {
  if (typeof address !== 'string' || !/^(?:rs1|hs1)[023456789acdefghjklmnpqrstuvwxyz]{39}$/.test(address)) {
    throw new TypeError('Expected a wallet-derived regtest receive address.');
  }
  const qr = qrcode(0, 'M');
  qr.addData(address, 'Byte');
  qr.make();
  const size = qr.getModuleCount();
  const commands = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (qr.isDark(y, x)) commands.push(`M${x + quiet} ${y + quiet}h1v1h-1z`);
    }
  }
  return {size: size + 2 * quiet, path: commands.join('')};
}

function drawReceiveQR(svg, address) {
  const {size, path} = makeReceiveQR(address);
  svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
  const ns = 'http://www.w3.org/2000/svg';
  const background = svg.ownerDocument.createElementNS(ns, 'rect');
  background.setAttribute('width', size);
  background.setAttribute('height', size);
  background.setAttribute('fill', '#fff');
  const modules = svg.ownerDocument.createElementNS(ns, 'path');
  modules.setAttribute('d', path);
  modules.setAttribute('fill', '#000');
  svg.replaceChildren(background, modules);
}

module.exports = {drawReceiveQR, makeReceiveQR};
