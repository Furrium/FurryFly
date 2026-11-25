Fonts bundled with TRANSFUR
===========================

Roboto and Roboto Mono
----------------------
Files:   app/assets/fonts/roboto-latin.woff2
         app/assets/fonts/roboto-mono-latin.woff2
Source:  Google Fonts <https://fonts.google.com>, files served from fonts.gstatic.com
License: Apache License, Version 2.0 - full text in ROBOTO-LICENSE.txt

Only the "latin" subset of each family is bundled, as a variable font covering the
weight axis. Text outside that subset - including Chinese - falls back to the system
font stack, which is deliberate: a bundled CJK face would add megabytes to every build.

These replaced a runtime @import of fonts.googleapis.com, which meant every launch
reached a third party and the interface fell back to a different typeface when offline.

DSEG
----
Files:   app/assets/fonts/DSEG7Classic-Regular.woff2
         app/assets/fonts/DSEG14Classic-Regular.woff2
Source:  keshikan <http://www.keshikan.net>
License: SIL Open Font License 1.1 - full text in DSEG-LICENSE.txt

Used for the seven-segment balance readout. The licence reserves the name "DSEG", so
the files are unmodified and the families are declared under the names they carry.
