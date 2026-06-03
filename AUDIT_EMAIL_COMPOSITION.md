# FluentCRM Email Composition REST API — Complete Audit

**Scope**: Email body/template management capabilities via FluentCRM REST API  
**Goal**: Understand what the API can/cannot do to plan custom endpoints  
**Source Data**: MCP Server (48 tools), REST API Reference, Source Code Analysis (Routes, Controllers, Models, Services)  
**Date**: 2026-03-27

---

## Executive Summary

FluentCRM exposes **4 REST API resource groups** for email composition:
1. **Campaigns** — Broadcast email bodies (visual builder or HTML)
2. **Templates** — Reusable email templates with metadata
3. **Funnels/Automations** — Sequence email composition with conditional logic
4. **Subscriber Direct Email** — One-off emails to individual contacts

**Email composition capabilities** are **FULL**: visual builder, custom HTML, Gutenberg blocks, conditional content, template inheritance, remote template loading.

**API gaps** exist in: visual builder editor access (client-side only), template preview rendering (requires WordPress context), bulk email composition workflows.

---

## 1. Email Composition REST API Endpoints

### 1.1 Campaign Email Composition

**Purpose**: Create/update broadcast campaigns with email body, subject, design template.

**Endpoints**:

| Method | Endpoint | Purpose | Input Fields |
|--------|----------|---------|--------------|
| `POST` | `/campaigns` | Create broadcast campaign | `email_subject`, `email_body`, `design_template`, `template_id`, `settings`, `email_pre_header` |
| `PUT` | `/campaigns/{id}` | Update campaign email content | Same as above (whitelist) |
| `GET` | `/campaigns/{id}` | Retrieve campaign (including email) | — |
| `POST` | `/campaigns/{id}/send-test-email` | Send test email to specified address | Request body: `{ "email": "test@example.com" }` |
| `GET` | `/campaigns/{id}/emails/{email_id}/preview` | Preview rendered email HTML | — |
| `POST` | `/campaigns/{id}/email-preview-html` | Get preview HTML without sending | Request body: `{ "preview_email": "test@example.com" }` |
| `POST` | `/campaigns/{id}/duplicate` | Clone campaign with all email settings | — |

**Campaign Email Fields** (updateable via REST API):

```json
{
  "email_subject": "string",           // Email subject line
  "email_pre_header": "string",        // Preview text in inbox
  "email_body": "html string",         // HTML body (for raw_html/raw_classic)
  "design_template": "enum",           // 'simple' | 'raw_classic' | 'visual_builder' | 'raw_html'
  "template_id": "integer",            // Foreign key to email template
  "settings": {                        // Serialized JSON config
    "reply_to": "email",
    "footer_settings": {/* ... */},
    "extra_settings": {/* ... */}
  }
}
```

**Storage Architecture**:

```
wp_posts (campaigns table)
├── design_template      → Indicates composition method
├── email_body           → HTML for raw_html/raw_classic types
├── email_subject        → Subject line
├── email_pre_header     → Preview text
└── post_meta (_campaign_design)  → Visual builder JSON (if design_template='visual_builder')

post_meta (_visual_builder_design)  → Serialized Campaign\Models\CampaignDesign object
```

**Visual Builder Design Storage** (from SendEmailAction.php):

Visual builder designs are **NOT stored in email_body** — they're stored as serialized metadata in `post_meta` with key `_visual_builder_design`. The design object contains:

- **Sections**: Array of email content sections (header, body, footer)
- **Settings**: Global design settings (fonts, colors, layout)
- **Blocks**: Gutenberg block structure with conditional logic

When rendering:
1. Fetch design from post_meta `_visual_builder_design`
2. Pass to `BlockParser` service
3. BlockParser evaluates conditional blocks with subscriber context
4. Returns rendered HTML

---

### 1.2 Email Template Management

**Purpose**: Create reusable email templates that can be assigned to campaigns/automations.

**Endpoints**:

