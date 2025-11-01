/**
 * Validation utility functions
 */

/**
 * Check if user has substantial survey data (more than just default values)
 */
export function hasSubstantialSurveyData(answers: Record<string, string | string[]> | undefined): boolean {
  if (!answers) return false
  const keys = Object.keys(answers)
  
  // If more than 1 key, definitely has substantial data
  if (keys.length > 1) return true
  
  // If exactly 1 key and it's not just the default gender_preference, has substantial data
  if (keys.length === 1 && !answers.gender_preference) return true
  
  // Otherwise, only has default values
  return false
}

/**
 * Validate phone number (Saudi format)
 */
export function isValidPhoneNumber(phone: string): boolean {
  // Saudi phone numbers: 05XXXXXXXX (10 digits starting with 05)
  const saudiPhoneRegex = /^05\d{8}$/
  return saudiPhoneRegex.test(phone.replace(/\s/g, ''))
}

/**
 * Validate email format
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

/**
 * Validate token format (12 character hex string)
 */
export function isValidToken(token: string): boolean {
  return /^[a-f0-9]{12}$/i.test(token)
}

/**
 * Validate participant number
 */
export function isValidParticipantNumber(num: number): boolean {
  return Number.isInteger(num) && num > 0 && num !== 9999 // 9999 is reserved for organizer
}

/**
 * Check if survey data is complete
 */
export function isSurveyComplete(surveyData: any): boolean {
  if (!surveyData) return false
  
  return (
    surveyData.termsAccepted &&
    surveyData.dataConsent &&
    surveyData.answers &&
    Object.keys(surveyData.answers).length > 1 && // More than just default gender_preference
    surveyData.answers.name &&
    surveyData.answers.age &&
    surveyData.answers.gender
  )
}

/**
 * Validate feedback answers are complete
 */
export function isFeedbackComplete(feedbackAnswers: any): boolean {
  if (!feedbackAnswers) return false
  
  // Check if slider has been moved from default
  if (!feedbackAnswers.sliderMoved) return false
  
  // Check if all required ratings have been changed from default (3)
  const requiredRatings = [
    'conversationQuality',
    'personalConnection',
    'sharedInterests',
    'comfortLevel',
    'communicationStyle',
    'wouldMeetAgain',
    'overallExperience'
  ]
  
  return requiredRatings.every(key => feedbackAnswers[key] !== 3)
}

/**
 * Sanitize user input to prevent XSS
 */
export function sanitizeInput(input: string): string {
  return input
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;')
}

/**
 * Validate age range
 */
export function isValidAge(age: number): boolean {
  return Number.isInteger(age) && age >= 18 && age <= 65
}

/**
 * Check if two participants can be matched based on gender preferences
 */
export function canMatchByGender(
  gender1: string,
  gender2: string,
  sameGenderPref1: boolean,
  sameGenderPref2: boolean,
  anyGenderPref1: boolean,
  anyGenderPref2: boolean
): boolean {
  // If either has any gender preference, they can match with anyone
  if (anyGenderPref1 || anyGenderPref2) return true
  
  // If both have same gender preference, they must be same gender
  if (sameGenderPref1 && sameGenderPref2) return gender1 === gender2
  
  // If one has same gender preference, match only if same gender
  if (sameGenderPref1 || sameGenderPref2) return gender1 === gender2
  
  // Default: opposite gender matching
  return gender1 !== gender2
}
