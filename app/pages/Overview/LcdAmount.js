import React from 'react';

// Seven-segment readout for the balance.
//
// Each digit is a mechanical reel: a column holding 0-9 twice, translated so the wanted
// digit lands in the window. Starting at the top and travelling through a full extra
// cycle is what makes the entry read as a wheel rather than a swap, and the per-column
// delay settles the number left to right instead of all at once.
//
// Characters that are not digits - the thousands separator and the decimal point - are
// drawn in place. The display face has no comma glyph, so the browser falls back for that
// one character, which is the correct-looking result anyway.

const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
const STRIP = [...DIGITS, ...DIGITS];

function Reel({ digit, index, animate }) {
  const target = DIGITS.length + Number(digit);
  const [offset, setOffset] = React.useState(animate ? 0 : target);

  React.useEffect(() => {
    if (!animate) {
      setOffset(target);
      return undefined;
    }
    // Paint the starting frame before moving. Setting both styles in the same commit lets
    // the browser coalesce them, and then no transition runs at all.
    const frame = window.requestAnimationFrame(() => setOffset(target));
    return () => window.cancelAnimationFrame(frame);
  }, [target, animate]);

  return (
    <span className="lcd-reel" style={{'--lcd-delay': `${index * 70}ms`}}>
      {/* The step is a custom property rather than 1em: the window is slightly taller
          than the glyph so its top edge is not shaved off, and the strip has to move by
          the window height for the digits to stay aligned. */}
      <span
        className="lcd-reel__strip"
        style={{transform: `translateY(calc(${-offset} * var(--lcd-cell-h, 1em)))`}}
      >
        {STRIP.map((value, i) => <span className="lcd-reel__cell" key={i}>{value}</span>)}
      </span>
    </span>
  );
}

export function LcdNumber({ value, animate = true }) {
  const characters = String(value).split('');
  return (
    <span className="lcd-number">
      {characters.map((character, index) => (
        /\d/.test(character)
          ? <Reel key={index} digit={character} index={index} animate={animate} />
          : <span className="lcd-number__static" key={index}>{character}</span>
      ))}
    </span>
  );
}

// Fourteen-segment face: the seven-segment one cannot draw N, R or O.
export function LcdError({ label = 'ERROR' }) {
  return <span className="lcd-error">{label}</span>;
}
