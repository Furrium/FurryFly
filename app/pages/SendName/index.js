import fs from 'fs';
import React, { Component } from 'react';
import { connect } from 'react-redux';
import PropTypes from 'prop-types';
import { Address } from 'hsd/lib/primitives';
import * as networks from 'hsd/lib/protocol/networks';
import { consensus } from 'hsd/lib/protocol';
import Alert from '../../components/Alert';
import AddressInput from '../../components/AddressInput';
import Dropdown from '../../components/Dropdown';
import { getMyNames } from '../../ducks/myDomains';
import {
  claimPaidTransfer,
  finalizeTransfer,
  finalizeWithPayment,
  sendTransfer,
} from '../../ducks/names';
import { hasAddress } from '../../ducks/walletActions';
import nodeClient from '../../utils/nodeClient';
import walletClient from '../../utils/walletClient';
import isValidAddress from '../../utils/verifyAddress';
import {
  buildPaidNameTransferPayload,
  inspectPaidNameTransfer,
  parsePaidNameTransferInput,
  stringifyPaidNameTransferPayload,
} from '../../utils/paidNameTransfer';
import BulkTransfer from '../DomainManager/BulkTransfer';
import { I18nContext } from '../../utils/i18n';
import './send-name.scss';

const { dialog } = require('electron');

const SELL_MODE = 'send';
const CLAIM_MODE = 'claim';
const HISTORY_KEY_PREFIX = 'sendName/history';
// Sort order is stable; only its label is localized, and that happens in the renderer
// because t() lives on the component, not at module scope.
const DOMAIN_SORTS = [
  {labelKey: 'sendNameSortNameAsc', value: 'name-asc'},
  {labelKey: 'sendNameSortNameDesc', value: 'name-desc'},
  {labelKey: 'sendNameSortExpirationAsc', value: 'expiration-asc'},
  {labelKey: 'sendNameSortExpirationDesc', value: 'expiration-desc'},
];

class SendName extends Component {
  static contextType = I18nContext;

  static propTypes = {
    mode: PropTypes.string,
    names: PropTypes.object.isRequired,
    height: PropTypes.number.isRequired,
    network: PropTypes.string.isRequired,
    walletId: PropTypes.string.isRequired,
    isFetching: PropTypes.bool.isRequired,
    getMyNames: PropTypes.func.isRequired,
    sendTransfer: PropTypes.func.isRequired,
    finalizeTransfer: PropTypes.func.isRequired,
    finalizeWithPayment: PropTypes.func.isRequired,
    claimPaidTransfer: PropTypes.func.isRequired,
    hasAddress: PropTypes.func.isRequired,
    setMode: PropTypes.func.isRequired,
  };

  state = {
    selectedName: '',
    domainQuery: '',
    domainSort: 'name-asc',
    buyerAddress: '',
    price: '',
    note: '',
    sellerError: '',
    sellerNotice: '',
    isStartingTransfer: false,
    isFinalizingTransfer: false,
    isCreatingPayload: false,
    payloadText: '',
    history: [],
    transferTo: '',
    resolvingTransferTo: false,
    claimText: '',
    claimError: '',
    claimNotice: '',
    claimDetails: null,
    claimIsOwnAddress: false,
    isClaiming: false,
    isShowingBulkTransfer: false,
  };

  componentDidMount() {
    this.props.getMyNames();
    this.setState({history: this.loadHistory()});
  }

  componentDidUpdate(prevProps, prevState) {
    if (
      prevProps.walletId !== this.props.walletId
      || prevProps.network !== this.props.network
    ) {
      this.setState({
        history: this.loadHistory(),
        payloadText: '',
        sellerError: '',
        sellerNotice: '',
        claimError: '',
        claimNotice: '',
      });
    }

    if (
      this.state.selectedName
      && this.state.selectedName !== prevState.selectedName
    ) {
      this.resolveSelectedTransferTo();
    }
  }

