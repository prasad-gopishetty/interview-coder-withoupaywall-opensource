import React, { useState, useEffect } from 'react';
import AudioCapture from './AudioCapture';

interface AudioManagerProps {
  onQuestionProcessed?: (solution: any) => void;
  className?: string;
}

export const AudioManager: React.FC<AudioManagerProps> = ({
  onQuestionProcessed,
  className
}) => {
  const [transcript, setTranscript] = useState('');

  const handleTranscriptionComplete = (text: string) => {
    setTranscript(text);
  };

  const handleQuestionProcessed = (solution: any) => {
    onQuestionProcessed?.(solution);
  };

  return (
    <div className={`space-y-4 ${className || ''}`}>
      <AudioCapture
        onTranscriptionComplete={handleTranscriptionComplete}
        onQuestionProcessed={handleQuestionProcessed}
      />
    </div>
  );
};

export default AudioManager;