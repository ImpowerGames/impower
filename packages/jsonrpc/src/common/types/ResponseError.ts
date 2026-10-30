export interface ResponseError {
  code: number;

  message: string;

  data?: string | number | boolean | any[] | object | null;
}
