// Canvas references and core drawing context.
const canvas = document.getElementById('drawingCanvas');
const ctx = canvas.getContext('2d');
const clearBtn = document.getElementById('clearBtn');

// Web Audio root context.
const audioContext = new (window.AudioContext || window.webkitAudioContext)();

// Analyser used by waveform drawing mode.
const analyserNode = audioContext.createAnalyser();
analyserNode.fftSize = 256;
analyserNode.smoothingTimeConstant = 0;
const waveformData = new Uint8Array(analyserNode.fftSize);

// Instrument presets that define timbre, frequency range, and color.
const instruments = {
    bass: {
        type: 'sine',
        minFreq: 40,
        maxFreq: 200,
        gainMin: 0.15,
        gainMax: 0.3,
        color: '#ff3333'
    },
    piano: {
        type: 'triangle',
        minFreq: 100,
        maxFreq: 600,
        gainMin: 0.08,
        gainMax: 0.15,
        color: '#3366ff'
    },
    synth: {
        type: 'square',
        minFreq: 200,
        maxFreq: 1200,
        gainMin: 0.1,
        gainMax: 0.2,
        color: '#ffff00'
    }
};

// Active instrument and nodes used for the currently playing stroke.
let currentInstrument = 'bass';
let oscillator = null;
let gainNode = null;
let delayNode = null;
let feedbackGainNode = null;
let filterNode = null;

// Pointer and stroke tracking state.
let isDrawing = false;
let lastX = 0;
let lastY = 0;
let lastTime = 0;

// Animation frame IDs for visual effects.
let fadeOutAnimationId = null;
let particleAnimationId = null;

// Effect toggles controlled from UI buttons.
let fadeOutEnabled = true;
let echoEnabled = true;
let speedEffectEnabled = true;
let magneticMode = false;
let mirrorMode = false;
let oscillogramMode = false;

// Shared effect containers.
let mirrorOscillators = [];
let magneticPoints = [];
let particles = [];

// Looper state machine and playback bookkeeping.
let looperState = 'idle'; // 'idle' | 'recording' | 'looping'
let looperActions = [];
let looperRecordStart = 0;
let looperCountdownInterval = null;
let looperRecordTimeout = null;
let loopTimeouts = [];
let isLooping = false;
let looperDrawing = false;
let looperLastX = 0;
let looperLastY = 0;
let looperOscillator = null;
let looperGainNode = null;
let looperFilterNode = null;
let looperMirrorOscs = [];

// Explosion effect state.
let shakeAnimationId = null;
let shakeParticles = [];
let lastShakeTime = 0;

// Atmosphere (ambient layer) state.
let atmosphereEnabled = false;
let atmosphereNodes = null;
let atmosphereCoverage = 0;
let atmosphereIntervalId = null;

// Low-resolution offscreen canvas used to estimate painted coverage fast.
const atmosphereOffscreen = document.createElement('canvas');
atmosphereOffscreen.width = 120;
atmosphereOffscreen.height = 75;
const atmosphereOffCtx = atmosphereOffscreen.getContext('2d', { willReadFrequently: true });

// Magnetic mode tuning constants.
const PARTICLE_COUNT_PER_POINT = 12;
const PARTICLE_ORBIT_RADIUS = 80;
const PARTICLE_SPEED = 0.02;

