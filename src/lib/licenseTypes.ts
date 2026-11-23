export interface OrgLicenseInfo {
  orgId: string;
  orgName: string;
  orgUrl: string;
  status: string;
  expirationDate: string;
  /** Days until expiration (negative = expired) */
  daysRemaining: number;
  licensedDeviceCounts: Record<string, number>;
}

export interface OrgLicenseDetail {
  status: string;
  expirationDate: string;
  daysRemaining: number | null;
  licensedDeviceCounts: Record<string, number>;
  perDeviceLicenses: {
    id: string;
    licenseType: string;
    licenseKey: string;
    state: string;
    deviceSerial: string | null;
    deviceName: string | null;
    expirationDate: string;
    claimDate: string;
    durationInDays: number;
  }[];
}
