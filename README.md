# FluentCRM MCP Server

A Model Context Protocol (MCP) server that provides AI assistants with full access to the [FluentCRM](https://fluentcrm.com) email marketing API, enabling contact management, campaign operations, automation control, and CRM workflows through natural language.

Originally created by [Milosz Zajac](https://netfly.pl), forked and extended with Smart Links support, webhook management, and additional improvements.

## Features

- Contact CRUD with find-by-email lookup
- Tag and list management with attach/detach operations on contacts
- Email campaign lifecycle (create, pause, resume, delete)
- Email template management
- Automation (funnel) management
- Webhook configuration
- Smart Links support (create, update, delete, generate shortcodes)
- Custom fields listing
- Dashboard statistics and reports

## Available Tools

| Tool | Description |
|------|-------------|
| `fluentcrm_list_contacts` | List all contacts with pagination and search |
| `fluentcrm_get_contact` | Get contact details by ID |
| `fluentcrm_find_contact_by_email` | Find a contact by email address |
| `fluentcrm_create_contact` | Create a new contact |
| `fluentcrm_update_contact` | Update contact data |
| `fluentcrm_delete_contact` | Delete a contact |
| `fluentcrm_list_tags` | List all tags |
| `fluentcrm_create_tag` | Create a new tag |
| `fluentcrm_delete_tag` | Delete a tag |
| `fluentcrm_attach_tag_to_contact` | Attach tags to a contact |
| `fluentcrm_detach_tag_from_contact` | Remove tags from a contact |
| `fluentcrm_list_lists` | List all contact lists |
| `fluentcrm_create_list` | Create a new list |
| `fluentcrm_delete_list` | Delete a list |
| `fluentcrm_attach_contact_to_list` | Add a contact to lists |
| `fluentcrm_detach_contact_from_list` | Remove a contact from lists |
| `fluentcrm_list_campaigns` | List email campaigns |
| `fluentcrm_create_campaign` | Create a new email campaign |
| `fluentcrm_pause_campaign` | Pause an active campaign |
| `fluentcrm_resume_campaign` | Resume a paused campaign |
| `fluentcrm_delete_campaign` | Delete a campaign |
| `fluentcrm_list_email_templates` | List email templates |
| `fluentcrm_create_email_template` | Create a new email template |
| `fluentcrm_list_automations` | List automations (funnels) |
| `fluentcrm_create_automation` | Create a new automation |
| `fluentcrm_list_webhooks` | List webhooks |
| `fluentcrm_create_webhook` | Create a new webhook |
| `fluentcrm_list_smart_links` | List Smart Links |
| `fluentcrm_get_smart_link` | Get Smart Link details |
| `fluentcrm_create_smart_link` | Create a new Smart Link |
| `fluentcrm_update_smart_link` | Update a Smart Link |
| `fluentcrm_delete_smart_link` | Delete a Smart Link |
| `fluentcrm_generate_smart_link_shortcode` | Generate a shortcode for a Smart Link |
| `fluentcrm_validate_smart_link_data` | Validate Smart Link data before creation |
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

### 3. Configure in Cursor / other MCP clients

Same config pattern -- see your client's MCP documentation.

## Authentication

Uses WordPress Application Passwords (Basic Auth). Create one at:
`WordPress Admin > Users > Profile > Application Passwords`

## Contributing

PRs welcome. Please open an issue first to discuss changes.

## License

MIT
