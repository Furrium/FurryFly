import React, {useContext} from 'react';
import {I18nContext} from '../../utils/i18n';
import {formatName} from '../../utils/nameHelpers';
import './pending-finalize.scss';

// Buying a name on the marketplace is not finished when the fill is broadcast.
//
// The name transfers to the buyer first, and only then can the buyer broadcast the
// finalize transaction that actually delivers it. Until that second transaction lands the
// purchase looks complete from every angle except the balance: no name appears, no error
// appears, and nothing says a step is missing.
//
// The only way to reach that step was a text link in the last column of the fills table,
// at the bottom of the marketplace page. This lifts it out of the table and puts it where
// the buyer is - at the top of the page they bought on, and on the page they land on when
// they open the wallet.
//
// Deliberately presentational: it takes names and callbacks rather than reaching for the
// store or the router, so it can be mounted in a test on its own.
export default function PendingFinalizeNotice({
  names = [],
  finalizingName = null,
  onFinalize,
  onOpenMarket = null,
}) {
  const {t} = useContext(I18nContext);

  if (!names.length) {
    return null;
  }

  return (
    <section className="pending-finalize" role="status" aria-live="polite">
      <div className="pending-finalize__copy">
        <strong className="pending-finalize__title">
          {t('pendingFinalizeTitle', names.length)}
        </strong>
        <span className="pending-finalize__help">{t('pendingFinalizeHelp')}</span>
      </div>
      <ul className="pending-finalize__list">
        {names.map(name => (
          <li key={name} className="pending-finalize__item">
            <span className="pending-finalize__name">{formatName(name)}</span>
            <button
              type="button"
              className="pending-finalize__button"
              disabled={finalizingName === name}
              onClick={() => onFinalize(name)}
            >
              {finalizingName === name ? t('exchangeFinalizing') : t('exchangeFinalizeAction')}
            </button>
          </li>
        ))}
      </ul>
      {onOpenMarket && (
        <button type="button" className="pending-finalize__link" onClick={onOpenMarket}>
          {t('pendingFinalizeOpenMarket')}
        </button>
      )}
    </section>
  );
}