// Creates a layered ambient soundscape used by Atmosphere mode.
function initAtmosphereNodes() {
    const master = audioContext.createGain();
    master.gain.value = 0;
    master.connect(audioContext.destination);

    // Sub drone: deep sine, always present at low level
    const subOsc = audioContext.createOscillator();
    const subGain = audioContext.createGain();
    subOsc.type = 'sine';
    subOsc.frequency.value = 42;
    subGain.gain.value = 0.55;
    subOsc.connect(subGain);
    subGain.connect(master);
    subOsc.start();

    // Mid breath: detuned sawtooth -> lowpass filter with slow LFO
    const midOsc = audioContext.createOscillator();
    const midGain = audioContext.createGain();
    const midFilter = audioContext.createBiquadFilter();
    midFilter.type = 'lowpass';
    midFilter.frequency.value = 280;
    midFilter.Q.value = 4;
    midOsc.type = 'sawtooth';
    midOsc.frequency.value = 84;
    midOsc.detune.value = -14;
    midGain.gain.value = 0.3;
    const lfo = audioContext.createOscillator();
    const lfoGain = audioContext.createGain();
    lfo.type = 'sine';
    lfo.frequency.value = 0.17;
    lfoGain.gain.value = 150;
    lfo.connect(lfoGain);
    lfoGain.connect(midFilter.frequency);
    lfo.start();
    midOsc.connect(midFilter);
    midFilter.connect(midGain);
    midGain.connect(master);
    midOsc.start();

    // Shimmer layer: bandpass sine, appears above 20% coverage
    const shimOsc = audioContext.createOscillator();
    const shimGain = audioContext.createGain();
    const shimFilter = audioContext.createBiquadFilter();
    shimFilter.type = 'bandpass';
    shimFilter.frequency.value = 440;
    shimFilter.Q.value = 6;
    shimOsc.type = 'sine';
    shimOsc.frequency.value = 220;
    shimGain.gain.value = 0;
    shimOsc.connect(shimFilter);
    shimFilter.connect(shimGain);
    shimGain.connect(master);
    shimOsc.start();

    // Second shimmer harmonic (a fifth above), appears above 50% coverage
    const shim2Osc = audioContext.createOscillator();
    const shim2Gain = audioContext.createGain();
    shim2Osc.type = 'triangle';
    shim2Osc.frequency.value = 330;
    shim2Gain.gain.value = 0;
    shim2Osc.connect(shim2Gain);
    shim2Gain.connect(master);
    shim2Osc.start();

    return { master, subOsc, midOsc, midFilter, lfo, shimOsc, shimGain, shimFilter, shim2Osc, shim2Gain };
}

// Smoothly fades and stops all Atmosphere oscillators.
function stopAtmosphereNodes() {
    if (!atmosphereNodes) return;
    const { master, subOsc, midOsc, lfo, shimOsc, shim2Osc } = atmosphereNodes;
    master.gain.setTargetAtTime(0, audioContext.currentTime, 0.4);
    setTimeout(() => {
        [subOsc, midOsc, lfo, shimOsc, shim2Osc].forEach((n) => { try { n.stop(); } catch (e) {} });
    }, 1200);
    atmosphereNodes = null;
}

// Computes how much of the canvas differs from the dark background.
function measurePaintCoverage() {
    atmosphereOffCtx.clearRect(0, 0, 120, 75);
    atmosphereOffCtx.drawImage(canvas, 0, 0, 120, 75);
    const data = atmosphereOffCtx.getImageData(0, 0, 120, 75).data;
    const bgR = 10, bgG = 14, bgB = 39;
    let painted = 0;
    for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] > 20 &&
            Math.abs(data[i] - bgR) + Math.abs(data[i + 1] - bgG) + Math.abs(data[i + 2] - bgB) > 30) {
            painted++;
        }
    }
    return painted / (120 * 75);
}

// Maps canvas coverage to ambient synthesis parameters.
function updateAtmosphereTick() {
    if (!atmosphereEnabled || !atmosphereNodes) return;
    const raw = measurePaintCoverage();
    atmosphereCoverage += (raw - atmosphereCoverage) * 0.18;
    const c = atmosphereCoverage;
    const { master, subOsc, midOsc, midFilter, shimOsc, shimGain, shimFilter, shim2Osc, shim2Gain } = atmosphereNodes;
    const t = audioContext.currentTime;

    // Master breathes from a quiet floor up to 0.13 at full coverage
    master.gain.setTargetAtTime(0.012 + c * 0.12, t, 0.9);

    // Drone descends in pitch slightly as coverage grows (heavier atmosphere)
    subOsc.frequency.setTargetAtTime(38 + c * 30, t, 2.0);

    // Filter opens up - sparse canvas sounds tight/dark, full canvas sounds airy
    midFilter.frequency.setTargetAtTime(180 + c * 1800, t, 1.5);

    // Shimmer fades in above 20% coverage
    const shimTarget = Math.max(0, (c - 0.2) / 0.8) * 0.16;
    shimGain.gain.setTargetAtTime(shimTarget, t, 1.8);
    shimOsc.frequency.setTargetAtTime(170 + c * 380, t, 2.5);
    shimFilter.frequency.setTargetAtTime(170 + c * 380, t, 2.5);

    // Second harmonic above 50%
    const shim2Target = Math.max(0, (c - 0.5) / 0.5) * 0.1;
    shim2Gain.gain.setTargetAtTime(shim2Target, t, 2.0);
    shim2Osc.frequency.setTargetAtTime(250 + c * 320, t, 3.0);
}

