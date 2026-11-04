// Web Speech API Controller: Recognition (STT) + Synthesis (TTS)
// Fix: Prevents mid-sentence fragmentation, buffers full sentence, debounces execution

export class SpeechController {
  constructor(options = {}) {
    this.selectedLang = options.lang || 'auto';
    this.recognition = null;
    this.isListening = false;
    this.synth = window.speechSynthesis;
    this.fullTranscript = '';
    this.debounceTimer = null;
    this.hasExecuted = false;
    this.onStateChange = options.onStateChange || (() => {});
    this.onTranscript = options.onTranscript || (() => {});
    this.onError = options.onError || (() => {});
    this.initRecognition();
  }

  setLanguage(lang) {
    this.selectedLang = lang;
    if (this.recognition) {
      this.recognition.lang = lang === 'auto' ? 'en-IN' : lang;
    }
  }

  initRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn("Web Speech API not supported in this browser. Fallback text input enabled.");
      return;
    }

    this.recognition = new SpeechRecognition();
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.lang = this.selectedLang === 'auto' ? 'en-IN' : this.selectedLang;

    this.recognition.onstart = () => {
      this.isListening = true;
      this.fullTranscript = '';
      this.hasExecuted = false;
      this.onStateChange('LISTENING');
    };

    this.recognition.onresult = (event) => {
      let finalChunk = '';
      let interimChunk = '';

      for (let i = 0; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalChunk += event.results[i][0].transcript + ' ';
        } else {
          interimChunk += event.results[i][0].transcript + ' ';
        }
      }

      const currentCombined = (finalChunk + interimChunk).trim();
      if (!currentCombined) return;

      this.fullTranscript = currentCombined;

      // Real-time live transcript display in UI
      this.onTranscript({ final: '', interim: currentCombined });

      // Clear any pending debounce timer
      if (this.debounceTimer) {
        clearTimeout(this.debounceTimer);
      }

      // If user paused speaking for 700ms after a finalized chunk, execute the full sentence!
      if (!interimChunk.trim() && finalChunk.trim()) {
        this.debounceTimer = setTimeout(() => {
          this.commitSpeech();
        }, 700);
      } else if (currentCombined.length > 3) {
        // Fallback silence timer: if user stops talking for 1400ms even during interim speech, auto-commit
        this.debounceTimer = setTimeout(() => {
          this.commitSpeech();
        }, 1400);
      }
    };

    this.recognition.onerror = (event) => {
      console.warn("Speech recognition notice/error:", event.error);
      this.isListening = false;
      this.onStateChange('IDLE');
      if (event.error !== 'no-speech') {
        this.onError(event.error);
      }
    };

    this.recognition.onend = () => {
      this.isListening = false;
      this.onStateChange('IDLE');
      this.commitSpeech();
    };
  }

  commitSpeech() {
    if (this.hasExecuted) return;
    const textToCommit = this.fullTranscript.trim();
    if (textToCommit && textToCommit.length > 1) {
      this.hasExecuted = true;
      if (this.recognition && this.isListening) {
        try { this.recognition.stop(); } catch(e) {}
      }
      this.onTranscript({ final: textToCommit, interim: '' });
    }
  }

  startListening() {
    if (!this.recognition) this.initRecognition();
    if (!this.recognition) throw new Error("Speech recognition not supported in this browser.");
    try {
      this.synth.cancel();
      this.fullTranscript = '';
      this.hasExecuted = false;
      if (this.debounceTimer) clearTimeout(this.debounceTimer);
      this.recognition.start();
    } catch (e) {
      console.warn("Recognition already active or restart:", e);
    }
  }

  stopListening() {
    if (this.recognition) {
      try { this.recognition.stop(); } catch(e) {}
      this.isListening = false;
      this.onStateChange('IDLE');
      this.commitSpeech();
    }
  }

  speak(text, detectedLang = 'English') {
    if (!this.synth) return;
    this.synth.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    const voices = this.synth.getVoices();

    let matchedVoice = null;
    if (detectedLang.includes('Hindi')) {
      matchedVoice = voices.find(v => v.lang.includes('hi') || v.name.includes('Hindi') || v.name.includes('Kalpana'));
    } else if (detectedLang.includes('Punjabi')) {
      matchedVoice = voices.find(v => v.lang.includes('pa') || v.name.includes('Punjabi'));
    }
    
    if (!matchedVoice) {
      matchedVoice = voices.find(v => v.lang.includes('en-IN') || v.lang.includes('hi') || v.name.includes('India')) 
        || voices.find(v => v.lang.includes('en-US')) 
        || voices[0];
    }

    if (matchedVoice) {
      utterance.voice = matchedVoice;
    }

    utterance.rate = 1.0;
    utterance.pitch = 1.05;

    utterance.onstart = () => this.onStateChange('SPEAKING');
    utterance.onend = () => {
      this.onStateChange('IDLE');
      if (this.onSpeakingEnd) {
        const cb = this.onSpeakingEnd;
        this.onSpeakingEnd = null;
        setTimeout(() => cb(), 300);
      }
    };
    utterance.onerror = () => this.onStateChange('IDLE');

    this.synth.speak(utterance);
  }
}
