import React, {useContext} from 'react';
import {BigNumber} from 'bignumber.js';
import {I18nContext} from '../../utils/i18n';
import {displayBalance} from '../../utils/balances';
import {balanceReadiness} from '../../utils/balanceReadiness';
import AuctionSummaryStatus, {auctionSummaryTotal} from './AuctionSummaryStatus';
import {LcdNumber, LcdError} from './LcdAmount';
import ReceiveAddressCard from './ReceiveAddressCard';
import './balance-readout.scss';

export function balanceSnapshotReady(props) {
  return balanceReadiness(props) === 'ready';
}

function formatAmount(amount) {
  return new BigNumber(displayBalance(amount, false, 2)).toFormat(2);
}

export default function BalanceSummary(props) {
  const {t} = useContext(I18nContext);
  const [detailsOpen, setDetailsOpen] = React.useState(false);
  const readiness = balanceReadiness(props);
  const ready = readiness === 'ready';
  const auctionTotal = ready ? auctionSummaryTotal(props.walletStats) : null;
  const value = amount => ready
    ? `${formatAmount(amount)} HNS`
    : t('balanceUpdating');
  const kind = props.walletWatchOnly ? 'overviewWalletWatchOnly'
    : props.walletType === 'multisig' ? 'overviewWalletMultisig' : 'overviewWalletStandard';

  return <section className="overview__hero overview__balance" aria-label={t('balanceDetails')}
    data-balance-readiness={readiness}>
    <div className="overview__hero-main">
      <span className="overview__hero-kicker">{t('balanceSpendableNow')}</span>
      {ready ? (
        <span className="overview__hero-amount">
          <LcdNumber value={formatAmount(props.spendableBalance)} />
          <span className="overview__hero-unit">HNS</span>
        </span>
      ) : (
        // A counter cannot show "not yet known", so the readout goes to ERROR and the
        // reason sits beside it rather than under it: the number is the thing being
        // refused, and the sentence explains why.
        <span className="overview__hero-amount overview__hero-amount--error">
          <LcdError />
          <span className="overview__hero-error-reason">{t('balanceSyncReason')}</span>
        </span>
      )}
      <span className="overview__hero-meta">{props.walletName} · {t(kind)}</span>
      {ready && props.showUsdValue && props.hnsPrice?.value > 0 &&
        <span className="overview__hero-meta">~${(props.spendableBalance / 1e6 * props.hnsPrice.value).toFixed(2)} {props.hnsPrice.currency || 'USD'}</span>}
      <ReceiveAddressCard address={props.receiveAddress} onRotate={props.onRotateAddress} />
    </div>
    <div className="overview__balance-locked">
      <span className="overview__hero-kicker">{t('overviewLockedAuctions')}</span>
      {auctionTotal === null
        ? <AuctionSummaryStatus stats={props.walletStats} onRetry={props.onRetryStats} waiting={!ready} />
        : <span className="overview__hero-chip-value">{formatAmount(auctionTotal)} HNS</span>}
      <p>{t('auctionSummaryScope')}</p>
    </div>
    <div className="overview__balance-details">
      <button
        type="button"
        className="overview__balance-details__summary"
        aria-expanded={detailsOpen}
        onClick={() => setDetailsOpen(open => !open)}
      >
        <span>{t('balanceDetails')}</span>
        <span className={`overview__balance-details__chevron${detailsOpen ? ' overview__balance-details__chevron--open' : ''}`} />
      </button>
      {/* grid-template-rows 0fr -> 1fr animates a height nobody has to measure. */}
      <div className={`overview__balance-details__body${detailsOpen ? ' overview__balance-details__body--open' : ''}`}>
        <div className="overview__balance-details__inner">
          <dl>
            <dt>{t('balanceAllCovenantLocks')}</dt><dd>{value(props.lockedUnconfirmed)}</dd>
            <dt>{t('balanceConfirmedTotal')}</dt><dd>{value(props.confirmedBalance)}</dd>
            <dt>{t('balanceCurrentTotal')}</dt><dd>{value(props.unconfirmedBalance)}</dd>
          </dl>
        </div>
      </div>
    </div>
  </section>;
}