// Keeps canvas internal resolution in sync with viewport size.
function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}

// Returns currently selected instrument configuration.
function getInstrumentConfig() {
    return instruments[currentInstrument];
}

// Converts Y coordinate to pitch (top is high, bottom is low).
function getPitchFromY(y, config = getInstrumentConfig()) {
    const range = config.maxFreq - config.minFreq;
    return config.maxFreq - (y / window.innerHeight) * range;
}

// Connects a source to destination, plus optional feedback delay (echo).
function connectEcho(source) {
    source.connect(audioContext.destination);

    if (!echoEnabled) {
        return;
    }

    delayNode = audioContext.createDelay(5.0);
    feedbackGainNode = audioContext.createGain();
    delayNode.delayTime.value = 0.3;
    feedbackGainNode.gain.value = 0.4;

    source.connect(delayNode);
    delayNode.connect(feedbackGainNode);
    feedbackGainNode.connect(delayNode);
    delayNode.connect(audioContext.destination);
}

// Starts main oscillator chain for free drawing mode.
function startSound() {
    if (oscillator) {
        return;
    }

    const config = getInstrumentConfig();
    oscillator = audioContext.createOscillator();
    gainNode = audioContext.createGain();
    filterNode = audioContext.createBiquadFilter();

    oscillator.type = config.type;
    oscillator.frequency.value = (config.minFreq + config.maxFreq) / 2;

    filterNode.type = 'highpass';
    filterNode.frequency.value = 200;
    filterNode.Q.value = 1;

    gainNode.gain.setValueAtTime(config.gainMin, audioContext.currentTime);

    oscillator.connect(filterNode);
    oscillator.connect(analyserNode);
    filterNode.connect(gainNode);
    connectEcho(gainNode);
    oscillator.start();
}

// Stops and releases the main drawing audio chain.
function stopSound() {
    if (!oscillator) {
        return;
    }

    oscillator.stop();
    oscillator.disconnect();
    oscillator = null;
    gainNode = null;
    filterNode = null;
    delayNode = null;
    feedbackGainNode = null;
}

// Updates frequency and loudness from pointer vertical position.
function updatePitch(y) {
    if (!oscillator || !gainNode) {
        return;
    }

    const config = getInstrumentConfig();
    const frequency = getPitchFromY(y, config);
    const gain = config.gainMax - (y / window.innerHeight) * (config.gainMax - config.gainMin);

    oscillator.frequency.setTargetAtTime(frequency, audioContext.currentTime, 0.01);
    gainNode.gain.setTargetAtTime(gain, audioContext.currentTime, 0.01);
}

// Applies speed-reactive timbre/gain changes while drawing.
function updateSpeedEffect(speed) {
    if (!speedEffectEnabled || !oscillator || !gainNode || !filterNode) {
        return;
    }

    const config = getInstrumentConfig();
    const normalizedSpeed = Math.min(speed / 500, 1);
    const speedGain = config.gainMin + (config.gainMax - config.gainMin) * normalizedSpeed * 0.5;
    const filterFreq = 100 + normalizedSpeed * 2000;

    gainNode.gain.setTargetAtTime(speedGain, audioContext.currentTime, 0.02);
    filterNode.frequency.setTargetAtTime(filterFreq, audioContext.currentTime, 0.02);
}

// Starts slow visual fade by repeatedly overlaying a translucent background.
function startFadeOut() {
    if (fadeOutAnimationId || !fadeOutEnabled) {
        return;
    }

    function fadeOutLoop() {
        ctx.fillStyle = 'rgba(10, 14, 39, 0.08)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        fadeOutAnimationId = requestAnimationFrame(fadeOutLoop);
    }

    fadeOutAnimationId = requestAnimationFrame(fadeOutLoop);
}

// Stops the fade animation loop.
function stopFadeOut() {
    if (!fadeOutAnimationId) {
        return;
    }

    cancelAnimationFrame(fadeOutAnimationId);
    fadeOutAnimationId = null;
}

