"use client"

import { useState, useCallback } from "react"

// Define the return type of useConversation to include the methods we need
interface ConversationInterface {
  status: "idle" | "connecting" | "connected" | "disconnected"
  isSpeaking: boolean
  startSession: (config: any) => Promise<string>
  endSession: () => Promise<boolean>
  // Add sendMessage if your implementation supports it
  sendMessage?: (message: any) => Promise<void>
}

export function useConversation(options: any): ConversationInterface {
  const [status, setStatus] = useState<"idle" | "connecting" | "connected" | "disconnected">("idle")
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false)

  const startSession = useCallback(
    async (config: any) => {
      try {
        console.log("Starting session with config:", config)
        setStatus("connecting")

        // Simulate connection delay
        await new Promise((resolve) => setTimeout(resolve, 500))

        options?.onConnect?.()
        setStatus("connected")

        // Simulate AI speaking
        setIsSpeaking(true)
        setTimeout(() => {
          setIsSpeaking(false)
          // Send a mock message to demonstrate the AI's capabilities
          if (options?.onMessage) {
            // Simulate the AI asking for difficulty level
            console.log("AI: What difficulty level would you like to practice? Easy, medium, or hard?")

            // After a delay, simulate the user responding and AI providing a question
            setTimeout(() => {
              console.log("User selected difficulty: medium")
              console.log(
                "AI: Great! Here's a medium difficulty question: Given an array of integers, find the longest subarray with a sum equal to k.",
              )

              if (options.onMessage) {
                options.onMessage({
                  analysis:
                    "I'll be analyzing your approach to this problem. Remember to consider edge cases and time complexity.",
                })
              }
            }, 3000)
          }
        }, 2000)

        return "JPmANwIm6hpvBY1iq7Tz" // Mock conversation ID
      } catch (error) {
        console.error("Error in startSession:", error)
        setStatus("idle")
        throw error
      }
    },
    [options],
  )

  // Update the endSession function to ensure it properly stops the conversation
  const endSession = useCallback(async () => {
    try {
      console.log("Ending session")

      // Immediately set status to disconnected
      setStatus("disconnected")

      // Stop any speaking that might be happening
      setIsSpeaking(false)

      // Notify the caller
      options?.onDisconnect?.()

      // Send a final analysis message
      if (options?.onMessage) {
        setTimeout(() => {
          options.onMessage({
            analysis:
              "## Final Analysis\n\nYour solution demonstrates good problem-solving skills. Consider optimizing the time complexity in future iterations.",
          })
        }, 1000)
      }

      return true
    } catch (error) {
      console.error("Error in endSession:", error)
      setStatus("idle")
      throw error
    }
  }, [options])

  const sendMessage = useCallback(
    async (message: any) => {
      try {
        console.log("Sending message to AI:", message)
        setIsSpeaking(true)

        // Simulate processing delay
        await new Promise((resolve) => setTimeout(resolve, 1000))

        // If this is code analysis, simulate AI analyzing the code
        if (message.type === "code_analysis" && message.code) {
          console.log("AI analyzing code...")

          // Simulate AI response after analyzing code
          if (options?.onMessage) {
            options.onMessage({
              analysis: "Your approach looks good. Consider adding error handling for edge cases like empty arrays.",
            })
          }
        }

        setIsSpeaking(false)
      } catch (error) {
        console.error("Error in sendMessage:", error)
        setIsSpeaking(false)
      }
    },
    [options],
  )

  return {
    status,
    isSpeaking,
    startSession,
    endSession,
    sendMessage,
  }
}