| Method | Endpoint | Purpose | Input Fields |
|--------|----------|---------|--------------|
| `GET` | `/templates` | List all email templates | Query: `page`, `per_page`, `search` |
| `POST` | `/templates` | Create new email template | `title`, `body`, `subject`, `design_template`, `email_pre_header` |
| `GET` | `/templates/{id}` | Retrieve template details | — |
| `PUT` | `/templates/{id}` | Update template | Updateable fields (see below) |
| `DELETE` | `/templates/{id}` | Delete template | — |
| `POST` | `/templates/{id}/duplicate` | Clone template | — |

**Email Template Fields** (updateable):

```json
{
  "title": "string",              // Template name
  "body": "html string",          // Template body (for raw templates)
  "subject": "string",            // Default subject
  "email_pre_header": "string",   // Preview text
  "design_template": "enum",      // 'simple' | 'raw_classic' | 'visual_builder' | 'raw_html'
  "template_config": {            // Metadata
    "footer_settings": {/* ... */}
  }
}
```

**Template Storage**:

```
wp_posts (template CPT)
├── post_title           → Template title
├── post_content         → Template body (for raw types)
└── post_meta
    ├── _design_template     → Template type
    ├── _email_subject       → Default subject
    ├── _email_pre_header    → Preview text
    ├── _template_config     → Metadata (serialized JSON)
    ├── _footer_settings     → Footer config
    └── _visual_builder_design → Visual builder design (if type='visual_builder')
```

**Template Metadata** (TemplateController.php):

Templates can store additional metadata:
- Footer branding settings
- Design preferences
- Custom configuration

Metadata is passed through to campaigns when template_id is set.

---

### 1.3 Automation Sequence Email Composition

**Purpose**: Create email sends within automation sequences with conditional branching.

**Endpoints**:

| Method | Endpoint | Purpose | Input Fields |
|--------|----------|---------|--------------|
| `POST` | `/funnels` | Create new automation | `title`, `trigger`, `description` |
| `GET` | `/funnels/{id}` | Get automation with sequences | — |
| `POST` | `/funnels/{id}/sequences` | Save all sequences (email + conditionals) | `sequences` array (see below) |
| `POST` | `/funnels/{id}/sequences/save-email-action` | Save single email step | Email action object |
| `PUT` | `/funnels/{id}` | Update automation metadata | `title`, `status` |
| `DELETE` | `/funnels/{id}` | Delete automation | — |
| `POST` | `/funnels/{id}/pause` | Pause automation | — |
| `POST` | `/funnels/{id}/resume` | Resume automation | — |

**Automation Email Action Structure**:

```json
{
  "type": "action",
  "action_name": "send_custom_email",
  "title": "string",
  "settings": {
    "email_subject": "string",
    "email_pre_header": "string",
    "email_body": "html string",
    "design_template": "enum",       // Same as campaigns
    "email_template_id": "integer",  // Reference to template
    "email_template_id_for_email": "integer"
  }
}
```

**Sequence with Conditionals**:

```json
{
  "sequences": [
    {
      "id": 123,
      "type": "action",
      "action_name": "send_custom_email",
      "title": "Welcome Email",
      "settings": {/* ... */},
      "parent_id": 0
    },
    {
      "id": 124,
      "type": "conditional",
      "parent_id": 0,
      "condition_type": "link_click",
      "settings": {/* ... */},
      "children": [
        {
          "id": 125,
          "type": "action",
          "action_name": "send_custom_email",
          "title": "Follow-up (clicked)",
          "settings": {/* ... */},
          "parent_id": 124,
          "condition_type": "yes"
        },
        {
          "id": 126,
          "type": "action",
          "action_name": "send_custom_email",
          "title": "Reminder (no click)",
          "settings": {/* ... */},
          "parent_id": 124,
          "condition_type": "no"
        }
      ]
    }
  ]
}
```

**Storage** (FunnelSequence model):

```sql
wp_fluent_crm_funnel_sequences
├── funnel_id           → Parent automation
├── action_name         → 'send_custom_email'
├── type                → 'action' | 'conditional'
├── title               → Step title
├── settings            → Serialized JSON (email subject, body, etc.)
├── parent_id           → For nesting (0 = root)
└── condition_type      → For conditional branches ('yes' | 'no')
```