// Draws either a normal stroke or a waveform-deformed stroke.
function drawLine(x1, y1, x2, y2) {
    if (!oscillogramMode) {
        const color = getInstrumentConfig().color;
        const gradient = ctx.createLinearGradient(x1, y1, x2, y2);
        gradient.addColorStop(0, color);
        gradient.addColorStop(1, color);
        ctx.strokeStyle = gradient;
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        return;
    }

    analyserNode.getByteTimeDomainData(waveformData);

    const color = getInstrumentConfig().color;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy);

    if (len < 0.5) return;

    const invLen = 1 / len;
    const perpX = -dy * invLen;
    const perpY = dx * invLen;
    const steps = Math.max(8, Math.floor(len));
    const maxAmplitude = 13;

    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.shadowColor = color;
    ctx.shadowBlur = 8;
    ctx.beginPath();

    for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const sampleIndex = Math.floor(t * (waveformData.length - 1));
        const amplitude = ((waveformData[sampleIndex] - 128) / 128) * maxAmplitude;
        const px = x1 + t * dx + perpX * amplitude;
        const py = y1 + t * dy + perpY * amplitude;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
    }

    ctx.stroke();
    ctx.shadowBlur = 0;
}

// Draws the same segment mirrored across horizontal and vertical center axes.
function drawReflectedLine(x1, y1, x2, y2) {
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;

    drawLine(x1, y1, x2, y2);
    drawLine(x1, centerY * 2 - y1, x2, centerY * 2 - y2);
    drawLine(centerX * 2 - x1, y1, centerX * 2 - x2, y2);
    drawLine(centerX * 2 - x1, centerY * 2 - y1, centerX * 2 - x2, centerY * 2 - y2);
}

// Starts a mirrored chord from current Y pitch.
function playMirrorChord(y) {
    const config = getInstrumentConfig();
    const baseFreq = getPitchFromY(y, config);
    const frequencies = [baseFreq, baseFreq * 1.2, baseFreq * 1.5, baseFreq * 2];

    stopMirrorChord();

    frequencies.forEach((frequency) => {
        const osc = audioContext.createOscillator();
        const gain = audioContext.createGain();

        osc.type = config.type;
        osc.frequency.value = frequency;
        gain.gain.setValueAtTime(config.gainMin / 2, audioContext.currentTime);

        osc.connect(gain);
        osc.connect(analyserNode);
        connectEcho(gain);
        osc.start();
        mirrorOscillators.push({ osc, gain });
    });
}

// Retunes active mirror chord voices.
function updateMirrorChord(y) {
    if (mirrorOscillators.length === 0) {
        return;
    }

    const config = getInstrumentConfig();
    const baseFreq = getPitchFromY(y, config);
    const frequencies = [baseFreq, baseFreq * 1.2, baseFreq * 1.5, baseFreq * 2];

    mirrorOscillators.forEach((item, index) => {
        item.osc.frequency.setTargetAtTime(frequencies[index], audioContext.currentTime, 0.01);
    });
}

// Stops all mirror chord oscillators.
function stopMirrorChord() {
    mirrorOscillators.forEach((item) => item.osc.stop());
    mirrorOscillators = [];
}

// Looper-only sound start (separate from live drawing chain).
function looperStartSound(y) {
    if (looperOscillator) return;
    const config = getInstrumentConfig();
    looperOscillator = audioContext.createOscillator();
    looperGainNode = audioContext.createGain();
    looperFilterNode = audioContext.createBiquadFilter();
    looperOscillator.type = config.type;
    looperOscillator.frequency.value = getPitchFromY(y, config);
    looperFilterNode.type = 'highpass';
    looperFilterNode.frequency.value = 200;
    looperFilterNode.Q.value = 1;
    looperGainNode.gain.setValueAtTime(config.gainMin, audioContext.currentTime);
    looperOscillator.connect(looperFilterNode);
    looperOscillator.connect(analyserNode);
    looperFilterNode.connect(looperGainNode);
    connectEcho(looperGainNode);
    looperOscillator.start();
}

// Looper-only sound stop and cleanup.
function looperStopSound() {
    if (looperOscillator) {
        looperOscillator.stop();
        looperOscillator.disconnect();
        looperOscillator = null;
        looperGainNode = null;
        looperFilterNode = null;
    }
    looperMirrorOscs.forEach((item) => item.osc.stop());
    looperMirrorOscs = [];
}