  getHistoryKey() {
    return [
      HISTORY_KEY_PREFIX,
      this.props.network || 'unknown-network',
      this.props.walletId || 'unknown-wallet',
    ].join('/');
  }

  loadHistory() {
    try {
      return JSON.parse(window.localStorage.getItem(this.getHistoryKey()) || '[]');
    } catch (e) {
      return [];
    }
  }

  saveHistory(entry) {
    const history = [
      {
        createdAt: new Date().toISOString(),
        walletId: this.props.walletId,
        network: this.props.network,
        ...entry,
      },
      ...this.state.history,
    ].slice(0, 20);

    window.localStorage.setItem(this.getHistoryKey(), JSON.stringify(history));
    this.setState({history});
  }

  getSelectedDomain() {
    return this.props.names[this.state.selectedName] || null;
  }

  getDomainOptions() {
    const query = this.state.domainQuery.trim().toLowerCase();
    let names = Object.keys(this.props.names);

    if (query) {
      names = names.filter(name => name.toLowerCase().includes(query));
    }

    return names.sort((a, b) => {
      const nameCompare = a.localeCompare(b);

      if (this.state.domainSort === 'name-desc') {
        return -nameCompare;
      }

      if (this.state.domainSort === 'expiration-asc' || this.state.domainSort === 'expiration-desc') {
        const expirationCompare = this.getExpirationHeight(a) - this.getExpirationHeight(b);
        if (expirationCompare !== 0) {
          return this.state.domainSort === 'expiration-asc'
            ? expirationCompare
            : -expirationCompare;
        }
      }

      return nameCompare;
    });
  }

  getExpirationHeight(name) {
    const domain = this.props.names[name];
    const network = networks[this.props.network];

    if (!domain || !domain.renewal || !network || !network.names || !network.names.renewalWindow) {
      return Number.MAX_SAFE_INTEGER;
    }

    return domain.renewal + network.names.renewalWindow;
  }

  getRemainingBlocks(domain) {
    if (!domain || !domain.transfer) {
      return null;
    }

    const lockup = networks[this.props.network].names.transferLockup;
    return (domain.transfer + lockup) - this.props.height;
  }

  isTransferMature(domain) {
    const remaining = this.getRemainingBlocks(domain);
    return Number.isFinite(remaining) && remaining <= 0;
  }

  isTransferPending(domain) {
    const remaining = this.getRemainingBlocks(domain);
    return Number.isFinite(remaining) && remaining > 0;
  }

  processPrice(value) {
    if (value === '') {
      this.setState({price: '', sellerError: ''});
      return;
    }

    const price = `${value}`.match(/[0-9]*\.?[0-9]{0,6}/g)[0];
    if (Number.isNaN(parseFloat(price)))
      return;
    if (price * consensus.COIN > consensus.MAX_MONEY)
      return;
    this.setState({price, sellerError: ''});
  }

  getTxHash(result) {
    if (!result) {
      return '';
    }

    if (result.hash) {
      return result.hash;
    }

    if (result.txid) {
      return result.txid;
    }

    if (result.toJSON) {
      const json = result.toJSON();
      return (json && (json.hash || json.txid)) || '';
    }

    return '';
  }

  resolveSelectedTransferTo = async () => {
    const domain = this.getSelectedDomain();
    this.setState({transferTo: '', sellerError: ''});

    if (!domain || !domain.transfer) {
      return;
    }

    this.setState({resolvingTransferTo: true});

    try {
      const result = await nodeClient.getNameInfo(this.state.selectedName);
      const info = result && result.info;
      if (!info || !info.owner) {
        throw new Error(this.context.t('sendNameErrOwnerInfo'));
      }

      const res = await walletClient.getTX(info.owner.hash);
      const coin = await walletClient.getCoin(info.owner.hash, info.owner.index);
      if (!res || !coin || coin.covenant.action !== 'TRANSFER') {
        throw new Error(this.context.t('sendNameErrNoTransferCoin'));
      }

      const transferTo = Address.fromHash(
        Buffer.from(coin.covenant.items[3], 'hex'),
        Number(coin.covenant.items[2]),
      ).toString(this.props.network);

      this.setState({transferTo});
    } catch (e) {
      this.setState({
        sellerError: e.message || this.context.t('sendNameErrResolveRecipient'),
      });
    } finally {
      this.setState({resolvingTransferTo: false});
    }
  };

