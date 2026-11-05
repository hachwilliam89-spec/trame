import { signal } from '@angular/core';

export interface WebIdentity {
  subject: string;
  organizationId: string;
  roles: string[];
}
export interface IdentityDriver {
  initialize(): Promise<boolean>;
  identity(): WebIdentity | undefined;
  accessToken(): Promise<string>;
  login(): Promise<void>;
  logout(): Promise<void>;
  onExpired: () => void;
}
export class AuthenticationRequired extends Error {}
export class WebSession {
  readonly identity = signal<WebIdentity | undefined>(undefined);
  readonly status = signal<'loading' | 'anonymous' | 'authenticated' | 'expired' | 'unavailable'>(
    'loading',
  );
  constructor(private readonly driver: IdentityDriver) {
    driver.onExpired = () => this.expire();
  }
  async initialize(): Promise<void> {
    try {
      const authenticated = await this.driver.initialize();
      const identity = authenticated ? this.driver.identity() : undefined;
      this.identity.set(identity);
      this.status.set(identity === undefined ? 'anonymous' : 'authenticated');
    } catch {
      this.identity.set(undefined);
      this.status.set('unavailable');
    }
  }
  async token(): Promise<string> {
    if (this.status() !== 'authenticated') throw new AuthenticationRequired();
    try {
      const token = await this.driver.accessToken();
      const identity = this.driver.identity();
      const current = this.identity();
      if (
        identity === undefined ||
        current === undefined ||
        identity.subject !== current.subject ||
        identity.organizationId !== current.organizationId
      )
        throw new AuthenticationRequired();
      this.identity.set(identity);
      return token;
    } catch {
      this.expire();
      throw new AuthenticationRequired();
    }
  }
  expire(): void {
    this.identity.set(undefined);
    this.status.set('expired');
  }
  login(): Promise<void> {
    return this.driver.login();
  }
  logout(): Promise<void> {
    return this.driver.logout();
  }
}
