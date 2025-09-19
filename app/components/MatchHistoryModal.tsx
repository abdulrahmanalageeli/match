import React from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../components/ui/dialog"
import { Badge } from "../../components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card"
import { User, Phone, Calendar, Heart, Users } from "lucide-react"

interface Partner {
  number: number
  name?: string
  age?: number
  phone_number?: string
  role: string
}

interface Match {
  id: string
  round: number
  table_number: number
  group_number?: number
  compatibility_score: number
  reason: string
  mutual_match?: boolean
  conversation_status: string
  created_at: string
  partners: Partner[]
  is_group: boolean
  match_type: string
}

interface MatchHistoryModalProps {
  isOpen: boolean
  onClose: () => void
  participant: {
    assigned_number: number
    name: string
    age: number
    gender: string
  } | null
  history: Record<number, Match[]>
  totalMatches: number
}

export default function MatchHistoryModal({ 
  isOpen, 
  onClose, 
  participant, 
  history, 
  totalMatches 
}: MatchHistoryModalProps) {
  if (!participant) return null

  const getRoundTitle = (round: number) => {
    if (round === 0) return "الجولة الجماعية"
    return `الجولة ${round}`
  }

  const getMatchStatusBadge = (match: Match) => {
    if (match.mutual_match === true) {
      return <Badge className="bg-green-100 text-green-800">✅ متطابقون</Badge>
    } else if (match.mutual_match === false) {
      return <Badge className="bg-red-100 text-red-800">❌ غير متطابقين</Badge>
    } else {
      return <Badge className="bg-yellow-100 text-yellow-800">⏳ في الانتظار</Badge>
    }
  }

  const getConversationStatusBadge = (status: string) => {
    switch (status) {
      case 'finished':
        return <Badge className="bg-blue-100 text-blue-800">✅ انتهت</Badge>
      case 'active':
        return <Badge className="bg-green-100 text-green-800">🔄 نشطة</Badge>
      case 'pending':
        return <Badge className="bg-gray-100 text-gray-800">⏳ في الانتظار</Badge>
      default:
        return <Badge className="bg-gray-100 text-gray-800">غير محدد</Badge>
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold text-center">
            تاريخ المطابقات - {participant.name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Participant Info */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                معلومات المشارك
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="font-medium">الرقم:</span> {participant.assigned_number}
                </div>
                <div>
                  <span className="font-medium">العمر:</span> {participant.age}
                </div>
                <div>
                  <span className="font-medium">الجنس:</span> {participant.gender === 'male' ? 'ذكر' : 'أنثى'}
                </div>
                <div>
                  <span className="font-medium">إجمالي المطابقات:</span> {totalMatches}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Match History by Round */}
          {Object.entries(history).map(([round, matches]) => (
            <Card key={round}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  {matches[0]?.is_group ? (
                    <Users className="h-5 w-5" />
                  ) : (
                    <Heart className="h-5 w-5" />
                  )}
                  {getRoundTitle(parseInt(round))}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {matches.map((match) => (
                    <div key={match.id} className="border rounded-lg p-4 space-y-3">
                      {/* Match Header */}
                      <div className="flex justify-between items-start">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">الطاولة {match.table_number}</span>
                          {match.group_number && (
                            <Badge variant="outline">المجموعة {match.group_number}</Badge>
                          )}
                        </div>
                        <div className="flex gap-2">
                          {getMatchStatusBadge(match)}
                          {getConversationStatusBadge(match.conversation_status)}
                        </div>
                      </div>

                      {/* Compatibility Score */}
                      <div className="text-sm">
                        <span className="font-medium">نقاط التوافق:</span> {match.compatibility_score}%
                      </div>

                      {/* Partners */}
                      <div className="space-y-2">
                        <div className="font-medium text-sm">الشركاء:</div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {match.partners.map((partner) => (
                            <div key={`${match.id}-${partner.number}`} className="bg-gray-50 rounded-lg p-3">
                              <div className="flex items-center justify-between mb-2">
                                <span className="font-medium">#{partner.number}</span>
                                <Badge variant="outline" className="text-xs">
                                  {partner.role}
                                </Badge>
                              </div>
                              
                              {partner.name && (
                                <div className="flex items-center gap-1 text-sm mb-1">
                                  <User className="h-4 w-4" />
                                  <span>{partner.name}</span>
                                </div>
                              )}
                              
                              {partner.age && (
                                <div className="flex items-center gap-1 text-sm mb-1">
                                  <Calendar className="h-4 w-4" />
                                  <span>العمر: {partner.age}</span>
                                </div>
                              )}
                              
                              {partner.phone_number && (
                                <div className="flex items-center gap-1 text-sm">
                                  <Phone className="h-4 w-4" />
                                  <span>{partner.phone_number}</span>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Reason */}
                      {match.reason && (
                        <div className="text-sm text-gray-600">
                          <span className="font-medium">سبب المطابقة:</span> {match.reason}
                        </div>
                      )}

                      {/* Match Date */}
                      <div className="text-xs text-gray-500">
                        تاريخ المطابقة: {new Date(match.created_at).toLocaleString('ar-SA')}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}

          {/* No matches message */}
          {Object.keys(history).length === 0 && (
            <Card>
              <CardContent className="text-center py-8">
                <div className="text-gray-500">
                  <Heart className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>لم يتم العثور على مطابقات بعد</p>
                  <p className="text-sm mt-2">سيتم عرض تاريخ مطابقاتك هنا بعد المشاركة في الجولات</p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
