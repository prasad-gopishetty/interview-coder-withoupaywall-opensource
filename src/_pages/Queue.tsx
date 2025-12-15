import React, { useState, useEffect, useRef } from "react"
import { useQuery } from "@tanstack/react-query"
import ScreenshotQueue from "../components/Queue/ScreenshotQueue"
import QueueCommands from "../components/Queue/QueueCommands"
import { AudioManager } from "../components/Audio"

import { useToast } from "../contexts/toast"
import { Screenshot } from "../types/screenshots"

async function fetchScreenshots(): Promise<Screenshot[]> {
  try {
    const existing = await window.electronAPI.getScreenshots()
    return existing
  } catch (error) {
    console.error("Error loading screenshots:", error)
    throw error
  }
}

interface QueueProps {
  setView: (view: "queue" | "solutions" | "debug") => void
  credits: number
  currentLanguage: string
  setLanguage: (language: string) => void
  onQuestionProcessed?: (solution: any) => void
}

const Queue: React.FC<QueueProps> = ({
  setView,
  credits,
  currentLanguage,
  setLanguage,
  onQuestionProcessed
}) => {
  const { showToast } = useToast()

  const [isTooltipVisible, setIsTooltipVisible] = useState(false)
  const [tooltipHeight, setTooltipHeight] = useState(0)
  const contentRef = useRef<HTMLDivElement>(null)

  const {
    data: screenshots = [],
    isLoading,
    refetch
  } = useQuery<Screenshot[]>({
    queryKey: ["screenshots"],
    queryFn: fetchScreenshots,
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnWindowFocus: false
  })

  const handleDeleteScreenshot = async (index: number) => {
    const screenshotToDelete = screenshots[index]

    try {
      const response = await window.electronAPI.deleteScreenshot(
        screenshotToDelete.path
      )

      if (response.success) {
        refetch() // Refetch screenshots instead of managing state directly
      } else {
        console.error("Failed to delete screenshot:", response.error)
        showToast("Error", "Failed to delete the screenshot file", "error")
      }
    } catch (error) {
      console.error("Error deleting screenshot:", error)
    }
  }

  useEffect(() => {
    // Height update logic
    const updateDimensions = () => {
      if (contentRef.current) {
        let contentHeight = contentRef.current.scrollHeight
        const contentWidth = contentRef.current.scrollWidth
        if (isTooltipVisible) {
          contentHeight += tooltipHeight
        }
        window.electronAPI.updateContentDimensions({
          width: contentWidth,
          height: contentHeight
        })
      }
    }

    // Initialize resize observer
    const resizeObserver = new ResizeObserver(updateDimensions)
    if (contentRef.current) {
      resizeObserver.observe(contentRef.current)
    }
    updateDimensions()

    // Set up event listeners
    const cleanupFunctions = [
      window.electronAPI.onScreenshotTaken(() => refetch()),
      window.electronAPI.onResetView(() => refetch()),
      window.electronAPI.onDeleteLastScreenshot(async () => {
        if (screenshots.length > 0) {
          const lastScreenshot = screenshots[screenshots.length - 1];
          await handleDeleteScreenshot(screenshots.length - 1);
          // Toast removed as requested
        } else {
          showToast("No Screenshots", "There are no screenshots to delete", "neutral");
        }
      }),
      window.electronAPI.onSolutionError((error: string) => {
        showToast(
          "Processing Failed",
          "There was an error processing your screenshots.",
          "error"
        )
        setView("queue") // Revert to queue if processing fails
        console.error("Processing error:", error)
      }),
      window.electronAPI.onProcessingNoScreenshots(() => {
        showToast(
          "No Screenshots",
          "There are no screenshots to process.",
          "neutral"
        )
      }),
      // Removed out of credits handler - unlimited credits in this version
    ]

    return () => {
      resizeObserver.disconnect()
      cleanupFunctions.forEach((cleanup) => cleanup())
    }
  }, [isTooltipVisible, tooltipHeight, screenshots])

  const handleTooltipVisibilityChange = (visible: boolean, height: number) => {
    setIsTooltipVisible(visible)
    setTooltipHeight(height)
  }

  const handleOpenSettings = () => {
    window.electronAPI.openSettingsPortal();
  };

  const handleAudioQuestionProcessed = (solution: any) => {
    try {
      console.log('Queue: handleAudioQuestionProcessed called with solution:', solution);
      
      // When an audio question is processed, pass it up to the parent
      if (onQuestionProcessed) {
        console.log('Queue: Calling parent onQuestionProcessed callback...');
        onQuestionProcessed(solution);
        console.log('Queue: Parent onQuestionProcessed callback completed');
      }
      
      console.log('Queue: Setting view to solutions...');
      setView("solutions");
      console.log('Queue: View set to solutions successfully');
    } catch (error) {
      console.error('Queue: Error in handleAudioQuestionProcessed:', error);
      showToast("Error", "Failed to process audio question result", "error");
    }
  };
  
  return (
    <div ref={contentRef} className="bg-transparent">
      <div className="px-3 py-2">
        {/* Main button row - horizontal layout matching the attachment */}
        <div className="flex items-center gap-2 bg-black/50 rounded-lg px-3 py-2 border border-white/10 backdrop-blur-sm">
          
          {/* Start Interview Button */}
          <AudioManager
            onQuestionProcessed={handleAudioQuestionProcessed}
            className="flex-shrink-0"
          />
          
          {/* Take Screenshot Button */}
          <button
            onClick={async () => {
              try {
                await window.electronAPI.takeScreenshot();
              } catch (error) {
                console.error("Error taking screenshot:", error);
                showToast("Error", "Failed to take screenshot", "error");
              }
            }}
            className="flex items-center gap-1 px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded text-white text-sm font-medium transition-colors"
          >
            Take Screenshot
          </button>
          
          {/* Screenshot Hotkey */}
          <div className="flex items-center gap-1">
            <div className="bg-white/20 rounded px-2 py-1 text-xs text-white/70">⌘</div>
            <div className="bg-white/20 rounded px-2 py-1 text-xs text-white/70">H</div>
          </div>
          
          {/* Solve Screen Button */}
          {screenshots.length > 0 && (
            <button
              onClick={async () => {
                try {
                  const result = await window.electronAPI.triggerProcessScreenshots();
                  if (!result.success) {
                    console.error("Failed to process screenshots:", result.error);
                    showToast("Error", "Failed to process screenshots", "error");
                  }
                } catch (error) {
                  console.error("Error processing screenshots:", error);
                  showToast("Error", "Failed to process screenshots", "error");
                }
              }}
              className="flex items-center gap-1 px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded text-white text-sm font-medium transition-colors"
            >
              Solve Screen
            </button>
          )}
          
          {/* Solve Hotkey */}
          {screenshots.length > 0 && (
            <div className="flex items-center gap-1">
              <div className="bg-white/20 rounded px-2 py-1 text-xs text-white/70">⌘</div>
              <div className="bg-white/20 rounded px-2 py-1 text-xs text-white/70">↵</div>
            </div>
          )}
          
          {/* Show/Hide Button */}
          <button
            onClick={async () => {
              try {
                await window.electronAPI.toggleMainWindow();
              } catch (error) {
                console.error("Error toggling window:", error);
              }
            }}
            className="flex items-center gap-1 px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded text-white text-sm font-medium transition-colors"
          >
            Show/Hide
          </button>
          
          {/* Show/Hide Hotkey */}
          <div className="flex items-center gap-1">
            <div className="bg-white/20 rounded px-2 py-1 text-xs text-white/70">⌘</div>
            <div className="bg-white/20 rounded px-2 py-1 text-xs text-white/70">B</div>
          </div>
          
          {/* Settings */}
          <button
            onClick={handleOpenSettings}
            className="p-2 text-white/70 hover:text-white/90 transition-colors ml-2"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-4 h-4"
            >
              <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l-.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </button>
        </div>
        
        {/* Screenshots Display */}
        {screenshots.length > 0 && (
          <div className="mt-3">
            <ScreenshotQueue
              isLoading={false}
              screenshots={screenshots}
              onDeleteScreenshot={handleDeleteScreenshot}
            />
          </div>
        )}
      </div>
    </div>
  )
}

export default Queue
