import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';

interface AudioDevice {
  deviceId: string;
  label: string;
  kind: 'audioinput';
}

interface AudioConfig {
  // Input Settings
  inputDevice: string;
  inputGain: number;
  noiseReduction: boolean;
  voiceActivation: boolean;
  voiceActivationThreshold: number;
  
  // Speech Recognition
  speechProvider: 'whisper' | 'browser';
  language: string;
  autoProcessVoice: boolean;
  
  // Visual Display Settings
  showTranscriptionRealTime: boolean;
  enableWaveformVisualization: boolean;
  transcriptionFontSize: 'small' | 'medium' | 'large';
}

interface AudioSettingsProps {
  config: AudioConfig;
  onConfigChange: (config: AudioConfig) => void;
  onTestMicrophone?: () => void;
  isOpen: boolean;
  onClose: () => void;
}

export const AudioSettings: React.FC<AudioSettingsProps> = ({
  config,
  onConfigChange,
  onTestMicrophone,
  isOpen,
  onClose
}) => {
  const [audioDevices, setAudioDevices] = useState<AudioDevice[]>([]);
  const [testingMicrophone, setTestingMicrophone] = useState(false);
  const [testAudioLevel, setTestAudioLevel] = useState(0);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);

  // Get available audio devices
  useEffect(() => {
    const getAudioDevices = async () => {
      try {
        // Request permission first
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(track => track.stop());
        setHasPermission(true);
        
        const devices = await navigator.mediaDevices.enumerateDevices();
        const audioInputs = devices
          .filter((device): device is AudioDevice => device.kind === 'audioinput')
          .map(device => ({
            deviceId: device.deviceId,
            label: device.label || `Microphone ${device.deviceId.slice(0, 8)}`,
            kind: 'audioinput' as const
          }));
        
        setAudioDevices(audioInputs);
      } catch (error) {
        console.error('Error getting audio devices:', error);
        setHasPermission(false);
      }
    };

    if (isOpen) {
      getAudioDevices();
    }
  }, [isOpen]);

  const handleConfigUpdate = (updates: Partial<AudioConfig>) => {
    onConfigChange({ ...config, ...updates });
  };

  const testMicrophone = async () => {
    if (!hasPermission) return;
    
    setTestingMicrophone(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: { 
          deviceId: config.inputDevice ? { exact: config.inputDevice } : undefined 
        } 
      });
      
      const audioContext = new AudioContext();
      const analyser = audioContext.createAnalyser();
      const source = audioContext.createMediaStreamSource(stream);
      
      analyser.fftSize = 256;
      source.connect(analyser);
      
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      
      const updateLevel = () => {
        analyser.getByteFrequencyData(dataArray);
        const average = dataArray.reduce((sum, value) => sum + value, 0) / dataArray.length;
        setTestAudioLevel(Math.min(average / 128, 1));
        
        if (testingMicrophone) {
          requestAnimationFrame(updateLevel);
        }
      };
      
      updateLevel();
      
      // Stop after 5 seconds
      setTimeout(() => {
        setTestingMicrophone(false);
        setTestAudioLevel(0);
        stream.getTracks().forEach(track => track.stop());
        audioContext.close();
      }, 5000);
      
    } catch (error) {
      console.error('Microphone test failed:', error);
      setTestingMicrophone(false);
      setTestAudioLevel(0);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle>Audio Settings</CardTitle>
              <CardDescription>Configure voice input and transcription options</CardDescription>
            </div>
            <Button variant="ghost" onClick={onClose} className="h-8 w-8 p-0">
              ✕
            </Button>
          </div>
        </CardHeader>
        
        <CardContent className="space-y-6">
          {/* Audio Input Settings */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold border-b pb-2">Audio Input</h3>
            
            {/* Microphone Selection */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Microphone Device</label>
              {hasPermission === false ? (
                <div className="p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
                  Microphone access is required. Please grant permission and reload.
                </div>
              ) : (
                <select
                  value={config.inputDevice}
                  onChange={(e) => handleConfigUpdate({ inputDevice: e.target.value })}
                  className="w-full p-2 border border-gray-300 rounded-md"
                >
                  <option value="">Default Microphone</option>
                  {audioDevices.map((device) => (
                    <option key={device.deviceId} value={device.deviceId}>
                      {device.label}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Microphone Test */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium">Microphone Test</label>
                <Button
                  size="sm"
                  onClick={testMicrophone}
                  disabled={testingMicrophone || !hasPermission}
                  className="h-8"
                >
                  {testingMicrophone ? 'Testing...' : 'Test'}
                </Button>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className={`h-2 rounded-full transition-all duration-100 ${
                    testAudioLevel > 0.7 ? 'bg-red-500' : 
                    testAudioLevel > 0.3 ? 'bg-yellow-500' : 'bg-green-500'
                  }`}
                  style={{ width: `${testAudioLevel * 100}%` }}
                ></div>
              </div>
              {testingMicrophone && (
                <div className="text-xs text-gray-600">Speak into your microphone to test audio levels</div>
              )}
            </div>

            {/* Input Gain */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Input Gain: {config.inputGain}%</label>
              <input
                type="range"
                min="50"
                max="200"
                step="10"
                value={config.inputGain}
                onChange={(e) => handleConfigUpdate({ inputGain: parseInt(e.target.value) })}
                className="w-full"
              />
            </div>

            {/* Noise Reduction */}
            <div className="flex items-center space-x-3">
              <input
                type="checkbox"
                id="noiseReduction"
                checked={config.noiseReduction}
                onChange={(e) => handleConfigUpdate({ noiseReduction: e.target.checked })}
                className="h-4 w-4"
              />
              <label htmlFor="noiseReduction" className="text-sm font-medium">
                Enable Noise Reduction
              </label>
            </div>

            {/* Voice Activation */}
            <div className="space-y-3">
              <div className="flex items-center space-x-3">
                <input
                  type="checkbox"
                  id="voiceActivation"
                  checked={config.voiceActivation}
                  onChange={(e) => handleConfigUpdate({ voiceActivation: e.target.checked })}
                  className="h-4 w-4"
                />
                <label htmlFor="voiceActivation" className="text-sm font-medium">
                  Voice Activation Detection
                </label>
              </div>
              
              {config.voiceActivation && (
                <div className="ml-7 space-y-2">
                  <label className="text-sm">Sensitivity: {config.voiceActivationThreshold}%</label>
                  <input
                    type="range"
                    min="10"
                    max="90"
                    step="5"
                    value={config.voiceActivationThreshold}
                    onChange={(e) => handleConfigUpdate({ voiceActivationThreshold: parseInt(e.target.value) })}
                    className="w-full"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Speech Recognition Settings */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold border-b pb-2">Speech Recognition</h3>
            
            {/* Provider Selection */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Recognition Provider</label>
              <select
                value={config.speechProvider}
                onChange={(e) => handleConfigUpdate({ speechProvider: e.target.value as 'whisper' | 'browser' })}
                className="w-full p-2 border border-gray-300 rounded-md"
              >
                <option value="whisper">OpenAI Whisper (Recommended)</option>
                <option value="browser">Browser Speech Recognition (Free)</option>
              </select>
              <div className="text-xs text-gray-600">
                {config.speechProvider === 'whisper' 
                  ? 'Higher accuracy, requires OpenAI API key'
                  : 'Free but less accurate for technical terms'
                }
              </div>
            </div>

            {/* Language Selection */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Language</label>
              <select
                value={config.language}
                onChange={(e) => handleConfigUpdate({ language: e.target.value })}
                className="w-full p-2 border border-gray-300 rounded-md"
              >
                <option value="en-US">English (US)</option>
                <option value="en-GB">English (UK)</option>
                <option value="en-CA">English (Canada)</option>
                <option value="en-AU">English (Australia)</option>
              </select>
            </div>

            {/* Auto Process */}
            <div className="flex items-center space-x-3">
              <input
                type="checkbox"
                id="autoProcess"
                checked={config.autoProcessVoice}
                onChange={(e) => handleConfigUpdate({ autoProcessVoice: e.target.checked })}
                className="h-4 w-4"
              />
              <label htmlFor="autoProcess" className="text-sm font-medium">
                Auto-process transcriptions
              </label>
            </div>
          </div>

          {/* Visual Display Settings */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold border-b pb-2">Visual Display</h3>
            
            {/* Real-time Transcription */}
            <div className="flex items-center space-x-3">
              <input
                type="checkbox"
                id="realTimeTranscription"
                checked={config.showTranscriptionRealTime}
                onChange={(e) => handleConfigUpdate({ showTranscriptionRealTime: e.target.checked })}
                className="h-4 w-4"
              />
              <label htmlFor="realTimeTranscription" className="text-sm font-medium">
                Show real-time transcription
              </label>
            </div>

            {/* Waveform Visualization */}
            <div className="flex items-center space-x-3">
              <input
                type="checkbox"
                id="waveform"
                checked={config.enableWaveformVisualization}
                onChange={(e) => handleConfigUpdate({ enableWaveformVisualization: e.target.checked })}
                className="h-4 w-4"
              />
              <label htmlFor="waveform" className="text-sm font-medium">
                Enable waveform visualization
              </label>
            </div>

            {/* Font Size */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Transcription Font Size</label>
              <select
                value={config.transcriptionFontSize}
                onChange={(e) => handleConfigUpdate({ transcriptionFontSize: e.target.value as 'small' | 'medium' | 'large' })}
                className="w-full p-2 border border-gray-300 rounded-md"
              >
                <option value="small">Small</option>
                <option value="medium">Medium</option>
                <option value="large">Large</option>
              </select>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 pt-4 border-t">
            <Button
              onClick={onClose}
              className="flex-1"
            >
              Save Settings
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                // Reset to defaults
                handleConfigUpdate({
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
                });
              }}
            >
              Reset to Defaults
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AudioSettings;