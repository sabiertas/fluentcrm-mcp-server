# FluentCRM MCP Server

A Model Context Protocol (MCP) server that provides AI assistants with full access to the [FluentCRM](https://fluentcrm.com) email marketing API — **48 tools** for contact management, campaign operations, full automation control, and CRM workflows through natural language.

Originally created by [Milosz Zajac](https://netfly.pl), forked and extended by [Flowtitude](https://flowtitude.com) with automation sequences, Smart Links, webhook management, multi-site support, and more.

## Features

- **Contacts** — CRUD, find-by-email, tag/list attach-detach
- **Campaigns** — Create, pause, resume, delete email campaigns
- **Email Templates** — List and create templates
- **Automations** — Full funnel management: read sequences (steps), create/edit/delete/clone funnels, list available triggers, save automation steps, manage emails within steps, view funnel subscribers and reports
- **Webhooks** — List and create webhooks
- **Smart Links** — CRUD, shortcode generation, validation
- **Reports** — Dashboard stats, custom fields
- **Multi-site** — Manage multiple WordPress sites from a single server

## Available Tools (48)

### Contacts (6)

| Tool | Description |
|------|-------------|
| `fluentcrm_list_contacts` | List all contacts with pagination and search |
| `fluentcrm_get_contact` | Get contact details by ID |
| `fluentcrm_find_contact_by_email` | Find a contact by email address |
| `fluentcrm_create_contact` | Create a new contact (defaults to subscribed) |
| `fluentcrm_update_contact` | Update contact data |
| `fluentcrm_delete_contact` | Delete a contact |

### Tags (5)

| Tool | Description |
|------|-------------|
| `fluentcrm_list_tags` | List all tags |
| `fluentcrm_create_tag` | Create a new tag |
| `fluentcrm_delete_tag` | Delete a tag |
| `fluentcrm_attach_tag_to_contact` | Attach tags to a contact |
| `fluentcrm_detach_tag_from_contact` | Remove tags from a contact |

### Lists (5)

| Tool | Description |
|------|-------------|
| `fluentcrm_list_lists` | List all contact lists |
| `fluentcrm_create_list` | Create a new list |
| `fluentcrm_delete_list` | Delete a list |
| `fluentcrm_attach_contact_to_list` | Add a contact to lists |
| `fluentcrm_detach_contact_from_list` | Remove a contact from lists |

### Campaigns (5)

| Tool | Description |
|------|-------------|
| `fluentcrm_list_campaigns` | List email campaigns |
| `fluentcrm_create_campaign` | Create a new email campaign |
| `fluentcrm_pause_campaign` | Pause an active campaign |
| `fluentcrm_resume_campaign` | Resume a paused campaign |
| `fluentcrm_delete_campaign` | Delete a campaign |

### Email Templates (2)

| Tool | Description |
|------|-------------|
| `fluentcrm_list_email_templates` | List email templates |
| `fluentcrm_create_email_template` | Create a new email template |

### Automations (14) — NEW in v1.2.0

| Tool | Description |
|------|-------------|
| `fluentcrm_list_automations` | List all automation funnels |
| `fluentcrm_get_automation` | Get full automation details with sequences (steps), available blocks and block fields |
| `fluentcrm_create_automation` | Create a new automation funnel |
| `fluentcrm_update_automation` | Update automation status (draft/published) |
| `fluentcrm_delete_automation` | Delete an automation funnel |
| `fluentcrm_clone_automation` | Duplicate a funnel with all its sequences |
| `fluentcrm_list_triggers` | List all available automation trigger types |
| `fluentcrm_change_trigger` | Change the trigger of an existing automation |
| `fluentcrm_save_automation_sequences` | Save all sequences (steps) for an automation (full-state replacement) |
| `fluentcrm_save_email_action` | Save/update an email for a send_custom_email step |
| `fluentcrm_list_funnel_subscribers` | List contacts enrolled in a funnel (filter by active/completed/cancelled) |
| `fluentcrm_update_funnel_subscriber_status` | Complete or cancel a contact's run in a funnel |
| `fluentcrm_get_automation_report` | Get performance report for a funnel |
| `fluentcrm_get_contact_automations` | List all funnels a specific contact is enrolled in |

### Webhooks (2)

| Tool | Description |
|------|-------------|
| `fluentcrm_list_webhooks` | List webhooks |
| `fluentcrm_create_webhook` | Create a new webhook |

### Smart Links (5)

| Tool | Description |
|------|-------------|
| `fluentcrm_list_smart_links` | List Smart Links |
| `fluentcrm_get_smart_link` | Get Smart Link details |
| `fluentcrm_create_smart_link` | Create a new Smart Link |
| `fluentcrm_update_smart_link` | Update a Smart Link |
| `fluentcrm_delete_smart_link` | Delete a Smart Link |

### Smart Link Helpers (2)

| Tool | Description |
|------|-------------|
| `fluentcrm_generate_smart_link_shortcode` | Generate a shortcode for a Smart Link |
| `fluentcrm_validate_smart_link_data` | Validate Smart Link data before creation |

### Reports (2)

| Tool | Description |
|------|-------------|
| `fluentcrm_dashboard_stats` | Get dashboard statistics |
| `fluentcrm_custom_fields` | List custom fields |

## Requirements

- Node.js 18+
- WordPress site with [FluentCRM](https://fluentcrm.com) installed and activated
- WordPress Application Password

## Quick Setup

### 1. Clone and build

```bash
git clone https://github.com/sabiertas/fluentcrm-mcp-server.git
cd fluentcrm-mcp-server
npm install
npm run build
```

### 2. Configure in Claude Code

Add to `~/.claude.json`:

```json
{
  "mcpServers": {
    "fluentcrm": {
      "command": "node",
      "args": ["/path/to/fluentcrm-mcp-server/dist/fluentcrm-mcp-server.js"],
      "env": {
        "FLUENTCRM_API_URL": "https://your-domain.com/wp-json/fluent-crm/v2",
        "FLUENTCRM_API_USERNAME": "your-wp-username",
        "FLUENTCRM_API_PASSWORD": "your-application-password"
      }
    }
  }
}
```

### Multi-site configuration

To manage multiple WordPress sites, use `FLUENTCRM_SITES` instead:

```json
{
  "mcpServers": {
    "fluentcrm": {
      "command": "node",
      "args": ["/path/to/fluentcrm-mcp-server/dist/fluentcrm-mcp-server.js"],
      "env": {
        "FLUENTCRM_SITES": "{\"site1\":{\"url\":\"https://site1.com/wp-json/fluent-crm/v2\",\"username\":\"user1\",\"password\":\"xxxx xxxx xxxx xxxx\"},\"site2\":{\"url\":\"https://site2.com/wp-json/fluent-crm/v2\",\"username\":\"user2\",\"password\":\"yyyy yyyy yyyy yyyy\"}}"
      }
    }
  }
}
```

Then pass `site: "site1"` or `site: "site2"` to any tool. Defaults to the first site if omitted.

### 3. Configure in Cursor / other MCP clients

Same config pattern — see your client's MCP documentation.

## Authentication

Uses WordPress Application Passwords (Basic Auth). Create one at:
`WordPress Admin > Users > Profile > Application Passwords`

## Contributing

PRs welcome. Please open an issue first to discuss changes.

## License

MIT
