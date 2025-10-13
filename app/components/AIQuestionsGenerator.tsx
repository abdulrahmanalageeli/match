import React, { useState } from "react"
import { ChevronLeftIcon, ChevronRightIcon, Sparkles, Loader2 } from "lucide-react"
import { Button } from "../../components/ui/button"

interface AIQuestionsGeneratorProps {
  secureToken: string
  dark: boolean
  currentRound: number
  onQuestionsGenerated?: (questions: string[]) => void
}

export default function AIQuestionsGenerator({ 
  secureToken, 
  dark, 
  currentRound,
  onQuestionsGenerated 
}: AIQuestionsGeneratorProps) {
  const [aiQuestions, setAiQuestions] = useState<string[]>([])
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0)
  const [isGenerating, setIsGenerating] = useState(false)
  const [hasGenerated, setHasGenerated] = useState(false)

  const generateAIQuestions = async () => {
    if (!secureToken) return

    setIsGenerating(true)
    try {
      const response = await fetch("/api/generate-ai-questions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          secure_token: secureToken,
          round: currentRound,
        }),
      })

      const data = await response.json()

      if (data.success && data.questions) {
        setAiQuestions(data.questions)
        setCurrentQuestionIndex(0)
        setHasGenerated(true)
        onQuestionsGenerated?.(data.questions)
      } else {
        console.error("Failed to generate AI questions:", data.error)
      }
    } catch (error) {
      console.error("Error generating AI questions:", error)
    } finally {
      setIsGenerating(false)
    }
  }

  const nextQuestion = () => {
    setCurrentQuestionIndex((i) => (i + 1) % aiQuestions.length)
  }

  const previousQuestion = () => {
    setCurrentQuestionIndex((i) => (i - 1 + aiQuestions.length) % aiQuestions.length)
  }

  if (!hasGenerated) {
    return (
      <div className="flex justify-center">
        <Button
          onClick={generateAIQuestions}
          disabled={isGenerating}
          className={`spring-btn border-0 shadow-lg hover:shadow-xl transition-all duration-500 transform hover:scale-105 ${
            dark 
              ? "bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white" 
              : "bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white"
          }`}
        >
          {isGenerating ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              جاري إنشاء الأسئلة...
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4 mr-2" />
              إنشاء أسئلة ذكية للحوار
            </>
          )}
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-center gap-2 mb-2">
        <Sparkles className={`w-4 h-4 ${dark ? "text-purple-400" : "text-purple-600"}`} />
        <span className={`text-sm font-medium ${dark ? "text-purple-300" : "text-purple-700"}`}>
          أسئلة ذكية للحوار
        </span>
      </div>
      
      <div className={`rounded-xl p-4 border ${
        dark 
          ? "bg-transparent border-purple-400/30"
          : "bg-transparent border-purple-400/30"
      }`}>
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            aria-label="السؤال التالي"
            className="p-2 rounded-full hover:bg-purple-200/40 transition disabled:opacity-40"
            onClick={previousQuestion}
            disabled={aiQuestions.length <= 1}
          >
            <ChevronLeftIcon className="w-5 h-5" />
          </button>
          <p className={`flex-1 text-center text-base font-medium ${
            dark ? "text-purple-200" : "text-purple-700"
          }`}>
            {aiQuestions[currentQuestionIndex]}
          </p>
          <button
            type="button"
            aria-label="السؤال السابق"
            className="p-2 rounded-full hover:bg-purple-200/40 transition disabled:opacity-40"
            onClick={nextQuestion}
            disabled={aiQuestions.length <= 1}
          >
            <ChevronRightIcon className="w-5 h-5" />
          </button>
        </div>
        
        {aiQuestions.length > 1 && (
          <div className="flex justify-center mt-2">
            <div className="flex gap-1">
              {aiQuestions.map((_, index) => (
                <div
                  key={index}
                  className={`w-2 h-2 rounded-full transition-all ${
                    index === currentQuestionIndex
                      ? dark ? "bg-purple-400" : "bg-purple-600"
                      : dark ? "bg-purple-400/30" : "bg-purple-400/30"
                  }`}
                />
              ))}
            </div>
          </div>
        )}
      </div>
      
      <div className="flex justify-center">
        <Button
          onClick={generateAIQuestions}
          disabled={isGenerating}
          variant="outline"
          size="sm"
          className={`${
            dark 
              ? "border-purple-400/30 text-purple-300 hover:bg-purple-500/20" 
              : "border-purple-400/30 text-purple-700 hover:bg-purple-100"
          }`}
        >
          {isGenerating ? (
            <>
              <Loader2 className="w-3 h-3 mr-1 animate-spin" />
              جاري التحديث...
            </>
          ) : (
            <>
              <Sparkles className="w-3 h-3 mr-1" />
              إنشاء أسئلة جديدة
            </>
          )}
        </Button>
      </div>
    </div>
  )
} 