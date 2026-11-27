const LANGUAGES = Object.freeze(['en', 'zh-CN']);
const STORAGE_KEY = 'transfur-wallet-language';

// One entry per key, with English and Simplified Chinese together to keep them in sync.
const copy = {
  'app.title': ['TRANSFUR — Browser Wallet', 'TRANSFUR — 浏览器钱包'],
  'app.brand': ['TRANSFUR', 'TRANSFUR'],
  'app.edition': ['/ WEB', '/ 网页版'],
  'app.network': ['NETWORK', '网络'],
  'network.regtest': ['REGTEST', '回归测试网'],
  'network.main': ['MAINNET', '主网'],
  'app.eyebrow': ['HANDSHAKE · SELF-CUSTODY', 'HANDSHAKE · 自托管'],
  'app.heading': ['Browser wallet', '浏览器钱包'],
  'app.headingEnd': ['.', '。'],
  'app.intro': ['Receive and send Handshake. Your recovery phrase and signing keys stay in this browser.', '接收和发送 Handshake 币。助记词和签名私钥仅保存在此浏览器中。'],
  'app.testFunds': ['Test funds only.', '仅限测试币。'],
  'app.mainnetWarning': ['Do not enter a mainnet wallet’s recovery phrase.', '请勿输入主网钱包的助记词。'],
  'app.mainnetFunds': ['Real mainnet funds.', '真实主网资金。'],
  'app.mainnetCaution': ['Back up the phrase and start with a small amount.', '请备份助记词，并先用小额测试。'],
  'app.footer': ['TRANSFUR · BROWSER WALLET · NO DESKTOP APP REQUIRED', 'TRANSFUR · 浏览器钱包 · 无需安装桌面应用'],
  'language.label': ['Wallet language', '钱包界面语言'],
  'language.english': ['English', 'English'],
  'language.chinese': ['简体中文', '简体中文'],
  'language.englishTitle': ['Show the wallet in English', '将钱包界面切换为英语'],
  'language.chineseTitle': ['Show the wallet in Simplified Chinese', '将钱包界面切换为简体中文'],
  'setup.eyebrow': ['01 / GET STARTED', '01 / 开始使用'],
  'setup.title': ['Set up a wallet', '设置钱包'],
  'setup.mode': ['Wallet setup mode', '钱包设置方式'],
  'setup.create': ['Create wallet', '创建钱包'],
  'setup.restore': ['Restore wallet', '恢复钱包'],
  'setup.recoveryPhrase': ['12-word regtest recovery phrase', '测试网钱包的 12 个英文助记词'],
  'setup.confirmPassword': ['Confirm password', '确认密码'],
  'setup.passwordHint': ['Use at least 8 characters. This password encrypts the wallet on this device; it is not your recovery phrase.', '密码至少需要 8 个字符。它用于在此设备上加密钱包，不是你的助记词。'],
  'setup.createSubmit': ['Create encrypted wallet', '创建加密钱包'],
  'setup.restoreSubmit': ['Restore encrypted wallet', '恢复加密钱包'],
  'backup.eyebrow': ['02 / BACKUP', '02 / 备份'],
  'backup.title': ['Save your recovery phrase', '保存你的助记词'],
  'backup.hint': ['Write the words down in order. Anyone who has them can spend this wallet’s funds. This view closes after you confirm.', '请按顺序抄下这些单词。任何获得助记词的人都能花费此钱包中的资金。确认后，此页面将关闭。'],
  'backup.saved': ['I saved the words in order.', '我已按顺序保存助记词。'],
  'backup.continue': ['Continue to wallet', '进入钱包'],
  'vault.lock': ['Lock wallet', '锁定钱包'],
  'vault.locked': ['Wallet locked.', '钱包已锁定。'],
  'vault.inactive': ['Wallet locked after inactivity.', '由于长时间无操作，钱包已锁定。'],
  'vault.eyebrow': ['LOCAL VAULT / LOCKED', '本地钱包 / 已锁定'],
  'vault.unlockTitle': ['Unlock wallet', '解锁钱包'],
  'vault.password': ['Wallet password', '钱包密码'],
  'vault.unlockSubmit': ['Unlock', '解锁'],
  'wallet.label': ['Wallet', '钱包'],
  'balance.eyebrow': ['01 / BALANCE', '01 / 余额'],
  'balance.title': ['Available to spend', '可用余额'],
  'balance.pending': ['Pending:', '待确认：'],
  'balance.immature': ['Immature:', '未成熟：'],
  'balance.refresh': ['Refresh balance', '刷新余额'],
  'balance.recoveryScope': ['Recovery checks only the first account: 20 receive and 20 change addresses. Funds outside this range are not displayed.', '恢复仅检查第一个账户的前 20 个收款地址和前 20 个找零地址，超出范围的资金不会显示。'],
  'balance.unchecked': ['Node not checked', '尚未检查节点'],
  'balance.unavailable': ['Node not available', '节点不可用'],
  'balance.block': ['Regtest · block {height}', '回归测试网 · 区块高度 {height}'],
  'balance.blockMain': ['Mainnet · block {height}', '主网 · 区块高度 {height}'],
  'units.hns': ['HNS', 'HNS'],
  'units.hnsAmount': ['{amount} HNS', '{amount} HNS'],
  'receive.eyebrow': ['02 / RECEIVE', '02 / 收款'],
  'receive.title': ['Your receive address', '你的收款地址'],
  'receive.hint': ['Use only on the network shown above.', '仅可在上方显示的网络中使用。'],
  'receive.address': ['Receive address', '收款地址'],
  'receive.copy': ['Copy address', '复制地址'],
  'receive.copied': ['Receive address copied.', '收款地址已复制。'],
  'send.eyebrow': ['03 / SEND', '03 / 转账'],
  'send.title': ['Send HNS', '发送 HNS'],
  'send.recipientLabel': ['Recipient address', '收款方地址'],
  'send.recipientPlaceholder': ['rs1…', 'rs1…'],
  'send.amountLabel': ['Amount (HNS)', '金额（HNS）'],
  'send.amountPlaceholder': ['0.000000', '0.000000'],
  'send.prepare': ['Review transfer', '查看转账详情'],
  'review.title': ['Confirm this transfer', '确认转账'],
  'review.recipient': ['Recipient', '收款方'],
  'review.amount': ['Amount', '金额'],
  'review.fee': ['Network fee', '网络手续费'],
  'review.total': ['Total', '合计'],
  'review.cancel': ['Cancel', '取消'],
  'review.broadcast': ['Broadcast transfer', '广播交易'],
  'receipt.label': ['Last broadcast', '最近广播的交易'],
  'receipt.txid': ['Transaction ID', '交易 ID'],
  'receipt.sending': ['Sending to the node…', '正在向节点提交…'],
  'receipt.sendingHint': ['Keep this transaction ID until the node responds.', '请保留此交易 ID，等待节点响应。'],
  'receipt.unverified': ['Submission not verified', '未能核实提交结果'],
  'receipt.unverifiedHint': ['Check this transaction ID with the node operator before making another payment.', '再次支付前，请向节点运营方核对该交易 ID。'],
  'receipt.submitted': ['Submitted to the node', '已提交到节点'],
  'receipt.submittedHint': ['Confirmations are not guaranteed until mined.', '交易需被打包进区块后才能获得确认。'],
  'validation.required': ['Fill in the required field.', '请填写此必填项。'],
  'validation.tooShort': ['Enter at least {min} characters.', '请至少输入 {min} 个字符。'],
  'validation.tooLong': ['Enter no more than {max} characters.', '请输入不超过 {max} 个字符。'],
  'validation.invalid': ['Check the value in this field.', '请检查此字段的输入内容。'],
  'error.operationFailed': ['The operation failed.', '操作失败。'],
  'error.openStorage': ['Could not open browser wallet storage.', '无法打开浏览器的钱包存储。'],
  'error.storageUnavailable': ['Wallet storage is unavailable or another wallet already exists.', '钱包存储不可用，或者已有钱包存在。'],
  'error.walletLocked': ['The wallet was locked.', '钱包已锁定。'],
  'error.signerStart': ['The local signer failed to start.', '无法启动本地签名器。'],
  'error.serviceUnreachable': ['The wallet service is unreachable.', '无法连接钱包服务。'],
  'error.nodeRejected': ['The node did not accept the submission. Refresh before retrying.', '节点未接受提交。请刷新后再试。'],
  'error.nodeRead': ['Could not read the node.', '无法读取节点数据。'],
  'error.nodeNetwork': ['The node is on the wrong network or its tip changed. Refresh and try again.', '节点连接到了错误的网络，或者最新区块已变更。请刷新后再试。'],
  'error.passwordMismatch': ['The passwords do not match.', '两次输入的密码不一致。'],
  'error.copyUnavailable': ['Copy is unavailable. You can select the address above.', '无法自动复制。你可以手动选中上方的地址。'],
  'error.txidMismatch': ['Unexpected transaction ID.', '收到的交易 ID 与预期不符。'],
  'error.broadcastUnverified': ['No confirmation from the node. Do not retry blindly.', '未收到节点的确认。请勿盲目重试。'],
  'error.unsupportedBrowser': ['Use a modern browser on HTTPS or localhost.', '请使用支持此功能的现代浏览器，通过 HTTPS 或 localhost 访问。'],
  'error.signerBusy': ['The signer is busy.', '签名器正忙。'],
  'error.unlockBeforeTransfer': ['Unlock the wallet before preparing a transfer.', '请先解锁钱包，再准备转账。'],
  'error.reviewExpired': ['The transfer review expired; prepare it again.', '转账确认已过期，请重新发起转账。'],
  'error.invalidOperation': ['Invalid wallet operation.', '无效的钱包操作。'],
  'error.signerOperation': ['The local signer could not complete this operation.', '本地签名器无法完成此操作。'],
  'error.nameCovenants': ['The browser worker does not support name covenants.', '浏览器签名器不支持域名契约。'],
  'error.passwordLength': ['Use a password between 8 and 128 characters.', '请使用 8 到 128 个字符的密码。'],
  'error.invalidVault': ['This browser wallet backup is invalid or unsupported.', '此浏览器钱包备份无效或不受支持。'],
  'error.unlockFailed': ['Could not unlock. Check your password.', '无法解锁。请检查密码。'],
  'error.invalidOutputs': ['The node returned invalid or too many wallet outputs.', '节点返回的钱包交易输出无效或数量过多。'],
  'error.foreignOutput': ['The node returned an output that does not match this wallet.', '节点返回了一笔不属于此钱包的交易输出。'],
  'error.duplicateOutput': ['The node returned a duplicate output.', '节点返回了重复的交易输出。'],
  'error.amountPrecision': ['Enter an amount with up to six decimal places.', '请输入最多保留六位小数的金额。'],
  'error.positiveAmount': ['Enter a positive HNS amount.', '请输入大于零的 HNS 金额。'],
  'error.invalidAmount': ['Invalid HNS amount.', '无效的 HNS 金额。'],
  'error.coinbaseMaturity': ['Unexpected regtest coinbase maturity.', '回归测试网的挖矿奖励成熟期与预期不符。'],
  'error.phraseFormat': ['Enter a 12-word English recovery phrase.', '请输入由 12 个英文单词组成的助记词。'],
  'error.phraseChecksum': ['Invalid recovery phrase or checksum.', '助记词无效或校验失败。'],
  'error.phraseUnsupported': ['This wallet supports 12-word English recovery phrases only.', '此钱包仅支持由 12 个英文单词组成的助记词。'],
  'error.addressFormat': ['Enter a valid regtest address.', '请输入有效的回归测试网地址。'],
  'error.addressNetwork': ['Enter a valid regtest address (rs1…).', '请输入有效的回归测试网地址（以 rs1 开头）。'],
  'error.addressUnsupported': ['Unsupported recipient address.', '不支持此收款地址。'],
  'error.amountDust': ['This amount is too small for a standard transaction.', '此金额低于标准交易的最低限额。'],
  'error.noSpendableFunds': ['No confirmed, mature funds to spend.', '没有已确认且已成熟的资金可用。'],
  'error.insufficientFunds': ['Not enough confirmed, mature HNS for the amount and fee.', '已确认且已成熟的 HNS 不足以支付转账金额和手续费。'],
  'error.feeLimit': ['The fee exceeds the local limit.', '手续费超出钱包设置的上限。'],
  'error.signingFailed': ['Could not sign a standard transaction with the reviewed fee.', '无法按所确认的手续费签署标准交易。'],
  'error.signatureInvalid': ['Local signature verification failed.', '本地签名验证失败。'],
  'error.activityInvalid': ['The node returned invalid wallet activity.', '节点返回的钱包交易记录无效。'],
  'error.activityUnavailable': ['Could not load wallet activity.', '无法加载钱包交易记录。'],
  'activity.eyebrow': ['04 / ACTIVITY', '04 / 交易记录'],
  'activity.title': ['Recent activity', '最近交易'],
  'activity.empty': ['No payments yet. Fund this wallet to get started.', '暂无交易。给此钱包充值后即可开始。'],
  'activity.truncated': ['Showing the most recent capped results; older activity may be missing.', '仅显示有上限的最近记录，更早的记录可能未显示。'],
  'activity.received': ['Received', '收款'],
  'activity.sent': ['Sent', '转账'],
  'activity.self': ['Self-transfer', '内部转账'],
  'activity.reward': ['Mining reward', '挖矿奖励'],
  'activity.unknown': ['Payment', '支付'],
  'activity.pending': ['Pending', '待确认'],
  'activity.confirmed': ['{count} confirmations', '{count} 次确认'],
  'activity.confirmedOne': ['1 confirmation', '1 次确认'],
  'activity.immature': ['Immature', '未成熟'],
  'activity.block': ['Block {height}', '区块 {height}'],
  'activity.pendingBlock': ['In mempool', '在内存池中'],
  'activity.txid': ['Transaction ID', '交易 ID'],
  'receive.chooseAddress': ['Receive address', '收款地址'],
  'receive.addressOption': ['Address {index} of {total}', '地址 {index}/{total}'],
  'receive.qrLabel': ['QR code for receive address', '收款地址二维码'],
  'receive.qrHint': ['Scan this on a device signed in to the same regtest wallet.', '在登录同一回归测试钱包的设备上扫描。'],
};

