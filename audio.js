class AudioManager {
    constructor() {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = 0.3; // Default volume
        this.masterGain.connect(this.ctx.destination);
        
        this.bgmGain = this.ctx.createGain();
        this.bgmGain.gain.value = 0.4;
        this.bgmGain.connect(this.masterGain);
        
        this.sfxGain = this.ctx.createGain();
        this.sfxGain.gain.value = 0.6;
        this.sfxGain.connect(this.masterGain);

        this.currentBgmOscillators = [];
        this.bgmInterval = null;
        this.isPlayingBgm = false;
        
        // Track notes for melodies
        this.noteMap = {
            'C3': 130.81, 'C#3': 138.59, 'D3': 146.83, 'D#3': 155.56, 'E3': 164.81, 'F3': 174.61, 'F#3': 185.00, 'G3': 196.00, 'G#3': 207.65, 'A3': 220.00, 'A#3': 233.08, 'B3': 246.94,
            'C4': 261.63, 'C#4': 277.18, 'D4': 293.66, 'D#4': 311.13, 'E4': 329.63, 'F4': 349.23, 'F#4': 369.99, 'G4': 392.00, 'G#4': 415.30, 'A4': 440.00, 'A#4': 466.16, 'B4': 493.88,
            'C5': 523.25, 'C#5': 554.37, 'D5': 587.33, 'D#5': 622.25, 'E5': 659.25, 'F5': 698.46, 'F#5': 739.99, 'G5': 783.99, 'G#5': 830.61, 'A5': 880.00, 'A#5': 932.33, 'B5': 987.77
        };
        
        this.bgmTracks = {
            'menu': [
                { note: 'A3', dur: 0.8 }, { note: 'B3', dur: 0.4 }, { note: 'C4', dur: 0.4 }, { note: 'E4', dur: 1.6 },
                { note: 'F4', dur: 0.8 }, { note: 'E4', dur: 0.8 }, { note: 'C4', dur: 0.8 }, { note: 'B3', dur: 0.8 },
                { note: 'A3', dur: 1.6 }, { note: 'A3', dur: 0.4 }, { note: 'B3', dur: 0.4 }, { note: 'C4', dur: 0.8 },
                { note: 'A4', dur: 1.6 }, { note: 'G4', dur: 0.8 }, { note: 'F4', dur: 0.8 }, { note: 'E4', dur: 2.4 }
            ],
            'combat1': [ // Sentinela - Pesado e Ritmico
                { note: 'E3', dur: 0.25 }, { note: 'E3', dur: 0.25 }, { note: 'G3', dur: 0.25 }, { note: 'E3', dur: 0.25 },
                { note: 'A3', dur: 0.25 }, { note: 'E3', dur: 0.25 }, { note: 'B3', dur: 0.5 },
                { note: 'E3', dur: 0.25 }, { note: 'E3', dur: 0.25 }, { note: 'G3', dur: 0.25 }, { note: 'E3', dur: 0.25 },
                { note: 'D3', dur: 0.5 }, { note: 'E3', dur: 0.5 },
                { note: 'C4', dur: 0.25 }, { note: 'B3', dur: 0.25 }, { note: 'A3', dur: 0.25 }, { note: 'G3', dur: 0.25 },
                { note: 'F#3', dur: 0.5 }, { note: 'E3', dur: 0.5 }
            ],
            'combat2': [ // Duelista - Rapido e Frenético (Melodia complexa)
                { note: 'D4', dur: 0.15 }, { note: 'F4', dur: 0.15 }, { note: 'A4', dur: 0.15 }, { note: 'D5', dur: 0.3 },
                { note: 'C5', dur: 0.15 }, { note: 'A4', dur: 0.15 }, { note: 'F4', dur: 0.15 }, { note: 'G4', dur: 0.3 },
                { note: 'A4', dur: 0.15 }, { note: 'C5', dur: 0.15 }, { note: 'D5', dur: 0.3 }, { note: 'F5', dur: 0.3 },
                { note: 'E5', dur: 0.15 }, { note: 'C5', dur: 0.15 }, { note: 'A4', dur: 0.3 }, { note: 'G4', dur: 0.3 },
                { note: 'F4', dur: 0.15 }, { note: 'E4', dur: 0.15 }, { note: 'D4', dur: 0.6 }
            ],
            'combat3': [ // Shogun - Dramático e Lento, notas marcantes
                { note: 'A3', dur: 0.5 }, { note: 'C4', dur: 0.5 }, { note: 'E4', dur: 1.0 },
                { note: 'F4', dur: 0.5 }, { note: 'E4', dur: 0.5 }, { note: 'C4', dur: 1.0 },
                { note: 'B3', dur: 0.5 }, { note: 'A3', dur: 0.5 }, { note: 'G#3', dur: 1.0 },
                { note: 'E3', dur: 1.0 }, { note: 'G#3', dur: 0.5 }, { note: 'A3', dur: 1.5 },
                { note: 'A4', dur: 0.5 }, { note: 'G#4', dur: 0.5 }, { note: 'F4', dur: 0.5 }, { note: 'E4', dur: 1.5 },
                { note: 'D4', dur: 0.5 }, { note: 'C4', dur: 0.5 }, { note: 'B3', dur: 0.5 }, { note: 'A3', dur: 1.5 }
            ],
            'ending': [ // Fim das Sombras - Pacífico e Emocionante
                { note: 'C4', dur: 0.8 }, { note: 'D4', dur: 0.4 }, { note: 'E4', dur: 1.2 },
                { note: 'G4', dur: 0.8 }, { note: 'F4', dur: 0.4 }, { note: 'E4', dur: 0.4 }, { note: 'D4', dur: 0.8 },
                { note: 'C4', dur: 0.8 }, { note: 'A3', dur: 0.4 }, { note: 'C4', dur: 1.2 },
                { note: 'G4', dur: 1.2 }, { note: 'E4', dur: 1.2 },
                { note: 'C5', dur: 1.6 }, { note: 'B4', dur: 0.8 }, { note: 'A4', dur: 0.8 }, { note: 'G4', dur: 1.6 },
                { note: 'E4', dur: 0.8 }, { note: 'D4', dur: 0.8 }, { note: 'C4', dur: 2.4 }
            ]
        };
    }

    init() {
        if(this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    // --- SOUND EFFECTS ---
    playTone(freq, type, duration, vol=1.0) {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        
        osc.type = type;
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
        
        gain.gain.setValueAtTime(vol, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);
        
        osc.connect(gain);
        gain.connect(this.sfxGain);
        
        osc.start();
        osc.stop(this.ctx.currentTime + duration);
    }
    
    playNoise(duration, vol=1.0) {
        if (!this.ctx) return;
        const bufferSize = this.ctx.sampleRate * duration;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        
        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;
        const gain = this.ctx.createGain();
        
        // Lowpass filter para soar mais "retro hit" em vez de chiado de TV
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 1000;
        
        gain.gain.setValueAtTime(vol, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);
        
        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.sfxGain);
        
        noise.start();
    }

    playSfx(type) {
        if(this.ctx.state === 'suspended') return;
        
        switch(type) {
            case 'swing_light':
                this.playTone(300, 'sine', 0.1, 0.3);
                this.playTone(800, 'triangle', 0.1, 0.1);
                setTimeout(() => this.playTone(200, 'sine', 0.1, 0.2), 50);
                break;
            case 'swing_heavy':
                this.playTone(150, 'sawtooth', 0.2, 0.4);
                this.playTone(100, 'square', 0.3, 0.2);
                break;
            case 'hit':
                this.playNoise(0.15, 0.8);
                this.playTone(100, 'sawtooth', 0.1, 0.6);
                break;
            case 'parry':
                this.playTone(1200, 'triangle', 0.1, 0.5);
                this.playTone(1800, 'sine', 0.2, 0.6);
                setTimeout(() => this.playTone(1400, 'sine', 0.3, 0.3), 50);
                break;
            case 'block':
                this.playNoise(0.1, 0.3);
                this.playTone(150, 'square', 0.1, 0.4);
                break;
            case 'dodge':
                this.playTone(200, 'sine', 0.15, 0.4);
                setTimeout(() => this.playTone(300, 'sine', 0.1, 0.2), 50);
                break;
            case 'jump':
                this.playTone(300, 'square', 0.1, 0.2);
                setTimeout(() => this.playTone(400, 'square', 0.15, 0.2), 50);
                break;
            case 'die':
                this.playTone(100, 'sawtooth', 0.6, 0.6);
                setTimeout(() => this.playTone(70, 'sawtooth', 0.8, 0.7), 200);
                break;
            case 'select':
                this.playTone(600, 'square', 0.1, 0.3);
                break;
            case 'start':
                this.playTone(400, 'square', 0.1, 0.5);
                setTimeout(() => this.playTone(600, 'square', 0.2, 0.5), 100);
                setTimeout(() => this.playTone(800, 'square', 0.4, 0.6), 200);
                break;
            case 'dialog':
                const freq = 300 + Math.random() * 200;
                this.playTone(freq, 'triangle', 0.05, 0.1);
                break;
        }
    }

    // --- BACKGROUND MUSIC ---
    stopBgm() {
        this.isPlayingBgm = false;
        clearInterval(this.bgmInterval);
        this.currentBgmOscillators.forEach(osc => {
            try { osc.stop(); } catch(e) {}
        });
        this.currentBgmOscillators = [];
    }

    playBgm(trackName) {
        if(this.ctx.state === 'suspended') return;
        this.stopBgm();
        
        const track = this.bgmTracks[trackName];
        if (!track) return;

        this.isPlayingBgm = true;
        let noteIndex = 0;
        let tempoMultiplier = trackName === 'combat2' ? 0.8 : 1.0; // Combat 2 is faster
        
        const playNextNote = () => {
            if (!this.isPlayingBgm) return;
            
            const noteData = track[noteIndex];
            const freq = this.noteMap[noteData.note];
            const dur = noteData.dur * tempoMultiplier;
            
            // Synth sound
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            
            // Timbre based on track
            if (trackName.includes('combat')) osc.type = 'square';
            else osc.type = 'triangle';
            
            osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
            
            // Envelope
            gain.gain.setValueAtTime(0, this.ctx.currentTime);
            gain.gain.linearRampToValueAtTime(0.3, this.ctx.currentTime + 0.05); // Attack
            gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + dur - 0.05); // Decay/Release
            
            osc.connect(gain);
            gain.connect(this.bgmGain);
            
            osc.start();
            osc.stop(this.ctx.currentTime + dur);
            
            this.currentBgmOscillators.push(osc);
            
            // Cleanup array
            setTimeout(() => {
                const idx = this.currentBgmOscillators.indexOf(osc);
                if(idx > -1) this.currentBgmOscillators.splice(idx, 1);
            }, dur * 1000);
            
            noteIndex = (noteIndex + 1) % track.length;
            this.bgmInterval = setTimeout(playNextNote, dur * 1000);
        };
        
        playNextNote();
    }
}

// Global instance
window.audioManager = new AudioManager();
