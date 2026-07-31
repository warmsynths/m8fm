import { FmEngine } from './audio/FmEngine';
import { MacroMapper } from './audio/MacroMapper';
import { M8Serializer } from './audio/M8Serializer';

const engine = new FmEngine();
const mapper = new MacroMapper();
const serializer = new M8Serializer();

let isInitialized = false;

function init() {
  if (isInitialized) return;
  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
  const ctx = new AudioContextClass();
  engine.init(ctx);
  
  // Load initial params
  applyParamsToEngine();
  
  isInitialized = true;
  console.log('Audio initialized!');
  document.getElementById('status')!.innerText = 'Status: Initialized. Press A-K to play, E to download .m8i.';
}

import { AnchorMacroConfig, type AnchorName } from './audio/MacroMapper';

function applyParamsToEngine() {
  if (!isInitialized) return; // Prevent setting params before engine is initialized
  const params = mapper.getComputedFmParams();
  engine.setAlgorithm(params.algorithm);
  engine.setFeedback(params.feedback);
  for (let i = 0; i < 4; i++) {
    engine.setOperatorParam(i, 'ratio', params.operators[i].ratio);
    engine.setOperatorParam(i, 'level', params.operators[i].level);
    engine.setOperatorParam(i, 'attack', params.operators[i].attack);
    engine.setOperatorParam(i, 'decay', params.operators[i].decay);
    engine.setOperatorParam(i, 'sustain', params.operators[i].sustain);
    engine.setOperatorParam(i, 'release', params.operators[i].release);
    engine.setOperatorParam(i, 'pitchEnvDepth', params.operators[i].pitchEnvDepth);
    engine.setOperatorParam(i, 'pitchEnvDecay', params.operators[i].pitchEnvDecay);
  }
}

// Simple key to frequency mapping (C4 to C5 scale roughly)
const keyMap: Record<string, number> = {
  'a': 261.63, // C4
  's': 293.66, // D4
  'd': 329.63, // E4
  'f': 349.23, // F4
  'g': 392.00, // G4
  'h': 440.00, // A4
  'j': 493.88, // B4
  'k': 523.25, // C5
};

window.addEventListener('keydown', (e) => {
  if (!isInitialized) {
    init();
  }
  
  const key = e.key.toLowerCase();
  
  if (keyMap[key]) {
    // Prevent key repeat triggering multiple note ons
    if (e.repeat) return;
    engine.triggerNoteOn(keyMap[key], 1.0);
    console.log(`Note On: ${keyMap[key]}Hz`, mapper.getComputedFmParams());
  } else if (key === 'e') {
    // Export .m8i
    serializer.downloadM8Instrument('Patch.m8i', mapper.getComputedFmParams());
    console.log('Exported .m8i patch');
  }
});

window.addEventListener('keyup', (e) => {
  const key = e.key.toLowerCase();
  if (keyMap[key]) {
    engine.triggerNoteOff();
    console.log(`Note Off`);
  }
});

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div>
    <h1>M8FM Synth</h1>
    <p id="status">Status: Waiting for input (Press any key to initialize)</p>
    <div style="display:flex; gap: 10px; margin-bottom: 20px;">
      <button id="btn-ep">Electric Piano</button>
      <button id="btn-bass">Sub Bass</button>
      <button id="btn-mallet">Mallet</button>
      <button id="btn-pad">Pad</button>
      <button id="btn-glitch">Digital Glitch</button>
      <button id="btn-vintage">Vintage Lead</button>
    </div>
    
    <div id="macros-container">
      <!-- Dynamic macros will be rendered here -->
    </div>
  </div>
`;

function renderMacros() {
  const container = document.getElementById('macros-container')!;
  container.innerHTML = ''; // clear

  const currentAnchor = mapper.currentAnchor;
  const macros = AnchorMacroConfig[currentAnchor];

  for (const macroName of macros) {
    const label = document.createElement('label');
    label.style.display = 'block';
    label.style.margin = '5px 0';
    label.innerText = `${macroName} `;

    const input = document.createElement('input');
    input.type = 'range';
    input.min = '0';
    input.max = '1';
    input.step = '0.01';
    input.value = '0';
    
    input.addEventListener('input', (e) => {
      if (!isInitialized) init();
      const val = parseFloat((e.target as HTMLInputElement).value);
      mapper.setMacro(macroName, val);
      applyParamsToEngine();
    });

    label.appendChild(input);
    container.appendChild(label);
  }
}

// Hook up UI
const anchors = {
  'btn-ep': 'Electric Piano',
  'btn-bass': 'Sub Bass',
  'btn-mallet': 'Mallet',
  'btn-pad': 'Pad',
  'btn-glitch': 'Digital Glitch',
  'btn-vintage': 'Vintage Lead'
};

for (const [id, anchor] of Object.entries(anchors)) {
  document.getElementById(id)!.addEventListener('click', () => {
    if (!isInitialized) init();
    mapper.loadAnchor(anchor as AnchorName);
    renderMacros();
    applyParamsToEngine();
    console.log(`Loaded Anchor: ${anchor}`);
  });
}

// Initial render
renderMacros();