**Conditional Logic** (BlockParser.php):

Automation sequences support nested conditionals with:
- **Parent-child relationships** via parent_id
- **Condition types** determining email send based on subscriber behavior
- **Context variables** substituted during rendering ({{subscriber.first_name}}, {{contact.email}}, etc.)

When a sequence runs:
1. Parse sequence tree (root + children)
2. Evaluate conditions with subscriber context
3. Send email for matching branch
4. Continue to next sequence step

---

### 1.4 Subscriber Direct Email

**Purpose**: Send one-off emails directly to individual subscribers.

**Endpoints**:

| Method | Endpoint | Purpose | Input Fields |
|--------|----------|---------|--------------|
| `POST` | `/subscribers/{id}/emails/send` | Send custom email to subscriber | `email_subject`, `email_body`, `email_pre_header`, `design_template` |
| `GET` | `/subscribers/{id}/emails` | Get email history for subscriber | — |
| `GET` | `/subscribers/{id}/emails/template-mock` | Get subscriber data for template rendering | — |

**Direct Email Request Body**:

```json
{
  "email_subject": "string",
  "email_body": "html string",
  "email_pre_header": "string",
  "design_template": "simple" | "raw_html",
  "reply_to": "email@example.com"
}
```

---

## 2. Email Body Composition Methods

### 2.1 Raw HTML (`design_template: 'raw_html'`)

**Capabilities**:
- Direct HTML input via `email_body` field
- No processing or validation
- Full HTML/CSS support

**Use Case**: Custom-coded emails, external template imports

**Example**:
```json
{
  "email_subject": "Welcome",
  "email_body": "<html><body><h1>Hello {{subscriber.first_name}}</h1></body></html>",
  "design_template": "raw_html"
}
```

---

### 2.2 Visual Builder (`design_template: 'visual_builder'`)

**Capabilities**:
- Drag-and-drop email sections
- Conditional content blocks
- Template inheritance
- Remote template loading (cached 24h)
- Gutenberg block support

**Storage**: Serialized `CampaignDesign` object in post_meta `_visual_builder_design`

**Design Structure**:
```json
{
  "type": "visual_builder",
  "sections": [
    {
      "type": "header",
      "settings": { "background_color": "#fff" },
      "blocks": [/* Gutenberg blocks */]
    },
    {
      "type": "body",
      "blocks": [
        {
          "type": "paragraph",
          "settings": { "text": "Welcome {{subscriber.first_name}}" }
        },
        {
          "type": "conditional",
          "settings": { "condition": "subscriber.status == 'active'" },
          "blocks": [/* nested content */]
        }
      ]
    },
    {
      "type": "footer",
      "settings": { "branding": true }
    }
  ]
}
```

**Block Parsing** (BlockParser.php):

When rendering visual builder design:
1. Extract sections from design
2. For each section, parse blocks
3. Evaluate conditionals with subscriber context
4. Substitute variables ({{subscriber.X}}, {{contact.X}})
5. Return final HTML

**Remote Template Loading**:

Templates can be loaded from fluentcrm.com:
```php
$template = $this->getRemoteTemplate($template_id); // Cached 24h
```

---

### 2.3 Classic Editor (`design_template: 'raw_classic'`)

**Capabilities**:
- Legacy WordPress editor support
- HTML + basic markup

**Storage**: `email_body` field

---

### 2.4 Simple Template (`design_template: 'simple'`)

**Capabilities**:
- Minimal template engine
- Basic variable substitution

**Storage**: `email_body` field

---

## 3. Field Exposure & Updateability by Endpoint

### Campaign Update (`PUT /campaigns/{id}`)

**Whitelist** (from CampaignController.php):

✅ **Updateable**:
- `email_subject`
- `email_body`
- `email_pre_header`
- `design_template`
- `template_id`
- `settings` (serialized JSON)

❌ **Not updateable**:
- `id`, `post_author`, `post_date`, `post_modified` (immutable)
- `post_status` (use pause/resume endpoints)
- Campaign scheduling (use separate endpoint)

