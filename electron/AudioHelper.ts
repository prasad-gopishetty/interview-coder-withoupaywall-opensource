import { ipcMain, IpcMainEvent } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { configHelper } from './ConfigHelper';
import { ProcessingHelper } from './ProcessingHelper';

export interface AudioConfig {
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

export interface TranscriptionResult {
  text: string;
  confidence: number;
  language?: string;
  duration?: number;
}

export class AudioHelper {
  private isRecording: boolean = false;
  private audioFilePath: string | null = null;
  private tempDir: string;
  private processingHelper: ProcessingHelper | null = null;

  constructor(processingHelper?: ProcessingHelper | null) {
    this.processingHelper = processingHelper || null;
    this.tempDir = path.join(os.tmpdir(), 'interview-coder-audio');
    this.ensureTempDir();
    this.setupIpcHandlers();
  }

  private ensureTempDir(): void {
    try {
      if (!fs.existsSync(this.tempDir)) {
        fs.mkdirSync(this.tempDir, { recursive: true });
      }
    } catch (error) {
      console.error('Failed to create temp directory:', error);
      // Fallback to system temp
      this.tempDir = os.tmpdir();
    }
  }

  private setupIpcHandlers(): void {
    // Start recording
    ipcMain.handle('audio:start-recording', async (event: IpcMainEvent) => {
      try {
        return await this.startRecording();
      } catch (error) {
        console.error('Failed to start recording:', error);
        throw error;
      }
    });

    // Stop recording
    ipcMain.handle('audio:stop-recording', async (event: IpcMainEvent) => {
      try {
        return await this.stopRecording();
      } catch (error) {
        console.error('Failed to stop recording:', error);
        throw error;
      }
    });

    // Transcribe audio from base64 data
    ipcMain.handle('audio:transcribe-audio', async (event: IpcMainEvent, base64Audio: string) => {
      try {
        return await this.transcribeAudioFromBase64(base64Audio);
      } catch (error) {
        console.error('Failed to transcribe audio:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Transcription failed' };
      }
    });

    // Transcribe audio
    ipcMain.handle('audio:transcribe', async (event: IpcMainEvent, audioData: Buffer, config: AudioConfig) => {
      try {
        return await this.transcribeAudio(audioData, config);
      } catch (error) {
        console.error('Failed to transcribe audio:', error);
        throw error;
      }
    });

    // Process voice question
    ipcMain.handle('audio:process-question', async (event: IpcMainEvent, transcript: string, config: AudioConfig) => {
      try {
        console.log('IPC handler: audio:process-question called with transcript:', transcript);
        const result = await this.processVoiceQuestion(transcript, config);
        console.log('IPC handler: processVoiceQuestion completed successfully:', result);
        return result;
      } catch (error) {
        console.error('IPC handler: Failed to process voice question:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Processing failed' };
      }
    });

    // Get audio devices
    ipcMain.handle('audio:get-devices', async (event: IpcMainEvent) => {
      try {
        return await this.getAudioDevices();
      } catch (error) {
        console.error('Failed to get audio devices:', error);
        throw error;
      }
    });

    // Save audio config
    ipcMain.handle('audio:save-config', async (event: IpcMainEvent, config: AudioConfig) => {
      try {
        return await this.saveAudioConfig(config);
      } catch (error) {
        console.error('Failed to save audio config:', error);
        throw error;
      }
    });

    // Load audio config
    ipcMain.handle('audio:load-config', async (event: IpcMainEvent) => {
      try {
        console.log('IPC handler: audio:load-config called');
        const result = await this.loadAudioConfig();
        console.log('IPC handler: loadAudioConfig completed successfully');
        return result;
      } catch (error) {
        console.error('IPC handler: Failed to load audio config:', error);
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
    });

    // Cleanup temp files
    ipcMain.handle('audio:cleanup', async (event: IpcMainEvent) => {
      try {
        return await this.cleanup();
      } catch (error) {
        console.error('Failed to cleanup audio files:', error);
        throw error;
      }
    });
  }

  async startRecording(): Promise<{ success: boolean; message?: string }> {
    if (this.isRecording) {
      throw new Error('Recording is already in progress');
    }

    try {
      // Generate unique filename
      const timestamp = Date.now();
      this.audioFilePath = path.join(this.tempDir, `recording_${timestamp}.wav`);
      
      this.isRecording = true;
      
      return {
        success: true,
        message: 'Recording started successfully'
      };
    } catch (error) {
      this.isRecording = false;
      this.audioFilePath = null;
      throw new Error(`Failed to start recording: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async stopRecording(): Promise<{ success: boolean; audioFilePath?: string; message?: string }> {
    if (!this.isRecording) {
      throw new Error('No recording in progress');
    }

    try {
      this.isRecording = false;
      
      const filePath = this.audioFilePath;
      this.audioFilePath = null;
      
      return {
        success: true,
        audioFilePath: filePath,
        message: 'Recording stopped successfully'
      };
    } catch (error) {
      this.isRecording = false;
      this.audioFilePath = null;
      throw new Error(`Failed to stop recording: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async transcribeAudio(audioData: Buffer, config: AudioConfig): Promise<TranscriptionResult> {
    try {
      if (config.speechProvider === 'whisper') {
        return await this.transcribeWithWhisper(audioData, config);
      } else {
        // Browser speech recognition is handled on renderer side
        return {
          text: '',
          confidence: 0,
          language: config.language
        };
      }
    } catch (error) {
      throw new Error(`Transcription failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async transcribeAudioFromBase64(base64Audio: string): Promise<{ success: boolean; transcript?: string; error?: string }> {
    try {
      console.log('transcribeAudioFromBase64 called');
      
      // Get config for transcription settings
      const config = configHelper.loadConfig();
      const openaiApiKey = config.apiKey;

      if (!openaiApiKey) {
        console.error('No OpenAI API key found');
        return { success: false, error: 'OpenAI API key is required for transcription' };
      }

      console.log('Processing base64 audio data...');
      
      // Convert base64 to buffer
      const base64Data = base64Audio.includes(',') ? base64Audio.split(',')[1] : base64Audio;
      const audioBuffer = Buffer.from(base64Data, 'base64');
      
      console.log(`Audio buffer size: ${audioBuffer.length} bytes`);
      
      // Save to temporary file
      const tempAudioPath = path.join(this.tempDir, `temp_${Date.now()}.webm`);
      fs.writeFileSync(tempAudioPath, audioBuffer);
      
      console.log(`Saved audio to temporary file: ${tempAudioPath}`);
      
      try {
        // Use node-fetch with form-data instead of browser APIs
        const FormData = require('form-data');
        const fetch = require('node-fetch');
        
        const formData = new FormData();
        
        // Read the file and append as stream
        const audioStream = fs.createReadStream(tempAudioPath);
        formData.append('file', audioStream, {
          filename: 'audio.webm',
          contentType: 'audio/webm'
        });
        formData.append('model', 'whisper-1');
        formData.append('response_format', 'json');

        console.log('Sending request to OpenAI...');
        
        const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${openaiApiKey}`,
            ...formData.getHeaders()
          },
          body: formData,
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`OpenAI API error: ${response.status} ${errorText}`);
          throw new Error(`OpenAI API error: ${response.status} ${errorText}`);
        }

        // Get JSON response to handle encoding properly
        const jsonResponse = await response.json();
        const transcript = jsonResponse.text || '';
        console.log(`Raw transcript response: "${transcript}"`);
        
        // Ensure proper UTF-8 encoding
        const cleanTranscript = transcript.trim();
        console.log(`Cleaned transcript: "${cleanTranscript}"`);
        
        // Validate that the transcript looks reasonable
        if (cleanTranscript.length === 0) {
          throw new Error('Empty transcription received');
        }
        
        console.log(`Transcription successful: ${cleanTranscript.substring(0, 100)}...`);
        
        // Clean up temporary files
        try {
          fs.unlinkSync(tempAudioPath);
        } catch (cleanupError) {
          console.warn('Failed to cleanup temporary audio files:', cleanupError);
        }

        return { success: true, transcript: cleanTranscript };
        
      } catch (error) {
        console.error('Error in transcription:', error);
        
        // Clean up temporary file on error
        try {
          fs.unlinkSync(tempAudioPath);
        } catch (cleanupError) {
          console.warn('Failed to cleanup temporary audio file on error:', cleanupError);
        }
        
        return { success: false, error: error instanceof Error ? error.message : 'Transcription failed' };
      }
      
    } catch (error) {
      console.error('Error processing audio base64:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Failed to process audio' };
    }
  }

  private async transcribeWithWhisper(audioData: Buffer, config: AudioConfig): Promise<TranscriptionResult> {
    try {
      // Get OpenAI API key from config
      const config = configHelper.loadConfig();
      const openaiApiKey = config.apiKey;

      if (!openaiApiKey) {
        throw new Error('OpenAI API key is required for Whisper transcription');
      }

      // Save audio data to temporary file
      const tempAudioPath = path.join(this.tempDir, `temp_${Date.now()}.wav`);
      fs.writeFileSync(tempAudioPath, audioData);

      // Prepare form data for OpenAI API
      const formData = new FormData();
      
      // Read the audio file as a Blob
      const audioBlob = new Blob([fs.readFileSync(tempAudioPath)], { type: 'audio/wav' });
      formData.append('file', audioBlob, 'audio.wav');
      formData.append('model', 'whisper-1');
      formData.append('language', config.language.split('-')[0]); // Convert en-US to en
      formData.append('response_format', 'verbose_json');

      // Make request to OpenAI
      const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openaiApiKey}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenAI API error: ${response.status} ${errorText}`);
      }

      const result = await response.json();
      
      // Clean up temporary file
      try {
        fs.unlinkSync(tempAudioPath);
      } catch (cleanupError) {
        console.warn('Failed to cleanup temporary audio file:', cleanupError);
      }

      return {
        text: result.text || '',
        confidence: Math.min(1, Math.max(0, result.confidence || 0.8)), // Default confidence
        language: result.language,
        duration: result.duration
      };
    } catch (error) {
      throw new Error(`Whisper transcription failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async processVoiceQuestion(transcript: string, config: AudioConfig): Promise<any> {
    try {
      console.log('processVoiceQuestion called with:', { transcript, config: config?.speechProvider });
      
      // Use ProcessingHelper if available
      if (this.processingHelper) {
        console.log('Using ProcessingHelper to process voice question...');
        const result = await this.processingHelper.processTextQuestion(transcript);
        console.log('processVoiceQuestion returning result from ProcessingHelper:', result);
        return result;
      } else {
        console.warn('ProcessingHelper not available, returning placeholder response');
        // Fallback to placeholder if ProcessingHelper is not available
        const result = {
          success: true,
          solution: {
            code: `// Voice Question: "${transcript}"
// This is a placeholder response because ProcessingHelper is not available.
// Please check the LLM configuration in settings.

console.log("Question: ${transcript}");

// To get proper AI-powered responses:
// 1. Ensure your OpenAI/Gemini/Claude API key is configured in Settings
// 2. Restart the application
// 3. Try recording your question again

function placeholderSolution() {
  return "Configure your AI provider to get real solutions";
}`,
            thoughts: ['ProcessingHelper not initialized', 'Check API key configuration', 'Restart application after configuration'],
            time_complexity: 'N/A - Placeholder response',
            space_complexity: 'N/A - Placeholder response'
          },
          originalTranscript: transcript,
          processedAt: Date.now()
        };
        
        console.log('processVoiceQuestion returning placeholder result:', result);
        return result;
      }
    } catch (error) {
      console.error('Error in processVoiceQuestion:', error);
      throw new Error(`Failed to process voice question: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async getAudioDevices(): Promise<any[]> {
    // This is primarily handled on the renderer side via navigator.mediaDevices
    // Return empty array as devices are enumerated client-side
    return [];
  }

  async saveAudioConfig(config: AudioConfig): Promise<{ success: boolean }> {
    try {
      // Save audio config to the existing config system
      configHelper.updateConfig({
        audioConfig: config
      });

      return { success: true };
    } catch (error) {
      throw new Error(`Failed to save audio config: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async loadAudioConfig(): Promise<AudioConfig> {
    try {
      const config = configHelper.loadConfig();
      
      // Return audio config or defaults
      return config.audioConfig || {
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
    } catch (error) {
      // Return defaults if config loading fails
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
  }

  async cleanup(): Promise<{ success: boolean; filesRemoved: number }> {
    let filesRemoved = 0;
    
    try {
      if (fs.existsSync(this.tempDir)) {
        const files = fs.readdirSync(this.tempDir);
        
        for (const file of files) {
          if (file.startsWith('recording_') || file.startsWith('temp_')) {
            try {
              const filePath = path.join(this.tempDir, file);
              const stats = fs.statSync(filePath);
              
              // Only remove files older than 1 hour
              const oneHourAgo = Date.now() - (60 * 60 * 1000);
              if (stats.mtime.getTime() < oneHourAgo) {
                fs.unlinkSync(filePath);
                filesRemoved++;
              }
            } catch (fileError) {
              console.warn(`Failed to remove file ${file}:`, fileError);
            }
          }
        }
      }
      
      return { success: true, filesRemoved };
    } catch (error) {
      console.error('Cleanup error:', error);
      return { success: false, filesRemoved };
    }
  }

  // Utility method to check recording status
  isCurrentlyRecording(): boolean {
    return this.isRecording;
  }

  // Get current audio file path
  getCurrentAudioFilePath(): string | null {
    return this.audioFilePath;
  }
}

// Export singleton instance - will be initialized in main.ts
export let audioHelper: AudioHelper;

// Initialization function
export function initializeAudioHelper(processingHelper?: ProcessingHelper | null): void {
  audioHelper = new AudioHelper(processingHelper);
}