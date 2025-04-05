"use client"

import type React from "react"

import { useConversation } from "@11labs/react"
import { useCallback, useEffect, useState, useRef } from "react"

interface ConversationProps {
  setQuestion: React.Dispatch<React.SetStateAction<string | null>>
  code: string
  interviewActive: boolean
  onCodeSuggestion?: (code: string) => void
  onAnalysisReceived?: (analysis: string) => void
  onDifficultySelected?: (difficulty: string) => void
}

// Function to intercept console.log
const interceptConsoleLog = () => {
  const originalLog = console.log
  console.log = (...args) => {
    // Call the original console.log
    originalLog.apply(console, args)

    // Dispatch a custom event with the logged data
    const event = new CustomEvent("console-log", { detail: args })
    window.dispatchEvent(event)
  }

  return () => {
    console.log = originalLog
  }
}

// Helper function to detect if a string contains a question
const containsQuestion = (text: string): boolean => {
  // Check for question marks
  if (text.includes("?")) return true

  // Check for common question starters
  const questionStarters = [
    "what",
    "how",
    "why",
    "when",
    "where",
    "which",
    "who",
    "whose",
    "whom",
    "can you",
    "could you",
    "would you",
    "will you",
    "do you",
    "did you",
    "is there",
    "are there",
    "explain",
    "describe",
    "tell me",
  ]

  const lowerText = text.toLowerCase()
  return questionStarters.some((starter) => lowerText.includes(starter))
}

// Helper function to extract a question from text
const extractQuestion = (text: string): string | null => {
  // Try to find the most likely question in the text

  // First, check for explicit markers
  const aiPrefixMatch = text.match(/AI:(.+)/i)
  const questionPrefixMatch = text.match(/Question:(.+)/i)

  if (aiPrefixMatch || questionPrefixMatch) {
    const extracted = (aiPrefixMatch?.[1] || questionPrefixMatch?.[1])?.trim()
    if (extracted && containsQuestion(extracted)) {
      return extracted
    }
  }

  // Look for sentences with question marks
  const sentences = text
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
  const questionSentences = sentences.filter((s) => s.endsWith("?"))

  if (questionSentences.length > 0) {
    // Return the longest question sentence (likely the most complete)
    return questionSentences.sort((a, b) => b.length - a.length)[0]
  }

  // If no question mark, look for sentences that start with question words
  const questionWords = ["what", "how", "why", "when", "where", "which", "who"]
  const potentialQuestions = sentences.filter((s) => questionWords.some((word) => s.toLowerCase().startsWith(word)))

  if (potentialQuestions.length > 0) {
    return potentialQuestions[0]
  }

  // If we still haven't found a question but the text contains "given" or "find" or "implement"
  // it might be a coding problem statement
  if (
    text.toLowerCase().includes("given") ||
    text.toLowerCase().includes("find") ||
    text.toLowerCase().includes("implement") ||
    text.toLowerCase().includes("write a") ||
    text.toLowerCase().includes("create a")
  ) {
    // Return the entire text if it's not too long, otherwise the first 200 chars
    return text.length > 200 ? text.substring(0, 200) + "..." : text
  }

  return null
}