### Template Update (`PUT /templates/{id}`)

**Whitelist**:

✅ **Updateable**:
- `title`
- `body`
- `subject` (via meta)
- `email_pre_header` (via meta)
- `design_template` (via meta)
- `template_config` (via meta)

❌ **Not updateable**:
- `id`, `post_author`, `post_date`

### Automation Sequence Update (`POST /funnels/{id}/sequences`)

**Updateable**:
- Complete sequence tree (including all email actions)
- Email subject, body, pre-header
- Design template per action
- Conditional branching logic

**Constraint**: Must send complete sequence array (not partial updates)

---

## 4. What Works Today — Capabilities Inventory

### ✅ Email Composition Capabilities

| Capability | Campaign | Template | Automation | Direct Email |
|------------|----------|----------|-----------|--------------|
| **HTML body** | ✅ | ✅ | ✅ | ✅ |
| **Subject line** | ✅ | ✅ | ✅ | ✅ |
| **Preview text** | ✅ | ✅ | ✅ | ✅ |
| **Visual builder design** | ✅ | ✅ | ✅ | ❌ |
| **Gutenberg blocks** | ✅ | ✅ | ✅ | ❌ |
| **Conditional content** | ✅ | ✅ | ✅ | ❌ |
| **Template inheritance** | ✅ | ✅ | ✅ | ❌ |
| **Variable substitution** | ✅ | ✅ | ✅ | ✅ |
| **Footer branding** | ✅ | ✅ | ✅ | ✅ |
| **Test email send** | ✅ | ❌ | ❌ | ✅ |
| **Email preview HTML** | ✅ | ❌ | ❌ | ❌ |

### ✅ MCP Tool Availability

From TOOLS_REFERENCE.md (48 total tools):

**Email Composition Tools** (4):
- `fluentcrm_create_campaign` — Create broadcast with email body
- `fluentcrm_create_email_template` — Create reusable template
- `fluentcrm_create_automation` — Create sequence automation
- `fluentcrm_save_email_action` — Update email step in automation

**Email Template Tools** (2):
- `fluentcrm_list_email_templates`
- `fluentcrm_get_email_template` (if exists)

**Campaign Management Tools** (5):
- `fluentcrm_list_campaigns`
- `fluentcrm_get_campaign` (if exists)
- `fluentcrm_pause_campaign`
- `fluentcrm_resume_campaign`
- `fluentcrm_delete_campaign`

**Automation Tools** (4):
- `fluentcrm_list_automations`
- `fluentcrm_get_automation`
- `fluentcrm_update_automation`
- `fluentcrm_delete_automation`

---

## 5. API Gaps — What's Missing

### ❌ Gap 1: Visual Builder Editor Access

**Problem**: Visual builder designs are complex nested JSON structures. No REST API endpoint exposes a **visual builder editor interface** or **design builder API**.

**Current State**:
- Designs stored as serialized objects in post_meta
- Must be manually constructed as JSON
- No visual editor available via REST API

**Impact**: Automation implementers must:
- Understand the `CampaignDesign` JSON schema
- Manually construct section/block arrays
- Handle conditionals programmatically

**Recommendation**: Expose design builder via separate REST endpoints:
```
POST /campaigns/{id}/design/editor      → Visual builder state
POST /campaigns/{id}/design/validate    → Validate design JSON
GET  /campaigns/{id}/design/schema      → Design schema documentation
```

---

### ❌ Gap 2: Template Preview Rendering

**Problem**: No REST API endpoint renders email templates with subscriber data.

**Current State**:
- `GET /campaigns/{id}/emails/{email_id}/preview` requires email to already exist
- `POST /campaigns/{id}/email-preview-html` requires campaign to exist
- No standalone **"render this template for a sample subscriber"** endpoint

**Impact**: Cannot preview template rendering without creating campaign.

**Recommendation**: Add preview endpoint:
```
POST /templates/{id}/preview
Body: { "subscriber_id": 123 }
Response: { "html": "<rendered HTML>" }
```

---

### ❌ Gap 3: Bulk Email Composition

**Problem**: No API for composing bulk emails with per-subscriber customization.

