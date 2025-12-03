export class DoNewSanadGoldRequestDto {
  /** Sabte_Kol_Or_Movaghat_1_0 */
  sabteKolOrMovaghat: number;
  /** Moshtari_Code */
  moshtariCode: string | number;
  /** Factor_Number */
  factorNumber: string | number;
  /** Radif_Number */
  radifNumber: string | number;
  /** Shamsi_Year */
  shamsiYear: string;
  /** Shamsi_Month */
  shamsiMonth: string;
  /** Shamsi_Day */
  shamsiDay: string;
  /** Vazn */
  vazn: number | string;
  /** Ayar */
  ayar: number | string;
  /** Ang_Number */
  angNumber: string;
  /** Name_az */
  nameAz: string;
  /** IsVoroodOrKhorooj_0_1 */
  isVoroodOrKhorooj: number;
  /** IsMotefaregheOrAbshode_0_1 */
  isMotefaregheOrAbshode: number;
  /** Sharh */
  sharh: string;
  /** Factor_Code */
  factorCode: string;
  /** HavalehBe_Mcode */
  havalehBeMcode?: string | number;
  /** Multi_Radif */
  multiRadif?: number;
  /** JensFelez */
  jensFelez?: number;
}

export class DoNewSanadGoldResponseDto {
  factorCode?: string | number;
  sanadNo?: string | number;
}

export class DoDeleteSanadRequestDto {
  factorCode: string;
}

export class DoDeleteSanadResponseDto {
  success?: boolean;
}

export class DoNewSanadInquiryRequestDto {
  moshtariCode: string | number;
  factorNumber: string | number;
  shamsiYear: string;
  shamsiMonth: string;
  shamsiDay: string;
}

export class DoNewSanadInquiryResponseDto {
  exists?: boolean;
  sanad?: Record<string, string | number | boolean | null>;
}
