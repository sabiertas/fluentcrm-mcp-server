#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import axios, { AxiosInstance } from 'axios';
import * as dotenv from 'dotenv';

dotenv.config();

// ===== MULTI-SITE CONFIG =====

interface SiteConfig {
  url: string;
  username: string;
  password: string;
}

function loadSiteConfigs(): Map<string, SiteConfig> {
  const configs = new Map<string, SiteConfig>();

  const sitesEnv = process.env.FLUENTCRM_SITES;
  if (sitesEnv) {
    try {
      const parsed = JSON.parse(sitesEnv) as Record<string, SiteConfig>;
      for (const [name, config] of Object.entries(parsed)) {
        if (config.url && config.username && config.password) {
          configs.set(name, config);
        } else {
          console.error(`Warning: Site "${name}" is missing url, username, or password — skipped`);
        }
      }
    } catch (e) {
      console.error('Error parsing FLUENTCRM_SITES JSON:', e);
    }
  }

  // Backward compatibility: fall back to single env vars
  if (configs.size === 0) {
    const url = process.env.FLUENTCRM_API_URL || '';
    const username = process.env.FLUENTCRM_API_USERNAME || '';
    const password = process.env.FLUENTCRM_API_PASSWORD || '';
    if (url && username && password) {
      configs.set('default', { url, username, password });
    }
  }

  return configs;
}

const siteConfigs = loadSiteConfigs();
const siteNames = Array.from(siteConfigs.keys());
const siteDescription = `Site identifier (e.g. ${siteNames.map(s => `'${s}'`).join(', ')}). Available: ${siteNames.join(', ')}. Defaults to '${siteNames[0] || 'default'}'.`;

/**
 * FluentCRM API Client
 * Based on: https://rest-api.fluentcrm.com/#introduction
 */
class FluentCRMClient {
  private apiClient: AxiosInstance;
  private baseURL: string;

  constructor(baseURL: string, username: string, password: string) {
    this.baseURL = baseURL;

    // Basic Auth dla FluentCRM API
    const credentials = Buffer.from(`${username}:${password}`).toString('base64');

    this.apiClient = axios.create({
      baseURL,
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      timeout: 30000,
    });

    // Error interceptor — capture validation details from 422 responses
    this.apiClient.interceptors.response.use(
      response => response,
      error => {
        const status = error.response?.status;
        const message = error.response?.data?.message || error.message;
        const errors = error.response?.data?.errors;
        const data = error.response?.data;

        let fullMessage = `FluentCRM API Error (${status}): ${message}`;
        if (errors) {
          fullMessage += ` | Validation errors: ${JSON.stringify(errors)}`;
        }
        if (status === 422 && data) {
          fullMessage += ` | Full response: ${JSON.stringify(data)}`;
        }
        throw new Error(fullMessage);
      }
    );
  }

  // ===== SUBSCRIBERS / KONTAKTY =====

  async listContacts(params: any = {}) {
    const response = await this.apiClient.get('/subscribers', { params });
    return response.data;
  }

  async getContact(subscriberId: number) {
    const response = await this.apiClient.get(`/subscribers/${subscriberId}`);
    return response.data;
  }

  async findContactByEmail(email: string) {
    const response = await this.apiClient.get('/subscribers', {
      params: { search: email },
    });
    return response.data.data?.[0] || null;
  }

  async createContact(data: {
    email: string;
    first_name?: string;
    last_name?: string;
    phone?: string;
    address_line_1?: string;
    city?: string;
    state?: string;
    country?: string;
    postal_code?: string;
    status?: string;
    contact_type?: string;
    tags?: number[];
    lists?: number[];
    [key: string]: any;
  }) {
    // Default status to 'subscribed' if not provided — FluentCRM requires it
    const payload = {
      status: 'subscribed',
      ...data,
    };
    try {
      const response = await this.apiClient.post('/subscribers', payload);
      return response.data;
    } catch (error: any) {
      // FluentCRM sometimes returns 500 but still creates the contact (server-side bug).
      // If we get 500, check if the contact was created anyway by searching for it.
      const status = error.message?.includes('(500)') || error.message?.includes('internal_server_error');
      if (status && data.email) {
        const existing = await this.findContactByEmail(data.email);
        if (existing) {
          return {
            ...existing,
            _note: 'Contact was created despite 500 error from FluentCRM. This is a known FluentCRM bug.',
          };
        }
      }
      throw error;
    }
  }

  async updateContact(subscriberId: number, data: any) {
    const response = await this.apiClient.put(`/subscribers/${subscriberId}`, data);
    return response.data;
  }

  async deleteContact(subscriberId: number) {
    const response = await this.apiClient.delete(`/subscribers/${subscriberId}`);
    return response.data;
  }

  // ===== TAGI =====

  async listTags(params: any = {}) {
    const response = await this.apiClient.get('/tags', { params });
    return response.data;
  }

  async getTag(tagId: number) {
    const response = await this.apiClient.get(`/tags/${tagId}`);
    return response.data;
  }

  async createTag(data: {
    title: string;
    slug?: string;
    description?: string;
  }) {
    const response = await this.apiClient.post('/tags', data);
    return response.data;
  }

  async updateTag(tagId: number, data: any) {
    const response = await this.apiClient.put(`/tags/${tagId}`, data);
    return response.data;
  }

  async deleteTag(tagId: number) {
    const response = await this.apiClient.delete(`/tags/${tagId}`);
    return response.data;
  }

  async attachTagToContact(subscriberId: number, tagIds: number[]) {
    const response = await this.apiClient.put(
      `/subscribers/${subscriberId}`,
      { attach_tags: tagIds }
    );
    return response.data;
  }

  async detachTagFromContact(subscriberId: number, tagIds: number[]) {
    const response = await this.apiClient.put(
      `/subscribers/${subscriberId}`,
      { detach_tags: tagIds }
    );
    return response.data;
  }

  // ===== LISTY =====

  async listLists(params: any = {}) {
    const response = await this.apiClient.get('/lists', { params });
    return response.data;
  }

  async getList(listId: number) {
    const response = await this.apiClient.get(`/lists/${listId}`);
    return response.data;
  }

  async createList(data: {
    title: string;
    slug?: string;
    description?: string;
  }) {
    const response = await this.apiClient.post('/lists', data);
    return response.data;
  }

  async updateList(listId: number, data: any) {
    const response = await this.apiClient.put(`/lists/${listId}`, data);
    return response.data;
  }