**Current State**:
- Campaigns send same email to all recipients
- Can't create per-recipient variations programmatically

**Impact**: Multi-variant campaigns require creating multiple campaigns.

**Recommendation**: Add bulk composition endpoint:
```
POST /campaigns/{id}/compose-bulk
Body: {
  "recipients": [
    { "subscriber_id": 1, "customizations": { "first_name": "Alice" } },
    { "subscriber_id": 2, "customizations": { "first_name": "Bob" } }
  ]
}
```

---

### ❌ Gap 4: Design Template Clone/Import

**Problem**: Visual builder designs can't be cloned or imported programmatically.

**Current State**:
- Campaign/template duplication copies design as serialized object
- No API to export/import designs between campaigns

**Impact**: Can't share designs across automations.

**Recommendation**: Add design endpoints:
```
POST /campaigns/{id}/design/export    → Export design JSON
POST /campaigns/{id}/design/import    → Import design JSON
POST /campaigns/{id}/design/clone     → Clone from another campaign
```

---

### ❌ Gap 5: Inline Template Variables Documentation

**Problem**: No REST API endpoint documents available template variables ({{subscriber.X}}, {{contact.X}}).

**Current State**:
- Variables documented in UI help text only
- No programmatic access to variable schema

**Impact**: API clients must hard-code variable knowledge.

**Recommendation**: Add schema endpoint:
```
GET /templates/variables/schema
Response: {
  "subscriber": {
    "first_name": { type: "string" },
    "email": { type: "email" },
    ...
  },
  "contact": { ... }
}
```

---

## 6. Architecture Pattern for Custom Endpoints

Based on FluentCRM's existing patterns, custom email composition endpoints should:

### 6.1 Route Organization (Following Existing Pattern)

```php
// In custom plugin Routes/api.php
$router->prefix('custom-email')->withPolicy('CustomEmailPolicy')->group(function ($router) {
    $router->post('/compose', 'CustomEmailController@compose');           // Bulk composition
    $router->post('/preview-template', 'CustomEmailController@preview');  // Template preview
    $router->post('/design/schema', 'CustomEmailController@schema');      // Design schema
    $router->post('/design/import', 'CustomEmailController@importDesign');
    $router->post('/design/export', 'CustomEmailController@exportDesign');
});
```

### 6.2 Policy Class Pattern

```php
// Follows existing FluentCRM Authorization pattern
class CustomEmailPolicy extends BasePolicy {
    public function compose($user) {
        return $this->hasPermission($user, 'manage_fluent_crm');
    }
    
    public function preview($user) {
        return $this->hasPermission($user, 'manage_fluent_crm');
    }
}
```

### 6.3 Controller Pattern

```php
class CustomEmailController extends Controller {
    public function compose(Request $request) {
        // Validate input using existing CampaignController patterns
        // Return rendered emails using BlockParser service
    }
    
    public function preview(Request $request) {
        // Load template
        // Fetch subscriber/mock data
        // Render via BlockParser
        // Return HTML
    }
}
```

### 6.4 Service Layer Pattern

```php
// Reuse existing services
use FluentCrm\App\Services\BlockParser;
use FluentCrm\App\Models\Campaign;

class CustomEmailService {
    protected $blockParser;
    
    public function __construct(BlockParser $blockParser) {
        $this->blockParser = $blockParser;
    }
    
    public function renderDesign($design, $subscriber) {
        return $this->blockParser->parse($design, $subscriber);
    }
}
```

---

## 7. Custom Endpoints — Detailed Specifications

### Custom Endpoint 1: Template Preview with Subscriber Mock

```
POST /wp-json/custom-email/v1/preview-template
Authorization: Basic {credentials}

Request Body:
{
  "template_id": 5,
  "subscriber_id": 123,           // Optional: use actual subscriber
  "mock_data": {                  // Optional: use mock data instead
    "first_name": "John",
    "email": "john@example.com"
  }
}

Response:
{
  "success": true,
  "html": "<html rendered email>",
  "subject": "Rendered subject",
  "variables_used": ["first_name", "email"]
}
```

