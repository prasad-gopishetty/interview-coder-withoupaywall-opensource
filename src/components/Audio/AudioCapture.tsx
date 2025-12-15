import React, { useState, useRef, useEffect } from 'react';
import { Button } from '../ui/button';

interface AudioCaptureProps {
  onTranscriptionComplete: (text: string) => void;
  onQuestionProcessed?: (solution: any) => void;
}

export const AudioCapture: React.FC<AudioCaptureProps> = ({
  onTranscriptionComplete,
  onQuestionProcessed
}) => {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const animationRef = useRef<number | null>(null);

  const startListening = async () => {
    try {
      setError(null);
      setTranscript('');
      setIsListening(true);
      audioChunksRef.current = [];

      // Get microphone access
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: { 
          echoCancellation: true, 
          noiseSuppression: true,
          sampleRate: 16000
        } 
      });
      mediaStreamRef.current = stream;

      // Set up audio visualization
      audioContextRef.current = new AudioContext();
      analyserRef.current = audioContextRef.current.createAnalyser();
      const source = audioContextRef.current.createMediaStreamSource(stream);
      analyserRef.current.fftSize = 256;
      source.connect(analyserRef.current);
      
      updateAudioLevel();

      // Set up MediaRecorder for audio capture
      let mimeType = 'audio/webm;codecs=opus';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'audio/webm';
        if (!MediaRecorder.isTypeSupported(mimeType)) {
          mimeType = 'audio/wav';
          if (!MediaRecorder.isTypeSupported(mimeType)) {
            mimeType = ''; // Use default
          }
        }
      }
      
      console.log('Using MIME type for MediaRecorder:', mimeType || 'default');
      
      const mediaRecorder = mimeType ? 
        new MediaRecorder(stream, { mimeType }) : 
        new MediaRecorder(stream);
      
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        console.log('Data available:', event.data.size, 'bytes');
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        console.log('MediaRecorder stopped. Audio chunks count:', audioChunksRef.current.length);
        if (audioChunksRef.current.length > 0) {
          const audioBlob = new Blob(audioChunksRef.current, { type: mimeType || 'audio/webm' });
          console.log('Created audio blob:', audioBlob.size, 'bytes');
          await processAudioBlob(audioBlob);
        } else {
          console.warn('No audio chunks recorded');
          setError('No audio data captured');
          setIsProcessing(false);
        }
      };

      mediaRecorder.onerror = (event) => {
        console.error('MediaRecorder error:', event);
        setError('Recording failed');
        setIsListening(false);
        setIsProcessing(false);
      };

      // Start recording
      console.log('Starting MediaRecorder...');
      mediaRecorder.start(1000); // Record in 1-second chunks

    } catch (error) {
      console.error('Failed to start listening:', error);
      setError(error instanceof Error ? error.message : 'Failed to access microphone');
      setIsListening(false);
    }
  };

  const processAudioBlob = async (audioBlob: Blob) => {
    try {
      console.log('processAudioBlob called with blob:', audioBlob);
      setIsProcessing(true);
      setError(null);

      // Convert blob to base64 for transmission
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const base64Audio = reader.result as string;
          console.log('Base64 audio data length:', base64Audio.length);
          
          // Send to Electron backend for transcription
          if (window.electronAPI?.audio?.transcribeAudio) {
            console.log('Calling transcribeAudio...');
            const result = await window.electronAPI.audio.transcribeAudio(base64Audio);
            console.log('Transcription result:', result);
            
            if (result.success) {
              const transcribedText = result.transcript;
              setTranscript(transcribedText);
              onTranscriptionComplete(transcribedText);
              
              // Auto-process the question if we have text
              if (transcribedText.trim()) {
                console.log('Processing question with transcript:', transcribedText);
                try {
                  const config = await window.electronAPI.audio.loadConfig();
                  console.log('Loaded config for processing:', config);
                  
                  const processResult = await window.electronAPI.audio.processQuestion(transcribedText, config);
                  console.log('Process result received:', processResult);
                  
                  if (processResult.success) {
                    console.log('Processing successful, calling onQuestionProcessed with:', processResult.solution);
                    try {
                      if (onQuestionProcessed) {
                        console.log('onQuestionProcessed callback exists, calling it...');
                        onQuestionProcessed(processResult.solution);
                        console.log('onQuestionProcessed callback completed successfully');
                      } else {
                        console.warn('onQuestionProcessed callback is not defined');
                      }
                    } catch (callbackError) {
                      console.error('Error in onQuestionProcessed callback:', callbackError);
                      setError('Failed to process question result');
                    }
                  } else {
                    console.error('Processing failed:', processResult.error);
                    setError(processResult.error || 'Failed to process question');
                  }
                } catch (processingError) {
                  console.error('Error during question processing:', processingError);
                  setError('Failed to process question');
                }
              }
            } else {
              console.error('Transcription failed:', result.error);
              setError(result.error || 'Transcription failed');
            }
          } else {
            console.error('Audio transcription API not available');
            setError('Audio transcription not available');
          }
        } catch (error) {
          console.error('Error processing audio:', error);
          setError('Failed to process audio');
        } finally {
          setIsProcessing(false);
        }
      };
      
      reader.onerror = () => {
        console.error('FileReader error');
        setError('Failed to read audio file');
        setIsProcessing(false);
      };
      
      reader.readAsDataURL(audioBlob);
    } catch (error) {
      console.error('Error processing audio blob:', error);
      setError('Failed to process audio');
      setIsProcessing(false);
    }
  };

  const stopListening = () => {
    setIsListening(false);
    
    // Stop media recorder
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    
    // Clean up audio resources
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }
    
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    
    analyserRef.current = null;
    mediaRecorderRef.current = null;
    setAudioLevel(0);
  };

  const updateAudioLevel = () => {
    if (analyserRef.current && isListening) {
      const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
      analyserRef.current.getByteFrequencyData(dataArray);
      
      const average = dataArray.reduce((sum, value) => sum + value, 0) / dataArray.length;
      setAudioLevel(Math.min(average / 128, 1));
      
      animationRef.current = requestAnimationFrame(updateAudioLevel);
    }
  };

  const handleStartInterview = async () => {
    if (!isListening) {
      await startListening();
    } else {
      stopListening();
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopListening();
    };
  }, []);

  const getButtonText = () => {
    if (isProcessing) return 'Processing...';
    if (isListening) return 'Stop Interview';
    return 'Start Interview';
  };

  return (
    <div className="flex items-center gap-2">
      {/* Compact Interview Button for horizontal layout */}
      <Button
        onClick={handleStartInterview}
        disabled={isProcessing}
        className={`px-4 py-1.5 text-sm font-medium transition-all duration-200 ${
          isListening 
            ? 'bg-red-500 hover:bg-red-600 text-white' 
            : 'bg-orange-500 hover:bg-orange-600 text-white'
        }`}
      >
        {isProcessing ? (
          <div className="flex items-center gap-1">
            <div className="animate-spin rounded-full h-3 w-3 border-b border-white"></div>
            <span>Processing</span>
          </div>
        ) : (
          <>
            {isListening ? '🔴 Stop Interview' : '🎤 Start Interview'}
          </>
        )}
      </Button>

      {/* Audio Level Indicator - compact */}
      {isListening && (
        <div className="flex items-center gap-1">
          {[...Array(4)].map((_, i) => (
            <div
              key={i}
              className="bg-green-500 rounded-full transition-all duration-150"
              style={{
                width: '3px',
                height: `${Math.max(4, (audioLevel + Math.sin(Date.now() / 200 + i) * 0.3) * 16)}px`
              }}
            />
          ))}
        </div>
      )}

      {/* Error indicator */}
      {error && (
        <div className="text-red-400 text-xs">
          ⚠️
        </div>
      )}
    </div>
  );
};

export default AudioCapture;