  async deleteList(listId: number) {
    const response = await this.apiClient.delete(`/lists/${listId}`);
    return response.data;
  }

  async attachContactToList(subscriberId: number, listIds: number[]) {
    const response = await this.apiClient.put(
      `/subscribers/${subscriberId}`,
      { attach_lists: listIds }
    );
    return response.data;
  }

  async detachContactFromList(subscriberId: number, listIds: number[]) {
    const response = await this.apiClient.put(
      `/subscribers/${subscriberId}`,
      { detach_lists: listIds }
    );
    return response.data;
  }

  // ===== KAMPANIE =====

  async listCampaigns(params: any = {}) {
    const response = await this.apiClient.get('/campaigns', { params });
    return response.data;
  }

  async getCampaign(campaignId: number) {
    const response = await this.apiClient.get(`/campaigns/${campaignId}`);
    return response.data;
  }

  async createCampaign(data: any) {
    const response = await this.apiClient.post('/campaigns', data);
    return response.data;
  }

  async updateCampaign(campaignId: number, data: any) {
    const response = await this.apiClient.put(`/campaigns/${campaignId}`, data);
    return response.data;
  }

  async pauseCampaign(campaignId: number) {
    const response = await this.apiClient.post(`/campaigns/${campaignId}/pause`);
    return response.data;
  }

  async resumeCampaign(campaignId: number) {
    const response = await this.apiClient.post(`/campaigns/${campaignId}/resume`);
    return response.data;
  }

  async deleteCampaign(campaignId: number) {
    const response = await this.apiClient.delete(`/campaigns/${campaignId}`);
    return response.data;
  }

  // ===== EMAIL TEMPLATES =====

  async listEmailTemplates(params: any = {}) {
    const response = await this.apiClient.get('/email-templates', { params });
    return response.data;
  }

  async getEmailTemplate(templateId: number) {
    const response = await this.apiClient.get(`/email-templates/${templateId}`);
    return response.data;
  }

  async createEmailTemplate(data: any) {
    const response = await this.apiClient.post('/email-templates', data);
    return response.data;
  }

  async updateEmailTemplate(templateId: number, data: any) {
    const response = await this.apiClient.put(`/email-templates/${templateId}`, data);
    return response.data;
  }

  async deleteEmailTemplate(templateId: number) {
    const response = await this.apiClient.delete(`/email-templates/${templateId}`);
    return response.data;
  }

  // ===== AUTOMATION FUNNELS =====

  async listAutomations(params: any = {}) {
    const response = await this.apiClient.get('/funnels', { params });
    return response.data;
  }

  async getAutomation(funnelId: number, withSequences: boolean = false) {
    const params: any = {};
    if (withSequences) {
      params['with[]'] = ['funnel_sequences', 'blocks', 'block_fields'];
    }
    const response = await this.apiClient.get(`/funnels/${funnelId}`, { params });
    return response.data;
  }

  async createAutomation(data: any) {
    const response = await this.apiClient.post('/funnels', data);
    return response.data;
  }

  async updateAutomation(funnelId: number, data: any) {
    const response = await this.apiClient.put(`/funnels/${funnelId}`, data);
    return response.data;
  }

  async deleteAutomation(funnelId: number) {
    const response = await this.apiClient.delete(`/funnels/${funnelId}`);
    return response.data;
  }

  async cloneAutomation(funnelId: number) {
    const response = await this.apiClient.post(`/funnels/${funnelId}/clone`);
    return response.data;
  }

  async listTriggers() {
    const response = await this.apiClient.get('/funnels/triggers');
    return response.data;
  }

  async saveAutomationSequences(funnelId: number, data: {
    funnel_title?: string;
    funnel_description?: string;
    status?: string;
    sequences: any[];
    funnel_settings?: any;
    conditions?: any;
  }) {
    const payload: any = {
      sequences: JSON.stringify(data.sequences),
    };
    if (data.funnel_title) payload.funnel_title = data.funnel_title;
    if (data.funnel_description) payload.funnel_description = data.funnel_description;
    if (data.status) payload.status = data.status;
    if (data.funnel_settings) payload.funnel_settings = JSON.stringify(data.funnel_settings);
    if (data.conditions) payload.conditions = JSON.stringify(data.conditions);

    const response = await this.apiClient.post(`/funnels/${funnelId}/sequences`, payload);
    return response.data;
  }

  async saveEmailAction(funnelId: number, actionData: {
    action_name: string;
    mailer_settings?: any;
    campaign: {
      id?: number | null;
      email_subject: string;
      email_pre_header?: string;
      email_body: string;
      design_template?: string;
      settings?: any;
    };
  }) {
    const response = await this.apiClient.post(`/funnels/${funnelId}/sequences/save-email-action`, {
      action_data: actionData,
    });
    return response.data;
  }

  async listFunnelSubscribers(funnelId: number, params: any = {}) {
    const response = await this.apiClient.get(`/funnels/${funnelId}/subscribers`, { params });
    return response.data;
  }

  async updateFunnelSubscriberStatus(funnelId: number, subscriberId: number, status: string) {
    const response = await this.apiClient.put(`/funnels/${funnelId}/subscribers/${subscriberId}/status`, { status });
    return response.data;
  }

  async getAutomationReport(funnelId: number) {
    const response = await this.apiClient.get(`/funnels/${funnelId}/report`);
    return response.data;
  }

  async getContactAutomations(subscriberId: number) {
    const response = await this.apiClient.get(`/funnels/subscriber/${subscriberId}/automations`);
    return response.data;
  }

  async changeTrigger(funnelId: number, triggerName: string, title?: string) {
    const data: any = { trigger_name: triggerName };
    if (title) data.title = title;
    const response = await this.apiClient.put(`/funnels/${funnelId}/change-trigger`, data);
    return response.data;
  }

  // ===== WEBHOOKS =====

  async listWebhooks(params: any = {}) {
    const response = await this.apiClient.get('/webhooks', { params });
    return response.data;
  }

  async createWebhook(data: {
    name: string;
    status: 'pending' | 'subscribed';
    url: string;
    tags?: number[];
    lists?: number[];
  }) {
    const response = await this.apiClient.post('/webhook', data);
    return response.data;
  }

  async updateWebhook(webhookId: number, data: any) {
    const response = await this.apiClient.put(`/webhook/${webhookId}`, data);
    return response.data;
  }