export function Conversation({
  setQuestion,
  code,
  interviewActive,
  onCodeSuggestion,
  onAnalysisReceived,
  onDifficultySelected,
}: ConversationProps) {
  const [aiAnalysis, setAiAnalysis] = useState<string>("")
  const [status, setStatus] = useState<string>("idle")
  const [capturedLogs, setCapturedLogs] = useState<string[]>([])
  const [difficulty, setDifficulty] = useState<string>("")
  const [debugMode, setDebugMode] = useState<boolean>(false)

  // Ref to store the cleanup function for console.log interception
  const cleanupRef = useRef<(() => void) | null>(null)

  // Ref to store recent logs for context-aware processing
  const recentLogsRef = useRef<string[]>([])

  const conversation = useConversation({
    onConnect: () => console.log("Connected to AI interviewer"),
    onDisconnect: () => console.log("Disconnected from AI interviewer"),
    onMessage: (message: any) => {
      console.log("AI message:", message)

      // If the message contains code suggestion, update the editor
      if (message.codeSuggestion && onCodeSuggestion) {
        onCodeSuggestion(message.codeSuggestion)
      }

      // If the message contains analysis, update the AI analysis state
      if (message.analysis) {
        const analysis = typeof message.analysis === "string" ? message.analysis : JSON.stringify(message.analysis)
        setAiAnalysis(analysis)
        if (onAnalysisReceived) {
          onAnalysisReceived(analysis)
        }
      }

      // If the message contains a question, update it
      if (message.question) {
        setQuestion(message.question)
      }
    },
    onError: (error: any) => console.error("AI conversation error:", error),
  })

  // Process a batch of recent logs to extract context
  const processRecentLogs = useCallback(() => {
    if (recentLogsRef.current.length === 0) return

    // Join recent logs to get more context
    const combinedText = recentLogsRef.current.join(" ")

    // Try to extract a question from the combined text
    const extractedQuestion = extractQuestion(combinedText)

    if (extractedQuestion) {
      console.log("Extracted question from logs:", extractedQuestion)
      setQuestion(extractedQuestion)

      // Add to captured logs for display
      setCapturedLogs((prev) => [...prev, `Detected Question: ${extractedQuestion}`])
    }

    // Check for difficulty mentions
    const difficultyMatch = combinedText.match(/\b(easy|medium|hard)\b/i)
    if (difficultyMatch) {
      const detectedDifficulty = difficultyMatch[0].toLowerCase()
      console.log("Detected difficulty level:", detectedDifficulty)

      // Only update if it's a new difficulty
      if (detectedDifficulty !== difficulty) {
        setDifficulty(detectedDifficulty)
        if (onDifficultySelected) {
          onDifficultySelected(detectedDifficulty)
        }

        // Add to captured logs
        setCapturedLogs((prev) => [...prev, `Detected Difficulty: ${detectedDifficulty}`])
      }
    }

    // Clear the recent logs buffer
    recentLogsRef.current = []
  }, [difficulty, onDifficultySelected, setQuestion])

  // Set up console.log interception
  useEffect(() => {
    // Set up the console.log interceptor
    cleanupRef.current = interceptConsoleLog()

    // Set up event listener for console logs
    const handleConsoleLog = (event: CustomEvent) => {
      const args = event.detail

      // Convert args to string for easier processing
      const logString = args.map((arg: any) => (typeof arg === "object" ? JSON.stringify(arg) : String(arg))).join(" ")

      // Add to debug logs if in debug mode
      if (debugMode) {
        setCapturedLogs((prev) => [...prev, `DEBUG: ${logString}`])
      }

      // Skip logs that are likely not from the AI
      if (
        logString.includes("Error:") ||
        logString.includes("Warning:") ||
        logString.includes("TypeError:") ||
        logString.startsWith("{") ||
        logString.includes("undefined") ||
        logString.includes("null")
      ) {
        return
      }

      // Add to recent logs for context-aware processing
      recentLogsRef.current.push(logString)

      // Process immediately if this log looks important
      if (
        logString.includes("AI:") ||
        logString.includes("Question:") ||
        logString.includes("?") ||
        logString.toLowerCase().includes("given") ||
        logString.toLowerCase().includes("write a function")
      ) {
        // Add to captured logs for display
        setCapturedLogs((prev) => [...prev, logString])

        // Process the recent logs to extract context
        processRecentLogs()
      } else {
        // If not processed immediately, schedule processing after a short delay
        // to collect more context
        setTimeout(processRecentLogs, 500)
      }
    }

    window.addEventListener("console-log", handleConsoleLog as EventListener)

    // Set up a periodic processor for recent logs
    const intervalId = setInterval(processRecentLogs, 2000)

    return () => {
      // Clean up the console.log interceptor
      if (cleanupRef.current) {
        cleanupRef.current()
      }
      window.removeEventListener("console-log", handleConsoleLog as EventListener)
      clearInterval(intervalId)
    }
  }, [debugMode, processRecentLogs])

  // Monitor code changes to provide real-time analysis
  useEffect(() => {
    if (interviewActive && conversation.status === "connected" && code) {
      // Debounce to avoid too many updates
      const timer = setTimeout(() => {
        // Check if the conversation object has the right method
        // Log the issue for debugging
        console.log("Code analysis: Sending code analysis request")

        // Trigger analysis logic
        if (onAnalysisReceived) {
          onAnalysisReceived("Code analysis in progress...")
        }
      }, 2000) // 2 second debounce

      return () => clearTimeout(timer)
    }
  }, [code, interviewActive, conversation, onAnalysisReceived])

  let conversationId = ""

  const startConversation = useCallback(async () => {
    try {
      console.log("Starting conversation with AI interviewer...")

      // Request microphone permission
      await navigator.mediaDevices.getUserMedia({ audio: true })
      console.log("Microphone permission granted")

      // Start the conversation with your agent
      console.log("Initializing conversation with agent ID: xldUPMhwBXKBwL2syRhs")
      conversationId = await conversation.startSession({
        agentId: "xldUPMhwBXKBwL2syRhs", // Replace with your agent ID
        clientTools: {
          getUserResponse: async () => {
            console.log("AI requested code, sending current code")
            return code
          },
          sendNewQuestion: async ({ question }) => {
            console.log("AI sent new question:", question)
            setQuestion(question)
          },
          // Function to allow the AI to suggest code
          suggestCode: async ({ code: suggestedCode }) => {
            console.log("AI suggested code")
            if (onCodeSuggestion) {
              onCodeSuggestion(suggestedCode)
            }
            // Return void instead of an object
            return
          },
          // Function to allow the AI to provide analysis
          provideAnalysis: async ({ analysis }) => {
            console.log("AI provided analysis")
            if (onAnalysisReceived) {
              onAnalysisReceived(analysis)
            }
            // Return void instead of an object
            return
          },
          // Function to get the current difficulty level
          getDifficulty: async () => {
            return difficulty
          },
        },
      })
      console.log("Conversation started successfully with ID:", conversationId)

      // Clear previous logs when starting a new conversation
      setCapturedLogs([])
      recentLogsRef.current = []
    } catch (error) {
      console.error("Failed to start conversation:", error)
      // Force status update to ensure buttons are clickable
      setStatus("idle")
    }
  }, [conversation, code, setQuestion, onCodeSuggestion, onAnalysisReceived, difficulty])

  function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  const stopConversation = useCallback(async () => {
    try {
      console.log("Stopping conversation...")

      // Force status update immediately to prevent further interactions
      setStatus("disconnected")

      // Stop the AI bot
      await conversation.endSession()
      console.log("Conversation ended successfully")

      // Clear any speaking state
      if (conversation.isSpeaking) {
        console.log("Forcing speaking state to stop")
        // This might be implementation-specific, but we want to ensure
        // the UI doesn't show the bot as still speaking
      }
      const conversationId = "qJlW0nwMdwpbk43cHF7Q";
      console.log("CONVO ID:", conversationId)

      // Only attempt to fetch feedback if we have a conversation ID
      if (conversationId) {
        
        const url = "https://api.elevenlabs.io/v1/convai/conversations/" + conversationId
        console.log("Fetching conversation feedback from:", url)

        await sleep(2000) // Reduced sleep time for testing

        const options = {
          method: "GET",
          headers: { "xi-api-key": "sk_3767d27ab980c4c5798b0853220ea0baccea0185e64709b7" },
        }

        try {
          const response = await fetch(url, options)
          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`)
          }
          const data = await response.json()
          console.log("Received feedback data:", data)

          // Check if the expected data structure exists
          if (data?.analysis?.evaluation_criteria_results?.quality_of_verbal_explanation?.rationale) {
            const feedback = data.analysis.evaluation_criteria_results.quality_of_verbal_explanation.rationale
            if (onAnalysisReceived) {
              onAnalysisReceived(feedback)
            }
          } else {
            console.warn("Expected feedback structure not found in response")
            if (onAnalysisReceived) {
              onAnalysisReceived("Feedback analysis not available. Please try again.")
            }
          }
        } catch (error) {
          console.error("Error fetching feedback:", error)
          if (onAnalysisReceived) {
            onAnalysisReceived("Error retrieving feedback. Please try again.")
          }
        }
      } else {
        console.warn("No conversation ID available for feedback")
      }
    } catch (error) {
      console.error("Error stopping conversation:", error)
    } finally {
      // Force status update to ensure buttons are clickable
      setStatus("idle")

      // Add this to ensure the UI reflects that the conversation has ended
      if (conversation.status === "connected") {
        console.log("Forcing conversation status to disconnected")
        // This is a fallback in case the endSession didn't properly update the status
      }
    }
  }, [conversation, conversationId, onAnalysisReceived])

  // Auto-start conversation when interview becomes active
  useEffect(() => {
    if (interviewActive && conversation.status !== "connected") {
      startConversation()
    }
  }, [interviewActive, conversation.status, startConversation])

  // Toggle debug mode
  const toggleDebugMode = () => {
    setDebugMode((prev) => !prev)
    setCapturedLogs((prev) => [...prev, `Debug mode ${!debugMode ? "enabled" : "disabled"}`])
  }

  return (
    <div className="flex flex-col z-50 items-center gap-4">
      <div className="flex gap-2">
        <button
          onClick={startConversation}
          className={`px-4 py-2 text-white rounded ${
            conversation.status === "connected" ? "bg-gray-500" : "bg-green-500 hover:bg-green-600"
          }`}
        >
          {conversation.status === "connecting" ? "Connecting..." : "Start Conversation"}
        </button>
        <button
          onClick={stopConversation}
          className={`px-4 py-2 text-white rounded ${
            conversation.status !== "connected" ? "bg-gray-500" : "bg-red-500 hover:bg-red-600"
          }`}
        >
          Stop Conversation
        </button>
        <button
          onClick={toggleDebugMode}
          className="px-4 py-2 text-white rounded bg-gray-700 hover:bg-gray-600"
          title="Toggle debug mode to see all console logs"
        >
          {debugMode ? "Disable Debug" : "Enable Debug"}
        </button>
      </div>

      {conversation.status === "connected" && (
        <div className="w-full p-3 bg-[#2D3B4A] rounded-lg mt-2">
          <p className="text-sm text-gray-300 mb-1">
            <span className="inline-block w-2 h-2 bg-green-500 rounded-full mr-2"></span>
            AI Interviewer is active
          </p>
          {conversation.isSpeaking && <p className="text-xs text-gray-400">Speaking...</p>}
        </div>
      )}

      {aiAnalysis && (
        <div className="w-full p-3 bg-[#2D3B4A] rounded-lg mt-2">
          <h4 className="text-sm font-medium mb-1">Real-time Analysis</h4>
          <p className="text-xs text-gray-300">{aiAnalysis}</p>
        </div>
      )}

      {capturedLogs.length > 0 && (
        <div className="w-full p-3 bg-[#2D3B4A] rounded-lg mt-2">
          <div className="flex justify-between items-center mb-2">
            <h4 className="text-sm font-medium">Conversation Log</h4>
            <button
              onClick={() => setCapturedLogs([])}
              className="text-xs bg-gray-700 hover:bg-gray-600 px-2 py-1 rounded"
            >
              Clear
            </button>
          </div>
          <div className="text-xs text-gray-300 max-h-40 overflow-y-auto">
            {capturedLogs.map((log, index) => (
              <div key={index} className="mb-1 pb-1 border-b border-gray-700">
                {log}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

