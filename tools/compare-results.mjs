import fs from 'node:fs';

const appRaw = JSON.parse(fs.readFileSync('tools/app-reference.json', 'utf8'));
const hwRaw = JSON.parse(fs.readFileSync('tools/hardware-measurement.json', 'utf8'));

const app = Array.isArray(appRaw) ? appRaw[0] : appRaw;
const hw = Array.isArray(hwRaw) ? hwRaw[0] : hwRaw;

console.log('=== APP vs HARDWARE DETAILED COMPARISON ===\n');

let currentTest = '';
for (let i = 0; i < app.notes.length; i++) {
  const an = app.notes[i];
  const hn = hw.notes[i];

  if (an.test !== currentTest) {
    currentTest = an.test;
    console.log(`\n--- ${currentTest} ---`);
  }

  const label = (an.label || '').padEnd(20);
  switch (an.test) {
    case 'CAL1-ENV':
      console.log(
        `${label} App: total=${an.decayTotalSeconds ?? '-'}s, -20dB=${an.decayToMinus20dB ?? '-'}s, exp=${an.decayExponent ?? '-'}`
        + ` | HW: total=${hn.decayTotalSeconds ?? '-'}s, -20dB=${hn.decayToMinus20dB ?? '-'}s, exp=${hn.decayExponent ?? '-'}`
      );
      break;

    case 'CAL2-INDEX':
      console.log(
        `${label} App: peak=${an.peak} f0=${an.fundamentalHz} h1..h4=[${(an.harmonicsDb || []).slice(0, 4).map(v => Math.round(v))}]`
        + ` | HW: peak=${hn.peak} f0=${hn.fundamentalHz} h1..h4=[${(hn.harmonicsDb || []).slice(0, 4).map(v => Math.round(v))}]`
      );
      break;

    case 'CAL3-GAIN':
    case 'CAL6-MOD':
      console.log(
        `${label} App: peak=${an.peak} peakDb=${an.peakDb}`
        + ` | HW: peak=${hn.peak} peakDb=${hn.peakDb}`
      );
      break;

    case 'CAL4-CUT':
      console.log(
        `${label} App: peak=${an.peak} h1..h6=[${(an.harmonicsDb || []).slice(0, 6).map(v => Math.round(v))}]`
        + ` | HW: peak=${hn.peak} h1..h6=[${(hn.harmonicsDb || []).slice(0, 6).map(v => Math.round(v))}]`
      );
      break;

    case 'CAL5-RES':
      console.log(
        `${label} App: peak=${an.peak} h1..h4=[${(an.harmonicsDb || []).slice(0, 4).map(v => Math.round(v))}]`
        + ` | HW: peak=${hn.peak} h1..h4=[${(hn.harmonicsDb || []).slice(0, 4).map(v => Math.round(v))}]`
      );
      break;

    case 'CAL7-FBK':
      console.log(
        `${label} App: peak=${an.peak} f0=${an.fundamentalHz} h1..h6=[${(an.harmonicsDb || []).slice(0, 6).map(v => Math.round(v))}]`
        + ` | HW: peak=${hn.peak} f0=${hn.fundamentalHz} h1..h6=[${(hn.harmonicsDb || []).slice(0, 6).map(v => Math.round(v))}]`
      );
      break;

    case 'CAL8-SHAPE':
      console.log(
        `${label} App: f0=${an.fundamentalHz} h1..h8=[${(an.harmonicsDb || []).slice(0, 8).map(v => Math.round(v))}]`
        + ` | HW: f0=${hn.fundamentalHz} h1..h8=[${(hn.harmonicsDb || []).slice(0, 8).map(v => Math.round(v))}]`
      );
      break;

    case 'CAL9-LFO':
      console.log(
        `${label} App: peak=${an.peak} | HW: peak=${hn.peak}`
      );
      break;

    default:
      console.log(`${label} App: peak=${an.peak} | HW: peak=${hn.peak}`);
  }
}
