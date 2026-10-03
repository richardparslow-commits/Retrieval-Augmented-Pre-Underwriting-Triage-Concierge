export interface UnderwritingState {
  consented: boolean
  fullName: string
  email: string
  cellPhone: string
  textMessagePreference: 'yes' | 'no' | ''
  dateOfBirth: string
  gender: string
  height: string
  weight: string
  tobaccoNicotineVaping: string
  policyType: 'Term' | 'Whole Life' | 'IUL' | ''
  coverageAmount: string
  hasDiabetes: boolean
  diabetesType: string
  diabetesTreatment: string
  lastA1C: string
  hasCancer: boolean
  cancerType: string
  cancerFreeDuration: string
}

export const initialUnderwritingState: UnderwritingState = {
  consented: false,
  fullName: '',
  email: '',
  cellPhone: '',
  textMessagePreference: '',
  dateOfBirth: '',
  gender: '',
  height: '',
  weight: '',
  tobaccoNicotineVaping: '',
  policyType: '',
  coverageAmount: '',
  hasDiabetes: false,
  diabetesType: '',
  diabetesTreatment: '',
  lastA1C: '',
  hasCancer: false,
  cancerType: '',
  cancerFreeDuration: '',
}
