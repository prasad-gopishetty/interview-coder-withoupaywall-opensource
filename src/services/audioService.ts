interface AudioConfig {
  inputDevice: string;
  inputGain: number;
  noiseReduction: boolean;
  voiceActivation: boolean;
  voiceActivationThreshold: number;
  speechProvider: 'whisper' | 'browser';
  language: string;
  autoProcessVoice: boolean;
  showTranscriptionRealTime: boolean;
  enableWaveformVisualization: boolean;
  transcriptionFontSize: 'small' | 'medium' | 'large';
}

interface TranscriptionResult {
  text: string;
  confidence: number;
  language?: string;
  duration?: number;
}

interface RecordingResult {
  success: boolean;
  audioFilePath?: string;
  message?: string;
}

export class AudioService {
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private isRecording: boolean = false;
  private stream: MediaStream | null = null;
  
  constructor() {
    // Ensure we have access to electron APIs
    if (typeof window !== 'undefined' && window.electronAPI) {
      console.log('AudioService initialized with Electron API access');
    }
  }

  // Start recording audio
  async startRecording(config: AudioConfig): Promise<RecordingResult> {
    try {
      if (this.isRecording) {
        throw new Error('Recording is already in progress');
      }

      // Get user media with specific device if configured
      const constraints: MediaStreamConstraints = {
        audio: {
          deviceId: config.inputDevice ? { exact: config.inputDevice } : undefined,
          echoCancellation: true,
          noiseSuppression: config.noiseReduction,
          autoGainControl: false,
          sampleRate: 16000, // Optimal for speech recognition
          channelCount: 1     // Mono audio
        }
      };

      this.stream = await navigator.mediaDevices.getUserMedia(constraints);
      
      // Create MediaRecorder with appropriate options
      const options: MediaRecorderOptions = {
        mimeType: this.getSupportedMimeType(),
        audioBitsPerSecond: 64000 // Good quality for speech
      };

      this.mediaRecorder = new MediaRecorder(this.stream, options);
      this.audioChunks = [];

      // Set up event handlers
      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };

      this.mediaRecorder.onstart = () => {
        console.log('Recording started');
        this.isRecording = true;
      };

      this.mediaRecorder.onstop = () => {
        console.log('Recording stopped');
        this.isRecording = false;
      };

      // Start recording
      this.mediaRecorder.start(1000); // Collect data every second

      // Notify Electron main process
      if (window.electronAPI?.audio?.startRecording) {
        await window.electronAPI.audio.startRecording();
      }

      return {
        success: true,
        message: 'Recording started successfully'
      };
    } catch (error) {
      this.cleanup();
      throw new Error(`Failed to start recording: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Stop recording and return audio data
  async stopRecording(): Promise<{ success: boolean; audioBlob?: Blob }> {
    try {
      if (!this.isRecording || !this.mediaRecorder) {
        throw new Error('No recording in progress');
      }

      return new Promise((resolve, reject) => {
        if (!this.mediaRecorder) {
          reject(new Error('MediaRecorder is null'));
          return;
        }

        this.mediaRecorder.onstop = async () => {
          try {
            // Create audio blob from chunks
            const audioBlob = new Blob(this.audioChunks, { 
              type: this.getSupportedMimeType() 
            });

            // Cleanup
            this.cleanup();

            // Notify Electron main process
            if (window.electronAPI?.audio?.stopRecording) {
              await window.electronAPI.audio.stopRecording();
            }

            resolve({
              success: true,
              audioBlob
            });
          } catch (error) {
            reject(error);
          }
        };

        this.mediaRecorder.stop();
      });
    } catch (error) {
      this.cleanup();
      throw new Error(`Failed to stop recording: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Transcribe audio using configured provider
  async transcribeAudio(audioBlob: Blob, config: AudioConfig): Promise<TranscriptionResult> {
    try {
      if (config.speechProvider === 'whisper') {
        return await this.transcribeWithWhisper(audioBlob, config);
      } else {
        return await this.transcribeWithBrowser(audioBlob, config);
      }
    } catch (error) {
      throw new Error(`Transcription failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Transcribe using OpenAI Whisper via Electron
  private async transcribeWithWhisper(audioBlob: Blob, config: AudioConfig): Promise<TranscriptionResult> {
    try {
      // Convert blob to buffer for Electron
      const arrayBuffer = await audioBlob.arrayBuffer();
      const buffer = new Uint8Array(arrayBuffer);

      // Send to Electron main process
      if (!window.electronAPI?.audio?.transcribe) {
        throw new Error('Whisper transcription not available - Electron API missing');
      }

      const result = await window.electronAPI.audio.transcribe(buffer, config);
      return result;
    } catch (error) {
      throw new Error(`Whisper transcription failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Transcribe using browser Speech Recognition API
  private async transcribeWithBrowser(audioBlob: Blob, config: AudioConfig): Promise<TranscriptionResult> {
    return new Promise((resolve, reject) => {
      try {
        // Check for browser support
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
          reject(new Error('Browser speech recognition not supported'));
          return;
        }

        const recognition = new SpeechRecognition();
        
        // Configure recognition
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.lang = config.language;
        recognition.maxAlternatives = 1;

        recognition.onresult = (event) => {
          try {
            const result = event.results[0];
            if (result) {
              const transcript = result[0].transcript;
              const confidence = result[0].confidence || 0.8;

              resolve({
                text: transcript,
                confidence: confidence,
                language: config.language
              });
            } else {
              reject(new Error('No speech recognition results'));
            }
          } catch (error) {
            reject(error);
          }
        };

        recognition.onerror = (event) => {
          reject(new Error(`Speech recognition error: ${event.error}`));
        };

        recognition.onend = () => {
          // Recognition ended without result
          setTimeout(() => {
            reject(new Error('Speech recognition ended without results'));
          }, 100);
        };

        // Start recognition
        recognition.start();

        // Timeout after 30 seconds
        setTimeout(() => {
          recognition.abort();
          reject(new Error('Speech recognition timeout'));
        }, 30000);
      } catch (error) {
        reject(new Error(`Browser transcription setup failed: ${error instanceof Error ? error.message : String(error)}`));
      }
    });
  }

  // Process transcribed question
  async processVoiceQuestion(transcript: string, config: AudioConfig): Promise<any> {
    try {
      if (!window.electronAPI?.audio?.processQuestion) {
        throw new Error('Voice question processing not available - Electron API missing');
      }

      return await window.electronAPI.audio.processQuestion(transcript, config);
    } catch (error) {
      throw new Error(`Failed to process voice question: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Get available audio devices
  async getAudioDevices(): Promise<MediaDeviceInfo[]> {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.filter(device => device.kind === 'audioinput');
    } catch (error) {
      throw new Error(`Failed to get audio devices: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Save audio configuration
  async saveConfig(config: AudioConfig): Promise<void> {
    try {
      if (window.electronAPI?.audio?.saveConfig) {
        await window.electronAPI.audio.saveConfig(config);
      } else {
        // Fallback to localStorage for web version
        localStorage.setItem('audioConfig', JSON.stringify(config));
      }
    } catch (error) {
      throw new Error(`Failed to save audio config: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Load audio configuration
  async loadConfig(): Promise<AudioConfig> {
    try {
      if (window.electronAPI?.audio?.loadConfig) {
        return await window.electronAPI.audio.loadConfig();
      } else {
        // Fallback to localStorage for web version
        const saved = localStorage.getItem('audioConfig');
        if (saved) {
          return JSON.parse(saved);
        }
      }
    } catch (error) {
      console.warn('Failed to load audio config:', error);
    }

    // Return default configuration
    return {
      inputDevice: '',
      inputGain: 100,
      noiseReduction: true,
      voiceActivation: false,
      voiceActivationThreshold: 30,
      speechProvider: 'whisper',
      language: 'en-US',
      autoProcessVoice: false,
      showTranscriptionRealTime: true,
      enableWaveformVisualization: true,
      transcriptionFontSize: 'medium'
    };
  }

  // Check if currently recording
  isCurrentlyRecording(): boolean {
    return this.isRecording;
  }

  // Get supported MIME type for recording
  private getSupportedMimeType(): string {
    const types = [
      'audio/webm',
      'audio/webm;codecs=opus',
      'audio/ogg;codecs=opus',
      'audio/wav'
    ];

    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    }

    // Fallback
    return 'audio/webm';
  }

  // Clean up resources
  private cleanup(): void {
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }

    this.mediaRecorder = null;
    this.audioChunks = [];
    this.isRecording = false;
  }

  // Convert audio blob to WAV format (for compatibility)
  async convertToWav(audioBlob: Blob): Promise<Blob> {
    try {
      const arrayBuffer = await audioBlob.arrayBuffer();
      const audioContext = new AudioContext();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      
      // Convert to WAV format
      const wav = this.encodeWAV(audioBuffer);
      return new Blob([wav], { type: 'audio/wav' });
    } catch (error) {
      console.warn('WAV conversion failed, using original blob:', error);
      return audioBlob;
    }
  }

  // Simple WAV encoder
  private encodeWAV(audioBuffer: AudioBuffer): ArrayBuffer {
    const numberOfChannels = audioBuffer.numberOfChannels;
    const sampleRate = audioBuffer.sampleRate;
    const format = 1; // PCM
    const bitDepth = 16;

    const bytesPerSample = bitDepth / 8;
    const blockAlign = numberOfChannels * bytesPerSample;
    const byteRate = sampleRate * blockAlign;
    const dataSize = audioBuffer.length * blockAlign;
    const bufferSize = 44 + dataSize;

    const arrayBuffer = new ArrayBuffer(bufferSize);
    const view = new DataView(arrayBuffer);

    // WAV header
    const writeString = (offset: number, string: string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };

    writeString(0, 'RIFF');
    view.setUint32(4, bufferSize - 8, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, format, true);
    view.setUint16(22, numberOfChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitDepth, true);
    writeString(36, 'data');
    view.setUint32(40, dataSize, true);

    // Convert audio data
    let offset = 44;
    for (let i = 0; i < audioBuffer.length; i++) {
      for (let channel = 0; channel < numberOfChannels; channel++) {
        const channelData = audioBuffer.getChannelData(channel);
        const sample = Math.max(-1, Math.min(1, channelData[i]));
        view.setInt16(offset, sample * 0x7FFF, true);
        offset += 2;
      }
    }

    return arrayBuffer;
  }
}

// Export singleton instance
export const audioService = new AudioService();
export default audioService;