// Updates looper oscillator from pointer Y.
function looperUpdatePitch(y) {
    if (!looperOscillator || !looperGainNode) return;
    const config = getInstrumentConfig();
    const frequency = getPitchFromY(y, config);
    const gain = config.gainMax - (y / window.innerHeight) * (config.gainMax - config.gainMin);
    looperOscillator.frequency.setTargetAtTime(frequency, audioContext.currentTime, 0.01);
    looperGainNode.gain.setTargetAtTime(gain, audioContext.currentTime, 0.01);
}

// Starts looper mirror chord voices.
function looperPlayMirrorChord(y) {
    const config = getInstrumentConfig();
    const baseFreq = getPitchFromY(y, config);
    const frequencies = [baseFreq, baseFreq * 1.2, baseFreq * 1.5, baseFreq * 2];
    looperMirrorOscs.forEach((item) => item.osc.stop());
    looperMirrorOscs = [];
    frequencies.forEach((freq) => {
        const osc = audioContext.createOscillator();
        const gain = audioContext.createGain();
        osc.type = config.type;
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(config.gainMin / 2, audioContext.currentTime);
        osc.connect(gain);
        osc.connect(analyserNode);
        connectEcho(gain);
        osc.start();
        looperMirrorOscs.push({ osc, gain });
    });
}

// Retunes looper mirror chord voices.
function looperUpdateMirrorChord(y) {
    if (looperMirrorOscs.length === 0) return;
    const config = getInstrumentConfig();
    const baseFreq = getPitchFromY(y, config);
    const frequencies = [baseFreq, baseFreq * 1.2, baseFreq * 1.5, baseFreq * 2];
    looperMirrorOscs.forEach((item, index) => {
        item.osc.frequency.setTargetAtTime(frequencies[index], audioContext.currentTime, 0.01);
    });
}

// Schedules one 5-second loop pass from recorded actions.
function scheduleLoop() {
    if (!isLooping || looperActions.length === 0) return;
    looperActions.forEach((action) => {
        const t = setTimeout(() => replayAction(action), action.time);
        loopTimeouts.push(t);
    });
    const t = setTimeout(() => {
        if (isLooping) {
            looperStopSound();
            looperDrawing = false;
            scheduleLoop();
        }
    }, 5000);
    loopTimeouts.push(t);
}

// Stops loop playback and clears all pending timers.
function stopLoop() {
    isLooping = false;
    loopTimeouts.forEach((t) => clearTimeout(t));
    loopTimeouts = [];
    looperStopSound();
    looperDrawing = false;
}

// Replays one recorded looper action (down/move/up).
function replayAction(action) {
    if (!isLooping) return;
    const savedInstrument = currentInstrument;
    currentInstrument = action.instrument;
    if (action.type === 'down') {
        looperDrawing = true;
        looperLastX = action.x;
        looperLastY = action.y;
        if (action.mirror) {
            looperPlayMirrorChord(action.y);
        } else {
            looperStartSound(action.y);
        }
        looperUpdatePitch(action.y);
    } else if (action.type === 'move' && looperDrawing) {
        if (action.mirror) {
            looperUpdateMirrorChord(action.y);
            drawReflectedLine(looperLastX, looperLastY, action.x, action.y);
        } else {
            looperUpdatePitch(action.y);
            drawLine(looperLastX, looperLastY, action.x, action.y);
        }
        looperLastX = action.x;
        looperLastY = action.y;
    } else if (action.type === 'up') {
        looperDrawing = false;
        looperStopSound();
    }
    currentInstrument = savedInstrument;
}