  onStartTransfer = async () => {
    const {selectedName, buyerAddress, price, note} = this.state;

    if (!selectedName || !buyerAddress) {
      this.setState({sellerError: this.context.t('sendNameErrChooseDomainAndAddress')});
      return;
    }

    if (!isValidAddress(buyerAddress, this.props.network)) {
      this.setState({sellerError: this.context.t('sendNameErrInvalidAddress')});
      return;
    }

    this.setState({
      isStartingTransfer: true,
      sellerError: '',
      sellerNotice: '',
    });

    try {
      const res = await this.props.sendTransfer(selectedName, buyerAddress);
      const txHash = this.getTxHash(res);
      this.saveHistory({
        type: 'transfer-started',
        name: selectedName,
        buyerAddress,
        price,
        note,
        txHash,
      });
      this.setState({
        sellerNotice: price
          ? `${this.context.t('sendNameSubmittedCreateClaim')}${txHash ? `: ${txHash}` : ''}.`
          : `${this.context.t('sendNameSubmittedFinalize')}${txHash ? `: ${txHash}` : ''}.`,
      });
      this.props.getMyNames();
    } catch (e) {
      this.setState({sellerError: e.message || this.context.t('sendNameErrStartTransfer')});
    } finally {
      this.setState({isStartingTransfer: false});
    }
  };

  onFinalizeTransfer = async () => {
    const {selectedName} = this.state;
    const domain = this.getSelectedDomain();

    if (!selectedName || !domain || !this.isTransferMature(domain)) {
      this.setState({sellerError: this.context.t('sendNameErrNotReadyToFinalize')});
      return;
    }

    this.setState({
      isFinalizingTransfer: true,
      sellerError: '',
      sellerNotice: '',
    });

    try {
      const res = await this.props.finalizeTransfer(selectedName);
      const txHash = this.getTxHash(res);
      this.saveHistory({
        type: 'transfer-finalized',
        name: selectedName,
        buyerAddress: this.state.transferTo,
        txHash,
      });
      this.setState({
        sellerNotice: `${this.context.t('sendNameTransferFinalized')}${txHash ? `: ${txHash}` : ''}.`,
      });
      this.props.getMyNames();
    } catch (e) {
      this.setState({sellerError: e.message || this.context.t('sendNameErrFinalizeTransfer')});
    } finally {
      this.setState({isFinalizingTransfer: false});
    }
  };

  onCreatePayload = async () => {
    const {selectedName, price, note, transferTo} = this.state;
    const domain = this.getSelectedDomain();

    if (!domain || !this.isTransferMature(domain)) {
      this.setState({sellerError: this.context.t('sendNameErrNotReadyToFinalize')});
      return;
    }

    if (!transferTo) {
      this.setState({sellerError: this.context.t('sendNameErrResolveRecipientAgain')});
      return;
    }

    if (!price) {
      this.setState({sellerError: this.context.t('sendNameErrEnterPrice')});
      return;
    }

    this.setState({
      isCreatingPayload: true,
      sellerError: '',
      sellerNotice: '',
      payloadText: '',
    });

    try {
      const sellerPaymentAddress = (await walletClient.generateReceivingAddress()).address;
      const txHex = await this.props.finalizeWithPayment(
        selectedName,
        sellerPaymentAddress,
        transferTo,
        price,
      );

      if (!txHex) {
        throw new Error(this.context.t('sendNameErrSignPayload'));
      }

      const details = inspectPaidNameTransfer(txHex, this.props.network);
      if (details.errors.length) {
        throw new Error(details.errors.join(' '));
      }

      const payload = buildPaidNameTransferPayload({
        txHex,
        network: this.props.network,
        name: details.name,
        buyerAddress: details.nameReceiveAddr,
        sellerPaymentAddress: details.fundingAddr,
        price: details.price,
        transferTxHash: domain.owner && domain.owner.hash,
        note,
      });
      const payloadText = stringifyPaidNameTransferPayload(payload);

      this.saveHistory({
        type: 'payload-created',
        name: selectedName,
        buyerAddress: details.nameReceiveAddr,
        sellerPaymentAddress: details.fundingAddr,
        price,
        note,
      });
      this.setState({
        payloadText,
        sellerNotice: this.context.t('sendNameClaimCreated'),
      });
    } catch (e) {
      this.setState({sellerError: e.message || this.context.t('sendNameErrCreateClaim')});
    } finally {
      this.setState({isCreatingPayload: false});
    }
  };