// The existing worker sends English strings, so match only exact, authored errors.
// Unknown library/server errors are not displayed; they can contain sensitive data.
const legacyErrors = new Map(Object.entries(copy)
  .filter(([key]) => key.startsWith('error.'))
  .map(([key, [english]]) => [english, key]));
const attributes = ['title', 'placeholder', 'aria-label', 'aria-description', 'alt'];
const selector = ['data-i18n', 'data-i18n-leading', ...attributes.map(attr => `data-i18n-${attr}`)]
  .map(attr => `[${attr}]`).join(',');
let language;

function resolveLanguage(preferences) {
  for (const preference of preferences || []) {
    const tag = String(preference).toLowerCase();
    if (tag === 'en' || tag.startsWith('en-')) return 'en';
    if (tag === 'zh' || tag.startsWith('zh-')) return 'zh-CN';
  }
  return 'en';
}

function getLanguage() {
  if (language) return language;
  try {
    const saved = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (LANGUAGES.includes(saved)) return (language = saved);
  } catch { /* Storage may be unavailable; use the browser preference. */ }
  const navigator = globalThis.navigator;
  return (language = resolveLanguage(navigator?.languages?.length ? navigator.languages : [navigator?.language]));
}

function setLanguage(next) {
  if (!LANGUAGES.includes(next)) return false;
  language = next;
  try { globalThis.localStorage?.setItem(STORAGE_KEY, next); }
  catch { /* The picker still works for this page without storage. */ }
  return true;
}