// Converts existing drawing into an outward spark explosion animation.
function triggerShake() {
    if (shakeAnimationId) return;

    const btn = document.getElementById('shakeBtn');

    // stop any active drawing/sound
    isDrawing = false;
    stopSound();
    stopMirrorChord();
    stopFadeOut();

    // fade out looper sound too
    if (looperOscillator && looperGainNode) {
        looperGainNode.gain.setTargetAtTime(0, audioContext.currentTime, 0.15);
    }
    looperMirrorOscs.forEach((item) => item.gain.gain.setTargetAtTime(0, audioContext.currentTime, 0.15));

    // sample canvas pixels and build spark particles
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    shakeParticles = [];
    const step = 8;
    const bgR = 10, bgG = 14, bgB = 39;

    for (let py = 0; py < canvas.height; py += step) {
        for (let px = 0; px < canvas.width; px += step) {
            const i = (py * canvas.width + px) * 4;
            const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
            const colorDist = Math.abs(r - bgR) + Math.abs(g - bgG) + Math.abs(b - bgB);
            if (a > 40 && colorDist > 35 && Math.random() < 0.5) {
                const centerX = canvas.width / 2;
                const centerY = canvas.height / 2;
                const angle = Math.atan2(py - centerY, px - centerX) + (Math.random() - 0.5) * 1.2;
                const speed = 1.5 + Math.random() * 9;
                shakeParticles.push({
                    x: px, y: py,
                    vx: Math.cos(angle) * speed,
                    vy: Math.sin(angle) * speed - Math.random() * 2,
                    r, g, b,
                    origAlpha: a / 255,
                    size: 1.5 + Math.random() * 2.5
                });
            }
        }
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    clearMagneticPoints();
    btn.classList.add('exploding');

    const startTime = performance.now();
    const duration = 1600;

    function animateSparks(now) {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 2);

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        shakeParticles.forEach((p) => {
            p.x += p.vx;
            p.y += p.vy;
            p.vy += 0.18;
            p.vx *= 0.985;
            const alpha = p.origAlpha * (1 - eased);
            ctx.globalAlpha = alpha;
            ctx.fillStyle = `rgb(${p.r},${p.g},${p.b})`;
            ctx.shadowColor = `rgb(${p.r},${p.g},${p.b})`;
            ctx.shadowBlur = 4;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
        });

        ctx.globalAlpha = 1;
        ctx.shadowBlur = 0;

        if (progress < 1) {
            shakeAnimationId = requestAnimationFrame(animateSparks);
        } else {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            shakeParticles = [];
            shakeAnimationId = null;
            btn.classList.remove('exploding');
        }
    }

    shakeAnimationId = requestAnimationFrame(animateSparks);
}

// Anchor point used by Magnetic mode to emit orbiting particles.
class MagneticPoint {
    constructor(x, y, instrumentKey) {
        this.x = x;
        this.y = y;
        this.instrumentKey = instrumentKey;
        this.color = instruments[instrumentKey].color;
    }

    draw() {
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, 8, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = this.color + '40';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(this.x, this.y, 50, 0, Math.PI * 2);
        ctx.stroke();
    }
}

// Orbiting particle that periodically triggers a short note.
class Particle {
    constructor(point, index) {
        this.point = point;
        this.index = index;
        this.angle = (Math.PI * 2 / PARTICLE_COUNT_PER_POINT) * index;
        this.size = 4;
        this.soundTriggered = false;
    }

    getPosition() {
        return {
            x: this.point.x + Math.cos(this.angle) * PARTICLE_ORBIT_RADIUS,
            y: this.point.y + Math.sin(this.angle) * PARTICLE_ORBIT_RADIUS
        };
    }

    update() {
        this.angle += PARTICLE_SPEED;
        const normalizedAngle = (this.angle % (Math.PI * 2)) / (Math.PI * 2);

        if (normalizedAngle > 0.1 && normalizedAngle < 0.15 && !this.soundTriggered) {
            this.playSound();
            this.soundTriggered = true;
        }

        if (normalizedAngle < 0.1) {
            this.soundTriggered = false;
        }
    }

    playSound() {
        const config = instruments[this.point.instrumentKey];
        const ratio = this.index / PARTICLE_COUNT_PER_POINT;
        const osc = audioContext.createOscillator();
        const gain = audioContext.createGain();

        osc.type = config.type;
        osc.frequency.value = config.minFreq + (config.maxFreq - config.minFreq) * ratio;
        gain.gain.setValueAtTime(0.08, audioContext.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);

        osc.connect(gain);
        connectEcho(gain);
        osc.start();
        osc.stop(audioContext.currentTime + 0.3);
    }

    draw() {
        const position = this.getPosition();
        ctx.fillStyle = this.point.color + 'cc';
        ctx.beginPath();
        ctx.arc(position.x, position.y, this.size, 0, Math.PI * 2);
        ctx.fill();
    }
}

// Adds one magnetic point and spawns its particle ring.
function addMagneticPoint(x, y) {
    const point = new MagneticPoint(x, y, currentInstrument);
    magneticPoints.push(point);

    for (let index = 0; index < PARTICLE_COUNT_PER_POINT; index++) {
        particles.push(new Particle(point, index));
    }

    if (!particleAnimationId) {
        startParticleAnimation();
    }
}

