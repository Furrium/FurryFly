import test from 'tape';
import zh from '../../../locales/zh-CN.json';
import {parseCompleteBasket} from '../auctionBasketData';
import {hoursToNow} from '../timeConverter';

const translate = (key, ...values) => {
  let text = zh[key];
  for (const value of values) text = text.replace('%s', value);
  return text;
};

test('localized basket import preserves accepted amounts and rejection decisions', t => {
  const csv = 'name,true_bid,blind\nfixture,1.000001,2\nnegative,-1,2\nprecision,1.0000001,2\nzero,0,0\ndup,1,2\ndup,3,4';
  const en = parseCompleteBasket(csv);
  const cn = parseCompleteBasket(csv, 20, translate);
  t.deepEqual(cn.map(({errors, ...row}) => row), en.map(({errors, ...row}) => row));
  t.deepEqual(cn.map(row => row.errors.length), en.map(row => row.errors.length));
  t.equal(cn[0].lockupAmount, '3.000001');
  t.ok(cn[1].errors.includes('真实出价不能为负数。'));
  t.ok(cn[2].errors.includes('真实出价超过六位小数。'));
  t.ok(cn[3].errors.includes('真实出价与掩护金额不能同时为零。'));
  t.ok(cn[4].errors.includes('导入内容中存在重复域名。'));
  t.end();
});

test('duration localization preserves units, values, and the English default', t => {
  t.equal(hoursToNow(1.5), '~1h 30m');
  t.equal(hoursToNow(25.5), '~1d 1h 30m');
  t.equal(hoursToNow(1.5, translate), '~1 小时 30 分钟');
  t.equal(hoursToNow(25.5, translate), '~1 天 1 小时 30 分钟');
  t.equal(hoursToNow(null, translate), '暂无');
  t.end();
});

import {normalizeLocale, translateLocale, languageDropdownItems} from '../i18n';
import {reviewDate} from '../reviewText';
import en from '../../../locales/en.json';

test('maintained locales preserve fallback, interpolation, amounts and readable duration/counts', t => {
  t.equal(normalizeLocale('unsupported'), 'en-US');
  // Only two languages ship. The properties worth pinning are the same for both:
  // key parity, interpolation through t(), and numbers that survive localization.
  for (const [locale, strings] of [['en-US', en], ['zh-CN', zh]]) {
    t.ok(languageDropdownItems.some(item => item.value === locale && !item.disabled), 'Settings offers locale');
    const tr = (key, ...args) => translateLocale(locale, null, key, ...args);
    t.deepEqual(Object.keys(strings).sort(), Object.keys(en).sort(), `${locale} parity`);
    t.equal(tr('settingLanguageTitle'), strings.settingLanguageTitle);
    t.equal(tr('multisigPolicy', '2', '3'), strings.multisigPolicy.replace('%s', '2').replace('%s', '3'), 'M-of-N argument order');
    t.equal(tr('basketInvalidName', '$& %s'), strings.basketInvalidName.replace('%s', () => '$& %s'), 'external text stays literal');
    t.equal(translateLocale('custom', {pair: '%s / %s'}, 'pair', '%s $&', 'last'), '%s $& / last', 'values are interpolated once');
    for (const n of [0, 1, 2, 5, 11, 21, 22]) {
      t.ok(tr('shakexListingCountMany', n).includes(String(n)));
      // English inflects ("1 record" / "2 records"), Chinese does not ("1 条记录" /
      // "2 条记录"). Both are correct; what must hold is that each locale is
      // internally consistent and carries the number through.
      if (locale === 'en-US') {
        t.equal(tr('recordsCountOne', n), en.recordsCountOne.replace('%s', n));
        t.equal(tr('recordsCountMany', n), en.recordsCountMany.replace('%s', n));
      } else {
        t.equal(tr('recordsCountOne', n), tr('recordsCountMany', n), 'Chinese has no plural form');
      }
    }
    const csv = 'name,true_bid,blind\nfixture,1.000001,2\nnegative,-1,2\nprecision,1.0000001,2\nzero,0,0';
    const actual = parseCompleteBasket(csv, 20, tr), expected = parseCompleteBasket(csv);
    t.deepEqual(actual.map(({errors, ...row}) => row), expected.map(({errors, ...row}) => row), 'locale cannot change transaction numbers');
    t.deepEqual(actual.map(row => row.errors.length), expected.map(row => row.errors.length));
    const date = '2026-10-03T12:34:00Z';
    t.equal(reviewDate(date, locale), new Date(date).toLocaleString(locale), 'uses locale date display, not numeric parsing');
  }
  t.equal(hoursToNow(25.5, (key, ...args) => translateLocale('zh-CN', null, key, ...args)), '~1 天 1 小时 30 分钟');
  t.equal(translateLocale('custom', {}, 'cancel'), en.cancel, 'missing custom key falls back to English');
  t.equal(translateLocale('unknown', null, 'cancel'), en.cancel, 'unknown locale falls back to English');
  // A language this build no longer ships must still render, via English.
  t.equal(translateLocale('ru-RU', null, 'cancel'), en.cancel, 'retired locale falls back to English');
  t.equal(translateLocale('zh-CN', null, 'fixture-missing'), 'this.context.t(fixture-missing)', 'unknown key retains diagnostic');
  t.end();
});
