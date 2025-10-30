import { useState } from "react"
import { Brain, BarChart3, Users, RefreshCcw, Loader2, CheckCircle, AlertCircle, Grid3X3 } from "lucide-react"

interface MatrixFactorizationPanelProps {
  currentEventId: number
}

export default function MatrixFactorizationPanel({ currentEventId }: MatrixFactorizationPanelProps) {
  const [isTrainingModel, setIsTrainingModel] = useState(false)
  const [modelStats, setModelStats] = useState<any>(null)
  const [modelPerformance, setModelPerformance] = useState<any>(null)
  const [isLoadingPerformance, setIsLoadingPerformance] = useState(false)
  const [isGeneratingMatrix, setIsGeneratingMatrix] = useState(false)
  const [compatibilityMatrix, setCompatibilityMatrix] = useState<any>(null)
  const [isGeneratingMatches, setIsGeneratingMatches] = useState(false)
  const [generatedMatches, setGeneratedMatches] = useState<any>(null)
  const [participant1, setParticipant1] = useState("")
  const [participant2, setParticipant2] = useState("")
  const [predictedScore, setPredictedScore] = useState<any>(null)
  const [isPredicting, setIsPredicting] = useState(false)
  const [showMatrix, setShowMatrix] = useState(false)

  // Train the matrix factorization model
  const trainMatrixFactorizationModel = async () => {
    setIsTrainingModel(true)
    setModelStats(null)
    
    try {
      const response = await fetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'train-matrix-factorization',
          event_id: currentEventId
        })
      })
      
      if (response.ok) {
        const data = await response.json()
        setModelStats(data)
        // Automatically fetch performance after training
        fetchModelPerformance()
      } else {
        const error = await response.json()
        alert(`Training failed: ${error.error}`)
      }
    } catch (error) {
      console.error("Error training model:", error)
      alert("Failed to train model due to an error")
    } finally {
      setIsTrainingModel(false)
    }
  }

  // Fetch model performance metrics
  const fetchModelPerformance = async () => {
    setIsLoadingPerformance(true)
    setModelPerformance(null)
    
    try {
      const response = await fetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'get-model-performance',
          event_id: currentEventId
        })
      })
      
      if (response.ok) {
        const data = await response.json()
        setModelPerformance(data.performance)
      } else {
        const error = await response.json()
        console.error("Error fetching model performance:", error)
      }
    } catch (error) {
      console.error("Error fetching model performance:", error)
    } finally {
      setIsLoadingPerformance(false)
    }
  }

  // Generate compatibility matrix
  const generateCompatibilityMatrix = async () => {
    setIsGeneratingMatrix(true)
    setCompatibilityMatrix(null)
    
    try {
      const response = await fetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'generate-compatibility-matrix',
          event_id: currentEventId
        })
      })
      
      if (response.ok) {
        const data = await response.json()
        setCompatibilityMatrix(data)
        setShowMatrix(true)
      } else {
        const error = await response.json()
        alert(`Matrix generation failed: ${error.error}`)
      }
    } catch (error) {
      console.error("Error generating matrix:", error)
      alert("Failed to generate compatibility matrix")
    } finally {
      setIsGeneratingMatrix(false)
    }
  }

  // Generate matches using matrix factorization
  const generateMatches = async () => {
    setIsGeneratingMatches(true)
    setGeneratedMatches(null)
    
    try {
      const response = await fetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'generate-mf-matches',
          event_id: currentEventId
        })
      })
      
      if (response.ok) {
        const data = await response.json()
        setGeneratedMatches(data)
      } else {
        const error = await response.json()
        alert(`Match generation failed: ${error.error}`)
      }
    } catch (error) {
      console.error("Error generating matches:", error)
      alert("Failed to generate matches")
    } finally {
      setIsGeneratingMatches(false)
    }
  }

  // Predict compatibility between two participants
  const predictCompatibility = async () => {
    if (!participant1 || !participant2) {
      alert("Please enter both participant numbers")
      return
    }
    
    setIsPredicting(true)
    setPredictedScore(null)
    
    try {
      const response = await fetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'predict-compatibility',
          event_id: currentEventId,
          participant1: parseInt(participant1),
          participant2: parseInt(participant2)
        })
      })
      
      if (response.ok) {
        const data = await response.json()
        setPredictedScore(data)
      } else {
        const error = await response.json()
        alert(`Prediction failed: ${error.error}`)
      }
    } catch (error) {
      console.error("Error predicting compatibility:", error)
      alert("Failed to predict compatibility")
    } finally {
      setIsPredicting(false)
    }
  }

  // Helper function to get color based on score
  const getScoreColor = (score: number) => {
    if (score >= 80) return "bg-green-500"
    if (score >= 60) return "bg-yellow-500"
    if (score >= 40) return "bg-orange-500"
    return "bg-red-500"
  }

  return (
    <div className="space-y-6 p-6 bg-slate-800 border border-slate-700 rounded-lg shadow-lg">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-white flex items-center">
          <Brain className="mr-2" /> Matrix Factorization (Testing)
        </h2>
      </div>
      
      <div className="text-slate-300 text-sm mb-4">
        This is a testing implementation of matrix factorization for participant matching. 
        It works independently from the current matching system and can be used to compare results.
      </div>
      
      {/* Model Training Section */}
      <div className="bg-slate-900 rounded-lg p-4 border border-slate-700">
        <h3 className="text-lg font-medium text-white mb-3 flex items-center">
          <Brain className="mr-2 h-5 w-5" /> Model Training
        </h3>
        
        <div className="flex flex-wrap gap-4 items-center justify-between">
          <div>
            <p className="text-slate-300 text-sm mb-2">
              Train the recommendation model using participant feedback and compatibility data
            </p>
          </div>
          
          <div className="flex gap-2">
            <button
              onClick={trainMatrixFactorizationModel}
              disabled={isTrainingModel}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md flex items-center disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isTrainingModel ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Training...
                </>
              ) : (
                <>
                  <Brain className="mr-2 h-4 w-4" />
                  Train Model
                </>
              )}
            </button>
            
            <button
              onClick={fetchModelPerformance}
              disabled={isLoadingPerformance}
              className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-md flex items-center disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoadingPerformance ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Loading...
                </>
              ) : (
                <>
                  <BarChart3 className="mr-2 h-4 w-4" />
                  View Performance
                </>
              )}
            </button>
          </div>
        </div>
        
        {/* Model Statistics */}
        {modelStats && (
          <div className="mt-4 bg-slate-800 rounded-lg p-4 border border-slate-600">
            <h4 className="text-white font-medium mb-2 flex items-center">
              <CheckCircle className="mr-2 h-4 w-4 text-green-500" /> Model Trained Successfully
            </h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-3">
              <div className="bg-slate-700 p-3 rounded-md">
                <p className="text-slate-400 text-xs">Participants</p>
                <p className="text-white font-medium">{modelStats.numParticipants}</p>
              </div>
              <div className="bg-slate-700 p-3 rounded-md">
                <p className="text-slate-400 text-xs">Latent Factors</p>
                <p className="text-white font-medium">{modelStats.numFactors}</p>
              </div>
              <div className="bg-slate-700 p-3 rounded-md">
                <p className="text-slate-400 text-xs">Data Points</p>
                <p className="text-white font-medium">{modelStats.dataPoints}</p>
              </div>
              <div className="bg-slate-700 p-3 rounded-md">
                <p className="text-slate-400 text-xs">RMSE</p>
                <p className="text-white font-medium">{modelStats.rmse?.toFixed(4) || "N/A"}</p>
              </div>
            </div>
          </div>
        )}
        
        {/* Model Performance */}
        {modelPerformance && (
          <div className="mt-4 bg-slate-800 rounded-lg p-4 border border-slate-600">
            <h4 className="text-white font-medium mb-2">Model Performance Metrics</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-3">
              <div className="bg-slate-700 p-3 rounded-md">
                <p className="text-slate-400 text-xs">RMSE</p>
                <p className="text-white font-medium">{modelPerformance.rmse?.toFixed(4) || "N/A"}</p>
              </div>
              <div className="bg-slate-700 p-3 rounded-md">
                <p className="text-slate-400 text-xs">MAE</p>
                <p className="text-white font-medium">{modelPerformance.mae?.toFixed(4) || "N/A"}</p>
              </div>
              <div className="bg-slate-700 p-3 rounded-md">
                <p className="text-slate-400 text-xs">Coverage</p>
                <p className="text-white font-medium">{modelPerformance.coverage?.toFixed(1) || "N/A"}%</p>
              </div>
              <div className="bg-slate-700 p-3 rounded-md">
                <p className="text-slate-400 text-xs">Participants</p>
                <p className="text-white font-medium">{modelPerformance.training_participants || "N/A"}</p>
              </div>
            </div>
          </div>
        )}
      </div>
      
      {/* Compatibility Prediction Section */}
      <div className="bg-slate-900 rounded-lg p-4 border border-slate-700">
        <h3 className="text-lg font-medium text-white mb-3 flex items-center">
          <Users className="mr-2 h-5 w-5" /> Predict Compatibility
        </h3>
        
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-slate-300 text-sm mb-1">Participant 1</label>
            <input
              type="number"
              value={participant1}
              onChange={(e) => setParticipant1(e.target.value)}
              className="bg-slate-700 text-white px-3 py-2 rounded-md border border-slate-600 w-24"
              placeholder="#"
            />
          </div>
          
          <div>
            <label className="block text-slate-300 text-sm mb-1">Participant 2</label>
            <input
              type="number"
              value={participant2}
              onChange={(e) => setParticipant2(e.target.value)}
              className="bg-slate-700 text-white px-3 py-2 rounded-md border border-slate-600 w-24"
              placeholder="#"
            />
          </div>
          
          <button
            onClick={predictCompatibility}
            disabled={isPredicting || !participant1 || !participant2}
            className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md flex items-center disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isPredicting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Predicting...
              </>
            ) : (
              <>
                <RefreshCcw className="mr-2 h-4 w-4" />
                Predict Score
              </>
            )}
          </button>
        </div>
        
        {/* Prediction Result */}
        {predictedScore && (
          <div className="mt-4 bg-slate-800 rounded-lg p-4 border border-slate-600">
            <h4 className="text-white font-medium mb-2">Predicted Compatibility</h4>
            <div className="flex items-center gap-4">
              <div className="bg-slate-700 p-3 rounded-md flex-1">
                <p className="text-slate-400 text-xs">Participant A</p>
                <p className="text-white font-medium">#{predictedScore.participant_a}</p>
              </div>
              <div className="bg-slate-700 p-3 rounded-md flex-1">
                <p className="text-slate-400 text-xs">Participant B</p>
                <p className="text-white font-medium">#{predictedScore.participant_b}</p>
              </div>
              <div className="bg-slate-700 p-3 rounded-md flex-1">
                <p className="text-slate-400 text-xs">Compatibility Score</p>
                <div className="flex items-center gap-2">
                  <div className={`w-4 h-4 rounded-full ${getScoreColor(predictedScore.compatibility_score)}`}></div>
                  <p className="text-white font-medium">{Math.round(predictedScore.compatibility_score)}%</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
      
      {/* Compatibility Matrix Section */}
      <div className="bg-slate-900 rounded-lg p-4 border border-slate-700">
        <h3 className="text-lg font-medium text-white mb-3 flex items-center">
          <Grid3X3 className="mr-2 h-5 w-5" /> Compatibility Matrix
        </h3>
        
        <div className="flex flex-wrap gap-4 items-center justify-between">
          <div>
            <p className="text-slate-300 text-sm mb-2">
              Generate a compatibility matrix for all participants
            </p>
          </div>
          
          <button
            onClick={generateCompatibilityMatrix}
            disabled={isGeneratingMatrix}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-md flex items-center disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isGeneratingMatrix ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Grid3X3 className="mr-2 h-4 w-4" />
                Generate Matrix
              </>
            )}
          </button>
        </div>
        
        {/* Compatibility Matrix */}
        {compatibilityMatrix && showMatrix && (
          <div className="mt-4 bg-slate-800 rounded-lg p-4 border border-slate-600 overflow-x-auto">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-white font-medium">Compatibility Matrix</h4>
              <button 
                onClick={() => setShowMatrix(false)} 
                className="text-slate-400 hover:text-white text-sm"
              >
                Hide Matrix
              </button>
            </div>
            
            <div className="overflow-x-auto">
              <table className="min-w-full bg-slate-900 text-white text-sm">
                <thead>
                  <tr>
                    <th className="p-2 border border-slate-700 bg-slate-800">#</th>
                    {compatibilityMatrix.participants.map((p: number) => (
                      <th key={p} className="p-2 border border-slate-700 bg-slate-800">#{p}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {compatibilityMatrix.matrix.map((row: any) => (
                    <tr key={row.participant_number}>
                      <th className="p-2 border border-slate-700 bg-slate-800">#{row.participant_number}</th>
                      {row.scores.map((score: number | null, index: number) => (
                        <td 
                          key={index} 
                          className={`p-2 border border-slate-700 text-center ${
                            score === null ? 'bg-slate-800' : 
                            score === 100 ? 'bg-slate-800' : 
                            getScoreColor(score)
                          }`}
                        >
                          {score === null ? '-' : score}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
      
      {/* Generate Matches Section */}
      <div className="bg-slate-900 rounded-lg p-4 border border-slate-700">
        <h3 className="text-lg font-medium text-white mb-3 flex items-center">
          <Users className="mr-2 h-5 w-5" /> Generate Test Matches
        </h3>
        
        <div className="flex flex-wrap gap-4 items-center justify-between">
          <div>
            <p className="text-slate-300 text-sm mb-2">
              Generate matches using matrix factorization (for testing only)
            </p>
          </div>
          
          <button
            onClick={generateMatches}
            disabled={isGeneratingMatches}
            className="bg-pink-600 hover:bg-pink-700 text-white px-4 py-2 rounded-md flex items-center disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isGeneratingMatches ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Users className="mr-2 h-4 w-4" />
                Generate Test Matches
              </>
            )}
          </button>
        </div>
        
        {/* Generated Matches */}
        {generatedMatches && (
          <div className="mt-4 bg-slate-800 rounded-lg p-4 border border-slate-600">
            <h4 className="text-white font-medium mb-3">Generated Matches</h4>
            
            {/* Match Statistics */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <div className="bg-slate-700 p-3 rounded-md">
                <p className="text-slate-400 text-xs">Total Participants</p>
                <p className="text-white font-medium">{generatedMatches.totalParticipants}</p>
              </div>
              <div className="bg-slate-700 p-3 rounded-md">
                <p className="text-slate-400 text-xs">Matched Participants</p>
                <p className="text-white font-medium">{generatedMatches.matchedParticipants}</p>
              </div>
              <div className="bg-slate-700 p-3 rounded-md">
                <p className="text-slate-400 text-xs">Total Matches</p>
                <p className="text-white font-medium">{generatedMatches.matches.length}</p>
              </div>
              <div className="bg-slate-700 p-3 rounded-md">
                <p className="text-slate-400 text-xs">Unmatched</p>
                <p className="text-white font-medium">{generatedMatches.unmatchedParticipants.length}</p>
              </div>
            </div>
            
            {/* Match Quality */}
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div className="bg-green-900/30 p-3 rounded-md border border-green-700/30">
                <p className="text-green-300 text-xs">Excellent Matches (80%+)</p>
                <p className="text-white font-medium">{generatedMatches.matchQuality.excellent}</p>
              </div>
              <div className="bg-yellow-900/30 p-3 rounded-md border border-yellow-700/30">
                <p className="text-yellow-300 text-xs">Good Matches (60-79%)</p>
                <p className="text-white font-medium">{generatedMatches.matchQuality.good}</p>
              </div>
              <div className="bg-orange-900/30 p-3 rounded-md border border-orange-700/30">
                <p className="text-orange-300 text-xs">Average Matches (&lt;60%)</p>
                <p className="text-white font-medium">{generatedMatches.matchQuality.average}</p>
              </div>
            </div>
            
            {/* Match List */}
            <div className="overflow-x-auto">
              <table className="min-w-full bg-slate-900 text-white text-sm">
                <thead>
                  <tr>
                    <th className="p-2 border border-slate-700 bg-slate-800">Participant A</th>
                    <th className="p-2 border border-slate-700 bg-slate-800">Participant B</th>
                    <th className="p-2 border border-slate-700 bg-slate-800">Compatibility</th>
                    <th className="p-2 border border-slate-700 bg-slate-800">Type</th>
                  </tr>
                </thead>
                <tbody>
                  {generatedMatches.matches.map((match: any, index: number) => (
                    <tr key={index}>
                      <td className="p-2 border border-slate-700">#{match.participant_a_number}</td>
                      <td className="p-2 border border-slate-700">#{match.participant_b_number}</td>
                      <td className="p-2 border border-slate-700">
                        <div className="flex items-center gap-2">
                          <div className={`w-3 h-3 rounded-full ${getScoreColor(match.compatibility_score)}`}></div>
                          <span>{match.compatibility_score}%</span>
                        </div>
                      </td>
                      <td className="p-2 border border-slate-700">{match.match_type}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            {/* Unmatched Participants */}
            {generatedMatches.unmatchedParticipants.length > 0 && (
              <div className="mt-4">
                <h5 className="text-white font-medium mb-2 flex items-center">
                  <AlertCircle className="mr-2 h-4 w-4 text-yellow-500" /> Unmatched Participants
                </h5>
                <div className="bg-slate-700 p-3 rounded-md">
                  <div className="flex flex-wrap gap-2">
                    {generatedMatches.unmatchedParticipants.map((p: number) => (
                      <span key={p} className="bg-slate-600 px-2 py-1 rounded text-white text-xs">
                        #{p}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      
      <div className="text-slate-400 text-xs italic">
        Note: This matrix factorization implementation is for testing purposes only and does not affect the current matching system.
      </div>
    </div>
  )
}
