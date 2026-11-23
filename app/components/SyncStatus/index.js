import React, { Component } from "react";
import { withRouter } from "react-router-dom";
import PropTypes from "prop-types";
import c from "classnames";
import { connect } from "react-redux";
import "./sync-status.scss";
import {I18nContext} from "../../utils/i18n";
import * as nodeActions from "../../ducks/node";

export const SYNC_COMPLETE_THRESHOLD = 0.99995;

export function isSyncComplete(chain = {}) {
  const {progress, height, bestPeerHeight, synced} = chain;

  if (Number.isFinite(height)
      && Number.isFinite(bestPeerHeight)
      && height < bestPeerHeight) {
    return false;
  }

  if (synced === true) {
    return true;
  }

  return Number.isFinite(progress) && progress >= SYNC_COMPLETE_THRESHOLD;
}

export function formatSyncProgress(progress, isSynchronized = false) {
  if (!Number.isFinite(progress)) {
    return '';
  }

  const percent = Math.max(0, progress * 100);
  const displayedPercent = isSynchronized
    ? Math.min(100, percent)
    : Math.min(99.99, percent);

  return `(${displayedPercent.toFixed(2)}%)`;
}

export function getSyncStatusText(props, t) {
  const {
    isSynchronized,
    isSynchronizing,
    progress,
    isCustomRPCConnected,
    isChangingNodeStatus,
    isTestingCustomRPC,
    walletSync,
    walletHeight,
    rescanHeight,
    rescanStatus,
    storageBlocked,
    syncEnabled,
  } = props;

  if (storageBlocked) {
    return t('storageErrorSyncStatus');
  }

  if (rescanStatus === 'failed') return t('walletRescanFailed');
  if (rescanStatus === 'waiting') return t('walletRescanWaiting');

  if (walletSync) {
    const percentText = rescanHeight > 0
      ? Math.min(99, Math.max(0, Math.floor((walletHeight * 100) / rescanHeight)))
      : 0;
    return isCustomRPCConnected
      ? `${t('rescanningFromRPC')}... (${percentText}%)`
      : `${t('rescanning')}... (${percentText}%)`;
  }

  if (isSynchronizing) {
    const progressText = formatSyncProgress(progress, isSynchronized);
    // Downloading is opt-in, so an incomplete chain with sync switched off is
    // parked rather than in flight - it must not claim to be synchronising.
    if (syncEnabled === false) {
      return `${t('syncPausedStatus')} ${progressText}`;
    }
    return isCustomRPCConnected
      ? `${t('synchronizingFromRPC')}... ${progressText}`
      : `${t('synchronizing')}... ${progressText}`;
  }

  if (isSynchronized) {
    return isCustomRPCConnected
      ? t('synchronizedFromRPC')
      : t('synchronized');
  }

  if (isChangingNodeStatus || isTestingCustomRPC) {
    return t('pleaseWait');
  }

  return t('noConnection');
}

@withRouter
@connect((state) => {
  const {
    chain,
    isRunning,
    isCustomRPCConnected,
    isChangingNodeStatus,
    isTestingCustomRPC,
  } = state.node;
  const { progress } = chain || {};
  const syncComplete = isSyncComplete(chain);

  return {
    isRunning,
    isCustomRPCConnected,
    isChangingNodeStatus,
    isTestingCustomRPC,
    isSynchronizing: isRunning && !syncComplete,
    isSynchronized: isRunning && syncComplete,
    progress,
    walletSync: state.wallet.walletSync,
    walletHeight: state.wallet.walletHeight,
    rescanHeight: state.wallet.rescanHeight,
    rescanStatus: state.wallet.rescanStatus,
    chainHeight: state.node.chain.height,
    storageBlocked: state.storage.blocked,
    syncEnabled: state.node.syncEnabled,
  };
}, (dispatch) => ({
  setSyncEnabled: (enabled) => dispatch(nodeActions.setSyncEnabled(enabled)),
}))
class SyncStatus extends Component {
  static propTypes = {
    isRunning: PropTypes.bool.isRequired,
    isCustomRPCConnected: PropTypes.bool.isRequired,
    isSynchronizing: PropTypes.bool.isRequired,
    isSynchronized: PropTypes.bool.isRequired,
    isChangingNodeStatus: PropTypes.bool.isRequired,
    isTestingCustomRPC: PropTypes.bool.isRequired,
    walletSync: PropTypes.bool.isRequired,
    walletHeight: PropTypes.number.isRequired,
    rescanHeight: PropTypes.number,
    chainHeight: PropTypes.number.isRequired,
    storageBlocked: PropTypes.bool.isRequired,
    syncEnabled: PropTypes.bool,
    setSyncEnabled: PropTypes.func.isRequired,
  };

  static contextType = I18nContext;

  state = {pending: false};

  render() {
    const {
      isSynchronized,
      isSynchronizing,
      isChangingNodeStatus,
      isTestingCustomRPC,
      isRunning,
      walletSync,
      progress,
      storageBlocked,
      syncEnabled,
    } = this.props;

    const {t} = this.context;

    // The action is a separate control to the left of the label: a button that
    // looks like a status label is not discoverable, and hanging it off the
    // indicator meant it vanished for anyone without a wallet.
    const busy = Boolean(walletSync || isChangingNodeStatus || isTestingCustomRPC);
    const actionable = isRunning && !isSynchronized && !storageBlocked;
    const parked = actionable && isSynchronizing && !busy && syncEnabled === false;
    const spinning = !storageBlocked && (busy || (isSynchronizing && syncEnabled !== false));

    return (
      <div className="sync-status-group">
        {actionable && (
          <button
            type="button"
            className="sync-status-group__toggle"
            onClick={this.toggleSync}
            disabled={this.state.pending}
          >
            {syncEnabled === false ? t('syncResume') : t('syncPauseShort')}
          </button>
        )}
        <div
          className={c("sync-status", {
            "sync-status--success": isSynchronized && !storageBlocked,
            "sync-status--failure": !isRunning || storageBlocked,
            "sync-status--loading": spinning,
            "sync-status--paused": parked,
          })}
        >
          {this.getSyncText()}
        </div>
      </div>
    );
  }

  toggleSync = async () => {
    // Deliberately not gated on `busy`: a wallet rescan parked behind a frozen
    // chain keeps that flag set forever, and this button is the only way out.
    if (this.state.pending) return;
    this.setState({pending: true});
    try {
      // syncEnabled === false means "paused", so clicking resumes it.
      await this.props.setSyncEnabled(this.props.syncEnabled === false);
    } finally {
      this.setState({pending: false});
    }
  };

  getSyncText() {
    const {t} = this.context;
    return getSyncStatusText(this.props, t);
  }
}

export default SyncStatus;
