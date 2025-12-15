import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';

interface TranscriptionDisplayProps {
  transcript: string;
  isProcessing: boolean;
  confidence?: number;
  onEditTranscript: (text: string) => void;
  onProcessQuestion: () => void;
  processingStatus?: 'idle' | 'transcribing' | 'analyzing' | 'complete';
  error?: string;
}

export const TranscriptionDisplay: React.FC<TranscriptionDisplayProps> = ({
  transcript,
  isProcessing,
  confidence = 0,
  onEditTranscript,
  onProcessQuestion,
  processingStatus = 'idle',
  error
}) => {
  const [editMode, setEditMode] = useState(false);
  const [editedText, setEditedText] = useState(transcript);
  const [isExpanded, setIsExpanded] = useState(false);

  // Update edited text when transcript changes
  React.useEffect(() => {
    if (!editMode) {
      setEditedText(transcript);
    }
  }, [transcript, editMode]);

  const handleSaveEdit = () => {
    onEditTranscript(editedText);
    setEditMode(false);
  };

  const handleCancelEdit = () => {
    setEditedText(transcript);
    setEditMode(false);
  };

  const getConfidenceColor = () => {
    if (confidence >= 0.8) return 'text-green-600';
    if (confidence >= 0.6) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getProcessingStatusText = () => {
    switch (processingStatus) {
      case 'transcribing': return 'Converting speech to text...';
      case 'analyzing': return 'Analyzing question...';
      case 'complete': return 'Ready to process';
      default: return 'Waiting for input';
    }
  };

  const getProcessingIcon = () => {
    switch (processingStatus) {
      case 'transcribing': 
        return <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>;
      case 'analyzing': 
        return <div className="animate-pulse text-yellow-500">🔍</div>;
      case 'complete': 
        return <div className="text-green-500">✓</div>;
      default: 
        return <div className="text-gray-400">⏸</div>;
    }
  };

  const truncateText = (text: string, maxLength: number = 150) => {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  };

  const hasContent = transcript.trim().length > 0;
  const displayText = isExpanded ? transcript : truncateText(transcript);

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {getProcessingIcon()}
          <span>Voice Transcription</span>
          {confidence > 0 && (
            <span className={`text-sm font-normal ${getConfidenceColor()}`}>
              ({Math.round(confidence * 100)}% confidence)
            </span>
          )}
        </CardTitle>
        <CardDescription>
          {getProcessingStatusText()}
        </CardDescription>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Processing Indicator */}
        {isProcessing && (
          <div className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-200 rounded">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-500"></div>
            <span className="text-blue-700">Processing audio transcription...</span>
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded text-red-700">
            <div className="font-semibold">Transcription Error</div>
            <div className="text-sm mt-1">{error}</div>
          </div>
        )}

        {/* Transcription Content */}
        <div className="space-y-3">
          {hasContent ? (
            <div className="space-y-3">
              {/* Display Mode */}
              {!editMode && (
                <div className="space-y-2">
                  <div className="p-4 bg-gray-50 rounded border-l-4 border-blue-500">
                    <div className="text-gray-800 whitespace-pre-wrap">
                      {displayText}
                    </div>
                    {transcript.length > 150 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setIsExpanded(!isExpanded)}
                        className="mt-2 p-0 h-auto text-blue-600 hover:text-blue-800"
                      >
                        {isExpanded ? 'Show Less' : 'Show More'}
                      </Button>
                    )}
                  </div>
                  
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setEditMode(true)}
                      disabled={isProcessing}
                    >
                      ✏️ Edit
                    </Button>
                    <Button
                      size="sm"
                      onClick={onProcessQuestion}
                      disabled={isProcessing || !transcript.trim()}
                      className="bg-green-600 hover:bg-green-700 text-white"
                    >
                      🚀 Process Question
                    </Button>
                  </div>
                </div>
              )}

              {/* Edit Mode */}
              {editMode && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Edit Transcription:
                    </label>
                    <textarea
                      value={editedText}
                      onChange={(e) => setEditedText(e.target.value)}
                      className="w-full p-3 border border-gray-300 rounded-md resize-vertical min-h-[100px] font-mono text-sm"
                      placeholder="Edit the transcribed text here..."
                      autoFocus
                    />
                    <div className="mt-1 text-xs text-gray-500">
                      {editedText.length} characters
                    </div>
                  </div>
                  
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={handleSaveEdit}
                      disabled={!editedText.trim()}
                      className="bg-blue-600 hover:bg-blue-700 text-white"
                    >
                      💾 Save
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleCancelEdit}
                    >
                      ✖️ Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              <div className="text-4xl mb-2">🎤</div>
              <div className="text-lg font-medium">No transcription yet</div>
              <div className="text-sm">Start recording to see your speech transcribed here</div>
            </div>
          )}
        </div>

        {/* Transcription Quality Indicators */}
        {hasContent && confidence > 0 && (
          <div className="space-y-2 text-sm">
            <div className="font-medium text-gray-700">Transcription Quality:</div>
            <div className="flex items-center gap-2">
              <div className="flex-1 bg-gray-200 rounded-full h-2">
                <div 
                  className={`h-2 rounded-full transition-all duration-300 ${
                    confidence >= 0.8 ? 'bg-green-500' : 
                    confidence >= 0.6 ? 'bg-yellow-500' : 'bg-red-500'
                  }`}
                  style={{ width: `${confidence * 100}%` }}
                ></div>
              </div>
              <span className={`font-medium ${getConfidenceColor()}`}>
                {Math.round(confidence * 100)}%
              </span>
            </div>
            {confidence < 0.8 && (
              <div className="text-xs text-gray-600">
                💡 Low confidence - consider editing the transcription for accuracy
              </div>
            )}
          </div>
        )}

        {/* Quick Actions */}
        {hasContent && !editMode && (
          <div className="pt-3 border-t border-gray-200">
            <div className="text-xs text-gray-600 mb-2">Quick Actions:</div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onEditTranscript('')}
                className="text-xs h-auto py-1 px-2"
                disabled={isProcessing}
              >
                🗑️ Clear
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigator.clipboard.writeText(transcript)}
                className="text-xs h-auto py-1 px-2"
              >
                📋 Copy
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default TranscriptionDisplay;