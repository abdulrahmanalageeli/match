export interface CohostAgreement {
  readonly version: string;
  readonly title: string;
  readonly introduction: string;
  readonly sections: ReadonlyArray<{ readonly title: string; readonly text: string }>;
  readonly confirmation: string;
  readonly recordNotice: string;
}
export const COHOST_AGREEMENT: CohostAgreement;
export function cohostAgreementText(agreement?: CohostAgreement): string;
