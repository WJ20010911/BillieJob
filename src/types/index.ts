import type { CompanyExternalProfile } from "@/lib/company-profile";

export type RecordType = "CHAT_SCREENSHOT" | "INTERVIEW_EXPERIENCE" | "JD_SNAPSHOT" | "WORK_TRIAL";
export type RecordStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface CompanyData {
  id: number;
  name: string;
  alias: string | null;
  description: string | null;
  industry: string | null;
  businessInfo: string | null;
  score: number;
  riskTags: string[];
  createdAt: string;
  updatedAt: string;
  recordCount?: number;
  externalProfile?: CompanyExternalProfile;
}

export interface RecordData {
  id: number;
  type: RecordType;
  companyId: number;
  title: string;
  content: string;
  images: string[];
  rating: number | null;
  position: string;
  actualPosition: string | null;
  salaryRange: string | null;
  workContent: string | null;
  isConsistentWithJD: boolean | null;
  isSalaryConsistent: boolean | null;
  actualSalary: string | null;
  isWorkContentConsistent: boolean | null;
  actualWorkContent: string | null;
  status: RecordStatus;
  rejectReason: string | null;
  isReported: boolean;
  reportCount: number;
  reportReason: string | null;
  uploaderId: string | null;
  city: string;
  createdAt: string;
  updatedAt: string;
}

export interface SearchSuggestion {
  id: number;
  name: string;
  alias: string | null;
  industry: string | null;
  score: number;
  recordCount: number;
  cities: string[];
}

export interface RecordFormData {
  type: RecordType;
  companyName: string;
  title: string;
  content: string;
  images: string[];
  city: string;
  position: string;
  actualPosition?: string;
  salaryRange?: string;
  workContent?: string;
  isConsistentWithJD?: boolean;
  isSalaryConsistent?: boolean;
  actualSalary?: string;
  isWorkContentConsistent?: boolean;
  actualWorkContent?: string;
}

export interface UserBenefitData {
  uploaderId: string;
  recordsContributed: number;
  adFreeUntil: string | null;
}