  async deleteWebhook(webhookId: number) {
    const response = await this.apiClient.delete(`/webhook/${webhookId}`);
    return response.data;
  }

  // ===== CUSTOM FIELDS =====

  async listCustomFields() {
    const response = await this.apiClient.get('/custom-fields');
    return response.data;
  }

  // ===== SMART LINKS =====
  // Note: FluentCRM doesn't have native REST API for Smart Links yet
  // These methods prepare for future API or work with existing endpoints

  async listSmartLinks(params: any = {}) {
    // Try to get smart links - this might not work until FluentCRM adds the endpoint
    try {
      const response = await this.apiClient.get('/smart-links', { params });
      return response.data;
    } catch (error: any) {
      // If endpoint doesn't exist, return helpful message
      if (error.response?.status === 404) {
        return {
          success: false,
          message: "Smart Links API endpoint not available yet in FluentCRM",
          suggestion: "Use FluentCRM admin panel to manage Smart Links manually",
          available_endpoints: [
            "FluentCRM → Smart Links (admin panel)",
            "Custom WordPress hooks for Smart Links"
          ]
        };
      }
      throw error;
    }
  }

  async getSmartLink(smartLinkId: number) {
    try {
      const response = await this.apiClient.get(`/smart-links/${smartLinkId}`);
      return response.data;
    } catch (error: any) {
      if (error.response?.status === 404) {
        return {
          success: false,
          message: "Smart Links API endpoint not available yet in FluentCRM",
          suggestion: "Use FluentCRM admin panel to view Smart Link details"
        };
      }
      throw error;
    }
  }

  async createSmartLink(data: {
    title: string;
    slug?: string;
    target_url: string;
    apply_tags?: number[];
    apply_lists?: number[];
    remove_tags?: number[];
    remove_lists?: number[];
    auto_login?: boolean;
  }) {
    try {
      const response = await this.apiClient.post('/smart-links', data);
      return response.data;
    } catch (error: any) {
      if (error.response?.status === 404) {
        return {
          success: false,
          message: "Smart Links API endpoint not available yet in FluentCRM",
          suggestion: "Create Smart Link manually in FluentCRM admin panel",
          recommended_data: data
        };
      }
      throw error;
    }
  }

  async updateSmartLink(smartLinkId: number, data: any) {
    try {
      const response = await this.apiClient.put(`/smart-links/${smartLinkId}`, data);
      return response.data;
    } catch (error: any) {
      if (error.response?.status === 404) {
        return {
          success: false,
          message: "Smart Links API endpoint not available yet in FluentCRM",
          suggestion: "Update Smart Link manually in FluentCRM admin panel"
        };
      }
      throw error;
    }
  }

  async deleteSmartLink(smartLinkId: number) {
    try {
      const response = await this.apiClient.delete(`/smart-links/${smartLinkId}`);
      return response.data;
    } catch (error: any) {
      if (error.response?.status === 404) {
        return {
          success: false,
          message: "Smart Links API endpoint not available yet in FluentCRM",
          suggestion: "Delete Smart Link manually in FluentCRM admin panel"
        };
      }
      throw error;
    }
  }

  // Helper method to generate Smart Link shortcode
  generateSmartLinkShortcode(slug: string, linkText?: string): string {
    if (linkText) {
      return `<a href="{{fc_smart_link slug='${slug}'}}">${linkText}</a>`;
    }
    return `{{fc_smart_link slug='${slug}'}}`;
  }

  // Helper method to validate Smart Link data
  validateSmartLinkData(data: any): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!data.title || typeof data.title !== 'string') {
      errors.push('Title is required and must be a string');
    }

    if (!data.target_url || typeof data.target_url !== 'string') {
      errors.push('Target URL is required and must be a string');
    }

    if (data.target_url && !data.target_url.startsWith('http')) {
      errors.push('Target URL must start with http:// or https://');
    }

    if (data.slug && !/^[a-z0-9-]+$/.test(data.slug)) {
      errors.push('Slug must contain only lowercase letters, numbers, and hyphens');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  // ===== REPORTS =====

  async getDashboardStats() {
    const response = await this.apiClient.get('/reports/dashboard-stats');
    return response.data;
  }

  async getSubscribersGrowthRate(params: any = {}) {
    const response = await this.apiClient.get('/reports/subscribers-growth-rate', { params });
    return response.data;
  }
}

// ===== MCP SERVER SETUP =====

