export interface IOtpProvider {
  send(phone: string, code: string): Promise<void>;
}
