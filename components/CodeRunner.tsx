"use client"

import { useState, useEffect, useRef } from "react"
import Editor from "@monaco-editor/react"
import Webcam from "react-webcam"
import { Conversation } from "@/components/Conversation"

declare global {
  interface Window {
    loadPyodide: ((config: { indexURL: string }) => Promise<any>) | undefined
    pyodide: any
  }
}

interface CodeRunnerProps {
  language: string
  initialCode: string
}

export default function CodeRunner({ language, initialCode }: CodeRunnerProps) {
  // State management
  const [code, setCode] = useState<string>(initialCode)
  const [output, setOutput] = useState<string>("")
  const [pyodideReady, setPyodideReady] = useState<boolean>(false)
  const [loading, setLoading] = useState<boolean>(true)
  const [loadingStatus, setLoadingStatus] = useState<string>("Loading Python environment...")
  const [isRecording, setIsRecording] = useState(false)
  const [timer, setTimer] = useState(0)
  const [question, setQuestion] = useState<string | null>(null)
  const [currentCode, setCurrentCode] = useState<string>(initialCode)
  const [selectedDifficulty, setSelectedDifficulty] = useState<string>("")
  const [interviewStarted, setInterviewStarted] = useState<boolean>(false)
  const [feedback, setFeedback] = useState<string>("")
  const [aiSuggestions, setAiSuggestions] = useState<string[]>([])
  const [currentAnalysis, setCurrentAnalysis] = useState<string>("")

  // Refs
  const editorRef = useRef<any>(null)
  const webcamRef = useRef<any>(null)
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const scriptRef = useRef<HTMLScriptElement | null>(null)

  // Initialize Pyodide
  useEffect(() => {
    // Function to load the Pyodide script
    const loadPyodideScript = () => {
      return new Promise<void>((resolve, reject) => {
        // Check if script is already loaded
        if (window.loadPyodide) {
          resolve()
          return
        }

        // Check if script is already being loaded
        if (scriptRef.current) {
          const checkIfLoaded = setInterval(() => {
            if (window.loadPyodide) {
              clearInterval(checkIfLoaded)
              resolve()
            }
          }, 100)
          return
        }

        setLoadingStatus("Loading Pyodide script...")

        // Create and append the script
        const script = document.createElement("script")
        script.src = "https://cdn.jsdelivr.net/pyodide/v0.24.1/full/pyodide.js"
        script.async = true
        script.defer = true

        script.onload = () => {
          setLoadingStatus("Pyodide script loaded, initializing...")
          resolve()
        }

        script.onerror = (e) => {
          setLoadingStatus("Failed to load Pyodide. Check your connection and try again.")
          setLoading(false)
          reject(new Error("Failed to load Pyodide script"))
        }

        document.body.appendChild(script)
        scriptRef.current = script
      })
    }

    // Function to initialize Pyodide after script is loaded
    const initializePyodide = async () => {
      try {
        setLoadingStatus("Initializing Python environment...")

        // Wait for loadPyodide to be available
        let attempts = 0
        while (!window.loadPyodide && attempts < 50) {
          await new Promise((resolve) => setTimeout(resolve, 100))
          attempts++
        }

        if (!window.loadPyodide) {
          throw new Error("Pyodide not available after waiting")
        }

        // Load Pyodide
        const pyodide = await window.loadPyodide({
          indexURL: "https://cdn.jsdelivr.net/pyodide/v0.24.1/full/",
        })

        setLoadingStatus("Setting up Python environment...")

        // Set up stdout/stderr capture
        await pyodide.runPythonAsync(`
          import sys
          from io import StringIO
          
          class CaptureOutput:
              def __init__(self):
                  self.stdout = StringIO()
                  self.stderr = StringIO()
              
              def write(self, text):
                  self.stdout.write(text)
              
              def flush(self):
                  pass
          
          sys.stdout = CaptureOutput()
          sys.stderr = sys.stdout
        `)

        window.pyodide = pyodide
        setPyodideReady(true)
        setLoading(false)
        setLoadingStatus("Python environment ready")
      } catch (error) {
        console.error("Pyodide initialization error:", error)
        setOutput(`Failed to initialize Pyodide: ${error instanceof Error ? error.message : String(error)}`)
        setLoadingStatus("Failed to initialize Python environment. Try refreshing the page.")
        setLoading(false)
      }
    }

    // Main initialization flow
    const initialize = async () => {
      try {
        await loadPyodideScript()
        await initializePyodide()
      } catch (error) {
        console.error("Initialization error:", error)
        setLoadingStatus("Error initializing. Please refresh the page and try again.")
        setLoading(false)
      }
    }

    initialize()

    // Cleanup function
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
      }
      // We don't remove the script on cleanup as it might be used by other components
    }
  }, [])

  // Update current code when editor changes
  useEffect(() => {
    if (editorRef.current) {
      const updateCurrentCode = () => {
        setCurrentCode(editorRef.current.getValue() || code)
      }

      // Set up an interval to periodically update the current code
      const interval = setInterval(updateCurrentCode, 1000)

      return () => clearInterval(interval)
    }
  }, [code, editorRef])

  // Timer effect
  useEffect(() => {
    if (isRecording) {
      timerRef.current = setInterval(() => {
        setTimer((prev) => prev + 1)
      }, 1000)
    } else if (timerRef.current) {
      clearInterval(timerRef.current)
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
      }
    }
  }, [isRecording])

  // Run code function
  const runCode = async () => {
    if (!pyodideReady || !window.pyodide) {
      setOutput(`${loadingStatus} Please wait until the environment is fully loaded.`)
      return
    }

    setOutput("Running...")
    const codeToRun = editorRef.current?.getValue() || code
    setCurrentCode(codeToRun) // Update current code for the conversation component

    try {
      await window.pyodide.runPythonAsync(`
        sys.stdout.stdout.truncate(0)
        sys.stdout.stdout.seek(0)
      `)

      const result = await window.pyodide.runPythonAsync(codeToRun)

      const stdout = await window.pyodide.runPythonAsync(`
        output = sys.stdout.stdout.getvalue()
        sys.stdout.stdout.truncate(0)
        sys.stdout.stdout.seek(0)
        output
      `)

      let finalOutput = stdout || ""
      if (result !== undefined && result !== null) {
        finalOutput += (finalOutput ? "\n" : "") + String(result)
      }

      setOutput(finalOutput || "Code executed successfully (no output)")
    } catch (error) {
      setOutput(`Python Error: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  // Recording controls
  const toggleRecording = () => {
    if (isRecording) {
      setIsRecording(false)
      console.log("Recording stopped")
    } else {
      setIsRecording(true)
      setTimer(0)
    }
  }

  // Format timer display
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`
  }

  // Handle difficulty selection from AI conversation
  const handleDifficultySelected = (difficulty: string) => {
    console.log(`Difficulty selected by AI: ${difficulty}`)
    setSelectedDifficulty(difficulty)
  }

  // Start interview
  const startInterview = () => {
    setInterviewStarted(true)
    setTimer(0)
    setIsRecording(true)
    setFeedback("") // Clear any previous feedback
    setAiSuggestions([]) // Clear any previous AI suggestions
    setCurrentAnalysis("") // Clear any previous analysis
    setQuestion(null) // Clear any previous question

    console.log("Interview started. Waiting for AI to ask questions...")
  }

  // End interview
  const endInterview = () => {
    setInterviewStarted(false)
    setIsRecording(false)

    console.log("Interview ended, waiting for final feedback")

    // Set a temporary feedback message while waiting for the AI
    setFeedback("Analyzing your interview performance...")
  }

  // Handle AI code suggestion
  const handleCodeSuggestion = (suggestedCode: string) => {
    // Add to suggestions list
    setAiSuggestions((prev) => [...prev, suggestedCode])

    // Optionally, directly update the editor with the AI's code
    if (editorRef.current) {
      editorRef.current.setValue(suggestedCode)
      setCode(suggestedCode)
      setCurrentCode(suggestedCode)
    }
  }

  // Handle AI analysis
  const handleAnalysisReceived = (analysis: string) => {
    console.log("Analysis received from AI")
    setCurrentAnalysis(analysis)

    // If interview is over, set as final feedback
    if (!interviewStarted) {
      setFeedback(analysis)
    }
  }

  // Apply AI suggestion to editor
  const applySuggestion = (suggestionCode: string) => {
    if (editorRef.current) {
      editorRef.current.setValue(suggestionCode)
      setCode(suggestionCode)
      setCurrentCode(suggestionCode)
    }
  }

  return (
    <div className="flex flex-col lg:flex-row h-screen bg-[#1D2B3A] text-white">
      {/* Left Panel - Interview Question */}
      <div className="w-full lg:w-1/2 p-4 lg:p-6 overflow-y-auto border-b lg:border-b-0 lg:border-r border-[#2D3B4A]">
        <div className="mb-6">
          <h2 className="text-2xl font-bold mb-2">AI Coding Interview</h2>
          <div className="flex items-center gap-2 mb-4">
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#2D3B4A] text-gray-300">
              {language.toUpperCase()}
            </span>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#2D3B4A] text-gray-300">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-3 w-3 mr-1"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              45 min
            </span>
            {interviewStarted && (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-900 text-red-200">
                <div className="w-2 h-2 rounded-full bg-red-500 mr-1 animate-pulse"></div>
                {formatTime(timer)}
              </span>
            )}
            {selectedDifficulty && (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-900 text-blue-200">
                {selectedDifficulty.charAt(0).toUpperCase() + selectedDifficulty.slice(1)}
              </span>
            )}
          </div>
          <p className="text-sm text-gray-400">
            The AI interviewer will ask you coding questions and analyze your solutions in real-time. Speak naturally
            and code your solutions in the editor.
          </p>
        </div>

        {/* Interview Controls */}
        {!interviewStarted && !feedback && (
          <div className="mb-6">
            <button
              onClick={startInterview}
              className="w-full py-2 bg-green-600 hover:bg-green-700 text-white rounded-md font-medium"
            >
              Start Interview
            </button>
            <p className="text-xs text-gray-400 mt-2">
              The AI will ask about your preferred difficulty level and then present coding challenges.
            </p>
          </div>
        )}

        {/* Question Display */}
        {(interviewStarted || feedback) && question && (
          <div className="bg-[#2D3B4A] rounded-lg p-4 mb-6">
            <h3 className="text-lg font-medium mb-3">Current Question</h3>
            <div className="text-gray-300 prose prose-invert prose-sm max-w-none">
              <div dangerouslySetInnerHTML={{ __html: question.replace(/\n/g, "<br/>") }} />
            </div>
          </div>
        )}

        {/* AI Analysis Display */}
        {currentAnalysis && interviewStarted && (
          <div className="bg-[#2D3B4A] rounded-lg p-4 mb-6">
            <h3 className="text-lg font-medium mb-3">Real-time Analysis</h3>
            <div className="text-gray-300 prose prose-invert prose-sm max-w-none">
              <div dangerouslySetInnerHTML={{ __html: currentAnalysis.replace(/\n/g, "<br/>") }} />
            </div>
          </div>
        )}

        {/* Feedback Display */}
        {feedback && !interviewStarted && (
          <div className="bg-[#2D3B4A] rounded-lg p-4 mb-6">
            <h3 className="text-lg font-medium mb-3">Interview Feedback</h3>
            <div className="text-gray-300 prose prose-invert prose-sm max-w-none">
              <div dangerouslySetInnerHTML={{ __html: feedback.replace(/\n/g, "<br/>") }} />
            </div>
          </div>
        )}

        {/* AI Code Suggestions */}
        {aiSuggestions.length > 0 && (
          <div className="bg-[#2D3B4A] rounded-lg p-4 mb-6">
            <h3 className="text-lg font-medium mb-3">AI Code Suggestions</h3>
            <div className="space-y-2">
              {aiSuggestions.map((suggestion, index) => (
                <div key={index} className="border border-gray-700 rounded-md p-3">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-medium">Suggestion {index + 1}</span>
                    <button
                      onClick={() => applySuggestion(suggestion)}
                      className="text-xs bg-blue-600 hover:bg-blue-700 px-2 py-1 rounded"
                    >
                      Apply
                    </button>
                  </div>
                  <pre className="text-xs bg-[#1E1E1E] p-2 rounded overflow-x-auto">
                    {suggestion.length > 200 ? suggestion.substring(0, 200) + "..." : suggestion}
                  </pre>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Interview Controls */}
        {interviewStarted && (
          <div className="mb-6">
            <button
              onClick={endInterview}
              className="w-full py-2 bg-red-600 hover:bg-red-700 text-white rounded-md font-medium"
            >
              End Interview & Get Feedback
            </button>
          </div>
        )}

        {/* Reset Button (when feedback is shown) */}
        {feedback && !interviewStarted && (
          <div className="mb-6">
            <button
              onClick={() => {
                setFeedback("")
                setSelectedDifficulty("")
                setQuestion(null)
                setCode(initialCode)
                if (editorRef.current) {
                  editorRef.current.setValue(initialCode)
                }
                setCurrentCode(initialCode)
                setTimer(0)
                setAiSuggestions([])
                setCurrentAnalysis("")
              }}
              className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-medium"
            >
              Start New Interview
            </button>
          </div>
        )}

        {/* Conversation Controls */}
        <div className="mt-6">
          <Conversation
            setQuestion={setQuestion}
            code={currentCode}
            interviewActive={interviewStarted}
            onCodeSuggestion={handleCodeSuggestion}
            onAnalysisReceived={handleAnalysisReceived}
            onDifficultySelected={handleDifficultySelected}
          />
        </div>
      </div>

      {/* Right Panel - Code Editor */}
      <div className="w-full lg:w-1/2 flex flex-col bg-[#1E1E1E] relative flex-grow">
        <div className="flex-1 p-4 lg:p-6 flex flex-col">
          <div className="flex-grow mb-4">
            <Editor
              height="50vh"
              language={language}
              value={code}
              theme="vs-dark"
              onChange={(value) => {
                setCode(value || "")
                if (editorRef.current) {
                  setCurrentCode(editorRef.current.getValue() || value || "")
                }
              }}
              onMount={(editor) => {
                editorRef.current = editor
                setCurrentCode(editor.getValue() || code)
              }}
              options={{
                minimap: { enabled: false },
                fontSize: 14,
                lineNumbers: "on",
                scrollBeyondLastLine: false,
                automaticLayout: true,
                fontFamily: "'JetBrains Mono', monospace, Menlo, Monaco, 'Courier New', monospace",
              }}
            />
          </div>

          <div className="flex justify-between items-center mb-4">
            <button
              onClick={runCode}
              disabled={loading || !pyodideReady}
              className={`px-4 py-2 rounded-md flex items-center ${
                loading || !pyodideReady ? "bg-gray-600 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-700"
              }`}
            >
              {loading ? (
                <>
                  <svg
                    className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                  {loadingStatus}
                </>
              ) : (
                <>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-4 w-4 mr-2"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polygon points="5 3 19 12 5 21 5 3" />
                  </svg>
                  Run Code
                </>
              )}
            </button>

            <button
              onClick={toggleRecording}
              className={`px-4 py-2 rounded-md flex items-center ${
                isRecording ? "bg-red-600 hover:bg-red-700" : "bg-gray-700 hover:bg-gray-600 border border-gray-600"
              }`}
            >
              {isRecording ? (
                <>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-4 w-4 mr-2"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect x="6" y="6" width="12" height="12" />
                  </svg>
                  Stop Recording
                </>
              ) : (
                <>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-4 w-4 mr-2"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polygon points="23 7 16 12 23 17 23 7" />
                    <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                  </svg>
                  Start Recording
                </>
              )}
            </button>
          </div>

          <div className="bg-[#2D2D2D] rounded-lg overflow-hidden border border-gray-800">
            <div className="py-2 px-4 border-b border-gray-800 flex flex-row items-center justify-between bg-[#252525]">
              <span className="text-sm font-medium">Output</span>
              {isRecording && (
                <div className="flex items-center">
                  <div className="w-2 h-2 rounded-full bg-red-500 mr-2 animate-pulse"></div>
                  <span className="text-xs text-gray-400">{formatTime(timer)}</span>
                </div>
              )}
            </div>
            <pre className="p-4 font-mono text-sm h-[20vh] overflow-y-auto text-gray-300 whitespace-pre-wrap">
              {output || (loading ? loadingStatus : "Output will appear here...")}
            </pre>
          </div>
        </div>

        {/* Webcam */}
        <div className="absolute bottom-4 right-4 z-50">
          <div className="relative">
            <Webcam
              mirrored
              audio
              muted
              ref={webcamRef}
              videoConstraints={{ facingMode: "user" }}
              onUserMedia={() => console.log("Webcam ready")}
              className="rounded-lg w-[160px] h-[120px] object-cover border-2 border-gray-700 shadow-lg"
            />
            {isRecording && (
              <div className="absolute top-2 right-2 flex items-center bg-black bg-opacity-60 rounded-full px-2 py-1">
                <div className="w-2 h-2 rounded-full bg-red-500 mr-1 animate-pulse"></div>
                <span className="text-xs">{formatTime(timer)}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

