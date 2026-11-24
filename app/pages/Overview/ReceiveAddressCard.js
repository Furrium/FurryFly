import React from 'react';
import PropTypes from 'prop-types';
import {QRCodeSVG} from 'qrcode.react';
import {I18nContext} from '../../utils/i18n';
import CopyButton from '../../components/CopyButton';
import MiniModal from '../../components/Modal/MiniModal';

// The address someone needs in order to pay you.
//
// Receiving used to mean leaving this page for the Receive screen, even though the address
// was already in the store. It now sits beside the balance with the three things people
// actually do with it, and the QR opens in place.
//
// Deliberately not connected: the page owns the store and the rotation side effect, so
// this stays a component that only renders an address and reports intent.
function ReceiveAddressCard({address, onRotate}) {
  const {t} = React.useContext(I18nContext);
  const [showQr, setShowQr] = React.useState(false);
  const [isRotating, setRotating] = React.useState(false);
  const [error, setError] = React.useState('');

  const rotate = async () => {
    if (isRotating || !onRotate) return;
    setRotating(true);
    setError('');
    try {
      await onRotate();
    } catch (e) {
      setError((e && e.message) || String(e));
    } finally {
      setRotating(false);
    }
  };

  return (
    <div className="overview__receive">
      <span className="overview__receive-kicker">{t('overviewReceiveAddress')}</span>
      <div className="overview__receive-row">
        <span className="overview__receive-address" title={address}>{address}</span>
        <div className="overview__receive-actions">
          <CopyButton content={address} className="overview__receive-btn" />
          <button
            type="button"
            className="overview__receive-btn"
            onClick={rotate}
            disabled={isRotating || !onRotate}
          >
            {isRotating ? t('overviewRotatingAddress') : t('overviewRotateAddress')}
          </button>
          <button
            type="button"
            className="overview__receive-btn"
            onClick={() => setShowQr(true)}
          >
            {t('overviewShowQr')}
          </button>
        </div>
      </div>
      {!!error && <div className="overview__receive-error">{error}</div>}
      {showQr && (
        <MiniModal title={t('overviewReceiveAddress')} onClose={() => setShowQr(false)}>
          <div className="overview__qr">
            <div className="overview__qr-code">
              <QRCodeSVG value={address} size={224} />
            </div>
            <div className="overview__qr-address">{address}</div>
          </div>
        </MiniModal>
      )}
    </div>
  );
}

ReceiveAddressCard.propTypes = {
  address: PropTypes.string,
  onRotate: PropTypes.func,
};

ReceiveAddressCard.defaultProps = {
  address: '',
  onRotate: null,
};

export default ReceiveAddressCard;