**Implementation**:
1. Load template (or campaign)
2. Fetch subscriber data OR use mock_data
3. Pass to BlockParser
4. Return rendered HTML

---

### Custom Endpoint 2: Bulk Email Composition

```
POST /wp-json/custom-email/v1/compose-bulk
Authorization: Basic {credentials}

Request Body:
{
  "template_id": 5,
  "recipients": [
    {
      "subscriber_id": 1,
      "customizations": {
        "first_name": "Alice",
        "discount_code": "ALICE20"
      }
    },
    {
      "subscriber_id": 2,
      "customizations": {
        "first_name": "Bob",
        "discount_code": "BOB20"
      }
    }
  ]
}

Response:
{
  "success": true,
  "results": [
    {
      "subscriber_id": 1,
      "subject": "Rendered for Alice",
      "html": "<html for Alice>",
      "rendered_variables": { "first_name": "Alice", ... }
    },
    {
      "subscriber_id": 2,
      "subject": "Rendered for Bob",
      "html": "<html for Bob>",
      "rendered_variables": { "first_name": "Bob", ... }
    }
  ]
}
```

**Implementation**:
1. Load template
2. For each recipient:
   - Merge template variables with customizations
   - Fetch subscriber data
   - Pass merged data to BlockParser
   - Store rendered HTML

---

### Custom Endpoint 3: Design Schema Documentation

```
GET /wp-json/custom-email/v1/design-schema

Response:
{
  "design_structure": {
    "type": "object",
    "properties": {
      "sections": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "type": { "enum": ["header", "body", "footer"] },
            "blocks": {
              "type": "array",
              "items": { /* block schema */ }
            }
          }
        }
      }
    }
  },
  "available_variables": {
    "subscriber": {
      "first_name": { "type": "string", "description": "First name" },
      "email": { "type": "string", "description": "Email address" },
      "status": { "enum": ["subscribed", "unsubscribed"], ... }
    },
    "contact": { ... }
  },
  "block_types": [
    {
      "name": "paragraph",
      "properties": {
        "text": { "type": "string" },
        "alignment": { "enum": ["left", "center", "right"] }
      }
    },
    {
      "name": "conditional",
      "properties": {
        "condition": { "type": "string", "description": "JS expression" },
        "blocks": { "type": "array" }
      }
    }
  ]
}
```

---

### Custom Endpoint 4: Design Import/Export

```
POST /wp-json/custom-email/v1/design/export

Request:
{ "campaign_id": 5 }

Response:
{
  "design": {
    "type": "visual_builder",
    "sections": [ ... ],
    "version": "1.0"
  },
  "metadata": {
    "title": "Campaign Name",
    "created_at": "2026-03-27T10:00:00Z"
  }
}

---

POST /wp-json/custom-email/v1/design/import

Request:
{
  "campaign_id": 10,
  "design": {
    "type": "visual_builder",
    "sections": [ ... ]
  },
  "overwrite": false
}

Response:
{
  "success": true,
  "campaign_id": 10,
  "design_validation": {
    "valid": true,
    "warnings": []
  }
}
```

---

## 8. Summary & Recommendations

### What Works
✅ Full email composition via REST API (campaigns, templates, automations)  
✅ Visual builder support with conditionals  
✅ Template inheritance and reuse  
✅ Variable substitution and rendering  

### What's Missing
❌ Visual builder editor API (must construct JSON manually)  
❌ Template preview without campaign  
❌ Bulk composition with per-recipient customization  
❌ Design import/export programmatically  
❌ Variable schema documentation  

### Priority Custom Endpoints
1. **Template Preview** (high impact, low effort)
2. **Bulk Composition** (medium impact, medium effort)
3. **Design Schema** (low effort, helps API clients)
4. **Design Import/Export** (medium effort, enables advanced workflows)

### Implementation Strategy
- Use existing FluentCRM patterns (Routes, Policies, Controllers, Services)
- Reuse BlockParser service for rendering
- Follow HTTP API conventions from existing endpoints
- Test against real subscriber data and mock data
- Document variable schema for API consumers

---

**End of Audit**
