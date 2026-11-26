/**
 * Portal SSO v2.4.0 — TypeScript / ESM Client SDK for Sub-Webapps
 * Supports Mode A (Server-to-Server with x-app-key) and Mode B (SPA with x-app-code + Bearer JWT)
 */

export interface PortalSsoSdkOptions {
  portalApiUrl: string;
  appCode?: string;
  appKey?: string;
  accessToken?: string;
}

export class PortalSsoClient {
  private readonly baseUrl: string;
  private readonly appCode?: string;
  private readonly appKey?: string;
  private accessToken?: string;

  constructor(options: PortalSsoSdkOptions) {
    this.baseUrl = options.portalApiUrl.replace(/\/+$/, '');
    this.appCode = options.appCode;
    this.appKey = options.appKey;
    this.accessToken = options.accessToken;
  }

  setAccessToken(token: string) {
    this.accessToken = token;
  }

  private buildHeaders(includeJson = false): Record<string, string> {
    const h: Record<string, string> = {};
    if (this.appKey) h['x-app-key'] = this.appKey;
    if (this.appCode) h['x-app-code'] = this.appCode;
    if (this.accessToken) h.Authorization = `Bearer ${this.accessToken}`;
    if (includeJson) h['Content-Type'] = 'application/json';
    return h;
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, init);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data?.message || `Portal API error (${res.status})`);
    }
    return data as T;
  }

  health() {
    return this.request('/health', { headers: this.buildHeaders() });
  }

  verifySsoToken(ssoToken: string) {
    return this.request('/sso/verify', {
      method: 'POST',
      headers: this.buildHeaders(true),
      body: JSON.stringify({ ssoToken }),
    });
  }

  exchangeSsoToken(ssoToken: string) {
    return this.request('/sso/exchange', {
      method: 'POST',
      headers: this.buildHeaders(true),
      body: JSON.stringify({ ssoToken }),
    });
  }

  getMe() {
    return this.request('/me', { headers: this.buildHeaders() });
  }

  getAppRoles() {
    return this.request('/app-roles', { headers: this.buildHeaders() });
  }

  getAuthorizedUsers(params?: { roleCode?: string; minHierarchyLevel?: number }) {
    const qs = new URLSearchParams();
    if (params?.roleCode) qs.set('role_code', params.roleCode);
    if (params?.minHierarchyLevel) qs.set('min_hierarchy_level', String(params.minHierarchyLevel));
    const q = qs.toString() ? `?${qs.toString()}` : '';
    return this.request(`/authorized-users${q}`, { headers: this.buildHeaders() });
  }

  getLookups(category?: string) {
    return this.request(`/lookups${category ? `?category=${encodeURIComponent(category)}` : ''}`, {
      headers: this.buildHeaders(),
    });
  }

  getOrgUnits() {
    return this.request('/org-units', { headers: this.buildHeaders() });
  }

  getPositions() {
    return this.request('/positions', { headers: this.buildHeaders() });
  }

  getPersonnel() {
    return this.request('/personnel', { headers: this.buildHeaders() });
  }

  getPersonnelById(id: string) {
    return this.request(`/personnel/${encodeURIComponent(id)}`, { headers: this.buildHeaders() });
  }

  getPersonnelBatch(ids: string[]) {
    return this.request('/personnel/batch', {
      method: 'POST',
      headers: this.buildHeaders(true),
      body: JSON.stringify({ ids }),
    });
  }

  /**
   * @deprecated Moved to Fleet sub-app schema (Migration 014 returns HTTP 410 Gone).
   */
  getDrivers(dispatchableOnly = false) {
    return this.request(`/personnel/drivers${dispatchableOnly ? '?dispatchable_only=true' : ''}`, {
      headers: this.buildHeaders(),
    });
  }

  getApprovers(params?: { officeId?: string; departmentId?: string }) {
    const qs = new URLSearchParams();
    if (params?.officeId) qs.set('office_id', params.officeId);
    if (params?.departmentId) qs.set('department_id', params.departmentId);
    const q = qs.toString() ? `?${qs.toString()}` : '';
    return this.request(`/personnel/approvers${q}`, { headers: this.buildHeaders() });
  }

  /**
   * @deprecated Moved to decoration_app sub-app schema (Migration 014 returns HTTP 410 Gone).
   * Use `getDecorationSource()` for Core HR & Timelines data instead.
   */
  getDecorationProfiles() {
    return this.request('/personnel/decoration-profiles', { headers: this.buildHeaders() });
  }

  getDecorationSource(params?: { officeId?: string; departmentId?: string; personId?: string }) {
    const qs = new URLSearchParams();
    if (params?.officeId) qs.set('office_id', params.officeId);
    if (params?.departmentId) qs.set('department_id', params.departmentId);
    if (params?.personId) qs.set('person_id', params.personId);
    const q = qs.toString() ? `?${qs.toString()}` : '';
    return this.request(`/personnel/decoration-source${q}`, { headers: this.buildHeaders() });
  }
}