const server = new Server(
  {
    name: 'fluentcrm-mcp',
    version: '1.2.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// ===== MULTI-SITE CLIENT MANAGEMENT =====

const clients = new Map<string, FluentCRMClient>();

for (const [name, config] of siteConfigs.entries()) {
  clients.set(name, new FluentCRMClient(config.url, config.username, config.password));
}

function getClient(siteName?: string): FluentCRMClient {
  if (clients.size === 0) {
    throw new Error('No FluentCRM sites configured. Set FLUENTCRM_SITES or FLUENTCRM_API_URL/USERNAME/PASSWORD env vars.');
  }

  if (!siteName) {
    return clients.values().next().value!;
  }

  const client = clients.get(siteName);
  if (!client) {
    throw new Error(`Site "${siteName}" not found. Available sites: ${siteNames.join(', ')}`);
  }
  return client;
}

// Helper: site property for tool schemas
const siteProp = { type: 'string' as const, description: siteDescription };

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      // ===== KONTAKTY =====
      {
        name: 'fluentcrm_list_contacts',
        description: 'Pobiera listę wszystkich kontaktów z FluentCRM',
        inputSchema: {
          type: 'object',
          properties: {
            site: siteProp,
            page: { type: 'number', description: 'Numer strony (default: 1)' },
            per_page: { type: 'number', description: 'Ilość rekordów na stronę (default: 10)' },
            search: { type: 'string', description: 'Szukaj po emailu/imieniu' },
          },
        },
      },
      {
        name: 'fluentcrm_get_contact',
        description: 'Pobiera szczegóły konkretnego kontaktu',
        inputSchema: {
          type: 'object',
          properties: {
            site: siteProp,
            subscriberId: { type: 'number', description: 'ID kontaktu' },
          },
          required: ['subscriberId'],
        },
      },
      {
        name: 'fluentcrm_find_contact_by_email',
        description: 'Wyszukuje kontakt po adresie email',
        inputSchema: {
          type: 'object',
          properties: {
            site: siteProp,
            email: { type: 'string', description: 'Adres email' },
          },
          required: ['email'],
        },
      },
      {
        name: 'fluentcrm_create_contact',
        description: 'Crea un nuevo contacto en FluentCRM. Por defecto status=subscribed.',
        inputSchema: {
          type: 'object',
          properties: {
            site: siteProp,
            email: { type: 'string', description: 'Email del contacto (obligatorio)' },
            first_name: { type: 'string', description: 'Nombre' },
            last_name: { type: 'string', description: 'Apellido' },
            phone: { type: 'string', description: 'Telefono' },
            address_line_1: { type: 'string', description: 'Direccion' },
            city: { type: 'string', description: 'Ciudad' },
            country: { type: 'string', description: 'Pais (codigo ISO, ej: ES)' },
            status: { type: 'string', description: 'Estado: subscribed (default), pending, unsubscribed', enum: ['subscribed', 'pending', 'unsubscribed'] },
            contact_type: { type: 'string', description: 'Tipo: lead (default), customer', enum: ['lead', 'customer'] },
            tags: { type: 'array', items: { type: 'number' }, description: 'IDs de tags a asignar al crear' },
            lists: { type: 'array', items: { type: 'number' }, description: 'IDs de listas a asignar al crear' },
            company_id: { type: 'string', description: 'Nombre de la empresa' },
          },
          required: ['email'],
        },
      },
      {
        name: 'fluentcrm_update_contact',
        description: 'Aktualizuje dane kontaktu',
        inputSchema: {
          type: 'object',
          properties: {
            site: siteProp,
            subscriberId: { type: 'number', description: 'ID kontaktu' },
            first_name: { type: 'string' },
            last_name: { type: 'string' },
            phone: { type: 'string' },
          },
          required: ['subscriberId'],
        },
      },
      {
        name: 'fluentcrm_delete_contact',
        description: 'Usuwa kontakt z FluentCRM',
        inputSchema: {
          type: 'object',
          properties: {
            site: siteProp,
            subscriberId: { type: 'number', description: 'ID kontaktu do usunięcia' },
          },
          required: ['subscriberId'],
        },
      },

      // ===== TAGI =====
      {
        name: 'fluentcrm_list_tags',
        description: 'Pobiera wszystkie tagi z FluentCRM',
        inputSchema: {
          type: 'object',
          properties: {
            site: siteProp,
            page: { type: 'number', description: 'Numer strony' },
            search: { type: 'string', description: 'Szukaj tagu' },
          },
        },
      },
      {
        name: 'fluentcrm_create_tag',
        description: 'Tworzy nowy tag w FluentCRM',
        inputSchema: {
          type: 'object',
          properties: {
            site: siteProp,
            title: { type: 'string', description: 'Nazwa tagu (np. "AW-progress-75")' },
            slug: { type: 'string', description: 'Slug tagu (np. "aw-progress-75")' },
            description: { type: 'string', description: 'Opis tagu' },
          },
          required: ['title'],
        },
      },
      {
        name: 'fluentcrm_delete_tag',
        description: 'Usuwa tag z FluentCRM',
        inputSchema: {
          type: 'object',
          properties: {
            site: siteProp,
            tagId: { type: 'number', description: 'ID tagu' },
          },
          required: ['tagId'],
        },
      },
      {
        name: 'fluentcrm_attach_tag_to_contact',
        description: 'Przypisuje tag do kontaktu',
        inputSchema: {
          type: 'object',
          properties: {
            site: siteProp,
            subscriberId: { type: 'number', description: 'ID kontaktu' },
            tagIds: { type: 'array', items: { type: 'number' }, description: 'Lista ID tagów' },
          },
          required: ['subscriberId', 'tagIds'],
        },
      },
      {
        name: 'fluentcrm_detach_tag_from_contact',
        description: 'Usuwa tag z kontaktu',
        inputSchema: {
          type: 'object',
          properties: {
            site: siteProp,
            subscriberId: { type: 'number', description: 'ID kontaktu' },
            tagIds: { type: 'array', items: { type: 'number' }, description: 'Lista ID tagów' },
          },
          required: ['subscriberId', 'tagIds'],
        },
      },

      // ===== LISTY =====
      {
        name: 'fluentcrm_list_lists',
        description: 'Pobiera wszystkie listy z FluentCRM',
        inputSchema: {
          type: 'object',
          properties: {
            site: siteProp,
          },
        },
      },
      {
        name: 'fluentcrm_create_list',
        description: 'Tworzy nową listę w FluentCRM',
        inputSchema: {
          type: 'object',
          properties: {
            site: siteProp,
            title: { type: 'string', description: 'Nazwa listy' },
            slug: { type: 'string', description: 'Slug listy' },
            description: { type: 'string', description: 'Opis listy' },
          },
          required: ['title'],
        },
      },
      {
        name: 'fluentcrm_delete_list',
        description: 'Usuwa listę z FluentCRM',
        inputSchema: {
          type: 'object',
          properties: {
            site: siteProp,
            listId: { type: 'number', description: 'ID listy' },
          },
          required: ['listId'],
        },
      },
      {
        name: 'fluentcrm_attach_contact_to_list',
        description: 'Przypisuje kontakt do listy',
        inputSchema: {
          type: 'object',
          properties: {
            site: siteProp,
            subscriberId: { type: 'number', description: 'ID kontaktu' },
            listIds: { type: 'array', items: { type: 'number' }, description: 'Lista ID list' },
          },
          required: ['subscriberId', 'listIds'],
        },
      },
      {
        name: 'fluentcrm_detach_contact_from_list',
        description: 'Usuwa kontakt z listy',
        inputSchema: {
          type: 'object',
          properties: {
            site: siteProp,
            subscriberId: { type: 'number', description: 'ID kontaktu' },
            listIds: { type: 'array', items: { type: 'number' }, description: 'Lista ID list' },
          },
          required: ['subscriberId', 'listIds'],
        },
      },

      // ===== KAMPANIE =====
      {
        name: 'fluentcrm_list_campaigns',
        description: 'Pobiera listę kampanii email',
        inputSchema: {
          type: 'object',
          properties: {
            site: siteProp,
            page: { type: 'number' },
            search: { type: 'string' },
          },
        },
      },
      {
        name: 'fluentcrm_create_campaign',
        description: 'Tworzy nową kampanię email',
        inputSchema: {
          type: 'object',
          properties: {
            site: siteProp,
            title: { type: 'string', description: 'Tytuł kampanii' },
            subject: { type: 'string', description: 'Temat emaila' },
            template_id: { type: 'number', description: 'ID szablonu' },
            recipient_list: { type: 'array', items: { type: 'number' }, description: 'ID list' },
          },
          required: ['title', 'subject'],
        },
      },
      {
        name: 'fluentcrm_pause_campaign',
        description: 'Wstrzymuje kampanię',
        inputSchema: {
          type: 'object',
          properties: {
            site: siteProp,
            campaignId: { type: 'number', description: 'ID kampanii' },
          },
          required: ['campaignId'],
        },
      },
      {
        name: 'fluentcrm_resume_campaign',
        description: 'Wznawia kampanię',
        inputSchema: {
          type: 'object',
          properties: {
            site: siteProp,
            campaignId: { type: 'number', description: 'ID kampanii' },
          },
          required: ['campaignId'],
        },
      },
      {
        name: 'fluentcrm_delete_campaign',
        description: 'Usuwa kampanię',
        inputSchema: {
          type: 'object',
          properties: {
            site: siteProp,
            campaignId: { type: 'number', description: 'ID kampanii' },
          },
          required: ['campaignId'],
        },
      },

      // ===== EMAIL TEMPLATES =====
      {
        name: 'fluentcrm_list_email_templates',
        description: 'Pobiera szablony email',
        inputSchema: {
          type: 'object',
          properties: {
            site: siteProp,
          },
        },
      },
      {
        name: 'fluentcrm_create_email_template',
        description: 'Tworzy nowy szablon email',
        inputSchema: {
          type: 'object',
          properties: {
            site: siteProp,
            title: { type: 'string', description: 'Nazwa szablonu' },
            subject: { type: 'string', description: 'Temat' },
            body: { type: 'string', description: 'Treść HTML' },
          },
          required: ['title', 'subject', 'body'],
        },
      },

      // ===== AUTOMATYZACJE =====
      {
        name: 'fluentcrm_list_automations',
        description: 'Pobiera automatyzacje (funnels)',
        inputSchema: {
          type: 'object',
          properties: {
            site: siteProp,
            page: { type: 'number' },
            search: { type: 'string' },
          },
        },
      },
      {
        name: 'fluentcrm_create_automation',
        description: 'Creates a new automation funnel',
        inputSchema: {
          type: 'object',
          properties: {
            site: siteProp,
            title: { type: 'string', description: 'Automation title' },
            description: { type: 'string' },
            trigger: { type: 'string', description: 'Trigger type (use fluentcrm_list_triggers to see available triggers)' },
          },
          required: ['title', 'trigger'],
        },
      },
      {
        name: 'fluentcrm_get_automation',
        description: 'Get automation details including all sequences (steps), available blocks and block fields. Use this to inspect an automation flow.',
        inputSchema: {
          type: 'object',
          properties: {
            site: siteProp,
            funnelId: { type: 'number', description: 'Automation/funnel ID' },
            withSequences: { type: 'boolean', description: 'Include sequences, blocks and block_fields (default: true)' },
          },
          required: ['funnelId'],
        },
      },
      {
        name: 'fluentcrm_update_automation',
        description: 'Update automation status (draft/published)',
        inputSchema: {
          type: 'object',
          properties: {
            site: siteProp,
            funnelId: { type: 'number', description: 'Automation/funnel ID' },
            status: { type: 'string', description: 'New status', enum: ['draft', 'published'] },
          },
          required: ['funnelId', 'status'],
        },
      },
      {
        name: 'fluentcrm_delete_automation',
        description: 'Delete an automation funnel',
        inputSchema: {
          type: 'object',
          properties: {
            site: siteProp,
            funnelId: { type: 'number', description: 'Automation/funnel ID' },
          },
          required: ['funnelId'],
        },
      },
      {
        name: 'fluentcrm_clone_automation',
        description: 'Duplicate an automation funnel (creates a draft copy with all sequences)',
        inputSchema: {
          type: 'object',
          properties: {
            site: siteProp,
            funnelId: { type: 'number', description: 'Automation/funnel ID to clone' },
          },
          required: ['funnelId'],
        },
      },
      {
        name: 'fluentcrm_list_triggers',
        description: 'List all available automation trigger types. Use this to know which triggers can be used when creating or changing automations.',
        inputSchema: {
          type: 'object',
          properties: {
            site: siteProp,
          },
        },
      },
      {
        name: 'fluentcrm_save_automation_sequences',
        description: 'Save all sequences (steps) for an automation. WARNING: This is a full-state replacement — all sequences not included will be deleted. First use fluentcrm_get_automation to read current sequences, modify the array, then save back. Each sequence needs: action_name, type (action/conditional/benchmark), title, settings.',
        inputSchema: {
          type: 'object',
          properties: {
            site: siteProp,
            funnelId: { type: 'number', description: 'Automation/funnel ID' },
            funnel_title: { type: 'string', description: 'Updated funnel title (optional)' },
            funnel_description: { type: 'string', description: 'Updated funnel description (optional)' },
            status: { type: 'string', description: 'Funnel status', enum: ['draft', 'published'] },
            sequences: {
              type: 'array',
              description: 'Array of sequence objects. Each needs: action_name, type, title, settings. Include id to update existing steps, omit id for new steps.',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'number', description: 'Existing sequence ID (omit for new)' },
                  action_name: { type: 'string', description: 'Action identifier (e.g. fluentcrm_wait_times, send_custom_email, add_contact_to_tags)' },
                  type: { type: 'string', description: 'Step type', enum: ['action', 'conditional', 'benchmark'] },
                  title: { type: 'string', description: 'Step title' },
                  description: { type: 'string' },
                  settings: { type: 'object', description: 'Action-specific settings' },
                  conditions: { type: 'array', description: 'Step conditions' },
                  parent_id: { type: 'number', description: '0 for root level, or parent conditional block ID' },
                  condition_type: { type: 'string', description: '"yes" or "no" when inside a conditional block', enum: ['yes', 'no'] },
                },
              },
            },
            funnel_settings: { type: 'object', description: 'Funnel-level settings (optional)' },
            conditions: { type: 'object', description: 'Funnel-level conditions (optional)' },
          },
          required: ['funnelId', 'sequences'],
        },
      },
      {
        name: 'fluentcrm_save_email_action',
        description: 'Save or update an email for a send_custom_email step in an automation. Returns the reference campaign ID.',
        inputSchema: {
          type: 'object',
          properties: {
            site: siteProp,
            funnelId: { type: 'number', description: 'Automation/funnel ID' },
            action_name: { type: 'string', description: 'Action name (default: send_custom_email)' },
            campaign_id: { type: 'number', description: 'Existing campaign ID to update (null for new)' },
            email_subject: { type: 'string', description: 'Email subject line' },
            email_pre_header: { type: 'string', description: 'Email pre-header text' },
            email_body: { type: 'string', description: 'Email HTML body' },
            design_template: { type: 'string', description: 'Template type (default: simple)' },
          },
          required: ['funnelId', 'email_subject', 'email_body'],
        },
      },
      {
        name: 'fluentcrm_list_funnel_subscribers',
        description: 'List contacts enrolled in an automation funnel. Can filter by status (active/completed/cancelled).',
        inputSchema: {
          type: 'object',
          properties: {
            site: siteProp,
            funnelId: { type: 'number', description: 'Automation/funnel ID' },
            search: { type: 'string', description: 'Search by name/email' },
            status: { type: 'string', description: 'Filter by status', enum: ['active', 'completed', 'cancelled'] },
            page: { type: 'number', description: 'Page number' },
          },
          required: ['funnelId'],
        },
      },
      {
        name: 'fluentcrm_update_funnel_subscriber_status',
        description: 'Update a subscriber status within an automation (complete or cancel their run)',
        inputSchema: {
          type: 'object',
          properties: {
            site: siteProp,
            funnelId: { type: 'number', description: 'Automation/funnel ID' },
            subscriberId: { type: 'number', description: 'Subscriber ID within the funnel' },
            status: { type: 'string', description: 'New status', enum: ['completed', 'cancelled'] },
          },
          required: ['funnelId', 'subscriberId', 'status'],
        },
      },
      {
        name: 'fluentcrm_get_automation_report',
        description: 'Get performance report/stats for an automation funnel',
        inputSchema: {
          type: 'object',
          properties: {
            site: siteProp,
            funnelId: { type: 'number', description: 'Automation/funnel ID' },
          },
          required: ['funnelId'],
        },
      },
      {
        name: 'fluentcrm_get_contact_automations',
        description: 'List all automation funnels that a specific contact is enrolled in',
        inputSchema: {
          type: 'object',
          properties: {
            site: siteProp,
            subscriberId: { type: 'number', description: 'Contact/subscriber ID' },
          },
          required: ['subscriberId'],
        },
      },
      {
        name: 'fluentcrm_change_trigger',
        description: 'Change the trigger of an existing automation. WARNING: This resets funnel settings and conditions.',
        inputSchema: {
          type: 'object',
          properties: {
            site: siteProp,
            funnelId: { type: 'number', description: 'Automation/funnel ID' },
            trigger_name: { type: 'string', description: 'New trigger name (use fluentcrm_list_triggers to see options)' },
            title: { type: 'string', description: 'New automation title (optional)' },
          },
          required: ['funnelId', 'trigger_name'],
        },
      },

      // ===== WEBHOOKS =====
      {
        name: 'fluentcrm_list_webhooks',
        description: 'Pobiera webhooks',
        inputSchema: {
          type: 'object',
          properties: {
            site: siteProp,
          },
        },
      },
      {
        name: 'fluentcrm_create_webhook',
        description: 'Tworzy nowy webhook',
        inputSchema: {
          type: 'object',
          properties: {
            site: siteProp,
            name: { type: 'string', description: 'Nazwa webhook' },
            url: { type: 'string', description: 'URL webhook' },
            status: { type: 'string', enum: ['pending', 'subscribed'] },
            tags: { type: 'array', items: { type: 'number' } },
            lists: { type: 'array', items: { type: 'number' } },
          },
          required: ['name', 'url', 'status'],
        },
      },

      // ===== SMART LINKS =====
      {
        name: 'fluentcrm_list_smart_links',
        description: 'Pobiera listę Smart Links z FluentCRM (może nie być dostępne w obecnej wersji)',
        inputSchema: {
          type: 'object',
          properties: {
            site: siteProp,
            page: { type: 'number', description: 'Numer strony' },
            search: { type: 'string', description: 'Szukaj Smart Link' },
          },
        },
      },
      {
        name: 'fluentcrm_get_smart_link',
        description: 'Pobiera szczegóły konkretnego Smart Link',
        inputSchema: {
          type: 'object',
          properties: {
            site: siteProp,
            smartLinkId: { type: 'number', description: 'ID Smart Link' },
          },
          required: ['smartLinkId'],
        },
      },
      {
        name: 'fluentcrm_create_smart_link',
        description: 'Tworzy nowy Smart Link (może nie być dostępne w obecnej wersji)',
        inputSchema: {
          type: 'object',
          properties: {
            site: siteProp,
            title: { type: 'string', description: 'Nazwa Smart Link (np. "AW-Link-Webinar-Mail")' },
            slug: { type: 'string', description: 'Slug (np. "aw-link-webinar-mail")' },
            target_url: { type: 'string', description: 'Docelowy URL' },
            apply_tags: { type: 'array', items: { type: 'number' }, description: 'ID tagów do dodania po kliknięciu' },
            apply_lists: { type: 'array', items: { type: 'number' }, description: 'ID list do dodania po kliknięciu' },
            remove_tags: { type: 'array', items: { type: 'number' }, description: 'ID tagów do usunięcia po kliknięciu' },
            remove_lists: { type: 'array', items: { type: 'number' }, description: 'ID list do usunięcia po kliknięciu' },
            auto_login: { type: 'boolean', description: 'Czy automatycznie logować użytkownika' },
          },
          required: ['title', 'target_url'],
        },
      },
      {
        name: 'fluentcrm_update_smart_link',
        description: 'Aktualizuje Smart Link (może nie być dostępne w obecnej wersji)',
        inputSchema: {
          type: 'object',
          properties: {
            site: siteProp,
            smartLinkId: { type: 'number', description: 'ID Smart Link' },
            title: { type: 'string' },
            target_url: { type: 'string' },
            apply_tags: { type: 'array', items: { type: 'number' } },
            apply_lists: { type: 'array', items: { type: 'number' } },
            remove_tags: { type: 'array', items: { type: 'number' } },
            remove_lists: { type: 'array', items: { type: 'number' } },
            auto_login: { type: 'boolean' },
          },
          required: ['smartLinkId'],
        },
      },
      {
        name: 'fluentcrm_delete_smart_link',
        description: 'Usuwa Smart Link (może nie być dostępne w obecnej wersji)',
        inputSchema: {
          type: 'object',
          properties: {
            site: siteProp,
            smartLinkId: { type: 'number', description: 'ID Smart Link do usunięcia' },
          },
          required: ['smartLinkId'],
        },
      },
      {
        name: 'fluentcrm_generate_smart_link_shortcode',
        description: 'Generuje shortcode dla Smart Link',
        inputSchema: {
          type: 'object',
          properties: {
            site: siteProp,
            slug: { type: 'string', description: 'Slug Smart Link' },
            linkText: { type: 'string', description: 'Tekst linku (opcjonalny)' },
          },
          required: ['slug'],
        },
      },
      {
        name: 'fluentcrm_validate_smart_link_data',
        description: 'Waliduje dane Smart Link przed utworzeniem',
        inputSchema: {
          type: 'object',
          properties: {
            site: siteProp,
            title: { type: 'string', description: 'Nazwa Smart Link' },
            slug: { type: 'string', description: 'Slug' },
            target_url: { type: 'string', description: 'Docelowy URL' },
            apply_tags: { type: 'array', items: { type: 'number' } },
            apply_lists: { type: 'array', items: { type: 'number' } },
            remove_tags: { type: 'array', items: { type: 'number' } },
            remove_lists: { type: 'array', items: { type: 'number' } },
            auto_login: { type: 'boolean' },
          },
          required: ['title', 'target_url'],
        },
      },

      // ===== RAPORTY =====
      {
        name: 'fluentcrm_dashboard_stats',
        description: 'Pobiera statystyki dashboarda',
        inputSchema: {
          type: 'object',
          properties: {
            site: siteProp,
          },
        },
      },
      {
        name: 'fluentcrm_custom_fields',
        description: 'Pobiera pola niestandardowe',
        inputSchema: {
          type: 'object',
          properties: {
            site: siteProp,
          },
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const site = (args as any)?.site;
  const siteClient = getClient(site);

  try {
    switch (name) {
      case 'fluentcrm_list_contacts':
        return { content: [{ type: 'text', text: JSON.stringify(await siteClient.listContacts(args || {}), null, 2) }] };
      case 'fluentcrm_get_contact':
        return { content: [{ type: 'text', text: JSON.stringify(await siteClient.getContact((args as any)?.subscriberId), null, 2) }] };
      case 'fluentcrm_find_contact_by_email':
        return { content: [{ type: 'text', text: JSON.stringify(await siteClient.findContactByEmail((args as any)?.email), null, 2) }] };
      case 'fluentcrm_create_contact':
        return { content: [{ type: 'text', text: JSON.stringify(await siteClient.createContact(args as any), null, 2) }] };
      case 'fluentcrm_update_contact':
        return { content: [{ type: 'text', text: JSON.stringify(await siteClient.updateContact((args as any)?.subscriberId, args as any), null, 2) }] };
      case 'fluentcrm_delete_contact':
        return { content: [{ type: 'text', text: JSON.stringify(await siteClient.deleteContact((args as any)?.subscriberId), null, 2) }] };
      case 'fluentcrm_list_tags':
        return { content: [{ type: 'text', text: JSON.stringify(await siteClient.listTags(args || {}), null, 2) }] };
      case 'fluentcrm_create_tag':
        return { content: [{ type: 'text', text: JSON.stringify(await siteClient.createTag(args as any), null, 2) }] };
      case 'fluentcrm_delete_tag':
        return { content: [{ type: 'text', text: JSON.stringify(await siteClient.deleteTag((args as any)?.tagId), null, 2) }] };
      case 'fluentcrm_attach_tag_to_contact':
        return { content: [{ type: 'text', text: JSON.stringify(await siteClient.attachTagToContact((args as any)?.subscriberId, (args as any)?.tagIds), null, 2) }] };
      case 'fluentcrm_detach_tag_from_contact':
        return { content: [{ type: 'text', text: JSON.stringify(await siteClient.detachTagFromContact((args as any)?.subscriberId, (args as any)?.tagIds), null, 2) }] };
      case 'fluentcrm_list_lists':
        return { content: [{ type: 'text', text: JSON.stringify(await siteClient.listLists(), null, 2) }] };
      case 'fluentcrm_create_list':
        return { content: [{ type: 'text', text: JSON.stringify(await siteClient.createList(args as any), null, 2) }] };
      case 'fluentcrm_delete_list':
        return { content: [{ type: 'text', text: JSON.stringify(await siteClient.deleteList((args as any)?.listId), null, 2) }] };
      case 'fluentcrm_attach_contact_to_list':
        return { content: [{ type: 'text', text: JSON.stringify(await siteClient.attachContactToList((args as any)?.subscriberId, (args as any)?.listIds), null, 2) }] };
      case 'fluentcrm_detach_contact_from_list':
        return { content: [{ type: 'text', text: JSON.stringify(await siteClient.detachContactFromList((args as any)?.subscriberId, (args as any)?.listIds), null, 2) }] };
      case 'fluentcrm_list_campaigns':
        return { content: [{ type: 'text', text: JSON.stringify(await siteClient.listCampaigns(args || {}), null, 2) }] };
      case 'fluentcrm_create_campaign':
        return { content: [{ type: 'text', text: JSON.stringify(await siteClient.createCampaign(args as any), null, 2) }] };
      case 'fluentcrm_pause_campaign':
        return { content: [{ type: 'text', text: JSON.stringify(await siteClient.pauseCampaign((args as any)?.campaignId), null, 2) }] };
      case 'fluentcrm_resume_campaign':
        return { content: [{ type: 'text', text: JSON.stringify(await siteClient.resumeCampaign((args as any)?.campaignId), null, 2) }] };
      case 'fluentcrm_delete_campaign':
        return { content: [{ type: 'text', text: JSON.stringify(await siteClient.deleteCampaign((args as any)?.campaignId), null, 2) }] };
      case 'fluentcrm_list_email_templates':
        return { content: [{ type: 'text', text: JSON.stringify(await siteClient.listEmailTemplates(), null, 2) }] };
      case 'fluentcrm_create_email_template':
        return { content: [{ type: 'text', text: JSON.stringify(await siteClient.createEmailTemplate(args as any), null, 2) }] };
      case 'fluentcrm_list_automations':
        return { content: [{ type: 'text', text: JSON.stringify(await siteClient.listAutomations(args || {}), null, 2) }] };
      case 'fluentcrm_create_automation':
        return { content: [{ type: 'text', text: JSON.stringify(await siteClient.createAutomation(args as any), null, 2) }] };
      case 'fluentcrm_get_automation':
        return { content: [{ type: 'text', text: JSON.stringify(await siteClient.getAutomation((args as any)?.funnelId, (args as any)?.withSequences !== false), null, 2) }] };
      case 'fluentcrm_update_automation':
        return { content: [{ type: 'text', text: JSON.stringify(await siteClient.updateAutomation((args as any)?.funnelId, { status: (args as any)?.status }), null, 2) }] };
      case 'fluentcrm_delete_automation':
        return { content: [{ type: 'text', text: JSON.stringify(await siteClient.deleteAutomation((args as any)?.funnelId), null, 2) }] };
      case 'fluentcrm_clone_automation':
        return { content: [{ type: 'text', text: JSON.stringify(await siteClient.cloneAutomation((args as any)?.funnelId), null, 2) }] };
      case 'fluentcrm_list_triggers':
        return { content: [{ type: 'text', text: JSON.stringify(await siteClient.listTriggers(), null, 2) }] };
      case 'fluentcrm_save_automation_sequences':
        return { content: [{ type: 'text', text: JSON.stringify(await siteClient.saveAutomationSequences((args as any)?.funnelId, {
          funnel_title: (args as any)?.funnel_title,
          funnel_description: (args as any)?.funnel_description,
          status: (args as any)?.status,
          sequences: (args as any)?.sequences,
          funnel_settings: (args as any)?.funnel_settings,
          conditions: (args as any)?.conditions,
        }), null, 2) }] };
      case 'fluentcrm_save_email_action':
        return { content: [{ type: 'text', text: JSON.stringify(await siteClient.saveEmailAction((args as any)?.funnelId, {
          action_name: (args as any)?.action_name || 'send_custom_email',
          campaign: {
            id: (args as any)?.campaign_id || null,
            email_subject: (args as any)?.email_subject,
            email_pre_header: (args as any)?.email_pre_header || '',
            email_body: (args as any)?.email_body,
            design_template: (args as any)?.design_template || 'simple',
          },
        }), null, 2) }] };
      case 'fluentcrm_list_funnel_subscribers':
        return { content: [{ type: 'text', text: JSON.stringify(await siteClient.listFunnelSubscribers((args as any)?.funnelId, {
          search: (args as any)?.search,
          status: (args as any)?.status,
          page: (args as any)?.page,
        }), null, 2) }] };
      case 'fluentcrm_update_funnel_subscriber_status':
        return { content: [{ type: 'text', text: JSON.stringify(await siteClient.updateFunnelSubscriberStatus((args as any)?.funnelId, (args as any)?.subscriberId, (args as any)?.status), null, 2) }] };
      case 'fluentcrm_get_automation_report':
        return { content: [{ type: 'text', text: JSON.stringify(await siteClient.getAutomationReport((args as any)?.funnelId), null, 2) }] };
      case 'fluentcrm_get_contact_automations':
        return { content: [{ type: 'text', text: JSON.stringify(await siteClient.getContactAutomations((args as any)?.subscriberId), null, 2) }] };
      case 'fluentcrm_change_trigger':
        return { content: [{ type: 'text', text: JSON.stringify(await siteClient.changeTrigger((args as any)?.funnelId, (args as any)?.trigger_name, (args as any)?.title), null, 2) }] };
      case 'fluentcrm_list_webhooks':
        return { content: [{ type: 'text', text: JSON.stringify(await siteClient.listWebhooks(), null, 2) }] };
      case 'fluentcrm_create_webhook':
        return { content: [{ type: 'text', text: JSON.stringify(await siteClient.createWebhook(args as any), null, 2) }] };
      case 'fluentcrm_dashboard_stats':
        return { content: [{ type: 'text', text: JSON.stringify(await siteClient.getDashboardStats(), null, 2) }] };
      case 'fluentcrm_custom_fields':
        return { content: [{ type: 'text', text: JSON.stringify(await siteClient.listCustomFields(), null, 2) }] };

      // ===== SMART LINKS =====
      case 'fluentcrm_list_smart_links':
        return { content: [{ type: 'text', text: JSON.stringify(await siteClient.listSmartLinks(args || {}), null, 2) }] };
      case 'fluentcrm_get_smart_link':
        return { content: [{ type: 'text', text: JSON.stringify(await siteClient.getSmartLink((args as any)?.smartLinkId), null, 2) }] };
      case 'fluentcrm_create_smart_link':
        return { content: [{ type: 'text', text: JSON.stringify(await siteClient.createSmartLink(args as any), null, 2) }] };
      case 'fluentcrm_update_smart_link':
        return { content: [{ type: 'text', text: JSON.stringify(await siteClient.updateSmartLink((args as any)?.smartLinkId, args as any), null, 2) }] };
      case 'fluentcrm_delete_smart_link':
        return { content: [{ type: 'text', text: JSON.stringify(await siteClient.deleteSmartLink((args as any)?.smartLinkId), null, 2) }] };
      case 'fluentcrm_generate_smart_link_shortcode':
        return { content: [{ type: 'text', text: JSON.stringify({ shortcode: siteClient.generateSmartLinkShortcode((args as any)?.slug, (args as any)?.linkText) }, null, 2) }] };
      case 'fluentcrm_validate_smart_link_data':
        return { content: [{ type: 'text', text: JSON.stringify(siteClient.validateSmartLinkData(args as any), null, 2) }] };

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error: any) {
    return {
      content: [{ type: 'text', text: `Error: ${error.message}` }],
      isError: true,
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('FluentCRM MCP Server v1.2.0 running on stdio (multi-site)');
  console.error(`Configured sites: ${siteNames.join(', ') || '(none)'}`);
  for (const [name, config] of siteConfigs.entries()) {
    console.error(`  [${name}] ${config.url} (user: ${config.username})`);
  }
}

main().catch((error) => {
  console.error('Server error:', error);
  process.exit(1);
});