function t(key, params = {}) {
  if (!Object.hasOwn(copy, key)) return '';
  const text = copy[key][LANGUAGES.indexOf(getLanguage())];
  return text.replace(/\{(\w+)\}/g, (token, name) => (
    params && Object.hasOwn(params, name) ? String(params[name]) : token
  ));
}

function i18nError(code, params) {
  return Object.assign(new Error(code), {code, params});
}

function translateError(error) {
  const code = error?.code;
  const key = typeof code === 'string' && code.startsWith('error.') && Object.hasOwn(copy, code)
    ? code : legacyErrors.get(typeof error === 'string' ? error : error?.message);
  return t(key || 'error.operationFailed', error?.params);
}

function translateNode(node) {
  const text = node.getAttribute('data-i18n');
  if (text) node.textContent = t(text);
  // Use a leading text node for mixed markup (e.g. the accent in the heading).
  const prefix = node.getAttribute('data-i18n-leading');
  if (prefix) {
    const value = t(prefix);
    if (node.firstChild?.nodeType === 3) node.firstChild.nodeValue = value;
    else node.prepend(node.ownerDocument.createTextNode(value));
  }
  for (const attr of attributes) {
    const key = node.getAttribute(`data-i18n-${attr}`);
    if (key) node.setAttribute(attr, t(key));
  }
}

function applyTranslations(root = document) {
  if (root.documentElement) root.documentElement.lang = getLanguage();
  if (root.matches?.(selector)) translateNode(root);
  for (const node of root.querySelectorAll(selector)) translateNode(node);
}

module.exports = {LANGUAGES, STORAGE_KEY, resolveLanguage, getLanguage, setLanguage, t, i18nError, translateError, applyTranslations};