// Main animation loop for Magnetic mode.
function startParticleAnimation() {
    function animateParticles() {
        if (!magneticMode || particles.length === 0) {
            particleAnimationId = null;
            return;
        }

        ctx.fillStyle = 'rgba(10, 14, 39, 0.1)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        magneticPoints.forEach((point) => point.draw());
        particles.forEach((particle) => {
            particle.update();
            particle.draw();
        });

        particleAnimationId = requestAnimationFrame(animateParticles);
    }

    particleAnimationId = requestAnimationFrame(animateParticles);
}

// Clears all magnetic points/particles and stops their loop.
function clearMagneticPoints() {
    magneticPoints = [];
    particles = [];
    if (particleAnimationId) {
        cancelAnimationFrame(particleAnimationId);
        particleAnimationId = null;
    }
}

// Updates visual active state for instrument selector buttons.
function updateInstrumentButtons(activeButton) {
    document.querySelectorAll('.instrument-btn').forEach((button) => button.classList.remove('active'));
    activeButton.classList.add('active');
}

// Pointer down starts drawing/audio and optionally records looper action.
canvas.addEventListener('mousedown', async (event) => {
    if (audioContext.state === 'suspended') {
        await audioContext.resume();
    }

    isDrawing = true;
    lastX = event.offsetX;
    lastY = event.offsetY;
    lastTime = performance.now();

    if (mirrorMode) {
        playMirrorChord(lastY);
    } else {
        startSound();
    }

    startFadeOut();
    updatePitch(lastY);

    if (looperState === 'recording') {
        looperActions.push({ type: 'down', x: lastX, y: lastY, time: performance.now() - looperRecordStart, instrument: currentInstrument, mirror: mirrorMode });
    }
});

// Pointer move updates audio parameters and draws next segment.
canvas.addEventListener('mousemove', (event) => {
    if (!isDrawing) {
        return;
    }

    const x = event.offsetX;
    const y = event.offsetY;
    const now = performance.now();
    let speed = 0;

    if (lastTime > 0) {
        const dx = x - lastX;
        const dy = y - lastY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const delta = Math.max(now - lastTime, 1);
        speed = (distance / delta) * 1000;
    }

    lastTime = now;
    updatePitch(y);
    updateSpeedEffect(speed);

    if (mirrorMode) {
        updateMirrorChord(y);
        drawReflectedLine(lastX, lastY, x, y);
    } else {
        drawLine(lastX, lastY, x, y);
    }

    lastX = x;
    lastY = y;

    if (looperState === 'recording') {
        looperActions.push({ type: 'move', x, y, time: performance.now() - looperRecordStart, instrument: currentInstrument, mirror: mirrorMode });
    }
});

// Pointer up ends active stroke and records looper release.
canvas.addEventListener('mouseup', () => {
    if (looperState === 'recording' && isDrawing) {
        looperActions.push({ type: 'up', time: performance.now() - looperRecordStart });
    }
    isDrawing = false;
    stopSound();
    stopMirrorChord();
});

// Leaving canvas behaves like releasing pointer and stops fading.
canvas.addEventListener('mouseleave', () => {
    if (looperState === 'recording' && isDrawing) {
        looperActions.push({ type: 'up', time: performance.now() - looperRecordStart });
    }
    isDrawing = false;
    stopSound();
    stopMirrorChord();
    stopFadeOut();
});

// In Magnetic mode, click adds an orbiting point source.
canvas.addEventListener('click', async (event) => {
    if (!magneticMode || isDrawing) {
        return;
    }

    if (audioContext.state === 'suspended') {
        await audioContext.resume();
    }

    const rect = canvas.getBoundingClientRect();
    addMagneticPoint(event.clientX - rect.left, event.clientY - rect.top);
});

// Instrument selection handlers.
document.getElementById('bassBtn').addEventListener('click', (event) => {
    currentInstrument = 'bass';
    updateInstrumentButtons(event.target);
});

document.getElementById('pianoBtn').addEventListener('click', (event) => {
    currentInstrument = 'piano';
    updateInstrumentButtons(event.target);
});

document.getElementById('synthBtn').addEventListener('click', (event) => {
    currentInstrument = 'synth';
    updateInstrumentButtons(event.target);
});

