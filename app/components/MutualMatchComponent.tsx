import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card"
import { Button } from "../../components/ui/button"
import { Badge } from "../../components/ui/badge"
import { User, Phone, Calendar, Heart, X } from "lucide-react"

interface Partner {
  number: number
  name?: string
  age?: number
  phone_number?: string
}

interface MutualMatchProps {
  participantToken: string
  onComplete: () => void
}

export default function MutualMatchComponent({ participantToken, onComplete }: MutualMatchProps) {
  const [partner, setPartner] = useState<Partner | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [decision, setDecision] = useState<boolean | null>(null)
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    fetchPartnerInfo()
  }, [])

  const fetchPartnerInfo = async () => {
    try {
      setLoading(true)
      
      // First get participant history to find the round 1 match
      const response = await fetch('/api/get-participant-history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: participantToken })
      })

      if (response.ok) {
        const historyResponse = await response.json()
        if (historyResponse.success && historyResponse.history[1]) {
          // Find the round 1 match
          const round1Matches = historyResponse.history[1]
          if (round1Matches.length > 0) {
            const match = round1Matches[0] // Take the first match from round 1
            if (match.partners && match.partners.length > 0) {
              // Get the partner info
              const partnerInfo = match.partners[0]
              setPartner({
                number: partnerInfo.number,
                name: partnerInfo.name,
                age: partnerInfo.age,
                phone_number: partnerInfo.phone_number
              })
            }
          }
        }
      }
    } catch (error) {
      console.error('Error fetching partner info:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleDecision = async (wantsToMatch: boolean) => {
    if (!partner || submitted) return

    try {
      setSubmitting(true)
      setDecision(wantsToMatch)

      const response = await fetch('/api/update-mutual-match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: participantToken,
          partner_number: partner.number,
          wants_to_match: wantsToMatch
        })
      })

      if (response.ok) {
        const result = await response.json()
        if (result.success) {
          setSubmitted(true)
          setTimeout(() => {
            onComplete()
          }, 2000)
        } else {
          throw new Error(result.error || 'Failed to submit decision')
        }
      } else {
        throw new Error('Failed to submit decision')
      }
    } catch (error) {
      console.error('Error submitting decision:', error)
      setDecision(null)
      alert('حدث خطأ أثناء إرسال قرارك. يرجى المحاولة مرة أخرى.')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="text-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">جاري تحميل معلومات شريكك...</p>
        </CardContent>
      </Card>
    )
  }

  if (!partner) {
    return (
      <Card>
        <CardContent className="text-center py-8">
          <div className="text-gray-500">
            <User className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>لم يتم العثور على شريك من الجولة الأولى</p>
            <p className="text-sm mt-2">يرجى التأكد من مشاركتك في الجولة الأولى</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (submitted) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-center text-green-600">
            {decision ? '✅ تم إرسال قرارك بنجاح!' : '❌ تم إرسال قرارك بنجاح!'}
          </CardTitle>
        </CardHeader>
        <CardContent className="text-center">
          <p className="text-gray-600 mb-4">
            {decision 
              ? 'تم تسجيل رغبتك في المطابقة مع هذا الشخص. سيتم إعلامك بنتيجة المطابقة المتبادلة قريباً.'
              : 'تم تسجيل عدم رغبتك في المطابقة مع هذا الشخص.'
            }
          </p>
          <div className="animate-pulse text-sm text-gray-500">
            جاري الانتقال...
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-center">
          هل تريد المطابقة مع هذا الشخص؟
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Partner Information */}
        <div className="bg-gray-50 rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">معلومات شريكك من الجولة الأولى</h3>
            <Badge variant="outline" className="text-sm">
              #{partner.number}
            </Badge>
          </div>

          <div className="space-y-3">
            {partner.name && (
              <div className="flex items-center gap-2">
                <User className="h-5 w-5 text-gray-500" />
                <span className="font-medium">{partner.name}</span>
              </div>
            )}

            {partner.age && (
              <div className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-gray-500" />
                <span>العمر: {partner.age} سنة</span>
              </div>
            )}

            {partner.phone_number && (
              <div className="flex items-center gap-2">
                <Phone className="h-5 w-5 text-gray-500" />
                <span>{partner.phone_number}</span>
              </div>
            )}
          </div>
        </div>

        {/* Decision Buttons */}
        <div className="space-y-4">
          <p className="text-center text-gray-600">
            بناءً على لقائكم في الجولة الأولى، هل تريد المطابقة مع هذا الشخص؟
          </p>

          <div className="flex gap-4 justify-center">
            <Button
              onClick={() => handleDecision(true)}
              disabled={submitting}
              className="bg-green-600 hover:bg-green-700 text-white px-8 py-3"
            >
              <Heart className="h-5 w-5 mr-2" />
              نعم، أريد المطابقة
            </Button>

            <Button
              onClick={() => handleDecision(false)}
              disabled={submitting}
              variant="destructive"
              className="px-8 py-3"
            >
              <X className="h-5 w-5 mr-2" />
              لا، لا أريد المطابقة
            </Button>
          </div>

          {submitting && (
            <div className="text-center">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto"></div>
              <p className="mt-2 text-sm text-gray-600">جاري إرسال قرارك...</p>
            </div>
          )}
        </div>

        {/* Information Note */}
        <div className="bg-blue-50 rounded-lg p-4">
          <p className="text-sm text-blue-800">
            <strong>ملاحظة:</strong> سيتم إعلامك بنتيجة المطابقة المتبادلة فقط إذا كان كلا الطرفين يريدان المطابقة.
            هذا القرار سري وخاص بك.
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