  downloadPayload = () => {
    const {payloadText, selectedName} = this.state;
    if (!payloadText) {
      return;
    }

    const blob = new Blob([`${payloadText}\r\n`], {type: 'application/json;charset=utf-8'});
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${selectedName || 'name'}-claim-payload.json`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  copyPayload = async () => {
    try {
      await navigator.clipboard.writeText(this.state.payloadText);
      this.setState({sellerNotice: this.context.t('sendNameClaimCopied')});
    } catch (e) {
      this.setState({sellerError: this.context.t('sendNameErrCopyPayload')});
    }
  };

  onSelectClaimFile = async () => {
    try {
      const {
        filePaths: [filepath],
      } = await dialog.showOpenDialog({
        title: this.context.t('sendNameOpenClaimPayload'),
        properties: ['openFile'],
        filters: [{name: 'JSON', extensions: ['json']}],
      });

      if (!filepath) return;
      const fileContent = fs.readFileSync(filepath, 'utf-8');
      this.setState({claimText: fileContent}, this.verifyClaimPayload);
    } catch (e) {
      this.setState({claimError: e.message || this.context.t('sendNameErrLoadPayload')});
    }
  };

  verifyClaimPayload = async () => {
    try {
      const parsed = parsePaidNameTransferInput(this.state.claimText);
      const details = inspectPaidNameTransfer(parsed.txHex, this.props.network);
      const errors = [...details.errors];
      const warnings = [...details.warnings];

      if (parsed.payload && parsed.payload.network && parsed.payload.network !== this.props.network) {
        errors.push(this.context.t('sendNameErrNetworkMismatch', parsed.payload.network, this.props.network));
      }

      if (parsed.payload && parsed.payload.type && parsed.payload.type !== 'bob-paid-name-transfer') {
        warnings.push(this.context.t('sendNameWarnNotPaidTransfer'));
      }

      const claimIsOwnAddress = details.nameReceiveAddr
        ? await this.props.hasAddress(details.nameReceiveAddr)
        : false;

      if (!claimIsOwnAddress) {
        warnings.push(this.context.t('sendNameWarnReceivingNotInWallet'));
      }

      this.setState({
        claimDetails: {
          ...details,
          txHex: parsed.txHex,
          payload: parsed.payload,
          errors,
          warnings,
        },
        claimIsOwnAddress,
        claimError: errors.length ? errors.join(' ') : '',
        claimNotice: errors.length ? '' : this.context.t('sendNamePayloadVerified'),
      });
    } catch (e) {
      this.setState({
        claimDetails: null,
        claimError: e.message || this.context.t('sendNameErrInvalidClaim'),
        claimNotice: '',
      });
    }
  };

  payAndClaim = async () => {
    const {claimDetails} = this.state;
    if (!claimDetails || claimDetails.errors.length) {
      return;
    }

    this.setState({isClaiming: true, claimError: '', claimNotice: ''});

    try {
      const mtx = await this.props.claimPaidTransfer(claimDetails.txHex);
      const txHash = mtx && (mtx.hash || (mtx.toJSON && mtx.toJSON().hash));
      this.saveHistory({
        type: 'claim-paid',
        name: claimDetails.name,
        buyerAddress: claimDetails.nameReceiveAddr,
        sellerPaymentAddress: claimDetails.fundingAddr,
        price: claimDetails.priceHNS,
        txHash,
      });
      this.setState({
        claimNotice: txHash
          ? this.context.t('sendNameClaimAcceptedTx', txHash)
          : this.context.t('sendNameClaimAccepted'),
      });
    } catch (e) {
      this.setState({claimError: e.message || this.context.t('sendNameErrPayAndClaim')});
    } finally {
      this.setState({isClaiming: false});
    }
  };

  renderModeTabs() {
    const mode = this.props.mode || SELL_MODE;

    return (
      <div className="send-name__tabs">
        <button
          className={mode === SELL_MODE ? 'send-name__tab send-name__tab--active' : 'send-name__tab'}
          onClick={() => this.props.setMode(SELL_MODE)}
        >
          {this.context.t('sendNameModeSend')}
        </button>
        <button
          className={mode === CLAIM_MODE ? 'send-name__tab send-name__tab--active' : 'send-name__tab'}
          onClick={() => this.props.setMode(CLAIM_MODE)}
        >
          {this.context.t('sendNameModeClaim')}
        </button>
      </div>
    );
  }

  renderSeller() {
    const domainOptions = this.getDomainOptions();
    const domain = this.getSelectedDomain();
    const isPending = this.isTransferPending(domain);
    const isMature = this.isTransferMature(domain);
    const remaining = this.getRemainingBlocks(domain);
    const canStart = domain && !domain.transfer && this.state.buyerAddress;
    const canCreate = domain && isMature && this.state.price && this.state.transferTo;

    return (
      <div className="send-name__panel">
        {this.renderDomainPicker(domainOptions)}

        {domain && !domain.transfer && (
          <>
            <div className="send-name__field">
              <label>{this.context.t('sendNameBuyerAddressRequired')}</label>
              <AddressInput
                onAddress={({address}) => this.setState({
                  buyerAddress: address,
                  sellerError: '',
                })}
              />
            </div>
            {this.renderPriceAndNote()}
            <button
              className="send-name__primary"
              disabled={!canStart || this.state.isStartingTransfer}
              onClick={this.onStartTransfer}
            >
              {this.state.isStartingTransfer ? this.context.t('sendNameStartingTransfer') : this.context.t('sendNameStartTransfer')}
            </button>
          </>
        )}

        {domain && isPending && (
          <div className="send-name__status">
            <strong>{this.context.t('sendNameTransferInProgress')}</strong>
            <span>
              {this.state.price
                ? this.context.t('sendNameReadyCreateClaimIn', remaining)
                : this.context.t('sendNameReadyFinalizeIn', remaining)}
            </span>
          </div>
        )}

        {domain && isMature && (
          <>
            <div className="send-name__status">
              <strong>{this.state.price ? this.context.t('sendNameReadyCreateClaim') : this.context.t('sendNameReadyFinalize')}</strong>
              <span>
                {this.state.resolvingTransferTo
                  ? this.context.t('sendNameReadingRecipient')
                  : this.context.t('sendNameFinalizeTo', this.state.transferTo || this.context.t('sendNameUnknownRecipient'))}
              </span>
            </div>
            {this.renderPriceAndNote()}
            {this.state.price ? (
              <button
                className="send-name__primary"
                disabled={!canCreate || this.state.isCreatingPayload}
                onClick={this.onCreatePayload}
              >
                {this.state.isCreatingPayload ? this.context.t('sendNameCreatingPayload') : this.context.t('sendNameCreateClaimPayload')}
              </button>
            ) : (
              <>
                <div className="send-name__status">
                  <strong>{this.context.t('sendNameNoPriceSet')}</strong>
                  <span>{this.context.t('sendNameNormalTransferHelp')}</span>
                </div>
                <button
                  className="send-name__primary"
                  disabled={!this.state.transferTo || this.state.isFinalizingTransfer}
                  onClick={this.onFinalizeTransfer}
                >
                  {this.state.isFinalizingTransfer ? this.context.t('sendNameFinalizingTransfer') : this.context.t('sendNameFinalizeTransfer')}
                </button>
              </>
            )}
          </>
        )}

        <Alert type="error" message={this.state.sellerError} />
        <Alert type="success" message={this.state.sellerNotice} />

        {this.state.payloadText && (
          <div className="send-name__payload">
            <label>{this.context.t('sendNameClaimPayload')}</label>
            <textarea value={this.state.payloadText} readOnly rows={8} />
            <div className="send-name__actions">
              <button onClick={this.copyPayload}>{this.context.t('sendNameCopyPayload')}</button>
              <button onClick={this.downloadPayload}>{this.context.t('sendNameDownloadClaim')}</button>
            </div>
          </div>
        )}
      </div>
    );
  }

  renderDomainPicker(domainOptions) {
    const {t} = this.context;
    const allDomainCount = Object.keys(this.props.names).length;
    const sortIndex = DOMAIN_SORTS.findIndex(({value}) => value === this.state.domainSort);
    // Dropdown expects {label} items; the label comes from the key in the current locale.
    const sortItems = DOMAIN_SORTS.map(({labelKey, value}) => ({label: t(labelKey), value}));

    return (
      <div className="send-name__field">
        <label>{t('sendNameDomainRequired')}</label>
        <div className="send-name__domain-tools">
          <div className="send-name__domain-search">
            <input
              value={this.state.domainQuery}
              onChange={e => this.setState({domainQuery: e.target.value})}
              placeholder={t('sendNameSearchDomains')}
            />
          </div>
          <Dropdown
            className="send-name__domain-sort"
            items={sortItems}
            currentIndex={sortIndex === -1 ? 0 : sortIndex}
            onChange={domainSort => this.setState({domainSort})}
          />
        </div>
        <div className="send-name__domain-list">
          {domainOptions.map(name => (
            <button
              key={name}
              className={this.state.selectedName === name
                ? 'send-name__domain-option send-name__domain-option--active'
                : 'send-name__domain-option'}
              onClick={() => this.setState({
                selectedName: name,
                payloadText: '',
                sellerError: '',
                sellerNotice: '',
              })}
            >
              <span>{name}/</span>
            </button>
          ))}
        </div>
        {this.props.isFetching && <p>{t('sendNameLoadingDomains')}</p>}
        {!this.props.isFetching && !allDomainCount && <p>{t('sendNameNoOwnedDomains')}</p>}
        {!!allDomainCount && !domainOptions.length && <p>{t('sendNameNoDomainMatch')}</p>}
      </div>
    );
  }

  renderPriceAndNote() {
    return (
      <>
        <div className="send-name__field">
          <label>{this.context.t('sendNamePriceOptional')}</label>
          <div className="send-name__amount-input">
            <input
              type="number"
              min={0}
              placeholder="0.000000"
              value={this.state.price}
              onChange={e => this.processPrice(e.target.value)}
            />
            <span>HNS</span>
          </div>
          <p className="send-name__hint">
            {this.context.t('sendNamePriceHint')}
          </p>
        </div>
        <div className="send-name__field">
          <label>{this.context.t('sendNameNoteOptional')}</label>
          <input
            value={this.state.note}
            onChange={e => this.setState({note: e.target.value})}
            placeholder={this.context.t('sendNameNotePlaceholder')}
          />
          <p className="send-name__hint">
            {this.context.t('sendNameNoteHint')}
          </p>
        </div>
      </>
    );
  }

  renderClaim() {
    const {claimDetails} = this.state;

    return (
      <div className="send-name__panel">
        <div className="send-name__field">
          <label>{this.context.t('sendNameClaimPayload')}</label>
          <textarea
            value={this.state.claimText}
            rows={8}
            onChange={e => this.setState({
              claimText: e.target.value,
              claimDetails: null,
              claimError: '',
              claimNotice: '',
            })}
            placeholder={this.context.t('sendNamePasteClaims')}
          />
        </div>
        <div className="send-name__actions">
          <button onClick={this.verifyClaimPayload} disabled={!this.state.claimText}>
            {this.context.t('verify')}
          </button>
          <button onClick={this.onSelectClaimFile}>
            {this.context.t('sendNameLoadFile')}
          </button>
        </div>

        <Alert type="error" message={this.state.claimError} />
        <Alert type="success" message={this.state.claimNotice} />

        {claimDetails && (
          <div className="send-name__verify">
            <dl>
              <dt>{this.context.t('sendNameFieldDomain')}</dt>
              <dd>{claimDetails.name}/</dd>
              <dt>{this.context.t('sendNameAddrReceivingName')}</dt>
              <dd>{claimDetails.nameReceiveAddr}</dd>
              <dt>{this.context.t('sendNameAddrInThisWallet')}</dt>
              <dd>{this.state.claimIsOwnAddress ? this.context.t('yes') : this.context.t('no')}</dd>
              <dt>{this.context.t('sendNameSellerPaymentAddress')}</dt>
              <dd>{claimDetails.fundingAddr}</dd>
              <dt>{this.context.t('sendNameFieldPrice')}</dt>
              <dd>{claimDetails.priceHNS} HNS</dd>
            </dl>
            {!!claimDetails.warnings.length && (
              <div className="send-name__warnings">
                {claimDetails.warnings.map(warning => (
                  <p key={warning}>{warning}</p>
                ))}
              </div>
            )}
            <button
              className="send-name__primary"
              disabled={!!claimDetails.errors.length || this.state.isClaiming}
              onClick={this.payAndClaim}
            >
              {this.state.isClaiming ? this.context.t('sendNamePaying') : this.context.t('sendNamePayAndClaim')}
            </button>
          </div>
        )}
      </div>
    );
  }

  renderHistory() {
    if (!this.state.history.length) {
      return null;
    }

    return (
      <div className="send-name__history">
        <h3>{this.context.t('sendNameRecentActivity')}</h3>
        {this.state.history.slice(0, 5).map((item, idx) => (
          <div className="send-name__history-row" key={`${item.createdAt}-${idx}`}>
            <strong>{item.name}/</strong>
            <span>
              {item.type.replace(/-/g, ' ')}
              {item.txHash ? `: ${item.txHash}` : ''}
            </span>
            <small>{new Date(item.createdAt).toLocaleString()}</small>
          </div>
        ))}
      </div>
    );
  }

  render() {
    const mode = this.props.mode || SELL_MODE;

    return (
      <>
        <div className="send-name">
          {this.renderModeTabs()}
          {mode === SELL_MODE && (
            <div className="send-name__bulk-shortcut">
              <span>{this.context.t('sendNameBulkPrompt')}</span>
              <button onClick={() => this.setState({isShowingBulkTransfer: true})}>
                {this.context.t('sendNameBulkTitle')}
              </button>
            </div>
          )}
          {mode === CLAIM_MODE ? this.renderClaim() : this.renderSeller()}
          {this.renderHistory()}
        </div>
        {this.state.isShowingBulkTransfer && (
          <BulkTransfer
            onClose={() => this.setState({isShowingBulkTransfer: false})}
          />
        )}
      </>
    );
  }
}

export default connect(
  state => ({
    names: state.myDomains.names,
    isFetching: state.myDomains.isFetching,
    height: state.node.chain.height,
    network: state.wallet.network,
    walletId: state.wallet.wid,
  }),
  dispatch => ({
    getMyNames: () => dispatch(getMyNames()),
    sendTransfer: (name, recipient) => dispatch(sendTransfer(name, recipient)),
    finalizeTransfer: (name) => dispatch(finalizeTransfer(name)),
    finalizeWithPayment: (name, fundingAddr, recipient, price) => dispatch(finalizeWithPayment(name, fundingAddr, recipient, price)),
    claimPaidTransfer: (hex) => dispatch(claimPaidTransfer(hex)),
    hasAddress: (address) => dispatch(hasAddress(address)),
  }),
)(SendName);
