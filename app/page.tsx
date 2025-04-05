"use client"

import { AnimatePresence, motion } from "framer-motion"
import { RadioGroup } from "@headlessui/react"
import { v4 as uuid } from "uuid"
import Link from "next/link"
import { useRef, useState, useEffect, useCallback } from "react"
import Webcam from "react-webcam"
import { createFFmpeg, fetchFile } from "@ffmpeg/ffmpeg"
import CodeRunner from "@/components/CodeRunner"
import UploadStep from "@/components/UploadStep"

const questions = [
  {
    id: 1,
    name: "Technical",
    description: "Practice your technical skills with a coding assessment.",
  },
  {
    id: 2,
    name: "Behavioral",
    description: "Practice answering questions about your experience.",
  },
]

const interviewers = [
  {
    id: "John",
    name: "Easy",
    description: "Software Engineering",
    level: "L3",
    difficulty: "Easy",
  },
  {
    id: "Richard",
    name: "Medium",
    description: "Engineering Manager",
    level: "L5",
    difficulty: "Medium",
  },
  {
    id: "Sarah",
    name: "Hard",
    description: "Director of Engineering",
    level: "L7",
    difficulty: "Hard",
  },
]

const ffmpeg = createFFmpeg({
  corePath: "https://unpkg.com/@ffmpeg/core@0.11.0/dist/ffmpeg-core.js",
  log: true,
})

function classNames(...classes: string[]) {
  return classes.filter(Boolean).join(" ")
}