// Effect toggle handlers.
document.getElementById('fadeOutBtn').addEventListener('click', (event) => {
    fadeOutEnabled = !fadeOutEnabled;
    event.target.classList.toggle('active');
    if (!fadeOutEnabled) {
        stopFadeOut();
    }
});

document.getElementById('echoBtn').addEventListener('click', (event) => {
    echoEnabled = !echoEnabled;
    event.target.classList.toggle('active');
});

document.getElementById('speedBtn').addEventListener('click', (event) => {
    speedEffectEnabled = !speedEffectEnabled;
    event.target.classList.toggle('active');
});

document.getElementById('magneticBtn').addEventListener('click', (event) => {
    magneticMode = !magneticMode;
    event.target.classList.toggle('active');
    if (!magneticMode) {
        clearMagneticPoints();
    }
});

document.getElementById('mirrorBtn').addEventListener('click', (event) => {
    mirrorMode = !mirrorMode;
    event.target.classList.toggle('active');
    if (!mirrorMode) {
        stopMirrorChord();
    }
});

document.getElementById('oscillogramBtn').addEventListener('click', (event) => {
    oscillogramMode = !oscillogramMode;
    event.target.classList.toggle('active');
});

// Looper button cycles: idle -> recording -> looping -> idle.
document.getElementById('looperBtn').addEventListener('click', (event) => {
    if (looperState === 'idle') {
        looperState = 'recording';
        looperActions = [];
        looperRecordStart = performance.now();
        let countdown = 5;
        event.target.textContent = `● REC ${countdown}s`;
        event.target.classList.add('recording');
        looperCountdownInterval = setInterval(() => {
            countdown--;
            if (countdown > 0) event.target.textContent = `● REC ${countdown}s`;
        }, 1000);
        looperRecordTimeout = setTimeout(() => {
            clearInterval(looperCountdownInterval);
            if (looperState !== 'recording') return;
            looperState = 'looping';
            isLooping = true;
            event.target.textContent = '⏹ Stop loop';
            event.target.classList.remove('recording');
            event.target.classList.add('active');
            scheduleLoop();
        }, 5000);
    } else if (looperState === 'recording') {
        clearInterval(looperCountdownInterval);
        clearTimeout(looperRecordTimeout);
        looperState = 'idle';
        event.target.textContent = 'Loop';
        event.target.classList.remove('recording');
    } else if (looperState === 'looping') {
        stopLoop();
        looperState = 'idle';
        event.target.textContent = 'Loop';
        event.target.classList.remove('active');
    }
});

// Atmosphere toggle starts/stops ambient synthesis and coverage polling.
document.getElementById('atmosphereBtn').addEventListener('click', async (event) => {
    if (audioContext.state === 'suspended') await audioContext.resume();
    atmosphereEnabled = !atmosphereEnabled;
    event.target.classList.toggle('active');
    if (atmosphereEnabled) {
        atmosphereNodes = initAtmosphereNodes();
        atmosphereCoverage = 0;
        clearInterval(atmosphereIntervalId);
        atmosphereIntervalId = setInterval(updateAtmosphereTick, 600);
        updateAtmosphereTick();
    } else {
        clearInterval(atmosphereIntervalId);
        atmosphereIntervalId = null;
        stopAtmosphereNodes();
    }
});

// Manual explosion trigger.
document.getElementById('shakeBtn').addEventListener('click', () => triggerShake());

// Device shake gesture trigger (for mobile devices with motion sensors).
(() => {
    let lastAccel = { x: 0, y: 0, z: 0 };
    window.addEventListener('devicemotion', (event) => {
        const accel = event.accelerationIncludingGravity;
        if (!accel) return;
        const dx = Math.abs((accel.x || 0) - lastAccel.x);
        const dy = Math.abs((accel.y || 0) - lastAccel.y);
        const dz = Math.abs((accel.z || 0) - lastAccel.z);
        lastAccel = { x: accel.x || 0, y: accel.y || 0, z: accel.z || 0 };
        const now = performance.now();
        if (dx + dy + dz > 35 && now - lastShakeTime > 2000) {
            lastShakeTime = now;
            triggerShake();
        }
    });
})();

// Clear canvas and reset temporary visual systems.
clearBtn.addEventListener('click', () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    clearMagneticPoints();
    stopFadeOut();
});

// Initial bootstrapping.
resizeCanvas();
window.addEventListener('resize', resizeCanvas);
