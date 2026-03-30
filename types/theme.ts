type Data<T = unknown> = T | null;

export interface Response<T = unknown> {
  code: number;
  message: string;
  data: Data<T>;
}

export interface IMeta {
  page: number;
  per_page: number;
  total: number;
  total_pages: number;
}

export type TParams = {
  page: number;
  per_page: number;
};

export type THttpErrorResult = {
  title: string;
  code: number;
  message: string;
};