export default function DemoPage() {
  const [selected, setSelected] = useState(questions[0])
  const [selectedInterviewer, setSelectedInterviewer] = useState(interviewers[0])
  const [step, setStep] = useState(0)
  const [loading, setLoading] = useState(true)
  const webcamRef = useRef<Webcam | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const [capturing, setCapturing] = useState(false)
  const [recordedChunks, setRecordedChunks] = useState<Blob[]>([])
  const [seconds, setSeconds] = useState(150)
  const [videoEnded, setVideoEnded] = useState(false)
  const [recordingPermission, setRecordingPermission] = useState(true)
  const [cameraLoaded, setCameraLoaded] = useState(false)
  const vidRef = useRef<HTMLVideoElement>(null)
  const [isSubmitting, setSubmitting] = useState(false)
  const [status, setStatus] = useState("Processing")
  const [isSuccess, setIsSuccess] = useState(false)
  const [isVisible, setIsVisible] = useState(true)
  const [isDesktop, setIsDesktop] = useState(false)
  const [completed, setCompleted] = useState(false)
  const [transcript, setTranscript] = useState("")
  const [generatedFeedback, setGeneratedFeedback] = useState("")

  useEffect(() => {
    setIsDesktop(window.innerWidth >= 768)
  }, [])

  useEffect(() => {
    if (videoEnded) {
      const element = document.getElementById("startTimer")

      if (element) {
        element.style.display = "flex"
      }

      setCapturing(true)
      setIsVisible(false)

      mediaRecorderRef.current = new MediaRecorder(webcamRef?.current?.stream as MediaStream)
      mediaRecorderRef.current.addEventListener("dataavailable", handleDataAvailable)
      mediaRecorderRef.current.start()
    }
  }, [videoEnded, webcamRef, setCapturing, mediaRecorderRef])

  const handleStartCaptureClick = useCallback(() => {
    const startTimer = document.getElementById("startTimer")
    if (startTimer) {
      startTimer.style.display = "none"
    }
  }, [webcamRef, setCapturing, mediaRecorderRef])

  const handleDataAvailable = useCallback(
    ({ data }: BlobEvent) => {
      if (data.size > 0) {
        setRecordedChunks((prev) => prev.concat(data))
      }
    },
    [setRecordedChunks],
  )

  const handleStopCaptureClick = useCallback(() => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop()
    }
    setCapturing(false)
  }, [mediaRecorderRef, webcamRef, setCapturing])

  useEffect(() => {
    let timer: any = null
    if (capturing) {
      timer = setInterval(() => {
        setSeconds((seconds) => seconds - 1)
      }, 1000)
      if (seconds === 0) {
        handleStopCaptureClick()
        setCapturing(false)
        setSeconds(0)
      }
    }
    return () => {
      clearInterval(timer)
    }
  })

  const handleDownload = async () => {
    if (recordedChunks.length) {
      setSubmitting(true)
      setStatus("Processing")

      const file = new Blob(recordedChunks, {
        type: `video/webm`,
      })

      const unique_id = uuid()

      if (!ffmpeg.isLoaded()) {
        await ffmpeg.load()
      }

      ffmpeg.FS("writeFile", `${unique_id}.webm`, await fetchFile(file))
      await ffmpeg.run(
        "-i",
        `${unique_id}.webm`,
        "-vn",
        "-acodec",
        "libmp3lame",
        "-ac",
        "1",
        "-ar",
        "16000",
        "-f",
        "mp3",
        `${unique_id}.mp3`,
      )

      const fileData = ffmpeg.FS("readFile", `${unique_id}.mp3`)
      const output = new File([new Uint8Array(fileData.buffer)], `${unique_id}.mp3`, {
        type: "audio/mp3",
      })

      const formData = new FormData()
      formData.append("file", output, `${unique_id}.mp3`)
      formData.append("model", "whisper-1")

      const question =
        selected.name === "Behavioral"
          ? `Tell me about yourself. Why don${`'`}t you walk me through your resume?`
          : selectedInterviewer.id === "John"
            ? "What is a Hash Table, and what is the average case and worst case time for each of its operations?"
            : selectedInterviewer.id === "Richard"
              ? "Uber is looking to expand its product line. Talk me through how you would approach this problem."
              : "You have a 3-gallon jug and 5-gallon jug, how do you measure out exactly 4 gallons?"

      setStatus("Transcribing")

      const upload = await fetch(`/api/transcribe?question=${encodeURIComponent(question)}`, {
        method: "POST",
        body: formData,
      })
      const results = await upload.json()

      if (upload.ok) {
        setIsSuccess(true)
        setSubmitting(false)

        if (results.error) {
          setTranscript(results.error)
        } else {
          setTranscript(results.transcript)
        }

        console.log("Uploaded successfully!")

        await Promise.allSettled([new Promise((resolve) => setTimeout(resolve, 800))]).then(() => {
          setCompleted(true)
          console.log("Success!")
        })

        if (results.transcript.length > 0) {
          const prompt = `Please give feedback on the following interview question: ${question} given the following transcript: ${
            results.transcript
          }. ${
            selected.name === "Behavioral"
              ? "Please also give feedback on the candidate's communication skills. Make sure their response is structured (perhaps using the STAR or PAR frameworks)."
              : "Please also give feedback on the candidate's communication skills. Make sure they accurately explain their thoughts in a coherent way. Make sure they stay on topic and relevant to the question."
          } \n\n\ Feedback on the candidate's response:`

          setGeneratedFeedback("")
          const response = await fetch("/api/generate", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              prompt,
            }),
          })

          if (!response.ok) {
            throw new Error(response.statusText)
          }

          const data = response.body
          if (!data) {
            return
          }

          const reader = data.getReader()
          const decoder = new TextDecoder()
          let done = false

          while (!done) {
            const { value, done: doneReading } = await reader.read()
            done = doneReading
            const chunkValue = decoder.decode(value)
            setGeneratedFeedback((prev: any) => prev + chunkValue)
          }
        }
      } else {
        console.error("Upload failed.")
      }

      setTimeout(() => {
        setRecordedChunks([])
      }, 1500)
    }
  }

  function restartVideo() {
    setRecordedChunks([])
    setVideoEnded(false)
    setCapturing(false)
    setIsVisible(true)
    setSeconds(150)
  }

  const videoConstraints = isDesktop
    ? { width: 1280, height: 720, facingMode: "user" }
    : { width: 480, height: 640, facingMode: "user" }

  const handleUserMedia = () => {
    setTimeout(() => {
      setLoading(false)
      setCameraLoaded(true)
    }, 1000)
  }

  return (
    <>
      <AnimatePresence>
        {step === 3 ? (
          <div className="w-full min-h-screen flex flex-col px-4 pt-2 pb-8 md:px-8 md:py-2 bg-[#0A0A0A] relative overflow-x-hidden">
            {selected.name === "Technical" && <CodeRunner language="python" initialCode="" />}

            {completed ? (
              <div className="w-full flex flex-col max-w-[1080px] mx-auto mt-[10vh] overflow-y-auto pb-8 md:pb-12">
                <motion.div
                  initial={{ y: 20 }}
                  animate={{ y: 0 }}
                  transition={{ duration: 0.35, ease: [0.075, 0.82, 0.165, 1] }}
                  className="relative md:aspect-[16/9] w-full max-w-[1080px] overflow-hidden bg-[#121212] rounded-lg ring-1 ring-green-900/50 shadow-md flex flex-col items-center justify-center"
                >
                  <video className="w-full h-full rounded-lg" controls crossOrigin="anonymous" autoPlay>
                    <source
                      src={URL.createObjectURL(new Blob(recordedChunks, { type: "video/mp4" }))}
                      type="video/mp4"
                    />
                  </video>
                </motion.div>
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    delay: 0.5,
                    duration: 0.15,
                    ease: [0.23, 1, 0.82, 1],
                  }}
                  className="flex flex-col md:flex-row items-center mt-2 md:mt-4 md:justify-between space-y-1 md:space-y-0"
                >
                  <div className="flex flex-row items-center space-x-1">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={2}
                      stroke="currentColor"
                      className="w-4 h-4 text-green-500 shrink-0"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"
                      />
                    </svg>
                    <p className="text-[14px] font-normal leading-[20px] text-gray-400">
                      Video is not stored on our servers, and will go away as soon as you leave the page.
                    </p>
                  </div>
                  <Link
                    href="https://github.com/supernova0311/interview-wrapper"
                    target="_blank"
                    className="group rounded-full pl-[8px] min-w-[180px] pr-4 py-2 text-[13px] font-semibold transition-all flex items-center justify-center bg-[#121212] text-white hover:bg-[#1E1E1E] no-underline gap-x-2 active:scale-95 scale-100 duration-75"
                    style={{
                      boxShadow:
                        "0px 1px 4px rgba(13, 34, 71, 0.17), inset 0px 0px 0px 1px #0D240D, inset 0px 0px 0px 2px rgba(255, 255, 255, 0.1)",
                    }}
                  >
                    <span className="w-5 h-5 rounded-full bg-green-600 flex items-center justify-center">
                      <svg className="w-[16px] h-[16px] text-white" fill="none" viewBox="0 0 24 24">
                        <path
                          stroke="currentColor"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                          d="M4.75 7.75C4.75 6.64543 5.64543 5.75 6.75 5.75H17.25C18.3546 5.75 19.25 6.64543 19.25 7.75V16.25C19.25 17.3546 18.3546 18.25 17.25 18.25H6.75C5.64543 18.25 4.75 17.3546 4.75 16.25V7.75Z"
                        ></path>
                        <path
                          stroke="currentColor"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                          d="M5.5 6.5L12 12.25L18.5 6.5"
                        ></path>
                      </svg>
                    </span>
                    Star on Github
                  </Link>
                </motion.div>
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    delay: 0.5,
                    duration: 0.15,
                    ease: [0.23, 1, 0.82, 1],
                  }}
                  className="mt-8 flex flex-col"
                >
                  <div>
                    <h2 className="text-xl font-semibold text-left text-green-400 mb-2">Transcript</h2>
                    <div className="prose prose-sm max-w-none bg-[#121212] p-4 rounded-lg border border-gray-800 text-gray-300">
                      {transcript.length > 0 ? transcript : "Don't think you said anything. Want to try again?"}
                    </div>
                  </div>
                  <div className="mt-8">
                    <h2 className="text-xl font-semibold text-left text-green-400 mb-2">Feedback</h2>
                    <div className="mt-4 text-sm flex gap-2.5 rounded-lg border border-gray-800 bg-[#121212] p-4 leading-6 text-gray-300 min-h-[100px]">
                      <p className="prose prose-sm max-w-none text-gray-300">{generatedFeedback}</p>
                    </div>
                  </div>
                </motion.div>
              </div>
            ) : (
              <div className="h-full w-full items-center flex flex-col mt-[10vh]">
                {recordingPermission ? (
                  <div className="w-full flex flex-col max-w-[1080px] mx-auto justify-center">
                    <h2 className="text-2xl font-semibold text-left text-green-400 mb-2">
                      {selected.name === "Behavioral"
                        ? `Tell me about yourself. Why don${`'`}t you walk me through your resume?`
                        : selectedInterviewer.id === "John"
                          ? "Please solve the problem above."
                          : selectedInterviewer.id === "Richard"
                            ? "Uber is looking to expand its product line. Talk me through how you would approach this problem."
                            : "You have a 3-gallon jug and 5-gallon jug, how do you measure out exactly 4 gallons?"}
                    </h2>
                    <span className="text-[14px] leading-[20px] text-gray-400 font-normal mb-4">
                      Asked by top companies like Google, Facebook and more
                    </span>
                    <motion.div
                      initial={{ y: -20 }}
                      animate={{ y: 0 }}
                      transition={{
                        duration: 0.35,
                        ease: [0.075, 0.82, 0.965, 1],
                      }}
                      className="relative aspect-[16/9] w-full max-w-[1080px] overflow-hidden bg-[#121212] rounded-lg ring-1 ring-green-900/50 shadow-md"
                    >
                      {!cameraLoaded && (
                        <div className="text-white absolute top-1/2 left-1/2 z-20 flex items-center">
                          <svg
                            className="animate-spin h-4 w-4 text-green-400 mx-auto my-0.5"
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
                              strokeWidth={3}
                            ></circle>
                            <path
                              className="opacity-75"
                              fill="currentColor"
                              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                            ></path>
                          </svg>
                        </div>
                      )}
                      <div className="relative z-10 h-full w-full rounded-lg">
                        <div className="absolute top-5 lg:top-10 left-5 lg:left-10 z-20">
                          <span className="inline-flex items-center rounded-md bg-[#0D240D] px-2.5 py-0.5 text-sm font-medium text-green-400">
                            {new Date(seconds * 1000).toISOString().slice(14, 19)}
                          </span>
                        </div>
                        {selected.name === "Behavioral" && (
                          <Webcam
                            mirrored
                            audio
                            muted
                            ref={webcamRef}
                            videoConstraints={videoConstraints}
                            onUserMedia={handleUserMedia}
                            onUserMediaError={(error) => {
                              setRecordingPermission(false)
                            }}
                            className="absolute z-10 min-h-[100%] min-w-[100%] h-auto w-auto object-cover"
                          />
                        )}
                      </div>
                      {loading && (
                        <div className="absolute flex h-full w-full items-center justify-center">
                          <div className="relative h-[112px] w-[112px] rounded-lg object-cover text-[2rem]">
                            <div className="flex h-[112px] w-[112px] items-center justify-center rounded-[0.5rem] bg-green-600 !text-white">
                              Loading...
                            </div>
                          </div>
                        </div>
                      )}

                      {cameraLoaded && (
                        <div className="absolute bottom-0 left-0 z-50 flex h-[82px] w-full items-center justify-center">
                          {recordedChunks.length > 0 ? (
                            <>
                              {isSuccess ? (
                                <button
                                  className="cursor-disabled group rounded-full min-w-[140px] px-4 py-2 text-[13px] font-semibold group inline-flex items-center justify-center text-sm text-white duration-150 bg-green-600 hover:bg-green-700 hover:text-slate-100 focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-600 active:scale-100 active:bg-green-800 active:text-green-100"
                                  style={{
                                    boxShadow:
                                      "0px 1px 4px rgba(27, 71, 13, 0.17), inset 0px 0px 0px 1px #5fc767, inset 0px 0px 0px 2px rgba(255, 255, 255, 0.1)",
                                  }}
                                >
                                  <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    className="h-5 w-5 mx-auto"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                    strokeWidth={2}
                                  >
                                    <motion.path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                                      initial={{ pathLength: 0 }}
                                      animate={{ pathLength: 1 }}
                                      transition={{ duration: 0.5 }}
                                    />
                                  </svg>
                                </button>
                              ) : (
                                <div className="flex flex-row gap-2">
                                  {!isSubmitting && (
                                    <button
                                      onClick={() => restartVideo()}
                                      className="group rounded-full px-4 py-2 text-[13px] font-semibold transition-all flex items-center justify-center bg-[#121212] text-white hover:bg-[#1E1E1E] no-underline gap-x-2 active:scale-95 scale-100 duration-75 border border-gray-800"
                                    >
                                      Restart
                                    </button>
                                  )}
                                  <button
                                    onClick={handleDownload}
                                    disabled={isSubmitting}
                                    className="group rounded-full min-w-[140px] px-4 py-2 text-[13px] font-semibold transition-all flex items-center justify-center bg-[#0D240D] text-white hover:bg-[#1A341A] no-underline active:scale-95 scale-100 duration-75 disabled:cursor-not-allowed"
                                    style={{
                                      boxShadow:
                                        "0px 1px 4px rgba(13, 34, 71, 0.17), inset 0px 0px 0px 1px #0D240D, inset 0px 0px 0px 2px rgba(255, 255, 255, 0.1)",
                                    }}
                                  >
                                    <span>
                                      {isSubmitting ? (
                                        <div className="flex items-center justify-center gap-x-2">
                                          <svg
                                            className="animate-spin h-5 w-5 text-slate-50 mx-auto"
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
                                              strokeWidth={3}
                                            ></circle>
                                            <path
                                              className="opacity-75"
                                              fill="currentColor"
                                              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                            ></path>
                                          </svg>
                                          <span>{status}</span>
                                        </div>
                                      ) : (
                                        <div className="flex items-center justify-center gap-x-2">
                                          <span>Process transcript</span>
                                          <svg
                                            className="w-5 h-5"
                                            viewBox="0 0 24 24"
                                            fill="none"
                                            xmlns="http://www.w3.org/2000/svg"
                                          >
                                            <path
                                              d="M13.75 6.75L19.25 12L13.75 17.25"
                                              stroke="white"
                                              strokeWidth="1.5"
                                              strokeLinecap="round"
                                              strokeLinejoin="round"
                                            />
                                            <path
                                              d="M19 12H4.75"
                                              stroke="white"
                                              strokeWidth="1.5"
                                              strokeLinecap="round"
                                              strokeLinejoin="round"
                                            />
                                          </svg>
                                        </div>
                                      )}
                                    </span>
                                  </button>
                                </div>
                              )}
                            </>
                          ) : (
                            <div className="absolute bottom-[6px] md:bottom-5 left-5 right-5">
                              <div className="lg:mt-4 flex flex-col items-center justify-center gap-2">
                                {capturing ? (
                                  <div
                                    id="stopTimer"
                                    onClick={handleStopCaptureClick}
                                    className="flex h-10 w-10 flex-col items-center justify-center rounded-full bg-transparent text-white hover:shadow-xl ring-4 ring-green-500 active:scale-95 scale-100 duration-75 cursor-pointer"
                                  >
                                    <div className="h-5 w-5 rounded bg-red-500 cursor-pointer"></div>
                                  </div>
                                ) : (
                                  <button
                                    id="startTimer"
                                    onClick={handleStartCaptureClick}
                                    className="flex h-8 w-8 sm:h-8 sm:w-8 flex-col items-center justify-center rounded-full bg-red-500 text-white hover:shadow-xl ring-4 ring-green-500 ring-offset-[#0A0A0A] ring-offset-2 active:scale-95 scale-100 duration-75"
                                  ></button>
                                )}
                                <div className="w-12"></div>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                      <div
                        className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-20 text-5xl text-green-400 font-semibold text-center"
                        id="countdown"
                      ></div>
                    </motion.div>
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{
                        delay: 0.5,
                        duration: 0.15,
                        ease: [0.23, 1, 0.82, 1],
                      }}
                      className="flex flex-row space-x-1 mt-4 items-center"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={2}
                        stroke="currentColor"
                        className="w-4 h-4 text-green-500"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"
                        />
                      </svg>
                      <p className="text-[14px] font-normal leading-[20px] text-gray-400">
                        Video is not stored on our servers, it is solely used for transcription.
                      </p>
                    </motion.div>
                  </div>
                ) : (
                  <div className="w-full flex flex-col max-w-[1080px] mx-auto justify-center">
                    <motion.div
                      initial={{ y: 20 }}
                      animate={{ y: 0 }}
                      transition={{
                        duration: 0.35,
                        ease: [0.075, 0.82, 0.165, 1],
                      }}
                      className="relative md:aspect-[16/9] w-full max-w-[1080px] overflow-hidden bg-[#121212] rounded-lg ring-1 ring-green-900/50 shadow-md flex flex-col items-center justify-center"
                    >
                      <p className="text-gray-200 font-medium text-lg text-center max-w-3xl">
                        Camera permission is denied. We don{`'`}t store your attempts anywhere, but we understand not
                        wanting to give us access to your camera. Try again by opening this page in an incognito window{" "}
                        {`(`}or enable permissions in your browser settings{`)`}.
                      </p>
                    </motion.div>
                    <div className="flex flex-row space-x-4 mt-8 justify-end">
                      <button
                        onClick={() => setStep(1)}
                        className="group max-w-[200px] rounded-full px-4 py-2 text-[13px] font-semibold transition-all flex items-center justify-center bg-[#121212] text-white no-underline active:scale-95 scale-100 duration-75 border border-gray-800"
                      >
                        Restart demo
                      </button>
                      <Link
                        href="https://github.com/supernova0311/interview-wrapper"
                        target="_blank"
                        className="group rounded-full pl-[8px] min-w-[180px] pr-4 py-2 text-[13px] font-semibold transition-all flex items-center justify-center bg-[#0D240D] text-white hover:bg-[#1A341A] no-underline gap-x-2 active:scale-95 scale-100 duration-75"
                        style={{
                          boxShadow:
                            "0px 1px 4px rgba(13, 34, 71, 0.17), inset 0px 0px 0px 1px #0D240D, inset 0px 0px 0px 2px rgba(255, 255, 255, 0.1)",
                        }}
                      >
                        <span className="w-5 h-5 rounded-full bg-green-600 flex items-center justify-center">
                          <svg className="w-[16px] h-[16px] text-white" fill="none" viewBox="0 0 24 24">
                            <path
                              stroke="currentColor"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth="2"
                              d="M4.75 7.75C4.75 6.64543 5.64543 5.75 6.75 5.75H17.25C18.3546 5.75 19.25 6.64543 19.25 7.75V16.25C19.25 17.3546 18.3546 18.25 17.25 18.25H6.75C5.64543 18.25 4.75 17.3546 4.75 16.25V7.75Z"
                            ></path>
                            <path
                              stroke="currentColor"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth="2"
                              d="M5.5 6.5L12 12.25L18.5 6.5"
                            ></path>
                          </svg>
                        </span>
                        Star on Github
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="w-full min-h-screen flex items-center justify-center bg-[#0A0A0A]">
            <div className="w-full max-w-4xl mx-auto px-4">
              <div className="h-full w-full items-center justify-center flex flex-col">
                {step === 0 ? (
                  <UploadStep onNextStep={() => setStep(1)} />
                ) : step === 1 ? (
                  <motion.div
                    initial={{ opacity: 0, y: 40 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -40 }}
                    key="step-1"
                    transition={{
                      duration: 0.95,
                      ease: [0.165, 0.84, 0.44, 1],
                    }}
                    className="w-full"
                  >
                    <h2 className="text-4xl font-bold text-green-400 text-center">Select a question type</h2>
                    <p className="text-[14px] leading-[20px] text-gray-400 font-normal my-4 text-center">
                      We have hundreds of questions from top tech companies. Choose a type to get started.
                    </p>
                    <div className="mt-8">
                      <RadioGroup value={selected} onChange={setSelected}>
                        <RadioGroup.Label className="sr-only">Server size</RadioGroup.Label>
                        <div className="space-y-4">
                          {questions.map((question) => (
                            <RadioGroup.Option
                              key={question.name}
                              value={question}
                              className={({ checked, active }) =>
                                classNames(
                                  checked ? "border-transparent bg-[#0D240D]" : "border-gray-800",
                                  active ? "border-green-500 ring-2 ring-green-800" : "",
                                  "relative cursor-pointer rounded-lg border bg-[#121212] px-6 py-4 shadow-sm focus:outline-none flex justify-between hover:bg-[#1A1A1A] transition-colors",
                                )
                              }
                            >
                              {({ active, checked }) => (
                                <>
                                  <span className="flex items-center">
                                    <span className="flex flex-col text-sm">
                                      <RadioGroup.Label as="span" className="font-medium text-gray-200">
                                        {question.name}
                                      </RadioGroup.Label>
                                      <RadioGroup.Description
                                        as="span"
                                        className="text-gray-400"
                                      ></RadioGroup.Description>
                                    </span>
                                  </span>

                                  <span
                                    className={classNames(
                                      active ? "border" : "border-2",
                                      checked ? "border-green-500" : "border-transparent",
                                      "pointer-events-none absolute -inset-px rounded-lg",
                                    )}
                                    aria-hidden="true"
                                  />
                                </>
                              )}
                            </RadioGroup.Option>
                          ))}
                        </div>
                      </RadioGroup>
                    </div>
                    <div className="flex gap-[15px] justify-center mt-8">
                      <div>
                        <button
                          onClick={() => setStep(0)}
                          className="group rounded-full px-4 py-2 text-[13px] font-semibold transition-all flex items-center justify-center bg-[#121212] text-white no-underline active:scale-95 scale-100 duration-75 border border-gray-800"
                        >
                          Previous step
                        </button>
                      </div>
                      <div>
                        <button
                          onClick={() => {
                            setStep(2)
                          }}
                          className="group rounded-full px-4 py-2 text-[13px] font-semibold transition-all flex items-center justify-center bg-[#0D240D] text-white hover:bg-[#1A341A] no-underline gap-x-2 active:scale-95 scale-100 duration-75"
                          style={{
                            boxShadow:
                              "0px 1px 4px rgba(13, 34, 71, 0.17), inset 0px 0px 0px 1px #0D240D, inset 0px 0px 0px 2px rgba(255, 255, 255, 0.1)",
                          }}
                        >
                          <span> Continue </span>
                          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path
                              d="M13.75 6.75L19.25 12L13.75 17.25"
                              stroke="#FFF"
                              strokeWidth="1.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                            <path
                              d="M19 12H4.75"
                              stroke="#FFF"
                              strokeWidth="1.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </motion.div>
                ) : step === 2 ? (
                  <motion.div
                    initial={{ opacity: 0, y: 40 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -40 }}
                    key="step-2"
                    transition={{
                      duration: 0.95,
                      ease: [0.165, 0.84, 0.44, 1],
                    }}
                    className="w-full"
                  >
                    <h2 className="text-4xl font-bold text-green-400 text-center">And an interviewer</h2>
                    <p className="text-[14px] leading-[20px] text-gray-400 font-normal my-4 text-center">
                      Choose the level that you want to prepare for. You can always try again with another one.
                    </p>
                    <div className="mt-8">
                      <RadioGroup value={selectedInterviewer} onChange={setSelectedInterviewer}>
                        <RadioGroup.Label className="sr-only">Server size</RadioGroup.Label>
                        <div className="space-y-4">
                          {interviewers.map((interviewer) => (
                            <RadioGroup.Option
                              key={interviewer.name}
                              value={interviewer}
                              className={({ checked, active }) =>
                                classNames(
                                  checked ? "border-transparent bg-[#0D240D]" : "border-gray-800",
                                  active ? "border-green-500 ring-2 ring-green-800" : "",
                                  "relative cursor-pointer rounded-lg border bg-[#121212] px-6 py-4 shadow-sm focus:outline-none flex justify-between hover:bg-[#1A1A1A] transition-colors",
                                )
                              }
                            >
                              {({ active, checked }) => (
                                <>
                                  <span className="flex items-center">
                                    <span className="flex flex-col text-sm">
                                      <RadioGroup.Label as="span" className="font-medium text-gray-200">
                                        {interviewer.name}
                                      </RadioGroup.Label>
                                      <RadioGroup.Description
                                        as="span"
                                        className="text-gray-400"
                                      ></RadioGroup.Description>
                                    </span>
                                  </span>

                                  <span
                                    className={`w-9 h-9 rounded-full inline-flex items-center justify-center ${
                                      interviewer.difficulty === "Easy"
                                        ? "bg-green-500 text-white"
                                        : interviewer.difficulty === "Medium"
                                          ? "bg-yellow-500 text-gray-900"
                                          : "bg-red-500 text-white"
                                    }`}
                                  >
                                    {interviewer.difficulty.charAt(0)}
                                  </span>

                                  <span
                                    className={classNames(
                                      active ? "border" : "border-2",
                                      checked ? "border-green-500" : "border-transparent",
                                      "pointer-events-none absolute -inset-px rounded-lg",
                                    )}
                                    aria-hidden="true"
                                  />
                                </>
                              )}
                            </RadioGroup.Option>
                          ))}
                        </div>
                      </RadioGroup>
                    </div>
                    <div className="flex gap-[15px] justify-center mt-8">
                      <div>
                        <button
                          onClick={() => setStep(1)}
                          className="group rounded-full px-4 py-2 text-[13px] font-semibold transition-all flex items-center justify-center bg-[#121212] text-white no-underline active:scale-95 scale-100 duration-75 border border-gray-800"
                        >
                          Previous step
                        </button>
                      </div>
                      <div>
                        <button
                          onClick={() => {
                            setStep(3)
                          }}
                          className="group rounded-full px-4 py-2 text-[13px] font-semibold transition-all flex items-center justify-center bg-[#0D240D] text-white hover:bg-[#1A341A] no-underline gap-x-2 active:scale-95 scale-100 duration-75"
                          style={{
                            boxShadow:
                              "0px 1px 4px rgba(13, 34, 71, 0.17), inset 0px 0px 0px 1px #0D240D, inset 0px 0px 0px 2px rgba(255, 255, 255, 0.1)",
                          }}
                        >
                          <span> Continue </span>
                          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path
                              d="M13.75 6.75L19.25 12L13.75 17.25"
                              stroke="#FFF"
                              strokeWidth="1.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                            <path
                              d="M19 12H4.75"
                              stroke="#FFF"
                              strokeWidth="1.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </motion.div>
                ) : (
                  <p>Step 3</p>
                )}
              </div>
            </div>
          </div>
        )}
      </AnimatePresence>
    </>
  )
}