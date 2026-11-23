// Decide what to do about a compatibility URL scheme, given who currently owns it.
//
// Kept free of electron and node builtins so it can be unit tested: main.js reads
// the registry and passes the owner in.
//
//   'adopt'   - nobody owns the scheme, so registering it cannot break anything
//   'refresh' - we already own it; rewrite the command in case it is stale
//   'leave'   - another executable owns it, and silently taking it would break them

// Registry values are full command lines: `"C:\path\app.exe" "app.js" "%1"`.
// Reduce them to the executable before comparing, otherwise two entries for the
// same program look different as soon as their arguments differ.
//
// The unquoted branch must keep the whole string: Windows paths contain spaces
// ("C:\Program Files\..."), so cutting at the first space would compare directories
// instead of programs.
function normalizeProgram(value) {
  const text = String(value).trim();
  const quoted = /^"([^"]+)"/.exec(text);
  const program = quoted ? quoted[1] : text;
  return program
    .replace(/^"|"$/g, '')
    .replace(/\//g, '\\')
    .trim()
    .toLowerCase();
}

function decideCompatAction(owner, execPath) {
  if (owner === null || owner === undefined || owner === '') return 'adopt';
  return normalizeProgram(owner) === normalizeProgram(execPath) ? 'refresh' : 'leave';
}

module.exports = {decideCompatAction, normalizeProgram};
