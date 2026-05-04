export interface IVersion {
  id: string;
  code: string;
  name: string;
  description: string;
  url: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}
